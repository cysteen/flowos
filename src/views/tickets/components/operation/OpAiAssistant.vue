<script setup lang="ts">
import { ThunderboltOutlined, BookOutlined } from '@ant-design/icons-vue';
import type { SimilarTicket } from '@/mock/ticketDetail';

defineProps<{
  similarTicket: SimilarTicket;
  knowledge: string[];
  aiSummary: string;
}>();

const emit = defineEmits<{ action: [name: string] }>();
</script>

<template>
  <div class="side-card ai-card">
    <div class="ai-title"><ThunderboltOutlined /> AI 助手</div>

    <div class="ai-sub">相似工单挖掘</div>
    <div class="similar-card">
      <div class="similar-top">
        <span class="ticket-no">{{ similarTicket.no }}</span>
        <span class="sim-tag">{{ similarTicket.similarity }}</span>
      </div>
      <div class="similar-title">{{ similarTicket.title }}</div>
      <div class="similar-solution">{{ similarTicket.solution }}</div>
      <div class="similar-actions">
        <button class="btn-ghost-purple" @click="emit('action', '查看方案')">查看</button>
        <button class="btn-purple" @click="emit('action', '复用方案')">复用方案</button>
      </div>
    </div>

    <div class="ai-sub">知识推荐</div>
    <div v-for="(k, i) in knowledge" :key="i" class="ai-know">
      <span class="ai-know-text"><BookOutlined :style="{ color: '#7C3AED', fontSize: '13px' }" />{{ k }}</span>
      <span class="ai-adopt" @click="emit('action', '采纳知识')">采纳</span>
    </div>

    <div class="ai-block">
      <div class="ai-sub">AI 摘要</div>
      <div class="ai-text">{{ aiSummary }}</div>
    </div>
  </div>
</template>

<style scoped>
.side-card {
  background: #f5f3ff; border: 1px solid #ddd6fe; border-radius: 8px;
  padding: 14px; display: flex; flex-direction: column; gap: 10px;
}
.ai-title { font-size: 14px; font-weight: 700; color: #6d28d9; display: flex; align-items: center; gap: 6px; }
.ai-sub { font-size: 11px; font-weight: 600; color: #7c3aed; }
.similar-card { background: #fff; border-radius: 6px; padding: 10px; display: flex; flex-direction: column; gap: 6px; }
.similar-top { display: flex; align-items: center; justify-content: space-between; }
.ticket-no { font-size: 12px; color: #1a6fff; font-weight: 600; }
.sim-tag { font-size: 10px; font-weight: 600; color: #10b981; background: #10b9811f; padding: 1px 6px; border-radius: 3px; }
.similar-title { font-size: 12px; color: #374151; }
.similar-solution { font-size: 11px; color: #9ca3af; line-height: 1.5; }
.similar-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 2px; }
.btn-ghost-purple { font-size: 11px; font-weight: 600; color: #7c3aed; background: #fff; border: 1px solid #7c3aed; border-radius: 4px; padding: 3px 10px; cursor: pointer; }
.btn-purple { font-size: 11px; font-weight: 600; color: #fff; background: #7c3aed; border: none; border-radius: 4px; padding: 3px 10px; cursor: pointer; }
.ai-block { background: #fff; border-radius: 6px; padding: 10px; display: flex; flex-direction: column; gap: 4px; }
.ai-text { font-size: 12px; color: #374151; line-height: 1.6; }
.ai-know { display: flex; align-items: center; justify-content: space-between; gap: 8px; background: #fff; border-radius: 6px; padding: 10px; }
.ai-know-text { display: flex; align-items: center; gap: 6px; font-size: 12px; color: #374151; flex: 1; min-width: 0; }
.ai-adopt { font-size: 11px; color: #fff; background: #7c3aed; border-radius: 4px; padding: 3px 10px; cursor: pointer; flex: none; }
</style>
