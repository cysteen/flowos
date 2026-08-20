<script setup lang="ts">
// 「本组」容器 Tab 下的子 Tab：待领取 / 催补待回（PRD-830 §9.3）。
// 视觉与交互对齐 TicketFilterBar 的 chip（白底描边 / 选中蓝底蓝边）。
import { POOL_SUB_TABS, type TabKey } from '@/views/tickets/types/ticket';

const props = defineProps<{
  active: TabKey;
  counts: Record<TabKey, number>;
}>();
const emit = defineEmits<{ change: [tab: TabKey] }>();

const HINT: Partial<Record<TabKey, string>> = {
  pool: '本组还没人领取的工单',
  poolPending: '客户催过或补过、但还没联系客户的工单',
};

function chipStyle(active: boolean) {
  if (active) return { background: '#EFF6FF', borderColor: '#1A6FFF' };
  return { background: '#FFFFFF', borderColor: '#E5E7EB' };
}

function chipTextColor(active: boolean) {
  return active ? '#1A6FFF' : '#6B7280';
}

function chipCountColor(active: boolean) {
  return active ? '#1A6FFF' : '#9CA3AF';
}
</script>

<template>
  <div class="pool-subtabs chips">
    <div
      v-for="t in POOL_SUB_TABS"
      :key="t.key"
      class="chip"
      :class="{ active: t.key === props.active }"
      :style="chipStyle(t.key === props.active)"
      :title="HINT[t.key]"
      role="button"
      tabindex="0"
      @click="emit('change', t.key)"
      @keydown.enter="emit('change', t.key)"
      @keydown.space.prevent="emit('change', t.key)"
    >
      <span
        class="chip-label"
        :style="{
          color: chipTextColor(t.key === props.active),
          fontWeight: t.key === props.active ? 600 : 400,
        }"
      >{{ t.label }}</span>
      <span
        class="chip-count"
        :style="{ color: chipCountColor(t.key === props.active) }"
      >{{ props.counts[t.key] ?? 0 }}</span>
    </div>
  </div>
</template>

<style scoped>
.pool-subtabs {
  display: flex;
  gap: 8px;
  flex: none;
  padding: 0;
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
  user-select: none;
}
.chip-label {
  font-size: 13px;
}
.chip-count {
  font-size: 12px;
  font-weight: 600;
}
</style>
