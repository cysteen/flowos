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

/** 平台语义色 §2.3：高=危险 / 中=警告 / 低=中性 */
export const RISK_LEVEL_STYLE: Record<RiskLevel, { color: string; bg: string }> = {
  高: { color: '#EF4444', bg: '#EF444422' },
  中: { color: '#F59E0B', bg: '#F59E0B22' },
  低: { color: '#6B7280', bg: '#F3F4F6' },
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

  /**
   * 发话角色限定（一期不做）：沟通记录无法可靠区分客户/坐席，词表一律按关键字匹配。
   */
  speakerLimit: SpeakerRole | '不限';
  /** 与 hits7d 同口径，保留字段兼容 */
  hits7dRaw: number;
  /** 近 7 天已被人工判定过的命中数（准确率的分母，不含还没核实的） */
  judged7d: number;
  /** 其中判为「成立」的条数（准确率的分子） */
  valid7d: number;
}

/**
 * 规则准确率 = 成立 ÷ 已判定。
 * 分母用「已判定数」而不是「命中数」——新上线的词条还没人复核，
 * 用命中数当分母会让它准确率极低，产生假信号。
 * 判定数为 0 时返回 null，界面显示「—」，不显示 0%。
 */
export function accuracyOf(w: RiskWord): number | null {
  if (!w.judged7d) return null;
  return w.valid7d / w.judged7d;
}

export const RISK_WORDS: RiskWord[] = [
  { id: 'w1', word: '曝光', level: '高', speakerLimit: '不限', scopes: ['标题', '问题描述', '沟通记录'], receivers: ['李文萍', '值班经理'], enabled: true, hits7dRaw: 6, hits7d: 6, judged7d: 6, valid7d: 5 },
  { id: 'w2', word: '媒体', level: '高', speakerLimit: '不限', scopes: ['标题', '问题描述', '沟通记录'], receivers: ['李文萍', '值班经理'], enabled: true, hits7dRaw: 4, hits7d: 4, judged7d: 4, valid7d: 3 },
  { id: 'w3', word: '起诉', level: '高', speakerLimit: '不限', scopes: ['标题', '问题描述', '催补记录'], receivers: ['李文萍', '法务'], enabled: true, hits7dRaw: 2, hits7d: 2, judged7d: 2, valid7d: 2 },
  { id: 'w4', word: '12315', level: '高', speakerLimit: '不限', scopes: ['标题', '问题描述', '沟通记录'], receivers: ['值班经理', '投诉专员'], enabled: true, hits7dRaw: 5, hits7d: 5, judged7d: 5, valid7d: 3 },
  { id: 'w5', word: '投诉到底', level: '中', speakerLimit: '不限', scopes: ['问题描述', '沟通记录'], receivers: ['值班经理'], enabled: true, hits7dRaw: 9, hits7d: 9, judged7d: 8, valid7d: 6 },
  { id: 'w6', word: '退一赔三', level: '中', speakerLimit: '不限', scopes: ['问题描述', '沟通记录'], receivers: ['值班经理'], enabled: true, hits7dRaw: 3, hits7d: 3, judged7d: 3, valid7d: 3 },
  // 反面教材：通用词，7 天命中 142 次、准确率 8%，上线即刷屏，已停用。
  // 旧版只能靠人肉发现"这词怎么天天响"；有了准确率列，它自己就报警了。
  { id: 'w7', word: '孩子', level: '低', speakerLimit: '不限', scopes: ['问题描述'], receivers: ['教育支持组长'], enabled: false, hits7dRaw: 142, hits7d: 142, judged7d: 12, valid7d: 1 },
];

// ---------------------------------------------------------------------
// 双轨判定模型
//
// 风险等级不是拍出来的，是两个维度交叉出来的（对标 ITIL 的 Priority = Impact × Urgency）：
//   · 后果严重度 impact  ← 事情本身多严重，来自投诉一类/二类树
//   · 外部信号强度 signal ← 客户多快会爆，来自识别规则命中
// 这解决了纯词表的两个反例：
//   ① 安全事故但客户全程平静 —— 纯词表下一个词都不命中，根本不进视野
//   ② 联系时效不认可却喊"曝光" —— 纯词表下判高危，挤占真高危的处置资源
// ---------------------------------------------------------------------

/** 后果严重度：来自投诉二类。严重＝安全/质量事故，一般＝服务与流程，轻微＝无实质损失 */
export type RiskImpact = '严重' | '一般' | '轻微';
/** 外部信号强度：强＝指名了外部渠道，中＝有威胁未指名，无＝平静陈述 */
export type RiskSignal = '强' | '中' | '无';
/** 发话角色：同一个词，客户说和坐席说完全是两件事 */
export type SpeakerRole = '客户' | '坐席';
/** 复核回填：判的是「规则这次命中得准不准」，不是「这个客户危不危险」 */
export type HitVerdict = '成立' | '误报';

/**
 * 分级矩阵。行＝后果严重度，列＝外部信号强度。
 * 只有两轨都不低才是高危 —— 这正是纯词表做不到的那一层过滤。
 */
