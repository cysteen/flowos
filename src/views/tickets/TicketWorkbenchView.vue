<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { message } from 'ant-design-vue';
import { useUserStore } from '@/stores/user';
import AppPagination from '@/components/AppPagination.vue';
import TicketTabs from './components/TicketTabs.vue';
import AiSuggestionBar from './components/AiSuggestionBar.vue';
import AiSuggestionDrawer from './components/AiSuggestionDrawer.vue';
import type { AiSuggestion, AiSuggestionFilter } from './types/aiSuggestion';
import TicketFilterBar from './components/TicketFilterBar.vue';
import TicketMineQueryBar from './components/TicketMineQueryBar.vue';
import TicketToolbar from './components/TicketToolbar.vue';
import TicketRichList from './components/TicketRichList.vue';
import TicketDraftList from './components/TicketDraftList.vue';
import CreateTicketModal from './components/CreateTicketModal.vue';
import SaveFilterModal from './components/SaveFilterModal.vue';
import { useTicketWorkbench } from './composables/useTicketWorkbench';
import { useTicketColumns } from './composables/useTicketColumns';
import { useMineQueryFields } from './composables/useMineQueryFields';
import { hasMineQuery } from './types/mineQuery';
import type { Ticket } from './types/ticket';

const user = useUserStore();
const router = useRouter();
const wb = useTicketWorkbench();
const { optionalVisible, applyOptionalVisible } = useMineQueryFields();
const {
  visibleColumns,
  columnOrder,
  setColumnVisible,
  reorderColumn,
  resetColumns,
} = useTicketColumns();
const createOpen = ref(false);
const aiDrawerOpen = ref(false);
const aiDrawerFilter = ref<AiSuggestionFilter>('all');
const saveFilterModalOpen = ref(false);
/** 我的任务 / 已办 · 结构化筛选面板默认收起 */
const structuredFilterExpanded = ref(false);

const batchActions = computed(() =>
  wb.isPoolTab.value ? ['领取'] : wb.isMineTab.value ? ['转办', '退回'] : [],
);
const showBatchToolbar = computed(() => wb.isMineTab.value || wb.isPoolTab.value);

watch(
  () => wb.activeTab.value,
  () => {
    structuredFilterExpanded.value = false;
    wb.setSearch('');
  },
);

// —— 草稿 ——（非「我的任务」Tab 下「草稿」chip 选中时渲染草稿列表）
const editingDraftId = ref<string | null>(null);
const isDraftView = computed(() => wb.isDraftView.value);
function openCreate() { editingDraftId.value = null; createOpen.value = true; }
function editDraft(id: string) { editingDraftId.value = id; createOpen.value = true; }
function removeDraft(id: string) { wb.removeDraft(id); message.success('草稿已删除'); }

function openOperation(t: Ticket) {
  router.push(`/tickets/${t.no}`);
}

