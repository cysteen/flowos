<script setup lang="ts">
/**
 * 新建工单 · 「小智工单信息」卡（1130 小智工单 D5 / D27 / W1 / W2）。
 *
 * D27 口径是**最大限度复用通用咨询表单**，故本卡只放确有差异的小智专属要素：
 * - 问题类别：相对 toC 在线小结，小智只多出「问题类别」与「是否流转研发」两项（03 二·附），
 *   后者由底栏「创建并流转」按钮表达、不作字段；
 * - 产研流转信息：取老系统「创建TPD工单」弹窗现状五项，接收人由产品模块带出、只读（W2）。
 *
 * 产品两级、问题分级、来电描述、SN 号一律用通用咨询单的既有字段，不在本卡重复。
 */
import { computed } from 'vue';
import { PlusOutlined } from '@ant-design/icons-vue';
import type { UploadFile } from 'ant-design-vue';
import {
  XIAOZHI_FIELD_LABELS as L, XIAOZHI_PROBLEM_CATEGORIES, XIAOZHI_RD_MODULES, XIAOZHI_RD_PRIORITIES,
  xiaozhiReceiverOf,
} from '@/views/tickets/types/xiaozhi';
import type { CreateTicketXiaozhiField, CreateTicketXiaozhiForm } from '@/views/tickets/types/createTicket';
import CreateTicketPartCard from './CreateTicketPartCard.vue';
import FormSelect from './FormSelect.vue';

const info = defineModel<CreateTicketXiaozhiForm>('info', { required: true });
defineProps<{
  errors: Record<CreateTicketXiaozhiField, string>;
}>();

const categoryOptions = XIAOZHI_PROBLEM_CATEGORIES.map((v) => ({ value: v, label: v }));
const moduleOptions = XIAOZHI_RD_MODULES.map((m) => ({ value: m.name, label: m.name }));
const priorityOptions = XIAOZHI_RD_PRIORITIES.map((v) => ({ value: v, label: v }));

/** 接收人（域账号）由产品模块带出，不可改（W2） */
const receiver = computed(() => xiaozhiReceiverOf(info.value.rdModule));

const attachmentList = computed<UploadFile[]>(() =>
  (info.value.attachments ?? []).map((name, i) => ({ uid: `xz-att-${i}-${name}`, name, status: 'done' })),
);

/** 下拉空值按 undefined 交给 a-select，才会显示「请选择」 */
function setSelect(key: 'problemCategory' | 'rdModule', v: unknown) {
  info.value[key] = v == null ? '' : String(v);
}

function beforeUpload() {
  return false;
}

function onAttachmentChange({ fileList }: { fileList: UploadFile[] }) {
  info.value.attachments = fileList.map((f) => f.name);
}
</script>

<template>
  <CreateTicketPartCard title="小智工单信息" :body-gap="8">
    <div class="xz-grid">
      <div class="xz-field">
        <label class="xz-label"><span class="req">*</span>{{ L.problemCategory }}</label>
        <div class="xz-control">
          <FormSelect
            class="xz-input"
            :value="info.problemCategory || undefined"
            placeholder="请选择"
            :status="errors.problemCategory ? 'error' : ''"
            :options="categoryOptions"
            @update:value="(v) => setSelect('problemCategory', v)"
          />
          <div v-if="errors.problemCategory" class="xz-error">{{ errors.problemCategory }}</div>
        </div>
      </div>
    </div>

    <div class="xz-sub">流转产研</div>
    <div class="xz-grid">
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
          <a-radio-group v-model:value="info.rdPriority" class="xz-radios" :options="priorityOptions" />
        </div>
      </div>

      <div class="xz-field">
        <label class="xz-label">{{ L.frontlineAccount }}</label>
        <div class="xz-control">
          <a-input v-model:value="info.frontlineAccount" class="xz-input" placeholder="请输入一线人员域账号" />
        </div>
      </div>
    </div>

    <div class="xz-field xz-upload">
      <label class="xz-label">{{ L.attachments }}</label>
      <div class="xz-control">
        <a-upload
          :file-list="attachmentList"
          :before-upload="beforeUpload"
          @change="onAttachmentChange"
        >
          <a-button size="small">
            <PlusOutlined />
            上传附件
          </a-button>
        </a-upload>
      </div>
    </div>
  </CreateTicketPartCard>
</template>

<style scoped>
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
.xz-radios {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 2px 10px;
  min-height: 32px;
  font-size: 12px;
}
.xz-error {
  margin-top: 2px;
  font-size: 12px;
  line-height: 18px;
  color: #ef4444;
}
.xz-sub {
  margin-top: 4px;
  font-size: 12px;
  font-weight: 600;
  color: #0f766e;
}
.xz-upload { margin-top: 2px; }

@media (max-width: 768px) {
  .xz-grid { grid-template-columns: 1fr; }
}
</style>
