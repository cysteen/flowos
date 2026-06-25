// 角色定义（对齐 PRD-08 / login.html 账号体系）
// 坐席 3 类 + 管理 3 类；废弃裸 `agent`。
export type RoleKey =
  | 'agent-cs'
  | 'agent-as'
  | 'team-leader'
  | 'system-admin'
  | 'ops-admin'
  | 'tenant-admin';

// platform=平台超管(系统管理员)；tenant=租户管理员(人/权限/安全)；ops=运营管理员(工单流转)
export type AdminScope = 'platform' | 'tenant' | 'ops';

export interface RoleDef {
  key: RoleKey;
  /** 角色显示名 */
  name: string;
  /** 可见导航菜单 key（对齐 config/navigation.ts NAV_ITEMS.key） */
  menus: string[];
  /** 工单工作台中需隐藏的 Tab key */
  hiddenTabs: string[];
  /** 是否显示「管理后台」入口（头像下拉） */
  hasAdminEntry: boolean;
  /** 管理后台数据范围（仅 hasAdminEntry=true 时有效） */
  adminScope?: AdminScope;
}

export const ROLES: Record<RoleKey, RoleDef> = {
  'agent-cs': {
    key: 'agent-cs',
    name: '客服·二线坐席',
    menus: ['home', 'tickets', 'approval'],
    hiddenTabs: ['review', 'cc'],
    hasAdminEntry: false,
  },
  'agent-as': {
    key: 'agent-as',
    name: '售后·二线坐席',
    menus: ['home', 'aftersale', 'approval'],
    hiddenTabs: ['review', 'cc'],
    hasAdminEntry: false,
  },
  'team-leader': {
    key: 'team-leader',
    name: '班组长',
    menus: ['home', 'tickets', 'team-board', 'approval'],
    hiddenTabs: ['cc'],
    hasAdminEntry: false,
  },
  'system-admin': {
    key: 'system-admin',
    name: '系统管理员',
    menus: ['home', 'tickets', 'aftersale', 'team-board', 'approval'],
    hiddenTabs: ['cc'],
    hasAdminEntry: true,
    adminScope: 'platform',
  },
  'ops-admin': {
    key: 'ops-admin',
    name: '运营管理员',
    menus: ['home', 'tickets', 'aftersale', 'team-board', 'approval'],
    hiddenTabs: ['cc'],
    hasAdminEntry: true,
    adminScope: 'ops',
  },
  'tenant-admin': {
    key: 'tenant-admin',
    name: '租户管理员',
    menus: ['home', 'tickets', 'aftersale', 'team-board', 'approval'],
    hiddenTabs: ['cc'],
    hasAdminEntry: true,
    adminScope: 'tenant',
  },
};

/** 顶栏「切换演示角色」分组选项 */
export const ROLE_OPTION_GROUPS = [
  {
    label: '坐席',
    options: [
      { label: ROLES['agent-cs'].name, value: 'agent-cs' as RoleKey },
      { label: ROLES['agent-as'].name, value: 'agent-as' as RoleKey },
      { label: ROLES['team-leader'].name, value: 'team-leader' as RoleKey },
    ],
  },
  {
    label: '管理',
    options: [
      { label: ROLES['system-admin'].name, value: 'system-admin' as RoleKey },
      { label: ROLES['ops-admin'].name, value: 'ops-admin' as RoleKey },
      { label: ROLES['tenant-admin'].name, value: 'tenant-admin' as RoleKey },
    ],
  },
];

export const ALL_ROLE_KEYS = Object.keys(ROLES) as RoleKey[];

export function isRoleKey(key: string): key is RoleKey {
  return ALL_ROLE_KEYS.includes(key as RoleKey);
}

/** @deprecated 使用 ROLE_OPTION_GROUPS */
export const ROLE_OPTIONS = ALL_ROLE_KEYS.map((k) => ({
  label: ROLES[k].name,
  value: k,
}));
