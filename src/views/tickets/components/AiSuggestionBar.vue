<script setup lang="ts">
import { ThunderboltOutlined, CloseOutlined } from '@ant-design/icons-vue';

defineEmits<{ view: []; close: [] }>();
</script>

<template>
  <div class="ai-bar">
    <div class="ai-avatar">
      <ThunderboltOutlined :style="{ color: '#7C3AED', fontSize: '16px' }" />
    </div>
    <div class="ai-text">
      <div class="ai-title">智能助手 · 今日建议</div>
      <div class="ai-sub">
        3 单建议升级处理 · 2 单可复用相似工单方案 · 1 单客户情绪预警，建议优先跟进
      </div>
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
  background: #f5f3ff;
  border: 1px solid #ddd6fe;
  border-radius: 10px;
}
.ai-avatar {
  width: 30px;
  height: 30px;
  flex: none;
  border-radius: 15px;
  background: #ede9fe;
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
  color: #6d28d9;
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
  color: #7c3aed;
  background: #fff;
  border: 1px solid #a855f7;
  border-radius: 6px;
  padding: 6px 14px;
  cursor: pointer;
}
.ai-close {
  color: #9ca3af;
  font-size: 14px;
  cursor: pointer;
}
</style>
