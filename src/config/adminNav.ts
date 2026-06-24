import type { Component } from 'vue';
import {
  DashboardOutlined, TeamOutlined, AppstoreOutlined, FieldTimeOutlined,
  FileTextOutlined, BranchesOutlined, DatabaseOutlined, ApiOutlined,
  SafetyCertificateOutlined, BankOutlined, SettingOutlined, CheckCircleOutlined,
  GoldOutlined,
} from '@ant-design/icons-vue';

import type { AdminScope } from '@/config/roles';

// 管理后台侧边栏（乐享式分组，对齐 PRD-09 / pen wynSy / V1-V2-功能对齐表.md）。
// 数据总览为一级直达 + 按 scope 分组；SLA/规则按 V1 A3/A4 拆为侧栏子项（路由 key 一一对应）。

export interface AdminNavItem {
  key: string;
  label: string;
  /** 对应 PRD 编号 */
  prd?: string;
  /** V1 HTML 原型落地路径（对齐表） */
  v1Ref?: string;
}

export interface AdminNavGroup {
  key: string;
  label: string;
  icon: Component;
  /** tenant=租户管理员；ops=运营管理员 */
  scope: 'tenant' | 'ops';
  items: AdminNavItem[];
}

/** 一级直达：数据总览 */
export const ADMIN_OVERVIEW = { key: 'overview', label: '数据总览', icon: DashboardOutlined };

/** 一级直达：配置变更审批（V1 A8#approval） */
export const ADMIN_APPROVAL = { key: 'approval', label: '审批中心', icon: CheckCircleOutlined };

/** V1 A3 SLA 引擎 → 侧栏子项（运营） */
export const SLA_NAV_ITEMS: AdminNavItem[] = [
  { key: 'sla-policy', label: 'SLA 规则', prd: 'PRD-55', v1Ref: 'A/A3-sla-config.html#rules' },
  { key: 'sla-timer', label: '双层计时', prd: 'PRD-55', v1Ref: 'A/A3-sla-config.html#timer' },
  { key: 'sla-suspend', label: '挂起规则', prd: 'PRD-55', v1Ref: 'A/A3-sla-config.html#suspend' },
  { key: 'sla-alert', label: '预警配置', prd: 'PRD-55', v1Ref: 'A/A3-sla-config.html#alert' },
  { key: 'sla-escalate', label: '升级链', prd: 'PRD-55', v1Ref: 'A/A3-sla-config.html#escalate' },
  { key: 'sla-stats', label: '达标统计', prd: 'PRD-57', v1Ref: 'A/A3-sla-config.html#stats' },
  { key: 'sla-calendar', label: 'SLA 工作日历', prd: 'PRD-56', v1Ref: '—' },
  { key: 'sla-monitor', label: 'SLA 监控看板', prd: 'PRD-57', v1Ref: '—' },
  // D5：SLA 模板能力并入「SLA 策略」（策略支持复制派生），不另设导航项。
];

/** V1 A4 规则引擎 → 侧栏子项（运营） */
export const RULES_NAV_ITEMS: AdminNavItem[] = [
  { key: 'rules-list', label: '规则列表', prd: 'PRD-58', v1Ref: 'A/A4-rule-engine.html#list' },
  { key: 'rules-editor', label: '可视化规则编辑', prd: 'PRD-58', v1Ref: 'A/A4-rule-engine.html#editor' },
  { key: 'rules-routing', label: '流转路由', prd: 'PRD-58', v1Ref: 'A/A4-rule-engine.html#routing' },
  { key: 'rules-pool', label: '工单池规则', prd: 'PRD-58', v1Ref: 'A/A4-rule-engine.html#pool' },
  { key: 'rules-escalation', label: '升级路由', prd: 'PRD-58', v1Ref: 'A/A4-rule-engine.html#escalation' },
  { key: 'rules-logs', label: '执行日志', prd: 'PRD-58', v1Ref: 'A/A4-rule-engine.html#logs' },
];

