<script setup lang="ts">
import { PaperClipOutlined } from '@ant-design/icons-vue';
import type { TicketDetailMeta } from '@/mock/ticketDetail';

defineProps<{ detail: Pick<TicketDetailMeta,
  'source' | 'expectedResolve' | 'businessType' | 'businessLine' |
  'issueOccurredAt' | 'demand' | 'attachments'
> }>();
</script>

<template>
  <div class="summary-card">
    <div class="sc-title">工单摘要</div>
    <div class="meta-grid">
      <div class="meta-row">
        <div class="meta-item"><span class="k">工单来源</span><span class="v">{{ detail.source }}</span></div>
        <div class="meta-item"><span class="k">期望解决</span><span class="v">{{ detail.expectedResolve }}</span></div>
      </div>
      <div class="meta-row">
        <div class="meta-item"><span class="k">业务类型</span><span class="v">{{ detail.businessType }}</span></div>
        <div class="meta-item"><span class="k">归属业务线</span><span class="v">{{ detail.businessLine }}</span></div>
      </div>
      <div class="meta-item solo">
        <span class="k">问题发生时间</span><span class="v">{{ detail.issueOccurredAt }}</span>
      </div>
    </div>
    <div class="demand-box">
      <div class="demand-label">客户诉求</div>
      <div class="demand-text">{{ detail.demand }}</div>
    </div>
    <div class="attachments">
      <span v-for="a in detail.attachments" :key="a" class="attach">
        <PaperClipOutlined :style="{ fontSize: '13px', color: '#6B7280' }" />{{ a }}
      </span>
    </div>
  </div>
</template>

<style scoped>
.summary-card {
  background: #fff; border: 1px solid #e5e7eb; border-radius: 8px;
  padding: 16px; display: flex; flex-direction: column; gap: 12px;
}
.sc-title { font-size: 15px; font-weight: 700; color: #111827; }
.meta-grid { display: flex; flex-direction: column; gap: 8px; }
.meta-row { display: flex; gap: 16px; }
.meta-item {
  display: flex; align-items: center; gap: 8px;
  flex: 1 1 0; min-width: 0; font-size: 12px;
}
.meta-item.solo { flex: none; width: 100%; }
.meta-item .k { color: #9ca3af; flex: none; white-space: nowrap; }
.meta-item .v { color: #374151; font-weight: 500; min-width: 0; }
.demand-box {
  background: #f9fafb; border-radius: 6px; padding: 12px;
  display: flex; flex-direction: column; gap: 6px;
}
.demand-label { font-size: 12px; font-weight: 600; color: #6b7280; }
.demand-text { font-size: 13px; color: #374151; line-height: 1.6; }
.attachments { display: flex; gap: 8px; flex-wrap: wrap; }
.attach {
  display: inline-flex; align-items: center; gap: 6px;
  font-size: 12px; color: #374151; background: #f3f4f6;
  border-radius: 6px; padding: 6px 10px;
}
</style>
