import { computed, ref, watch } from 'vue';
import {
  defaultTicketListColumnOrder,
  defaultTicketListColumnVisible,
  normalizeTicketListColumnOrder,
  TICKET_LIST_COLUMN_KEYS,
  TICKET_LIST_DEPRECATED_COLUMN_KEYS,
} from '@/views/tickets/composables/ticketListColumnCatalog';
import { queryCenterColumnLabel } from '@/views/query/queryCenterListColumns';
import type { TicketColumnPersist } from '@/views/tickets/composables/useTicketColumns';

const ALL_KEYS = TICKET_LIST_COLUMN_KEYS;
const LS_KEY = 'flowos-query-center-columns';

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

/** 查询中心 · 查工单列表列设置（localStorage 独立存储） */
export function useQueryCenterColumns() {
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

  function resetColumns() {
    state.value = defaults();
  }

  function label(key: string) {
    return queryCenterColumnLabel(key);
  }

  return {
    visibleColumns,
    columnOrder,
    setColumnVisible,
    reorderColumn,
    resetColumns,
    label,
  };
}
