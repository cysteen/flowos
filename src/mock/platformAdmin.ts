// 平台超管（系统管理员）Mock — 对齐 A7-platform-admin.html。

export interface TenantQuota {
  orderLimit: number; orderUsed: number; orderPct: number;
  apiLimit: number; apiUsed: number; apiPct: number;
  storageLimit: number; storageUsed: number; storagePct: number;
}
export interface TenantLog { time: string; action: string; user: string }
export interface Tenant {
  id: string; name: string; code: string; status: 'active' | 'suspended';
  admin: string; createdAt: string; color: string;
  quota: TenantQuota; logs: TenantLog[];
}

export const TENANTS: Tenant[] = [
  {
    id: 't1', name: '讯飞科技', code: 'XFKJ', status: 'active', admin: 'zhang@xfyun.cn', createdAt: '2025-01-15', color: '#1A6FFF',
    quota: { orderLimit: 5000, orderUsed: 3200, orderPct: 64, apiLimit: 50000, apiUsed: 38000, apiPct: 76, storageLimit: 500, storageUsed: 280, storagePct: 56 },
    logs: [{ time: '2026-04-20 14:30', action: '调整配额', user: 'admin' }, { time: '2026-04-18 09:15', action: '修改配置', user: 'admin' }, { time: '2025-01-15 10:00', action: '创建租户', user: 'admin' }],
  },
  {
    id: 't2', name: '教育事业部', code: 'JYSYB', status: 'active', admin: 'li@edu.cn', createdAt: '2025-02-20', color: '#10B981',
    quota: { orderLimit: 2000, orderUsed: 1450, orderPct: 73, apiLimit: 20000, apiUsed: 16800, apiPct: 84, storageLimit: 200, storageUsed: 145, storagePct: 73 },
    logs: [{ time: '2026-04-19 11:20', action: '调整API配额', user: 'admin' }, { time: '2025-02-20 15:30', action: '创建租户', user: 'admin' }],
  },
  {
    id: 't3', name: '智能硬件部', code: 'ZNJYB', status: 'suspended', admin: 'wang@hw.cn', createdAt: '2025-03-10', color: '#9CA3AF',
    quota: { orderLimit: 500, orderUsed: 480, orderPct: 96, apiLimit: 5000, apiUsed: 4200, apiPct: 84, storageLimit: 50, storageUsed: 42, storagePct: 84 },
    logs: [{ time: '2026-04-21 08:00', action: '停用租户', user: 'admin' }, { time: '2026-04-10 16:45', action: '配额预警', user: 'system' }, { time: '2025-03-10 14:00', action: '创建租户', user: 'admin' }],
  },
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
