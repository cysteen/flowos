import type { RoleKey } from '@/config/roles';

// Mock 用户（顶栏 Dev 下拉 / 登录态演示）。
export interface MockUser {
  name: string;
  roleKey: RoleKey;
}

export const MOCK_USERS: Record<RoleKey, MockUser> = {
  'agent-l1': { name: '刘一线', roleKey: 'agent-l1' },
  'agent-cs': { name: '张三', roleKey: 'agent-cs' },
  'agent-as': { name: '李四', roleKey: 'agent-as' },
  'tech-support': { name: '陈技支', roleKey: 'tech-support' },
  'team-leader': { name: '王组长', roleKey: 'team-leader' },
  'complaint-handler': { name: '吴投诉', roleKey: 'complaint-handler' },
  'ops-monitor': { name: '郑监控', roleKey: 'ops-monitor' },
  'system-admin': { name: '孙系统', roleKey: 'system-admin' },
  'ops-admin': { name: '周运营', roleKey: 'ops-admin' },
  'tenant-admin': { name: '赵管理', roleKey: 'tenant-admin' },
};

/** 默认登录用户：张三 / 客服·二线技术顾问 */
export const DEFAULT_ROLE: RoleKey = 'agent-cs';
