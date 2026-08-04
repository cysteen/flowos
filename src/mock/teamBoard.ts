/**
 * 班组看板 Mock
 *
 * ── 文件分两段 ──
 * 【旧】PRD-07 班组看板（对齐 .pen oGoBU）：TeamKpi / TeamMemberRow / CS_* / AS_* / STATUS_STYLE。
 *      TeamBoardView.vue 仍在引用，待新版视图重写后再清理，勿删。
 * 【新】915 改造方案·班组长看板（模块 1–5）：BOARD_METRICS / BOARD_TODOS / TEAM_MEMBERS /
 *      PRIORITY_BUCKETS / *_DRILL / TRAFFIC_* / PROBLEM_TOP10。
 *
 * ── 数据口径 ──
 * 1. 积压【决策 B1 · 8 状态】依《915工单看板-改造方案(商讨稿)》§0.6 状态元数据表 + §5.5 白名单：
 *    待受理 / 待处理 / 处理中 / 调研中 / 申请挂起中 / 申请关闭中 / 申请强结中 …「计积压」共 8 个状态。
 *    口径 ＝ 未结且未停表（已解决 / 已挂起 / 已转出 / 各终态 均不计）。
 * 2. 优先级保留两套枚举：sysKey（系统现有 P0–P3）+ reqLabel（业务口径）。
 *    **映射 0803 业务确认**：P0=紧急 / P1=重要 / P2=普通加急 / P3=普通（单一真源见 types/ticket.ts PRIORITY_LABEL）。
 * 3. 负载档阈值**暂定**：空闲 ≤5 ／ 适中 6–12 ／ 满载 >12（未经业务确认，后续应做成可配置）。
 * 4. 语义色只用《看板设计-竞品调研与设计范式》§六 R4 五色：
 *    #EF4444 超标 / #F59E0B 预警 / #10B981 达标 / #1A6FFF 交互与选中 / #9CA3AF 中性无数据。
 *
 * ── 数值自洽关系（评审可逐条核对）──
 * - PRIORITY_BUCKETS 合计 6+14+19+24 = 63 ＝ 班组积压 63
 * - TEAM_MEMBERS.workload 合计 = 55 ＝ 积压 63 − 未分派 8（未分派尚未落到人头）
 * - TEAM_MEMBERS.forwardToday 合计 = 118 ＝ 今日下送 118
 * - URGE_DRILL count 合计 = 34 ＝ 催单·补充 34；unread 合计 = 12 ＝ sub「未读 12」
 * - RETURN_DRILL 合计 = 3 ＝ 退回 3；TRANSFER_DRILL 三组 2+2+1 = 5 ＝ 转单 5
 * - TRAFFIC_HOURLY inbound 合计 = 142 ＝ 今日进线；forward 合计 = 118 ＝ 今日下送
 * - TRAFFIC_DAILY 末点 8/3 = (142, 118) 与今日两卡一致；进线卡 delta +45 / 下送卡 +26
 *   ＝ 与前一日 8/2 (97, 92) 之差
 * - BOARD_TODOS 待指派 8 ＝ 大盘未分派 8
 * - PROBLEM_TOP10 count 合计 = 112，ratio ＝ count ÷ 142（今日进线）× 100，ratio 合计 78.8
 */

/* ==========================================================================
 * 【旧】PRD-07 班组看板 —— TeamBoardView.vue 仍在引用，勿删
 * ========================================================================== */

export type TeamBoardDim = 'cs' | 'as';

export type MemberStatus = '优秀' | '正常' | '预警' | '超标';

export interface TeamKpi {
  key: string;
  label: string;
  value: string;
  iconColor: string;
  iconBg: string;
}

export interface TeamMemberRow {
  id: string;
  name: string;
  inProgress: number;
  resolvedToday: number;
  overdue: number;
  slaRate: string;
  avgResolve: string;
  /** 售后维度专用 */
  onsiteRate?: string;
  closeRate?: string;
  status: MemberStatus;
}

export const TEAM_OPTIONS = ['受理一组', '受理二组', '售后一组'];

export const STATUS_STYLE: Record<MemberStatus, { color: string; bg: string }> = {
  优秀: { color: '#10B981', bg: '#10B98122' },
  正常: { color: '#10B981', bg: '#10B98122' },
  预警: { color: '#F59E0B', bg: '#F59E0B22' },
  超标: { color: '#EF4444', bg: '#EF444422' },
};

