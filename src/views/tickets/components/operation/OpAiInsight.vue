<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { ThunderboltOutlined } from '@ant-design/icons-vue';
import type { AiTicketInsight } from '@/views/tickets/types/operation';

const props = defineProps<{ insight: AiTicketInsight; expanded?: boolean }>();

const summaryLine = computed(
  () => `客户：${props.insight.customerBrief}；工单：${props.insight.ticketBrief}；建议：${props.insight.suggestion}`,
);

/**
 * 收起态按卡内可容纳的整行数截断（末行带省略号）：卡高由所在速览带决定，
 * 固定 3 行在矮卡里会被容器拦腰裁掉半行。
 */
const textEl = ref<HTMLElement | null>(null);
const clampLines = ref(3);
let ro: ResizeObserver | null = null;

function measure() {
  const el = textEl.value;
  if (!el) return;
  const lh = parseFloat(getComputedStyle(el).lineHeight);
  if (!lh) return;
  clampLines.value = Math.max(1, Math.floor((el.clientHeight + 0.5) / lh));
}

onMounted(() => {
  measure();
  if (typeof ResizeObserver !== 'undefined' && textEl.value) {
    ro = new ResizeObserver(measure);
    ro.observe(textEl.value);
  }
});
onBeforeUnmount(() => { ro?.disconnect(); ro = null; });
</script>

<template>
  <div class="ai-insight" :class="{ expanded }" :title="summaryLine">
    <div class="ai-head">
      <span class="ai-brand"><ThunderboltOutlined class="ai-icon" />AI洞察</span>
      <span v-if="insight.riskTag" class="risk-tag">{{ insight.riskTag }}</span>
    </div>
    <p ref="textEl" class="ai-text" :style="{ '--ai-clamp': clampLines }">{{ summaryLine }}</p>
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
  -webkit-line-clamp: var(--ai-clamp, 3);
  line-clamp: var(--ai-clamp, 3);
  overflow: hidden;
  word-break: break-word;
}
.ai-insight.expanded .ai-text {
  display: block;
  -webkit-line-clamp: unset;
  line-clamp: unset;
  overflow: visible;
}
</style>
