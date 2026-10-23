import { ref } from 'vue';
import { TICKETS } from '@/mock/tickets';
import type { Ticket } from '@/views/tickets/types/ticket';
import { FLASH_BADGE_LABEL, isFlashTicket } from '@/views/tickets/types/flash';
import { XIAOZHI_MARK_LABEL, isXiaozhiTicket } from '@/views/tickets/types/xiaozhi';
import { REFUND_MARK_LABEL, isRefundTicket } from '@/views/tickets/types/refund';

/**
 * 客户全景「同类单」格随本单标识（10-23）：刷机单 / 小智工单 / 个册退费单的工单类型都是「咨询」，
 * 这一格对这三类**按标识**计该客户名下的同标识单，「客户历史工单」Tab 的同标识筛选取同一份。
 * 普通咨询单不走这里：仍按工单类型「咨询」计（含带标识的咨询单，与列表 / 查询的类型筛选同口径）。
 */
export type SameMark = 'flash' | 'xiaozhi' | 'refund';

export function sameMarkOf(t: { isFlash?: boolean; isXiaozhi?: boolean; isRefund?: boolean } | null | undefined): SameMark | null {
  if (isFlashTicket(t)) return 'flash';
  if (isXiaozhiTicket(t)) return 'xiaozhi';
  if (isRefundTicket(t)) return 'refund';
  return null;
}

/** 宫格与筛选 chip 的名称：刷机单 / 小智工单 / 个册退费单 */
export function sameMarkLabel(mark: SameMark): string {
  if (mark === 'flash') return FLASH_BADGE_LABEL;
  if (mark === 'xiaozhi') return `${XIAOZHI_MARK_LABEL}工单`;
  return `${REFUND_MARK_LABEL}单`;
}

/** 该客户（按手机号）名下与本单同标识的单；号码为空时只计本单 */
export function sameMarkTickets(t: Ticket): Ticket[] {
  const mark = sameMarkOf(t);
  if (!mark) return [];
  const phone = (t.customerPhone ?? '').replace(/\D/g, '');
  if (!phone) return [t];
  return TICKETS.filter((x) => (x.customerPhone ?? '').replace(/\D/g, '') === phone && sameMarkOf(x) === mark);
}

/** 宫格点「同类单」后，「客户历史工单」Tab 落到同标识筛选（Tab 挂载 / 已挂载时读后即清） */
export const pendingSameMarkFilter = ref(false);
