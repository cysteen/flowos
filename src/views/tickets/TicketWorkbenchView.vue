<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { message, Modal } from 'ant-design-vue';
import { useUserStore } from '@/stores/user';
import TicketTabs from './components/TicketTabs.vue';
import RiskReportPoolPanel from './components/RiskReportPoolPanel.vue';
import FlashPoolPanel from './components/FlashPoolPanel.vue';
import {
  FLASH_POOL_TAB,
  isPoolFamily,
  isTicketTab,
  RISK_REPORT_TAB,
  visiblePoolGroupsFor,
  type WorkbenchTabKey,
} from '@/views/tickets/types/ticket';
import { FLASH_POOL_TAB_ROLES } from '@/config/roles';
import { flashFailCellText, flashHandoffCellText } from './utils/flashPoolCells';
import { useRiskReportStore } from '@/stores/riskReports';
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
import OpActionDialogs from './components/OpActionDialogs.vue';
import { useTicketWorkbench } from './composables/useTicketWorkbench';
import { useTicketColumns } from './composables/useTicketColumns';
import { useMineQueryFields } from './composables/useMineQueryFields';
import { hasMineQuery } from './types/mineQuery';
import type { OpActionType, ReturnPayload, TransferPayload } from './composables/opActions';
import { MAX_RETURN_COUNT } from './composables/opActions';
import type { Ticket } from './types/ticket';

const user = useUserStore();
const router = useRouter();
const wb = useTicketWorkbench();
const headerTabCounts = wb.headerTabCounts;
const riskReports = useRiskReportStore();

/**
 * 风险报备池页签。
 *
 * 【为什么它的选中态另存一个 ref，而不是并进 `wb.activeTab`】工作台那套取数
 * （`tabRows` / `tabCounts` / 结构化筛选）整个是围绕**工单**建的，键是 `TabKey`；
 * 报备池装的是**报备单**，喂不进去，也不该让 `TabKey` 多出一个工单永远落不到的值
 * （见 types/ticket.ts 的 `WorkbenchTabKey`）。故页签栏的选中态在这里合成：
 * 报备池开着就是它，否则跟着工单页签走。
 */
const riskReportTabActive = ref(false);

/**
 * 「刷机池」页签（930 教育刷机单 §9.2）：只对一线坐席渲染。与报备池同形，选中态另存、
 * 与隐藏页签取交集；隐藏页签＝角色 hiddenTabs ＋ 非 `FLASH_POOL_TAB_ROLES` 角色的「刷机池」。
 */
const flashPoolTabActive = ref(false);
const workbenchHiddenTabs = computed(() =>
  FLASH_POOL_TAB_ROLES.includes(user.roleKey)
    ? user.hiddenTabs
    : [...user.hiddenTabs, FLASH_POOL_TAB],
);
const flashPoolTabOpen = computed(
  () => flashPoolTabActive.value && !workbenchHiddenTabs.value.includes(FLASH_POOL_TAB),
);
/**
 * 🔴 **选中态要与 `hiddenTabs` 取交集**（2026-09-11 D-23 同类缺口）：
 * 顶栏「切换演示角色」**不重挂本页**（AppHeader 的 `afterContextChange` 只在新角色
 * 连 `tickets` 菜单都没有时才跳走），故报备池开着时切到一个看不到这枚页签的角色，
 * `riskReportTabActive` 仍是 true —— 页签栏上已经没有「风险报备池」，正文却还开着，
 * 报备人 / 风险类型 / 场景描述全文一览无余。渲染条件读这个合成值而不是裸 ref。
 */
const riskReportTabOpen = computed(
  () => riskReportTabActive.value && !user.hiddenTabs.includes(RISK_REPORT_TAB),
);
const activeWorkbenchTab = computed<WorkbenchTabKey>(() => {
  if (riskReportTabOpen.value) return RISK_REPORT_TAB;
  if (flashPoolTabOpen.value) return FLASH_POOL_TAB;
  return wb.activeTab.value;
});

/**
 * 报备池的徽章数 ＝ **在队**（待领取 + 评估中）条数。
 * 不数已评估 / 已撤回：徽章要答的是"还有多少活等着人",那两档活已经完了。
 */
