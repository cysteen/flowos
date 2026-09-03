import { computed, ref, watch } from 'vue';
import {
  defaultTicketListColumnOrder,
  defaultTicketListColumnVisible,
  normalizeTicketListColumnOrder,
  TICKET_LIST_COLUMN_CATALOG,
  TICKET_LIST_COLUMN_KEYS,
  TICKET_LIST_DEPRECATED_COLUMN_KEYS,
  TICKET_LIST_FIXED_COLUMN_DEFS,
  ticketListColumnLabel,
} from '@/views/tickets/composables/ticketListColumnCatalog';

/** 工单列表「列设置」列定义（工单/标题、操作为固定列，不在此列表） */
export interface TicketColumnDef {
  key: string;
  label: string;
  /** 首次加载默认是否显示 */
  defaultVisible?: boolean;
}

/** 设置面板内展示的固定列（不可隐藏、不可排序） */
export const TICKET_FIXED_COLUMN_DEFS: TicketColumnDef[] = TICKET_LIST_FIXED_COLUMN_DEFS;

/** 与工作台 / 查询中心列设置共用 */
export const TICKET_COLUMN_DEFS: TicketColumnDef[] = TICKET_LIST_COLUMN_CATALOG;

const ALL_KEYS = TICKET_LIST_COLUMN_KEYS;
const LS_KEY = 'flowos-ticket-columns';

export interface TicketColumnPersist {
  visible: Record<string, boolean>;
  order: string[];
}

function defaultVisible(): Record<string, boolean> {
  return defaultTicketListColumnVisible();
}

function defaultOrder(): string[] {
  return defaultTicketListColumnOrder();
}

function normalizeOrder(order: string[]): string[] {
  return normalizeTicketListColumnOrder(order, ALL_KEYS);
}

function defaults(): TicketColumnPersist {
  return { visible: defaultVisible(), order: defaultOrder() };
}

function load(): TicketColumnPersist {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return defaults();
    const parsed = JSON.parse(raw) as TicketColumnPersist | Record<string, boolean>;
    if (parsed && typeof parsed === 'object' && 'order' in parsed && 'visible' in parsed) {
      const p = parsed as TicketColumnPersist;
      const visible = { ...defaultVisible(), ...p.visible };
      for (const key of TICKET_LIST_DEPRECATED_COLUMN_KEYS) delete visible[key];
      return {
        visible,
        order: normalizeOrder(p.order ?? defaultOrder()),
      };
    }
    return {
      visible: { ...defaultVisible(), ...(parsed as Record<string, boolean>) },
      order: defaultOrder(),
    };
  } catch {
    /* ignore */
  }
  return defaults();
}

export function columnLabel(key: string): string {
  return ticketListColumnLabel(key);
}

export function useTicketColumns() {
  const state = ref<TicketColumnPersist>(load());

  watch(
    state,
    (v) => {
      try {
        localStorage.setItem(LS_KEY, JSON.stringify(v));
      } catch {
        /* ignore */
      }
    },
    { deep: true },
  );

  const visibleColumns = computed(() => state.value.visible);
  const columnOrder = computed(() => state.value.order);

  function setColumnVisible(key: string, visible: boolean) {
    const nextVisible = { ...state.value.visible, [key]: visible };
    let nextOrder = [...state.value.order];
    if (visible && !nextOrder.includes(key)) {
      nextOrder.push(key);
    }
    state.value = { visible: nextVisible, order: nextOrder };
  }

  function toggleColumn(key: string) {
    setColumnVisible(key, !state.value.visible[key]);
  }

  function reorderColumn(fromKey: string, toKey: string) {
    if (fromKey === toKey) return;
    const order = [...state.value.order];
    const fromIndex = order.indexOf(fromKey);
    if (fromIndex < 0 || !order.includes(toKey)) return;
    const [moved] = order.splice(fromIndex, 1);
    if (!moved) return;
    const insertAt = order.indexOf(toKey);
    order.splice(insertAt, 0, moved);
    state.value = { ...state.value, order };
  }

  function displayedKeys(opts?: { hideAssignee?: boolean; search?: string }): string[] {
    const q = opts?.search?.trim().toLowerCase() ?? '';
    return state.value.order.filter((key) => {
      if (opts?.hideAssignee && key === 'assignee') return false;
      if (state.value.visible[key] === false) return false;
      if (q && !columnLabel(key).toLowerCase().includes(q)) return false;
      return true;
    });
  }

  function hiddenKeys(opts?: { hideAssignee?: boolean; search?: string }): string[] {
    const q = opts?.search?.trim().toLowerCase() ?? '';
    return state.value.order.filter((key) => {
      if (opts?.hideAssignee && key === 'assignee') return false;
      if (state.value.visible[key] !== false) return false;
      if (q && !columnLabel(key).toLowerCase().includes(q)) return false;
      return true;
    });
  }

  function resetColumns() {
    state.value = defaults();
  }

  return {
    visibleColumns,
    columnOrder,
    setColumnVisible,
    toggleColumn,
    reorderColumn,
    displayedKeys,
    hiddenKeys,
    resetColumns,
  };
}
