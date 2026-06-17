// 审计日志 Mock（对齐 A5-permission.html#audit）

export type AuditCategory = 'auth' | 'workorder' | 'process' | 'config' | 'permission';

export interface AuditLogItem {
  id: string;
  category: AuditCategory;
  categoryLabel: string;
  event: string;
  operator: string;
  role: string;
  targetId: string;
  ip: string;
  time: string;
  detail: string;
}

export const AUDIT_STATS = {
  todayTotal: '12,847',
  loginCount: '1,234',
  workorderOps: '8,562',
  configChanges: '47',
};

export const AUDIT_CATEGORIES = [
  { value: '', label: '全部分类' },
  { value: 'auth', label: '认证' },
  { value: 'workorder', label: '工单' },
  { value: 'process', label: '流程' },
  { value: 'config', label: '配置' },
  { value: 'permission', label: '权限' },
] as const;

export const AUDIT_LOGS: AuditLogItem[] = [
  { id: 'AL-20260324-001', category: 'auth', categoryLabel: '认证', event: '用户登录', operator: '张明辉', role: '客服组长', targetId: '-', ip: '10.12.35.101', time: '2026-03-24 09:15:03', detail: '{"action":"LOGIN","method":"SSO","device":"Chrome/120 Windows","location":"合肥"}' },
  { id: 'AL-20260324-002', category: 'workorder', categoryLabel: '工单', event: '创建工单', operator: '赵雪梅', role: '一线坐席', targetId: 'GD-20260324-00456', ip: '10.12.35.102', time: '2026-03-24 09:18:22', detail: '{"action":"WORKORDER_CREATE","productLine":"learning_device","issueType":"hardware","priority":"normal","customerPhone":"138****5678"}' },
  { id: 'AL-20260324-003', category: 'workorder', categoryLabel: '工单', event: '分配工单', operator: '张明辉', role: '客服组长', targetId: 'GD-20260324-00456', ip: '10.12.35.101', time: '2026-03-24 09:20:15', detail: '{"action":"WORKORDER_ASSIGN","fromHandler":null,"toHandler":"U-003","toHandlerName":"王思远"}' },
  { id: 'AL-20260324-004', category: 'process', categoryLabel: '流程', event: '启动流程', operator: '系统', role: '系统', targetId: 'PI-20260324-00089', ip: '-', time: '2026-03-24 09:20:16', detail: '{"action":"PROCESS_START","processId":"PD-STANDARD-SERVICE","version":3}' },
  { id: 'AL-20260324-005', category: 'workorder', categoryLabel: '工单', event: '升级工单', operator: '王思远', role: '高级处理人', targetId: 'GD-20260324-00412', ip: '10.12.36.55', time: '2026-03-24 09:25:44', detail: '{"action":"WORKORDER_ESCALATE","targetSystem":"RDM","issueId":"RDM-2026-1234"}' },
  { id: 'AL-20260324-006', category: 'config', categoryLabel: '配置', event: '规则变更', operator: '陈文博', role: '运营管理员', targetId: 'RULE-ROUTE-001', ip: '10.12.40.10', time: '2026-03-24 09:30:08', detail: '{"action":"RULE_UPDATE","changes":[{"field":"priority","old":90,"new":100}],"version":"v3"}' },
  { id: 'AL-20260324-007', category: 'permission', categoryLabel: '权限', event: '角色分配', operator: '陈文博', role: '运营管理员', targetId: 'U-005', ip: '10.12.40.10', time: '2026-03-24 09:32:19', detail: '{"action":"ROLE_ASSIGN","userId":"U-005","userName":"赵雪梅","addedRoles":["高级坐席"],"removedRoles":["一线坐席"]}' },
  { id: 'AL-20260324-008', category: 'auth', categoryLabel: '认证', event: '登录失败', operator: '孙丽华', role: '质检专员', targetId: '-', ip: '192.168.1.55', time: '2026-03-22 14:20:33', detail: '{"action":"LOGIN_FAILED","reason":"password_incorrect","attemptCount":5,"resultAction":"account_locked_15min"}' },
  { id: 'AL-20260324-009', category: 'config', categoryLabel: '配置', event: 'SLA配置变更', operator: '陈文博', role: '运营管理员', targetId: 'SLA-RULE-003', ip: '10.12.40.10', time: '2026-03-24 09:35:55', detail: '{"action":"SLA_UPDATE","changes":[{"field":"responseTime","old":"4h","new":"2h"}]}' },
  { id: 'AL-20260324-010', category: 'process', categoryLabel: '流程', event: '节点完成', operator: '王思远', role: '高级处理人', targetId: 'NI-20260324-00345', ip: '10.12.36.55', time: '2026-03-24 09:38:12', detail: '{"action":"NODE_COMPLETE","nodeName":"处理","result":"completed","nextNode":"审核"}' },
];

export const CATEGORY_TAG_COLOR: Record<AuditCategory, string> = {
  auth: 'blue',
  workorder: 'green',
  process: 'purple',
  config: 'orange',
  permission: 'red',
};
