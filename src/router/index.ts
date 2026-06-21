import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import WorkspaceShell from '@/layouts/WorkspaceShell.vue';
import AdminShell from '@/layouts/AdminShell.vue';
import { useUserStore } from '@/stores/user';
import { firstMenuPath } from '@/config/navigation';
import {
  ADMIN_ALL_ITEMS,
  ADMIN_LEGACY_REDIRECTS,
  RULES_NAV_ITEMS,
  SLA_NAV_ITEMS,
} from '@/config/adminNav';

const SLA_STUB_KEYS = new Set(
  SLA_NAV_ITEMS.map((i) => i.key).filter((k) => k !== 'sla-policy'),
);
const RULES_STUB_KEYS = new Set(RULES_NAV_ITEMS.map((i) => i.key));
const WORKFLOW_STUB_KEYS = new Set(['flow-instances', 'flow-tasks', 'flow-listeners', 'flow-expressions']);

function adminViewFor(key: string) {
  if (key === 'sla-policy') return () => import('@/views/admin/SlaPolicyView.vue');
  if (key === 'tenant-basic') return () => import('@/views/admin/TenantProfileView.vue');
  if (key === 'roles') return () => import('@/views/admin/RolePermissionView.vue');
  if (key === 'audit-logs') return () => import('@/views/admin/AuditLogsView.vue');
  if (key === 'dicts') return () => import('@/views/admin/DictManageView.vue');
  if (key === 'entity-dict') return () => import('@/views/admin/EntityDictView.vue');
  if (key === 'ticket-types') return () => import('@/views/admin/TicketTypesView.vue');
  if (key === 'form-templates' || key === 'flow-templates') return () => import('@/views/admin/TemplateLibraryView.vue');
  if (WORKFLOW_STUB_KEYS.has(key)) return () => import('@/views/admin/WorkflowEngineView.vue');
  if (key === 'teams') return () => import('@/views/admin/UserGroupView.vue');
  if (key === 'customers') return () => import('@/views/admin/CustomerManageView.vue');
  if (key === 'products') return () => import('@/views/admin/ProductManageView.vue');
  if (key === 'dispatch') return () => import('@/views/admin/DispatchConfigView.vue');
  if (key === 'users') return () => import('@/views/admin/UserManageView.vue');
  if (key === 'orgs') return () => import('@/views/admin/OrgManageView.vue');
  if (key === 'posts') return () => import('@/views/admin/PostManageView.vue');
  if (key === 'connectors') return () => import('@/views/admin/ConnectorHubView.vue');
  if (key === 'message-center') return () => import('@/views/admin/MessageCenterView.vue');
  if (key === 'third-party-login') return () => import('@/views/admin/ThirdPartyLoginView.vue');
  if (SLA_STUB_KEYS.has(key)) return () => import('@/views/admin/SlaEngineView.vue');
  if (RULES_STUB_KEYS.has(key)) return () => import('@/views/admin/RulesEngineView.vue');
  return () => import('@/views/admin/AdminModuleView.vue');
}

const adminModuleRoutes: RouteRecordRaw[] = ADMIN_ALL_ITEMS.map((it) => ({
  path: it.key,
  name: `admin-${it.key}`,
  component: adminViewFor(it.key),
  meta: {
    adminOnly: true,
    title: it.label,
    prd: it.prd,
    group: it.group,
    groupKey: it.groupKey,
    v1Ref: it.v1Ref,
  },
}));

// 旧路由 key 重定向（如 rules → rules-list）
const adminLegacyRoutes: RouteRecordRaw[] = Object.entries(ADMIN_LEGACY_REDIRECTS).map(
  ([from, to]) => ({
    path: from,
    redirect: { name: `admin-${to}` },
  }),
);

