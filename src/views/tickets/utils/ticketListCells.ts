import type { Ticket } from '@/views/tickets/types/ticket';
import { resolveTicketGroupNames } from '@/views/tickets/types/ticket';
import { resolveCurrentFlowNode, resolvePreviousFlowNode } from '@/views/tickets/utils/ticketFlowNodes';

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
  if (!names.length) return '—';
  if (names.length === 1) return names[0];
  return `${names[0]} +${names.length - 1}`;
}

export interface HandlerGroupCell {
  person: string;
  group: string;
}

/** 当前处理人 + 当前处理组（两行展示） */
export function formatCurrentHandlerGroup(t: Ticket): HandlerGroupCell {
  return {
    person: t.assignee ?? '— 待领',
    group: formatCurrentGroup(t),
  };
}

/** 上次处理人 + 上次处理组（两行展示） */
export function formatLastHandlerGroup(t: Ticket): HandlerGroupCell {
  return {
    person: t.lastHandler ?? '—',
    group: t.lastHandlerGroup ?? '—',
  };
}

export function formatCount(n?: number): string {
  if (n == null || Number.isNaN(n)) return '—';
  return String(n);
}

/** 列表 plain 列文案 */
export function listCellText(t: Ticket, key: string): string {
  switch (key) {
    case 'startDate':
      return formatStartDate(t);
    case 'createdAt':
      return formatListDateTime(t.createdAt ?? inferListDateTimeFromNo(t.no));
    case 'updatedAt':
      return formatListDateTime(t.updatedAt ?? t.createdAt ?? inferListDateTimeFromNo(t.no));
    case 'lastHandler':
      return t.lastHandler ?? '—';
    case 'flowNode':
      return resolveCurrentFlowNode(t);
    case 'prevFlowNode':
      return resolvePreviousFlowNode(t);
    default:
      return '—';
  }
}
