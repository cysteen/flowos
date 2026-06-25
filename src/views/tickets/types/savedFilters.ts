import type { MineQueryFilter } from '@/views/tickets/types/mineQuery';

export type SavedFilterTab = 'mine' | 'done' | 'pool';

export interface SavedFilter {
  id: string;
  name: string;
  tab: SavedFilterTab;
  query: MineQueryFilter;
  optionalVisible?: Record<string, boolean>;
  createdAt: string;
}

export const SAVED_FILTER_CHIP_PREFIX = 'sf:';

export function savedFilterChipKey(id: string): string {
  return `${SAVED_FILTER_CHIP_PREFIX}${id}`;
}

export function parseSavedFilterChipKey(key: string): string | null {
  return key.startsWith(SAVED_FILTER_CHIP_PREFIX) ? key.slice(SAVED_FILTER_CHIP_PREFIX.length) : null;
}

export function isSavedFilterChipKey(key: string): boolean {
  return key.startsWith(SAVED_FILTER_CHIP_PREFIX);
}

const LS_KEY = 'flowos-saved-filters';

export function loadSavedFilters(): SavedFilter[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed as SavedFilter[];
    }
  } catch {
    /* ignore */
  }
  return [];
}

export function persistSavedFilters(list: SavedFilter[]) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}
