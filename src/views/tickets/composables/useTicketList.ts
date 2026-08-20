import { computed, reactive, ref } from 'vue';
import { TICKETS } from '@/mock/tickets';
import type { Ticket } from '@/views/tickets/types/ticket';
import {
  EMPTY_LIST_FILTERS,
  matchListQuery,
  type ListFilters,
} from '@/views/tickets/types/listQueryFilters';

export type { ListFilters } from '@/views/tickets/types/listQueryFilters';

/** 列表页默认按更新时间倒序（PRD-05 §9） */
function byUpdatedDesc(a: Ticket, b: Ticket): number {
  const ta = a.updatedAt ?? a.no;
  const tb = b.updatedAt ?? b.no;
  return tb.localeCompare(ta);
}

export function useTicketList() {
  const all = ref<Ticket[]>([...TICKETS]);

  const selectedIds = ref<Set<string>>(new Set());
  const current = ref(1);
  const pageSize = ref(10);

  const filters = reactive<ListFilters>(EMPTY_LIST_FILTERS());

  /** 全量库默认不含已归档；归档态通过后续筛选扩展 */
  const baseRows = computed(() => all.value.filter((t) => !t.archived));

  const filtered = computed(() => baseRows.value.filter((t) => matchListQuery(t, filters)));

  const sorted = computed(() => [...filtered.value].sort(byUpdatedDesc));

  const total = computed(() => sorted.value.length);

  const paged = computed(() => {
    const start = (current.value - 1) * pageSize.value;
    return sorted.value.slice(start, start + pageSize.value);
  });

  const selectedCount = computed(() => selectedIds.value.size);
  const allPageSelected = computed(
    () => paged.value.length > 0 && paged.value.every((t) => selectedIds.value.has(t.id)),
  );

  function applyFilters() {
    current.value = 1;
  }

  function resetFilters() {
    Object.assign(filters, EMPTY_LIST_FILTERS());
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
    filters,
    selectedIds,
    current,
    pageSize,
    filtered,
    sorted,
    paged,
    total,
    selectedCount,
    allPageSelected,
    applyFilters,
    resetFilters,
    toggleSelect,
    toggleSelectAllOnPage,
    clearSelection,
    setPage,
    addTicket,
  };
}