const riskReportOpenCount = computed(
  () => riskReports.reports.filter((r) => r.status === '待分派' || r.status === '评估中').length,
);
const workbenchTabCounts = computed<Record<string, number>>(() => ({
  ...headerTabCounts.value,
  [RISK_REPORT_TAB]: riskReportOpenCount.value,
  [FLASH_POOL_TAB]: wb.flashPoolRows.value.length,
}));

function onTabChange(tab: WorkbenchTabKey) {
  // 与 Tab 条同一道门控：`hiddenTabs` 里有它就不认这次切换（TicketTabs 本就不渲染该枚，
  // 这里再挡一道是为了让"选中态"与"渲不渲染"永远是同一个答案）
  if (workbenchHiddenTabs.value.includes(tab)) return;
  riskReportTabActive.value = tab === RISK_REPORT_TAB;
  flashPoolTabActive.value = tab === FLASH_POOL_TAB;
  if (isTicketTab(tab)) wb.setTab(tab);
}

/** 我的任务 ·「已挂起」追加列 */
const SUSPEND_EXTRA_COLUMNS = [
  { key: 'suspendedAt', label: '挂起时间', width: 128, after: 'node' },
  { key: 'suspendResumeAt', label: '解挂时间', width: 128, after: 'node' },
];

/**
 * 工单池 · 教育刷机处理组池的两列（§9.3）：当前角色看得到教育刷机处理组时追加
 * 「转人工原因」「失败原因」，非刷机单显示「—」。
 */
const POOL_FLASH_EXTRA_COLUMNS = [
  { key: 'flashHandoff', label: '转人工原因', width: 120 },
  { key: 'flashFail', label: '失败原因', width: 160 },
];
const showPoolFlashColumns = computed(
  () => wb.isPoolTab.value && visiblePoolGroupsFor(user.roleKey).some((g) => g.id === 'edu-flash'),
);
const listExtraColumns = computed(() => {
  if (wb.showSuspendColumns.value) return SUSPEND_EXTRA_COLUMNS;
  if (showPoolFlashColumns.value) return POOL_FLASH_EXTRA_COLUMNS;
  return undefined;
});

/** 领取刷机单：刷机服务落状态与履历，Toast「已领取 〈单号〉」；已被他人领取时提示领取人（§9.2 / §9.3） */
function claimFlash(t: Ticket) {
  const res = wb.claimFlashTicket(t.id);
  if (res.ok) message.success(res.message);
  else if (res.message) message.warning(res.message);
}

/** 报备池行内点工单号：与列表点单号同一个去处（工单操作页） */
function openTicketByNo(no: string) {
  router.push(`/tickets/${no}`);
}
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

const opDialogOpen = ref(false);
const opDialogAction = ref<OpActionType | null>(null);
const opTargetTickets = ref<Ticket[]>([]);

const opDialogTicketNo = computed(() => {
  const list = opTargetTickets.value;
  if (list.length === 1) return list[0].no;
  if (list.length > 1) return `已选 ${list.length} 单`;
  return '';
});

const opReturnCount = computed(() => {
  if (!opTargetTickets.value.length) return 0;
  return Math.max(...opTargetTickets.value.map((t) => t.returnCount ?? 0));
});

function openOpDialog(action: '调剂' | '退回', tickets: Ticket[]) {
  if (!tickets.length) {
    message.info(`请先选择要${action}的工单`);
    return;
  }
  if (action === '退回') {
    const blocked = tickets.some((t) => (t.returnCount ?? 0) >= MAX_RETURN_COUNT);
    if (blocked) {
      message.warning(`所选工单中有已达退回上限（${MAX_RETURN_COUNT} 次）的单据`);
      return;
    }
  }
  opTargetTickets.value = tickets;
  opDialogAction.value = action;
  opDialogOpen.value = true;
}

