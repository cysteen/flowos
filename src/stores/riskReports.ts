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
 * 【边界】本 store **只管报备单自身**，外加一个供回传取值的读口（`ticketAssessmentOf`）。
 * 真正往 ProcessFormDraft 的 riskFlag / riskLevel 里写的那一步不在这里 ——
 * 写入优先级要看工单表单当前值，那是工单操作页才有的上下文（930 §6.1 / 915 §7.3）。
 */

/** 报备原因（PRD §4.4）。取「风险场景」时风险类型才必填 */
export const REPORT_REASONS = ['建单错误', '客户要求升级', '风险场景', '已有投诉', '其他'] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

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

/** 报备单两态（PRD §3.1）。「已撤回」不是第三态，是待评估的终止分支 */
export type ReportStatus = '待评估' | '已评估' | '已撤回';

export interface ReportAssessment {
  decision: AssessDecision;
  /** 风险等级（二选一决策下通常为空，保留字段兼容历史结构） */
  level: RiskLevel | null;
  /** 不升级 → 反馈意见；接管 → 接管说明 */
  advice: string;
  linkedTicketNo?: string;
  by: string;
  byRole: string;
  at: string;
}

export interface RiskReport {
  id: string;
  ticketNo: string;
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

/**
 * 一张工单在报备侧的现行评估结论（930 §6.1）。形状对齐 riskTags 的 `TicketRiskVerification`：
 * 工单页的回传逻辑两路各取一个这样的对象、走同一套判定，不为报备另写一条链路。
 *
 * 【为什么 flag 不是可空的】本对象只在「确认有风险」存在时才被造出来（否则整个返回 null），
 * 其余三个决策一字不写工单，连"没风险"这个结论都不写 —— 判无风险是坐席的权，
 * 客诉专员评的是"这单要不要提前介入"，不是"这单最终有没有问题"。
 */
export interface TicketRiskAssessment {
  ticketNo: string;
  /** 工单级风险等级 ＝ max(本单全部「确认有风险」评估的等级)，只升不降（915 §3.2） */
  grade: RiskLevel | null;
  /** 恒为「有风险」。留成字段而不是让调用方自己写死，是为了与另一路的取值口对称 */
  flag: RiskFlag;
  /** 最近一次「确认有风险」的评估，按**评估时刻**取 —— 只读提示行要说的是"最后一次谁怎么评的" */
  latest: ReportAssessment;
  /** 本单「确认有风险」的评估条数。一张单可以反复报备，故不是恒等于 1 */
  confirmedCount: number;
}

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
  {
    id: 'rr-001',
    ticketNo: 'IFLYZX-20260610-00004',
    reason: '风险场景',
    category: '监管风险',
    desc: '客户在第三通来电中反复提到"这事你们不给说法我就去有关部门反映"，情绪较激动，且提到已经拍了照片。本单是咨询单，暂未升级为投诉，拿不准要不要提前介入。',
    attachments: ['第三通通话录音片段.mp3'],
    by: '林晓东',
    byRole: '二线专员',
    // 45 分钟前：未超时，用来演示"在队但还在时限内"这一态
    at: agoStamp(45),
    status: '待评估',
  },
  {
    id: 'rr-002',
    ticketNo: 'IFLYZX-20260610-00005',
    reason: '客户要求升级',
    category: null,
    desc: '客户明确说"叫你们领导来跟我讲"，当时判断是情绪话，先做了安抚。',
    attachments: [],
    by: '林晓东',
    byRole: '二线专员',
    at: agoStamp(90),
    status: '已评估',
    assessment: {
      decision: '不升级',
      level: null,
      advice: '客户情绪可安抚，当前咨询单处理路径足够；建议当日内回电明确处理节点并在处理记录留痕。',
      by: '李文萍',
      byRole: '客诉专员',
      // 评估时刻落在今日：否则「今日已评估」与「已评估默认只看今日」两处恒为 0
      at: agoStamp(50),
    },
  },
  {
    id: 'rr-003',
    ticketNo: 'IFLYZX-20260601-00001',
    reason: '建单错误',
    category: null,
    desc: '一线把这张单建成了咨询单、优先级普通，但客户诉求实际是产品质量投诉，应为投诉单且加急。',
    attachments: [],
    by: '周敏',
    byRole: '二线专员',
    // 3 小时前：已过 2 小时时限，用来演示「超时未评」的标红与计数
    at: agoStamp(180),
    status: '待评估',
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
    return reports.value.find((r) => r.ticketNo === ticketNo && r.status === '待评估') ?? null;
  }

