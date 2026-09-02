import { matchesSearchText } from '@/views/query/queryCenterSearch';
import { TICKETS } from '@/mock/tickets';
import type { Priority, Ticket, TicketType } from '@/views/tickets/types/ticket';
import { resolveTicketGroupNames } from '@/views/tickets/types/ticket';
import type { BusinessType, TicketSource } from '@/views/tickets/types/createTicket';
import { prototypeDayEnd } from '@/config/prototypeDate';

/** 结构化筛选 · 时间快捷选项 */
export type MineTimePreset = '' | '7d' | '30d' | '90d' | 'custom';

export const MINE_TIME_PRESETS: { value: MineTimePreset; label: string }[] = [
  { value: '', label: '全部时间' },
  { value: '7d', label: '最近 7 天' },
  { value: '30d', label: '最近 30 天' },
  { value: '90d', label: '最近 90 天' },
  { value: 'custom', label: '自定义' },
];

/** 我的任务 / 已办 · 结构化筛选 */
export interface MineQueryFilter {
  ticketNo: string;
  phone: string;
  sn: string;
  priority: '' | Priority;
  productCategory: string;
  productName: string;
  /** 时间快捷选项；空=不按时间过滤 */
  timePreset: MineTimePreset;
  /** 自定义区间起（YYYY-MM-DD） */
  dateFrom: string;
  /** 自定义区间止（YYYY-MM-DD） */
  dateTo: string;
  /** 本组工单池 · 用户分组 ID；空=全部 */
  poolGroup: string;
  /** 以下经「+ 筛选」加入的可选筛选项 */
  customer: string;
  nodeStatus: string;
  assignee: string;
  businessType: string;
  ticketType: '' | TicketType;
  ticketSource: '' | TicketSource;
  problemL1: string;
  problemL2: string;
  problemL3: string;
  groupName: string;
}

export const EMPTY_MINE_QUERY = (): MineQueryFilter => ({
  ticketNo: '',
  phone: '',
  sn: '',
  priority: '',
  productCategory: '',
  productName: '',
  timePreset: '',
  dateFrom: '',
  dateTo: '',
  poolGroup: '',
  customer: '',
  nodeStatus: '',
  assignee: '',
  businessType: '',
  ticketType: '',
  ticketSource: '',
  problemL1: '',
  problemL2: '',
  problemL3: '',
  groupName: '',
});

/** 已办 Tab 默认时间窗（数据量较大） */
export const DEFAULT_DONE_QUERY = (): MineQueryFilter => ({
  ...EMPTY_MINE_QUERY(),
  timePreset: '30d',
});

/** 工单 Mock 尚未覆盖、但筛选/建单需出现的补充产品 */
const EXTRA_PRODUCTS_BY_CATEGORY: Record<string, string[]> = {
  智能硬件: ['学习机 X3 Pro', '讯飞智能耳机'],
  软件服务: ['智学网会员', '讯飞听见'],
  消费电子: [],
  学习硬件: ['学习机 X3 Pro'],
};

function buildProductCatalog(): {
  categories: string[];
  namesByCategory: Record<string, string[]>;
} {
  const byCategory = new Map<string, Set<string>>();

  for (const t of TICKETS) {
    const cat = (t.productCategory ?? '').trim() || '其他';
    if (!byCategory.has(cat)) byCategory.set(cat, new Set());
    if (t.product?.trim()) byCategory.get(cat)!.add(t.product.trim());
  }

  for (const [cat, extras] of Object.entries(EXTRA_PRODUCTS_BY_CATEGORY)) {
    if (!byCategory.has(cat)) byCategory.set(cat, new Set());
    for (const name of extras) byCategory.get(cat)!.add(name);
  }

  // 问题分类等产品主数据里常见、列表偶发出现的型号
  const sharedExtras = ['讯飞录音笔 H1', '讯飞录音笔 H2', '三防翻译机', '汉维翻译机'];
  for (const name of sharedExtras) {
    if (!byCategory.has('智能硬件')) byCategory.set('智能硬件', new Set());
    byCategory.get('智能硬件')!.add(name);
  }

  const sortZh = (a: string, b: string) => a.localeCompare(b, 'zh-CN');
  const categories = [...byCategory.keys()].sort(sortZh);
  const namesByCategory: Record<string, string[]> = {};
  for (const cat of categories) {
    namesByCategory[cat] = [...byCategory.get(cat)!].sort(sortZh);
  }
  return { categories, namesByCategory };
}

