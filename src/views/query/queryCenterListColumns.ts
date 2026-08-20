import type { TicketColumnDef } from '@/views/tickets/composables/useTicketColumns';

/** 查询中心 · 默认展示列 */
export const QUERY_CENTER_DEFAULT_KEYS = [
  'priority',
  'summary',
  'customer',
  'product',
  'node',
  'sla',
  'assignee',
  'startDate',
  'ticketType',
] as const;

/** 查询中心 · 列设置内可选列（默认隐藏） */
export const QUERY_CENTER_OPTIONAL_KEYS = [
  'synced',
  'feishuSync',
  'currentGroup',
  'currentAssignee',
  'lastHandler',
  'lastHandledAt',
  'upgradeCount',
  'appointmentTime',
  'riskWeight',
  'supplementPendingCount',
  'supplementDoneCount',
  'nodeProgress',
] as const;

const optionalSet = new Set<string>(QUERY_CENTER_OPTIONAL_KEYS);

/** 查询中心 · 查工单列表全部可配置列 */
export const QUERY_CENTER_COLUMN_DEFS: TicketColumnDef[] = [
  { key: 'priority', label: '优先级' },
  { key: 'summary', label: '工单摘要' },
  { key: 'customer', label: '客户' },
  { key: 'product', label: '产品' },
  { key: 'node', label: '当前节点' },
  { key: 'sla', label: 'SLA 时效' },
  { key: 'assignee', label: '处理人' },
  { key: 'startDate', label: '开始日期' },
  { key: 'ticketType', label: '工单类型' },
  { key: 'synced', label: '是否同步', defaultVisible: false },
  { key: 'feishuSync', label: '产研/飞书状态', defaultVisible: false },
  { key: 'currentGroup', label: '当前处理组', defaultVisible: false },
  { key: 'currentAssignee', label: '当前处理人', defaultVisible: false },
  { key: 'lastHandler', label: '上次处理人', defaultVisible: false },
  { key: 'lastHandledAt', label: '上次处理时间', defaultVisible: false },
  { key: 'upgradeCount', label: '升级次数', defaultVisible: false },
  { key: 'appointmentTime', label: '预约时间', defaultVisible: false },
  { key: 'riskWeight', label: '风险权重', defaultVisible: false },
  { key: 'supplementPendingCount', label: '补充未处理数', defaultVisible: false },
  { key: 'supplementDoneCount', label: '补充已处理数', defaultVisible: false },
  { key: 'nodeProgress', label: '节点', defaultVisible: false },
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
