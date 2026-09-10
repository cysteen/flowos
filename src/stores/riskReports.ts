import { ref, watch } from 'vue';
import { defineStore } from 'pinia';
import { useNotifyLogStore } from '@/stores/notifyLog';
import { useRiskHistoryStore } from '@/stores/riskHistory';
import { useRiskQueueStore } from '@/stores/riskQueue';
import {
  RISK_POOL_RECEIVERS,
  REPORT_ASSESS_LIMIT_MIN,
  agoStamp,
  asSentence,
  assigneeReceiver,
  isOpenStatus,
  newestStampOf,
  reasonLine,
  readDailyRiskCache,
  todayPrefix,
  todayStamp,
  useRiskClock,
  writeRiskCache,
  type ReportAssessment,
  type ReportStatus,
  type RiskPoolItem,
} from '@/stores/riskShared';

/**
 * **B 线 · 风险报备单**（《【930】风险报备 · 监控 · 管控 PRD》§4）。
 *
 * 【这条线是什么】二线专员在**非投诉单**（咨询 / 建议 / 商机，基线 ※29）上发起风险报备 →
 * 报备池 → 客诉专员领取 → 评估二选一（升级 / 不升级）→ 终点。
 * 与 A 线（`stores/riskQueue.ts` 的自动入池）**互不交汇**：报备不回流 A 线。
 *
 * 【为什么在 store 里】报备单有两个消费方，且看的必须是同一份：
 * 发起端在工单操作页「风险报备」Tab（本单的全部报备与结论，§4.3），
 * 评估端在风险监控页「风险工单池」页签（全中心待评估队列，§5.2）。
 * 组件内的 ref 写不出"这边报了、那边队列里立刻出现"。
 *
 * 【边界】本 store **只管报备单自身**：模型、提交、撤回，以及供工单页读的那几个口。
 * 真正往 ProcessFormDraft 的 riskFlag / riskLevel 里写的那一步不在这里 ——
 * 写入优先级要看工单表单当前值，那是工单操作页才有的上下文（930 §6.1 / 915 §7.3）。
 *
 * 🔴 **几个门控读口已收成只看 B 线**（2026-09-10 收口）：`pendingOf` / `canSubmitFor` /
 * `isReporting` / `historyOf` 不再把 A 线在同一张单上的条目算进来 —— ※29 拦的是
 * "两条**报备**同时在队"，而 A 线的条目不是报备。**唯一仍合流的是 `reportsOf`**：
 * 它是"本单的全部风险条目"，工单页的评估形态与「本单另有」两处要的正是两条线的并集，
 * 各调用方按 `source` 自行收窄（见该函数说明）。
 */

/**
 * 报备原因（PRD §4.4）。取「风险场景」时风险类型才必填。
 *
 * 🔴 **只有三项**：业务原文的下拉还有「建单错误」与「已有投诉」，**两项已删**（O11）——
 * 评估结论是二选一「升级 / 不升级」，它答不了"这单类型建错了"和"这单跟哪张投诉单是一回事"。
 * 留着就是两个**没有闭环的入口**：报上来，评估侧只能判"不升级"，而单子的类型还是错的。
 * 建单错误由二线自改或找班组长；已有投诉关联由二线在客户全景页自行判断。
 */
export const REPORT_REASONS = ['客户要求升级', '风险场景', '其他'] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

/**
 * 风险类型（PRD §4.5）。**只存在报备单上** —— 不写工单、不进风险等级体系、
 * 不出现在风险监控的任何筛选与统计维度里（§9 规则 9）。它答的是"哪一路风险"，
 * 与答"这张单有多危险"的风险等级是两件事。
 */
export const RISK_CATEGORIES = ['舆情风险', '监管风险', '群体性风险', '其他'] as const;
export type RiskCategory = (typeof RISK_CATEGORIES)[number];

/**
 * 报备单。与 A 线条目（`RiskQueueEntry`）的差别就是这条线**有人**：
 * `reason` / `category` / `desc` / `attachments` / `by` / `byRole` 是报备人填的，
 * `withdrawReason` 是报备人撤回时填的。A 线那几个字段是恒定占位，不是真数据。
 */
