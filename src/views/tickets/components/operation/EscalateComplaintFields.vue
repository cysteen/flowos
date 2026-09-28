<script setup lang="ts">
import { CloseOutlined, PlusOutlined } from '@ant-design/icons-vue';
import FormSelect from '@/views/tickets/components/create-ticket/FormSelect.vue';
import type { EscalateComplaintFieldsCtl } from '@/composables/useEscalateComplaintFields';

/**
 * 风险评估选「升级」后出现的**投诉工单专属字段**段落（排在「升级说明」之后）。
 *
 * 🔴 **三个评估入口共用这一个组件**：工单页底栏「风险评估」（`OpRiskAssessModal`）、
 * 风险监控页评估工作面（`views/ops-monitor/RiskMonitorView.vue`）、
 * 风险报备池（`components/RiskReportPoolPanel.vue`）。字段、顺序、级联与红字提示只在这里改。
 *
 * 取值域、级联、显隐判据与校验全在 `composables/useEscalateComplaintFields.ts`，
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

    <!-- 投诉一类 / 二类：恒出、必填（级联取建单弹窗同一份分类树） -->
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

    <!--
      渠道台账那一组：原单来源 ∈ 内投渠道 / 外投渠道 才出（与建单弹窗同一条判据）。
      热线 / IM / 小程序等来源的原单整段不出，也不参与校验。
    -->
    <template v-if="ctl.showChannelFields.value">
      <!-- 投诉平台 + 投诉编号：成对多组；原单为外投时首组必填 -->
      <div class="ecf-field">
        <label class="ecf-label">
          <span v-if="ctl.externalOrigin.value" class="ecf-req">*</span>投诉平台 / 编号
        </label>
        <div class="ecf-plat-group">
          <div
            v-for="(row, i) in ctl.fields.platforms"
            :key="`ecf-plat-${i}`"
            class="ecf-plat-row"
          >
            <FormSelect
              v-model:value="row.platform"
              class="ecf-plat-cell"
              :status="i === 0 && ctl.errors.platform ? 'error' : ''"
              :options="ctl.platformOptions.value"
              placeholder="投诉平台"
            />
            <a-input
              v-if="row.platform === ctl.CUSTOM_PLATFORM_OPTION"
              v-model:value="row.customPlatform"
              class="ecf-plat-cell"
              :status="ctl.errors.customPlatform ? 'error' : ''"
              placeholder="填写平台名称"
            />
            <a-input
              v-model:value="row.complaintNo"
              class="ecf-plat-cell"
              :status="i === 0 && ctl.errors.complaintNo ? 'error' : ''"
              :placeholder="ctl.externalOrigin.value ? '投诉编号' : '投诉编号，可留空'"
            />
            <button
              type="button"
              class="ecf-plat-del"
              title="移除该组"
              :disabled="ctl.fields.platforms.length === 1 && !row.platform"
              @click="ctl.removePlatform(i)"
            >
              <CloseOutlined />
            </button>
          </div>
          <button type="button" class="ecf-plat-add" @click="ctl.addPlatform()">
            <PlusOutlined />添加平台
          </button>
        </div>
        <p v-if="ctl.errors.platform" class="ecf-err">{{ ctl.errors.platform }}</p>
        <p v-if="ctl.errors.complaintNo" class="ecf-err">{{ ctl.errors.complaintNo }}</p>
        <p v-if="ctl.errors.customPlatform" class="ecf-err">{{ ctl.errors.customPlatform }}</p>
      </div>

      <div class="ecf-grid">
        <div class="ecf-field">
          <label class="ecf-label"><span class="ecf-req">*</span>投诉类型</label>
          <FormSelect
            v-model:value="ctl.fields.complaintType"
            class="ecf-control"
            :status="ctl.errors.complaintType ? 'error' : ''"
            :options="ctl.complaintTypeOptions.value"
            placeholder="请选择投诉类型"
          />
          <p v-if="ctl.errors.complaintType" class="ecf-err">{{ ctl.errors.complaintType }}</p>
        </div>
        <div class="ecf-field">
          <label class="ecf-label"><span class="ecf-req">*</span>归属业务线</label>
          <FormSelect
            v-model:value="ctl.fields.businessLine"
            class="ecf-control"
            :status="ctl.errors.businessLine ? 'error' : ''"
            :options="ctl.businessLineOptions.value"
            placeholder="请选择归属业务线"
          />
          <p v-if="ctl.errors.businessLine" class="ecf-err">{{ ctl.errors.businessLine }}</p>
        </div>
        <div class="ecf-field">
          <label class="ecf-label"><span class="ecf-req">*</span>前期是否反馈</label>
          <FormSelect
            v-model:value="ctl.fields.priorFeedback"
            class="ecf-control"
            :status="ctl.errors.priorFeedback ? 'error' : ''"
            :options="ctl.priorFeedbackOptions.value"
            placeholder="请选择前期是否反馈"
          />
          <p v-if="ctl.errors.priorFeedback" class="ecf-err">{{ ctl.errors.priorFeedback }}</p>
        </div>
        <div class="ecf-field">
          <label class="ecf-label">投诉接收时间</label>
          <a-date-picker
            v-model:value="ctl.fields.complaintReceiveTime"
            class="ecf-control"
            :show-time="{ format: 'HH:mm' }"
            format="YYYY-MM-DD HH:mm"
            value-format="YYYY-MM-DD HH:mm"
            placeholder="请选择接收时间"
          />
        </div>
      </div>

      <!-- 服务回溯是自由文本、篇幅长，独占整行收尾（与建单弹窗同一摆法） -->
      <div class="ecf-field">
        <label class="ecf-label">服务回溯</label>
        <a-textarea
          v-model:value="ctl.fields.serviceReview"
          class="ecf-control"
          placeholder="手动填写回溯说明"
          :auto-size="{ minRows: 2, maxRows: 6 }"
        />
      </div>
    </template>
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
/* 投诉平台 / 编号：成对多组，一组一行 */
.ecf-plat-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.ecf-plat-row {
  display: flex;
  align-items: center;
  gap: 6px;
}
.ecf-plat-cell {
  flex: 1;
  min-width: 0;
}
.ecf-plat-del {
  flex: none;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 1px solid #e5e7eb;
  border-radius: 4px;
  background: #fff;
  color: #9ca3af;
  cursor: pointer;
  line-height: 1;
}
.ecf-plat-del:hover:not(:disabled) {
  border-color: #fca5a5;
  color: #ef4444;
}
.ecf-plat-del:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}
.ecf-plat-add {
  align-self: flex-start;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 0;
  border: none;
  background: none;
  font-size: 12px;
  color: #1a6fff;
  cursor: pointer;
}
.ecf-plat-add:hover { text-decoration: underline; }
</style>
