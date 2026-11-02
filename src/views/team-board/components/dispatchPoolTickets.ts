/**
 * 【1215】班组看板 · 本组池待领工单（PRD 9.3）。
 *
 * 池待领口径：同组、在工单池（tab=pool）、无处理人、非归档、非草稿；
 * 排序：派单状态（DISPATCH_STATUS_ORDER）→ 首响 SLA 紧急度。
 * 等待时长口径与池列表「等待时长」列一致：自进入派单起算；未进入派单的取最近更新时间（无则取创建时间）。
 */
import type { Ticket } from '@/views/tickets/types/ticket';
import { slaUrgencyCompare } from '@/views/tickets/types/ticket';
import { useDispatchStore } from '@/stores/dispatch';
import { DISPATCH_STATUS_ORDER, waitMinutesOf } from '@/views/tickets/composables/dispatchUi';

/** 本组池待领工单（已排序）；groupId 为空返回空数组 */
export function poolTicketsOf(groupId: string | null | undefined, tickets: Ticket[]): Ticket[] {
  if (!groupId) return [];
  const dispatch = useDispatchStore();
  const rankOf = (t: Ticket) => DISPATCH_STATUS_ORDER[dispatch.dispatchStatusOf(t.no) ?? ''] ?? 3;
  return tickets
    .filter((t) => t.groupId === groupId && t.tab === 'pool' && t.assignee === null && !t.archived && !t.isDraft)
    .sort((a, b) => rankOf(a) - rankOf(b) || slaUrgencyCompare(a, b));
}

/** 单张池内工单等待时长（分钟），与池列表「等待时长」列同口径 */
export function poolWaitMinutesOf(t: Ticket, now: number = Date.now()): number | null {
  return waitMinutesOf(t, now);
}

/** 一组池内工单的最长等待（分钟）；无可计时工单返回 null */
export function maxPoolWaitMinutes(tickets: Ticket[], now: number = Date.now()): number | null {
  let max: number | null = null;
  for (const t of tickets) {
    const m = waitMinutesOf(t, now);
    if (m != null && (max == null || m > max)) max = m;
  }
  return max;
}
