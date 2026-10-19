import { useFlashStore } from '@/stores/flash';
import { isFlashTicket, normalizeFlashResult } from '@/views/tickets/types/flash';
import type { Ticket } from '@/views/tickets/types/ticket';
import type { LatestHandlingItem } from '@/views/tickets/types/operation';
import {
  latestHandlingFrom,
  latestHandlingPreviewOf,
  ticketLatestHandlingPreview,
} from '@/views/tickets/utils/ticketOverview';

/**
 * 列表「最新」格与悬停摘要的取数（D4）：与处理页「最新处理」卡同一个函数 `latestHandlingFrom`。
 * 刷机单按刷机履历与刷机字段组现值现算（系统写入、升级二线、重推等不经保存的记录同样取得到）；
 * 老四类仍读工单行摘要（处理页保存时按同一份取数回写）。
 */
export function useLatestHandlingPreview(): (t: Ticket) => LatestHandlingItem | null {
  const flash = useFlashStore();
  return (t) => {
    if (isFlashTicket(t) && t.flash) {
      // 读修订号：刷机服务写回后列表跟着刷新
      void flash.revisionOf(t.no);
      const st = t.flash.state;
      return latestHandlingPreviewOf(latestHandlingFrom(
        flash.timelineOf(t.no),
        { record: st.record, result: normalizeFlashResult(st.result), assignee: t.assignee },
      ));
    }
    return ticketLatestHandlingPreview(t);
  };
}
