<script setup lang="ts">
import { ExclamationCircleFilled, ArrowRightOutlined } from '@ant-design/icons-vue';
import type { TicketRelation } from '@/views/tickets/composables/ticketRelations';

/**
 * 被接管横幅 —— 本单已因升级而关闭，业务已转到新单。
 *
 * 业界口径（Zendesk 合并）：被取代的单**关闭并冻结字段**，只留指向新单的链接。
 * 所以这里不只是提示：整页同时锁为只读（底部操作栏不出、Tab 只读、头部动作禁用），
 * 否则催单/补充/再投诉都可能落在这张已作废的旧单上。
 */
defineProps<{ by: TicketRelation; status: string }>();
const emit = defineEmits<{ open: [] }>();
</script>

<template>
  <div class="sup-banner">
    <ExclamationCircleFilled class="sup-icon" />
    <span class="sup-text">
      本单已转单至 <b class="sup-no">{{ by.no }}</b>，当前为「{{ status }}」<b>页面已冻结</b>；
      后续<b>补充 / 催单 / 再投诉请在新单处理</b>。
    </span>
    <button type="button" class="sup-btn" @click="emit('open')">
      前往新单 {{ by.no }}<ArrowRightOutlined />
    </button>
  </div>
</template>

<style scoped>
.sup-banner {
  display: flex; align-items: center; gap: 10px;
  padding: 8px 20px;
  background: #fffbeb;
  border-bottom: 1px solid #fde68a;
  flex: none;
}
.sup-icon { color: #d97706; font-size: 15px; flex: none; }
.sup-text { flex: 1; min-width: 0; font-size: 12px; color: #92400e; line-height: 1.5; }
.sup-no { font-family: ui-monospace, monospace; }
.sup-btn {
  flex: none;
  display: inline-flex; align-items: center; gap: 5px;
  height: 28px; padding: 0 14px;
  border: none; border-radius: 6px;
  background: #d97706; color: #fff;
  font-size: 12px; font-weight: 600; cursor: pointer; font-family: inherit;
  box-shadow: 0 1px 4px rgba(217, 119, 6, 0.35);
}
.sup-btn:hover { background: #b45309; }
</style>
