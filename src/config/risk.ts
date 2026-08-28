/**
 * 风险等级刻度 · 单一真源。
 *
 * 【为什么单拎一个文件】这把刻度此前在四处各写了一份字面量：风险监控存 `'高'/'中'/'低'`、
 * 工单处理表单存 `'低风险'/'中风险'/'高风险'`、工单风险监控 Tab 的下拉是模板里手写的裸字符串、
 * 大盘遗留弹窗又是第四份。四份之间**没有任何映射代码**——`RISK_LEVEL_STYLE` 拿 `'高风险'`
 * 取色会得到 undefined，只是没人调用才没炸。等级是要跨页对账的（监控判高危 → 工单页该显示高危），
 * 各存各的就永远对不上账，故收成一处，谁要用谁 import，不再各自定义。
 *
 * 【存储值与界面文案分开】存 `高/中/低`（与 PRD、风险监控页、词表数据一致），
 * 界面一律显示「高危/中危/低危」——`riskLevelText` 是唯一的展示口，避免有的页面写「高风险」、
 * 有的页面写光秃秃一个「高」。
 *
 * ⚠️ 规则引擎条件字段「风险等级」（RulesEngineView）另有一套 `['低','中','高','极高']`，
 * 多出一个别处没有的「极高」，是否同一个业务概念尚未拍板，**本文件不收它**。
 */

/** 等级由重到轻。数组顺序即 chip / 下拉的呈现顺序 */
export const RISK_LEVELS = ['高', '中', '低'] as const;

export type RiskLevel = (typeof RISK_LEVELS)[number];

/** 平台语义色 §2.3：高=危险 / 中=警告 / 低=中性 */
export const RISK_LEVEL_STYLE: Record<RiskLevel, { color: string; bg: string }> = {
  高: { color: '#EF4444', bg: '#EF444422' },
  中: { color: '#F59E0B', bg: '#F59E0B22' },
  低: { color: '#6B7280', bg: '#F3F4F6' },
};

/**
 * 等级的人话说法。没有等级时说清「无等级」而不是留空——
 * 误报是"规则捞错了"不是"风险很低"，留空会被读成"忘了填"。
 */
export function riskLevelText(level: RiskLevel | null | ''): string {
  return level ? `${level}危` : '无等级';
}

/** 下拉 / 单选的选项：存 `高`，显示「高危」。各页面直接用，不要再各自拼 label */
export const RISK_LEVEL_SELECT_OPTIONS: { label: string; value: RiskLevel }[] =
  RISK_LEVELS.map((v) => ({ label: riskLevelText(v), value: v }));
