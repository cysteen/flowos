import type { AgentPost, RoleKey } from '@/config/roles';

// Mock 用户（顶栏 Dev 下拉 / 登录态演示）。
export interface MockUser {
  name: string;
  roleKey: RoleKey;
  /** 二线专员的分岗（客服 / 售后）。分岗是用户属性、不占 RoleKey，见基线 §3.0 */
  post?: AgentPost;
  /**
   * 所在班组（一人可在多个组）。取值只用工单处理组的已有组名（`PROCESSING_GROUPS`，
   * 即列表「分组名称」首项那五个），不新造组。催补待回「领取工单」弹窗的「领取后处理组」下拉取它。
   */
  groups?: string[];
}

const ALL_PROCESSING_GROUPS = ['受理一组', '受理二组', '硬件缺陷组', '教育支持组', '技术支持组'];

export const MOCK_USERS: Record<RoleKey, MockUser> = {
  'agent-l1': { name: '刘一线', roleKey: 'agent-l1', groups: ['受理一组'] },
  'agent-l2': { name: '张三', roleKey: 'agent-l2', post: 'cs', groups: ['受理一组', '受理二组'] },
  'tech-support': { name: '陈技支', roleKey: 'tech-support', groups: ['技术支持组'] },
  'team-leader': { name: '王组长', roleKey: 'team-leader', groups: ['受理一组', '受理二组'] },
  'complaint-handler': { name: '吴投诉', roleKey: 'complaint-handler', groups: ['受理一组', '受理二组', '教育支持组'] },
  'complaint-supervisor': { name: '秦督导', roleKey: 'complaint-supervisor', groups: ['受理一组', '受理二组', '硬件缺陷组'] },
  'ops-monitor': { name: '郑运营', roleKey: 'ops-monitor', groups: [...ALL_PROCESSING_GROUPS] },
  'qa': { name: '冯质检', roleKey: 'qa', groups: ['受理一组'] },
  'system-admin': { name: '孙系统', roleKey: 'system-admin', groups: [...ALL_PROCESSING_GROUPS] },
  'ops-admin': { name: '周运营', roleKey: 'ops-admin', groups: [...ALL_PROCESSING_GROUPS] },
  'tenant-admin': { name: '赵管理', roleKey: 'tenant-admin', groups: [...ALL_PROCESSING_GROUPS] },
};

/**
 * 二线专员 · **售后岗**的演示用户。
 * 分岗不是角色（基线 §3.0），故不占 RoleKey，也就进不了 `MOCK_USERS` 这张按 RoleKey 索引的表；
 * 用 `mockUserFor()` 按「角色 + 分岗」取人，售后岗才拿得到自己的名字。
 */
const AGENT_L2_AS_USER: MockUser = { name: '李四', roleKey: 'agent-l2', post: 'as', groups: ['硬件缺陷组'] };

/** 按角色 + 分岗取演示用户（分岗只对二线专员有意义） */
export function mockUserFor(roleKey: RoleKey, post?: AgentPost): MockUser {
  if (roleKey === 'agent-l2' && post === 'as') return AGENT_L2_AS_USER;
  return MOCK_USERS[roleKey];
}

/** 默认登录用户：张三 / 二线专员 · 客服岗 */
export const DEFAULT_ROLE: RoleKey = 'agent-l2';
