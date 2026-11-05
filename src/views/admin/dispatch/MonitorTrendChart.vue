<script setup lang="ts">
// 分派监控 · 进出池趋势：进池、出池两条折线，跟页头时间范围，纯 SVG 绘制
import { computed, ref } from 'vue';
import { STD_TIP_PROPS } from '@/views/tickets/composables/dispatchUi';
import type { PoolFlowPoint } from './dispatchMetrics';
import './dispatchTheme.css';

const props = defineProps<{ points: PoolFlowPoint[]; subText: string }>();

const IN_COLOR = '#7c3aed';
const OUT_COLOR = '#0d9488';
const W = 560;
const H = 180;
const PAD_T = 8;
/** 超过该点数：不常显圆点，横轴隔点标注 */
const DENSE_AFTER = 7;
const X_LABEL_MAX = 6;

function niceStep(max: number): number {
  const raw = max / 4 || 1;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const n = raw / mag;
  // 次数是整数，步长不小于 1
  return Math.max(1, (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * mag);
}

const chart = computed(() => {
  const pts = props.points;
  const max = Math.max(1, ...pts.map((p) => Math.max(p.in, p.out)));
  const step = niceStep(max);
  const yMax = Math.ceil(max / step) * step;
  const yTicks: number[] = [];
  for (let v = yMax; v >= 0; v -= step) yTicks.push(v);
  const innerH = H - PAD_T;
  const x = (i: number) => (pts.length > 1 ? (i / (pts.length - 1)) * W : W / 2);
  const y = (v: number) => PAD_T + innerH - (v / yMax) * innerH;
  const inPts = pts.map((p, i) => ({ x: x(i), y: y(p.in) }));
  const outPts = pts.map((p, i) => ({ x: x(i), y: y(p.out) }));
  const line = (ps: { x: number; y: number }[]) => ps.map((p, i) => `${i ? 'L' : 'M'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const dense = pts.length > DENSE_AFTER;
  const every = dense ? Math.ceil(pts.length / X_LABEL_MAX) : 1;
  const last = pts.length - 1;
  // 隔点标注并保留最后一点；倒数第二个标注离末点太近时让位
  const xIdx = pts.map((_, i) => i).filter((i) => i === last || (i % every === 0 && last - i >= every / 2));
  return {
    yTicks, inPts, outPts,
    inLine: line(inPts),
    outLine: line(outPts),
    xLabels: xIdx.map((i) => ({ i, text: pts[i].label })),
    showDots: !dense,
  };
});

const hover = ref<number | null>(null);
const hoverX = computed(() => (hover.value == null ? null : chart.value.inPts[hover.value]?.x ?? null));
function leftPct(i: number) { return props.points.length > 1 ? (i / (props.points.length - 1)) * 100 : 50; }
/** 悬停热区：以数据点为中心，宽一个间隔，首尾各半个 */
function hitStyle(i: number) {
  const n = props.points.length;
  const gap = n > 1 ? 100 / (n - 1) : 100;
  const l = Math.max(0, leftPct(i) - gap / 2);
  const r = Math.min(100, leftPct(i) + gap / 2);
  return { left: `${l}%`, width: `${r - l}%` };
}
</script>

<template>
  <section class="dx-card trend">
    <div class="dx-sec-hd">
      <span class="dx-sec-title">进出池趋势</span>
      <span class="dx-sec-sub">{{ subText }}</span>
    </div>
    <div class="legend-line">
      <span class="lg"><i class="sw" :style="{ background: IN_COLOR }" />进池</span>
      <span class="lg"><i class="sw" :style="{ background: OUT_COLOR }" />出池</span>
    </div>
    <div class="line-chart">
      <div class="y-axis"><span v-for="t in chart.yTicks" :key="t">{{ t }}</span></div>
      <div class="chart-body">
        <div class="plot">
          <svg :viewBox="`0 0 ${W} ${H}`" preserveAspectRatio="none" class="line-svg">
            <line v-for="(t, i) in chart.yTicks" :key="`g${t}`" x1="0" :x2="W" :y1="PAD_T + (i / (chart.yTicks.length - 1)) * (H - PAD_T)" :y2="PAD_T + (i / (chart.yTicks.length - 1)) * (H - PAD_T)" class="grid" />
            <path :d="chart.outLine" class="ln" :stroke="OUT_COLOR" />
            <path :d="chart.inLine" class="ln" :stroke="IN_COLOR" />
            <line v-if="hoverX != null" :x1="hoverX" :x2="hoverX" :y1="PAD_T" :y2="H" class="cursor" />
          </svg>
          <template v-for="(p, i) in chart.outPts" :key="`o${i}`">
            <span v-if="chart.showDots || hover === i" class="dot" :style="{ left: `${leftPct(i)}%`, top: `${(p.y / H) * 100}%`, borderColor: OUT_COLOR }" />
          </template>
          <template v-for="(p, i) in chart.inPts" :key="`i${i}`">
            <span v-if="chart.showDots || hover === i" class="dot" :style="{ left: `${leftPct(i)}%`, top: `${(p.y / H) * 100}%`, borderColor: IN_COLOR }" />
          </template>
          <div class="hit-row">
            <a-tooltip v-for="(p, i) in points" :key="p.key" v-bind="STD_TIP_PROPS" placement="top" :mouse-enter-delay="0.05">
              <template #title>
                <div class="tip"><b>{{ p.label }}</b><span>进池 {{ p.in }} 次</span><span>出池 {{ p.out }} 次</span></div>
              </template>
              <div class="hit" :style="hitStyle(i)" @mouseenter="hover = i" @mouseleave="hover = null" />
            </a-tooltip>
          </div>
        </div>
        <div class="x-axis">
          <span
            v-for="d in chart.xLabels" :key="d.i" class="x-label"
            :style="{ left: `${leftPct(d.i)}%`, transform: points.length === 1 ? 'translateX(-50%)' : d.i === 0 ? 'none' : d.i === points.length - 1 ? 'translateX(-100%)' : 'translateX(-50%)' }"
          >{{ d.text }}</span>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.trend { display: flex; flex-direction: column; }
.legend-line { display: flex; gap: 16px; font-size: 13px; color: #86909c; margin: 0 0 8px 46px; }
.lg { display: inline-flex; align-items: center; gap: 6px; }
.sw { width: 10px; height: 3px; border-radius: 2px; display: inline-block; }
.line-chart { display: flex; gap: 10px; flex: 1; min-height: 220px; }
.y-axis { display: flex; flex-direction: column; justify-content: space-between; font-size: 11px; color: #9ca3af; padding: 0 0 22px; width: 36px; text-align: right; flex: none; line-height: 1; }
.y-axis span:first-child { margin-top: 2px; }
.chart-body { flex: 1; display: flex; flex-direction: column; min-width: 0; }
.plot { position: relative; flex: 1; min-height: 0; }
.line-svg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
.grid { stroke: #f0f0f0; stroke-width: 1; vector-effect: non-scaling-stroke; }
.ln { fill: none; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; vector-effect: non-scaling-stroke; }
.cursor { stroke: #d1d5db; stroke-width: 1; stroke-dasharray: 3 3; vector-effect: non-scaling-stroke; }
.dot { position: absolute; width: 8px; height: 8px; border-radius: 50%; background: #fff; border: 2px solid; transform: translate(-50%, -50%); pointer-events: none; }
.hit-row { position: absolute; inset: 0; }
.hit { position: absolute; top: 0; height: 100%; cursor: crosshair; }
.x-axis { position: relative; height: 20px; margin-top: 6px; }
.x-label { position: absolute; font-size: 11px; color: #9ca3af; white-space: nowrap; }
.tip { display: flex; flex-direction: column; gap: 2px; font-size: 12px; line-height: 1.6; }
</style>
