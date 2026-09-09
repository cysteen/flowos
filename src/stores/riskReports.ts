import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import { RISK_LEVELS, riskLevelText, type RiskLevel } from '@/config/risk';
import type { RiskFlag } from '@/views/tickets/types/operation';

/**
 * 风险报备 · 跨页共享（《【930】风险报备 · 监控 · 管控 PRD》§4 / §5）。
 *
 * 【为什么在 store 里】报备单有两个消费方，且看的必须是同一份：
 * 发起端在工单操作页「风险报备」Tab（本单的全部报备与结论，§4.3），
 * 评估端在风险监控页「风险评估」页签（全中心待评估队列，§5.2）。
 * 组件内的 ref 写不出"这边报了、那边队列里立刻出现"。
 *
 * 【局限】前端内存，整页刷新回到 mock 预置数据。SPA 内切页签 / 跳工单不受影响。
 *
 * 【边界】本 store **只管报备单自身**，外加一个供工单页只读回显的读口（`assessmentNoteOf`）。
 * 真正往 ProcessFormDraft 的 riskFlag / riskLevel 里写的那一步不在这里 ——
 * 写入优先级要看工单表单当前值，那是工单操作页才有的上下文（930 §6.1 / 915 §7.3）。
 */

/**
 * 报备原因（PRD §4.4）。取「风险场景」时风险类型才必填。
 *
 * 🔴 **只有三项**：业务原文的下拉还有「建单错误」与「已有投诉」，**两项已删**（O11）——
 * 评估结论是二选一「不升级 / 接管」，它答不了"这单类型建错了"和"这单跟哪张投诉单是一回事"。
 * 留着就是两个**没有闭环的入口**：报上来，评估侧只能判"不升级"，而单子的类型还是错的。
 * 建单错误由二线自改或找班组长；已有投诉关联由二线在客户全景页自行判断。
 */
export const REPORT_REASONS = ['客户要求升级', '风险场景', '其他'] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

/**
 * 监控来源（930 §5，业务文档「监控维度」）。**五类合一个队列**，列表按此列筛选排序。
 *
 * 【为什么是一个队列而不是两个】业务原文要求"所有监控来源的工单统一归入待分派队列"——
 * 风险组的工作面只该有一个"接下来要看什么"的清单，来源是它的一个属性，不是另一批数据。
 *
 * ⚠️ **两个分母仍然不能相加**：命中记录数 与 报备单数 是两回事（同一张单可以报三次），
 * 合并的是"要处理的队列"，不是"统计口径"。
 *
 * 「系统自动判断（AI）」是业务文档自标的第六类、**规划中**，本轮不做，故不在枚举里。
 */
export const MONITOR_SOURCES = ['关键词触发', '全量投诉', '紧急重要', 'VIP客户', '二线报备'] as const;
export type MonitorSource = (typeof MONITOR_SOURCES)[number];

/**
 * 风险类型（PRD §4.5）。**只存在报备单上** —— 不写工单、不进风险等级体系、
 * 不出现在风险监控的任何筛选与统计维度里（§9 规则 9）。它答的是"哪一路风险"，
 * 与答"这张单有多危险"的风险等级是两件事。
 */
export const RISK_CATEGORIES = ['舆情风险', '监管风险', '群体性风险', '其他'] as const;
export type RiskCategory = (typeof RISK_CATEGORIES)[number];

/** 评估决策二选一（业务文档）。原型按「不升级 / 接管」呈现 */
export const ASSESS_DECISIONS = ['不升级', '接管'] as const;
export type AssessDecision = (typeof ASSESS_DECISIONS)[number];

/**
 * 报备单三态（PRD §3.1，2026-09-09 第二轮拍板 N4）：**待分派 → 评估中 → 已评估**。
 * 「已撤回」不是第四态，是**待分派的终止分支**（分派之后不能再撤）。
 *
 * 【为什么加「评估中」】做了分派就必须有它：分派把活指给了某个人，
 * 这条记录从"谁都可以拿"变成"张三正在办"。少了这一态，队列上看不出
 * 哪些已经有人在盯——而这正是分派要解决的问题本身。
 *
 * 【连带的口径变化】看板「待评估总数」＝ **待分派 + 评估中**（§7 B1），
 * 不再等于单一状态的条数。
 */
