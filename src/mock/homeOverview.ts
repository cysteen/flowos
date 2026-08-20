/** 首页·工作概览 Mock（对齐 .pen vzMJ3 / PRD-01） */

import { TICKETS } from '@/mock/tickets';
import {
  isFirstResponded,
  inMineTaskScope,
  PRIORITY_COLOR,
  slaUrgencyCompare,
  TYPE_COLOR,
  type Ticket,
} from '@/views/tickets/types/ticket';

export interface HomeNotice {
  id: number;
  tag: '系统维护' | '运营通知' | '制度更新';
  title: string;
  content: string;
  scope: string;
  publisher: string;
  publishAt: string;
  top?: boolean;
}

export const HOME_NOTICES: HomeNotice[] = [
  {
    id: 1,
    tag: '系统维护',
    title: '【系统维护】6/15 工单系统例行升级',
    content:
      '6/15 00:00–02:00 工单系统例行升级，请提前保存草稿；维护期间暂停派单，预计 02:00 恢复，给您带来的不便敬请谅解。',
    scope: '全员',
    publisher: '运维中心',
    publishAt: '2026-06-14 18:00',
    top: true,
  },
  {
    id: 2,
    tag: '制度更新',
    title: '客服工单处理时效规范（6 月修订版）发布',
    content:
      '投诉类工单首响时限调整为 30 分钟、解决时限 4 小时；咨询类首响 1 小时。请各班组组长组织学习，6/20 起正式执行。',
    scope: '全体坐席 / 班组长',
    publisher: '质量管理部',
    publishAt: '2026-06-12 10:30',
  },
  {
    id: 3,
    tag: '运营通知',
    title: '6 月服务之星评选启动',
    content:
      '本月起开展“服务之星”评选，依据工单解决量、满意度、SLA 达成率综合排名，TOP3 将获得奖励，截止 6/30。',
    scope: '全员',
    publisher: '运营中心',
    publishAt: '2026-06-10 09:00',
  },
];

export const HOME_NOTICE = {
  text: HOME_NOTICES[0].content,
  total: HOME_NOTICES.length,
};

/**
 * 「?」口径提示 —— **只有一句话**（2026-08-05 业务定）。
 *
 * ⚠️ **不要照搬 PRD 的口径表**。PRD 要完备（研发测试逐条核对），提示只回答
 * "这个数是什么"，两者受众不同。
 *
 * 演进：七行（照搬 PRD 七列）→ 三行（是什么/算什么不算什么/提醒）→ **一行**。
 * 砍到一行的原因是**写得越细越容易被质疑** —— 边界条件、易混提醒这类内容
 * 一旦挂在界面上就成了对外承诺，口径微调就得改 UI。完整口径以 PRD 为准。
 *
 * 写作约定：
 * · **一句话**，口语，不超过 20 字，不用术语
 * · 纯文本渲染，**不要写 Markdown** —— 星号会原样显示
 * · 不写计入/排除边界、不写易混提醒、不写更新频率与下钻去向
 */
export interface KpiTip {
  /** 这个数是什么。口语、一句话、不超过 20 字 */
  define: string;
}

export interface HomeKpi {
  key: string;
  label: string;
  value: string;
  valueColor: string;
  /** hover「?」展示的口径说明 */
  tip: KpiTip;
  /** 视觉权重：risk 要盯紧 / gain 正向成就 / neutral 中性 */
  tone: 'risk' | 'gain' | 'neutral';
  delta?: string;
  deltaColor?: string;
  suffix?: string;
}

/**
 * 区A · 今日概览（PRD §5 · A1–A7）
 *
 * 一区一种语义：**只放数量**，率值一律归「我的绩效」区（规范 R1b）。
 * 含：待处理 / 处理中 / 挂起 / 今日下送 / 临期 / 超时 / 当日通话。
 * 通用约定（不逐卡重复）：某项取不到时显示「—」并隐藏环比，卡片不塌陷。
 */
