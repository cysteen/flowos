<script setup lang="ts">
import { computed, ref } from 'vue';
import { message } from 'ant-design-vue';
import {
  ContainerOutlined,
  CheckCircleOutlined,
  WarningOutlined,
  ClockCircleOutlined,
  CheckOutlined,
  PaperClipOutlined,
  UserOutlined,
} from '@ant-design/icons-vue';
import OpCollapsibleSection from '../OpCollapsibleSection.vue';
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
import {
  useRiskReportStore,
  type AssessDecision,
  type ReportAssessment,
  type RiskReport,
} from '@/stores/riskReports';
import OpActionModal from '../OpActionModal.vue';
import { useUserStore } from '@/stores/user';

const props = defineProps<{
  ticketNo: string;
  ticketTitle?: string;
  draft: RiskMonitorDraft;
  form: ProcessFormDraft;
  riskVerification?: TicketRiskVerification | null;
  readonly?: boolean;
}>();

const emit = defineEmits<{
  'update:form': [form: ProcessFormDraft];
}>();

const user = useUserStore();
const reportStore = useRiskReportStore();

const expanded = ref({ report: true, assess: true, risk: true });
const riskLevelOptions = RISK_LEVEL_SELECT_OPTIONS;

/** 在队的那一条（至多一条） */
const pending = computed(() => reportStore.pendingOf(props.ticketNo));
/** 历史条目：已评估 + 已撤回，时间倒序。在队那条单独占一块，不进这个列表 */
const history = computed(() => reportStore.historyOf(props.ticketNo));
// ---- 撤回（PRD §4.8）----
// 提交即固化、不提供编辑；填错了只能撤回后重报。**仅待评估、仅本人**，
// 且撤回后**不删除**，转「已撤回」并留原因 —— 它是"这个人当时报过什么"的证据。
const withdrawOpen = ref(false);
const withdrawReason = ref('');
const withdrawTried = ref(false);
const missWithdrawReason = computed(() => withdrawTried.value && !withdrawReason.value.trim());
const canWithdraw = computed(
  () => !props.readonly && !!pending.value && pending.value.by === user.name,
);

function openWithdraw() {
  if (!canWithdraw.value) return;
  withdrawReason.value = '';
  withdrawTried.value = false;
  withdrawOpen.value = true;
}

function confirmWithdraw() {
  withdrawTried.value = true;
  const target = pending.value;
  if (!target || !withdrawReason.value.trim()) return;
  reportStore.withdraw(target.id, withdrawReason.value.trim());
  withdrawOpen.value = false;
  message.success('已撤回本次报备，可重新发起');
}

function updateForm(partial: Partial<ProcessFormDraft>) {
  if (props.readonly) return;
  emit('update:form', { ...props.form, ...partial });
}

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

/**
 * 「风险评估结论：高危 · 吴投诉（客诉专员）· 2026-09-09 13:28」
 *
 * 【为什么必须有这一行】回传是"工单侧优先、只填空"（930 §6.1 / 915 §7.3），
 * 于是"被坐席已填的值挡住"是常态。被挡住的那一次若什么都不显示，
 * 报备人永远不知道客诉专员已经把这单评成了高危 —— **信息在写入这一步就消失了**。
 * 与上面那行（命中核实）是同一个理由的两路。
 */
const riskAssessLine = computed(() => reportStore.ticketAssessmentNoteOf(props.ticketNo));

const riskMonitorLine = computed(() => {
  const v = props.riskVerification;
  if (!v) return '';
  if (!v.latest) return `风险监控核实：本单 ${v.hitCount} 条命中待核实，尚无核实结论`;
  const e = v.latest;
  return `风险监控核实：${riskLevelText(v.grade)} · ${e.verdict} · ${e.by}（${e.byRole}）· ${e.at}`;
});

