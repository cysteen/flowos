<script setup lang="ts">
import { computed, watch } from 'vue';
import OpTextareaAttach from './shared/OpTextareaAttach.vue';
import OpQualityStandardFields from './OpQualityStandardFields.vue';
import OpChannelTable from './OpChannelTable.vue';
import FormSelect from '@/views/tickets/components/create-ticket/FormSelect.vue';
import { useRiskTagStore } from '@/stores/riskTags';
import { riskLevelText } from '@/config/risk';
import type { ProcessFormDraft, RiskFlag, RiskLevel, SupplementChip } from '@/views/tickets/types/operation';
import {
  RISK_FLAG_OPTIONS,
  RISK_LEVEL_SELECT_OPTIONS,
  QUALITY_ISSUE_L2_MAP,
  QUALITY_ISSUE_L2_TO_L1,
  complaintMarkOptions,
  COMPLAINT_MARK_REGULATOR_OPTIONS,
  BACKEND_PUSH_OPTIONS,
} from '@/views/tickets/types/operation';
import {
  COMPLAINT_L1_OPTIONS,
  COMPLAINT_L2_MAP,
  COMPLAINT_L3_MAP,
  COMPLAINED_ROLE_OPTIONS,
  needsComplainedRole,
} from '@/views/tickets/types/createTicket';

const props = defineProps<{
  activeChip: SupplementChip;
  form: ProcessFormDraft;
  /** 建单投诉平台，用于控制「有责/无责」类标记显隐 */
  complaintPlatform?: string;
  /** 建单投诉平台列表（投诉渠道跟进：平台 + 编号 + 投诉内容） */
  complaintPlatforms?: {
    platform: string;
    customPlatform?: string;
    complaintNo: string;
    complaintContent?: string;
  }[];
  /** 是否展示投诉渠道 chip 面板 */
  showExternal?: boolean;
  /** 只读：随「工单处理」Tab 的 Tab 级只读判据传下来（见 OpProcessForm.readonly） */
  readonly?: boolean;
  /** 当前工单号：风险面板要据此取风险监控侧对本单的核实结论 */
  ticketNo?: string;
}>();

const emit = defineEmits<{ 'update:form': [form: ProcessFormDraft] }>();

const riskTags = useRiskTagStore();
const riskLevelOptions = RISK_LEVEL_SELECT_OPTIONS;
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
const complainedRoleOptions = COMPLAINED_ROLE_OPTIONS.map((v) => ({ label: v, value: v }));
const backendPushOptions = BACKEND_PUSH_OPTIONS.map((v) => ({ label: v, value: v }));
const showComplainedRole = computed(() => needsComplainedRole(props.form.complaintCat3));
function platformKey(p: { platform: string; complaintNo?: string }) {
  return `${p.platform}::${p.complaintNo ?? ''}`;
}

