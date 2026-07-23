<script setup lang="ts">
import { reactive, ref, computed, watch, onMounted, onUnmounted } from 'vue';
import {
  AimOutlined,
  MessageOutlined,
  PhoneOutlined,
  ToolOutlined,
} from '@ant-design/icons-vue';
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

type StopOutcome = 'met' | 'breached' | 'void' | null;

interface Dial {
  clock: SlaClock;
  vis: Vis;
  outcome: StopOutcome;
  color: string;
  stroke: string;
  remainText: string;
  pct: number;
  sweep: number;
  dialText: string;
  stateLabel: string;
  bigText: string;
  startText: string;
}

/** 钟状态归一：在走(正常/临期/超时)/暂停/终态三分(达标/未达标/中止)，色随态 */
function clockState(c: SlaClock, rem: number): { vis: Vis; outcome: StopOutcome; color: string } {
  let vis: Vis;
  if (c.phase === 'stopped') vis = 'stopped';
  else if (c.phase === 'paused') vis = 'paused';
  else if (rem < 0) vis = 'over';
  else if (rem <= c.warnSec) vis = 'warn';
  else vis = 'normal';
  // 终态停表按结果三分（对齐 Zendesk Achieved/Breached、Jira Met/Breached，PRD §8.1）
  const outcome: StopOutcome =
    vis === 'stopped' ? c.stopOutcome ?? (rem >= 0 ? 'met' : 'breached') : null;
  const color =
    outcome === 'met' ? COLORS.normal : outcome === 'breached' ? COLORS.over : COLORS[vis];
  return { vis, outcome, color };
}

function stateLabelOf(vis: Vis, outcome: StopOutcome): string {
  if (outcome === 'met') return '已达标';
  if (outcome === 'breached') return '未达标';
  if (outcome === 'void') return '已停表';
  if (vis === 'paused') return '已暂停';
  if (vis === 'over') return '超时';
  if (vis === 'warn') return '临期';
  return '正常';
}

/** 绝对时刻文案：今日 HH:MM / M/D HH:MM */
function whenText(ms: number): string {
  const d = new Date(ms);
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return d.toDateString() === new Date().toDateString()
    ? `今日 ${hm}`
    : `${d.getMonth() + 1}/${d.getDate()} ${hm}`;
}

const KIND_ICON: Record<SlaClock['kind'], unknown> = {
  whole: AimOutlined,
  first: MessageOutlined,
  node: ToolOutlined,
  callback: PhoneOutlined,
};
const KIND_NAME: Record<SlaClock['kind'], string> = {
  whole: '整单',
  first: '首响',
  node: '节点',
  callback: '回访',
};

/** 展示顺序：首响在前、整单解决在后（op-header 固定只展示这两类整单时效） */
const KIND_ORDER: Record<SlaClock['kind'], number> = {
  first: 0,
  whole: 1,
  node: 2,
  callback: 3,
};

function buildDial(c: SlaClock, i: number, wholeStartMs?: number): Dial {
  const rem = liveRemain[i] ?? c.remainSec;
  const { vis, outcome, color } = clockState(c, rem);

  let remainText: string;
  if (outcome === 'met') remainText = '已达标';
  else if (outcome === 'breached') remainText = '未达标';
  else if (outcome === 'void') remainText = '已停表';
  else if (vis === 'paused') remainText = fmtShort(rem, rem < 0); // 暂停显示冻结剩余，暂停态由表盘徽标标识
  else remainText = fmtShort(rem, vis === 'over');

  const pct = clamp(((c.totalSec - rem) / c.totalSec) * 100);
  const sweep = (pct / 100) * 360;

  // hover 浮层：大号剩/超（终态显示结果文案）+ 起算→截止
  const bigText =
    outcome === 'met' ? '已达标'
    : outcome === 'breached' ? '未达标'
    : outcome === 'void' ? '已停表'
    : `${rem < 0 ? '超' : '剩'} ${fmtLong(rem)}`;
  // 整单/首响均起算于建单：优先用整单钟起点，避免停表钟按冻结剩余回推产生漂移
  const startText = whenText(
    c.kind === 'first' || c.kind === 'whole'
      ? wholeStartMs ?? Date.now() - (c.totalSec - rem) * 1000
      : Date.now() - (c.totalSec - rem) * 1000,
  );

  return {
    clock: c,
    vis,
    outcome,
    color,
    stroke:
      outcome === 'met' ? DIAL_STROKE.normal
      : outcome === 'breached' ? DIAL_STROKE.over
      : DIAL_STROKE[vis],
    remainText,
    pct,
    sweep,
    dialText: dialLabel(c),
    stateLabel: stateLabelOf(vis, outcome),
    bigText,
    startText,
  };
}

