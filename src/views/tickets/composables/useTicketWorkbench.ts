import { computed, ref } from 'vue';
import { buildAiSuggestions } from '@/mock/aiSuggestions';
import { TICKETS } from '@/mock/tickets';
import { useTicketDraftStore } from '@/stores/ticketDrafts';
import type { AiSuggestionSummary } from '@/views/tickets/types/aiSuggestion';
import {
  compareByMineSort,
  DEFAULT_DONE_QUERY,
  EMPTY_MINE_QUERY,
  matchMineQuery,
  type MineQueryFilter,
  type MineSortRule,
} from '@/views/tickets/types/mineQuery';
import {
  matchChip,
  chipsForTab,
  inDoneScope,
  inGroupPoolScope,
  inMentionScope,
  inMineTaskScope,
  isMentionUnread,
  POOL_GROUPS,
  WORKBENCH_HANDLER,
  type ChipKey,
  type Priority,
  type SlaState,
  type TabKey,
  type Ticket,
} from '@/views/tickets/types/ticket';

const PRIORITY_RANK: Record<Priority, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };
const SLA_GROUP_RANK: Record<SlaState, number> = { overdue: 0, soon: 1, ok: 2, paused: 3 };

const VISIBLE_POOL_GROUPS = POOL_GROUPS.map((g) => g.id);

/** SLA 紧急度排序（PRD-02 §9）：已超时 > 距超时升序 > 优先级 P0→P3 */
function slaUrgencyCompare(a: Ticket, b: Ticket): number {
  const g = SLA_GROUP_RANK[a.slaState] - SLA_GROUP_RANK[b.slaState];
  if (g !== 0) return g;
  if (a.slaMinutes !== b.slaMinutes) return a.slaMinutes - b.slaMinutes;
  return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
}

