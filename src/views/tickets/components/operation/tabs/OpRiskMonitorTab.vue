<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { message } from 'ant-design-vue';
import {
  ContainerOutlined,
  CheckCircleOutlined,
  WarningOutlined,
  ClockCircleOutlined,
  CheckOutlined,
  PaperClipOutlined,
  UserOutlined,
  EditOutlined,
} from '@ant-design/icons-vue';
import { useRiskReportAssess } from '@/composables/useRiskReportAssess';
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
// 本单的报备读口在 B 线自己的 store 里；行类型取合并池的行（同一张单上还可能有
// A 线自动入池的条目，见 riskReports.ts 的 `reportsOf` 说明）。
import { useRiskReportStore } from '@/stores/riskReports';
import type { AssessDecision, ReportAssessment, RiskPoolItem } from '@/stores/riskShared';
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
const router = useRouter();
const {
  ASSESS_DECISIONS,
  assessOpen,
  assessDecision,
  assessAdvice,
  missAssessDecision,
  missAssessAdvice,
  assessAdviceLabel,
  assessAdvicePlaceholder,
  takeoverHint,
  openAssess,
  confirmAssess,
  canAssessReport,
} = useRiskReportAssess();

const expanded = ref({ report: true, assess: true, risk: true });
const riskLevelOptions = RISK_LEVEL_SELECT_OPTIONS;

/** 在队的那一条（至多一条） */
const pending = computed(() => reportStore.pendingOf(props.ticketNo));
/** 历史条目：已评估 + 已撤回，时间倒序。在队那条单独占一块，不进这个列表 */
const history = computed(() => reportStore.historyOf(props.ticketNo));
// ---- 撤回（PRD §4.8）----
// 提交即固化、不提供编辑；填错了只能撤回后重报。**仅待分派、仅本人**，
// 且撤回后**不删除**，转「已撤回」并留原因 —— 它是"这个人当时报过什么"的证据。
//
// 🔴 **分派之后不给撤回按钮**（N4 三态）：活已经指给某个客诉专员了，这时候抽走
// 等于让他白读一遍。store 的 withdraw() 也只认「待分派」，两处口径必须一致——
// 按钮还在、点了却什么都没发生，比按钮消失更糟。分派后要纠错走"评完再报一次"。
const withdrawOpen = ref(false);
const withdrawReason = ref('');
const withdrawTried = ref(false);
const missWithdrawReason = computed(() => withdrawTried.value && !withdrawReason.value.trim());
const canWithdraw = computed(
  () => !props.readonly
    && !!pending.value
    && pending.value.status === '待分派'
    && pending.value.by === user.name,
);

/** 当前承办人可在工单详情页提交评估结论 */
const canAssess = computed(
  () => !props.readonly
    && !!pending.value
    && canAssessReport(pending.value, user.name),
);

function tryAssessArrival() {
  if (!reportStore.consumeAssessArrival(props.ticketNo)) return;
  const p = pending.value;
  if (!p || !canAssessReport(p, user.name)) return;
  expanded.value.report = true;
  nextTick(() => openAssess(p));
}

watch(() => props.ticketNo, tryAssessArrival);
watch(pending, tryAssessArrival);
onMounted(tryAssessArrival);

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

/*
 * ⚠️ 这里曾有一行只读的「风险评估结论：高危 · 吴投诉（客诉专员）· …」（riskAssessLine）。
 * **已整条删除**（2026-09-09 业务第二轮拍板，《【930】》N1）：评估决策改回二选一
 * 「不升级 / 接管」之后没有"确认有风险 + 定级"这一档，评估**不再回传工单风险字段** ——
 * 没有"被坐席已填的值挡住"这回事了，也就没有必须另外亮一行的理由。
 * 结论本身在本 Tab 的「评估结果」区块里全文可见，比一行摘要说得全。
 *
 * 下面三个 riskMonitor* 是**命中核实**那一路（915），与本次反转无关，一字不动。
 */

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

