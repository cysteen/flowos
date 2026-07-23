<script setup lang="ts">
import { reactive, computed, watch, onMounted, onUnmounted } from 'vue';
import type { TicketDetailMeta, SlaClock } from '@/mock/ticketDetail';

const props = defineProps<{ detail: TicketDetailMeta }>();

type Vis = 'normal' | 'warn' | 'over' | 'paused' | 'stopped';

const COLORS: Record<Vis, string> = {
  normal: '#16A34A',
  warn: '#F59E0B',
  over: '#EF4444',
  paused: '#9CA3AF',
  stopped: '#6B7280',
};
const RING_BG = '#E5E7EB';
const DIAL_STROKE: Record<Vis, string> = {
  normal: '#DCFCE7',
  warn: '#FEF3C7',
  over: '#FEE2E2',
  paused: '#F3F4F6',
  stopped: '#E5E7EB',
};

const liveRemain = reactive<number[]>([]);

function sync() {
  liveRemain.length = props.detail.slaClocks.length;
  props.detail.slaClocks.forEach((c, i) => {
    liveRemain[i] = c.remainSec;
  });
}
sync();
watch(() => props.detail.slaClocks, sync);

let timer: ReturnType<typeof setInterval> | undefined;
onMounted(() => {
  timer = setInterval(() => {
    props.detail.slaClocks.forEach((c, i) => {
      if (c.phase === 'running') liveRemain[i] = (liveRemain[i] ?? c.remainSec) - 1;
    });
  }, 1000);
});
onUnmounted(() => {
  if (timer) clearInterval(timer);
});

const clamp = (n: number) => Math.max(0, Math.min(100, n));

