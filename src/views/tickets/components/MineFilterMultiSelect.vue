<script setup lang="ts">
import { filterSelectOption } from '@/views/tickets/types/createTicket';

withDefaults(
  defineProps<{
    modelValue: string[];
    options: { value: string; label: string }[];
    placeholder?: string;
    disabled?: boolean;
  }>(),
  {
    placeholder: '请选择',
    disabled: false,
  },
);

const emit = defineEmits<{
  'update:modelValue': [v: string[]];
  change: [v: string[]];
}>();

function onChange(v: unknown) {
  const next = Array.isArray(v) ? v.map((x) => String(x)) : [];
  emit('update:modelValue', next);
  emit('change', next);
}
</script>

<template>
  <a-select
    mode="multiple"
    :value="modelValue"
    :options="options"
    :placeholder="placeholder"
    :disabled="disabled"
    allow-clear
    size="small"
    show-search
    :max-tag-count="1"
    :filter-option="filterSelectOption"
    option-filter-prop="label"
    :bordered="false"
    class="fi-multi"
    :dropdown-match-select-width="false"
    @update:value="onChange"
  >
    <template #maxTagPlaceholder="omitted">
      <span class="fi-more">+{{ omitted.length }}</span>
    </template>
  </a-select>
</template>

<style scoped>
.fi-multi {
  min-width: 108px;
  max-width: 152px;
  flex: 1;
}

.fi-multi :deep(.ant-select-selector) {
  padding: 0 14px 0 0 !important;
  min-height: 24px !important;
  border: none !important;
  box-shadow: none !important;
  background: transparent !important;
  flex-wrap: nowrap !important;
}

.fi-multi :deep(.ant-select-selection-overflow) {
  flex-wrap: nowrap;
}

.fi-multi :deep(.ant-select-selection-item) {
  height: 18px;
  line-height: 16px;
  margin: 0 4px 0 0;
  padding: 0 4px;
  font-size: 12px;
  color: #374151;
  background: #f3f4f6;
  border: none;
  border-radius: 3px;
}

.fi-multi :deep(.ant-select-selection-placeholder) {
  line-height: 24px !important;
  font-size: 13px;
  color: #9ca3af;
  inset-inline-start: 0;
}

.fi-multi :deep(.ant-select-selection-search) {
  margin-inline-start: 0;
}

.fi-multi :deep(.ant-select-selection-search-input) {
  height: 22px !important;
}

.fi-multi :deep(.ant-select-arrow),
.fi-multi :deep(.ant-select-clear) {
  right: 0;
  color: #9ca3af;
  font-size: 10px;
}

.fi-more {
  font-size: 12px;
  color: #6b7280;
}
</style>
