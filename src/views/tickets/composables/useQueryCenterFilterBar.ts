import { computed, ref, type Ref } from 'vue';
import { useSavedFilters } from '@/views/tickets/composables/useSavedFilters';
import {
  EMPTY_MINE_QUERY,
  matchMineQuery,
  type MineQueryFilter,
} from '@/views/tickets/types/mineQuery';
// 「临期 / 已超时」两枚 chip 与工作台「我的任务」同一份判据（PRD §4.3 同源清单④，D-10 / R156）
import { matchSlaChip, type Ticket } from '@/views/tickets/types/ticket';
import {
  isSavedFilterChipKey,
  parseSavedFilterChipKey,
  savedFilterChipKey,
} from '@/views/tickets/types/savedFilters';

/** 查询中心 · 保存筛选器 chip + 结构化筛选联动（对齐工作台 setChip 口径） */
export function useQueryCenterFilterBar(
  baseRows: Ref<Ticket[]>,
  query: Ref<MineQueryFilter>,
  applyOptionalVisible: (v: Record<string, boolean>) => void,
  /**
   * 结构化筛选之外的**行过滤**（当前只有下钻带来的 `live=1` ＝ 只看在办）。
   * 🔴 **chip 上的数必须跟着它走**：它是列表真的在用的一道过滤（`list.extraFilter`），
   * 不跟的话会出现「全部 17」而清单里躺着 15 —— 同一屏两个数，正是本仓反复踩的那个坑。
   * ⚠️ SLA 那两枚 chip 自己的 predicate **不**走这里：那一枚是"选中之后才生效"的，
   * 摆在 chip 上的数本就该是"没选它时有多少条"。
   */
  rowFilter?: Ref<((t: Ticket) => boolean) | null>,
) {
  const passesRowFilter = (t: Ticket) => !rowFilter?.value || rowFilter.value(t);
  const savedFilters = useSavedFilters();
  const activeChip = ref<string>('all');

  /** 内置 SLA chip：查询中心没有 SLA 筛选项，靠这两枚收敛（PRD §6.2） */
  const SLA_CHIPS = [
    { key: 'soon', label: '临期', tone: 'warn' as const },
    { key: 'overdue', label: '已超时', tone: 'danger' as const },
  ];
  const SLA_CHIP_KEYS = SLA_CHIPS.map((c) => c.key);

  /** 当前选中的 SLA chip 对应的行过滤；未选则不过滤 */
  const slaPredicate = computed<((t: Ticket) => boolean) | null>(() => {
    if (activeChip.value === 'soon') return (t) => matchSlaChip(t, 'soon');
    if (activeChip.value === 'overdue') return (t) => matchSlaChip(t, 'overdue');
    return null;
  });

  const chips = computed(() => [
    { key: 'all', label: '全部' },
    ...SLA_CHIPS,
    ...savedFilters.chipsForTab('query'),
  ]);

  const chipCounts = computed(() => {
    const map: Record<string, number> = {};
    for (const chip of chips.value) {
      if (chip.key === 'all') {
        map.all = baseRows.value.filter(
          (t) => passesRowFilter(t) && matchMineQuery(t, query.value),
        ).length;
        continue;
      }
      if (chip.key === 'soon' || chip.key === 'overdue') {
        const slaKey = chip.key;
        map[slaKey] = baseRows.value.filter(
          (t) => passesRowFilter(t) && matchSlaChip(t, slaKey) && matchMineQuery(t, query.value),
        ).length;
        continue;
      }
      const sf = savedFilters.findByChipKey(chip.key);
      map[chip.key] = sf
        ? baseRows.value.filter((t) => passesRowFilter(t) && matchMineQuery(t, sf.query)).length
        : 0;
    }
    return map;
  });

  function setChip(chip: string) {
    const prevChip = activeChip.value;
    activeChip.value = chip;
    const sfId = parseSavedFilterChipKey(chip);
    if (sfId) {
      const sf = savedFilters.findByChipKey(chip);
      if (sf) {
        query.value = { ...sf.query };
        if (sf.optionalVisible) applyOptionalVisible(sf.optionalVisible);
      }
    } else if (isSavedFilterChipKey(prevChip)) {
      // 从"保存的筛选器"切走时才清条件；SLA chip 只叠加过滤，不动结构化条件
      query.value = EMPTY_MINE_QUERY();
    }
  }

  function setQuery(q: MineQueryFilter) {
    if (isSavedFilterChipKey(activeChip.value)) {
      activeChip.value = 'all';
    }
    query.value = q;
  }

  function saveFilter(name: string, optionalVisible: Record<string, boolean>) {
    const item = savedFilters.addSavedFilter('query', name, query.value, optionalVisible);
    activeChip.value = savedFilterChipKey(item.id);
    if (item.optionalVisible) applyOptionalVisible(item.optionalVisible);
    return item;
  }

  function removeFilter(chipKey: string) {
    if (!isSavedFilterChipKey(chipKey)) return null;
    const removed = savedFilters.removeSavedFilter(chipKey);
    if (!removed) return null;
    if (activeChip.value === chipKey) {
      activeChip.value = 'all';
      query.value = EMPTY_MINE_QUERY();
    }
    return removed;
  }

  return {
    activeChip,
    chips,
    chipCounts,
    slaPredicate,
    SLA_CHIP_KEYS,
    setChip,
    setQuery,
    saveFilter,
    removeFilter,
  };
}
