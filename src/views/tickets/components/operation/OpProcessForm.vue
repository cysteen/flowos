<script setup lang="ts">
import { computed } from 'vue';
import {
  FileTextOutlined, CheckCircleOutlined, AppstoreOutlined, SoundOutlined,
  CheckOutlined, CalendarOutlined,
  AuditOutlined, BulbOutlined, RiseOutlined,
} from '@ant-design/icons-vue';
import OpCollapsibleSection from './OpCollapsibleSection.vue';
import OpRecordFields from './OpRecordFields.vue';
import OpSupplementChipPanels from './OpSupplementChipPanels.vue';
import OpAppointmentRecords from './OpAppointmentRecords.vue';
import OpQualityStandardFields from './OpQualityStandardFields.vue';
import FormSelect from '@/views/tickets/components/create-ticket/FormSelect.vue';
import { SUGGEST_L1_OPTIONS, SUGGEST_L2_MAP } from '@/views/tickets/types/createTicket';
import type {
  ProcessFormDraft, SupplementChip, SectionKey,
} from '@/views/tickets/types/operation';
import {
  SERVICE_METHOD_OPTIONS,
  SERVICE_TYPE_BY_METHOD,
  SERVICE_TYPE_OPTIONS,
} from '@/views/tickets/types/operation';

