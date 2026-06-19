<script setup lang="ts">
import { message } from 'ant-design-vue';
import type { FlowHistoryNode } from '@/views/tickets/types/operationTabs';

defineProps<{
  currentNode: string;
  nodes: FlowHistoryNode[];
}>();

function viewFlow() {
  message.info('查看流程图（演示）');
}
</script>

<template>
  <div class="flow-history">
    <div class="current-bar">
      <span>当前节点: <strong>{{ currentNode }}</strong></span>
      <span class="link" @click="viewFlow">查看流程图</span>
    </div>

    <div class="timeline">
      <div v-for="(node, i) in nodes" :key="node.id" class="node-row">
        <div class="rail">
          <span class="dot" :class="{ active: node.active }" />
          <span v-if="i < nodes.length - 1" class="line" />
        </div>
        <div class="node-main">
          <div class="node-head">
            <span class="node-title">{{ node.title }}</span>
            <span class="node-meta">操作人: {{ node.operator }} | {{ node.when }}</span>
          </div>
          <div class="node-desc">{{ node.desc }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.flow-history { display: flex; flex-direction: column; gap: 16px; }
.current-bar {
  display: flex; align-items: center; justify-content: space-between;
  background: #f0f7ff; border: 1px solid #d6e4ff; border-radius: 6px;
  padding: 10px 14px; font-size: 13px; color: #374151;
}
.current-bar strong { color: #1a6fff; font-weight: 600; }
.link { color: #1a6fff; font-size: 12px; font-weight: 500; cursor: pointer; }
.timeline { display: flex; flex-direction: column; }
.node-row { display: flex; gap: 12px; }
.rail {
  display: flex; flex-direction: column; align-items: center; width: 10px; flex: none;
  padding-top: 4px;
}
.dot {
  width: 10px; height: 10px; border-radius: 50%; background: #1a6fff; flex: none;
}
.dot.active { box-shadow: 0 0 0 3px #1a6fff33; }
.line { width: 2px; flex: 1; min-height: 36px; background: #e5e7eb; margin: 8px 0; }
.node-main { flex: 1; padding-bottom: 16px; min-width: 0; }
.node-head {
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
  flex-wrap: wrap; margin-bottom: 4px;
}
.node-title { font-size: 14px; font-weight: 600; color: #111827; }
.node-meta { font-size: 11px; color: #9ca3af; }
.node-desc { font-size: 12px; color: #6b7280; line-height: 1.6; }
</style>
