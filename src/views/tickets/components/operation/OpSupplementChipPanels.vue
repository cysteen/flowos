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
} from '@/views/tickets/types/createTicket';

const props = defineProps<{
  activeChip: SupplementChip;
  form: ProcessFormDraft;
  /** 建单投诉平台，用于控制「有责/无责」类标记显隐 */
  complaintPlatform?: string;
  /** 建单投诉平台列表（投诉渠道跟进按平台分行，内投/外投均含） */
  complaintPlatforms?: { platform: string; customPlatform?: string; complaintNo: string }[];
  /** 是否展示投诉渠道 chip 面板 */
  showExternal?: boolean;
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
function platformKey(p: { platform: string; complaintNo?: string }) {
  return `${p.platform}::${p.complaintNo ?? ''}`;
}

/** 投诉渠道跟进行：与建单 platforms 对齐，保留已填内容 */
const followupRows = computed(() => {
  const plats = (props.complaintPlatforms ?? []).filter((p) => p.platform);
  const prev = new Map(
    (props.form.platformFollowups ?? []).map((f) => [platformKey(f), f]),
  );
  if (!plats.length) return props.form.platformFollowups ?? [];
  return plats.map((p) => {
    const old = prev.get(platformKey(p));
    return {
      platform: p.platform,
      complaintNo: p.complaintNo,
      replyResult: old?.replyResult ?? '',
      reconcile: old?.reconcile ?? ('' as const),
    };
  });
});

watch(
  () => (props.complaintPlatforms ?? []).map((p) => platformKey(p)).join('|'),
  () => {
    const next = followupRows.value;
    const cur = props.form.platformFollowups ?? [];
    const same =
      next.length === cur.length
      && next.every((r, i) =>
        r.platform === cur[i]?.platform
        && (r.complaintNo ?? '') === (cur[i]?.complaintNo ?? ''),
      );
    if (!same) update({ platformFollowups: next });
  },
  { immediate: true },
);

function update(partial: Partial<ProcessFormDraft>) {
  emit('update:form', { ...props.form, ...partial });
}

function patchFollowup(
  index: number,
  partial: Partial<ProcessFormDraft['platformFollowups'][number]>,
) {
  const rows = followupRows.value.map((r, i) => (i === index ? { ...r, ...partial } : r));
  update({ platformFollowups: rows });
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
  const needsDesc = flag === '有风险' || flag === '疑似风险';
  const hasRisk = flag === '有风险';
  update({
    riskFlag: flag,
    riskHasRisk: hasRisk,
    riskLevel: hasRisk ? props.form.riskLevel : '',
    riskDescription: needsDesc ? props.form.riskDescription : '',
    riskDescriptionAttachments: needsDesc ? props.form.riskDescriptionAttachments : [],
  });
}

function onComplaintCat1Change(v: string | number | undefined) {
  update({ complaintCat1: String(v ?? ''), complaintCat2: '' });
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
  update({ complaintCat2: String(v ?? '') });
}

const missComplaintMark = computed(() => !props.form.complaintMark);
const missComplaintCat1 = computed(() => !props.form.complaintCat1);
const missComplaintNote = computed(() => !props.form.complaintNote.trim());
const missRiskLevel = computed(
  () => props.form.riskFlag === '有风险' && !props.form.riskLevel,
);
const missRiskDesc = computed(
  () =>
    (props.form.riskFlag === '疑似风险' || props.form.riskFlag === '有风险')
    && !props.form.riskDescription.trim(),
);
</script>

<template>
  <!-- 投诉分类 -->
  <div v-if="activeChip === 'complaint'" class="chip-panel">
    <div class="cat-grid">
      <div class="field" :class="{ 'is-missing': missComplaintMark }">
        <label class="field-label-sm"><span class="req">*</span>投诉标记</label>
        <FormSelect
          class="cat-select"
          :class="{ 'ctrl-missing': missComplaintMark }"
          :value="form.complaintMark || undefined"
          :options="complaintMarkOpts"
          placeholder="请选择（必填）"
          @update:value="onComplaintMarkChange"
        />
        <p v-if="missComplaintMark" class="field-err">请选择投诉标记</p>
      </div>
      <div class="field" :class="{ 'is-missing': missComplaintCat1 }">
        <label class="field-label-sm"><span class="req">*</span>分类一</label>
        <FormSelect
          class="cat-select"
          :class="{ 'ctrl-missing': missComplaintCat1 }"
          :value="form.complaintCat1 || undefined"
          :options="complaintL1Options"
          placeholder="请选择（必填）"
          @update:value="onComplaintCat1Change"
        />
        <p v-if="missComplaintCat1" class="field-err">请选择分类一</p>
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
    </div>
    <div class="field" :class="{ 'is-missing': missComplaintNote }">
      <label><span class="req">*</span>投诉备注</label>
      <OpTextareaAttach
        class="attach-ctrl"
        :class="{ 'ctrl-missing': missComplaintNote }"
        :model-value="form.complaintNote"
        :attachments="form.complaintNoteAttachments"
        :min-input-height="40"
        @update:model-value="(v) => update({ complaintNote: v })"
        @update:attachments="(v) => update({ complaintNoteAttachments: v })"
      />
      <p v-if="missComplaintNote" class="field-err">请填写投诉备注</p>
    </div>
  </div>

  <!-- 投诉渠道：按平台分行登记回复结果与是否和解（内投/外投平台均在此） -->
  <div v-else-if="activeChip === 'external' && showExternal" class="chip-panel ext-panel">
    <div v-if="!followupRows.length" class="ext-empty">暂无投诉渠道，请先在工单信息中登记投诉平台</div>
    <div v-else class="ext-table">
      <div class="ext-thead">
        <span class="ext-th ext-col-platform">投诉平台</span>
        <span class="ext-th ext-col-no">投诉编号</span>
        <span class="ext-th ext-col-reply"><span class="req">*</span>回复结果</span>
        <span class="ext-th ext-col-reconcile"><span class="req">*</span>是否和解</span>
      </div>
      <div
        v-for="(row, i) in followupRows"
        :key="`${row.platform}-${row.complaintNo ?? ''}-${i}`"
        class="ext-row"
      >
        <div class="ext-td ext-col-platform">
          <span class="ext-platform" :title="row.platform">{{ row.platform }}</span>
        </div>
        <div class="ext-td ext-col-no">
          <span v-if="row.complaintNo" class="ext-no">{{ row.complaintNo }}</span>
          <span v-else class="ext-no-empty">—</span>
        </div>
        <div class="ext-td ext-col-reply">
          <a-input
            :value="row.replyResult"
            placeholder="填写回复结果"
            @update:value="(v: string) => patchFollowup(i, { replyResult: v ?? '' })"
          />
        </div>
        <div class="ext-td ext-col-reconcile">
          <a-radio-group
            :value="row.reconcile || undefined"
            class="ext-radio"
            @update:value="(v: '是' | '否') => patchFollowup(i, { reconcile: v })"
          >
            <a-radio value="是">是</a-radio>
            <a-radio value="否">否</a-radio>
          </a-radio-group>
        </div>
      </div>
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
        <label class="field-label-sm risk-level-label"><span class="req">*</span>风险等级</label>
        <FormSelect
          class="risk-level-select"
          :class="{ 'ctrl-missing': missRiskLevel }"
          :value="form.riskLevel || undefined"
          :options="riskLevelOptions"
          placeholder="请选择（必填）"
          @update:value="(v) => update({ riskLevel: String(v ?? '') })"
        />
      </template>
    </div>
    <p v-if="missRiskLevel" class="field-err">请选择风险等级</p>
    <div
      v-if="form.riskFlag === '疑似风险' || form.riskFlag === '有风险'"
      class="field"
      :class="{ 'is-missing': missRiskDesc }"
    >
      <label><span class="req">*</span>风险描述</label>
      <a-textarea
        :value="form.riskDescription"
        :rows="3"
        :status="missRiskDesc ? 'error' : undefined"
        placeholder="描述风险点、影响范围与建议处置…（必填）"
        @update:value="(v: string) => update({ riskDescription: v ?? '' })"
      />
      <p v-if="missRiskDesc" class="field-err">请填写风险描述</p>
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
.field { display: flex; flex-direction: column; gap: 6px; }
.field label { font-size: 12px; font-weight: 600; color: #374151; }
.field-label-sm { font-size: 11px; font-weight: 500; color: #6b7280; }
.field-row { display: flex; gap: 8px; }
.field-row .field { flex: 1 1 0; min-width: 0; }
.inline-row { flex-direction: row; align-items: center; gap: 12px; }
.inline-row .field-label-sm { flex: none; white-space: nowrap; }
.flex1 { flex: 1; min-width: 0; }
.cat-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
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
  .cat-grid { grid-template-columns: 1fr; }
}

.req {
  color: #ef4444;
  margin-right: 2px;
  font-weight: 600;
}
.field-err {
  margin: 0;
  font-size: 11px;
  color: #ef4444;
  line-height: 1.3;
}
.field-err.inline-err { margin-left: 0; }
.field.is-missing label { color: #b91c1c; }
.ctrl-missing :deep(.ant-select-selector),
.attach-ctrl.ctrl-missing :deep(textarea),
.attach-ctrl.ctrl-missing :deep(.ant-input) {
  border-color: #fca5a5 !important;
}
.radio-missing {
  padding: 2px 6px;
  border-radius: 4px;
  border: 1px dashed #fca5a5;
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

/* 投诉渠道：表格式多平台跟进 */
.ext-empty {
  font-size: 12px;
  color: #9ca3af;
  padding: 8px 0;
}
.ext-table {
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  overflow: hidden;
  background: #fff;
}
.ext-thead,
.ext-row {
  display: grid;
  /* 平台列限宽，编号紧跟左侧，回复结果吃剩余空间 */
  grid-template-columns: minmax(120px, 168px) 132px minmax(0, 1fr) 104px;
  column-gap: 8px;
  align-items: center;
  padding: 0 10px;
}
.ext-thead {
  min-height: 36px;
  background: #f9fafb;
  border-bottom: 1px solid #e5e7eb;
}
.ext-th {
  font-size: 11px;
  font-weight: 600;
  color: #6b7280;
  white-space: nowrap;
}
.ext-row {
  min-height: 48px;
  border-bottom: 1px solid #f0f0f0;
}
.ext-row:last-child { border-bottom: none; }
.ext-row:hover { background: #fafbfc; }
.ext-td { min-width: 0; }
.ext-platform {
  display: block;
  font-size: 12px;
  font-weight: 600;
  color: #374151;
  line-height: 1.35;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ext-no {
  font-size: 11px;
  color: #374151;
  font-family: Consolas, 'SF Mono', monospace;
  word-break: break-all;
}
.ext-no-empty {
  font-size: 12px;
  color: #d1d5db;
}
.ext-radio {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: nowrap;
}
.ext-row :deep(.ant-input) {
  height: 32px;
  font-size: 12px;
}
.ext-row :deep(.ant-radio-wrapper) {
  margin-inline-end: 0;
  font-size: 12px;
}
@media (max-width: 960px) {
  .ext-thead { display: none; }
  .ext-row {
    grid-template-columns: 1fr;
    gap: 8px;
    padding: 10px 12px;
  }
  .ext-col-reply::before,
  .ext-col-reconcile::before {
    display: block;
    font-size: 11px;
    font-weight: 600;
    color: #6b7280;
    margin-bottom: 4px;
  }
  .ext-col-reply::before { content: '回复结果'; }
  .ext-col-reconcile::before { content: '是否和解'; }
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
