<script setup lang="ts">
import { computed } from 'vue';
import { RightOutlined } from '@ant-design/icons-vue';
import type { TicketDetailMeta } from '@/mock/ticketDetail';
import { platformDisplay } from '@/views/tickets/composables/complaintEscalation';

const props = defineProps<{ detail: TicketDetailMeta }>();

/** 只展示填齐一类+二类的组——一次投诉可命中多个问题 */
const complaintCategories = computed(
  () => (props.detail.complaint?.categories ?? []).filter((c) => c.cat1 && c.cat2),
);
/** 只展示填了平台的组——建单页平台/编号成对多组，编号可留空 */
const complaintPlatforms = computed(
  () => (props.detail.complaint?.platforms ?? []).filter((p) => p.platform),
);
</script>

<template>
  <div class="side-card">
    <div class="card-title">工单信息</div>

    <!-- 工单属性 -->
    <div class="kv"><span class="k">工单来源</span><span class="v">{{ detail.source }}</span></div>
    <div class="meta-row">
      <div class="kv"><span class="k">业务分类</span><span class="v">{{ detail.businessType }}</span></div>
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

    <!-- 投诉（仅投诉单）。字段随建单页有值才出——渠道门控下未采集的字段不占位。 -->
    <template v-if="detail.type === '投诉'">
      <div class="divider" />
      <div class="sub-title">投诉信息</div>

      <div class="complaint-block">
        <div v-if="detail.complaint.complaintType" class="c-row">
          <span class="c-k">投诉类型</span>
          <span class="c-v">{{ detail.complaint.complaintType }}</span>
        </div>

        <div v-if="complaintCategories.length" class="c-row">
          <span class="c-k">投诉分类</span>
          <div class="c-list">
            <div
              v-for="(c, i) in complaintCategories"
              :key="`cat-${i}`"
              class="c-item"
            >
              <span class="c-main">{{ c.cat1 }} / {{ c.cat2 }}</span>
            </div>
          </div>
        </div>

        <div v-if="complaintPlatforms.length" class="c-row">
          <span class="c-k">投诉平台</span>
          <div class="c-list">
            <div
              v-for="(p, i) in complaintPlatforms"
              :key="`plat-${i}`"
              class="c-item inline"
            >
              <span class="c-main">{{ platformDisplay(p) }}</span>
              <span v-if="p.complaintNo" class="c-sub mono">{{ p.complaintNo }}</span>
              <span v-else class="c-sub muted">无编号</span>
            </div>
          </div>
        </div>

        <div v-if="detail.complaint.priorFeedback" class="c-row">
          <span class="c-k">前期反馈</span>
          <span class="c-v">{{ detail.complaint.priorFeedback }}</span>
        </div>

        <div v-if="detail.complaint.receivedAt" class="c-row">
          <span class="c-k">接收时间</span>
          <span class="c-v">{{ detail.complaint.receivedAt }}</span>
        </div>

        <div v-if="detail.complaint.serviceReview" class="c-row">
          <span class="c-k">服务回溯</span>
          <span class="c-v c-review">{{ detail.complaint.serviceReview }}</span>
        </div>
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
.pill-tags { display: inline-flex; align-items: center; gap: 4px; flex-wrap: wrap; overflow: hidden; }
.pill-tag {
  font-size: 10px; color: #374151; background: #f3f4f6;
  border-radius: 3px; padding: 2px 6px; flex: none;
}
.tag-path { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; flex: 1; min-width: 0; }
.arrow { color: #d1d5db; font-size: 12px; }
.meta-row { display: flex; gap: 16px; }
.meta-row .kv { flex: 1 1 0; min-width: 0; }

/*
 * 投诉信息：侧栏约 300px 宽，统一左标签列 + 右内容列。
 * 多组（分类/平台）竖排，避免 pill/箭头/徽标挤在一行。
 */
.complaint-block {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.c-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  font-size: 12px;
  min-width: 0;
}
.c-k {
  flex: none;
  width: 56px;
  color: #9ca3af;
  line-height: 18px;
  text-align: left;
  white-space: nowrap;
}
.c-v {
  flex: 1;
  min-width: 0;
  color: #374151;
  font-weight: 500;
  line-height: 18px;
}
.c-list {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.c-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  padding: 6px 8px;
  background: #f9fafb;
  border-radius: 4px;
}
.c-item.inline {
  flex-direction: row;
  align-items: baseline;
  gap: 8px;
  flex-wrap: wrap;
}
.c-main {
  color: #374151;
  font-weight: 500;
  line-height: 18px;
  word-break: break-word;
}
.c-sub {
  color: #6b7280;
  font-size: 11px;
  line-height: 16px;
}
.c-sub.mono {
  font-family: Consolas, 'SF Mono', monospace;
  letter-spacing: 0.02em;
}
.c-sub.muted { color: #c0c4cc; }
.c-review {
  font-weight: 400;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
  color: #4b5563;
}
</style>