export const CS_KPIS: TeamKpi[] = [
  { key: 'pending', label: '本班组待处理', value: '24', iconColor: '#1A6FFF', iconBg: '#1A6FFF1A' },
  { key: 'processing', label: '处理中', value: '38', iconColor: '#06B6D4', iconBg: '#06B6D41A' },
  { key: 'done', label: '今日已解决', value: '52', iconColor: '#10B981', iconBg: '#10B9811A' },
  { key: 'overdue', label: '超时工单', value: '5', iconColor: '#EF4444', iconBg: '#EF44441A' },
  { key: 'sla', label: 'SLA 达成率', value: '94.2%', iconColor: '#10B981', iconBg: '#10B9811A' },
  { key: 'avg', label: '平均解决时长', value: '2.8h', iconColor: '#A855F7', iconBg: '#A855F71A' },
];

export const AS_KPIS: TeamKpi[] = [
  { key: 'pending', label: '待接单', value: '18', iconColor: '#1A6FFF', iconBg: '#1A6FFF1A' },
  { key: 'visit', label: '待上门', value: '12', iconColor: '#10B981', iconBg: '#10B9811A' },
  { key: 'overdue', label: '已超时', value: '4', iconColor: '#EF4444', iconBg: '#EF44441A' },
  { key: 'done', label: '今日结单', value: '28', iconColor: '#10B981', iconBg: '#10B9811A' },
  { key: 'sla', label: '售后 SLA 达成率', value: '91.5%', iconColor: '#10B981', iconBg: '#10B9811A' },
  { key: 'avg', label: '平均上门时长', value: '4.2h', iconColor: '#A855F7', iconBg: '#A855F71A' },
];

export const CS_MEMBERS: TeamMemberRow[] = [
  { id: '1', name: '张三', inProgress: 8, resolvedToday: 12, overdue: 1, slaRate: '95.6%', avgResolve: '2.4h', status: '正常' },
  { id: '2', name: '李四', inProgress: 6, resolvedToday: 9, overdue: 0, slaRate: '98.2%', avgResolve: '2.1h', status: '优秀' },
  { id: '3', name: '王五', inProgress: 10, resolvedToday: 15, overdue: 2, slaRate: '91.3%', avgResolve: '3.2h', status: '预警' },
  { id: '4', name: '赵六', inProgress: 5, resolvedToday: 8, overdue: 1, slaRate: '93.7%', avgResolve: '2.6h', status: '正常' },
  { id: '5', name: '刘洋', inProgress: 9, resolvedToday: 8, overdue: 3, slaRate: '88.0%', avgResolve: '3.8h', status: '超标' },
];

export const AS_MEMBERS: TeamMemberRow[] = [
  { id: '1', name: '陈工', inProgress: 7, resolvedToday: 0, overdue: 1, slaRate: '92.1%', avgResolve: '—', onsiteRate: '96.0%', closeRate: '94.5%', status: '正常' },
  { id: '2', name: '林工', inProgress: 5, resolvedToday: 0, overdue: 0, slaRate: '97.8%', avgResolve: '—', onsiteRate: '98.5%', closeRate: '97.2%', status: '优秀' },
  { id: '3', name: '周工', inProgress: 11, resolvedToday: 0, overdue: 2, slaRate: '89.4%', avgResolve: '—', onsiteRate: '88.0%', closeRate: '90.1%', status: '预警' },
  { id: '4', name: '吴工', inProgress: 4, resolvedToday: 0, overdue: 1, slaRate: '93.2%', avgResolve: '—', onsiteRate: '94.0%', closeRate: '92.8%', status: '正常' },
  { id: '5', name: '郑工', inProgress: 8, resolvedToday: 0, overdue: 3, slaRate: '85.6%', avgResolve: '—', onsiteRate: '82.0%', closeRate: '86.5%', status: '超标' },
];

/* ==========================================================================
 * 【新】915 班组长看板
 * ========================================================================== */

/** 模块 1 · 大盘指标卡 */
export interface BoardMetric {
  key: string;
  label: string;
  value: string;
  /** 附加数，如「未读 12」「3 · 5」的说明 */
  sub?: string;
  delta?: string;
  deltaTone?: 'good' | 'bad' | 'neutral';
  /** @ant-design/icons-vue 组件名 */
  iconName: string;
  iconColor: string;
  iconBg: string;
  valueColor?: string;
  /** 下钻类型；null = 不可下钻 */
  drill?: 'priority' | 'people' | 'source' | null;
}

