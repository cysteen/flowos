<script setup lang="ts">
import { ref } from 'vue';
import { message } from 'ant-design-vue';
import { useUserStore } from '@/stores/user';
import AppPagination from '@/components/AppPagination.vue';
import TicketTabs from './components/TicketTabs.vue';
import AiSuggestionBar from './components/AiSuggestionBar.vue';
import TicketFilterBar from './components/TicketFilterBar.vue';
import TicketToolbar from './components/TicketToolbar.vue';
import TicketRichList from './components/TicketRichList.vue';
import CreateTicketModal from './components/CreateTicketModal.vue';
import { useTicketWorkbench } from './composables/useTicketWorkbench';
import type { Ticket } from './types/ticket';

const user = useUserStore();
const wb = useTicketWorkbench();
const createOpen = ref(false);

// 「处理 / 详情 / 审核」进操作页（Prompt 3 占位）；其余即时反馈
function onAction(label: string, t: Ticket) {
  if (['处理', '详情', '审核', '受理'].includes(label)) {
    message.info(`「${label}」${t.no} → 进入工单操作页（Prompt 3 / PRD-03）`);
  } else if (label === '领单') {
    message.success(`已领取 ${t.no}，转入「我的工单」`);
  } else {
    message.success(`已对 ${t.no} 执行「${label}」`);
  }
}
function onClickNo(t: Ticket) {
  message.info(`${t.no} → 工单操作页（Prompt 3 / PRD-03）`);
}
function onClickCustomer(t: Ticket) {
  message.info(`查看客户「${t.customer}」详情卡（占位）`);
}
function onBatch() {
  message.success(`已对已选 ${wb.selectedCount.value} 单执行批量操作`);
  wb.clearSelection();
}
function onCreated(t: Ticket) {
  wb.addTicket(t);
  wb.setTab('mine');
}
</script>

<template>
  <div class="workbench">
    <!-- ① 多视图 Tab -->
    <TicketTabs
      :active="wb.activeTab.value"
      :counts="wb.tabCounts.value"
      :hidden-tabs="user.hiddenTabs"
      @change="wb.setTab"
    />

    <!-- ② AI 建议条 -->
      <AiSuggestionBar
        v-if="wb.aiBarVisible.value"
        @view="message.info('展开今日 AI 建议清单（占位）')"
        @close="wb.aiBarVisible.value = false"
      />

      <!-- ③ 筛选行 A -->
      <TicketFilterBar
        :active-chip="wb.activeChip.value"
        :chip-counts="wb.chipCounts.value"
        :search="wb.searchText.value"
        @chip="wb.setChip"
        @update:search="wb.setSearch"
        @create="createOpen = true"
      />

      <!-- ④ 工具行 B -->
      <TicketToolbar
        :selected-count="wb.selectedCount.value"
        @batch="onBatch"
        @sort="message.info('切换排序（占位）')"
        @filter="message.info('高级筛选（占位）')"
        @columns="message.info('列设置（占位）')"
      />

      <!-- ⑤ SLA 富列表 + ⑥ 分页 -->
      <div class="table-card">
        <TicketRichList
          :rows="wb.paged.value"
          :selected-ids="wb.selectedIds.value"
          :all-page-selected="wb.allPageSelected.value"
          @toggle="wb.toggleSelect"
          @toggle-all="wb.toggleSelectAllOnPage"
          @action="onAction"
          @click-no="onClickNo"
          @click-customer="onClickCustomer"
        />
        <div class="pager">
          <span class="pager-left">
            共 {{ wb.total.value }} 条 · 已选 {{ wb.selectedCount.value }} 项
          </span>
          <AppPagination
            :total="wb.total.value"
            :current="wb.current.value"
            :page-size="wb.pageSize.value"
            @change="wb.setPage"
          />
        </div>
      </div>

    <CreateTicketModal v-model:open="createOpen" @created="onCreated" />
  </div>
</template>

<style scoped>
.workbench {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 20px;
  min-height: 100%;
}
.table-card {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.pager {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 20px;
  border-top: 1px solid #e5e7eb;
}
.pager-left {
  font-size: 13px;
  color: #6b7280;
}
</style>