export interface RiskReport {
  id: string;
  ticketNo: string;
  /**
   * 本条在合并池里的来源标签，**恒为「二线报备」**。
   * 【为什么留着】风险工单池的「监控来源」列要显示它、来源 chip 那一排要数它（N6）。
   * 下一批把两池拆开之后，B 线自己的页签不再需要这一列，届时可删。
   */
  source: '二线报备';
  /**
   * 分派给谁（客诉专员姓名）。空 ＝ 待分派。
   * 分派由投诉督导做，单条或批量（930 §5）。
   */
  assignee?: string;
  reason: ReportReason;
  /** 仅 reason ＝「风险场景」时有值（§9 规则 10） */
  category: RiskCategory | null;
  desc: string;
  attachments: string[];
  by: string;
  byRole: string;
  /** 提交时刻。等待时长从这里起算，**不从任何"分派时刻"**（N5） */
  at: string;
  status: ReportStatus;
  assessment?: ReportAssessment;
  /** 仅 status ＝「已撤回」时有值 */
  withdrawReason?: string;
}

/** 二线报备：来源恒为「二线报备」，种子里不再逐条重复 */
function reported(e: Omit<RiskReport, 'source'>): RiskReport {
  return { ...e, source: '二线报备' };
}

/*
 * ⚠️ **已删除 `TicketRiskAssessment` 及 `ticketAssessmentOf` / `ticketAssessmentNoteOf`**
 * （2026-09-09 第二轮拍板 N1 的连带）。
 *
 * 它们是"评估结论按 915 §7.3 回传工单风险字段"那条链路的取值口。二选一之后
 * **没有「确认有风险 + 定级」这一档了** —— 评估不再产出风险等级，那条回传链路失去前提：
 * - 「不升级」→ 工单**一字不写**；
 * - 「升级」→ 产出的是**一张新单**（走 830 已有的第一跳派生），不是往原单写字段。
 *
 * 保留一个空壳读口只会让调用方以为还有结论可回传。要看升级去向，读
 * `ReportAssessment.escalatedToNo`。
 */

/**
 * 这批种子的时刻**生成于哪一天**。模块加载时定一次，随缓存一并落盘 ——
 * 隔夜之后读回来判作废、回到种子重建，见 `riskShared.readDailyRiskCache`。
 */
const SEED_DAY = todayPrefix();

/**
 * 预置数据：挂在几张**非投诉单**上 —— 风险报备只在咨询 / 建议 / 商机（§1.2a）。
 *
 * 【时刻字段用哪一个生成器】与 A 线（`stores/riskQueue.ts`）同一套分工：
 *   · **提交时刻 `at`** 默认 `todayStamp`（不跨零点，页头「今日新增 · 报备」才有数），
 *     **唯独 rr-003 用 `agoStamp`** —— 它是这条线唯一的超时样本，超时按真实分钟算。
 *   · **评估时刻 `assessment.at`** 一律 `todayStamp`：它喂的是按自然日切的口径。
 * 白天两者完全等价，差别只在凌晨那几个小时，见 `todayStamp` 的说明。
 */
