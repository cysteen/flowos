<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { message } from 'ant-design-vue';
import { useUserStore } from '@/stores/user';
import AppPagination from '@/components/AppPagination.vue';
import TicketTabs from './components/TicketTabs.vue';
import AiSuggestionBar from './components/AiSuggestionBar.vue';
import TicketFilterBar from './components/TicketFilterBar.vue';
import TicketToolbar from './components/TicketToolbar.vue';
import TicketRichList from './components/TicketRichList.vue';
import TicketDraftList from './components/TicketDraftList.vue';
import CreateTicketModal from './components/CreateTicketModal.vue';
import { useTicketWorkbench } from './composables/useTicketWorkbench';
import type { Ticket } from './types/ticket';

const user = useUserStore();
const router = useRouter();
const wb = useTicketWorkbench();
const createOpen = ref(false);

// —— 草稿 ——（「草稿」chip 选中时，列表区渲染草稿列表）
const editingDraftId = ref<string | null>(null);
const isDraftView = computed(() => wb.activeChip.value === 'draft');
function openCreate() { editingDraftId.value = null; createOpen.value = true; }
function editDraft(id: string) { editingDraftId.value = id; createOpen.value = true; }
function removeDraft(id: string) { wb.removeDraft(id); message.success('草稿已删除'); }

function openOperation(t: Ticket) {
  router.push(`/tickets/${t.no}`);
}

// 「处理 / 详情 / 审核 / 受理」进工单操作页（PRD-03）；其余即时反馈
function onAction(label: string, t: Ticket) {
  if (['处理', '详情', '审核', '受理'].includes(label)) {
    openOperation(t);
  } else if (label === '领单') {
    message.success(`已领取 ${t.no}，转入「我的工单」`);
  } else {
    message.success(`已对 ${t.no} 执行「${label}」`);
  }
}
function onClickNo(t: Ticket) {
  openOperation(t);
}
function onClickCustomer(t: Ticket) {
  message.info(`查看客户「${t.customer}」详情卡`);
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
    <!-- ① 多视图 Tab（全宽贴顶，对齐 .pen） -->
    <div class="workbench-tabs">
      <TicketTabs
        :active="wb.activeTab.value"
        :counts="wb.tabCounts.value"
        :hidden-tabs="user.hiddenTabs"
        @change="wb.setTab"
      />
    </div>

    <div class="workbench-body">
      <!-- ② AI 建议条（草稿视图下不展示） -->
      <AiSuggestionBar
        v-if="wb.aiBarVisible.value && !isDraftView"
        @view="message.info('展开今日 AI 建议清单')"
        @close="wb.aiBarVisible.value = false"
      />

      <!-- ③ 筛选行 A（末尾含「草稿」chip） -->
      <TicketFilterBar
        :active-chip="wb.activeChip.value"
        :chip-counts="wb.chipCounts.value"
        :search="wb.searchText.value"
        @chip="wb.setChip"
        @update:search="wb.setSearch"
        @create="openCreate"
      />

      <!-- ④ 工具行 B（草稿视图下不展示批量/排序工具） -->
      <TicketToolbar
        v-if="!isDraftView"
        :selected-count="wb.selectedCount.value"
        @batch="onBatch"
        @sort="message.info('切换排序')"
        @filter="message.info('高级筛选')"
        @columns="message.info('列设置')"
      />

      <!-- ⑤ 列表区：草稿视图 → 草稿列表；否则 → SLA 富列表 + 分页 -->
      <div class="table-card">
        <TicketDraftList
          v-if="isDraftView"
          :drafts="wb.drafts.value"
          @open="editDraft"
          @remove="removeDraft"
        />
        <template v-else>
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
            <div class="pager-left">
              <span class="pager-total">共 {{ wb.total.value }} 条</span>
              <span class="pager-selected">已选 {{ wb.selectedCount.value }} 项</span>
            </div>
            <AppPagination
              :total="wb.total.value"
              :current="wb.current.value"
              :page-size="wb.pageSize.value"
              :show-total="false"
              @change="wb.setPage"
            />
          </div>
        </template>
      </div>
    </div>

    <CreateTicketModal v-model:open="createOpen" :draft-id="editingDraftId" @created="onCreated" />
  </div>
</template>

<style scoped>
.workbench {
  display: flex;
  flex-direction: column;
  min-height: 100%;
  width: 100%;
  min-width: 0;
}
.workbench-tabs {
  flex: none;
  background: #fff;
  border-bottom: 1px solid #e5e7eb;
}
.workbench-body {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 20px;
  flex: 1;
  min-height: 0;
  min-width: 0;
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
