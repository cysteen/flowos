import { ref, watch } from 'vue';

/** 工单列表「列设置」可切换的公共属性列（工单/标题=锚点、操作=功能列，固定不可隐藏） */
export interface TicketColumnDef {
  key: string;
  label: string;
}

export const TICKET_COLUMN_DEFS: TicketColumnDef[] = [
  { key: 'summary', label: '工单摘要' },
  { key: 'customer', label: '客户' },
  { key: 'product', label: '产品' },
  { key: 'node', label: '当前节点' },
  { key: 'priority', label: '优先级' },
  { key: 'sla', label: 'SLA 时效' },
  { key: 'assignee', label: '处理人' },
];

const LS_KEY = 'flowos-ticket-columns';

function defaults(): Record<string, boolean> {
  return Object.fromEntries(TICKET_COLUMN_DEFS.map((c) => [c.key, true]));
}

function load(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      // 合并默认：未来新增列默认显示，避免旧配置丢列
      return { ...defaults(), ...(JSON.parse(raw) as Record<string, boolean>) };
    }
  } catch {
    /* ignore */
  }
  return defaults();
}

export function useTicketColumns() {
  const visibleColumns = ref<Record<string, boolean>>(load());

  watch(
    visibleColumns,
    (v) => {
      try {
        localStorage.setItem(LS_KEY, JSON.stringify(v));
      } catch {
        /* 配额等忽略 */
      }
    },
    { deep: true },
  );

  function toggleColumn(key: string) {
    visibleColumns.value = { ...visibleColumns.value, [key]: !visibleColumns.value[key] };
  }
  function resetColumns() {
    visibleColumns.value = defaults();
  }

  return { visibleColumns, toggleColumn, resetColumns };
}
