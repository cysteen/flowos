import { computed, ref, watch } from 'vue';

/** 工单列表「列设置」列定义（工单/标题、操作为固定列，不在此列表） */
export interface TicketColumnDef {
  key: string;
  label: string;
  /** 首次加载默认是否显示 */
  defaultVisible?: boolean;
}

/** 设置面板内展示的固定列（不可隐藏、不可排序） */
export const TICKET_FIXED_COLUMN_DEFS: TicketColumnDef[] = [
  { key: 'title', label: '工单/标题' },
];

export const TICKET_COLUMN_DEFS: TicketColumnDef[] = [
  // 列表默认列（对齐 PRD-02 §⑩-A）
  { key: 'priority', label: '优先级' },
  { key: 'summary', label: '工单摘要' },
  { key: 'customer', label: '客户' },
  { key: 'groupNames', label: '分组名称' },
  { key: 'product', label: '产品' },
  { key: 'node', label: '当前节点' },
  { key: 'sla', label: 'SLA 时效' },
  { key: 'assignee', label: '处理人' },
  // 新建工单 · 工单基础
  { key: 'businessType', label: '业务类型', defaultVisible: false },
  { key: 'ticketType', label: '工单类型', defaultVisible: false },
  { key: 'ticketSource', label: '工单来源', defaultVisible: false },
  // 新建工单 · 产品问题
  { key: 'productCategory', label: '产品分类', defaultVisible: false },
  { key: 'deviceSn', label: '设备 SN', defaultVisible: false },
  { key: 'problemL1', label: '问题一类', defaultVisible: false },
  { key: 'problemL2', label: '问题二类', defaultVisible: false },
  { key: 'problemL3', label: '问题三类', defaultVisible: false },
  { key: 'resolveTimeRemark', label: '解决时间备注', defaultVisible: false },
];

const ALL_KEYS = TICKET_COLUMN_DEFS.map((c) => c.key);
const LS_KEY = 'flowos-ticket-columns';

export interface TicketColumnPersist {
  visible: Record<string, boolean>;
  order: string[];
}

function defaultVisible(): Record<string, boolean> {
  return Object.fromEntries(
    TICKET_COLUMN_DEFS.map((c) => [c.key, c.defaultVisible !== false]),
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
  // 新增列插入默认位置（避免旧 localStorage 把新列堆到末尾）
  if (!merged.includes('groupNames')) {
    const productIdx = merged.indexOf('product');
    if (productIdx >= 0) merged.splice(productIdx, 0, 'groupNames');
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
    // 旧版仅存 visible map
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
  return (
    TICKET_COLUMN_DEFS.find((c) => c.key === key)?.label
    ?? TICKET_FIXED_COLUMN_DEFS.find((c) => c.key === key)?.label
    ?? key
  );
}

export function useTicketColumns() {
  const state = ref<TicketColumnPersist>(load());

  watch(
    state,
    (v) => {
      try {
        localStorage.setItem(LS_KEY, JSON.stringify(v));
      } catch {
        /* 配额等忽略 */
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
    // 在完整顺序数组内移动，隐藏列保持原位（不再被收拢到末尾）
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
