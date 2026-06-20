<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { message } from 'ant-design-vue';
import OpHeader from './components/operation/OpHeader.vue';
import OpInsightBand from './components/operation/OpInsightBand.vue';
import OpTicketSummary from './components/operation/OpTicketSummary.vue';
import OpProcessTabs from './components/operation/OpProcessTabs.vue';
import OpSidePanel from './components/operation/OpSidePanel.vue';
import OpActionBar from './components/OpActionBar.vue';
import CreateTicketModal from './components/CreateTicketModal.vue';
import { useTicketOperation } from './composables/useTicketOperation';
import { useProcessForm } from './composables/useProcessForm';
import { useOperationTabs } from './composables/useOperationTabs';
import { buildChildTicketPrefill, buildReopenTicketPrefill } from './composables/childTicketPrefill';
import type { CreateTicketPrefill, Ticket } from './types/ticket';
import type { ProcessFormDraft } from './types/operation';
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
} = useProcessForm();
const { tabData } = useOperationTabs();

const ticketNo = computed(() => (route.params.ticketNo as string) || d.value.no);
const processTabsRef = ref<InstanceType<typeof OpProcessTabs> | null>(null);

const createOpen = ref(false);
const createPrefill = ref<CreateTicketPrefill | null>(null);

function onContact(type: 'call' | 'sms' | 'email', value: string) {
  const label = type === 'call' ? '呼叫' : type === 'sms' ? '短信' : '发邮件';
  message.info(`${label} ${value}（演示）`);
}

function onInsightLink(target: 'customerHistory' | 'related') {
  processTabsRef.value?.switchTab(target);
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
  message.info(`「${name}」（演示）`);
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
      @action="toast"
    />

    <div class="op-body">
      <div class="op-main">
        <OpInsightBand :insight="d.insight" @link="onInsightLink" />
        <OpTicketSummary :detail="d" />
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
      :op-state="opState"
      :suspend-info="suspendInfo"
      :draft-saved-at="draftSavedAt"
      @action="onAction"
      @cancel="confirmCancel"
      @withdraw="confirmWithdraw"
    />

    <CreateTicketModal
      v-model:open="createOpen"
      :prefill="createPrefill"
      @created="onTicketCreated"
    />
  </div>
</template>

<style scoped>
.op-page { display: flex; flex-direction: column; min-height: 100%; }
.op-body {
  display: flex; gap: 16px; padding: 20px; flex: 1; align-items: flex-start;
}
.op-main {
  flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 16px;
}
</style>
