<script setup lang="ts">
import { computed } from 'vue';
import type { InsightStats, InsightAction } from '@/views/tickets/types/operation';

const props = defineProps<{ insight: InsightStats; ticketType: string }>();
const emit = defineEmits<{ select: [action: InsightAction] }>();

interface StatItem {
  key: string;
  label: string;
  value: number;
  unit: string;
  action: InsightAction;
  /** 仅当 value>0 时以警示色呈现（颜色=是否需要注意，对齐 STATUS_TONE 语义） */
  warn?: boolean;
}

// 上排=客户维度（弹窗看明细）；下排=本单维度（跳对应 Tab）
const items = computed<StatItem[]>(() => {
  const i = props.insight;
  return [
    { key: 'inbound', label: '进线', value: i.inboundCount, unit: '次', action: { kind: 'modal', modalKey: 'inbound' } },
    { key: 'history', label: '历史', value: i.historyCount, unit: '单', action: { kind: 'modal', modalKey: 'history' } },
    { key: 'complaint', label: '投诉', value: i.complaintCount, unit: '单', warn: true, action: { kind: 'modal', modalKey: 'complaint' } },
    { key: 'recent30', label: '近30天', value: i.recent30Count, unit: '单', action: { kind: 'modal', modalKey: 'recent30' } },
    { key: 'dunning', label: '催单', value: i.dunningCount, unit: '次', warn: true, action: { kind: 'tab', tab: 'related' } },
    { key: 'supplement', label: '补充', value: i.supplementCount, unit: '次', action: { kind: 'tab', tab: 'related' } },
    { key: 'related', label: '关联', value: i.relatedCount, unit: '个', action: { kind: 'tab', tab: 'related' } },
    { key: 'sameType', label: `${props.ticketType}单`, value: i.sameTypeCount, unit: '单', action: { kind: 'tab', tab: 'customerHistory' } },
  ];
});

function isWarn(it: StatItem) {
  return !!it.warn && it.value > 0;
}
</script>

<template>
  <div class="stat-grid">
    <button
      v-for="it in items"
      :key="it.key"
      type="button"
      class="stat-item"
      :class="{ warn: isWarn(it) }"
      :title="`查看${it.label}明细`"
      @click="emit('select', it.action)"
    >
      <span class="si-label">{{ it.label }}</span>
      <span class="si-value">{{ it.value }}<span class="si-unit">{{ it.unit }}</span></span>
    </button>
  </div>
</template>

<style scoped>
.stat-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}
.stat-item {
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 4px;
  padding: 8px 6px;
  border: 1px solid #e8e4f8;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.85);
  cursor: pointer;
  font-family: inherit;
  transition: border-color 0.15s, background 0.15s, box-shadow 0.15s;
}
.stat-item:hover {
  border-color: #7c3aed;
  background: #fff;
  box-shadow: 0 2px 6px rgba(124, 58, 237, 0.12);
}
.si-label {
  font-size: 12px;
  color: #6b7280;
  flex: none;
}
.si-value {
  font-size: 16px;
  font-weight: 700;
  color: #1a6fff;
  line-height: 1;
}
.si-unit {
  font-size: 11px;
  font-weight: 500;
  color: #9ca3af;
  margin-left: 1px;
}
/* 警示项（催单/投诉且 >0）：颜色=需要注意 */
.stat-item.warn .si-value {
  color: #d97706;
}
.stat-item.warn {
  border-color: #fcd34d;
  background: #fffbeb;
}
.stat-item.warn:hover {
  border-color: #d97706;
}
</style>
