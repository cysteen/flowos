import { computed, ref, watch } from 'vue';
import { defineStore } from 'pinia';
import { RISK_LEVELS, riskLevelText, type RiskLevel } from '@/config/risk';
import type { RiskFlag } from '@/views/tickets/types/operation';
import { useNotifyLogStore } from '@/stores/notifyLog';

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
  /**
   * 来源＝「关键词触发」这一路的结论（O16）。它要的是 915 的「成立 / 误报 + 定级」，
   * 不是评估的二选一，故**不占 `assessment`**：两个字段都存进 `assessment` 会让
   * 「今日决策」的分母混进一批答的根本不是"升不升"的条目。
   *
   * 🔴 **有 `verify` 不等于已出池**（方案 C，见 `recordVerify`）：
   * 核实**误报**的落「已评估」出池；核实**成立**的退回「待分派」继续走评估，
   * 那一刻它既有 `verify` 又还在队里。判"结没结"一律看 `status`，不要拿本字段当完结标志。
   *
   * 成立后 `verify` 一直留着，评估弹窗第一区块要读它——客诉专员得先知道
   * "监控为什么判它有风险"（成立 · 等级 · 命中原话 · 核实人 · 核实时刻），才谈得上升不升级。
   */
  verify?: ReportVerify;
  /** 仅 status ＝「已撤回」时有值 */
  withdrawReason?: string;
}

