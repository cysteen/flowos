<script setup lang="ts">
import { ref } from 'vue';
import { ContainerOutlined, CheckCircleOutlined, WarningOutlined } from '@ant-design/icons-vue';
import OpCollapsibleSection from '../OpCollapsibleSection.vue';
import OpTextareaAttach from '../shared/OpTextareaAttach.vue';
import type { RiskMonitorDraft } from '@/views/tickets/types/operationTabs';

const props = defineProps<{ draft: RiskMonitorDraft }>();
const emit = defineEmits<{ 'update:draft': [draft: RiskMonitorDraft] }>();

const expanded = ref({ report: true, conclusion: true, risk: true });

function update(partial: Partial<RiskMonitorDraft>) {
  emit('update:draft', { ...props.draft, ...partial });
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
            @update:value="(v: string) => update({ reportModule: v ?? '' })"
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
            @update:value="(v: string) => update({ reportTarget: v ?? '' })"
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
          @update:value="(v: string) => update({ assistContent: v ?? '' })"
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
          @update:value="(v: string) => update({ processConclusion: v ?? '' })"
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
      <div class="field-row">
        <div class="inline-field">
          <label class="lbl lbl-72">风险标记</label>
          <a-select
            :value="draft.riskFlag || undefined"
            class="form-select"
            placeholder="请选择"
            allow-clear
            @update:value="(v: string) => update({ riskFlag: v ?? '' })"
          >
            <a-select-option value="无风险">无风险</a-select-option>
            <a-select-option value="有风险">有风险</a-select-option>
          </a-select>
        </div>
        <div class="inline-field">
          <label class="lbl lbl-72">风险等级</label>
          <a-select
            :value="draft.riskLevel || undefined"
            class="form-select"
            placeholder="请选择"
            allow-clear
            @update:value="(v: string) => update({ riskLevel: v ?? '' })"
          >
            <a-select-option value="低">低</a-select-option>
            <a-select-option value="中">中</a-select-option>
            <a-select-option value="高">高</a-select-option>
          </a-select>
        </div>
      </div>
      <div class="stack-field">
        <label class="lbl">风险描述</label>
        <OpTextareaAttach
          :model-value="draft.riskDesc"
          :attachments="draft.riskDescAttachments"
          :min-input-height="48"
          placeholder="描述风险点、影响范围与建议处置…"
          @update:model-value="(v) => update({ riskDesc: v })"
          @update:attachments="(v) => update({ riskDescAttachments: v })"
        />
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
</style>
