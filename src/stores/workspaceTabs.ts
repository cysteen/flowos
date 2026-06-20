import { defineStore } from 'pinia';
import { ref } from 'vue';
import router from '@/router';
import { TICKETS } from '@/mock/tickets';
import { NAV_ITEMS, firstMenuPath } from '@/config/navigation';
import { useUserStore } from '@/stores/user';

export interface WorkspaceTab {
  key: string;
  path: string;
  title: string;
}

/** 工单号 → 页签标题（优先列表 Mock，其次详情标题） */
export function resolveTicketTabTitle(
  ticketNo: string,
  detailTitle?: string,
  detailNo?: string,
): string {
  const fromList = TICKETS.find((x) => x.no === ticketNo)?.title;
  if (fromList) return fromList;
  if (detailNo === ticketNo && detailTitle) return detailTitle;
  return ticketNo;
}

/** 工作区路由 → 页签标题 */
export function resolveWorkspaceTabTitle(path: string, metaTitle?: string): string {
  const ticketMatch = path.match(/^\/tickets\/([^/?#]+)\/?$/);
  if (ticketMatch) {
    const seg = ticketMatch[1];
    if (seg === 'list') return '工单列表';
    return resolveTicketTabTitle(seg);
  }
  const nav = NAV_ITEMS.find((n) => n.path === path);
  if (nav) return nav.label;
  return metaTitle || path;
}

function isWorkspacePath(path: string) {
  if (!path || path === '/' || path.startsWith('/admin') || path.startsWith('/login')) return false;
  return true;
}

/** 坐席工作区多页签（对齐 AdminPageTabs 全动态模式） */
export const useWorkspaceTabsStore = defineStore('workspaceTabs', () => {
  const tabs = ref<WorkspaceTab[]>([]);
  const activeKey = ref<string | null>(null);

  function defaultPath() {
    const u = useUserStore();
    return firstMenuPath(u.visibleMenus);
  }

  /** 路由进入时登记/激活页签 */
  function syncFromRoute(path: string, title?: string) {
    if (!isWorkspacePath(path)) return;
    const key = path;
    const label = resolveWorkspaceTabTitle(path, title);
    const existing = tabs.value.find((t) => t.key === key);
    if (existing) {
      existing.title = label;
    } else {
      tabs.value.push({ key, path, title: label });
    }
    activeKey.value = key;
  }

  /** 业务页加载后可更新标题（如工单详情） */
  function updateTitle(path: string, title: string) {
    const tab = tabs.value.find((t) => t.path === path);
    if (tab) tab.title = title;
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

  return { tabs, activeKey, syncFromRoute, updateTitle, activate, close, reset, defaultPath };
});