/** 模块 5 · 调度待办 */
export interface BoardTodo {
  key: 'assign' | 'supervise' | 'approve';
  label: string;
  count: number;
  unit: string;
  tone: 'danger' | 'warn';
}

/** 模块 2 负载 + 模块 3 效能排行（同一份人员数据，两个模块取不同列） */
export interface MemberRow {
  id: string;
  name: string;
  online: '在线' | '小休' | '离线';
  /** 当前在办工单数 */
  workload: number;
  /** 负载档，阈值暂定 ≤5 空闲 / 6–12 适中 / >12 满载 */
  loadLevel: '空闲' | '适中' | '满载';
  /** 今日下送量 */
  forwardToday: number;
  /** 平均处理时长 */
  avgHandle: string;
  /** 超时工单 */
  overdue: number;
  /** 24 小时联络率 */
  followRate: string;
  /** 服务满意度（5 分制） */
  csat: string;
  /** 解决率 */
  resolveRate: string;
  /** 参评率 */
  reviewRate: string;
}

/** 积压优先级下钻。sysKey ↔ reqLabel 映射已确认（0803），两套枚举都要保留 */
export interface PriorityBucket {
  /** 系统现有枚举 */
  sysKey: 'P0' | 'P1' | 'P2' | 'P3';
  /** 需求口径枚举 */
  reqLabel: '紧急' | '重要' | '普通加急' | '普通';
  count: number;
  color: string;
}

/** 人员下钻行（未分派 / 催单补充 / 退回） */
export interface PeopleDrillRow {
  id: string;
  name: string;
  online: '在线' | '小休' | '离线';
  count: number;
  /** 未读数，仅催单·补充下钻使用 */
  unread?: number;
}

/** 转单来源下钻 */
export interface SourceDrillGroup {
  source: '其他客服组' | '跨组调剂' | '售后回传';
  count: number;
  items: { no: string; title: string; from: string }[];
}

/** 时段进线流量趋势点 */
export interface TrafficPoint {
  t: string;
  inbound: number;
  forward: number;
}

/** 模块 4 · 高频问题 TOP10 */
export interface ProblemRow {
  rank: number;
  /** 二级问题分类 */
  category: string;
  count: number;
  /** 占比，百分数数值（如 18.3 表示 18.3%） */
  ratio: number;
  /** 环比，如 '+12%' */
  mom: string;
  /** 是否已解决（已闭环） */
  solved: boolean;
}

/* -------------------------------------------------------------------------
 * 模块 1 · 班组大盘（6 项，顺序固定）
 * delta 口径：进线/下送 ＝ 对比 TRAFFIC_DAILY 前一日 8/2 (97, 92) 的绝对差；其余为对比昨日绝对差
 * ----------------------------------------------------------------------- */
export const BOARD_METRICS: BoardMetric[] = [
  {
    key: 'unassigned',
    label: '组内未分派',
    value: '8',
    delta: '+2',
    deltaTone: 'bad',
    iconName: 'InboxOutlined',
    iconColor: '#F59E0B',
    iconBg: '#F59E0B1A',
    valueColor: '#F59E0B',
    drill: 'people',
  },
  {
    key: 'backlog',
    label: '班组积压',
    value: '63',
    sub: 'B1 口径 · 8 状态',
    delta: '+5',
    deltaTone: 'bad',
    iconName: 'DatabaseOutlined',
    iconColor: '#1A6FFF',
    iconBg: '#1A6FFF1A',
    drill: 'priority',
  },
  {
    key: 'inbound',
    label: '今日进线总量',
    value: '142',
    delta: '+45',
    deltaTone: 'neutral',
    iconName: 'LoginOutlined',
    iconColor: '#1A6FFF',
    iconBg: '#1A6FFF1A',
    drill: null,
  },
  {
    key: 'forward',
    label: '今日下送总量',
    value: '118',
    delta: '+26',
    deltaTone: 'good',
    iconName: 'SendOutlined',
    iconColor: '#10B981',
    iconBg: '#10B9811A',
    drill: null,
  },
  {
    key: 'urge',
    label: '催单 · 补充单',
    value: '34',
    sub: '未读 12',
    delta: '+4',
    deltaTone: 'bad',
    iconName: 'BellOutlined',
    iconColor: '#EF4444',
    iconBg: '#EF44441A',
    valueColor: '#EF4444',
    drill: 'people',
  },
  {
    key: 'returnTransfer',
    label: '退回 · 今日转入',
    value: '3 · 5',
    sub: '退回 3 ｜ 转入 5',
    delta: '-1 · +2',
    deltaTone: 'neutral',
    iconName: 'RollbackOutlined',
    iconColor: '#F59E0B',
    iconBg: '#F59E0B1A',
    drill: 'source',
  },
];

