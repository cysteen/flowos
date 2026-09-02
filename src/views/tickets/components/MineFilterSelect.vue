<script setup lang="ts">
import { filterSelectOption } from '@/views/tickets/types/createTicket';

withDefaults(
  defineProps<{
    modelValue: string;
    options: { value: string; label: string }[];
    placeholder?: string;
    disabled?: boolean;
    wide?: boolean;
  }>(),
  {
    placeholder: '请选择',
    disabled: false,
    wide: false,
  },
);

const emit = defineEmits<{
  'update:modelValue': [v: string];
  change: [v: string];
}>();

function onChange(v: unknown) {
  const next = v == null ? '' : String(v);
  emit('update:modelValue', next);
  emit('change', next);
}
</script>

<template>
  <a-select
    :value="modelValue || undefined"
    :options="options"
    :placeholder="placeholder"
    :disabled="disabled"
    allow-clear
    size="small"
    show-search
    :filter-option="filterSelectOption"
    option-filter-prop="label"
    :bordered="false"
    class="fi-select"
    :class="{ 'fi-select-wide': wide }"
    :dropdown-match-select-width="false"
    @update:value="onChange"
  />
</template>

<style scoped>
.fi-select {
  min-width: 72px;
  max-width: 96px;
  flex: 1;
}

.fi-select-wide {
  min-width: 120px;
  max-width: 180px;
}

.fi-select :deep(.ant-select-selector) {
  padding: 0 14px 0 0 !important;
  height: 24px !important;
  min-height: 24px !important;
  border: none !important;
  box-shadow: none !important;
  background: transparent !important;
}

.fi-select :deep(.ant-select-selection-item),
.fi-select :deep(.ant-select-selection-placeholder) {
  line-height: 24px !important;
  font-size: 13px;
  color: #374151;
  padding-inline-end: 0 !important;
}

.fi-select :deep(.ant-select-selection-placeholder) {
  color: #9ca3af;
}

.fi-select :deep(.ant-select-selection-search-input) {
  height: 24px !important;
}

.fi-select :deep(.ant-select-arrow) {
  right: 0;
  color: #9ca3af;
  font-size: 10px;
}
</style>
