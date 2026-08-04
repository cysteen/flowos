/** 首页·工作概览 Mock（对齐 .pen vzMJ3 / PRD-01） */

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
 * 「?」口径提示：字段与【815】个人门户 PRD §5.3「指标明细」表的七列一一对应
 * （定义 / 统计方式 / 计入范围 / 排除项 / 更新频率 / 环比口径 / 下钻去向）。
 * 表里写什么这里就展示什么——口径只有这一份，避免页面与文档漂移。
 */
export interface KpiTip {
  /** 一句话定义 */
  define: string;
  /** 统计方式：时点值（状态一变就变） / 累计值（当天算进来就固定） */
  method: string;
  /** 计入范围 */
  include: string;
  /** 排除项 */
  exclude?: string;
  /** 更新频率 */
  refresh: string;
  /** 环比口径；不展示环比时写明 */
  compare: string;
  /** 下钻去向；卡片不可点时须写明原因（PRD A7） */
  drill: string;
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
      define: '派给我、但我还一眼都没看过的工单数',
      method: '时点值 —— 状态一变数就变，推进到「处理中」后这里 −1',
      include: '处理人是我，状态为「待受理」或「待处理」；被退回的单状态回落「待处理」，重新计入',
      exclude: '已进入「处理中」的单（见「处理中」卡）',
      refresh: '实时 60s',
      compare: '与昨天同一时刻对比，上升红、下降绿',
      drill: '点卡片 → 工单工作台「我的 + 待受理/待处理」',
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
      define: '我正在推进的工单数',
      method: '时点值',
      include: '处理人是我，状态为「处理中」',
      exclude: '「待受理 / 待处理」（见「待处理工单」卡）、「已挂起」（见「挂起」卡）',
      refresh: '实时 60s',
      compare: '不展示环比',
      drill: '点卡片 → 工单工作台「我的 + 处理中」',
    },
  },
  {
    key: 'suspended',
    label: '挂起',
    value: '3',
    valueColor: '#8B5CF6',
    tone: 'neutral',
    tip: {
      define: '我名下正在等外部反馈、SLA 已停表的工单数',
      method: '时点值',
      include: '处理人是我，状态为「已挂起」',
      exclude: '已转出的单（已不在我手上）',
      refresh: '实时 60s',
      compare: '不展示环比',
      drill: '点卡片 → 工单工作台「我的 + 已挂起」',
    },
  },
  {
    key: 'resolved-today',
    label: '今日下送',
    value: '14',
    valueColor: '#10B981',
    tone: 'gain',
    tip: {
      define: '我今天完成作业、推给下一环节的工单数',
      method: '累计值 —— 今天算进来就固定，该单后续被退回、重开都不影响',
      include: '由我执行下送的单，按下送动作发生时间归入今天（不是工单创建时间）；同一张单当天多次下送只算 1 次',
      exclude: '他人下送的单；今天之前下送的单',
      refresh: '准实时 5min',
      compare: '与昨天同一时刻的累计值对比（不是昨天全天）',
      drill: '点卡片 → 工单工作台「我今天下送的」',
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
      define: '快要超时、还来得及救的单',
      method: '时点值',
      include: '我名下未结、SLA 未停表，且被 SLA 判为「临期」。提前多久算临期由 SLA 按工单类型 / 优先级规定，门户不设默认值、不自行判定',
      exclude: '已挂起、已转出（SLA 已停表）；已超时的单（归「超时」卡）',
      refresh: '实时 60s',
      compare: '与昨天同一时刻对比，下降为好（绿）',
      drill: '点卡片 → 工单工作台「我的 + 临期」',
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
      define: '已经超时、还没救回来的单',
      method: '时点值 —— 补救完成即减少',
      include: '我名下未结、SLA 未停表，且被 SLA 判为「超时」',
      exclude: '已挂起、已转出；已补救完成的单（这些仍计入「我的绩效 · 超时工单」）',
      refresh: '实时 60s',
      compare: '不展示环比；数值恒为红色，大于 0 就红，降到 0 才消失',
      drill: '点卡片 → 工单工作台「我的 + 超时」',
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
      method: '累计值；满 1 小时显示「2h46m」，不满显示「46m」，为零显示「0m」',
      include: '接通之后的通话时长，呼入呼出合并；按通话开始时间归入今天，跨零点的通话整段算在开始那天',
      exclude: '振铃、排队、保持中未接通的时段',
      refresh: '准实时 5min',
      compare: '不展示环比',
      drill: '本卡不可点 —— 电话记录不带工单号，无法下钻到对应工单',
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
 * 区B · 我的绩效（2026-08-03 重组）
 *
 * 原为 7 张卡、行数 1/1/5/3/1/1/2 —— 严重参差，高度拉齐后短卡全是空白，
 * 这是「杂乱」的根因（参考页每区内卡片行数严格一致，连次要指标区也是 9 行）。
 *
 * 改为按**指标族**归组：4 张卡 × **严格 3 个指标行**，一行排满、无空格、无参差。
 * 需求模块3 的 7 项一个不少，只是换了归组方式：
 *   效率 ← 平均处理时长(1) + 当日下送量(2)
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
      { label: '平均处理时长', value: '3.2 小时', tone: 'primary' },
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

export const HOME_METRIC_DRILLS: Record<HomeMetricDrillKey, HomeMetricDrillTable> = {
  'survey-pending': {
    title: '24H 内已发调研短信待评价明细',
    columns: ['工单编号', '客户', '手机号', '短信发送时间', '等待时长', '工单类型'],
    rows: [
      { ticketNo: 'LCMN-20260803-10231', cells: ['LCMN-20260803-10231', '王女士', '138****6621', '08-03 18:20', '2小时05分', '咨询'] },
      { ticketNo: 'LCMN-20260803-09872', cells: ['LCMN-20260803-09872', '赵先生', '186****3018', '08-03 16:42', '3小时43分', '投诉'] },
      { ticketNo: 'LCMN-20260803-08316', cells: ['LCMN-20260803-08316', '刘女士', '139****5270', '08-03 14:10', '6小时15分', '建议'] },
      { ticketNo: 'LCMN-20260803-07105', cells: ['LCMN-20260803-07105', '陈先生', '177****1946', '08-03 11:35', '8小时50分', '咨询'] },
    ],
  },
  'follow-missed': {
    title: '24H 未跟进工单明细',
    columns: ['工单编号', '工单标题', '工单类型', '当前节点', '最近跟进时间', '未跟进时长'],
    rows: [
      { ticketNo: 'LCMN-20260802-66120', cells: ['LCMN-20260802-66120', '学习机无法连接 WiFi', '咨询', '处理中', '08-02 16:30', '28小时15分'] },
      { ticketNo: 'LCMN-20260802-59218', cells: ['LCMN-20260802-59218', '承诺回访未兑现', '投诉', '处理中', '08-02 14:08', '30小时37分'] },
      { ticketNo: 'LCMN-20260802-44109', cells: ['LCMN-20260802-44109', '建议增加错题导出', '建议', '待处理', '08-02 09:42', '35小时03分'] },
    ],
  },
  'bad-review': {
    title: '差评工单明细',
    columns: ['工单编号', '客户', '评分', '差评标签', '评价时间', '处理人'],
    rows: [
      { ticketNo: 'LCMN-20260803-03361', cells: ['LCMN-20260803-03361', '周女士', '1 分', '响应慢、未解决', '08-03 17:05', '张三'] },
      { ticketNo: 'LCMN-20260802-91826', cells: ['LCMN-20260802-91826', '孙先生', '2 分', '重复沟通', '08-03 10:22', '张三'] },
      { ticketNo: 'LCMN-20260802-73048', cells: ['LCMN-20260802-73048', '吴女士', '2 分', '承诺未兑现', '08-02 19:46', '张三'] },
    ],
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

export const HOME_TODOS: HomeTodoItem[] = [
  {
    // 未首响 · 首响临期 → 展首响
    dot: '#EF4444',
    no: 'LCMN-20260610-73026',
    title: '无线音乐播放跳过歌曲异常',
    type: '投诉',
    typeColor: '#EF4444',
    slaKind: 'first',
    slaVis: 'soon',
    slaText: '剩 42m',
  },
  {
    // 未首响 · 首响已超时仍在计 → 展首响
    dot: '#F59E0B',
    no: 'LCMN-20260610-82282',
    title: '客服响应慢，要求升级处理',
    type: '投诉',
    typeColor: '#EF4444',
    slaKind: 'first',
    slaVis: 'overdue',
    slaText: '超 1h 20m',
  },
  {
    // 已首响 · 展整单解决（正常）
    dot: '#EF4444',
    no: 'LCMN-20260610-00320',
    title: '设备无法开机，电源指示灯不亮',
    type: '咨询',
    typeColor: '#1A6FFF',
    slaKind: 'whole',
    slaVis: 'ok',
    slaText: '剩 2h 15m',
  },
  {
    // 已首响 · 展整单解决（充足）
    dot: '#1A6FFF',
    no: 'LCMN-20260609-60387',
    title: '预约上门安装智能门锁',
    type: '建议',
    typeColor: '#10B981',
    slaKind: 'whole',
    slaVis: 'ok',
    slaText: '剩 6h 40m',
  },
  {
    // 已首响 · 展整单解决（临期）
    dot: '#1A6FFF',
    no: 'LCMN-20260609-55881',
    title: '产品质量问题申请退货',
    type: '投诉',
    typeColor: '#EF4444',
    slaKind: 'whole',
    slaVis: 'soon',
    slaText: '剩 4h 12m',
  },
];

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
        { label: '平均处理时长', value: '3.5 小时', tone: 'primary' },
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
        { label: '平均处理时长', value: '3.4 小时', tone: 'primary' },
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
  efficiency: '平均处理时长',
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
  { key: 'customer', label: '客户查询', icon: 'idcard', color: '#F59E0B' },
  { key: 'report', label: '统计报表', icon: 'chart', color: '#A855F7' },
] as const;