export const ADMIN_GROUPS: AdminNavGroup[] = [
  // ===== 租户管理员 =====
  {
    key: 'org', label: '用户与权限', icon: TeamOutlined, scope: 'tenant',
    items: [
      { key: 'tenant-basic', label: '基本信息', prd: 'PRD-59a' },
      { key: 'users', label: '用户管理', prd: 'PRD-50', v1Ref: 'A/A5-permission.html#users' },
      { key: 'roles', label: '角色与权限', prd: 'PRD-51', v1Ref: 'A/A5-permission.html#roles' },
      // §六 新增（PRD 有 / V1 侧栏无）
      { key: 'orgs', label: '组织管理', prd: 'PRD-23' },
      // D2：渠道/应用归运营，见「业务数据」组（不在此）
    ],
  },
  {
    key: 'integration', label: '集成对接', icon: ApiOutlined, scope: 'tenant',
    items: [
      { key: 'connectors', label: '连接器总览', prd: 'PRD-86', v1Ref: 'H/H-integration.html#connectors' },
      { key: 'message-center', label: '消息中心', prd: 'PRD-30' },
    ],
  },
  {
    key: 'security', label: '安全与审计', icon: SafetyCertificateOutlined, scope: 'tenant',
    items: [
      { key: 'third-party-login', label: '第三方登录', prd: 'PRD-44' },
      { key: 'audit-logs', label: '审计日志', prd: 'PRD-40', v1Ref: 'A/A5-permission.html#audit' },
    ],
  },
  // ===== 运营管理员 =====
  // 业务管理置于运营组首位（紧邻数据总览，配置高频且重要）
  {
    key: 'business', label: '业务管理', icon: DatabaseOutlined, scope: 'ops',
    items: [
      // D3：BPM 用户分组与服务班组(59b)合并为单一「用户分组」，归业务管理
      { key: 'teams', label: '用户分组', prd: 'PRD-70' },
      // D2：渠道/应用归运营
      { key: 'apps', label: '应用管理', prd: 'PRD-54', v1Ref: 'A/A8-tenant-admin.html#apps' },
      { key: 'channels', label: '渠道管理', prd: 'PRD-53', v1Ref: 'A/A8-tenant-admin.html#channels' },
      { key: 'customers', label: '客户管理', prd: 'PRD-87' },
      { key: 'products', label: '产品管理', prd: 'PRD-85' },
      { key: 'dispatch', label: '智能分派', prd: 'PRD-90', v1Ref: 'D/D1-dispatch.html' },
    ],
  },
  {
    key: 'ticket-config', label: '工单配置', icon: AppstoreOutlined, scope: 'ops',
    items: [
      { key: 'ticket-types', label: '工单类型管理', prd: 'PRD-60', v1Ref: 'A/A0-workorder-type-list.html' },
      { key: 'dicts', label: '字典管理', prd: 'PRD-52', v1Ref: 'A/A9-data-dictionary.html' },
      { key: 'entity-dict', label: '流程实体字典', prd: 'PRD-88' },
    ],
  },
  {
    // 侧栏仅保留两个模块入口，子项由页内 Tab 承载（避免 14 项平铺）
    key: 'sla', label: 'SLA 与规则', icon: FieldTimeOutlined, scope: 'ops',
    items: [
      { key: 'sla-policy', label: 'SLA 管理', prd: 'PRD-55', v1Ref: 'A/A3-sla-config.html' },
      { key: 'rules-list', label: '规则中心', prd: 'PRD-58', v1Ref: 'A/A4-rule-engine.html' },
    ],
  },
  {
    key: 'templates', label: '模板库', icon: FileTextOutlined, scope: 'ops',
    items: [
      { key: 'form-templates', label: '表单模板库', prd: 'PRD-66', v1Ref: 'A/A1-form-designer.html' },
      { key: 'flow-templates', label: '流程模板库', prd: 'PRD-67', v1Ref: 'A/A2-flow-portal.html' },
      // D4：A8 模板库能力并入上述两项，不另设「模板库管理」。
    ],
  },
  {
    key: 'workflow', label: '工作流程', icon: BranchesOutlined, scope: 'ops',
    items: [
      { key: 'flow-instances', label: '流程实例', prd: 'PRD-73' },
      { key: 'flow-tasks', label: '流程任务', prd: 'PRD-74' },
      { key: 'flow-listeners', label: '流程监听器', prd: 'PRD-71' },
      { key: 'flow-expressions', label: '流程表达式', prd: 'PRD-72' },
    ],
  },
];

