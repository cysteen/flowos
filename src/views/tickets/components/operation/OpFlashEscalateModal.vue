<script setup lang="ts">
/**
 * 刷机单 · 「升级二线」弹窗（930 教育刷机单 PRD §5.7 / M16）。
 * 目标组只读「教育刷机处理组」；升级说明必填（全空格按空）；已做排查多选。
 */
import { ref, watch } from 'vue';
import { RiseOutlined } from '@ant-design/icons-vue';
import OpActionModal from './OpActionModal.vue';
import {
  FLASH_ESCALATE_CHECKS, FLASH_POOLS, FLASH_TIP_ESCALATE_NOTE_REQUIRED, type FlashEscalateCheck,
} from '@/views/tickets/types/flash';

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{
  'update:open': [v: boolean];
  submit: [payload: { note: string; checks: FlashEscalateCheck[] }];
}>();

const note = ref('');
const checks = ref<FlashEscalateCheck[]>([]);
const noteError = ref('');

watch(
  () => props.open,
  (v) => {
    if (!v) return;
    note.value = '';
    checks.value = [];
    noteError.value = '';
  },
);

function onSubmit() {
  if (!note.value.trim()) {
    noteError.value = FLASH_TIP_ESCALATE_NOTE_REQUIRED;
    return;
  }
  // 已做排查按选项顺序落履历
  const picked = FLASH_ESCALATE_CHECKS.filter((c) => checks.value.includes(c));
  emit('submit', { note: note.value.trim(), checks: [...picked] });
  emit('update:open', false);
}
</script>

<template>
  <OpActionModal
    :open="open"
    title="升级二线"
    :icon="RiseOutlined"
    tone="warn"
    ok-text="确认升级"
    :width="520"
    @update:open="emit('update:open', $event)"
    @ok="onSubmit"
  >
    <div class="op-form">
      <div class="op-field">
        <span class="op-label">目标组</span>
        <a-input :value="FLASH_POOLS.l2.groupName" disabled />
      </div>
      <div class="op-field">
        <span class="op-label req">升级说明</span>
        <a-textarea
          v-model:value="note"
          :rows="4"
          :maxlength="500"
          placeholder="请输入升级说明"
          :status="noteError ? 'error' : ''"
          @change="noteError = ''"
        />
        <div v-if="noteError" class="esc-error">{{ noteError }}</div>
      </div>
      <div class="op-field">
        <span class="op-label">已做排查</span>
        <a-checkbox-group v-model:value="checks" :options="FLASH_ESCALATE_CHECKS.map((c) => ({ label: c, value: c }))" />
      </div>
    </div>
  </OpActionModal>
</template>

<style scoped>
.esc-error { font-size: 12px; line-height: 18px; color: #ef4444; }
</style>
