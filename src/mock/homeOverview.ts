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

export interface HomeKpi {
  key: string;
  label: string;
  value: string;
  valueColor: string;
  /** 右侧图标底色（浅色） */
  iconBg: string;
  /** 图标名，对应 HomeOverviewView 内 icon map */
  icon: 'file' | 'sync' | 'pause' | 'send' | 'clock' | 'alert' | 'phone';
  delta?: string;
  deltaColor?: string;
  suffix?: string;
}

/**
 * 区A · 今日概览
 *
 * 一区一种语义：**只放数量**，率值一律归「我的绩效」区（规范 R1b）。
 * 含：待处理 / 处理中 / 挂起 / 今日下送 / 临期 / 超时 / 当日通话。
 */
export const HOME_KPIS: HomeKpi[] = [
  { key: 'todo', label: '待处理工单', value: '6', valueColor: '#F97316', iconBg: '#FFF7ED', icon: 'file', delta: '+2', deltaColor: '#EF4444' },
  { key: 'processing', label: '处理中', value: '9', valueColor: '#0D9488', iconBg: '#F0FDFA', icon: 'sync' },
  { key: 'suspended', label: '挂起', value: '3', valueColor: '#8B5CF6', iconBg: '#F5F3FF', icon: 'pause' },
  { key: 'resolved-today', label: '今日下送', value: '14', valueColor: '#10B981', iconBg: '#ECFDF5', icon: 'send', delta: '+5', deltaColor: '#10B981' },
  { key: 'soon', label: '临期', value: '1', valueColor: '#F59E0B', iconBg: '#FFFBEB', icon: 'clock', delta: '-1', deltaColor: '#10B981' },
  { key: 'overdue', label: '超时', value: '1', valueColor: '#EF4444', iconBg: '#FEF2F2', icon: 'alert' },
  { key: 'call-duration', label: '当日通话', value: '2h46m', valueColor: '#1A6FFF', iconBg: '#EFF6FF', icon: 'phone' },
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
  sla: string;
  slaColor: string;
  slaBg: string;
}

export const HOME_TODOS: HomeTodoItem[] = [
  {
    dot: '#EF4444',
    no: 'LCMN-20260610-73026',
    title: '无线音乐播放跳过歌曲异常',
    type: '投诉',
    typeColor: '#EF4444',
    sla: '00:42:10',
    slaColor: '#F59E0B',
    slaBg: '#F59E0B1F',
  },
  {
    dot: '#F59E0B',
    no: 'LCMN-20260610-82282',
    title: '客服响应慢，要求升级处理',
    type: '投诉',
    typeColor: '#EF4444',
    sla: '超时 01:20',
    slaColor: '#EF4444',
    slaBg: '#EF44441F',
  },
  {
    dot: '#EF4444',
    no: 'LCMN-20260610-00320',
    title: '设备无法开机，电源指示灯不亮',
    type: '咨询',
    typeColor: '#1A6FFF',
    sla: '02:15:30',
    slaColor: '#10B981',
    slaBg: '#10B9811F',
  },
  {
    dot: '#1A6FFF',
    no: 'LCMN-20260609-60387',
    title: '预约上门安装智能门锁',
    type: '建议',
    typeColor: '#10B981',
    sla: '06:40:00',
    slaColor: '#10B981',
    slaBg: '#10B9811F',
  },
  {
    dot: '#1A6FFF',
    no: 'LCMN-20260609-55881',
    title: '产品质量问题申请退货',
    type: '投诉',
    typeColor: '#EF4444',
    sla: '04:12:30',
    slaColor: '#10B981',
    slaBg: '#10B9811F',
  },
];

export const HOME_TREND_LABELS = ['5/15', '5/20', '5/25', '5/30', '6/4', '6/9', '6/14'];

/** 折线 Y 坐标（viewBox 高 108，越大越靠下） */
export const HOME_TREND_FOLLOW = [72, 58, 65, 48, 55, 42, 38];
export const HOME_TREND_DONE = [85, 78, 80, 68, 72, 58, 52];

export const HOME_QUICK_LINKS = [
  { key: 'create', label: '新建工单', icon: 'plus', color: '#1A6FFF' },
  { key: 'pool', label: '工单池领单', icon: 'inbox', color: '#06B6D4' },
  { key: 'mine', label: '我的工单', icon: 'list', color: '#1A6FFF' },
  { key: 'kb', label: '知识库', icon: 'book', color: '#10B981' },
  { key: 'transfer', label: '转派记录', icon: 'repeat', color: '#F59E0B' },
  { key: 'report', label: '统计报表', icon: 'chart', color: '#A855F7' },
] as const;