/** 整单钟起算时刻（ms）：首响/整单共用（同起算于建单） */
function wholeStartMs(): number | undefined {
  const i = props.detail.slaClocks.findIndex((c) => c.kind === 'whole');
  if (i < 0) return undefined;
  const c = props.detail.slaClocks[i];
  return Date.now() - (c.totalSec - (liveRemain[i] ?? c.remainSec)) * 1000;
}

const dials = computed<Dial[]>(() => {
  const ws = wholeStartMs();
  return props.detail.slaClocks
    .map((c, i) => ({ c, i }))
    // op-header 固定只展示「整单首响 + 整单解决」两类整单时效；节点/回访时效不在头部展示
    .filter(({ c }) => c.kind === 'first' || c.kind === 'whole')
    .sort((a, b) => KIND_ORDER[a.c.kind] - KIND_ORDER[b.c.kind])
    .map(({ c, i }) => buildDial(c, i, ws));
});

// ---- hover 浮层「时效关系」迷你时间轴（.pen meHhu）：各钟窗口段映射到整单时间轴，共享"现在"刻度 ----
const AXIS_W = 176;

interface RelationRow {
  key: string;
  name: string;
  icon: unknown;
  color: string;
  segLeft: number;
  segWidth: number;
  value: string;
}

const relationData = computed<{ rows: RelationRow[]; nowLeft: number }>(() => {
  const items = props.detail.slaClocks.map((c, i) => ({ c, rem: liveRemain[i] ?? c.remainSec }));
  const whole = items.find((x) => x.c.kind === 'whole') ?? items[0];
  if (!whole) return { rows: [], nowLeft: 0 };
  const span = Math.max(whole.c.totalSec, 1);
  const wholeElapsed = whole.c.totalSec - whole.rem;
  // 关系图行序：整单 → 首响 → 节点 → 回访（.pen meHhu）
  const RELATION_ORDER: Record<SlaClock['kind'], number> = { whole: 0, first: 1, node: 2, callback: 3 };
  const rows = items
    .slice()
    .sort((a, b) => RELATION_ORDER[a.c.kind] - RELATION_ORDER[b.c.kind])
    .map(({ c, rem }) => {
      const { outcome, color } = clockState(c, rem);
      // 该钟窗口（起算→截止）映射到整单时间轴；整单/首响均起算于建单（锚左端），节点按已走时长回推
      const startRel =
        c.kind === 'whole' || c.kind === 'first' ? 0 : wholeElapsed - (c.totalSec - rem);
      const left = Math.max(0, Math.min(AXIS_W - 8, (startRel / span) * AXIS_W));
      const width = Math.max(8, Math.min(AXIS_W - left, (c.totalSec / span) * AXIS_W));
      const value =
        outcome === 'met' ? '✔达标'
        : outcome === 'breached' ? '未达标'
        : outcome === 'void' ? '已停表'
        : fmtShort(rem, rem < 0);
      return {
        key: c.label,
        name: KIND_NAME[c.kind],
        icon: KIND_ICON[c.kind],
        color,
        segLeft: left,
        segWidth: width,
        value,
      };
    });
  const nowLeft = Math.max(0, Math.min(AXIS_W - 2, (wholeElapsed / span) * AXIS_W));
  return { rows, nowLeft };
});

// 「查看全部时效」弹窗：全部钟（含节点/回访）明细
const allOpen = ref(false);
const allDials = computed<Dial[]>(() => {
  const ws = wholeStartMs();
  return props.detail.slaClocks
    .map((c, i) => ({ c, i }))
    .sort((a, b) => KIND_ORDER[a.c.kind] - KIND_ORDER[b.c.kind])
    .map(({ c, i }) => buildDial(c, i, ws));
});
</script>