export const HOME_KPIS: HomeKpi[] = [
  {
    key: 'todo',
    label: '待处理工单',
    value: '6',
    valueColor: '#F97316',
    tone: 'risk',
    tip: {
      define: '派给我、还没开始动的单',
    },
    delta: '+2',
    deltaColor: '#EF4444',
  },
  {
    key: 'processing',
    label: '处理中',
    value: '9',
    valueColor: '#0D9488',
    tone: 'neutral',
    tip: {
      define: '我正在推进的单',
    },
  },
  {
    key: 'suspended',
    label: '挂起',
    value: '3',
    valueColor: '#8B5CF6',
    tone: 'neutral',
    tip: {
      define: '我名下在等外部反馈的单',
    },
  },
  {
    key: 'resolved-today',
    label: '今日下送',
    value: '14',
    valueColor: '#10B981',
    tone: 'gain',
    tip: {
      define: '我今天处置掉的单',
    },
    delta: '+5',
    deltaColor: '#10B981',
  },
  {
    key: 'soon',
    label: '临期',
    value: '1',
    valueColor: '#F59E0B',
    tone: 'risk',
    tip: {
      define: '快超时、还来得及救的单',
    },
    delta: '-1',
    deltaColor: '#10B981',
  },
  {
    key: 'overdue',
    label: '超时',
    value: '1',
    valueColor: '#EF4444',
    tone: 'risk',
    tip: {
      define: '已超时、还没救回来的单',
    },
  },
  {
    key: 'call-duration',
    label: '当日通话',
    value: '2h46m',
    valueColor: '#1A6FFF',
    tone: 'neutral',
    tip: {
      define: '我今天在电话上花的总时长',
    },
  },
];

export const HOME_TYPE_DIST = [
  { label: '投诉', pct: 32, color: '#EF4444' },
  { label: '咨询', pct: 28, color: '#1A6FFF' },
  { label: '建议', pct: 22, color: '#10B981' },
  { label: '商机', pct: 18, color: '#F59E0B' },
];

export interface HomeEfficiencyRow {
  label: string;
  value: string;
  badge: string;
  badgeType: 'good' | 'neutral';
}

export const HOME_EFFICIENCY: HomeEfficiencyRow[] = [
  { label: '平均首响', value: '8 分钟', badge: '↑ 优于团队', badgeType: 'good' },
  { label: '平均解决时长', value: '3.2 小时', badge: '持平', badgeType: 'neutral' },
  { label: '一次解决率', value: '86%', badge: '↑ 优于', badgeType: 'good' },
  { label: '满意度', value: '4.7 / 5', badge: '↑ 优于', badgeType: 'good' },
];

export type HomeMetricDrillKey = 'survey-pending' | 'follow-missed' | 'bad-review';

export interface HomePerformanceMetric {
  label: string;
  value: string;
  tone?: 'primary' | 'success' | 'warning' | 'danger' | 'neutral';
}

/** 个人绩效卡：一张卡对应一个组内排名口径，可包含多个关联指标。 */
export interface HomePerformanceCard {
  key: string;
  title: string;
  metrics: HomePerformanceMetric[];
  rank: number;
  teamSize: number;
  rankLabel?: string;
  drill?: HomeMetricDrillKey;
  drillLabel?: string;
}

export interface HomeMetricDrillTable {
  title: string;
  columns: string[];
  rows: { cells: string[]; ticketNo?: string }[];
}

/**
 * 效能区 12 项的「?」口径提示；key ＝【815】PRD §5.4 的指标编号。
 * 写作约定同 HOME_KPIS.tip：最多三行，纯文本。
 */
export const HOME_PERF_TIPS: Record<string, KpiTip> = {
  B1: {
    define: '我呼出接通的电话，平均每通多久',
  },
  B2: {
    define: '这段时间我处置掉的单',
  },
  B3: {
    define: '我的通话时长比组均长多少 / 短多少',
  },
  C1: {
    define: '我首响过的单里，多少比例踩在时限内',
  },
  C2: {
    define: '我解决掉的单里，多少比例踩在时限内',
  },
  C3: {
    define: '这段时间一共爆过几单超时',
  },
  D1: {
    define: '客户给我打分的平均值，5 分制',
  },
  D2: {
    define: '我下送的单里，多少比例走到了「已解决」',
  },
  D3: {
    define: '发出的调研里，多少比例客户真的评了',
  },
  E1: {
    define: '派给我满 24 小时的单里，多少比例联络过',
  },
  E2: {
    define: '我打出去的电话，多少比例接通了',
  },
  E3: {
    define: '我在线的时间里，多少比例真的在通话',
  },
};