const PRODUCT_CATALOG = buildProductCatalog();

/** 产品分类（与工单列表「产品」列 / productCategory 字段对齐） */
export const PRODUCT_CATEGORIES = PRODUCT_CATALOG.categories;

/** 产品分类 → 产品名称 */
export const PRODUCT_NAMES_BY_CATEGORY = PRODUCT_CATALOG.namesByCategory;

/** 全部可选产品名称（未选分类时筛选用） */
export function allProductNames(): string[] {
  const set = new Set<string>();
  for (const names of Object.values(PRODUCT_NAMES_BY_CATEGORY)) {
    for (const n of names) set.add(n);
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'zh-CN'));
}

export function productNamesForCategory(category: string): string[] {
  if (!category) return allProductNames();
  return PRODUCT_NAMES_BY_CATEGORY[category] ?? [];
}

/** 我的任务 · 排序规则 */
export type MineSortRule =
  | 'sla_urgency'
  | 'priority_desc'
  | 'priority_asc'
  | 'created_desc'
  | 'updated_desc'
  | 'appointment_asc';

export interface MineSortOption {
  key: MineSortRule;
  label: string;
  /** 智能排序 pill 展示用短标签 */
  shortLabel: string;
}

export const MINE_SORT_OPTIONS: MineSortOption[] = [
  { key: 'sla_urgency', label: 'SLA 紧急度优先', shortLabel: 'SLA 紧急度优先' },
  { key: 'priority_desc', label: '优先级从高到低（P0→P3）', shortLabel: '优先级 ↓' },
  { key: 'priority_asc', label: '优先级从低到高（P3→P0）', shortLabel: '优先级 ↑' },
  { key: 'created_desc', label: '创建时间从新到旧', shortLabel: '创建时间 ↓' },
  { key: 'updated_desc', label: '更新时间从新到旧', shortLabel: '更新时间 ↓' },
  { key: 'appointment_asc', label: '预约倒计时从近到远', shortLabel: '预约倒计时 ↑' },
];

const PRIORITY_RANK: Record<Priority, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };

function includes(hay: string, needle: string): boolean {
  return hay.toLowerCase().includes(needle.trim().toLowerCase());
}

function ts(s?: string): number {
  if (!s) return 0;
  return new Date(s.replace(' ', 'T')).getTime() || 0;
}

function ticketUpdatedTime(t: Ticket): number {
  return ts(t.updatedAt) || ts(t.createdAt);
}

function dayStart(ymd: string): number {
  return new Date(`${ymd}T00:00:00`).getTime() || 0;
}

function dayEnd(ymd: string): number {
  return new Date(`${ymd}T23:59:59.999`).getTime() || 0;
}

/** 解析结构化筛选的时间区间（按工单更新时间） */
export function resolveMineTimeRange(q: MineQueryFilter): { from: number; to: number } | null {
  if (!q.timePreset) return null;

  const end = prototypeDayEnd();

  if (q.timePreset === 'custom') {
    if (!q.dateFrom && !q.dateTo) return null;
    return {
      from: q.dateFrom ? dayStart(q.dateFrom) : 0,
      to: q.dateTo ? dayEnd(q.dateTo) : end.getTime(),
    };
  }

  const days = q.timePreset === '7d' ? 7 : q.timePreset === '30d' ? 30 : 90;
  const start = new Date(end);
  start.setDate(start.getDate() - (days - 1));
  start.setHours(0, 0, 0, 0);
  return { from: start.getTime(), to: end.getTime() };
}

