<script setup lang="ts">
import { RightOutlined } from '@ant-design/icons-vue';
import type { ComplaintInfo } from '@/views/tickets/types/operation';

defineProps<{ complaint: ComplaintInfo }>();
</script>

<template>
  <div class="side-card">
    <div class="card-title">投诉信息</div>
    <div class="meta-row">
      <div class="kv"><span class="k">投诉类型</span><span class="v">{{ complaint.complaintType }}</span></div>
      <div class="kv"><span class="k">投诉平台</span><span class="v">{{ complaint.platform }}</span></div>
    </div>
    <div class="kv">
      <span class="k">投诉编号</span>
      <span class="v">{{ complaint.complaintNo }}</span>
    </div>
    <div class="kv kv-tags">
      <span class="k">投诉标签</span>
      <div class="tag-path">
        <template v-for="(tag, i) in complaint.tags" :key="tag">
          <span class="pill-tag">{{ tag }}</span>
          <RightOutlined v-if="i < complaint.tags.length - 1" class="arrow" />
        </template>
      </div>
    </div>
    <div class="meta-row">
      <div class="kv"><span class="k">前期是否反馈</span><span class="v">{{ complaint.priorFeedback }}</span></div>
      <div class="kv"><span class="k">服务回溯</span><span class="v">{{ complaint.serviceReview }}</span></div>
    </div>
  </div>
</template>

<style scoped>
.side-card {
  background: #fff; border: 1px solid #e5e7eb; border-radius: 8px;
  padding: 14px; display: flex; flex-direction: column; gap: 8px;
}
.card-title { font-size: 14px; font-weight: 700; color: #111827; }
.meta-row { display: flex; gap: 16px; }
.meta-row .kv { flex: 1 1 0; min-width: 0; }
.kv { display: flex; align-items: center; gap: 8px; font-size: 12px; }
.kv .k { color: #9ca3af; flex: none; white-space: nowrap; }
.kv .v { color: #374151; font-weight: 500; min-width: 0; }
.kv-tags { align-items: center; }
.pill-tag {
  font-size: 10px; color: #374151; background: #f3f4f6;
  border-radius: 3px; padding: 2px 6px; flex: none;
}
.tag-path { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; flex: 1; min-width: 0; }
.arrow { color: #d1d5db; font-size: 12px; }
</style>
