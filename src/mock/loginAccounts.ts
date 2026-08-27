import { roleOptionLabel, type AgentPost, type RoleKey } from '@/config/roles';

/**
 * 演示账号 —— 覆盖 0830 定的**全部 9 个角色**（管理员展开成三个 adminScope，共 11 个 RoleKey）。
 *
 * **角色显示名不在本文件写死**，一律取 `roleOptionLabel(roleKey)`：
 * 角色名的真源是 `config/roles.ts`（它又对齐《00-基线-工单状态与动作》§3.0），
 * 两处各写一份必然漂 —— 本表此前就漂成了「售后坐席」「班组管理」「运营监控」这类旧称。
 *
 * **一线坐席已有账号**（2026-08-19）：它业务上在系统外（呼叫中心 iframe 嵌入），
 * 但交互稿要能真实切到该视角核权限。
 *
 * **客服 / 售后是分岗不是角色**（基线 §3.0）：两个账号都落 `agent-l2`，差别在 `post`。
 * 顶栏切换器只切角色，切到二线专员时分岗回落到角色缺省（客服岗）；
 * 要看售后岗视角就用 13600001111 登录。
 */
export interface LoginAccount {
  account: string;
  /** 显示名，派生自 ROLES，不要手写 */
  label: string;
  roleKey: RoleKey;
  /** 二线专员的分岗；其余角色不填 */
  post?: AgentPost;
}

/** 账号 → 角色。顺序按基线 §3.0 的角色行序 */
const ACCOUNT_ROLE_PAIRS: Array<[account: string, roleKey: RoleKey, post?: AgentPost]> = [
  ['13500001111', 'agent-l1'],
  ['13857985858', 'agent-l2', 'cs'],
  ['13600001111', 'agent-l2', 'as'],
  ['13911112222', 'tech-support'],
  ['18500003333', 'team-leader'],
  ['13822223333', 'complaint-handler'],
  ['18066668888', 'ops-monitor'],
  ['13733334444', 'complaint-supervisor'],
  ['13744445555', 'qa'],
  ['18756826666', 'ops-admin'],
  ['13965087676', 'tenant-admin'],
  ['18923879898', 'system-admin'],
];

export const LOGIN_ACCOUNTS: LoginAccount[] = ACCOUNT_ROLE_PAIRS.map(
  ([account, roleKey, post]) => ({
    account,
    roleKey,
    post,
    label: post ? `${roleOptionLabel(roleKey)} · ${post === 'as' ? '售后岗' : '客服岗'}` : roleOptionLabel(roleKey),
  }),
);

export const DEMO_PASSWORD = '123';

export function findAccount(account: string): LoginAccount | undefined {
  return LOGIN_ACCOUNTS.find((a) => a.account === account.trim());
}
