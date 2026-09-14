<script setup lang="ts">
import { computed, watch } from 'vue';
import { message } from 'ant-design-vue';
import { EditOutlined } from '@ant-design/icons-vue';
import OpActionModal from './OpActionModal.vue';
import RiskAssessSheet from './RiskAssessSheet.vue';
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
  escalateHint,
  assessOthers,
  openAssess,
  confirmAssess,
} = useRiskReportAssess();

/** 本单**未出结论**的那条条目（至多一条：同单在队至多一条，基线 ※29） */
const target = computed<RiskPoolItem | null>(
  () => reportStore.reportsOf(props.ticketNo).find((r) => isOpenStatus(r.status)) ?? null,
);

/**
 * 打开：先把条目领到自己名下（已在自己名下的跳过这一步），再弹表单。
 *
 * 领取会往 `assessArrivalTicket` 写一笔（那是"领取后跳工单页自动弹评估"用的信号），
 * 这里**当场消费掉**——否则工单页「风险报备」Tab 会收到同一个信号再弹一次，
 * 屏幕上叠出两个一模一样的评估弹窗。
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

/** 内部表单关掉时把外部 open 一并收回，两个开关不能各走各的 */
watch(assessOpen, (v) => {
  if (!v && props.open) emit('update:open', false);
});

const adviceLabel = computed(() => adviceLabelOf(assessDecision.value));
const advicePlaceholder = computed(() => advicePlaceholderOf(assessDecision.value));

/**
 * 标题按条目所属的线取：A 线（风险工单池条目）「风险评估」、B 线（报备单）「评估报备」，
 * 与风险报备池、工单 Tab 在队卡两处评估弹窗的叫法对齐。
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
    ok-text="提交结论"
    @update:open="assessOpen = $event"
    @ok="confirmAssess"
  >
    <div class="op-form ticket-assess-form">
      <!--
        ① 第一区块（入池依据 / 报备信息 + 释放记录 + 「本单另有」底栏）：与风险监控页评估弹窗共用 RiskAssessSheet。
        「本单另有」取 composable 的 assessOthers（riskOthersOf，三个评估入口同源）。
      -->
      <RiskAssessSheet v-if="assessTarget" :target="assessTarget" :others="assessOthers" />

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
        <div class="op-field">
          <div class="op-label req">{{ adviceLabel }}</div>
          <a-textarea
            v-model:value="assessAdvice"
            :rows="3"
            :placeholder="advicePlaceholder"
          />
          <div v-if="missAssessAdvice" class="ticket-assess-err">请填写{{ adviceLabel }}</div>
        </div>
      </section>
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
