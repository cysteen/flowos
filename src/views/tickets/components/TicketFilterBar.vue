<script setup lang="ts">
import { CalendarOutlined, DownOutlined } from '@ant-design/icons-vue';
import type { ChipMeta, ChipKey } from '@/views/tickets/types/ticket';

defineProps<{
  activeChip: ChipKey | string;
  chipCounts: Record<string, number>;
  chips: ChipMeta[];
  showTimeFilter?: boolean;
}>();

const emit = defineEmits<{
  chip: [key: ChipKey | string];
}>();

function chipStyle(_key: string, active: boolean, tone?: 'warn' | 'danger') {
  if (active) return { background: '#EFF6FF', borderColor: '#1A6FFF' };
  if (tone === 'warn') return { background: '#FFFBEB', borderColor: '#FCD34D' };
  if (tone === 'danger') return { background: '#FEF2F2', borderColor: '#FCA5A5' };
  return { background: '#FFFFFF', borderColor: '#E5E7EB' };
}
function chipTextColor(_key: string, active: boolean, tone?: 'warn' | 'danger') {
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

    <div v-if="showTimeFilter" class="right">
      <div class="time-filter">
        <CalendarOutlined :style="{ color: '#6B7280', fontSize: '14px' }" />
        <span class="tf-text">最近 7 天</span>
        <DownOutlined :style="{ color: '#9CA3AF', fontSize: '12px' }" />
      </div>
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
</style>
