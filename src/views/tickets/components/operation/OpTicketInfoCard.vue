<script setup lang="ts">
import { RightOutlined } from '@ant-design/icons-vue';
import type { TicketDetailMeta } from '@/mock/ticketDetail';

defineProps<{ detail: TicketDetailMeta }>();
</script>

<template>
  <div class="side-card">
    <div class="card-title">工单信息</div>

    <!-- 工单属性 -->
    <div class="kv"><span class="k">工单来源</span><span class="v">{{ detail.source }}</span></div>
    <div class="meta-row">
      <div class="kv"><span class="k">业务类型</span><span class="v">{{ detail.businessType }}</span></div>
      <div class="kv"><span class="k">业务线</span><span class="v">{{ detail.businessLine }}</span></div>
    </div>

    <div class="divider" />

    <!-- 产品 -->
    <div class="kv"><span class="k">产品分类</span><span class="v">{{ detail.product.category }}</span></div>
    <div class="kv kv-name">
      <span class="k">产品名称</span>
      <div class="kv-value-with-tags">
        <span class="v">{{ detail.product.name }}</span>
        <span class="pill-tags">
          <span v-for="tag in detail.product.tags" :key="tag" class="pill-tag">{{ tag }}</span>
        </span>
      </div>
    </div>
    <div class="kv kv-tags">
      <span class="k">问题标签</span>
      <div class="tag-path">
        <template v-for="(tag, i) in detail.product.issueTags" :key="tag">
          <span class="pill-tag">{{ tag }}</span>
          <RightOutlined v-if="i < detail.product.issueTags.length - 1" class="arrow" />
        </template>
      </div>
    </div>
    <div class="kv"><span class="k">问题发生时间</span><span class="v">{{ detail.issueOccurredAt }}</span></div>
    <div class="kv"><span class="k">设备SN</span><span class="v sn">{{ detail.product.sn }}</span></div>

    <!-- 投诉（仅投诉单） -->
    <template v-if="detail.type === '投诉'">
      <div class="divider" />
      <div class="sub-title">投诉信息</div>
      <div class="meta-row">
        <div class="kv"><span class="k">投诉类型</span><span class="v">{{ detail.complaint.complaintType }}</span></div>
        <div class="kv"><span class="k">投诉平台</span><span class="v">{{ detail.complaint.platform }}</span></div>
      </div>
      <div class="kv"><span class="k">投诉编号</span><span class="v">{{ detail.complaint.complaintNo }}</span></div>
      <div class="kv kv-tags">
        <span class="k">投诉分类</span>
        <div class="tag-path">
          <template v-for="(tag, i) in detail.complaint.tags" :key="tag">
            <span class="pill-tag">{{ tag }}</span>
            <RightOutlined v-if="i < detail.complaint.tags.length - 1" class="arrow" />
          </template>
        </div>
      </div>
      <div class="meta-row">
        <div class="kv"><span class="k">前期是否反馈</span><span class="v">{{ detail.complaint.priorFeedback }}</span></div>
        <div class="kv"><span class="k">服务回溯</span><span class="v">{{ detail.complaint.serviceReview }}</span></div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.side-card {
  background: #fff; border: 1px solid #e5e7eb; border-radius: 8px;
  padding: 14px; display: flex; flex-direction: column; gap: 8px;
}
.card-title { font-size: 14px; font-weight: 700; color: #111827; }
.sub-title { font-size: 12px; font-weight: 600; color: #6b7280; }
.divider { height: 1px; background: #f0f0f0; margin: 2px 0; }
.kv { display: flex; align-items: center; gap: 8px; font-size: 12px; }
.kv .k { color: #9ca3af; flex: none; white-space: nowrap; }
.kv .v { color: #374151; font-weight: 500; min-width: 0; }
.kv .v.sn { color: #374151; }
.kv-name { align-items: center; }
.kv-tags { align-items: center; }
.kv-value-with-tags {
  display: flex; align-items: center; gap: 4px;
  flex: 1; min-width: 0; overflow: hidden;
}
.pill-tags { display: inline-flex; align-items: center; gap: 4px; flex-wrap: nowrap; overflow: hidden; }
.pill-tag {
  font-size: 10px; color: #374151; background: #f3f4f6;
  border-radius: 3px; padding: 2px 6px; flex: none;
}
.tag-path { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; flex: 1; min-width: 0; }
.arrow { color: #d1d5db; font-size: 12px; }
.meta-row { display: flex; gap: 16px; }
.meta-row .kv { flex: 1 1 0; min-width: 0; }
</style>
