<script setup lang="ts">
import { ExclamationCircleFilled } from '@ant-design/icons-vue';

// 删除确认弹窗（a-modal）。用法：v-model:open + @confirm
withDefaults(
  defineProps<{
    open: boolean;
    title?: string;
    content?: string;
    loading?: boolean;
  }>(),
  {
    title: '确认删除',
    content: '删除后不可恢复，确定继续？',
    loading: false,
  }
);

const emit = defineEmits<{
  'update:open': [value: boolean];
  confirm: [];
  cancel: [];
}>();

function onOk() {
  emit('confirm');
}

function onCancel() {
  emit('update:open', false);
  emit('cancel');
}
</script>

<template>
  <a-modal
    :open="open"
    :title="null"
    :confirm-loading="loading"
    :ok-button-props="{ danger: true }"
    ok-text="删除"
    cancel-text="取消"
    :width="416"
    centered
    @ok="onOk"
    @cancel="onCancel"
  >
    <div class="delete-confirm">
      <ExclamationCircleFilled class="delete-confirm__icon" />
      <div class="delete-confirm__body">
        <div class="delete-confirm__title">{{ title }}</div>
        <div class="delete-confirm__content">{{ content }}</div>
      </div>
    </div>
  </a-modal>
</template>

<style scoped>
.delete-confirm {
  display: flex;
  gap: 12px;
  padding: 8px 0;
}

.delete-confirm__icon {
  font-size: 22px;
  color: #faad14;
  flex: none;
  margin-top: 2px;
}

.delete-confirm__title {
  font-size: 16px;
  font-weight: 600;
  color: #1f2937;
}

.delete-confirm__content {
  margin-top: 8px;
  color: #6b7280;
}
</style>
