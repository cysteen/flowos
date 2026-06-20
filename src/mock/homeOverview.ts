/** 首页·工作概览 Mock（对齐 .pen vzMJ3 / PRD-01） */

export const HOME_NOTICE = {
  text: '【系统维护】6/15 00:00–02:00 工单系统例行升级，请提前保存草稿；维护期间暂停派单。',
  total: 3,
};

export interface HomeKpi {
  key: string;
  label: string;
  value: string;
  valueColor: string;
  delta?: string;
  deltaColor?: string;
  suffix?: string;
}

export const HOME_KPIS: HomeKpi[] = [
  { key: 'todo', label: '我的待办', value: '6', valueColor: '#1A6FFF', delta: '+2', deltaColor: '#EF4444' },
  { key: 'processing', label: '处理中', value: '9', valueColor: '#06B6D4' },
  { key: 'resolved-today', label: '今日已解决', value: '14', valueColor: '#10B981', delta: '+5', deltaColor: '#10B981' },
  { key: 'sla', label: '我的 SLA 达成', value: '96.8%', valueColor: '#10B981', delta: '+1.2%', deltaColor: '#10B981' },
  { key: 'risk', label: '临期 / 超时', value: '2', valueColor: '#F59E0B', delta: '-1', deltaColor: '#10B981' },
  { key: 'week', label: '本周已解决', value: '67', valueColor: '#111827', suffix: '团队第 2' },
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
