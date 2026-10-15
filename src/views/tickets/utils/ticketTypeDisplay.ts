import { TICKETS } from '@/mock/tickets';
import { FLASH_BADGE_LABEL, isFlashTicket } from '@/views/tickets/types/flash';
import { FLASH_MARK_COLOR } from '@/views/tickets/types/ticket';

/**
 * 界面上展示工单类型处的统一口径（1014）：刷机单一律显示「刷机单」（紫色），其余显示工单类型原值。
 * 只改显示，工单类型字段取值（咨询）与筛选逻辑不变。
 * 展示行不一定带刷机单标识（客户全景、关联单、客户历史工单、首页待办、指派弹窗等派生行），按单号回查工单库。
 */
type TypeItem = { type: string; no?: string; isFlash?: boolean };

export function isFlashTypeItem(x: TypeItem): boolean {
  if (isFlashTicket(x)) return true;
  return !!x.no && TICKETS.some((t) => t.no === x.no && isFlashTicket(t));
}

export function ticketTypeLabel(x: TypeItem): string {
  return isFlashTypeItem(x) ? FLASH_BADGE_LABEL : x.type;
}

/** 刷机单徽标色（与页头、列表行「刷机单」徽标一致） */
export const FLASH_BADGE_STYLE = { color: FLASH_MARK_COLOR, background: '#f5f3ff' } as const;