/** 指标名 → 编号。下送量与较组均随区间/班组变名，另在 homePerfTip 里兜 */
const PERF_TIP_BY_LABEL: Record<string, string> = {
  平均通话时长: 'B1',
  响应及时率: 'C1',
  解决及时率: 'C2',
  超时工单: 'C3',
  服务满意度: 'D1',
  解决率: 'D2',
  参评率: 'D3',
  '24小时联络率': 'E1',
  外呼接通率: 'E2',
  通时利用率: 'E3',
};

/**
 * 按效能区指标名取「?」提示。
 * 「当日/区间下送量」随区间变名、「较受理一均」随所选班组变名，
 * 所以不能只靠全等匹配。
 */
export function homePerfTip(label: string): KpiTip | undefined {
  if (label.endsWith('下送量')) return HOME_PERF_TIPS.B2;
  if (label.startsWith('较') && label.endsWith('均')) return HOME_PERF_TIPS.B3;
  return HOME_PERF_TIPS[PERF_TIP_BY_LABEL[label]];
}

/**
 * 区B · 我的绩效（2026-08-03 重组）
 *
 * 原为 7 张卡、行数 1/1/5/3/1/1/2 —— 严重参差，高度拉齐后短卡全是空白，
 * 这是「杂乱」的根因（参考页每区内卡片行数严格一致，连次要指标区也是 9 行）。
 *
 * 改为按**指标族**归组：4 张卡 × **严格 3 个指标行**，一行排满、无空格、无参差。
 * 需求模块3 的 7 项一个不少，只是换了归组方式：
 *   效率 ← 平均通话时长(1) + 当日下送量(2)
 *   时效 ← 超时工单数 + 响应/解决及时率(3)
 *   质量 ← 服务满意度 / 解决率(7) + 参评率(5)
 *   触达 ← 24小时联络率(6) + 外呼接通率 / 通时利用率(4)
 * 「当日通话时长」是数量，已移到区A。
 *
 * ⚠️ 各卡 metrics 必须恒为 3 条 —— 增删指标时要同步调整分组，不要破坏等长。
 */
export const HOME_PERFORMANCE: HomePerformanceCard[] = [
  {
    key: 'efficiency',
    title: '效率',
    metrics: [
      { label: '平均通话时长', value: '3.2 小时', tone: 'primary' },
      { label: '当日下送量', value: '14 单', tone: 'success' },
      { label: '较组均', value: '-0.4 小时', tone: 'success' },
    ],
    rank: 3,
    teamSize: 12,
  },
  {
    key: 'sla',
    title: '时效',
    metrics: [
      { label: '响应及时率', value: '97.2%', tone: 'success' },
      { label: '解决及时率', value: '94.6%', tone: 'success' },
      { label: '超时工单', value: '3 单', tone: 'danger' },
    ],
    rank: 4,
    teamSize: 12,
    rankLabel: '及时率排名',
  },
  {
    key: 'quality',
    title: '质量',
    metrics: [
      { label: '服务满意度', value: '4.7 / 5', tone: 'success' },
      { label: '解决率', value: '86.0%', tone: 'success' },
      { label: '参评率', value: '82.0%', tone: 'warning' },
    ],
    rank: 2,
    teamSize: 12,
    drill: 'bad-review',
    drillLabel: '查看差评工单',
  },
  {
    key: 'reach',
    title: '触达',
    metrics: [
      { label: '24小时联络率', value: '91.7%', tone: 'success' },
      { label: '外呼接通率', value: '68.0%', tone: 'warning' },
      { label: '通时利用率', value: '76.3%', tone: 'success' },
    ],
    rank: 3,
    teamSize: 12,
    drill: 'follow-missed',
    drillLabel: '查看未跟进',
  },
];

/**
 * 下钻明细的工单必须是**工单数据源里真实存在的单**（@/mock/tickets）。
 * 此前这几张表写的是独有编号，操作页按编号查不到就静默回退演示单 ——
 * 表里 10 行点开全是同一张单，而地址栏显示的又是另一个号。
 *
 * 因此这里只声明「单号 + 该指标特有的时点/时长」，工单自身的属性
 * （标题 / 类型 / 当前节点 / 客户 / 手机号 / 评分 / 处理人）一律回工单数据源取，
 * 避免同一张单在门户和工单页显示两套内容。
 */
