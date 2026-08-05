// 运营监控 · 模块 3（全维度运营拆解报表）与模块 2.3（风险预警词）数据源。
//
// 与实时大盘（opsMonitor.ts）的分工：那边是"此刻要不要动手"，这边是"这一段时间表现如何、为什么"。
// 业务线占比直接复用大盘的产线下钻，保证同一个数字在两个 Tab 里不会有两个值。

import { getOpsSnapshot, matchesScope, type DrillRow, type OpsScope } from './opsMonitor';

// ======================================================================
// 模块 3 · 全维度运营拆解报表
// ======================================================================

/** 3.1 各业务线工单占比（饼图）——与实时大盘产线下钻同源 */
export function businessLineShare(scope: OpsScope): DrillRow[] {
  return getOpsSnapshot(scope).inboundByProduct;
}

export const PIE_COLORS = ['#334155', '#059669', '#d97706', '#6366f1', '#0891b2', '#dc2626'];

export type ReportGrain = 'week' | 'month';

/** 近 7 日质量走势（报表 Tab · 周粒度） */
export const WEEKLY_QUALITY = {
  labels: ['7/29', '7/30', '7/31', '8/1', '8/2', '8/3', '8/4'],
  timely: [90.2, 90.8, 91.5, 92.0, 92.8, 92.2, 91.4],
  contact: [92.5, 93.2, 94.0, 94.8, 95.6, 95.1, 94.2],
  resolve: [87.2, 88.0, 88.5, 87.9, 88.2, 89.0, 88.7],
};

/** 近 4 周质量走势（报表 Tab · 月粒度） */
export const MONTHLY_QUALITY = {
  labels: ['7/7', '7/14', '7/21', '7/28', '8/4'],
  timely: [88.6, 89.4, 90.1, 90.8, 91.4],
  contact: [90.5, 91.2, 92.0, 93.1, 94.2],
  resolve: [85.8, 86.4, 87.0, 87.8, 88.7],
};

export function reportQualityTrend(grain: ReportGrain) {
  return grain === 'week' ? WEEKLY_QUALITY : MONTHLY_QUALITY;
}

/** 各质量指标 7 日 sparkline */
export const QUALITY_TRENDS: Record<string, number[]> = {
  overall: WEEKLY_QUALITY.timely,
  contact24h: WEEKLY_QUALITY.contact,
  resolveRate: WEEKLY_QUALITY.resolve,
  satisfaction: [4.1, 4.2, 4.25, 4.35, 4.42, 4.38, 4.3],
  surveyRate: [32.1, 33.5, 34.8, 35.2, 36.0, 35.8, 36.5],
};

/** 达成率着色：绿 ≥95 / 黄 85–95 / 红 <85（阈值租户可配，此处为默认值） */
export function rateTone(rate: number): { color: string; bg: string; label: string } {
  if (rate >= 95) return { color: '#047857', bg: '#d1fae5', label: '达标' };
  if (rate >= 85) return { color: '#b45309', bg: '#fef3c7', label: '临界' };
  return { color: '#b91c1c', bg: '#fee2e2', label: '未达标' };
}

/** 3.2 整体解决及时率 */
export const OVERALL_TIMELY = {
  label: '整体解决及时率',
  value: 91.4,
  yesterday: 92.8,
  lastWeek: 90.2,
  healthy: 95,
  tip: '本期关闭工单中，在 SLA 解决时限内完成的占比；SLA 停表期间（挂起/已转出）不计入耗时',
};

export interface GroupSlaRow {
  id: string;
  name: string;
  /** 时效达成率 */
  rate: number;
  yesterday: number;
  /** 本期处理量——决定这个比率有多少分量，只看比率会被小样本误导 */
  volume: number;
}

