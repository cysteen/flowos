import dayjs, { type Dayjs } from 'dayjs';
import { PROTOTYPE_TODAY, prototypeDayEnd } from '@/config/prototypeDate';
import type { RegistrationRecord } from '@/views/tickets/types/businessRegistration';
import { registrationTimelinessRemainMs } from '@/views/self-service/registrationListTimeliness';

/** 筛选条快捷时间；custom 表示范围选择器内自定义区间 */
export type RegistrationListTimePreset = '' | 'today' | 'yesterday' | 'week' | '7d' | '30d' | '90d' | 'custom';

/** RangePicker 左侧快捷项（对齐工单 TicketMineQueryBar，并扩展今天/本周） */
export const REGISTRATION_TIME_QUICK_PRESETS: { value: Exclude<RegistrationListTimePreset, '' | 'custom'>; label: string }[] = [
  { value: 'today', label: '今天' },
  { value: 'yesterday', label: '昨天' },
  { value: 'week', label: '本周' },
  { value: '7d', label: '最近一周' },
  { value: '30d', label: '最近一个月' },
  { value: '90d', label: '最近三个月' },
];

export function registrationListPresetToDayjsRange(
  preset: Exclude<RegistrationListTimePreset, '' | 'custom'>,
): [Dayjs, Dayjs] {
  const { from, to } = resolveRegistrationListTimeRange(preset);
  return [dayjs(from), dayjs(to)];
}

/** ant-design-vue RangePicker `presets`（须在 computed 内调用以保证与当前筛选模型一致） */
export function buildRegistrationListRangePresets(): { label: string; value: [Dayjs, Dayjs] }[] {
  return REGISTRATION_TIME_QUICK_PRESETS.map(({ value, label }) => ({
    label,
    value: registrationListPresetToDayjsRange(value),
  }));
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function formatRegistrationQueryDateTime(d: Date, upper = false): string {
  const y = d.getFullYear();
  const m = pad2(d.getMonth() + 1);
  const day = pad2(d.getDate());
  return upper ? `${y}-${m}-${day} 23:59:59` : `${y}-${m}-${day} 00:00:00`;
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
 * 自建单列表 RangePicker 快捷时间窗；作用于当前 {@link RegistrationListQuery.timeField}。
 * 与工单「我的任务」一致，锚定在原型今日，避免本机日期漂移导致列表被静默滤空。
 */
export function resolveRegistrationListTimeRange(
  preset: Exclude<RegistrationListTimePreset, '' | 'custom'>,
): { from: string; to: string } {
  const end = prototypeDayEnd();
  const to = formatRegistrationQueryDateTime(end, true);

  if (preset === 'today') {
    const start = new Date(PROTOTYPE_TODAY);
    start.setHours(0, 0, 0, 0);
    return { from: formatRegistrationQueryDateTime(start), to };
  }
  if (preset === 'yesterday') {
    const start = new Date(PROTOTYPE_TODAY);
    start.setDate(start.getDate() - 1);
    start.setHours(0, 0, 0, 0);
    const endYesterday = new Date(start);
    endYesterday.setHours(23, 59, 59, 999);
    return {
      from: formatRegistrationQueryDateTime(start),
      to: formatRegistrationQueryDateTime(endYesterday, true),
    };
  }
  if (preset === 'week') {
    return { from: formatRegistrationQueryDateTime(startOfWeekMonday(PROTOTYPE_TODAY)), to };
  }

  const days = preset === '7d' ? 7 : preset === '30d' ? 30 : 90;
  const start = new Date(end);
  start.setDate(start.getDate() - (days - 1));
  start.setHours(0, 0, 0, 0);
  return { from: formatRegistrationQueryDateTime(start), to };
}

export function detectRegistrationListTimePreset(
  query: Pick<RegistrationListQuery, 'timeField' | 'dateFrom' | 'dateTo'>,
): RegistrationListTimePreset {
  if (!query.dateFrom.trim() || !query.dateTo.trim()) return '';
  for (const { value } of REGISTRATION_TIME_QUICK_PRESETS) {
    const range = resolveRegistrationListTimeRange(value);
    if (range.from === query.dateFrom.trim() && range.to === query.dateTo.trim()) return value;
  }
  return 'custom';
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
  timeField: 'createdAt' | 'updatedAt' | 'accessTime' | 'replyTime';
  /** Local dates or explicit local timestamps, inclusive at the supplied precision. */
  dateFrom: string;
  dateTo: string;
}

export const emptyRegistrationListQuery = (): RegistrationListQuery => ({
  keyword: '', ticketNo: '', businessPhone: '', contactPhone: '', status: '', handler: '', groupName: '',
  feedback: '', specificSource: '', channelDetail: '', operator: '', province: '', businessLine: '',
  productCategory: '', productName: '', problemL1: '', problemL2: '', complaintType: '', closedLoop: '',
  timeField: 'createdAt', dateFrom: '', dateTo: '',
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

function contains(value: string | undefined, filter: string): boolean {
  return (value ?? '').toLocaleLowerCase().includes(filter.trim().toLocaleLowerCase());
}

/** Filters only the independent self-service records; it does not read normal tickets. */
export function matchesRegistrationListQuery(record: RegistrationRecord, query: RegistrationListQuery): boolean {
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
    const time = query.timeField === 'createdAt'
      ? record.createdAt
      : query.timeField === 'updatedAt'
        ? record.updatedAt
        : values[query.timeField];
    const value = timestamp(time);
    if (!Number.isFinite(value)) return false;
    if (value < from || value > to) return false;
  }
  return true;
}

export function filterRegistrationRecords(records: readonly RegistrationRecord[], query: RegistrationListQuery): RegistrationRecord[] {
  return records.filter((record) => matchesRegistrationListQuery(record, query));
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