interface DrillRowSpec {
  no: string;
  /** 该指标特有的度量值，按各表 columns 顺序补在工单属性之后 */
  metrics: string[];
}

function ticketOf(no: string): Ticket {
  const t = TICKETS.find((x) => x.no === no);
  // 配错单号就在构建期炸掉，不要留到用户点进去才发现打不中真单
  if (!t) throw new Error(`[homeOverview] 下钻明细引用了不存在的工单号：${no}`);
  return t;
}

/** 手机号脱敏：保留前 3 位与后 4 位 */
function maskPhone(phone?: string): string {
  if (!phone || phone.length < 7) return phone ?? '—';
  return `${phone.slice(0, 3)}****${phone.slice(-4)}`;
}

/** 已发调研短信待评价：取已下送的单（参评率口径） */
const SURVEY_PENDING_SPEC: DrillRowSpec[] = [
  { no: 'LCMN-20260709-60110', metrics: ['08-03 18:20', '2小时05分'] },
  { no: 'LCMN-20260710-61020', metrics: ['08-03 16:42', '3小时43分'] },
  { no: 'LCMN-20260708-59880', metrics: ['08-03 14:10', '6小时15分'] },
  { no: 'LCMN-20260716-73140', metrics: ['08-03 11:35', '8小时50分'] },
];

/**
 * 24H 未跟进：取我名下在处理、最近更新最早的单。
 * 「最近跟进时间 + 未跟进时长」是成对的度量快照，一起写死 ——
 * 拿工单的 updatedAt 去配这个时长会自相矛盾（工单 mock 的时间轴比原型「今天」早得多）。
 */
const FOLLOW_MISSED_SPEC: DrillRowSpec[] = [
  { no: 'LCMN-20260610-75744', metrics: ['08-02 16:30', '28小时15分'] },
  { no: 'LCMN-20260610-75240', metrics: ['08-02 14:08', '30小时37分'] },
  { no: 'LCMN-20260610-75518', metrics: ['08-02 09:42', '35小时03分'] },
];

/** 差评工单：取工单数据源里评分 ≤ 2 的单，评分不再另写一份 */
const BAD_REVIEW_SPEC: (DrillRowSpec & { tag: string })[] = [
  { no: 'LCMN-20260610-75002', tag: '响应慢、未解决', metrics: ['08-03 17:05'] },
  { no: 'LCMN-20260610-73026', tag: '重复沟通', metrics: ['08-03 10:22'] },
  { no: 'LCMN-20260817-83002', tag: '承诺未兑现', metrics: ['08-02 19:46'] },
];

export const HOME_METRIC_DRILLS: Record<HomeMetricDrillKey, HomeMetricDrillTable> = {
  'survey-pending': {
    title: '24H 内已发调研短信待评价明细',
    columns: ['工单编号', '客户', '手机号', '短信发送时间', '等待时长', '工单类型'],
    rows: SURVEY_PENDING_SPEC.map(({ no, metrics }) => {
      const t = ticketOf(no);
      return {
        ticketNo: t.no,
        cells: [t.no, t.customer, maskPhone(t.customerPhone), ...metrics, t.type],
      };
    }),
  },
  'follow-missed': {
    title: '24H 未跟进工单明细',
    columns: ['工单编号', '工单标题', '工单类型', '当前节点', '最近跟进时间', '未跟进时长'],
    rows: FOLLOW_MISSED_SPEC.map(({ no, metrics }) => {
      const t = ticketOf(no);
      return {
        ticketNo: t.no,
        cells: [t.no, t.title, t.type, t.nodeStatus, ...metrics],
      };
    }),
  },
  'bad-review': {
    title: '差评工单明细',
    columns: ['工单编号', '客户', '评分', '差评标签', '评价时间', '处理人'],
    rows: BAD_REVIEW_SPEC.map(({ no, tag, metrics }) => {
      const t = ticketOf(no);
      return {
        ticketNo: t.no,
        cells: [t.no, t.customer, `${t.serviceScore ?? '—'} 分`, tag, ...metrics, t.assignee ?? '—'],
      };
    }),
  },
};

