<script setup lang="ts">
// 分派监控 · 出池方式占比（PRD 8.1 四种方式平铺），环图纯 SVG 绘制
import { computed, ref } from 'vue';
import { Empty } from 'ant-design-vue';
import { STD_TIP_PROPS } from '@/views/tickets/composables/dispatchUi';
import type { ShareItem } from './dispatchMetrics';

const props = defineProps<{
  items: ShareItem[];
  total: number;
  rangeText: string;
}>();

const CX = 70;
const R_OUT = 70;
const R_IN = 46;

function polar(r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: CX + r * Math.cos(rad), y: CX + r * Math.sin(rad) };
}
function segPath(a0: number, a1: number): string {
  // 整圆（单项 100%）画成两段半圆
  if (a1 - a0 >= 359.99) return `${segPath(0, 180)} ${segPath(180, 360)}`;
  const large = a1 - a0 > 180 ? 1 : 0;
  const o0 = polar(R_OUT, a1); const o1 = polar(R_OUT, a0);
  const i0 = polar(R_IN, a0); const i1 = polar(R_IN, a1);
  return `M ${o0.x} ${o0.y} A ${R_OUT} ${R_OUT} 0 ${large} 0 ${o1.x} ${o1.y} L ${i0.x} ${i0.y} A ${R_IN} ${R_IN} 0 ${large} 1 ${i1.x} ${i1.y} Z`;
}

const segs = computed(() => {
  if (!props.total) return [];
  let acc = 0;
  return props.items.map((s) => {
    const a0 = (acc / props.total) * 360;
    acc += s.count;
    const a1 = (acc / props.total) * 360;
    const mid = polar((R_OUT + R_IN) / 2, (a0 + a1) / 2);
    return { ...s, path: s.count ? segPath(a0, a1) : '', anchor: { left: `${(mid.x / 140) * 100}%`, top: `${(mid.y / 140) * 100}%` } };
  }).filter((s) => s.path);
});
const hovered = ref<string | null>(null);
/** 悬停中的扇区（列表悬停只高亮，不出提示） */
const tipSeg = ref<string | null>(null);
/** 提示落在环图上，不接收鼠标，否则会盖住扇区、触发移出而闪烁 */
const TIP_OVERLAY_STYLE = { ...STD_TIP_PROPS.overlayStyle, pointerEvents: 'none' as const };
</script>

<template>
  <section class="dx-card algo">
    <div class="dx-sec-hd"><span class="dx-sec-title">出池方式占比</span><span class="dx-sec-sub">{{ rangeText }}</span></div>
    <a-empty v-if="!total" :image="Empty.PRESENTED_IMAGE_SIMPLE" description="暂无出池记录" class="out-empty" />
    <template v-else>
      <div class="out-body">
        <div class="donut-wrap">
          <div class="donut-box">
            <svg viewBox="0 0 140 140" class="donut-svg">
              <g v-for="s in segs" :key="s.name">
                <path
                  :d="s.path" :fill="s.color" class="seg"
                  :class="{ dim: hovered !== null && hovered !== s.name, active: hovered === s.name }"
                  @mouseenter="hovered = s.name; tipSeg = s.name" @mouseleave="hovered = null; tipSeg = null"
                />
              </g>
              <text :x="CX" y="66" text-anchor="middle" class="c-label">合计</text>
              <text :x="CX" y="86" text-anchor="middle" class="c-val">{{ total }}</text>
            </svg>
            <a-tooltip
              v-for="s in segs" :key="s.name"
              v-bind="STD_TIP_PROPS" :overlay-style="TIP_OVERLAY_STYLE"
              placement="top" :trigger="[]" :open="tipSeg === s.name"
            >
              <template #title><div class="tip"><b>{{ s.name }}</b><span>{{ s.pct }}% · {{ s.count }} 次</span></div></template>
              <span class="seg-anchor" :style="s.anchor" />
            </a-tooltip>
          </div>
        </div>
        <div class="legend">
          <div
            v-for="a in items" :key="a.name" class="lg-row lg-item" :class="{ active: hovered === a.name }"
            @mouseenter="hovered = a.name" @mouseleave="hovered = null"
          >
            <span class="lg-sw" :style="{ background: a.color }" />
            <span class="lg-nm">{{ a.name }}</span>
            <span class="lg-n">{{ a.count }}</span>
            <span class="lg-pc">{{ a.pct }}%</span>
          </div>
        </div>
      </div>
    </template>
  </section>
</template>

<style scoped>
.algo :deep(.dx-sec-hd) { margin-bottom: 8px; }
.out-body {
  display: flex; align-items: center; gap: 10px 8px;
  min-height: 0;
}
.donut-wrap { flex: none; display: flex; justify-content: center; padding: 0; }
.donut-box { position: relative; width: 112px; height: 112px; }
.donut-svg { display: block; width: 112px; height: 112px; overflow: visible; }
.seg-anchor { position: absolute; width: 1px; height: 1px; pointer-events: none; }
.seg { cursor: pointer; stroke: #fff; stroke-width: 1.5; transition: opacity 0.15s, filter 0.15s; }
.seg.dim { opacity: 0.4; }
.seg.active { filter: brightness(1.08); }
.c-label { font-size: 10px; fill: #9ca3af; pointer-events: none; }
.c-val { font-size: 16px; font-weight: 700; fill: #111827; pointer-events: none; }
.out-empty { margin: 24px 0; }
.legend {
  flex: 1; min-width: 0;
  display: flex; flex-direction: column; gap: 2px;
  padding-left: 10px;
  margin-left: 4px;
}
/* 圆点 | 名称 | 次数 | 占比 */
.lg-row {
  display: grid;
  grid-template-columns: 6px minmax(0, 1fr) auto 38px;
  column-gap: 8px;
  align-items: center;
  padding: 0 2px 0 6px;
  min-height: 16px;
  line-height: 16px;
  border-radius: 3px;
}
.lg-item { cursor: default; transition: background 0.15s; }
.lg-item:hover, .lg-item.active { background: #f7f8fa; }
.lg-item .lg-sw { justify-self: center; }
.lg-sw { width: 5px; height: 5px; border-radius: 50%; flex: none; }
.lg-nm { font-size: 11px; color: #4e5969; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.lg-n { font-size: 11px; color: #86909c; font-variant-numeric: tabular-nums; }
.lg-pc { font-size: 11px; font-weight: 600; color: #1f2329; text-align: right; font-variant-numeric: tabular-nums; }
.tip { display: flex; flex-direction: column; gap: 2px; font-size: 12px; line-height: 1.6; }
</style>
