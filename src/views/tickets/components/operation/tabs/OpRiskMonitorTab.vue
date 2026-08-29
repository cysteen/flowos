<script setup lang="ts">
import { computed, ref } from 'vue';
import { ContainerOutlined, CheckCircleOutlined, WarningOutlined } from '@ant-design/icons-vue';
import OpCollapsibleSection from '../OpCollapsibleSection.vue';
import OpTextareaAttach from '../shared/OpTextareaAttach.vue';
import FormSelect from '@/views/tickets/components/create-ticket/FormSelect.vue';
import { riskLevelText } from '@/config/risk';
import type { TicketRiskVerification } from '@/stores/riskTags';
import type { RiskMonitorDraft } from '@/views/tickets/types/operationTabs';
import {
  RISK_FLAG_OPTIONS,
  RISK_LEVEL_SELECT_OPTIONS,
  type ProcessFormDraft,
  type RiskFlag,
  type RiskLevel,
} from '@/views/tickets/types/operation';

const props = defineProps<{
  draft: RiskMonitorDraft;
  /**
   * 处理表单草稿。本 Tab 的「风险标记」区不自持数据，直接读写这一份里的
   * riskFlag / riskLevel / riskDescription —— 与「补充处理 → 风险」面板同一个落点，
   * 也是风险监控核实回传唯一写入的地方。由页面按 prop 下传，Tab 不直连全局状态。
   */
  form: ProcessFormDraft;
  /** 风险监控侧对本单的现行结论，只读回显用；同样由页面下传 */
  riskVerification?: TicketRiskVerification | null;
  /**
   * 本 Tab 对当前角色只读。矩阵 #43 的 0830 口径，判据表在 operation.ts
   * （TAB_ROLE_DENY.risk 管"看不看得到"、TAB_ROLE_WRITABLE.risk 管"能不能改"）：
   * - **可用（打标是它们的职责）**：⑤ 客诉专员、⑦ 投诉督导、⑨ 管理员 —— 与 RISK_TAG_ROLES 同一批人；
   * - **只读（处理人侧不打标）**：② 二线专员、③ 技术支持、④ 二线班组长、⑧ 质检；
   * - **无（整个 Tab 不渲染）**：① 一线坐席、⑥ 工单运营 —— 0830 起风险监控整块不给工单运营，
   *   它连风险词命中页都看不到，工单页的风险 Tab 自然也不该出。
   */
  readonly?: boolean;
}>();
const emit = defineEmits<{
  'update:draft': [draft: RiskMonitorDraft];
  'update:form': [form: ProcessFormDraft];
}>();

const expanded = ref({ report: true, conclusion: true, risk: true });
// 等级选项不在模板里手写：与风险监控页、处理表单同一把刻度（存 高/中/低，显示 高危/中危/低危）
const riskLevelOptions = RISK_LEVEL_SELECT_OPTIONS;

/** 单一写出口：只读态在此统一拦一道，Tab 本地字段的回写都经过这里 */
function update(partial: Partial<RiskMonitorDraft>) {
  if (props.readonly) return;
  emit('update:draft', { ...props.draft, ...partial });
}

/**
 * 风险标记三件套的写出口。走处理表单草稿，但只读判据与 update 完全一样——
 * 字段换了个存放处不等于换了一套权限，本 Tab 只读时这里同样一步都不许写出去。
 */
function updateForm(partial: Partial<ProcessFormDraft>) {
  if (props.readonly) return;
  emit('update:form', { ...props.form, ...partial });
}

/** 与工单处理「是否有风险」面板同一套显隐：有风险才留等级，疑似/有风险才留描述 */
function onRiskFlagChange(flag: RiskFlag) {
  const needsDesc = flag === '有风险' || flag === '疑似风险';
  updateForm({
    riskFlag: flag,
    riskLevel: flag === '有风险' ? props.form.riskLevel : '',
    riskDescription: needsDesc ? props.form.riskDescription : '',
    riskDescriptionAttachments: needsDesc ? props.form.riskDescriptionAttachments : [],
  });
}

const missRiskLevel = computed(
  () => props.form.riskFlag === '有风险' && !props.form.riskLevel,
);
const missRiskDesc = computed(
  () =>
    (props.form.riskFlag === '疑似风险' || props.form.riskFlag === '有风险')
    && !props.form.riskDescription.trim(),
);

