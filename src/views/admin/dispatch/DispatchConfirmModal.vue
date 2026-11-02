<script setup lang="ts">
// 派单开关类二次确认（PRD 8.2）：走 OpActionModal 统一壳，影响说明用 op-tip 提示条
import { PoweroffOutlined } from '@ant-design/icons-vue';
import OpActionModal from '@/views/tickets/components/operation/OpActionModal.vue';

withDefaults(defineProps<{
  open: boolean;
  title: string;
  /** 影响说明（原文照录） */
  tip: string;
  okText?: string;
  /** 关闭类走 danger，开启类走 primary */
  danger?: boolean;
}>(), { okText: '确定', danger: false });

const emit = defineEmits<{ 'update:open': [v: boolean]; ok: [] }>();
</script>

<template>
  <OpActionModal
    :open="open"
    :title="title"
    :icon="PoweroffOutlined"
    :tone="danger ? 'warn' : 'primary'"
    :ok-tone="danger ? 'danger' : 'primary'"
    :width="440"
    :ok-text="okText"
    cancel-text="取消"
    @update:open="emit('update:open', $event)"
    @ok="emit('ok'); emit('update:open', false)"
  >
    <div class="op-form">
      <div class="op-tip" :class="danger ? 'op-tip-warn' : 'op-tip-info'">{{ tip }}</div>
    </div>
  </OpActionModal>
</template>
