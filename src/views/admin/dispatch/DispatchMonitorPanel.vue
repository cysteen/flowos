<script setup lang="ts">
// 分派监控（PRD 14.1）：页头统一筛选与派单日志入口；统计卡（13.2 / 13.5）→ 派单趋势与派单路径占比 → 池状态 → 池积压与处理人负载
import { computed, ref } from 'vue';
import {
  CheckCircleOutlined, ClockCircleOutlined, FieldTimeOutlined, FileSearchOutlined, InboxOutlined, RollbackOutlined, SlidersOutlined,
} from '@ant-design/icons-vue';
import AdminPageHeader from '@/components/admin/AdminPageHeader.vue';
import { useDispatchStore } from '@/stores/dispatch';
import { MODE_TONE, useClock, waitText } from './dispatchUi';
import { computeStats, minText, type RangeKey } from './dispatchMetrics';
import MonitorTrendChart from './MonitorTrendChart.vue';
import MonitorPathDonut from './MonitorPathDonut.vue';
import MonitorPoolCards from './MonitorPoolCards.vue';
import MonitorLoadTop from './MonitorLoadTop.vue';
import DispatchLogDrawer from './DispatchLogDrawer.vue';

defineProps<{ title: string; subtitle?: string }>();

const store = useDispatchStore();
const clock = useClock();

const range = ref<RangeKey>('today');
const RANGE_OPTS = [{ value: 'today', label: '今日' }, { value: '7d', label: '近 7 日' }, { value: '30d', label: '近 30 日' }];
const RANGE_TEXT: Record<RangeKey, string> = { today: '今日', '7d': '近 7 日', '30d': '近 30 日' };
const poolFilter = ref<string>('all');
const poolFilterOpts = computed(() => [
  { value: 'all', label: '全部组池' },
  ...store.groups.map((g) => ({ value: g.id, label: store.poolLabel(g.id) })),
]);
const poolScope = computed(() => (poolFilter.value === 'all' ? null : [poolFilter.value]));

const stats = computed(() => {
  void clock.value;
  const now = Date.now();
  return computeStats(store.logs, store.agents, range.value, poolScope.value, now, (name) => store.onDutyHoursOf(name, now),
    (no) => store.dispatchStatusOf(no));
});

const poolRows = computed(() => {
  void clock.value;
  void store.ticketStates;
  return store.poolViews();
});
const backlogTableRows = computed(() => poolRows.value.filter((p) => !poolScope.value || poolScope.value.includes(p.id)));
const backlog = computed(() => {
  const rows = backlogTableRows.value;
  return {
    count: rows.reduce((s, p) => s + p.waitingOriginal + p.queued + p.failed, 0),
    maxWait: rows.filter((p) => p.waitingOriginal + p.queued + p.failed).reduce((m, p) => Math.max(m, p.maxWaitMin), 0),
  };
});

/* ---------------- 统计卡 ---------------- */
interface Delta { text: string; tone: 'muted' | 'good' | 'bad' }
/** 时长较昨日变化（仅今日范围）；时长变短为好 */
function minDelta(d: number | null): Delta {
  if (range.value !== 'today') return { text: `${RANGE_TEXT[range.value]}中位数`, tone: 'muted' };
  if (d == null) return { text: '较昨日 —', tone: 'muted' };
  const r = Math.round(d);
  if (r === 0) return { text: '较昨日持平', tone: 'muted' };
  return { text: `较昨日 ${r > 0 ? '+' : '−'}${Math.abs(r)} 分钟`, tone: r > 0 ? 'bad' : 'good' };
}
const pct = (v: number | null) => (v == null ? '—' : `${v}%`);