// 「处理 / 详情 / 审核 / 受理」进工单操作页（PRD-03）；其余即时反馈
function onAction(label: string, t: Ticket) {
  if (label === '领取') {
    if (wb.claimTicket(t.id)) {
      message.success(`已领取 ${t.no}，转入「我的任务」`);
    } else {
      message.warning('该工单已被他人认领');
    }
    return;
  }
  if (label === '转办' || label === '退回') {
    message.success(`已对 ${t.no} 执行「${label}」`);
    return;
  }
  if (['处理', '详情', '审核', '受理'].includes(label)) {
    openOperation(t);
  } else if (label === '领单') {
    if (wb.claimTicket(t.id)) {
      message.success(`已领取 ${t.no}，转入「我的任务」`);
    } else {
      message.warning('该工单已被他人认领');
    }
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
function onBatch(action: string) {
  if (action === '领取') {
    const { claimed, failed } = wb.claimTickets(wb.selectedIds.value);
    if (claimed > 0) {
      message.success(`已领取 ${claimed} 单，转入「我的任务」`);
    }
    if (failed > 0) {
      message.warning(`${failed} 单已被他人认领`);
    }
    if (claimed === 0 && failed === 0) {
      message.info('请先勾选要领取的工单');
    }
    wb.clearSelection();
    return;
  }
  message.success(`已对已选 ${wb.selectedCount.value} 单执行批量「${action}」`);
  wb.clearSelection();
}
function onCreated(t: Ticket) {
  wb.addTicket(t);
  wb.setTab('mine');
}

function openAiDrawer() {
  aiDrawerFilter.value = 'all';
  aiDrawerOpen.value = true;
}

function onAiViewTicket(s: AiSuggestion) {
  const t = wb.ticketById(s.ticketId);
  if (!t) return;
  aiDrawerOpen.value = false;
  openOperation(t);
}

function onAiPrimaryAction(s: AiSuggestion) {
  const t = wb.ticketById(s.ticketId);
  if (!t) return;

  if (s.kind === 'upgrade') {
    message.success(`已对 ${t.no} 发起升级`);
  } else if (s.kind === 'similar') {
    aiDrawerOpen.value = false;
    router.push({ path: `/tickets/${t.no}`, query: { similar: s.matchedNo ?? '' } });
    message.success('已带入相似方案摘要');
    wb.dismissAiSuggestion(s.id);
    return;
  } else {
    message.success(`已标记 ${t.no} 为优先跟进`);
  }
  wb.dismissAiSuggestion(s.id);
}

function onChipSelect(chip: string) {
  wb.setChip(chip, applyOptionalVisible);
}

function onRequestSaveFilter() {
  if (!hasMineQuery(wb.structuredQuery.value)) {
    message.warning('请先设置筛选条件后再保存');
    return;
  }
  saveFilterModalOpen.value = true;
}

function onConfirmSaveFilter(name: string) {
  const item = wb.saveCurrentFilter(name, { ...optionalVisible.value }, applyOptionalVisible);
  if (item) {
    message.success(`已保存筛选器「${name}」`);
    structuredFilterExpanded.value = true;
  }
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
        v-if="wb.showAiBar.value && !isDraftView"
        :summary="wb.aiSummary.value"
        @view="openAiDrawer"
        @close="wb.aiBarVisible.value = false"
      />

      <!-- ③ chips 筛选行（独占一行，释放横向空间） -->
      <TicketFilterBar
        v-if="!isDraftView"
        :active-chip="wb.activeChip.value"
        :chip-counts="wb.chipCounts.value"
        :chips="wb.activeChips.value"
        :show-time-filter="!wb.usesStructuredFilter.value"
        @chip="onChipSelect"
      />

      <!-- ④ 列表控制区：筛选面板向上展开 + 工具行 -->
      <div v-if="!isDraftView" class="list-controls">
        <TicketMineQueryBar
          v-if="wb.usesStructuredFilter.value && structuredFilterExpanded"
          :expanded="true"
          :model-value="wb.structuredQuery.value"
          :variant="wb.isDoneTab.value ? 'done' : wb.isPoolTab.value ? 'pool' : 'mine'"
          :pool-groups="wb.poolGroups"
          :optional-visible="optionalVisible"
          @update:model-value="wb.setStructuredQuery"
          @search="wb.applyStructuredQuery"
          @save-filter="onRequestSaveFilter"
          @apply-optional-visible="applyOptionalVisible"
        />

        <TicketToolbar
          :selected-count="wb.selectedCount.value"
          :search="wb.searchText.value"
          :search-placeholder="
            wb.usesStructuredFilter.value ? '工单号 / 手机号' : '搜索工单号、手机号、SN、产品…'
          "
          :show-create="!wb.isDoneTab.value"
          :show-batch="showBatchToolbar"
          :batch-actions="batchActions"
          :hide-assignee-column="wb.isMineTab.value || wb.isPoolTab.value"
          :hide-group-names-column="!wb.isPoolTab.value"
          :visible-columns="visibleColumns"
          :column-order="columnOrder"
          :show-filter-toggle="wb.usesStructuredFilter.value"
          :filter-expanded="structuredFilterExpanded"
          @batch="onBatch"
          @update:search="wb.setSearch"
          @create="openCreate"
          @toggle-filter="structuredFilterExpanded = !structuredFilterExpanded"
          @set-column-visible="setColumnVisible"
          @reorder-column="reorderColumn"
          @reset-columns="resetColumns"
        />
      </div>

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
            :variant="
              wb.isMineTab.value
                ? 'mine'
                : wb.isDoneTab.value
                  ? 'done'
                  : wb.isPoolTab.value
                    ? 'pool'
                    : 'default'
            "
            :show-appointment-column="wb.showAppointmentColumn.value"
            :visible-columns="visibleColumns"
            :column-order="columnOrder"
            @toggle="wb.toggleSelect"
            @toggle-all="wb.toggleSelectAllOnPage"
            @action="onAction"
            @open="openOperation"
            @click-no="onClickNo"
            @click-customer="onClickCustomer"
          />
          <div class="pager">
            <div class="pager-left">
              <span class="pager-total">共 {{ wb.total.value }} 条</span>
              <span v-if="wb.isMineTab.value || wb.isPoolTab.value" class="pager-selected">已选 {{ wb.selectedCount.value }} 项</span>
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

    <AiSuggestionDrawer
      v-model:open="aiDrawerOpen"
      v-model:filter="aiDrawerFilter"
      :suggestions="wb.aiSuggestions.value"
      :summary="wb.aiSummary.value"
      :tickets="wb.all.value"
      @view-ticket="onAiViewTicket"
      @primary-action="onAiPrimaryAction"
    />

    <SaveFilterModal
      v-model:open="saveFilterModalOpen"
      @save="onConfirmSaveFilter"
    />
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
  gap: 12px;
  padding: 20px;
  flex: 1;
  min-height: 0;
  min-width: 0;
}
.list-controls {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
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
