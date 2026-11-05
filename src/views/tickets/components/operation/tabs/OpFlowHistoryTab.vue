<script setup lang="ts">
import { computed, ref } from 'vue';
import { TICKETS } from '@/mock/tickets';
import type { TicketDetailMeta } from '@/mock/ticketDetail';
import type { TimelineEntry } from '@/views/tickets/types/ticketDetail';
import {
  handlerGroupOf,
  statusDisplayName,
  unclaimedDisplayName,
  type Ticket,
} from '@/views/tickets/types/ticket';
import { resolveCurrentFlowNode } from '@/views/tickets/utils/ticketFlowNodes';
import OpFlowChartModal from '../OpFlowChartModal.vue';
import OpTimeline from '../../OpTimeline.vue';

// 处理履历 = 完整事件时间线（全量事件流，实时随操作追加）
const props = defineProps<{
  detail: TicketDetailMeta;
  ticketNo: string;
  entries: TimelineEntry[];
}>();

// 按时间倒序展示：最新事件在上
const orderedEntries = computed(() => [...props.entries].reverse());

/** 状态展示名：与页头状态徽章同一判法 */
const statusText = computed(() => (props.detail.status === '未认领'
  ? unclaimedDisplayName({ no: props.ticketNo, groupId: props.detail.groupId })
  : statusDisplayName(props.detail.status)));

const handlerName = computed(() => props.detail.lastHandler || '—');

const handlerGroup = computed(() => props.detail.groupNames?.[0]
  || handlerGroupOf(props.detail.lastHandler)?.label
  || '—');

/** 当前节点：与列表「当前节点」列同一判法，状态取本页现值 */
const flowNode = computed(() => {
  const row = TICKETS.find((t) => t.no === props.ticketNo);
  return resolveCurrentFlowNode({ flowNode: row?.flowNode, nodeStatus: props.detail.status } as Ticket);
});

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
        <strong class="current-value">{{ statusText }}</strong>
        <span class="current-sep">·</span>
        <span class="current-prefix">处理人：</span>
        <strong class="current-value">{{ handlerName }}</strong>
        <span class="current-sep">·</span>
        <span class="current-prefix">处理组：</span>
        <strong class="current-value">{{ handlerGroup }}</strong>
        <span class="current-sep">·</span>
        <span class="current-prefix">当前节点：</span>
        <strong class="current-value">{{ flowNode }}</strong>
      </div>
      <button type="button" class="flow-link" @click="viewFlow">查看流程图</button>
    </div>

    <!-- 完整事件时间线：全流程关键事件（建单/流转/对客沟通/催办/解决/好评），时间倒序 -->
    <OpTimeline :entries="orderedEntries" />

    <OpFlowChartModal v-model:open="flowChartOpen" :current-node="detail.status" />
  </div>
</template>

<style scoped>
.flow-history {
  display: flex;
  flex-direction: column;
  gap: 16px;
  width: 100%;
}

/* 对齐参考原型 tab-flow 顶栏 */
.current-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px;
  background: #f0f7ff;
  border: 1px solid #d6e4ff;
  border-radius: 6px;
  font-size: 13px;
  line-height: 19.5px;
  flex: none;
}

.current-label {
  display: flex;
  flex-wrap: wrap;
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

.current-sep {
  color: #9ca3af;
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
