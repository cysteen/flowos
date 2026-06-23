<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Modal as AModal } from 'ant-design-vue';
import { VerticalAlignBottomOutlined } from '@ant-design/icons-vue';

const props = defineProps<{
  open: boolean;
  ticketTitle: string;
}>();

const emit = defineEmits<{
  'update:open': [v: boolean];
  confirm: [payload: { ticketTitle: string; resolved: boolean }];
}>();

const resolved = ref<boolean | undefined>(undefined);

watch(
  () => props.open,
  (v) => {
    if (v) resolved.value = undefined;
  },
);

function close() {
  emit('update:open', false);
}

const canSubmit = computed(() => resolved.value !== undefined);

function onSubmit() {
  if (!canSubmit.value) return;
  emit('confirm', {
    ticketTitle: props.ticketTitle,
    resolved: resolved.value!,
  });
  close();
}
</script>

<template>
  <AModal
    :open="open"
    :width="480"
    :footer="null"
    :closable="true"
    :mask-closable="false"
    class="forward-modal"
    @update:open="emit('update:open', $event)"
  >
    <template #title>
      <div class="modal-title">
        <span class="title-icon"><VerticalAlignBottomOutlined /></span>
        <div class="title-text">下送审核</div>
      </div>
    </template>

    <div class="form-body">
      <div class="confirm-box">
        <div class="box-label">工单名称</div>
        <div class="box-value">{{ ticketTitle }}</div>
      </div>

      <div class="field">
        <div class="field-label"><span class="req">*</span>是否已经解决</div>
        <div class="radio-row">
          <label class="radio-opt" :class="{ active: resolved === true }">
            <input v-model="resolved" type="radio" :value="true" />
            <span>是</span>
          </label>
          <label class="radio-opt" :class="{ active: resolved === false }">
            <input v-model="resolved" type="radio" :value="false" />
            <span>否</span>
          </label>
        </div>
      </div>

      <div class="tip">确认下送后，工单将进入「待审核」状态。</div>
    </div>

    <div class="modal-foot">
      <button type="button" class="btn btn-ghost" @click="close">取消</button>
      <button type="button" class="btn btn-primary" :disabled="!canSubmit" @click="onSubmit">确定下送</button>
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
}
.title-text {
  font-size: 15px;
  font-weight: 700;
  color: #111827;
}
.form-body {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 4px 0 8px;
}
.confirm-box {
  padding: 12px 14px;
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
}
.box-label {
  font-size: 12px;
  color: #9ca3af;
  margin-bottom: 4px;
}
.box-value {
  font-size: 14px;
  font-weight: 600;
  color: #111827;
  line-height: 1.5;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 8px;
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
.radio-row {
  display: flex;
  gap: 10px;
}
.radio-opt {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  cursor: pointer;
  font-size: 13px;
  color: #374151;
  transition: border-color 0.12s, background 0.12s;
}
.radio-opt input {
  margin: 0;
}
.radio-opt.active {
  border-color: #93c5fd;
  background: #eff6ff;
  color: #1a6fff;
  font-weight: 600;
}
.tip {
  font-size: 12px;
  color: #6b7280;
  line-height: 1.5;
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
