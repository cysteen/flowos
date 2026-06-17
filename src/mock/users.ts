import type { RoleKey } from '@/config/roles';

// Mock 用户（用于顶栏 Dev 下拉切换演示角色，验证菜单裁剪与路由守卫）。
export interface MockUser {
  name: string;
  roleKey: RoleKey;
}

export const MOCK_USERS: Record<RoleKey, MockUser> = {
  'agent-cs': { name: '张三', roleKey: 'agent-cs' },
  'agent-as': { name: '李四', roleKey: 'agent-as' },
  'team-leader': { name: '王组长', roleKey: 'team-leader' },
  'tenant-admin': { name: '赵管理', roleKey: 'tenant-admin' },
};

/** 默认登录用户：张三 / 客服·二线坐席（§0.2 定稿） */
export const DEFAULT_ROLE: RoleKey = 'agent-cs';
