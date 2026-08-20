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
const OpFeishuTab = defineAsyncComponent(() => import('./tabs/OpFeishuTab.vue'));
const OpAppointmentTab = defineAsyncComponent(() => import('./tabs/OpAppointmentTab.vue'));
import { useUserStore } from '@/stores/user';
import {
  isRegulatorComplaintPlatform,
  visibleProcessTabs,
  tabWritableFor,
  deriveAppointmentNeeded,
  type ProcessTabKey,
} from '@/views/tickets/types/operation';
import type { ProcessFormDraft, SectionKey } from '@/views/tickets/types/operation';
import type { OperationTabData } from '@/views/tickets/types/operationTabs';
import type { TicketDetailMeta } from '@/mock/ticketDetail';
import type { TimelineEntry } from '@/views/tickets/types/ticketDetail';

const props = defineProps<{
  detail: TicketDetailMeta;
  tabData: OperationTabData;
  form: ProcessFormDraft;
  expandedSections: Record<SectionKey, boolean>;
  activeChip: import('@/views/tickets/types/operation').SupplementChip;
  filledSupplementCount: number;
  /** 完整事件时间线（处理履历 Tab 展示） */
  timeline: TimelineEntry[];
  /**
   * 整区只读（一线视角 / 只读角色）：Tab 区不提供任何操作项——表单/下拉/上传全部禁用，
   * 记录上的动作按钮（标记已读、标记已沟通、新增/取消预约、催单、二次激活、重新发起…）一律不出。
   * 查看/下载、Tab 切换、分组展开这类"读"的交互保留。
   *
   * 这是**整区一档**的开关，与逐 Tab 判据 tabWritableFor 取或 —— 它是更强的约束。
   */
  readonly?: boolean;
}>();

const emit = defineEmits<{
  toggleSection: [key: SectionKey];
  selectChip: [chip: import('@/views/tickets/types/operation').SupplementChip];
  'update:form': [form: ProcessFormDraft];
  'update:tabData': [data: OperationTabData];
  openChildCreate: [];
  openReopenCreate: [];
  'mark-read': [id: string];
  'feishu-activate': [reason: string];
  'feishu-retry': [];
  dunning: [];
}>();

const user = useUserStore();
const activeTab = ref<ProcessTabKey>('process');
/** synced / feedback / closed / failed 时展示「产研反馈」Tab */
const feishuActive = computed(() => {
  const s = props.detail.feishuSync;
  return !!s && s !== 'none';
});
// 按工单类型 + 当前角色过滤：技术支持处理 / 风险监控 / 预约三个 Tab 有角色黑名单，
// 判据表在 visibleProcessTabs 内（取自权限矩阵 #41–51 取值为「无」的 6 格）
const visibleTabs = computed(() =>
  visibleProcessTabs(props.detail.type, user.roleKey, { feishuActive: feishuActive.value }),
);

/**
 * 驱动「投诉标记扩展选项 / 投诉渠道跟进」的平台。
 * 建单页投诉平台是成对多组，此处取**首个监管平台**——任一平台是监管平台就该放出有责/无责标记；
 * 都不是则回落到第一组，仅用于外投分支判定。
 */
const drivingComplaintPlatform = computed(() => {
  const picks = props.detail.complaint?.platforms ?? [];
  const names = picks.map((p) => p.platform).filter(Boolean);
  return names.find((n) => isRegulatorComplaintPlatform(n)) ?? names[0];
});

/**
 * 当前 Tab 是否只读 = **整区开关**（一线视角 / 只读角色）**或** 该 Tab 对当前角色不可写。
 *
 * 判据表在 tabWritableFor 内（取自权限矩阵 #41–51 的「只读 vs 可用」，⑥ 的「条件可用」按不可写算）。
 * 逐 Tab 算而不是整区一档 —— 例如「联系记录」对 ② 二线可写、对 ④ 三线只读，
 * 两者在同一页面上必须有差别。
 *
 * 落地方式：这一个 boolean 同时驱动 a-config-provider（禁掉 Tab 内所有 antd 控件）与
 * .is-readonly（收掉自定义写按钮），并作为 readonly prop 传给**自带原生写按钮**的子组件，
 * 让它们的点击处理函数硬拦一道（不止是视觉隐藏）。
 */