export type ReportStatus = '待分派' | '评估中' | '已评估' | '已撤回';

export interface ReportAssessment {
  decision: AssessDecision;
  /**
   * 不升级 → 反馈意见；接管 → 接管说明。两个决策各自的必填文本，
   * 用词不同故不能共用一个「备注」——反馈意见是给报备人的处理建议，
   * 接管说明是给新单承接人的交代。
   */
  advice: string;
  /**
   * 接管派生出的**新投诉单号**（仅决策＝「接管」时有值）。
   *
   * 【为什么这里存的是单号而不是风险等级】二选一之后**没有"确认有风险 + 定级"这一档**了，
   * 评估不再产出等级、也不再往工单的风险字段回传。接管产出的是**一张新单**——
   * 走的是《【830】》已有的第一跳派生（原单落终态「已升级投诉」、整页只读 + 接管横幅、
   * 新单全量继承），**不新增动作、不新增状态**（基线 ※29）。
   */
  escalatedToNo?: string;
  by: string;
  byRole: string;
  at: string;
}

export interface RiskReport {
  id: string;
  ticketNo: string;
  /** 监控来源。二线报备之外的四类由系统自动入队，没有报备人填的那几个字段 */
  source: MonitorSource;
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
  /** 提交时刻。等待时长从这里起算，**不从任何"分派时刻"**（不做分派，§9 规则 11） */
  at: string;
  status: ReportStatus;
  assessment?: ReportAssessment;
  /** 仅 status ＝「已撤回」时有值 */
  withdrawReason?: string;
}

/*
 * ⚠️ **已删除 `TicketRiskAssessment` 及 `ticketAssessmentOf` / `ticketAssessmentNoteOf`**
 * （2026-09-09 第二轮拍板 N1 的连带）。
 *
 * 它们是"评估结论按 915 §7.3 回传工单风险字段"那条链路的取值口。二选一之后
 * **没有「确认有风险 + 定级」这一档了** —— 评估不再产出风险等级，那条回传链路失去前提：
 * - 「不升级」→ 工单**一字不写**；
 * - 「接管」→ 产出的是**一张新单**（走 830 已有的第一跳派生），不是往原单写字段。
 *
 * 保留一个空壳读口只会让调用方以为还有结论可回传。要看接管去向，读
 * `ReportAssessment.escalatedToNo`。
 */
/**
 * 报备评估时限（分钟）。**不是 SLA**：不接 SLA 引擎、不走工作日历、不适用停表规则
 * （§9 规则 13）。这一个值同时供两处读：《【815】》的催办规则触发条件，
 * 与风险评估页签「超时未评」卡的标红阈值（§9 规则 14）。
 */
export const REPORT_ASSESS_LIMIT_MIN = 120;

/**
 * 预置数据的时刻一律**相对当前时间**生成，不写死日期。
 *
 * 【为什么】写死的话，① 换一天打开，「今日已评估」与「已评估默认只看今日」这两个
 * 按自然日切的口径就恒为 0，看不到已评估的样子；② 更糟的是写死的时刻可能**晚于当前**，
 * 等待时长被 `Math.max(0, …)` 夹成"已等待 0 分钟"，看着像功能坏了。
 * 相对生成后，任何一天打开都是同一副样子。
 */
