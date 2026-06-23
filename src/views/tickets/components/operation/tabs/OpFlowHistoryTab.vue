<script setup lang="ts">
import { message } from 'ant-design-vue';
import type { FlowHistoryNode } from '@/views/tickets/types/operationTabs';

defineProps<{
  currentNode: string;
  nodes: FlowHistoryNode[];
}>();

function viewFlow() {
  message.info('查看流程图');
}
</script>

<template>
  <div class="flow-history">
    <div class="current-bar">
      <div class="current-label">
        <span class="current-prefix">当前节点:</span>
        <strong class="current-value">{{ currentNode }}</strong>
      </div>
      <button type="button" class="flow-link" @click="viewFlow">查看流程图</button>
    </div>

    <div class="timeline-panel">
      <div class="timeline">
        <div v-for="(node, i) in nodes" :key="node.id" class="node-row">
          <div class="rail">
            <span class="dot" :class="{ active: node.active }" />
            <span v-if="i < nodes.length - 1" class="line" />
          </div>
          <div class="node-main" :class="{ 'is-last': i === nodes.length - 1 }">
            <div class="node-head">
              <span class="node-title" :class="{ active: node.active }">{{ node.title }}</span>
              <span class="node-meta">操作人: {{ node.operator }} | {{ node.when }}</span>
            </div>
            <div class="node-desc">{{ node.desc }}</div>
          </div>
        </div>
      </div>
    </div>
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
  margin-bottom: 14px;
  padding: 10px 14px;
  background: #f0f7ff;
  border: 1px solid #d6e4ff;
  border-radius: 6px;
  font-size: 13px;
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

.timeline-panel {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #fff;
  padding: 14px 16px;
}

.timeline {
  display: flex;
  flex-direction: column;
}

.node-row {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}

.rail {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 10px;
  flex: none;
  gap: 8px;
}

.dot {
  width: 10px;
  height: 10px;
  border-radius: 5px;
  background: #1a6fff;
  flex: none;
}

.dot.active {
  box-shadow: 0 0 0 3px rgba(26, 111, 255, 0.2);
}

.line {
  width: 2px;
  height: 36px;
  background: #e5e7eb;
  flex: none;
}

.node-main {
  flex: 1;
  min-width: 0;
  padding-bottom: 14px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.node-main.is-last {
  padding-bottom: 0;
}

.node-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.node-title {
  font-size: 14px;
  font-weight: 600;
  color: #111827;
  flex: none;
}

.node-title.active {
  color: #1a6fff;
}

.node-meta {
  font-size: 11px;
  color: #9ca3af;
  flex: none;
}

.node-desc {
  font-size: 12px;
  color: #6b7280;
  line-height: 1.55;
}
</style>
