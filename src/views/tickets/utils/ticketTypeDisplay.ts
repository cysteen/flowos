import { TICKETS } from '@/mock/tickets';
import { FLASH_BADGE_LABEL, isFlashTicket } from '@/views/tickets/types/flash';
import { FLASH_MARK_COLOR, XIAOZHI_MARK_COLOR } from '@/views/tickets/types/ticket';
import { XIAOZHI_MARK_LABEL, isXiaozhiTicket } from '@/views/tickets/types/xiaozhi';

/**
 * 界面上展示工单类型处的统一口径（1014 / 1130 一·补 B21）：
 * **刷机单显示「刷机单」、小智单显示「小智」，其余显示工单类型原值**。
 * 只改显示，工单类型字段取值（刷机单与小智单都是「咨询」）与筛选 / 查询 / 报表取数一概不变。
 *
 * 展示行不一定带标识字段（客户全景、关联单、客户历史工单、首页待办、指派弹窗、履历关联卡
 * 等派生行只有单号与类型名），故**按单号回查工单库**补判。
 */
type TypeItem = { type: string; no?: string; isFlash?: boolean; isXiaozhi?: boolean };

export function isFlashTypeItem(x: TypeItem): boolean {
  if (isFlashTicket(x)) return true;
  return !!x.no && TICKETS.some((t) => t.no === x.no && isFlashTicket(t));
}

/** 与 `isFlashTypeItem` 同形：先看行上的标识，没有再按单号回查工单库（1130 D1 工单维判据） */
export function isXiaozhiTypeItem(x: TypeItem): boolean {
  if (isXiaozhiTicket(x)) return true;
  return !!x.no && TICKETS.some((t) => t.no === x.no && isXiaozhiTicket(t));
}

/**
 * 三档互斥，与列表行内标（`TicketTitleCell.vue`）、详情页页头（`OpHeader.vue`）**同一套判法**。
 * 刷机在前只是沿用既有次序 —— 一张单不可能同时是刷机单与小智单（两个标识由各自建单入口写入）。
 */
export function ticketTypeLabel(x: TypeItem): string {
  if (isFlashTypeItem(x)) return FLASH_BADGE_LABEL;
  if (isXiaozhiTypeItem(x)) return XIAOZHI_MARK_LABEL;
  return x.type;
}

/** 刷机单徽标色（与页头、列表行「刷机单」徽标一致） */
export const FLASH_BADGE_STYLE = { color: FLASH_MARK_COLOR, background: '#f5f3ff' } as const;

/**
 * 小智单徽标色（与页头、列表行「小智」徽标一致，取 `XIAOZHI_MARK_COLOR`）。
 *
 * 各派生行的 `:style` 统一写成三元嵌套：
 * `isFlashTypeItem(t) ? FLASH_BADGE_STYLE : isXiaozhiTypeItem(t) ? XIAOZHI_BADGE_STYLE : <该行原默认>`
 * —— **`<该行原默认>` 各处不同，按原样保留，不要统一成一个值**
 * （有的取 `TYPE_TONE`、有的取行上的 `typeColor`/`typeBgColor`、有的是 `undefined`，
 * 指派弹窗那处是纯文本列、只给 `color` 不给底色）。
 */
export const XIAOZHI_BADGE_STYLE = { color: XIAOZHI_MARK_COLOR, background: '#f0fdfa' } as const;