// ---- 风险监控侧的现行结论（只读回显） ----
// 与「补充处理 → 风险」面板同一份数据、同一套文案：两处看的是同一个字段，
// 那"监控已经把这单核实成什么"也必须两处都看得见，否则在本 Tab 上填风险的人
// （客诉专员/投诉督导）反而是唯一看不到核实结论的人。
/** 「风险监控核实：高危 · 成立 · 李文萍（客诉专员）· 2026-08-04 14:03」 */
const riskMonitorLine = computed(() => {
  const v = props.riskVerification;
  if (!v) return '';
  if (!v.latest) return `风险监控核实：本单 ${v.hitCount} 条命中待核实，尚无核实结论`;
  const e = v.latest;
  // 等级取**工单级**（max 棘轮），不取最后一条命中自己的等级：工单页关心的是这张单有多危险
  return `风险监控核实：${riskLevelText(v.grade)} · ${e.verdict} · ${e.by}（${e.byRole}）· ${e.at}`;
});

/** 本单命中的构成。只在多条、且已经有人核实过时给——一条时说"本单 1 条命中"是废话 */
const riskMonitorBreakdown = computed(() => {
  const v = props.riskVerification;
  if (!v || v.hitCount <= 1 || !v.latest) return '';
  const parts: string[] = [];
  if (v.confirmedCount) parts.push(`成立 ${v.confirmedCount}`);
  if (v.falseCount) parts.push(`误报 ${v.falseCount}`);
  if (v.pendingCount) parts.push(`待核实 ${v.pendingCount}`);
  return `本单 ${v.hitCount} 条命中：${parts.join(' · ')}`;
});