export interface HomeTodoItem {
  dot: string;
  no: string;
  title: string;
  type: string;
  typeColor: string;
  /**
   * 列表 SLA 摘要（对齐 OpSlaBar / TicketRichList）：
   * - 首响未关 → 展示首响钟（最急）
   * - 首响已关 → 展示整单解决钟
   */
  slaKind: 'first' | 'whole';
  /** running 态：ok/soon/overdue/paused；终态：met/breached */
  slaVis: 'ok' | 'soon' | 'overdue' | 'paused' | 'met' | 'breached';
  /** 如「剩 42m」「超 1h 20m」「已达标」 */
  slaText: string;
}

/** 与 OpSlaBar COLORS 对齐 */
export const HOME_SLA_COLOR: Record<HomeTodoItem['slaVis'], string> = {
  ok: '#16A34A',
  soon: '#F59E0B',
  overdue: '#EF4444',
  paused: '#9CA3AF',
  met: '#16A34A',
  breached: '#EF4444',
};

/** 待办 Top5 取几条 */
const HOME_TODO_LIMIT = 5;

/**
 * 列表 SLA 摘要「00:42:10」/「已超 01:12」→ 门户短文案「剩 42m」/「超 1h 12m」。
 * 终态与挂起没有在跑的钟，直接给结论词。
 */
function homeSlaText(t: Ticket): string {
  if (t.slaText === '—') return t.solveBreached ? '未达标' : '已达标';
  if (t.slaState === 'paused') return '已暂停';
  const hms = /(\d{2}):(\d{2})/.exec(t.slaText);
  if (!hms) return t.slaText;
  const h = Number(hms[1]);
  const m = Number(hms[2]);
  const span = h > 0 ? `${h}h ${m}m` : `${m}m`;
  return t.slaText.startsWith('已超') ? `超 ${span}` : `剩 ${span}`;
}

function homeSlaVis(t: Ticket): HomeTodoItem['slaVis'] {
  if (t.slaText === '—') return t.solveBreached ? 'breached' : 'met';
  return t.slaState;
}

/**
 * 待办 Top5 —— **数据域与排序都取自工单工作台**，门户不自建口径：
 * 域 = inMineTaskScope（「我的任务」Tab），序 = slaUrgencyCompare（该 Tab 默认的 SLA 紧急度）。
 *
 * 此前这里是一份硬编码数组：既没走上面那个比较函数（与"与工作台同源"的口径不符），
 * 单号也大多不在工单数据源里（点进去只能打到演示单）。改为派生后两件事一起解决，
 * 且工单 mock 增删时门户自动跟着走，不需要人工同步。
 */
export const HOME_TODOS: HomeTodoItem[] = TICKETS
  .filter((t) => inMineTaskScope(t))
  .sort(slaUrgencyCompare)
  .slice(0, HOME_TODO_LIMIT)
  .map((t) => ({
    dot: PRIORITY_COLOR[t.priority],
    no: t.no,
    title: t.title,
    type: t.type,
    typeColor: TYPE_COLOR[t.type],
    // 首响未关 → 展首响钟（最急）；首响已关 → 展整单解决钟
    slaKind: isFirstResponded(t) ? 'whole' : 'first',
    slaVis: homeSlaVis(t),
    slaText: homeSlaText(t),
  }));

export const HOME_TREND_LABELS = ['5/15', '5/20', '5/25', '5/30', '6/4', '6/9', '6/14'];

/** 折线 Y 坐标（viewBox 高 108，越大越靠下） */
export const HOME_TREND_FOLLOW = [72, 58, 65, 48, 55, 42, 38];
export const HOME_TREND_DONE = [85, 78, 80, 68, 72, 58, 52];

/** 近 7 天趋势（原型示意，点数更少） */
export const HOME_TREND_7D_LABELS = ['6/8', '6/9', '6/10', '6/11', '6/12', '6/13', '6/14'];
export const HOME_TREND_7D_FOLLOW = [50, 46, 55, 42, 48, 40, 38];
export const HOME_TREND_7D_DONE = [68, 62, 70, 58, 64, 55, 52];

/** 效能区时间快捷项 */
export type HomePerfRangeKey = 'today' | 'week' | 'month' | 'custom';
export const HOME_PERF_RANGE_OPTS: { value: HomePerfRangeKey; label: string }[] = [
  { value: 'today', label: '今天' },
  { value: 'week', label: '本周' },
  { value: 'month', label: '本月' },
  { value: 'custom', label: '自定义' },
];

