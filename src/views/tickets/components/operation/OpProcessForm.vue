<script setup lang="ts">
import {
  FileTextOutlined, CheckCircleOutlined, AppstoreOutlined, SoundOutlined,
  CheckOutlined, InfoCircleOutlined, LockOutlined, SearchOutlined,
} from '@ant-design/icons-vue';
import OpCollapsibleSection from './OpCollapsibleSection.vue';
import OpRecordFields from './OpRecordFields.vue';
import OpSupplementChipPanels from './OpSupplementChipPanels.vue';
import type { ProcessFormDraft, SupplementChip } from '@/views/tickets/types/operation';

const props = defineProps<{
  form: ProcessFormDraft;
  expandedSections: { record: boolean; service: boolean; supplement: boolean; external: boolean };
  activeChip: SupplementChip;
  filledSupplementCount: number;
  showExternal: boolean;
}>();

const emit = defineEmits<{
  toggleSection: [key: 'record' | 'service' | 'supplement' | 'external'];
  selectChip: [chip: SupplementChip];
  'update:form': [form: ProcessFormDraft];
}>();

const CHIPS: { key: SupplementChip; label: string }[] = [
  { key: 'complaint', label: '投诉分类' },
  { key: 'risk', label: '风险' },
  { key: 'appointment', label: '预约' },
  { key: 'quality', label: '质量反馈' },
];

function isChipFilled(key: SupplementChip): boolean {
  const f = props.form;
  switch (key) {
    case 'complaint': return !!(f.complaintCat1 && f.complaintNote);
    case 'risk': return f.riskHasRisk && !!f.riskDescription.trim();
    case 'appointment': return f.appointmentNeeded && !!f.appointmentStart;
    case 'quality': return !f.qualityIsStandard;
    default: return false;
  }
}

function chipActiveClass(key: SupplementChip): string {
  if (props.activeChip !== key) return '';
  const map: Record<SupplementChip, string> = {
    complaint: 'active',
    risk: 'active-risk',
    appointment: 'active-appointment',
    quality: 'active-quality',
  };
  return map[key];
}
</script>

