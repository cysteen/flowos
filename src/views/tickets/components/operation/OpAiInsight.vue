<script setup lang="ts">
import { computed } from 'vue';
import { ThunderboltOutlined } from '@ant-design/icons-vue';
import type { AiTicketInsight } from '@/views/tickets/types/operation';

const props = defineProps<{ insight: AiTicketInsight }>();

const summaryLine = computed(
  () => `客户：${props.insight.customerBrief}；工单：${props.insight.ticketBrief}；建议：${props.insight.suggestion}`,
);
</script>

<template>
  <div class="ai-insight" :title="summaryLine">
    <span class="ai-brand"><ThunderboltOutlined class="ai-icon" />AI洞察</span>
    <span v-if="insight.riskTag" class="risk-tag">{{ insight.riskTag }}</span>
    <p class="ai-text">{{ summaryLine }}</p>
  </div>
</template>

<style scoped>
.ai-insight {
  flex: none;
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 28px;
  padding: 4px 8px;
  border-radius: 6px;
  background: linear-gradient(90deg, #faf5ff 0%, #fff 100%);
  border: 1px solid #e9d5ff;
  min-width: 0;
}
.ai-brand {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex: none;
  font-size: 11px;
  font-weight: 700;
  color: #6d28d9;
  white-space: nowrap;
}
.ai-icon { font-size: 12px; }
.risk-tag {
  flex: none;
  font-size: 10px;
  font-weight: 600;
  color: #b45309;
  background: #fffbeb;
  border: 1px solid #fcd34d;
  border-radius: 4px;
  padding: 0 5px;
  line-height: 16px;
  white-space: nowrap;
}
.ai-text {
  flex: 1;
  min-width: 0;
  margin: 0;
  font-size: 11px;
  line-height: 1.35;
  color: #4b5563;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