/** 效能区排名对照班组（原型可选；坐席默认本班组） */
export interface HomePerfTeam {
  value: string;
  label: string;
  size: number;
}
export const HOME_PERF_TEAMS: HomePerfTeam[] = [
  { value: 'cs-1', label: '受理一组', size: 12 },
  { value: 'cs-2', label: '受理二组', size: 10 },
  { value: 'as-1', label: '售后一组', size: 8 },
];

/** 趋势区时间快捷项 */
export type HomeTrendRangeKey = '7d' | '30d' | 'custom';
export const HOME_TREND_RANGE_OPTS: { value: HomeTrendRangeKey; label: string }[] = [
  { value: '7d', label: '近7天' },
  { value: '30d', label: '近30天' },
  { value: 'custom', label: '自定义' },
];

/**
 * 原型：按区间 + 班组给效能卡示意数据。
 * 真实环境应由接口按 from/to + teamId 重算。
 */
export function getHomePerformanceByRange(
  range: HomePerfRangeKey,
  teamId: string = HOME_PERF_TEAMS[0].value,
): HomePerformanceCard[] {
  const team = HOME_PERF_TEAMS.find((t) => t.value === teamId) ?? HOME_PERF_TEAMS[0];
  /** 换组时排名略偏移，体现对照范围变化 */
  const rankShift = teamId === 'cs-1' ? 0 : teamId === 'cs-2' ? 1 : -1;

  const withTeam = (cards: HomePerformanceCard[]): HomePerformanceCard[] =>
    cards.map((c) => ({
      ...c,
      teamSize: team.size,
      rank: Math.min(team.size, Math.max(1, c.rank + rankShift)),
      metrics: c.metrics.map((m) =>
        m.label === '较组均' ? { ...m, label: `较${team.label.replace(/组$/, '')}均` } : m,
      ),
    }));

  if (range === 'today') return withTeam(HOME_PERFORMANCE);

  const week: HomePerformanceCard[] = [
    {
      key: 'efficiency',
      title: '效率',
      metrics: [
        { label: '平均通话时长', value: '3.5 小时', tone: 'primary' },
        { label: '区间下送量', value: '62 单', tone: 'success' },
        { label: '较组均', value: '-0.2 小时', tone: 'success' },
      ],
      rank: 4,
      teamSize: 12,
    },
    {
      key: 'sla',
      title: '时效',
      metrics: [
        { label: '响应及时率', value: '96.1%', tone: 'success' },
        { label: '解决及时率', value: '93.8%', tone: 'success' },
        { label: '超时工单', value: '7 单', tone: 'danger' },
      ],
      rank: 5,
      teamSize: 12,
      rankLabel: '及时率排名',
    },
    {
      key: 'quality',
      title: '质量',
      metrics: [
        { label: '服务满意度', value: '4.6 / 5', tone: 'success' },
        { label: '解决率', value: '84.2%', tone: 'success' },
        { label: '参评率', value: '79.5%', tone: 'warning' },
      ],
      rank: 3,
      teamSize: 12,
      drill: 'bad-review',
      drillLabel: '查看差评工单',
    },
    {
      key: 'reach',
      title: '触达',
      metrics: [
        { label: '24小时联络率', value: '90.4%', tone: 'success' },
        { label: '外呼接通率', value: '66.0%', tone: 'warning' },
        { label: '通时利用率', value: '74.1%', tone: 'success' },
      ],
      rank: 4,
      teamSize: 12,
      drill: 'follow-missed',
      drillLabel: '查看未跟进',
    },
  ];

  if (range === 'week' || range === 'custom') return withTeam(week);

  return withTeam([
    {
      key: 'efficiency',
      title: '效率',
      metrics: [
        { label: '平均通话时长', value: '3.4 小时', tone: 'primary' },
        { label: '区间下送量', value: '248 单', tone: 'success' },
        { label: '较组均', value: '-0.3 小时', tone: 'success' },
      ],
      rank: 3,
      teamSize: 12,
    },
    {
      key: 'sla',
      title: '时效',
      metrics: [
        { label: '响应及时率', value: '95.8%', tone: 'success' },
        { label: '解决及时率', value: '92.9%', tone: 'success' },
        { label: '超时工单', value: '18 单', tone: 'danger' },
      ],
      rank: 4,
      teamSize: 12,
      rankLabel: '及时率排名',
    },
    {
      key: 'quality',
      title: '质量',
      metrics: [
        { label: '服务满意度', value: '4.6 / 5', tone: 'success' },
        { label: '解决率', value: '85.1%', tone: 'success' },
        { label: '参评率', value: '80.2%', tone: 'warning' },
      ],
      rank: 2,
      teamSize: 12,
      drill: 'bad-review',
      drillLabel: '查看差评工单',
    },
    {
      key: 'reach',
      title: '触达',
      metrics: [
        { label: '24小时联络率', value: '89.6%', tone: 'success' },
        { label: '外呼接通率', value: '65.2%', tone: 'warning' },
        { label: '通时利用率', value: '73.8%', tone: 'success' },
      ],
      rank: 3,
      teamSize: 12,
      drill: 'follow-missed',
      drillLabel: '查看未跟进',
    },
  ]);
}

