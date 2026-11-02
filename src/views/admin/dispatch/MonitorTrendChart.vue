<script setup lang="ts">
// 分派监控 · 派单趋势：按日派出量、兜底量（近 7 天 / 30 天），纯 SVG 绘制
import { computed, ref } from 'vue';
import { useDispatchStore } from '@/stores/dispatch';
import { useClock } from './dispatchUi';
import { buildTrend } from './dispatchMetrics';

const props = defineProps<{ poolIds: string[] | null }>();
const store = useDispatchStore();
const clock = useClock(30_000);

const days = ref<7 | 30>(7);
const points = computed(() => {
  void clock.value;
  return buildTrend(store.logs, days.value, props.poolIds, Date.now());
});

const W = 560;
const H = 180;
const PAD_T = 8;

function niceStep(max: number): number {
  const raw = max / 4 || 1;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const n = raw / mag;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * mag;
}

const chart = computed(() => {
  const pts = points.value;
  const max = Math.max(1, ...pts.map((p) => p.out), ...pts.map((p) => p.fallback));
  const step = niceStep(max);
  const yMax = Math.ceil(max / step) * step;
  const yTicks: number[] = [];
  for (let v = yMax; v >= 0; v -= step) yTicks.push(v);
  const innerH = H - PAD_T;
  const x = (i: number) => (pts.length > 1 ? (i / (pts.length - 1)) * W : W / 2);
  const y = (v: number) => PAD_T + innerH - (v / yMax) * innerH;
  const outPts = pts.map((p, i) => ({ x: x(i), y: y(p.out) }));
  const fbPts = pts.map((p, i) => ({ x: x(i), y: y(p.fallback) }));
  const line = (ps: { x: number; y: number }[]) => ps.map((p, i) => `${i ? 'L' : 'M'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const area = outPts.length > 1
    ? `${line(outPts)} L ${outPts[outPts.length - 1].x.toFixed(1)} ${H} L ${outPts[0].x.toFixed(1)} ${H} Z`
    : '';
  const long = pts.length > 7;
  const xIdx = long ? [0, 5, 10, 15, 20, 25, pts.length - 1] : pts.map((_, i) => i);
  return {
    yTicks, outPts, fbPts, area,
    outLine: line(outPts), fbLine: line(fbPts),
    xLabels: xIdx.map((i) => ({ i, text: pts[i].label })),
    showDots: !long,
  };
});

const totals = computed(() => {
  const pts = points.value;
  const out = pts.reduce((s, p) => s + p.out, 0);
  const fb = pts.reduce((s, p) => s + p.fallback, 0);
  return { out, fb, avg: Math.round(out / pts.length) };
});

const hover = ref<number | null>(null);
function leftPct(i: number) { return points.value.length > 1 ? (i / (points.value.length - 1)) * 100 : 50; }
/** 悬停热区：以数据点为中心，宽一个间隔，首尾各半个 */
function hitStyle(i: number) {
  const n = points.value.length;
  const gap = n > 1 ? 100 / (n - 1) : 100;
  const l = Math.max(0, leftPct(i) - gap / 2);
  const r = Math.min(100, leftPct(i) + gap / 2);
  return { left: `${l}%`, width: `${r - l}%` };
}
</script>

<template>
  <section class="block trend">
    <div class="chart-head">
      <div class="b-title inline">派单趋势<span class="b-sub">近 {{ days }} 天派出 {{ totals.out }} 单 · 日均 {{ totals.avg }} · 兜底 {{ totals.fb }}</span></div>
      <div class="range-toggle">
        <button type="button" class="range-btn" :class="{ active: days === 7 }" @click="days = 7">7 天</button>
        <button type="button" class="range-btn" :class="{ active: days === 30 }" @click="days = 30">30 天</button>
      </div>
    </div>
    <div class="legend-line">
      <span class="lg"><i class="sw" style="background: #1a6fff" />派出量</span>
      <span class="lg"><i class="sw" style="background: #f59e0b" />兜底回池</span>
    </div>
    <div class="line-chart">
      <div class="y-axis"><span v-for="t in chart.yTicks" :key="t">{{ t }}</span></div>
      <div class="chart-body">
        <div class="plot">
          <svg :viewBox="`0 0 ${W} ${H}`" preserveAspectRatio="none" class="line-svg">
            <defs>
              <linearGradient id="dispatchTrendFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#1a6fff" stop-opacity="0.12" />
                <stop offset="100%" stop-color="#1a6fff" stop-opacity="0.01" />
              </linearGradient>
            </defs>
            <line v-for="(t, i) in chart.yTicks" :key="`g${t}`" x1="0" :x2="W" :y1="PAD_T + (i / (chart.yTicks.length - 1)) * (H - PAD_T)" :y2="PAD_T + (i / (chart.yTicks.length - 1)) * (H - PAD_T)" class="grid" />
            <path v-if="chart.area" :d="chart.area" fill="url(#dispatchTrendFill)" />
            <path :d="chart.outLine" class="ln" stroke="#1a6fff" />
            <path :d="chart.fbLine" class="ln" stroke="#f59e0b" />
            <line v-if="hover != null" :x1="chart.outPts[hover].x" :x2="chart.outPts[hover].x" :y1="PAD_T" :y2="H" class="cursor" />
          </svg>
          <template v-if="chart.showDots || hover != null">
            <template v-for="(p, i) in chart.outPts" :key="`o${i}`">
              <span v-if="chart.showDots || hover === i" class="dot" :style="{ left: `${leftPct(i)}%`, top: `${(p.y / H) * 100}%`, borderColor: '#1a6fff' }" />
            </template>
            <template v-for="(p, i) in chart.fbPts" :key="`f${i}`">
              <span v-if="chart.showDots || hover === i" class="dot sm" :style="{ left: `${leftPct(i)}%`, top: `${(p.y / H) * 100}%`, borderColor: '#f59e0b' }" />
            </template>
          </template>
          <div class="hit-row">
            <a-tooltip v-for="(p, i) in points" :key="p.dayStart" placement="top" :mouse-enter-delay="0.05">
              <template #title>
                <div class="tip"><b>{{ p.label }}</b><span>派出 {{ p.out }} 单</span><span>兜底回池 {{ p.fallback }} 单</span></div>
              </template>
              <div class="hit" :style="hitStyle(i)" @mouseenter="hover = i" @mouseleave="hover = null" />
            </a-tooltip>
          </div>
        </div>
        <div class="x-axis">
          <span
            v-for="d in chart.xLabels" :key="d.i" class="x-label"
            :style="{ left: `${leftPct(d.i)}%`, transform: d.i === 0 ? 'none' : d.i === points.length - 1 ? 'translateX(-100%)' : 'translateX(-50%)' }"
          >{{ d.text }}</span>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.block { background: #fff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 16px 20px; min-width: 0; }
.b-title { font-size: 13px; font-weight: 600; color: #111827; padding-left: 10px; border-left: 3px solid #1a6fff; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.b-sub { font-size: 12px; font-weight: normal; color: #9ca3af; }
.chart-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 10px; }
.range-toggle { display: flex; gap: 4px; flex: none; }
.range-btn { border: none; background: transparent; padding: 4px 10px; border-radius: 4px; font-size: 12px; color: #6b7280; cursor: pointer; }
.range-btn.active { background: #eff6ff; color: #1a6fff; font-weight: 600; }
.range-btn:hover:not(.active) { background: #f9fafb; }
.legend-line { display: flex; gap: 16px; font-size: 12px; color: #6b7280; margin: 0 0 8px 46px; }
.lg { display: inline-flex; align-items: center; gap: 6px; }
.sw { width: 10px; height: 3px; border-radius: 2px; display: inline-block; }
.line-chart { display: flex; gap: 10px; height: 220px; }
.y-axis { display: flex; flex-direction: column; justify-content: space-between; font-size: 11px; color: #9ca3af; padding: 0 0 22px; width: 36px; text-align: right; flex: none; line-height: 1; }
.y-axis span:first-child { margin-top: 2px; }
.chart-body { flex: 1; display: flex; flex-direction: column; min-width: 0; }
.plot { position: relative; flex: 1; min-height: 0; }
.line-svg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
.grid { stroke: #f0f0f0; stroke-width: 1; vector-effect: non-scaling-stroke; }
.ln { fill: none; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; vector-effect: non-scaling-stroke; }
.cursor { stroke: #d1d5db; stroke-width: 1; stroke-dasharray: 3 3; vector-effect: non-scaling-stroke; }
.dot { position: absolute; width: 8px; height: 8px; border-radius: 50%; background: #fff; border: 2px solid; transform: translate(-50%, -50%); pointer-events: none; }
.dot.sm { width: 7px; height: 7px; }
.hit-row { position: absolute; inset: 0; }
.hit { position: absolute; top: 0; height: 100%; cursor: crosshair; }
.x-axis { position: relative; height: 20px; margin-top: 6px; }
.x-label { position: absolute; font-size: 11px; color: #9ca3af; white-space: nowrap; }
.tip { display: flex; flex-direction: column; gap: 2px; font-size: 12px; line-height: 1.5; }
</style>
