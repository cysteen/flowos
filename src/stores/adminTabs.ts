import { defineStore } from 'pinia';
import { ref } from 'vue';
import router from '@/router';
import { useUserStore } from '@/stores/user';

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

  /** 路由进入时登记/激活页签 */
  function syncFromRoute(path: string, title?: string) {
    const m = path.match(/^\/admin\/([^/?#]+)/);
    if (!m) return;
    const key = m[1];
    const fullPath = `/admin/${key}`;
    const label = title || key;
    const existing = tabs.value.find((t) => t.key === key);
    if (existing) {
      existing.title = label;
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