function agoStamp(minutesAgo: number) {
  const d = new Date(Date.now() - minutesAgo * 60000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 预置数据：挂在几张**非投诉单**上 —— 风险报备只在咨询 / 建议 / 商机（§1.2a） */
const SEED: RiskReport[] = [
  // —— 二线报备（有报备原因 / 风险类型 / 场景描述 / 附件）——
  {
    id: 'rr-001',
    ticketNo: 'IFLYZX-20260610-00004',
    source: '二线报备',
    reason: '风险场景',
    category: '监管风险',
    desc: '客户在第三通来电中反复提到"这事你们不给说法我就去有关部门反映"，情绪较激动，且提到已经拍了照片。本单是咨询单，暂未升级为投诉，拿不准要不要提前介入。',
    attachments: ['第三通通话录音片段.mp3'],
    by: '林晓东',
    byRole: '二线专员',
    // 45 分钟前：未超时，演示「待分派」这一态
    at: agoStamp(45),
    status: '待分派',
  },
  {
    id: 'rr-002',
    ticketNo: 'IFLYZX-20260610-00005',
    source: '二线报备',
    reason: '客户要求升级',
    category: null,
    desc: '客户明确说"叫你们领导来跟我讲"，当时判断是情绪话，先做了安抚。',
    attachments: [],
    by: '林晓东',
    byRole: '二线专员',
    at: agoStamp(90),
    status: '已评估',
    assignee: '李文萍',
    assessment: {
      decision: '不升级',
      advice: '客户情绪可安抚，当前咨询单处理路径足够；建议当日内回电明确处理节点并在处理记录留痕。',
      by: '李文萍',
      byRole: '客诉专员',
      // 评估时刻落在今日：否则「今日已评估」与「已评估默认只看今日」两处恒为 0
      at: agoStamp(50),
    },
  },
  {
    id: 'rr-003',
    ticketNo: 'IFLYZX-20260610-00009',
    source: '二线报备',
    reason: '风险场景',
    category: '群体性风险',
    desc: '同一小区已有三位客户就同一批次设备反馈同类故障，客户之间互相认识并提到"要一起去反映"。',
    attachments: [],
    by: '周敏',
    byRole: '二线专员',
    // 3 小时前：已过 2 小时时限，演示「超时未评」的标红与计数
    at: agoStamp(180),
    status: '待分派',
  },
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
  {
    id: 'rr-007',
    ticketNo: 'IFLYSJ-20260610-00006',
    source: '二线报备',
    reason: '风险场景',
    category: '舆情风险',
    desc: '客户为教育行业重点客户，接口限流卡住开学季批量导入，通话中提到会把这事在行业交流群里说一说。判断有对外扩散的可能，先报备。',
    attachments: [],
    by: '林晓东',
    byRole: '二线专员',
    // 撤回前等了 2.5 小时。已撤回不进 B1/B2，故这个时长不会把「超时未评」算大
    at: agoStamp(150),
    status: '已撤回',
    withdrawReason: '开放平台已临时提额并当场恢复导入，客户明确表示不再对外说明；风险已解除，本条报备由报备人撤回。',
  },
  /*
   * 「关键词触发」样本。**必须有**：五类来源里只有它走**核实打标**那一套弹窗
   * （其余四类走评估，O16），少了它，"按来源分流"这条最关键的分支在页面上一次都跑不出来。
   * ⚠️ `ticketNo` 必须挑一张**确有风险词命中**的单（见 `mock/opsReport.ts` 的 RiskHit），
   * 否则点「核实」会落到"本单找不到未核实的命中"那条兜底提示上。
   */
  {
    id: 'rr-000',
    // ⚠️ 曾写成 `IFLYZX-20260804-00001` —— 该号**全库不存在**（只出现在别处的通知正文里）。
    // 命中表（`mock/opsReport.ts`）里**真实存在于 tickets.ts** 的只有三张，均为投诉单；
    // 这里取 ops-1，并与 rr-004 分开挂，避免撞上"同单至多一条在队"。
    ticketNo: 'IFLYTS-20260731-00001',
    source: '关键词触发',
    reason: '其他',
    category: null,
    desc: '沟通记录命中风险词，已自动纳入监控范围（无须报备）。',
    attachments: [],
    by: '系统',
    byRole: '系统',
    at: agoStamp(65),
    status: '待分派',
  },
  // —— 系统自动入队的三类来源：没有报备人填的那几个字段，故 reason 取兜底、category 为空 ——
  /*
   * ⚠️ 工单号必须是 `mock/tickets.ts` 里**真实存在**且**类型对得上**的单，
   * 否则队列上点进去就是空白 —— 本条曾写成 `IFLYZX-20260617-00001`（ZX＝咨询前缀、
   * 且全库不存在），既违反"全量投诉必须挂投诉单"，也点不进去。
   * 现改挂 t1『无线音乐播放跳过歌曲异常』，投诉单、真实存在。
   */
  {
    id: 'rr-004',
    ticketNo: 'IFLYTS-20260610-00002',
    source: '全量投诉',
    reason: '其他',
    category: null,
    desc: '投诉类工单自动纳入监控范围（无须报备）。',
    attachments: [],
    by: '系统',
    byRole: '系统',
    at: agoStamp(20),
    status: '待分派',
  },
  {
    id: 'rr-005',
    ticketNo: 'IFLYZX-20260610-00005',
    source: 'VIP客户',
    reason: '其他',
    category: null,
    desc: 'VIP 客户工单自动纳入监控范围（无须报备）。',
    attachments: [],
    by: '系统',
    byRole: '系统',
    at: agoStamp(240),
    status: '评估中',
    assignee: '吴投诉',
  },
  /*
   * 「紧急重要」样本。**必须有这一条**：五类监控来源里只有它一条样本都没有，
   * 于是来源 chip 行第三枚恒为 0、按「监控来源」列筛选与排序时它永远是空的 ——
   * 「**五类合一个队列**」（N6 / N8）这条口径在页面上就少了五分之一的证据。
   *
   * 挑这张单是因为它自己就是「紧急重要」的判据本身：P0 + 已超解决时限 41 小时 +
   * 影响校端批量业务，不需要另讲一个故事来解释它为什么会被自动捞进来。
   */
  {
    id: 'rr-008',
    ticketNo: 'IFLYZX-20260802-00002',
    source: '紧急重要',
    reason: '其他',
    category: null,
    desc: 'P0 工单且已超解决时限，影响客户批量业务，自动纳入监控范围（无须报备）。',
    attachments: [],
    by: '系统',
    byRole: '系统',
    // 35 分钟前：未超时，与 rr-003 的超时态形成对照，两态在同一张表上同时可见
    at: agoStamp(35),
    status: '待分派',
  },
  /*
   * 「接管」样本。**必须有这一条**：SEED 里若只有「不升级」，接管那条分支
   * （派生新单号、原单落终态、Tab 上的「已派生投诉工单」标）在页面上一次都跑不出来，
   * 要看只能自己去评一条 —— 而演示与走查恰恰最需要它一开屏就在。
   */
  /*
   * ⚠️ 本条原来的两个号**都是编的**：`IFLYZX-20260610-00006`（全库不存在）与
   * `IFLYTS-20260909-00007`（全库不存在）。于是"派生投诉单"那一列点进去落空，
   * 恰恰把这条样本最该证明的东西证伪了。
   *
   * 现改挂 mock 里**现成的第一跳成对样本**：
   * 原单 `IFLYZX-20260707-00001`（咨询）→ 派生 `IFLYTS-20260709-00001`（t40，投诉，
   * 其 `escalatedFromNo` 正指回原单）。两个号都真实存在、且互相指得回去，
   * 点「派生投诉单」能落到一张真单上。
   *
   * 这条演示的是 **O17 的第一跳**：非投诉单接管 → 原单落「已升级投诉」。
   * 第二跳（投诉单接管 → 已升级外投）由 rr-009 演示，两条对照着看。
   */
  {
    id: 'rr-006',
    ticketNo: 'IFLYZX-20260707-00001',
    source: '二线报备',
    reason: '客户要求升级',
    category: null,
    desc: '客户连续两日致电，明确要求"给个说法否则去平台曝光"，并已在社交平台发帖。二线判断已超出常规咨询处理范围。',
    attachments: ['客户发帖截图.png'],
    by: '周敏',
    byRole: '二线专员',
    at: agoStamp(300),
    status: '已评估',
    assignee: '吴投诉',
    assessment: {
      decision: '接管',
      advice: '客户已在公开平台发声，具备外投与舆情双重风险，转投诉流程由客诉专员跟进；原单沟通记录与附件已随新单继承。',
      escalatedToNo: 'IFLYTS-20260709-00001',
      by: '吴投诉',
      byRole: '客诉专员',
      at: agoStamp(280),
    },
  },
  /*
   * 「投诉单上的接管」样本。**必须有这一条**：它演示的是 O17 的**第二跳**。
   *
   * 上面 rr-006 演的是**第一跳**——原单是**咨询单**（非投诉），接管后原单落「已升级投诉」，
   * 派生的是一张**投诉单**。本条原单本身就**已经是投诉单**，接管落到《【830】》的**第二跳**
   * （内投 → 外投）：原单落「**已升级外投**」，派生的是一张**外投单**。
   * 两跳同一个「接管」按钮、同一段评估流程，**区别只在原单是不是投诉单** ——
   * 客诉专员不选跳数，跳数由原单阶层算出来（`complaintEscalation.ts` 的 tier 判定）。
   * 这正是 O17 说的"落到哪一跳交给 830 既有规则，**不新增动作、不新增状态**"。
   *
   * ⚠️ **外投单没有自己的号段**：外投＝工单类型仍是「投诉」+ 工单来源＝「外投渠道」，
   * 所以前缀照样是 IFLYTS（`constants/ticketNo.ts` 只有 ZX/TS/JY/SJ 四个前缀）。
   * 这里的一对单号取的是 mock 里现成的第二跳成对样本：
   * 原单 `IFLYTS-20260711-00001`（已带 `escalatedToNo`、slaSub＝「已升级外投·停表」）
   * → 外投新单 `IFLYTS-20260711-00002`（title 带「外投·」前缀、`escalatedFromNo` 指回原单、
   * 来源＝外投渠道）。用现成的这一对，「派生投诉单」列点进去才落在一张**真的外投单**上，
   * 而不是一个查无此单的号。
   */
  {
    id: 'rr-009',
    ticketNo: 'IFLYTS-20260711-00001',
    source: '全量投诉',
    reason: '其他',
    category: null,
    desc: '投诉类工单自动纳入监控范围（无须报备）。客户维修超期未解决并已向监管平台反映。',
    attachments: [],
    by: '系统',
    byRole: '系统',
    at: agoStamp(190),
    status: '已评估',
    assignee: '吴投诉',
    assessment: {
      decision: '接管',
      advice: '客户已向监管平台正式登记，须按外投口径限时答复并留存全过程记录；本单转外投由客诉专员承接，原单沟通记录、附件与投诉分类随新单继承。',
      // 第二跳派生的**外投单**：类型仍是投诉、来源＝外投渠道，故前缀同为 IFLYTS
      escalatedToNo: 'IFLYTS-20260711-00002',
      by: '吴投诉',
      byRole: '客诉专员',
      // 评估时刻落在今日：否则 B3「今日已评估」与 B4 决策分布数不到它
      at: agoStamp(160),
    },
  },
];

export const useRiskReportStore = defineStore('riskReports', () => {
  const reports = ref<RiskReport[]>(SEED.map((r) => ({ ...r })));
  /** 自增序号只用来造 id，不参与任何业务判断 */
  const seq = ref(SEED.length);

  /** 本单的全部报备（含已撤回），时间倒序 —— 仅评估弹窗「本单另有」等场景用 */
  function reportsOf(ticketNo: string) {
    return reports.value
      .filter((r) => r.ticketNo === ticketNo)
      .slice()
      .sort((a, b) => b.at.localeCompare(a.at));
  }

  /**
   * 本单当前那条待评估的报备。
   *
   * 🔴 **在队的至多一条，历史条数不限**（PRD §9 规则 12 / D7）：拦的是"两条同时在队"，
   * 不是"这张单一辈子只能报一次"。评估完 / 撤回后照常可以再报，次数不限 ——
   * 这是纠错的唯一路径（评估结论不可改，§9 规则 22），也是"按建议处理后仍未闭环"
   * 这个场景（§2.3 V1）的出口。返回单个对象而不是数组，类型本身就把"不会有两条"写死。
   */
  function pendingOf(ticketNo: string) {
    return reports.value.find((r) => r.ticketNo === ticketNo && isOpen(r)) ?? null;
  }

  /** 本单是否还能发起报备：只看在队（待分派 / 评估中），不看历史 */
  function canSubmitFor(ticketNo: string) {
    return !pendingOf(ticketNo);
  }

  /**
   * 本单的历史报备（已评估 + 已撤回），时间倒序。
   * **不含在队那条** —— 它在界面上单独占一块（在队提示条 + 只读卡），进列表会重复。
   */
  function historyOf(ticketNo: string) {
    return reportsOf(ticketNo).filter((r) => !isOpen(r));
  }

  /**
   * 工单的「报备中」标记（§3.2）。**纯派生、不落库**：有没有这个标记，
   * 完全等于"本单有没有一条**在队**的报备"，人不直接操作它。
   * 【为什么含「评估中」】对报备人而言"报上去了、还没有结论"是同一件事，
   * 内部分派到谁与他无关；只认「待分派」的话，一分派横幅就没了，看着像结论已经出来了。
   */
  function isReporting(ticketNo: string) {
    return !!pendingOf(ticketNo);
  }

  /**
   * **在队 ＝ 待分派 + 评估中**（N4）。这是"还没有结论"的全集，
   * 看板 B1、同单在队门控、「报备中」标记三处共用它，不各判各的。
   */
  function isOpen(r: RiskReport) {
    return r.status === '待分派' || r.status === '评估中';
  }

  /** 在队全集，按**等待时长降序**＝提交时刻正序（§5.3 元素 ④），等最久的在最上 */
  const openQueue = computed(() =>
    reports.value.filter(isOpen).slice().sort((a, b) => a.at.localeCompare(b.at)),
  );
  /** 待分派：督导要分的就是这一批 */
  const unassignedQueue = computed(() => openQueue.value.filter((r) => r.status === '待分派'));
  /** 评估中：已有人认领、等结论 */
  const assigningQueue = computed(() => openQueue.value.filter((r) => r.status === '评估中'));

  /** **B1 待评估总数 ＝ 待分派 + 评估中**（§7，N4 改口径）。已撤回的不进任何一个数 */
  const openCount = computed(() => openQueue.value.length);

  /**
   * ⚠️ 兼容别名，指向同一个数。
   * 【为什么保留】旧名 `pendingQueue` / `pendingCount` 在两个页面里有调用点；
   * 直接改名会让漏改的地方**静默取到 undefined**（Pinia 不报错），
   * 那比留一个别名危险得多。新代码一律用 `openQueue` / `openCount`。
   */
  const pendingQueue = openQueue;
  const pendingCount = openCount;

  /**
   * 等待时长（分钟）＝ 当前时刻 − **报备提交时刻**。
   * 🔴 **不从分派时刻起算**（N5，第二轮拍板里唯一没变的一条）：
   * 对报备人而言"我等了多久"与内部何时分派无关；**分派慢的压力应当落在督导身上**，
   * 从分派起算等于把这段空悬时间从账上抹掉。
   */
  function waitedMinutes(at: string) {
    const t = new Date(at.replace(/-/g, '/')).getTime();
    if (Number.isNaN(t)) return 0;
    return Math.max(0, Math.floor((Date.now() - t) / 60000));
  }

  /** 是否超时未评：**在队**且等待时长 > 时限。不是 SLA，不走工作日历、不停表 */
  function isOverdue(r: RiskReport) {
    return isOpen(r) && waitedMinutes(r.at) > REPORT_ASSESS_LIMIT_MIN;
  }

  /** B2 超时未评数（§7）。B1 ≥ B2 恒成立——超时的一定还在队里 */
  const overdueCount = computed(() => openQueue.value.filter(isOverdue).length);

  /** 已评估清单，评估时刻倒序 */
  const assessedList = computed(() =>
    reports.value
      .filter((r) => r.status === '已评估' && r.assessment)
      .slice()
      .sort((a, b) => (b.assessment?.at ?? '').localeCompare(a.assessment?.at ?? '')),
  );

  /** 今天（自然日 00:00 起）。字符串前缀比对，避免再造一次时区换算 */
  function todayPrefix() {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }

  /** B3 今日已评估报备数（§7）。按**评估时刻**落在今日算，不按报备时刻 */
  const assessedTodayCount = computed(
    () => assessedList.value.filter((r) => (r.assessment?.at ?? '').startsWith(todayPrefix())).length,
  );

  /**
   * B4 评估决策分布（§7）。窗口＝自然日，与 B3 同一批，
   * 故 `B3 = B4 两档之和` 这条恒等式天然成立。
   */
  const decisionCounts = computed(() => {
    const base: Record<AssessDecision, number> = { 不升级: 0, 接管: 0 };
    const today = todayPrefix();
    for (const r of assessedList.value) {
      if (!r.assessment || !r.assessment.at.startsWith(today)) continue;
      base[r.assessment.decision] += 1;
    }
    return base;
  });

  /** 二线报备提交，落「待分派」。系统自动入队的四类来源不走这里 */
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
    return report;
  }

  /**
   * 分派 / 改派（930 §5，O18）：把条目指给某个客诉专员，转「评估中」。
   * 批量对每个 id 调一次即可，不另写批量函数——批量与单条规则完全一样，
   * 分两套实现迟早只改一处。
   *
   * 🔴 **可改派**（O18 拍板）：已在「评估中」的也能重指给别人。
   * 【为什么允许】评估人请假 / 离职 / 手上堆太多，这活儿必须能挪；
   * 不允许改派的话唯一出路是"等它评完"，而它正卡在一个不在岗的人手上——
   * 而这条队列现在卡的是**投诉立项**（※8a），堵不起。
   * 【与「调剂」的分界】改派动的是**报备单**（谁去评），调剂动的是**工单**（谁来办），
   * 两件事、两个词，不要混（基线 ※29）。
   *
   * **已评估 / 已撤回的不能再派** —— 活已经干完或作废了。
   */
  function assign(id: string, assignee: string) {
    const r = reports.value.find((x) => x.id === id);
    if (!r || !isOpen(r)) return false;
    r.status = '评估中';
    r.assignee = assignee;
    return true;
  }

  /**
   * 自取（O18）：客诉专员从待分派里自领一条，转「评估中」并落在自己名下。
   *
   * 【为什么要有它】只留"督导指派"这一条路时，**督导就是单点**——他不在岗，
   * 队列谁也动不了，而堵住的是投诉立项（※8a）。自取与指派**双轨**，
   * 与基线「领取 / 指派」是同一副骨架（※15）：领取＝自取无主的，指派＝派给指定的人。
   *
   * **只能自领待分派的**：已在别人名下的要换人走改派，不是自己伸手拿。
   */
  function claim(id: string, assignee: string) {
    const r = reports.value.find((x) => x.id === id);
    if (!r || r.status !== '待分派') return false;
    r.status = '评估中';
    r.assignee = assignee;
    return true;
  }

  /**
   * 撤回：**仅待分派、仅本人**（调用方判"本人"）。**不删除**，转「已撤回」并留原因（§4.8）。
   * 【为什么分派后不能撤】活已经指给人了，这时候抽走等于让评估人白读一遍；
   * 分派之后要纠错，走"评完再报一次"。
   */
  function withdraw(id: string, reason: string) {
    const r = reports.value.find((x) => x.id === id);
    if (!r || r.status !== '待分派') return;
    r.status = '已撤回';
    r.withdrawReason = reason;
  }

  /**
   * 评估：一条报备单最多一条评估记录，**提交即固化不可改**（§9 规则 22）。
   * **必须先分派**——没人认领的条目谈不上"谁给的结论"。
   */
  function assess(id: string, assessment: ReportAssessment) {
    const r = reports.value.find((x) => x.id === id);
    if (!r || r.status !== '评估中') return;
    r.status = '已评估';
    r.assessment = assessment;
  }

  /** 最新已评估结论的可读一行（工单页只读回显；二选一后无风险等级，展示决策 + 评估人 + 时刻） */
  function assessmentNoteOf(ticketNo: string): string {
    const latest = reportsOf(ticketNo).find((r) => r.status === '已评估' && r.assessment);
    if (!latest?.assessment) return '';
    const a = latest.assessment;
    if (a.decision === '接管' && a.escalatedToNo) {
      return `风险评估：接管 → ${a.escalatedToNo} · ${a.by}（${a.byRole}）· ${a.at}`;
    }
    return `风险评估：${a.decision} · ${a.by}（${a.byRole}）· ${a.at}`;
  }

  return {
    reports,
    reportsOf,
    canSubmitFor,
    historyOf,
    pendingOf,
    waitedMinutes,
    isOverdue,
    overdueCount,
    assessedList,
    assessedTodayCount,
    decisionCounts,
    isReporting,
    openQueue,
    unassignedQueue,
    assigningQueue,
    openCount,
    pendingQueue,
    pendingCount,
    submit,
    assign,
    claim,
    withdraw,
    assess,
    assessmentNoteOf,
  };
});