/** 坐席自己填过、监控没能覆盖时的差异说明：不写出来会被读成"本页显示的就是监控结论" */
const riskMonitorDiff = computed(() => {
  const v = props.riskVerification;
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

/**
 * a-select 的 update:value 按 antd 声明给出 SelectValue（含 LabeledValue / 数组）。
 * 本页 select 全是单选、选项 value 均为字符串字面量，且未开 labelInValue，
 * 故清空时归一为 ''、其余按字符串收窄，等价于原来的 `v ?? ''`。
 */
function selectedText(v: unknown): string {
  return v == null ? '' : String(v);
}

/** 等级下拉的取值只可能是刻度里的三个字面量之一（单选、未开 labelInValue），故按 RiskLevel 收窄 */
function onRiskLevelChange(v: unknown) {
  updateForm({ riskLevel: selectedText(v) as RiskLevel | '' });
}
</script>

<template>
  <div class="risk-tab">
    <OpCollapsibleSection
      title="报备与协助"
      :icon="ContainerOutlined"
      :expanded="expanded.report"
      @toggle="expanded.report = !expanded.report"
    >
      <div class="field-row">
        <div class="inline-field">
          <label class="lbl lbl-108">报备所属功能模块</label>
          <a-select
            :value="draft.reportModule || undefined"
            class="form-select"
            placeholder="请选择"
            allow-clear
            @update:value="(v) => update({ reportModule: selectedText(v) })"
          >
            <a-select-option value="在线音乐">在线音乐</a-select-option>
            <a-select-option value="固件升级">固件升级</a-select-option>
            <a-select-option value="硬件质量">硬件质量</a-select-option>
          </a-select>
        </div>
        <div class="inline-field">
          <label class="lbl lbl-72">报备对象</label>
          <a-select
            :value="draft.reportTarget || undefined"
            class="form-select"
            placeholder="请选择"
            allow-clear
            @update:value="(v) => update({ reportTarget: selectedText(v) })"
          >
            <a-select-option value="产研-音箱组">产研-音箱组</a-select-option>
            <a-select-option value="质量部">质量部</a-select-option>
          </a-select>
        </div>
      </div>
      <div class="inline-field">
        <label class="lbl lbl-88">需协助内容</label>
        <a-select
          :value="draft.assistContent || undefined"
          class="form-select"
          placeholder="请选择"
          allow-clear
          @update:value="(v) => update({ assistContent: selectedText(v) })"
        >
          <a-select-option value="根因分析">根因分析</a-select-option>
          <a-select-option value="批次追溯">批次追溯</a-select-option>
        </a-select>
      </div>
      <div class="stack-field">
        <label class="lbl">备注</label>
        <OpTextareaAttach
          :model-value="draft.remark"
          :attachments="draft.remarkAttachments"
          :min-input-height="48"
          :readonly="readonly"
          placeholder="补充报备背景、影响范围等说明…"
          @update:model-value="(v) => update({ remark: v })"
          @update:attachments="(v) => update({ remarkAttachments: v })"
        />
      </div>
    </OpCollapsibleSection>

    <OpCollapsibleSection
      title="处理结论"
      :icon="CheckCircleOutlined"
      :expanded="expanded.conclusion"
      @toggle="expanded.conclusion = !expanded.conclusion"
    >
      <div class="inline-field">
        <label class="lbl lbl-72">处理结论</label>
        <a-select
          :value="draft.processConclusion || undefined"
          class="form-select"
          placeholder="请选择"
          allow-clear
          @update:value="(v) => update({ processConclusion: selectedText(v) })"
        >
          <a-select-option value="已解决">已解决</a-select-option>
          <a-select-option value="待跟进">待跟进</a-select-option>
          <a-select-option value="无法解决">无法解决</a-select-option>
        </a-select>
      </div>
      <div class="stack-field">
        <label class="lbl">处理答复</label>
        <OpTextareaAttach
          :model-value="draft.processReply"
          :attachments="draft.processReplyAttachments"
          :min-input-height="48"
          :readonly="readonly"
          placeholder="填写对坐席/客户的处理答复…"
          @update:model-value="(v) => update({ processReply: v })"
          @update:attachments="(v) => update({ processReplyAttachments: v })"
        />
      </div>
    </OpCollapsibleSection>

    <OpCollapsibleSection
      title="风险标记"
      :icon="WarningOutlined"
      body-variant="risk"
      :expanded="expanded.risk"
      @toggle="expanded.risk = !expanded.risk"
    >
      <!-- 取值来自处理表单草稿（form），与「补充处理 → 风险」面板是同一份数据 -->
      <div class="chip-panel panel-neutral">
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
            @update:value="(v: string) => updateForm({ riskDescription: v ?? '' })"
          />
          <p v-if="missRiskDesc" class="field-err">请填写风险描述</p>
        </div>
      </div>
    </OpCollapsibleSection>
  </div>
</template>

<style scoped>
.risk-tab { display: flex; flex-direction: column; gap: 12px; width: 100%; }

.field-row { display: flex; gap: 8px; align-items: center; }
.field-row .inline-field { flex: 1 1 0; min-width: 0; }

.inline-field {
  display: flex; align-items: center; gap: 8px; width: 100%;
}
.stack-field { display: flex; flex-direction: column; gap: 6px; }

.lbl {
  flex: none; font-size: 12px; font-weight: 600; color: #374151;
}
.lbl-108 { width: 108px; }
.lbl-72 { width: 72px; }
.lbl-88 { width: 88px; }

.form-select { flex: 1; min-width: 0; }
.form-select :deep(.ant-select-selector) {
  min-height: 32px !important;
  height: 32px !important;
  padding: 0 8px !important;
  border-radius: 6px !important;
  border-color: #e5e7eb !important;
  background: #fff !important;
  box-shadow: none !important;
  font-size: 12px;
}
.form-select :deep(.ant-select-selection-item),
.form-select :deep(.ant-select-selection-placeholder) {
  line-height: 30px !important;
  font-size: 12px;
}
.form-select :deep(.ant-select-selection-placeholder) { color: #9ca3af; }
.form-select :deep(.ant-select-arrow) { color: #9ca3af; font-size: 10px; }
.form-select:hover :deep(.ant-select-selector),
.form-select.ant-select-focused :deep(.ant-select-selector) {
  border-color: #e5e7eb !important;
  box-shadow: none !important;
}

.chip-panel { display: flex; flex-direction: column; gap: 12px; }
.panel-neutral {
  background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; padding: 12px;
}
.field { display: flex; flex-direction: column; gap: 6px; }
.field label { font-size: 12px; font-weight: 600; color: #374151; }
.field-label-sm { font-size: 11px; font-weight: 500; color: #6b7280; }
.inline-row { flex-direction: row; align-items: center; gap: 12px; }
.radio-row { display: flex; gap: 14px; font-size: 12px; }
.chip-panel :deep(.ant-radio-wrapper) { white-space: nowrap; }
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
.field.is-missing label { color: #b91c1c; }
.ctrl-missing :deep(.ant-select-selector) {
  border-color: #fca5a5 !important;
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
  flex: none;
  white-space: nowrap;
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
