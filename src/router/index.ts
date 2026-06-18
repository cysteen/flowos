import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import WorkspaceShell from '@/layouts/WorkspaceShell.vue';
import AdminShell from '@/layouts/AdminShell.vue';
import { useUserStore } from '@/stores/user';
import { firstMenuPath } from '@/config/navigation';
import { ADMIN_ALL_ITEMS } from '@/config/adminNav';

// 管理后台模块路由。Phase B：租户与组织组已实现真实页（AdminModuleView 按 key 解析列表/卡片，
// tenant-basic 为表单页）；其余模块自动落到 AdminModuleView 内的占位回退。
// 已实现真实页的模块 key → 专属组件；其余走 AdminModuleView（列表/卡片/占位回退）
const ADMIN_SPECIAL_VIEWS: Record<string, () => Promise<unknown>> = {
  'tenant-basic': () => import('@/views/admin/TenantProfileView.vue'),
  roles: () => import('@/views/admin/RolePermissionView.vue'),
  'audit-logs': () => import('@/views/admin/AuditLogsView.vue'),
};
const adminModuleRoutes: RouteRecordRaw[] = ADMIN_ALL_ITEMS.map((it) => ({
  path: it.key,
  name: `admin-${it.key}`,
  component: ADMIN_SPECIAL_VIEWS[it.key] ?? (() => import('@/views/admin/AdminModuleView.vue')),
  meta: { adminOnly: true, title: it.label, prd: it.prd, group: it.group },
}));

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
      { path: '', redirect: '/tickets' }, // 默认 landing（§0.3）
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
    ],
  },
  // 管理后台（独立 AppShell，从头像下拉进入）。
  // 平台超管(系统/运营管理员)→ 租户管理/系统参数；租户管理员 → 数据总览 + 8 组配置。
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
      // 平台超管页
      {
        path: 'tenants',
        name: 'admin-tenants',
        component: () => import('@/views/admin/PlatformTenantsView.vue'),
        meta: { adminOnly: true, platformOnly: true, title: '租户管理' },
      },
      {
        path: 'sys-settings',
        name: 'admin-sys-settings',
        component: () => import('@/views/admin/PlatformSettingsView.vue'),
        meta: { adminOnly: true, platformOnly: true, title: '系统参数' },
      },
      ...adminModuleRoutes,
    ],
  },
  // 兜底
  { path: '/:pathMatch(.*)*', redirect: '/login' },
];

const router = createRouter({
  // base 与 vite.config.ts 一致：/flowos/
  history: createWebHistory('/flowos/'),
  routes,
});

// 登录 + 角色守卫
router.beforeEach((to) => {
  const user = useUserStore();

  // 公开页：登录
  if (to.meta.public) {
    if (to.name === 'login' && user.isLoggedIn) {
      return firstMenuPath(user.visibleMenus);
    }
    return true;
  }

  // 未登录 → 登录页
  if (!user.isLoggedIn) {
    return { path: '/login', query: { redirect: to.fullPath } };
  }

  // 管理后台门禁：仅管理员可达，坐席误入拦回工作区（PRD-09 F4）
  if (to.meta.adminOnly && !user.hasAdminEntry) {
    return firstMenuPath(user.visibleMenus);
  }
  // 平台超管页门禁：仅 adminScope=platform（系统/运营管理员）可达
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
