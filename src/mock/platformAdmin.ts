// 平台超管（系统管理员）Mock — 对齐 A7-platform-admin.html。

export interface TenantQuota {
  orderLimit: number; orderUsed: number; orderPct: number;
  outboundLimit: number; outboundUsed: number; outboundPct: number;
  storageLimit: number; storageUsed: number; storagePct: number;
}
export interface TenantLog { time: string; action: string; user: string }
export interface Tenant {
  id: string; name: string; code: string; status: 'active' | 'suspended';
  admin: string; adminPhone: string; adminLimit: number; adminCount: number;
  plan: string; createdAt: string; color: string;
  quota: TenantQuota; logs: TenantLog[];
}

/** 平台硬约束：单租户「租户管理员」席位上限 */
export const TENANT_ADMIN_SEAT_MAX = 3;

/** 套餐选项（与「平台门禁·套餐管理」一致）——新建租户时由系统管理员选择 */
export interface PlanOption {
  value: string; label: string; seats: string; orders: string; outbound: string; storage: string;
  quota: { orderLimit: number; outboundLimit: number; storageLimit: number };
}
export const PLAN_OPTIONS: PlanOption[] = [
  { value: '基础版', label: '基础版', seats: '≤10 席', orders: '1,000/月', outbound: '500/日', storage: '10 GB', quota: { orderLimit: 1000, outboundLimit: 500, storageLimit: 10 } },
  { value: '专业版', label: '专业版', seats: '≤50 席', orders: '2万/月', outbound: '3,000/日', storage: '100 GB', quota: { orderLimit: 20000, outboundLimit: 3000, storageLimit: 100 } },
  { value: '旗舰版', label: '旗舰版', seats: '不限', orders: '不限', outbound: '1万/日', storage: '1 TB', quota: { orderLimit: 100000, outboundLimit: 10000, storageLimit: 1000 } },
];

/** 套餐视觉标识（标签色 / 强调色）——全站统一 */
export interface PlanBrand { color: string; tagColor: string; crown?: boolean }
export const PLAN_BRAND: Record<string, PlanBrand> = {
  基础版: { color: '#9ca3af', tagColor: 'default' },
  专业版: { color: '#1a6fff', tagColor: 'blue' },
  旗舰版: { color: '#d48806', tagColor: 'gold', crown: true },
};
export function getPlanBrand(plan: string): PlanBrand {
  return PLAN_BRAND[plan] ?? PLAN_BRAND['基础版'];
}

export const TENANTS: Tenant[] = [
  {
    id: 't1', name: '讯飞科技', code: 'XFKJ', status: 'active', admin: 'zhang@xfyun.cn', adminPhone: '138 0013 8001', adminLimit: 3, adminCount: 2, plan: '旗舰版', createdAt: '2025-01-15', color: '#1A6FFF',
    quota: { orderLimit: 5000, orderUsed: 3200, orderPct: 64, outboundLimit: 10000, outboundUsed: 7600, outboundPct: 76, storageLimit: 500, storageUsed: 280, storagePct: 56 },
    logs: [{ time: '2026-04-20 14:30', action: '调整配额', user: 'admin' }, { time: '2026-04-18 09:15', action: '修改配置', user: 'admin' }, { time: '2025-01-15 10:00', action: '创建租户', user: 'admin' }],
  },
  {
    id: 't2', name: '教育事业部', code: 'JYSYB', status: 'active', admin: 'li@edu.cn', adminPhone: '139 0013 9002', adminLimit: 3, adminCount: 1, plan: '专业版', createdAt: '2025-02-20', color: '#10B981',
    quota: { orderLimit: 2000, orderUsed: 1450, orderPct: 73, outboundLimit: 3000, outboundUsed: 2520, outboundPct: 84, storageLimit: 200, storageUsed: 145, storagePct: 73 },
    logs: [{ time: '2026-04-19 11:20', action: '调整外呼配额', user: 'admin' }, { time: '2025-02-20 15:30', action: '创建租户', user: 'admin' }],
  },
  {
    id: 't3', name: '智能硬件部', code: 'ZNJYB', status: 'suspended', admin: 'wang@hw.cn', adminPhone: '137 0013 7003', adminLimit: 3, adminCount: 1, plan: '基础版', createdAt: '2025-03-10', color: '#9CA3AF',
    quota: { orderLimit: 500, orderUsed: 480, orderPct: 96, outboundLimit: 500, outboundUsed: 420, outboundPct: 84, storageLimit: 50, storageUsed: 42, storagePct: 84 },
    logs: [{ time: '2026-04-21 08:00', action: '停用租户', user: 'admin' }, { time: '2026-04-10 16:45', action: '配额预警', user: 'system' }, { time: '2025-03-10 14:00', action: '创建租户', user: 'admin' }],
  },
];

