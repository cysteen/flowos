import { computed, ref, watch } from 'vue';
import { defineStore } from 'pinia';
import { useUserStore } from './user';
import { creationReceipt } from './creationLedger';
import { useTicketDraftStore } from './ticketDrafts';
import { copy, CREATE_WORK_LABELS, workInput, type CreateWorkContext, type CreateWorkItem } from '@/views/tickets/types/createWork';

const KEY = 'flowos-create-work-items-v1';
export const useCreateWorkItemsStore = defineStore('createWorkItems', () => {
  const user = useUserStore();
  const drafts = useTicketDraftStore();
  const owner = computed(() => user.account || `role:${user.roleKey}`);
  const all = ref<CreateWorkItem[]>([]);
  const storageError = ref('');
  try { all.value = JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { /* editable empty collection */ }
  all.value.forEach((item) => { if (item.status === 'submitting') item.status = 'unknown'; });
  const items = computed(() => all.value.filter((item) => item.owner === owner.value));
  function persist() {
    try { localStorage.setItem(KEY, JSON.stringify(all.value)); storageError.value = ''; return true; }
    catch { storageError.value = '办理内容未能保存，请保留页面并重试暂存。'; return false; }
  }
  watch(all, persist, { deep: true, flush: 'post' });
  function get(id: string) { return items.value.find((item) => item.id === id); }
  function open(context: CreateWorkContext, draftId?: string) {
    const draft = draftId ? drafts.get(draftId) : null;
    const effective = draft?.context ?? context;
    const actionIdentity = `${effective.action}:${effective.source?.no || effective.scene}`;
    const identity = effective.source ? actionIdentity : draftId ? `draft:${draftId}` : actionIdentity;
    const existing = items.value.find((item) => item.status !== 'complete' && ((draftId && item.draftId === draftId) || item.identity === identity || (effective.source && item.context.source?.no === effective.source.no && item.context.action === effective.action)));
    if (existing) { if (!existing.draftId && draftId) existing.draftId = draftId; return existing; }
    const item: CreateWorkItem = {
      id: draft?.workId || `cw-${crypto.randomUUID()}`, owner: owner.value, identity,
      context: copy(draft?.context ?? context), draftId,
      form: draft ? copy(draft.form) : undefined,
      aftersaleForm: draft?.aftersaleForm ? copy(draft.aftersaleForm) : undefined,
      aftersaleOpen: (draft ? draft.surface === 'aftersale' : context.action === 'aftersale'),
      surface: draft?.surface ?? (context.action === 'aftersale' ? 'aftersale' : 'ticket'),
      savedInput: '', status: draft?.workStatus === 'unknown' ? 'unknown' : 'editing', resultNo: draft?.resultNo,
    };
    if (draft) item.savedInput = workInput(item);
    all.value.push(item);
    persist();
    return get(item.id)!;
  }
  function dirty(item: CreateWorkItem) { return item.status !== 'complete' && workInput(item) !== item.savedInput; }
  function save(item: CreateWorkItem) {
    const id = item.draftId || `draft-${crypto.randomUUID()}`;
    const f = item.form ?? {};
    const sale = item.surface === 'aftersale' ? item.aftersaleForm : undefined;
    const ok = drafts.save({
      id, title: String(f.title || sale?.fault || CREATE_WORK_LABELS[item.context.action]),
      typeLabel: sale ? '售后工单' : String(f.ticketType || CREATE_WORK_LABELS[item.context.action]),
      customerName: String((f.customer as { name?: string } | undefined)?.name || sale?.customerName || ''),
      savedAt: new Date().toLocaleString('zh-CN', { hour12: false }),
      workId: item.id, workStatus: item.status, resultNo: item.resultNo, surface: item.surface,
      form: copy(f), context: copy(item.context), aftersaleForm: item.aftersaleForm ? copy(item.aftersaleForm) : undefined,
      xiaozhiScene: item.context.scene === 'xiaozhi',
    });
    if (!ok) { item.error = '草稿保存失败，已保留全部输入，请重试。'; return false; }
    item.draftId = id;
    item.savedInput = workInput(item);
    item.error = undefined;
    return true;
  }
  function remove(id: string) {
    const item = get(id);
    const receipt = creationReceipt(id);
    if (item && receipt?.kind === 'aftersale' && receipt.phase === 'created') { save(item); return false; }
    all.value = all.value.filter((item) => item.id !== id || item.owner !== owner.value);
    return true;
  }
  function complete(item: CreateWorkItem, no: string) {
    item.resultNo = no; item.status = 'complete'; item.savedInput = workInput(item);
    if (item.draftId && !drafts.remove(item.draftId)) item.error = '工单已建成，草稿清理失败，请勿再次提交。';
  }
  return { items, get, open, dirty, save, remove, complete, storageError, flush: persist };
});