const cards = computed(() => {
  const s = stats.value;
  const succLine = store.config.autoSuccessRate;
  return [
    {
      key: 'succ', label: '自动派单成功率', value: pct(s.successRate), accent: '#10b981', bg: '#ecfdf5', icon: CheckCircleOutlined,
      warn: s.successRate != null && s.successRate < succLine,
      delta: { text: `降级线 ${succLine}%`, tone: (s.successRate != null && s.successRate < succLine ? 'bad' : 'muted') } as Delta,
    },
    {
      key: 'fb', label: '兜底回池率', value: pct(s.fallbackRate), accent: '#f59e0b', bg: '#fffbeb', icon: RollbackOutlined, warn: false,
      delta: { text: `进入派单 ${s.enteredCount} 单`, tone: 'muted' } as Delta,
    },
    {
      key: 'wait', label: '池等待中位数', value: minText(s.waitMedian), accent: '#1a6fff', bg: '#eff6ff', icon: FieldTimeOutlined, warn: false,
      delta: minDelta(s.waitDelta),
    },
    {
      key: 'resp', label: '派单后首响中位数', value: minText(s.respMedian), accent: '#0ea5e9', bg: '#f0f9ff', icon: ClockCircleOutlined, warn: false,
      delta: minDelta(s.respDelta),
    },
    {
      key: 'bal', label: '派单均衡度', value: s.balance == null ? '—' : s.balance.toFixed(2), accent: '#8b5cf6', bg: '#f5f3ff', icon: SlidersOutlined,
      warn: s.balance != null && s.balance > 0.25,
      delta: { text: '目标 ≤ 0.25', tone: (s.balance != null && s.balance > 0.25 ? 'bad' : 'muted') } as Delta,
    },
    {
      key: 'bk', label: '池积压', value: String(backlog.value.count), accent: '#ef4444', bg: '#fef2f2', icon: InboxOutlined, warn: false,
      delta: { text: `最长等待 ${waitText(backlog.value.maxWait)}`, tone: (backlog.value.count ? 'bad' : 'muted') } as Delta,
    },
  ];
});

/* ---------------- 池积压 ---------------- */
const backlogCols = [
  { title: '池名称', dataIndex: 'poolLabel', key: 'poolLabel', ellipsis: true },
  { title: '池形态', key: 'mode', width: 90 },
  { title: '等原处理人', dataIndex: 'waitingOriginal', key: 'waitingOriginal', width: 96, align: 'right' as const },
  { title: '排队中', dataIndex: 'queued', key: 'queued', width: 76, align: 'right' as const },
  { title: '派单失败回池', dataIndex: 'failed', key: 'failed', width: 106, align: 'right' as const },
  { title: '最长等待', key: 'maxWait', width: 110, align: 'right' as const },
];

const logOpen = ref(false);
</script>

<template>
  <div class="mon">
    <AdminPageHeader :title="title" :subtitle="subtitle">
      <template #actions>
        <a-segmented v-model:value="range" :options="RANGE_OPTS" />
        <a-select v-model:value="poolFilter" :options="poolFilterOpts" style="width: 168px" />
        <a-button type="primary" @click="logOpen = true"><template #icon><FileSearchOutlined /></template>派单日志</a-button>
      </template>
    </AdminPageHeader>

    <section class="block stat-block">
      <div class="stat-row">
        <div v-for="c in cards" :key="c.key" class="stat-card" :style="{ '--accent': c.accent }">
          <div class="stat-inner">
            <div class="stat-main">
              <div class="s-label">{{ c.label }}</div>
              <div class="s-value" :class="{ warn: c.warn }">{{ c.value }}</div>
              <div class="s-delta" :class="`t-${c.delta.tone}`">{{ c.delta.text }}</div>
            </div>
            <div class="stat-icon" :style="{ background: c.bg, color: c.accent }"><component :is="c.icon" /></div>
          </div>
        </div>
      </div>
    </section>

    <div class="sec-hd">派单效果</div>
    <div class="chart-row">
      <MonitorTrendChart :pool-ids="poolScope" />
      <MonitorPathDonut :items="stats.pathShare" :total="stats.pathTotal" :range-text="`${RANGE_TEXT[range]} · 共 ${stats.pathTotal} 次`" />
    </div>

    <div class="sec-hd">池运行</div>
    <MonitorPoolCards :pool-ids="poolScope" />

    <div class="table-row">
      <section class="block">
        <div class="b-title">池积压<span class="b-sub">当前 {{ backlog.count }} 单 · 最长等待 {{ waitText(backlog.maxWait) }}</span></div>
        <a-table :columns="backlogCols" :data-source="backlogTableRows" row-key="id" size="middle" :pagination="false" :scroll="{ x: 560 }">
          <template #bodyCell="{ column, record }">
            <a-tag v-if="column.key === 'mode'" :color="MODE_TONE[record.effectiveMode as keyof typeof MODE_TONE]">{{ record.effectiveMode }}</a-tag>
            <span v-else-if="column.key === 'waitingOriginal' || column.key === 'queued' || column.key === 'failed'" :class="{ 'n-hot': record[column.key] > 0, 'n-zero': !record[column.key] }">{{ record[column.key] }}</span>
            <span v-else-if="column.key === 'maxWait'">{{ waitText(record.waitingOriginal + record.queued + record.failed ? record.maxWaitMin : 0) }}</span>
          </template>
        </a-table>
      </section>
      <MonitorLoadTop :pool-ids="poolScope" />
    </div>

    <DispatchLogDrawer v-model:open="logOpen" />
  </div>