/* -------------------------------------------------------------------------
 * 模块 5 · 调度待办（待指派 8 ＝ 大盘未分派 8）
 * ----------------------------------------------------------------------- */
export const BOARD_TODOS: BoardTodo[] = [
  { key: 'assign', label: '待指派', count: 8, unit: '单', tone: 'danger' },
  { key: 'supervise', label: '待督办', count: 5, unit: '单', tone: 'warn' },
  { key: 'approve', label: '待审批', count: 3, unit: '条', tone: 'warn' },
];

/* -------------------------------------------------------------------------
 * 模块 2 负载 + 模块 3 效能排行 · 班组 12 人
 * workload 合计 = 55 ＝ 积压 63 − 未分派 8
 * forwardToday 合计 = 118 ＝ 今日下送 118
 * 负载档：空闲 ≤5（7 人）/ 适中 6–12（4 人）/ 满载 >12（1 人）
 * ----------------------------------------------------------------------- */
export const TEAM_MEMBERS: MemberRow[] = [
  { id: 'm1',  name: '张敏', online: '在线', workload: 8,  loadLevel: '适中', forwardToday: 14, avgHandle: '2.6h', overdue: 2, followRate: '96.4%', csat: '4.8', resolveRate: '94.2%', reviewRate: '88.0%' },
  { id: 'm2',  name: '李昊', online: '在线', workload: 9,  loadLevel: '适中', forwardToday: 15, avgHandle: '3.1h', overdue: 4, followRate: '92.8%', csat: '4.5', resolveRate: '90.6%', reviewRate: '84.3%' },
  { id: 'm3',  name: '王倩', online: '在线', workload: 6,  loadLevel: '适中', forwardToday: 12, avgHandle: '2.2h', overdue: 1, followRate: '97.6%', csat: '4.9', resolveRate: '96.1%', reviewRate: '91.2%' },
  { id: 'm4',  name: '赵磊', online: '小休', workload: 1,  loadLevel: '空闲', forwardToday: 6,  avgHandle: '3.8h', overdue: 0, followRate: '90.0%', csat: '4.3', resolveRate: '88.5%', reviewRate: '80.4%' },
  { id: 'm5',  name: '陈曦', online: '在线', workload: 7,  loadLevel: '适中', forwardToday: 13, avgHandle: '2.9h', overdue: 3, followRate: '93.5%', csat: '4.6', resolveRate: '91.8%', reviewRate: '85.7%' },
  { id: 'm6',  name: '刘婷', online: '在线', workload: 3,  loadLevel: '空闲', forwardToday: 10, avgHandle: '2.4h', overdue: 0, followRate: '98.0%', csat: '4.9', resolveRate: '95.4%', reviewRate: '90.6%' },
  { id: 'm7',  name: '周航', online: '离线', workload: 1,  loadLevel: '空闲', forwardToday: 3,  avgHandle: '4.6h', overdue: 1, followRate: '84.2%', csat: '4.1', resolveRate: '82.7%', reviewRate: '80.8%' },
  { id: 'm8',  name: '吴悦', online: '在线', workload: 4,  loadLevel: '空闲', forwardToday: 11, avgHandle: '2.7h', overdue: 2, followRate: '95.1%', csat: '4.7', resolveRate: '93.0%', reviewRate: '87.5%' },
  { id: 'm9',  name: '郑楠', online: '小休', workload: 1,  loadLevel: '空闲', forwardToday: 7,  avgHandle: '3.5h', overdue: 3, followRate: '88.6%', csat: '4.2', resolveRate: '86.3%', reviewRate: '82.1%' },
  { id: 'm10', name: '孙杰', online: '在线', workload: 13, loadLevel: '满载', forwardToday: 16, avgHandle: '4.2h', overdue: 5, followRate: '86.9%', csat: '4.0', resolveRate: '84.9%', reviewRate: '81.5%' },
  { id: 'm11', name: '徐璐', online: '在线', workload: 2,  loadLevel: '空闲', forwardToday: 9,  avgHandle: '2.5h', overdue: 1, followRate: '94.7%', csat: '4.6', resolveRate: '92.4%', reviewRate: '86.9%' },
  { id: 'm12', name: '马超', online: '离线', workload: 0,  loadLevel: '空闲', forwardToday: 2,  avgHandle: '5.0h', overdue: 0, followRate: '81.3%', csat: '4.0', resolveRate: '80.5%', reviewRate: '80.0%' },
];

