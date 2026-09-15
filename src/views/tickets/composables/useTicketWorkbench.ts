import { computed, ref } from 'vue';
import { buildAiSuggestions } from '@/mock/aiSuggestions';
import { TICKETS } from '@/mock/tickets';
import { useUserStore } from '@/stores/user';
import { useFlashStore } from '@/stores/flash';
import type { FlashActor } from '@/views/tickets/types/flash';
import { mapUserRole } from '@/views/tickets/composables/opActions';
import { useTicketDraftStore } from '@/stores/ticketDrafts';
import { useSavedFilters } from '@/views/tickets/composables/useSavedFilters';
import type { AiSuggestionSummary } from '@/views/tickets/types/aiSuggestion';
import {
  isSavedFilterChipKey,
  parseSavedFilterChipKey,
  savedFilterChipKey,
  type SavedFilterTab,
} from '@/views/tickets/types/savedFilters';
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
  currentHandlerName,
  inDoneScope,
  inFlashL1PoolScope,
  inFlashMineScope,
  inGroupPoolScope,
  inPoolPendingScope,
  inMineTaskScope,
  isWorkbenchSearchTab,
  poolGroupIdsForTicket,
  slaUrgencyCompare,
  visiblePoolGroupsFor,
  WORKBENCH_HANDLER,
  type ChipKey,
  type TabKey,
  type Ticket,
} from '@/views/tickets/types/ticket';

function savedFilterTab(tab: TabKey): SavedFilterTab | null {
  if (tab === 'mine' || tab === 'done' || tab === 'pool') return tab;
  return null;
}