<template>
  <div class="process-form">
    <!-- 处理记录 -->
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
        sub-hint="结案前必填"
        @update:problem-cause="(v) => emit('update:form', { ...form, problemCause: v })"
        @update:process-result="(v) => emit('update:form', { ...form, processResult: v })"
      />
    </OpCollapsibleSection>

    <!-- 服务与结论 -->
    <OpCollapsibleSection
      title="服务与结论"
      :icon="CheckCircleOutlined"
      badge="服务方式支持关键词搜索"
      badge-variant="hint"
      :expanded="expandedSections.service"
      @toggle="emit('toggleSection', 'service')"
    >
      <div class="section-subhead">
        <span class="sub-title">服务方式与解决结论</span>
        <span class="sub-hint">结案前确认</span>
      </div>
      <div class="field-row">
        <div class="field inline">
          <label>服务方式</label>
          <div class="select-like">
            <SearchOutlined class="sel-icon" />
            <span>{{ form.serviceMethod }}</span>
            <span class="sel-arrow">▾</span>
          </div>
        </div>
        <div class="field inline">
          <label>服务类型</label>
          <div class="select-like locked">
            <span class="locked-text">{{ form.serviceType }}</span>
            <LockOutlined class="sel-icon" />
          </div>
        </div>
      </div>
      <div class="field inline conclusion-row">
        <label>问题解决结论</label>
        <a-radio-group
          :value="form.conclusion"
          @update:value="(v: ProcessFormDraft['conclusion']) => emit('update:form', { ...form, conclusion: v })"
        >
          <a-radio value="resolved">已解决</a-radio>
          <a-radio value="concession">退让</a-radio>
          <a-radio value="unresolved">未解决</a-radio>
        </a-radio-group>
      </div>
      <div class="concession-hint">
        <InfoCircleOutlined />
        解决结论选「退让」时，下方展开退让结案面板（类型/方案/客户确认）
      </div>
    </OpCollapsibleSection>

    <!-- 补充处理项 -->
    <OpCollapsibleSection
      title="补充处理项"
      :icon="AppstoreOutlined"
      :badge="`已填 ${filledSupplementCount} 项`"
      badge-variant="count"
      split-head
      :expanded="expandedSections.supplement"
      @toggle="emit('toggleSection', 'supplement')"
    >
      <template #head-extra>
        <div class="chip-row">
          <button
            v-for="c in CHIPS"
            :key="c.key"
            class="chip"
            :class="[chipActiveClass(c.key), { filled: isChipFilled(c.key) }]"
            @click.stop="emit('selectChip', c.key)"
          >
            <span v-if="c.key === 'complaint' && activeChip === 'complaint'" class="chip-dot" />
            {{ c.label }}
            <CheckOutlined v-if="isChipFilled(c.key)" class="chip-check" />
          </button>
        </div>
      </template>

      <OpSupplementChipPanels
        :active-chip="activeChip"
        :form="form"
        @update:form="emit('update:form', $event)"
      />
    </OpCollapsibleSection>

    <!-- 外投处理（条件显隐） -->
    <OpCollapsibleSection
      v-if="showExternal"
      title="外投处理"
      :icon="SoundOutlined"
      badge="来源=外投时显示"
      badge-variant="warn"
      :expanded="expandedSections.external"
      @toggle="emit('toggleSection', 'external')"
    >
      <div class="section-subhead">
        <span class="sub-title">平台回复与和解</span>
        <span class="sub-hint">来源=外投时显示</span>
      </div>
      <div class="field-row">
        <div class="field inline">
          <label>平台回复结果</label>
          <div class="select-like">已回复客户 <span class="sel-arrow">▾</span></div>
        </div>
        <div class="field inline">
          <label>平台和解</label>
          <a-radio-group value="yes">
            <a-radio value="yes">是</a-radio>
            <a-radio value="no">否</a-radio>
          </a-radio-group>
        </div>
      </div>
    </OpCollapsibleSection>
  </div>
</template>

<style scoped>
.process-form { display: flex; flex-direction: column; gap: 16px; }
.section-subhead {
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
}
.sub-title { font-size: 12px; font-weight: 600; color: #111827; }
.sub-hint { font-size: 11px; color: #9ca3af; }
.field { display: flex; flex-direction: column; gap: 6px; }
.field.inline { flex: 1; min-width: 0; }
.field label { font-size: 12px; font-weight: 600; color: #374151; }
.field-row { display: flex; gap: 8px; }
.field-row .field.inline { flex: 1 1 0; min-width: 0; }
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
.concession-hint {
  display: flex; align-items: flex-start; gap: 6px;
  font-size: 11px; color: #9ca3af; line-height: 1.5;
}
.chip-row { display: flex; gap: 8px; flex-wrap: nowrap; }
.chip {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 6px 12px; border-radius: 6px; font-size: 12px; font-weight: 500;
  border: 1px solid #e5e7eb; background: #f9fafb; color: #6b7280; cursor: pointer;
  white-space: nowrap; flex: none;
}
.chip.active {
  border-color: #1a6fff; background: #eff6ff; color: #1a6fff;
  font-weight: 600; border-width: 1.5px;
}
.chip.active-risk {
  border-color: #ef4444; background: #fef2f2; color: #dc2626;
  font-weight: 600; border-width: 1.5px;
}
.chip.active-appointment {
  border-color: #1a6fff; background: #eff6ff; color: #1a6fff;
  font-weight: 600; border-width: 1.5px;
}
.chip.active-quality {
  border-color: #f59e0b; background: #fffbeb; color: #b45309;
  font-weight: 600; border-width: 1.5px;
}
.chip-dot { width: 6px; height: 6px; border-radius: 3px; background: #f59e0b; flex: none; }
.chip-check { font-size: 11px; flex: none; }
</style>
