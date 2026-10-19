import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { useUserStore } from '@/stores/user';

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

  function persist() {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(all.value));
    } catch {
      /* 配额超限等忽略 */
    }
  }

  /** 新增或更新本人的草稿（按 id）；归属账号取当前登录人 */
  function save(d: Omit<TicketDraft, 'owner'>) {
    const next: TicketDraft = { ...d, owner: owner.value };
    const i = all.value.findIndex((x) => x.id === d.id && x.owner === owner.value);
    if (i >= 0) all.value[i] = next;
    else all.value.unshift(next);
    persist();
  }

  function remove(id: string) {
    all.value = all.value.filter((x) => !(x.id === id && x.owner === owner.value));
    persist();
  }

  function get(id: string) {
    return drafts.value.find((x) => x.id === id) ?? null;
  }

  // 载入时若丢弃过旧版草稿，回写一次存储
  persist();

  return { drafts, save, remove, get };
});