/** 3.2 各班组时效达成率对比 */
export const GROUP_SLA: GroupSlaRow[] = [
  { id: 'cs-1', name: '受理一组', rate: 95.8, yesterday: 96.2, volume: 376 },
  { id: 'cs-2', name: '受理二组', rate: 94.1, yesterday: 93.5, volume: 318 },
  { id: 'tech', name: '技术支持组', rate: 89.6, yesterday: 91.2, volume: 274 },
  { id: 'hardware', name: '硬件缺陷组', rate: 86.3, yesterday: 88.7, volume: 241 },
  { id: 'edu', name: '教育支持组', rate: 82.4, yesterday: 85.1, volume: 182 },
];

export interface QualityMetric {
  key: string;
  label: string;
  value: number;
  unit: '%' | '分';
  /** 3.4 同环比：昨日同期 / 上周同期 */
  yesterday: number;
  lastWeek: number;
  /** 健康线，低于即标黄 */
  healthy: number;
  tip: string;
}

/** 3.3 质量四率 + 3.4 同环比 */
export const QUALITY_METRICS: QualityMetric[] = [
  {
    key: 'contact24h', label: '24 小时联络率', value: 94.2, unit: '%',
    yesterday: 95.6, lastWeek: 92.8, healthy: 95,
    tip: '建单后 24 小时内发生过任一对客联络动作（电话／短信／IM／邮件）的工单占比',
  },
  {
    key: 'resolveRate', label: '解决率', value: 88.7, unit: '%',
    yesterday: 87.9, lastWeek: 89.4, healthy: 88,
    tip: '本期关闭工单中关闭性质为「已解决」的占比，排除强结、重复单、客户取消',
  },
  {
    key: 'satisfaction', label: '服务满意度', value: 4.3, unit: '分',
    yesterday: 4.4, lastWeek: 4.2, healthy: 4.2,
    tip: '结案回访问卷平均得分（5 分制），数据源为调研回访模块',
  },
  {
    key: 'surveyRate', label: '参评率', value: 36.5, unit: '%',
    yesterday: 34.1, lastWeek: 38.9, healthy: 35,
    tip: '已发出回访问卷中被有效填答的比例；参评率过低时满意度不具代表性，需与满意度同看',
  },
];

// ======================================================================
// 模块 2.3 · 风险预警词
// ======================================================================

export type RiskLevel = '高' | '中' | '低';

export const RISK_LEVEL_STYLE: Record<RiskLevel, { color: string; bg: string }> = {
  高: { color: '#b91c1c', bg: '#fee2e2' },
  中: { color: '#b45309', bg: '#fef3c7' },
  低: { color: '#1d4ed8', bg: '#dbeafe' },
};

export interface RiskWord {
  id: string;
  word: string;
  level: RiskLevel;
  /** 匹配范围 */
  scopes: string[];
  /** 命中后通知谁 */
  receivers: string[];
  enabled: boolean;
  /**
   * 近 7 天命中次数：新增词条时的试跑依据。
   * 「孩子」这种通用词 7 天命中 142 次，上线即刷屏，所以默认停用——
   * 这一列的存在就是为了让维护人看见这件事。
   */
  hits7d: number;
}

export const RISK_WORDS: RiskWord[] = [
  { id: 'w1', word: '曝光', level: '高', scopes: ['标题', '问题描述', '沟通记录'], receivers: ['李文萍', '值班经理'], enabled: true, hits7d: 6 },
  { id: 'w2', word: '媒体', level: '高', scopes: ['标题', '问题描述', '沟通记录'], receivers: ['李文萍', '值班经理'], enabled: true, hits7d: 4 },
  { id: 'w3', word: '起诉', level: '高', scopes: ['标题', '问题描述', '补充说明'], receivers: ['李文萍', '法务'], enabled: true, hits7d: 2 },
  { id: 'w4', word: '12315', level: '高', scopes: ['标题', '问题描述'], receivers: ['值班经理', '投诉专员'], enabled: true, hits7d: 5 },
  { id: 'w5', word: '投诉到底', level: '中', scopes: ['问题描述', '沟通记录'], receivers: ['值班经理'], enabled: true, hits7d: 9 },
  { id: 'w6', word: '退一赔三', level: '中', scopes: ['问题描述', '沟通记录'], receivers: ['值班经理'], enabled: true, hits7d: 3 },
  { id: 'w7', word: '孩子', level: '低', scopes: ['问题描述'], receivers: ['教育支持组长'], enabled: false, hits7d: 142 },
];

