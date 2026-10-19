<script setup lang="ts">
/**
 * 新建工单 · 「小智工单专属」卡（1130 小智工单 D5 / D27 / W2 / 一·补 B15）。
 *
 * D27 口径是**最大限度复用通用咨询表单**，故本卡只放确有差异的小智专属要素 ——
 * 实际就只剩「升级 TPD」勾选框 + 一组**产研流转信息**：取老系统「创建TPD工单」弹窗现状，
 * 接收人由产品模块带出、只读（W2）。
 *
 * 🔴 **产研四项随「升级 TPD」动态展示**（一·补 B27）：建单出口合为一枚「创建」，
 * 勾上即走直通产研那条路；不勾时整组不渲染 —— 不渲染而不是置灰，因为这组字段在
 * 「落池自领」那条路上**根本不参与**，摆在那儿置灰只会让人以为还得填。
 *
 * 🔴 **本卡没有「问题类别」控件**（一·补 B15）：问题类别就是咨询单的问题分类一 / 二 / 三级，
 * 填在通用咨询表单的「产品问题」卡里。在这儿再放一个「问题类别」下拉，等于同一件事
 * 在一张弹窗上问两遍，且两份值域永远对不齐。
 *
 * 🔴 **附件不在本卡**：与通用咨询单一致，在「产品问题」卡的「问题描述」里上传（OpTextareaAttach）。
 *
 * 产品两级、问题分级、来电描述、SN 号一律用通用咨询单的既有字段，不在本卡重复。
 */
import { computed } from 'vue';
import { useUserStore } from '@/stores/user';
import {
  XIAOZHI_FIELD_LABELS as L, XIAOZHI_RD_MODULES, XIAOZHI_RD_PRIORITIES,
  xiaozhiReceiverOf,
} from '@/views/tickets/types/xiaozhi';
import type { CreateTicketXiaozhiField, CreateTicketXiaozhiForm } from '@/views/tickets/types/createTicket';
import CreateTicketPartCard from './CreateTicketPartCard.vue';
import FormSelect from './FormSelect.vue';

const info = defineModel<CreateTicketXiaozhiForm>('info', { required: true });
defineProps<{
  errors: Record<CreateTicketXiaozhiField, string>;
}>();

const user = useUserStore();

const moduleOptions = XIAOZHI_RD_MODULES.map((m) => ({ value: m.name, label: m.name }));
const priorityOptions = XIAOZHI_RD_PRIORITIES.map((v) => ({ value: v, label: v }));

/** 占位提示：标明默认取建单人登录用户名（域账号） */
const frontlinePlaceholder = computed(() => {
  const acc = user.domainAccount.trim();
  return acc ? `默认 ${acc}（建单人用户名）` : '请输入一线人员域账号';
});

/** 接收人（域账号）由产品模块带出，不可改（W2） */
const receiver = computed(() => xiaozhiReceiverOf(info.value.rdModule));

/** 下拉空值按 undefined 交给 a-select，才会显示「请选择」 */
function setSelect(key: 'rdModule', v: unknown) {
  info.value[key] = v == null ? '' : String(v);
}
</script>

<template>
  <CreateTicketPartCard title="小智工单专属" :body-gap="8">
    <div class="xz-check-row">
      <a-checkbox v-model:checked="info.escalateTpd">{{ L.escalateTpd }}</a-checkbox>
    </div>

    <div v-if="info.escalateTpd" class="xz-grid">
      <div class="xz-field">
        <label class="xz-label"><span class="req">*</span>{{ L.rdModule }}</label>
        <div class="xz-control">
          <FormSelect
            class="xz-input"
            :value="info.rdModule || undefined"
            placeholder="请选择"
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
          <a-input class="xz-input" :value="receiver" disabled placeholder="由产品模块带出" />
        </div>
      </div>

      <div class="xz-field">
        <label class="xz-label"><span class="req">*</span>{{ L.rdPriority }}</label>
        <div class="xz-control">
          <FormSelect
            v-model:value="info.rdPriority"
            class="xz-input"
            size="middle"
            placeholder="请选择"
            :options="priorityOptions"
          />
        </div>
      </div>

      <!-- 一·补 B24：无条件必填，默认建单人登录域账号（非昵称） -->
      <div class="xz-field">
        <label class="xz-label"><span class="req">*</span>{{ L.frontlineAccount }}</label>
        <div class="xz-control">
          <a-input
            v-model:value="info.frontlineAccount"
            class="xz-input"
            :status="errors.frontlineAccount ? 'error' : ''"
            :placeholder="frontlinePlaceholder"
          />
          <div v-if="errors.frontlineAccount" class="xz-error">{{ errors.frontlineAccount }}</div>
        </div>
      </div>
    </div>
  </CreateTicketPartCard>
</template>

<style scoped>
.xz-check-row {
  display: flex;
  align-items: center;
  min-height: 32px;
}
.xz-check-row :deep(.ant-checkbox-wrapper) {
  font-size: 12px;
  font-weight: 500;
  color: #374151;
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
  width: 108px;
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
