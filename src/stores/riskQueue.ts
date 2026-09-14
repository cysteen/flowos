import { computed, ref, watch } from 'vue';
import { defineStore } from 'pinia';
import { useRiskTagStore, type RiskTagEntry } from '@/stores/riskTags';
import { useRiskHistoryStore } from '@/stores/riskHistory';
import { useDerivedTicketStore } from '@/stores/derivedTickets';
import { TICKETS } from '@/mock/tickets';
import { isTicketClosed } from '@/views/tickets/types/ticket';
import type { Ticket, TicketStatus } from '@/views/tickets/types/ticket';
import {
  NO_RISK,
  agoStamp,
  isOpenStatus,
  isPoolLevel,
  isPooledStatus,
  isQueueSource,
  newestStampOf,
  normalizeMonitorSource,
  readDailyRiskCache,
  todayPrefix,
  todayStamp,
  writeRiskCache,
  type QueueSource,
  type QueueStatus,
  type ReportAssessment,
  type ReportVerify,
  type RiskCoordination,
  type RiskReleaseRecord,
  type RiskTagRecord,
  type RiskTagResult,
} from '@/stores/riskShared';

/**
 * **A 线 · 自动识别队列**（《【930】风险报备 · 监控 · 管控 PRD》§5，业务第三轮拍板）。
 *
 * 【这条线现在长什么样】三类自动识别 → **实时监控** → **风险打标** → 风险工单池：
 *
 * ```
 * 预警词命中 / 投诉单 / 重要紧急  ── 三类自动进 →【实时监控】
 *                                            │
 *                                      风险打标
 *                                            │
 *                      低 / 中 / 高 ─→ 出实时监控，进【风险工单池】
 *                      无风险       ─→ 出实时监控，进「已标记无风险」，**不进池**
 * ```
 *
 * 🔴 **打标是入池门槛**（本轮的核心变化）。旧口径下条目一被捞进来就直接落「待分派」躺在池子里，
 * 打标只是池内的一种处理方式；于是**风险工单池里装的是"系统怀疑有风险的"而不是"确实有风险的"**，
 * 池子的条数就答不了"当前有多少风险单"这个问题 —— 它答的是"规则今天捞了多少条"。
 * 改成漏斗之后池内条数才是风险单数，而"捞了多少"由实时监控自己那个数回答，两个数各归各位。
 *
 * 【全程没有"报备人"这个角色】条目是系统捞进来的，不是谁报上来的。故 `reason` / `by` /
 * `byRole` / `category` / `attachments` 五个字段是**合并池渲染用的恒定占位**，由 `autoEntry()`
 * 统一补齐，种子里一个字都不写。它们的类型被收窄成字面量常量，类型本身即声明了
 * "这里只可能是这一个值"，省得读代码的人去找"A 线的报备原因是怎么填的"。
 *
 * 【与 B 线的分界】B 线（`stores/riskReports.ts`）是二线专员在非投诉单上发起的风险报备，
 * 走自己的报备池、**不回流本线**，也不走打标这道门。
 */

/**
 * A 线条目。字段分四组读：
 *   ① 身份与入池：`id` / `ticketNo` / `source` / `desc` / `at`
 *   ② 走到哪一步：`status`
 *   ③ 打标：`tag`（现行结论；历史在 `stores/riskTags.ts`）
 *   ④ 进池之后：`assignee` / `assessment`
 * 其余五个是**合并池渲染用的恒定占位**，见上方说明。
 */
export interface RiskQueueEntry {
  id: string;
  ticketNo: string;
  /** 自动识别来源三类（实时监控 / 投诉单 / 重要紧急），见 `QUEUE_SOURCES`。手动筛查并入的也写「实时监控」 */
  source: QueueSource;
  /**
   * 本条由**手动筛查并入**监控（《【930】》§5A.1 ④）。只留痕：打标时抄到打标记录上
   * （`RiskTagRecord.viaManualScan`），不改来源、不参与归属与计数。
   */
  viaManualScan?: boolean;
  /** 分派给谁（客诉专员姓名）。空 ＝ 待分派。**进池之后才谈得上它** */
  assignee?: string;
  desc: string;
  /**
   * 进入实时监控的时刻。
   *
   * ⚠️ **等待时长仍从这里起算，不从打标时刻**（N5）：若一条命中在实时监控里躺了两小时
   * 才被打标，它一进池就是超时态。这是 N5 的直接推论而不是缺陷 —— 打标慢也是这条链在拖，
   * 钟不该因为换了个环节就重置。
   */
  at: string;
  status: QueueStatus;
  /**
   * **现行**打标结论。**空 ＝ 还在实时监控待打标**，这就是三视图与池子取数的判据本身。
   * 二次修改覆盖本字段、并向 `stores/riskTags.ts` 追加一条历史，见 `recordTag`。
   */
  tag?: RiskTagRecord;
  /**
   * 进池之后的评估结论（升级 / 不升级）。动作在合并层 `stores/riskPool.ts`，两条线共用。
   * **只有非投诉单走这一格**：投诉单走下面的 `coordination`（基线 ※29 按原单类型分岔）。
   */
  assessment?: ReportAssessment;
  /**
   * 进池之后的**协同处理**结论（评估意见 + 建议事项），**只有投诉单走这一格**。
   * 动作在合并层 `stores/riskPool.ts` 的 `coordinate`；历次协同的全量在 `stores/riskCollab.ts`，
   * 这里只留最近一次，见 `RiskCoordination` 的说明。
   */
  coordination?: RiskCoordination;
  /**
   * ⚠️ **旧字段 · 由 `tag` 派生的只读投影**，写入方只有 `recordTag`，**不要拿它当判据**。
   *
   * 【为什么还留着】过渡期的页面（RiskMonitorView）仍按 `verify.verdict === '成立'` 决定
   * 池内这一行下一步出「核实」还是「评估」按钮，评估弹窗第一区块也读它来交代
   * "监控为什么判它有风险"。本轮不动 .vue，摘掉这个投影会让池内每一行都退回「核实」按钮。
   * 下一批页面改成读 `tag` 之后，本字段连同 `ReportVerify` 一起删。
   *
   * 打标为**无风险**时本字段被清掉：它只在进池的条目上有意义，而无风险的根本不进池。
   */
  verify?: ReportVerify;
  /**
   * 历次**释放**记录（《【930】》§5.5 ⑥，v3.5 新立）。**累积不覆盖**。
   *
   * 【为什么 A 线也有这一格】释放是**两个池同一套口径**（§5B.4「逐条同 §5.5」），
   * 动作落在合并层 `stores/riskPool.ts` 的 `release`，它按 id 跨两条线取条目 ——
   * 只在 B 线声明这一格，A 线的条目就会在运行时长出一个类型上不存在的字段。
   *
   * ⚠️ **A 线的界面入口本轮没接**：风险监控页队列的行内「释放」按钮（§5.4 元素 ⑩a）
   * 还没有落地，故这一格在 A 线上暂时只会由别处调 `release` 时写入。
   */
  releases?: RiskReleaseRecord[];

  /* ---- 以下五个字段是合并池渲染用的恒定占位，A 线没有人来填 ---- */
  /** 恒为「其他」：池表「报备原因」列要有值 */
  reason: '其他';
  /** 恒为 null：池表「风险类型」列显示「—」 */
  category: null;
  /** 恒为空数组 */
  attachments: string[];
  /** 恒为「系统」：通知侧据此解析出"无人可通知"并跳过这一类收件人（O23） */
  by: '系统';
  byRole: '系统';
}

/** 系统自动入队的条目：把五个恒定占位一次补齐，种子里不再逐条重复 */
function autoEntry(
  e: Omit<RiskQueueEntry, 'reason' | 'category' | 'attachments' | 'by' | 'byRole'>,
): RiskQueueEntry {
  return { ...e, reason: '其他', category: null, attachments: [], by: '系统', byRole: '系统' };
}

/**
 * 种子里的**三个打标人**。已打标的条目必须有一个具名落款：
 * 「谁判的、什么分量」是打标这件事的一半，落款写「系统」等于说没有人为此负责。
 *
 * 🔴 **必须是三个人而不是一个**：页面上「已标记 · 按标记人」是独立的一维
 * （老系统里那张「监控人员 · 数量」表），督导照它看"谁名下压着多少条"。
 * 全部条目共用一个落款时那一维只有一行，它既排不出序、也答不了那个问题——
 * 一维只有一个取值，等于这一维不存在。故种子按 **6 / 4 / 2** 分给三个人：
 * 明显的降序才看得出排序这件事本身，3 / 3 / 3 那种平均分布看上去和没排一样。
 *
 * 【为什么是这三个人】两条约束交叉出来的：
 *   ① **必须有风险打标权限**。基线《00-基线-工单状态与动作》§3.1 原话
 *      「**风险词打标 ＝ 客诉专员 + 投诉督导**（0830 改）」，并明确「**工单运营不给** ——
 *      它连风险词命中页都看不到」。代码侧的白名单 `config/roles.RISK_TAG_ROLES` 与之一致
 *      （客诉专员 / 投诉督导 / 三类管理员）。故打标人只能从这两个角色里取。
 *   ② **必须是演示账号里已有的人**，不新造人名：`mock/users.ts` 里
 *      客诉专员 ＝ 吴投诉、投诉督导 ＝ 秦督导。郑监控是命中表（`mock/opsReport.ts`）里
 *      h2 / h5 的核实人，本线沿用他，两处是同一个人。
 *
 * 【谁标哪一类】按基线 §3.1「打标的入口与可见性」分：
 *   · **投诉单** —— 客诉专员在工单处理页自行打标 → 吴投诉；
 *   · **非投诉单** —— 处理人不能打标，一律由**审核人员在监控后台打** → 两位投诉督导。
 *     （🔴 这里原来还写着"靠命中规则"：系统里没有自动打标，见 `recordTag` 里那段说明。）
 * 例外只有一处：`rr-010` 是**手动筛查并入**的投诉单（来源仍写「实时监控」，并入痕迹记在
 * `viaManualScan`），它走的是监控后台那条路而不是工单处理页，故落款是督导（与命中表里 h5 的核实人一致）。
 */
const SEED_TAGGERS = {
  /** 郑监控 · 投诉督导 —— 监控后台的主力审核人，非投诉单那一路大多是他判的 */
  zheng: { by: '郑监控', byRole: '投诉督导' },
  /** 秦督导 · 投诉督导 —— `mock/users.ts` 里投诉督导角色的演示账号本人 */
  qin: { by: '秦督导', byRole: '投诉督导' },
  /** 吴投诉 · 客诉专员 —— 投诉单那一路，在工单处理页自行打标 */
  wu: { by: '吴投诉', byRole: '客诉专员' },
} as const;

