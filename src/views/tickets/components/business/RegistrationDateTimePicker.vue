<script setup lang="ts">
import dayjs, { type Dayjs } from 'dayjs';
import { APPOINTMENT_DATE_TIME_FORMAT } from '@/views/tickets/types/operation';

const props = withDefaults(
  defineProps<{
    value?: string;
    disabled?: boolean;
    placeholder?: string;
    invalid?: boolean;
  }>(),
  { value: '', placeholder: '请选择时间' },
);
const emit = defineEmits<{ 'update:value': [value: string] }>();

function parse(raw: string): Dayjs | undefined {
  if (!raw?.trim()) return undefined;
  const normalized = raw.includes('T') ? raw.replace('T', ' ') : raw;
  const parsed = dayjs(normalized, APPOINTMENT_DATE_TIME_FORMAT);
  return parsed.isValid() ? parsed : undefined;
}
function onUpdate(value: Dayjs | string | null) {
  if (value == null || value === '') {
    emit('update:value', '');
    return;
  }
  const text = typeof value === 'string' ? value : value.format(APPOINTMENT_DATE_TIME_FORMAT);
  emit('update:value', text);
}
</script>

<template>
  <a-date-picker
    class="registration-datetime-picker field-control"
    :class="{ 'is-invalid': invalid }"
    :value="parse(value)"
    :disabled="disabled"
    :show-time="{ format: 'HH:mm:ss' }"
    :format="APPOINTMENT_DATE_TIME_FORMAT"
    :placeholder="placeholder"
    allow-clear
    @update:value="onUpdate"
  />
</template>

<style scoped>
.registration-datetime-picker {
  width: 100%;
  min-height: 30px;
}
.registration-datetime-picker :deep(.ant-picker) {
  display: flex;
  align-items: center;
  width: 100%;
  min-height: 30px;
  height: 30px;
  padding: 4px 8px 4px 8px;
}
.registration-datetime-picker :deep(.ant-picker-input) {
  flex: 1 1 auto;
  min-width: 0;
  width: auto;
}
.registration-datetime-picker :deep(.ant-picker-input > input) {
  width: 100% !important;
  min-width: 0;
  font-size: 12px;
  line-height: 1.25;
  text-overflow: ellipsis;
}
.registration-datetime-picker :deep(.ant-picker-suffix) {
  flex: none;
  margin-inline-start: 4px;
}
.registration-datetime-picker.is-invalid :deep(.ant-picker) {
  border-color: #ff4d4f;
}
</style>
