<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { InsightStats, InsightAction } from '@/views/tickets/types/operation';
import { insightSameTypeLabel } from '@/views/tickets/types/operation';

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
  /** 已读条数（仅催单 / 补充展示「已读 N」） */
  readCount?: number;
}

// 上排=客户维度（弹窗看明细）；下排=本单维度（跳对应 Tab）
const topItems = computed<StatItem[]>(() => {
  const i = props.insight;
  const sameTypeLabel = insightSameTypeLabel(props.ticketType);
  return [
    { key: 'inbound', label: '进线', value: i.inboundCount, unit: '次', action: { kind: 'modal', modalKey: 'inbound' } },
    { key: 'history', label: '历史', value: i.historyCount, unit: '单', action: { kind: 'modal', modalKey: 'history' } },
    {
      key: 'sameType',
      label: sameTypeLabel,
      value: i.sameTypeCount,
      unit: '单',
      warn: props.ticketType === '投诉',
      action: { kind: 'tab', tab: 'customerHistory' },
    },
    { key: 'recent30', label: '近30天', value: i.recent30Count, unit: '单', action: { kind: 'modal', modalKey: 'recent30' } },
  ];
});

const bottomItems = computed<StatItem[]>(() => {
  const i = props.insight;
  return [
    { key: 'dunning', label: '催单', value: i.dunningCount, unit: '次', warn: true, readCount: i.dunningReadCount ?? 0, action: { kind: 'tab', tab: 'related' } },
    { key: 'supplement', label: '补充', value: i.supplementCount, unit: '次', warn: true, readCount: i.supplementReadCount ?? 0, action: { kind: 'tab', tab: 'related' } },
    { key: 'related', label: '关联', value: i.relatedCount, unit: '个', action: { kind: 'tab', tab: 'related' } },
  ];
});

function isWarn(it: StatItem) {
  return !!it.warn && it.value > 0;
}

const bumpedKeys = ref<Set<string>>(new Set());

watch(
  () => props.insight.dunningCount,
  (next, prev) => {
    if (prev !== undefined && next > prev) pulse('dunning');
  },
);

watch(
  () => props.insight.supplementCount,
  (next, prev) => {
    if (prev !== undefined && next > prev) pulse('supplement');
  },
);

function pulse(key: string) {
  bumpedKeys.value = new Set(bumpedKeys.value).add(key);
  window.setTimeout(() => {
    const next = new Set(bumpedKeys.value);
    next.delete(key);
    bumpedKeys.value = next;
  }, 700);
}
</script>

<template>
  <div class="stat-grid">
    <div class="stat-row stat-row--top">
      <button
        v-for="it in topItems"
        :key="it.key"
        type="button"
        class="stat-item"
        :class="{ warn: isWarn(it), bump: bumpedKeys.has(it.key) }"
        :title="`查看${it.label}明细`"
        @click="emit('select', it.action)"
      >
        <span class="si-label">{{ it.label }}</span>
        <span class="si-value">{{ it.value }}<span class="si-unit">{{ it.unit }}</span></span>
      </button>
    </div>
    <div class="stat-row stat-row--bottom">
      <button
        v-for="it in bottomItems"
        :key="it.key"
        type="button"
        class="stat-item"
        :class="{ warn: isWarn(it), bump: bumpedKeys.has(it.key) }"
        :title="`查看${it.label}明细`"
        @click="emit('select', it.action)"
      >
        <span class="si-label">{{ it.label }}</span>
        <span class="si-value">{{ it.value }}<span class="si-unit">{{ it.unit }}</span></span>
        <span v-if="it.readCount !== undefined" class="si-read">已读 {{ it.readCount }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.stat-grid {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.stat-row {
  display: grid;
  gap: 8px;
}
.stat-row--top {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}
.stat-row--bottom {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}
.stat-item {
  display: inline-flex;
  flex-direction: row;
  align-items: baseline;
  justify-content: center;
  flex-wrap: nowrap;
  gap: 4px;
  padding: 8px 10px;
  border: 1px solid #e8e4f8;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.85);
  cursor: pointer;
  font-family: inherit;
  white-space: nowrap;
  min-width: 0;
  transition: border-color 0.15s, background 0.15s, box-shadow 0.15s;
}
.si-read {
  font-size: 11px;
  line-height: 1;
  color: #9ca3af;
  flex: none;
}
.stat-item.warn .si-read {
  color: #b45309;
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
/* 警示项（催单 / 补充 / 投诉单且 >0）：颜色=需要注意 */
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

.stat-item.bump {
  animation: stat-bump 0.65s ease;
}

@keyframes stat-bump {
  0% { transform: scale(1); }
  35% { transform: scale(1.06); box-shadow: 0 0 0 3px rgba(217, 119, 6, 0.2); }
  100% { transform: scale(1); }
}
</style>
