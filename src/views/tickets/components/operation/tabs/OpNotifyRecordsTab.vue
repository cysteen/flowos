<script setup lang="ts">
import { BellOutlined } from '@ant-design/icons-vue';
import type { NotifyRecord } from '@/views/tickets/types/operationTabs';

defineProps<{ records: NotifyRecord[] }>();

/** 接收人只展示姓名/组名，去掉括号内的角色说明 */
function displayReceiver(receiver: string) {
  return receiver.replace(/\s*\([^)]*\)/g, '').trim();
}
</script>

<template>
  <div class="notify-tab">
    <div v-for="r in records" :key="r.id" class="record-card">
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
