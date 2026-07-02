<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Select as ASelect, Input as AInput } from 'ant-design-vue';
import { CloseOutlined } from '@ant-design/icons-vue';
import OpActionModal from './OpActionModal.vue';
import { CANCEL_REASON_OPTIONS } from '@/views/tickets/types/operationTabs';

const props = defineProps<{ open: boolean }>();

const emit = defineEmits<{
  'update:open': [v: boolean];
  submit: [payload: { reason: string; remark: string }];
}>();

const reason = ref<string | undefined>(undefined);
const remark = ref('');

const reasonOptions = CANCEL_REASON_OPTIONS.map((v) => ({ value: v, label: v }));

watch(
  () => props.open,
  (v) => {
    if (!v) return;
    reason.value = undefined;
    remark.value = '';
  },
);

function close() {
  emit('update:open', false);
}

const isOther = computed(() => reason.value === '其他');

const canSubmit = computed(() => {
  if (!reason.value) return false;
  if (isOther.value) return !!remark.value.trim();
  return true;
});

function onSubmit() {
  if (!canSubmit.value || !reason.value) return;
  const trimmedRemark = remark.value.trim();
  emit('submit', { reason: reason.value, remark: trimmedRemark });
  close();
}
</script>

<template>
  <OpActionModal
    :open="open"
    title="取消工单"
    :icon="CloseOutlined"
    tone="danger"
    ok-text="确认取消"
    ok-tone="danger"
    :ok-disabled="!canSubmit"
    @update:open="emit('update:open', $event)"
    @ok="onSubmit"
    @cancel="close"
  >
    <div class="op-form">
      <div class="op-tip op-tip-warn">
        取消后工单将终止处理，此操作不可撤销。请说明取消原因以便后续追溯。
      </div>

      <div class="op-field">
        <div class="op-label req">取消原因</div>
        <ASelect
          v-model:value="reason"
          :options="reasonOptions"
          placeholder="请选择取消原因"
          style="width:100%"
          allow-clear
        />
      </div>

      <div class="op-field">
        <div class="op-label" :class="{ req: isOther }">补充说明</div>
        <AInput.TextArea
          v-model:value="remark"
          :rows="3"
          :maxlength="500"
          show-count
          :placeholder="isOther ? '请填写具体取消原因…' : '可选，补充说明取消背景（如客户原话、错误字段等）'"
        />
      </div>
    </div>
  </OpActionModal>
</template>
