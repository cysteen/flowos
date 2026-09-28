<script setup lang="ts">
import { computed, onMounted, watch } from 'vue';
import { message } from 'ant-design-vue';
import { SafetyCertificateOutlined } from '@ant-design/icons-vue';
import OpActionModal from './OpActionModal.vue';
import RiskAssessSheet from './RiskAssessSheet.vue';
// 选「升级」后那一段投诉专属建单要素（投诉一类 / 投诉二类）：与风险监控页、风险报备池
// 另外两处评估弹窗共用同一个组件
import EscalateComplaintFields from './EscalateComplaintFields.vue';
// 投诉支那三项（评估意见 / 建议事项 /「其他」的具体建议）：与风险工单池的协同处理弹窗共用同一份
import RiskCollabFields from './RiskCollabFields.vue';
import { useRiskReportAssess } from '@/composables/useRiskReportAssess';
import { useRiskCollabFields } from '@/composables/useRiskCollabFields';
import { useRiskPoolStore } from '@/stores/riskPool';
import { useRiskReportStore } from '@/stores/riskReports';
import { useUserStore } from '@/stores/user';
import {
  REPORT_SOURCE,
  isOpenStatus,
  isPooledStatus,
  type RiskPoolItem,
} from '@/stores/riskShared';
import {
  adviceLabelOf,
  advicePlaceholderOf,
  decisionText,
} from './OpRiskDecision';

/**
 * **风险管控** —— 工单处理页**页头右上角**那一枚按钮点开的东西（「新建补充」旁）。
 *
 * 🔴 **一枚按钮 + 一个弹窗，内容按原单类型分岔**（基线 ※29 按原单类型分形态）：
 * - **非投诉单** → 第一区块（入池依据 / 报备信息）+「评估结论」段（升级 / 不升级，
 *   选「升级」再接出投诉工单专属字段）。点开时若那条条目还没人领，**先自动领到自己名下**。
 * - **投诉单** → 第一区块 +「协同处理」段（评估意见 / 建议事项 /「其他」的具体建议）。
 *
 * 两支的字段、校验、派生、落库、通知与履历**一律沿用原来那两个弹窗的规格**，
 * 本组件只做入口与组装：评估那一段走 `useRiskReportAssess` + `EscalateComplaintFields`，
 * 协同那一段走 `useRiskCollabFields` + `RiskCollabFields`（与风险工单池那个弹窗同一份）。
 *
 * 🔴 **它落在页头而不是底栏**：这是**非处理人**（客诉专员 / 管理员）的权限，
 * 底栏那一排是本单处理人的流转动作。底栏只剩「风险报备」那一种形态。
 *
 * 标题恒为「风险管控」，来源（实时监控 / 重点工单 / 二线报备）与单号写在**副标题**上 ——
 * 原「风险评估」「评估报备」「协同处理」三个弹窗标题在本页不再出现。
 */
const props = defineProps<{
  open: boolean;
  ticketNo: string;
  /** 原单类型。分岔的第一维，由工单页给（页头按钮的出现条件判的是同一个值） */
  ticketType: string;
}>();

const emit = defineEmits<{ 'update:open': [v: boolean] }>();

const user = useUserStore();
const pool = useRiskPoolStore();
const reportStore = useRiskReportStore();

const isComplaint = computed(() => props.ticketType === '投诉');

/* ---------------- 非投诉支：评估结论（原「风险评估」形态，规格一格未动） ---------------- */

const {
  ASSESS_DECISIONS,
  assessOpen,
  assessTarget,
  assessDecision,
  assessAdvice,
  missAssessDecision,
  missAssessAdvice,
  assessOkText,
  escalateHint,
  escalateFields,
  showEscalateFields,
  openAssess,
  confirmAssess,
  canAssessReport,
} = useRiskReportAssess();

/** 本单**未出结论**的那条条目（至多一条：同单在队至多一条，基线 ※29） */
const openItem = computed<RiskPoolItem | null>(
  () => reportStore.reportsOf(props.ticketNo).find((r) => isOpenStatus(r.status)) ?? null,
);

