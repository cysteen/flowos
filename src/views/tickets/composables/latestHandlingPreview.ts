import { LIST_HANDLING_TRAIL } from '@/mock/ticketListHandlingTrail';
import { useFlashStore } from '@/stores/flash';
import { useHandleLogStore } from '@/stores/handleLog';
import { isFlashTicket, normalizeFlashResult } from '@/views/tickets/types/flash';
import type { Ticket } from '@/views/tickets/types/ticket';
import type { LatestHandlingItem } from '@/views/tickets/types/operation';
import {
  LATEST_HANDLING_ACTION,
  latestHandlingFrom,
  latestHandlingPreviewOf,
  latestWhenText,
  resolveLatestHandlingAction,
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

function sortHandlingNewestFirst(items: LatestHandlingItem[]): LatestHandlingItem[] {
  return [...items].sort((a, b) => latestWhenText(b.when).localeCompare(latestWhenText(a.when)));
}

function snapshotToList(
  snap: ReturnType<typeof latestHandlingFrom>,
): LatestHandlingItem[] {
  const items = [...snap.items];
  if (snap.flashRecord?.text) {
    const { who, role, when, text } = snap.flashRecord;
    items.push({ who, role, when, text, action: LATEST_HANDLING_ACTION.FLASH_RECORD });
  }
  return sortHandlingNewestFirst(items);
}

function syntheticTrail(t: Ticket): LatestHandlingItem[] {
  const text = t.latestHandling?.trim();
  if (!text) return [];
  const primary: LatestHandlingItem = {
    who: t.assignee?.trim() || '处理人',
    role: '二线专员',
    action: LATEST_HANDLING_ACTION.PROCESS,
    when: t.updatedAt || '',
    text,
    source: 'process',
  };
  const items = [primary];
  if (t.createdAt && t.problemDesc?.trim() && t.createdAt !== t.updatedAt) {
    items.push({
      who: '一线坐席',
      role: '一线坐席',
      action: LATEST_HANDLING_ACTION.REGISTER,
      when: t.createdAt,
      text: `登记问题：${t.problemDesc.trim()}`,
      source: 'process',
    });
  }
  return sortHandlingNewestFirst(items);
}

/**
 * 列表「摘要」悬停卡：与处理页「最新处理」卡同结构，可出 **多条** 处理轨迹。
 * 优先 localStorage 履历 → 原型种子多条 → 工单行摘要合成。
 */
export function useLatestHandlingList(): (t: Ticket) => LatestHandlingItem[] {
  const flash = useFlashStore();
  const handleLog = useHandleLogStore();
  const previewOne = useLatestHandlingPreview();

  return (t) => {
    if (isFlashTicket(t) && t.flash) {
      void flash.revisionOf(t.no);
      const st = t.flash.state;
      const snap = latestHandlingFrom(flash.timelineOf(t.no), {
        record: st.record,
        result: normalizeFlashResult(st.result),
        assignee: t.assignee,
      });
      const list = snapshotToList(snap);
      if (list.length) return list;
    }

    const logged = snapshotToList(latestHandlingFrom(handleLog.entriesOf(t.no)));
    if (logged.length) return logged;

    const seeded = LIST_HANDLING_TRAIL[t.no];
    if (seeded?.length) return sortHandlingNewestFirst(seeded);

    const one = previewOne(t);
    if (one) return syntheticTrail(t).length > 1 ? syntheticTrail(t) : [one];

    return syntheticTrail(t);
  };
}

/** 列表「最新」格仍只展示时间最近一条（正文用 action 语义拼一行） */
export function latestHandlingLineText(h: LatestHandlingItem): string {
  return `${resolveLatestHandlingAction(h)}：${h.text}`;
}
