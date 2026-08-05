<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { message } from 'ant-design-vue';
import AppPagination from '@/components/AppPagination.vue';
import TicketListFilterCard from './components/TicketListFilterCard.vue';
import TicketListToolRow from './components/TicketListToolRow.vue';
import TicketRichList from './components/TicketRichList.vue';
import CreateTicketModal from './components/CreateTicketModal.vue';
import { useTicketList } from './composables/useTicketList';
import { TICKET_COLUMN_DEFS } from './composables/useTicketColumns';
import { type Ticket } from './types/ticket';

/** 工具列表默认列：不含产品分类/问题分类等扩展字段 */
const LIST_VISIBLE_COLUMNS = Object.fromEntries(
  TICKET_COLUMN_DEFS.map((c) => [c.key, c.defaultVisible !== false]),
);

const router = useRouter();
const route = useRoute();
const list = useTicketList();
const createOpen = ref(false);

/**
 * 看板 / 监控 / 搜索等入口：把 URL 参数落到筛选条件（工具页，无「我的/本组」视图 Tab）
 *
 * ⚠️ 提示只能有一条。本页被 KeepAlive 缓存，`onMounted` 与 `watch` 都会调到这里；
 * 从看板连点几张卡时又会连续导航。所以做两件事：
 *   ① 用 `appliedSig` 去重 —— 同一份 query 只应用一次；
 *   ② message 带固定 key —— 新提示**替换**旧的，而不是往下堆。
 */
const DRILL_MSG_KEY = 'ticket-list-drill';
let appliedSig = '';

function applyRouteQuery() {
  const q = route.query;
  const sig = JSON.stringify([q._from, q.status, q.priority, q.assignee, q.kw, q._label]);
  if (sig === appliedSig) return;
  appliedSig = sig;

  const hasBoard = typeof q._from === 'string' && q._from.startsWith('board.');
  const hasOpsFlow = typeof q._from === 'string' && q._from.startsWith('ops.flow.');

  if (typeof q.kw === 'string' && q.kw) {
    list.filters.keyword = q.kw;
    list.applyFilters();
    return;
  }

  if (!hasBoard && !hasOpsFlow && q.status == null && q.priority == null && q.assignee == null) return;

  if (typeof q.status === 'string' && q.status) {
    list.filters.status = q.status;
  }
  if (typeof q.priority === 'string' && q.priority) {
    list.filters.priority = q.priority;
  }
  if (typeof q.assignee === 'string' && q.assignee) {
    list.filters.assignee = q.assignee;
  }

  list.applyFilters();

  if (hasBoard || hasOpsFlow) {
    const label = typeof q._label === 'string' ? q._label : hasOpsFlow ? '运营监控' : '看板';
    message.info({ content: `已按「${label}」筛选工单列表`, key: DRILL_MSG_KEY, duration: 2.5 });
  }
}

onMounted(applyRouteQuery);
watch(
  () => [route.query._from, route.query.status, route.query.priority, route.query.assignee, route.query.kw, route.query._label],
  () => applyRouteQuery(),
);

function openOperation(t: Ticket) {
  router.push(`/tickets/${t.no}`);
}

/** 客户名 → 客户全景（手机号优先，缺失时按姓名查） */
function openCustomerInsight(t: Ticket) {
  router.push({ path: '/customer-insight', query: { q: t.customerPhone || t.customer } });
}

function onAction(label: string, t: Ticket) {
  if (['处理', '详情', '审核', '受理', '恢复'].includes(label)) {
    openOperation(t);
  } else if (label === '领单') {
    message.success(`已领取 ${t.no}`);
  } else {
    message.success(`已对 ${t.no} 执行「${label}」`);
  }
}

function onSearch() {
  list.applyFilters();
  message.success('已查询');
}

function onReset() {
  list.resetFilters();
}

function onBatch() {
  message.success(`已对已选 ${list.selectedCount.value} 单执行批量操作`);
  list.clearSelection();
}

function onCreated(t: Ticket) {
  list.addTicket(t);
}
</script>

<template>
  <div class="ticket-list">
    <TicketListFilterCard
      :filters="list.filters"
      @search="onSearch"
      @reset="onReset"
    />

    <TicketListToolRow
      :selected-count="list.selectedCount.value"
      @create="createOpen = true"
      @batch="onBatch"
      @export="message.info('导出当前筛选结果')"
      @columns="message.info('列设置')"
    />

    <div class="table-card">
      <TicketRichList
        :rows="list.paged.value"
        :selected-ids="list.selectedIds.value"
        :all-page-selected="list.allPageSelected.value"
        :visible-columns="LIST_VISIBLE_COLUMNS"
        @toggle="list.toggleSelect"
        @toggle-all="list.toggleSelectAllOnPage"
        @action="onAction"
        @click-no="openOperation"
        @click-customer="openCustomerInsight"
        @open="openOperation"
      />
      <div class="pager">
        <div class="pager-left">
          <span class="pager-total">共 {{ list.total.value }} 条</span>
          <span class="pager-selected">已选 {{ list.selectedCount.value }} 项</span>
        </div>
        <AppPagination
          :total="list.total.value"
          :current="list.current.value"
          :page-size="list.pageSize.value"
          :show-total="false"
          @change="list.setPage"
        />
      </div>
    </div>

    <CreateTicketModal v-model:open="createOpen" @created="onCreated" />
  </div>
</template>

<style scoped>
.ticket-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-height: 100%;
  width: 100%;
  min-width: 0;
  padding: 20px;
}
.table-card {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}
.pager {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  border-top: 1px solid #e5e7eb;
  flex: none;
}
.pager-left {
  display: flex;
  align-items: center;
  gap: 16px;
}
.pager-total {
  font-size: 13px;
  color: #6b7280;
}
.pager-selected {
  font-size: 13px;
  color: #9ca3af;
}
</style>
