<script setup lang="ts">
import { computed, inject, useAttrs } from 'vue';
import { filterSelectOption } from '@/views/tickets/types/createTicket';

defineOptions({ inheritAttrs: false });

const attrs = useAttrs();
const inheritedPopupClassName = inject<string | undefined>('create-ticket-select-popup-class', undefined);
const popupClassName = computed(() =>
  (attrs.popupClassName as string | undefined)
  ?? (attrs['popup-class-name'] as string | undefined)
  ?? inheritedPopupClassName,
);

const props = defineProps<{
  value?: string | number | string[] | undefined;
  /** `disabled` 用于"存量值可回显、不可再选"（见 createTicket.ts ticketSourceOptionsForRole） */
  options?: { value: string | number; label: string; disabled?: boolean }[];
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
    :popup-class-name="popupClassName"
    show-search
    :filter-option="filterSelectOption"
    option-filter-prop="label"
    @update:value="onUpdateValue"
    @change="onChange"
  />
</template>