<template>
  <div class="sla-bar">
    <div
      v-for="d in dials"
      :key="d.clock.label"
      class="sla-item"
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

      <!-- hover 浮层（.pen meHhu）：钟详情 + 时效关系迷你时间轴 -->
      <div class="sla-pop">
        <div class="pop-card">
          <div class="pop-head">
            <div class="pop-head-l">
              <component :is="KIND_ICON[d.clock.kind]" :style="{ color: d.color, fontSize: '14px' }" />
              <span class="pop-name">{{ d.clock.label }}</span>
            </div>
            <span class="pop-badge" :style="{ color: d.color, background: `${d.color}1F` }">{{ d.stateLabel }}</span>
          </div>
          <div class="pop-big" :style="{ color: d.color }">{{ d.bigText }}</div>
          <div class="pop-range">起算 {{ d.startText }}&ensp;→&ensp;截止 {{ d.clock.dueBy }}</div>
          <div class="pop-divider" />
          <div class="pop-rel-label">时效关系（节点 ⊂ 整单）</div>
          <div v-for="r in relationData.rows" :key="r.key" class="pop-row">
            <div class="pop-row-label">
              <component :is="r.icon" :style="{ color: r.color, fontSize: '11px' }" />
              <span>{{ r.name }}</span>
            </div>
            <div class="pop-axis">
              <div class="axis-track" />
              <div class="axis-seg" :style="{ left: `${r.segLeft}px`, width: `${r.segWidth}px`, background: r.color }" />
              <div class="axis-now" :style="{ left: `${relationData.nowLeft}px` }" />
            </div>
            <span class="pop-row-val" :style="{ color: r.color }">{{ r.value }}</span>
          </div>
          <span class="pop-foot" @click="allOpen = true">点击查看全部时效 →</span>
        </div>
      </div>
    </div>

    <!-- 全部时效弹窗 -->
    <a-modal v-model:open="allOpen" title="全部时效" :footer="null" :width="480">
      <div class="all-list">
        <div v-for="d in allDials" :key="d.clock.label" class="all-row">
          <div class="all-row-l">
            <component :is="KIND_ICON[d.clock.kind]" :style="{ color: d.color, fontSize: '14px' }" />
            <div class="all-row-meta">
              <span class="all-name">{{ d.clock.label }}</span>
              <span class="all-range">起算 {{ d.startText }} → 截止 {{ d.clock.dueBy }}</span>
            </div>
          </div>
          <div class="all-row-r">
            <span class="all-remain" :style="{ color: d.color }">{{ d.bigText }}</span>
            <span class="pop-badge" :style="{ color: d.color, background: `${d.color}1F` }">{{ d.stateLabel }}</span>
          </div>
        </div>
      </div>
    </a-modal>
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
  position: relative;
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  cursor: default;
}

/* ---- hover 浮层（.pen meHhu） ---- */
.sla-pop {
  position: absolute;
  top: 100%;
  right: -12px;
  padding-top: 10px; /* 悬停桥接区，避免移向浮层时 hover 断开 */
  display: none;
  z-index: 80;
}
.sla-item:hover .sla-pop {
  display: block;
}
.pop-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 320px;
  padding: 14px;
  box-sizing: border-box;
  background: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  box-shadow: 0 6px 18px -4px rgba(15, 23, 42, 0.15);
  cursor: default;
}
.pop-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.pop-head-l {
  display: flex;
  align-items: center;
  gap: 6px;
}
.pop-name {
  font-size: 13px;
  font-weight: 700;
  color: #374151;
}
.pop-badge {
  font-size: 10px;
  font-weight: 700;
  padding: 1px 7px;
  border-radius: 999px;
  white-space: nowrap;
}
.pop-big {
  font-size: 20px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  line-height: 1.1;
}
.pop-range {
  font-size: 11px;
  color: #6b7280;
}
.pop-divider {
  height: 1px;
  background: #eef0f2;
}
.pop-rel-label {
  font-size: 10px;
  font-weight: 700;
  color: #9ca3af;
}
.pop-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.pop-row-label {
  display: flex;
  align-items: center;
  gap: 4px;
  width: 58px;
  flex: none;
  font-size: 10px;
  font-weight: 600;
  color: #6b7280;
}
.pop-axis {
  position: relative;
  width: 176px;
  height: 16px;
  flex: none;
}
.axis-track {
  position: absolute;
  top: 6px;
  left: 0;
  width: 176px;
  height: 4px;
  border-radius: 2px;
  background: #edf0f2;
}
.axis-seg {
  position: absolute;
  top: 5px;
  height: 6px;
  border-radius: 3px;
}
.axis-now {
  position: absolute;
  top: 0;
  width: 2px;
  height: 16px;
  border-radius: 1px;
  background: #94a3b8;
}
.pop-row-val {
  width: 52px;
  flex: none;
  text-align: right;
  font-size: 10px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.pop-foot {
  font-size: 10px;
  font-weight: 600;
  color: #2563eb;
  cursor: pointer;
}
.pop-foot:hover {
  text-decoration: underline;
}

/* ---- 全部时效弹窗 ---- */
.all-list {
  display: flex;
  flex-direction: column;
}
.all-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 4px;
}
.all-row + .all-row {
  border-top: 1px solid #f1f2f4;
}
.all-row-l {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.all-row-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.all-name {
  font-size: 13px;
  font-weight: 600;
  color: #374151;
}
.all-range {
  font-size: 11px;
  color: #9ca3af;
}
.all-row-r {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: none;
}
.all-remain {
  font-size: 14px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
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
