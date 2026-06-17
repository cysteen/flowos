import { computed, reactive, ref } from 'vue';
import { TICKETS } from '@/mock/tickets';
import {
  inListView,
  type ListViewKey,
  type SlaState,
  type Ticket,
  type TicketType,
} from '@/views/tickets/types/ticket';

export interface ListFilters {
  keyword: string;
  type?: TicketType;
  status?: string;
  priority?: string;
  slaStatus?: SlaState | 'all';
  channel?: string;
  product: string;
  assignee?: string;
  dateRange: string;
}

function matchFilters(t: Ticket, f: ListFilters): boolean {
  if (f.keyword) {
    const kw = f.keyword.toLowerCase();
    const hay = `${t.no} ${t.title} ${t.customer}`.toLowerCase();
    if (!hay.includes(kw)) return false;
  }
  if (f.type && t.type !== f.type) return false;
  if (f.priority && t.priority !== f.priority) return false;
  if (f.channel && t.channel !== f.channel) return false;
  if (f.product && !t.product.includes(f.product)) return false;
  if (f.assignee === 'pool' && t.assignee !== null) return false;
  if (f.assignee && f.assignee !== 'pool' && t.assignee !== f.assignee) return false;
  if (f.slaStatus && f.slaStatus !== 'all' && t.slaState !== f.slaStatus) return false;
  if (f.status && f.status !== 'all') {
    const map: Record<string, string[]> = {
      pending: ['待受理'],
      processing: ['处理中·一线', '已升级·二线'],
      held: ['已挂起·待客户'],
      review: ['待审核'],
    };
    const allowed = map[f.status];
    if (allowed && !allowed.includes(t.nodeStatus)) return false;
  }
  return true;
}

/** 列表页默认按更新时间倒序（PRD-05 §9） */
function byUpdatedDesc(a: Ticket, b: Ticket): number {
  const ta = a.updatedAt ?? a.no;
  const tb = b.updatedAt ?? b.no;
  return tb.localeCompare(ta);
}

export function useTicketList() {
  const all = ref<Ticket[]>([...TICKETS]);

  const activeView = ref<ListViewKey>('all');
  const selectedIds = ref<Set<string>>(new Set());
  const current = ref(1);
  const pageSize = ref(10);

  const filters = reactive<ListFilters>({
    keyword: '',
    type: undefined,
    status: undefined,
    priority: undefined,
    slaStatus: undefined,
    channel: undefined,
    product: '',
    assignee: undefined,
    dateRange: '',
  });

  const viewRows = computed(() => all.value.filter((t) => inListView(t, activeView.value)));

  const filtered = computed(() => viewRows.value.filter((t) => matchFilters(t, filters)));

  const sorted = computed(() => [...filtered.value].sort(byUpdatedDesc));

  const total = computed(() => sorted.value.length);

  const paged = computed(() => {
    const start = (current.value - 1) * pageSize.value;
    return sorted.value.slice(start, start + pageSize.value);
  });

  const viewCounts = computed<Record<ListViewKey, number>>(() => {
    const keys: ListViewKey[] = ['all', 'mine', 'team', 'pool', 'archived'];
    const map = {} as Record<ListViewKey, number>;
    for (const k of keys) map[k] = all.value.filter((t) => inListView(t, k)).length;
    return map;
  });

  const selectedCount = computed(() => selectedIds.value.size);
  const allPageSelected = computed(
    () => paged.value.length > 0 && paged.value.every((t) => selectedIds.value.has(t.id)),
  );

  function setView(view: ListViewKey) {
    activeView.value = view;
    current.value = 1;
  }

  function applyFilters() {
    current.value = 1;
  }

  function resetFilters() {
    filters.keyword = '';
    filters.type = undefined;
    filters.status = undefined;
    filters.priority = undefined;
    filters.slaStatus = undefined;
    filters.channel = undefined;
    filters.product = '';
    filters.assignee = undefined;
    filters.dateRange = '';
    current.value = 1;
  }

  function toggleSelect(id: string) {
    const next = new Set(selectedIds.value);
    next.has(id) ? next.delete(id) : next.add(id);
    selectedIds.value = next;
  }

  function toggleSelectAllOnPage() {
    const next = new Set(selectedIds.value);
    if (allPageSelected.value) paged.value.forEach((t) => next.delete(t.id));
    else paged.value.forEach((t) => next.add(t.id));
    selectedIds.value = next;
  }

  function clearSelection() {
    selectedIds.value = new Set();
  }

  function setPage(page: number, size: number) {
    current.value = page;
    pageSize.value = size;
  }

  function addTicket(t: Ticket) {
    all.value = [t, ...all.value];
  }

  return {
    all,
    activeView,
    filters,
    selectedIds,
    current,
    pageSize,
    viewRows,
    filtered,
    sorted,
    paged,
    total,
    viewCounts,
    selectedCount,
    allPageSelected,
    setView,
    applyFilters,
    resetFilters,
    toggleSelect,
    toggleSelectAllOnPage,
    clearSelection,
    setPage,
    addTicket,
  };
}
