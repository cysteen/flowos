<script setup lang="ts">
import OpStatGrid from './OpStatGrid.vue';
import OpAiInsight from './OpAiInsight.vue';
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
        <span class="ob-title"><i class="ob-bar" />问题与诉求</span>
      </div>
      <div class="ob-body">
        <div class="handle-item">
          <div class="hi-meta">
            <span class="hi-label">产品&问题</span>
          </div>
          <div class="hi-text">{{ detail.productIssue }}</div>
        </div>
        <div class="handle-item">
          <div class="hi-meta">
            <span class="hi-label">问题描述</span>
          </div>
          <div class="hi-text">{{ detail.demand }}</div>
        </div>
      </div>
    </section>

    <!-- ② 客户全景统计宫格 + AI 洞察 -->
    <section class="ob-col ob-stat">
      <div class="ob-head"><span class="ob-title"><i class="ob-bar" />客户全景</span></div>
      <div class="ob-stat-body">
        <OpStatGrid :insight="detail.insight" :ticket-type="detail.type" @select="emit('select', $event)" />
        <OpAiInsight :insight="detail.aiInsight" />
      </div>
    </section>

    <!-- ③ 最新处理（多处理人，高度封顶，可放大） -->
    <section class="ob-col ob-handle">
      <div class="ob-head">
        <span class="ob-title"><i class="ob-bar" />最新处理</span>
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
/* 速览带：三列等高，高度对齐「最新处理」列（192px） */
.overview-band {
  display: flex;
  gap: 12px;
  align-items: stretch;
  padding: 6px;
  border-radius: 10px;
  background: linear-gradient(180deg, #eef2ff 0%, #f5f7ff 48%, #f9fafb 100%);
  border: 1px solid #c7d2fe;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.7);
}
.ob-col {
  box-sizing: border-box;
  height: 192px;
  border-radius: 8px;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  min-height: 0;
  border: 1px solid transparent;
  box-shadow: 0 2px 8px rgba(17, 24, 39, 0.07);
  transition: box-shadow 0.15s, border-color 0.15s;
}
.ob-col:hover {
  box-shadow: 0 4px 14px rgba(17, 24, 39, 0.1);
}
.ob-desc {
  flex: 1;
  background: linear-gradient(180deg, #fff 0%, #f8faff 100%);
  border-color: #bfdbfe;
  border-top: 3px solid #1a6fff;
}
.ob-stat {
  flex: 1;
  background: linear-gradient(180deg, #fff 0%, #faf8ff 100%);
  border-color: #ddd6fe;
  border-top: 3px solid #7c3aed;
}
.ob-handle {
  flex: 1;
  background: linear-gradient(180deg, #fff 0%, #f6fdf9 100%);
  border-color: #a7f3d0;
  border-top: 3px solid #10b981;
}

.ob-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex: none;
  padding-bottom: 2px;
  border-bottom: 1px solid rgba(17, 24, 39, 0.06);
}
.ob-title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 700;
  color: #111827;
  letter-spacing: 0.02em;
}
.ob-bar {
  display: inline-block;
  width: 3px;
  height: 14px;
  border-radius: 2px;
  flex: none;
}
.ob-desc .ob-bar { background: #1a6fff; }
.ob-stat .ob-bar { background: #7c3aed; }
.ob-handle .ob-bar { background: #10b981; }

.ob-stat-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.ob-stat-body :deep(.stat-item) {
  padding: 6px 4px;
}
.ob-stat-body :deep(.si-value) {
  font-size: 15px;
}

/* 三列内容区等高，超出内部滚动 */
.ob-desc .ob-body,
.ob-handle .ob-body,
.ob-stat-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding-right: 2px;
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
.hi-label { font-size: 12px; font-weight: 600; color: #6b7280; }
.hi-role { font-size: 11px; color: #6b7280; background: #f3f4f6; border-radius: 4px; padding: 0 6px; }
.hi-when { font-size: 11px; color: #9ca3af; margin-left: auto; }
.hi-text { font-size: 12px; color: #374151; line-height: 1.6; }
.handle-item:first-child .hi-text {
  font-weight: 500;
  color: #111827;
}
.ob-empty { font-size: 12px; color: #9ca3af; }
</style>
