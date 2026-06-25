<script setup lang="ts">
import { computed } from 'vue';
import {
  QUALITY_ISSUE_L1_OPTIONS,
  QUALITY_ISSUE_L2_MAP,
} from '@/views/tickets/types/operation';

const props = withDefaults(
  defineProps<{
    isStandard?: boolean;
    issueCat1: string;
    issueCat2: string;
    /** 投诉补充项内嵌样式（更紧凑） */
    compact?: boolean;
  }>(),
  { isStandard: true },
);

const emit = defineEmits<{
  'update:isStandard': [v: boolean];
  'update:issueCat1': [v: string];
  'update:issueCat2': [v: string];
}>();

const l1Options = QUALITY_ISSUE_L1_OPTIONS.map((v) => ({ label: v, value: v }));
const l2Options = computed(() =>
  (QUALITY_ISSUE_L2_MAP[props.issueCat1] ?? []).map((v) => ({ label: v, value: v })),
);

function onStandardChange(v: string) {
  const standard = v === 'yes';
  emit('update:isStandard', standard);
  if (standard) {
    emit('update:issueCat1', '');
    emit('update:issueCat2', '');
  }
}

function onCat1Change(v: string) {
  emit('update:issueCat1', v);
  emit('update:issueCat2', '');
}
</script>

<template>
  <div class="quality-fields" :class="{ compact }">
    <div class="field inline-row quality-row">
      <label>建单是否规范</label>
      <a-radio-group
        :value="isStandard ? 'yes' : 'no'"
        class="radio-row"
        @update:value="onStandardChange"
      >
        <a-radio value="yes">规范</a-radio>
        <a-radio value="no">不规范</a-radio>
      </a-radio-group>
      <template v-if="!isStandard">
        <label class="field-label-sm">不规范原因大类</label>
        <a-select
          class="quality-select"
          :value="issueCat1 || undefined"
          :options="l1Options"
          placeholder="请选择"
          @update:value="onCat1Change"
        />
        <template v-if="issueCat1">
          <label class="field-label-sm">不规范原因子类</label>
          <a-select
            class="quality-select"
            :value="issueCat2 || undefined"
            :options="l2Options"
            placeholder="请选择"
            @update:value="(v: string) => emit('update:issueCat2', v)"
          />
        </template>
      </template>
    </div>
  </div>
</template>

<style scoped>
.quality-fields {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.field label {
  font-size: 12px;
  font-weight: 600;
  color: #374151;
}
.field-label-sm {
  font-size: 11px;
  font-weight: 500;
  color: #6b7280;
  flex: none;
  white-space: nowrap;
}
.inline-row {
  flex-direction: row;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.quality-row > label:first-child {
  flex: none;
  white-space: nowrap;
}
.quality-fields:not(.compact) .quality-row > label:first-child {
  width: 96px;
}
.radio-row {
  display: flex;
  gap: 10px;
  font-size: 12px;
  flex: none;
}
.quality-fields :deep(.ant-radio-wrapper) {
  white-space: nowrap;
}
.quality-select {
  width: 128px;
  flex: none;
}
.quality-select :deep(.ant-select-selector) {
  height: 28px;
  min-height: 28px;
  font-size: 12px;
}
.quality-select :deep(.ant-select-selection-item),
.quality-select :deep(.ant-select-selection-placeholder) {
  font-size: 12px;
  line-height: 26px;
}
.quality-fields.compact .quality-select {
  width: 112px;
}
.quality-fields.compact .inline-row {
  gap: 8px;
}
.quality-fields.compact .radio-row {
  gap: 8px;
}
</style>