/**
 * 预置数据。三条视图各有样本（待打标 / 已入池 / 已标记无风险），且三类自动识别来源各有条目。
 *
 * ⚠️ 工单号一律取 `mock/tickets.ts` 里**真实存在**的单，且类型对得上 ——
 * 编一个号出来，队列上点单号落在空白页，这条样本要证明的东西当场被证伪。
 *
 * 🔴 **这批种子同时是页面上七个维度的分档语料**，不是"几条示意"。风险监控页把同一批条目
 * 按七个互不相同的维度切开看，每一维都得有分布才看得出东西；改这批数据前先对着这张表看一眼，
 * 免得动一条把某一档清成 0（**一个恒为 0 的档位会被读成筛选坏了，而不是"今天没有"**）：
 *
 * | 维度 | 谁在数 | 本批的分布 |
 * |---|---|---|
 * | 待标记 · 实时监控 | 命中记录的**词表预设等级** | 高 2 / 中 3 / 低 2（语料在 `mock/opsReport.ts`） |
 * | 待标记 · 投诉单 / 重要紧急 | 工单**优先级** | 由工单库直接决定，本文件只负责不把它们清空 |
 * | 已标记 · 等级 | `tag.result` | 高 5 / 中 4 / 低 5 |
 * | 已标记 · 按标记人 | `tag.by` | 郑监控 6 / 吴投诉 5 / 秦督导 3（见 `SEED_TAGGERS`） |
 * | 已标记 · 无风险 | 「已标记无风险」态 | 4 条 |
 * | 待处置 · 三态 | `status` | 待领取 5 / 已领取 3 / **已结论 6** |
 * | 今日决策 | `assessment.decision` / `coordination` | 升级 1 / 不升级 2 / 协同 1 |
 *
 * 🔴 **最后两行是一对"看着该相等、其实不同源"的数，别去把它们对平**：
 * 「已结论 6」是**池内累计**（不按日期切），「今日决策」三枚之和 4 是**当日流量**
 * （页头「今日已结论」与它们共用一个判据，恒等）。差的两条是 `rq-s20` / `rq-s21` ——
 * 昨天就收了口的条目，见它们那一段的说明。这两个数**在这批种子里被刻意错开**：
 * 相等过一次，就会有人照着"它俩本来就该相等"去改其中一处。
 *
 * 🔴 另有一处同样刻意错开的：页头「命中记录」（当日**命中**条数，`mock/opsReport.ts` 的分母）
 * 与「今日打标」（当日**条目**结论数，本文件的分母）。两格并排、分母不同，
 * 在本批之前双双等于 16 —— 补完 h33…h36 之后前者是 20，两个分母各说各的。
 * | 各处理组 | 工单号反查 `resolveTicketGroupNames()[0]` | 五个班组**各自的待判与已判都不为 0** |
 *
 * 【最后一行尤其容易破】「各处理组」那一行的"待判"数的是**还在实时监控里的条目**，
 * "已判"数的是**已入池 + 已标记无风险**的条目 —— 两个数各自按工单反查出来的班组分组。
 * 某个组只有已判没有待判时，那一行读起来像"这个组已经清干净了"，而真相可能只是
 * 这个组一条待打标的种子都没有。故五个班组是**成对**铺的，一组一对，别只加一头。
 */
/**
 * 这批种子的时刻**生成于哪一天**。模块加载时定一次，随缓存一并落盘（见 `seedDay`）。
 * 隔夜之后缓存里躺的就是昨天这个值，读回来当场判作废、回到种子重建。
 */
const SEED_DAY = todayPrefix();

/**
 * 【时刻字段用哪一个生成器】本批种子里两种都在用，**分工是硬的**：
 *   · **进队时刻 `at`** —— 默认 `todayStamp`（保证落在今天，页头「今日新增」才有数），
 *     **唯独三条「评估中」用 `agoStamp`**：它们是「超时未评 3」的全部来源，
 *     超时按真实分钟算，压进今天就不超时了（逐条注释在那三条上）。
 *   · **打标 / 核实 / 评估 / 协同时刻** —— 一律 `todayStamp`：这四个字段喂的全是
 *     按自然日切的口径（今日打标、今日已结论、三枚决策 chip、「已结论·仅今日」），
 *     落到昨天就是整排归零。
 * 白天（今天已过 6 小时之后）两者完全等价，差别只在凌晨那几个小时，见 `todayStamp`。
 */