const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'login',
    component: () => import('@/views/auth/LoginView.vue'),
    meta: { public: true, title: '登录' },
  },
  {
    path: '/',
    component: WorkspaceShell,
    children: [
      { path: '', redirect: '/tickets' },
      {
        path: 'home',
        name: 'home',
        component: () => import('@/views/home/HomeOverviewView.vue'),
        meta: { menu: 'home', title: '个人门户', breadcrumb: '个人门户 · 工作概览' },
      },
      {
        path: 'tickets',
        name: 'tickets',
        component: () => import('@/views/tickets/TicketWorkbenchView.vue'),
        meta: { menu: 'tickets', title: '工单工作台' },
      },
      {
        path: 'tickets/list',
        name: 'ticket-list',
        component: () => import('@/views/tickets/TicketListView.vue'),
        meta: { menu: 'tickets', title: '工单列表', breadcrumb: '工单列表' },
      },
      {
        path: 'tickets/:ticketNo',
        name: 'ticket-operation',
        component: () => import('@/views/tickets/TicketOperationView.vue'),
        meta: { menu: 'tickets', title: '工单处理' },
      },
      {
        path: 'aftersale',
        name: 'aftersale',
        component: () => import('@/views/aftersale/AftersaleWorkbenchView.vue'),
        meta: { menu: 'aftersale', title: '售后工作台', breadcrumb: '售后工作台' },
      },
      {
        path: 'team-board',
        name: 'team-board',
        component: () => import('@/views/team-board/TeamBoardView.vue'),
        meta: { menu: 'team-board', title: '班组看板', breadcrumb: '班组看板' },
      },
      {
        path: 'approval',
        name: 'approval',
        component: () => import('@/views/approval/ApprovalWorkspaceView.vue'),
        meta: { menu: 'approval', title: '审批中心', breadcrumb: '审批中心' },
      },
    ],
  },
  {
    path: '/admin',
    component: AdminShell,
    children: [
      {
        path: '',
        redirect: () => {
          const u = useUserStore();
          return u.role.adminScope === 'platform' ? '/admin/tenants' : '/admin/overview';
        },
      },
      {
        path: 'overview',
        name: 'admin-overview',
        component: () => import('@/views/admin/AdminOverviewView.vue'),
        meta: { adminOnly: true, title: '数据总览' },
      },
      {
        path: 'approval',
        name: 'admin-approval',
        component: () => import('@/views/admin/ApprovalCenterView.vue'),
        meta: { adminOnly: true, title: '审批中心' },
      },
      {
        path: 'tenants',
        name: 'admin-tenants',
        component: () => import('@/views/admin/PlatformTenantsView.vue'),
        meta: { adminOnly: true, platformOnly: true, title: '租户管理' },
      },
      {
        path: 'plans',
        name: 'admin-plans',
        component: () => import('@/views/admin/PlatformAccessView.vue'),
        meta: { adminOnly: true, platformOnly: true, title: '套餐管理' },
      },
      {
        path: 'sys-settings',
        name: 'admin-sys-settings',
        component: () => import('@/views/admin/PlatformSettingsView.vue'),
        meta: { adminOnly: true, platformOnly: true, title: '系统参数' },
      },
      {
        path: 'ticket-types/:id/designer',
        name: 'admin-ticket-type-designer',
        component: () => import('@/views/admin/TicketTypeDesignerView.vue'),
        meta: { adminOnly: true, title: '工单类型设计器', group: '工单配置' },
      },
      {
        path: 'templates/:kind/:id/designer',
        name: 'admin-template-designer',
        component: () => import('@/views/admin/TemplateDesignerView.vue'),
        meta: { adminOnly: true, title: '模板设计器', group: '模板库' },
      },
      ...adminLegacyRoutes,
      ...adminModuleRoutes,
      // 非法 /admin/* 子路由 → 按角色回管理后台首页（而非报错/登录页）
      { path: ':pathMatch(.*)*', redirect: '/admin' },
    ],
  },
  // 其余任何未匹配路由 → 回首页（beforeEach 未登录时再转登录页）
  { path: '/:pathMatch(.*)*', redirect: '/' },
];

const router = createRouter({
  history: createWebHistory('/flowos/'),
  routes,
});

// 持续部署后旧会话的懒加载 chunk 哈希失效 → 动态 import 失败 → 点击侧栏"无反应"。
// 检测到此类错误时，跳转到目标并强制拉取新 bundle，用户无感恢复（单次防循环）。
router.onError((error, to) => {
  const msg = `${(error as Error)?.message || ''} ${(error as Error)?.name || ''}`;
  // 覆盖各浏览器变体：Chrome「Failed to fetch dynamically imported module」、
  // Firefox「error loading dynamically imported module」、Safari「Importing a module script failed」、
  // 以及 Loading chunk / Loading CSS chunk failed。
  const isChunkError = /dynamically imported module|module script|Loading (chunk|CSS chunk)|ChunkLoadError/i.test(msg);
  if (!isChunkError) return;
  const dest = to?.fullPath || '/';
  if (sessionStorage.getItem('flowos-chunk-reload') === dest) return; // 已重试过，避免死循环
  sessionStorage.setItem('flowos-chunk-reload', dest);
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  window.location.assign(base + dest);
});
router.afterEach(() => {
  sessionStorage.removeItem('flowos-chunk-reload');
});

router.beforeEach((to) => {
  const user = useUserStore();

  if (to.meta.public) {
    if (to.name === 'login' && user.isLoggedIn) {
      return firstMenuPath(user.visibleMenus);
    }
    return true;
  }

  if (!user.isLoggedIn) {
    return { path: '/login', query: { redirect: to.fullPath } };
  }

  if (to.meta.adminOnly && !user.hasAdminEntry) {
    return firstMenuPath(user.visibleMenus);
  }
  if (to.meta.platformOnly && user.role.adminScope !== 'platform') {
    return '/admin/overview';
  }
  const menu = to.meta.menu;
  if (menu && !user.canAccess(menu)) {
    return firstMenuPath(user.visibleMenus);
  }
  return true;
});

export default router;
