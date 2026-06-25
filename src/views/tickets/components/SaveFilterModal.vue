<script setup lang="ts">
import { computed, ref, watch } from 'vue';

const props = defineProps<{
  open: boolean;
}>();

const emit = defineEmits<{
  'update:open': [v: boolean];
  save: [name: string];
}>();

const name = ref('');
const MAX_LEN = 25;

watch(
  () => props.open,
  (v) => {
    if (v) name.value = '';
  },
);

const count = computed(() => name.value.length);
const canSave = computed(() => name.value.trim().length > 0);

function close() {
  emit('update:open', false);
}

function confirm() {
  const trimmed = name.value.trim();
  if (!trimmed) return;
  emit('save', trimmed.slice(0, MAX_LEN));
  emit('update:open', false);
}
</script>

<template>
  <a-modal
    :open="open"
    title="保存筛选器"
    :width="480"
    :footer="null"
    destroy-on-close
    @cancel="close"
  >
    <div class="save-filter-form">
      <label class="sf-label">
        <span class="sf-req">*</span>
        筛选器名称
      </label>
      <div class="sf-input-wrap">
        <input
          v-model="name"
          class="sf-input"
          type="text"
          placeholder="请输入筛选器名称"
          :maxlength="MAX_LEN"
          @keyup.enter="confirm"
        />
        <span class="sf-count">{{ count }}/{{ MAX_LEN }}</span>
      </div>
    </div>

    <div class="sf-foot">
      <button type="button" class="sf-btn sf-btn--ghost" @click="close">取消</button>
      <button type="button" class="sf-btn sf-btn--primary" :disabled="!canSave" @click="confirm">
        保存
      </button>
    </div>
  </a-modal>
</template>

<style scoped>
.save-filter-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px 0 4px;
}
.sf-label {
  font-size: 14px;
  color: #374151;
}
.sf-req {
  color: #ef4444;
  margin-right: 2px;
}
.sf-input-wrap {
  position: relative;
}
.sf-input {
  width: 100%;
  height: 36px;
  padding: 0 52px 0 12px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 14px;
  color: #111827;
  outline: none;
  box-sizing: border-box;
}
.sf-input:focus {
  border-color: #1a6fff;
  box-shadow: 0 0 0 2px rgb(26 111 255 / 10%);
}
.sf-input::placeholder {
  color: #9ca3af;
}
.sf-count {
  position: absolute;
  right: 12px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 12px;
  color: #9ca3af;
  pointer-events: none;
}
.sf-foot {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 24px;
  padding-top: 16px;
  border-top: 1px solid #f0f0f0;
}
.sf-btn {
  min-width: 72px;
  height: 32px;
  padding: 0 16px;
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
}
.sf-btn--ghost {
  border: 1px solid #d1d5db;
  background: #fff;
  color: #374151;
}
.sf-btn--ghost:hover {
  border-color: #9ca3af;
}
.sf-btn--primary {
  border: none;
  background: #1a6fff;
  color: #fff;
}
.sf-btn--primary:hover:not(:disabled) {
  background: #0f4fcc;
}
.sf-btn--primary:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
</style>
