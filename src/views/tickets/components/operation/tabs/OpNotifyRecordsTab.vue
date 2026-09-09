<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { BellOutlined } from '@ant-design/icons-vue';
import type { NotifyRecord } from '@/views/tickets/types/operationTabs';
import { useNotifyLogStore } from '@/stores/notifyLog';

const props = defineProps<{ records: NotifyRecord[] }>();

const route = useRoute();
const notifyLog = useNotifyLogStore();

/**
 * 工单号从路由取，不从 props 要。
 *
 * 【为什么】本 Tab 的父组件传的是「按工单类型预置好的一份样本」，本来就不带单号；
 * 为了一个只有本 Tab 用得上的字段去改父组件的 props 链，改动面比这行大得多。
 * 同目录的客户历史 Tab 取客户手机号走的也是这条路。
 */
const ticketNo = computed(() => String(route.params.ticketNo ?? ''));

/**
 * 运行时通知（风险报备五个事件，O22）与预置通知**合并展示**。
 *
 * 【为什么运行时那批排在前面】它们是本次会话里刚刚发生的，时刻恒晚于预置样本；
 * 而通知列表的一贯读法是最新在最上。运行时那批在 store 里已按时间倒序，
 * 预置那批**原样保留、顺序不动** —— 它们各自成段，不做全局重排：
 * 预置样本的时刻是写死的日期，跟当下时刻混排会把两批数据交错成一串读不出脉络的流水。
 */
const mergedRecords = computed<NotifyRecord[]>(() => [
  ...notifyLog.recordsOf(ticketNo.value),
  ...props.records,
]);

/** 接收人只展示姓名/组名，去掉括号内的角色说明 */
function displayReceiver(receiver: string) {
  return receiver.replace(/\s*\([^)]*\)/g, '').trim();
}
</script>

<template>
  <div class="notify-tab">
    <div v-for="r in mergedRecords" :key="r.id" class="record-card">
      <div class="card-head">
        <div class="title-left">
          <BellOutlined class="kind-icon" />
          <span class="title-text">{{ r.title }}</span>
        </div>
        <span class="card-meta">接收人: {{ displayReceiver(r.receiver) }} | {{ r.when }}</span>
      </div>
      <div class="content-area">
        <div class="meta-line">通知方式: {{ r.channel }}</div>
        <div class="content-box">{{ r.content }}</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.notify-tab {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
  font-family: inherit;
}

.record-card {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.record-card:hover {
  border-color: #d1d5db;
}

.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 20px;
}

.title-left {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  flex: 1;
}

.kind-icon {
  font-size: 14px;
  color: #6b7280;
  flex: none;
}

.title-text {
  font-size: 14px;
  font-weight: 600;
  color: #111827;
  line-height: 20px;
  min-width: 0;
}

.card-meta {
  font-size: 11px;
  font-weight: 400;
  color: #9ca3af;
  flex: none;
  white-space: nowrap;
  line-height: 20px;
}

.content-area {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.meta-line {
  font-size: 12px;
  font-weight: 400;
  color: #6b7280;
  line-height: 18px;
}

.content-box {
  background: #f9fafb;
  border: 1px solid #f0f0f0;
  border-radius: 6px;
  padding: 10px;
  font-size: 12px;
  font-weight: 400;
  color: #6b7280;
  line-height: 1.6;
}
</style>
