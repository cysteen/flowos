<script setup lang="ts">
import { filterSelectOption } from '@/views/tickets/types/createTicket';

defineOptions({ inheritAttrs: false });

const props = defineProps<{
  value?: string | number | string[] | undefined;
  options?: { value: string | number; label: string }[];
  mode?: 'multiple' | 'tags';
}>();

const emit = defineEmits<{
  'update:value': [v: string | number | string[] | undefined];
  change: [v: string | number | string[] | undefined];
}>();

function normalize(v: unknown): string | number | string[] | undefined {
  if (props.mode === 'multiple' || props.mode === 'tags') {
    return Array.isArray(v) ? v.map(String) : [];
  }
  return v as string | number | undefined;
}

function onUpdateValue(v: unknown) {
  emit('update:value', normalize(v));
}

function onChange(v: unknown) {
  emit('change', normalize(v));
}
</script>

<template>
  <a-select
    v-bind="$attrs"
    :value="value"
    :options="options"
    :mode="mode"
    show-search
    :filter-option="filterSelectOption"
    option-filter-prop="label"
    @update:value="onUpdateValue"
    @change="onChange"
  />
</template>
