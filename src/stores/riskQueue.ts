import { computed, ref, watch } from 'vue';
import { defineStore } from 'pinia';
import { useRiskTagStore, type RiskTagEntry } from '@/stores/riskTags';
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
  normalizeMonitorSource,
  readRiskCache,
  writeRiskCache,
  type QueueSource,
  type QueueStatus,
  type ReportAssessment,
  type ReportVerify,
  type RiskCoordination,
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
  /** 自动识别来源三类（预警词命中拆成实时监控 / 手动筛查两个展示值），见 `QUEUE_SOURCES` */
  source: QueueSource;
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
 * 系统打标的落款。种子里那几条已打标的条目**必须有一个具名打标人**：
 * 「谁判的、什么分量」是打标这件事的一半，落款写「系统」等于说没有人为此负责。
 * 郑监控（投诉督导）本就是命中表（`mock/opsReport.ts`）里 h5 的核实人，两处是同一个人。
 */
const SEED_TAGGER = { by: '郑监控', byRole: '投诉督导' } as const;

/**
 * 预置数据：**三条视图各有样本**（待打标 / 已入池 / 已标记无风险），
 * 且三类自动识别来源各有条目。
 *
 * ⚠️ 工单号一律取 `mock/tickets.ts` 里**真实存在**的单，且类型对得上 ——
 * 编一个号出来，队列上点单号落在空白页，这条样本要证明的东西当场被证伪。
 */
