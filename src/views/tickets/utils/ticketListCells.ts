import type { Ticket } from '@/views/tickets/types/ticket';
import { resolveTicketGroupNames } from '@/views/tickets/types/ticket';
import { ticketListSourceLabel } from '@/views/tickets/types/createTicket';

export function formatStartDate(t: Ticket): string {
  if (!t.createdAt) return '—';
  return t.createdAt.slice(0, 10);
}

/** 列表日期时间（建单 / 更新） */
export function formatListDateTime(value: string): string {
  return value.length > 16 ? value.slice(0, 16) : value;
}

/** 单号缺时间字段时的展示兜底（与 mock ensureTicketTimestamps 口径一致） */
export function inferListDateTimeFromNo(no: string): string {
  const m = no.match(/^IFLY[A-Z]{2}(\d{4})(\d{2})(\d{2})/i);
  if (!m) return '2026-06-10 09:00';
  return `${m[1]}-${m[2]}-${m[3]} 09:00`;
}

export function formatCurrentGroup(t: Ticket): string {
  const names = resolveTicketGroupNames(t);
  return names[0] ?? '—';
}

export function formatCount(n?: number): string {
  if (n == null || Number.isNaN(n)) return '—';
  return String(n);
}

/** 列表 plain 列文案 */
export function listCellText(t: Ticket, key: string): string {
  switch (key) {
    case 'businessType':
      return t.businessType ?? '—';
    case 'ticketType':
      return t.type;
    case 'ticketSource':
      return ticketListSourceLabel(t);
    case 'startDate':
      return formatStartDate(t);
    case 'createdAt':
      return formatListDateTime(t.createdAt ?? inferListDateTimeFromNo(t.no));
    case 'updatedAt':
      return formatListDateTime(t.updatedAt ?? t.createdAt ?? inferListDateTimeFromNo(t.no));
    case 'currentGroup':
      return formatCurrentGroup(t);
    case 'lastHandler':
      return t.lastHandler ?? '—';
    case 'lastHandledAt':
      return t.lastHandledAt ?? '—';
    default:
      return '—';
  }
}
