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
    <div class="ai-head">
      <span class="ai-brand"><ThunderboltOutlined class="ai-icon" />AI洞察</span>
      <span v-if="insight.riskTag" class="risk-tag">{{ insight.riskTag }}</span>
    </div>
    <p class="ai-text">{{ summaryLine }}</p>
  </div>
</template>

<style scoped>
.ai-insight {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 6px 8px;
  border-radius: 6px;
  background: linear-gradient(90deg, #faf5ff 0%, #fff 100%);
  border: 1px solid #e9d5ff;
  min-width: 0;
}
.ai-head {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: none;
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
  min-height: 0;
  margin: 0;
  font-size: 11px;
  line-height: 1.45;
  color: #4b5563;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
  line-clamp: 3;
  overflow: hidden;
  word-break: break-word;
}
</style>