/**
 * 等待时长与头部横幅同源：都取 store 的 `waitedMinutes`（内含 60s 心跳）。
 * 本地各算各的会让同一条报备在横幅与本页显示成两个数。
 */
function waitedText(at: string) {
  const mins = reportStore.waitedMinutes(at);
  return mins >= 60 ? `${Math.floor(mins / 60)} 小时 ${mins % 60} 分钟` : `${mins} 分钟`;
}

/**
 * 记录行的结论摘要。**只有决策**（二选一）——原先还并了一个风险等级，
 * 二选一之后评估不再定级（N1），那一段没有取值来源了。
 * 「接管」额外带上派生的新投诉单号：这条记录的实际去向就在那张单上，
 * 只写「接管」两个字，读的人还得再翻一次「评估结果」才知道去了哪。
 */
function assessmentSummary(r: RiskPoolItem) {
  const a = r.assessment;
  if (!a) return '';
  if (a.decision === '接管' && a.escalatedToNo) return `接管 → ${a.escalatedToNo}`;
  return a.decision;
}

/**
 * 记录列表里的结论行**只给一行摘要**：谁、什么时候评的。
 *
 * 【为什么不带反馈意见 / 接管说明】完整结论（决策 / 评估人 / 评估时间 / 意见全文 / 接管去向）
 * 由下方「评估结果」区块承担（业务拍板 2026-09-09）。两处都写全文的话，
 * 同一条结论在一屏上出现两遍 —— 报备多轮之后两块内容还会分叉，
 * 读的人不知道该信哪个。这里只答"这条评过没有、谁评的"，详情往下看。
 */
function assessmentDetail(r: RiskPoolItem) {
  const a = r.assessment;
  if (!a) return '';
  return `${a.by}（${a.byRole}）${formatShortAt(a.at)}`;
}

/**
 * 在队那条的状态标。**分「待分派 / 评估中」两态显示**（N4）——
 * 都笼统写「待评估」的话，报备人看不出"还没人接"与"李文萍正在看"的差别，
 * 而这正是做分派要解决的事；催起来也不知道该催谁。
 */
const pendingStateText = computed(() => {
  const p = pending.value;
  if (!p) return '';
  if (p.status === '评估中') return p.assignee ? `评估中 · ${p.assignee}` : '评估中';
  return '待分派';
});

