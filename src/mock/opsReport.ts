// 运营监控 · 模块 3（全维度运营拆解报表）与模块 2.3（风险风险词）数据源。
//
// 与实时大盘（opsMonitor.ts）的分工：那边是"此刻要不要动手"，这边是"这一段时间表现如何、为什么"。
// 业务线占比直接复用大盘的产线下钻，保证同一个数字在两个 Tab 里不会有两个值。

import { getOpsSnapshot, matchesScope, type DrillRow, type OpsScope } from './opsMonitor';
import { TICKETS } from './tickets';
import {
  BUSINESS_TYPES,
  PRODUCT_CATEGORIES,
  PRODUCT_NAMES,
} from '@/views/tickets/types/createTicket';
import {
  statusDisplayName,
  type TicketStatus,
} from '@/views/tickets/types/ticket';
import type { RiskLevel } from '@/config/risk';

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
// 模块 2.3 · 风险风险词
// ======================================================================

// 等级刻度与配色的定义已上移到 @/config/risk（工单侧要用同一把刻度，
// 而工单类型层不该反过来依赖运营监控的 mock）。此处原样再导出，既有引用方不必改 import。
export { RISK_LEVEL_STYLE, RISK_LEVELS, riskLevelText } from '@/config/risk';
export type { RiskLevel } from '@/config/risk';

export interface RiskWord {
  id: string;
  /** 主词：规则的显示名，也是统计口径——同义词命中一律记在它名下 */
  word: string;
  /**
   * 同义词（0..N）：与主词等价的表达，在**同一条规则内取或**。
   * 拆成多条规则会让「找媒体曝光」这一句被各命中一遍——待核实队列占两个坑、
   * 人重复核实，成效条的「发现」「确认是风险」也随之虚高。
   */
  synonyms: string[];
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
 * 规则准确率 = 成立 ÷ 已判定，按**规则**算而不是按词算。
 * 展示合并（主词 + 同义词一条）而统计不合并会让两处口径分叉。
 * 分母用「已判定数」而不是「命中数」——新上线的词条还没人复核，
 * 用命中数当分母会让它准确率极低，产生假信号。
 * 判定数为 0 时返回 null，界面显示「—」，不显示 0%。
 */
export function accuracyOf(w: RiskWord): number | null {
  if (!w.judged7d) return null;
  return w.valid7d / w.judged7d;
}

export const RISK_WORDS: RiskWord[] = [
  // 「媒体」原为独立词条（7 天 4 次、判定 4 / 成立 3），现并为「曝光」的同义词，
  // 计数一并归到主词名下：6+4=10 命中、6+4=10 判定、5+3=8 成立。
  { id: 'w1', word: '曝光', synonyms: ['媒体', '新闻', '上电视', '黑猫投诉', '发帖曝光', '网上曝光'], level: '高', speakerLimit: '不限', scopes: ['标题', '问题描述', '沟通记录'], receivers: ['李文萍', '值班经理'], enabled: true, hits7dRaw: 10, hits7d: 10, judged7d: 10, valid7d: 8 },
  { id: 'w3', word: '起诉', synonyms: ['法律途径', '法院', '律师', '打官司', '诉讼', '走法律'], level: '高', speakerLimit: '不限', scopes: ['标题', '问题描述', '催补记录', '处理结果'], receivers: ['李文萍', '法务'], enabled: true, hits7dRaw: 2, hits7d: 2, judged7d: 2, valid7d: 2 },
  { id: 'w4', word: '12315', synonyms: ['消协', '315', '市场监管局', '消费者协会', '打315', '找消协'], level: '高', speakerLimit: '不限', scopes: ['标题', '问题描述', '沟通记录', '处理结果'], receivers: ['值班经理', '投诉专员'], enabled: true, hits7dRaw: 5, hits7d: 5, judged7d: 5, valid7d: 3 },
  { id: 'w5', word: '投诉到底', synonyms: ['一直投诉', '天天投诉', '告到底', '投诉你们', '没完'], level: '中', speakerLimit: '不限', scopes: ['问题描述', '沟通记录', '处理结果'], receivers: ['值班经理'], enabled: true, hits7dRaw: 9, hits7d: 9, judged7d: 8, valid7d: 6 },
  { id: 'w6', word: '退一赔三', synonyms: ['三倍赔偿', '假一赔三', '退一赔十', '按消法赔'], level: '中', speakerLimit: '不限', scopes: ['问题描述', '沟通记录', '问题原因'], receivers: ['值班经理'], enabled: true, hits7dRaw: 3, hits7d: 3, judged7d: 3, valid7d: 3 },
  // 反面教材：通用词，7 天命中 142 次、准确率 8%，上线即刷屏，已停用。
  // 同义词故意铺得较宽（青少年 / 祖国的花朵等），演示「一条规则 = 主词 + N 同义词」的覆盖感；
  // 也解释为什么这类泛化词一启用就刷屏——命中面太广，准确率自己报警。
  { id: 'w7', word: '孩子', synonyms: ['青少年', '祖国的花朵', '小朋友', '未成年人', '学生', '娃'], level: '低', speakerLimit: '不限', scopes: ['问题描述'], receivers: ['教育支持组长'], enabled: false, hits7dRaw: 142, hits7d: 142, judged7d: 12, valid7d: 1 },
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
  高: { who: '客诉专员', hint: '建议工单管控介入' },
  中: { who: '班组长', hint: '由班组长跟进处理' },
  低: { who: '当前处理人', hint: '按常规流程处理即可' },
};

export interface RiskHit {
  id: string;
  ticketNo: string;
  title: string;
  /** 命中规则的主词。统计、去重、准确率都按它算 */
  word: string;
  /**
   * 原文里实际命中的那个表达（主词或它的某个同义词）。
   * 与主词不同时界面要标出来，否则复核的人在原文里找不到主词、对不上账。
   */
  matchedWord: string;
  /**
   * 词表预设等级：规则命中时带出来的机器建议值，一期定级的实际落点。
   * 核实前列表按它显示，打标弹窗拿它当默认值；人工打标后由判定值覆盖
   * （口径 `gradeOf = 打标结果 ?? level`），所以它不是"初值就作废"，而是没人判时的对外口径。
   *
   * 与 riskGradeOf()（双轨矩阵算出的等级）是同一把刻度的两个来源，不是新旧关系：
   * 矩阵是目标态，需要「投诉二类 → 后果严重度」映射表落地后才成立，一期不参与定级。
   */
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
  /**
   * 谁说的。**一期不做、字段预留**（需求分析表 B-6）——
   * 沟通记录与催补记录无法可靠区分发话人（无 ASR 话者分离、无结构化发话人标记），
   * 故词表不设「角色限定」、命中列表也不展示。待话者识别能力具备后再启用。
   */
  speakerRole?: SpeakerRole;
  /** 后果严重度 */
  impact: RiskImpact;
  /** 后果严重度的依据（投诉二类），让分级可追溯 */
  impactSource: string;
  /** 外部信号强度 */
  signal: RiskSignal;
  /** 外部信号的依据：命中了什么 */
  signalSource: string;
  /**
   * 这条命中**从哪一轨进来的**——溯源信息，不参与定级。
   * 一期只跑词表轨（轨二缺「投诉二类 → 后果严重度」映射表未启用），
   * 因此一期能被人看到的命中一律是「外部信号」；标成「双轨」会让人误以为轨二已经在跑。
   * 三个取值都保留：轨二上线后「后果严重度」「双轨」才会真正产生。
   */
  track: '外部信号' | '后果严重度' | '双轨';
  /** 旧规则（纯词表）下的等级；`null` 表示旧规则根本召不回这条 */
  legacyLevel: RiskLevel | null;

