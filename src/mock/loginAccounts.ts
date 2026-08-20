import { ROLES, type RoleKey } from '@/config/roles';

/**
 * 演示账号 —— 一个账号对一个角色，覆盖全部 10 个 RoleKey。
 *
 * **角色显示名不在本文件写死**，一律取 `ROLES[roleKey].name`：
 * 角色名的真源是 `config/roles.ts`（它又对齐《00-基线-工单状态与动作》§3 §4），
 * 两处各写一份必然漂 —— 本表此前就漂成了「售后坐席」「班组管理」「运营监控」这类旧称。
 *
 * **一线坐席已有账号**（2026-08-19）：它业务上在系统外（呼叫中心 iframe 嵌入），
 * 但交互稿要能真实切到该视角核权限。此前是用工单上的 `frontlineDemo` 假字段模拟的，
 * 12 张 mock 单里 11 张带着它，等于所有角色打开这些单都变成一线视角。
 *
 * 基线的 9 类角色里仍有一类**没有登录账号**，不是漏配：
 * - **质检员 / 抄送**：本期未落 RoleKey，菜单与数据范围都还没定义。
 *   落了 RoleKey 再加账号，现在加进来点进去是空的。
 */
export interface LoginAccount {
  account: string;
  /** 显示名，派生自 ROLES，不要手写 */
  label: string;
  roleKey: RoleKey;
}

/** 账号 → 角色。顺序按基线的角色行序：一线 / 二线客服 / 二线售后 / 三线 / 班组长 / 投诉处理 / 运营监控岗 / 三类管理员 */
const ACCOUNT_ROLE_PAIRS: Array<[account: string, roleKey: RoleKey]> = [
  ['13500001111', 'agent-l1'],
  ['13857985858', 'agent-cs'],
  ['13600001111', 'agent-as'],
  ['13911112222', 'tech-support'],
  ['18500003333', 'team-leader'],
  ['13822223333', 'complaint-handler'],
  ['18066668888', 'ops-monitor'],
  ['18756826666', 'ops-admin'],
  ['13965087676', 'tenant-admin'],
  ['18923879898', 'system-admin'],
];

export const LOGIN_ACCOUNTS: LoginAccount[] = ACCOUNT_ROLE_PAIRS.map(
  ([account, roleKey]) => ({ account, roleKey, label: ROLES[roleKey].name }),
);

export const DEMO_PASSWORD = '123';

export function findAccount(account: string): LoginAccount | undefined {
  return LOGIN_ACCOUNTS.find((a) => a.account === account.trim());
}