  /** 本单是否还能发起报备：只看在队，不看历史 */
  function canSubmitFor(ticketNo: string) {
    return !pendingOf(ticketNo);
  }

  /**
   * 本单的历史报备（已评估 + 已撤回），时间倒序。
   * **不含待评估那条** —— 它在界面上单独占一块（在队提示条 + 只读卡），进列表会重复。
   */
  function historyOf(ticketNo: string) {
    return reportsOf(ticketNo).filter((r) => r.status !== '待评估');
  }

  /**
   * 工单的「报备中」标记（§3.2）。**纯派生、不落库**：有没有这个标记，
   * 完全等于"本单有没有一条待评估的报备"，人不直接操作它。
   */
  function isReporting(ticketNo: string) {
    return !!pendingOf(ticketNo);
  }

  /** 全中心待评估队列，按**等待时长降序**＝提交时刻正序（§5.3 元素 ④） */
  const pendingQueue = computed(() =>
    reports.value.filter((r) => r.status === '待评估').sort((a, b) => a.at.localeCompare(b.at)),
  );

  /** B1 待评估报备数（§7）。已撤回的不进任何一个数 */
  const pendingCount = computed(() => pendingQueue.value.length);

  /** 等待时长（分钟）＝ 当前时刻 − **提交时刻**。不从任何"分派时刻"起算（不做分派） */
  function waitedMinutes(at: string) {
    const t = new Date(at.replace(/-/g, '/')).getTime();
    if (Number.isNaN(t)) return 0;
    return Math.max(0, Math.floor((Date.now() - t) / 60000));
  }

  /** 是否超时未评：等待时长 > 报备评估时限。**不是 SLA**，不走工作日历、不停表 */
  function isOverdue(r: RiskReport) {
    return r.status === '待评估' && waitedMinutes(r.at) > REPORT_ASSESS_LIMIT_MIN;
  }

  /** B2 超时未评报备数（§7）。B1 ≥ B2 恒成立——超时的一定还在待评估里 */
  const overdueCount = computed(() => pendingQueue.value.filter(isOverdue).length);

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

  /**
   * 本单现行的评估结论 —— 回传工单风险字段时取的就是这一个对象。
   * 二选一决策（不升级 / 接管）均不回写工单风险字段，返回 null。
   */
  function ticketAssessmentOf(_ticketNo: string): TicketRiskAssessment | null {
    return null;
  }

  /**
   * 只读提示行的那一行字（930 §6.1 步 5）：「风险评估结论：高危 · 李文萍（客诉专员）· 2026-09-06 10:41」。
   * 【为什么文案在 store 里拼】被步 2 挡住时这行字是结论**唯一**的去处，两处各拼一遍
   * 迟早写成两种说法；而拼它需要的全部素材都在本 store，放这里调用方一行取用。
   */
  function ticketAssessmentNoteOf(ticketNo: string): string {
    const a = ticketAssessmentOf(ticketNo);
    if (!a) return '';
    // 等级取**工单级**（max 棘轮）而不是最后一次评估自己的等级：这行字答的是"这张单有多危险"
    return `风险评估结论：${riskLevelText(a.grade)} · ${a.latest.by}（${a.latest.byRole}）· ${a.latest.at}`;
  }

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
      status: '待评估',
      ...input,
      // 风险类型只在「风险场景」下成立：原因切走时前端已清空，这里再收一道，
      // 免得别处调用绕过表单直接塞进来一个不该有的值
      category: input.reason === '风险场景' ? input.category : null,
    };
    reports.value.push(report);
    return report;
  }

  /** 撤回：仅待评估、仅本人（调用方判"本人"）。**不删除**，转「已撤回」并留原因（§4.8） */
  function withdraw(id: string, reason: string) {
    const r = reports.value.find((x) => x.id === id);
    if (!r || r.status !== '待评估') return;
    r.status = '已撤回';
    r.withdrawReason = reason;
  }

  /** 评估：一条报备单最多一条评估记录，**提交即固化不可改**（§9 规则 22） */
  function assess(id: string, assessment: ReportAssessment) {
    const r = reports.value.find((x) => x.id === id);
    if (!r || r.status !== '待评估') return;
    r.status = '已评估';
    r.assessment = assessment;
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
    ticketAssessmentOf,
    ticketAssessmentNoteOf,
    pendingQueue,
    pendingCount,
    submit,
    withdraw,
    assess,
  };
});
