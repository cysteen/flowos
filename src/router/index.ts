import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import WorkspaceShell from '@/layouts/WorkspaceShell.vue';
import { useUserStore } from '@/stores/user';
import { firstMenuPath } from '@/config/navigation';

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    component: WorkspaceShell,
    children: [
      { path: '', redirect: '/tickets' }, // 默认 landing（§0.3）
      {
        path: 'home',
        name: 'home',
        component: () => import('@/views/home/HomePlaceholder.vue'),
        meta: { menu: 'home', title: '首页' },
      },
      {
        path: 'tickets',
        name: 'tickets',
        component: () => import('@/views/tickets/TicketWorkbenchView.vue'),
        meta: { menu: 'tickets', title: '工单工作台' },
      },
      {
        path: 'aftersale',
        name: 'aftersale',
        component: () => import('@/views/aftersale/AftersalePlaceholder.vue'),
        meta: { menu: 'aftersale', title: '售后工作台' },
      },
      {
        path: 'team-board',
        name: 'team-board',
        component: () => import('@/views/team-board/TeamBoardPlaceholder.vue'),
        meta: { menu: 'team-board', title: '班组看板' },
      },
      // /admin/* 预留，本期不实现（后续 Phase 独立 AppShell）
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
  const menu = to.meta.menu;
  if (menu && !user.canAccess(menu)) {
    return firstMenuPath(user.visibleMenus);
  }
  return true;
});

export default router;
