import type { AssessDecision } from '@/stores/riskShared';

/**
 * 评估决策的**界面词**（基线 v1.23 ※29：「接管」这个词整体作废，结论叫「升级 / 不升级」，
 * 「升级」只指转投诉单，不含升三线技术支持）。
 *
 * 🔴 **不要在判据里直接写 `=== '升级'` 或 `=== '接管'`**：决策的**存储值**归风险 store
 * （`stores/riskShared.ts` 的 `ASSESS_DECISIONS`）管，那一侧改名与本侧改词不是同一次改动，
 * 中间必然有一段两边不同步的窗口。工单页一律走本文件的两个函数：
 * `decisionText` 只管怎么写，`isEscalateDecision` 只管"是不是升级那一档"，
 * 判据取**反面**（不是「不升级」即升级），两个值域下都成立。
 *
 * ⚠️ 指"原单被新单接管"的既有表述（接管横幅、已被新单接管）**不在作废之列** ——
 * 那是 ※7 / ※23 与《【830】》的另一件事，不要顺手一并改掉。
 */
const DECISION_TEXT: Record<string, string> = {
  不升级: '不升级',
  升级: '升级',
  接管: '升级',
};

export function decisionText(decision: AssessDecision | ''): string {
  if (!decision) return '';
  return DECISION_TEXT[decision] ?? decision;
}

/** 是不是「升级」那一档（走《【830】》第一跳派生）。二选一，故判反面最稳 */
export function isEscalateDecision(decision: AssessDecision | ''): boolean {
  return !!decision && decision !== '不升级';
}

/** 该档结论要填的那一栏叫什么：升级填「升级说明」，不升级填「反馈意见」（※29） */
export function adviceLabelOf(decision: AssessDecision | ''): string {
  return isEscalateDecision(decision) ? '升级说明' : '反馈意见';
}

export function advicePlaceholderOf(decision: AssessDecision | ''): string {
  if (!decision) return '请先选择评估决策';
  return isEscalateDecision(decision)
    ? '写清为什么要升级为投诉单、后续处置安排…'
    : '写清为什么不必升级、原单建议怎么处理…';
}

/**
 * 池内条目状态的**界面词**。「分派」这个词整体作废（基线 ※29，2026-09-10 拍板）：
 * 两个池的条目只有「领取」，故「待分派」在界面上一律写「**待领取**」、「评估中」写「已领取」。
 * 存储值仍是 store 的四态字面量，改名归风险 store 那一路，本文件只管落到屏幕上的那个词。
 */
const POOL_STATUS_TEXT: Record<string, string> = {
  待分派: '待领取',
  评估中: '已领取',
  已评估: '已结论',
  已撤回: '已撤回',
  实时监控中: '实时监控中',
  已标记无风险: '已标记无风险',
};

export function poolStatusText(status: string): string {
  return POOL_STATUS_TEXT[status] ?? status;
}
