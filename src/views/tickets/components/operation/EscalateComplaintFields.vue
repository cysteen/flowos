<script setup lang="ts">
import FormSelect from '@/views/tickets/components/create-ticket/FormSelect.vue';
import type { EscalateComplaintFieldsCtl } from '@/composables/useEscalateComplaintFields';

/**
 * 风险评估选「升级」后出现的**投诉工单专属字段**段落：
 * 投诉一类 / 投诉二类 / 升级说明三项，均必填，升级说明排在两项分类之后、段内最后一项。
 *
 * 「升级说明」此前是三个宿主弹窗各摆一个的独立字段，现已并进本段；它的值仍存在
 * `useEscalateComplaintFields` 的 `fields.advice` 上（宿主选「不升级」时同一个格子
 * 改叫「反馈意见」、由宿主自己那一格渲染），三处不各存一份。
 *
 * 🔴 **三个评估入口共用这一个组件**：工单页底栏「风险评估」（`OpRiskAssessModal`）、
 * 风险监控页评估工作面（`views/ops-monitor/RiskMonitorView.vue`）、
 * 风险报备池（`components/RiskReportPoolPanel.vue`）。字段、顺序、级联与红字提示只在这里改。
 *
 * 取值域、级联与校验全在 `composables/useEscalateComplaintFields.ts`，
 * 本组件只渲染：`ctl` 是那个 composable 的实例，三处各持一份状态、共用同一套规则。
 *
 * 样式**自带、不依赖外层**：三个宿主弹窗的类名各不相同（.op-field / .assess-* / .af-*），
 * 借外层的类会让同一段字段在三处长得不一样。
 */
defineProps<{ ctl: EscalateComplaintFieldsCtl }>();
</script>

<template>
  <section class="ecf" aria-label="投诉工单专属字段">
    <h4 class="ecf-title">投诉工单专属字段</h4>

    <!-- 投诉一类 / 二类：两项必填（级联取建单弹窗同一份分类树） -->
    <div class="ecf-grid">
      <div class="ecf-field">
        <label class="ecf-label"><span class="ecf-req">*</span>投诉一类</label>
        <FormSelect
          v-model:value="ctl.fields.complaintL1"
          class="ecf-control"
          :status="ctl.errors.complaintL1 ? 'error' : ''"
          :options="ctl.complaintL1Options.value"
          placeholder="请选择投诉一类"
        />
        <p v-if="ctl.errors.complaintL1" class="ecf-err">{{ ctl.errors.complaintL1 }}</p>
      </div>
      <div class="ecf-field">
        <label class="ecf-label"><span class="ecf-req">*</span>投诉二类</label>
        <FormSelect
          v-model:value="ctl.fields.complaintL2"
          class="ecf-control"
          :status="ctl.errors.complaintL2 ? 'error' : ''"
          :options="ctl.complaintL2Options.value"
          placeholder="请选择投诉二类"
        />
        <p v-if="ctl.errors.complaintL2" class="ecf-err">{{ ctl.errors.complaintL2 }}</p>
      </div>
    </div>

    <!-- 升级说明：段内最后一项，必填。整行占满，不进上面那张两列栅格 -->
    <div class="ecf-field">
      <label class="ecf-label"><span class="ecf-req">*</span>升级说明</label>
      <a-textarea
        v-model:value="ctl.fields.advice"
        :rows="3"
        placeholder="写清升级理由与后续处置安排…"
      />
      <p v-if="ctl.errors.advice" class="ecf-err">{{ ctl.errors.advice }}</p>
    </div>
  </section>
</template>

<style scoped>
.ecf {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 14px 14px;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  background: #fff;
}
.ecf-title {
  margin: 0;
  font-size: 13px;
  font-weight: 700;
  color: #111827;
}
/* 两列栅格，窄弹窗下自动落成一列 */
.ecf-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 10px 12px;
}
.ecf-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.ecf-label {
  font-size: 12px;
  color: #6b7280;
  line-height: 1.4;
}
.ecf-req {
  margin-right: 2px;
  color: #ef4444;
}
.ecf-control { width: 100%; }
.ecf-err {
  margin: 0;
  font-size: 11px;
  color: #ef4444;
  line-height: 1.4;
}
</style>
