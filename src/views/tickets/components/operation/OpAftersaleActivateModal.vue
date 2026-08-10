<script setup lang="ts">
/**
 * 转售后 · 激活来源售后单（售后转入工单专用）
 *
 * 形态对齐「下送」的二次确认：一句问话 + 一张认人的单据卡，没有表单字段——
 * 激活不需要坐席再填任何东西，要确认的只有"是不是这张单"。
 */
import { ToolOutlined } from '@ant-design/icons-vue';
import OpActionModal from './OpActionModal.vue';

defineProps<{
  open: boolean;
  /** 来源售后单号 */
  no: string;
  title?: string;
  /** 提交中：接口在途时锁住按钮，避免重复激活 */
  loading?: boolean;
}>();

const emit = defineEmits<{
  'update:open': [v: boolean];
  confirm: [];
}>();
</script>

<template>
  <OpActionModal
    :open="open"
    title="激活售后工单"
    :icon="ToolOutlined"
    tone="primary"
    ok-text="确认激活"
    :confirm-loading="loading"
    :width="440"
    @update:open="emit('update:open', $event)"
    @ok="emit('confirm')"
    @cancel="emit('update:open', false)"
  >
    <div class="asa-confirm">
      <div class="asa-ask">本单由售后转入，确认激活以下售后工单？</div>
      <div class="asa-ticket">
        <span class="asa-no">{{ no }}</span>
        <span v-if="title" class="asa-title">{{ title }}</span>
      </div>
    </div>
  </OpActionModal>
</template>

<style scoped>
.asa-confirm { display: flex; flex-direction: column; gap: 10px; }
.asa-ask { font-size: 14px; color: #374151; line-height: 1.6; }
.asa-ticket {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 12px;
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
}
.asa-no { font-size: 14px; color: #374151; line-height: 1.6; }
.asa-title { font-size: 14px; font-weight: 600; color: #111827; line-height: 1.5; }
</style>