export function useTicketWorkbench() {
  const all = ref<Ticket[]>([...TICKETS]);
  const draftStore = useTicketDraftStore();
  const savedFilters = useSavedFilters();

  const activeTab = ref<TabKey>('mine');
  const activeChip = ref<ChipKey | string>('all');
  const searchText = ref('');
  const mineQuery = ref<MineQueryFilter>(EMPTY_MINE_QUERY());
  const doneQuery = ref<MineQueryFilter>(DEFAULT_DONE_QUERY());
  const poolQuery = ref<MineQueryFilter>(EMPTY_MINE_QUERY());
  const mineSortRule = ref<MineSortRule>('sla_urgency');
  const selectedIds = ref<Set<string>>(new Set());
  const aiBarVisible = ref(true);
  const dismissedAiIds = ref<Set<string>>(new Set());

  const user = useUserStore();
  const flash = useFlashStore();

  /**
   * 工单池 / 催补待回的可见分组按角色取（930 教育刷机单 M72）：
   * 老四类的分组维持演示态全给；教育刷机处理组只给二线专员 / 二线班组长 / 管理员；
   * 一线刷机池的单不进这两个页签（见 `poolGroupIdsForTicket`）。
   */
  const poolGroups = computed(() => visiblePoolGroupsFor(user.roleKey));
  const visiblePoolGroupIds = computed(() => poolGroups.value.map((g) => g.id));
  /** 当前登录人在工单数据源里的处理人名（刷机单按它判本人已领 / 本人建） */
  const flashHandler = computed(() => currentHandlerName(user.roleKey, user.name));

  function inPoolTabScope(t: Ticket): boolean {
    return inGroupPoolScope(t, poolGroupIdsForTicket(t, visiblePoolGroupIds.value));
  }
  function inPoolPendingTabScope(t: Ticket): boolean {
    return inPoolPendingScope(t, poolGroupIdsForTicket(t, visiblePoolGroupIds.value));
  }
  /**
   * 我的任务数据域。老四类照旧按 `WORKBENCH_HANDLER`；
   * 一线坐席 / 二线专员的刷机单按本人已领 + 本人建取（§9.4 / M71），其余角色的刷机单沿用老口径。
   */
  function inMineTabScope(t: Ticket): boolean {
    if (t.type === '刷机' && (user.roleKey === 'agent-l1' || user.roleKey === 'agent-l2')) {
      return inFlashMineScope(t, user.roleKey, flashHandler.value, flash.creatorNameOf(t.no));
    }
    // 其余角色的刷机单只按「处理人为本人」取，不沿用老四类的演示处理人（技术支持不涉及刷机单，§9.4 / R113）
    if (t.type === '刷机') return inFlashMineScope(t, user.roleKey, flashHandler.value);
    return inMineTaskScope(t, WORKBENCH_HANDLER);
  }

  /** 一线坐席「刷机池」：一线刷机池未认领的刷机单，按进池时间正序（§9.2） */
  const flashPoolRows = computed(() =>
    all.value
      .filter(inFlashL1PoolScope)
      .map((t) => ({ t, at: flash.poolEnteredAtOf(t.no) }))
      .sort((a, b) => a.at.localeCompare(b.at))
      .map((x) => x.t),
  );

  // 当前 Tab 数据域
  const tabRows = computed(() => {
    if (activeTab.value === 'mine') {
      return all.value.filter(inMineTabScope);
    }
    if (activeTab.value === 'done') {
      return all.value.filter((t) => inDoneScope(t, WORKBENCH_HANDLER));
    }
    if (activeTab.value === 'pool') {
      return all.value.filter(inPoolTabScope);
    }
    // 催补待回：本组未结单中有客户侧催补且未联系的（PRD-915 补充与催单 §9.3）
    if (activeTab.value === 'poolPending') {
      return all.value.filter(inPoolPendingTabScope);
    }
    return all.value.filter((t) => t.tab === activeTab.value);
  });

  // 叠加 chip / 分组 + 搜索
  const filtered = computed(() => {
    const kw = searchText.value.trim().toLowerCase();
    const structuredTab = isWorkbenchSearchTab(activeTab.value);
    return tabRows.value.filter((t) => {
      const chipKey = activeChip.value as ChipKey;
      if (
        activeTab.value !== 'pool'
        && !isSavedFilterChipKey(activeChip.value)
        && !matchChip(t, chipKey, activeTab.value)
      ) {
        return false;
      }
      if (activeTab.value === 'mine') {
        if (!matchMineQuery(t, mineQuery.value)) return false;
      } else if (activeTab.value === 'done') {
        if (!matchMineQuery(t, doneQuery.value)) return false;
      } else if (activeTab.value === 'pool' || activeTab.value === 'poolPending') {
        if (!matchMineQuery(t, poolQuery.value)) return false;
      }
      if (kw) {
        if (structuredTab) {
          const matchNo = t.no.toLowerCase().includes(kw);
          const phone = (t.customerPhone ?? '').toLowerCase();
          if (!matchNo && !phone.includes(kw)) return false;
        } else {
          const hay = `${t.no} ${t.customer} ${t.title}`.toLowerCase();
          if (!hay.includes(kw)) return false;
        }
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

  // 无分页：全量拉取一次性展示（快照计算，PRD §8.2②）；条件变化由响应式全量重算
  const paged = sorted;

  // 各 Tab 计数（顶栏徽章）
  const tabCounts = computed<Record<TabKey, number>>(() => {
    const map: Record<TabKey, number> = { mine: 0, done: 0, pool: 0, poolPending: 0, cc: 0, review: 0 };
    for (const t of all.value) {
      // 我的任务单独数：一线坐席 / 二线专员本人建的刷机单可能不在 mine 页（§9.4 / M71）
      if (inMineTabScope(t)) map.mine++;
      if (t.tab === 'done') {
        if (inDoneScope(t, WORKBENCH_HANDLER)) map.done++;
      } else if (t.tab === 'pool') {
        if (inPoolTabScope(t)) map.pool++;
      } else if (t.tab !== 'poolPending' && t.tab !== 'mine') {
        map[t.tab]++;
      }
      if (inPoolPendingTabScope(t)) map.poolPending++;
    }
    return map;
  });

  const activeChips = computed(() => {
    const builtin = chipsForTab(activeTab.value);
    const sfTab = savedFilterTab(activeTab.value);
    if (!sfTab) return builtin;
    return [...builtin, ...savedFilters.chipsForTab(sfTab)];
  });

  /** 与列表一致：chip 计数也叠加当前 Tab 的结构化筛选（含已办默认 30 天窗） */
  function matchActiveStructuredQuery(t: Ticket): boolean {
    if (activeTab.value === 'mine') return matchMineQuery(t, mineQuery.value);
    if (activeTab.value === 'done') return matchMineQuery(t, doneQuery.value);
    if (activeTab.value === 'pool' || activeTab.value === 'poolPending') {
      return matchMineQuery(t, poolQuery.value);
    }
    return true;
  }

  // 当前 Tab 下各 chip 计数
  const chipCounts = computed<Record<string, number>>(() => {
    const map: Record<string, number> = {};
    for (const chip of activeChips.value) {
      if (isSavedFilterChipKey(chip.key)) {
        const sf = savedFilters.findByChipKey(chip.key);
        if (sf) {
          map[chip.key] = tabRows.value.filter((t) => matchMineQuery(t, sf.query)).length;
        } else {
          map[chip.key] = 0;
        }
      } else {
        map[chip.key] = tabRows.value.filter(
          (t) => matchChip(t, chip.key as ChipKey, activeTab.value) && matchActiveStructuredQuery(t),
        ).length;
      }
    }
    return map;
  });

  /** 顶栏 Tab 徽章：当前 Tab 与「全部」chip 对齐（含结构化筛选后的可见量） */
  const headerTabCounts = computed<Record<TabKey, number>>(() => {
    const counts = { ...tabCounts.value };
    const allChip = chipCounts.value.all;
    if (activeTab.value === 'poolPending' && typeof allChip === 'number') {
      counts.poolPending = allChip;
    } else if (activeTab.value === 'mine' && typeof allChip === 'number') {
      counts.mine = allChip;
    } else if (activeTab.value === 'done' && typeof allChip === 'number') {
      counts.done = allChip;
    } else if (activeTab.value === 'review' && typeof allChip === 'number') {
      counts.review = allChip;
    }
    return counts;
  });

  /** 草稿列表（新建工单弹窗仍可保存草稿；待审核 Tab 已不再展示草稿 chip） */
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
  /** 我的任务 ·「已挂起」：列表追加 挂起时间 / 预计恢复时间 */
  const showSuspendColumns = computed(
    () => activeTab.value === 'mine' && activeChip.value === 'suspended',
  );
  const isMineTab = computed(() => activeTab.value === 'mine');
  const isDoneTab = computed(() => activeTab.value === 'done');
  const isPoolTab = computed(() => activeTab.value === 'pool');
  /** 我的任务 / 已办 / 本组工单池：快捷搜索 + 结构化筛选 */
  const usesStructuredFilter = computed(() => isWorkbenchSearchTab(activeTab.value));
  const structuredQuery = computed(() => {
    if (activeTab.value === 'done') return doneQuery.value;
    if (activeTab.value === 'pool' || activeTab.value === 'poolPending') return poolQuery.value;
    return mineQuery.value;
  });

  // ---- actions ----
  /** 清空当前 Tab 的结构化查询（已办恢复默认 30 天窗） */
  function clearStructuredForActiveTab() {
    setStructuredQueryInternal(
      activeTab.value === 'done' ? DEFAULT_DONE_QUERY() : EMPTY_MINE_QUERY(),
    );
  }
  function setTab(tab: TabKey) {
    if (tab === 'cc') tab = 'mine';
    if (activeTab.value === tab) return;
    activeTab.value = tab;
    activeChip.value = 'all';
    selectedIds.value = new Set();
    // 切 Tab 视为干净入口：清掉各 Tab 残留的结构化查询（与 setSearch('') 重置一致），
    // 避免保存筛选遗留条件在「全部」chip 下静默窄化列表
    mineQuery.value = EMPTY_MINE_QUERY();
    poolQuery.value = EMPTY_MINE_QUERY();
    doneQuery.value = DEFAULT_DONE_QUERY();
  }
  function setChip(chip: ChipKey | string, onApplyOptionalVisible?: (v: Record<string, boolean>) => void) {
    const prevChip = activeChip.value;
    activeChip.value = chip;
    const sfId = parseSavedFilterChipKey(chip);
    if (sfId) {
      const sf = savedFilters.findByChipKey(chip);
      if (sf) {
        setStructuredQueryInternal(sf.query);
        if (sf.optionalVisible && onApplyOptionalVisible) {
          onApplyOptionalVisible(sf.optionalVisible);
        }
      }
    } else if (isSavedFilterChipKey(prevChip)) {
      // 从「保存筛选」chip 改选内置 chip：清掉保存筛选写入的结构化查询，
      // 否则「全部」等内置 chip 仍被该查询静默窄化（且面板收起时用户无从察觉）
      clearStructuredForActiveTab();
    }
  }
  function setMineQuery(q: MineQueryFilter) {
    mineQuery.value = q;
  }
  function setDoneQuery(q: MineQueryFilter) {
    doneQuery.value = q;
  }
  function setStructuredQueryInternal(q: MineQueryFilter) {
    if (activeTab.value === 'done') doneQuery.value = q;
    else if (activeTab.value === 'pool' || activeTab.value === 'poolPending') poolQuery.value = q;
    else mineQuery.value = q;
  }
  function setStructuredQuery(q: MineQueryFilter) {
    if (isSavedFilterChipKey(activeChip.value)) {
      activeChip.value = 'all';
    }
    setStructuredQueryInternal(q);
  }
  function saveCurrentFilter(
    name: string,
    optionalVisible?: Record<string, boolean>,
    onApplyOptionalVisible?: (v: Record<string, boolean>) => void,
  ) {
    const tab = savedFilterTab(activeTab.value);
    if (!tab) return null;
    const item = savedFilters.addSavedFilter(tab, name, structuredQuery.value, optionalVisible);
    activeChip.value = savedFilterChipKey(item.id);
    if (item.optionalVisible && onApplyOptionalVisible) {
      onApplyOptionalVisible(item.optionalVisible);
    }
    return item;
  }
  /** 删除用户自定义（保存筛选）chip；若当前选中则回退到「全部」并清除结构化查询 */
  function removeSavedFilterChip(chipKey: string) {
    if (!isSavedFilterChipKey(chipKey)) return null;
    const removed = savedFilters.removeSavedFilter(chipKey);
    if (!removed) return null;
    if (activeChip.value === chipKey) {
      activeChip.value = 'all';
      clearStructuredForActiveTab();
    }
    return removed;
  }
  // 无分页：查询应用后由响应式全量重算（快照重排），无需翻页复位
  function applyMineQuery() {}
  function applyStructuredQuery() {}
  function setMineSortRule(rule: MineSortRule) {
    mineSortRule.value = rule;
  }
  function setSearch(v: string) {
    searchText.value = v;
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
  function addTicket(t: Ticket) {
    all.value = [t, ...all.value];
  }
  /** 领取人（刷机服务写履历用）：处理人名 + 本角色的履历角色名 */
  function flashActor(): FlashActor {
    return { name: flashHandler.value, role: mapUserRole(user.roleKey) };
  }
  /**
   * 领取刷机单（刷机池 / 工单池里的教育刷机处理组池）：走刷机服务 `claimFromPool`，
   * 子状态「待响应」、处理人＝本人、写履历并落刷机缓存（§4.2 / §9.2）。
   */
  function claimFlashTicket(id: string): { ok: boolean; message: string } {
    const t = all.value.find((x) => x.id === id);
    if (!t) return { ok: false, message: '' };
    return flash.claimFromPool(t.no, flashActor());
  }
  /** 领取本组工单池中的工单 → 转入我的任务 */
  function claimTicket(id: string): boolean {
    const t = all.value.find((x) => x.id === id);
    if (t?.type === '刷机') return claimFlashTicket(id).ok;
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
  function dismissAiSuggestion(id: string) {
    dismissedAiIds.value = new Set([...dismissedAiIds.value, id]);
  }
  function ticketById(id: string): Ticket | undefined {
    return all.value.find((t) => t.id === id);
  }

  return {
    all, activeTab, activeChip, activeChips, poolGroups,
    searchText, mineQuery, doneQuery, poolQuery, structuredQuery, mineSortRule, selectedIds, aiBarVisible,
    tabRows, filtered, sorted, paged, total, tabCounts, headerTabCounts, chipCounts, drafts,
    selectedCount, allPageSelected, aiSuggestions, aiSummary, showAiBar,
    isDraftView, showAppointmentColumn, showSuspendColumns, isMineTab, isDoneTab, isPoolTab, usesStructuredFilter,
    setTab, setChip, setMineQuery, setDoneQuery, setStructuredQuery, saveCurrentFilter, removeSavedFilterChip, applyMineQuery, applyStructuredQuery, setMineSortRule, setSearch, toggleSelect, toggleSelectAllOnPage, clearSelection,
    addTicket, claimTicket, claimTickets, claimFlashTicket, flashPoolRows, dismissAiSuggestion, ticketById,
    removeDraft: (id: string) => draftStore.remove(id),
  };
}
