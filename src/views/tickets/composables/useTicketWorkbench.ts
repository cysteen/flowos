import { computed, ref } from 'vue';
import { TICKETS } from '@/mock/tickets';
import {
  matchChip,
  type ChipKey,
  type Priority,
  type SlaState,
  type TabKey,
  type Ticket,
} from '@/views/tickets/types/ticket';

const PRIORITY_RANK: Record<Priority, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };
const SLA_GROUP_RANK: Record<SlaState, number> = { overdue: 0, soon: 1, ok: 2, paused: 3 };

/** SLA 紧急度排序（PRD-02 §9）：已超时 > 距超时升序 > 优先级 P0→P3 */
function slaUrgencyCompare(a: Ticket, b: Ticket): number {
  const g = SLA_GROUP_RANK[a.slaState] - SLA_GROUP_RANK[b.slaState];
  if (g !== 0) return g;
  if (a.slaMinutes !== b.slaMinutes) return a.slaMinutes - b.slaMinutes;
  return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
}

export function useTicketWorkbench() {
  const all = ref<Ticket[]>([...TICKETS]);

  const activeTab = ref<TabKey>('mine');
  const activeChip = ref<ChipKey>('all');
  const searchText = ref('');
  const selectedIds = ref<Set<string>>(new Set());
  const aiBarVisible = ref(true);
  const sortByUrgency = ref(true);

  const current = ref(1);
  const pageSize = ref(10);

  // 当前 Tab 数据域
  const tabRows = computed(() => all.value.filter((t) => t.tab === activeTab.value));

  // 叠加 chip + 搜索
  const filtered = computed(() => {
    const kw = searchText.value.trim().toLowerCase();
    return tabRows.value.filter((t) => {
      if (!matchChip(t, activeChip.value)) return false;
      if (kw) {
        const hay = `${t.no} ${t.customer} ${t.title}`.toLowerCase();
        if (!hay.includes(kw)) return false;
      }
      return true;
    });
  });

  // 排序
  const sorted = computed(() => {
    const list = [...filtered.value];
    if (sortByUrgency.value) list.sort(slaUrgencyCompare);
    return list;
  });

  const total = computed(() => sorted.value.length);

  // 分页
  const paged = computed(() => {
    const start = (current.value - 1) * pageSize.value;
    return sorted.value.slice(start, start + pageSize.value);
  });

  // 各 Tab 计数
  const tabCounts = computed<Record<TabKey, number>>(() => {
    const map: Record<TabKey, number> = { mine: 0, team: 0, pool: 0, cc: 0, review: 0 };
    for (const t of all.value) map[t.tab]++;
    return map;
  });

  // 当前 Tab 下各 chip 计数
  const chipCounts = computed<Record<ChipKey, number>>(() => {
    const keys: ChipKey[] = ['all', 'pending', 'processing', 'held', 'review', 'soon', 'overdue'];
    const map = {} as Record<ChipKey, number>;
    for (const k of keys) map[k] = tabRows.value.filter((t) => matchChip(t, k)).length;
    return map;
  });

  const selectedCount = computed(() => selectedIds.value.size);
  const allPageSelected = computed(
    () => paged.value.length > 0 && paged.value.every((t) => selectedIds.value.has(t.id))
  );

  // ---- actions ----
  function setTab(tab: TabKey) {
    if (activeTab.value === tab) return;
    activeTab.value = tab;
    activeChip.value = 'all';
    current.value = 1;
  }
  function setChip(chip: ChipKey) {
    activeChip.value = chip;
    current.value = 1;
  }
  function setSearch(v: string) {
    searchText.value = v;
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
    all, activeTab, activeChip, searchText, selectedIds, aiBarVisible, sortByUrgency,
    current, pageSize,
    tabRows, filtered, sorted, paged, total, tabCounts, chipCounts,
    selectedCount, allPageSelected,
    setTab, setChip, setSearch, toggleSelect, toggleSelectAllOnPage, clearSelection,
    setPage, addTicket,
  };
}