export function useTicketWorkbench() {
  const all = ref<Ticket[]>([...TICKETS]);
  const draftStore = useTicketDraftStore();

  const activeTab = ref<TabKey>('mine');
  const activeChip = ref<ChipKey>('all');
  const searchText = ref('');
  const mineQuery = ref<MineQueryFilter>(EMPTY_MINE_QUERY());
  const doneQuery = ref<MineQueryFilter>(DEFAULT_DONE_QUERY());
  const poolQuery = ref<MineQueryFilter>(EMPTY_MINE_QUERY());
  const ccQuery = ref<MineQueryFilter>(EMPTY_MINE_QUERY());
  const mineSortRule = ref<MineSortRule>('sla_urgency');
  const selectedIds = ref<Set<string>>(new Set());
  const aiBarVisible = ref(true);
  const dismissedAiIds = ref<Set<string>>(new Set());

  const current = ref(1);
  const pageSize = ref(10);

  const poolGroups = POOL_GROUPS;

  // 当前 Tab 数据域
  const tabRows = computed(() => {
    if (activeTab.value === 'mine') {
      return all.value.filter((t) => inMineTaskScope(t, WORKBENCH_HANDLER));
    }
    if (activeTab.value === 'done') {
      return all.value.filter((t) => inDoneScope(t, WORKBENCH_HANDLER));
    }
    if (activeTab.value === 'pool') {
      return all.value.filter((t) => inGroupPoolScope(t, VISIBLE_POOL_GROUPS));
    }
    if (activeTab.value === 'cc') {
      return all.value.filter((t) => inMentionScope(t));
    }
    return all.value.filter((t) => t.tab === activeTab.value);
  });

  // 叠加 chip / 分组 + 搜索
  const filtered = computed(() => {
    const kw = searchText.value.trim().toLowerCase();
    return tabRows.value.filter((t) => {
      if (activeTab.value !== 'pool' && !matchChip(t, activeChip.value, activeTab.value)) {
        return false;
      }
      if (activeTab.value === 'mine') {
        if (!matchMineQuery(t, mineQuery.value)) return false;
      } else if (activeTab.value === 'done') {
        if (!matchMineQuery(t, doneQuery.value)) return false;
      } else if (activeTab.value === 'pool') {
        if (!matchMineQuery(t, poolQuery.value)) return false;
      } else if (activeTab.value === 'cc') {
        if (!matchMineQuery(t, ccQuery.value)) return false;
      } else if (kw) {
        const hay = `${t.no} ${t.customer} ${t.title}`.toLowerCase();
        if (!hay.includes(kw)) return false;
      }
      return true;
    });
  });

  // 排序
  const sorted = computed(() => {
    const list = [...filtered.value];
    if (activeTab.value === 'mine') {
      if (mineSortRule.value === 'sla_urgency') {
        list.sort(slaUrgencyCompare);
      } else {
        list.sort((a, b) => compareByMineSort(a, b, mineSortRule.value));
      }
    } else {
      list.sort(slaUrgencyCompare);
    }
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
    const map: Record<TabKey, number> = { mine: 0, done: 0, pool: 0, cc: 0, review: 0 };
    for (const t of all.value) {
      if (t.tab === 'mine') {
        if (inMineTaskScope(t, WORKBENCH_HANDLER)) map.mine++;
      } else if (t.tab === 'done') {
        if (inDoneScope(t, WORKBENCH_HANDLER)) map.done++;
      } else if (t.tab === 'pool') {
        if (inGroupPoolScope(t, VISIBLE_POOL_GROUPS)) map.pool++;
      } else if (t.tab === 'cc') {
        if (inMentionScope(t)) map.cc++;
      } else {
        map[t.tab]++;
      }
    }
    return map;
  });

  const activeChips = computed(() => chipsForTab(activeTab.value));

  const mentionUnreadCounts = computed(() => {
    const rows = all.value.filter((t) => inMentionScope(t));
    return rows.filter((t) => isMentionUnread(t)).length;
  });

  const tabUnreadCounts = computed<Partial<Record<TabKey, number>>>(() => ({
    cc: mentionUnreadCounts.value,
  }));

  // 当前 Tab 下各 chip 计数
  const chipCounts = computed<Record<string, number>>(() => {
    const map: Record<string, number> = {};
    for (const chip of activeChips.value) {
      map[chip.key] = tabRows.value.filter((t) => matchChip(t, chip.key, activeTab.value)).length;
    }
    if (activeTab.value === 'review') {
      map.draft = draftStore.drafts.length;
    }
    return map;
  });

  /** 草稿列表（草稿 chip 选中时由工作台渲染） */
  const drafts = computed(() => draftStore.drafts);

  const selectedCount = computed(() => selectedIds.value.size);
  const allPageSelected = computed(
    () => paged.value.length > 0 && paged.value.every((t) => selectedIds.value.has(t.id))
  );

  // AI 建议（PRD-02 §7②：扫描我的在处理单）
  const aiSuggestions = computed(() =>
    buildAiSuggestions(all.value).filter((s) => !dismissedAiIds.value.has(s.id)),
  );
  const aiSummary = computed<AiSuggestionSummary>(() => ({
    upgrade: aiSuggestions.value.filter((s) => s.kind === 'upgrade').length,
    similar: aiSuggestions.value.filter((s) => s.kind === 'similar').length,
    emotion: aiSuggestions.value.filter((s) => s.kind === 'emotion').length,
    total: aiSuggestions.value.length,
  }));
  const showAiBarForTab = computed(() => activeTab.value === 'mine');
  const showAiBar = computed(
    () => showAiBarForTab.value && aiBarVisible.value && aiSummary.value.total > 0,
  );

  const isDraftView = computed(
    () => activeTab.value === 'review' && activeChip.value === 'draft',
  );
  const showAppointmentColumn = computed(
    () => activeTab.value === 'mine' && activeChip.value === 'appointment',
  );
  const isMineTab = computed(() => activeTab.value === 'mine');
  const isDoneTab = computed(() => activeTab.value === 'done');
  const isPoolTab = computed(() => activeTab.value === 'pool');
  const isMentionTab = computed(() => activeTab.value === 'cc');
  /** 主作业 Tab：结构化筛选（无 chips 行时间窗/搜索框） */
  const usesStructuredFilter = computed(
    () =>
      activeTab.value === 'mine'
      || activeTab.value === 'done'
      || activeTab.value === 'pool'
      || activeTab.value === 'cc',
  );
  const structuredQuery = computed(() => {
    if (activeTab.value === 'done') return doneQuery.value;
    if (activeTab.value === 'pool') return poolQuery.value;
    if (activeTab.value === 'cc') return ccQuery.value;
    return mineQuery.value;
  });

  // ---- actions ----
  function setTab(tab: TabKey) {
    if (activeTab.value === tab) return;
    activeTab.value = tab;
    activeChip.value = 'all';
    current.value = 1;
    selectedIds.value = new Set();
  }
  function setChip(chip: ChipKey) {
    activeChip.value = chip;
    current.value = 1;
  }
  function setMineQuery(q: MineQueryFilter) {
    mineQuery.value = q;
    current.value = 1;
  }
  function setDoneQuery(q: MineQueryFilter) {
    doneQuery.value = q;
    current.value = 1;
  }
  function setStructuredQuery(q: MineQueryFilter) {
    if (activeTab.value === 'done') doneQuery.value = q;
    else if (activeTab.value === 'pool') poolQuery.value = q;
    else if (activeTab.value === 'cc') ccQuery.value = q;
    else mineQuery.value = q;
    current.value = 1;
  }
  function applyMineQuery() {
    current.value = 1;
  }
  function applyStructuredQuery() {
    current.value = 1;
  }
  function setMineSortRule(rule: MineSortRule) {
    mineSortRule.value = rule;
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
  /** 领取本组工单池中的工单 → 转入我的任务 */
  function claimTicket(id: string): boolean {
    const t = all.value.find((x) => x.id === id);
    if (!t || t.tab !== 'pool' || t.assignee !== null) return false;
    t.tab = 'mine';
    t.assignee = WORKBENCH_HANDLER;
    t.responded = false;
    return true;
  }
  /** 批量领取工单池工单，返回成功/失败数量 */
  function claimTickets(ids: Iterable<string>): { claimed: number; failed: number } {
    let claimed = 0;
    let failed = 0;
    for (const id of ids) {
      if (claimTicket(id)) claimed++;
      else failed++;
    }
    return { claimed, failed };
  }
  function acknowledgeMention(id: string) {
    const t = all.value.find((x) => x.id === id);
    if (t && t.tab === 'cc') t.mentionUnread = false;
  }
  function dismissAiSuggestion(id: string) {
    dismissedAiIds.value = new Set([...dismissedAiIds.value, id]);
  }
  function ticketById(id: string): Ticket | undefined {
    return all.value.find((t) => t.id === id);
  }

  return {
    all, activeTab, activeChip, activeChips, poolGroups,
    searchText, mineQuery, doneQuery, poolQuery, ccQuery, structuredQuery, mineSortRule, selectedIds, aiBarVisible,
    current, pageSize,
    tabRows, filtered, sorted, paged, total, tabCounts, tabUnreadCounts, chipCounts, drafts,
    selectedCount, allPageSelected, aiSuggestions, aiSummary, showAiBar,
    isDraftView, showAppointmentColumn, isMineTab, isDoneTab, isPoolTab, isMentionTab, usesStructuredFilter,
    setTab, setChip, setMineQuery, setDoneQuery, setStructuredQuery, applyMineQuery, applyStructuredQuery, setMineSortRule, setSearch, toggleSelect, toggleSelectAllOnPage, clearSelection,
    setPage, addTicket, claimTicket, claimTickets, acknowledgeMention, dismissAiSuggestion, ticketById,
    removeDraft: (id: string) => draftStore.remove(id),
  };
}