/* -------------------------------------------------------------------------
 * 积压下钻 · 优先级分布（合计 6+14+19+24 = 63 ＝ 班组积压）
 * sysKey ↔ reqLabel 映射已确认（0803）
 * ----------------------------------------------------------------------- */
export const PRIORITY_BUCKETS: PriorityBucket[] = [
  { sysKey: 'P0', reqLabel: '紧急', count: 6,  color: '#EF4444' },
  { sysKey: 'P1', reqLabel: '重要', count: 14, color: '#F59E0B' },
  { sysKey: 'P2', reqLabel: '普通加急', count: 19, color: '#1A6FFF' },
  { sysKey: 'P3', reqLabel: '普通', count: 24, color: '#9CA3AF' },
];

/* -------------------------------------------------------------------------
 * 催单·补充单下钻 · 按人员（count 合计 34、unread 合计 12）
 * ----------------------------------------------------------------------- */
export const URGE_DRILL: PeopleDrillRow[] = [
  { id: 'm10', name: '孙杰', online: '在线', count: 6, unread: 2 },
  { id: 'm2',  name: '李昊', online: '在线', count: 5, unread: 2 },
  { id: 'm5',  name: '陈曦', online: '在线', count: 5, unread: 1 },
  { id: 'm1',  name: '张敏', online: '在线', count: 4, unread: 2 },
  { id: 'm9',  name: '郑楠', online: '小休', count: 4, unread: 1 },
  { id: 'm8',  name: '吴悦', online: '在线', count: 4, unread: 2 },
  { id: 'm3',  name: '王倩', online: '在线', count: 3, unread: 1 },
  { id: 'm7',  name: '周航', online: '离线', count: 3, unread: 1 },
];

/* -------------------------------------------------------------------------
 * 退回工单下钻 · 按人员（合计 3）
 * ----------------------------------------------------------------------- */
export const RETURN_DRILL: PeopleDrillRow[] = [
  { id: 'm10', name: '孙杰', online: '在线', count: 2 },
  { id: 'm9',  name: '郑楠', online: '小休', count: 1 },
];

/* -------------------------------------------------------------------------
 * 今日转单下钻 · 按来源（2+2+1 = 5）
 * ----------------------------------------------------------------------- */
export const TRANSFER_DRILL: SourceDrillGroup[] = [
  {
    source: '其他客服组',
    count: 2,
    items: [
      { no: 'GD20260803001', title: '订单支付成功但未生成物流单', from: '受理二组 · 何蕾' },
      { no: 'GD20260803014', title: '优惠券核销后金额未抵扣', from: '受理三组 · 段宇' },
    ],
  },
  {
    source: '跨组调剂',
    count: 2,
    items: [
      { no: 'GD20260803027', title: '客户连续三次催单，要求升级处理', from: '值班调度 · 系统调剂' },
      { no: 'GD20260803033', title: '大客户批量退货申请', from: '值班调度 · 系统调剂' },
    ],
  },
  {
    source: '售后回传',
    count: 1,
    items: [
      { no: 'GD20260802088', title: '上门检测无故障，退回客服核实诉求', from: '售后一组 · 陈工' },
    ],
  },
];

/* -------------------------------------------------------------------------
 * 时段进线流量趋势 · 24 小时（早高峰 9–11、午后高峰 14–16）
 * inbound 合计 = 142 ＝ 今日进线；forward 合计 = 118 ＝ 今日下送
 * ----------------------------------------------------------------------- */
export const TRAFFIC_HOURLY: TrafficPoint[] = [
  { t: '00:00', inbound: 1,  forward: 1 },
  { t: '01:00', inbound: 0,  forward: 0 },
  { t: '02:00', inbound: 0,  forward: 0 },
  { t: '03:00', inbound: 0,  forward: 0 },
  { t: '04:00', inbound: 1,  forward: 0 },
  { t: '05:00', inbound: 1,  forward: 1 },
  { t: '06:00', inbound: 2,  forward: 1 },
  { t: '07:00', inbound: 3,  forward: 2 },
  { t: '08:00', inbound: 6,  forward: 4 },
  { t: '09:00', inbound: 12, forward: 9 },
  { t: '10:00', inbound: 15, forward: 13 },
  { t: '11:00', inbound: 13, forward: 12 },
  { t: '12:00', inbound: 7,  forward: 5 },
  { t: '13:00', inbound: 6,  forward: 5 },
  { t: '14:00', inbound: 14, forward: 12 },
  { t: '15:00', inbound: 16, forward: 14 },
  { t: '16:00', inbound: 12, forward: 11 },
  { t: '17:00', inbound: 9,  forward: 8 },
  { t: '18:00', inbound: 6,  forward: 5 },
  { t: '19:00', inbound: 5,  forward: 4 },
  { t: '20:00', inbound: 4,  forward: 4 },
  { t: '21:00', inbound: 4,  forward: 3 },
  { t: '22:00', inbound: 3,  forward: 2 },
  { t: '23:00', inbound: 2,  forward: 2 },
];

