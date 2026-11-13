import type { RegistrationRecord } from '@/views/tickets/types/businessRegistration';

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
  timeField: 'createdAt' | 'accessTime' | 'replyTime';
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
    const time = query.timeField === 'createdAt' ? record.createdAt : values[query.timeField];
    const value = timestamp(time);
    if (!Number.isFinite(value)) return false;
    if (value < from || value > to) return false;
  }
  return true;
}

export function filterRegistrationRecords(records: readonly RegistrationRecord[], query: RegistrationListQuery): RegistrationRecord[] {
  return records.filter((record) => matchesRegistrationListQuery(record, query));
}
