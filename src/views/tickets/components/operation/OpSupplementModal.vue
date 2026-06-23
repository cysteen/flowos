<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Modal as AModal, Select as ASelect } from 'ant-design-vue';
import { FileAddOutlined } from '@ant-design/icons-vue';
import OpTextareaAttach from './shared/OpTextareaAttach.vue';
import { SUPPLEMENT_TYPE_OPTIONS } from '@/views/tickets/types/operationTabs';

const props = defineProps<{ open: boolean }>();

const emit = defineEmits<{
  'update:open': [v: boolean];
  submit: [payload: { supplementType: string; content: string; attachments: string[] }];
}>();

const supplementType = ref<string | undefined>(undefined);
const content = ref('');
const attachments = ref<string[]>([]);

const typeOptions = SUPPLEMENT_TYPE_OPTIONS.map((v) => ({ value: v, label: v }));

watch(
  () => props.open,
  (v) => {
    if (!v) return;
    supplementType.value = undefined;
    content.value = '';
    attachments.value = [];
  },
);

function close() {
  emit('update:open', false);
}

function onSubmit() {
  if (!supplementType.value) return;
  const text = content.value.trim();
  if (!text) return;
  emit('submit', {
    supplementType: supplementType.value,
    content: text,
    attachments: [...attachments.value],
  });
  close();
}

const canSubmit = computed(() => !!supplementType.value && !!content.value.trim());
</script>

<template>
  <AModal
    :open="open"
    :width="480"
    :footer="null"
    :closable="true"
    :mask-closable="false"
    class="supplement-modal"
    @update:open="emit('update:open', $event)"
  >
    <template #title>
      <div class="modal-title">
        <span class="title-icon"><FileAddOutlined /></span>
        <div class="title-text">新建补充</div>
      </div>
    </template>

    <div class="form-body">
      <div class="field">
        <label class="field-label"><span class="req">*</span>补充类型</label>
        <ASelect
          v-model:value="supplementType"
          :options="typeOptions"
          placeholder="请选择补充类型"
          class="type-select"
          allow-clear
        />
      </div>

      <div class="field">
        <label class="field-label"><span class="req">*</span>补充内容</label>
        <OpTextareaAttach
          v-model="content"
          :attachments="attachments"
          :min-input-height="96"
          placeholder="请简要描述本次补充的信息…"
          @update:attachments="attachments = $event"
        />
      </div>
    </div>

    <div class="modal-foot">
      <button type="button" class="btn btn-ghost" @click="close">取消</button>
      <button type="button" class="btn btn-primary" :disabled="!canSubmit" @click="onSubmit">提交补充</button>
    </div>
  </AModal>
</template>

<style scoped>
.modal-title {
  display: flex;
  align-items: center;
  gap: 10px;
}
.title-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: #eff6ff;
  color: #1a6fff;
  font-size: 16px;
  flex: none;
}
.title-text {
  font-size: 15px;
  font-weight: 700;
  color: #111827;
  line-height: 1.3;
}
.form-body {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 4px 0 8px;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.field-label {
  font-size: 12px;
  font-weight: 600;
  color: #374151;
}
.req {
  color: #ef4444;
  margin-right: 2px;
}
.type-select {
  width: 100%;
}
.modal-foot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding-top: 4px;
  border-top: 1px solid #f3f4f6;
}
.btn {
  font-size: 13px;
  font-weight: 600;
  border-radius: 6px;
  padding: 7px 16px;
  cursor: pointer;
  font-family: inherit;
  border: none;
}
.btn-ghost {
  color: #6b7280;
  background: #f9fafb;
  border: 1px solid #e5e7eb;
}
.btn-ghost:hover {
  background: #f3f4f6;
}
.btn-primary {
  color: #fff;
  background: #1a6fff;
}
.btn-primary:hover:not(:disabled) {
  background: #1558d6;
}
.btn-primary:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
</style>
