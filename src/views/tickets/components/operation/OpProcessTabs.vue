<script setup lang="ts">
import { computed, defineAsyncComponent, ref, watch } from 'vue';
import OpProcessForm from './OpProcessForm.vue';
// 默认「工单处理」表单同步加载；其余 Tab 按需异步加载，缩小首屏 chunk、加快点开速度。
const OpTechProcessTab = defineAsyncComponent(() => import('./tabs/OpTechProcessTab.vue'));
const OpRiskMonitorTab = defineAsyncComponent(() => import('./tabs/OpRiskMonitorTab.vue'));
const OpFlowHistoryTab = defineAsyncComponent(() => import('./tabs/OpFlowHistoryTab.vue'));
const OpRelatedTab = defineAsyncComponent(() => import('./tabs/OpRelatedTab.vue'));
const OpContactRecordsTab = defineAsyncComponent(() => import('./tabs/OpContactRecordsTab.vue'));
const OpNotifyRecordsTab = defineAsyncComponent(() => import('./tabs/OpNotifyRecordsTab.vue'));
const OpSurveyRecordsTab = defineAsyncComponent(() => import('./tabs/OpSurveyRecordsTab.vue'));
const OpAttachmentHistoryTab = defineAsyncComponent(() => import('./tabs/OpAttachmentHistoryTab.vue'));
const OpCustomerHistoryTab = defineAsyncComponent(() => import('./tabs/OpCustomerHistoryTab.vue'));
import { visibleProcessTabs, type ProcessTabKey } from '@/views/tickets/types/operation';
import type { ProcessFormDraft, SectionKey } from '@/views/tickets/types/operation';
import type { OperationTabData } from '@/views/tickets/types/operationTabs';
import type { TicketDetailMeta } from '@/mock/ticketDetail';

const props = defineProps<{
  detail: TicketDetailMeta;
  tabData: OperationTabData;
  form: ProcessFormDraft;
  expandedSections: Record<SectionKey, boolean>;
  activeChip: import('@/views/tickets/types/operation').SupplementChip;
  filledSupplementCount: number;
}>();

const emit = defineEmits<{
  toggleSection: [key: SectionKey];
  selectChip: [chip: import('@/views/tickets/types/operation').SupplementChip];
  'update:form': [form: ProcessFormDraft];
  'update:tabData': [data: OperationTabData];
  openChildCreate: [];
  openReopenCreate: [];
}>();

const activeTab = ref<ProcessTabKey>('process');
const visibleTabs = computed(() => visibleProcessTabs(props.detail.type));

/** 工单类型变化后，若当前 Tab 已被该类型隐藏，回退到「工单处理」。 */
watch(visibleTabs, (tabs) => {
  if (!tabs.some((t) => t.key === activeTab.value)) activeTab.value = 'process';
});

function switchTab(key: ProcessTabKey) {
  activeTab.value = key;
}

function updateTabData(next: OperationTabData) {
  emit('update:tabData', next);
}

defineExpose({ switchTab });
</script>

<template>
  <div class="process-tabs">
    <div class="tab-bar">
      <button
        v-for="t in visibleTabs"
        :key="t.key"
        class="tab-item"
        :class="{ active: activeTab === t.key }"
        @click="switchTab(t.key)"
      >
        {{ t.label }}
      </button>
    </div>

    <div class="tab-content">
      <OpProcessForm
        v-if="activeTab === 'process'"
        :form="form"
        :ticket-type="detail.type"
        :expanded-sections="expandedSections"
        :active-chip="activeChip"
        :filled-supplement-count="filledSupplementCount"
        :show-external="detail.isExternalAppeal"
        @toggle-section="emit('toggleSection', $event)"
        @select-chip="emit('selectChip', $event)"
        @update:form="emit('update:form', $event)"
      />

      <OpTechProcessTab
        v-else-if="activeTab === 'tech'"
        :draft="tabData.techDraft"
        @update:draft="updateTabData({ ...tabData, techDraft: $event })"
      />

      <OpRiskMonitorTab
        v-else-if="activeTab === 'risk'"
        :draft="tabData.riskDraft"
        @update:draft="updateTabData({ ...tabData, riskDraft: $event })"
      />

      <OpFlowHistoryTab
        v-else-if="activeTab === 'history'"
        :current-node="tabData.currentFlowNode"
        :nodes="tabData.flowHistory"
      />

      <OpRelatedTab
        v-else-if="activeTab === 'related'"
        :related-tickets="tabData.relatedTickets"
        :supplement-records="tabData.supplementRecords"
        :dunning-records="tabData.dunningRecords"
      />

      <OpContactRecordsTab
        v-else-if="activeTab === 'contact'"
        :records="tabData.contactRecords"
      />

      <OpNotifyRecordsTab
        v-else-if="activeTab === 'notify'"
        :records="tabData.notifyRecords"
      />

      <OpSurveyRecordsTab
        v-else-if="activeTab === 'survey'"
        :records="tabData.surveyRecords"
      />

      <OpAttachmentHistoryTab
        v-else-if="activeTab === 'attachments'"
        :records="tabData.attachmentHistory"
      />

      <OpCustomerHistoryTab
        v-else-if="activeTab === 'customerHistory'"
        :data="tabData.customerHistory"
      />
    </div>
  </div>
</template>

<style scoped>
.process-tabs {
  background: #fff; border: 1px solid #e5e7eb; border-radius: 8px;
  display: flex; flex-direction: column; min-height: 320px;
  flex: 1; min-width: 0;
}
.tab-bar {
  display: flex; flex-wrap: wrap; align-items: center;
  border-bottom: 1px solid #e5e7eb;
  flex: none;
}
.tab-item {
  padding: 10px 14px; font-size: 13px; color: #6b7280; font-weight: 500;
  background: none; border: none; border-bottom: 2px solid transparent;
  cursor: pointer; white-space: nowrap; margin-bottom: -1px;
  font-family: inherit; line-height: 1.2;
}
.tab-item:hover { color: #374151; }
.tab-item.active { color: #1a6fff; font-weight: 600; border-bottom-color: #1a6fff; }
.tab-content {
  padding: 16px 16px 24px; flex: 1 1 auto;
  display: flex; flex-direction: column; min-height: 0;
  overflow-y: auto;
}
</style>
