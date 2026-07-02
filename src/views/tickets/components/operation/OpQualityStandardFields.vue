<script setup lang="ts">
import { computed } from 'vue';
import FormSelect from '@/views/tickets/components/create-ticket/FormSelect.vue';
import {
  QUALITY_ISSUE_L1_OPTIONS,
  QUALITY_ISSUE_L2_MAP,
  QUALITY_ISSUE_L2_ALL_OPTIONS,
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
const l2Options = computed(() => {
  const list = props.issueCat1
    ? (QUALITY_ISSUE_L2_MAP[props.issueCat1] ?? [])
    : QUALITY_ISSUE_L2_ALL_OPTIONS;
  return list.map((v) => ({ label: v, value: v }));
});

function onStandardChange(v: string) {
  const standard = v === 'yes';
  emit('update:isStandard', standard);
}

function onCat1Change(v: string | number | undefined) {
  emit('update:issueCat1', String(v ?? ''));
  // 子类清空由父级在 @update:issue-cat1 中一并处理，避免连续 emit 用旧 form 覆盖 cat1
}
</script>

<template>
  <div class="quality-fields" :class="{ compact }">
    <div class="field inline-row standard-row">
      <label>建单是否规范</label>
      <a-radio-group
        :value="isStandard ? 'yes' : 'no'"
        class="radio-row"
        @update:value="onStandardChange"
      >
        <a-radio value="yes">规范</a-radio>
        <a-radio value="no">不规范</a-radio>
      </a-radio-group>
    </div>
    <div v-if="!isStandard" class="quality-cascade">
      <div class="field cascade-field">
        <label class="field-label-sm">不规范原因</label>
        <FormSelect
          class="quality-select"
          :value="issueCat1 || undefined"
          :options="l1Options"
          placeholder="请选择"
          @update:value="onCat1Change"
        />
      </div>
      <div class="field cascade-field">
        <label class="field-label-sm">不规范分类</label>
        <FormSelect
          class="quality-select"
          :value="issueCat2 || undefined"
          :options="l2Options"
          placeholder="请选择"
          @update:value="(v) => emit('update:issueCat2', String(v ?? ''))"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.quality-fields {
  display: flex;
  flex-direction: column;
  gap: 10px;
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
}
.inline-row {
  flex-direction: row;
  align-items: center;
  gap: 10px;
}
.standard-row > label {
  flex: none;
  white-space: nowrap;
}
.quality-fields:not(.compact) .standard-row > label {
  width: 96px;
}
.radio-row {
  display: flex;
  gap: 10px;
  font-size: 12px;
}
.quality-fields :deep(.ant-radio-wrapper) {
  white-space: nowrap;
}
.quality-cascade {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.cascade-field {
  min-width: 0;
}
.quality-select {
  width: 100%;
  font-size: 12px;
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
.quality-fields.compact {
  gap: 8px;
}
.quality-fields.compact .inline-row {
  gap: 8px;
}
.quality-fields.compact .radio-row {
  gap: 8px;
}
.quality-fields.compact .quality-cascade {
  gap: 8px;
}
@media (max-width: 560px) {
  .quality-cascade {
    grid-template-columns: 1fr;
  }
}
</style>
