<script setup lang="ts">
import { message } from 'ant-design-vue';
import type { SurveyRecord } from '@/views/tickets/types/operationTabs';

defineProps<{ records: SurveyRecord[] }>();

function openSurvey(label?: string) {
  message.info(`打开${label ?? '问卷'}（演示）`);
}
</script>

<template>
  <div class="survey-tab">
    <div
      v-for="r in records"
      :key="r.id"
      class="record-card"
      :class="{ pending: r.pending, done: r.evaluated }"
    >
      <div class="card-head">
        <span class="card-title">📋 {{ r.title }}</span>
        <span class="card-meta">{{ r.pending ? '待发送' : `发送时间: ${r.sentAt}` }}</span>
      </div>

      <div v-if="!r.pending" class="detail-row">
        <span class="muted">是否评价: {{ r.evaluated ? '已评价' : '未评价' }}</span>
        <template v-if="r.linkLabel">
          <span class="muted"> | 问卷链接: </span>
          <span class="link" @click="openSurvey(r.linkLabel)">{{ r.linkLabel }}</span>
        </template>
      </div>

      <div v-if="r.conclusion" class="sub-label">评价结论</div>
      <div v-if="r.conclusion" class="content-box">{{ r.conclusion }}</div>
    </div>
  </div>
</template>

<style scoped>
.survey-tab { display: flex; flex-direction: column; gap: 12px; }
.record-card {
  border-radius: 8px; padding: 12px 14px; border-left: 3px solid;
  display: flex; flex-direction: column; gap: 8px;
}
.record-card.done { background: #f5f3ff; border-left-color: #7c3aed; }
.record-card.pending { background: #f9fafb; border-left-color: #9ca3af; }
.card-head {
  display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap;
}
.card-title { font-size: 14px; font-weight: 600; color: #111827; }
.card-meta { font-size: 11px; color: #9ca3af; }
.detail-row { font-size: 12px; }
.muted { color: #6b7280; }
.link { color: #1a6fff; font-weight: 500; cursor: pointer; }
.sub-label { font-size: 12px; font-weight: 600; color: #374151; }
.content-box {
  background: #fff; border: 1px solid #e5e7eb; border-radius: 6px;
  padding: 10px; font-size: 12px; color: #6b7280; line-height: 1.6;
}
</style>