/** 「关键词触发」条目的核实结论。字段与 915 打标弹窗逐一对应 */
export interface ReportVerify {
  verdict: '成立' | '误报';
  /** 误报没有等级 */
  level: RiskLevel | null;
  note: string;
  by: string;
  byRole: string;
  at: string;
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
    // ⚠️ 工单号有两条硬约束，缺一条这一行就点不出东西：
    //   ① 必须真实存在于 `mock/tickets.ts`，否则队列上点单号落在空白页；
    //   ② 它在命中表（`mock/opsReport.ts`）里的那条命中**必须还没核实**——本行的按钮是「核实」，
    //      点开的是 915 的打标弹窗；命中若已打过标，只会弹一句"已全部核实"，这条路演不出来。
    // `IFLYTS-20260731-00001` 曾写在这里，但它的命中 h5 是 `tagged: '高'`（已核实），正是②的反例。
    // 现取 h1『无线音乐播放跳过歌曲异常』：投诉单、真实存在、命中未核实。
    ticketNo: 'IFLYTS-20260610-00002',
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
  /*
   * 「关键词触发 · 核实成立后待评估」样本。**必须有这一条**：它是方案 C 的那半条链。
   *
   * rr-000 演示的是链的前半段（命中入池 → 待核实）；核实**成立**之后条目不出池、
   * 退回「待分派」继续走分派 / 自取 → 评估，与其余四类来源同构。少了这一条样本，
   * "成立的关键词条目也要走评估"只能靠现场打一次标才看得到，而打标要挑对命中、
   * 挑错就落到"已全部核实"的兜底提示上——评审时这条链多半跑不出来。
   *
   * 它同时钉住三处口径：① 行内按钮此时是「评估」而不是「核实」（判据是
   * `verify.verdict === '成立'`，不是来源）；② 它重新计进 B1「待评估总数」的在队集合；
   * ③ 它**不在**「已处理」视图里——那张表只收 `status === '已评估'`，成立的还没有结论。
   *
   * ⚠️ 工单号的两条硬约束与 rr-000 同源，但②那一条**恰好相反**：
   *   ① 必须真实存在于 `mock/tickets.ts`——`IFLYTS-20260731-00001` 是 `ops-1`（投诉、P0、
   *      VIP、已超解决时限 96 小时），真实存在；
   *   ② 它在命中表（`mock/opsReport.ts`）里的那条命中 `h5`（风险词「起诉」、催补记录）
   *      **已经核实过**：`tagged: '高'` + `verdict: '成立'`，核实人郑监控（投诉督导）。
   *      rr-000 要的是未核实的命中，故这张单是那边的反例、却正是这边要的——
   *      本条的 `verify` 即照抄 h5 的这份结论，两处读出来是同一个判断。
   * 时刻只把绝对日期换成相对时刻（种子一律相对当前生成，见 `agoStamp`）：
   * 命中入池 110 分钟前、核实 95 分钟前，核实必在入池之后。
   */
  {
    id: 'rr-010',
    ticketNo: 'IFLYTS-20260731-00001',
    source: '关键词触发',
    reason: '其他',
    category: null,
    desc: '沟通记录命中风险词，已自动纳入监控范围（无须报备）。',
    attachments: [],
    by: '系统',
    byRole: '系统',
    // 110 分钟前：未过 120 分钟时限，故它在队却不标红——刚核实完就满屏红会盖掉真正超时的那几条
    at: agoStamp(110),
    status: '待分派',
    verify: {
      verdict: '成立',
      level: '高',
      note: '同一客户第二次命中高危词，已上报法务',
      by: '郑监控',
      byRole: '投诉督导',
      at: agoStamp(95),
    },
  },
  // —— 系统自动入队的三类来源：没有报备人填的那几个字段，故 reason 取兜底、category 为空 ——
  /*
   * ⚠️ 工单号必须是 `mock/tickets.ts` 里**真实存在**且**类型对得上**的单，
   * 否则队列上点进去就是空白 —— 本条曾写成 `IFLYZX-20260617-00001`（ZX＝咨询前缀、
   * 且全库不存在），既违反"全量投诉必须挂投诉单"，也点不进去。
   * 现改挂 t5『收到商品与描述不符，申请退货』，投诉单、真实存在，且与 rr-000 分开挂，
   * 避开"同单至多一条在队"。
   */
  {
    id: 'rr-004',
    ticketNo: 'IFLYTS-20260610-00007',
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
   * 「投诉单上的接管」样本。**必须有这一条**：它是接管按原单类型分流的另一半（O20）。
   *
   * 上面 rr-006 的原单是**咨询单**（非投诉）：接管后原单落「已升级投诉」并**派生**一张投诉单。
   * 本条原单**本身就是投诉单**：接管走基线 ※27「**工单管控**」——把这张单拿到客诉专员名下，
   * **本单状态不变、不派生新单**，故 `escalatedToNo` 留空、队列「派生投诉单」列显示「—」。
   *
   * 🔴 **不要再给它填 `escalatedToNo`**：O17 原定的"投诉单走 830 第二跳（内投→外投）"已被 O20 推翻。
   * 第二跳只走内投→外投，来源＝热线 / IM / 小程序的投诉单入口本就置灰，客诉专员点不动；
   * 硬派生一张外投单等于在客户根本没有外投时造一张外投单，会把外投量与外投口径系统性抬高。
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
      advice: '客户已向监管平台正式登记，须限时答复并留存全过程记录。本单已是投诉单，由我执行「工单管控」接手，本单状态不变、不另开新单。',
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

  /**
   * 落 localStorage（与 `stores/ticketDrafts.ts` 同一套写法）。
   *
   * 本模块的闭环**天然跨角色**：二线专员报、投诉督导分派、客诉专员评、结论再回到二线看。
   * 演示时这四步要换四次登录，纯内存态下每换一次前面做的全部归零——报完切过去队列是空的，
   * 评完切回来结论不在。持久化之后这条链才走得完。
   *
   * 存的是**整份报备**（含结论），不是增量：报备量级只有几十条，整存整取比对账简单，
   * 也不会出现"补丁漏打一处、两边各存一半"。
   *
   * 🔴 **缓存有保质期（`STALE_MS`）**：种子的提交时刻由 `agoStamp()` 按"打开页面那一刻"
   * 倒推生成，落进 localStorage 之后就固化成绝对时刻。隔一夜再打开，这批种子的等待时长
   * 会累积成十几个小时，**整队全部判超时**——满屏红，超时未评的数等于在队总数，
   * 这个指标就再也演示不出"有的超时、有的没超"的差别了。
   * 因此超过保质期直接丢弃缓存回到种子；保质期内（同一场演示）照常续用。
   */
  const LS_KEY = 'flowos-risk-reports';
  const STALE_MS = 12 * 60 * 60 * 1000;
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as { reports: RiskReport[]; seq: number; savedAt?: number };
      const fresh = typeof saved?.savedAt === 'number' && Date.now() - saved.savedAt < STALE_MS;
      if (fresh && Array.isArray(saved?.reports) && saved.reports.length) {
        reports.value = saved.reports;
        seq.value = typeof saved.seq === 'number' ? saved.seq : saved.reports.length;
      } else {
        // 过期或来自没有 savedAt 的旧版本：清掉，免得下次又读到同一份陈数据
        localStorage.removeItem(LS_KEY);
      }
    }
  } catch {
    /* 解析失败就用种子，不让一份坏缓存把页面打空 */
  }
  watch(
    [reports, seq],
    () => {
      try {
        localStorage.setItem(
          LS_KEY,
          JSON.stringify({ reports: reports.value, seq: seq.value, savedAt: Date.now() }),
        );
      } catch {
        /* 配额超限等忽略 */
      }
    },
    { deep: true },
  );
  /** 报备五个事件的通知落点（O22）。工单页「通知记录」Tab 从这里读运行时那批 */
  const notifyLog = useNotifyLogStore();

  /**
   * 走字的"当前时刻"。等待时长 / 超时判定 / 超时计数**一律读它**，不直接读 `Date.now()`。
   *
   * 【为什么要有它】`Date.now()` 不是响应式的：屏幕上的「已等待 47 分钟」只在
   * 切页签或别的数据变动触发重渲染时才更新，人盯着队列看，数字十几分钟不动，
   * 看着就像功能坏了 —— 而「超时未评」正是本册的核心口径之一（§7 B2）。
   *
   * 【为什么是 60 秒】等待时长的**展示粒度就是分钟**：更密（如 1s）改的是同一个数字，
   * 白白重算整张队列；更疏（如 5min）会出现"已经过了一分钟、屏上还是旧数"的空窗，
   * 反倒坐实了"是不是卡住了"的怀疑。刻度多久跳一次，钟就多久走一格。
   *
   * 【为什么 interval 只建一次、也不清】store 是 Pinia 单例，setup 体在应用生命周期内
   * 只跑一次，定时器随之只建一次 —— 放进 `waitedMinutes` 里就会每调一次建一个。
   * 它也**不该用 `onUnmounted` 清**：store 不是组件，没有卸载时机；
   * 这个钟与应用同生命周期，应用没了它自然一起没了。
   */
  const nowTick = ref(Date.now());
  setInterval(() => {
    nowTick.value = Date.now();
  }, 60_000);

  /* ---------------- 报备通知的收件人解析（O22 / O23） ---------------- */

  /**
   * 投诉督导。**按角色而不是按人**：分派职责挂在岗位上，谁在岗谁收，
   * 不能写死某个人名 —— 他休假那天这条队列就没人管了。
   */
  const SUPERVISOR = '投诉督导';

  /**
   * 承办人 ＝ 报备单当前的评估人。**未分派时解析为空**，由 O23 的类型级规则跳过这一类。
   * 这不是异常，是待分派态的常态。
   */
  function assigneeReceiver(r: RiskReport) {
    return r.assignee ? `${r.assignee}(客诉专员)` : '';
  }

  /**
   * 报备人。系统自动入队的四类来源（全量投诉 / VIP客户 / 紧急重要 / 关键词触发）
   * 的 `by` 是「系统」——**没有人可通知**，解析为空、这一类跳过，
   * 而不是给一个叫「系统」的收件人发一封没人看的信。
   */
  function reporterReceiver(r: RiskReport) {
    return r.byRole === '系统' || r.by === '系统' ? '' : `${r.by}(${r.byRole})`;
  }

  /** 报备原因一行，通知正文里用来交代"为什么报"，省得收件人先点进单子才知道是什么事 */
  function reasonLine(r: RiskReport) {
    return r.category ? `${r.reason} · ${r.category}` : r.reason;
  }

  /**
   * 把人填的自由文本（撤回原因 / 反馈意见）接进正文时补一个句号。
   * 填的人有的带句号有的不带，不收这一道，正文里会出现「原因：已恢复 该条报备…」这种粘连句。
   */
  function asSentence(text: string) {
    const t = text.trim();
    if (!t) return '';
    return /[。！？.!?]$/.test(t) ? t : `${t}。`;
  }

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
   *
   * 读的是**走字的 `nowTick`** 而不是 `Date.now()`：后者不响应式，屏上的分钟数会停住
   * （见 `nowTick` 处的说明）。`isOverdue` / `overdueCount` 经由本函数一并跟着走。
   *
   * ⚠️ **方案 C 的连带**：关键词条目核实成立后退回队列，等待时长**仍从入池那一刻起算**，
   * 不从打标时刻。若那条命中在池子里已经躺过 2 小时才被核实，它一退回来就是超时态。
   * 这是 N5 的直接推论而不是缺陷：核实慢也是这条队列在拖，钟不该因为换了个环节就重置。
   * 口径按 N5 保持不动。
   */
  function waitedMinutes(at: string) {
    const t = new Date(at.replace(/-/g, '/')).getTime();
    if (Number.isNaN(t)) return 0;
    return Math.max(0, Math.floor((nowTick.value - t) / 60000));
  }

  /** 是否超时未评：**在队**且等待时长 > 时限。不是 SLA，不走工作日历、不停表 */
  function isOverdue(r: RiskReport) {
    return isOpen(r) && waitedMinutes(r.at) > REPORT_ASSESS_LIMIT_MIN;
  }

  /** B2 超时未评数（§7）。B1 ≥ B2 恒成立——超时的一定还在队里 */
  const overdueCount = computed(() => openQueue.value.filter(isOverdue).length);

  /**
   * 走评估的四类来源（O16）。五类里只有「关键词触发」走核实打标，不进「风险评估」的分母——
   * 它的数已经在左栏「监控数据」里报过一次，两处相加会把同一条命中数成两条（§7 撞名）。
   *
   * ⚠️ 与页签角标的区别：角标取**队列条目总数**（五类），因为页签装的就是五类合一的队列；
   * 页头「风险评估」行取**四类**，因为它报的是评估这件事的进度。两个数本就不相等，界面上不互校。
   *
   * ⚠️ **方案 C 之后本判据仍按来源排除整条关键词那一路**，包括核实**成立**后退回队列、
   * 确实要走评估二选一的那些条目。B1~B4 因此仍不含这一路：口径没跟着流程一起改。
   * 后果是「风险评估」四卡与「风险工单池」页签角标的差值会随成立条目变大——
   * 两个数本就不相等、界面上也不互校，但差在哪里现在多了一种成因。
   */
  const goesToAssess = (r: RiskReport) => r.source !== '关键词触发';

  /** B1 待评估总数（四类来源）＝ 待分派 + 评估中 */
  const assessOpenCount = computed(() => openQueue.value.filter(goesToAssess).length);
  /** B1 的两个分项，界面上紧挨着 B1 摆，读得出 `待分派 + 评估中 ≡ B1` */
  const assessUnassignedCount = computed(
    () => unassignedQueue.value.filter(goesToAssess).length,
  );
  const assessAssigningCount = computed(() => assigningQueue.value.filter(goesToAssess).length);
  /** B2 超时未评（四类来源） */
  const assessOverdueCount = computed(
    () => openQueue.value.filter((r) => goesToAssess(r) && isOverdue(r)).length,
  );

  /** 结论时刻：走评估的取评估时刻，走核实打标的取核实时刻。两路共用一根时间轴排序 */
  function concludedAt(r: RiskReport) {
    return r.assessment?.at ?? r.verify?.at ?? '';
  }

  /**
   * 已评估清单，结论时刻倒序。
   * **两路都收**：走评估的有 `assessment`，走核实打标的有 `verify`（O16）。
   * 只认 `assessment` 的话，核实为误报的那一路打完标就卡在这张表外面，
   * 页签上却已经转「已评估」——列表与状态自己打自己。
   *
   * 🔴 **方案 C 之后走 `verify` 进这张表的只剩误报**：核实成立的退回「待分派」继续走评估，
   * `status` 不是「已评估」，它在这张表上**要等到评估给出结论（不升级 / 接管）才出现**，
   * 那时带的是 `assessment`。这不是漏收——成立的条目此刻确实还没有结论。
   */
  const assessedList = computed(() =>
    reports.value
      .filter((r) => r.status === '已评估' && (r.assessment || r.verify))
      .slice()
      .sort((a, b) => concludedAt(b).localeCompare(concludedAt(a))),
  );

  /** 今天（自然日 00:00 起）。字符串前缀比对，避免再造一次时区换算 */
  function todayPrefix() {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }

  /** B3 今日已评估报备数（§7）。按**评估时刻**落在今日算，不按报备时刻；分母同 B1，四类来源 */
  const assessedTodayCount = computed(
    () =>
      assessedList.value.filter(
        (r) => goesToAssess(r) && (r.assessment?.at ?? '').startsWith(todayPrefix()),
      ).length,
  );

  /**
   * B4 评估决策分布（§7）。窗口＝自然日，与 B3 同一批，
   * 故 `B3 = B4 两档之和` 这条恒等式天然成立。
   */
  const decisionCounts = computed(() => {
    const base: Record<AssessDecision, number> = { 不升级: 0, 接管: 0 };
    const today = todayPrefix();
    for (const r of assessedList.value) {
      if (!goesToAssess(r)) continue;
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
    // 报上来第一时间要惊动的是**投诉督导**：待分派这一段的责任人是他（分派归他做），
    // 而这条队列卡的是投诉立项，静悄悄躺在队列里等人主动来看是不行的。
    notifyLog.emit({
      ticketNo: report.ticketNo,
      event: 'risk.report.submitted',
      kind: 'risk',
      title: '风险报备待分派',
      receivers: [SUPERVISOR],
      content: `${report.ticketNo} 新增一条风险报备，报备原因：${reasonLine(report)}；报备人：${report.by}（${report.byRole}）。请及时分派客诉专员评估，评估时限 ${REPORT_ASSESS_LIMIT_MIN} 分钟（自报备提交时刻起算）。`,
    });
    return report;
  }

  /**
   * 分派 / 自取共用的一条通知：**告诉新承办人"这活儿归你了"**。
   * 两个动作发同一条是有意的 —— 对承办人而言"督导指给我"与"我自己领的"
   * 结果完全一样（单子进了我名下、时限照走），分两条文案只是让他多读一遍。
   */
  function notifyAssigned(r: RiskReport) {
    notifyLog.emit({
      ticketNo: r.ticketNo,
      event: 'risk.report.assigned',
      kind: 'risk',
      title: '风险报备待评估',
      receivers: [assigneeReceiver(r)],
      content: `${r.ticketNo} 的风险报备已由您承办，报备原因：${reasonLine(r)}；报备人：${r.by}（${r.byRole}）；提交时刻：${r.at}。请在提交后 ${REPORT_ASSESS_LIMIT_MIN} 分钟内给出评估结论（不升级 / 接管）。`,
    });
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
    // 改派前先记住原承办人：赋值之后就取不到了
    const prev = r.assignee;
    r.status = '评估中';
    r.assignee = assignee;
    notifyAssigned(r);
    // 改派时另发一条给**原承办人**（业务 2026-09-09 拍板）：
    // 他手上的活被抽走了，不告诉他，他会一直以为这条还等着自己评。
    // 只在"确实换了人"时发 —— 重复指给同一个人不算改派。
    if (prev && prev !== assignee) {
      notifyLog.emit({
        ticketNo: r.ticketNo,
        event: 'risk.report.reassigned',
        kind: 'risk',
        title: '风险报备已改派',
        receivers: [`${prev}(客诉专员)`],
        content: `${r.ticketNo} 的风险报备已改派给 ${assignee}，无需您再评估。报备原因：${reasonLine(r)}。`,
      });
    }
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
    // 自取的收件人是自己：留痕比"他自己知道"重要 —— 这条通知同时是
    // 「这单何时、被谁接走」的凭据，工单页的通知记录里查得到
    notifyAssigned(r);
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
    /*
     * 收件人配的是「投诉督导 + 承办人」两类，而**撤回只能发生在待分派态**，
     * 那一刻 `assignee` **必然为空** —— 这正是 O23 类型级判据的现场：
     * 按规则级（一类解析不到就整条不发）这条会被静默丢掉，督导那边队列里
     * 少了一条却不知道去哪了。这里让「承办人」这一类落空、督导照收。
     *
     * 「承办人」这一类仍然要配上：分派后能否撤回是可能变的口径，
     * 现在把它删掉，将来放开时又得回头补一遍收件人配置。
     */
    notifyLog.emit({
      ticketNo: r.ticketNo,
      event: 'risk.report.withdrawn',
      kind: 'risk',
      title: '风险报备已撤回',
      receivers: [SUPERVISOR, assigneeReceiver(r)],
      content: `${r.ticketNo} 的风险报备已由 ${r.by}（${r.byRole}）撤回，撤回原因：${asSentence(reason)}该条报备记录保留、不再进入待评估队列；如风险再现，本单可重新发起报备。`,
    });
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
    /*
     * 结论发回**报备人** —— 他报上来之后就再没有别的出口知道结果：
     * 「不升级」时他要按反馈意见继续办这张单，「接管」时他要知道单子已经不归他了。
     *
     * 系统自动入队的四类来源报备人是「系统」，这一类解析为空（O23）：
     * 这时没有别的收件人类型，整条不发 —— 不是丢消息，是本来就没有人在等这个结论。
     */
    const takeOver = assessment.decision === '接管';
    const tail = takeOver
      ? `本单已由客诉专员接管，派生投诉工单 ${assessment.escalatedToNo ?? '待生成'}。接管说明：${asSentence(assessment.advice)}`
      : `反馈意见：${asSentence(assessment.advice)}`;
    notifyLog.emit({
      ticketNo: r.ticketNo,
      event: 'risk.report.assessed',
      kind: 'risk',
      title: takeOver ? '风险报备评估结论 · 接管' : '风险报备评估结论 · 不升级',
      receivers: [reporterReceiver(r)],
      content: `${r.ticketNo} 的风险报备已完成评估，结论：${assessment.decision}。${tail}评估人：${assessment.by}（${assessment.byRole}）· ${assessment.at}。`,
    });
  }

  /**
   * 核实打标回写（O16 / PRD §5.2「两处状态同步」）。
   *
   * 来源＝「关键词触发」的条目在「实时监控」被打标之后，队列这一侧必须跟着动：
   * 两个页签装的是**同一条命中**，一边判完了另一边一动不动，
   * 督导看到的就是一条永远评不完的条目，而它其实已经有人判过了。
   *
   * 🔴 **按核实结论分流，不是一律出池**（方案 C）：
   * - **误报** → 落「已评估」出池。结论就是"这里没有风险"，没有下一步可走。
   * - **成立** → **不出池**，退回「待分派」继续走分派 / 自取 → 评估（不升级 / 接管），
   *   与其余四类来源同构。
   *
   * 【为什么成立不能就此出池】原先成立也一律落「已评估」，于是关键词命中的单
   * **哪怕核实成立为高危也永远走不到评估**：唯一出口是 915 打标弹窗里那个
   * 只在高危档才出现的「去管控」按钮——成立为**中危**的单确认有风险却没有下一步。
   * 这是条断链，核实答完"这次命中准不准"之后，"升不升级"没有人答。
   *
   * 【为什么退回待分派而不是留在评估中】核实与评估是两个人的两件事。
   * 打标的可能是投诉督导（本就有打标权），把条目留在他名下等于替他把活派给了自己；
   * 退回待分派，督导照常分派、客诉专员照常自取，与另外四类走同一条路。
   * 承办人一并清掉——「待分派」的定义就是还没有人认领，留着旧名字会让待分派列表里
   * 冒出一条已经有主的条目。
   *
   * 结论一律落 `verify` 不落 `assessment`：它答的是"这次命中准不准"，不是"升不升级"。
   * 成立退回后 `verify` 留着不清，评估弹窗第一区块要读它。
   */
  function recordVerify(ticketNo: string, verify: ReportVerify) {
    const r = reports.value.find(
      (x) => x.ticketNo === ticketNo && x.source === '关键词触发' && isOpen(x),
    );
    if (!r) return false;
    r.verify = verify;
    if (verify.verdict === '成立') {
      r.status = '待分派';
      delete r.assignee;
    } else {
      r.status = '已评估';
    }
    return true;
  }

  /*
   * ⚠️ **`risk.report.overdue`（超时未评）本轮没有落点**，是缺口不是遗漏。
   *
   * 另外四个事件都挂在某个人的动作上（提交 / 分派 / 自取 / 评估 / 撤回），
   * 有函数就有埋点；**超时没有动作可挂** —— 它是钟走到了 `REPORT_ASSESS_LIMIT_MIN`
   * 自己触发的，触发条件是"时间过去了"，不是"谁做了什么"。
   *
   * 要发它必须有一个**定时扫描**（对齐《【815】》事件目录里 `source: 'timer'` 的定扫事件）：
   * 周期性扫在队报备、挑出 `isOverdue` 且尚未发过的，逐条发一次并记发送历史（免得每分钟重发）。
   * 前端 `setInterval` 顶多做个演示，真链路在服务端，本轮不做。
   *
   * 🔴 **不要为它伪造一个调用点**：挂在"打开风险监控页时补发"之类的地方，
   * 会让这条通知的发出时刻取决于**有没有人正好打开那个页面** ——
   * 而它要盯的恰恰是"没有人在看的时候单子在队里烂掉"。宁可缺，不可假。
   *
   * 它的收件人配的是「承办人 + 投诉督导」，而超时最常发生在**待分派**态
   * （压根没分派出去才拖到超时），承办人必然为空 —— 正是 O23 类型级那条规则
   * 要保住的场景：督导必须收得到。落地时直接用上面 `withdraw` 同样的写法。
   */

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
    assessOpenCount,
    assessUnassignedCount,
    assessAssigningCount,
    assessOverdueCount,
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
    recordVerify,
    assessmentNoteOf,
  };
});
