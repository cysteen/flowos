import type { TicketColumnDef } from '@/views/tickets/composables/useTicketColumns';

/** 工单列表 · 全量可配置列（查询中心 / 工作台列设置共用） */
export const TICKET_LIST_COLUMN_CATALOG: TicketColumnDef[] = [
  { key: 'priority', label: '优先级' },
  { key: 'summary', label: '工单摘要' },
  { key: 'customer', label: '客户' },
  { key: 'product', label: '产品' },
  { key: 'node', label: '当前状态' },
  { key: 'flowNode', label: '当前节点' },
  { key: 'prevFlowNode', label: '上一个节点' },
  { key: 'sla', label: 'SLA 时效' },
  { key: 'assignee', label: '当前处理人/组' },
  { key: 'lastHandler', label: '上次处理人/组', defaultVisible: false },
  { key: 'createdAt', label: '创建时间' },
  { key: 'updatedAt', label: '更新时间' },
];

export const TICKET_LIST_FIXED_COLUMN_DEFS: TicketColumnDef[] = [
  { key: 'title', label: '工单/标题' },
];

export const TICKET_LIST_COLUMN_KEYS = TICKET_LIST_COLUMN_CATALOG.map((c) => c.key);

/** localStorage 迁移时剔除的废弃列 */
export const TICKET_LIST_DEPRECATED_COLUMN_KEYS = new Set([
  'currentGroup',
  'lastHandledAt',
  'businessType',
  'ticketType',
  'ticketSource',
  'groupNames',
]);

const TIME_TAIL_KEYS = ['createdAt', 'updatedAt'] as const;

export function ticketListColumnLabel(key: string): string {
  return (
    TICKET_LIST_COLUMN_CATALOG.find((c) => c.key === key)?.label
    ?? TICKET_LIST_FIXED_COLUMN_DEFS.find((c) => c.key === key)?.label
    ?? key
  );
}

export function defaultTicketListColumnVisible(): Record<string, boolean> {
  const visible = Object.fromEntries(
    TICKET_LIST_COLUMN_CATALOG.map((c) => [c.key, c.defaultVisible !== false]),
  );
  for (const key of TICKET_LIST_DEPRECATED_COLUMN_KEYS) delete visible[key];
  return visible;
}

export function defaultTicketListColumnOrder(): string[] {
  return [...TICKET_LIST_COLUMN_KEYS];
}

function insertAfter(order: string[], key: string, after: string, allKeys: string[]): string[] {
  if (!allKeys.includes(key)) return order;
  const merged = order.filter((k) => k !== key);
  const anchor = merged.indexOf(after);
  if (anchor < 0) merged.push(key);
  else merged.splice(anchor + 1, 0, key);
  return merged;
}

/** 统一列顺序：补全缺失列 → 节点列紧跟状态 → 时间列置尾 */
export function normalizeTicketListColumnOrder(
  order: string[],
  allKeys: string[] = TICKET_LIST_COLUMN_KEYS,
): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const key of order) {
    if (TICKET_LIST_DEPRECATED_COLUMN_KEYS.has(key)) continue;
    if (allKeys.includes(key) && !seen.has(key)) {
      merged.push(key);
      seen.add(key);
    }
  }
  for (const key of allKeys) {
    if (!seen.has(key)) merged.push(key);
  }
  let normalized = insertAfter(merged, 'flowNode', 'node', allKeys);
  normalized = insertAfter(normalized, 'prevFlowNode', 'flowNode', allKeys);
  for (const key of TIME_TAIL_KEYS) {
    const idx = normalized.indexOf(key);
    if (idx >= 0) normalized.splice(idx, 1);
  }
  for (const key of TIME_TAIL_KEYS) {
    if (allKeys.includes(key)) normalized.push(key);
  }
  return normalized;
}
