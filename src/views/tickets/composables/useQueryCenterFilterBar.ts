import { computed, ref, type Ref } from 'vue';
import { useSavedFilters } from '@/views/tickets/composables/useSavedFilters';
import {
  EMPTY_MINE_QUERY,
  matchMineQuery,
  type MineQueryFilter,
} from '@/views/tickets/types/mineQuery';
import { slaSortKey, type Ticket } from '@/views/tickets/types/ticket';
import { readSla } from '@/views/tickets/utils/slaClock';
import {
  isSavedFilterChipKey,
  parseSavedFilterChipKey,
  savedFilterChipKey,
} from '@/views/tickets/types/savedFilters';

/**
 * 「临期 / 已超时」chip 判据（930 教育刷机单 PRD §4.3，D-10 / R156）。
 *
 * 刷机单取 SLA 账本：`slaSortKey` 的刷机分支已按「本单在计钟中最紧急的那一口」归约出
 * 状态组（0 已超时 / 1 临期 / 2 正常 / 3 停钟 / 4 终态），此处直接复用它算出来的组，
 * 不另写一套 —— 列表 SLA 列、紧急度排序与这两枚 chip 因此永远给同一个结论。
 * 停钟（3）、终态（4）与未起算（无账本读数）既不算临期也不算已超时。
 *
 * 老四类一字不动，继续读工单行上的 `slaState`。
 */
function matchSlaChip(t: Ticket, key: 'soon' | 'overdue'): boolean {
  if (t.type === '刷机') {
    if (!readSla(t)) return false;
    return slaSortKey(t).group === (key === 'overdue' ? 0 : 1);
  }
  return t.slaState === key;
}

/** 查询中心 · 保存筛选器 chip + 结构化筛选联动（对齐工作台 setChip 口径） */
export function useQueryCenterFilterBar(
  baseRows: Ref<Ticket[]>,
  query: Ref<MineQueryFilter>,
  applyOptionalVisible: (v: Record<string, boolean>) => void,
) {
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
        map.all = baseRows.value.filter((t) => matchMineQuery(t, query.value)).length;
        continue;
      }
      if (chip.key === 'soon' || chip.key === 'overdue') {
        const slaKey = chip.key;
        map[slaKey] = baseRows.value.filter(
          (t) => matchSlaChip(t, slaKey) && matchMineQuery(t, query.value),
        ).length;
        continue;
      }
      const sf = savedFilters.findByChipKey(chip.key);
      map[chip.key] = sf
        ? baseRows.value.filter((t) => matchMineQuery(t, sf.query)).length
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
