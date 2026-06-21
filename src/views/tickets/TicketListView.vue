<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { message } from 'ant-design-vue';
import AppPagination from '@/components/AppPagination.vue';
import TicketListFilterCard from './components/TicketListFilterCard.vue';
import TicketListToolRow from './components/TicketListToolRow.vue';
import TicketRichList from './components/TicketRichList.vue';
import CreateTicketModal from './components/CreateTicketModal.vue';
import { useTicketList } from './composables/useTicketList';
import type { Ticket } from './types/ticket';

const router = useRouter();
const list = useTicketList();
const createOpen = ref(false);

function openOperation(t: Ticket) {
  router.push(`/tickets/${t.no}`);
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
  list.setView('mine');
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
      :active-view="list.activeView.value"
      :view-counts="list.viewCounts.value"
      :selected-count="list.selectedCount.value"
      @update:view="list.setView"
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
        @toggle="list.toggleSelect"
        @toggle-all="list.toggleSelectAllOnPage"
        @action="onAction"
        @click-no="openOperation"
        @click-customer="(t) => message.info(`查看客户「${t.customer}」`)"
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
