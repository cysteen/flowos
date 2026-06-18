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
</script>

<template>
  <a-select
    :value="value"
    :options="options"
    show-search
    :filter-option="filterSelectOption"
    option-filter-prop="label"
    v-bind="$attrs"
    @update:value="emit('update:value', $event)"
    @change="emit('change', $event)"
  />
</template>