/**
 * 打开（非投诉支）：先把条目领到自己名下（已在自己名下的跳过这一步），再弹表单。
 *
 * 领取会往 `assessArrivalTicket` 写一笔（那是"领取后跳工单页自动弹评估"用的信号），
 * 这里**当场消费掉**——那张票此刻已经兑现（人就站在表单前面），留着它
 * 只会让 `tryAssessArrival` 再走一遍同样的路。
 */
watch(
  () => props.open,
  (v) => {
    if (!v) return;
    if (isComplaint.value) {
      collab.reset();
      return;
    }
    const t = openItem.value;
    if (!t) {
      message.warning('本单没有待评估的风险条目');
      emit('update:open', false);
      return;
    }
    // 存储值仍是「待分派」，界面写「待领取」（改名归风险 store 那一路，见 OpRiskDecision.ts）
    if (t.status === '待分派') {
      // 第三个实参是**领取那一刻的实际角色**，落在 `risk.report.claimed` 的正文落款上
      // （`riskPool.notifyClaimed`：不写死「客诉专员」，管理员兜底领取是常规路径）
      pool.claim(t.id, user.name || '当前用户', user.role.name);
      reportStore.consumeAssessArrival(props.ticketNo);
    }
    if (t.assignee !== (user.name || '当前用户')) {
      message.warning(`本条已由 ${t.assignee} 领取，请由领取人给出结论`);
      emit('update:open', false);
      return;
    }
    openAssess(t);
  },
);

/**
 * 从风险报备池 / 风险监控页**领取后跳到这张单**时自动把评估表单弹出来（《【930】》O18）。
 *
 * 信号是 `claim` 埋下的 `assessArrivalTicket`（`stores/riskPool.ts`），一次性票：
 * **消费掉就不再补第二次**，它是"这一跳"的连带，不是条目的属性；释放时由 `release` 撤票。
 * 判据与人点页头那条路一致 —— 只对**已在自己名下的在队条目**开（`canAssessReport`）；
 * 条目已被别人领走、或已被释放退回池里的，票照样烧掉但什么都不弹。
 *
 * 只对**非投诉支**成立：投诉单不做风险评估，池里那条走协同处理，没有"领取"这一步。
 */
function tryAssessArrival() {
  if (isComplaint.value) return;
  if (!reportStore.consumeAssessArrival(props.ticketNo)) return;
  const t = openItem.value;
  if (!t || !canAssessReport(t, user.name)) return;
  openAssess(t);
}

watch(() => props.ticketNo, tryAssessArrival);
watch(openItem, tryAssessArrival);
onMounted(tryAssessArrival);

/** 内部表单关掉时把外部 open 一并收回，两个开关不能各走各的（非投诉支） */
watch(assessOpen, (v) => {
  if (!v && props.open && !isComplaint.value) emit('update:open', false);
});

const adviceLabel = computed(() => adviceLabelOf(assessDecision.value));
const advicePlaceholder = computed(() => advicePlaceholderOf(assessDecision.value));

/* ---------------- 投诉支：协同处理（规格一格未动，字段与落库走共享件） ---------------- */

const collab = useRiskCollabFields();

/** 本单在**风险工单池**里的那条 A 线条目（一张单至多一条，《【930】》§3.1） */
const poolItem = computed<RiskPoolItem | null>(
  () => reportStore
    .reportsOf(props.ticketNo)
    .find((r) => r.source !== REPORT_SOURCE && isPooledStatus(r.status)) ?? null,
);

function onCollabOk() {
  if (collab.submitTo(props.ticketNo)) emit('update:open', false);
}

/* ---------------- 两支共用的壳：开关 / 副标题 / 主按钮 ---------------- */

/** 投诉支直接用外部 open；非投诉支由 `useRiskReportAssess` 的 `assessOpen` 管（先领取再弹） */
const modalOpen = computed(() => (isComplaint.value ? props.open : assessOpen.value));

function setOpen(v: boolean) {
  if (isComplaint.value) emit('update:open', v);
  else assessOpen.value = v;
}

/** 第一区块读的那条条目：投诉支＝池内 A 线条目，非投诉支＝正在评的那一条 */
const sheetTarget = computed<RiskPoolItem | null>(
  () => (isComplaint.value ? poolItem.value : assessTarget.value),
);

