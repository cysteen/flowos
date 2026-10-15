import { TICKETS } from '@/mock/tickets';
import { FLASH_BADGE_LABEL, isFlashTicket } from '@/views/tickets/types/flash';
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

/**
 * 🔴 **本文件只管文案，不再导出任何徽标配色**（1015 B25）。
 *
 * 曾经这里有 `FLASH_BADGE_STYLE`（紫）与 `XIAOZHI_BADGE_STYLE`（青绿），各派生行的 `:style`
 * 写成三元嵌套按类型分色 —— 于是同一列里「刷机单」紫底、「小智」青绿底、「投诉」默认底。
 * 现**工单类型标一律用该行原有的默认样式**，两个常量已删、九处 `:style` 已收回各自的默认值。
 * ⚠️ 要再给某类工单单配颜色前先回看这条：差别应当只体现在**文案**上。
 */
