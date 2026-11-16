<script setup lang="ts">
import { computed } from 'vue';
import FormSelect from '@/views/tickets/components/create-ticket/FormSelect.vue';
import OpTextareaAttach from '@/views/tickets/components/operation/shared/OpTextareaAttach.vue';
import RegistrationDateTimePicker from './RegistrationDateTimePicker.vue';
import type {
  RegistrationFieldKey, RegistrationTemplate, RegistrationValidationErrors, RegistrationValues,
} from '@/views/tickets/types/businessRegistration';
import {
  registrationFieldOptions, registrationFieldVisible, type RegistrationEditorSection,
} from './registrationEditorConfig';

const props = withDefaults(
  defineProps<{
    section: RegistrationEditorSection;
    template: RegistrationTemplate;
    values: RegistrationValues;
    errors: RegistrationValidationErrors;
    isNew: boolean;
    editable: boolean;
    layout?: 'stacked' | 'inline' | 'paired';
    /** 新建页行内栅格列数，默认 3 */
    inlineColumns?: 1 | 2 | 3;
    /** paired：标签左、控件右时的列数 */
    pairedColumns?: 1 | 2 | 3;
    /** 侧栏卡片内嵌：无外框灰底标题，由父级 side-card 提供标题 */
    embedded?: boolean;
    /** 顶栏双卡：对齐处理页 OpOverviewBand 的 ob-desc / ob-stat 视觉 */
    overviewTone?: 'desc' | 'stat';
    descriptionAttachments?: string[];
    processResultAttachments?: string[];
  }>(),
  {
    layout: 'stacked',
    inlineColumns: 3,
    pairedColumns: 1,
    embedded: false,
    descriptionAttachments: () => [],
    processResultAttachments: () => [],
  },
);
const emit = defineEmits<{
  change: [key: RegistrationFieldKey, value: string];
  'update:descriptionAttachments': [files: string[]];
  'update:processResultAttachments': [files: string[]];
  textareaFilesAdded: [key: 'description' | 'processResult', files: { name: string; size: number; file: File }[]];
}>();
const fields = computed(() => props.section.fields.filter((field) => registrationFieldVisible(field, props.template, props.values)));
const inline = computed(() => props.layout === 'inline');
const paired = computed(() => props.layout === 'paired');
const isOverview = computed(() => !!props.overviewTone);
const processStretch = computed(() => props.embedded && props.section.id === 'process');
const fieldsWrapClass = computed(() => {
  if (inline.value) return inlineGridClass.value;
  if (paired.value) {
    const base = 'registration-fields registration-fields--paired';
    return processStretch.value ? `${base} registration-fields--stretch` : base;
  }
  return 'registration-fields';
});
const fieldsWrapStyle = computed(() => {
  if (inline.value) return undefined;
  if (paired.value) return { '--paired-cols': String(props.pairedColumns) };
  return { '--columns': props.section.columns };
});
const inlineGridClass = computed(() => {
  if (!inline.value) return '';
  if (props.inlineColumns === 1) return 'row-1';
  if (props.inlineColumns === 2) return 'row-2';
  return 'row-3';
});

function showRequired(field: { createRequired?: boolean; closeRequired?: boolean; readonly?: boolean }) {
  if (field.readonly) return false;
  if (props.isNew) return !!(field.createRequired || field.closeRequired);
  return !!field.closeRequired;
}
function update(key: RegistrationFieldKey, value: unknown) {
  emit('change', key, value == null ? '' : String(value));
}
function nativeValue(event: Event) { return (event.target as HTMLInputElement).value; }
function isTextareaAttach(key: RegistrationFieldKey) {
  return key === 'description' || key === 'processResult';
}
function textareaAttachments(key: RegistrationFieldKey) {
  if (key === 'description') return props.descriptionAttachments;
  if (key === 'processResult') return props.processResultAttachments;
  return [];
}
function onTextareaAttachments(key: RegistrationFieldKey, files: string[]) {
  if (key === 'description') emit('update:descriptionAttachments', files);
  else if (key === 'processResult') emit('update:processResultAttachments', files);
}
/** Paired layout truncates labels; prefer hint text from custom placeholders when present. */
function pairedLabelTitle(field: { label: string; placeholder?: string }) {
  if (field.placeholder?.startsWith('填写')) return field.placeholder.slice(2);
  return field.label;
}
</script>

