import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { creationReceipt } from './creationLedger';
import { useUserStore } from '@/stores/user';
import type { CreateWorkContext } from '@/views/tickets/types/createWork';

// 工单草稿（建单弹窗「存草稿」→ 工作台草稿箱 → 继续编辑/提交）。localStorage 持久化形成闭环。
const LS_KEY = 'flowos-ticket-drafts';

export interface TicketDraft {
  id: string;
  /** 存草稿的登录账号。草稿属建单人本人，草稿箱只列本人的（N-01） */
  owner: string;
  title: string;
  typeLabel: string;
  customerName: string;
  savedAt: string;
  form: Record<string, unknown>;
  /** 从小智入口存的草稿：继续编辑时仍是小智表单。此前存的草稿没有这一项，按普通草稿恢复 */
  xiaozhiScene?: boolean;
  workId?: string;
  workStatus?: 'editing' | 'submitting' | 'unknown' | 'complete';
  resultNo?: string;
  surface?: 'ticket' | 'aftersale';
  context?: CreateWorkContext;
  aftersaleForm?: Record<string, unknown>;
}

export function isPendingAftersaleDraft(d: TicketDraft) {
  const receipt = d.workId ? creationReceipt(d.workId) : undefined;
  if (receipt?.phase === 'complete') return false;
  return (receipt?.kind === 'aftersale' && receipt.phase === 'created') || (d.surface === 'aftersale' && !!d.resultNo && d.workStatus !== 'complete');
}

export const useTicketDraftStore = defineStore('ticketDrafts', () => {
  const user = useUserStore();
  /** 全部账号的草稿（存储层）；界面只读 `drafts`（本人的） */
  const all = ref<TicketDraft[]>([]);

  try {
    const raw = localStorage.getItem(LS_KEY);
    // 旧版草稿没有归属账号、认不出是谁存的：载入时丢弃，不给任何账号看到
    if (raw) all.value = (JSON.parse(raw) as TicketDraft[]).filter((d) => !!d.owner);
  } catch {
    /* ignore */
  }

  /** 当前登录账号；未登录的演示态回落到角色，避免与真实账号的草稿混在一起 */
  const owner = computed(() => user.account || `role:${user.roleKey}`);
  const drafts = computed(() => all.value.filter((d) => d.owner === owner.value));

  function persist(next = all.value) {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(next));
      return true;
    } catch {
      return false;
    }
  }

  /** 新增或更新本人的草稿（按 id）；归属账号取当前登录人 */
  function save(d: Omit<TicketDraft, 'owner'>) {
    const next: TicketDraft = { ...d, owner: owner.value };
    const rows = [...all.value];
    const i = rows.findIndex((x) => x.id === d.id && x.owner === owner.value);
    if (i >= 0) rows[i] = next;
    else rows.unshift(next);
    if (!persist(rows)) return false;
    all.value = rows;
    return true;
  }

  function remove(id: string) {
    const draft = get(id);
    if (draft && isPendingAftersaleDraft(draft)) return false;
    const rows = all.value.filter((x) => !(x.id === id && x.owner === owner.value));
    if (!persist(rows)) return false;
    all.value = rows;
    return true;
  }

  function get(id: string) {
    return drafts.value.find((x) => x.id === id) ?? null;
  }

  // 载入时若丢弃过旧版草稿，回写一次存储
  persist();

  return { drafts, save, remove, get };
});
