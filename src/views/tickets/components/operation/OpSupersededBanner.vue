<script setup lang="ts">
import { ArrowRightOutlined } from '@ant-design/icons-vue';
import type { TicketRelation } from '@/views/tickets/composables/ticketRelations';

defineProps<{ by: TicketRelation }>();
const emit = defineEmits<{ open: [] }>();
</script>

<template>
  <div class="sup-strip">
    <button
      type="button"
      class="sup-btn"
      :title="`前往 新单 ${by.no} 处理`"
      @click="emit('open')"
    >
      <span class="sup-btn-text">前往 新单 {{ by.no }} 处理</span>
      <ArrowRightOutlined class="sup-btn-icon" />
    </button>
  </div>
</template>

<style scoped>
.sup-strip {
  display: flex;
  align-items: center;
  flex: none;
  min-width: 0;
  max-width: min(480px, 40vw);
  padding-left: 12px;
  margin-left: 4px;
  border-left: 1px solid #e5e7eb;
}
.sup-btn {
  flex: 1;
  min-width: 0;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 12px;
  border: none;
  border-radius: 6px;
  background: #1a6fff;
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  line-height: 1;
  cursor: pointer;
  font-family: inherit;
  white-space: nowrap;
  box-shadow: 0 1px 3px rgba(26, 111, 255, 0.22);
  transition: background 0.15s, box-shadow 0.15s;
}
.sup-btn:hover {
  background: #1557d6;
  box-shadow: 0 2px 8px rgba(26, 111, 255, 0.28);
}
.sup-btn-text {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}
.sup-btn-icon {
  flex: none;
  font-size: 13px;
}
</style>