/** 按管理角色 scope 取分组 */
export function adminGroupsFor(scope?: AdminScope): AdminNavGroup[] {
  if (scope === 'ops') return ADMIN_GROUPS.filter((g) => g.scope === 'ops');
  return ADMIN_GROUPS.filter((g) => g.scope === 'tenant');
}

/** 侧栏可见扁平项 */
const ADMIN_SIDEBAR_ITEMS = ADMIN_GROUPS.flatMap((g) =>
  g.items.map((i) => ({ ...i, group: g.label, groupKey: g.key })),
);

/**
 * 扁平导航项（路由注册用）= 侧栏可见项 + SLA/规则的页内 Tab 子页。
 * 侧栏只露「SLA 管理 / 规则中心」两入口，但其页内 Tab 仍需注册各自路由。
 */
const ADMIN_HIDDEN_ROUTE_ITEMS = [...SLA_NAV_ITEMS, ...RULES_NAV_ITEMS]
  .filter((i) => !ADMIN_SIDEBAR_ITEMS.some((s) => s.key === i.key))
  .map((i) => ({ ...i, group: 'SLA 与规则', groupKey: 'sla' }));

export const ADMIN_ALL_ITEMS = [...ADMIN_SIDEBAR_ITEMS, ...ADMIN_HIDDEN_ROUTE_ITEMS];

const NAV_KEY_SET = new Set(ADMIN_ALL_ITEMS.map((i) => i.key));

/** 路由 key → 侧栏高亮项 key（SLA/规则页内 Tab 统一高亮其模块入口） */
export function adminSidebarKey(activeKey: string): string {
  if (isSlaNavKey(activeKey)) return 'sla-policy';
  if (isRulesNavKey(activeKey)) return 'rules-list';
  return activeKey;
}

/** 侧栏高亮 key：取 /admin/{key} 第一段 */
export function adminNavActiveKey(path: string): string {
  const seg = path.split('/admin/')[1];
  return seg ? seg.split('/')[0] : 'overview';
}

/** 查找导航项定义 */
export function adminNavItemByKey(key: string) {
  return ADMIN_ALL_ITEMS.find((i) => i.key === key);
}

/** 子项所属分组 key（侧栏手风琴展开用）——含 SLA/规则页内 Tab 子页映射到 'sla' */
export function adminNavGroupKeyOf(itemKey: string): string | null {
  return ADMIN_ALL_ITEMS.find((i) => i.key === itemKey)?.groupKey ?? null;
}

/** 是否为 SLA 子模块（页内 Tab 条可选展示） */
export function isSlaNavKey(key: string): boolean {
  return SLA_NAV_ITEMS.some((i) => i.key === key);
}

/** 是否为规则引擎子模块 */
export function isRulesNavKey(key: string): boolean {
  return RULES_NAV_ITEMS.some((i) => i.key === key);
}

/** 旧 key 兼容重定向（rules → rules-list） */
export const ADMIN_LEGACY_REDIRECTS: Record<string, string> = {
  rules: 'rules-list',
};

export function isAdminNavKey(key: string): boolean {
  return NAV_KEY_SET.has(key) || key in ADMIN_LEGACY_REDIRECTS;
}

// ===== 平台超管 =====
export interface AdminNavItemP {
  key: string;
  label: string;
  icon: Component;
}
export const PLATFORM_NAV: { items: AdminNavItemP[] } = {
  items: [
    { key: 'tenants', label: '租户管理', icon: BankOutlined },
    { key: 'plans', label: '套餐管理', icon: GoldOutlined },
    { key: 'sys-settings', label: '系统参数', icon: SettingOutlined },
  ],
};

/** 落地页「全部配置模块」网格 */
export function moduleCardsFor(scope?: AdminScope) {
  return adminGroupsFor(scope).map((g) => ({
    key: g.key,
    label: g.label,
    icon: g.icon,
    desc: g.items.map((i) => i.label).join(' · '),
    firstPath: `/admin/${g.items[0].key}`,
  }));
}
