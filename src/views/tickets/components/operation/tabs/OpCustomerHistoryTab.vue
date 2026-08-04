<script setup lang="ts">
import { computed, ref } from 'vue';
import { message } from 'ant-design-vue';
import { useRoute, useRouter } from 'vue-router';
import { ExportOutlined, ArrowRightOutlined } from '@ant-design/icons-vue';
import { aftersaleDeepLink } from '@/views/tickets/composables/opActions';
import { TICKETS } from '@/mock/tickets';
import type { CustomerHistoryData, CustomerHistoryFilter, CustomerHistoryTicket } from '@/views/tickets/types/operationTabs';

const props = defineProps<{ data: CustomerHistoryData }>();

const route = useRoute();
const router = useRouter();

/** 本 Tab 只列该客户的工单卡片；完整履历（联系记录/售后/满意度/风险）在客户全景页 */
const currentPhone = computed(
  () => TICKETS.find((t) => t.no === String(route.params.ticketNo ?? ''))?.customerPhone ?? '',
);

function openInsight() {
  router.push({ path: '/customer-insight', query: { q: currentPhone.value || props.data.customerName } });
}

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

/** channel='售后' 即来源标记（D10 复用现有字段，零新增） */
function isAftersale(t: CustomerHistoryTicket) {
  return t.channel === '售后';
}

/** 售后历史单点单号 → 深链跳售后系统；客服单站内打开 */
function openTicket(t: CustomerHistoryTicket) {
  if (isAftersale(t)) {
    window.open(aftersaleDeepLink(t.no), '_blank', 'noopener');
    return;
  }
  message.info(`打开工单 ${t.no}`);
}
</script>

<template>
  <div class="customer-history-tab">
    <div class="summary-bar">
      <span>当前客户：{{ data.customerName }} · 历史工单 {{ data.totalCount }} 单 · 投诉 {{ data.complaintCount }} 单</span>
      <button type="button" class="insight-link" @click="openInsight">
        查看客户全景<ArrowRightOutlined class="link-ic" />
      </button>
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
        :class="{ 'history-card--aftersale': isAftersale(t) }"
      >
        <div class="card-top">
          <div class="title-row">
            <span v-if="isAftersale(t)" class="src-badge">售后</span>
            <span class="status-tag" :style="statusStyle(t)">{{ t.status }}</span>
            <h3 class="card-title">{{ t.title }}</h3>
          </div>
          <time class="card-date">{{ t.date }}</time>
        </div>

        <div class="meta-row">
          <button type="button" class="ticket-no" @click="openTicket(t)">
            {{ t.no }}<ExportOutlined v-if="isAftersale(t)" class="no-ext" />
          </button>
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
  gap: 8px;
  width: 100%;
  font-family: inherit;
}

.summary-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 8px 12px;
  font-size: 12px;
  font-weight: 400;
  color: #374151;
  line-height: 20px;
}

.insight-link {
  flex: none;
  margin: 0;
  padding: 0;
  border: none;
  background: none;
  font-family: inherit;
  font-size: 12px;
  font-weight: 600;
  color: #1a6fff;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.insight-link:hover { text-decoration: underline; }
.link-ic { font-size: 10px; }

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
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* 售后来源：虚线外框，与关联单 Tab 的售后卡片同一视觉语言 */
.history-card--aftersale { border-style: dashed; }

.src-badge {
  flex: none;
  font-size: 10px;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 4px;
  color: #0e7490;
  background: #cffafe;
}

.no-ext { margin-left: 3px; font-size: 10px; }

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