const SEED: RiskQueueEntry[] = [
  /* ==================================================================
   * 视图一：待打标（实时监控中）—— 10 条
   *
   * 这一段同时供两处取数：左栏「待标记」的三个切片，与页头「各处理组」那一行的**待判**。
   * 故它既要按来源铺开（三类来源各有条目），也要按班组铺开（五个班组各有条目）。
   * ================================================================== */

  /*
   * 「预警词命中 · 待打标」样本。**必须有**：它是漏斗的入口本身，
   * 少了它，"自动识别进来先等打标、打完才进池"这条链在页面上一次都跑不出来。
   *
   * ⚠️ 工单号有两条硬约束，缺一条这一行就点不出东西：
   *   ① 必须真实存在于 `mock/tickets.ts`，否则队列上点单号落在空白页；
   *   ② 它在命中表（`mock/opsReport.ts`）里的那条命中**必须还没核实**——本行要打的就是标；
   *      命中若已打过标，打标弹窗只会弹一句"已全部核实"，这条路演不出来。
   * 取 h1『无线音乐播放跳过歌曲异常』：投诉单、真实存在、命中未核实、预设等级**高**。
   */
  autoEntry({
    id: 'rr-000',
    ticketNo: 'IFLYTS-20260610-00002',
    source: '实时监控',
    desc: '沟通记录命中风险词，已自动纳入实时监控，待打标。',
    at: todayStamp(65),
    status: '实时监控中',
  }),
  /*
   * 预警词命中那一路的另外五条（h24 … h29，语料见 `mock/opsReport.ts`）。
   *
   * 【为什么必须成批补】「待标记 · 实时监控」按**词表预设的识别风险等级**分高 / 中 / 低三档，
   * 而在本批之前那一路**总共只有 rr-000 一条**：三个子档里两个恒为 0，分档这件事
   * 在页面上一次都没发生过。六条按 高 2 / 中 3 / 低 2 铺（含 rr-000），三档同时有值。
   *
   * 🔴 **这几条必须有条目、不能只留命中记录**。只有命中而没有条目时，那张单照样会
   * 出现在「待标记」里（它由工单库那一半兜住），**但页头「各处理组」的"待判"数不到它**——
   * 那一行数的是条目。少了条目，班组那一维会出现"某组已判 3、待判 0"的假象。
   */
  autoEntry({
    id: 'rq-s01',
    ticketNo: 'IFLYTS-20260610-00010',
    source: '实时监控',
    desc: '沟通记录命中风险词「曝光」，已自动纳入实时监控，待打标。',
    at: todayStamp(88),
    status: '实时监控中',
  }),
  /*
   * 🔴 **这两条挂的是「一单多命中」的单**（语料见 `mock/opsReport.ts` 那一段）：
   *   · `IFLYZX-20260715-00003` 被三条不同等级的词先后命中（差评 低 → 投诉到底 中 →
   *     12315 高），识别等级取最重那条 ＝ **高**；
   *   · `IFLYZX-20260710-00002` 被两条命中（退一赔三 中 → 差评 低），最重的那条**不是最新的**，
   *     识别等级仍是 **中**。
   * `desc` 因此写"命中 N 条风险词"而不点某一个词 —— 点了名字就等于替人选了一条，
   * 而这两条要证明的恰恰是"得连着几条一起读"。
   */
  autoEntry({
    id: 'rq-s02',
    ticketNo: 'IFLYZX-20260715-00003',
    source: '实时监控',
    desc: '沟通与催补记录先后命中 3 条风险词，措辞逐级升级，已自动纳入实时监控，待打标。',
    at: todayStamp(52),
    status: '实时监控中',
  }),
  autoEntry({
    id: 'rq-s03',
    ticketNo: 'IFLYZX-20260710-00002',
    source: '实时监控',
    desc: '沟通记录先后命中 2 条风险词，已自动纳入实时监控，待打标。',
    at: todayStamp(145),
    status: '实时监控中',
  }),
  autoEntry({
    id: 'rq-s04',
    ticketNo: 'IFLYZX-20260802-00003',
    source: '实时监控',
    desc: '催补记录命中风险词「投诉到底」，已自动纳入实时监控，待打标。',
    at: todayStamp(175),
    status: '实时监控中',
  }),
  autoEntry({
    id: 'rq-s05',
    ticketNo: 'IFLYZX-20260609-00006',
    source: '实时监控',
    desc: '沟通记录命中风险词「差评」，已自动纳入实时监控，待打标。',
    at: todayStamp(30),
    status: '实时监控中',
  }),
  autoEntry({
    id: 'rq-s06',
    ticketNo: 'IFLYZX-20260804-00003',
    source: '实时监控',
    desc: '沟通记录命中风险词「差评」，已自动纳入实时监控，待打标。',
    at: todayStamp(12),
    status: '实时监控中',
  }),
  /*
   * 「投诉单 · 待打标」样本。**必须有这一条**：旧口径下投诉单是**直接进池**的，
   * 新口径把它也拦在打标这道门前。少了它，"三类来源都要打标"这句话在页面上
   * 只有预警词那一路作证，看着仍像"只有关键词那一路要打标"的老样子。
   *
   * 挂 t5『收到商品与描述不符，申请退货』：投诉单、真实存在、P2、SLA 充足 ——
   * 它恰恰是"投诉单不等于有风险"的现成例子，与下面 rr-005 判无风险那一条互为对照。
   */
  autoEntry({
    id: 'rr-004',
    ticketNo: 'IFLYTS-20260610-00007',
    source: '投诉单',
    desc: '投诉类工单自动纳入实时监控，待打标。',
    at: todayStamp(20),
    status: '实时监控中',
  }),
  /*
   * 硬件缺陷组与技术支持组的待判样本。挑这两张单是因为它们各自就是本路来源的判据本身：
   *   · t29『屏幕花屏需返厂检测』——投诉单、P0、未认领，进的是「投诉单」那一路；
   *   · ops-3『开放平台配额申请无人跟进』——非投诉、P1、已超解决时限 79 小时，
   *     进的是「重要紧急」那一路。
   * 没有这两条的话，这两个组在页头「各处理组」那一行只有已判、待判恒为 0。
   */
  autoEntry({
    id: 'rq-s07',
    ticketNo: 'IFLYTS-20260610-00014',
    source: '投诉单',
    desc: '投诉类工单自动纳入实时监控，待打标。',
    at: todayStamp(100),
    status: '实时监控中',
  }),
  autoEntry({
    id: 'rq-s08',
    ticketNo: 'IFLYZX-20260731-00002',
    source: '重要紧急',
    desc: 'P1 工单且已超解决时限 79 小时，客户为大客户集成方，已自动纳入实时监控，待打标。',
    at: todayStamp(45),
    status: '实时监控中',
  }),

  /* ==================================================================
   * 视图二：已入池（打标为低 / 中 / 高）—— 14 条
   *
   * 三态各有样本（待分派 5 / 评估中 3 / 已评估 6），等级三档各有样本（高 5 / 中 4 / 低 5），
   * 打标人三个（郑监控 6 / 吴投诉 5 / 秦督导 3），已评估那六条把**三种收口方式**
   * （升级 / 不升级 / 协同处理）全部铺到，故页头「今日决策」三枚一枚都不为 0。
   *
   * 🔴 已评估这六条**分两批**：四条今天收口（喂「今日已结论」与三枚决策 chip），
   * 两条昨天收口（`rq-s20` / `rq-s21`，只喂「按处置阶段 · 已结论」这个累计口径）。
   * 分批的理由见本段末尾那两条自己的说明。
   * ================================================================== */

  /* ---- 待分派（待领取）5 条 ---- */
  /*
   * 「预警词命中 · 打标高危 → 待分派」样本。**必须有这一条**：它是漏斗的那半条链。
   * rr-000 演示的是前半段（命中 → 待打标），本条演示打标为高之后**出实时监控、进池**，
   * 与另两类来源在池子里同构。少了它，"打标进池"只能靠现场打一次标才看得到，
   * 而打标要挑对命中、挑错就落到"已全部核实"的兜底提示上——评审时这条链多半跑不出来。
   *
   * ⚠️ 工单号的两条硬约束与 rr-000 同源，但②那一条**恰好相反**：
   *   ① `IFLYTS-20260731-00001` 是 `ops-1`（投诉、P0、VIP、已超解决时限 96 小时），真实存在；
   *   ② 它在命中表里的那条命中 `h5`（风险词「起诉」、催补记录）**已经核实过**：
   *      `tagged: '高'`，核实人郑监控（投诉督导）。rr-000 要的是未核实的命中，
   *      故这张单是那边的反例、却正是这边要的——本条的 `tag` 即照抄 h5 的那份等级判断。
   * 时刻：进监控 110 分钟前、打标 95 分钟前，打标必在进监控之后。
   * 110 分钟未过 120 分钟时限，故它在队却不标红——刚进池就满屏红会盖掉真正超时的那几条。
   */
  autoEntry({
    id: 'rr-010',
    ticketNo: 'IFLYTS-20260731-00001',
    source: '实时监控',
    viaManualScan: true,
    desc: '沟通记录命中风险词，已纳入实时监控。',
    at: todayStamp(110),
    status: '待分派',
    tag: {
      result: '高',
      note: '同一客户第二次命中高危词，已上报法务',
      ...SEED_TAGGERS.zheng,
      at: todayStamp(95),
      viaManualScan: true,
    },
    verify: {
      verdict: '成立',
      level: '高',
      note: '同一客户第二次命中高危词，已上报法务',
      ...SEED_TAGGERS.zheng,
      at: todayStamp(95),
    },
  }),
  /*
   * 「重要紧急 · 打标高危 → 待分派」样本。**必须有这一条**：三类来源里只有它一条样本都没有，
   * 于是来源 chip 行那一枚恒为 0、按「监控来源」列筛选与排序时它永远是空的。
   *
   * 挑这张单是因为它自己就是「重要紧急」的判据本身：P0 + 已超解决时限 41 小时 +
   * 影响校端批量业务，不需要另讲一个故事来解释它为什么会被自动捞进来。
   * 35 分钟前进的监控：未超时，与下面几条超时态形成对照，两态在同一张表上同时可见。
   */
  autoEntry({
    id: 'rr-008',
    ticketNo: 'IFLYZX-20260802-00002',
    source: '重要紧急',
    desc: 'P0 工单且已超解决时限，影响客户批量业务，已自动纳入实时监控。',
    at: todayStamp(35),
    status: '待分派',
    tag: {
      result: '高',
      note: 'P0 且已超解决时限 41 小时，影响校端成绩同步批量业务，判高危。',
      ...SEED_TAGGERS.zheng,
      at: todayStamp(30),
    },
    verify: {
      verdict: '成立',
      level: '高',
      note: 'P0 且已超解决时限 41 小时，影响校端成绩同步批量业务，判高危。',
      ...SEED_TAGGERS.zheng,
      at: todayStamp(30),
    },
  }),
  /*
   * 「投诉单 · 打标中危 → 待分派」。落款吴投诉（客诉专员）：投诉单由客诉专员在
   * 工单处理页自行打标（基线 §3.1），本条是那条口径在池子里的样子。
   */
  autoEntry({
    id: 'rq-s09',
    ticketNo: 'IFLYTS-20260817-00002',
    source: '投诉单',
    desc: '投诉类工单自动纳入实时监控。客户投诉坐席沟通态度并要求书面答复。',
    at: todayStamp(78),
    status: '待分派',
    tag: {
      result: '中',
      note: '服务态度类投诉，客户要求书面答复但未提及外部渠道，判中危交班组长跟进。',
      ...SEED_TAGGERS.wu,
      at: todayStamp(70),
    },
    verify: {
      verdict: '成立',
      level: '中',
      note: '服务态度类投诉，客户要求书面答复但未提及外部渠道，判中危交班组长跟进。',
      ...SEED_TAGGERS.wu,
      at: todayStamp(70),
    },
  }),
  /*
   * 🔴 **低危的第一条**。业务已拍板「低 / 中 / 高**一律进池**」，可在此之前种子里
   * 一条低危都没有，于是「已标记 · 低危」恒为 0 ——**看上去像"低危不进池"**，
   * 正好是那条拍板的反面。低危样本因此不是凑数，它是那条口径唯一的证据。
   *
   * 挑 t14『扫地机器人充电故障』：非投诉、P1、未认领，走「重要紧急」那一路；
   * 单台硬件故障、有现成换修方案，判低危站得住。
   */
  autoEntry({
    id: 'rq-s10',
    ticketNo: 'IFLYZX-20260610-00012',
    source: '重要紧急',
    desc: 'P1 工单且长时间未认领，已自动纳入实时监控。',
    at: todayStamp(55),
    status: '待分派',
    tag: {
      result: '低',
      note: '单台设备充电故障，有现成换修方案，客户情绪平稳，按常规流程处理即可。',
      ...SEED_TAGGERS.qin,
      at: todayStamp(48),
    },
    verify: {
      verdict: '成立',
      level: '低',
      note: '单台设备充电故障，有现成换修方案，客户情绪平稳，按常规流程处理即可。',
      ...SEED_TAGGERS.qin,
      at: todayStamp(48),
    },
  }),
  autoEntry({
    id: 'rq-s11',
    ticketNo: 'IFLYSJ-20260716-00001',
    source: '重要紧急',
    desc: 'P1 工单且已升级技术支持，已自动纳入实时监控。',
    at: todayStamp(26),
    status: '待分派',
    tag: {
      result: '低',
      note: '单客户集成偶发丢包，已给出重试与签名校验方案，无扩散面，判低危。',
      ...SEED_TAGGERS.zheng,
      at: todayStamp(20),
    },
    verify: {
      verdict: '成立',
      level: '低',
      note: '单客户集成偶发丢包，已给出重试与签名校验方案，无扩散面，判低危。',
      ...SEED_TAGGERS.zheng,
      at: todayStamp(20),
    },
  }),

  /* ---- 评估中（已领取）3 条 ---- */
  /*
   * 「评估中」样本。**必须有**：没有它，「待分派 + 评估中 ≡ B1」这条恒等式右边那一项恒为 0，
   * 分派这个动作做完是什么样子在开屏时看不到（B 线的种子里也没有评估中的）。
   *
   * 挂 `IFLYTS-20260730-00001`（ops-2：投诉、P0、VIP 校长、已超解决时限 88 小时），
   * 真实存在，且与本线其余条目分开挂，避开"同单至多一条在队"。
   * 240 分钟前进的监控：已过 2 小时时限，演示「已分派也会超时」。
   */
  autoEntry({
    id: 'rr-011',
    ticketNo: 'IFLYTS-20260730-00001',
    source: '投诉单',
    desc: '投诉类工单自动纳入实时监控。校级批量激活 320 台全部失败，开学在即。',
    // 🔴 **进队时刻走 `agoStamp` 而不是 `todayStamp`**：本条与下面两条「评估中」是
    // 「超时未评 3」这个数的全部来源，超时判定按**真实分钟数**算（`useRiskClock`）。
    // 压进"今天"之后凌晨打开时它只等了几分钟，那一档当场掉到 0；而超时未评**不按自然日切**，
    // 时刻落在昨天完全正当 —— 一条昨晚进队、今早还没人评的条目，本来就该在这一档里。
    at: agoStamp(240),
    status: '评估中',
    assignee: '吴投诉',
    tag: {
      result: '中',
      note: '批量影响面大但客户尚未提出对外诉求，判中危，先派人评估是否升级。',
      ...SEED_TAGGERS.wu,
      at: todayStamp(225),
    },
    verify: {
      verdict: '成立',
      level: '中',
      note: '批量影响面大但客户尚未提出对外诉求，判中危，先派人评估是否升级。',
      ...SEED_TAGGERS.wu,
      at: todayStamp(225),
    },
  }),
  autoEntry({
    id: 'rq-s12',
    ticketNo: 'IFLYZX-20260713-00001',
    source: '重要紧急',
    desc: 'P1 工单，离线翻译疑似模型缺陷，影响面待确认，已自动纳入实时监控。',
    // 超时未评三条之二，进队时刻同样走 `agoStamp`，理由见 rr-011
    at: agoStamp(205),
    status: '评估中',
    assignee: '吴投诉',
    tag: {
      result: '中',
      note: '疑似模型缺陷、可能波及同批设备，影响面尚未查清，判中危先派人评估。',
      ...SEED_TAGGERS.zheng,
      at: todayStamp(195),
    },
    verify: {
      verdict: '成立',
      level: '中',
      note: '疑似模型缺陷、可能波及同批设备，影响面尚未查清，判中危先派人评估。',
      ...SEED_TAGGERS.zheng,
      at: todayStamp(195),
    },
  }),
  autoEntry({
    id: 'rq-s13',
    ticketNo: 'IFLYTS-20260802-00001',
    source: '投诉单',
    desc: '投诉类工单自动纳入实时监控。主刷电机异响两次上门未解决，配件在途。',
    // 超时未评三条之三，进队时刻同样走 `agoStamp`，理由见 rr-011
    at: agoStamp(165),
    status: '评估中',
    assignee: '吴投诉',
    tag: {
      result: '高',
      note: '两次上门未解决且配件无到货时间，客户已明确表示不再接受等待，判高危。',
      ...SEED_TAGGERS.qin,
      at: todayStamp(155),
    },
    verify: {
      verdict: '成立',
      level: '高',
      note: '两次上门未解决且配件无到货时间，客户已明确表示不再接受等待，判高危。',
      ...SEED_TAGGERS.qin,
      at: todayStamp(155),
    },
  }),

  /* ---- 已评估（已结论）· **今天收的口** 4 条 —— 三种收口方式全部铺到 ---- */
  /*
   * 【收口方式 ①：评估 · 升级】「投诉单上的升级」样本。**必须有这一条**：
   * 它是升级按原单类型分流的另一半（O20）。
   *
   * B 线的 rr-006 原单是**咨询单**（非投诉）：升级后原单落「已升级投诉」并**派生**一张投诉单。
   * 本条原单**本身就是投诉单**：升级走基线 ※27「**工单管控**」——把这张单拿到客诉专员名下，
   * **本单状态不变、不派生新单**，故 `escalatedToNo` 留空、队列「派生投诉单」列显示「—」。
   *
   * 🔴 **不要再给它填 `escalatedToNo`**：O17 原定的"投诉单走 830 第二跳（内投→外投）"已被 O20 推翻。
   * 第二跳只走内投→外投，来源＝热线 / IM / 小程序的投诉单入口本就置灰，客诉专员点不动；
   * 硬派生一张外投单等于在客户根本没有外投时造一张外投单，会把外投量与外投口径系统性抬高。
   */
  autoEntry({
    id: 'rr-009',
    ticketNo: 'IFLYTS-20260711-00001',
    source: '投诉单',
    desc: '投诉类工单自动纳入实时监控。客户维修超期未解决并已向监管平台反映。',
    at: todayStamp(190),
    status: '已评估',
    assignee: '吴投诉',
    tag: {
      result: '高',
      note: '客户已向监管平台正式登记，判高危。',
      ...SEED_TAGGERS.wu,
      at: todayStamp(185),
    },
    verify: {
      verdict: '成立',
      level: '高',
      note: '客户已向监管平台正式登记，判高危。',
      ...SEED_TAGGERS.wu,
      at: todayStamp(185),
    },
    assessment: {
      decision: '升级',
      // 🔴 措辞不写「接手 / 接管」：基线 ※29 把这个词从**评估结论**这条语义上整体作废，
      // 结论只叫「升级 / 不升级」，升级在投诉单上的落地动作叫「工单管控」。
      // （"原单被新单接管"那种接管横幅的语义不在作废之列，见 `mock/tickets.ts` 的 t41。）
      advice: '客户已向监管平台正式登记，须限时答复并留存全过程记录。本单已是投诉单，升级即由我执行「工单管控」，本单状态不变、不另开新单。',
      by: '吴投诉',
      byRole: '客诉专员',
      // 评估时刻落在今日：否则 B3「今日已评估」与 B4 决策分布数不到它
      at: todayStamp(160),
    },
  }),
  /*
   * 【收口方式 ②：评估 · 不升级】**必须有这一条**：在它之前「今日决策」那一排
   * 只有「升级」有数、「不升级」恒为 0，那一排就成了一枚永远亮红的单选。
   * 决策是**二选一**，只有一档有样本时，人读不出"这里可以判不升级"。
   *
   * 挑 t30『API 鉴权失败排查』：非投诉、P1、未认领，判低危之后评估为不升级 ——
   * 低危 → 不升级是这条链上最顺的一路，它同时给「低危也走完了全程」作证。
   */
  autoEntry({
    id: 'rq-s15',
    ticketNo: 'IFLYZX-20260610-00015',
    source: '重要紧急',
    desc: 'P1 工单且长时间未认领，已自动纳入实时监控。',
    at: todayStamp(260),
    status: '已评估',
    assignee: '吴投诉',
    tag: {
      result: '低',
      note: '单客户鉴权配置问题，未影响线上业务，客户情绪平稳，判低危。',
      ...SEED_TAGGERS.zheng,
      at: todayStamp(250),
    },
    verify: {
      verdict: '成立',
      level: '低',
      note: '单客户鉴权配置问题，未影响线上业务，客户情绪平稳，判低危。',
      ...SEED_TAGGERS.zheng,
      at: todayStamp(250),
    },
    assessment: {
      decision: '不升级',
      advice: '属配置类问题，已给出密钥重置与调用示例，客户当场验证通过。无对外诉求，按常规工单流程结案即可，不必转投诉。',
      by: '吴投诉',
      byRole: '客诉专员',
      at: todayStamp(170),
    },
  }),
  autoEntry({
    id: 'rq-s16',
    ticketNo: 'IFLYZX-20260817-00005',
    source: '重要紧急',
    desc: 'P1 工单且已升级产研，离线翻译漏译待排查，已自动纳入实时监控。',
    at: todayStamp(330),
    status: '已评估',
    assignee: '吴投诉',
    tag: {
      result: '中',
      note: '已提飞书项目待产研排期，客户可用在线翻译绕行，判中危。',
      ...SEED_TAGGERS.zheng,
      at: todayStamp(320),
    },
    verify: {
      verdict: '成立',
      level: '中',
      note: '已提飞书项目待产研排期，客户可用在线翻译绕行，判中危。',
      ...SEED_TAGGERS.zheng,
      at: todayStamp(320),
    },
    assessment: {
      decision: '不升级',
      advice: '产研已受理并给出排期，客户接受在线翻译作为过渡方案，暂无对外诉求。留在原处理链上按周同步进展即可，不必转投诉。',
      by: '吴投诉',
      byRole: '客诉专员',
      at: todayStamp(120),
    },
  }),
  /*
   * 【收口方式 ③：协同处理】**投诉单不做风险评估，走协同处理**（基线 ※29）：
   * 一段评估意见 + 多选建议事项，**状态不变、处理人不变**，故它**不产出升级 / 不升级**，
   * 也就天然不进「今日决策」那两枚的任何一档 —— 页头那一排的第三枚数的就是它。
   *
   * 少了这一条，"按原单类型分岔"在池子里只有评估那一半看得见，
   * 而投诉单恰恰是这个池子里最多的一类。
   */
  autoEntry({
    id: 'rq-s14',
    ticketNo: 'IFLYTS-20260817-00001',
    source: '投诉单',
    desc: '投诉类工单自动纳入实时监控。客户在黑猫平台发起投诉，称售后承诺未兑现。',
    at: todayStamp(300),
    status: '已评估',
    assignee: '吴投诉',
    tag: {
      result: '高',
      note: '客户已在第三方投诉平台公开发帖，且原承诺有据可查，判高危。',
      ...SEED_TAGGERS.wu,
      at: todayStamp(290),
    },
    verify: {
      verdict: '成立',
      level: '高',
      note: '客户已在第三方投诉平台公开发帖，且原承诺有据可查，判高危。',
      ...SEED_TAGGERS.wu,
      at: todayStamp(290),
    },
    coordination: {
      opinion: '原承诺的换新时限有工单记录可查，责任在我方。客户已在公开平台发帖，须在平台答复时限内给出书面方案，并同步公关口径。',
      advices: ['转交专员', '每日跟进'],
      by: '吴投诉',
      byRole: '客诉专员',
      at: todayStamp(150),
    },
  }),

  /* ---- 已结论 · **昨天收的口** 2 条 —— 「累计」与「当日」两个口径的分界线 ----
   *
   * 🔴 **这两条存在的唯一理由是让两个数不相等**。页面上有两处都写着「已结论」，
   * 分母**看着一样、口径不一样**：
   *   · 左栏「按处置阶段 · 已结论」数的是**池内累计**（`pooledStageCount`，
   *     状态为「已评估」的条目，不按日期切）；
   *   · 页头「今日已结论」数的是**当日流量**（`alineConcludedTodayCount`，
   *     结论时刻落在今天的那几条）。
   * 在这两条之前，池内已结论的四条**恰好全都是今天收的口**，两个数于是双双等于 4 ——
   * **看上去像同一个数**。一旦有人照着"它俩本来就该相等"去改其中一处，
   * 另一处会在跨天之后自己变，而那时已经没人记得它们本就不是一个口径。
   * 补上两条昨天收口的之后：累计 6、当日 4，差额就是这两条，口径差别当场看得见。
   *
   * 🔴 **时刻一律走 `agoStamp` 且分钟数 > 1440**，不能用 `todayStamp`：
   * 后者按定义把时刻压进"今天已过的这一段"（见 `riskShared.todayStamp`），
   * 拿它生成"昨天"是自相矛盾的。1440 ＝ 一整天，加上去保证任何时点打开都落在今天之前。
   *
   * ⚠️ 这两条的 `at`（进队时刻）同样落在昨天：昨天就收了口的条目不可能今天才进队。
   * 顺带也保证了页头「今日新增」不把它们数进去 —— 那一格问的是今天的入口流量。
   */
  /*
   * 【收口方式 ③：协同处理 · 昨天】投诉单那一路。挑 t12『退款迟迟未到账』：
   * 投诉、P0、在办、受理一组，本身就是「投诉单」那一路的判据。
   */
  autoEntry({
    id: 'rq-s20',
    ticketNo: 'IFLYTS-20260716-00002',
    source: '投诉单',
    desc: '投诉类工单自动纳入实时监控。退款承诺到账时间已过，客户要求给出确切时点。',
    at: agoStamp(1440 + 320),
    status: '已评估',
    assignee: '吴投诉',
    tag: {
      result: '低',
      note: '退款流程已在途、金额可核对，客户情绪平稳且无对外诉求，判低危。',
      ...SEED_TAGGERS.wu,
      at: agoStamp(1440 + 300),
    },
    verify: {
      verdict: '成立',
      level: '低',
      note: '退款流程已在途、金额可核对，客户情绪平稳且无对外诉求，判低危。',
      ...SEED_TAGGERS.wu,
      at: agoStamp(1440 + 300),
    },
    coordination: {
      opinion: '退款单已在财务侧排队，卡的是批次而不是审核。给客户一个确切到账日并当天回访确认，比继续解释流程有用。',
      advices: ['每日跟进'],
      by: '吴投诉',
      byRole: '客诉专员',
      at: agoStamp(1440 + 240),
    },
  }),
  /*
   * 【收口方式 ②：评估 · 不升级 · 昨天】非投诉那一路。挑 rk-4『翻译机在线服务大面积超时』：
   * 咨询、P0、在办、受理二组，走「重要紧急」那一路。
   */
  autoEntry({
    id: 'rq-s21',
    ticketNo: 'IFLYZX-20260806-00004',
    source: '重要紧急',
    desc: 'P0 工单且已超解决时限，在线翻译区域性超时，已自动纳入实时监控。',
    at: agoStamp(1440 + 400),
    status: '已评估',
    assignee: '吴投诉',
    tag: {
      result: '低',
      note: '区域节点问题、离线翻译可绕行，客户未提出补偿或对外诉求，判低危。',
      ...SEED_TAGGERS.qin,
      at: agoStamp(1440 + 380),
    },
    verify: {
      verdict: '成立',
      level: '低',
      note: '区域节点问题、离线翻译可绕行，客户未提出补偿或对外诉求，判低危。',
      ...SEED_TAGGERS.qin,
      at: agoStamp(1440 + 380),
    },
    assessment: {
      decision: '不升级',
      advice: '故障面限于单个区域节点、离线翻译可继续使用，客户接受先用离线过渡，暂无对外诉求。留在原处理链上按天同步排查进展即可，不必转投诉。',
      by: '吴投诉',
      byRole: '客诉专员',
      at: agoStamp(1440 + 300),
    },
  }),

  /* ==================================================================
   * 视图三：已标记无风险（不进池）—— 4 条
   *
   * **必须有这一段**：它是漏斗的另一个出口，也是新旧口径差别最大的一格 ——
   * 旧口径下这批会一直躺在风险工单池里等人评估，新口径下它们**根本不进池**。
   * 少了它，"打标为无风险的去哪了"在页面上没有答案，而这正是评审最容易追问的一处。
   *
   * 【为什么是 4 条而不是 1 条】这一档答的是"**排除掉了多少**"。只有一条时，
   * 它证明得了"有这么一个出口"，却证明不了这个出口有流量 ——
   * 而"自动识别捞进来的里有相当一部分其实没风险"正是这条链最该讲清楚的一件事。
   * ================================================================== */

  /*
   * 挂 t5b `IFLYTS-20260804-00004`（投诉、真实存在）：投诉单自动进监控，
   * 人看过之后判定没有风险 —— "自动识别捞进来 ≠ 有风险"这句话由它作证。
   *
   * ⚠️ id `rr-005` 是原 VIP 样本腾出来的号，**不是新开的号段**：rr-### 这一段
   * 从 `rr-012` 起归 B 线自增（`riskReports.ts` 的 `ID_SEQ_START`），
   * 且 12 以下的空号已被两条线占满，故本轮新增的种子一律走 `rq-s##` 这个新号段。
   */
  autoEntry({
    id: 'rr-005',
    ticketNo: 'IFLYTS-20260804-00004',
    source: '投诉单',
    desc: '投诉类工单自动纳入实时监控。',
    at: todayStamp(150),
    status: '已标记无风险',
    tag: {
      result: NO_RISK,
      note: '客户诉求为常规换货，已在受理当日给出方案并接受，无升级与扩散迹象，判无风险。',
      ...SEED_TAGGERS.wu,
      at: todayStamp(140),
    },
  }),
  autoEntry({
    id: 'rq-s17',
    ticketNo: 'IFLYTS-20260708-00002',
    source: '投诉单',
    desc: '投诉类工单自动纳入实时监控。',
    at: todayStamp(95),
    status: '已标记无风险',
    tag: {
      result: NO_RISK,
      note: '重复扣费已核实并当日发起退款，客户确认接受，无对外诉求，判无风险。',
      ...SEED_TAGGERS.wu,
      at: todayStamp(85),
    },
  }),
  autoEntry({
    id: 'rq-s18',
    ticketNo: 'IFLYZX-20260806-00002',
    source: '重要紧急',
    desc: 'P0 工单，学习机课本同步资源丢失，已自动纳入实时监控。',
    at: todayStamp(70),
    status: '已标记无风险',
    tag: {
      result: NO_RISK,
      note: '资源已在同一通电话内恢复并经客户验证，未产生实际学习影响，判无风险。',
      ...SEED_TAGGERS.zheng,
      at: todayStamp(60),
    },
  }),
  autoEntry({
    id: 'rq-s19',
    ticketNo: 'IFLYTS-20260609-00005',
    source: '投诉单',
    desc: '投诉类工单自动纳入实时监控。账号异常登录，客户担心被盗。',
    at: todayStamp(210),
    status: '已标记无风险',
    tag: {
      result: NO_RISK,
      note: '经安全组核查为客户本人异地登录，已协助改密并开启二次验证，客户认可，判无风险。',
      ...SEED_TAGGERS.qin,
      at: todayStamp(200),
    },
  }),
];
/**
 * 本线的缓存键与格式版本。
 *
 * 🔴 **每次动到"落进缓存的值域"都必须升一版**，版本对不上一律丢弃（见 `readRiskCache`）：
 *   · v1 → v2：来源枚举砍掉「VIP客户」，且状态模型从"一进来就待分派"改成漏斗。
 *     不升的话，旧缓存里那批**没有 `tag` 却落在「待分派」**的条目会直接出现在风险工单池里，
 *     而漏斗的门槛正是"有 `tag` 才进池"——池子当场自相矛盾。
 *   · v2 → v3：**评估决策枚举把「接管」换成了「升级」**（见 `riskShared.ASSESS_DECISIONS`）。
 *     v2 的缓存里躺着 `assessment.decision === '接管'`，那是一个已经不在枚举里的值：
 *     读进来之后「今日决策」两枚 chip 一枚也数不到它，而它又会在已评估列表里
 *     顶着一个作废的词渲染出来。值域变了就换号，不靠归一化去救本线自己的旧数据。
 *   · v3 → v4：条目多了 `coordination` 这一格，且**协同处理会把条目转「已评估」**。
 *     v3 的缓存里有一批"协同过、状态却还停在待分派 / 评估中"的条目 ——
 *     读进来之后它们会在池子的待处理视图里重新冒出来，而工单页那边已经写着「已结论」。
 *     状态机的迁移规则变了就换号。
 *   · v4 → v5：**种子整批换过**（7 条 → 26 条），且打标人从一个人拆成三个。
 *     🔴 这一版升的理由与前三版不同：值域没变、状态机也没变，变的是**数据本身**。
 *     但缓存存的是**整份条目数组**（见 `writeRiskCache` 的说明），不升号的话，
 *     保质期内打开过本页的人读到的仍是那份 7 条的旧快照 —— 新补的低危、无风险、
 *     三个打标人、各班组的待判条目一条都不会出现，而页面上那些档位会照旧显示 0。
 *     "改了种子却看不到变化"比档位本身为 0 更难查：数据在文件里明明写着。
 *     **凡是动到 `SEED` 的都要升号**，不只是动到字段的时候。
 *   · v6 → v7：缓存里多了 `seedDay`（这份数据的时刻生成于哪一天），
 *     且读缓存改走 `readDailyRiskCache` —— **隔夜即作废**。
 *     v6 那份里没有 `seedDay`，新判据一律判它作废，本来也就该丢；升号只是把这件事说明白。
 *     同时打标 / 评估 / 协同时刻改由 `todayStamp` 生成（值域没变、取值变了），见 `SEED` 上方。
 *   · v5 → v6：`rq-s02` / `rq-s03` 两条的 `desc` 改了（它们挂的单变成了一单多命中）。
 *     ⚠️ 顺带记一笔，免得下次照抄错理由：**这一版真正变多的是工单库**
 *     （`mock/tickets.ts` 补了三张 P1 投诉单）——而「待标记」那一半是**每次现算**的，
 *     它照着 `TICKETS` 走、根本不进这份缓存，光补工单是**不需要**升号的。
 *     升号的理由只有 `desc` 这一处种子改动；真要说还有第二个，那就是不想让
 *     "缓存里的条目"和"刚变过的工单库"混着用 —— 但那是保险，不是机制。
 *   · v7 → v8：SEED 又动了三处（**值域没变、数据变了**，与 v4 → v5 同一类理由）：
 *     ① 补 `rq-s20` / `rq-s21` 两条**昨天收口**的已评估条目 —— 让「按处置阶段 · 已结论」
 *        这个累计口径与页头「今日已结论」那个当日口径**不再撞值**（6 vs 4）；
 *     ② `rr-009` 的评估意见去掉「接手」二字（基线 ※29 已把这个词从评估结论这条语义上作废）；
 *     ③ 池内三条条目补了命中语料（改的是 `mock/opsReport.ts`，但两者要同批生效）。
 *     不升号的话，保质期内打开过本页的人读到的仍是那份 14 条以前的旧快照：
 *     「已结论」照旧是 4、评估意见里照旧写着作废的词，而文件里明明已经改完了。
 *   · v8 → v9：条目上多了 `releases`（历次释放留痕，PRD v3.5 §5.5 ⑥）。
 *     **种子一条没动、值域也没变**，v8 那份读进来只是这一格为 undefined（判据侧一律
 *     `releases ?? []`），不升号也不会坏；升号是为了不让保质期内的旧快照与刚变过的模型
 *     混着用 —— 与 B 线 v5 → v6 同一批改动、同一个理由，两条线的号一起动。
 *   · v9 → v10：**来源枚举去掉「手动筛查」**（值域变了），条目与打标记录多了 `viaManualScan`；
 *     且开屏按三类判据**补齐监控条目**（`syncAutoEntries`），「未标记」段不再有无条目的行。
 *     v9 那份里躺着 `source: '手动筛查'` 的 `rr-010`，读进来即是一个不在枚举里的值。
 */
