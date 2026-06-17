import type { RoleKey } from '@/config/roles';

/** 演示账号（对齐 prototypeV2/login.html） */
export interface LoginAccount {
  account: string;
  label: string;
  roleKey: RoleKey;
}

export const LOGIN_ACCOUNTS: LoginAccount[] = [
  { account: '13857985858', label: '工单应用', roleKey: 'agent-cs' },
  { account: '13600001111', label: '售后坐席', roleKey: 'agent-as' },
  { account: '18500003333', label: '班组管理', roleKey: 'team-leader' },
  { account: '18756826666', label: '租户运营', roleKey: 'ops-admin' },
  { account: '13965087676', label: '租户管理', roleKey: 'tenant-admin' },
  { account: '18923879898', label: '系统管理', roleKey: 'system-admin' },
];

export const DEMO_PASSWORD = '123';

export function findAccount(account: string): LoginAccount | undefined {
  return LOGIN_ACCOUNTS.find((a) => a.account === account.trim());
}