/** 推荐起步角色预设（帮助新租户快速搭建团队） */
export interface RolePreset {
  key: string; name: string; emoji: string; color: string;
  desc: string; perms: string[]; tenantAdmin?: boolean;
}
export const ROLE_PRESETS: RolePreset[] = [
  { key: 'agent', name: '客服坐席', emoji: '🎧', color: '#1A6FFF', desc: '受理与处理工单，最常用的一线角色', perms: ['工单工作台', '受理/处理/流转', '客户查询'] },
  { key: 'leader', name: '班组长', emoji: '🧭', color: '#8B5CF6', desc: '管理团队、审批强结/升级、查看看板', perms: ['班组看板', '审批中心', '强结/升级审批', '坐席监控'] },
  { key: 'ops', name: '运营专员', emoji: '⚙️', color: '#10B981', desc: '维护工单类型、SLA、规则与字典等配置', perms: ['工单配置', 'SLA 与规则', '模板库', '字典管理'] },
  { key: 'tenant-admin', name: '租户管理员', emoji: '🛡️', color: '#EF4444', desc: '管理组织、用户、权限与安全（受席位上限约束）', perms: ['组织与权限', '用户/角色', '集成对接', '安全审计'], tenantAdmin: true },
];

export interface SimDept { id: string; name: string; count: number }
export const SIM_ORG_TREE: SimDept[] = [
  { id: 'dept1', name: '客服中心', count: 5 },
  { id: 'dept2', name: '售后服务部', count: 2 },
  { id: 'dept3', name: '运营管理部', count: 2 },
  { id: 'dept4', name: '技术支持部', count: 1 },
];

export interface SimUser {
  id: string; name: string; empId: string; role: string; dept: string;
  status: '在线' | '忙碌' | '离线'; load: number; avatarBg: string; roleBg: string; roleColor: string;
}
export const SIM_USERS: SimUser[] = [
  { id: 'u1', name: '张小明', empId: 'CS001', role: '客服坐席', dept: 'dept1', status: '在线', load: 45, avatarBg: '#1A6FFF', roleBg: '#E8F1FF', roleColor: '#1A6FFF' },
  { id: 'u2', name: '李晓红', empId: 'CS002', role: '客服坐席', dept: 'dept1', status: '忙碌', load: 78, avatarBg: '#10B981', roleBg: '#E8F1FF', roleColor: '#1A6FFF' },
  { id: 'u3', name: '王大力', empId: 'CS003', role: '组长', dept: 'dept1', status: '在线', load: 62, avatarBg: '#8B5CF6', roleBg: '#F5F3FF', roleColor: '#8B5CF6' },
  { id: 'u4', name: '赵敏', empId: 'CS004', role: '客服坐席', dept: 'dept1', status: '离线', load: 0, avatarBg: '#F59E0B', roleBg: '#E8F1FF', roleColor: '#1A6FFF' },
  { id: 'u5', name: '刘强', empId: 'CS005', role: '客服坐席', dept: 'dept1', status: '在线', load: 55, avatarBg: '#EF4444', roleBg: '#E8F1FF', roleColor: '#1A6FFF' },
  { id: 'u6', name: '陈静', empId: 'AS001', role: '客服坐席', dept: 'dept2', status: '在线', load: 40, avatarBg: '#06B6D4', roleBg: '#E8F1FF', roleColor: '#1A6FFF' },
  { id: 'u7', name: '周杰', empId: 'AS002', role: '组长', dept: 'dept2', status: '在线', load: 58, avatarBg: '#8B5CF6', roleBg: '#F5F3FF', roleColor: '#8B5CF6' },
  { id: 'u8', name: '吴梅', empId: 'OP001', role: '运营专员', dept: 'dept3', status: '在线', load: 35, avatarBg: '#10B981', roleBg: '#ECFDF5', roleColor: '#059669' },
  { id: 'u9', name: '郑云', empId: 'OP002', role: '租户管理员', dept: 'dept3', status: '在线', load: 25, avatarBg: '#EF4444', roleBg: '#FEF2F2', roleColor: '#DC2626' },
  { id: 'u10', name: '孙丽', empId: 'TS001', role: '客服坐席', dept: 'dept4', status: '忙碌', load: 82, avatarBg: '#F59E0B', roleBg: '#E8F1FF', roleColor: '#1A6FFF' },
];

export const DEFAULT_SYS_SETTINGS = {
  globalRateLimit: 1000, tenantRateLimit: 100, ipRateLimit: 60, rateLimitStrategy: 'reject',
  maintStart: '', maintEnd: '', maintMessage: '系统维护中，预计1小时后恢复', maintEnabled: false,
  smtpHost: 'smtp.example.com', smtpPort: 465, senderEmail: 'noreply@iflytek.com', senderName: '讯飞工单系统',
  emailEnabled: true, smsEnabled: false,
};