const SEED: RiskReport[] = [
  reported({
    id: 'rr-001',
    ticketNo: 'IFLYZX-20260610-00004',
    reason: '风险场景',
    category: '监管风险',
    desc: '客户在第三通来电中反复提到"这事你们不给说法我就去有关部门反映"，情绪较激动，且提到已经拍了照片。本单是咨询单，暂未升级为投诉，拿不准要不要提前介入。',
    attachments: ['第三通通话录音片段.mp3'],
    by: '林晓东',
    byRole: '二线专员',
    // 45 分钟前：未超时，演示「待分派」这一态
    at: todayStamp(45),
    status: '待分派',
  }),
  reported({
    id: 'rr-002',
    ticketNo: 'IFLYZX-20260610-00005',
    reason: '客户要求升级',
    category: null,
    desc: '客户明确说"叫你们领导来跟我讲"，当时判断是情绪话，先做了安抚。',
    attachments: [],
    by: '林晓东',
    byRole: '二线专员',
    at: todayStamp(90),
    status: '已评估',
    assignee: '李文萍',
    assessment: {
      decision: '不升级',
      advice: '客户情绪可安抚，当前咨询单处理路径足够；建议当日内回电明确处理节点并在处理记录留痕。',
      by: '李文萍',
      byRole: '客诉专员',
      // 评估时刻落在今日：否则「今日已评估」与「已评估默认只看今日」两处恒为 0
      at: todayStamp(50),
    },
  }),
  reported({
    id: 'rr-003',
    ticketNo: 'IFLYZX-20260610-00009',
    reason: '风险场景',
    category: '群体性风险',
    desc: '同一小区已有三位客户就同一批次设备反馈同类故障，客户之间互相认识并提到"要一起去反映"。',
    attachments: [],
    by: '周敏',
    byRole: '二线专员',
    // 3 小时前：已过 2 小时时限，演示「超时未评」的标红与计数
    at: agoStamp(180),
    status: '待分派',
  }),
  /*
   * 「评估中」样本。**必须有这一条**：没有它，领取之后状态列只剩「待领取」与「已评估」
   * 两档，看不出"已有人领、还在等结论"这一中间态；「评估中」筛选 chip 也会恒为 0。
   */
  reported({
    id: 'rr-010',
    ticketNo: 'IFLYZX-20260715-00003',
    reason: '客户要求升级',
    category: null,
    desc: '客户第三次来电追问处理进度，表示若今日无答复将向消费者协会投诉。',
    attachments: [],
    by: '林晓东',
    byRole: '二线专员',
    at: todayStamp(70),
    status: '评估中',
    assignee: '吴投诉',
  }),
  /*
   * 「已撤回」样本。**必须有这一条**：撤回的口径是「**不删除**，记录仍在、状态记『已撤回』
   * 并留下原因」（§4.8）。SEED 里没有它时，这条口径只能靠"现场报一条再撤一条"才看得到——
   * 而撤回恰恰是**报错了要纠错**的唯一出口，评审时最容易被追问"撤了之后那条去哪了"。
   *
   * 它同时钉住两条派生口径：① 已撤回**不进任何一个看板数**（B1 只数待分派 + 评估中）；
   * ② 它不占"同单在队至多一条"的名额 —— 这张单**现在还能再报一次**。
   *
   * 挂在**商机单**上是有意的：前面三条二线报备全在咨询单上，看着像"报备只能在咨询单发起"。
   * 基线 ※29 的类型集是**咨询 / 建议 / 商机**三类，这条把"商机单同样可报"摆出来。
   */
  reported({
    id: 'rr-007',
    ticketNo: 'IFLYSJ-20260610-00006',
    reason: '风险场景',
    category: '舆情风险',
    desc: '客户为教育行业重点客户，接口限流卡住开学季批量导入，通话中提到会把这事在行业交流群里说一说。判断有对外扩散的可能，先报备。',
    attachments: [],
    by: '林晓东',
    byRole: '二线专员',
    // 撤回前等了 2.5 小时。已撤回不进 B1/B2，故这个时长不会把「超时未评」算大
    at: todayStamp(150),
    status: '已撤回',
    withdrawReason: '开放平台已临时提额并当场恢复导入，客户明确表示不再对外说明；风险已解除，本条报备由报备人撤回。',
  }),
  /*
   * 「升级」样本。**必须有这一条**：SEED 里若只有「不升级」，升级那条分支
   * （派生新单号、原单落终态、Tab 上的「已派生投诉工单」标）在页面上一次都跑不出来，
   * 要看只能自己去评一条 —— 而演示与走查恰恰最需要它一开屏就在。
   *
   * ⚠️ 本条原来的两个号**都是编的**：`IFLYZX-20260610-00006`（全库不存在）与
   * `IFLYTS-20260909-00007`（全库不存在）。于是"派生投诉单"那一列点进去落空，
   * 恰恰把这条样本最该证明的东西证伪了。
   *
   * 现改挂 mock 里**现成的第一跳成对样本**：
   * 原单 `IFLYZX-20260707-00001`（咨询）→ 派生 `IFLYTS-20260709-00001`（t40，投诉，
   * 其 `escalatedFromNo` 正指回原单）。两个号都真实存在、且互相指得回去，
   * 点「派生投诉单」能落到一张真单上。
   *
   * 这条走的是**非投诉单**那一路：评估判「升级」→ 原单落「已升级投诉」并派生新投诉单。
   * 投诉单那一路（判「升级」→ 由客诉专员执行「工单管控」接手、不派生新单）由 A 线的 rr-009 承担，两条对照着看。
   */
  reported({
    id: 'rr-006',
    ticketNo: 'IFLYZX-20260707-00001',
    reason: '客户要求升级',
    category: null,
    desc: '客户连续两日致电，明确要求"给个说法否则去平台曝光"，并已在社交平台发帖。二线判断已超出常规咨询处理范围。',
    attachments: ['客户发帖截图.png'],
    by: '周敏',
    byRole: '二线专员',
    at: todayStamp(300),
    status: '已评估',
    assignee: '吴投诉',
    assessment: {
      decision: '升级',
      advice: '客户已在公开平台发声，具备外投与舆情双重风险，转投诉流程由客诉专员跟进；原单沟通记录与附件已随新单继承。',
      escalatedToNo: 'IFLYTS-20260709-00001',
      by: '吴投诉',
      byRole: '客诉专员',
      at: todayStamp(280),
    },
  }),
];

