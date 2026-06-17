import type { Component } from 'vue';
import {
  DashboardOutlined, TeamOutlined, AppstoreOutlined, FieldTimeOutlined,
  FileTextOutlined,   BranchesOutlined, DatabaseOutlined, ApiOutlined,
  SafetyCertificateOutlined, BankOutlined, SettingOutlined, CheckCircleOutlined,
} from '@ant-design/icons-vue';

import type { AdminScope } from '@/config/roles';

// 管理后台侧边栏（乐享式分组，对齐设计稿 wynSy / PRD-09）。
// 数据总览为一级直达项 + 8 个可折叠分组；二级页（编辑器/设计器/明细）点列表进入、不占导航。

export interface AdminNavItem {
  key: string;
  label: string;
  /** 对应 PRD 编号（占位页展示） */
  prd?: string;
}
export interface AdminNavGroup {
  key: string;
  label: string;
  icon: Component;
  /** 归属管理角色：tenant=租户管理员(人/权限/安全)，ops=运营管理员(工单流转) */
  scope: 'tenant' | 'ops';
  items: AdminNavItem[];
}

/** 一级直达：数据总览 */
export const ADMIN_OVERVIEW = { key: 'overview', label: '数据总览', icon: DashboardOutlined };

/** 一级直达：审批中心（审核运营员提交的配置变更发布申请，对齐 A8#approval） */
export const ADMIN_APPROVAL = { key: 'approval', label: '审批中心', icon: CheckCircleOutlined };

// 全部分组（按管理角色 scope 标注）。租户管理员与运营管理员各看其 scope 的分组。
export const ADMIN_GROUPS: AdminNavGroup[] = [
  // ===== 租户管理员：组织 / 权限 / 集成 / 安全 =====
  {
    key: 'org', label: '组织与权限', icon: TeamOutlined, scope: 'tenant',
    items: [
      { key: 'tenant-basic', label: '基本信息', prd: 'PRD-59a' },
      { key: 'users', label: '用户管理', prd: 'PRD-50' },
      { key: 'roles', label: '角色与权限', prd: 'PRD-51' },
    ],
  },
  {
    key: 'integration', label: '集成对接', icon: ApiOutlined, scope: 'tenant',
    items: [
      { key: 'connectors', label: '连接器总览', prd: 'PRD-86' },
      { key: 'message-center', label: '消息中心', prd: 'PRD-30' },
    ],
  },
  {
    key: 'security', label: '安全与审计', icon: SafetyCertificateOutlined, scope: 'tenant',
    items: [
      { key: 'third-party-login', label: '第三方登录', prd: 'PRD-44' },
      { key: 'audit-logs', label: '审计日志', prd: 'PRD-40' },
    ],
  },
  // ===== 运营管理员：工单流转全链路 =====
  {
    key: 'ticket-config', label: '工单配置', icon: AppstoreOutlined, scope: 'ops',
    items: [
      { key: 'ticket-types', label: '工单类型管理', prd: 'PRD-60' },
      { key: 'dicts', label: '字典管理', prd: 'PRD-52' },
      { key: 'entity-dict', label: '流程实体字典', prd: 'PRD-88' },
    ],
  },
  {
    key: 'sla', label: 'SLA 与规则', icon: FieldTimeOutlined, scope: 'ops',
    items: [
      { key: 'sla-policy', label: 'SLA策略', prd: 'PRD-55' },
      { key: 'sla-calendar', label: 'SLA工作日历', prd: 'PRD-56' },
      { key: 'sla-monitor', label: 'SLA监控看板', prd: 'PRD-57' },
      { key: 'rules', label: '规则中心', prd: 'PRD-58' },
    ],
  },
  {
    key: 'templates', label: '模板库', icon: FileTextOutlined, scope: 'ops',
    items: [
      { key: 'form-templates', label: '表单模板库', prd: 'PRD-66' },
      { key: 'flow-templates', label: '流程模板库', prd: 'PRD-67' },
    ],
  },
  {
    key: 'workflow', label: '工作流程', icon: BranchesOutlined, scope: 'ops',
    items: [
      { key: 'flow-instances', label: '流程实例', prd: 'PRD-73' },
      { key: 'flow-tasks', label: '流程任务', prd: 'PRD-74' },
      { key: 'flow-listeners', label: '流程监听器', prd: 'PRD-72' },
      { key: 'flow-expressions', label: '流程表达式', prd: 'PRD-71' },
    ],
  },
  {
    key: 'business', label: '业务管理', icon: DatabaseOutlined, scope: 'ops',
    items: [
      { key: 'teams', label: '用户分组', prd: 'PRD-59b' },
      { key: 'customers', label: '客户管理', prd: 'PRD-87' },
      { key: 'products', label: '产品管理', prd: 'PRD-85' },
      { key: 'channels', label: '渠道管理', prd: 'PRD-53' },
      { key: 'apps', label: '应用管理', prd: 'PRD-54' },
    ],
  },
];

/** 按管理角色 scope 取分组（tenant / ops） */
export function adminGroupsFor(scope?: AdminScope): AdminNavGroup[] {
  if (scope === 'ops') return ADMIN_GROUPS.filter((g) => g.scope === 'ops');
  return ADMIN_GROUPS.filter((g) => g.scope === 'tenant');
}

/** 所有模块 key（路由用，含两类 scope 全部子项） */
export const ADMIN_ALL_ITEMS = ADMIN_GROUPS.flatMap((g) =>
  g.items.map((i) => ({ ...i, group: g.label })),
);

// ===== 平台超管侧栏（系统管理员 / 运营管理员，adminScope='platform'）=====
// 对齐参考原型 main-navigation.html?mode=system → A7-platform-admin。
export interface AdminNavItemP {
  key: string;
  label: string;
  icon: Component;
}
export const PLATFORM_NAV: { groupLabel: string; items: AdminNavItemP[] } = {
  groupLabel: '系统管理',
  items: [
    { key: 'tenants', label: '租户管理', icon: BankOutlined },
    { key: 'sys-settings', label: '系统参数', icon: SettingOutlined },
  ],
};

/** 落地页「全部配置模块」网格：按当前管理角色 scope 取对应分组 */
export function moduleCardsFor(scope?: AdminScope) {
  return adminGroupsFor(scope).map((g) => ({
    key: g.key,
    label: g.label,
    icon: g.icon,
    desc: g.items.map((i) => i.label).join(' · '),
    firstPath: `/admin/${g.items[0].key}`,
  }));
}
