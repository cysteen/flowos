<script setup lang="ts">
import { reactive, ref, watch } from 'vue';
import { message } from 'ant-design-vue';
import type { FieldDef } from '@/config/adminModules';

const props = defineProps<{
  open: boolean;
  title: string;
  fields: FieldDef[];
  /** 编辑时回填的初值 */
  initial?: Record<string, unknown> | null;
}>();
const emit = defineEmits<{ 'update:open': [v: boolean]; submit: [values: Record<string, unknown>] }>();

const form = reactive<Record<string, unknown>>({});
const errors = reactive<Record<string, boolean>>({});

watch(
  () => props.open,
  (o) => {
    if (o) {
      for (const f of props.fields) {
        form[f.key] = props.initial ? props.initial[f.key] ?? defaultVal(f) : defaultVal(f);
        errors[f.key] = false;
      }
    }
  },
);

function defaultVal(f: FieldDef): unknown {
  if (f.type === 'multiselect') return [];
  if (f.type === 'radio' && f.options?.length) return f.options[0];
  return '';
}

const submitting = ref(false);
function onOk() {
  let ok = true;
  for (const f of props.fields) {
    if (f.required) {
      const v = form[f.key];
      const empty = v === '' || v == null || (Array.isArray(v) && v.length === 0);
      errors[f.key] = empty;
      if (empty) ok = false;
    }
  }
  if (!ok) {
    message.error('请填写必填项');
    return;
  }
  submitting.value = true;
  emit('submit', { ...form });
  submitting.value = false;
  emit('update:open', false);
}
function onCancel() {
  emit('update:open', false);
}
</script>

<template>
  <a-modal
    :open="open"
    :title="title"
    :width="560"
    :confirm-loading="submitting"
    ok-text="确定"
    cancel-text="取消"
    @ok="onOk"
    @cancel="onCancel"
  >
    <a-form layout="vertical" class="admin-form">
      <a-form-item v-for="f in fields" :key="f.key" :validate-status="errors[f.key] ? 'error' : ''">
        <template #label>
          <span v-if="f.required" class="req">*</span>{{ f.label }}
        </template>
        <a-input v-if="f.type === 'text'" v-model:value="form[f.key] as string" :placeholder="f.placeholder || '请输入'" allow-clear />
        <a-input-password v-else-if="f.type === 'password'" v-model:value="form[f.key] as string" :placeholder="f.placeholder || '请输入'" />
        <a-textarea v-else-if="f.type === 'textarea'" v-model:value="form[f.key] as string" :rows="3" :placeholder="f.placeholder || '请输入'" />
        <a-input-number v-else-if="f.type === 'number'" v-model:value="form[f.key] as number" style="width: 100%" />
        <a-select
          v-else-if="f.type === 'select'"
          v-model:value="form[f.key] as string"
          placeholder="请选择"
          :options="(f.options || []).map((o) => ({ value: o, label: o }))"
        />
        <a-select
          v-else-if="f.type === 'multiselect'"
          v-model:value="form[f.key] as string[]"
          mode="multiple"
          placeholder="请选择"
          :options="(f.options || []).map((o) => ({ value: o, label: o }))"
        />
        <a-radio-group v-else-if="f.type === 'radio'" v-model:value="form[f.key] as string" button-style="solid">
          <a-radio-button v-for="o in f.options" :key="o" :value="o">{{ o }}</a-radio-button>
        </a-radio-group>
        <div v-if="f.tip" class="field-tip">{{ f.tip }}</div>
      </a-form-item>
    </a-form>
  </a-modal>
</template>

<style scoped>
.req {
  color: #ef4444;
  margin-right: 2px;
}
.field-tip {
  margin-top: 4px;
  font-size: 12px;
  color: #9ca3af;
}
.admin-form {
  max-height: 60vh;
  overflow-y: auto;
  padding-right: 4px;
}
</style>
