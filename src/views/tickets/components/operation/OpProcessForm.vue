<script setup lang="ts">
import { computed, watch } from 'vue';
import {
  FileTextOutlined, CheckCircleOutlined, AppstoreOutlined,
  CheckOutlined,
} from '@ant-design/icons-vue';
import OpCollapsibleSection from './OpCollapsibleSection.vue';
import OpRecordFields from './OpRecordFields.vue';
import OpSupplementChipPanels from './OpSupplementChipPanels.vue';
import FormSelect from '@/views/tickets/components/create-ticket/FormSelect.vue';
import type {
  ProcessFormDraft, SupplementChip, SectionKey,
} from '@/views/tickets/types/operation';
import {
  RESOLUTION_CONCLUSION_OPTIONS,
  SERVICE_SOLUTION_CONCLUSION,
  SERVICE_SOLUTION_OPTIONS,
  SERVICE_TYPE_OPTIONS,
  SERVICE_TYPE_TO_METHODS,
  LEAD_STAGE_OPTIONS,
  deriveAppointmentNeeded,
  isAppointmentFilled,
} from '@/views/tickets/types/operation';
import { COMPLAINT_L3_MAP } from '@/views/tickets/types/createTicket';

const props = defineProps<{
  form: ProcessFormDraft;
  /** 工单类型：投诉=完整表单；咨询/建议/商机=精简复用 */
  ticketType: string;
  expandedSections: Record<SectionKey, boolean>;
  activeChip: SupplementChip;
  filledSupplementCount: number;
  showExternal: boolean;
  /** 投诉平台（控制投诉标记扩展选项） */
  complaintPlatform?: string;
  /** 建单投诉平台列表（投诉渠道跟进按平台分行，内投/外投均含） */
  complaintPlatforms?: { platform: string; customPlatform?: string; complaintNo: string }[];
  /** 工单来源（内投/外投渠道时展示投诉渠道 chip） */
  ticketSource?: string;
  /**
   * 「工单处理」**这个 Tab** 对当前角色只读（矩阵 #41：① ⑦ ⑧ 只读、⑥ 条件可用暂按不可写）。
   *
   * 只是 Tab 级一档，**不是**本区逐字段的角色判据 —— 矩阵 #35–40 给处理表单区六行分别列了
   * 九列取值（例如「服务与结论」④ 三线不给、「建单规范 check」① ④ 不给），那套逐字段判据另议。
   */
  readonly?: boolean;
}>();

const emit = defineEmits<{
  toggleSection: [key: SectionKey];
  selectChip: [chip: SupplementChip];
  'update:form': [form: ProcessFormDraft];
}>();

const isComplaint = computed(() => props.ticketType === '投诉');
const isConsult = computed(() => props.ticketType === '咨询');
const isSuggest = computed(() => props.ticketType === '建议');
const isLead = computed(() => props.ticketType === '商机');
/** 投诉渠道 chip：建单登记了平台，或来源为内投/外投渠道（PRD：投诉渠道记录） */
const showComplaintChannel = computed(() => {
  if ((props.complaintPlatforms ?? []).some((p) => p.platform)) return true;
  const src = props.ticketSource ?? '';
  if (src === '内投渠道' || src === '外投渠道') return true;
  return props.showExternal;
});

/** 单一写出口：只读态在此统一拦一道，本区所有字段的回写都经过这里 */
function patch(part: Partial<ProcessFormDraft>) {
  if (props.readonly) return;
  emit('update:form', { ...props.form, ...part });
}

/**
 * 商机解决结论：a-select 的 update:value 按 antd 声明给出 SelectValue（含 LabeledValue / 数组），
 * 但该 select 的 options 固定为 LEAD_STAGE_OPTIONS（单选、未开 labelInValue），
 * 取值只可能是 leadStage 的字面量之一，故收窄。
 */
function onLeadStageChange(v: unknown) {
  patch({ leadStage: v as ProcessFormDraft['leadStage'] });
}

function onConclusionChange(v: string) {
  const next = v ?? '';
  patch({
    conclusion: next,
    // 切离「服务方案解决」时清空解决方案
    serviceSolution: next === SERVICE_SOLUTION_CONCLUSION ? props.form.serviceSolution : '',
  });
}

function onServiceTypeChange(type: string) {
  const methods = SERVICE_TYPE_TO_METHODS[type] ?? [];
  const nextMethod = methods.includes(props.form.serviceMethod)
    ? props.form.serviceMethod
    : (methods[0] ?? '');
  patch({ serviceType: type, serviceMethod: nextMethod });
}

function onServiceMethodChange(method: string) {
  patch({ serviceMethod: method });
}