export interface RiskHit {
  id: string;
  ticketNo: string;
  title: string;
  word: string;
  level: RiskLevel;
  /** 命中位置 */
  position: string;
  /** 命中的原文片段 */
  excerpt: string;
  when: string;
  customer: string;
  groupId: string;
  groupName: string;
  assignee: string;
  receivers: string[];
  /** 监控岗打的标；字段枚举待业务最终确认，先按风险分级落地 */
  tagged?: RiskLevel;
  taggedBy?: string;
  taggedAt?: string;
  taggedNote?: string;
}

export const RISK_HITS: RiskHit[] = [
  {
    id: 'h1', ticketNo: 'LCMN-20260610-73026', title: '无线音乐播放跳过歌曲异常',
    word: '曝光', level: '高', position: '沟通记录',
    excerpt: '再不解决我就找媒体曝光，我本身就是干这行的。',
    when: '2026-08-04 14:21', customer: '张小凡',
    groupId: 'cs-1', groupName: '受理一组', assignee: '王坐席',
    receivers: ['李文萍', '值班经理'],
  },
  {
    id: 'h2', ticketNo: 'LCMN-20260711-61551', title: '外投·维修超期未解决客户要求赔偿',
    word: '12315', level: '高', position: '问题描述',
    excerpt: '客户要求赔偿并已向 12315 平台提交投诉。',
    when: '2026-08-04 13:58', customer: '吴强',
    groupId: 'hardware', groupName: '硬件缺陷组', assignee: '王坐席',
    receivers: ['值班经理', '投诉专员'],
    tagged: '高', taggedBy: '郑监控', taggedAt: '2026-08-04 14:03', taggedNote: '已进入外投流程，转投诉专员专项跟进',
  },
  {
    id: 'h3', ticketNo: 'LCMN-20260803-60155', title: '耳机充电仓无法配对',
    word: '退一赔三', level: '中', position: '沟通记录',
    excerpt: '不给我退一赔三我就不接受这个方案。',
    when: '2026-08-04 13:30', customer: '孙莉',
    groupId: 'cs-1', groupName: '受理一组', assignee: '王坐席',
    receivers: ['值班经理'],
  },
  {
    id: 'h4', ticketNo: 'LCMN-20260802-59588', title: '智学网成绩同步延迟',
    word: '投诉到底', level: '中', position: '问题描述',
    excerpt: '影响全校期末成绩录入，这次一定要投诉到底。',
    when: '2026-08-04 11:47', customer: '合肥八中',
    groupId: 'edu', groupName: '教育支持组', assignee: '孙坐席',
    receivers: ['值班经理'],
  },
  {
    id: 'h5', ticketNo: 'LCMN-20260731-58012', title: '智能音箱返修超期未回寄',
    word: '起诉', level: '高', position: '补充说明',
    excerpt: '再拖下去我就走法律途径起诉你们。',
    when: '2026-08-04 09:12', customer: '吴强',
    groupId: 'hardware', groupName: '硬件缺陷组', assignee: '陈坐席',
    receivers: ['李文萍', '法务'],
    tagged: '高', taggedBy: '郑监控', taggedAt: '2026-08-04 09:20', taggedNote: '同一客户第二次命中高危词，已上报法务',
  },
];

export function riskHitsOf(scope: OpsScope): RiskHit[] {
  const rows = RISK_HITS.filter((h) => matchesScope(h.groupId, scope));
  return [...rows].sort((a, b) => b.when.localeCompare(a.when));
}

/** 未打标的高危命中——进待处置区的依据：命中了但还没人处理，才是需要动手的 */
export function untaggedHighRisks(scope: OpsScope): RiskHit[] {
  return riskHitsOf(scope).filter((h) => h.level === '高' && !h.tagged);
}
