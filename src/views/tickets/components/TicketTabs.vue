<script setup lang="ts">
import { computed } from 'vue';
import { TABS, type WorkbenchTabKey } from '@/views/tickets/types/ticket';

const props = defineProps<{
  active: WorkbenchTabKey;
  /**
   * 各页签的徽章数。**按 key 索引而不是按 `Record<TabKey, number>` 收死**：
   * 页签栏里已经有一枚不装工单的（风险报备池，见 `WorkbenchTabKey`），
   * 它的数来自报备单而不是工单数组，凑不进按工单 Tab 建的那张表。
   * 取不到就按 0 显示（`badgeCount`），少一个键不会让整栏渲染不出来。
   */
  counts: Record<string, number>;
  hiddenTabs: string[];
}>();
const emit = defineEmits<{ change: [tab: WorkbenchTabKey] }>();

const visibleTabs = computed(() => TABS.filter((t) => !props.hiddenTabs.includes(t.key)));

function badgeCount(key: WorkbenchTabKey): number {
  return props.counts[key] ?? 0;
}
</script>

<template>
  <div class="ticket-tabs">
    <div
      v-for="tab in visibleTabs"
      :key="tab.key"
      class="tab"
      :class="{ active: tab.key === active }"
      @click="emit('change', tab.key)"
    >
      <span class="tab-label">{{ tab.label }}</span>
      <span
        class="tab-badge"
        :style="
          tab.key === active
            ? { background: '#1A6FFF', color: '#FFFFFF' }
            : { background: '#F3F4F6', color: '#6B7280' }
        "
        >{{ badgeCount(tab.key) }}</span
      >
    </div>
  </div>
</template>

<style scoped>
.ticket-tabs {
  display: flex;
  gap: 4px;
  padding: 0 16px;
}
.tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 12px 14px;
  cursor: pointer;
  border-bottom: 2px solid transparent;
}
.tab-label {
  font-size: 14px;
  color: #6b7280;
}
.tab.active {
  border-bottom-color: #1a6fff;
}
.tab.active .tab-label {
  color: #1a6fff;
  font-weight: 600;
}
.tab-badge {
  font-size: 11px;
  font-weight: 600;
  padding: 1px 7px;
  border-radius: 9px;
  line-height: 16px;
}
</style>