export const RISK_MATRIX: Record<RiskImpact, Record<RiskSignal, RiskLevel>> = {
  严重: { 强: '高', 中: '高', 无: '中' },
  一般: { 强: '高', 中: '中', 无: '低' },
  轻微: { 强: '中', 中: '低', 无: '低' },
};

export function gradeOf(impact: RiskImpact, signal: RiskSignal): RiskLevel {
  return RISK_MATRIX[impact][signal];
}

/** 分级即定处置层级 —— 等级不是颜色，是"该找谁"。系统不自动指派，只指路 */
export const DISPOSAL_BY_GRADE: Record<RiskLevel, { who: string; hint: string }> = {
  高: { who: '投诉处理角色', hint: '建议工单管控介入' },
  中: { who: '班组长', hint: '由班组长跟进处理' },
  低: { who: '当前处理人', hint: '按常规流程处理即可' },
};

export interface RiskHit {
  id: string;
  ticketNo: string;
  title: string;
  word: string;
  /** @deprecated 旧的纯词表等级。保留仅供「新旧对比」演示，正式口径一律用 gradeOf() */
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

  // ---- 双轨字段 ----
  /** 谁说的。坐席说的一律不构成外部风险信号 */
  speakerRole: SpeakerRole;
  /** 后果严重度 */
  impact: RiskImpact;
  /** 后果严重度的依据（投诉二类），让分级可追溯 */
  impactSource: string;
  /** 外部信号强度 */
  signal: RiskSignal;
  /** 外部信号的依据：命中了什么 */
  signalSource: string;
  /** 命中来自哪一轨：纯词表时代只有「外部信号」这一轨 */
  track: '外部信号' | '后果严重度' | '双轨';
  /** 旧规则（纯词表）下的等级；`null` 表示旧规则根本召不回这条 */
  legacyLevel: RiskLevel | null;

  /** 监控岗打的标 */
  tagged?: RiskLevel;
  taggedBy?: string;
  taggedAt?: string;
  taggedNote?: string;
  /** 复核回填：这次命中成不成立。没有它，词表永远不会自己变好 */
  verdict?: HitVerdict;
}

