<script setup lang="ts">
/**
 * 刷机单 · 「升级二线确认」（1013 A18 / PRD §5.7）：一线处理结果选「升级二线」后点下送弹出，
 * 不填说明，确认后进教育刷机处理组池。
 */
import { RiseOutlined } from '@ant-design/icons-vue';
import OpActionModal from './OpActionModal.vue';
import { FLASH_ESCALATE_CONFIRM_TEXT } from '@/views/tickets/types/flash';

defineProps<{ open: boolean }>();
const emit = defineEmits<{
  'update:open': [v: boolean];
  submit: [];
}>();

function onSubmit() {
  emit('submit');
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
    :width="420"
    @update:open="emit('update:open', $event)"
    @ok="onSubmit"
  >
    <p class="esc-text">{{ FLASH_ESCALATE_CONFIRM_TEXT }}</p>
  </OpActionModal>
</template>

<style scoped>
.esc-text { margin: 0; font-size: 14px; line-height: 22px; color: #1f2937; }
</style>
