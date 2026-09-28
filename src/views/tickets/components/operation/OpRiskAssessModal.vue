<script setup lang="ts">
import { computed, onMounted, watch } from 'vue';
import { message } from 'ant-design-vue';
import { EditOutlined } from '@ant-design/icons-vue';
import OpActionModal from './OpActionModal.vue';
import RiskAssessSheet from './RiskAssessSheet.vue';
// 选「升级」后那一段投诉专属建单要素（投诉一类 / 二类）：与风险监控页、风险报备池
// 另外两处评估弹窗共用同一个组件
import EscalateComplaintFields from './EscalateComplaintFields.vue';
import { useRiskReportAssess } from '@/composables/useRiskReportAssess';
import { useRiskPoolStore } from '@/stores/riskPool';
import { useRiskReportStore } from '@/stores/riskReports';
import { useUserStore } from '@/stores/user';
import {
  REPORT_SOURCE,
  isOpenStatus,
  type RiskPoolItem,
} from '@/stores/riskShared';
import {
  adviceLabelOf,
  advicePlaceholderOf,
  decisionText,
} from './OpRiskDecision';

/**
 * **风险评估**（底栏那一枚按钮的第二形态，基线 ※29）。
 *
 * 出现条件是"本单有**未出结论的非投诉单条目**"，条件由工单页算好（`showRiskReport`），
 * 本组件只负责：把那条条目**领过来**（若还没人领）→ 弹评估表单 → 提交结论。
 *
 * 🔴 **入口里没有「分派」这一步**（2026-09-10 拍板，「分派」一词整体作废）：两个池的条目
 * 只有「领取」，谁领谁办。从工单页进来的客诉专员就是那个要办的人，故这里**先自动领取
 * 再弹表单** —— 让他先跑一趟风险监控页点「领取」再回来，是把一次点击拆成三次页面跳转。
 */
const props = defineProps<{
  open: boolean;
  ticketNo: string;
  ticketTitle?: string;
}>();

const emit = defineEmits<{ 'update:open': [v: boolean] }>();

const user = useUserStore();
const pool = useRiskPoolStore();
const reportStore = useRiskReportStore();
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
const target = computed<RiskPoolItem | null>(
  () => reportStore.reportsOf(props.ticketNo).find((r) => isOpenStatus(r.status)) ?? null,
);

/**
 * 打开：先把条目领到自己名下（已在自己名下的跳过这一步），再弹表单。
 *
 * 领取会往 `assessArrivalTicket` 写一笔（那是"领取后跳工单页自动弹评估"用的信号），
 * 这里**当场消费掉**——那张票此刻已经兑现（人就站在评估表单前面），留着它
 * 只会让 `tryAssessArrival` 再走一遍同样的路。
 */
watch(
  () => props.open,
  (v) => {
    if (!v) return;
    const t = target.value;
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
 * 判据与人点底栏那条路一致 —— 只对**已在自己名下的在队条目**开（`canAssessReport`）；
 * 条目已被别人领走、或已被释放退回池里的，票照样烧掉但什么都不弹。
 *
 * 🔴 **这段原先住在工单页「风险报备」Tab 里**、开的是那个 Tab 自持的评估弹窗。
 * 该 Tab 已退回纯读（2026-09-28 裁决：在队卡「评估」按钮与 Tab 自持的弹窗整块删除），
 * 故整段搬到底栏这个弹窗自己身上 —— 工单页的评估只剩这一个落点，两处不会再各弹一个。
 * 也因此它**只在本组件挂载时才成立**：本组件的出现条件是「非投诉单 + 客诉专员」
 * （`resolveRiskActionForm` 判出 assess 形态），管理员兜底领取的那条路评估入口在池内，
 * 不在工单页。
 */
function tryAssessArrival() {
  if (!reportStore.consumeAssessArrival(props.ticketNo)) return;
  const t = target.value;
  if (!t || !canAssessReport(t, user.name)) return;
  openAssess(t);
}

watch(() => props.ticketNo, tryAssessArrival);
watch(target, tryAssessArrival);
onMounted(tryAssessArrival);

/** 内部表单关掉时把外部 open 一并收回，两个开关不能各走各的 */
watch(assessOpen, (v) => {
  if (!v && props.open) emit('update:open', false);
});

const adviceLabel = computed(() => adviceLabelOf(assessDecision.value));
const advicePlaceholder = computed(() => advicePlaceholderOf(assessDecision.value));

/**
 * 标题按条目所属的线取：A 线（风险工单池条目）「风险评估」、B 线（报备单）「评估报备」，
 * 与风险报备池、风险监控页两处评估弹窗的叫法对齐。
 */
const modalTitle = computed(() => (assessTarget.value?.source === REPORT_SOURCE ? '评估报备' : '风险评估'));
</script>

<template>
  <OpActionModal
    :open="assessOpen"
    :title="modalTitle"
    :icon="EditOutlined"
    tone="primary"
    :width="600"
    :ok-text="assessOkText"
    @update:open="assessOpen = $event"
    @ok="confirmAssess"
  >
    <div class="op-form ticket-assess-form">
      <!-- ① 第一区块（入池依据 / 报备信息 + 释放记录）：与风险监控页评估弹窗共用 RiskAssessSheet -->
      <RiskAssessSheet v-if="assessTarget" :target="assessTarget" />

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
        ② 投诉工单专属字段：选「升级」（且会派生新投诉单）时才出。
        投诉一类 / 二类 / 升级说明三项、均必填；切到「不升级」整段隐藏、已填值保留。
      -->
      <EscalateComplaintFields v-if="showEscalateFields" :ctl="escalateFields" />
    </div>
  </OpActionModal>
</template>

<style scoped>
.ticket-assess-form { gap: 10px !important; }
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