const LS_KEY = 'flowos-risk-queue';
const LS_VERSION = 10;

/**
 * 缓存"新不新"的判据：取**打标时刻**里最新的那一个。
 *
 * 🔴 **不取 `at`**：进队时刻里有三条是故意留在昨天的（超时未评那三条），
 * 而凌晨打开时其余几条也可能整批落在昨天 —— 拿它判，正常的一份缓存会被误杀。
 * 打标时刻由 `todayStamp` 生成，**在写入的那一刻必定落在今天**，
 * 故"它不是今天"⇔"这份缓存是隔夜的"，判据与事实一一对应。
 */
function newestQueueStamp(saved: { entries: RiskQueueEntry[] }): string {
  return newestStampOf((saved.entries ?? []).map((e) => e.tag?.at));
}

/**
 * 找"该给哪一条打标"时的挑选顺序。**越靠前越优先**。
 *
 * 【为什么要排这个序】按单号打标（`recordTag`）时同一张单理论上可能有多条 A 线条目，
 * 而人在打标弹窗里判的是"这张单有没有风险"。先给还没打过标的那条（实时监控中），
 * 其次是打完还没人动的（待分派 / 已标记无风险，都属于二次修改），
 * 最后才轮到已经有人在办或已有结论的 —— 那两态改标不会把条目挪出池，见 `recordTag`。
 */