const conclusionOptions = RESOLUTION_CONCLUSION_OPTIONS.map((v) => ({ label: v, value: v }));
const serviceSolutionOptions = SERVICE_SOLUTION_OPTIONS.map((v) => ({ label: v, value: v }));
const serviceTypeOptions = SERVICE_TYPE_OPTIONS.map((v) => ({ label: v, value: v }));
const showServiceSolution = computed(
  () => props.form.conclusion === SERVICE_SOLUTION_CONCLUSION,
);
/** 旧枚举残留（如「代金券」）不在新清单内时清空，避免下拉显示脏值 */
watch(
  () => props.form.serviceSolution,
  (v) => {
    if (v && !(SERVICE_SOLUTION_OPTIONS as readonly string[]).includes(v)) {
      patch({ serviceSolution: '' });
    }
  },
  { immediate: true },
);
const serviceMethodOptions = computed(() => {
  const methods = SERVICE_TYPE_TO_METHODS[props.form.serviceType] ?? [];
  return methods.map((v) => ({ label: v, value: v }));
});
// 补充处理 chip：投诉=投诉分类/风险/建单规范；咨询/建议/商机=建单规范。
// 预约已迁出为独立「预约」Tab（处理履历之后），不再作为补充处理 chip。
const supplementChips = computed<{ key: SupplementChip; label: string }[]>(() => {
  if (!isComplaint.value) return [{ key: 'quality', label: '建单规范' }];
  const chips: { key: SupplementChip; label: string }[] = [
    { key: 'complaint', label: '投诉分类' },
    { key: 'risk', label: '风险' },
    { key: 'quality', label: '建单规范' },
  ];
  if (showComplaintChannel.value) chips.splice(1, 0, { key: 'external', label: '投诉渠道' });
  return chips;
});

/** activeChip 不在当前类型 chip 集合时（如全局默认 complaint 用于咨询）兜底到首个 chip */
const effectiveChip = computed<SupplementChip>(() =>
  supplementChips.value.some((c) => c.key === props.activeChip)
    ? props.activeChip
    : supplementChips.value[0].key,
);

function complaintCategoryFilled(f: ProcessFormDraft): boolean {
  if (!f.complaintCat1 || !f.complaintCat2) return false;
  const l3 = COMPLAINT_L3_MAP[f.complaintCat2] ?? [];
  if (l3.length && !f.complaintCat3) return false;
  return true;
}

function isChipFilled(key: SupplementChip): boolean {
  const f = props.form;
  switch (key) {
    case 'complaint': return !!(f.complaintMark && complaintCategoryFilled(f) && f.complaintNote.trim());
    case 'external': {
      const rows = f.platformFollowups;
      const plats = (props.complaintPlatforms ?? []).filter((p) => p.platform);
      if (!plats.length) return rows.length > 0 && rows.every((r) => r.replyResult.trim() && r.reconcile);
      return plats.length === rows.length
        && rows.every((r) => r.replyResult.trim() && r.reconcile);
    }
    case 'risk': {
      if (f.riskFlag === '有风险') return !!(f.riskLevel && f.riskDescription.trim());
      if (f.riskFlag === '疑似风险') return !!f.riskDescription.trim();
      return true;
    }
    case 'appointment': return deriveAppointmentNeeded(f.appointmentRecords) && isAppointmentFilled(f.appointmentRecords);
    case 'quality': return f.qualityIsStandard || !!(f.qualityIssueCat1 && f.qualityIssueCat2);
    default: return false;
  }
}

/** 可见 chip 中必填未齐的数量（用于标题强提示） */
const incompleteChipCount = computed(
  () => supplementChips.value.filter((c) => !isChipFilled(c.key)).length,
);
const supplementBadge = computed(() =>
  incompleteChipCount.value > 0
    ? `待填 ${incompleteChipCount.value} 项`
    : '已填齐',
);
const supplementBadgeVariant = computed(() =>
  (incompleteChipCount.value > 0 ? 'warn' : 'count') as 'warn' | 'count',
);

function chipActiveClass(key: SupplementChip): string {
  if (effectiveChip.value !== key) return '';
  const map: Record<SupplementChip, string> = {
    complaint: 'active',
    external: 'active-external',
    risk: 'active-risk',
    appointment: 'active-appointment',
    quality: 'active-quality',
  };
  return map[key];
}
</script>