  /** 监控岗打的标 */
  tagged?: RiskLevel;
  taggedBy?: string;
  /**
   * 打标人当时的角色（基线 §3.1）。事后复盘要问的是"谁判的、他有多少分量"——
   * 客诉专员判的与投诉督导判的，在追责与改判上不是一回事，只留姓名答不出这一层。
   */
  taggedByRole?: string;
  taggedAt?: string;
  taggedNote?: string;
  /** 复核回填：这次命中成不成立。没有它，词表永远不会自己变好 */
  verdict?: HitVerdict;

  /**
   * 风险是否兑现——命中之后该单最终有没有真升成投诉 / 外投。
   * **一期留字段不回填，二期接 `ticket.escalateComplaint` 事件自动回标**（2026-08-25 拍板）。
   *
   * 为什么必须留这个口：准确率只能证明「规则没误报」，证明不了「监控有价值」。
   * 只有把命中与后续是否真的爆掉对上，才算得出预警对了多少、漏了多少——
   * 这是评估整套风险监控成效的唯一依据。与 D6 风险事件同属"事后看效果"，一并二期做。
   */
  realized?: '已兑现' | '未兑现';
}

export const RISK_HITS: RiskHit[] = [
  {
    id: 'h1', ticketNo: 'IFLYTS-20260610-00002', title: '无线音乐播放跳过歌曲异常',
    word: '曝光', matchedWord: '媒体', level: '高', position: '沟通记录',
    excerpt: '再不解决我就找媒体曝光，我本身就是干这行的。',
    when: '2026-08-04 14:21', customer: '张小凡',
    groupId: 'cs-1', groupName: '受理一组', assignee: '王坐席',
    receivers: ['李文萍', '值班经理'],
    speakerRole: '客户',
    impact: '一般', impactSource: '产品功能/性能投诉 · 产品性能未达到顾客预期',
    signal: '强', signalSource: '命中「曝光」（同义词「媒体」）',
    track: '外部信号', legacyLevel: '高',
  },
  {
    id: 'h2', ticketNo: 'IFLYTS-20260711-00002', title: '外投·维修超期未解决客户要求赔偿',
    word: '12315', matchedWord: '12315', level: '高', position: '问题描述',
    excerpt: '客户要求赔偿并已向 12315 平台提交投诉。',
    when: '2026-08-04 13:58', customer: '吴强',
    groupId: 'hardware', groupName: '硬件缺陷组', assignee: '王坐席',
    receivers: ['值班经理', '投诉专员'],
    speakerRole: '客户',
    impact: '一般', impactSource: '流程规则投诉 · 售后维修方式不认可',
    signal: '强', signalSource: '命中「12315」',
    track: '外部信号', legacyLevel: '高',
    tagged: '高', taggedBy: '郑监控', taggedByRole: '投诉督导', taggedAt: '2026-08-04 14:03', taggedNote: '已进入外投流程，转投诉专员专项跟进',
    verdict: '成立',
  },
  {
    // 🔴 双轨的第一个反例：安全事故，客户全程平静、一个风险词都不说。
    // 纯词表下这条根本不出现在监控视野里 —— legacyLevel = null 就是这个意思。
    id: 'h6', ticketNo: 'IFLYZX-20260804-00002', title: '学习机充电时机身发烫、电池鼓包',
    word: '—', matchedWord: '—', level: '低', position: '问题描述',
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
    id: 'h3', ticketNo: 'IFLYZX-20260803-00009', title: '耳机充电仓无法配对',
    word: '退一赔三', matchedWord: '退一赔三', level: '中', position: '沟通记录',
    excerpt: '不给我退一赔三我就不接受这个方案。',
    when: '2026-08-04 13:30', customer: '孙莉',
    groupId: 'cs-1', groupName: '受理一组', assignee: '王坐席',
    receivers: ['值班经理'],
    speakerRole: '客户',
    impact: '一般', impactSource: '产品质量投诉 · 产品质量故障',
    signal: '中', signalSource: '命中「退一赔三」',
    track: '外部信号', legacyLevel: '中',
  },
  {
    // 🔴 双轨的第二个反例：流程规则类诉求，客户喊了 12315。
    // 纯词表下判高危、与真高危同级挤占资源；双轨下降为中危。
    id: 'h8', ticketNo: 'IFLYZX-20260804-00001', title: '账号密码找回需本人到店办理，客户不认可',
    word: '12315', matchedWord: '12315', level: '高', position: '沟通记录',
    excerpt: '这规定太离谱了，你们不改我就打 12315。',
    when: '2026-08-04 12:35', customer: '李海',
    groupId: 'cs-1', groupName: '受理一组', assignee: '赵坐席',
    receivers: ['值班经理', '投诉专员'],
    speakerRole: '客户',
    impact: '轻微', impactSource: '流程规则投诉 · 对规定的联系方式不认可',
    signal: '强', signalSource: '命中「12315」',
    track: '外部信号', legacyLevel: '高',
  },
  {
    id: 'h4', ticketNo: 'IFLYZX-20260802-00004', title: '智学网成绩同步延迟',
    word: '投诉到底', matchedWord: '投诉到底', level: '中', position: '问题描述',
    excerpt: '影响全校期末成绩录入，这次一定要投诉到底。',
    when: '2026-08-04 11:47', customer: '合肥八中',
    groupId: 'edu', groupName: '教育支持组', assignee: '孙坐席',
    receivers: ['值班经理'],
    speakerRole: '客户',
    impact: '一般', impactSource: '产品功能/性能投诉 · 产品性能未达到顾客预期',
    signal: '中', signalSource: '命中「投诉到底」',
    track: '外部信号', legacyLevel: '中',
  },
  {
    // 🔴 角色维度的价值：这句"曝光"是坐席说的。
    // 纯词表照样命中并判高危（误报）；加了角色限定后不再进入视野。
    id: 'h7', ticketNo: 'IFLYZX-20260801-00001', title: '智能办公本笔迹延迟咨询',
    word: '曝光', matchedWord: '曝光', level: '高', position: '沟通记录',
    excerpt: '（坐席）如果对处理结果不满意，您也可以向媒体曝光或向监管部门反映，这是您的权利。',
    when: '2026-08-04 10:52', customer: '钱伟',
    groupId: 'cs-1', groupName: '受理一组', assignee: '王坐席',
    receivers: ['李文萍', '值班经理'],
    speakerRole: '坐席',
    impact: '轻微', impactSource: '咨询类 · 无实质损失',
    // 🔴 2026-08-26 按 B-6 订正：原先这条把 signal 压到「无」，依据是"发话人为坐席"——
    // 但**角色限定一期不做**（沟通记录无法可靠区分谁说的），那个依据一期并不生效。
    // 数据不该偷偷保留一个功能上不存在的效果，否则评审时会以为一期已能识别坐席发话。
    // 现按一期真实行为：词表命中「媒体」即判信号强，与其他「曝光」命中同等对待。
    // 代价是"坐席说的曝光也被当风险"这个误报演示消失——但那本来就是一期的真实行为。
    signal: '强', signalSource: '命中「曝光」（同义词「媒体」）',
    track: '外部信号', legacyLevel: '高',
  },
  {
    id: 'h5', ticketNo: 'IFLYTS-20260731-00001', title: '智能音箱返修超期未回寄',
    word: '起诉', matchedWord: '起诉', level: '高', position: '催补记录',
    excerpt: '再拖下去我就走法律途径起诉你们。',
    when: '2026-08-04 09:12', customer: '吴强',
    groupId: 'hardware', groupName: '硬件缺陷组', assignee: '陈坐席',
    receivers: ['李文萍', '法务'],
    speakerRole: '客户',
    impact: '一般', impactSource: '流程规则投诉 · 售后维修方式不认可',
    signal: '强', signalSource: '命中「起诉」',
    track: '外部信号', legacyLevel: '高',
    tagged: '高', taggedBy: '郑监控', taggedByRole: '投诉督导', taggedAt: '2026-08-04 09:20', taggedNote: '同一客户第二次命中高危词，已上报法务',
    verdict: '成立',
  },
  {
    id: 'h9', ticketNo: 'IFLYZX-20260729-00001', title: '学习机屏幕自燃，孩子手部灼伤',
    word: '曝光', matchedWord: '媒体', level: '高', position: '问题描述',
    excerpt: '孩子受伤了你们还拖，我明天就联系媒体曝光这件事。',
    when: '2026-08-04 08:55', customer: '郭欣',
    groupId: 'edu', groupName: '教育支持组', assignee: '孙坐席',
    receivers: ['值班经理', '投诉专员'],
    speakerRole: '客户',
    impact: '严重', impactSource: '产品质量投诉 · 安全事故',
    signal: '强', signalSource: '命中「曝光」',
    track: '外部信号', legacyLevel: '高',
  },
  {
    id: 'h10', ticketNo: 'IFLYZX-20260726-00001', title: '翻译机固件升级后变砖',
    word: '曝光', matchedWord: '曝光', level: '高', position: '沟通记录',
    excerpt: '你们再拖，我就把聊天记录发到黑猫投诉上去曝光。',
    when: '2026-08-04 08:30', customer: '马涛',
    groupId: 'cs-2', groupName: '受理二组', assignee: '李坐席',
    receivers: ['李文萍', '值班经理'],
    speakerRole: '客户',
    impact: '一般', impactSource: '产品质量投诉 · 产品质量故障',
    signal: '强', signalSource: '命中「曝光」',
    track: '外部信号', legacyLevel: '高',
  },
  {
    id: 'h11', ticketNo: 'IFLYZX-20260722-00001', title: '会议系统录音丢失，客户要求赔偿',
    word: '起诉', matchedWord: '起诉', level: '高', position: '问题描述',
    excerpt: '重要会议录音全没了，造成的损失你们赔得起吗，我准备起诉。',
    when: '2026-08-03 17:42', customer: '安徽某院',
    groupId: 'tech-1', groupName: '技术支持组', assignee: '周坐席',
    receivers: ['李文萍', '法务'],
    speakerRole: '客户',
    impact: '一般', impactSource: '产品功能/性能投诉 · 产品性能未达到顾客预期',
    signal: '强', signalSource: '命中「起诉」',
    track: '外部信号', legacyLevel: '高',
  },
  {
    id: 'h12', ticketNo: 'IFLYZX-20260712-00001', title: '智能鼠标保修期认定争议',
    word: '12315', matchedWord: '12315', level: '高', position: '沟通记录',
    excerpt: '按你们这规矩我只能去消协了，12315 我也一起报。',
    when: '2026-08-03 16:18', customer: '田军',
    groupId: 'cs-2', groupName: '受理二组', assignee: '李坐席',
    receivers: ['值班经理', '投诉专员'],
    speakerRole: '客户',
    impact: '轻微', impactSource: '流程规则投诉 · 退换货政策不认可',
    signal: '强', signalSource: '命中「12315」',
    track: '外部信号', legacyLevel: '高',
  },
  {
    id: 'h13', ticketNo: 'IFLYZX-20260705-00001', title: '开放平台接口调用超额计费申诉',
    word: '投诉到底', matchedWord: '投诉到底', level: '中', position: '催补记录',
    excerpt: '客户第三次催，说再没结果就投诉到底。',
    when: '2026-08-03 15:05', customer: '某科技公司',
    groupId: 'tech-1', groupName: '技术支持组', assignee: '周坐席',
    receivers: ['值班经理'],
    speakerRole: '客户',
    impact: '一般', impactSource: '流程规则投诉 · 其他业务规则不认可',
    signal: '中', signalSource: '命中「投诉到底」',
    track: '外部信号', legacyLevel: '中',
  },
  {
    id: 'h14', ticketNo: 'IFLYZX-20260708-00001', title: '录音笔电池膨胀顶开外壳',
    word: '退一赔三', matchedWord: '退一赔三', level: '中', position: '沟通记录',
    excerpt: '电池都鼓成这样了，必须退一赔三，不然我不接受。',
    when: '2026-08-03 14:22', customer: '沈杰',
    groupId: 'hardware', groupName: '硬件缺陷组', assignee: '陈坐席',
    receivers: ['值班经理'],
    speakerRole: '客户',
    impact: '严重', impactSource: '产品质量投诉 · 安全事故',
    signal: '中', signalSource: '命中「退一赔三」',
    track: '外部信号', legacyLevel: '中',
  },
  {
    id: 'h15', ticketNo: 'IFLYZX-20260805-00003', title: '办公本触控笔断触频繁',
    word: '12315', matchedWord: '12315', level: '高', position: '沟通记录',
    excerpt: '修了两次还这样，我再给你们三天，不然直接 12315。',
    when: '2026-08-03 11:36', customer: '韩雪',
    groupId: 'cs-1', groupName: '受理一组', assignee: '赵坐席',
    receivers: ['值班经理', '投诉专员'],
    speakerRole: '客户',
    impact: '一般', impactSource: '产品质量投诉 · 产品质量故障',
    signal: '强', signalSource: '命中「12315」',
    track: '外部信号', legacyLevel: '高',
  },
  {
    id: 'h16', ticketNo: 'IFLYZX-20260805-00004', title: '智学网账号被误封无法登录',
    word: '投诉到底', matchedWord: '投诉到底', level: '中', position: '问题描述',
    excerpt: '期末关键节点账号被封，这次一定要投诉到底。',
    when: '2026-08-03 10:48', customer: '芜湖某校',
    groupId: 'edu', groupName: '教育支持组', assignee: '孙坐席',
    receivers: ['值班经理'],
    speakerRole: '客户',
    impact: '一般', impactSource: '产品功能/性能投诉 · 产品性能未达到顾客预期',
    signal: '中', signalSource: '命中「投诉到底」',
    track: '外部信号', legacyLevel: '中',
  },
  {
    id: 'h17', ticketNo: 'IFLYTS-20260805-00001', title: '扫地机器人回充失败撞墙',
    word: '曝光', matchedWord: '媒体', level: '高', position: '催补记录',
    excerpt: '新品就这质量？再不处理我就找媒体曝光你们。',
    when: '2026-08-03 09:15', customer: '刘洋',
    groupId: 'hardware', groupName: '硬件缺陷组', assignee: '陈坐席',
    receivers: ['李文萍', '值班经理'],
    speakerRole: '客户',
    impact: '一般', impactSource: '产品质量投诉 · 产品质量故障',
    signal: '强', signalSource: '命中「曝光」（同义词「媒体」）',
    track: '外部信号', legacyLevel: '高',
  },
  {
    id: 'h18', ticketNo: 'IFLYZX-20260718-00001', title: '医疗语音录入识别率低',
    word: '起诉', matchedWord: '起诉', level: '高', position: '沟通记录',
    excerpt: '影响出诊效率，若本周无方案我们将起诉索赔。',
    when: '2026-08-02 16:30', customer: '合肥某医院',
    groupId: 'tech-1', groupName: '技术支持组', assignee: '周坐席',
    receivers: ['李文萍', '法务'],
    speakerRole: '客户',
    impact: '一般', impactSource: '产品功能/性能投诉 · 产品性能未达到顾客预期',
    signal: '强', signalSource: '命中「起诉」',
    track: '外部信号', legacyLevel: '高',
    tagged: '高', taggedBy: '郑监控', taggedByRole: '投诉督导', taggedAt: '2026-08-02 16:45', taggedNote: 'B 端客户，已同步大客户专员',
    verdict: '成立',
  },
  {
    id: 'h19', ticketNo: 'IFLYZX-20260715-00002', title: '学习机护眼模式咨询',
    word: '退一赔三', matchedWord: '退一赔三', level: '中', position: '沟通记录',
    excerpt: '屏幕刺眼说护眼，这不欺诈吗，退一赔三。',
    when: '2026-08-02 14:08', customer: '徐岚',
    groupId: 'edu', groupName: '教育支持组', assignee: '孙坐席',
    receivers: ['值班经理'],
    speakerRole: '客户',
    impact: '轻微', impactSource: '咨询类 · 无实质损失',
    signal: '中', signalSource: '命中「退一赔三」',
    track: '外部信号', legacyLevel: '中',
    // 判为误报的记录**不带等级**：误报是"规则捞错了"，不是"风险很低"。
    // 给它留一个 tagged 会让界面同时出现「中风险」与「误报」两个互相打架的标签。
    taggedBy: '李文萍', taggedByRole: '客诉专员', taggedAt: '2026-08-02 14:20', taggedNote: '咨询类诉求，客户只是打比方，未指向外部渠道',
    verdict: '误报',
  },
  {
    id: 'h20', ticketNo: 'IFLYTS-20260804-00003', title: '耳机右耳无声，换货两次仍故障',
    word: '12315', matchedWord: '12315', level: '高', position: '问题描述',
    excerpt: '换货两次还是坏的，我已经向 12315 提交了材料。',
    when: '2026-08-02 11:22', customer: '陈静',
    groupId: 'cs-1', groupName: '受理一组', assignee: '王坐席',
    receivers: ['值班经理', '投诉专员'],
    speakerRole: '客户',
    impact: '一般', impactSource: '产品质量投诉 · 产品质量故障',
    signal: '强', signalSource: '命中「12315」',
    track: '外部信号', legacyLevel: '高',
  },

  // ====================================================================
  // 同一张单被多条规则先后命中
  //
  // 上面二十条各挂各的工单，于是「一张单先命中 A、后命中 B」这件事在数据里根本不存在——
  // 而它恰恰是 §4.9 工单级等级取 max、§6.7 同单互见这两条口径唯一的用武之地：
  // 没有同单多命中，工单级等级恒等于命中级等级，互见提示恒不出现，两条口径都无从验证。
  // 下面三条按两组场景补齐，**不改动上面任何一条**。
  // ====================================================================

  {
    // 【A 组 · 措辞爬坡】与 h15 同挂 IFLYZX-20260805-00003。
    // 客户先要「退一赔三」（已核实成立·中危，本条），三小时后改口「直接 12315」（h15，仍待核实）。
    // 两条各自成立、各自回填准确率，但风险是**连着读**才看得出来的：
    // 单看 12315 是一次常见威胁，接在退一赔三后面则是措辞在爬坡，严重度不是一个量级。
    // 本条把工单级等级先钉在「中」；等 h15 被核实成立·高，工单级按 max 升到「高」——
    // 这就是「只升不降」在界面上唯一看得见的一次动作。
    id: 'h21', ticketNo: 'IFLYZX-20260805-00003', title: '办公本触控笔断触频繁',
    word: '退一赔三', matchedWord: '退一赔三', level: '中', position: '沟通记录',
    excerpt: '笔换过一次还是断触，宣传写的防断触根本做不到，我要求退一赔三。',
    when: '2026-08-03 10:12', customer: '韩雪',
    groupId: 'cs-1', groupName: '受理一组', assignee: '赵坐席',
    receivers: ['值班经理'],
    speakerRole: '客户',
    impact: '一般', impactSource: '产品质量投诉 · 产品质量故障',
    signal: '中', signalSource: '命中「退一赔三」',
    track: '外部信号', legacyLevel: '中',
    tagged: '中', taggedBy: '李文萍', taggedByRole: '客诉专员', taggedAt: '2026-08-03 10:30', taggedNote: '客户诉求集中在换货与补偿，暂未指向外部渠道，交班组长跟进',
    verdict: '成立',
  },
  {
    // 【B 组 · 同单双待核 ①】与 h10、h23 同挂 IFLYZX-20260726-00001。
    // 两条都还没人判，工单级等级因此为空（未核实不参与取 max）——
    // 「本单另有 N 条」这个提示不能只在有人判过时才对，全待核才是这个岗位每天的常态。
    id: 'h22', ticketNo: 'IFLYZX-20260726-00001', title: '翻译机固件升级后变砖',
    word: '投诉到底', matchedWord: '投诉到底', level: '中', position: '沟通记录',
    excerpt: '一台机器折腾我一个星期，这次我投诉到底。',
    when: '2026-08-04 09:05', customer: '马涛',
    groupId: 'cs-2', groupName: '受理二组', assignee: '李坐席',
    receivers: ['值班经理'],
    speakerRole: '客户',
    impact: '一般', impactSource: '产品质量投诉 · 产品质量故障',
    signal: '中', signalSource: '命中「投诉到底」',
    track: '外部信号', legacyLevel: '中',
  },
  {
    // 【B 组 · 同单双待核 ②】同上单第三条。三条命中分属三条规则、命中位置各不相同，
    // 正是规则 19a「外层按规则全跑不中断」的产物：一句话踩两条规则就是两条独立证据，
    // 合并成一行会让其中一条永远拿不到核实结论，那条规则的准确率也就永远算不出来。
    id: 'h23', ticketNo: 'IFLYZX-20260726-00001', title: '翻译机固件升级后变砖',
    word: '起诉', matchedWord: '起诉', level: '高', position: '催补记录',
    excerpt: '客户再次催办，称已咨询律师，若本周不给方案就起诉。',
    when: '2026-08-04 09:48', customer: '马涛',
    groupId: 'cs-2', groupName: '受理二组', assignee: '李坐席',
    receivers: ['李文萍', '法务'],
    speakerRole: '客户',
    impact: '一般', impactSource: '产品质量投诉 · 产品质量故障',
    signal: '强', signalSource: '命中「起诉」',
    track: '外部信号', legacyLevel: '高',
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

/** 未打标且词表预设为高的命中（一期：仅风险词命中，等级由打标人填） */
export function untaggedHighRisks(scope: OpsScope): RiskHit[] {
  return wordOnlyRiskHitsOf(scope).filter((h) => h.level === '高' && !h.tagged);
}

/** 一期仅展示风险词命中的记录：legacyLevel=null 即非词表召回，属尚未启用的后果严重度轨 */
export function wordOnlyRiskHitsOf(scope: OpsScope): RiskHit[] {
  return riskHitsOf(scope).filter((h) => h.legacyLevel !== null);
}

// ======================================================================
// 手动批量筛查
//
// 【为什么需要】实时命中是增量、被动的——只对新写入的文本跑规则。于是两件事做不了：
//   ① 新增一条风险词，存量工单里早就写着这个词的**追溯不回来**；
//   ② 想专项排查"某组近 30 天有没有人提过 12315"，没有入口。
// 手动筛查补的就是这两条：选范围 + 选词 → 对**存量工单**跑一遍 → 出结果。
//
// 【对标】阿里云智能对话分析：规则创建 → 任务配置 → 选择待检数据集 → 执行质检 → 结果复核。
// 词表那列「近 7 天命中」本质就是这类扫描的产物，只是现在人点不动。
//
// 【口径】扫出来的命中走**同一套双轨定级与打标闭环**，不另立一套——
// 刚收口完"五套风险互不相通"，筛查若自带结果与定级就是第六套。
// ======================================================================

/** 可检字段。与词表「匹配范围」、处理表单字段逐字对应 */
export type ScanField = '标题' | '问题描述' | '沟通记录' | '催补记录' | '问题原因' | '处理结果';
export const SCAN_FIELDS: ScanField[] = ['标题', '问题描述', '沟通记录', '问题原因', '处理结果', '催补记录'];

/**
 * 手动筛查·工单状态筛选项（对齐基线 §1 全部子状态，值为**页面展示名称**）。
 * 落库值与展示名不一致的行（待领取、挂起审核中等）按第三列展示。
 */
export const SCAN_NODE_STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: '草稿', label: '草稿' },
  { value: '待领取', label: '待领取' },
  { value: '待响应', label: '待响应' },
  { value: '处理中', label: '处理中' },
  { value: '调研中', label: '调研中' },
  { value: '挂起审核中', label: '挂起审核中' },
  { value: '关闭审核中', label: '关闭审核中' },
  { value: '强结审核中', label: '强结审核中' },
  { value: '业务审核中', label: '业务审核中' },
  { value: '已挂起', label: '已挂起' },
  { value: '已升级技术支持', label: '已升级技术支持' },
  { value: '已升级产研', label: '已升级产研' },
  { value: '已升级投诉', label: '已升级投诉' },
  { value: '已升级外投', label: '已升级外投' },
  { value: '已委派', label: '已委派' },
  { value: '已退回', label: '已退回' },
  { value: '已转售后', label: '已转售后' },
  { value: '已结案', label: '已结案' },
  { value: '已关闭', label: '已关闭' },
  { value: '已强结', label: '已强结' },
  { value: '已转咨询', label: '已转咨询' },
  { value: '已转建议', label: '已转建议' },
  { value: '已转商机', label: '已转商机' },
  { value: '已取消', label: '已取消' },
  { value: '直接结案', label: '直接结案' },
];

/** 终态展示名集合——兼容旧版「在办 / 终态」粗筛迁移 */
export const TERMINAL_SCAN_STATUS_VALUES = [
  '已升级投诉', '已升级外投', '已结案', '已关闭', '已强结',
  '已转咨询', '已转建议', '已转商机', '已取消', '直接结案',
] as const;

export const IN_PROGRESS_SCAN_STATUS_VALUES = SCAN_NODE_STATUS_OPTIONS
  .map((o) => o.value)
  .filter((v) => !(TERMINAL_SCAN_STATUS_VALUES as readonly string[]).includes(v));

export interface ScannableTicketStatusCtx {
  nodeStatus: TicketStatus;
}

/**
 * 工单 → 筛查状态筛选项 value（与 SCAN_NODE_STATUS_OPTIONS 对齐）。
 *
 * 依据基线 §1「一跳一态、一去向一态」：25 个子状态与展示名一一对应，
 * 本函数因此收成一次查表——升级目标 / 转单去向 / 外投与否 / 结案方式
 * 都已经在子状态里，不必再取上下文字段来分支。
 */
export function scanStatusFilterKey(ctx: ScannableTicketStatusCtx): string {
  return statusDisplayName(ctx.nodeStatus);
}

/** 待扫工单：可检文本 + 用于范围过滤的维度 */
export interface ScannableTicket {
  ticketNo: string;
  title: string;
  texts: Partial<Record<ScanField, string>>;
  when: string;
  customer: string;
  groupId: string;
  groupName: string;
  assignee: string;
  /** 落库子状态（基线 §1 的 25 个之一；升级目标 / 转单去向都已在状态里） */
  nodeStatus: TicketStatus;
  ticketType: '投诉' | '咨询' | '建议' | '商机';
  businessType: string;
  productCategory: string;
  productName: string;
  /** 后果严重度与依据：来自投诉一类/二类树，即双轨里的轨二 */
  impact: RiskImpact;
  impactSource: string;
}

type RawScannableTicket = Omit<ScannableTicket, 'nodeStatus' | 'businessType' | 'productCategory' | 'productName'> & {
  nodeStatus?: TicketStatus;
  /** @deprecated 仅 enrich 回退；与 TICKETS 对不上的样例单用 */
  ticketState?: '在办' | '终态';
};

/** 存量筛查语料的产品维度（与新建工单弹窗字段对齐） */
const SCAN_TICKET_DIMS: Record<string, Pick<ScannableTicket, 'businessType' | 'productCategory' | 'productName'>> = {
  'IFLYTS-20260610-00002': { businessType: '翻录', productCategory: '智能硬件', productName: '智能音箱 X1' },
  'IFLYTS-20260711-00002': { businessType: '翻录', productCategory: '智能硬件', productName: '智能音箱 X1' },
  'IFLYZX-20260804-00002': { businessType: '学习机', productCategory: '学习硬件', productName: '学习机 T20' },
  'IFLYZX-20260803-00009': { businessType: '翻录', productCategory: '智能硬件', productName: '扫地机器人 R2' },
  'IFLYZX-20260804-00001': { businessType: '翻录', productCategory: '智能硬件', productName: '智能音箱 X1' },
  'IFLYZX-20260802-00004': { businessType: '智学网', productCategory: '软件服务', productName: '智学网会员' },
  'IFLYZX-20260801-00001': { businessType: '学习机', productCategory: '智能硬件', productName: '学习机 T20' },
  'IFLYTS-20260731-00001': { businessType: '翻录', productCategory: '智能硬件', productName: '智能音箱 X1' },
  'IFLYZX-20260729-00001': { businessType: '学习机', productCategory: '学习硬件', productName: '学习机 T20' },
  'IFLYZX-20260726-00001': { businessType: '翻录', productCategory: '智能硬件', productName: '智能音箱 X1' },
  'IFLYZX-20260722-00001': { businessType: '翻录', productCategory: '软件服务', productName: '讯飞听见' },
  'IFLYZX-20260718-00001': { businessType: '智学网', productCategory: '软件服务', productName: '讯飞听见' },
  'IFLYZX-20260715-00002': { businessType: '学习机', productCategory: '学习硬件', productName: '学习机 T20' },
  'IFLYZX-20260712-00001': { businessType: '翻录', productCategory: '智能硬件', productName: '扫地机器人 R2' },
  'IFLYZX-20260708-00001': { businessType: '翻录', productCategory: '智能硬件', productName: '智能音箱 X1' },
  'IFLYZX-20260705-00001': { businessType: '翻录', productCategory: '软件服务', productName: '讯飞听见' },
};

function resolveScanTicketDims(raw: RawScannableTicket): Pick<ScannableTicket, 'businessType' | 'productCategory' | 'productName'> {
  const found = TICKETS.find((x) => x.no === raw.ticketNo);
  const preset = SCAN_TICKET_DIMS[raw.ticketNo];
  if (found?.productCategory && found.product) {
    return {
      businessType: found.businessType ?? preset?.businessType ?? BUSINESS_TYPES[0],
      productCategory: found.productCategory,
      productName: found.product,
    };
  }
  return preset ?? { businessType: BUSINESS_TYPES[0], productCategory: PRODUCT_CATEGORIES[0], productName: PRODUCT_NAMES[PRODUCT_CATEGORIES[0]][0] };
}

function enrichScannableTicket(raw: RawScannableTicket): ScannableTicket {
  const dims = resolveScanTicketDims(raw);
  const found = TICKETS.find((x) => x.no === raw.ticketNo);
  if (found) {
    const { ticketState: _drop, nodeStatus: _n, ...rest } = raw;
    return { ...rest, ...dims, nodeStatus: found.nodeStatus };
  }
  const { ticketState, nodeStatus, ...rest } = raw;
  // 回退口径：终态取「已结案」（正常流程走完），不取建单即结的「直接结案」
  return {
    ...rest,
    ...dims,
    nodeStatus: nodeStatus ?? (ticketState === '终态' ? '已结案' : '处理中'),
  };
}

/**
 * 存量工单语料。
 * 前 8 条与 RISK_HITS 同单号，用来演示「已在清单中的不重复入库」；
 * 其余是只有手动筛查才捞得回来的存量单（当时无此词条，或已进终态）。
 */
const RAW_SCANNABLE_TICKETS: RawScannableTicket[] = [
  { ticketNo: 'IFLYTS-20260610-00002', title: '无线音乐播放跳过歌曲异常', texts: { 沟通记录: '再不解决我就找媒体曝光，我本身就是干这行的。' }, when: '2026-08-04 14:21', customer: '张小凡', groupId: 'cs-1', groupName: '受理一组', assignee: '王坐席', ticketState: '在办', ticketType: '投诉', impact: '一般', impactSource: '产品功能/性能投诉 · 产品性能未达到顾客预期' },
  // 问题描述同样是整段陈述。这一条的命中词落在开头，向前取不满 40 字就取到句首为止，
  // 于是只有尾部该出省略号——省略号说的是"这一侧还有没显示的内容"，不是装饰。
  { ticketNo: 'IFLYTS-20260711-00002', title: '外投·维修超期未解决客户要求赔偿', texts: { 问题描述: '客户要求赔偿并已向 12315 平台提交投诉，称机器送修已超过承诺时限半个多月，期间多次致电均未获得明确进度答复，现要求按三包规定退换或折价赔偿，并希望有人当面说明后续处理方案。' }, when: '2026-08-04 13:58', customer: '吴强', groupId: 'hardware', groupName: '硬件缺陷组', assignee: '王坐席', ticketState: '在办', ticketType: '投诉', impact: '一般', impactSource: '流程规则投诉 · 售后维修方式不认可' },
  { ticketNo: 'IFLYZX-20260804-00002', title: '学习机充电时机身发烫、电池鼓包', texts: { 问题描述: '孩子用的时候发现后盖鼓起来了，摸着烫手，我先停用了，麻烦帮忙看看怎么处理。' }, when: '2026-08-04 14:06', customer: '周敏', groupId: 'edu', groupName: '教育支持组', assignee: '孙坐席', ticketState: '在办', ticketType: '投诉', impact: '严重', impactSource: '产品质量投诉 · 安全事故' },
  { ticketNo: 'IFLYZX-20260803-00009', title: '耳机充电仓无法配对', texts: { 沟通记录: '不给我退一赔三我就不接受这个方案。' }, when: '2026-08-04 13:30', customer: '孙莉', groupId: 'cs-1', groupName: '受理一组', assignee: '王坐席', ticketState: '在办', ticketType: '投诉', impact: '一般', impactSource: '产品质量投诉 · 产品质量故障' },
  { ticketNo: 'IFLYZX-20260804-00001', title: '账号密码找回需本人到店办理，客户不认可', texts: { 沟通记录: '这规定太离谱了，你们不改我就打 12315。' }, when: '2026-08-04 12:35', customer: '李海', groupId: 'cs-1', groupName: '受理一组', assignee: '赵坐席', ticketState: '在办', ticketType: '投诉', impact: '轻微', impactSource: '流程规则投诉 · 对规定的联系方式不认可' },
  { ticketNo: 'IFLYZX-20260802-00004', title: '智学网成绩同步延迟', texts: { 问题描述: '影响全校期末成绩录入，这次一定要投诉到底。' }, when: '2026-08-04 11:47', customer: '合肥八中', groupId: 'edu', groupName: '教育支持组', assignee: '孙坐席', ticketState: '在办', ticketType: '投诉', impact: '一般', impactSource: '产品功能/性能投诉 · 产品性能未达到顾客预期' },
  { ticketNo: 'IFLYZX-20260801-00001', title: '智能办公本笔迹延迟咨询', texts: { 沟通记录: '如果对处理结果不满意，您也可以向媒体曝光或向监管部门反映，这是您的权利。' }, when: '2026-08-04 10:52', customer: '钱伟', groupId: 'cs-1', groupName: '受理一组', assignee: '王坐席', ticketState: '在办', ticketType: '咨询', impact: '轻微', impactSource: '咨询类 · 无实质损失' },
  { ticketNo: 'IFLYTS-20260731-00001', title: '智能音箱返修超期未回寄', texts: { 催补记录: '再拖下去我就走法律途径起诉你们。' }, when: '2026-08-04 09:12', customer: '吴强', groupId: 'hardware', groupName: '硬件缺陷组', assignee: '陈坐席', ticketState: '在办', ticketType: '投诉', impact: '一般', impactSource: '流程规则投诉 · 售后维修方式不认可' },

  { ticketNo: 'IFLYZX-20260729-00001', title: '学习机屏幕自燃，孩子手部灼伤', texts: { 问题描述: '孩子在写作业时屏幕突然冒烟起火，手背烫伤了，已经去医院处理。我要求你们给个说法。', 催补记录: '客户追问处理进度，情绪激动。' }, when: '2026-07-29 16:40', customer: '郭欣', groupId: 'edu', groupName: '教育支持组', assignee: '孙坐席', ticketState: '在办', ticketType: '投诉', impact: '严重', impactSource: '产品质量投诉 · 安全事故' },
  // 沟通记录按真实形态存**整段多轮对话**，不是一句话。命中片段的取窗与高亮正是冲着它来的：
  // 扫库取的是整个字段，整段直出会撑爆行，人还得自己在里面找命中词在哪。
  { ticketNo: 'IFLYZX-20260726-00001', title: '翻译机固件升级后变砖', texts: { 沟通记录: '客户来电反馈翻译机升级固件后完全无法开机，已按指引长按电源键三十秒仍无任何反应。坐席说明需寄回检测，客户表示上周才寄修过一次，来回折腾半个多月，这次不接受再等。客户情绪激动，称你们再拖，我就把聊天记录发到黑猫投诉上去曝光。坐席致歉并承诺当日安排加急检测，回电时间约在明日上午。' }, when: '2026-07-26 10:15', customer: '马涛', groupId: 'cs-2', groupName: '受理二组', assignee: '李坐席', ticketState: '在办', ticketType: '投诉', impact: '一般', impactSource: '产品质量投诉 · 产品质量故障' },
  { ticketNo: 'IFLYZX-20260722-00001', title: '会议系统录音丢失，客户要求赔偿', texts: { 问题描述: '重要会议录音全没了，造成的损失你们赔得起吗，我准备起诉。', 问题原因: '录音服务节点异常，文件未成功落盘', 处理结果: '已恢复部分文件，客户仍不接受，称若本周无进展将继续起诉索赔' }, when: '2026-07-22 09:28', customer: '安徽某院', groupId: 'tech-1', groupName: '技术支持组', assignee: '周坐席', ticketState: '终态', ticketType: '投诉', impact: '一般', impactSource: '产品功能/性能投诉 · 产品性能未达到顾客预期' },
  { ticketNo: 'IFLYZX-20260718-00001', title: '医疗语音录入识别率低', texts: { 问题描述: '识别率太低影响出诊，孩子科室的病历全要重打。' }, when: '2026-07-18 15:02', customer: '合肥某医院', groupId: 'tech-1', groupName: '技术支持组', assignee: '周坐席', ticketState: '在办', ticketType: '投诉', impact: '一般', impactSource: '产品功能/性能投诉 · 产品性能未达到顾客预期' },
  { ticketNo: 'IFLYZX-20260715-00002', title: '学习机护眼模式咨询', texts: { 问题描述: '想问下孩子长期用会不会伤眼睛，有没有护眼设置。' }, when: '2026-07-15 11:20', customer: '徐岚', groupId: 'edu', groupName: '教育支持组', assignee: '孙坐席', ticketState: '终态', ticketType: '咨询', impact: '轻微', impactSource: '咨询类 · 无实质损失' },
  { ticketNo: 'IFLYZX-20260712-00001', title: '智能鼠标保修期认定争议', texts: { 沟通记录: '按你们这规矩我只能去消协了。' }, when: '2026-07-12 14:55', customer: '田军', groupId: 'cs-2', groupName: '受理二组', assignee: '李坐席', ticketState: '在办', ticketType: '投诉', impact: '轻微', impactSource: '流程规则投诉 · 退换货政策不认可' },
  { ticketNo: 'IFLYZX-20260708-00001', title: '录音笔电池膨胀顶开外壳', texts: { 问题描述: '电池鼓起来把外壳顶开了，怕出事已经不敢用了。', 问题原因: '电芯老化膨胀，属产品质量缺陷', 处理结果: '已安排换新并上门取件，客户要求退一赔三，暂未达成一致' }, when: '2026-07-08 08:47', customer: '沈杰', groupId: 'hardware', groupName: '硬件缺陷组', assignee: '陈坐席', ticketState: '终态', ticketType: '投诉', impact: '严重', impactSource: '产品质量投诉 · 安全事故' },
  { ticketNo: 'IFLYZX-20260705-00001', title: '开放平台接口调用超额计费申诉', texts: { 催补记录: '客户第三次催，说再没结果就投诉到底。' }, when: '2026-07-05 17:33', customer: '某科技公司', groupId: 'tech-1', groupName: '技术支持组', assignee: '周坐席', ticketState: '在办', ticketType: '投诉', impact: '一般', impactSource: '流程规则投诉 · 其他业务规则不认可' },
];

export const SCANNABLE_TICKETS: ScannableTicket[] = RAW_SCANNABLE_TICKETS.map(enrichScannableTicket);

export const SCAN_TICKET_TYPES = ['投诉', '咨询', '建议', '商机'] as const;
export const SCAN_BUSINESS_TYPES = BUSINESS_TYPES;
export const SCAN_PRODUCT_CATEGORIES = PRODUCT_CATEGORIES;

/** 筛查条件。空数组一律表示「不限」 */
export interface ScanCriteria {
  groupIds: string[];
  /** 参与本次筛查的词条 id，空＝全部启用中的词 */
  wordIds: string[];
  /** 起止日期 `YYYY-MM-DD`，闭区间 */
  from: string;
  to: string;
  /** 匹配范围，空＝按每条词自身配置的范围 */
  matchScopes: ScanField[];
  /** 工单子状态（页面展示名），空＝不限。对齐基线 §1 全部子状态 */
  nodeStatuses: string[];
  ticketTypes: string[];
  businessTypes: string[];
  productCategories: string[];
  productNames: string[];
}

/** 今天（`YYYY-MM-DD`）——默认区间的右端点，取调用时刻而非模块加载时刻 */
function todayStr(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** 手动筛查表单默认值（默认等价于旧版「在办」粗筛） */
export function defaultScanCriteria(overrides?: Partial<ScanCriteria>): ScanCriteria {
  return {
    groupIds: [],
    wordIds: [],
    from: '2026-07-01',
    // 右端点给到今天，默认值本身就不是无界的（规则 42）。
    // 留空的话，任何一处忘了补 to 都会静默变成一次全库扫描——而扫库的产出是"新命中"，
    // 一次失手就把待核实队列灌满且不可逆，这个代价不该由"某处忘了传参"来触发。
    to: todayStr(),
    matchScopes: [],
    nodeStatuses: [...IN_PROGRESS_SCAN_STATUS_VALUES],
    ticketTypes: [],
    businessTypes: [],
    productCategories: [],
    productNames: [],
    ...overrides,
  };
}

/** 兼容 localStorage 里旧版 ticketState / productLines 字段 */
export function normalizeScanCriteria(raw: Partial<ScanCriteria> & { ticketState?: string; productLines?: string[] }): ScanCriteria {
  const base = defaultScanCriteria();
  let nodeStatuses = raw.nodeStatuses ?? base.nodeStatuses;
  if (!raw.nodeStatuses?.length && raw.ticketState) {
    if (raw.ticketState === '全部') nodeStatuses = [];
    else if (raw.ticketState === '在办') nodeStatuses = [...IN_PROGRESS_SCAN_STATUS_VALUES];
    else if (raw.ticketState === '终态') nodeStatuses = [...TERMINAL_SCAN_STATUS_VALUES];
  }
  return {
    groupIds: raw.groupIds ?? base.groupIds,
    wordIds: raw.wordIds ?? base.wordIds,
    from: raw.from ?? base.from,
    to: raw.to ?? base.to,
    matchScopes: raw.matchScopes ?? base.matchScopes,
    nodeStatuses,
    ticketTypes: raw.ticketTypes ?? base.ticketTypes,
    businessTypes: raw.businessTypes ?? base.businessTypes,
    productCategories: raw.productCategories ?? base.productCategories,
    productNames: raw.productNames ?? base.productNames,
  };
}

export interface ScanResultRow {
  hit: RiskHit;
  /** 已在命中清单中——重复入库会把同一条记两遍，预览时单独标出并默认不勾选 */
  duplicated: boolean;
}

/** 外部信号强度按命中词的词表分级推：高＝指名外部渠道，中＝有威胁未指名 */
function signalOfWord(w: RiskWord): RiskSignal {
  return w.level === '高' ? '强' : w.level === '中' ? '中' : '无';
}

/**
 * 一条规则在一段文本里命中了哪个表达：主词与同义词在规则内取或。
 * 取**原文中最先出现**的那个，而不是固定回主词——复核的人拿着它去原文里定位，
 * 回一个原文中不存在的词等于没给依据。
 */
function matchedTermIn(w: RiskWord, text: string): string | null {
  let term: string | null = null;
  let at = -1;
  for (const candidate of [w.word, ...w.synonyms]) {
    const i = text.indexOf(candidate);
    if (i < 0) continue;
    if (at < 0 || i < at) { at = i; term = candidate; }
  }
  return term;
}

/** 手动筛查的外部依赖：词表与判重底表都由调用方给，函数自己不去猜"现在页面上是什么" */
export interface ManualScanContext {
  /**
   * 参与本次筛查的词表。
   * 必须由调用方传页面上那一份——模块级 RISK_WORDS 是初始快照，
   * 用它扫的话，人刚新建的词条选中后一条都扫不出来，界面上看就是"筛查坏了"。
   */
  words?: RiskWord[];
  /**
   * 本会话已并入清单的命中。判重底表少了它，同样条件再扫一次，
   * 已并入的行会被重新标成「新命中」并默认勾选，点并入后实际入库 0 条却报「已并入 N 条」——
   * 一次假成功比扫不出来更伤人：它让人以为这批已经处理过了。
   */
  adopted?: RiskHit[];
}

/**
 * 执行一次手动筛查。**纯读、不落库**——结果先给人看，确认后才并入清单。
 * 匹配方式与实时链路一致（包含匹配），所以预览里看到的等级就是入库后的等级。
 */
export function runManualScan(c: ScanCriteria, ctx: ManualScanContext = {}): ScanResultRow[] {
  // 停用的词一律不参与筛查。停用是维护人给规则下的判决——「孩子」7 天命中 142 次、
  // 准确率 8%，正因为噪音太大才被停掉；让它继续参与筛查等于把当初停用它的理由重演一遍。
  const words = (ctx.words ?? RISK_WORDS).filter(
    (w) => w.enabled && (c.wordIds.length === 0 || c.wordIds.includes(w.id)),
  );
  /**
   * 判重键＝工单号 + **规则标识**（PRD §8.3 辨析三）。
   *
   * 【为什么三处必须是同一把键】本次扫描内去重（`emitted`）、与已有清单比对（`existing`）、
   * 并入时的最后一道，用的必须是同一把。产出用一把、判重用另一把，会出现两种方向相反的错：
   * 要么「结果里标着已在清单、清单里却找不到」——人既不能勾它也无从核对；
   * 要么同一条命中被记两遍，而「发现」正是对外讲价值的依据，记两遍就虚高。
   * 这里一度是 `emitted` 按规则 id、`existing` 按主词，两把键各走各的。
   *
   * 【为什么键里是「规则」不是「词」】同义词命中一律归主词名下，
   * 一句话里同时出现主词与同义词只算一条（§4.3 口径 1）。
   *
   * 【命中记录上怎么拿到规则标识】`RiskHit` 存的是主词而非规则 id，故按主词反查规则。
   * 反查之所以稳，是因为**主词是词表里唯一不可改的字段**（§4.11）——它一旦可改，
   * 历史命中与这把键当场对不上号，那批命中在台账里失去归属。
   * 反查不到的（如尚未启用的「后果严重度」轨那类不带主词的命中）按原值兜底：
   * 它本就不属于任何一条词表规则，与任何规则 id 都撞不上。
   */
  const ruleKey = (ticketNo: string, ruleId: string) => `${ticketNo}|${ruleId}`;
  // 反查表取**全量**词表而非本次筛查选中的那几条：停用词、未选中的词同样产生过历史命中，
  // 少了它们，那些命中会退回按主词兜底，与新扫出来的同规则命中对不上。
  const ruleIdByWord = new Map((ctx.words ?? RISK_WORDS).map((w) => [w.word, w.id]));
  const existing = new Set(
    [...RISK_HITS, ...(ctx.adopted ?? [])].map(
      (h) => ruleKey(h.ticketNo, ruleIdByWord.get(h.word) ?? h.word),
    ),
  );
  const out: ScanResultRow[] = [];
  /** 本次扫描内的去重键，与 existing 同一把：一条规则在同一张单上只产出一条命中 */
  const emitted = new Set<string>();

  for (const t of SCANNABLE_TICKETS) {
    if (c.groupIds.length && !c.groupIds.includes(t.groupId)) continue;
    if (c.nodeStatuses.length) {
      const key = scanStatusFilterKey(t);
      if (!c.nodeStatuses.includes(key)) continue;
    }
    if (c.ticketTypes.length && !c.ticketTypes.includes(t.ticketType)) continue;
    if (c.businessTypes.length && !c.businessTypes.includes(t.businessType)) continue;
    if (c.productCategories.length && !c.productCategories.includes(t.productCategory)) continue;
    if (c.productNames.length && !c.productNames.includes(t.productName)) continue;
    const day = t.when.slice(0, 10);
    if (c.from && day < c.from) continue;
    if (c.to && day > c.to) continue;

    for (const w of words) {
      // 匹配范围：筛查条件选了就以它为准（本次临时收窄），没选则按词条自身配置。
      //
      // 🔴 一律按 SCAN_FIELDS 的规范顺序遍历，不用多选框里的勾选顺序。
      // 命中位置取「第一个命中的字段」（PRD §5.4.2），这个"第一个"必须可预测——
      // 按勾选顺序跑的话，先点沟通记录再点标题，同一份数据就会给出另一个命中位置，
      // 复核的人拿着它去原文里定位会对不上账。
      const picked = (c.matchScopes.length ? c.matchScopes : w.scopes) as ScanField[];
      const fields = SCAN_FIELDS.filter((f) => picked.includes(f));
      const dedupKey = ruleKey(t.ticketNo, w.id);
      if (emitted.has(dedupKey)) continue;
      for (const f of fields) {
        const text = f === '标题' ? t.title : t.texts[f];
        if (!text) continue;
        const term = matchedTermIn(w, text);
        if (!term) continue;
        emitted.add(dedupKey);
        out.push({
          // 与 emitted 同一个 dedupKey，不再另拼一把按主词的键
          duplicated: existing.has(dedupKey),
          hit: {
            id: `scan-${t.ticketNo}-${w.id}`,
            ticketNo: t.ticketNo, title: t.title,
            word: w.word, matchedWord: term, level: w.level,
            position: f, excerpt: text,
            when: t.when, customer: t.customer,
            groupId: t.groupId, groupName: t.groupName, assignee: t.assignee,
            receivers: w.receivers,
            impact: t.impact, impactSource: t.impactSource,
            signal: signalOfWord(w),
            signalSource: term === w.word ? `命中「${w.word}」` : `命中「${w.word}」（同义词「${term}」）`,
            // 手动筛查跑的是词表规则匹配，来源就是外部信号轨；后果严重度轨不参与本次产出
            track: '外部信号', legacyLevel: w.level,
          },
        });
        break; // 同一条规则在同一张单上只记一次，不按字段重复计数
      }
    }
  }
  return out.sort((a, b) => b.hit.when.localeCompare(a.hit.when));
}
