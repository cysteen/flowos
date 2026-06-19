<script setup lang="ts">
import { message } from 'ant-design-vue';
import type { NotifyRecord } from '@/views/tickets/types/operationTabs';

defineProps<{ records: NotifyRecord[] }>();

const STYLE: Record<NotifyRecord['kind'], { bg: string; border: string }> = {
  upgrade: { bg: '#fffbeb', border: '#f59e0b' },
  timeout: { bg: '#fef2f2', border: '#ef4444' },
  resolved: { bg: '#ecfdf5', border: '#10b981' },
};

function openLink() {
  message.info('查看通知详情（演示）');
}
</script>

<template>
  <div class="notify-tab">
    <div
      v-for="r in records"
      :key="r.id"
      class="record-card"
      :style="{ background: STYLE[r.kind].bg, borderLeftColor: STYLE[r.kind].border }"
    >
      <div class="card-head">
        <span class="card-title">🔔 {{ r.title }}</span>
        <span class="card-meta">接收人: {{ r.receiver }} | {{ r.when }}</span>
      </div>
      <div class="sub-label">通知内容</div>
      <div class="content-box" @click="openLink">{{ r.content }}</div>
    </div>
  </div>
</template>

<style scoped>
.notify-tab { display: flex; flex-direction: column; gap: 12px; }
.record-card {
  border-radius: 8px; padding: 12px 14px; border-left: 3px solid;
  display: flex; flex-direction: column; gap: 8px;
}
.card-head {
  display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap;
}
.card-title { font-size: 14px; font-weight: 600; color: #111827; }
.card-meta { font-size: 11px; color: #9ca3af; }
.sub-label { font-size: 12px; font-weight: 600; color: #374151; }
.content-box {
  background: #fff; border: 1px solid #e5e7eb; border-radius: 6px;
  padding: 10px; font-size: 12px; color: #6b7280; line-height: 1.6; cursor: pointer;
}
.content-box:hover { border-color: #d1d5db; }
</style>