const reportSectionBadge = computed(() => {
  // 角标跟着卡片上的状态标走，两处写同一个词
  if (pending.value) return pending.value.status;
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

/**
 * 「接管」派生出的新投诉单号。**只有接管才有值** —— 二选一之后评估的产出
 * 要么是一句反馈意见（不升级），要么是一张新单（接管），没有第三种。
 */
const escalatedNo = computed(() => {
  const a = latestAssessed.value?.assessment;
  return a?.decision === '接管' ? (a.escalatedToNo ?? '') : '';
});

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

/**
 * 「接管」派生的新投诉单：站内打开。
 * 【为什么必须可点】接管走的是《【830】》已有的第一跳派生——原单落终态、整页只读，
 * 接下来的事全在新单上。只把单号当文字印出来，报备人还得自己去列表里搜一遍。
 */
function openEscalatedTicket(no: string) {
  router.push(`/tickets/${no}`);
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
      <section v-if="pending" class="rr-sheet rr-sheet-pending" aria-label="当前在队报备">
        <header class="rr-sheet-head">
          <div class="rr-sheet-brand">
            <div class="rr-sheet-title-row">
              <span
                class="rr-pill"
                :class="pending.status === '评估中' ? 'rr-pill-doing' : 'rr-pill-pending'"
              >
                <ClockCircleOutlined />
                {{ pendingStateText }}
              </span>
              <span class="rr-sheet-time">提交于 {{ formatShortAt(pending.at) }}</span>
              <span class="rr-sheet-wait">已等待 {{ waitedText(pending.at) }}</span>
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
          <button v-if="canAssess" type="button" class="rr-assess" @click="openAssess(pending)">
            评估
          </button>
          <button v-else-if="canWithdraw" type="button" class="rr-withdraw" @click="openWithdraw">
            撤回
          </button>
          <!-- 按钮消失得给个理由：不写这一句，报备人只会以为撤回入口自己丢了 -->
          <span v-else-if="pending.status === '评估中'" class="rr-withdraw-locked">
            已分派评估，不可撤回
          </span>
        </header>

        <div class="rr-sheet-body">
          <blockquote class="rr-quote">{{ pending.desc }}</blockquote>
          <ul v-if="pending.attachments.length" class="rr-files">
            <li v-for="f in pending.attachments" :key="f" class="rr-file">
              <PaperClipOutlined />
              <span>{{ f }}</span>
            </li>
          </ul>
          <!--
            报备不落子状态、SLA 不停钟（基线 ※29）。工单本身看不出任何变化，
            这句是它在可见区的**唯一**落点：头部那行只挂 hover title，
            两处都不写的话，处理人会以为报备期间单子冻住了、停下来等结论。
          -->
          <p class="rr-sla-note">评估期间本单照常处理，SLA 不停表</p>
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
        <!-- 撤回是破坏性动作，"记录不删除"是下决心前必须知道的后果，故留一句 -->
        <p class="report-tip">撤回后保留记录，可重新发起。</p>
      </div>
    </OpActionModal>

    <!-- 评估结论：领取后自动打开，或在队卡片点「评估」 -->
    <OpActionModal
      :open="assessOpen"
      title="评估报备"
      :icon="EditOutlined"
      tone="primary"
      :width="520"
      ok-text="提交结论"
      @update:open="assessOpen = $event"
      @ok="confirmAssess"
    >
      <div class="op-form ticket-assess-form">
        <section class="ticket-assess-block">
          <h4 class="ticket-assess-title">评估结论</h4>
          <div class="op-field ticket-assess-dec-field">
            <div class="op-field-h ticket-assess-dec-row">
              <div class="op-label req">评估决策</div>
              <a-radio-group v-model:value="assessDecision" class="ticket-assess-dec-inline">
                <a-radio v-for="d in ASSESS_DECISIONS" :key="d" :value="d">{{ d }}</a-radio>
              </a-radio-group>
            </div>
            <div v-if="missAssessDecision" class="ticket-assess-err ticket-assess-foot">请先选择一个评估决策</div>
            <div v-else-if="assessDecision === '接管'" class="op-hint ticket-assess-foot">
              {{ takeoverHint }}
            </div>
          </div>
          <div class="op-field">
            <div class="op-label req">{{ assessAdviceLabel || '反馈意见' }}</div>
            <a-textarea
              v-model:value="assessAdvice"
              :rows="3"
              :placeholder="assessAdvicePlaceholder || '请先选择评估决策'"
            />
            <div v-if="missAssessAdvice" class="ticket-assess-err">请填写{{ assessAdviceLabel || '反馈意见' }}</div>
          </div>
        </section>
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
        <!--
          结论二选一，**没有风险等级这一档**（N1）——原先并排的等级标已删。
          「接管」的实际产出是一张新投诉单，故头部直接把去向摆出来。
        -->
        <header class="ra-head">
          <span
            class="ra-decision"
            :class="`tone-${decisionTone(latestAssessed.assessment.decision)}`"
          >
            {{ latestAssessed.assessment.decision }}
          </span>
          <!-- 有单号才敢说"已派生"：指不出是哪一张的时候，这句话等于没说 -->
          <span v-if="escalatedNo" class="ra-derive">已派生投诉工单</span>
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
          <div v-if="escalatedNo" class="ra-kv-row">
            <dt>新投诉单</dt>
            <dd>
              <a
                class="ra-link"
                href="javascript:void(0)"
                @click="openEscalatedTicket(escalatedNo)"
              >{{ escalatedNo }}</a>
            </dd>
          </div>
          <div class="ra-kv-row ra-kv-block">
            <dt>{{ adviceLabel(latestAssessed.assessment.decision) }}</dt>
            <dd class="ra-advice">{{ latestAssessed.assessment.advice }}</dd>
          </div>
        </dl>

        <!-- 两个决策的后续走向完全不同，必须写清楚，否则「不升级」看着像"什么都没发生" -->
        <p class="ra-foot">
          <template v-if="latestAssessed.assessment.decision === '接管'">
            本单已由客诉专员接管并升级为投诉工单，原单落「已升级投诉」；后续处理在新单上进行。
          </template>
          <template v-else>
            本单不升级，仍由原处理人按反馈意见继续处理；如后续仍未闭环，可再次发起风险报备。
          </template>
        </p>
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
          风险词命中的**核实结论**：只读回显，不进 form、不参与必填校验。
          （报备评估那一行已删——二选一之后评估不回传风险字段，见 script 内说明。）
        -->
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
/* 评估中：已有人接手，用中性蓝与"还没人接"的橙区分开 */
.rr-pill-doing { color: #1d4ed8; background: #dbeafe; }
.rr-pill-pending :deep(.anticon),
.rr-pill-doing :deep(.anticon) { font-size: 12px; }
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
.rr-assess {
  flex: none;
  padding: 6px 12px;
  font-size: 12px;
  font-weight: 600;
  font-family: inherit;
  color: #1d4ed8;
  background: #eff6ff;
  border: 1px solid #93c5fd;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
}
.rr-assess:hover { background: #dbeafe; border-color: #60a5fa; }
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
.rr-withdraw-locked {
  flex: none;
  padding: 6px 0;
  font-size: 11px;
  color: #9ca3af;
  white-space: nowrap;
}
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
/* SLA 口径行：是背景信息不是要读的内容，压到最轻，不与场景描述抢 */
.rr-sla-note {
  margin: 8px 0 0;
  font-size: 11px;
  color: #9ca3af;
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

/* 辅助说明而非独立信息块，故走小字灰色，不做底色/边框 */
.report-tip {
  margin: 0;
  font-size: 11px;
  line-height: 1.5;
  color: #9ca3af;
}

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
/* 「接管」的去向标：沿用等级标原来的位置与配色，说的是"派生了新单"而不是"多危险" */
.ra-derive {
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
.ra-link:hover { text-decoration: underline; }
.ra-foot {
  margin: 0;
  padding: 8px 14px 12px;
  font-size: 11px;
  line-height: 1.6;
  color: #6b7280;
  border-top: 1px dashed #f1f5f9;
}
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

/* ---- 评估结论弹窗（领取后自动打开） ---- */
.ticket-assess-form { gap: 12px !important; }
.ticket-assess-block {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  background: #fff;
}
.ticket-assess-title {
  margin: 0;
  font-size: 13px;
  font-weight: 700;
  color: #111827;
}
.ticket-assess-dec-row {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 10px;
  margin: 0;
}
.ticket-assess-dec-row > .op-label {
  flex: none;
  width: 72px;
  text-align: right;
  white-space: nowrap;
}
.ticket-assess-dec-inline {
  display: inline-flex !important;
  flex: 1;
  flex-wrap: nowrap;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.ticket-assess-dec-inline :deep(.ant-radio-wrapper) {
  margin: 0 !important;
  padding: 6px 12px;
  border: 1.5px solid #e5e7eb;
  border-radius: 8px;
  background: #fff;
  line-height: 1.45;
  font-size: 12px;
  white-space: nowrap;
  align-items: center;
}
.ticket-assess-dec-inline :deep(.ant-radio-wrapper-checked) {
  border-color: #1a6fff;
  background: #eff6ff;
}
.ticket-assess-dec-inline :deep(.ant-radio) { margin-top: 0; top: 0; }
.ticket-assess-foot { margin-left: calc(72px + 10px); margin-top: 4px; }
.ticket-assess-err {
  margin-top: 4px;
  font-size: 11px;
  color: #ef4444;
  line-height: 1.4;
}
</style>
