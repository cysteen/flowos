<script setup lang="ts">
import { computed } from 'vue';
import { ThunderboltOutlined, CloseOutlined } from '@ant-design/icons-vue';
import type { AiSuggestionSummary } from '@/views/tickets/types/aiSuggestion';

const props = defineProps<{
  summary: AiSuggestionSummary;
}>();

defineEmits<{ view: []; close: [] }>();

const subtitle = computed(() => {
  const parts: string[] = [];
  if (props.summary.upgrade > 0) parts.push(`${props.summary.upgrade} 单建议升级处理`);
  if (props.summary.similar > 0) parts.push(`${props.summary.similar} 单可复用相似工单方案`);
  if (props.summary.emotion > 0) parts.push(`${props.summary.emotion} 单客户情绪预警`);
  if (parts.length === 0) return '暂无待处理建议';
  return `${parts.join(' · ')}，建议优先跟进`;
});
</script>

<template>
  <div class="ai-bar">
    <div class="ai-avatar">
      <ThunderboltOutlined :style="{ color: '#1A6FFF', fontSize: '16px' }" />
    </div>
    <div class="ai-text">
      <div class="ai-title">智能助手 · 今日建议</div>
      <div class="ai-sub">{{ subtitle }}</div>
    </div>
    <div class="ai-spacer"></div>
    <div class="ai-view-btn" @click="$emit('view')">查看建议</div>
    <CloseOutlined class="ai-close" @click="$emit('close')" />
  </div>
</template>

<style scoped>
.ai-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
}
.ai-avatar {
  width: 30px;
  height: 30px;
  flex: none;
  border-radius: 15px;
  background: #eff6ff;
  display: flex;
  align-items: center;
  justify-content: center;
}
.ai-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.ai-title {
  font-size: 13px;
  font-weight: 700;
  color: #374151;
}
.ai-sub {
  font-size: 12px;
  color: #6b7280;
}
.ai-spacer {
  flex: 1;
}
.ai-view-btn {
  font-size: 13px;
  font-weight: 600;
  color: #1a6fff;
  background: #fff;
  border: 1px solid #bfdbfe;
  border-radius: 6px;
  padding: 6px 14px;
  cursor: pointer;
}
.ai-view-btn:hover {
  border-color: #1a6fff;
}
.ai-close {
  color: #9ca3af;
  font-size: 14px;
  cursor: pointer;
}
</style>
