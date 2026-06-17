// 角色定义（对齐 Prompt 指南 §0.2 / §2.4 定稿）
// 统一角色 key，废弃裸 `agent`。
export type RoleKey = 'agent-cs' | 'agent-as' | 'team-leader' | 'tenant-admin';

export interface RoleDef {
  key: RoleKey;
  /** 角色显示名 */
  name: string;
  /** 可见导航菜单 key（对齐 config/navigation.ts NAV_ITEMS.key） */
  menus: string[];
  /** 工单工作台中需隐藏的 Tab key（Phase 2 用；如坐席隐藏「待审核」review） */
  hiddenTabs: string[];
  /** 是否显示「管理后台」入口（头像下拉） */
  hasAdminEntry: boolean;
}

export const ROLES: Record<RoleKey, RoleDef> = {
  'agent-cs': {
    key: 'agent-cs',
    name: '客服·二线坐席',
    menus: ['home', 'tickets'],
    hiddenTabs: ['review'],
    hasAdminEntry: false,
  },
  'agent-as': {
    key: 'agent-as',
    name: '售后·二线坐席',
    menus: ['home', 'aftersale'],
    hiddenTabs: ['review'],
    hasAdminEntry: false,
  },
  'team-leader': {
    key: 'team-leader',
    name: '班组长',
    // §2.4「班组长 + 班组看板」：在客服坐席基础上增加班组看板
    menus: ['home', 'tickets', 'team-board'],
    hiddenTabs: [],
    hasAdminEntry: false,
  },
  'tenant-admin': {
    key: 'tenant-admin',
    name: '租户管理员',
    // §2.4「全部 4 项」+ 管理后台入口
    menus: ['home', 'tickets', 'aftersale', 'team-board'],
    hiddenTabs: [],
    hasAdminEntry: true,
  },
};

/** 顶栏 Dev 下拉用的角色选项 */
export const ROLE_OPTIONS = Object.values(ROLES).map((r) => ({
  label: r.name,
  value: r.key,
}));
