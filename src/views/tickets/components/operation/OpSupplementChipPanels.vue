<script setup lang="ts">
import { computed, watch } from 'vue';
import OpTextareaAttach from './shared/OpTextareaAttach.vue';
import OpQualityStandardFields from './OpQualityStandardFields.vue';
import FormSelect from '@/views/tickets/components/create-ticket/FormSelect.vue';
import type { ProcessFormDraft, RiskFlag, SupplementChip } from '@/views/tickets/types/operation';
import {
  RISK_FLAG_OPTIONS,
  RISK_LEVEL_OPTIONS,
  QUALITY_ISSUE_L2_MAP,
  QUALITY_ISSUE_L2_TO_L1,
  complaintMarkOptions,
  COMPLAINT_MARK_REGULATOR_OPTIONS,
} from '@/views/tickets/types/operation';
import {
  COMPLAINT_L1_OPTIONS,
  COMPLAINT_L2_MAP,
  COMPLAINT_L3_MAP,
} from '@/views/tickets/types/createTicket';

const props = defineProps<{
  activeChip: SupplementChip;
  form: ProcessFormDraft;
  /** 建单投诉平台，用于控制「有责/无责」类标记显隐 */
  complaintPlatform?: string;
}>();

const emit = defineEmits<{ 'update:form': [form: ProcessFormDraft] }>();

const riskLevelOptions = RISK_LEVEL_OPTIONS.map((v) => ({ label: v, value: v }));
const complaintMarkOpts = computed(() =>
  complaintMarkOptions(props.complaintPlatform).map((v) => ({ label: v, value: v })),
);
const complaintL1Options = COMPLAINT_L1_OPTIONS.map((v) => ({ label: v, value: v }));
const complaintL2Options = computed(() =>
  (COMPLAINT_L2_MAP[props.form.complaintCat1] ?? []).map((v) => ({ label: v, value: v })),
);
const complaintL3Options = computed(() =>
  (COMPLAINT_L3_MAP[props.form.complaintCat2] ?? []).map((v) => ({ label: v, value: v })),
);

function update(partial: Partial<ProcessFormDraft>) {
  emit('update:form', { ...props.form, ...partial });
}

function onComplaintMarkChange(v: string | number | undefined) {
  update({ complaintMark: String(v ?? '') });
}

watch(
  () => props.complaintPlatform,
  () => {
    const mark = props.form.complaintMark;
    if (!mark) return;
    const allowed = complaintMarkOptions(props.complaintPlatform);
    if (!allowed.includes(mark) && (COMPLAINT_MARK_REGULATOR_OPTIONS as readonly string[]).includes(mark)) {
      update({ complaintMark: '' });
    }
  },
);

function onRiskFlagChange(flag: RiskFlag) {
  const hasRisk = flag === '有风险';
  update({
    riskFlag: flag,
    riskHasRisk: hasRisk,
    riskLevel: hasRisk ? props.form.riskLevel : '',
    riskDescription: hasRisk ? props.form.riskDescription : '',
    riskDescriptionAttachments: hasRisk ? props.form.riskDescriptionAttachments : [],
  });
}

function onComplaintCat1Change(v: string | number | undefined) {
  update({ complaintCat1: String(v ?? ''), complaintCat2: '', complaintCat3: '' });
}

function onQualityCat1Change(v: string | number | undefined) {
  const cat1 = String(v ?? '');
  const allowed = cat1 ? (QUALITY_ISSUE_L2_MAP[cat1] ?? []) : null;
  const cat2 = props.form.qualityIssueCat2;
  const keepCat2 = allowed ? allowed.includes(cat2) : !!cat2;
  update({
    qualityIssueCat1: cat1,
    qualityIssueCat2: keepCat2 ? cat2 : '',
  });
}

function onQualityCat2Change(v: string | number | undefined) {
  const cat2 = String(v ?? '');
  if (!cat2) {
    update({ qualityIssueCat2: '' });
    return;
  }
  const cat1 = props.form.qualityIssueCat1 || QUALITY_ISSUE_L2_TO_L1[cat2] || '';
  update({ qualityIssueCat1: cat1, qualityIssueCat2: cat2 });
}

function onComplaintCat2Change(v: string | number | undefined) {
  update({ complaintCat2: String(v ?? ''), complaintCat3: '' });
}
</script>