const riskMonitorBreakdown = computed(() => {
  const v = props.riskVerification;
  if (!v || v.hitCount <= 1 || !v.latest) return '';
  const parts: string[] = [];
  if (v.confirmedCount) parts.push(`成立 ${v.confirmedCount}`);
  if (v.falseCount) parts.push(`误报 ${v.falseCount}`);
  if (v.pendingCount) parts.push(`待核实 ${v.pendingCount}`);
  return `本单 ${v.hitCount} 条命中：${parts.join(' · ')}`;
});

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

function selectedText(v: unknown): string {
  return v == null ? '' : String(v);
}

function onRiskLevelChange(v: unknown) {
  updateForm({ riskLevel: selectedText(v) as RiskLevel | '' });
}

function formatShortAt(at: string) {
  const m = at.match(/(\d{2}-\d{2})\s+(\d{2}:\d{2})/);
  return m ? `${m[1]} ${m[2]}` : at;
}

function waitMinutes(at: string) {
  const t = new Date(at.replace(/-/g, '/')).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.floor((Date.now() - t) / 60000));
}

function assessmentSummary(r: RiskReport) {
  const a = r.assessment;
  if (!a) return '';
  const parts: string[] = [a.decision];
  if (a.level) parts.push(riskLevelText(a.level));
  return parts.join(' · ');
}

/**
 * 记录列表里的结论行**只给一行摘要**：谁、什么时候评的。
 *
 * 【为什么不带处置建议】完整结论（决策 / 等级 / 评估人 / 评估时间 / 处置建议）
 * 由下方「评估结果」区块承担（业务拍板 2026-09-09）。两处都写全文的话，
 * 同一条结论在一屏上出现两遍 —— 报备多轮之后两块内容还会分叉，
 * 读的人不知道该信哪个。这里只答"这条评过没有、谁评的"，详情往下看。
 */
function assessmentDetail(r: RiskReport) {
  const a = r.assessment;
  if (!a) return '';
  return `${a.by}（${a.byRole}）${formatShortAt(a.at)}`;
}

const reportSectionBadge = computed(() => {
  if (pending.value) return '待评估';
  if (history.value.length) return String(history.value.length);
  return undefined;
});

const reportSectionBadgeVariant = computed(() =>
  pending.value ? 'warn' as const : 'count' as const,
);

/** 本单最近一次已评估的报备（按评估时刻倒序） */
const latestAssessed = computed(() =>
  reportStore.reportsOf(props.ticketNo).find((r) => r.status === '已评估' && r.assessment) ?? null,
);

/** 仅有结论时出角标；进行中状态在上面的报备卡片展示 */
const assessSectionBadge = computed(() => (latestAssessed.value ? '已评估' : undefined));

function adviceLabel(decision: AssessDecision) {
  return decision === '接管' ? '接管说明' : '反馈意见';
}

function decisionTone(decision: AssessDecision) {
  const map: Record<AssessDecision, string> = {
    不升级: 'ok',
    接管: 'danger',
  };
  return map[decision];
}

function formatAssessor(a: ReportAssessment) {
  return a.byRole ? `${a.by}（${a.byRole}）` : a.by;
}

</script>

