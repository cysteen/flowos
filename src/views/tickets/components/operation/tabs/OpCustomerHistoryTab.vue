<script setup lang="ts">
import { computed, ref } from 'vue';
import { message } from 'ant-design-vue';
import type { CustomerHistoryData, CustomerHistoryFilter, CustomerHistoryTicket } from '@/views/tickets/types/operationTabs';

const props = defineProps<{ data: CustomerHistoryData }>();

const activeFilter = ref<CustomerHistoryFilter>('all');

const FILTERS: { key: CustomerHistoryFilter; label: (d: CustomerHistoryData) => string }[] = [
  { key: 'all', label: (d) => `全部(${d.totalCount})` },
  { key: 'processing', label: (d) => `处理中(${d.processingCount})` },
  { key: 'closed', label: (d) => `已关闭(${d.closedCount})` },
  { key: 'complaint', label: (d) => `投诉(${d.complaintCount})` },
];

const filteredTickets = computed(() => {
  const list = props.data.tickets;
  switch (activeFilter.value) {
    case 'processing':
      return list.filter((t) => t.isProcessing);
    case 'closed':
      return list.filter((t) => t.isClosed);
    case 'complaint':
      return list.filter((t) => t.isComplaint);
    default:
      return list;
  }
});

function statusStyle(t: CustomerHistoryTicket) {
  if (t.isProcessing) {
    return { color: '#1a6fff', background: '#1a6fff18' };
  }
  return { color: '#10b981', background: '#10b98118' };
}

function openTicket(no: string) {
  message.info(`打开工单 ${no}`);
}
</script>

<template>
  <div class="customer-history-tab">
    <div class="summary-bar">
      当前客户：{{ data.customerName }} · 历史工单 {{ data.totalCount }} 单 · 投诉 {{ data.complaintCount }} 单
    </div>

    <div class="filter-row" role="tablist">
      <button
        v-for="f in FILTERS"
        :key="f.key"
        type="button"
        role="tab"
        class="filter-chip"
        :class="{ active: activeFilter === f.key }"
        :aria-selected="activeFilter === f.key"
        @click="activeFilter = f.key"
      >
        {{ f.label(data) }}
      </button>
    </div>

    <div class="ticket-list">
      <article
        v-for="t in filteredTickets"
        :key="t.id"
        class="history-card"
      >
        <div class="card-top">
          <div class="title-row">
            <span class="status-tag" :style="statusStyle(t)">{{ t.status }}</span>
            <h3 class="card-title">{{ t.title }}</h3>
          </div>
          <time class="card-date">{{ t.date }}</time>
        </div>

        <div class="meta-row">
          <button type="button" class="ticket-no" @click="openTicket(t.no)">{{ t.no }}</button>
          <span class="sep" aria-hidden="true">·</span>
          <span class="type-tag" :style="{ color: t.typeColor, background: t.typeBgColor }">{{ t.type }}</span>
          <span class="sep" aria-hidden="true">·</span>
          <span class="channel">{{ t.channel }}</span>
        </div>

        <p class="summary-text">{{ t.summary }}</p>
      </article>
    </div>
  </div>
</template>

<style scoped>
/* M5Dpdo Tab⑨：摘要 13；筛选 chip 12；卡片 gap 10，内 gap 8 */
.customer-history-tab {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
  font-family: inherit;
}

.summary-bar {
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 12px 16px;
  font-size: 13px;
  font-weight: 400;
  color: #374151;
  line-height: 20px;
}

.filter-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.filter-chip {
  margin: 0;
  padding: 4px 10px;
  border-radius: 4px;
  border: none;
  background: #f3f4f6;
  color: #6b7280;
  font-size: 12px;
  font-weight: 500;
  line-height: 18px;
  cursor: pointer;
  font-family: inherit;
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  white-space: nowrap;
}
.filter-chip.active {
  background: #eff6ff;
  border: 1px solid #1a6fff;
  color: #1a6fff;
  font-weight: 600;
}

.ticket-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.history-card {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 22px;
}

.title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex: 1;
}

.status-tag {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 600;
  line-height: 1;
  padding: 2px 8px;
  border-radius: 4px;
  white-space: nowrap;
}

.card-title {
  margin: 0;
  flex: 1;
  min-width: 0;
  font-size: 13px;
  font-weight: 600;
  color: #111827;
  line-height: 18px;
}

.card-date {
  flex: none;
  font-size: 11px;
  font-weight: 400;
  color: #9ca3af;
  line-height: 18px;
  white-space: nowrap;
}

.meta-row {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  min-height: 18px;
}

.ticket-no {
  margin: 0;
  padding: 0;
  border: none;
  background: none;
  font-size: 12px;
  font-weight: 500;
  color: #1a6fff;
  line-height: 18px;
  cursor: pointer;
  font-family: inherit;
}
.ticket-no:hover {
  text-decoration: underline;
}

.type-tag {
  flex: none;
  display: inline-flex;
  align-items: center;
  font-size: 10px;
  font-weight: 600;
  line-height: 14px;
  padding: 1px 6px;
  border-radius: 3px;
}

.channel {
  font-size: 11px;
  font-weight: 400;
  color: #6b7280;
  line-height: 18px;
}

.sep {
  font-size: 11px;
  font-weight: 400;
  color: #d1d5db;
  line-height: 18px;
  flex: none;
}

.summary-text {
  margin: 0;
  font-size: 12px;
  font-weight: 400;
  color: #6b7280;
  line-height: 18px;
}
</style>