<template>
  <!-- 投诉分类 -->
  <div v-if="activeChip === 'complaint'" class="chip-panel">
    <div class="section-subhead">
      <span class="sub-title">投诉分类 · 确认/修正</span>
      <span class="sub-hint">侧栏为建单摘要，此处可编辑</span>
    </div>
    <div class="cat-grid cat-grid-4">
      <div class="field">
        <label class="field-label-sm">投诉标记</label>
        <FormSelect
          class="cat-select"
          :value="form.complaintMark || undefined"
          :options="complaintMarkOpts"
          placeholder="请选择"
          @update:value="onComplaintMarkChange"
        />
      </div>
      <div class="field">
        <label class="field-label-sm">分类一</label>
        <FormSelect
          class="cat-select"
          :value="form.complaintCat1 || undefined"
          :options="complaintL1Options"
          placeholder="请选择"
          @update:value="onComplaintCat1Change"
        />
      </div>
      <div class="field">
        <label class="field-label-sm">分类二</label>
        <FormSelect
          class="cat-select"
          :value="form.complaintCat2 || undefined"
          :options="complaintL2Options"
          :disabled="!form.complaintCat1"
          placeholder="请选择"
          @update:value="onComplaintCat2Change"
        />
      </div>
      <div class="field">
        <label class="field-label-sm">分类三</label>
        <FormSelect
          class="cat-select"
          :value="form.complaintCat3 || undefined"
          :options="complaintL3Options"
          :disabled="!form.complaintCat2"
          placeholder="请选择"
          @update:value="(v) => update({ complaintCat3: String(v ?? '') })"
        />
      </div>
    </div>
    <div class="field">
      <label>投诉备注</label>
      <OpTextareaAttach
        :model-value="form.complaintNote"
        :attachments="form.complaintNoteAttachments"
        :min-input-height="40"
        @update:model-value="(v) => update({ complaintNote: v })"
        @update:attachments="(v) => update({ complaintNoteAttachments: v })"
      />
    </div>
  </div>

  <!-- 风险 -->
  <div v-else-if="activeChip === 'risk'" class="chip-panel panel-neutral">
    <div class="field inline-row risk-row">
      <label>是否有风险</label>
      <a-radio-group
        :value="form.riskFlag || '无风险'"
        class="radio-row"
        @update:value="(v: RiskFlag) => onRiskFlagChange(v)"
      >
        <a-radio v-for="opt in RISK_FLAG_OPTIONS" :key="opt" :value="opt">{{ opt }}</a-radio>
      </a-radio-group>
      <template v-if="form.riskFlag === '有风险'">
        <label class="field-label-sm risk-level-label">风险等级</label>
        <FormSelect
          class="risk-level-select"
          :value="form.riskLevel || undefined"
          :options="riskLevelOptions"
          placeholder="请选择"
          @update:value="(v) => update({ riskLevel: String(v ?? '') })"
        />
      </template>
    </div>
  </div>

  <!-- 建单是否规范 -->
  <div v-else class="chip-panel panel-quality">
    <OpQualityStandardFields
      compact
      :is-standard="form.qualityIsStandard"
      :issue-cat1="form.qualityIssueCat1"
      :issue-cat2="form.qualityIssueCat2"
      @update:is-standard="(v) => update({
        qualityIsStandard: v,
        ...(v ? { qualityIssueCat1: '', qualityIssueCat2: '' } : {}),
      })"
      @update:issue-cat1="onQualityCat1Change"
      @update:issue-cat2="onQualityCat2Change"
    />
  </div>
</template>

<style scoped>
.chip-panel { display: flex; flex-direction: column; gap: 12px; }
.section-subhead {
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
}
.sub-title { font-size: 12px; font-weight: 600; color: #111827; }
.sub-hint { font-size: 11px; color: #9ca3af; }
.field { display: flex; flex-direction: column; gap: 6px; }
.field label { font-size: 12px; font-weight: 600; color: #374151; }
.field-label-sm { font-size: 11px; font-weight: 500; color: #6b7280; }
.field-row { display: flex; gap: 8px; }
.field-row .field { flex: 1 1 0; min-width: 0; }
.inline-row { flex-direction: row; align-items: center; gap: 12px; }
.inline-row .field-label-sm { flex: none; white-space: nowrap; }
.flex1 { flex: 1; min-width: 0; }
.cat-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
.cat-grid-4 { grid-template-columns: repeat(4, 1fr); }
.cat-select { width: 100%; }
.cat-select :deep(.ant-select-selector) {
  height: 32px;
  min-height: 32px;
  font-size: 12px;
}
.cat-select :deep(.ant-select-selection-item),
.cat-select :deep(.ant-select-selection-placeholder) {
  font-size: 12px;
  line-height: 30px;
}
@media (max-width: 720px) {
  .cat-grid,
  .cat-grid-4 { grid-template-columns: 1fr; }
}

.panel-neutral,
.panel-quality {
  background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; padding: 12px;
}
.panel-head { display: flex; flex-direction: column; gap: 2px; }
.radio-row { display: flex; gap: 14px; font-size: 12px; }
.inline-row label {
  font-size: 12px;
  font-weight: 600;
  color: #374151;
  flex: none;
  white-space: nowrap;
}
.chip-panel :deep(.ant-radio-wrapper) {
  white-space: nowrap;
}
.risk-row {
  flex-wrap: wrap;
  align-items: center;
}
.risk-level-label {
  margin-left: 4px;
}
.risk-level-select {
  width: 140px;
  flex: none;
}
.risk-level-select :deep(.ant-select-selector) {
  height: 28px;
  min-height: 28px;
  font-size: 12px;
}
.risk-level-select :deep(.ant-select-selection-item),
.risk-level-select :deep(.ant-select-selection-placeholder) {
  font-size: 12px;
  line-height: 26px;
}
</style>