/** 效能卡组内排行榜行 */
export interface HomeRankBoardRow {
  rank: number;
  name: string;
  value: string;
  isMe?: boolean;
}

export interface HomeRankBoard {
  cardKey: string;
  title: string;
  metricLabel: string;
  teamLabel: string;
  myRank: number;
  teamSize: number;
  rows: HomeRankBoardRow[];
}

const RANK_METRIC_LABEL: Record<string, string> = {
  efficiency: '平均通话时长',
  sla: '响应及时率',
  quality: '服务满意度',
  reach: '24小时联络率',
};

const RANK_PEER_NAMES = [
  '李四', '王五', '赵六', '刘洋', '陈晨', '周杰', '吴敏', '郑浩', '冯莉', '曹宇', '沈婷', '韩磊',
];

/** 按卡 + 班组生成组内排行榜（原型示意；我固定在 card.rank） */
export function getHomePerformanceRankBoard(
  card: HomePerformanceCard,
  teamLabel: string,
  myName: string,
): HomeRankBoard {
  const metricLabel = RANK_METRIC_LABEL[card.key] ?? card.metrics[0]?.label ?? '指标';
  const myValue = card.metrics.find((m) => m.label === metricLabel)?.value
    ?? card.metrics[0]?.value
    ?? '—';

  const peers = RANK_PEER_NAMES.filter((n) => n !== myName);
  const rows: HomeRankBoardRow[] = [];

  for (let i = 1; i <= card.teamSize; i++) {
    if (i === card.rank) {
      rows.push({ rank: i, name: myName, value: myValue, isMe: true });
      continue;
    }
    const peerIdx = i < card.rank ? i - 1 : i - 2;
    const name = peers[peerIdx % peers.length] ?? `组员${i}`;
    rows.push({
      rank: i,
      name,
      value: mockPeerValue(card.key, i, card.rank, myValue),
    });
  }

  return {
    cardKey: card.key,
    title: card.title,
    metricLabel,
    teamLabel,
    myRank: card.rank,
    teamSize: card.teamSize,
    rows,
  };
}

function mockPeerValue(cardKey: string, rank: number, myRank: number, myValue: string): string {
  const delta = myRank - rank; // 正数=对方更好
  if (cardKey === 'efficiency') {
    const base = parseFloat(myValue) || 3.2;
    const v = Math.max(1.5, base - delta * 0.15);
    return `${v.toFixed(1)} 小时`;
  }
  if (cardKey === 'sla' || cardKey === 'reach') {
    const base = parseFloat(myValue) || 90;
    const v = Math.min(99.9, Math.max(60, base + delta * 0.8));
    return `${v.toFixed(1)}%`;
  }
  if (cardKey === 'quality') {
    const base = parseFloat(myValue) || 4.5;
    const v = Math.min(5, Math.max(3.5, base + delta * 0.05));
    return `${v.toFixed(1)} / 5`;
  }
  return myValue;
}

export const HOME_QUICK_LINKS = [
  { key: 'create', label: '新建工单', icon: 'plus', color: '#1A6FFF' },
  { key: 'pool', label: '工单池领单', icon: 'inbox', color: '#06B6D4' },
  { key: 'mine', label: '我的工单', icon: 'list', color: '#1A6FFF' },
  { key: 'kb', label: '知识库', icon: 'book', color: '#10B981' },
  { key: 'customer', label: '查询中心', icon: 'idcard', color: '#F59E0B' },
  { key: 'report', label: '统计报表', icon: 'chart', color: '#A855F7' },
] as const;