const SEED: RiskQueueEntry[] = [
  /*
   * ===== 视图一：待打标（实时监控中）=====
   *
   * 「预警词命中 · 待打标」样本。**必须有**：它是漏斗的入口本身，
   * 少了它，"自动识别进来先等打标、打完才进池"这条链在页面上一次都跑不出来。
   *
   * ⚠️ 工单号有两条硬约束，缺一条这一行就点不出东西：
   *   ① 必须真实存在于 `mock/tickets.ts`，否则队列上点单号落在空白页；
   *   ② 它在命中表（`mock/opsReport.ts`）里的那条命中**必须还没核实**——本行要打的就是标；
   *      命中若已打过标，打标弹窗只会弹一句"已全部核实"，这条路演不出来。
   * 取 h1『无线音乐播放跳过歌曲异常』：投诉单、真实存在、命中未核实。
   */
  autoEntry({
    id: 'rr-000',
    ticketNo: 'IFLYTS-20260610-00002',
    source: '实时监控',
    desc: '沟通记录命中风险词，已自动纳入实时监控，待打标。',
    at: agoStamp(65),
    status: '实时监控中',
  }),
  /*
   * 「投诉单 · 待打标」样本。**必须有这一条**：旧口径下投诉单是**直接进池**的，
   * 新口径把它也拦在打标这道门前。少了它，"三类来源都要打标"这句话在页面上
   * 只有预警词那一路作证，看着仍像"只有关键词那一路要打标"的老样子。
   *
   * 挂 t5『收到商品与描述不符，申请退货』：投诉单、真实存在、P2、SLA 充足 ——
   * 它恰恰是"投诉单不等于有风险"的现成例子，与下面 rr-004 判无风险那一条互为对照。
   */
  autoEntry({
    id: 'rr-004',
    ticketNo: 'IFLYTS-20260610-00007',
    source: '投诉单',
    desc: '投诉类工单自动纳入实时监控，待打标。',
    at: agoStamp(20),
    status: '实时监控中',
  }),

  /*
   * ===== 视图二：已入池（打标为低 / 中 / 高）=====
   *
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
    source: '手动筛查',
    desc: '手动批量筛查命中风险词，已自动纳入实时监控。',
    at: agoStamp(110),
    status: '待分派',
    tag: {
      result: '高',
      note: '同一客户第二次命中高危词，已上报法务',
      ...SEED_TAGGER,
      at: agoStamp(95),
    },
    verify: {
      verdict: '成立',
      level: '高',
      note: '同一客户第二次命中高危词，已上报法务',
      ...SEED_TAGGER,
      at: agoStamp(95),
    },
  }),
  /*
   * 「重要紧急 · 打标高危 → 待分派」样本。**必须有这一条**：三类来源里只有它一条样本都没有，
   * 于是来源 chip 行那一枚恒为 0、按「监控来源」列筛选与排序时它永远是空的。
   *
   * 挑这张单是因为它自己就是「重要紧急」的判据本身：P0 + 已超解决时限 41 小时 +
   * 影响校端批量业务，不需要另讲一个故事来解释它为什么会被自动捞进来。
   * 35 分钟前进的监控：未超时，与 B 线 rr-003 的超时态形成对照，两态在同一张表上同时可见。
   */
  autoEntry({
    id: 'rr-008',
    ticketNo: 'IFLYZX-20260802-00002',
    source: '重要紧急',
    desc: 'P0 工单且已超解决时限，影响客户批量业务，已自动纳入实时监控。',
    at: agoStamp(35),
    status: '待分派',
    tag: {
      result: '高',
      note: 'P0 且已超解决时限 41 小时，影响校端成绩同步批量业务，判高危。',
      ...SEED_TAGGER,
      at: agoStamp(30),
    },
    verify: {
      verdict: '成立',
      level: '高',
      note: 'P0 且已超解决时限 41 小时，影响校端成绩同步批量业务，判高危。',
      ...SEED_TAGGER,
      at: agoStamp(30),
    },
  }),
  /*
   * 「评估中」样本。**必须有这一条**：它是池内唯一一条已分派的条目 ——
   * 没有它，「待分派 + 评估中 ≡ B1」这条恒等式右边那一项恒为 0，
   * 分派这个动作做完是什么样子在开屏时看不到（B 线的种子里也没有评估中的）。
   *
   * ⚠️ 它顶掉的是原先那条 **VIP客户** 样本（VIP 本轮砍掉，见 `QUEUE_SOURCES`）。
   * 原样本挂 `IFLYZX-20260610-00005`（t3：咨询、P1、已挂起、**vip: false**）——
   * 那张单本来就不是 VIP，来源与单据对不上。故不是"改挂来源"能救的，整条换掉。
   * 现挂 `IFLYTS-20260730-00001`（ops-2：投诉、P0、VIP 校长、已超解决时限 88 小时），
   * 真实存在，且与本线其余条目分开挂，避开"同单至多一条在队"。
   * 240 分钟前进的监控：已过 2 小时时限，演示「已分派也会超时」。
   */
  autoEntry({
    id: 'rr-011',
    ticketNo: 'IFLYTS-20260730-00001',
    source: '投诉单',
    desc: '投诉类工单自动纳入实时监控。校级批量激活 320 台全部失败，开学在即。',
    at: agoStamp(240),
    status: '评估中',
    assignee: '吴投诉',
    tag: {
      result: '中',
      note: '批量影响面大但客户尚未提出对外诉求，判中危，先派人评估是否升级。',
      ...SEED_TAGGER,
      at: agoStamp(225),
    },
    verify: {
      verdict: '成立',
      level: '中',
      note: '批量影响面大但客户尚未提出对外诉求，判中危，先派人评估是否升级。',
      ...SEED_TAGGER,
      at: agoStamp(225),
    },
  }),
  /*
   * 「投诉单上的升级」样本。**必须有这一条**：它是升级按原单类型分流的另一半（O20）。
   *
   * B 线的 rr-006 原单是**咨询单**（非投诉）：升级后原单落「已升级投诉」并**派生**一张投诉单。
   * 本条原单**本身就是投诉单**：升级走基线 ※27「**工单管控**」——把这张单拿到客诉专员名下，
   * **本单状态不变、不派生新单**，故 `escalatedToNo` 留空、队列「派生投诉单」列显示「—」。
   *
   * 🔴 **不要再给它填 `escalatedToNo`**：O17 原定的"投诉单走 830 第二跳（内投→外投）"已被 O20 推翻。
   * 第二跳只走内投→外投，来源＝热线 / IM / 小程序的投诉单入口本就置灰，客诉专员点不动；
   * 硬派生一张外投单等于在客户根本没有外投时造一张外投单，会把外投量与外投口径系统性抬高。
   *
   * 新口径下它同样得先打标才进得了池，故补上一份进池时的打标结论（185 分钟前，先于评估）。
   */
  autoEntry({
    id: 'rr-009',
    ticketNo: 'IFLYTS-20260711-00001',
    source: '投诉单',
    desc: '投诉类工单自动纳入实时监控。客户维修超期未解决并已向监管平台反映。',
    at: agoStamp(190),
    status: '已评估',
    assignee: '吴投诉',
    tag: {
      result: '高',
      note: '客户已向监管平台正式登记，判高危。',
      ...SEED_TAGGER,
      at: agoStamp(185),
    },
    verify: {
      verdict: '成立',
      level: '高',
      note: '客户已向监管平台正式登记，判高危。',
      ...SEED_TAGGER,
      at: agoStamp(185),
    },
    assessment: {
      decision: '升级',
      advice: '客户已向监管平台正式登记，须限时答复并留存全过程记录。本单已是投诉单，由我执行「工单管控」接手，本单状态不变、不另开新单。',
      by: '吴投诉',
      byRole: '客诉专员',
      // 评估时刻落在今日：否则 B3「今日已评估」与 B4 决策分布数不到它
      at: agoStamp(160),
    },
  }),

  /*
   * ===== 视图三：已标记无风险（不进池）=====
   *
   * **必须有这一条**：它是漏斗的另一个出口，也是新旧口径差别最大的一格 ——
   * 旧口径下这条会一直躺在风险工单池里等人评估，新口径下它**根本不进池**。
   * 少了它，"打标为无风险的去哪了"在页面上没有答案，而这正是评审最容易追问的一处。
   *
   * 挂 t5b `IFLYTS-20260804-00004`（投诉、真实存在）：投诉单自动进监控，
   * 人看过之后判定没有风险 —— "自动识别捞进来 ≠ 有风险"这句话由它作证。
   *
   * ⚠️ id `rr-005` 是原 VIP 样本腾出来的号，**不是新开的号段**：rr-### 这一段
   * 从 `rr-012` 起归 B 线自增（`riskReports.ts` 的 `ID_SEQ_START`），
   * 新增 A 线种子只能用 12 以下的空号，否则两条线的条目会在合并池里撞 id。
   */
  autoEntry({
    id: 'rr-005',
    ticketNo: 'IFLYTS-20260804-00004',
    source: '投诉单',
    desc: '投诉类工单自动纳入实时监控。',
    at: agoStamp(150),
    status: '已标记无风险',
    tag: {
      result: NO_RISK,
      note: '客户诉求为常规换货，已在受理当日给出方案并接受，无升级与扩散迹象，判无风险。',
      ...SEED_TAGGER,
      at: agoStamp(140),
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
 */
const LS_KEY = 'flowos-risk-queue';
const LS_VERSION = 4;

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
  手动筛查: '手动批量筛查命中风险词，已自动纳入实时监控，待打标。',
  投诉单: '投诉类工单且优先级为 P0 / P1，自动纳入实时监控，待打标。',
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
   * 落 localStorage（保质期机制见 `riskShared.ts` 的 `readRiskCache`）。
   *
   * 本模块的闭环**天然跨角色**：系统自动识别、投诉督导打标 / 分派、客诉专员评。
   * 演示时这几步要换几次登录，纯内存态下每换一次前面做的全部归零。
   *
   * ⚠️ **打标历史不在这份缓存里**：它存在 `stores/riskTags.ts`（纯内存，刷新即回种子）。
   * 现行结论 `tag` 跟着条目持久化、历史不持久化，是有意的取舍——见 `RiskTagRecord` 的说明。
   */
  const cached = readRiskCache<{ entries: RiskQueueEntry[] }>(LS_KEY, LS_VERSION);
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
    () => writeRiskCache(LS_KEY, LS_VERSION, { entries: entries.value }),
    { deep: true },
  );

  /* ---------------- 打标 → 工单侧（《【930】》§6.1） ---------------- */

  /**
   * 把一条条目的打标等级写到**工单侧**（`stores/riskTags.ts` 的 `setTicketTagGrade`）。
   *
   * 【为什么要有这一步】`recordTag` 此前只改条目自己：条目在池子里显示成「高」，
   * 而工单页的工单级风险等级仍是空的 —— 打标为低 / 中 / 高**回写工单级风险等级**
   * （§6.1，取 max、只升不降）这条口径落了一半。工单级等级的读口在 `riskTags.ticketGradeOf`，
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
    const { result, note, by, byRole, at, amendReason } = e.tag;
    return {
      level: isPoolLevel(result) ? result : null,
      note,
      by,
      byRole,
      at,
      ...(amendReason ? { amendReason } : {}),
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
   * | ② | 投诉单 | 在办 ∧ 类型 ＝ 投诉 ∧ 优先级 ∈ {P0, P1} |
   * | ③ | 重要紧急 | 在办 ∧ 类型 ≠ 投诉 ∧ 优先级 ∈ {P0, P1} |
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
    if (t.priority !== 'P0' && t.priority !== 'P1') return null;
    return t.type === '投诉' ? '投诉单' : '重要紧急';
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
      ? '本单不在实时监控的三类自动识别范围内（无预警词命中，且不是在办的 P0 / P1 单），不能在工单页打标'
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
      at: agoStamp(0),
      status: '实时监控中',
    });
    entries.value.push(entry);
    return { ok: true, entry };
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

  return {
    entries,
    findById,
    entriesOf,
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
    autoSourceFor,
    tagBlockReasonOf,
  };
});
