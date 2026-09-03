import type { TicketColumnDef } from '@/views/tickets/composables/useTicketColumns';
import {
  TICKET_LIST_COLUMN_CATALOG,
  TICKET_LIST_COLUMN_KEYS,
  TICKET_LIST_FIXED_COLUMN_DEFS,
  ticketListColumnLabel,
} from '@/views/tickets/composables/ticketListColumnCatalog';

/** 查询中心 · 默认展示列（与列 catalog 声明顺序一致，不含固定列） */
export const QUERY_CENTER_DEFAULT_KEYS = [
  'priority',
  'summary',
  'customer',
  'product',
  'node',
  'flowNode',
  'prevFlowNode',
  'sla',
  'assignee',
  'createdAt',
  'updatedAt',
] as const;

/** 查询中心 · 列设置内可选列（默认隐藏） */
export const QUERY_CENTER_OPTIONAL_KEYS = [
  'lastHandler',
] as const;

const optionalSet = new Set<string>(QUERY_CENTER_OPTIONAL_KEYS);

/** 查询中心 · 查工单列表全部可配置列（与工作台共用 catalog） */
export const QUERY_CENTER_COLUMN_DEFS: TicketColumnDef[] = TICKET_LIST_COLUMN_CATALOG;

export const QUERY_CENTER_FIXED_COLUMN_DEFS: TicketColumnDef[] = TICKET_LIST_FIXED_COLUMN_DEFS;

export const QUERY_CENTER_COLUMN_ORDER = TICKET_LIST_COLUMN_KEYS;

export function queryCenterColumnLabel(key: string): string {
  return ticketListColumnLabel(key);
}

export function isQueryCenterOptionalColumn(key: string): boolean {
  return optionalSet.has(key);
}
