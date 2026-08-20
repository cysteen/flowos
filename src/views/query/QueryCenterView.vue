<script setup lang="ts">
/**
 * 查询中心（方案 A）
 * 统一检索入口 + 「查工单 / 查客户」双视图；顶栏 GlobalSearch 与本页搜索条共用分流逻辑。
 */
import { computed, nextTick, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { message } from 'ant-design-vue';
import { SearchOutlined, FilterOutlined } from '@ant-design/icons-vue';
import TicketListView from '@/views/tickets/TicketListView.vue';
import CustomerInsightView from '@/views/customer/CustomerInsightView.vue';
import {
  detectQueryKind,
  searchCustomers,
  QUERY_KIND_LABEL,
} from '@/mock/customerInsight';
import { TICKETS } from '@/mock/tickets';
import { useUserStore } from '@/stores/user';
import {
  queryCenterLocation,
  type QueryCenterTab,
} from './queryCenterRoute';

const route = useRoute();
const router = useRouter();
const user = useUserStore();

const keyword = ref('');
const filtersExpanded = ref(false);
const customerRef = ref<InstanceType<typeof CustomerInsightView> | null>(null);

const canTicketsTab = computed(() => user.canAccess('tickets'));
const canCustomerTab = computed(() => user.canAccess('query-center'));

const activeTab = computed<QueryCenterTab>(() => {
  const t = route.query.tab;
  if (t === 'customer') return 'customer';
  if (t === 'tickets' && canTicketsTab.value) return 'tickets';
  return canTicketsTab.value ? 'tickets' : 'customer';
});

const kindHint = computed(() =>
  keyword.value.trim() ? QUERY_KIND_LABEL[detectQueryKind(keyword.value)] : '',
);

function setTab(tab: QueryCenterTab, extra: Record<string, string | undefined> = {}) {
  router.replace(queryCenterLocation(tab, { ...route.query as Record<string, string>, tab, ...extra }));
}

function syncKeywordFromRoute() {
  const q = (route.query.q as string) || (route.query.kw as string) || '';
  if (q !== keyword.value) keyword.value = q;
}

async function runSearch(fromRoute = false) {
  const q = keyword.value.trim();
  if (!q) {
    message.info('请输入工单号、手机号、客户姓名或关键词');
    return;
  }

  const kind = detectQueryKind(q);

  if (kind === 'ticket') {
    const key = q.toUpperCase();
    const hit = TICKETS.find((t) => t.no.toUpperCase() === key || t.no.endsWith(key));
    if (hit) {
      router.push(`/tickets/${hit.no}`);
      return;
    }
    const res = searchCustomers(q);
    if (res.candidates.length === 1) {
      setTab('customer', { q: res.candidates[0].phone });
      await nextTick();
      customerRef.value?.runSearch(res.candidates[0].phone);
      return;
    }
    if (canTicketsTab.value) {
      setTab('tickets', { kw: q, q: undefined });
    } else {
      setTab('customer', { q });
      await nextTick();
      customerRef.value?.runSearch(q);
    }
    if (!fromRoute) message.info('未在当前工单库中找到该单号，已按关键词检索');
    return;
  }

  if (kind === 'phone' || kind === 'sn') {
    setTab('customer', { q });
    await nextTick();
    customerRef.value?.runSearch(q);
    return;
  }

  const res = searchCustomers(q);
  if (res.candidates.length >= 1) {
    setTab('customer', { q });
    await nextTick();
    customerRef.value?.runSearch(q);
    return;
  }

  if (canTicketsTab.value) {
    setTab('tickets', { kw: q, q: undefined });
  } else {
    message.warning('未匹配到客户档案');
  }
}

function onTabClick(tab: QueryCenterTab) {
  if (tab === 'tickets' && !canTicketsTab.value) return;
  if (tab === 'customer') filtersExpanded.value = false;
  setTab(tab);
}

function toggleFilters() {
  filtersExpanded.value = !filtersExpanded.value;
}

function onListOpenCustomer(q: string) {
  setTab('customer', { q });
  keyword.value = q;
  nextTick(() => customerRef.value?.runSearch(q));
}

watch(
  () => [route.query.tab, route.query.q, route.query.kw],
  async () => {
    syncKeywordFromRoute();
    if (activeTab.value === 'customer') {
      const q = (route.query.q as string) || '';
      if (q) {
        await nextTick();
        customerRef.value?.runSearch(q);
      }
    }
  },
  { immediate: true },
);
</script>

<template>
  <div class="query-center">
    <header class="qc-toolbar">
      <nav class="qc-tabs-inline" role="tablist" aria-label="查询视图">
        <button
          v-if="canTicketsTab"
          type="button"
          role="tab"
          class="qc-tab-pill"
          :class="{ active: activeTab === 'tickets' }"
          :aria-selected="activeTab === 'tickets'"
          title="全量库 · 筛选 · 批量 · 导出"
          @click="onTabClick('tickets')"
        >
          查工单
        </button>
        <button
          type="button"
          role="tab"
          class="qc-tab-pill"
          :class="{ active: activeTab === 'customer' }"
          :aria-selected="activeTab === 'customer'"
          title="档案 · 全景统计 · 历史履历"
          @click="onTabClick('customer')"
        >
          查客户
        </button>
      </nav>

      <div class="qc-search">
        <SearchOutlined class="qc-search-ic" />
        <input
          v-model="keyword"
          class="qc-search-input"
          placeholder="工单号 / 手机号 / 客户姓名 / 关键词"
          @keyup.enter="runSearch()"
        />
        <span v-if="kindHint" class="qc-kind">{{ kindHint }}</span>
        <button type="button" class="qc-search-btn" @click="runSearch()">查询</button>
        <button
          v-if="activeTab === 'tickets' && canTicketsTab"
          type="button"
          class="qc-filter-btn"
          :class="{ active: filtersExpanded }"
          title="筛选条件"
          aria-label="展开筛选条件"
          :aria-expanded="filtersExpanded"
          @click="toggleFilters"
        >
          <FilterOutlined />
        </button>
      </div>
    </header>

    <div class="qc-body">
      <TicketListView
        v-if="activeTab === 'tickets' && canTicketsTab"
        embedded
        :filters-expanded="filtersExpanded"
        @open-customer="onListOpenCustomer"
      />
      <CustomerInsightView
        v-else
        ref="customerRef"
        shell-mode
      />
    </div>
  </div>
</template>

<style scoped>
/* 96px = 顶栏 56 + 页签 40；列表区占满剩余视口并在内部滚动 */
.query-center {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 96px);
  min-width: 0;
  overflow: hidden;
  background: var(--flowos-tab-active-bg, #f9fafb);
}

.qc-toolbar {
  flex: none;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 16px;
  background: #fff;
  border-bottom: 1px solid #e5e7eb;
}

.qc-tabs-inline {
  display: flex;
  gap: 4px;
  flex: none;
}

.qc-tab-pill {
  height: 32px;
  padding: 0 14px;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  background: #f9fafb;
  color: #6b7280;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  font-family: inherit;
  transition: color 0.15s, border-color 0.15s, background 0.15s;
}

.qc-tab-pill:hover {
  color: #374151;
  border-color: #cbd5e1;
}

.qc-tab-pill.active {
  color: #1a6fff;
  border-color: #1a6fff;
  background: #eff6ff;
  font-weight: 600;
}

.qc-search {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
  height: 36px;
  padding: 0 10px 0 12px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #f9fafb;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.qc-search:focus-within {
  border-color: #1a6fff;
  background: #fff;
  box-shadow: 0 0 0 3px rgba(26, 111, 255, 0.1);
}

.qc-search-ic { color: #9ca3af; font-size: 14px; flex: none; }

.qc-search-input {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  font-size: 13px;
  color: #111827;
  font-family: inherit;
}

.qc-kind {
  flex: none;
  font-size: 10px;
  font-weight: 600;
  color: #1a6fff;
  background: #eff6ff;
  border-radius: 3px;
  padding: 2px 6px;
  white-space: nowrap;
}

.qc-search-btn {
  flex: none;
  height: 28px;
  padding: 0 14px;
  border: none;
  border-radius: 6px;
  background: #1a6fff;
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  font-family: inherit;
}

.qc-search-btn:hover { background: #1558d6; }

.qc-filter-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  background: #fff;
  color: #6b7280;
  font-size: 13px;
  cursor: pointer;
  font-family: inherit;
  transition: color 0.15s, border-color 0.15s, background 0.15s;
}

.qc-filter-btn:hover,
.qc-filter-btn.active {
  color: #1a6fff;
  border-color: #1a6fff;
  background: #eff6ff;
}

.qc-body {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
</style>
