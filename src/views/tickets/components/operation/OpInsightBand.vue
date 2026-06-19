<script setup lang="ts">
import { BellOutlined } from '@ant-design/icons-vue';
import type { InsightStats } from '@/views/tickets/types/operation';

defineProps<{ insight: InsightStats }>();
const emit = defineEmits<{ link: [target: 'history' | 'related'] }>();
</script>

<template>
  <div class="insight-band">
    <div class="ib-title">
      <BellOutlined class="ib-icon" />处理洞察
    </div>
    <div class="ib-line">
      <span class="muted">该客户进线：</span>
      <span class="emph">{{ insight.inboundCount }}次</span>
      <span class="muted">，历史工单：</span>
      <span class="emph">{{ insight.historyCount }}单</span>
      <span class="muted">；投诉单：</span>
      <span class="emph">{{ insight.complaintCount }}单</span>
      <span class="muted">；最近30天：</span>
      <span class="emph">{{ insight.recent30Count }}单</span>
      <span class="sep"> · </span>
      <span class="link" @click="emit('link', 'history')">查看历史工单 ›</span>
    </div>
    <div class="ib-line">
      <span class="muted">该工单被催：</span>
      <span class="emph">{{ insight.dunningCount }}次</span>
      <span class="muted">，补充信息：</span>
      <span class="emph">{{ insight.supplementCount }}次</span>
      <span class="muted">，关联工单：</span>
      <span class="emph">{{ insight.relatedCount }}个</span>
      <span class="sep"> · </span>
      <span class="link" @click="emit('link', 'related')">查看关联工单 ›</span>
    </div>
  </div>
</template>

<style scoped>
.insight-band {
  background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px;
  padding: 12px 16px; display: flex; flex-direction: column; gap: 6px;
  min-height: 90px;
}
.ib-title {
  display: flex; align-items: center; gap: 6px;
  font-size: 12px; font-weight: 600; color: #92400e;
}
.ib-icon { color: #d97706; font-size: 14px; }
.ib-line { font-size: 13px; line-height: 1.5; }
.muted { color: #6b7280; }
.emph { color: #dc2626; font-weight: 600; }
.sep { color: #9ca3af; }
.link { color: #1a6fff; font-weight: 500; cursor: pointer; }
.link:hover { text-decoration: underline; }
</style>
