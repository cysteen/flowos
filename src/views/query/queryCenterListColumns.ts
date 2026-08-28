import type { TicketColumnDef } from '@/views/tickets/composables/useTicketColumns';

/** 查询中心 · 默认展示列 */
export const QUERY_CENTER_DEFAULT_KEYS = [
  'priority',
  'summary',
  'customer',
  'product',
  'node',
  'createdAt',
  'updatedAt',
  'sla',
  'assignee',
] as const;

/** 查询中心 · 列设置内可选列（默认隐藏） */
export const QUERY_CENTER_OPTIONAL_KEYS = [
  'currentGroup',
  'lastHandler',
  'lastHandledAt',
] as const;

const optionalSet = new Set<string>(QUERY_CENTER_OPTIONAL_KEYS);

/** 查询中心 · 查工单列表全部可配置列 */
export const QUERY_CENTER_COLUMN_DEFS: TicketColumnDef[] = [
  { key: 'priority', label: '优先级' },
  { key: 'summary', label: '工单摘要' },
  { key: 'customer', label: '客户' },
  { key: 'product', label: '产品' },
  { key: 'node', label: '当前状态' },
  { key: 'createdAt', label: '创建时间' },
  { key: 'updatedAt', label: '更新时间' },
  { key: 'sla', label: 'SLA 时效' },
  { key: 'assignee', label: '处理人' },
  { key: 'currentGroup', label: '当前处理组', defaultVisible: false },
  { key: 'lastHandler', label: '上次处理人', defaultVisible: false },
  { key: 'lastHandledAt', label: '上次处理时间', defaultVisible: false },
];

export const QUERY_CENTER_FIXED_COLUMN_DEFS: TicketColumnDef[] = [
  { key: 'title', label: '工单/标题' },
];

export const QUERY_CENTER_COLUMN_ORDER = QUERY_CENTER_COLUMN_DEFS.map((c) => c.key);

export function queryCenterColumnLabel(key: string): string {
  return (
    QUERY_CENTER_COLUMN_DEFS.find((c) => c.key === key)?.label
    ?? QUERY_CENTER_FIXED_COLUMN_DEFS.find((c) => c.key === key)?.label
    ?? key
  );
}

export function isQueryCenterOptionalColumn(key: string): boolean {
  return optionalSet.has(key);
}
