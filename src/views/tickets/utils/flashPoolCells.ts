import { useFlashConfigStore } from '@/stores/flashConfig';
import type { Ticket } from '@/views/tickets/types/ticket';

/**
 * 工作台两个刷机池的列取值（930 教育刷机单 §9.2 / §9.3）。
 * 刷机池页签与二线「工单池」共用，非刷机单一律「—」。
 */

/** 转人工原因：本单最近一次进池时写入的原因 */
export function flashHandoffCellText(t: Ticket): string {
  return t.flash?.state.handoffReason ?? '—';
}

/** 失败原因：「〈一级〉 · 〈二级〉」，显示文案按后台「刷机配置」；无失败原因时「—」 */
export function flashFailCellText(t: Ticket): string {
  const st = t.flash?.state;
  if (!st?.failL1) return '—';
  return useFlashConfigStore().failReasonText(st.failL1, st.failL2) || '—';
}
