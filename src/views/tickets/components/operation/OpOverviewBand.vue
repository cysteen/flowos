<script setup lang="ts">
import { PaperClipOutlined } from '@ant-design/icons-vue';
import OpStatGrid from './OpStatGrid.vue';
import type { TicketDetailMeta } from '@/mock/ticketDetail';
import type { InsightAction } from '@/views/tickets/types/operation';

defineProps<{ detail: TicketDetailMeta }>();
const emit = defineEmits<{ select: [action: InsightAction] }>();
</script>

<template>
  <div class="overview-band">
    <!-- ① 客户诉求 + 工单关键信息（高度封顶，可放大） -->
    <section class="ob-col ob-desc">
      <div class="ob-head">
        <span class="ob-title">客户诉求</span>
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
    <section class="ob-col ob-handle">
      <div class="ob-head">
        <span class="ob-title">最新处理</span>
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
/* 固定高度速览带：列等高，描述/处理两列内容超出时内部滚动（不撑高布局） */
.overview-band {
  display: flex;
  gap: 12px;
  align-items: stretch;
  height: 150px;
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
  min-height: 0;
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

/* 固定高度 + 内部滚动 */
.ob-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding-right: 2px;
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
