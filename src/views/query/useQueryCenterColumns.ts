import { computed, ref, watch } from 'vue';
import {
  QUERY_CENTER_COLUMN_DEFS,
  queryCenterColumnLabel,
} from '@/views/query/queryCenterListColumns';
import type { TicketColumnPersist } from '@/views/tickets/composables/useTicketColumns';

const ALL_KEYS = QUERY_CENTER_COLUMN_DEFS.map((c) => c.key);
const LS_KEY = 'flowos-query-center-columns';

function defaultVisible(): Record<string, boolean> {
  return Object.fromEntries(
    QUERY_CENTER_COLUMN_DEFS.map((c) => [c.key, c.defaultVisible !== false]),
  );
}

function defaultOrder(): string[] {
  return [...ALL_KEYS];
}

function normalizeOrder(order: string[]): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const key of order) {
    if (ALL_KEYS.includes(key) && !seen.has(key)) {
      merged.push(key);
      seen.add(key);
    }
  }
  for (const key of ALL_KEYS) {
    if (!seen.has(key)) merged.push(key);
  }
  // 新增列默认插在 SLA 前（仅首次缺列时迁移，不覆盖用户已调整的顺序）
  const missingTimeCols = ['createdAt', 'updatedAt'].filter((k) => !order.includes(k));
  if (missingTimeCols.length > 0) {
    for (const key of ['createdAt', 'updatedAt']) {
      const idx = merged.indexOf(key);
      if (idx >= 0) merged.splice(idx, 1);
    }
    const slaIdx = merged.indexOf('sla');
    const insertAt = slaIdx >= 0 ? slaIdx : merged.length;
    merged.splice(insertAt, 0, 'createdAt', 'updatedAt');
  }
  return merged;
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
      return {
        visible: { ...defaultVisible(), ...p.visible },
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