<template>
  <div class="risk-tab">
    <OpCollapsibleSection
      title="风险报备"
      :icon="ContainerOutlined"
      :badge="reportSectionBadge"
      :badge-variant="reportSectionBadgeVariant"
      :expanded="expanded.report"
      @toggle="expanded.report = !expanded.report"
    >
      <!-- 在队报备：卡片主体 + 元信息，发起入口在底栏弹窗 -->
      <section v-if="pending" class="rr-sheet rr-sheet-pending" aria-label="当前待评估报备">
        <header class="rr-sheet-head">
          <div class="rr-sheet-brand">
            <div class="rr-sheet-title-row">
              <span class="rr-pill rr-pill-pending">
                <ClockCircleOutlined />
                待评估
              </span>
              <span class="rr-sheet-time">提交于 {{ formatShortAt(pending.at) }}</span>
              <span class="rr-sheet-wait">已等待 {{ waitMinutes(pending.at) }} 分钟</span>
            </div>
            <div class="rr-sheet-meta">
              <span class="rr-meta-pair">
                <UserOutlined class="rr-meta-icon" />
                <span class="rr-meta-label">报备人</span>
                <span class="rr-meta-value">{{ pending.by }}</span>
              </span>
              <span class="rr-meta-sep" aria-hidden="true" />
              <span class="rr-meta-pair">
                <span class="rr-meta-label">原因</span>
                <span class="rr-meta-value">{{ pending.reason }}</span>
              </span>
              <template v-if="pending.category">
                <span class="rr-meta-sep" aria-hidden="true" />
                <span class="rr-meta-pair">
                  <span class="rr-meta-label">风险类型</span>
                  <span class="rr-meta-value rr-meta-warn">{{ pending.category }}</span>
                </span>
              </template>
            </div>
          </div>
          <button v-if="canWithdraw" type="button" class="rr-withdraw" @click="openWithdraw">
            撤回
          </button>
        </header>

        <div class="rr-sheet-body">
          <blockquote class="rr-quote">{{ pending.desc }}</blockquote>
          <ul v-if="pending.attachments.length" class="rr-files">
            <li v-for="f in pending.attachments" :key="f" class="rr-file">
              <PaperClipOutlined />
              <span>{{ f }}</span>
            </li>
          </ul>
        </div>
      </section>

      <div v-if="!pending && !history.length" class="rr-empty">
        <ContainerOutlined class="rr-empty-icon" />
        <p class="rr-empty-title">暂无风险报备</p>
        <p class="rr-empty-hint">请点击底部「风险报备」发起</p>
      </div>

      <!-- 历史报备：时间线样式，与在队卡片同屏可见 -->
      <div v-if="history.length" class="rr-history" :class="{ 'has-pending': pending }">
        <h4 class="rr-history-head">报备记录<span class="rr-history-count">{{ history.length }}</span></h4>
        <div class="rr-timeline">
          <article v-for="h in history" :key="h.id" class="rr-item">
            <div class="rr-rail" aria-hidden="true">
              <span
                class="rr-dot"
                :class="h.status === '已评估' ? 'dot-done' : 'dot-gray'"
              />
              <span class="rr-line" />
            </div>
            <div class="rr-item-body">
              <header class="rr-item-head">
                <span class="rr-item-time">{{ formatShortAt(h.at) }}</span>
                <span class="rr-item-who">{{ h.by }}</span>
                <span class="rr-tag-reason">{{ h.reason }}</span>
                <span v-if="h.category" class="rr-tag-cat">{{ h.category }}</span>
                <span
                  class="rr-pill rr-pill-sm"
                  :class="h.status === '已撤回' ? 'rr-pill-gray' : 'rr-pill-done'"
                >
                  {{ h.status }}
                </span>
              </header>
              <p class="rr-item-desc">{{ h.desc }}</p>
              <div v-if="h.attachments.length" class="rr-item-files">
                <PaperClipOutlined />
                <span>{{ h.attachments.join('、') }}</span>
              </div>
              <div v-if="h.status === '已评估'" class="rr-eval">
                <CheckOutlined class="rr-eval-icon" />
                <div class="rr-eval-body">
                  <span class="rr-eval-sum">{{ assessmentSummary(h) }}</span>
                  <span class="rr-eval-detail">{{ assessmentDetail(h) }}</span>
                </div>
              </div>
              <p v-else-if="h.withdrawReason" class="rr-withdraw-note">
                撤回原因：{{ h.withdrawReason }}
              </p>
            </div>
          </article>
        </div>
      </div>
    </OpCollapsibleSection>

    <!-- 撤回：必须填原因，撤回后记录仍在（转「已撤回」），不删除 -->
    <OpActionModal
      v-model:open="withdrawOpen"
      title="撤回风险报备"
      :icon="ContainerOutlined"
      tone="warn"
      :width="440"
      ok-text="确认撤回"
      ok-tone="danger"
      @ok="confirmWithdraw"
    >
      <div class="stack-field">
        <label class="lbl"><span class="req">*</span>撤回原因</label>
        <a-textarea
          v-model:value="withdrawReason"
          :rows="3"
          :status="missWithdrawReason ? 'error' : undefined"
          placeholder="说明为什么撤回这条报备…"
        />
        <p v-if="missWithdrawReason" class="field-err">请填写撤回原因</p>
        <p class="report-tip">
          撤回后本条转为「已撤回」并保留在报备记录里，不会删除；撤回后可重新发起报备。
        </p>
      </div>
    </OpActionModal>

    <OpCollapsibleSection
      title="评估结果"
      :icon="CheckCircleOutlined"
      :badge="assessSectionBadge"
      badge-variant="hint"
      :expanded="expanded.assess"
      @toggle="expanded.assess = !expanded.assess"
    >
      <section
        v-if="latestAssessed?.assessment"
        class="ra-sheet"
        aria-label="评估记录"
      >
        <header class="ra-head">
          <span
            class="ra-decision"
            :class="`tone-${decisionTone(latestAssessed.assessment.decision)}`"
          >
            {{ latestAssessed.assessment.decision }}
          </span>
          <span
            v-if="latestAssessed.assessment.level"
            class="ra-level"
          >
            {{ riskLevelText(latestAssessed.assessment.level) }}
          </span>
        </header>

        <dl class="ra-kv">
          <div class="ra-kv-row">
            <dt>评估人</dt>
            <dd>{{ formatAssessor(latestAssessed.assessment) }}</dd>
          </div>
          <div class="ra-kv-row">
            <dt>评估时间</dt>
            <dd>{{ latestAssessed.assessment.at }}</dd>
          </div>
          <div class="ra-kv-row">
            <dt>评估决策</dt>
            <dd>{{ latestAssessed.assessment.decision }}</dd>
          </div>
          <div class="ra-kv-row ra-kv-block">
            <dt>{{ adviceLabel(latestAssessed.assessment.decision) }}</dt>
            <dd class="ra-advice">{{ latestAssessed.assessment.advice }}</dd>
          </div>
        </dl>
      </section>

      <div v-else class="ra-empty">
        尚无评估结论
      </div>
    </OpCollapsibleSection>

    <OpCollapsibleSection
      title="风险标记"
      :icon="WarningOutlined"
      body-variant="risk"
      :expanded="expanded.risk"
      @toggle="expanded.risk = !expanded.risk"
    >
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
        <!--
          两路人判风险的现行结论：只读回显。整块显隐取**并集** ——
          本 Tab 只在非投诉单出现，而风险词命中大多落在投诉单上，所以这里
          常年只有报备评估那一行；若把显隐挂在命中那一行上，评估结论就永远不显示。
        -->
        <div v-if="riskMonitorLine || riskAssessLine" class="risk-monitor-note">
          <p v-if="riskMonitorLine" class="rm-line">{{ riskMonitorLine }}</p>
          <p v-if="riskMonitorBreakdown" class="rm-sub">{{ riskMonitorBreakdown }}</p>
          <p v-if="riskAssessLine" class="rm-line">{{ riskAssessLine }}</p>
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

