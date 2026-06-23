<script setup lang="ts">
import { ref } from 'vue';
import { PaperClipOutlined, ArrowsAltOutlined, ShrinkOutlined } from '@ant-design/icons-vue';
import OpStatGrid from './OpStatGrid.vue';
import type { TicketDetailMeta } from '@/mock/ticketDetail';
import type { InsightAction } from '@/views/tickets/types/operation';

defineProps<{ detail: TicketDetailMeta }>();
const emit = defineEmits<{ select: [action: InsightAction] }>();

const descExpanded = ref(false);
const handleExpanded = ref(false);
</script>

<template>
  <div class="overview-band">
    <!-- ① 客户诉求 + 工单关键信息（高度封顶，可放大） -->
    <section class="ob-col ob-desc" :class="{ expanded: descExpanded }">
      <div class="ob-head">
        <span class="ob-title">客户诉求</span>
        <button class="ob-toggle" type="button" :title="descExpanded ? '收起' : '放大'" @click="descExpanded = !descExpanded">
          <ShrinkOutlined v-if="descExpanded" /><ArrowsAltOutlined v-else />
        </button>
      </div>
      <div class="ob-body">
        <p class="ob-demand">{{ detail.demand }}</p>
        <div class="ob-meta">
          <span><i>来源</i>{{ detail.source }}</span>
          <span><i>业务类型</i>{{ detail.businessType }}</span>
          <span><i>业务线</i>{{ detail.businessLine }}</span>
          <span><i>发生时间</i>{{ detail.issueOccurredAt }}</span>
          <span><i>期望解决</i>{{ detail.expectedResolve }}</span>
        </div>
        <div v-if="detail.attachments.length" class="ob-attach">
          <span v-for="a in detail.attachments" :key="a" class="attach">
            <PaperClipOutlined :style="{ fontSize: '12px', color: '#6B7280' }" />{{ a }}
          </span>
        </div>
      </div>
    </section>

    <!-- ② 客户全景统计宫格（逐项可下钻） -->
    <section class="ob-col ob-stat">
      <div class="ob-head"><span class="ob-title">客户全景</span></div>
      <OpStatGrid :insight="detail.insight" :ticket-type="detail.type" @select="emit('select', $event)" />
    </section>

    <!-- ③ 最新处理（多处理人，高度封顶，可放大） -->
    <section class="ob-col ob-handle" :class="{ expanded: handleExpanded }">
      <div class="ob-head">
        <span class="ob-title">最新处理</span>
        <button class="ob-toggle" type="button" :title="handleExpanded ? '收起' : '放大'" @click="handleExpanded = !handleExpanded">
          <ShrinkOutlined v-if="handleExpanded" /><ArrowsAltOutlined v-else />
        </button>
      </div>
      <div class="ob-body">
        <div v-if="!detail.latestHandling.length" class="ob-empty">暂无处理记录</div>
        <div v-for="(h, i) in detail.latestHandling" :key="i" class="handle-item">
          <div class="hi-meta"><span class="hi-who">{{ h.who }}</span><span class="hi-role">{{ h.role }}</span><span class="hi-when">{{ h.when }}</span></div>
          <div class="hi-text">{{ h.text }}</div>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.overview-band {
  display: flex;
  gap: 12px;
  align-items: stretch;
}
.ob-col {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}
.ob-desc { flex: 3; }
.ob-stat { flex: 2; }
.ob-handle { flex: 2; }

.ob-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex: none;
}
.ob-title {
  font-size: 13px;
  font-weight: 700;
  color: #111827;
}
.ob-toggle {
  border: none;
  background: transparent;
  color: #9ca3af;
  cursor: pointer;
  font-size: 13px;
  line-height: 1;
  padding: 2px;
}
.ob-toggle:hover { color: #1a6fff; }

/* 高度封顶 + 渐隐；展开后自适应 */
.ob-body {
  position: relative;
  max-height: 104px;
  overflow: hidden;
}
.ob-desc.expanded .ob-body,
.ob-handle.expanded .ob-body {
  max-height: none;
  overflow: visible;
}
.ob-desc:not(.expanded) .ob-body::after,
.ob-handle:not(.expanded) .ob-body::after {
  content: '';
  position: absolute;
  left: 0; right: 0; bottom: 0;
  height: 22px;
  background: linear-gradient(transparent, #fff);
  pointer-events: none;
}

.ob-demand {
  margin: 0 0 8px;
  font-size: 13px;
  color: #374151;
  line-height: 1.6;
  word-break: break-word;
}
.ob-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 14px;
  margin-bottom: 8px;
}
.ob-meta span {
  font-size: 12px;
  color: #374151;
  white-space: nowrap;
}
.ob-meta i {
  font-style: normal;
  color: #9ca3af;
  margin-right: 4px;
}
.ob-attach {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.attach {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  color: #374151;
  background: #f3f4f6;
  border-radius: 6px;
  padding: 4px 8px;
}

.handle-item {
  padding-bottom: 8px;
  margin-bottom: 8px;
  border-bottom: 1px dashed #f0f0f0;
}
.handle-item:last-child {
  border-bottom: none;
  margin-bottom: 0;
  padding-bottom: 0;
}
.hi-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 3px;
}
.hi-who { font-size: 12px; font-weight: 600; color: #111827; }
.hi-role { font-size: 11px; color: #1a6fff; background: #eff6ff; border-radius: 4px; padding: 0 6px; }
.hi-when { font-size: 11px; color: #9ca3af; margin-left: auto; }
.hi-text { font-size: 12px; color: #6b7280; line-height: 1.6; }
.ob-empty { font-size: 12px; color: #9ca3af; }
</style>
