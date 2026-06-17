import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import WorkspaceShell from '@/layouts/WorkspaceShell.vue';
import AdminShell from '@/layouts/AdminShell.vue';
import { useUserStore } from '@/stores/user';
import { firstMenuPath } from '@/config/navigation';
import { ADMIN_ALL_ITEMS } from '@/config/adminNav';

// 管理后台模块占位路由（Phase A：统一占位页；Phase B 逐组替换为真实列表页）
const adminModuleRoutes: RouteRecordRaw[] = ADMIN_ALL_ITEMS.map((it) => ({
  path: it.key,
  name: `admin-${it.key}`,
  component: () => import('@/views/admin/AdminPlaceholder.vue'),
  meta: { adminOnly: true, title: it.label, prd: it.prd, group: it.group },
}));

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    component: WorkspaceShell,
    children: [
      { path: '', redirect: '/tickets' }, // 默认 landing（§0.3）
      {
        path: 'home',
        name: 'home',
        component: () => import('@/views/home/HomeOverviewView.vue'),
        meta: { menu: 'home', title: '首页', breadcrumb: '首页 · 工作概览' },
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
  // 管理后台（独立 AppShell，仅租户管理员，从头像下拉进入）
  {
    path: '/admin',
    component: AdminShell,
    children: [
      { path: '', redirect: '/admin/overview' },
      {
        path: 'overview',
        name: 'admin-overview',
        component: () => import('@/views/admin/AdminOverviewView.vue'),
        meta: { adminOnly: true, title: '数据总览' },
      },
      ...adminModuleRoutes,
    ],
  },
  // 兜底：未知路径回工单工作台
  { path: '/:pathMatch(.*)*', redirect: '/tickets' },
];

const router = createRouter({
  // base 与 vite.config.ts 一致：/flowos/
  history: createWebHistory('/flowos/'),
  routes,
});

// 角色守卫：无权访问的菜单 → redirect 至该角色首个有权限页（§2.3）
router.beforeEach((to) => {
  const user = useUserStore();
  // 管理后台门禁：仅租户管理员可达，坐席误入拦回工作区（PRD-09 F4）
  if (to.meta.adminOnly && !user.hasAdminEntry) {
    return firstMenuPath(user.visibleMenus);
  }
  const menu = to.meta.menu;
  if (menu && !user.canAccess(menu)) {
    return firstMenuPath(user.visibleMenus);
  }
  return true;
});

export default router;
