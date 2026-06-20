<script setup lang="ts">
import { ref } from 'vue';
import OpProcessForm from './OpProcessForm.vue';
import OpTechProcessTab from './tabs/OpTechProcessTab.vue';
import OpRiskMonitorTab from './tabs/OpRiskMonitorTab.vue';
import OpFlowHistoryTab from './tabs/OpFlowHistoryTab.vue';
import OpRelatedTab from './tabs/OpRelatedTab.vue';
import OpContactRecordsTab from './tabs/OpContactRecordsTab.vue';
import OpNotifyRecordsTab from './tabs/OpNotifyRecordsTab.vue';
import OpSurveyRecordsTab from './tabs/OpSurveyRecordsTab.vue';
import OpCustomerHistoryTab from './tabs/OpCustomerHistoryTab.vue';
import { PROCESS_TABS, type ProcessTabKey } from '@/views/tickets/types/operation';
import type { ProcessFormDraft } from '@/views/tickets/types/operation';
import type { OperationTabData } from '@/views/tickets/types/operationTabs';
import type { TicketDetailMeta } from '@/mock/ticketDetail';

defineProps<{
  detail: TicketDetailMeta;
  tabData: OperationTabData;
  form: ProcessFormDraft;
  expandedSections: { record: boolean; service: boolean; supplement: boolean; external: boolean };
  activeChip: import('@/views/tickets/types/operation').SupplementChip;
  filledSupplementCount: number;
}>();

const emit = defineEmits<{
  toggleSection: [key: 'record' | 'service' | 'supplement' | 'external'];
  selectChip: [chip: import('@/views/tickets/types/operation').SupplementChip];
  'update:form': [form: ProcessFormDraft];
  'update:tabData': [data: OperationTabData];
  openChildCreate: [];
  openReopenCreate: [];
}>();

const activeTab = ref<ProcessTabKey>('process');

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
        v-for="t in PROCESS_TABS"
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