/** 短时长：剩 5h 30m / 剩 3m 20s；超时前缀 超（不用负号） */
function fmtShort(sec: number, over = false): string {
  const s = Math.abs(Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  let body: string;
  if (h > 0) body = m > 0 ? `${h}h ${m}m` : `${h}h`;
  else if (m > 0) body = ss > 0 ? `${m}m ${ss}s` : `${m}m`;
  else body = `${ss}s`;
  return over ? `超 ${body}` : `剩 ${body}`;
}

function fmtLong(sec: number): string {
  const s = Math.abs(Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(h)}:${p(m)}:${p(ss)}`;
}

/** 表盘中心短名（对齐 Pencil：解决 / 首响 / 节点） */
function dialLabel(c: SlaClock): string {
  if (c.kind === 'whole') return '整单';
  if (c.kind === 'first') return '首响';
  if (c.kind === 'node') return '节点';
  if (c.kind === 'callback') return '回访';
  return c.label.slice(0, 2);
}

interface Dial {
  clock: SlaClock;
  vis: Vis;
  color: string;
  stroke: string;
  remainText: string;
  pct: number;
  sweep: number;
  dialText: string;
  title: string;
}

/** 展示顺序：首响在前、整单解决在后（op-header 固定只展示这两类整单时效） */
const KIND_ORDER: Record<SlaClock['kind'], number> = {
  first: 0,
  whole: 1,
  node: 2,
  callback: 3,
};

function buildDial(c: SlaClock, i: number): Dial {
  const rem = liveRemain[i] ?? c.remainSec;
  let vis: Vis;
  if (c.phase === 'stopped') vis = 'stopped';
  else if (c.phase === 'paused') vis = 'paused';
  else if (rem < 0) vis = 'over';
  else if (rem <= c.warnSec) vis = 'warn';
  else vis = 'normal';

  // 首响钟停表且剩余非负 = 时限内达标（绿）；区别于终态停表（灰）——与工作台列表「首响：已达标」一致
  const met = c.kind === 'first' && vis === 'stopped' && rem >= 0;

  let remainText: string;
  if (met) remainText = '已达标';
  else if (vis === 'stopped') remainText = '已停表';
  else if (vis === 'paused') remainText = fmtShort(rem, rem < 0); // 暂停显示冻结剩余，暂停态由表盘徽标标识
  else remainText = fmtShort(rem, vis === 'over');

  const pct = clamp(((c.totalSec - rem) / c.totalSec) * 100);
  const sweep = (pct / 100) * 360;

  let title: string;
  if (met) title = `${c.label}：已达标（时限内完成首次响应，计时停表）`;
  else if (vis === 'paused') title = `${c.label}：SLA 已暂停（挂起，剩 ${fmtLong(rem)}，可恢复续算）`;
  else if (vis === 'stopped') title = `${c.label}：SLA 已停表（计时终止，不可重启）`;
  else if (vis === 'over') title = `${c.label}：截止 ${c.dueBy}，已超时 ${fmtLong(rem)}`;
  else if (vis === 'warn') title = `${c.label}：截止 ${c.dueBy}，临期，距超时剩 ${fmtLong(rem)}`;
  else title = `${c.label}：截止 ${c.dueBy}，距超时剩 ${fmtLong(rem)}`;

  return {
    clock: c,
    vis,
    color: met ? COLORS.normal : COLORS[vis],
    stroke: met ? DIAL_STROKE.normal : DIAL_STROKE[vis],
    remainText,
    pct,
    sweep,
    dialText: dialLabel(c),
    title,
  };
}

const dials = computed<Dial[]>(() =>
  props.detail.slaClocks
    .map((c, i) => ({ c, i }))
    // op-header 固定只展示「整单首响 + 整单解决」两类整单时效；节点/回访时效不在头部展示
    .filter(({ c }) => c.kind === 'first' || c.kind === 'whole')
    .sort((a, b) => KIND_ORDER[a.c.kind] - KIND_ORDER[b.c.kind])
    .map(({ c, i }) => buildDial(c, i)),
);
</script>

<template>
  <div
    class="sla-bar"
    title="首响在前、整单解决在后；绿=正常 / 橙=临期 / 红=超时 / 灰=暂停；表盘外环=已消耗比例"
  >
    <div
      v-for="d in dials"
      :key="d.clock.label"
      class="sla-item"
      :title="d.title"
    >
      <div class="dial" :style="{ '--dial-stroke': d.stroke }">
        <svg class="dial-svg" viewBox="0 0 36 36" aria-hidden="true">
          <!-- 表盘底 -->
          <circle cx="18" cy="18" r="17" fill="#FFFFFF" :stroke="d.stroke" stroke-width="1" />
          <!-- 外环底 -->
          <circle
            cx="18"
            cy="18"
            r="15.2"
            fill="none"
            :stroke="RING_BG"
            stroke-width="3.2"
          />
          <!-- 外环进度：从 12 点顺时针 -->
          <circle
            cx="18"
            cy="18"
            r="15.2"
            fill="none"
            :stroke="d.color"
            stroke-width="3.2"
            stroke-linecap="round"
            :stroke-dasharray="`${(d.sweep / 360) * 95.5} 95.5`"
            transform="rotate(-90 18 18)"
          />
          <!-- 刻度 12/3/6/9 -->
          <rect x="17" y="4" width="2" height="2.5" rx="0.5" fill="#9CA3AF" />
          <rect x="29.5" y="17" width="2.5" height="2" rx="0.5" fill="#9CA3AF" />
          <rect x="17" y="29.5" width="2" height="2.5" rx="0.5" fill="#9CA3AF" />
          <rect x="4" y="17" width="2.5" height="2" rx="0.5" fill="#9CA3AF" />
        </svg>
        <span class="dial-label" :style="{ color: d.color }">{{ d.dialText }}</span>
        <span v-if="d.vis === 'paused'" class="dial-pause" aria-hidden="true">
          <svg viewBox="0 0 8 8" width="8" height="8">
            <rect x="1.4" y="1" width="1.7" height="6" rx="0.5" fill="#FFFFFF" />
            <rect x="4.9" y="1" width="1.7" height="6" rx="0.5" fill="#FFFFFF" />
          </svg>
        </span>
      </div>
      <span class="sla-time" :style="{ color: d.color }">{{ d.remainText }}</span>
    </div>
  </div>
</template>

<style scoped>
.sla-bar {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 12px;
  width: auto;
  max-width: 280px;
  box-sizing: border-box;
}
.sla-item {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  cursor: default;
}
.dial {
  position: relative;
  width: 36px;
  height: 36px;
  flex: none;
}
.dial-svg {
  display: block;
  width: 36px;
  height: 36px;
}
.dial-label {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 9px;
  font-weight: 700;
  line-height: 1;
  pointer-events: none;
}
.dial-pause {
  position: absolute;
  top: -2px;
  right: -2px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #6b7280;
  border: 1.5px solid #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
}
.sla-time {
  font-size: 12px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  line-height: 1.2;
}
</style>
