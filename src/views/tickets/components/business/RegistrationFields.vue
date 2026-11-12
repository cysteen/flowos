<script setup lang="ts">
import { computed } from 'vue';
import FormSelect from '@/views/tickets/components/create-ticket/FormSelect.vue';
import type {
  RegistrationFieldKey, RegistrationTemplate, RegistrationValidationErrors, RegistrationValues,
} from '@/views/tickets/types/businessRegistration';
import {
  registrationFieldOptions, registrationFieldVisible, type RegistrationEditorSection,
} from './registrationEditorConfig';

const props = defineProps<{
  section: RegistrationEditorSection;
  template: RegistrationTemplate;
  values: RegistrationValues;
  errors: RegistrationValidationErrors;
  isNew: boolean;
  editable: boolean;
}>();
const emit = defineEmits<{ change: [key: RegistrationFieldKey, value: string] }>();
const fields = computed(() => props.section.fields.filter((field) => registrationFieldVisible(field, props.template, props.values)));
function update(key: RegistrationFieldKey, value: unknown) {
  emit('change', key, value == null ? '' : String(value));
}
function nativeValue(event: Event) { return (event.target as HTMLInputElement).value; }
</script>

<template>
  <section class="registration-section" :data-region="section.id">
    <header class="section-heading"><strong>{{ section.title }}</strong><span>{{ section.subtitle }}</span></header>
    <div class="registration-fields" :style="{ '--columns': section.columns }">
      <div v-for="field in fields" :key="field.key" class="registration-field" :class="{ full: field.full, invalid: errors[field.key] }" :data-field="field.key">
        <label :for="`registration-${field.key}`">
          <span v-if="field.createRequired || (!isNew && field.closeRequired)" class="required">*</span>{{ field.label }}
          <small v-if="isNew && field.createRequired" class="creation-required">创建必填</small>
          <small v-else-if="isNew && field.closeRequired">结案前补齐</small>
          <small v-else-if="!field.closeRequired && !field.readonly">选填</small>
        </label>
        <FormSelect
          v-if="field.control === 'select'"
          :id="`registration-${field.key}`"
          :value="values[field.key] || undefined"
          :options="registrationFieldOptions(field, template, values)"
          :disabled="!editable || field.readonly"
          :status="errors[field.key] ? 'error' : undefined"
          :placeholder="field.placeholder || '请选择'"
          allow-clear
          @update:value="update(field.key, $event)"
        />
        <textarea
          v-else-if="field.control === 'textarea'"
          :id="`registration-${field.key}`"
          :value="values[field.key]"
          :disabled="!editable || field.readonly"
          :placeholder="field.placeholder || `填写${field.label}`"
          rows="3"
          @input="update(field.key, nativeValue($event))"
        />
        <input
          v-else
          :id="`registration-${field.key}`"
          :value="field.control === 'datetime' ? values[field.key].replace(' ', 'T') : values[field.key]"
          :type="field.control === 'datetime' ? 'datetime-local' : field.control === 'amount' ? 'number' : 'text'"
          :step="field.control === 'datetime' ? '1' : field.control === 'amount' ? '0.01' : undefined"
          :min="field.control === 'amount' ? '0' : undefined"
          :disabled="!editable || field.readonly"
          :readonly="field.readonly"
          :placeholder="field.readonly ? '保存或结案时自动记录' : field.placeholder || `填写${field.label}`"
          @input="update(field.key, nativeValue($event))"
        />
        <div v-if="errors[field.key]" class="field-error">{{ errors[field.key] }}</div>
        <div v-else-if="field.help" class="field-help">{{ field.help }}</div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.registration-section{background:#fff;border:1px solid #e3e9f1;border-radius:7px;min-width:0;overflow:hidden}
.section-heading{min-height:38px;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:9px 13px;background:#f8fafd;border-bottom:1px solid #e8edf4}
.section-heading strong{font-size:13px;font-weight:600;color:#253851}.section-heading span{color:#8a98aa;font-size:11px}
.registration-fields{display:grid;grid-template-columns:repeat(var(--columns),minmax(0,1fr));gap:12px 15px;padding:13px}
.registration-field{min-width:0}.registration-field.full{grid-column:1/-1}.registration-field label{display:flex;align-items:center;gap:4px;flex-wrap:wrap;font-size:12px;color:#63738a;margin-bottom:5px;min-height:19px}
.required{color:#e35b65}.registration-field small{font-size:10px;color:#99a6b6;font-weight:400;margin-left:3px}.registration-field .creation-required{color:#3d77c6}
.registration-field :deep(.ant-select){width:100%;font-size:13px}.registration-field :deep(.ant-select-selector){min-height:34px!important;align-items:center}
.registration-field input,.registration-field textarea{box-sizing:border-box;width:100%;border:1px solid #dbe3ee;background:#fff;border-radius:5px;padding:7px 9px;font:13px/1.6 inherit;line-height:1.6;color:#263b56;min-height:34px;outline:none}
.registration-field textarea{resize:vertical;font-size:13px;font-family:inherit;min-height:86px}.registration-field input{font-family:inherit;font-size:13px}
.registration-field input:focus,.registration-field textarea:focus{border-color:#91b8fa;box-shadow:0 0 0 2px #e8f1ff}.registration-field input:disabled,.registration-field textarea:disabled{background:#f6f8fb;color:#7c8a9c;cursor:not-allowed}
.registration-field.invalid input,.registration-field.invalid textarea{border-color:#ef7d84}.field-error{font-size:11px;color:#d6545e;margin-top:4px}.field-help{font-size:10px;color:#95a0b1;margin-top:4px;line-height:1.6}
@media(max-width:1250px){.registration-fields{gap:10px;padding:11px}.section-heading{padding:8px 11px}.section-heading span{font-size:10px}}
@media(max-width:850px){.registration-fields{grid-template-columns:repeat(2,minmax(0,1fr))}}
</style>