export const RISK_HITS: RiskHit[] = [
  {
    id: 'h1', ticketNo: 'LCMN-20260610-73026', title: '无线音乐播放跳过歌曲异常',
    word: '曝光', level: '高', position: '沟通记录',
    excerpt: '再不解决我就找媒体曝光，我本身就是干这行的。',
    when: '2026-08-04 14:21', customer: '张小凡',
    groupId: 'cs-1', groupName: '受理一组', assignee: '王坐席',
    receivers: ['李文萍', '值班经理'],
    speakerRole: '客户',
    impact: '一般', impactSource: '产品功能/性能投诉 · 产品性能未达到顾客预期',
    signal: '强', signalSource: '命中「曝光」「媒体」',
    track: '双轨', legacyLevel: '高',
  },
  {
    id: 'h2', ticketNo: 'LCMN-20260711-61551', title: '外投·维修超期未解决客户要求赔偿',
    word: '12315', level: '高', position: '问题描述',
    excerpt: '客户要求赔偿并已向 12315 平台提交投诉。',
    when: '2026-08-04 13:58', customer: '吴强',
    groupId: 'hardware', groupName: '硬件缺陷组', assignee: '王坐席',
    receivers: ['值班经理', '投诉专员'],
    speakerRole: '客户',
    impact: '一般', impactSource: '流程规则投诉 · 售后维修方式不认可',
    signal: '强', signalSource: '命中「12315」',
    track: '双轨', legacyLevel: '高',
    tagged: '高', taggedBy: '郑监控', taggedAt: '2026-08-04 14:03', taggedNote: '已进入外投流程，转投诉专员专项跟进',
    verdict: '成立',
  },
  {
    // 🔴 双轨的第一个反例：安全事故，客户全程平静、一个风险词都不说。
    // 纯词表下这条根本不出现在监控视野里 —— legacyLevel = null 就是这个意思。
    id: 'h6', ticketNo: 'LCMN-20260804-74120', title: '学习机充电时机身发烫、电池鼓包',
    word: '—', level: '低', position: '问题描述',
    excerpt: '孩子用的时候发现后盖鼓起来了，摸着烫手，我先停用了，麻烦帮忙看看怎么处理。',
    when: '2026-08-04 14:06', customer: '周敏',
    groupId: 'edu', groupName: '教育支持组', assignee: '孙坐席',
    receivers: ['值班经理', '投诉专员'],
    speakerRole: '客户',
    impact: '严重', impactSource: '产品质量投诉 · 安全事故',
    signal: '无', signalSource: '未命中任何信号规则',
    track: '后果严重度', legacyLevel: null,
  },
  {
    id: 'h3', ticketNo: 'LCMN-20260803-60155', title: '耳机充电仓无法配对',
    word: '退一赔三', level: '中', position: '沟通记录',
    excerpt: '不给我退一赔三我就不接受这个方案。',
    when: '2026-08-04 13:30', customer: '孙莉',
    groupId: 'cs-1', groupName: '受理一组', assignee: '王坐席',
    receivers: ['值班经理'],
    speakerRole: '客户',
    impact: '一般', impactSource: '产品质量投诉 · 产品质量故障',
    signal: '中', signalSource: '命中「退一赔三」',
    track: '双轨', legacyLevel: '中',
  },
  {
    // 🔴 双轨的第二个反例：流程规则类诉求，客户喊了 12315。
    // 纯词表下判高危、与真高危同级挤占资源；双轨下降为中危。
    id: 'h8', ticketNo: 'LCMN-20260804-73991', title: '账号密码找回需本人到店办理，客户不认可',
    word: '12315', level: '高', position: '沟通记录',
    excerpt: '这规定太离谱了，你们不改我就打 12315。',
    when: '2026-08-04 12:35', customer: '李海',
    groupId: 'cs-1', groupName: '受理一组', assignee: '赵坐席',
    receivers: ['值班经理', '投诉专员'],
    speakerRole: '客户',
    impact: '轻微', impactSource: '流程规则投诉 · 对规定的联系方式不认可',
    signal: '强', signalSource: '命中「12315」',
    track: '双轨', legacyLevel: '高',
  },
  {
    id: 'h4', ticketNo: 'LCMN-20260802-59588', title: '智学网成绩同步延迟',
    word: '投诉到底', level: '中', position: '问题描述',
    excerpt: '影响全校期末成绩录入，这次一定要投诉到底。',
    when: '2026-08-04 11:47', customer: '合肥八中',
    groupId: 'edu', groupName: '教育支持组', assignee: '孙坐席',
    receivers: ['值班经理'],
    speakerRole: '客户',
    impact: '一般', impactSource: '产品功能/性能投诉 · 产品性能未达到顾客预期',
    signal: '中', signalSource: '命中「投诉到底」',
    track: '双轨', legacyLevel: '中',
  },
  {
    // 🔴 角色维度的价值：这句"曝光"是坐席说的。
    // 纯词表照样命中并判高危（误报）；加了角色限定后不再进入视野。
    id: 'h7', ticketNo: 'LCMN-20260801-59104', title: '智能办公本笔迹延迟咨询',
    word: '曝光', level: '高', position: '沟通记录',
    excerpt: '（坐席）如果对处理结果不满意，您也可以向媒体曝光或向监管部门反映，这是您的权利。',
    when: '2026-08-04 10:52', customer: '钱伟',
    groupId: 'cs-1', groupName: '受理一组', assignee: '王坐席',
    receivers: ['李文萍', '值班经理'],
    speakerRole: '坐席',
    impact: '轻微', impactSource: '咨询类 · 无实质损失',
    signal: '无', signalSource: '发话人为坐席，不构成外部风险信号',
    track: '后果严重度', legacyLevel: '高',
  },
  {
    id: 'h5', ticketNo: 'LCMN-20260731-58012', title: '智能音箱返修超期未回寄',
    word: '起诉', level: '高', position: '催补记录',
    excerpt: '再拖下去我就走法律途径起诉你们。',
    when: '2026-08-04 09:12', customer: '吴强',
    groupId: 'hardware', groupName: '硬件缺陷组', assignee: '陈坐席',
    receivers: ['李文萍', '法务'],
    speakerRole: '客户',
    impact: '一般', impactSource: '流程规则投诉 · 售后维修方式不认可',
    signal: '强', signalSource: '命中「起诉」',
    track: '双轨', legacyLevel: '高',
    tagged: '高', taggedBy: '郑监控', taggedAt: '2026-08-04 09:20', taggedNote: '同一客户第二次命中高危词，已上报法务',
    verdict: '成立',
  },
];

/** 本单最终等级：双轨交叉，不看词表预设等级 */
export function riskGradeOf(h: RiskHit): RiskLevel {
  return gradeOf(h.impact, h.signal);
}

export function riskHitsOf(scope: OpsScope): RiskHit[] {
  const rows = RISK_HITS.filter((h) => matchesScope(h.groupId, scope));
  return [...rows].sort((a, b) => b.when.localeCompare(a.when));
}

/**
 * 旧规则（纯词表）下能召回的命中。
 * 与 riskHitsOf 的差集，就是双轨与角色维度带来的变化：
 *   · 旧有新无 → 被角色限定消掉的误报
 *   · 旧无新有 → 后果严重度这一轨新召回的单
 */
export function legacyRiskHitsOf(scope: OpsScope): RiskHit[] {
  return riskHitsOf(scope).filter((h) => h.legacyLevel !== null);
}

/** 未打标的高危命中——按双轨等级判，不再用词表预设等级 */
export function untaggedHighRisks(scope: OpsScope): RiskHit[] {
  return riskHitsOf(scope).filter((h) => riskGradeOf(h) === '高' && !h.tagged);
}