<template>
  <div class="process-form">
    <!-- 处理记录（所有工单类型共用核心区） -->
    <OpCollapsibleSection
      title="处理记录"
      :icon="FileTextOutlined"
      badge="必填"
      badge-variant="required"
      :expanded="expandedSections.record"
      @toggle="emit('toggleSection', 'record')"
    >
      <OpRecordFields
        :problem-cause="form.problemCause"
        :process-result="form.processResult"
        :problem-cause-attachments="form.problemCauseAttachments"
        :process-result-attachments="form.processResultAttachments"
        :readonly="readonly"
        @update:problem-cause="(v) => patch({ problemCause: v })"
        @update:process-result="(v) => patch({ processResult: v })"
        @update:problem-cause-attachments="(v) => patch({ problemCauseAttachments: v })"
        @update:process-result-attachments="(v) => patch({ processResultAttachments: v })"
      />
    </OpCollapsibleSection>

    <!-- ===== 服务与结论：投诉 + 咨询（均支持服务方式 / 服务类型 / 问题解决结论） ===== -->
    <OpCollapsibleSection
      v-if="isComplaint || isConsult"
      title="服务与结论"
      :icon="CheckCircleOutlined"
      :expanded="expandedSections.service"
      @toggle="emit('toggleSection', 'service')"
    >
      <div class="section-subhead">
        <span class="sub-title">服务方式与解决结论</span>
        <span class="sub-hint">结案前确认</span>
      </div>
      <div class="field-row field-row--service">
        <div class="field inline">
          <label>服务类型</label>
          <FormSelect
            :value="form.serviceType"
            :options="serviceTypeOptions"
            placeholder="请选择或搜索"
            style="width: 100%"
            @update:value="(v) => onServiceTypeChange(String(v ?? ''))"
          />
        </div>
        <div class="field inline">
          <label>服务方式</label>
          <FormSelect
            :value="form.serviceMethod"
            :options="serviceMethodOptions"
            placeholder="请先选服务类型"
            style="width: 100%"
            @update:value="(v) => onServiceMethodChange(String(v ?? ''))"
          />
        </div>
        <div class="field inline">
          <label>问题解决结论</label>
          <FormSelect
            :value="form.conclusion"
            :options="conclusionOptions"
            placeholder="请选择或搜索"
            style="width: 100%"
            @update:value="(v) => onConclusionChange(String(v ?? ''))"
          />
        </div>
        <div v-if="showServiceSolution" class="field inline">
          <label><span class="req">*</span>解决方案</label>
          <FormSelect
            :value="form.serviceSolution"
            :options="serviceSolutionOptions"
            placeholder="请选择解决方案"
            style="width: 100%"
            @update:value="(v) => patch({ serviceSolution: String(v ?? '') })"
          />
        </div>
      </div>
    </OpCollapsibleSection>

    <!-- ===== 建议：服务与结论(是否采纳) ===== -->
    <template v-if="isSuggest">
      <OpCollapsibleSection
        title="服务与结论"
        :icon="CheckCircleOutlined"
        badge="结案前确认"
        badge-variant="hint"
        :expanded="expandedSections.service"
        @toggle="emit('toggleSection', 'service')"
      >
        <div class="field inline conclusion-row">
          <label>是否采纳</label>
          <a-radio-group
            :value="form.suggestAccepted"
            @update:value="(v: boolean) => patch({ suggestAccepted: v })"
          >
            <a-radio :value="true">是</a-radio>
            <a-radio :value="false">否</a-radio>
          </a-radio-group>
        </div>
      </OpCollapsibleSection>
    </template>

    <!-- ===== 商机：服务与结论(商机解决结论 + 商机编号) ===== -->
    <template v-if="isLead">
      <OpCollapsibleSection
        title="服务与结论"
        :icon="CheckCircleOutlined"
        badge="结案前确认"
        badge-variant="hint"
        :expanded="expandedSections.service"
        @toggle="emit('toggleSection', 'service')"
      >
        <div class="field-row">
          <div class="field inline">
            <label>商机解决结论</label>
            <a-select
              :value="form.leadStage"
              :options="LEAD_STAGE_OPTIONS"
              placeholder="请选择"
              style="width: 100%"
              @update:value="onLeadStageChange"
            />
          </div>
          <div class="field inline">
            <label>商机编号</label>
            <a-input
              :value="form.leadNo"
              placeholder="CRM 商机单号"
              @update:value="(v: string) => patch({ leadNo: v })"
            />
          </div>
        </div>
      </OpCollapsibleSection>
    </template>

    <!-- ===== 补充处理（四类型通用：预约 + 建单规范；投诉另含投诉分类 / 风险） ===== -->
    <OpCollapsibleSection
      title="补充处理"
      :icon="AppstoreOutlined"
      :badge="supplementBadge"
      :badge-variant="supplementBadgeVariant"
      split-head
      :expanded="expandedSections.supplement"
      @toggle="emit('toggleSection', 'supplement')"
    >
      <template #head-extra>
        <div class="chip-row">
          <button
            v-for="c in supplementChips"
            :key="c.key"
            class="chip"
            :class="[
              chipActiveClass(c.key),
              {
                filled: isChipFilled(c.key),
                'need-fill': !isChipFilled(c.key),
              },
            ]"
            @click.stop="emit('selectChip', c.key)"
          >
            <span v-if="!isChipFilled(c.key)" class="chip-need-dot" />
            {{ c.label }}
            <span v-if="!isChipFilled(c.key)" class="chip-need-tag">待填</span>
            <CheckOutlined v-else class="chip-check" />
          </button>
        </div>
      </template>

      <div v-if="incompleteChipCount > 0" class="supp-hint">
        还有 {{ incompleteChipCount }} 项待完善
      </div>

      <OpSupplementChipPanels
        :active-chip="effectiveChip"
        :form="form"
        :complaint-platform="complaintPlatform"
        :complaint-platforms="complaintPlatforms"
        :show-external="showComplaintChannel"
        :readonly="readonly"
        @update:form="emit('update:form', $event)"
      />
    </OpCollapsibleSection>
  </div>