function onOpDialogConfirm(payload: Record<string, unknown>) {
  const tickets = opTargetTickets.value;
  const type = payload.type as string;

  if (type === '调剂') {
    const { target } = payload.data as TransferPayload;
    const name = target.split(' ')[0];
    for (const t of tickets) {
      t.assignee = name;
      t.myTransferAction = true;
    }
    const label = tickets.length === 1 ? tickets[0].no : `${tickets.length} 单`;
    message.success(tickets.length === 1 ? `已调剂至 ${name}` : `已对 ${label} 调剂至 ${name}`);
  } else if (type === '退回') {
    for (const t of tickets) {
      t.returnCount = (t.returnCount ?? 0) + 1;
      t.hasReturnAction = true;
      t.nodeStatus = '未认领';
    }
    const label = tickets.length === 1 ? tickets[0].no : `${tickets.length} 单`;
    // 退回的目标节点由流程配置决定、前端拿不到（ReturnPayload 只有 reason / note）——
    // 原先文案取 payload.data.targetNode，那个字段不存在，实际显示成"已退回至 undefined 节点"。
    // 这里按代码的实际行为写：退回后 nodeStatus 置「未认领」，即回到工单池。
    message.success(
      tickets.length === 1 ? '已退回，工单回到未认领' : `已对 ${label} 退回，工单回到未认领`,
    );
  }

  wb.clearSelection();
  opTargetTickets.value = [];
}