/* ---- 风险报备：在队卡片 ---- */
.rr-sheet {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  overflow: hidden;
}
.rr-sheet-pending {
  border-color: #fed7aa;
  box-shadow: 0 1px 3px rgba(234, 88, 12, 0.06);
}
.rr-sheet-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  background: linear-gradient(180deg, #fff7ed 0%, #fff 100%);
  border-bottom: 1px solid #ffedd5;
}
.rr-sheet-brand { min-width: 0; flex: 1; }
.rr-sheet-title-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
.rr-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 10px;
  font-size: 12px;
  font-weight: 700;
  border-radius: 999px;
  white-space: nowrap;
}
.rr-pill-pending { color: #c2410c; background: #ffedd5; }
.rr-pill-pending :deep(.anticon) { font-size: 12px; }
.rr-pill-done { color: #047857; background: #d1fae5; }
.rr-pill-gray { color: #6b7280; background: #f3f4f6; }
.rr-pill-sm { font-size: 10px; padding: 2px 8px; font-weight: 600; }
.rr-sheet-time { font-size: 13px; font-weight: 600; color: #9a3412; }
.rr-sheet-wait { font-size: 12px; color: #ea580c; }
.rr-sheet-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 0;
  margin-top: 8px;
}
.rr-meta-pair {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
}
.rr-meta-icon { color: #9ca3af; font-size: 12px; }
.rr-meta-label { color: #9ca3af; }
.rr-meta-value { color: #374151; font-weight: 600; }
.rr-meta-warn { color: #c2410c; }
.rr-meta-sep {
  width: 1px;
  height: 12px;
  margin: 0 10px;
  background: #e5e7eb;
  flex: none;
}
.rr-withdraw {
  flex: none;
  padding: 6px 12px;
  font-size: 12px;
  font-weight: 600;
  font-family: inherit;
  color: #9a3412;
  background: #fff;
  border: 1px solid #fdba74;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
}
.rr-withdraw:hover { background: #fff1e6; border-color: #fb923c; }
.rr-sheet-body { padding: 12px 14px 14px; }
.rr-quote {
  margin: 0;
  padding: 10px 12px;
  font-size: 13px;
  line-height: 1.65;
  color: #1f2937;
  background: #f8fafc;
  border-left: 3px solid #fdba74;
  border-radius: 0 6px 6px 0;
}
.rr-files {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 10px 0 0;
  padding: 0;
  list-style: none;
}
.rr-file {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  font-size: 11px;
  color: #475569;
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
  border-radius: 4px;
}
.rr-file :deep(.anticon) { color: #94a3b8; font-size: 11px; }

/* ---- 空态 ---- */
.rr-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 28px 16px;
  text-align: center;
  background: #fafafa;
  border: 1px dashed #e5e7eb;
  border-radius: 10px;
}
.rr-empty-icon { font-size: 28px; color: #d1d5db; margin-bottom: 8px; }
.rr-empty-title { margin: 0; font-size: 13px; font-weight: 600; color: #6b7280; }
.rr-empty-hint { margin: 4px 0 0; font-size: 12px; color: #9ca3af; }

/* ---- 历史时间线 ---- */
.rr-history { margin-top: 4px; }
.rr-history.has-pending {
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px dashed #e5e7eb;
}
.rr-history-head {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0 0 10px;
  font-size: 12px;
  font-weight: 600;
  color: #374151;
}
.rr-history-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  font-size: 10px;
  font-weight: 700;
  color: #1a6fff;
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  border-radius: 999px;
}
.rr-timeline { display: flex; flex-direction: column; gap: 0; }
.rr-item { display: flex; gap: 10px; }
.rr-rail {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 16px;
  flex: none;
  padding-top: 4px;
}
.rr-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex: none;
}
.rr-dot.dot-done { background: #10b981; box-shadow: 0 0 0 3px #d1fae5; }
.rr-dot.dot-gray { background: #d1d5db; box-shadow: 0 0 0 3px #f3f4f6; }
.rr-line {
  flex: 1;
  width: 1px;
  min-height: 12px;
  margin: 4px 0;
  background: #e5e7eb;
}
.rr-item:last-child .rr-line { display: none; }
.rr-item-body {
  flex: 1;
  min-width: 0;
  padding-bottom: 14px;
}
.rr-item-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}
.rr-item-time { font-size: 12px; font-weight: 700; color: #111827; }
.rr-item-who { font-size: 12px; color: #6b7280; }
.rr-tag-reason,
.rr-tag-cat {
  padding: 1px 6px;
  font-size: 10px;
  font-weight: 600;
  border-radius: 4px;
}
.rr-tag-reason { color: #475569; background: #f1f5f9; border: 1px solid #e2e8f0; }
.rr-tag-cat { color: #c2410c; background: #fff7ed; border: 1px solid #fed7aa; }
.rr-item-desc {
  margin: 6px 0 0;
  font-size: 12px;
  line-height: 1.6;
  color: #4b5563;
}
.rr-item-files {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 6px;
  font-size: 11px;
  color: #94a3b8;
}
.rr-item-files :deep(.anticon) { font-size: 11px; }
.rr-eval {
  display: flex;
  gap: 8px;
  margin-top: 8px;
  padding: 8px 10px;
  background: #ecfdf5;
  border: 1px solid #a7f3d0;
  border-radius: 6px;
}
.rr-eval-icon { color: #059669; font-size: 13px; margin-top: 2px; flex: none; }
.rr-eval-body { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.rr-eval-sum { font-size: 12px; font-weight: 700; color: #047857; }
.rr-eval-detail { font-size: 11px; line-height: 1.5; color: #4b5563; }
.rr-withdraw-note {
  margin: 8px 0 0;
  padding: 6px 8px;
  font-size: 11px;
  color: #6b7280;
  background: #f9fafb;
  border-radius: 4px;
}

.report-tip {
  margin: 0;
  padding: 8px 10px;
  font-size: 11px;
  line-height: 1.6;
  color: #475569;
  background: #f1f5f9;
  border-left: 2px solid #cbd5e1;
  border-radius: 0 4px 4px 0;
}
.report-tip strong { color: #334155; }

/* ---- 评估结果（仅有结论时展示，进行中状态在上方报备卡片） ---- */
.ra-sheet {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  overflow: hidden;
}
.ra-head {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  padding: 12px 14px;
  background: linear-gradient(180deg, #f8fafc 0%, #fff 100%);
  border-bottom: 1px solid #f1f5f9;
}
.ra-decision {
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  font-size: 12px;
  font-weight: 700;
  border-radius: 999px;
}
.ra-decision.tone-danger { color: #b91c1c; background: #fee2e2; }
.ra-decision.tone-ok { color: #047857; background: #d1fae5; }
.ra-decision.tone-warn { color: #b45309; background: #fef3c7; }
.ra-decision.tone-info { color: #1d4ed8; background: #dbeafe; }
.ra-level {
  padding: 2px 8px;
  font-size: 11px;
  font-weight: 600;
  color: #c2410c;
  background: #fff7ed;
  border: 1px solid #fed7aa;
  border-radius: 4px;
}
.ra-kv {
  margin: 0;
  padding: 12px 14px 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.ra-kv-row {
  display: grid;
  grid-template-columns: 72px 1fr;
  gap: 8px 12px;
  align-items: start;
}
.ra-kv-row dt {
  margin: 0;
  font-size: 12px;
  color: #9ca3af;
  font-weight: 500;
  line-height: 1.6;
}
.ra-kv-row dd {
  margin: 0;
  font-size: 12px;
  color: #111827;
  font-weight: 500;
  line-height: 1.6;
  word-break: break-word;
}
.ra-kv-block { grid-template-columns: 1fr; gap: 4px; }
.ra-kv-block dt { color: #374151; font-weight: 600; }
.ra-advice {
  padding: 8px 10px;
  background: #f8fafc;
  border-left: 2px solid #cbd5e1;
  border-radius: 0 4px 4px 0;
  font-weight: 400 !important;
  color: #374151 !important;
}
.ra-link { color: #1a6fff !important; font-family: ui-monospace, monospace; }
.ra-empty {
  padding: 20px 14px;
  text-align: center;
  font-size: 12px;
  color: #9ca3af;
  background: #fafafa;
  border: 1px dashed #e5e7eb;
  border-radius: 8px;
}

.inline-field {
  display: flex; align-items: center; gap: 8px; width: 100%;
}
.stack-field { display: flex; flex-direction: column; gap: 6px; }

.lbl {
  flex: none; font-size: 12px; font-weight: 600; color: #374151;
}
.lbl-72 { width: 72px; }

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