<template>
  <component
    :is="isOverview ? 'section' : inline || embedded ? 'div' : 'section'"
    :class="[
      isOverview
        ? ['ob-col', overviewTone === 'desc' ? 'ob-desc' : 'ob-stat']
        : inline
          ? 'registration-inline'
          : embedded
            ? 'registration-embedded'
            : 'registration-section',
    ]"
    :data-region="section.id"
  >
    <div v-if="isOverview" class="ob-head">
      <span class="ob-title"><i class="ob-bar" aria-hidden="true" />{{ section.title }}</span>
    </div>
    <header v-else-if="!inline && !embedded" class="section-heading">
      <strong class="section-title"><i class="section-bar" aria-hidden="true" />{{ section.title }}</strong>
    </header>
    <div
      :class="[
        isOverview ? 'ob-body' : null,
        embedded ? 'registration-fields-body' : null,
      ]"
    >
      <div :class="fieldsWrapClass" :style="fieldsWrapStyle">
      <slot v-if="isOverview" name="overview-extra" />
      <div
        v-for="field in fields"
        :key="field.key"
        :class="[
          inline ? 'inline-field' : 'registration-field',
          {
            full: field.full,
            invalid: errors[field.key],
            'desc-field': inline && field.full,
            'pair-field': paired,
            'pair-field--textarea': paired && isTextareaAttach(field.key),
            'pair-field--datetime': paired && field.control === 'datetime',
          },
        ]"
        :data-field="field.key"
      >
        <label
          :class="inline ? 'inline-label xl' : ''"
          :for="`registration-${field.key}`"
          :title="paired ? pairedLabelTitle(field) : undefined"
        >
          <span v-if="showRequired(field)" class="req">*</span>{{ field.label }}
        </label>
        <div
          :class="[
            inline ? 'inline-control' : 'field-control',
            { 'field-control--textarea-attach': isTextareaAttach(field.key), 'has-error': isTextareaAttach(field.key) && errors[field.key] },
          ]"
        >
          <FormSelect
            v-if="field.control === 'select'"
            :id="`registration-${field.key}`"
            class="field-control"
            :value="values[field.key] || undefined"
            :options="registrationFieldOptions(field, template, values)"
            :disabled="!editable || field.readonly"
            :status="errors[field.key] ? 'error' : undefined"
            :placeholder="field.placeholder || '请选择'"
            allow-clear
            @update:value="update(field.key, $event)"
          />
          <RegistrationDateTimePicker
            v-else-if="field.control === 'datetime'"
            :value="values[field.key]"
            :disabled="!editable || field.readonly"
            :invalid="!!errors[field.key]"
            :placeholder="field.placeholder || `请选择${field.label}`"
            @update:value="update(field.key, $event)"
          />
          <template v-else-if="field.control === 'textarea' && isTextareaAttach(field.key)">
            <OpTextareaAttach
              :id="`registration-${field.key}`"
              :model-value="values[field.key]"
              :attachments="textareaAttachments(field.key)"
              :readonly="!editable || field.readonly"
              :shell-background="!editable || field.readonly ? '#f5f5f5' : '#fff'"
              :placeholder="field.placeholder || `填写${field.label}`"
              :stretch="embedded && field.key === 'processResult'"
              :min-input-height="field.key === 'processResult' ? (isNew ? 120 : 96) : 54"
              :maxlength="2000"
              :max-file-size-mb="200"
              rename-duplicates
              @update:model-value="update(field.key, $event)"
              @update:attachments="onTextareaAttachments(field.key, $event)"
              @files-added="emit('textareaFilesAdded', field.key as 'description' | 'processResult', $event)"
            />
            <div class="textarea-count">{{ (values[field.key] || '').length }}/2000</div>
          </template>
          <textarea
            v-else-if="field.control === 'textarea'"
            :id="`registration-${field.key}`"
            class="field-control ant-input"
            :value="values[field.key]"
            :disabled="!editable || field.readonly"
            :placeholder="field.placeholder || `填写${field.label}`"
            rows="3"
            @input="update(field.key, nativeValue($event))"
          />
          <input
            v-else
            :id="`registration-${field.key}`"
            class="field-control"
            :value="values[field.key]"
            :type="field.control === 'amount' ? 'number' : 'text'"
            :step="field.control === 'amount' ? '0.01' : undefined"
            :min="field.control === 'amount' ? '0' : undefined"
            :disabled="!editable || field.readonly"
            :readonly="field.readonly"
            :placeholder="field.readonly ? '自动记录' : field.placeholder || `填写${field.label}`"
            @input="update(field.key, nativeValue($event))"
          />
          <div v-if="errors[field.key]" class="field-error">{{ errors[field.key] }}</div>
        </div>
      </div>
    </div>
    </div>
  </component>