/** 投诉渠道跟进行：与建单 platforms 对齐，展示平台 / 编号 / 投诉内容 */
const followupRows = computed(() => {
  const plats = (props.complaintPlatforms ?? []).filter((p) => p.platform);
  const prev = new Map(
    (props.form.platformFollowups ?? []).map((f) => [platformKey(f), f]),
  );
  // 建单没登记平台时沿用已填的跟进行。编号在草稿里是可选的（补充追加的行可能还没编号），
  // 而渠道表按"有编号"渲染，故在这里补齐成空串，不把 undefined 漏到展示层。
  if (!plats.length) {
    return (props.form.platformFollowups ?? []).map((f) => ({ ...f, complaintNo: f.complaintNo ?? '' }));
  }
  return plats.map((p) => {
    const old = prev.get(platformKey(p));
    return {
      platform: p.platform,
      customPlatform: p.customPlatform ?? old?.customPlatform,
      complaintNo: p.complaintNo ?? old?.complaintNo ?? '',
      complaintContent: old?.complaintContent ?? p.complaintContent ?? '',
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

const missChannelReply = computed(() => followupRows.value.length > 0 && !props.form.complaintChannelReply.trim());
const missChannelReconcile = computed(() => followupRows.value.length > 0 && !props.form.complaintChannelReconcile);
const missChannelAny = computed(() => missChannelReply.value || missChannelReconcile.value);

/** 单一写出口：只读态在此统一拦一道 */
function update(partial: Partial<ProcessFormDraft>) {
  if (props.readonly) return;
  emit('update:form', { ...props.form, ...partial });
}

function updateChannelContent(index: number, value: string) {
  const next = followupRows.value.map((row, i) =>
    i === index ? { ...row, complaintContent: value } : row,
  );
  update({ platformFollowups: next });
}

function onComplaintMarkChange(v: string | number | string[] | undefined) {
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
    riskLevel: hasRisk ? props.form.riskLevel : '',
    riskDescription: needsDesc ? props.form.riskDescription : '',
    riskDescriptionAttachments: needsDesc ? props.form.riskDescriptionAttachments : [],
  });
}

function onRiskLevelChange(v: string | number | string[] | undefined) {
  update({ riskLevel: (v == null ? '' : String(v)) as RiskLevel | '' });
}

function onComplaintCat1Change(v: string | number | string[] | undefined) {
  update({ complaintCat1: String(v ?? ''), complaintCat2: '', complaintCat3: '', complainedRole: [] });
}

function onQualityCat1Change(v: string | number | string[] | undefined) {
  const cat1 = String(v ?? '');
  const allowed = cat1 ? (QUALITY_ISSUE_L2_MAP[cat1] ?? []) : null;
  const cat2 = props.form.qualityIssueCat2;
  const keepCat2 = allowed ? allowed.includes(cat2) : !!cat2;
  update({
    qualityIssueCat1: cat1,
    qualityIssueCat2: keepCat2 ? cat2 : '',
  });
}

function onQualityCat2Change(v: string | number | string[] | undefined) {
  const cat2 = String(v ?? '');
  if (!cat2) {
    update({ qualityIssueCat2: '' });
    return;
  }
  const cat1 = props.form.qualityIssueCat1 || QUALITY_ISSUE_L2_TO_L1[cat2] || '';
  update({ qualityIssueCat1: cat1, qualityIssueCat2: cat2 });
}

function onComplaintCat2Change(v: string | number | string[] | undefined) {
  update({ complaintCat2: String(v ?? ''), complaintCat3: '', complainedRole: [] });
}

function onComplaintCat3Change(v: string | number | string[] | undefined) {
  const cat3 = String(v ?? '');
  update({
    complaintCat3: cat3,
    ...(needsComplainedRole(cat3) ? {} : { complainedRole: [] }),
  });
}

const missComplaintMark = computed(() => !props.form.complaintMark);
const missComplaintCat1 = computed(() => !props.form.complaintCat1);
const missComplaintCat2 = computed(() => !!props.form.complaintCat1 && !props.form.complaintCat2);
const missComplaintCat3 = computed(
  () => !!props.form.complaintCat2 && !props.form.complaintCat3,
);
const missComplainedRole = computed(
  () => showComplainedRole.value && !props.form.complainedRole?.length,
);
const missComplaintNote = computed(() => !props.form.complaintNote.trim());
const missRiskLevel = computed(
  () => props.form.riskFlag === '有风险' && !props.form.riskLevel,
);
const missRiskDesc = computed(
  () =>
    (props.form.riskFlag === '疑似风险' || props.form.riskFlag === '有风险')
    && !props.form.riskDescription.trim(),
);

// ---- 风险监控侧的现行结论（只读回显） ----
// 【为什么必须回显】监控的核实结论只填空、不覆盖坐席已填的值（拍板口径）。
// 于是"被挡住"是常态，而被挡住的那一次如果什么都不显示，坐席永远不知道
// 监控已经把这单核实成高危——信息在写入这一步就消失了。故无论写没写进去都亮出来。
// 它是**只读的一行字**：不进 form、不进必填校验、不参与 chip 角标。
const riskMonitorVerify = computed(() =>
  (props.ticketNo ? riskTags.ticketVerificationOf(props.ticketNo) : null),
);

/** 「风险监控核实：高危 · 成立 · 李文萍（客诉专员）· 2026-08-04 14:03」 */
const riskMonitorLine = computed(() => {
  const v = riskMonitorVerify.value;
  if (!v) return '';
  if (!v.latest) return `风险监控核实：本单 ${v.hitCount} 条命中待核实，尚无核实结论`;
  const e = v.latest;
  // 等级取**工单级**（max 棘轮），不取最后一条命中自己的等级：工单页关心的是这张单有多危险
  return `风险监控核实：${riskLevelText(v.grade)} · ${e.verdict} · ${e.by}（${e.byRole}）· ${e.at}`;
});

/**
 * 本单命中的构成。只在多条、且已经有人核实过时给——
 * 一条时说"本单 1 条命中"是废话；全待核实时上一行已经把条数说完了，再列一遍还是同一个数。
 */
const riskMonitorBreakdown = computed(() => {
  const v = riskMonitorVerify.value;
  if (!v || v.hitCount <= 1 || !v.latest) return '';
  const parts: string[] = [];
  if (v.confirmedCount) parts.push(`成立 ${v.confirmedCount}`);
  if (v.falseCount) parts.push(`误报 ${v.falseCount}`);
  if (v.pendingCount) parts.push(`待核实 ${v.pendingCount}`);
  return `本单 ${v.hitCount} 条命中：${parts.join(' · ')}`;
});

/**
 * 坐席自己填过、监控没能覆盖时的差异说明。
 * 【为什么不能省】两个值不一致却只显示监控那一行，读起来就像"本页显示的就是监控结论"，
 * 而实际落在字段里的是坐席填的值——照着它做处置会做错。差在哪儿必须写出来。
 */
const riskMonitorDiff = computed(() => {
  const v = riskMonitorVerify.value;
  if (!v) return '';
  const parts: string[] = [];
  if (v.flag && props.form.riskFlag && props.form.riskFlag !== v.flag) {
    parts.push(`「是否有风险」本页为「${props.form.riskFlag}」，监控结论为「${v.flag}」`);
  }
  if (v.grade && props.form.riskLevel && props.form.riskLevel !== v.grade) {
    parts.push(`「风险等级」本页为「${riskLevelText(props.form.riskLevel)}」，监控工单级为「${riskLevelText(v.grade)}」`);
  }
  if (!parts.length) return '';
  return `${parts.join('；')}。本页取值以坐席填写为准，监控结论不覆盖。`;
});
</script>

<template>
  <!-- 投诉分类 -->
  <div v-if="activeChip === 'complaint'" class="chip-panel">
    <div class="complaint-cat-row complaint-top-row">
      <div class="cat-item" :class="{ 'is-missing': missComplaintMark }">
        <label class="field-label-sm"><span class="req">*</span>投诉标记</label>
        <FormSelect
          class="cat-select"
          :class="{ 'ctrl-missing': missComplaintMark }"
          :value="form.complaintMark || undefined"
          :options="complaintMarkOpts"
          placeholder="请选择或搜索"
          @update:value="onComplaintMarkChange"
        />
        <p v-if="missComplaintMark" class="field-err">请选择</p>
      </div>
      <div class="cat-item">
        <label class="field-label-sm">需后端推动</label>
        <FormSelect
          class="cat-select"
          :value="form.backendPush || undefined"
          :options="backendPushOptions"
          placeholder="请选择或搜索"
          allow-clear
          @update:value="(v) => update({ backendPush: String(v ?? '') })"
        />
      </div>
    </div>
    <div class="complaint-cat-row">
      <div class="cat-item" :class="{ 'is-missing': missComplaintCat1 }">
        <label class="field-label-sm"><span class="req">*</span>投诉分类一</label>
        <FormSelect
          class="cat-select"
          :class="{ 'ctrl-missing': missComplaintCat1 }"
          :value="form.complaintCat1 || undefined"
          :options="complaintL1Options"
          placeholder="请选择或搜索"
          @update:value="onComplaintCat1Change"
        />
        <p v-if="missComplaintCat1" class="field-err">请选择</p>
      </div>
      <div class="cat-item" :class="{ 'is-missing': missComplaintCat2 }">
        <label class="field-label-sm"><span class="req">*</span>投诉分类二</label>
        <FormSelect
          class="cat-select"
          :class="{ 'ctrl-missing': missComplaintCat2 }"
          :value="form.complaintCat2 || undefined"
          :options="complaintL2Options"
          :disabled="!form.complaintCat1"
          placeholder="请选择或搜索"
          @update:value="onComplaintCat2Change"
        />
        <p v-if="missComplaintCat2" class="field-err">请选择</p>
      </div>
      <div class="cat-item" :class="{ 'is-missing': missComplaintCat3 }">
        <label class="field-label-sm"><span class="req">*</span>投诉分类三</label>
        <FormSelect
          class="cat-select"
          :class="{ 'ctrl-missing': missComplaintCat3 }"
          :value="form.complaintCat3 || undefined"
          :options="complaintL3Options"
          :disabled="!form.complaintCat2"
          placeholder="请选择或搜索"
          @update:value="onComplaintCat3Change"
        />
        <p v-if="missComplaintCat3" class="field-err">请选择</p>
      </div>
      <div
        v-if="showComplainedRole"
        class="cat-item"
        :class="{ 'is-missing': missComplainedRole }"
      >
        <label class="field-label-sm"><span class="req">*</span>被投诉角色</label>
        <FormSelect
          mode="multiple"
          class="cat-select complained-role-select"
          :class="{ 'ctrl-missing': missComplainedRole }"
          :value="form.complainedRole"
          :options="complainedRoleOptions"
          placeholder="请选择或搜索"
          :max-tag-count="2"
          @update:value="(v) => update({ complainedRole: Array.isArray(v) ? v : [] })"
        />
        <p v-if="missComplainedRole" class="field-err">请选择</p>
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
        :readonly="readonly"
        @update:model-value="(v) => update({ complaintNote: v })"
        @update:attachments="(v) => update({ complaintNoteAttachments: v })"
      />
      <p v-if="missComplaintNote" class="field-err">请填写投诉备注</p>
    </div>
  </div>

  <!-- 投诉渠道：渠道标签 + 共用跟进（单块紧凑） -->
  <div v-else-if="activeChip === 'external' && showExternal" class="chip-panel ext-panel panel-neutral">
    <div v-if="!followupRows.length" class="ext-empty">暂无投诉渠道，请先在工单信息中登记投诉平台</div>
    <div v-else class="ext-compact">
      <OpChannelTable
        :rows="followupRows"
        :readonly="readonly"
        @update:content="updateChannelContent"
      />
      <div class="ext-followup-row">
        <div class="ext-followup-field">
          <label class="field-label-sm"><span class="req">*</span>平台回复结果</label>
          <a-input
            :value="form.complaintChannelReply"
            :status="missChannelReply ? 'warning' : undefined"
            placeholder="填写平台回复结果"
            @update:value="(v: string) => update({ complaintChannelReply: v ?? '' })"
          />
        </div>
        <div class="ext-followup-field ext-followup-reconcile">
          <label class="field-label-sm"><span class="req">*</span>是否和解</label>
          <a-radio-group
            :value="form.complaintChannelReconcile || undefined"
            class="ext-radio"
            @update:value="(v: '是' | '否') => update({ complaintChannelReconcile: v })"
          >
            <a-radio value="是">是</a-radio>
            <a-radio value="否">否</a-radio>
          </a-radio-group>
        </div>
      </div>
      <p v-if="missChannelAny" class="ext-hint">请填写平台回复结果并选择是否和解</p>
    </div>
  </div>

  <!-- 风险 -->
  <div v-else-if="activeChip === 'risk'" class="chip-panel panel-neutral">
    <div class="field inline-row risk-row">
      <label>是否有风险</label>
      <a-radio-group
        :value="form.riskFlag || undefined"
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
          placeholder="请选择或搜索"
          @update:value="onRiskLevelChange"
        />
      </template>
    </div>
    <p v-if="missRiskLevel" class="field-err">请选择风险等级</p>
    <!-- 风险监控侧的现行结论：只读回显，不参与必填校验 -->
    <div v-if="riskMonitorLine" class="risk-monitor-note">
      <p class="rm-line">{{ riskMonitorLine }}</p>
      <p v-if="riskMonitorBreakdown" class="rm-sub">{{ riskMonitorBreakdown }}</p>
      <p v-if="riskMonitorDiff" class="rm-diff">{{ riskMonitorDiff }}</p>
    </div>
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
/* 投诉标记行（2 列）+ 分类行（3～4 列） */
.complaint-cat-row {
  display: flex;
  flex-wrap: nowrap;
  align-items: flex-start;
  gap: 10px;
  min-width: 0;
}
.complaint-top-row .cat-item {
  flex: 1 1 0;
}
.cat-item {
  flex: 1 1 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.cat-item .field-label-sm {
  white-space: nowrap;
}
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
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
@media (max-width: 960px) {
  .complaint-cat-row {
    flex-wrap: wrap;
  }
  .cat-item {
    flex: 1 1 calc(50% - 5px);
  }
}
.complained-role-select {
  width: 100%;
}
.complained-role-select :deep(.ant-select-selector) {
  min-height: 32px;
  height: auto;
  padding-top: 2px;
  padding-bottom: 2px;
}
.complained-role-select :deep(.ant-select-selection-item) {
  font-size: 11px;
  line-height: 20px;
  height: 22px;
  margin-top: 1px;
  margin-bottom: 1px;
  max-width: 100%;
}
.complained-role-select :deep(.ant-select-selection-placeholder) {
  font-size: 12px;
  line-height: 28px;
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

/* 投诉渠道：单块紧凑 */
.ext-panel.panel-neutral {
  padding: 12px;
}
.ext-empty {
  font-size: 12px;
  color: #9ca3af;
}
.ext-compact {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.ext-followup-row {
  display: flex;
  flex-wrap: nowrap;
  align-items: flex-start;
  gap: 10px;
}
.ext-followup-field {
  flex: 1 1 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.ext-followup-reconcile {
  flex: 0 0 132px;
}
.ext-followup-field :deep(.ant-input) {
  height: 32px;
  font-size: 12px;
}
.ext-radio {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 32px;
}
.ext-hint {
  margin: 0;
  font-size: 11px;
  color: #b45309;
  line-height: 1.4;
}
@media (max-width: 720px) {
  .ext-followup-row {
    flex-direction: column;
  }
  .ext-followup-reconcile {
    flex: 1 1 auto;
  }
}

.risk-row {
  flex-wrap: wrap;
  align-items: center;
}
/* 风险监控核实回显：只读信息块，与可填字段拉开视觉层级 */
.risk-monitor-note {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 6px 8px;
  border-left: 2px solid #cbd5e1;
  background: #f1f5f9;
  border-radius: 0 4px 4px 0;
}
.risk-monitor-note p { margin: 0; line-height: 1.5; }
.rm-line { font-size: 11px; color: #475569; font-weight: 600; }
.rm-sub { font-size: 11px; color: #64748b; }
.rm-diff { font-size: 11px; color: #b45309; }
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
