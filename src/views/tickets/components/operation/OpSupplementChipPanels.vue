<script setup lang="ts">
import type { ProcessFormDraft, SupplementChip } from '@/views/tickets/types/operation';

const props = defineProps<{
  activeChip: SupplementChip;
  form: ProcessFormDraft;
}>();

const emit = defineEmits<{ 'update:form': [form: ProcessFormDraft] }>();

function update(partial: Partial<ProcessFormDraft>) {
  emit('update:form', { ...props.form, ...partial });
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
      <a-textarea
        :value="form.complaintNote"
        class="note-textarea"
        @update:value="(v: string) => update({ complaintNote: v })"
      />
    </div>
  </div>

  <!-- 风险 -->
  <div v-else-if="activeChip === 'risk'" class="chip-panel panel-risk">
    <div class="panel-head">
      <div class="panel-title risk">风险标记</div>
      <div class="panel-desc risk">标记后同步洞察条，班组长可见</div>
    </div>
    <a-radio-group
      :value="form.riskHasRisk"
      class="radio-row"
      @update:value="(v: boolean) => update({ riskHasRisk: v })"
    >
      <a-radio :value="false">无风险</a-radio>
      <a-radio :value="true">有风险</a-radio>
    </a-radio-group>
    <template v-if="form.riskHasRisk">
      <div class="field inline-row">
        <label class="field-label-sm">风险等级</label>
        <div class="select-like flex1">{{ form.riskLevel }} <span class="sel-arrow">▾</span></div>
      </div>
      <div class="field">
        <label>风险描述</label>
        <a-textarea
          :value="form.riskDescription"
          class="short-textarea"
          placeholder="请描述风险情况…"
          @update:value="(v: string) => update({ riskDescription: v })"
        />
      </div>
    </template>
  </div>

  <!-- 预约 -->
  <div v-else-if="activeChip === 'appointment'" class="chip-panel panel-appointment">
    <div class="panel-head">
      <div class="panel-title appt">预约回访</div>
      <div class="panel-desc appt">与客户确认可联系时段</div>
    </div>
    <div class="field inline-row">
      <label class="field-label-sm">预约需求</label>
      <a-radio-group
        :value="form.appointmentNeeded"
        class="radio-row"
        @update:value="(v: boolean) => update({ appointmentNeeded: v })"
      >
        <a-radio :value="false">不需要</a-radio>
        <a-radio :value="true">需要</a-radio>
      </a-radio-group>
    </div>
    <div v-if="form.appointmentNeeded" class="field-row">
      <div class="field">
        <label class="field-label-sm">开始时间</label>
        <div class="select-like">{{ form.appointmentStart }}</div>
      </div>
      <div class="field">
        <label class="field-label-sm">结束时间</label>
        <div class="select-like">{{ form.appointmentEnd }}</div>
      </div>
    </div>
  </div>

  <!-- 质量反馈 -->
  <div v-else class="chip-panel panel-quality">
    <div class="panel-head">
      <div class="panel-title">一线质量反馈 · 非必填</div>
      <div class="panel-desc muted">回流质检，不影响工单流转</div>
    </div>
    <div class="quality-toggle">
      <button
        type="button"
        class="qt-chip"
        :class="{ active: form.qualityIsStandard }"
        @click="update({ qualityIsStandard: true })"
      >
        建单规范
      </button>
      <button
        type="button"
        class="qt-chip warn"
        :class="{ active: !form.qualityIsStandard }"
        @click="update({ qualityIsStandard: false })"
      >
        反馈不规范
      </button>
    </div>
    <div v-if="!form.qualityIsStandard" class="quality-detail">
      <div class="quality-detail-hint">反馈不规范时展开</div>
      <div class="field">
        <label class="field-label-sm">不规范分类（二级）</label>
        <div class="select-like">{{ form.qualityIssueCat }} <span class="sel-arrow">▾</span></div>
      </div>
      <div class="field">
        <label>不规范原因</label>
        <a-textarea
          :value="form.qualityIssueReason"
          class="short-textarea"
          placeholder="请说明不规范原因…"
          @update:value="(v: string) => update({ qualityIssueReason: v })"
        />
      </div>
    </div>
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
.note-textarea :deep(textarea) {
  min-height: 56px; padding: 8px; border-radius: 6px; font-size: 12px; resize: vertical;
}
.short-textarea :deep(textarea) {
  min-height: 48px; padding: 8px; border-radius: 5px; font-size: 12px; resize: vertical;
}
.cat-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
@media (max-width: 720px) { .cat-grid { grid-template-columns: 1fr; } }

.panel-risk {
  background: #fff7ed; border: 1px solid #fed7aa; border-radius: 6px; padding: 12px;
}
.panel-appointment {
  background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 6px; padding: 12px;
}
.panel-quality {
  background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; padding: 12px;
}
.panel-head { display: flex; flex-direction: column; gap: 2px; }
.panel-title { font-size: 11px; font-weight: 600; color: #374151; }
.panel-title.risk { color: #9a3412; }
.panel-title.appt { color: #1d4ed8; }
.panel-desc { font-size: 10px; }
.panel-desc.risk { color: #c2410c; }
.panel-desc.appt { color: #3b82f6; }
.panel-desc.muted { color: #6b7280; }
.radio-row { display: flex; gap: 14px; font-size: 12px; }

.quality-toggle { display: flex; gap: 8px; flex-wrap: wrap; }
.qt-chip {
  font-size: 11px; font-weight: 600; padding: 6px 10px; border-radius: 5px; cursor: pointer;
  border: 1px solid #a7f3d0; background: #ecfdf5; color: #059669;
}
.qt-chip.warn { border-color: #fde68a; background: #fffbeb; color: #b45309; }
.qt-chip.active { box-shadow: inset 0 0 0 1px currentColor; }
.quality-detail {
  display: flex; flex-direction: column; gap: 8px;
  background: #fffbeb; border: 1px solid #fde68a; border-radius: 5px; padding: 10px;
}
.quality-detail-hint { font-size: 10px; font-weight: 500; color: #b45309; }
</style>
