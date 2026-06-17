// 管理后台「数据总览」驾驶舱 Mock（对齐 PRD-09 §5）。

export const TENANT_INFO = {
  name: 'iFLY 科大讯飞客服中心',
  plan: '旗舰版',
  status: '正常',
  expiry: '2027-06-30',
  seatUsed: 86,
  seatTotal: 120,
  storageUsed: 64,
  storageTotal: 100,
};

export interface Kpi {
  label: string;
  value: string;
  delta: string;
  /** 环比方向：up=增（绿）/down=减（红）；对"越大越好"指标 */
  good: 'up' | 'down' | 'flat';
}
export const KPIS: Kpi[] = [
  { label: '累计工单', value: '48,260', delta: '+312 今日', good: 'up' },
  { label: '今日新增', value: '312', delta: '+18 较昨日', good: 'up' },
  { label: 'SLA 达成率', value: '95.6%', delta: '+1.2%', good: 'up' },
  { label: '活跃坐席', value: '86', delta: '+3', good: 'up' },
  { label: '客户总数', value: '12,480', delta: '+126', good: 'up' },
  { label: '知识库条目', value: '1,204', delta: '+9', good: 'up' },
];

// 工单量趋势（近 14 天，新增 vs 解决）
export interface TrendDay {
  day: string;
  created: number;
  resolved: number;
}
export const TREND: TrendDay[] = [
  ['06-01', 280, 265], ['06-02', 310, 290], ['06-03', 295, 300], ['06-04', 330, 312],
  ['06-05', 340, 320], ['06-06', 300, 305], ['06-07', 260, 270], ['06-08', 312, 298],
  ['06-09', 335, 322], ['06-10', 360, 340], ['06-11', 348, 350], ['06-12', 320, 318],
  ['06-13', 305, 312], ['06-14', 330, 325],
].map(([day, created, resolved]) => ({ day: day as string, created: created as number, resolved: resolved as number }));

export interface AdminTodo {
  type: string;
  text: string;
  tone: 'warn' | 'danger' | 'info';
  count: number;
}
export const TODOS: AdminTodo[] = [
  { type: '待审批', text: '角色权限变更待审批', tone: 'info', count: 3 },
  { type: '规则告警', text: 'SLA 策略命中异常，建议检查', tone: 'danger', count: 2 },
  { type: '即将到期', text: '2 个连接器令牌 7 天内到期', tone: 'warn', count: 2 },
  { type: '配置异常', text: '邮件渠道发送失败率偏高', tone: 'warn', count: 1 },
];

export const QUICK_CONFIG = [
  { label: '工单类型', key: 'ticket-types' },
  { label: 'SLA 策略', key: 'sla-policy' },
  { label: '用户管理', key: 'users' },
  { label: '角色权限', key: 'roles' },
  { label: '规则中心', key: 'rules' },
  { label: '消息中心', key: 'message-center' },
];

export interface ServiceHealth {
  name: string;
  status: '正常' | '降级' | '异常';
}
export const SYSTEM_STATUS: ServiceHealth[] = [
  { name: '工单服务', status: '正常' },
  { name: 'SLA 引擎', status: '正常' },
  { name: '消息网关', status: '降级' },
  { name: '派单服务', status: '正常' },
];

export const ANNOUNCEMENTS = [
  { title: 'v2.3 工单智能化升级已发布', time: '06-14' },
  { title: '618 大促期间 SLA 临时策略生效', time: '06-10' },
  { title: '知识库批量导入功能上线', time: '06-08' },
];
