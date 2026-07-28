<script setup lang="ts">
import { VerticalAlignBottomOutlined } from '@ant-design/icons-vue';
import OpActionModal from './OpActionModal.vue';

const props = defineProps<{
  open: boolean;
  ticketNo: string;
  ticketTitle: string;
  /** 委派中：下送=协办完成、回到委派节点，不结案 */
  backToDelegator?: boolean;
  delegateTargets?: string;
}>();

const emit = defineEmits<{
  'update:open': [v: boolean];
  confirm: [payload: { ticketTitle: string }];
}>();

function close() {
  emit('update:open', false);
}

// 下送无表单字段：必填项已在底栏点击前校验，此处仅做二次提醒
function onSubmit() {
  emit('confirm', { ticketTitle: props.ticketTitle });
  close();
}
</script>

<template>
  <OpActionModal
    :open="open"
    :title="backToDelegator ? '下送 · 回到委派节点' : '下送'"
    :icon="VerticalAlignBottomOutlined"
    tone="success"
    ok-text="确认下送"
    :width="440"
    @update:open="emit('update:open', $event)"
    @ok="onSubmit"
    @cancel="close"
  >
    <div class="fwd-confirm">
      <div class="fwd-ask">
        {{ backToDelegator ? '确认完成协办并将以下工单送回委派节点？' : '确认下送以下工单？' }}
      </div>
      <div class="fwd-ticket">
        <span class="fwd-no">{{ ticketNo }}</span>
        <span class="fwd-title">{{ ticketTitle }}</span>
      </div>
    </div>
  </OpActionModal>
</template>

<style scoped>
.fwd-confirm { display: flex; flex-direction: column; gap: 10px; }
.fwd-ask { font-size: 14px; color: #374151; line-height: 1.6; }
.fwd-ticket {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 12px;
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
}
.fwd-no { font-size: 14px; color: #374151; line-height: 1.6; }
.fwd-title { font-size: 14px; font-weight: 600; color: #111827; line-height: 1.5; }
</style>
