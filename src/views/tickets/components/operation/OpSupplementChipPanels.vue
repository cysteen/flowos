<script setup lang="ts">
import OpTextareaAttach from './shared/OpTextareaAttach.vue';
import OpQualityStandardFields from './OpQualityStandardFields.vue';
import OpAppointmentRecords from './OpAppointmentRecords.vue';
import FormSelect from '@/views/tickets/components/create-ticket/FormSelect.vue';
import type { ProcessFormDraft, SupplementChip } from '@/views/tickets/types/operation';
import { RISK_LEVEL_OPTIONS } from '@/views/tickets/types/operation';

const props = defineProps<{
  activeChip: SupplementChip;
  form: ProcessFormDraft;
}>();

const emit = defineEmits<{ 'update:form': [form: ProcessFormDraft] }>();

const riskLevelOptions = RISK_LEVEL_OPTIONS.map((v) => ({ label: v, value: v }));

function update(partial: Partial<ProcessFormDraft>) {
  emit('update:form', { ...props.form, ...partial });
}

function onRiskChange(hasRisk: boolean) {
  update({
    riskHasRisk: hasRisk,
    riskLevel: hasRisk ? props.form.riskLevel : '',
    riskDescription: hasRisk ? props.form.riskDescription : '',
    riskDescriptionAttachments: hasRisk ? props.form.riskDescriptionAttachments : [],
  });
}
</script>

<template>
  <!-- 投诉分类 -->
  <div v-if="activeChip === 'complaint'" class="chip-panel">
    <div class="section-subhead">
      <span class="sub-title">投诉分类 · 确认/修正</span>
      <span class="sub-hint">侧栏为建单摘要，此处可编辑</span>
    </div>
    <div class="cat-grid">
      <div class="field">
        <label class="field-label-sm">分类一</label>
        <div class="select-like">{{ form.complaintCat1 }} <span class="sel-arrow">▾</span></div>
      </div>
      <div class="field">
        <label class="field-label-sm">分类二</label>
        <div class="select-like">{{ form.complaintCat2 }} <span class="sel-arrow">▾</span></div>
      </div>
      <div class="field">
        <label class="field-label-sm">分类三</label>
        <div class="select-like">{{ form.complaintCat3 }} <span class="sel-arrow">▾</span></div>
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
        :value="form.riskHasRisk"
        class="radio-row"
        @update:value="(v: boolean) => onRiskChange(v)"
      >
        <a-radio :value="false">无风险</a-radio>
        <a-radio :value="true">有风险</a-radio>
      </a-radio-group>
      <template v-if="form.riskHasRisk">
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

  <!-- 预约 -->
  <div v-else-if="activeChip === 'appointment'" class="chip-panel panel-neutral">
    <OpAppointmentRecords
      :records="form.appointmentRecords"
      @update:records="(v) => update({ appointmentRecords: v, appointmentNeeded: v.length > 0 })"
    />
  </div>

  <!-- 建单是否规范 -->
  <div v-else class="chip-panel panel-quality">
    <OpQualityStandardFields
      compact
      :is-standard="form.qualityIsStandard"
      :issue-cat1="form.qualityIssueCat1"
      :issue-cat2="form.qualityIssueCat2"
      @update:is-standard="(v) => update({ qualityIsStandard: v })"
      @update:issue-cat1="(v) => update({ qualityIssueCat1: v })"
      @update:issue-cat2="(v) => update({ qualityIssueCat2: v })"
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
.select-like {
  display: flex; align-items: center; gap: 6px;
  padding: 7px 10px; background: #fff; border: 1px solid #d1d5db;
  border-radius: 6px; font-size: 12px; color: #111827; min-height: 32px;
}
.sel-arrow { color: #9ca3af; margin-left: auto; font-size: 10px; }
.cat-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
@media (max-width: 720px) { .cat-grid { grid-template-columns: 1fr; } }

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
</style>
