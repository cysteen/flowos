/** 班组看板 Mock（对齐 .pen oGoBU / PRD-07） */

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