const isPoolFamilyTab = computed(() => isPoolFamily(wb.activeTab.value));
const batchActions = computed(() =>
  isPoolFamilyTab.value ? ['领取'] : wb.isMineTab.value ? ['调剂', '退回'] : [],
);
const showBatchToolbar = computed(() => wb.isMineTab.value || isPoolFamilyTab.value);
const structuredFilterVariant = computed<'done' | 'pool' | 'mine'>(() => {
  if (wb.isDoneTab.value) return 'done';
  if (isPoolFamilyTab.value) return 'pool';
  return 'mine';
});

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
  if (label === '领取' && t.type === '刷机') {
    claimFlash(t);
    return;
  }
  if (label === '领取') {
    if (wb.claimTicket(t.id)) {
      message.success(`已领取 ${t.no}，转入「我的任务」`);
    } else {
      message.warning('该工单已被他人认领');
    }
    return;
  }
  if (label === '调剂' || label === '退回') {
    openOpDialog(label, [t]);
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
  if (action === '调剂' || action === '退回') {
    const picked = [...wb.selectedIds.value]
      .map((id) => wb.ticketById(id))
      .filter((t): t is Ticket => !!t);
    // 刷机单的流转动作统一在工单处理页办理（M116 / M117），批量调剂 / 退回跳过刷机单
    const tickets = picked.filter((t) => t.type !== '刷机');
    const skipped = picked.length - tickets.length;
    if (skipped > 0) {
      message.warning(`已跳过 ${skipped} 张刷机单，刷机单请在工单处理页操作`);
    }
    if (tickets.length === 0) return;
    openOpDialog(action, tickets);
    return;
  }
  message.success(`已对已选 ${wb.selectedCount.value} 单执行批量「${action}」`);
  wb.clearSelection();
}
function onCreated(t: Ticket) {
  wb.addTicket(t);
  // 建完单要能看见它，故一并退出报备池 —— 只调 setTab 的话页签栏还停在报备池上，
  // 新单落进了「我的任务」却一眼看不到
  riskReportTabActive.value = false;
  flashPoolTabActive.value = false;
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

function onRemoveSavedChip(chipKey: string) {
  const sf = wb.activeChips.value.find((c) => c.key === chipKey);
  const name = sf?.label ?? '该筛选';
  Modal.confirm({
    title: '删除筛选器',
    content: `确定删除「${name}」？删除后不可恢复。`,
    okText: '删除',
    okType: 'danger',
    cancelText: '取消',
    onOk() {
      const removed = wb.removeSavedFilterChip(chipKey);
      if (removed) message.success(`已删除筛选器「${removed.name}」`);
    },
  });
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
        :active="activeWorkbenchTab"
        :counts="workbenchTabCounts"
        :hidden-tabs="workbenchHiddenTabs"
        @change="onTabChange"
      />
    </div>

    <!-- 风险报备池：装的是报备单不是工单，故整块自成一页，不走下面那套工单列表 -->
    <div v-if="riskReportTabOpen" class="workbench-body">
      <RiskReportPoolPanel @open-ticket="openTicketByNo" />
    </div>

    <!-- 刷机池：一线刷机池未认领的刷机单，列与排序固定（§9.2） -->
    <div v-else-if="flashPoolTabOpen" class="workbench-body">
      <FlashPoolPanel :rows="wb.flashPoolRows.value" @claim="claimFlash" @open="openOperation" />
    </div>

    <div v-else class="workbench-body">
      <!-- ② chips 筛选（催补待回等 Tab 有子筛选时展示） -->
      <div v-if="!isDraftView && wb.activeChips.value.length" class="filter-row-unified">
        <TicketFilterBar
          :active-chip="wb.activeChip.value"
          :chip-counts="wb.chipCounts.value"
          :chips="wb.activeChips.value"
          :show-time-filter="!wb.usesStructuredFilter.value"
          @chip="onChipSelect"
          @remove-chip="onRemoveSavedChip"
        />
      </div>

      <!-- ③ 列表控制区：工具行固定在此（各 Tab 搜索栏对齐）；筛选面板向上展开 -->
      <div v-if="!isDraftView" class="list-controls">
        <TicketMineQueryBar
          v-if="wb.usesStructuredFilter.value && structuredFilterExpanded"
          :expanded="true"
          :model-value="wb.structuredQuery.value"
          :variant="structuredFilterVariant"
          :pool-groups="wb.poolGroups.value"
          :optional-visible="optionalVisible"
          @update:model-value="wb.setStructuredQuery"
          @search="wb.applyStructuredQuery"
          @save-filter="onRequestSaveFilter"
          @apply-optional-visible="applyOptionalVisible"
        />

        <TicketToolbar
          :selected-count="wb.selectedCount.value"
          :search="wb.searchText.value"
          search-placeholder="工单号 / 手机号"
          :show-create="!wb.isDoneTab.value"
          :show-batch="showBatchToolbar"
          :batch-actions="batchActions"
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

      <!-- ④ AI 建议条（仅我的任务；置于工具行之下，避免顶挤搜索栏） -->
      <AiSuggestionBar
        v-if="wb.showAiBar.value && !isDraftView"
        :summary="wb.aiSummary.value"
        @view="openAiDrawer"
        @close="wb.aiBarVisible.value = false"
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
            :extra-columns="listExtraColumns"
            :visible-columns="visibleColumns"
            :column-order="columnOrder"
            @toggle="wb.toggleSelect"
            @toggle-all="wb.toggleSelectAllOnPage"
            @action="onAction"
            @open="openOperation"
            @click-no="onClickNo"
            @click-customer="onClickCustomer"
          >
            <template #cell-suspendedAt="{ ticket }">
              <span class="suspend-time">{{ ticket.suspendedAt || '—' }}</span>
            </template>
            <template #cell-suspendResumeAt="{ ticket }">
              <span class="suspend-time">{{ ticket.suspendResumeAt || '—' }}</span>
            </template>
            <template #cell-flashHandoff="{ ticket }">
              <span class="flash-cell">{{ flashHandoffCellText(ticket) }}</span>
            </template>
            <template #cell-flashFail="{ ticket }">
              <span class="flash-cell" :title="flashFailCellText(ticket)">{{ flashFailCellText(ticket) }}</span>
            </template>
          </TicketRichList>
          <!-- 无分页：全量快照展示（PRD §8.2②），仅保留总数/已选统计 -->
          <div class="pager">
            <div class="pager-left">
              <span class="pager-total">共 {{ wb.total.value }} 条</span>
              <span v-if="wb.isMineTab.value || isPoolFamilyTab" class="pager-selected">已选 {{ wb.selectedCount.value }} 项</span>
            </div>
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

    <OpActionDialogs
      v-model:open="opDialogOpen"
      :action="opDialogAction"
      :ticket-no="opDialogTicketNo"
      :suspend-info="null"
      :return-count="opReturnCount"
      @confirm="onOpDialogConfirm"
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
.filter-row-unified {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-width: 0;
  flex-wrap: nowrap;
}
.filter-row-unified :deep(.filter-row) {
  flex: 1;
  min-width: 0;
}
.list-controls {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
  min-width: 0;
}
.suspend-time { font-variant-numeric: tabular-nums; white-space: nowrap; }
.flash-cell { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
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