const activeTabReadonly = computed(
  () => !!props.readonly || !tabWritableFor(activeTab.value, user.roleKey),
);

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

    <!--
      只读态（整区开关 或 本 Tab 对当前角色不可写）：a-config-provider 统一禁用 Tab 内所有
      antd 表单控件，自定义的动作按钮由下方 .is-readonly 样式收掉（读的交互不受影响）。
      判据逐 Tab 算，见 activeTabReadonly。
    -->
    <a-config-provider :component-disabled="activeTabReadonly">
    <div class="tab-content" :class="{ 'is-readonly': activeTabReadonly }">
      <OpProcessForm
        v-if="activeTab === 'process'"
        :form="form"
        :ticket-type="detail.type"
        :expanded-sections="expandedSections"
        :active-chip="activeChip"
        :filled-supplement-count="filledSupplementCount"
        :show-external="detail.isExternalAppeal"
        :ticket-source="detail.source"
        :complaint-platform="drivingComplaintPlatform"
        :complaint-platforms="detail.complaint?.platforms ?? []"
        :readonly="activeTabReadonly"
        @toggle-section="emit('toggleSection', $event)"
        @select-chip="emit('selectChip', $event)"
        @update:form="emit('update:form', $event)"
      />

      <OpFeishuTab
        v-else-if="activeTab === 'feishu'"
        :records="detail.feishuRecords ?? []"
        :sync-state="detail.feishuSync"
        :feedback-name="detail.title"
        :priority="detail.priority"
        :product-name="detail.product.name"
        :feedback-no="detail.feishuFeedbackNo"
        :fail-reason="detail.feishuFailReason"
        :created-at="detail.createdAt"
        :readonly="activeTabReadonly"
        @activate="emit('feishu-activate', $event)"
        @retry="emit('feishu-retry')"
        @dunning="emit('dunning')"
      />

      <OpTechProcessTab
        v-else-if="activeTab === 'tech'"
        :draft="tabData.techDraft"
        :readonly="activeTabReadonly"
        @update:draft="updateTabData({ ...tabData, techDraft: $event })"
      />

      <OpRiskMonitorTab
        v-else-if="activeTab === 'risk'"
        :draft="tabData.riskDraft"
        :readonly="activeTabReadonly"
        @update:draft="updateTabData({ ...tabData, riskDraft: $event })"
      />

      <OpFlowHistoryTab
        v-else-if="activeTab === 'history'"
        :current-node="detail.status"
        :entries="timeline"
      />

      <OpAppointmentTab
        v-else-if="activeTab === 'appointment'"
        :records="form.appointmentRecords"
        :default-booker="user.name || '当前坐席'"
        :readonly="activeTabReadonly"
        @update:records="emit('update:form', { ...form, appointmentRecords: $event, appointmentNeeded: deriveAppointmentNeeded($event) })"
      />

      <OpRelatedTab
        v-else-if="activeTab === 'related'"
        :related-tickets="tabData.relatedTickets"
        :supplement-records="tabData.supplementRecords"
        :dunning-records="tabData.dunningRecords"
        :readonly="activeTabReadonly"
        @mark-read="emit('mark-read', $event)"
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
        :readonly="activeTabReadonly"
      />

      <OpCustomerHistoryTab
        v-else-if="activeTab === 'customerHistory'"
        :data="tabData.customerHistory"
      />
    </div>
    </a-config-provider>
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
  padding: 8px 12px; font-size: 12px; color: #6b7280; font-weight: 500;
  background: none; border: none; border-bottom: 2px solid transparent;
  cursor: pointer; white-space: nowrap; margin-bottom: -1px;
  font-family: inherit; line-height: 1.3;
}
.tab-item:hover { color: #374151; }
.tab-item.active { color: #1a6fff; font-weight: 600; border-bottom-color: #1a6fff; }
.tab-content {
  padding: 12px 12px 16px; flex: 1 1 auto;
  display: flex; flex-direction: column; min-height: 0;
  overflow-y: auto;
}

/*
  只读态（整区开关 或 本 Tab 对当前角色只读）：收掉 Tab 内的「写」按钮——
  标记已读 / 标记已沟通 / 新增·取消预约 /
  附件添加·移除·上传 / 产研反馈的重新发起·催单·二次激活。
  「读」的交互（查看、下载、播放录音、跳转单号、筛选 chip、查看流程图、展开分组）保留。
  antd 表单控件由 a-config-provider component-disabled 统一禁用，不在此列。
*/
.tab-content.is-readonly :deep(.record-read-btn),
.tab-content.is-readonly :deep(.record-done-btn),
.tab-content.is-readonly :deep(.record-save-btn),
.tab-content.is-readonly :deep(.record-discard-btn),
.tab-content.is-readonly :deep(.record-cancel-btn),
.tab-content.is-readonly :deep(.add-btn),
.tab-content.is-readonly :deep(.attach-trigger),
.tab-content.is-readonly :deep(.attach-remove),
.tab-content.is-readonly :deep(.upload-btn),
.tab-content.is-readonly :deep(.fs-retry),
.tab-content.is-readonly :deep(.fs-sheet-actions .action-btn) {
  display: none;
}
</style>
