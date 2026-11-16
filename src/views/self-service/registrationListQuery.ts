import dayjs, { type Dayjs } from 'dayjs';
import type { RegistrationRecord } from '@/views/tickets/types/businessRegistration';
import { registrationTimelinessRemainMs } from '@/views/self-service/registrationListTimeliness';

/** 始终作用于创建时间，custom 保留秒级自定义能力。 */
export type RegistrationListTimePreset = '3m' | 'today' | 'week' | 'month' | 'custom';

/** 与个人门户时间选择器采用相同快捷项，缺省窗口为近三个月。 */
export const REGISTRATION_TIME_QUICK_PRESETS: { value: Exclude<RegistrationListTimePreset, 'custom'>; label: string }[] = [
  { value: '3m', label: '近三个月' },
  { value: 'today', label: '今天' },
  { value: 'week', label: '本周' },
  { value: 'month', label: '本月' },
];

export function registrationListPresetToDayjsRange(
  preset: Exclude<RegistrationListTimePreset, 'custom'>,
  now = new Date(),
): [Dayjs, Dayjs] {
  const { from, to } = resolveRegistrationListTimeRange(preset, now);
  return [dayjs(from), dayjs(to)];
}

/** ant-design-vue RangePicker `presets`（须在 computed 内调用以保证与当前筛选模型一致） */
export function buildRegistrationListRangePresets(now = new Date()): { label: string; value: [Dayjs, Dayjs] }[] {
  return REGISTRATION_TIME_QUICK_PRESETS.map(({ value, label }) => ({
    label,
    value: registrationListPresetToDayjsRange(value, now),
  }));
}

function startOfWeekMonday(anchor: Date): Date {
  const start = new Date(anchor);
  const weekday = start.getDay();
  const back = weekday === 0 ? 6 : weekday - 1;
  start.setDate(start.getDate() - back);
  start.setHours(0, 0, 0, 0);
  return start;
}

/**
 * 列表及导出共享实时创建时间窗：减三自然月的当日零点至当前时刻。
 * Dayjs 的减月会在月末收敛到目标月最后一天，不使用固定90天或旧原型锚点。
 */
export function registrationListWindow(now = new Date()): { from: Date; to: Date } {
  return { from: dayjs(now).subtract(3, 'month').startOf('day').toDate(), to: new Date(now) };
}

export function resolveRegistrationListTimeRange(
  preset: Exclude<RegistrationListTimePreset, 'custom'>,
  now = new Date(),
): { from: string; to: string } {
  const start = preset === 'today' ? dayjs(now).startOf('day')
    : preset === 'week' ? dayjs(startOfWeekMonday(now))
      : preset === 'month' ? dayjs(now).startOf('month')
        : dayjs(registrationListWindow(now).from);
  return { from: start.format('YYYY-MM-DD HH:mm:ss'), to: dayjs(now).format('YYYY-MM-DD HH:mm:ss') };
}

export interface RegistrationListQuery {
  keyword: string;
  ticketNo: string;
  businessPhone: string;
  contactPhone: string;
  status: '' | RegistrationRecord['status'];
  handler: string;
  groupName: string;
  feedback: string;
  specificSource: string;
  channelDetail: string;
  operator: string;
  province: string;
  businessLine: string;
  productCategory: string;
  productName: string;
  problemL1: string;
  problemL2: string;
  complaintType: string;
  closedLoop: string;
  /** Local dates or explicit local timestamps, inclusive at the supplied precision. */
  dateFrom: string;
  dateTo: string;
}

export const emptyRegistrationListQuery = (): RegistrationListQuery => ({
  keyword: '', ticketNo: '', businessPhone: '', contactPhone: '', status: '', handler: '', groupName: '',
  feedback: '', specificSource: '', channelDetail: '', operator: '', province: '', businessLine: '',
  productCategory: '', productName: '', problemL1: '', problemL2: '', complaintType: '', closedLoop: '',
  dateFrom: '', dateTo: '',
});

function timestamp(value: string | undefined, upper = false): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?)?$/.exec(value?.trim() ?? '');
  if (!match) return NaN;
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
  const hour = match[4] === undefined ? (upper ? 23 : 0) : Number(match[4]);
  const minute = match[5] === undefined ? (upper ? 59 : 0) : Number(match[5]);
  const second = match[6] === undefined ? (upper ? 59 : 0) : Number(match[6]);
  const milliseconds = Number((match[7] ?? '').padEnd(3, upper ? '9' : '0'));
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59) return NaN;
  const date = new Date(0);
  date.setFullYear(year, month - 1, day);
  date.setHours(hour, minute, second, milliseconds);
  // Reject malformed dates such as February 30 instead of silently rolling into March.
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
    && date.getHours() === hour && date.getMinutes() === minute && date.getSeconds() === second
    ? date.getTime() : NaN;
}

/** 控件输入仍须校验，不能仅依靠日历禁选防止手输或秒级越界。 */
export function registrationListRangeError(dateFrom: string, dateTo: string, now = new Date()): string | undefined {
  if (!dateFrom.trim() || !dateTo.trim()) return '请选择完整的创建时间范围';
  const from = timestamp(dateFrom), to = timestamp(dateTo);
  if (!Number.isFinite(from) || !Number.isFinite(to) || from > to) return '请选择有效的创建时间范围';
  const window = registrationListWindow(now);
  if (from < window.from.getTime() || to > window.to.getTime()) return '创建时间须在近三个月内，且不能晚于当前时间';
  return undefined;
}

