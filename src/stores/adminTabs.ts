import { defineStore } from 'pinia';
import { ref } from 'vue';
import router from '@/router';
import { useUserStore } from '@/stores/user';
import { isSlaNavKey, isRulesNavKey, adminNavItemByKey } from '@/config/adminNav';

export interface AdminTab {
  key: string;
  path: string;
  title: string;
}

/** 管理后台多页签（对齐 main-navigation.html #pageTabs） */
export const useAdminTabsStore = defineStore('adminTabs', () => {
  const tabs = ref<AdminTab[]>([]);
  const activeKey = ref<string | null>(null);

  function defaultPath() {
    const u = useUserStore();
    return u.role.adminScope === 'platform' ? '/admin/tenants' : '/admin/overview';
  }

  /**
   * 路由进入时登记/激活页签。
   * 模块聚合：SLA 管理 / 规则中心 的所有页内子页（策略/计时口径/监控看板/预警与升级 等）
   * 归到「单一大页签」，子页切换由页内 section tab 承载，避免每个子页各开一个大页签。
   */
  function syncFromRoute(path: string, title?: string) {
    const m = path.match(/^\/admin\/([^/?#]+)/);
    if (!m) return;
    const routeKey = m[1];
    // 子页聚合到模块大页签 key
    let key = routeKey;
    if (isSlaNavKey(routeKey)) key = 'sla-policy';
    else if (isRulesNavKey(routeKey)) key = 'rules-list';
    const label = key === routeKey ? (title || routeKey) : (adminNavItemByKey(key)?.label ?? key);
    const fullPath = `/admin/${routeKey}`; // 记住最后访问的子页，点回大页签即回到该子页
    const existing = tabs.value.find((t) => t.key === key);
    if (existing) {
      existing.title = label;
      existing.path = fullPath;
    } else {
      tabs.value.push({ key, path: fullPath, title: label });
    }
    activeKey.value = key;
  }

  function activate(key: string) {
    const tab = tabs.value.find((t) => t.key === key);
    if (!tab) return;
    activeKey.value = key;
    if (router.currentRoute.value.path !== tab.path) {
      router.push(tab.path);
    }
  }

  function close(key: string) {
    const idx = tabs.value.findIndex((t) => t.key === key);
    if (idx === -1) return;
    tabs.value.splice(idx, 1);
    if (activeKey.value !== key) return;
    if (tabs.value.length > 0) {
      const next = tabs.value[Math.max(0, idx - 1)];
      activate(next.key);
    } else {
      activeKey.value = null;
      router.push(defaultPath());
    }
  }

  function reset() {
    tabs.value = [];
    activeKey.value = null;
  }

  return { tabs, activeKey, syncFromRoute, activate, close, reset, defaultPath };
});
