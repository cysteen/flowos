import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import type { RiskLevel } from '@/config/risk';

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
 * 【边界】本 store **只管报备单自身**。评估结论对工单风险字段的回传走 915 §7.3 的
 * 既有通道（ProcessFormDraft 的 riskFlag / riskLevel），不在这里写。
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

/** 评估决策四选一（PRD §5.4）。四个**都不派生新单、不改处理人、不改工单子状态** */
export const ASSESS_DECISIONS = ['确认有风险', '无风险', '退回一线改单', '关联已有投诉单'] as const;
export type AssessDecision = (typeof ASSESS_DECISIONS)[number];

/** 报备单两态（PRD §3.1）。「已撤回」不是第三态，是待评估的终止分支 */
export type ReportStatus = '待评估' | '已评估' | '已撤回';

export interface ReportAssessment {
  decision: AssessDecision;
  /** 仅决策＝「确认有风险」时有值 */
  level: RiskLevel | null;
  /** 处置建议 / 反馈意见，四个决策各自的必填文本 */
  advice: string;
  /** 仅决策＝「关联已有投诉单」时有值 */
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
 * 报备评估时限（分钟）。**不是 SLA**：不接 SLA 引擎、不走工作日历、不适用停表规则
 * （§9 规则 13）。这一个值同时供两处读：《【815】》的催办规则触发条件，
 * 与风险评估页签「超时未评」卡的标红阈值（§9 规则 14）。
 */
export const REPORT_ASSESS_LIMIT_MIN = 120;

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
    at: '2026-09-09 14:20',
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
    at: '2026-09-06 10:02',
    status: '已评估',
    assessment: {
      decision: '确认有风险',
      level: '中',
      advice: '当日内主动回电一次，明确给出处理时间点并在处理记录里留痕；两个工作日内未闭环再报一次。',
      by: '李文萍',
      byRole: '客诉专员',
      at: '2026-09-06 10:41',
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
    at: '2026-09-09 11:05',
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
   * 故 `B3 = B4 四档之和` 这条恒等式天然成立（§7 恒等式）。
   */
  const decisionCounts = computed(() => {
    const base: Record<AssessDecision, number> = {
      确认有风险: 0, 无风险: 0, 退回一线改单: 0, 关联已有投诉单: 0,
    };
    const today = todayPrefix();
    for (const r of assessedList.value) {
      if (!r.assessment || !r.assessment.at.startsWith(today)) continue;
      base[r.assessment.decision] += 1;
    }
    return base;
  });

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
    pendingQueue,
    pendingCount,
    submit,
    withdraw,
    assess,
  };
});
