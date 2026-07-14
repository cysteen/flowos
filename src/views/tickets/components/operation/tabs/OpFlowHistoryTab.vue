<script setup lang="ts">
import { computed, ref } from 'vue';
import type { TimelineEntry } from '@/views/tickets/types/ticketDetail';
import OpFlowChartModal from '../OpFlowChartModal.vue';
import OpTimeline from '../../OpTimeline.vue';

// 处理履历 = 完整事件时间线（全量事件流，实时随操作追加）
const props = defineProps<{
  currentNode: string;
  entries: TimelineEntry[];
}>();

// 按时间倒序展示：最新事件在上
const orderedEntries = computed(() => [...props.entries].reverse());

const flowChartOpen = ref(false);
function viewFlow() {
  flowChartOpen.value = true;
}
</script>

<template>
  <div class="flow-history">
    <div class="current-bar">
      <div class="current-label">
        <span class="current-prefix">当前状态:</span>
        <strong class="current-value">{{ currentNode }}</strong>
      </div>
      <button type="button" class="flow-link" @click="viewFlow">查看流程图</button>
    </div>

    <!-- 完整事件时间线：全流程关键事件（建单/流转/对客沟通/催办/解决/好评），时间倒序 -->
    <OpTimeline :entries="orderedEntries" />

    <OpFlowChartModal v-model:open="flowChartOpen" :current-node="currentNode" />
  </div>
</template>

<style scoped>
.flow-history {
  display: flex;
  flex-direction: column;
  width: 100%;
}

/* 对齐参考原型 tab-flow 顶栏 */
.current-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
  padding: 6px 12px;
  background: #f0f7ff;
  border: 1px solid #d6e4ff;
  border-radius: 6px;
  font-size: 12px;
  flex: none;
}

.current-label {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.current-prefix {
  color: #374151;
  font-weight: 400;
}

.current-value {
  color: #1a6fff;
  font-weight: 600;
}

.flow-link {
  margin: 0;
  padding: 0;
  border: none;
  background: none;
  font-family: inherit;
  color: #1a6fff;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  flex: none;
  white-space: nowrap;
}

.flow-link:hover {
  text-decoration: underline;
}
</style>
