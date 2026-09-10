<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { WarningOutlined } from '@ant-design/icons-vue';
import OpActionModal from './OpActionModal.vue';
import OpTextareaAttach from './shared/OpTextareaAttach.vue';
import OpRiskAssessModal from './OpRiskAssessModal.vue';
import OpRiskCollabModal from './OpRiskCollabModal.vue';
import {
  REPORT_REASONS,
  RISK_CATEGORIES,
  type ReportReason,
  type RiskCategory,
} from '@/stores/riskReports';
import { useUserStore } from '@/stores/user';
import { resolveRiskActionForm } from '@/views/tickets/composables/opActionRegistry';
import { resolveTicketTypeFor } from '@/views/tickets/composables/opActions';

/**
 * 底部操作条上那**一枚**风险按钮点开的东西（基线 ※29）。
 *
 * 🔴 **一枚按钮 + 一次形态判定**：按钮位只有一个（`opActionRegistry` 的 `风险报备` 那一格），
 * 判定出哪一种形态，就渲染哪一个弹窗 —— 报备形态是本文件自己这一份表单，
 * 评估与协同两形态各交给一个子组件。**不要因为「协同处理」进了动作矩阵就在按钮位上再开一枚**：
 * 三种形态按角色与类型互斥地占用同一格，同一个人在同一张单上只会见到其中一种。
 *
 * 判定用的角色与类型从登录态与工单数据现取，与底栏那一格算文案时走的是**同一个函数**
 * （`resolveRiskActionForm`）—— 两处各判各的，迟早出现"按钮写着协同处理、点开是报备表单"。
 */
const props = defineProps<{
  open: boolean;
  ticketNo: string;
  ticketTitle?: string;
}>();

const user = useUserStore();
/** 工单类型从工单库现取：底栏没有把它透下来，而形态判定的第二维就是它 */
const ticketType = computed(() => resolveTicketTypeFor(props.ticketNo));
const riskForm = computed(() => resolveRiskActionForm(user.roleKey, ticketType.value)?.form ?? null);

const emit = defineEmits<{
  'update:open': [v: boolean];
  submit: [payload: {
    reason: ReportReason;
    category: RiskCategory | null;
    desc: string;
    attachments: string[];
  }];
}>();

const reason = ref<ReportReason | undefined>(undefined);
const category = ref<RiskCategory | undefined>(undefined);
const desc = ref('');
const attachments = ref<string[]>([]);
const triedSubmit = ref(false);

const reasonOptions = REPORT_REASONS.map((v) => ({ value: v, label: v }));
const categoryOptions = RISK_CATEGORIES.map((v) => ({ value: v, label: v }));
const showCategory = computed(() => reason.value === '风险场景');

watch(
  () => props.open,
  (v) => {
    if (!v) return;
    reason.value = undefined;
    category.value = undefined;
    desc.value = '';
    attachments.value = [];
    triedSubmit.value = false;
  },
);

watch(reason, (v) => {
  if (v !== '风险场景') category.value = undefined;
});

const missReason = computed(() => triedSubmit.value && !reason.value);
const missCategory = computed(() => triedSubmit.value && showCategory.value && !category.value);
const missDesc = computed(() => triedSubmit.value && !desc.value.trim());

const canSubmit = computed(
  () => !!reason.value && (!showCategory.value || !!category.value) && !!desc.value.trim(),
);

function close() {
  emit('update:open', false);
}

function onOk() {
  triedSubmit.value = true;
  if (!canSubmit.value || !reason.value) return;
  emit('submit', {
    reason: reason.value,
    category: showCategory.value ? (category.value ?? null) : null,
    desc: desc.value.trim(),
    attachments: [...attachments.value],
  });
  close();
}
</script>

<template>
  <!-- 评估形态：非投诉单 + 客诉专员。领取本单在队条目并给结论（升级 / 不升级） -->
  <OpRiskAssessModal
    v-if="riskForm === 'assess'"
    :open="open"
    :ticket-no="ticketNo"
    :ticket-title="ticketTitle"
    @update:open="emit('update:open', $event)"
  />

  <!-- 协同形态：投诉单 + 客诉专员。评估意见 + 建议事项，状态与处理人不变 -->
  <OpRiskCollabModal
    v-else-if="riskForm === 'collab'"
    :open="open"
    :ticket-no="ticketNo"
    :ticket-title="ticketTitle"
    @update:open="emit('update:open', $event)"
  />

  <OpActionModal
    v-else
    :open="open"
    title="风险报备"
    :icon="WarningOutlined"
    tone="warn"
    :width="480"
    ok-text="提交报备"
    :ok-disabled="triedSubmit && !canSubmit"
    @update:open="emit('update:open', $event)"
    @ok="onOk"
    @cancel="close"
  >
    <div class="op-form">
      <p v-if="ticketNo" class="rr-sub">
        工单 {{ ticketNo }}<template v-if="ticketTitle"> · {{ ticketTitle }}</template>
      </p>

      <div class="form-row-pair">
        <div class="pair-field">
          <div class="op-label req">报备原因</div>
          <a-select
            v-model:value="reason"
            placeholder="请选择报备原因"
            allow-clear
            style="width: 100%"
            :status="missReason ? 'error' : undefined"
            :options="reasonOptions"
          />
        </div>
        <div v-if="showCategory" class="pair-field">
          <div class="op-label req">风险类型</div>
          <a-select
            v-model:value="category"
            placeholder="请选择风险类型"
            allow-clear
            style="width: 100%"
            :status="missCategory ? 'error' : undefined"
            :options="categoryOptions"
          />
        </div>
      </div>
      <p v-if="missReason" class="field-err">请选择报备原因</p>
      <p v-if="showCategory && missCategory" class="field-err">请选择风险类型</p>

      <div class="op-field">
        <div class="op-label req">场景描述</div>
        <OpTextareaAttach
          :model-value="desc"
          :attachments="attachments"
          :min-input-height="72"
          placeholder="详细说明触发报备的具体情况…"
          @update:model-value="desc = $event"
          @update:attachments="attachments = $event"
        />
        <p v-if="missDesc" class="field-err">请填写场景描述</p>
      </div>
    </div>
  </OpActionModal>
</template>

<style scoped>
.rr-sub {
  margin: 0 0 4px;
  font-size: 12px;
  color: #6b7280;
  line-height: 1.5;
}
.form-row-pair {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}
.pair-field {
  flex: 1 1 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.field-err {
  margin: -4px 0 0;
  font-size: 11px;
  color: #ef4444;
  line-height: 1.3;
}
</style>
