<script setup lang="ts">
/**
 * 新建工单 · 「小智工单信息」卡（1130 小智工单 D5 / D27 / W2 / 一·补 B15）。
 *
 * D27 口径是**最大限度复用通用咨询表单**，故本卡只放确有差异的小智专属要素 ——
 * 「升级 TPD」开关在卡头，产研流转字段仅在勾选后展开。
 *
 * 本卡没有「问题类别」控件（一·补 B15）；附件在「产品问题」卡的问题描述里上传。
 */
import { computed } from 'vue';
import { XIAOZHI_RD_MODULES } from '@/mock/xiaozhi/rdModules';
import {
  XIAOZHI_FIELD_LABELS as L, XIAOZHI_RD_PRIORITIES,
  xiaozhiReceiverOf,
} from '@/views/tickets/types/xiaozhi';
import type { CreateTicketXiaozhiField, CreateTicketXiaozhiForm } from '@/views/tickets/types/createTicket';
import CreateTicketPartCard from './CreateTicketPartCard.vue';
import FormSelect from './FormSelect.vue';

const info = defineModel<CreateTicketXiaozhiForm>('info', { required: true });
defineProps<{
  errors: Record<CreateTicketXiaozhiField, string>;
}>();

const moduleOptions = computed(() => XIAOZHI_RD_MODULES.map((m) => ({ value: m.name, label: m.name })));
const priorityOptions = XIAOZHI_RD_PRIORITIES.map((v) => ({ value: v, label: v }));

const receiver = computed(() => xiaozhiReceiverOf(info.value.rdModule));

/** 与卡头勾选框双向绑定；取消勾选时清空产研字段，避免隐藏项仍参与校验或提交 */
const escalateTpd = computed({
  get: () => info.value.escalateTpd === true,
  set: (on: boolean) => {
    info.value.escalateTpd = on;
    if (!on) info.value.rdModule = '';
  },
});

function setSelect(key: 'rdModule', v: unknown) {
  info.value[key] = v == null ? '' : String(v);
}
</script>

<template>
  <CreateTicketPartCard title="小智工单信息" :compact="!escalateTpd" :body-gap="8">
    <template #head-extra>
      <a-checkbox v-model:checked="escalateTpd" class="xz-head-check">{{ L.escalateTpd }}</a-checkbox>
    </template>

    <div v-if="escalateTpd" class="xz-rd-panel">
      <div class="xz-grid">
        <div class="xz-field">
          <label class="xz-label"><span class="req">*</span>{{ L.rdModule }}</label>
          <div class="xz-control">
            <FormSelect
              class="xz-input"
              :value="info.rdModule || undefined"
              placeholder="请选择产品模块"
              :status="errors.rdModule ? 'error' : ''"
              :options="moduleOptions"
              @update:value="(v) => setSelect('rdModule', v)"
            />
            <div v-if="errors.rdModule" class="xz-error">{{ errors.rdModule }}</div>
          </div>
        </div>

        <div class="xz-field">
          <label class="xz-label"><span class="req">*</span>{{ L.rdReceiver }}</label>
          <div class="xz-control">
            <a-input class="xz-input" :value="receiver" disabled placeholder="选择产品模块后自动带出" />
          </div>
        </div>

        <div class="xz-field">
          <label class="xz-label"><span class="req">*</span>{{ L.rdPriority }}</label>
          <div class="xz-control">
            <FormSelect
              v-model:value="info.rdPriority"
              class="xz-input"
              placeholder="请选择优先级"
              :options="priorityOptions"
            />
          </div>
        </div>

        <div class="xz-field">
          <label class="xz-label">{{ L.frontlineAccount }}</label>
          <div class="xz-control">
            <a-input v-model:value="info.frontlineAccount" class="xz-input" placeholder="提报人域账号，选填" />
          </div>
        </div>
      </div>
    </div>
  </CreateTicketPartCard>
</template>

<style scoped>
.xz-head-check :deep(.ant-checkbox + span) {
  font-size: 12px;
  font-weight: 500;
  color: #374151;
  padding-inline-end: 0;
}
.xz-rd-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
}
.xz-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px 14px;
}
.xz-field {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  min-width: 0;
}
.xz-label {
  flex: none;
  width: 72px;
  font-size: 12px;
  font-weight: 500;
  color: #374151;
  white-space: nowrap;
  line-height: 32px;
}
.req { color: #f56c6c; margin-right: 1px; }
.xz-control {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.xz-input { width: 100%; }
.xz-input :deep(.ant-select-selector),
.xz-input.ant-input {
  min-height: 32px;
}
.xz-error {
  margin-top: 2px;
  font-size: 12px;
  line-height: 18px;
  color: #ef4444;
}
@media (max-width: 768px) {
  .xz-grid { grid-template-columns: 1fr; }
}
</style>
