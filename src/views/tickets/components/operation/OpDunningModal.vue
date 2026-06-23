<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Modal as AModal } from 'ant-design-vue';
import { BellOutlined } from '@ant-design/icons-vue';
import OpTextareaAttach from './shared/OpTextareaAttach.vue';

const props = defineProps<{ open: boolean }>();

const emit = defineEmits<{
  'update:open': [v: boolean];
  submit: [payload: { content: string; attachments: string[] }];
}>();

const content = ref('');
const attachments = ref<string[]>([]);

watch(
  () => props.open,
  (v) => {
    if (!v) return;
    content.value = '';
    attachments.value = [];
  },
);

function close() {
  emit('update:open', false);
}

function onSubmit() {
  const text = content.value.trim();
  if (!text) return;
  emit('submit', { content: text, attachments: [...attachments.value] });
  close();
}

const canSubmit = computed(() => !!content.value.trim());
</script>

<template>
  <AModal
    :open="open"
    :width="480"
    :footer="null"
    :closable="true"
    :mask-closable="false"
    class="dunning-modal"
    @update:open="emit('update:open', $event)"
  >
    <template #title>
      <div class="modal-title">
        <span class="title-icon"><BellOutlined /></span>
        <div class="title-text">催单</div>
      </div>
    </template>

    <div class="form-body">
      <div class="field">
        <label class="field-label"><span class="req">*</span>催单信息</label>
        <OpTextareaAttach
          v-model="content"
          :attachments="attachments"
          :min-input-height="96"
          placeholder="请填写催单说明，如客户诉求、紧急程度等…"
          @update:attachments="attachments = $event"
        />
      </div>
    </div>

    <div class="modal-foot">
      <button type="button" class="btn btn-ghost" @click="close">取消</button>
      <button type="button" class="btn btn-primary" :disabled="!canSubmit" @click="onSubmit">提交催单</button>
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
  background: #fff7ed;
  color: #ea580c;
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
