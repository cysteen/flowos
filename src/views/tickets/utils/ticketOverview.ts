import type { LatestHandlingItem } from '@/views/tickets/types/operation';
import type { Ticket } from '@/views/tickets/types/ticket';

/** 列表与处理页速览带共用：产品&问题一行文案 */
export function ticketProductIssue(t: Ticket): string {
  const parts = [t.productCategory, t.product].filter(Boolean);
  return parts.length ? parts.join('-') : t.product;
}

function formatOverviewWhen(updatedAt?: string): string {
  if (!updatedAt) return '最近';
  const today = new Date();
  const ymd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  if (updatedAt.startsWith(ymd)) {
    const hm = updatedAt.slice(11, 16);
    return hm ? `今天 ${hm}` : '今天';
  }
  return updatedAt.slice(5, 16);
}

/** 列表「最新」与处理页「最新处理」首条对齐 */
export function ticketLatestHandlingItems(t: Ticket): LatestHandlingItem[] {
  const text = t.latestHandling?.trim();
  if (!text) return [];
  return [{
    who: t.assignee ?? '处理人',
    role: '一线坐席',
    when: formatOverviewWhen(t.updatedAt),
    text,
  }];
}

export function ticketLatestHandlingPreview(t: Ticket): LatestHandlingItem | null {
  const items = ticketLatestHandlingItems(t);
  return items[0] ?? null;
}
