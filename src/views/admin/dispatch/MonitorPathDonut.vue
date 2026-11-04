<script setup lang="ts">
// 分派监控 · 派单路径占比（PRD 14.1 六项），环图纯 SVG 绘制
import { computed, ref } from 'vue';
import { STD_TIP_PROPS } from '@/views/tickets/composables/dispatchUi';

const props = defineProps<{
  items: { name: string; count: number; pct: number; color: string }[];
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
  return props.items.map((s, i) => {
    const a0 = (acc / props.total) * 360;
    acc += s.count;
    const a1 = (acc / props.total) * 360;
    const mid = polar((R_OUT + R_IN) / 2, (a0 + a1) / 2);
    return { ...s, i, path: s.count ? segPath(a0, a1) : '', anchor: { left: `${(mid.x / 140) * 100}%`, top: `${(mid.y / 140) * 100}%` } };
  }).filter((s) => s.path);
});
const hovered = ref<number | null>(null);
/** 悬停中的扇区（图例悬停只高亮，不出提示） */
const tipSeg = ref<number | null>(null);
/** 提示落在环图上，不接收鼠标，否则会盖住扇区、触发移出而闪烁 */
const TIP_OVERLAY_STYLE = { ...STD_TIP_PROPS.overlayStyle, pointerEvents: 'none' as const };
</script>

<template>
  <section class="dx-card algo">
    <div class="dx-sec-hd"><span class="dx-sec-title">派单路径占比</span><span class="dx-sec-sub">{{ rangeText }}</span></div>
    <div class="donut-wrap">
      <div class="donut-box">
      <svg viewBox="0 0 140 140" class="donut-svg">
        <circle v-if="!segs.length" :cx="CX" :cy="CX" :r="(R_OUT + R_IN) / 2" fill="none" stroke="#f3f4f6" :stroke-width="R_OUT - R_IN" />
        <g v-for="s in segs" :key="s.name">
          <path
            :d="s.path" :fill="s.color" class="seg"
            :class="{ dim: hovered !== null && hovered !== s.i, active: hovered === s.i }"
            @mouseenter="hovered = s.i; tipSeg = s.i" @mouseleave="hovered = null; tipSeg = null"
          />
        </g>
        <text :x="CX" y="66" text-anchor="middle" class="c-label">合计</text>
        <text :x="CX" y="86" text-anchor="middle" class="c-val">{{ total }}</text>
      </svg>
      <!-- 提示不能写在 svg 内：浮层会继承 SVG 命名空间，渲染尺寸为 0 -->
      <a-tooltip
        v-for="s in segs" :key="s.name"
        v-bind="STD_TIP_PROPS" :overlay-style="TIP_OVERLAY_STYLE"
        placement="top" :trigger="[]" :open="tipSeg === s.i"
      >
        <template #title><div class="tip"><b>{{ s.name }}</b><span>{{ s.pct }}% · {{ s.count }} 次</span></div></template>
        <span class="seg-anchor" :style="s.anchor" />
      </a-tooltip>
      </div>
    </div>
    <div class="legend">
      <div
        v-for="(a, i) in items" :key="a.name" class="lg-item" :class="{ active: hovered === i }"
        @mouseenter="hovered = i" @mouseleave="hovered = null"
      >
        <span class="lg-sw" :style="{ background: a.color }" />
        <span class="lg-nm">{{ a.name }}</span>
        <span class="lg-n">{{ a.count }}</span>
        <span class="lg-pc">{{ a.pct }}%</span>
      </div>
    </div>
  </section>
</template>

<style scoped>
.donut-wrap { display: flex; justify-content: center; padding: 0 0 16px; }
.donut-box { position: relative; width: 148px; height: 148px; }
.donut-svg { display: block; width: 148px; height: 148px; overflow: visible; }
.seg-anchor { position: absolute; width: 1px; height: 1px; pointer-events: none; }
.seg { cursor: pointer; transition: opacity 0.15s, filter 0.15s; }
.seg.dim { opacity: 0.4; }
.seg.active { filter: brightness(1.08); }
.c-label { font-size: 11px; fill: #9ca3af; pointer-events: none; }
.c-val { font-size: 18px; font-weight: 700; fill: #111827; pointer-events: none; }
.legend { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 4px 12px; }
.lg-item { display: flex; align-items: center; gap: 6px; padding: 3px 6px; border-radius: 4px; cursor: default; transition: background 0.15s; }
.lg-item:hover, .lg-item.active { background: #f7f8fa; }
.lg-sw { width: 6px; height: 6px; border-radius: 50%; flex: none; }
.lg-nm { font-size: 13px; color: #4e5969; flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.lg-n { font-size: 13px; color: #86909c; }
.lg-pc { font-size: 13px; font-weight: 600; color: #1f2329; width: 44px; text-align: right; }
.tip { display: flex; flex-direction: column; gap: 2px; font-size: 12px; line-height: 1.6; }
</style>
