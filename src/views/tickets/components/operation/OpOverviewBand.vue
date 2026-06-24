<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import OpStatGrid from './OpStatGrid.vue';
import OpAiInsight from './OpAiInsight.vue';
import type { TicketDetailMeta } from '@/mock/ticketDetail';
import type { InsightAction } from '@/views/tickets/types/operation';

type OverviewCol = 'desc' | 'stat' | 'handle';

defineProps<{ detail: TicketDetailMeta }>();
const emit = defineEmits<{ select: [action: InsightAction]; 'expand-change': [expanded: boolean] }>();

const expandedCol = ref<OverviewCol | null>(null);
const bandRef = ref<HTMLElement | null>(null);

function toggleCol(col: OverviewCol) {
  expandedCol.value = expandedCol.value === col ? null : col;
}

function onDocClick(e: MouseEvent) {
  if (!expandedCol.value) return;
  const el = bandRef.value;
  if (el && !el.contains(e.target as Node)) {
    expandedCol.value = null;
  }
}

onMounted(() => document.addEventListener('click', onDocClick, true));
onBeforeUnmount(() => document.removeEventListener('click', onDocClick, true));

watch(expandedCol, (v) => emit('expand-change', v !== null), { immediate: true });
</script>

<template>
  <div ref="bandRef" class="overview-band" :class="{ 'has-expanded': expandedCol }">
    <!-- ① 问题与诉求 -->
    <div class="ob-cell">
      <section class="ob-col ob-desc" :class="{ expanded: expandedCol === 'desc' }">
        <div class="ob-head">
          <span class="ob-title"><i class="ob-bar" />问题与诉求</span>
          <button
            type="button"
            class="box-toggle"
            :class="{ active: expandedCol === 'desc' }"
            :title="expandedCol === 'desc' ? '收起' : '放大'"
            @click.stop="toggleCol('desc')"
          >
            {{ expandedCol === 'desc' ? '⤡' : '⤢' }}
          </button>
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
    </div>

    <!-- ② 客户全景 -->
    <div class="ob-cell">
      <section class="ob-col ob-stat" :class="{ expanded: expandedCol === 'stat' }">
        <slot name="live-notify" />
        <div class="ob-head">
          <span class="ob-title"><i class="ob-bar" />客户全景</span>
          <button
            type="button"
            class="box-toggle"
            :class="{ active: expandedCol === 'stat' }"
            :title="expandedCol === 'stat' ? '收起' : '放大'"
            @click.stop="toggleCol('stat')"
          >
            {{ expandedCol === 'stat' ? '⤡' : '⤢' }}
          </button>
        </div>
        <div class="ob-stat-body">
          <OpStatGrid :insight="detail.insight" :ticket-type="detail.type" @select="emit('select', $event)" />
          <OpAiInsight :insight="detail.aiInsight" :expanded="expandedCol === 'stat'" />
        </div>
      </section>
    </div>

    <!-- ③ 最新处理 -->
    <div class="ob-cell">
      <section class="ob-col ob-handle" :class="{ expanded: expandedCol === 'handle' }">
        <div class="ob-head">
          <span class="ob-title"><i class="ob-bar" />最新处理</span>
          <button
            type="button"
            class="box-toggle"
            :class="{ active: expandedCol === 'handle' }"
            :title="expandedCol === 'handle' ? '收起' : '放大'"
            @click.stop="toggleCol('handle')"
          >
            {{ expandedCol === 'handle' ? '⤡' : '⤢' }}
          </button>
        </div>
        <div class="ob-body">
          <div v-if="!detail.latestHandling.length" class="ob-empty">暂无处理记录</div>
          <div v-for="(h, i) in detail.latestHandling" :key="i" class="handle-item">
            <div class="hi-meta">
              <span class="hi-who">{{ h.who }}</span>
              <span class="hi-role">{{ h.role }}</span>
              <span class="hi-when">{{ h.when }}</span>
            </div>
            <div class="hi-text">{{ h.text }}</div>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
/* 速览带：固定占位高度，展开列绝对定位向下延伸并覆盖下方内容 */
.overview-band {
  display: flex;
  gap: 8px;
  align-items: stretch;
  padding: 4px 4px 0;
  border-radius: 10px;
  background: linear-gradient(180deg, #eef2ff 0%, #f5f7ff 48%, #f9fafb 100%);
  border: 1px solid #c7d2fe;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.7);
  position: relative;
  z-index: 10;
  overflow: visible;
}
.overview-band.has-expanded {
  z-index: 50;
}

.ob-cell {
  flex: 1;
  min-width: 0;
  height: 192px;
  position: relative;
}

.ob-col {
  box-sizing: border-box;
  height: 100%;
  border-radius: 8px;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  min-height: 0;
  border: 1px solid transparent;
  box-shadow: 0 2px 8px rgba(17, 24, 39, 0.07);
  transition: box-shadow 0.2s, border-color 0.2s;
  background-clip: padding-box;
}
.ob-col:hover {
  box-shadow: 0 4px 14px rgba(17, 24, 39, 0.1);
}

.ob-col.expanded {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: auto;
  max-height: min(520px, calc(100vh - 140px));
  z-index: 30;
  box-shadow: 0 12px 40px rgba(17, 24, 39, 0.16), 0 0 0 1px rgba(17, 24, 39, 0.06);
}

.ob-desc {
  background: linear-gradient(180deg, #fff 0%, #f8faff 100%);
  border-color: #bfdbfe;
  border-top: 3px solid #1a6fff;
}
.ob-stat {
  background: linear-gradient(180deg, #fff 0%, #faf8ff 100%);
  border-color: #ddd6fe;
  border-top: 3px solid #7c3aed;
  position: relative;
  overflow: visible;
}
.ob-handle {
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
  gap: 8px;
}
.ob-title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 700;
  color: #111827;
  letter-spacing: 0.02em;
  min-width: 0;
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

.box-toggle {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 20px;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: #9ca3af;
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
  font-family: inherit;
  transition: color 0.15s, background 0.15s;
}
.box-toggle:hover,
.box-toggle.active {
  color: #1a6fff;
  background: rgba(26, 111, 255, 0.08);
}
.ob-stat .box-toggle:hover,
.ob-stat .box-toggle.active {
  color: #7c3aed;
  background: rgba(124, 58, 237, 0.08);
}
.ob-handle .box-toggle:hover,
.ob-handle .box-toggle.active {
  color: #10b981;
  background: rgba(16, 185, 129, 0.08);
}

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

.ob-desc .ob-body,
.ob-handle .ob-body,
.ob-stat-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding-right: 2px;
}
.ob-col.expanded .ob-body,
.ob-col.expanded .ob-stat-body {
  overflow-y: auto;
  overscroll-behavior: contain;
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
