<script setup lang="ts">
// 分派监控（PRD 14.1）：页头统一筛选与派单日志入口；统计卡（13.2 / 13.5）平铺 → 派单趋势与派单路径占比 → 池状态（全局状态条 + 组池卡）→ 池积压与处理人负载
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
import './dispatchTheme.css';

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
  return { text: `较昨日 ${r > 0 ? '+' : '−'}${Math.abs(r)} 分钟`, tone: r > 0 ? 'bad' : 'muted' };
}
const pct = (v: number | null) => (v == null ? '—' : `${v}%`);

/** 统计卡：数字默认中性，只有真正异常（低于降级线、超出目标、有积压）的数字标橙 */
const cards = computed(() => {
  const s = stats.value;
  const succLine = store.config.autoSuccessRate;
  return [
    {
      key: 'succ', label: '自动派单成功率', value: pct(s.successRate), icon: CheckCircleOutlined,
      warn: s.successRate != null && s.successRate < succLine,
      delta: { text: `降级线 ${succLine}%`, tone: 'muted' } as Delta,
    },
    {
      key: 'fb', label: '兜底回池率', value: pct(s.fallbackRate), icon: RollbackOutlined, warn: false,
      delta: { text: `进入派单 ${s.enteredCount} 单`, tone: 'muted' } as Delta,
    },
    {
      key: 'wait', label: '池等待中位数', value: minText(s.waitMedian), icon: FieldTimeOutlined, warn: false,
      delta: minDelta(s.waitDelta),
    },
    {
      key: 'resp', label: '派单后首响中位数', value: minText(s.respMedian), icon: ClockCircleOutlined, warn: false,
      delta: minDelta(s.respDelta),
    },
    {
      key: 'bal', label: '派单均衡度', value: s.balance == null ? '—' : s.balance.toFixed(2), icon: SlidersOutlined,
      warn: s.balance != null && s.balance > 0.25,
      delta: { text: '目标 ≤ 0.25', tone: 'muted' } as Delta,
    },
    {
      key: 'bk', label: '池积压', value: String(backlog.value.count), icon: InboxOutlined, warn: backlog.value.count > 0,
      delta: { text: `最长等待 ${waitText(backlog.value.maxWait)}`, tone: 'muted' } as Delta,
    },
  ];
});

/* ---------------- 池积压 ---------------- */
const backlogCols = [
  { title: '池名称', dataIndex: 'poolLabel', key: 'poolLabel', width: 150 },
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

    <div class="stat-row">
      <div v-for="c in cards" :key="c.key" class="dx-card stat-card">
        <div class="stat-top">
          <span class="s-label">{{ c.label }}</span>
          <span class="dx-icon stat-icon"><component :is="c.icon" /></span>
        </div>
        <div class="dx-num" :class="{ 'is-warn': c.warn }">{{ c.value }}</div>
        <div class="s-delta" :class="`t-${c.delta.tone}`">{{ c.delta.text }}</div>
      </div>
    </div>

    <div class="chart-row">
      <MonitorTrendChart :pool-ids="poolScope" />
      <MonitorPathDonut :items="stats.pathShare" :total="stats.pathTotal" :range-text="`${RANGE_TEXT[range]} · 共 ${stats.pathTotal} 次`" />
    </div>

    <MonitorPoolCards :pool-ids="poolScope" />

    <div class="table-row">
      <section class="dx-card">
        <div class="dx-sec-hd">
          <span class="dx-sec-title">池积压</span>
          <span class="dx-sec-sub">当前 {{ backlog.count }} 单 · 最长等待 {{ waitText(backlog.maxWait) }}</span>
        </div>
        <a-table :columns="backlogCols" :data-source="backlogTableRows" row-key="id" size="middle" :pagination="false" :scroll="{ x: 560 }">
          <template #bodyCell="{ column, record }">
            <span v-if="column.key === 'mode'" class="dx-status" :class="`is-${MODE_TONE[record.effectiveMode as keyof typeof MODE_TONE]}`">{{ record.effectiveMode }}</span>
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
/* 区块之间 24 */
.mon > .stat-row ~ * { margin-top: 24px; }

/* 统计卡：直接平铺在页面上，中性白卡 */
.stat-row { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 16px; }
.stat-card { min-width: 0; }
.stat-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px; }
.stat-icon { width: 32px; height: 32px; font-size: 15px; }
.s-label { font-size: 13px; color: #86909c; line-height: 20px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
.s-delta { font-size: 13px; margin-top: 6px; line-height: 20px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.t-muted, .t-good { color: #86909c; }
.t-bad { color: #ff7d00; }

.chart-row { display: grid; grid-template-columns: minmax(0, 2fr) minmax(280px, 1fr); gap: 16px; }
.table-row { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 16px; align-items: start; }
.n-hot { color: #ff7d00; font-weight: 600; }
.n-zero { color: #86909c; }
:deep(.ant-table-thead > tr > th) { background: #f3f4f6; color: #6b7280; font-size: 12px; }

@container (max-width: 1080px) {
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