</template>


<style scoped>
.registration-section {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(17, 24, 39, 0.07);
  min-width: 0;
  overflow: hidden;
}
.registration-embedded {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
}
.registration-embedded .registration-fields-body {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.registration-embedded .registration-fields--paired {
  padding: 0;
  gap: 8px;
}
/* 工单处理 Tab：末行 1fr，处理结果纵向撑满（与标准工单处理区一致） */
.registration-fields--stretch {
  flex: 1 1 auto;
  min-height: 0;
  height: 100%;
  align-content: stretch;
  grid-template-rows: auto auto auto minmax(0, 1fr);
}
.registration-fields--stretch .pair-field[data-field='processResult'] {
  align-items: stretch;
  align-self: stretch;
  min-height: 0;
}
.registration-fields--stretch .pair-field[data-field='processResult'] label {
  align-self: flex-start;
  padding-top: 6px;
  line-height: 1.4;
}
.registration-fields--stretch .pair-field[data-field='processResult'] .field-control--textarea-attach {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-height: 0;
  align-self: stretch;
}
.registration-fields--stretch .pair-field[data-field='processResult'] .field-control--textarea-attach :deep(.textarea-attach--stretch) {
  flex: 1 1 auto;
  min-height: 0;
}
.registration-fields--stretch .pair-field[data-field='processResult'] .textarea-count {
  flex: none;
}
.registration-embedded .registration-fields--paired .pair-field label {
  width: 56px;
  font-size: 12px;
  font-weight: 500;
  color: #374151;
}
/* paired 行内控件统一 30px（与侧栏退费、原生 input 一致） */
.registration-fields--paired .pair-field :deep(.ant-select-single) {
  height: 30px;
}
.registration-fields--paired .pair-field :deep(.ant-select-selector) {
  height: 30px !important;
  min-height: 30px !important;
  padding: 0 8px !important;
  font-size: 12px;
  align-items: center;
}
.registration-fields--paired .pair-field :deep(.ant-select-selection-item),
.registration-fields--paired .pair-field :deep(.ant-select-selection-placeholder) {
  line-height: 28px !important;
}
.registration-fields--paired .pair-field input.field-control,
.registration-fields--paired .pair-field :deep(.registration-datetime-picker),
.registration-fields--paired .pair-field :deep(.registration-datetime-picker .ant-picker) {
  min-height: 30px;
  height: 30px;
  font-size: 12px;
}
.registration-fields--paired .pair-field input.field-control {
  box-sizing: border-box;
  padding: 4px 8px;
  line-height: 1.25;
}
.section-heading {
  min-height: 40px;
  display: flex;
  align-items: center;
  padding: 10px 16px;
  background: #fafafb;
  border-bottom: 1px solid #e5e7eb;
}
.section-heading .section-title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  font-size: 12px;
  font-weight: 700;
  color: #111827;
  letter-spacing: 0.02em;
}
.section-bar {
  display: inline-block;
  width: 3px;
  height: 12px;
  border-radius: 2px;
  flex: none;
  background: #1a6fff;
}
.registration-fields {
  display: grid;
  grid-template-columns: repeat(var(--columns), minmax(0, 1fr));
  gap: 12px 16px;
  padding: 16px;
}
.registration-field {
  min-width: 0;
}
.registration-field.full {
  grid-column: 1 / -1;
}
.registration-fields--paired {
  grid-template-columns: repeat(var(--paired-cols, 1), minmax(0, 1fr));
  gap: 8px 14px;
  padding: 12px 16px 14px;
}
.registration-fields--paired .pair-field {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.registration-fields--paired .pair-field.full,
.registration-fields--paired .pair-field--textarea,
.registration-fields--paired .pair-field:has(textarea) {
  grid-column: 1 / -1;
  align-items: flex-start;
}
/* 顶栏 #overview-extra 插槽内容在父级 SFC，须 :deep 才能套用 pair-field 行内布局与整行跨度 */
.registration-fields--paired :deep(.pair-field.pair-field--contact),
.registration-fields--paired :deep(.pair-field--contact.full) {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 8px;
  min-width: 0;
  grid-column: 1 / -1;
}
.registration-fields--paired :deep(.pair-field--contact) label {
  flex: none;
  flex-shrink: 0;
  width: 84px;
  margin-bottom: 0;
  font-size: 12px;
  font-weight: 500;
  color: #374151;
  line-height: 30px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.registration-fields--paired :deep(.pair-field--contact) .field-control {
  flex: 1;
  min-width: 0;
}
.registration-fields--paired .pair-field label {
  flex: none;
  flex-shrink: 0;
  width: 84px;
  margin-bottom: 0;
  font-size: 12px;
  font-weight: 500;
  color: #374151;
  line-height: 30px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.registration-fields--paired .pair-field .field-control {
  flex: 1;
  min-width: 0;
}
.registration-fields--paired .pair-field--textarea label,
.registration-fields--paired .pair-field:has(textarea) label {
  line-height: 1.4;
  padding-top: 6px;
}
.registration-fields--paired .pair-field--datetime .field-control {
  flex: 1 1 auto;
  min-width: 0;
}
.registration-fields--paired .pair-field--datetime :deep(.registration-datetime-picker) {
  display: block;
  width: 100%;
  max-width: none;
}
.field-control--textarea-attach.has-error :deep(.textarea-shell) {
  border-color: #ff4d4f;
}
.textarea-count {
  margin-top: 4px;
  font-size: 11px;
  color: #9ca3af;
  text-align: right;
}
.registration-field label {
  display: flex;
  align-items: center;
  gap: 2px;
  font-size: 12px;
  color: #6b7280;
  margin-bottom: 6px;
}
.req {
  color: #f56c6c;
  margin-right: 1px;
}
.registration-field :deep(.ant-select),
.registration-field .field-control {
  width: 100%;
  font-size: 12px;
}
.registration-field :deep(.registration-datetime-picker),
.registration-inline :deep(.registration-datetime-picker) {
  width: 100%;
}
.registration-field :deep(.ant-select-single) {
  height: 30px;
}
.registration-field :deep(.ant-select-selector) {
  height: 30px !important;
  min-height: 30px !important;
  align-items: center;
}
.registration-field input.field-control,
.registration-field textarea.field-control {
  box-sizing: border-box;
  width: 100%;
  border: 1px solid #d1d5db;
  background: #fff;
  border-radius: 6px;
  padding: 4px 8px;
  font: 12px/1.5 inherit;
  color: #374151;
  min-height: 30px;
  outline: none;
}
.registration-field textarea.field-control {
  min-height: 80px;
  resize: vertical;
}
.registration-field input.field-control:focus,
.registration-field textarea.field-control:focus {
  border-color: #1a6fff;
  box-shadow: 0 0 0 2px rgb(26 111 255 / 10%);
}
.registration-field input.field-control:disabled,
.registration-field textarea.field-control:disabled,
.registration-inline input.field-control:disabled,
.registration-inline textarea.field-control:disabled,
.registration-fields--paired .pair-field input.field-control:disabled {
  background: #f5f5f5;
  border-color: #d9d9d9;
  color: rgba(0, 0, 0, 0.65);
  cursor: not-allowed;
  box-shadow: none;
}
.registration-field.invalid input,
.registration-field.invalid textarea,
.registration-field.invalid :deep(.ant-select-selector) {
  border-color: #ff4d4f !important;
}
.field-error {
  font-size: 11px;
  color: #ef4444;
  margin-top: 4px;
}

/* inline = 统一建单 uc-page 行内标签 */
.registration-inline {
  min-width: 0;
}
.registration-inline .row-1 {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 8px;
}
.registration-inline .row-2 {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px 12px;
}
.registration-inline .row-3 {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}
.registration-inline .inline-field {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.registration-inline .desc-field {
  grid-column: 1 / -1;
  align-items: flex-start;
}
.registration-inline .desc-field .inline-label {
  line-height: 30px;
}
.registration-inline .inline-label {
  flex: none;
  width: 76px;
  text-align: left;
  white-space: nowrap;
  font-size: 12px;
  font-weight: 500;
  color: #374151;
  line-height: 30px;
}
.registration-inline .inline-control {
  flex: 1;
  min-width: 0;
}
.registration-inline .inline-control :deep(.ant-select-single) {
  height: 30px;
}
.registration-inline .inline-control :deep(.ant-select-selector) {
  height: 30px !important;
  min-height: 30px !important;
  align-items: center;
}
.registration-inline input.field-control,
.registration-inline textarea.field-control {
  box-sizing: border-box;
  width: 100%;
  min-height: 30px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  padding: 4px 10px;
  font-size: 12px;
  color: #374151;
  outline: none;
}
.registration-inline textarea.field-control {
  padding-top: 5px;
  padding-bottom: 5px;
  resize: none;
  min-height: 72px;
}
.registration-inline input.field-control:focus,
.registration-inline textarea.field-control:focus {
  border-color: #1a6fff;
  box-shadow: 0 0 0 2px rgb(26 111 255 / 10%);
}
.registration-inline .desc-field textarea.field-control {
  min-height: 88px;
  resize: vertical;
}
@media (max-width: 850px) {
  .registration-fields {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

/* 顶栏双卡：与 OpOverviewBand 同构 */
.ob-col {
  box-sizing: border-box;
  height: 100%;
  border-radius: 8px;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  min-height: 0;
  border: 1px solid transparent;
  box-shadow: 0 2px 8px rgba(17, 24, 39, 0.07);
  background-clip: padding-box;
}
.ob-desc {
  background: linear-gradient(180deg, #fff 0%, #f8faff 100%);
  border-color: #bfdbfe;
  border-top: 3px solid #1a6fff;
}
.ob-stat {
  background: linear-gradient(180deg, #fff 0%, #faf8ff 100%);
  border-color: #ddd6fe;
  border-top: 3px solid #7c3aed;
}
.ob-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex: none;
  padding-bottom: 2px;
  border-bottom: 1px solid rgba(17, 24, 39, 0.06);
  gap: 12px;
}
.ob-title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  font-weight: 700;
  color: #111827;
  letter-spacing: 0.02em;
  min-width: 0;
}
.ob-bar {
  display: inline-block;
  width: 3px;
  height: 11px;
  border-radius: 2px;
  flex: none;
}
.ob-desc .ob-bar {
  background: #1a6fff;
}
.ob-stat .ob-bar {
  background: #7c3aed;
}
.ob-body {
  flex: 1;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  padding-right: 2px;
}
.ob-body .registration-fields--paired {
  gap: 5px 8px;
  padding: 4px 0 2px;
}
.ob-body .registration-fields--paired .pair-field label,
.ob-body .registration-fields--paired .pair-field--datetime label,
.ob-body .registration-fields--paired :deep(.pair-field--contact) label {
  width: 68px;
  font-size: 12px;
}
</style>
