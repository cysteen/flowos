import { computed, ref, watch } from 'vue';
import type { ChipMeta } from '@/views/tickets/types/ticket';
import {
  loadSavedFilters,
  persistSavedFilters,
  savedFilterChipKey,
  type SavedFilter,
  type SavedFilterTab,
} from '@/views/tickets/types/savedFilters';
import type { MineQueryFilter } from '@/views/tickets/types/mineQuery';

export function useSavedFilters() {
  const savedFilters = ref<SavedFilter[]>(loadSavedFilters());

  watch(
    savedFilters,
    (list) => persistSavedFilters(list),
    { deep: true },
  );

  function filtersForTab(tab: SavedFilterTab): SavedFilter[] {
    return savedFilters.value.filter((f) => f.tab === tab);
  }

  function chipsForTab(tab: SavedFilterTab): ChipMeta[] {
    return filtersForTab(tab).map((f) => ({
      key: savedFilterChipKey(f.id) as ChipMeta['key'],
      label: f.name,
    }));
  }

  function findByChipKey(chipKey: string): SavedFilter | undefined {
    const id = chipKey.startsWith('sf:') ? chipKey.slice(3) : null;
    if (!id) return undefined;
    return savedFilters.value.find((f) => f.id === id);
  }

  function addSavedFilter(
    tab: SavedFilterTab,
    name: string,
    query: MineQueryFilter,
    optionalVisible?: Record<string, boolean>,
  ): SavedFilter {
    const item: SavedFilter = {
      id: `sf-${Date.now()}`,
      name,
      tab,
      query: JSON.parse(JSON.stringify(query)) as MineQueryFilter,
      optionalVisible: optionalVisible ? { ...optionalVisible } : undefined,
      createdAt: new Date().toISOString(),
    };
    savedFilters.value = [...savedFilters.value, item];
    return item;
  }

  const totalCount = computed(() => savedFilters.value.length);

  return {
    savedFilters,
    filtersForTab,
    chipsForTab,
    findByChipKey,
    addSavedFilter,
    totalCount,
  };
}
