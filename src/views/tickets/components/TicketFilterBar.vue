<script setup lang="ts">
import {
  CalendarOutlined,
  DownOutlined,
  FilterOutlined,
  SearchOutlined,
} from '@ant-design/icons-vue';
import type { ChipMeta, ChipKey } from '@/views/tickets/types/ticket';

defineProps<{
  activeChip: ChipKey;
  chipCounts: Record<string, number>;
  chips: ChipMeta[];
  search: string;
  searchPlaceholder?: string;
  showTimeFilter?: boolean;
  showSearch?: boolean;
  /** 我的任务：在 chips 行展示「筛选」展开/收起 */
  showMineFilter?: boolean;
  mineFilterExpanded?: boolean;
  mineFilterActive?: boolean;
  showCreate?: boolean;
}>();
const emit = defineEmits<{
  chip: [key: ChipKey];
  'update:search': [v: string];
  create: [];
  'toggle-mine-filter': [];
}>();

function chipStyle(key: ChipKey, active: boolean, tone?: 'warn' | 'danger') {
  if (active) return { background: '#EFF6FF', borderColor: '#1A6FFF' };
  if (tone === 'warn') return { background: '#FFFBEB', borderColor: '#FCD34D' };
  if (tone === 'danger') return { background: '#FEF2F2', borderColor: '#FCA5A5' };
  return { background: '#FFFFFF', borderColor: '#E5E7EB' };
}
function chipTextColor(key: ChipKey, active: boolean, tone?: 'warn' | 'danger') {
  if (active) return '#1A6FFF';
  if (tone === 'warn') return '#D97706';
  if (tone === 'danger') return '#DC2626';
  return '#6B7280';
}
</script>

<template>
  <div class="filter-row" :class="{ 'no-chips': !chips.length }">
    <div class="chips" v-if="chips.length">
      <div
        v-for="chip in chips"
        :key="chip.key"
        class="chip"
        :style="chipStyle(chip.key, chip.key === activeChip, chip.tone)"
        @click="emit('chip', chip.key)"
      >
        <span
          class="chip-label"
          :style="{
            color: chipTextColor(chip.key, chip.key === activeChip, chip.tone),
            fontWeight: chip.key === activeChip ? 600 : 400,
          }"
          >{{ chip.label }}</span
        >
        <span
          class="chip-count"
          :style="{ color: chip.key === activeChip ? '#1A6FFF' : chip.tone === 'warn' ? '#D97706' : chip.tone === 'danger' ? '#DC2626' : '#9CA3AF' }"
          >{{ chipCounts[chip.key] }}</span
        >
      </div>
    </div>

    <div class="right">
      <button
        v-if="showMineFilter"
        type="button"
        class="struct-filter-btn"
        :class="{
          expanded: mineFilterExpanded,
          'has-filter': mineFilterActive && !mineFilterExpanded,
        }"
        @click="emit('toggle-mine-filter')"
      >
        <FilterOutlined :style="{ fontSize: '14px' }" />
        <span class="struct-filter-btn__label">筛选</span>
        <DownOutlined
          class="struct-filter-btn__chevron"
          :class="{ 'struct-filter-btn__chevron--up': mineFilterExpanded }"
          :style="{ color: '#9CA3AF', fontSize: '12px' }"
        />
        <span v-if="mineFilterActive && !mineFilterExpanded" class="struct-filter-btn__dot" />
      </button>

      <div v-if="showTimeFilter" class="time-filter">
        <CalendarOutlined :style="{ color: '#6B7280', fontSize: '14px' }" />
        <span class="tf-text">最近 7 天</span>
        <DownOutlined :style="{ color: '#9CA3AF', fontSize: '12px' }" />
      </div>

      <div v-if="showSearch !== false" class="search-box">
        <SearchOutlined :style="{ color: '#9CA3AF', fontSize: '16px' }" />
        <input
          class="search-input"
          placeholder="搜索工单号、手机号、SN、产品…"
          :value="search"
          @input="emit('update:search', ($event.target as HTMLInputElement).value)"
        />
        <span class="kbd">Ctrl+K</span>
      </div>

      <button v-if="showCreate !== false" class="new-btn" @click="emit('create')">新建工单</button>
    </div>
  </div>
</template>

<style scoped>
.filter-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: nowrap;
  gap: 12px;
  width: 100%;
  min-width: 0;
}
.filter-row.no-chips {
  justify-content: flex-end;
}
.chips {
  display: flex;
  gap: 8px;
  flex: 1;
  min-width: 0;
  overflow-x: auto;
  flex-wrap: nowrap;
  scrollbar-width: none;
}
.chips::-webkit-scrollbar {
  display: none;
}
.chip {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border: 1px solid;
  border-radius: 15px;
  cursor: pointer;
  flex: none;
  white-space: nowrap;
}
.chip-label {
  font-size: 13px;
}
.chip-count {
  font-size: 12px;
  font-weight: 600;
}
.right {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: none;
  flex-shrink: 0;
}
.time-filter {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  background: #fff;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  cursor: pointer;
}
.tf-text {
  font-size: 13px;
  font-weight: 500;
  color: #374151;
}
.search-box {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 280px;
  padding: 8px 12px;
  background: #fff;
  border: 1px solid #d1d5db;
  border-radius: 8px;
}
.search-input {
  flex: 1;
  border: none;
  outline: none;
  font-size: 13px;
  color: #374151;
  background: transparent;
}
.search-input::placeholder {
  color: #9ca3af;
}
.kbd {
  font-size: 11px;
  color: #9ca3af;
  background: #f3f4f6;
  border-radius: 4px;
  padding: 1px 6px;
}
.new-btn {
  font-size: 13px;
  font-weight: 600;
  color: #fff;
  background: #1a6fff;
  border: none;
  border-radius: 8px;
  padding: 9px 16px;
  cursor: pointer;
}
.new-btn:hover {
  background: #0f4fcc;
}
.struct-filter-btn {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 7px 12px;
  box-sizing: border-box;
  font-size: 13px;
  color: #374151;
  background: #fff;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  cursor: pointer;
  flex: none;
  white-space: nowrap;
  user-select: none;
}
.struct-filter-btn__label {
  flex: none;
}
.struct-filter-btn__chevron {
  flex: none;
  transition: transform 0.2s ease;
}
.struct-filter-btn__chevron--up {
  transform: rotate(180deg);
}
.struct-filter-btn:hover {
  border-color: #1a6fff;
  color: #1a6fff;
}
.struct-filter-btn.expanded,
.struct-filter-btn.has-filter {
  border-color: #1a6fff;
  color: #1a6fff;
  background: #eff6ff;
}
.struct-filter-btn__dot {
  position: absolute;
  top: 7px;
  right: 8px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #1a6fff;
  pointer-events: none;
}
</style>
