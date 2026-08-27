import { computed, ref, watch } from 'vue';
import { TICKETS } from '@/mock/tickets';
import {
  inGroupPoolScope,
  inMineTaskScope,
  isSearchableTicket,
  POOL_GROUPS,
  WORKBENCH_HANDLER,
  type Ticket,
} from '@/views/tickets/types/ticket';
import { TOO_MANY_RESULTS } from '@/views/query/queryCenterSearch';
import {
  EMPTY_MINE_QUERY,
  matchMineQuery,
  type MineQueryFilter,
} from '@/views/tickets/types/mineQuery';

/**
 * 取数范围（PRD-915 §3.3 · §8 规则 1，C3）。
 *
 * | | 范围 |
 * |---|---|
 * | `workbench` 工单工作台 | **本人 + 本组池** |
 * | `tenant` 查询中心 · 查工单 | **全租户** |
 *
 * 「两处列表虽共用组件，**取数须分开实现**」—— 原实现两处都是 `TICKETS` 只滤 `archived`，
 * 等于把工作台悄悄放大成了全租户；本参数就是那道分界，调用方必须显式选边。
 */
export type TicketListScope = 'workbench' | 'tenant';

const VISIBLE_POOL_GROUPS = POOL_GROUPS.map((g) => g.id);

/** 工作台数据域：本人名下 + 本组池（与 useTicketWorkbench 的 mine / pool 两档同源） */
function inWorkbenchScope(t: Ticket): boolean {
  return inMineTaskScope(t, WORKBENCH_HANDLER) || inGroupPoolScope(t, VISIBLE_POOL_GROUPS);
}

/** 列表页默认按更新时间倒序（PRD-05 §9） */
function byUpdatedDesc(a: Ticket, b: Ticket): number {
  const ta = a.updatedAt ?? a.no;
  const tb = b.updatedAt ?? b.no;
  return tb.localeCompare(ta);
}

export function useTicketList(scope: TicketListScope = 'workbench') {
  const all = ref<Ticket[]>([...TICKETS]);

  const query = ref<MineQueryFilter>(EMPTY_MINE_QUERY());
  /** 顶栏综合搜索（工单号 / 标题 / 客户） */
  const keyword = ref('');

  const selectedIds = ref<Set<string>>(new Set());
  const current = ref(1);
  const pageSize = ref(10);

  /**
   * 数据域。两条口径叠加：
   * ① `isSearchableTicket` —— 已归档与草稿一律不进（PRD-915 §3.6 E16 / §8 规则 6，C5）；
   * ② 取数范围 —— `tenant` 全租户、`workbench` 本人 + 本组池（§3.3，C3）。
   */
  const baseRows = computed(() =>
    all.value.filter(
      (t) => isSearchableTicket(t) && (scope === 'tenant' || inWorkbenchScope(t)),
    ),
  );

  /** chip 等附加过滤（查询中心的「临期 / 已超时」走这里，不污染结构化筛选的 query） */
  const extraFilter = ref<((t: Ticket) => boolean) | null>(null);

  const filtered = computed(() =>
    baseRows.value.filter((t) => {
      if (extraFilter.value && !extraFilter.value(t)) return false;
      const kw = keyword.value.trim();
      if (kw) {
        const q = kw.toLowerCase();
        // 检索键覆盖 §3.2 的四类：工单号 / 客户（名 + 手机号）/ 设备 SN / 关键词（标题、摘要）
        const hay = `${t.no} ${t.title} ${t.customer} ${t.customerPhone ?? ''} ${t.sn ?? ''} ${t.problemDesc ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return matchMineQuery(t, query.value);
    }),
  );

  const sorted = computed(() => [...filtered.value].sort(byUpdatedDesc));

  const total = computed(() => sorted.value.length);

  /** 总页数（至少 1 页，空结果时页码停在 1） */
  const pageCount = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)));

  /**
   * E18 页码越界自动回第 1 页 —— 原在第 5 页、筛选后只剩 2 页时，
   * 分页组件仍停在 5，列表切片落空，页面看起来像"没有数据"。
   */
  watch(pageCount, (n) => {
    if (current.value > n) current.value = 1;
  });

  /** E10：结果过多时页顶提示收敛（不阻断，照常分页） */
  const tooManyResults = computed(() => total.value > TOO_MANY_RESULTS);

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
    query.value = EMPTY_MINE_QUERY();
    keyword.value = '';
    current.value = 1;
  }

  function setQuery(q: MineQueryFilter) {
    query.value = q;
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
    baseRows,
    query,
    keyword,
    selectedIds,
    current,
    pageSize,
    extraFilter,
    filtered,
    sorted,
    paged,
    total,
    pageCount,
    tooManyResults,
    selectedCount,
    allPageSelected,
    applyFilters,
    resetFilters,
    setQuery,
    toggleSelect,
    toggleSelectAllOnPage,
    clearSelection,
    setPage,
    addTicket,
  };
}