export function matchMineQuery(t: Ticket, q: MineQueryFilter): boolean {
  if (q.ticketNo) {
    const kw = q.ticketNo.trim().toLowerCase();
    const hay = `${t.no} ${t.title}`.toLowerCase();
    if (!hay.includes(kw)) return false;
  }
  if (q.phone) {
    const phone = t.customerPhone ?? '';
    if (!matchesSearchText(phone, q.phone) && !includes(t.customer, q.phone)) return false;
  }
  if (q.sn && !(t.sn && includes(t.sn, q.sn))) return false;
  if (q.priority && t.priority !== q.priority) return false;
  if (q.productCategory && t.productCategory !== q.productCategory) return false;
  if (q.productName && t.product !== q.productName) return false;
  if (q.poolGroup && t.groupId !== q.poolGroup) return false;
  if (q.customer && !includes(t.customer, q.customer)) return false;
  if (q.nodeStatus && t.nodeStatus !== q.nodeStatus) return false;
  if (q.assignee) {
    const name = t.assignee ?? '';
    if (!includes(name, q.assignee)) return false;
  }
  if (q.businessType && t.businessType !== q.businessType) return false;
  if (q.ticketType && t.type !== q.ticketType) return false;
  if (q.ticketSource) {
    const src = t.ticketSource ?? (t.channel === '电话' ? '电话' : t.channel);
    if (src !== q.ticketSource) return false;
  }
  if (q.problemL1 && t.problemL1 !== q.problemL1) return false;
  if (q.problemL2 && t.problemL2 !== q.problemL2) return false;
  if (q.problemL3 && t.problemL3 !== q.problemL3) return false;
  if (q.groupName) {
    const names = resolveTicketGroupNames(t);
    if (!names.some((n) => includes(n, q.groupName))) return false;
  }

  const range = resolveMineTimeRange(q);
  if (range) {
    const updated = ticketUpdatedTime(t);
    if (!updated || updated < range.from || updated > range.to) return false;
  }

  return true;
}

export function hasMineQuery(q: MineQueryFilter): boolean {
  return !!(
    q.ticketNo
    || q.phone
    || q.sn
    || q.priority
    || q.productCategory
    || q.productName
    || q.timePreset
    || q.dateFrom
    || q.dateTo
    || q.poolGroup
    || q.customer
    || q.nodeStatus
    || q.assignee
    || q.businessType
    || q.ticketType
    || q.ticketSource
    || q.problemL1
    || q.problemL2
    || q.problemL3
    || q.groupName
  );
}

function parseAppointmentMinutes(text?: string): number {
  if (!text) return Number.MAX_SAFE_INTEGER;
  const parts = text.split(':').map(Number);
  if (parts.length >= 2 && parts.every((n) => !Number.isNaN(n))) {
    return parts[0] * 60 + parts[1];
  }
  return Number.MAX_SAFE_INTEGER;
}

export function compareByMineSort(a: Ticket, b: Ticket, rule: MineSortRule): number {
  switch (rule) {
    case 'priority_desc':
      return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    case 'priority_asc':
      return PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority];
    case 'created_desc':
      return ts(b.createdAt) - ts(a.createdAt);
    case 'updated_desc':
      return ts(b.updatedAt) - ts(a.updatedAt);
    case 'appointment_asc': {
      const hasA = a.hasAppointment ? 0 : 1;
      const hasB = b.hasAppointment ? 0 : 1;
      if (hasA !== hasB) return hasA - hasB;
      return parseAppointmentMinutes(a.appointmentText) - parseAppointmentMinutes(b.appointmentText);
    }
    case 'sla_urgency':
    default:
      return 0;
  }
}
