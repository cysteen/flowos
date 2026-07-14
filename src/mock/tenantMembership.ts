import type { RoleKey } from '@/config/roles';

/** 用户在某租户下的成员关系（租户间数据隔离，角色独立配置） */
export interface TenantMembership {
  tenantId: string;
  roles: RoleKey[];
  defaultRole?: RoleKey;
}

/** 租户运营档案（管理后台展示用，按租户隔离） */
export interface TenantProfile {
  name: string;
  plan: string;
  status: string;
  expiry: string;
  seatUsed: number;
  seatTotal: number;
  storageUsed: number;
  storageTotal: number;
}

export const TENANT_PROFILES: Record<string, TenantProfile> = {
  t1: {
    name: '讯飞科技',
    plan: '旗舰版',
    status: '正常',
    expiry: '2027-06-30',
    seatUsed: 86,
    seatTotal: 120,
    storageUsed: 64,
    storageTotal: 100,
  },
  t2: {
    name: '教育事业部',
    plan: '专业版',
    status: '正常',
    expiry: '2026-12-31',
    seatUsed: 32,
    seatTotal: 50,
    storageUsed: 28,
    storageTotal: 100,
  },
  t3: {
    name: '智能硬件部',
    plan: '基础版',
    status: '已停用',
    expiry: '2026-03-01',
    seatUsed: 8,
    seatTotal: 10,
    storageUsed: 12,
    storageTotal: 50,
  },
  t4: {
    name: '科大讯飞教育BG',
    plan: '旗舰版',
    status: '正常',
    expiry: '2027-04-08',
    seatUsed: 64,
    seatTotal: 120,
    storageUsed: 42,
    storageTotal: 100,
  },
  t5: {
    name: '科大讯飞客服服务',
    plan: '专业版',
    status: '正常',
    expiry: '2026-12-31',
    seatUsed: 28,
    seatTotal: 50,
    storageUsed: 20,
    storageTotal: 100,
  },
  t6: {
    name: '招商银行',
    plan: '旗舰版',
    status: '正常',
    expiry: '2027-06-01',
    seatUsed: 110,
    seatTotal: 120,
    storageUsed: 43,
    storageTotal: 100,
  },
  t7: {
    name: '得物客服',
    plan: '专业版',
    status: '正常',
    expiry: '2027-06-20',
    seatUsed: 44,
    seatTotal: 50,
    storageUsed: 69,
    storageTotal: 100,
  },
};

/** 演示账号 → 可访问租户列表（含停用租户，前端置灰不可选） */
export const ACCOUNT_TENANT_MEMBERSHIPS: Record<string, TenantMembership[]> = {
  // 张三：多租户坐席/组长（含停用 t3 演示置灰）
  '13857985858': [
    { tenantId: 't1', roles: ['agent-cs', 'team-leader'], defaultRole: 'agent-cs' },
    { tenantId: 't2', roles: ['agent-cs'], defaultRole: 'agent-cs' },
    { tenantId: 't4', roles: ['agent-cs', 'team-leader'], defaultRole: 'agent-cs' },
    { tenantId: 't6', roles: ['agent-cs'], defaultRole: 'agent-cs' },
    { tenantId: 't7', roles: ['agent-cs'], defaultRole: 'agent-cs' },
    { tenantId: 't3', roles: ['agent-cs'], defaultRole: 'agent-cs' },
  ],
  // 售后坐席：多租户
  '13600001111': [
    { tenantId: 't1', roles: ['agent-as'], defaultRole: 'agent-as' },
    { tenantId: 't5', roles: ['agent-as'], defaultRole: 'agent-as' },
    { tenantId: 't7', roles: ['agent-as'], defaultRole: 'agent-as' },
  ],
  // 班组长：多租户
  '18500003333': [
    { tenantId: 't1', roles: ['team-leader'], defaultRole: 'team-leader' },
    { tenantId: 't2', roles: ['team-leader'], defaultRole: 'team-leader' },
    { tenantId: 't4', roles: ['team-leader'], defaultRole: 'team-leader' },
  ],
  // 周运营：运营管理员，多租户
  '18756826666': [
    { tenantId: 't1', roles: ['ops-admin'], defaultRole: 'ops-admin' },
    { tenantId: 't4', roles: ['ops-admin'], defaultRole: 'ops-admin' },
    { tenantId: 't5', roles: ['ops-admin'], defaultRole: 'ops-admin' },
    { tenantId: 't6', roles: ['ops-admin'], defaultRole: 'ops-admin' },
    { tenantId: 't7', roles: ['ops-admin'], defaultRole: 'ops-admin' },
  ],
  // 租户管理员：多租户
  '13965087676': [
    { tenantId: 't1', roles: ['tenant-admin'], defaultRole: 'tenant-admin' },
    { tenantId: 't6', roles: ['tenant-admin'], defaultRole: 'tenant-admin' },
    { tenantId: 't7', roles: ['tenant-admin'], defaultRole: 'tenant-admin' },
  ],
  // 系统管理员：无租户归属（平台级）
  '18923879898': [],
};

export function getMembershipsForAccount(account: string): TenantMembership[] {
  return ACCOUNT_TENANT_MEMBERSHIPS[account.trim()] ?? [];
}

export function getTenantProfile(tenantId: string): TenantProfile {
  return TENANT_PROFILES[tenantId] ?? TENANT_PROFILES.t1;
}
