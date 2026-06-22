import { defineStore } from 'pinia';
import { ref } from 'vue';

// 工单草稿（建单弹窗「存草稿」→ 工作台草稿箱 → 继续编辑/提交）。localStorage 持久化形成闭环。
const LS_KEY = 'flowos-ticket-drafts';

export interface TicketDraft {
  id: string;
  title: string;
  typeLabel: string;
  customerName: string;
  savedAt: string;
  form: Record<string, unknown>;
}

export const useTicketDraftStore = defineStore('ticketDrafts', () => {
  const drafts = ref<TicketDraft[]>([]);

  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) drafts.value = JSON.parse(raw) as TicketDraft[];
  } catch {
    /* ignore */
  }

  function persist() {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(drafts.value));
    } catch {
      /* 配额超限等忽略 */
    }
  }

  /** 新增或更新草稿（按 id） */
  function save(d: TicketDraft) {
    const i = drafts.value.findIndex((x) => x.id === d.id);
    if (i >= 0) drafts.value[i] = d;
    else drafts.value.unshift(d);
    persist();
  }

  function remove(id: string) {
    drafts.value = drafts.value.filter((x) => x.id !== id);
    persist();
  }

  function get(id: string) {
    return drafts.value.find((x) => x.id === id) ?? null;
  }

  return { drafts, save, remove, get };
});