/**
 * 副标题 ＝ **来源 · 单号**（如「二线报备 · IFLYZX-…」/「实时监控 · IFLYZX-…」）。
 * 来源取条目自带的 `source`，不另造词；条目一时取不到就只写单号。
 */
const subtitle = computed(() => {
  const src = sheetTarget.value?.source;
  return src ? `${src} · ${props.ticketNo}` : props.ticketNo;
});

/** 主按钮：投诉支「提交」；非投诉支沿用评估那一套（升级 →「确认升级」，其余「提交结论」） */
const okText = computed(() => (isComplaint.value ? '提交' : assessOkText.value));

function onOk() {
  if (isComplaint.value) onCollabOk();
  else confirmAssess();
}
</script>

<template>
  <OpActionModal
    :open="modalOpen"
    title="风险管控"
    :subtitle="subtitle"
    :icon="SafetyCertificateOutlined"
    tone="primary"
    :width="600"
    :ok-text="okText"
    @update:open="setOpen($event)"
    @ok="onOk"
  >
    <div class="op-form risk-control-form">
      <!-- ① 第一区块（入池依据 / 报备信息 + 释放记录）：与风险监控页评估弹窗共用 RiskAssessSheet -->
      <RiskAssessSheet v-if="sheetTarget" :target="sheetTarget" />

      <!-- ② 投诉单：协同处理段（评估意见 / 建议事项 /「其他」的具体建议） -->
      <RiskCollabFields v-if="isComplaint" :ctl="collab" />

      <!-- ② 非投诉单：评估结论段（升级 / 不升级） -->
      <template v-else>
        <section class="ticket-assess-block">
          <h4 class="ticket-assess-title">评估结论</h4>
          <div class="op-field ticket-assess-dec-field">
            <div class="op-field-h ticket-assess-dec-row">
              <div class="op-label req">评估决策</div>
              <a-radio-group v-model:value="assessDecision" class="ticket-assess-dec-inline">
                <!-- 值取 store 的枚举、字取界面词：改词与改枚举不是同一次改动，见 OpRiskDecision.ts -->
                <a-radio v-for="d in ASSESS_DECISIONS" :key="d" :value="d">{{ decisionText(d) }}</a-radio>
              </a-radio-group>
            </div>
            <div v-if="missAssessDecision" class="ticket-assess-err ticket-assess-foot">请先选择一个评估决策</div>
            <!--
              选「升级」后才出现的分流提示（O20）：它是"你点下去会立刻发生什么"，
              且**按原单类型给的是两种完全相反的后果**，是做决策所必需的一行。
            -->
            <div
              v-else-if="assessDecision === '升级'"
              class="ticket-assess-hint ticket-assess-foot"
            >{{ escalateHint }}</div>
          </div>
          <!--
            结论正文那一格。选「升级」（且会派生新投诉单）时它并进下面那一段、改由段内的
            「升级说明」渲染，故本格只在**段不出**时出（写「反馈意见」，或投诉单那一支的
            「升级说明」）—— 两处渲染的是同一个格子（assessAdvice 代理 escalateFields.fields.advice）。
          -->
          <div v-if="!showEscalateFields" class="op-field">
            <div class="op-label req">{{ adviceLabel }}</div>
            <a-textarea
              v-model:value="assessAdvice"
              :rows="3"
              :placeholder="advicePlaceholder"
            />
            <div v-if="missAssessAdvice" class="ticket-assess-err">请填写{{ adviceLabel }}</div>
          </div>
        </section>

        <!--
          ③ 投诉工单专属字段：选「升级」（且会派生新投诉单）时才出。
          投诉一类 / 二类 / 升级说明三项、均必填；切到「不升级」整段隐藏、已填值保留。
        -->
        <EscalateComplaintFields v-if="showEscalateFields" :ctl="escalateFields" />
      </template>
    </div>
  </OpActionModal>
</template>

<style scoped>
.risk-control-form { gap: 10px !important; }
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
/* 分流提示：与校验错误同一行位，但它讲的是后果不是错误，故取中性灰而非红 */
.ticket-assess-hint {
  margin-top: 4px;
  font-size: 11px;
  color: #6b7280;
  line-height: 1.5;
}
</style>
