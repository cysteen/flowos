/**
 * 【1215】班组看板 · 本组派单的池内待领工单（PRD 9.3）。
 *
 * 池待领口径：所在池的处理组为该组（一个处理组可有多个池）、在工单池（tab=pool）、无处理人、非归档、非草稿；
 * 排序：派单状态（DISPATCH_STATUS_ORDER）→ 首响 SLA 紧急度。
 * 等待时长口径与池列表「等待时长」列一致：自进入派单起算；未进入派单的取最近更新时间（无则取创建时间）。
 */
import type { Ticket } from '@/views/tickets/types/ticket';
import { firstRespClockState, slaUrgencyCompare } from '@/views/tickets/types/ticket';
import { useDispatchStore } from '@/stores/dispatch';
import { DISPATCH_STATUS_ORDER, waitMinutesOf } from '@/views/tickets/composables/dispatchUi';

function isPending(t: Ticket): boolean {
  return t.tab === 'pool' && t.assignee === null && !t.archived && !t.isDraft;
}

function sortPool(list: Ticket[]): Ticket[] {
  const dispatch = useDispatchStore();
  const rankOf = (t: Ticket) => DISPATCH_STATUS_ORDER[dispatch.dispatchStatusOf(t.no) ?? ''] ?? 3;
  return list.sort((a, b) => rankOf(a) - rankOf(b) || slaUrgencyCompare(a, b));
}

/** 本组各池待领工单合并（池所属处理组＝该组，已排序）；groupId 为空返回空数组 */
export function poolTicketsOf(groupId: string | null | undefined, tickets: Ticket[]): Ticket[] {
  if (!groupId) return [];
  const dispatch = useDispatchStore();
  return sortPool(tickets.filter((t) => isPending(t) && dispatch.poolGroupIdOf(dispatch.poolIdOf(t)) === groupId));
}

/** 某个池的待领工单（已排序）；poolId 为空返回空数组 */
export function poolTicketsOfPool(poolId: string | null | undefined, tickets: Ticket[]): Ticket[] {
  if (!poolId) return [];
  const dispatch = useDispatchStore();
  return sortPool(tickets.filter((t) => isPending(t) && dispatch.poolIdOf(t) === poolId));
}

/** 一组池内工单里首响临期、已超时的张数（工单池卡片「SLA 临期/超期」） */
export function poolSlaAlertOf(tickets: Ticket[]): { soon: number; overdue: number; total: number } {
  const states = tickets.map(firstRespClockState);
  const soon = states.filter((s) => s === 'soon').length;
  const overdue = states.filter((s) => s === 'overdue').length;
  return { soon, overdue, total: soon + overdue };
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
