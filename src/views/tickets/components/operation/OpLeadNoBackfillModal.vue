<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Input as AInput } from 'ant-design-vue';
import { EditOutlined } from '@ant-design/icons-vue';
import OpActionModal from './OpActionModal.vue';

/**
 * 补录商机编号（终态商机单）。
 * 原值为空 = 补录，直接提交；原值非空 = 修改，必填修改原因，履历记旧值 → 新值。
 */
const props = defineProps<{
  open: boolean;
  current: string;
}>();

const emit = defineEmits<{
  'update:open': [v: boolean];
  submit: [payload: { value: string; reason: string }];
}>();

const value = ref('');
const reason = ref('');

watch(
  () => props.open,
  (v) => {
    if (!v) return;
    value.value = props.current;
    reason.value = '';
  },
);

const isModify = computed(() => !!props.current.trim());

const canSubmit = computed(() => {
  const next = value.value.trim();
  if (!next || next === props.current.trim()) return false;
  if (isModify.value) return !!reason.value.trim();
  return true;
});

function close() {
  emit('update:open', false);
}

function onSubmit() {
  if (!canSubmit.value) return;
  emit('submit', { value: value.value.trim(), reason: reason.value.trim() });
  close();
}
</script>

<template>
  <OpActionModal
    :open="open"
    :title="isModify ? '修改商机编号' : '补录商机编号'"
    :icon="EditOutlined"
    ok-text="保存"
    :ok-disabled="!canSubmit"
    @update:open="emit('update:open', $event)"
    @ok="onSubmit"
    @cancel="close"
  >
    <div class="op-form">
      <div class="op-tip">工单已结案，保存后不改变工单状态、不重算 SLA，变更记入处理履历。</div>

      <div class="op-field">
        <div class="op-label req">商机编号</div>
        <AInput v-model:value="value" :maxlength="64" placeholder="CRM 商机单号" allow-clear />
        <div v-if="isModify" class="op-hint">原值：{{ current }}</div>
      </div>

      <div v-if="isModify" class="op-field">
        <div class="op-label req">修改原因</div>
        <AInput.TextArea
          v-model:value="reason"
          :rows="3"
          :maxlength="200"
          show-count
          placeholder="请说明修改原因，如 CRM 商机合并、编号录错"
        />
      </div>
    </div>
  </OpActionModal>
</template>

<style scoped>
.op-hint { margin-top: 4px; font-size: 12px; color: #9ca3af; }
</style>