const TAG_TARGET_ORDER: QueueStatus[] = ['实时监控中', '待分派', '已标记无风险', '评估中', '已评估'];

/**
 * 现补条目的入队说明，**按来源各一句**。
 * 【为什么不共用一句】`desc` 那一列在实时监控与池子里都要显示，它答的是"这条为什么会进来"；
 * 三类来源的答案完全不同，写成一句"自动纳入实时监控"等于什么都没说。
 * 措辞与种子里同来源那几条保持一致，免得同一类条目在同一张表上有两种说法。
 */
const AUTO_DESC: Record<QueueSource, string> = {
  实时监控: '沟通记录命中风险词，已自动纳入实时监控，待打标。',
  投诉单: '在办投诉类工单，自动纳入实时监控，待打标。',
  重要紧急: '优先级为 P0 / P1 的非投诉工单，自动纳入实时监控，待打标。',
};

/** 一次打标要填的东西。`amendReason` 只在**二次修改**时有，首次打标没有 */
export interface RiskTagInput {
  result: RiskTagResult;
  note: string;
  by: string;
  byRole: string;
  at: string;
  amendReason?: string;
}

export const useRiskQueueStore = defineStore('riskQueue', () => {
  const entries = ref<RiskQueueEntry[]>(SEED.map((e) => ({ ...e })));
  /** 打标历史走它，**不另造一套**：追加不覆盖、正序、末条即现行值，与命中核实同一套机制 */
  const tags = useRiskTagStore();
  /**
   * 第八类履历（风险结论）的**唯一落库口**，见 `stores/riskHistory.ts`。
   * 打标那一件（以及它带来的工单级等级变更）在本模块产出，故写入方向定在这里 ——
   * 两个打标入口（风险监控页的单条 / 批量、工单处理页的「风险打标」块）都收敛到
   * `recordTag` 这一个状态机入口上，履历因此不可能只在其中一个入口落下。
   */
  const history = useRiskHistoryStore();

  /**
   * 落 localStorage（保质期与**隔夜作废**见 `riskShared.ts` 的 `readDailyRiskCache`）。
   *
   * 本模块的闭环**天然跨角色**：系统自动识别、投诉督导打标 / 分派、客诉专员评。
   * 演示时这几步要换几次登录，纯内存态下每换一次前面做的全部归零。
   *
   * ⚠️ **打标历史不在这份缓存里**：它存在 `stores/riskTags.ts`（纯内存，刷新即回种子）。
   * 现行结论 `tag` 跟着条目持久化、历史不持久化，是有意的取舍——见 `RiskTagRecord` 的说明。
   */
  const cached = readDailyRiskCache<{ entries: RiskQueueEntry[] }>(
    LS_KEY,
    LS_VERSION,
    newestQueueStamp,
  );
  /**
   * 当前这份数据的时刻**生成于哪一天**：续用缓存就沿用缓存里那一天，
   * 回到种子就是 `SEED_DAY`。
   * 🔴 **写回时原样带下去，不取"写入那一刻"**：一场跨零点的演示会在 00:03 触发一次写入，
   * 那时若按写入时刻记，昨天生成的这份数据就被盖上今天的戳，隔夜判据从此瞎掉。
   */
  const seedDay = cached?.seedDay ?? SEED_DAY;
  if (cached && Array.isArray(cached.entries) && cached.entries.length) {
    entries.value = cached.entries
      .map((e) => ({ ...e, source: normalizeMonitorSource(e.source) }))
      // 第二道拦截：版本号拦的是**格式**，这一道拦的是**值**。
      // 「VIP客户」这一类本轮砍掉，归一化之后它仍是一个已不在枚举里的字符串，
      // 放进来会在来源筛选那一排长出一个点不亮的幽灵 chip。
      .filter((e): e is RiskQueueEntry => isQueueSource(e.source));
  }
  watch(
    entries,
    () => writeRiskCache(LS_KEY, LS_VERSION, { entries: entries.value, seedDay }),
    { deep: true },
  );

  /* ---------------- 打标 → 工单侧（《【930】》§6.1） ---------------- */

  /**
   * 把一条条目的打标等级写到**工单侧**（`stores/riskTags.ts` 的 `setTicketTagGrade`）。
   *
   * 【为什么要有这一步】`recordTag` 此前只改条目自己：条目在池子里显示成「高」，
   * 而工单页的工单级风险等级仍是空的 —— 打标为低 / 中 / 高**回写工单级风险等级**
   * （§6.1；跨条目取最高、同一条改判以最新为准，口径全文见 `riskTags.ticketGradeOf`）
   * 这条口径落了一半。工单级等级的读口在 `riskTags.ticketGradeOf`，
   * 那边不能反向 import 本模块（会成环，见那边的说明），故写的方向定在这里。
   *
   * 「无风险」传 null：那一档没有等级，工单侧那一格要被清掉而不是留着旧值。
   */
  function writeTicketGrade(e: RiskQueueEntry) {
    const level = e.tag && isPoolLevel(e.tag.result) ? e.tag.result : null;
    tags.setTicketTagGrade(e.ticketNo, e.id, level);
  }

  /**
   * 开屏灌一遍：种子与缓存里那批条目**自带打标结论**，它们没有走过 `recordTag`，
   * 工单侧那份投影因此是空的。不灌这一道，"打标回写工单级等级"只对本次会话现打的标成立，
   * 一刷新就退回去 —— 而种子里恰恰有三条已打标为高 / 中的条目。
   */
  entries.value.forEach(writeTicketGrade);

  function findById(id: string) {
    return entries.value.find((e) => e.id === id) ?? null;
  }

  /** 本单的全部 A 线条目（含还在实时监控的，不排序，排序归合并层） */
  function entriesOf(ticketNo: string) {
    return entries.value.filter((e) => e.ticketNo === ticketNo);
  }

  /**
   * 本单**现行的风险打标结论**（A 线那一路），没打过标时 null。
   *
   * 【为什么要有这个读口】工单页那句「本单 N 条命中待核实，尚无核实结论」问的是**命中核实**，
   * 而打标是另一条线：打完标之后那句话仍照旧显示"尚无结论"，与紧挨着的「风险打标 中危」
   * 在同一屏上互相打脸。两处提示行（`OpRiskMonitorTab` 与 `OpSupplementChipPanels`）
   * 都要读这份结论，读口收在这里，免得两边各写一遍 `entriesOf(...).find(e => !!e.tag)`。
   */
  function currentTagOf(ticketNo: string): RiskTagRecord | null {
    return entriesOf(ticketNo).find((e) => !!e.tag)?.tag ?? null;
  }

  /**
   * 本单当前在队的那条 A 线条目（至多一条）。
   *
   * ⚠️ **在队 ＝ 待分派 + 评估中，即已进池、还没出结论那一批**：
   * 还在「实时监控中」（没打标）的**不算**，「已评估 / 已标记无风险」的也不算。
   *
   * 🔴 **它不再参与二线报备的门控**（2026-09-10 收口）：报备的门控只看 B 线自己在不在队，
   * 见 `riskReports.pendingOf`。A 线条目不是报备，拦住报备入口是把"系统怀疑"
   * 当成了"已有人在报"。本函数现在只答"这条 A 线条目出结论了没有"，供本线自己判。
   */
  function openEntryOf(ticketNo: string) {
    return entries.value.find((e) => e.ticketNo === ticketNo && isOpenStatus(e.status)) ?? null;
  }

  /* ---------------- 实时监控的三视图（PRD §5.2） ---------------- */

  /** 按**等待时长降序 ＝ 进监控时刻正序**，等最久的在最上，与池子同一条排序口径（§5.3 元素 ④） */
  function byWaited(list: RiskQueueEntry[]) {
    return list.slice().sort((a, b) => a.at.localeCompare(b.at));
  }

  /**
   * **视图一 · 待打标**：在实时监控、尚未打标。
   *
   * 🔴 三个视图一律按 `status` 筛，**不按 `tag` 有没有值**。两者在今天的数据上等价，
   * 但状态机认的是 `status`（`recordTag` 改的就是它），而「评估中 / 已评估的条目改标不改状态」
   * 这一条恰恰会让两个判据分家：那种条目 `tag` 变了、位置没变。
   * 视图与状态机各认各的判据，屏幕上就会出现"它在这个视图里、按状态却不该在"。
   */
  const monitoringEntries = computed(() =>
    byWaited(entries.value.filter((e) => e.status === '实时监控中')),
  );

  /**
   * **视图二 · 已入池**：打标为低 / 中 / 高、已进风险工单池（待分派 / 评估中 / 已评估）。
   * 🔴 风险工单池的取数**就是它**（`stores/riskPool.ts`），两处不各筛各的。
   */
  const pooledEntries = computed(() => byWaited(entries.value.filter((e) => isPooledStatus(e.status))));

  /** **视图三 · 已标记无风险**：打标为无风险，**不进池**的终态 */
  const noRiskEntries = computed(() =>
    byWaited(entries.value.filter((e) => e.status === '已标记无风险')),
  );

  const monitoringCount = computed(() => monitoringEntries.value.length);
  const pooledCount = computed(() => pooledEntries.value.length);
  const noRiskCount = computed(() => noRiskEntries.value.length);

  /* ---------------- 打标（漏斗的那道门） ---------------- */

  /**
   * 种子条目自带的那份打标结论，转成一条历史记录。
   * **与 `riskTags.seedEntryOf` 同一个道理**：数据源里带来的首次结论要作为历史的第 1 条并回，
   * 否则修正记录会从半截开始 —— 屏幕上写着"由 中危 改为 高危"，而"中危"那一条从没出现过。
   * `verdict` 留空：漏斗打标不判命中准不准，见 `RiskTagEntry.verdict`。
   */
  function tagSeedEntryOf(e: RiskQueueEntry): RiskTagEntry | undefined {
    if (!e.tag) return undefined;
    const { result, note, by, byRole, at, amendReason, viaManualScan } = e.tag;
    return {
      level: isPoolLevel(result) ? result : null,
      note,
      by,
      byRole,
      at,
      ...(amendReason ? { amendReason } : {}),
      ...(viaManualScan ? { viaManualScan } : {}),
    };
  }

  /** 本条目的完整打标历史（含二次修改），时间正序。走 `riskTags`，与命中核实同一套留痕 */
  function tagHistoryOf(entryId: string): RiskTagEntry[] {
    const appended = tags.historyOf(entryId);
    if (appended.length) return appended;
    const e = findById(entryId);
    const seed = e ? tagSeedEntryOf(e) : undefined;
    return seed ? [seed] : [];
  }

  /**
   * **风险打标 · 状态机的唯一入口**（业务第三轮拍板）。
   *
   * 迁移表（判据一律是 `isPoolLevel(result)`，即"低/中/高 还是 无风险"）：
   * ```
   *   实时监控中     ──低/中/高──▶ 待分派（进池，等人领取评估）
   *   实时监控中     ──无风险────▶ 已标记无风险（不进池，终态）
   *   已标记无风险   ──低/中/高──▶ 待分派        （二次修改：改判有风险，补进池）
   *   待分派         ──无风险────▶ 已标记无风险  （二次修改：改判没风险，撤出池）
   *   待分派         ──低/中/高──▶ 待分派        （只换等级，留在原地）
   *   评估中/已评估  ──任何结论──▶ 原状态不动     （只更新等级，见下）
   * ```
   *
   * 🔴 **评估中 / 已评估的不跟着状态走**：那一刻已经有人在办、或者已经给出了评估结论。
   * 改标把它从池里拽走，等于让评估人手上的活凭空消失、或者让一条已有结论的记录退回无结论态，
   * 而评估结论是**提交即固化不可改**的（§9 规则 22）。改标仍然记下来（等级要更新、历史要留痕），
   * 但**不改变它在池子里的位置**。
   *
   * 【二次修改与历史】现行结论覆盖 `tag`，同时向 `stores/riskTags.ts` 追加一条 ——
   * 追加不覆盖，故"从中危改成无风险、又改回高危"这条爬坡读得出先后。
   * 首次打标不带 `amendReason`，二次修改必须带（由调用方收这道校验，本函数不拦：
   * store 拦的话，错误只能以 `return false` 的形式回到界面上，说不出缺的是哪一项）。
   *
   * 【为什么进池要清 `assignee`】「待分派」的定义就是还没有人认领。
   * 从「已标记无风险」补进池的条目若留着旧名字，待分派列表里会冒出一条已经有主的条目。
   */
  function recordTag(entryId: string, input: RiskTagInput): boolean {
    const e = findById(entryId);
    if (!e) return false;

    /*
     * 履历第八类要的两个"旧值"，**必须在覆盖之前取**：
     *   · `prevResult` —— 本条目上一次的打标结论，改判那一行要写「〈旧值〉 → 〈新值〉」；
     *   · `prevGrade`  —— 工单级风险等级，第 ⑤ 件「风险等级变更」的旧值。
     * 取晚一步就都成了新值，改判在履历上会写成"由高危改判为高危"。
     *
     * 🔴 `prevGrade` 取的是 `ticketGradeOf` 而**不是** `tagGradeOf`：⑤ 记的是**工单级**等级
     * （＝ max(已打标条目的等级, 已核实且成立的命中等级)）。只看打标那一半的话，
     * 一张已被命中核实判为高危的单再打个中危标，工单级其实纹丝不动，履历却会多出一条
     * "高危 → 中危" —— 而《【720】》§6 采集 ⑤ 的原话是「**值真的变了才写**」。
     */
    const prevResult = e.tag?.result ?? null;
    const prevGrade = tags.ticketGradeOf(e.ticketNo);

    // 条目上已经带着一份种子结论、而历史还是空的：先把那一份补进历史再写新的，
    // 否则种子条目的第一次修正会把原结论冲掉，历史从半截开始（见 `tagSeedEntryOf`）
    if (e.tag && !tags.historyOf(e.id).length) {
      const seed = tagSeedEntryOf(e);
      if (seed) tags.appendEntry(e.id, seed);
    }

    e.tag = {
      result: input.result,
      note: input.note,
      by: input.by,
      byRole: input.byRole,
      at: input.at,
      ...(input.amendReason ? { amendReason: input.amendReason } : {}),
      // 由手动筛查并入的条目，打标记录上标明「由手动筛查并入」（§5A.1 ④），来源列照旧写「实时监控」
      ...(e.viaManualScan ? { viaManualScan: true } : {}),
    };
    // 留痕：与命中核实共用 `riskTags` 的追加机制，key ＝ 条目 id。
    // `verdict` 留空——漏斗打标不判"这次命中准不准"，见 `RiskTagEntry.verdict`
    tags.appendEntry(e.id, {
      level: isPoolLevel(input.result) ? input.result : null,
      note: input.note,
      by: input.by,
      byRole: input.byRole,
      at: input.at,
      ...(input.amendReason ? { amendReason: input.amendReason } : {}),
      ...(e.viaManualScan ? { viaManualScan: true } : {}),
    });

    // 回写工单级风险等级（§6.1）。放在状态迁移之前：等级是打标这一下就成立的事实，
    // 与条目接下来落在池里还是落在「已标记无风险」无关
    writeTicketGrade(e);

    if (isPoolLevel(input.result)) {
      // 旧字段的只读投影，供过渡期的页面读，见 `RiskQueueEntry.verify`
      e.verify = {
        verdict: '成立',
        level: input.result,
        note: input.note,
        by: input.by,
        byRole: input.byRole,
        at: input.at,
      };
      if (e.status === '实时监控中' || e.status === '已标记无风险') {
        e.status = '待分派';
        delete e.assignee;
      }
    } else {
      // 无风险的不进池，投影一并清掉：它只在进了池的条目上有意义
      delete e.verify;
      if (e.status === '实时监控中' || e.status === '待分派') {
        e.status = '已标记无风险';
        delete e.assignee;
      }
    }

    /*
     * 落《【720】》第八类履历（《【930】》§6.3）。**两件，不是一件**：
     *   ② 打标本身 —— 「〈打标人〉 标记风险等级 · 〈四选一〉」，改判带「旧 → 新」＋改判理由；
     *   ⑤ 工单级风险等级变更 —— 只在**值真的变了**时才落，来源写「核实结论回传」。
     *
     * 🔴 **两条都落、不合并**：②答"谁在这条条目上下了什么结论"，⑤答"这张单现在有多危险"。
     * 一张单有多条条目时两者会分家（给第二条条目打个低危标，工单级仍是高危 —— ②有、⑤无），
     * 合成一条就再也说不清是哪一种情形。
     *
     * ⚠️ **落进第八类的每一条本来就都是人下的结论**（《【720】》§4.4「本类只收人下的结论」）：
     * 本函数是打标状态机的**唯一入口**，`by` / `byRole` 必填，全部调用方都是人点出来的保存动作
     * ——🔴 系统里**没有"命中规则自动打标"这回事**（930 v3.4 §9 规则 13），没有任何定时器 /
     * 监听器 / 规则引擎回调走到这里。规则给的只是词表预设等级，供排队与打标弹窗预置。
     * 故这里不需要、也没有一道"把机器打的那批挡在门外"的判据。
     */
    history.recordRiskHistory({
      kind: 'tag',
      ticketNo: e.ticketNo,
      by: input.by,
      byRole: input.byRole,
      at: input.at,
      result: input.result,
      prev: prevResult,
      note: input.note,
      ...(input.amendReason ? { amendReason: input.amendReason } : {}),
    });
    const nextGrade = tags.ticketGradeOf(e.ticketNo);
    if (nextGrade !== prevGrade) {
      history.recordRiskHistory({
        kind: 'grade',
        ticketNo: e.ticketNo,
        by: input.by,
        byRole: input.byRole,
        at: input.at,
        from: prevGrade,
        to: nextGrade,
        source: '核实结论回传',
      });
    }
    return true;
  }

  /**
   * 按**工单号**挑一条该给它打标的条目。同一张单有多条条目时按 `TAG_TARGET_ORDER` 挑，
   * 见该常量的说明。挑不到返回 null —— 这张单还没进过实时监控。
   */
  function tagTargetOf(ticketNo: string): RiskQueueEntry | null {
    return entriesOf(ticketNo)
      .slice()
      .sort((a, b) => TAG_TARGET_ORDER.indexOf(a.status) - TAG_TARGET_ORDER.indexOf(b.status))[0]
      ?? null;
  }

  /**
   * 一张单**本该**被哪一类自动识别捞进实时监控（《【930】》§5A.1 的三条判据，逐字对齐）：
   *
   * | # | 来源 | 判据 |
   * |---|---|---|
   * | ① | 预警词命中 | 本单在命中台账里有记录 |
   * | ② | 投诉单 | 在办 ∧ 类型 ＝ 投诉（**不限优先级**） |
   * | ③ | 重要紧急 | 在办 ∧ 类型 ≠ 投诉 ∧ 优先级 ∈ {P0, P1} |
   *
   * 🔴 **②不判优先级**：左栏「投诉单」这一路已定稿为 **P0 / P1 / P2 / P3 四个子档**，
   * 四档都要列，就不可能只把 P0 / P1 收进来 —— 收窄之后 P2 / P3 那两档必然是空的，
   * 而它们眼下明明有 11 条在办投诉单。**投诉单本身就是风险信号**，优先级只决定它排多前，
   * 不决定它进不进这一路（重要紧急那一路才是"以优先级立身"的，故③的 P0 / P1 照旧）。
   *
   * ⚠️ **必须与界面侧的 `RiskMonitorView.effectiveSourceOf` 逐条同源**。此前这两处分了家：
   * 界面判「类型＝投诉」、入队判「类型＝投诉 ∧ P0/P1」，于是一张 P2 的投诉单
   * **在列表里算「投诉单」这一档、却进不了队**（`ensureEntryFor` 判它"不在三类范围内"）。
   * 派生单尤其吃这个亏：评估判升级派生出的新投诉单默认不是 P0/P1，派生完回不到左栏。
   *
   * 判不出来就返回 null，**不给兜底值**：兜一个「实时监控」出来，等于让任何一张单
   * 都能被现场造一条监控条目，实时监控的条数就再也答不了"规则今天捞了多少"这个问题。
   *
   * 【为什么②③要判在办】R50a：三类来源取在办口径，终态单不入队。
   * 一张已结案的 P0 投诉单被补进监控，会在待打标视图里躺成一条谁也不会去处理的活。
   *
   * 【为什么①不判在办】命中记录是**已经发生过的事实**，它不随单子结案而消失；
   * 而且命中那一路的条目本就该跟着命中走，见 `isVerifyMonitorSource`。
   */
  function autoSourceFor(ticketNo: string): QueueSource | null {
    if (tags.hitsOfTicket(ticketNo).length) return '实时监控';
    const t: Ticket | undefined = TICKETS.find((x) => x.no === ticketNo)
      ?? useDerivedTicketStore().find(ticketNo);
    if (!t) return null;
    if (isTicketClosed(t.nodeStatus as TicketStatus)) return null;
    // ② 投诉单：全量在办投诉单，不看优先级（四个子档 P0~P3 都要收得住）
    if (t.type === '投诉') return '投诉单';
    // ③ 重要紧急：这一路以优先级立身，P0 / P1 的门照旧
    if (t.priority !== 'P0' && t.priority !== 'P1') return null;
    return '重要紧急';
  }

  /**
   * 这张单**为什么打不了标**；返回空串 ＝ 打得了（已有条目，或推得出三类来源之一）。
   *
   * 【为什么单独抽出来、而且是纯函数】工单页要在**点之前**就把话说清楚：
   * 打不了标的单直接不给按钮、原地写明原因，而不是让人填完弹窗才收到一句失败
   * （一个填完才失败的入口比一个不出现的入口糟得多）。`ensureEntryFor` 会建条目，
   * 组件的 computed 里不能调它 —— 那会让"渲染一次就悄悄多一条监控条目"。
   * 两处共用本函数，页面上写的原因与提交时兜底给的那一句因此永远是同一句。
   */
  function tagBlockReasonOf(ticketNo: string): string {
    if (tagTargetOf(ticketNo)) return '';
    if (autoSourceFor(ticketNo)) return '';
    const known = TICKETS.some((t) => t.no === ticketNo) || !!useDerivedTicketStore().find(ticketNo);
    return known
      ? '本单不在实时监控的三类自动识别范围内（无预警词命中，既不是在办投诉单、也不是在办的 P0 / P1 单），不能在工单页打标'
      : '工单库里查不到本单，无法判断它属于哪一类监控来源';
  }

  /**
   * **拿到一条可打标的条目**：本单已有条目就用它，没有就**按三类判据现补一条**。
   *
   * 【为什么必须有它】客诉专员在工单处理页给投诉单打标，走的是「按单号找条目」这条路；
   * 而条目只在风险监控页那一侧由自动识别生成 —— 一张**没进过实时监控**的投诉单，
   * 打标按钮点下去只会弹一句"本单没有实时监控条目"，那条口径（投诉单由客诉专员在
   * 工单处理页自行打标，§3.1）在这批单上等于没做。补一条之后这条路才是通的。
   *
   * 🔴 **不凭空造不该进监控的条目**：来源由 `autoSourceFor` 按 §5A.1 的三条判据推，
   * 推不出来就**如实失败并说清为什么**（"不在三类范围内"与"这单查不到"是两件事，
   * 提示不能混成一句）。放宽这道判据的代价是实时监控里会长出一批本不该在的条目，
   * 而那个视图的条数正是「规则捞了多少」这个指标本身。
   *
   * 补出来的条目落「实时监控中」——它就是自动识别刚捞进来的样子，打标紧跟着就把它推走。
   */
  function ensureEntryFor(ticketNo: string): { ok: true; entry: RiskQueueEntry } | { ok: false; reason: string } {
    const exist = tagTargetOf(ticketNo);
    if (exist) return { ok: true, entry: exist };

    const source = autoSourceFor(ticketNo);
    if (!source) return { ok: false, reason: tagBlockReasonOf(ticketNo) };

    const seq = entries.value.length + 1;
    const entry = autoEntry({
      // 现补的条目走 `rq-` 号段：`rr-###` 那一段两条线各占一半、已经排满
      // （A 线种子 12 以下、B 线 12 起自增），再往里挤必然撞 id。
      id: `rq-${Date.now()}-${seq}`,
      ticketNo,
      source,
      desc: AUTO_DESC[source],
      // 现补的条目是"此刻"进的监控，走 `agoStamp(0)` ＝ 当前时刻本身，
      // 不经 `todayStamp` 的压缩（它压的是种子里那段回溯，对 0 没有意义）
      at: agoStamp(0),
      status: '实时监控中',
    });
    entries.value.push(entry);
    return { ok: true, entry };
  }

  /**
   * **补齐监控条目**（《【930】》§5A.2「表里只有一类行」）：工单库里「在办 ∧ 从未被下过结论 ∧
   * 满足三类判据之一」、却还没有任何 A 线条目的单，各补一条落「实时监控中」的条目。
   *
   * 【为什么要补】「未标记」段的行一律是监控条目，来源与进监控时刻照实写。此前这批单在页面上
   * 以"无条目的行"拼进来（来源空、时刻「—」），打标那一刻才现补条目 —— 同一段里有两类行。
   *
   * 进监控时刻取**这张单满足判据的那一刻**：预警词那一路取本单最早一条命中的时刻；
   * 投诉单 / 重要紧急两路取工单建单时刻（这两路按工单属性自动识别，建单即满足）。取不到时记当前时刻。
   *
   * 判据与「未标记」段的入选口径逐条同源：在办（基线 §1 十个终态之外）、工单级风险等级为空、
   * `autoSourceFor` 推得出来源。只看工单库 `TICKETS`：派生单在派生那一刻已由 `ensureEntryFor` 补过。
   * 返回本次补了几条。
   */
  function syncAutoEntries(): number {
    const has = new Set(entries.value.map((e) => e.ticketNo));
    const added: RiskQueueEntry[] = [];
    for (const t of TICKETS) {
      if (has.has(t.no)) continue;
      if (isTicketClosed(t.nodeStatus as TicketStatus)) continue;
      if (tags.ticketGradeOf(t.no) !== null) continue;
      const source = autoSourceFor(t.no);
      if (!source) continue;
      const firstHit = source === '实时监控' ? tags.hitsOfTicket(t.no)[0] : undefined;
      added.push(autoEntry({
        id: `rq-auto-${t.no}`,
        ticketNo: t.no,
        source,
        desc: AUTO_DESC[source],
        at: firstHit?.when || t.createdAt || agoStamp(0),
        status: '实时监控中',
      }));
      has.add(t.no);
    }
    if (added.length) entries.value.push(...added);
    return added.length;
  }

  /**
   * **手动筛查「并入清单」**：勾选并入的命中所在的单，还没有监控条目的，补一条来源「实时监控」、
   * 进监控时刻 ＝ 并入时刻、带 `viaManualScan` 的条目（§5A.1 ④）。
   * 已有条目的单不动（它早已在监控里，谈不上"由手动筛查并入"）；终态单、工单库里查不到的单、
   * 已有工单级风险等级的单不补 —— 与 `syncAutoEntries` 同一套入选口径。
   * 返回本次补了几条。
   */
  function adoptScanTickets(ticketNos: string[], at: string): number {
    const has = new Set(entries.value.map((e) => e.ticketNo));
    let n = 0;
    for (const no of ticketNos) {
      if (has.has(no)) continue;
      const t: Ticket | undefined = TICKETS.find((x) => x.no === no) ?? useDerivedTicketStore().find(no);
      if (!t || isTicketClosed(t.nodeStatus as TicketStatus)) continue;
      if (tags.ticketGradeOf(no) !== null) continue;
      entries.value.push(autoEntry({
        id: `rq-scan-${Date.now()}-${no}`,
        ticketNo: no,
        source: '实时监控',
        viaManualScan: true,
        desc: '手动筛查命中风险词，并入实时监控，待打标。',
        at,
        status: '实时监控中',
      }));
      has.add(no);
      n += 1;
    }
    return n;
  }

  /**
   * 按**工单号**打标。打标弹窗是从命中侧 / 工单页点开的，那里手上只有单号，没有条目 id。
   *
   * 🔴 **找不到条目时先按三类判据补一条**（见 `ensureEntryFor`），而不是直接失败：
   * 旧实现在这里 `return false`，于是客诉专员在一张没进过实时监控的投诉单上打标，
   * 只会收到一句 warning —— 而那张单按 §5A.1 本来就该在监控里。
   *
   * 返回失败时**带上原因**，调用方原样呈现：挡住它的可能是"不在三类范围内"，
   * 也可能是"这张单查不到"，两者要人做的事完全不同。
   */
  function recordTagFor(ticketNo: string, input: RiskTagInput): { ok: boolean; reason?: string } {
    const got = ensureEntryFor(ticketNo);
    if (!got.ok) return { ok: false, reason: got.reason };
    return { ok: recordTag(got.entry.id, input) };
  }

  /**
   * ⚠️ **旧入口 · 兼容适配器**。它把 915 命中核实的结论（成立 / 误报 + 等级）
   * **翻译**成新口径的打标结论（低 / 中 / 高 / 无风险），再走 `recordTagFor`。
   *
   * 翻译规则只有一条：**`误报` 或者没有等级 → 无风险；否则 → 那个等级**。
   *
   * 【为什么是适配而不是保留旧逻辑】旧逻辑的判据是"这次命中准不准"（成立退回待分派、
   * 误报落已评估），新口径的判据是"有没有风险、多大"。两者形态相近，**但旧逻辑答不了新问题**：
   * 核实成立却只是低危的单，旧路径会把它和高危一起塞进池；而"人看过之后判定没风险"
   * 在旧路径里只能借「误报」这个词表达，一表达就污染了词表准确率。
   * 故判据统一到 `RiskTagRecord.result`，`ReportVerify.verdict` 退化成**这个适配器的入参**，
   * 不再落到条目上当判据（条目上那份 `verify` 是由 `tag` 反向派生的只读投影）。
   *
   * 🔴 **不再按来源过滤**：新口径下三类来源都要打标才进池，
   * 旧实现里那道 `isVerifyMonitorSource` 的门在新模型下会把投诉单 / 重要紧急两类永远挡在池外。
   *
   * 本函数是过渡件，下一批页面改成直接调 `recordTag` / `recordTagFor` 之后删掉。
   */
  function recordVerify(ticketNo: string, verify: ReportVerify) {
    const result: RiskTagResult =
      verify.verdict === '误报' || !verify.level ? NO_RISK : verify.level;
    return recordTagFor(ticketNo, {
      result,
      note: verify.note,
      by: verify.by,
      byRole: verify.byRole,
      at: verify.at,
    });
  }

  // 开屏补齐一遍：种子与缓存之外，工单库里满足三类判据的在办单都要有条目（见 `syncAutoEntries`）
  syncAutoEntries();

  return {
    entries,
    findById,
    entriesOf,
    currentTagOf,
    openEntryOf,
    monitoringEntries,
    pooledEntries,
    noRiskEntries,
    monitoringCount,
    pooledCount,
    noRiskCount,
    tagHistoryOf,
    recordTag,
    recordTagFor,
    recordVerify,
    ensureEntryFor,
    syncAutoEntries,
    adoptScanTickets,
    autoSourceFor,
    tagBlockReasonOf,
  };
});