/**
 * 新报备单的自增起点。
 *
 * 🔴 **取 11 而不是本线种子条数（5）**：拆分前两条线共用一个 `rr-###` 号段、
 * 共 11 条种子，故拆分前第一条新报备拿到的是 `rr-012`。按本线条数起算会派出 `rr-006`，
 * 而 `rr-006` / `rr-008` / `rr-009` 都已被占用（前者本线、后两者 A 线）——
 * 两条线的条目会在合并池里撞 id，`v-for` 的 key 与"按 id 找条目"当场出错。
 * 号段跨两线保持唯一，这一个常量就是那条约束的落点。
 */
const ID_SEQ_START = 11;

/** 本线的缓存键与格式版本。**版本必须是 2**：v1 那份里同时躺着两条线的条目，见 `readRiskCache` */
const LS_KEY = 'flowos-risk-reports';
/**
 * v3：评估结论枚举由「不升级 / 接管」改为「升级 / 不升级」（2026-09-10 第三轮拍板）。
 * v2 那份缓存里 `decision` 存的是已废的 `'接管'`，读进来是枚举外的值——
 * 界面上它既不匹配「升级」也不匹配「不升级」，那一格会空掉且不报错。
 * v4：B 线 SEED 补「评估中」样本（rr-010），否则状态列缺领单后的中间态。
 * v5：缓存里多了 `seedDay`（这份数据的时刻生成于哪一天），读缓存改走 `readDailyRiskCache`
 * ——**隔夜即作废**。v4 那份没有 `seedDay`，新判据一律判作废、本来也该丢；
 * 同时提交 / 评估时刻改由 `todayStamp` 生成（值域没变、取值变了），见 `SEED` 上方。
 */
const LS_VERSION = 5;

/**
 * 缓存"新不新"的判据：取**提交与评估时刻**里最新的那一个。
 * 🔴 rr-003 那条故意留在昨天（超时样本），故不能拿"全部落在今天"当判据；
 * 而其余几条由 `todayStamp` 生成，**写入那一刻必定落在今天**，
 * 于是"最新的一条不是今天"⇔"这份缓存是隔夜的"。
 */
function newestReportStamp(saved: { reports: RiskReport[] }): string {
  return newestStampOf(
    (saved.reports ?? []).flatMap((r) => [r.at, r.assessment?.at]),
  );
}

