<script setup lang="ts">
import type { NotifyRecord } from '@/views/tickets/types/operationTabs';

defineProps<{ records: NotifyRecord[] }>();
</script>

<template>
  <div class="notify-tab">
    <div v-for="r in records" :key="r.id" class="record-card">
      <div class="card-head">
        <div class="title-left">
          <span class="icon-wrap" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M11 6a13 13 0 0 0 8.667 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
              <path d="M11 6V4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
              <path d="M11 6H4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
              <path d="M6 10v4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
              <path d="M6 10H4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
              <path d="M6 14h2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
              <path d="M18 8v8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
              <path d="M18 8h2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
              <path d="M18 16h2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </span>
          <span class="title-text">{{ r.title }}</span>
        </div>
        <span class="card-meta">接收人: {{ r.receiver }} | {{ r.when }}</span>
      </div>
      <div class="content-area">
        <div class="meta-line">通知方式: {{ r.channel }} | 状态: {{ r.status }}</div>
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
  padding: 12px 14px;
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

.icon-wrap {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  color: #6b7280;
  line-height: 0;
}

.icon-wrap svg {
  display: block;
  width: 16px;
  height: 16px;
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