</template>

<style scoped>
.mon { display: flex; flex-direction: column; container-type: inline-size; }
.mon :deep(.admin-page-header) { flex-wrap: wrap; }
.mon :deep(.aph-actions) { flex-shrink: 1; flex-wrap: wrap; align-items: center; }
.block { background: #fff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 16px 20px; min-width: 0; }
.b-title { font-size: 13px; font-weight: 600; color: #111827; margin-bottom: 12px; padding-left: 10px; border-left: 3px solid #1a6fff; display: flex; align-items: center; gap: 10px; min-height: 24px; flex-wrap: wrap; }
.b-sub { font-size: 12px; font-weight: normal; color: #9ca3af; }
.sec-hd { font-size: 14px; font-weight: 600; color: #374151; margin: 24px 0 12px; }

/* 统计卡（沿用旧版：顶部色条 + 右侧图标） */
.stat-block { padding: 16px 20px; }
.stat-row { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 12px; }
.stat-card { border: 1px solid #eef0f3; border-radius: 8px; padding: 14px 16px; position: relative; overflow: hidden; background: #fff; min-height: 100px; min-width: 0; }
.stat-card::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px; background: var(--accent); }
.stat-inner { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; padding-top: 2px; }
.stat-main { flex: 1; min-width: 0; }
.stat-icon { width: 36px; height: 36px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 17px; flex: none; }
.s-label { font-size: 12px; color: #6b7280; line-height: 1.4; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.s-value { font-size: 24px; font-weight: 700; color: #111827; line-height: 1.15; margin-top: 10px; white-space: nowrap; }
.s-value.warn { color: #f59e0b; }
.s-delta { font-size: 12px; margin-top: 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.t-muted { color: #9ca3af; }
.t-good { color: #10b981; }
.t-bad { color: #ea580c; }

.chart-row { display: grid; grid-template-columns: minmax(0, 2fr) minmax(280px, 1fr); gap: 16px; }
.table-row { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 16px; margin-top: 16px; align-items: start; }
.n-hot { color: #ea580c; font-weight: 600; }
.n-zero { color: #9ca3af; }
:deep(.ant-table-thead > tr > th) { background: #f3f4f6; color: #6b7280; font-size: 12px; }

@container (max-width: 1280px) {
  .stat-row { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}
@container (max-width: 1100px) {
  .table-row { grid-template-columns: minmax(0, 1fr); }
}
@container (max-width: 900px) {
  .chart-row { grid-template-columns: minmax(0, 1fr); }
}
@container (max-width: 560px) {
  .stat-row { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
</style>
