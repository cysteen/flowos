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
import type { TicketRiskVerification } from '@/stores/riskTags';
import type { TicketDetailMeta } from '@/mock/ticketDetail';
import type { TimelineEntry } from '@/views/tickets/types/ticketDetail';

const props = defineProps<{
  detail: TicketDetailMeta;
  /**
   * 当前工单号（取自路由，不取 detail.no）：工单号在数据源里查不到时 detail 会回退演示单，
   * 那时 detail.no 已经不是人正在看的这张单，拿它去取风险监控结论会取到别人的。
   */
  ticketNo: string;
  tabData: OperationTabData;
  form: ProcessFormDraft;
  expandedSections: Record<SectionKey, boolean>;
  activeChip: import('@/views/tickets/types/operation').SupplementChip;
  filledSupplementCount: number;
  /** 完整事件时间线（处理履历 Tab 展示） */
  timeline: TimelineEntry[];
  /**
   * 风险监控侧对本单的现行结论。由页面算好下传，「风险报备」Tab 只做只读回显——
   * 这样 Tab 不必自己去连全局状态，风险这一块的数据入口在页面上只有一处。
   */
  riskVerification?: TicketRiskVerification | null;
  /**
   * 整区只读（一线视角 / 只读角色）：Tab 区不提供任何操作项——表单/下拉/上传全部禁用，
   * 记录上的动作按钮（标记已读、标记已沟通、新增/取消预约、催单、二次激活、重新发起…）一律不出。
   * 查看/下载、Tab 切换、分组展开这类"读"的交互保留。
   *
   * 这是**整区一档**的开关，与逐 Tab 判据 tabWritableFor 取或 —— 它是更强的约束。
   */
  readonly?: boolean;
  /**
   * Tab 上的状态圆点：{ [tab key]: 'warn' | 'danger' }。
   *
   * 【为什么是圆点而不是数字角标】这里要答的是"这个 Tab 里有件事没完"，不是"有几件"——
   * 例如风险报备同一张单最多只允许一条在队，数字恒为 1，写出来没有信息量。
   * 【为什么由页面下传】哪个 Tab 该亮、亮成什么色，判据在页面的业务态里（在队 / 超时），
   * Tab 组件不去连状态，只负责画 —— 与 riskVerification 同一套分工。
   * 【为什么可选】不传即一个圆点不出，既有调用方行为完全不变。
   */
  tabDots?: Partial<Record<ProcessTabKey, 'warn' | 'danger'>>;
  /** 工单已是终态：处理表单锁定 */
  postClose?: boolean;
  /** 终态下商机编号 / 结案后备注是否仍可编辑（非已取消 + 当前用户在最后处理人所在组） */
  postCloseEditable?: boolean;
  /** 商机编号是否可编辑（非终态＝工单处理人；终态＝同 postCloseEditable） */
  leadNoEditable?: boolean;
  /** 底栏「风险报备」形态按钮出不出，透传给「风险报备」Tab（空态指引随它） */
  riskReportEntryVisible?: boolean;
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
  closingNoteFilesAdded: [files: { name: string; size: number }[]];
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

/**
 * 切 Tab —— **只认 `visibleTabs`**，切到当前角色/当前类型下不渲染的 Tab 一律拒绝。
 *
 * 🔴 这道校验是**根上那一道**，不能省：本函数经 `defineExpose` 暴露给工单页，
 * 页头三条风险横幅的「查看报备 / 查看打标 / 查看协同记录」、风险监控页跳过来的
 * `?tab=risk` 深链、底栏动作提交后的自动跳转，统统从这里进。少了它，
 * 「风险报备」Tab 对一线坐席与工单运营在 Tab 条上不渲染（`TAB_ROLE_DENY.risk`），
 * 正文却能被这些入口整块调出来 —— 报备人、风险类型、场景描述全文、附件、打标备注
 * 全部可见，直接打穿基线 §3.1「打标结果一线不可见 / 工单运营连风险词命中页都看不到」。
 *
 * 入口侧**另有一层**（看不到该 Tab 的角色不渲染入口，见 TicketOperationView 的
 * `canViewRiskTab`）：两层缺一层就还能绕 —— 只补入口挡不住深链，只补这里则入口会点了没反应。
 */
function switchTab(key: ProcessTabKey) {
  if (!visibleTabs.value.some((t) => t.key === key)) return;
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
        :class="[{ active: activeTab === t.key }, tabDots?.[t.key] ? `dot-${tabDots[t.key]}` : '']"
        @click="switchTab(t.key)"
      >
        {{ t.label }}
        <!-- 状态圆点：判据在页面侧，此处只画。未激活态另加文字色，让它在一排灰 Tab 里能被一眼找到 -->
        <span v-if="tabDots?.[t.key]" class="tab-dot" aria-hidden="true"></span>
      </button>
    </div>

    <!--
      只读态（整区开关 或 本 Tab 对当前角色不可写）：a-config-provider 统一禁用 Tab 内所有
      antd 表单控件，自定义的动作按钮由下方 .is-readonly 样式收掉（读的交互不受影响）。
      判据逐 Tab 算，见 activeTabReadonly。
    -->
    <a-config-provider :component-disabled="activeTabReadonly">
    <div class="tab-content" :class="{ 'is-readonly': activeTabReadonly }">
      <!-- 「工单处理」Tab 顶部的类型专属只读块（刷机单：自动刷机结果 · 刷机信息），由页面按类型填入 -->
      <div v-if="activeTab === 'process' && $slots['process-top']" class="process-top">
        <slot name="process-top" />
      </div>
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
        :ticket-no="ticketNo"
        :readonly="activeTabReadonly"
        :post-close="postClose"
        :post-close-editable="postCloseEditable"
        :lead-no-editable="leadNoEditable"
        @closing-note-files-added="emit('closingNoteFilesAdded', $event)"
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

      <!-- 风险标记三件套走 form（与「补充处理 → 风险」面板同一份），Tab 本地字段仍走 riskDraft -->
      <OpRiskMonitorTab
        v-else-if="activeTab === 'risk'"
        :ticket-no="ticketNo"
        :ticket-title="detail.title"
        :draft="tabData.riskDraft"
        :form="form"
        :risk-verification="riskVerification"
        :readonly="activeTabReadonly"
        :report-entry-visible="riskReportEntryVisible"
        @update:draft="updateTabData({ ...tabData, riskDraft: $event })"
        @update:form="emit('update:form', $event)"
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
  display: inline-flex; align-items: center; gap: 5px;
}
.tab-item:hover { color: #374151; }
.tab-item.active { color: #1a6fff; font-weight: 600; border-bottom-color: #1a6fff; }

/*
  Tab 状态圆点：橙＝有事在队，红＝已超时限。
  圆点不用 currentColor —— 选中该 Tab 时文字转蓝，但"这件事还没完"这个事实没变，
  圆点得继续按状态色说话，不能跟着变蓝。
  未激活态连文字一起转色 + 加粗：一排 12px 灰 Tab 里，只靠一枚 6px 圆点找不着。
*/
.tab-dot { width: 6px; height: 6px; border-radius: 50%; flex: none; }
.tab-item.dot-warn .tab-dot { background: #f97316; }
.tab-item.dot-danger .tab-dot {
  background: #dc2626;
  /* 慢脉冲：只做透明度轻微起伏，2s 一轮 —— 要的是余光能察觉，不是抢注意力 */
  animation: tab-dot-pulse 2s ease-in-out infinite;
}
.tab-item.dot-warn:not(.active) { color: #f97316; font-weight: 600; }
.tab-item.dot-danger:not(.active) { color: #dc2626; font-weight: 600; }
@keyframes tab-dot-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.45; transform: scale(0.86); }
}
/* 跟随系统「减少动态效果」设置：动效是提示不是信息，关掉后圆点仍在 */
@media (prefers-reduced-motion: reduce) {
  .tab-item.dot-danger .tab-dot { animation: none; }
}
.process-top { display: flex; flex-direction: column; gap: 12px; margin-bottom: 12px; flex: none; }
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