const props = defineProps<{
  form: ProcessFormDraft;
  /** 工单类型：投诉=完整表单；咨询/建议/商机=精简复用 */
  ticketType: string;
  expandedSections: Record<SectionKey, boolean>;
  activeChip: SupplementChip;
  filledSupplementCount: number;
  showExternal: boolean;
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

function patch(part: Partial<ProcessFormDraft>) {
  emit('update:form', { ...props.form, ...part });
}

function onConclusionChange(v: ProcessFormDraft['conclusion']) {
  patch({
    conclusion: v,
    ...(v !== 'concession' ? { concessionPlan: '' } : {}),
  });
}

function onServiceMethodChange(method: string) {
  patch({
    serviceMethod: method,
    serviceType: SERVICE_TYPE_BY_METHOD[method] ?? props.form.serviceType,
  });
}

const CONCLUSION_OPTIONS: { label: string; value: ProcessFormDraft['conclusion'] }[] = [
  { label: '已解决', value: 'resolved' },
  { label: '退让', value: 'concession' },
  { label: '未解决', value: 'unresolved' },
];
const serviceMethodOptions = SERVICE_METHOD_OPTIONS.map((v) => ({ label: v, value: v }));
const serviceTypeOptions = SERVICE_TYPE_OPTIONS.map((v) => ({ label: v, value: v }));
const suggestL1Options = SUGGEST_L1_OPTIONS.map((v) => ({ label: v, value: v }));
const suggestL2Options = computed(() =>
  (SUGGEST_L2_MAP[props.form.suggestCat1] ?? []).map((v) => ({ label: v, value: v })),
);

const CHIPS: { key: SupplementChip; label: string }[] = [
  { key: 'complaint', label: '投诉分类' },
  { key: 'risk', label: '风险' },
  { key: 'appointment', label: '预约' },
  { key: 'quality', label: '建单规范' },
];

function isChipFilled(key: SupplementChip): boolean {
  const f = props.form;
  switch (key) {
    case 'complaint': return !!(f.complaintCat1 && f.complaintNote);
    case 'risk': return f.riskHasRisk && !!f.riskLevel;
    case 'appointment': return f.appointmentNeeded && f.appointmentRecords.some((r) => r.scheduledAt);
    case 'quality': return !f.qualityIsStandard && !!f.qualityIssueCat1 && !!f.qualityIssueCat2;
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
      badge="服务方式支持关键词搜索"
      badge-variant="hint"
      :expanded="expandedSections.service"
      @toggle="emit('toggleSection', 'service')"
    >
      <div class="section-subhead">
        <span class="sub-title">服务方式与解决结论</span>
        <span class="sub-hint">结案前确认</span>
      </div>
      <div class="field-row field-row--service">
        <div class="field inline">
          <label>服务方式</label>
          <FormSelect
            :value="form.serviceMethod"
            :options="serviceMethodOptions"
            placeholder="请选择或搜索"
            style="width: 100%"
            @update:value="(v) => onServiceMethodChange(String(v ?? ''))"
          />
        </div>
        <div class="field inline">
          <label>服务类型</label>
          <FormSelect
            :value="form.serviceType"
            :options="serviceTypeOptions"
            placeholder="请选择或搜索"
            style="width: 100%"
            @update:value="(v) => patch({ serviceType: String(v ?? '') })"
          />
        </div>
        <div class="field inline">
          <label>问题解决结论</label>
          <a-select
            :value="form.conclusion"
            :options="CONCLUSION_OPTIONS"
            placeholder="请选择"
            style="width: 100%"
            @update:value="onConclusionChange"
          />
        </div>
      </div>
      <div v-if="form.conclusion === 'concession'" class="field concession-field">
        <label>退让方案</label>
        <a-textarea
          :value="form.concessionPlan"
          :rows="3"
          placeholder="请补充退让方案…"
          @update:value="(v: string) => patch({ concessionPlan: v })"
        />
      </div>
    </OpCollapsibleSection>

    <!-- ===== 投诉：补充处理项 + 外投 ===== -->
    <template v-if="isComplaint">
      <OpCollapsibleSection
        title="补充处理"
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
    </template>

    <!-- ===== 咨询/建议/商机：复用咨询精简逻辑 ===== -->
    <template v-else>
      <!-- 建单是否规范（公共质检，咨询/建议/商机共用） -->
      <OpCollapsibleSection
        title="建单是否规范"
        :icon="AuditOutlined"
        badge="选填"
        badge-variant="hint"
        :expanded="expandedSections.quality"
        @toggle="emit('toggleSection', 'quality')"
      >
        <OpQualityStandardFields
          :is-standard="form.qualityIsStandard"
          :issue-cat1="form.qualityIssueCat1"
          :issue-cat2="form.qualityIssueCat2"
          @update:is-standard="(v) => patch({ qualityIsStandard: v })"
          @update:issue-cat1="(v) => patch({ qualityIssueCat1: v })"
          @update:issue-cat2="(v) => patch({ qualityIssueCat2: v })"
        />
      </OpCollapsibleSection>

      <!-- 建议专属：建议分类 -->
      <OpCollapsibleSection
        v-if="isSuggest"
        title="建议分类"
        :icon="BulbOutlined"
        badge="建议专属"
        badge-variant="hint"
        :expanded="expandedSections.suggest"
        @toggle="emit('toggleSection', 'suggest')"
      >
        <div class="section-subhead">
          <span class="sub-title">建议分类与采纳结论</span>
          <span class="sub-hint">结案前确认</span>
        </div>
        <div class="field-row">
          <div class="field inline">
            <label>建议分类（一级）</label>
            <a-select
              :value="form.suggestCat1"
              :options="suggestL1Options"
              style="width: 100%"
              @update:value="(v: string) => patch({ suggestCat1: v, suggestCat2: '' })"
            />
          </div>
          <div class="field inline">
            <label>建议分类（二级）</label>
            <a-select
              :value="form.suggestCat2 || undefined"
              :options="suggestL2Options"
              placeholder="请选择"
              style="width: 100%"
              @update:value="(v: string) => patch({ suggestCat2: v })"
            />
          </div>
        </div>
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

      <!-- 商机专属：商机跟进 -->
      <OpCollapsibleSection
        v-if="isLead"
        title="商机跟进"
        :icon="RiseOutlined"
        badge="商机专属"
        badge-variant="hint"
        :expanded="expandedSections.lead"
        @toggle="emit('toggleSection', 'lead')"
      >
        <div class="section-subhead">
          <span class="sub-title">商机意向与解决结论</span>
          <span class="sub-hint">结案前确认</span>
        </div>
        <div class="field inline conclusion-row">
          <label>商机意向</label>
          <a-radio-group
            :value="form.leadIntent"
            @update:value="(v: ProcessFormDraft['leadIntent']) => patch({ leadIntent: v })"
          >
            <a-radio value="high">高</a-radio>
            <a-radio value="mid">中</a-radio>
            <a-radio value="low">低</a-radio>
          </a-radio-group>
        </div>
        <div class="field-row">
          <div class="field inline">
            <label>预计金额（元）</label>
            <a-input
              :value="form.leadAmount"
              placeholder="如 5000"
              @update:value="(v: string) => patch({ leadAmount: v })"
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
        <div class="field inline conclusion-row">
          <label>商机解决结论</label>
          <a-radio-group
            :value="form.leadStage"
            @update:value="(v: ProcessFormDraft['leadStage']) => patch({ leadStage: v })"
          >
            <a-radio value="converted">已转化</a-radio>
            <a-radio value="following">跟进中</a-radio>
            <a-radio value="lost">已流失</a-radio>
          </a-radio-group>
        </div>
      </OpCollapsibleSection>

      <!-- 服务预约（咨询/建议/商机；投诉在「补充处理」chip 中，四类型均支持） -->
      <OpCollapsibleSection
        title="服务预约"
        :icon="CalendarOutlined"
        badge="上门 / 回访"
        badge-variant="hint"
        :expanded="expandedSections.appointment"
        @toggle="emit('toggleSection', 'appointment')"
      >
        <OpAppointmentRecords
          :records="form.appointmentRecords"
          @update:records="(v) => patch({ appointmentRecords: v, appointmentNeeded: v.length > 0 })"
        />
      </OpCollapsibleSection>
    </template>
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
.field-row { display: flex; gap: 8px; }
.field-row .field.inline { flex: 1 1 0; min-width: 0; }
.field-row--service { align-items: flex-start; }
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
.concession-field {
  margin-top: 2px;
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
