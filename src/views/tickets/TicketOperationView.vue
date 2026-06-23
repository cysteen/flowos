<script setup lang="ts">
import { computed, defineAsyncComponent, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { message } from 'ant-design-vue';
import { useWorkspaceTabsStore, resolveTicketTabTitle } from '@/stores/workspaceTabs';
import { useCtiStore } from '@/stores/cti';
import { useUserStore } from '@/stores/user';
import OpHeader from './components/operation/OpHeader.vue';
import OpOverviewBand from './components/operation/OpOverviewBand.vue';
import OpStatDetailModal from './components/operation/OpStatDetailModal.vue';
import OpSupplementModal from './components/operation/OpSupplementModal.vue';
import OpDunningModal from './components/operation/OpDunningModal.vue';
import OpSmsModal from './components/operation/OpSmsModal.vue';
import OpEmailModal from './components/operation/OpEmailModal.vue';
import OpProcessTabs from './components/operation/OpProcessTabs.vue';
import OpSidePanel from './components/operation/OpSidePanel.vue';
import OpActionBar from './components/OpActionBar.vue';
// 建单弹窗仅在「转单/重开」时用，按需异步加载，不阻塞操作页首屏
const CreateTicketModal = defineAsyncComponent(() => import('./components/CreateTicketModal.vue'));
import { useTicketOperation } from './composables/useTicketOperation';
import { useProcessForm } from './composables/useProcessForm';
import { useOperationTabs } from './composables/useOperationTabs';
import { buildChildTicketPrefill, buildReopenTicketPrefill } from './composables/childTicketPrefill';
import type { CreateTicketPrefill, Ticket } from './types/ticket';
import type { ProcessFormDraft, InsightAction, InsightModalKey } from './types/operation';
import type { ProcessTabKey } from './types/operation';
import type { OperationTabData } from './types/operationTabs';

const route = useRoute();
const router = useRouter();
const {
  detail: d, timeline, opState, suspendInfo, draftSavedAt,
  dispatch, confirmCancel, confirmWithdraw, addChildTicket, addReopenTicket,
} = useTicketOperation();
const {
  form, activeChip, expandedSections, filledSupplementCount,
  toggleSection, selectChip,
} = useProcessForm(() => d.value.type);
const { tabData } = useOperationTabs(() => d.value.type);

const ticketNo = computed(() => (route.params.ticketNo as string) || d.value.no);
const processTabsRef = ref<InstanceType<typeof OpProcessTabs> | null>(null);

const tabsStore = useWorkspaceTabsStore();
const cti = useCtiStore();
const user = useUserStore();

const overviewExpanded = ref(false);
const supplementModalOpen = ref(false);
const dunningModalOpen = ref(false);

// 联系客户：短信 / 邮件弹窗（统一走 OpActionModal 风格）
const smsModalOpen = ref(false);
const smsPhone = ref('');
const emailModalOpen = ref(false);
const emailTo = ref('');
const notifyCtx = computed(() => ({
  no: ticketNo.value,
  name: d.value.customer.name || '',
  product: d.value.product.name || '',
  agent: user.name || '当前坐席',
}));

/** 工单操作页加载后，用标题同步 Tab（避免仅显示工单号） */
watch(
  [ticketNo, () => d.value.title, () => d.value.no],
  ([no, title, detailNo]) => {
    if (!no) return;
    tabsStore.updateTitle(`/tickets/${no}`, resolveTicketTabTitle(no, title, detailNo));
  },
  { immediate: true },
);

const createOpen = ref(false);
const createPrefill = ref<CreateTicketPrefill | null>(null);

function onContact(type: 'call' | 'sms' | 'email', value: string) {
  if (type === 'call') {
    if (cti.workStatus === 'offline') {
      message.warning('请先签入上班');
      return;
    }
    if (cti.workStatus === 'break') {
      message.warning('请先切换为就绪');
      return;
    }
    if (cti.callSession) {
      message.warning('当前有进行中的外呼');
      return;
    }
    const isAgent = d.value.agent?.contacts?.some((c) => c.value === value);
    const role = isAgent ? '代办人' : '客户';
    const name = isAgent ? (d.value.agent?.name ?? '') : (d.value.customer.name || '');
    cti.startCall({
      ticketId: ticketNo.value,
      phone: value,
      contactLabel: name ? `${role}·${name}` : role,
    });
    return;
  }
  if (type === 'sms') {
    smsPhone.value = value;
    smsModalOpen.value = true;
    return;
  }
  // email
  emailTo.value = value;
  emailModalOpen.value = true;
}

function onSmsSubmit(payload: { phone: string; templateName: string; content: string }) {
  message.success(`短信已发送至 ${payload.phone}`);
}

function onEmailSubmit(payload: { to: string; subject: string }) {
  message.success(`邮件「${payload.subject}」已发送至 ${payload.to}`);
}

// —— 顶部速览带：统计宫格双层下钻 ——
const statModalKey = ref<InsightModalKey | null>(null);
const statTable = computed(() =>
  statModalKey.value ? d.value.insightDetails[statModalKey.value] : null,
);
// 弹窗「查看完整记录」跳向的 Tab + 文案
const STAT_VIEW_ALL: Record<InsightModalKey, { tab: ProcessTabKey; label: string }> = {
  inbound: { tab: 'contact', label: '在「联系记录」中查看全部' },
  history: { tab: 'customerHistory', label: '在「客户历史工单」中查看全部' },
  complaint: { tab: 'customerHistory', label: '在「客户历史工单」中查看全部' },
  recent30: { tab: 'customerHistory', label: '在「客户历史工单」中查看全部' },
};
const statViewAllLabel = computed(() =>
  statModalKey.value ? STAT_VIEW_ALL[statModalKey.value].label : '',
);

function onOverviewSelect(action: InsightAction) {
  if (action.kind === 'modal') {
    statModalKey.value = action.modalKey;
  } else {
    processTabsRef.value?.switchTab(action.tab);
  }
}
function onStatViewAll() {
  if (!statModalKey.value) return;
  processTabsRef.value?.switchTab(STAT_VIEW_ALL[statModalKey.value].tab);
  statModalKey.value = null;
}
function onStatOpenTicket(no: string) {
  message.info(`打开工单 ${no}`);
}

function openChildCreate() {
  createPrefill.value = buildChildTicketPrefill(d.value);
  createOpen.value = true;
}

function openReopenCreate() {
  createPrefill.value = buildReopenTicketPrefill(d.value);
  createOpen.value = true;
}

function onTicketCreated(ticket: Ticket, processAfter?: boolean) {
  if (createPrefill.value?.mode === 'child') addChildTicket(ticket);
  else if (createPrefill.value?.mode === 'reopen') addReopenTicket(ticket);
  if (processAfter) router.push(`/tickets/${ticket.no}`);
}

function onAction(payload: Record<string, unknown>) {
  dispatch(payload);
}

function toast(name: string) {
  message.info(`「${name}」`);
}

function formatNow() {
  const n = new Date();
  return `今天 ${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}`;
}

function onSupplementSubmit(payload: { supplementType: string; content: string; attachments: string[] }) {
  const record = {
    id: `s-${Date.now()}`,
    who: user.name || '当前坐席',
    when: formatNow(),
    supplementType: payload.supplementType,
    content: payload.content,
    attachments: payload.attachments.length ? payload.attachments : undefined,
  };
  tabData.value.supplementRecords.unshift(record);
  d.value.insight.supplementCount += 1;
  processTabsRef.value?.switchTab('related');
  message.success('补充信息已提交');
}

function onDunningSubmit(payload: { content: string; attachments: string[] }) {
  const record = {
    id: `d-${Date.now()}`,
    who: user.name || '当前坐席',
    when: formatNow(),
    content: payload.content,
    attachments: payload.attachments.length ? payload.attachments : undefined,
  };
  tabData.value.dunningRecords.unshift(record);
  d.value.insight.dunningCount += 1;
  processTabsRef.value?.switchTab('related');
  message.success('催单信息已提交');
}

function onHeaderAction(name: string) {
  switch (name) {
    case '新建关联':
      openChildCreate();
      break;
    case '新建补充':
      supplementModalOpen.value = true;
      break;
    case '催单':
      dunningModalOpen.value = true;
      break;
    case '取消工单':
      confirmCancel();
      break;
    default:
      toast(name);
  }
}

function copyNo() {
  message.success('工单号已复制');
}

function updateForm(next: ProcessFormDraft) {
  form.value = next;
}

function updateTabData(next: OperationTabData) {
  tabData.value = next;
}
</script>

<template>
  <div class="op-page">
    <OpHeader
      :detail="d"
      :ticket-no="ticketNo"
      @copy-no="copyNo"
      @action="onHeaderAction"
    />

    <!-- 顶部通栏速览带：客户诉求 | 客户全景宫格 | 最新处理（关注信息一屏） -->
    <div class="op-overview-wrap" :class="{ elevated: overviewExpanded }">
      <OpOverviewBand :detail="d" @select="onOverviewSelect" @expand-change="overviewExpanded = $event" />
    </div>

    <div class="op-body">
      <div class="op-main">
        <OpProcessTabs
          ref="processTabsRef"
          :detail="d"
          :tab-data="tabData"
          :form="form"
          :expanded-sections="expandedSections"
          :active-chip="activeChip"
          :filled-supplement-count="filledSupplementCount"
          @toggle-section="toggleSection"
          @select-chip="selectChip"
          @update:form="updateForm"
          @update:tab-data="updateTabData"
          @open-child-create="openChildCreate"
          @open-reopen-create="openReopenCreate"
        />
      </div>

      <OpSidePanel
        :detail="d"
        @contact="onContact"
        @action="toast"
      />
    </div>

    <OpActionBar
      :ticket-no="ticketNo"
      :ticket-title="d.title"
      :ticket-type="d.type"
      :after-sale-enabled="d.product.afterSaleEnabled"
      :op-state="opState"
      :suspend-info="suspendInfo"
      :draft-saved-at="draftSavedAt"
      @action="onAction"
      @cancel="confirmCancel"
      @withdraw="confirmWithdraw"
      @transfer-ticket="openChildCreate"
    />

    <CreateTicketModal
      v-model:open="createOpen"
      :prefill="createPrefill"
      @created="onTicketCreated"
    />

    <OpStatDetailModal
      :open="statModalKey !== null"
      :table="statTable"
      :view-all-label="statViewAllLabel"
      @update:open="(v) => { if (!v) statModalKey = null; }"
      @open-ticket="onStatOpenTicket"
      @view-all="onStatViewAll"
    />

    <OpSupplementModal
      v-model:open="supplementModalOpen"
      @submit="onSupplementSubmit"
    />

    <OpDunningModal
      v-model:open="dunningModalOpen"
      @submit="onDunningSubmit"
    />

    <OpSmsModal
      v-model:open="smsModalOpen"
      :phone="smsPhone"
      :ctx="notifyCtx"
      @submit="onSmsSubmit"
    />

    <OpEmailModal
      v-model:open="emailModalOpen"
      :email="emailTo"
      :ctx="notifyCtx"
      @submit="onEmailSubmit"
    />
  </div>
</template>

<style scoped>
/* 填满外壳滚动容器，头部 + 速览带常驻，主体区独立滚动 → 关注信息一屏 */
.op-page {
  display: flex; flex-direction: column; height: 100%; overflow: hidden;
  background: #f9fafb;
}
.op-overview-wrap { flex: none; padding: 8px 20px 0; position: relative; z-index: 1; }
.op-overview-wrap.elevated { z-index: 50; }
.op-body {
  display: flex; gap: 16px; padding: 16px 20px; flex: 1;
  min-height: 0; align-items: stretch;
}
.op-main {
  flex: 1; min-width: 0; min-height: 0; display: flex; flex-direction: column;
}
</style>
