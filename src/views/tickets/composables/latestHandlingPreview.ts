import { LIST_PROCESS_RESULT_TEXT } from '@/mock/ticketListHandlingTrail';
import { useFlashStore } from '@/stores/flash';
import { useHandleLogStore } from '@/stores/handleLog';
import { isFlashTicket, normalizeFlashResult } from '@/views/tickets/types/flash';
import type { Ticket } from '@/views/tickets/types/ticket';
import type { TimelineEntry } from '@/views/tickets/types/ticketDetail';
import type { LatestHandlingItem } from '@/views/tickets/types/operation';
import {
  latestHandlingFrom,
  latestHandlingPreviewOf,
  resolveLatestHandlingAction,
  ticketLatestHandlingPreview,
} from '@/views/tickets/utils/ticketOverview';

const PROCESS_RESULT_FIELD = '处理结果';

/** 从保存履历中取最近一次「处理结果」字段的全文（与处理表单多行域一致） */
function processResultTextFromTimeline(entries: TimelineEntry[]): string {
  for (let i = entries.length - 1; i >= 0; i--) {
    const hit = entries[i].changes?.find((c) => c.field === PROCESS_RESULT_FIELD && c.to);
    if (hit?.to) return String(hit.to).trim();
  }
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i];
    if (e.category === 'handle' && e.text?.trim()) return e.text.trim();
  }
  return '';
}

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

/**
 * 悬停卡「处理结果」：展示处理页「处理结果」多行文本的**整段**正文（含内置时间戳行）。
 */
export function useSummaryProcessResultText(): (t: Ticket) => string {
  const flash = useFlashStore();
  const handleLog = useHandleLogStore();
  const latestPreview = useLatestHandlingPreview();

  return (t) => {
    const seeded = LIST_PROCESS_RESULT_TEXT[t.no]?.trim();
    if (seeded) return seeded;

    const fromLog = processResultTextFromTimeline(handleLog.entriesOf(t.no));
    if (fromLog) return fromLog;

    if (isFlashTicket(t) && t.flash) {
      void flash.revisionOf(t.no);
      const record = t.flash.state.record?.trim();
      if (record) return record;
    }

    const body = t.latestHandling?.trim();
    if (body) return body;

    return latestPreview(t)?.text?.trim() || '';
  };
}

/** 列表「最新」格仍只展示时间最近一条（正文用 action 语义拼一行） */
export function latestHandlingLineText(h: LatestHandlingItem): string {
  return `${resolveLatestHandlingAction(h)}：${h.text}`;
}