export function withinRegistrationListWindow(record: RegistrationRecord, now = new Date()): boolean {
  const window = registrationListWindow(now), created = timestamp(record.createdAt);
  return Number.isFinite(created) && created >= window.from.getTime() && created <= window.to.getTime();
}

function contains(value: string | undefined, filter: string): boolean {
  return (value ?? '').toLocaleLowerCase().includes(filter.trim().toLocaleLowerCase());
}

/** Filters only the independent self-service records; it does not read normal tickets. */
export function matchesRegistrationListQuery(record: RegistrationRecord, query: RegistrationListQuery, now = new Date()): boolean {
  if (!withinRegistrationListWindow(record, now)) return false;
  const values = record.values;
  if (query.ticketNo && !contains(record.no, query.ticketNo)) return false;
  if (query.businessPhone && !contains(values.businessPhone, query.businessPhone)) return false;
  if (query.contactPhone && !contains(values.contactPhone, query.contactPhone)) return false;
  if (query.channelDetail && !contains(values.channelDetail, query.channelDetail)) return false;
  if (query.status && record.status !== query.status) return false;
  if (query.handler && record.handler !== query.handler) return false;
  if (query.groupName && record.groupName !== query.groupName) return false;
  const enumFields = ['feedback', 'specificSource', 'operator', 'province', 'businessLine',
    'productCategory', 'productName', 'problemL1', 'problemL2', 'complaintType', 'closedLoop'] as const;
  if (enumFields.some((field) => query[field] && values[field] !== query[field])) return false;
  const keyword = query.keyword.trim().toLocaleLowerCase();
  if (keyword) {
    const searchable = [record.no, record.handler, record.groupName, record.builder, ...Object.values(values)].join(' ').toLocaleLowerCase();
    if (!searchable.includes(keyword)) return false;
  }
  const dateFrom = query.dateFrom.trim(), dateTo = query.dateTo.trim();
  if (dateFrom || dateTo) {
    const from = dateFrom ? timestamp(dateFrom) : -Infinity;
    const to = dateTo ? timestamp(dateTo, true) : Infinity;
    if (Number.isNaN(from) || Number.isNaN(to) || from > to) return false;
    const value = timestamp(record.createdAt);
    if (!Number.isFinite(value)) return false;
    if (value < from || value > to) return false;
  }
  return true;
}

export function filterRegistrationRecords(records: readonly RegistrationRecord[], query: RegistrationListQuery, now = new Date()): RegistrationRecord[] {
  return records.filter((record) => matchesRegistrationListQuery(record, query, now));
}

/** 列表排序用毫秒；缺省或非法时间返回 NaN（排序时置后）。 */
export function registrationListTimeMs(value: string | undefined): number {
  const t = timestamp(value?.trim() ?? '');
  return Number.isFinite(t) ? t : NaN;
}

export type RegistrationListSortKey = 'accessTime' | 'updatedAt' | 'sla';
export type RegistrationListSortDir = 'asc' | 'desc';

function compareTimeValues(va: string | undefined, vb: string | undefined, dir: RegistrationListSortDir): number {
  const ta = registrationListTimeMs(va);
  const tb = registrationListTimeMs(vb);
  const mul = dir === 'asc' ? 1 : -1;
  const aEmpty = !Number.isFinite(ta);
  const bEmpty = !Number.isFinite(tb);
  if (aEmpty && bEmpty) return 0;
  if (aEmpty) return 1;
  if (bEmpty) return -1;
  return (ta - tb) * mul;
}

/** 默认列表序：更新时间倒序（与工单列表 byUpdatedDesc 一致） */
export function compareRegistrationDefault(a: RegistrationRecord, b: RegistrationRecord): number {
  const byUpdated = compareTimeValues(a.updatedAt, b.updatedAt, 'desc');
  if (byUpdated) return byUpdated;
  return a.no.localeCompare(b.no);
}

export function compareRegistrationByListSort(
  a: RegistrationRecord,
  b: RegistrationRecord,
  key: RegistrationListSortKey,
  dir: RegistrationListSortDir,
): number {
  if (key === 'sla') {
    const mul = dir === 'asc' ? 1 : -1;
    const ra = registrationTimelinessRemainMs(a);
    const rb = registrationTimelinessRemainMs(b);
    const aInf = !Number.isFinite(ra);
    const bInf = !Number.isFinite(rb);
    if (aInf && bInf) return compareRegistrationDefault(a, b);
    if (aInf) return 1;
    if (bInf) return -1;
    const primary = (ra - rb) * mul;
    if (primary) return primary;
    return compareRegistrationDefault(a, b);
  }
  const va = key === 'accessTime' ? a.values.accessTime : a.updatedAt;
  const vb = key === 'accessTime' ? b.values.accessTime : b.updatedAt;
  const primary = compareTimeValues(va, vb, dir);
  if (primary) return primary;
  return compareRegistrationDefault(a, b);
}
