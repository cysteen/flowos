<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { message } from 'ant-design-vue';
import { FileTextOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons-vue';
import { useUserStore } from '@/stores/user';
import { useTicketDraftStore } from '@/stores/ticketDrafts';
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
const router = useRouter();
const wb = useTicketWorkbench();
const createOpen = ref(false);

// —— 草稿箱 ——
const draftStore = useTicketDraftStore();
const draftDrawerOpen = ref(false);
const editingDraftId = ref<string | null>(null);
function openCreate() { editingDraftId.value = null; createOpen.value = true; }
function editDraft(id: string) { editingDraftId.value = id; draftDrawerOpen.value = false; createOpen.value = true; }
function removeDraft(id: string) { draftStore.remove(id); message.success('草稿已删除'); }

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
      <!-- ② AI 建议条 -->
      <AiSuggestionBar
        v-if="wb.aiBarVisible.value"
        @view="message.info('展开今日 AI 建议清单')"
        @close="wb.aiBarVisible.value = false"
      />

      <!-- 草稿箱入口（建单弹窗「存草稿」→ 此处继续编辑/提交，形成闭环） -->
      <div v-if="draftStore.drafts.length" class="draft-bar">
        <button type="button" class="draft-entry" @click="draftDrawerOpen = true">
          <FileTextOutlined />
          <span>草稿箱</span>
          <span class="draft-badge">{{ draftStore.drafts.length }}</span>
        </button>
      </div>

      <!-- ③ 筛选行 A -->
      <TicketFilterBar
        :active-chip="wb.activeChip.value"
        :chip-counts="wb.chipCounts.value"
        :search="wb.searchText.value"
        @chip="wb.setChip"
        @update:search="wb.setSearch"
        @create="openCreate"
      />

      <!-- ④ 工具行 B -->
      <TicketToolbar
        :selected-count="wb.selectedCount.value"
        @batch="onBatch"
        @sort="message.info('切换排序')"
        @filter="message.info('高级筛选')"
        @columns="message.info('列设置')"
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
      </div>
    </div>

    <CreateTicketModal v-model:open="createOpen" :draft-id="editingDraftId" @created="onCreated" />

    <!-- 草稿箱抽屉 -->
    <a-drawer
      v-model:open="draftDrawerOpen"
      title="草稿箱"
      placement="right"
      :width="420"
    >
      <div v-if="!draftStore.drafts.length" class="draft-empty">暂无草稿</div>
      <div v-else class="draft-list">
        <div v-for="d in draftStore.drafts" :key="d.id" class="draft-item">
          <div class="draft-main">
            <div class="draft-title">{{ d.title }}</div>
            <div class="draft-meta">
              <span class="draft-tag">{{ d.typeLabel }}</span>
              <span class="draft-cus">{{ d.customerName }}</span>
            </div>
            <div class="draft-time">保存于 {{ d.savedAt }}</div>
          </div>
          <div class="draft-ops">
            <a class="draft-op" @click="editDraft(d.id)"><EditOutlined /> 继续编辑</a>
            <a class="draft-op danger" @click="removeDraft(d.id)"><DeleteOutlined /> 删除</a>
          </div>
        </div>
      </div>
    </a-drawer>
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

/* 草稿箱入口 */
.draft-bar {
  display: flex;
}
.draft-entry {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  padding: 0 12px;
  font-size: 13px;
  color: #b45309;
  background: #fffbeb;
  border: 1px solid #fde68a;
  border-radius: 6px;
  cursor: pointer;
}
.draft-entry:hover {
  border-color: #f59e0b;
}
.draft-badge {
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 700;
  color: #fff;
  background: #f59e0b;
  border-radius: 9px;
}

/* 草稿箱抽屉 */
.draft-empty {
  color: #9ca3af;
  font-size: 13px;
  text-align: center;
  padding: 40px 0;
}
.draft-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.draft-item {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 12px 14px;
}
.draft-title {
  font-size: 14px;
  font-weight: 600;
  color: #111827;
  margin-bottom: 6px;
}
.draft-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}
.draft-tag {
  font-size: 11px;
  color: #1a6fff;
  background: #eff6ff;
  padding: 1px 7px;
  border-radius: 3px;
}
.draft-cus {
  font-size: 12px;
  color: #6b7280;
}
.draft-time {
  font-size: 12px;
  color: #9ca3af;
}
.draft-ops {
  display: flex;
  gap: 16px;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px dashed #e5e7eb;
}
.draft-op {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  color: #1a6fff;
  cursor: pointer;
}
.draft-op:hover {
  text-decoration: underline;
}
.draft-op.danger {
  color: #ef4444;
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
