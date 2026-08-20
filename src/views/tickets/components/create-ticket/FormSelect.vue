<script setup lang="ts">
import { filterSelectOption } from '@/views/tickets/types/createTicket';

defineOptions({ inheritAttrs: false });

defineProps<{
  value?: string | number | undefined;
  options?: { value: string | number; label: string }[];
}>();

const emit = defineEmits<{
  'update:value': [v: string | number | undefined];
  change: [v: string | number | undefined];
}>();

/**
 * a-select 的 update:value / change 按 antd 声明给出 SelectValue
 * （RawValue | LabeledValue | 数组）。本组件是标量单选：props.value 只收 string | number，
 * options 的 value 也只有 string | number，且不开 labelInValue / mode="multiple"，
 * 所以运行时拿到的必然是标量，转发前收窄回标量。
 */
function toScalar(v: unknown): string | number | undefined {
  return v as string | number | undefined;
}

function onUpdateValue(v: unknown) {
  emit('update:value', toScalar(v));
}

function onChange(v: unknown) {
  emit('change', toScalar(v));
}
</script>

<template>
  <a-select
    :value="value"
    :options="options"
    show-search
    :filter-option="filterSelectOption"
    option-filter-prop="label"
    v-bind="$attrs"
    @update:value="onUpdateValue"
    @change="onChange"
  />
</template>