/* -------------------------------------------------------------------------
 * 进线/下送趋势 · 近 30 天（7/5 – 8/3）
 * 每日 inbound > forward，差额累积体现积压增长；末点 8/3 = (142, 118) 与今日两卡一致
 * ----------------------------------------------------------------------- */
export const TRAFFIC_DAILY: TrafficPoint[] = [
  { t: '7/5',  inbound: 128, forward: 118 },
  { t: '7/6',  inbound: 141, forward: 126 },
  { t: '7/7',  inbound: 152, forward: 138 },
  { t: '7/8',  inbound: 147, forward: 131 },
  { t: '7/9',  inbound: 139, forward: 127 },
  { t: '7/10', inbound: 133, forward: 122 },
  { t: '7/11', inbound: 96,  forward: 90 },
  { t: '7/12', inbound: 88,  forward: 84 },
  { t: '7/13', inbound: 145, forward: 132 },
  { t: '7/14', inbound: 158, forward: 140 },
  { t: '7/15', inbound: 162, forward: 145 },
  { t: '7/16', inbound: 151, forward: 136 },
  { t: '7/17', inbound: 143, forward: 130 },
  { t: '7/18', inbound: 102, forward: 96 },
  { t: '7/19', inbound: 91,  forward: 87 },
  { t: '7/20', inbound: 149, forward: 134 },
  { t: '7/21', inbound: 155, forward: 139 },
  { t: '7/22', inbound: 168, forward: 148 },
  { t: '7/23', inbound: 160, forward: 142 },
  { t: '7/24', inbound: 146, forward: 133 },
  { t: '7/25', inbound: 108, forward: 101 },
  { t: '7/26', inbound: 94,  forward: 89 },
  { t: '7/27', inbound: 153, forward: 137 },
  { t: '7/28', inbound: 165, forward: 146 },
  { t: '7/29', inbound: 159, forward: 141 },
  { t: '7/30', inbound: 150, forward: 135 },
  { t: '7/31', inbound: 144, forward: 131 },
  { t: '8/1',  inbound: 111, forward: 104 },
  { t: '8/2',  inbound: 97,  forward: 92 },
  { t: '8/3',  inbound: 142, forward: 118 },
];

/* -------------------------------------------------------------------------
 * 模块 4 · 本组高频问题 TOP10（二级问题分类）
 * count 合计 112；ratio ＝ count ÷ 142（今日进线）× 100，ratio 合计 78.8
 * ----------------------------------------------------------------------- */
export const PROBLEM_TOP10: ProblemRow[] = [
  { rank: 1,  category: '物流配送-延迟未送达',   count: 26, ratio: 18.3, mom: '+12%', solved: false },
  { rank: 2,  category: '售后维修-上门超时',     count: 19, ratio: 13.4, mom: '+8%',  solved: false },
  { rank: 3,  category: '订单交易-支付失败',     count: 15, ratio: 10.6, mom: '-4%',  solved: true },
  { rank: 4,  category: '商品质量-功能异常',     count: 12, ratio: 8.5,  mom: '+5%',  solved: false },
  { rank: 5,  category: '退换货-退款未到账',     count: 10, ratio: 7.0,  mom: '-9%',  solved: true },
  { rank: 6,  category: '账号安全-登录异常',     count: 9,  ratio: 6.3,  mom: '+2%',  solved: true },
  { rank: 7,  category: '物流配送-货物破损',     count: 7,  ratio: 4.9,  mom: '+15%', solved: false },
  { rank: 8,  category: '售后维修-配件缺货',     count: 6,  ratio: 4.2,  mom: '+3%',  solved: false },
  { rank: 9,  category: '订单交易-优惠券不可用', count: 5,  ratio: 3.5,  mom: '-6%',  solved: true },
  { rank: 10, category: '商品质量-外观瑕疵',     count: 3,  ratio: 2.1,  mom: '-11%', solved: true },
];