</template>

<style scoped>
.process-form { display: flex; flex-direction: column; gap: 12px; }
.section-subhead {
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
}
.sub-title { font-size: 12px; font-weight: 600; color: #111827; }
.sub-hint { font-size: 11px; color: #9ca3af; }
.field { display: flex; flex-direction: column; gap: 6px; }
.field.inline { flex: 1; min-width: 0; }
.field label { font-size: 12px; font-weight: 600; color: #374151; }
.field label .req { color: #ef4444; margin-right: 2px; }
.field-row { display: flex; gap: 8px; }
.field-row .field.inline { flex: 1 1 0; min-width: 0; }
.field-row--service { align-items: flex-start; flex-wrap: nowrap; }
.field-row--service .field.inline { flex: 1 1 0; min-width: 0; }
.field-row :deep(.ant-select-selector) {
  height: 32px;
  min-height: 32px;
  font-size: 12px;
}
.field-row :deep(.ant-select-selection-item),
.field-row :deep(.ant-select-selection-placeholder) {
  font-size: 12px;
  line-height: 30px;
}
.field-row :deep(.ant-input) {
  height: 32px;
  font-size: 12px;
}
.select-like {
  display: flex; align-items: center; gap: 6px;
  padding: 6px 8px; background: #fff; border: 1px solid #e5e7eb;
  border-radius: 6px; font-size: 12px; color: #111827; min-height: 32px;
}
.select-like.locked { color: #6b7280; justify-content: space-between; }
.locked-text { flex: 1; min-width: 0; }
.sel-icon { color: #9ca3af; font-size: 12px; }
.sel-arrow { color: #9ca3af; margin-left: auto; font-size: 10px; }
.conclusion-row { flex-direction: row; align-items: center; gap: 12px; flex-wrap: wrap; }
.conclusion-row label { width: 96px; flex: none; }
/* 防止单选项文字（如「否（不规范）」）被挤断行 */
.process-form :deep(.ant-radio-wrapper) { white-space: nowrap; }
.process-form :deep(.ant-radio-group) { display: inline-flex; flex-wrap: wrap; gap: 4px 12px; }
.chip-row { display: flex; gap: 8px; flex-wrap: nowrap; }
.chip {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 6px 12px; border-radius: 6px; font-size: 12px; font-weight: 500;
  border: 1px solid #e5e7eb; background: #f9fafb; color: #6b7280; cursor: pointer;
  white-space: nowrap; flex: none;
}
.chip.need-fill {
  border-color: #e5e7eb;
  background: #fff;
  color: #6b7280;
  font-weight: 500;
}
.chip.need-fill.active,
.chip.need-fill.active-external,
.chip.need-fill.active-risk,
.chip.need-fill.active-appointment,
.chip.need-fill.active-quality {
  /* 选中态交给 .active*，不再叠加大红描边 */
  box-shadow: none;
}
.chip-need-dot {
  width: 5px; height: 5px; border-radius: 50%; background: #f59e0b; flex: none;
}
.chip-need-tag {
  font-size: 10px;
  font-weight: 600;
  line-height: 1;
  padding: 2px 5px;
  border-radius: 3px;
  color: #b45309;
  background: #fffbeb;
  border: 1px solid #fde68a;
  flex: none;
}
.chip.active {
  border-color: #1a6fff; background: #eff6ff; color: #1a6fff;
  font-weight: 600;
}
.chip.active-external {
  border-color: #1a6fff; background: #eff6ff; color: #1a6fff;
  font-weight: 600;
}
.chip.active-risk {
  border-color: #1a6fff; background: #eff6ff; color: #1a6fff;
  font-weight: 600;
}
.chip.active-appointment {
  border-color: #1a6fff; background: #eff6ff; color: #1a6fff;
  font-weight: 600;
}
.chip.active-quality {
  border-color: #1a6fff; background: #eff6ff; color: #1a6fff;
  font-weight: 600;
}
.chip-dot { width: 6px; height: 6px; border-radius: 3px; background: #f59e0b; flex: none; }
.chip-check { font-size: 11px; flex: none; color: #10b981; }
.supp-hint {
  margin: -2px 0 2px;
  font-size: 11px;
  color: #9ca3af;
}
</style>
