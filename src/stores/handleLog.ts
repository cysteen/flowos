import { defineStore } from 'pinia';
import { ref, watch } from 'vue';
import type { TimelineEntry } from '@/views/tickets/types/ticketDetail';

/**
 * 处理表单保存落下的「工单处理」类履历（含终态「结案后补充」），按工单号归档。
 *
 * 处理页的履历由种子现拼，刷新即回到种子；保存产生的这一类条目是坐席真实写下的处理结果，
 * 速览带「最新处理」取的就是它们的处理人与时间，故单独落一份 localStorage，载入详情时并回本单履历。
 * 刷机单不走这里，写进刷机 store 自己的履历（`stores/flash.ts` 的 `logProcess`）。
 *
 * 保质期与 `stores/derivedTickets.ts` 一致（12 小时）。
 */
const LS_KEY = 'flowos-handle-log';
const STALE_MS = 12 * 60 * 60 * 1000;

export const useHandleLogStore = defineStore('handleLog', () => {
  const entries = ref<Record<string, TimelineEntry[]>>({});

  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as { entries?: Record<string, TimelineEntry[]>; savedAt?: number };
      const fresh = typeof saved?.savedAt === 'number' && Date.now() - saved.savedAt < STALE_MS;
      if (fresh && saved.entries && typeof saved.entries === 'object') entries.value = saved.entries;
      else localStorage.removeItem(LS_KEY);
    }
  } catch {
    /* 坏缓存从空开始 */
  }

  watch(
    entries,
    () => {
      try {
        localStorage.setItem(LS_KEY, JSON.stringify({ entries: entries.value, savedAt: Date.now() }));
      } catch {
        /* 配额超限等忽略 */
      }
    },
    { deep: true },
  );

  function entriesOf(no: string): TimelineEntry[] {
    return entries.value[no] ?? [];
  }

  function append(no: string, entry: TimelineEntry) {
    entries.value = { ...entries.value, [no]: [...entriesOf(no), JSON.parse(JSON.stringify(entry)) as TimelineEntry] };
  }

  return { entriesOf, append };
});