export const useRiskReportStore = defineStore('riskReports', () => {
  const reports = ref<RiskReport[]>(SEED.map((r) => ({ ...r })));
  /** 自增序号只用来造 id，不参与任何业务判断 */
  const seq = ref(ID_SEQ_START);
  /** 领取后跳转工单页时，由工单侧消费并打开评估弹窗。写入方是合并层的 `claim`（930 §5，O18） */
  const assessArrivalTicket = ref<string | null>(null);

  /**
   * 落 localStorage（保质期与**隔夜作废**见 `riskShared.ts` 的 `readDailyRiskCache`）。
   *
   * 本模块的闭环**天然跨角色**：二线专员报、投诉督导分派、客诉专员评、结论再回到二线看。
   * 演示时这四步要换四次登录，纯内存态下每换一次前面做的全部归零——报完切过去队列是空的，
   * 评完切回来结论不在。持久化之后这条链才走得完。
   */
  const cached = readDailyRiskCache<{ reports: RiskReport[]; seq: number }>(
    LS_KEY,
    LS_VERSION,
    newestReportStamp,
  );
  /**
   * 这份数据的时刻**生成于哪一天**：续用缓存就沿用缓存里那一天，回到种子就是 `SEED_DAY`。
   * 🔴 写回时原样带下去、**不取写入那一刻** —— 跨零点的那一次写入会把昨天的数据
   * 盖成今天的戳，隔夜判据从此瞎掉（与 A 线同一处坑，两边写法保持一致）。
   */
  const seedDay = cached?.seedDay ?? SEED_DAY;
  if (cached && Array.isArray(cached.reports) && cached.reports.length) {
    reports.value = cached.reports;
    seq.value = typeof cached.seq === 'number' ? cached.seq : ID_SEQ_START;
  }
  watch(
    [reports, seq],
    () => writeRiskCache(LS_KEY, LS_VERSION, { reports: reports.value, seq: seq.value, seedDay }),
    { deep: true },
  );

  /** 报备五个事件的通知落点（O22）。工单页「通知记录」Tab 从这里读运行时那批 */
  const notifyLog = useNotifyLogStore();
  /** A 线。工单页的几个读口要把它在同一张单上的条目一并算进来，见下方各函数说明 */
  const queue = useRiskQueueStore();
  /** 第八类履历（风险结论）的唯一落库口，见 `stores/riskHistory.ts`。本线出「报备提交」这一件 */
  const history = useRiskHistoryStore();
  const clock = useRiskClock();

  function findById(id: string) {
    return reports.value.find((r) => r.id === id) ?? null;
  }

  /* ---------------- 工单页读口（本轮仍含 A 线条目，见文件头说明） ---------------- */

  /**
   * 本单的全部条目（含已撤回），时间倒序 —— 工单页「报备记录」与评估弹窗「本单另有」用。
   *
   * ⚠️ **它是本文件里唯一仍合流 A 线的读口**，而且是有意的：同一张单上既可能有报备单，
   * 也可能有自动入池条目，而工单页的**评估形态**要在两条线的并集里找"本单未出结论的那一条"
   * （客诉专员在一张重要紧急的咨询单上评的，正是 A 线的条目）。
   *
   * 🔴 **要 B 线那一半的调用方自己按 `source === '二线报备'` 收窄**（Tab 里的报备列表、
   * 「本单另有」那一段都已这么做）。不收窄就会渲染出一条报备人「系统」、原因「其他」、
   * 类型「—」的行 —— 三格全是 A 线的恒定占位，不是漏填。
   */
  function reportsOf(ticketNo: string): RiskPoolItem[] {
    return [...reports.value, ...queue.entriesOf(ticketNo)]
      .filter((r) => r.ticketNo === ticketNo)
      .sort((a, b) => b.at.localeCompare(a.at));
  }

  /**
   * 本单当前那条**在队的报备**（B 线）。
   *
   * 🔴 **在队的至多一条，历史条数不限**（PRD §9 规则 12 / D7）：拦的是"两条同时在队"，
   * 不是"这张单一辈子只能报一次"。评估完 / 撤回后照常可以再报，次数不限 ——
   * 这是纠错的唯一路径（评估结论不可改，§9 规则 22），也是"按建议处理后仍未闭环"
   * 这个场景（§2.3 V1）的出口。返回单个对象而不是数组，类型本身就把"不会有两条"写死。
   *
   * 🔴 **本轮收成只看 B 线**（2026-09-10）：此前它把 A 线在池的条目也算在内，那是拆线
   * 未完时的过渡态。※29 的门控原话是"同一张单不允许两条**报备**同时在队"，
   * 而 A 线的条目**不是谁报上来的** —— 它由系统按三类判据自动捞进来，没有报备人、
   * 没有报备原因。让它占住这个名额，后果是：
   *   ① 挂着一条在池 A 线条目的单子，二线**永远**发不了报备，而拦住他的那条"报备"并不存在；
   *   ② 底栏按钮顶着一句「本单已有报备待评估」置灰，二线点进 Tab 却一条报备都找不到。
   * 两条线各管各的门控之后，这两处才对得上。
   */
  function pendingOf(ticketNo: string): RiskPoolItem | null {
    return reports.value.find((r) => r.ticketNo === ticketNo && isOpenStatus(r.status)) ?? null;
  }

  /** 本单是否还能发起报备：只看**本线**在队（待分派 / 评估中），不看历史、不看 A 线 */
  function canSubmitFor(ticketNo: string) {
    return !pendingOf(ticketNo);
  }

  /**
   * 本单的历史**报备**（已评估 + 已撤回），时间倒序。
   * **不含在队那条** —— 它在界面上单独占一块（在队提示条 + 只读卡），进列表会重复。
   *
   * 🔴 **同样收成只看 B 线**（与 `pendingOf` 同一次改动）：这张列表的表头是
   * 报备人 / 报备原因 / 风险类型，而 A 线条目在这三格里装的是恒定占位（系统 / 其他 / —）。
   * 混进来的行看着像"有人报过一次却什么都没填"，读的人分不出那是占位还是漏填。
   * A 线的痕迹在「风险打标」那一块，两件事各说各的。
   */
  function historyOf(ticketNo: string): RiskPoolItem[] {
    return reportsOf(ticketNo).filter(
      (r) => r.source === '二线报备' && !isOpenStatus(r.status),
    );
  }

  /**
   * 工单的「报备中」标记（§3.2）。**纯派生、不落库**：有没有这个标记，
   * 完全等于"本单有没有一条**在队报备**"，人不直接操作它。
   * 【为什么含「评估中」】对报备人而言"报上去了、还没有结论"是同一件事，
   * 内部谁在评与他无关；只认「待分派」的话，一被领取横幅就没了，看着像结论已经出来了。
   */
  function isReporting(ticketNo: string) {
    return !!pendingOf(ticketNo);
  }

  /** 最新已评估结论的可读一行（工单页只读回显；二选一后无风险等级，展示决策 + 评估人 + 时刻） */
  function assessmentNoteOf(ticketNo: string): string {
    const latest = reportsOf(ticketNo).find((r) => r.status === '已评估' && r.assessment);
    if (!latest?.assessment) return '';
    const a = latest.assessment;
    if (a.decision === '升级' && a.escalatedToNo) {
      return `风险评估：升级 → ${a.escalatedToNo} · ${a.by}（${a.byRole}）· ${a.at}`;
    }
    return `风险评估：${a.decision} · ${a.by}（${a.byRole}）· ${a.at}`;
  }

  /** 等待时长与超时判定走两线共用的那根钟，见 `riskShared.ts` 的 `useRiskClock` */
  const waitedMinutes = clock.waitedMinutes;

  /** 是否超时未评：**在队**且等待时长 > 时限。不是 SLA，不走工作日历、不停表 */
  function isOverdue(r: { status: ReportStatus; at: string }) {
    return isOpenStatus(r.status) && clock.isOverdueAt(r.at);
  }

  /* ---------------- 动作 ---------------- */

  /** 二线报备提交，落「待分派」。A 线自动入池的条目不走这里 */
  function submit(input: {
    ticketNo: string;
    reason: ReportReason;
    category: RiskCategory | null;
    desc: string;
    attachments: string[];
    by: string;
    byRole: string;
    at: string;
  }) {
    if (!canSubmitFor(input.ticketNo)) return null;
    seq.value += 1;
    const report: RiskReport = {
      id: `rr-${String(seq.value).padStart(3, '0')}`,
      source: '二线报备',
      status: '待分派',
      ...input,
      // 风险类型只在「风险场景」下成立：原因切走时前端已清空，这里再收一道，
      // 免得别处调用绕过表单直接塞进来一个不该有的值
      category: input.reason === '风险场景' ? input.category : null,
    };
    reports.value.push(report);
    /*
     * 落《【720】》第八类履历 ①「报备提交」（《【930】》§6.3）：
     * 「〈报备人〉 发起风险报备 · 〈报备原因〉〈风险类型〉」。
     *
     * ⚠️ **风险类型只在原因＝「风险场景」时存在**（§4.5 / 《【720】》§4.4 退化规则①），
     * 这里直接交 `report.category` —— 上面那道收敛已经把非风险场景的类型清成 null 了。
     * 🔴 **撤回报备不写履历**（《【720】》§6 采集「风险结论 ①」原话），故 `withdraw` 里没有对应调用。
     */
    history.recordRiskHistory({
      kind: 'report',
      ticketNo: report.ticketNo,
      by: report.by,
      byRole: report.byRole,
      at: report.at,
      reason: report.reason,
      category: report.category,
    });
    /*
     * 报上来第一时间要惊动的是**能领这条的人 ＝ 客诉专员 + 管理员**（基线 v1.24：两池同权）。
     * 这条队列卡的是投诉立项，静悄悄躺在池子里等人主动来看是不行的。
     *
     * 🔴 **收件人与文案都已去掉「分派」**（2026-09-11）：分派 / 改派 / 批量分派整套已取消，
     * 池里只有自取。原文写的是「待分派…请及时分派客诉专员评估」——
     * 收件人是一个已经不能分派的角色（投诉督导本轮已去权），动词指向一个不存在的动作。
     */
    notifyLog.emit({
      ticketNo: report.ticketNo,
      event: 'risk.report.submitted',
      kind: 'risk',
      title: '风险报备待领取',
      receivers: [...RISK_POOL_RECEIVERS],
      content: `${report.ticketNo} 新增一条风险报备，报备原因：${reasonLine(report)}；报备人：${report.by}（${report.byRole}）。请及时在风险报备池领取并给出评估结论，评估时限 ${REPORT_ASSESS_LIMIT_MIN} 分钟（自报备提交时刻起算）。`,
    });
    return report;
  }

  /**
   * 撤回：**仅待分派、仅本人**（调用方判"本人"）。**不删除**，转「已撤回」并留原因（§4.8）。
   * 【为什么分派后不能撤】活已经指给人了，这时候抽走等于让评估人白读一遍；
   * 分派之后要纠错，走"评完再报一次"。
   *
   * 🔴 **只认 B 线的 id**：撤回是"报备人收回自己报的那一条"，A 线的条目没有报备人，
   * 界面上也拿不到撤回按钮（判据含 `by === 当前用户`，而 A 线的 `by` 恒为「系统」）。
   */
  function withdraw(id: string, reason: string) {
    const r = findById(id);
    if (!r || r.status !== '待分派') return;
    r.status = '已撤回';
    r.withdrawReason = reason;
    /*
     * 收件人配的是「客诉专员 + 管理员 + 承办人」三类（前两类见 `RISK_POOL_RECEIVERS`：
     * 基线 v1.24 两池同权），而**撤回只能发生在待领取态**，那一刻 `assignee` **必然为空**
     * —— 这正是 O23 类型级判据的现场：按规则级（一类解析不到就整条不发）这条会被静默丢掉，
     * 池子那边少了一条却不知道去哪了。这里让「承办人」这一类落空、池上两类照收。
     *
     * 「承办人」这一类仍然要配上：领取后能否撤回是可能变的口径，
     * 现在把它删掉，将来放开时又得回头补一遍收件人配置。
     */
    notifyLog.emit({
      ticketNo: r.ticketNo,
      event: 'risk.report.withdrawn',
      kind: 'risk',
      title: '风险报备已撤回',
      receivers: [...RISK_POOL_RECEIVERS, assigneeReceiver(r)],
      content: `${r.ticketNo} 的风险报备已由 ${r.by}（${r.byRole}）撤回，撤回原因：${asSentence(reason)}该条报备记录保留、不再进入待评估队列；如风险再现，本单可重新发起报备。`,
    });
  }

  /** 工单详情页打开后消费一次，触发评估弹窗 */
  function consumeAssessArrival(ticketNo: string) {
    if (assessArrivalTicket.value !== ticketNo) return false;
    assessArrivalTicket.value = null;
    return true;
  }

  return {
    reports,
    assessArrivalTicket,
    findById,
    reportsOf,
    pendingOf,
    canSubmitFor,
    historyOf,
    isReporting,
    assessmentNoteOf,
    waitedMinutes,
    isOverdue,
    submit,
    withdraw,
    consumeAssessArrival,
  };
});
