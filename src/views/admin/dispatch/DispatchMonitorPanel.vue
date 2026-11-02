<script setup lang="ts">
// 分派监控（PRD 14.1）：页头统一筛选与派单日志入口；统计卡（13.2 / 13.5）平铺 → 派单趋势与派单路径占比 → 池状态（全局状态条 + 组池卡）→ 池积压与处理人负载
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
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

const router = useRouter();
const store = useDispatchStore();
const clock = useClock();

function goPoolManage() { router.push('/admin/dispatch-pool'); }

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

const CARD_ACCENT: Record<string, { accent: string; iconBg: string }> = {
  succ: { accent: '#1a6fff', iconBg: '#eff6ff' },
  fb: { accent: '#0ea5e9', iconBg: '#f0f9ff' },
  wait: { accent: '#8b5cf6', iconBg: '#ede9fe' },
  resp: { accent: '#10b981', iconBg: '#ecfdf5' },
  bal: { accent: '#f59e0b', iconBg: '#fffbeb' },
  bk: { accent: '#6366f1', iconBg: '#eef2ff' },
};

/** 统计卡：数字默认中性，只有真正异常（低于转混合线、超出目标、有积压）的数字标橙 */
const cards = computed(() => {
  const s = stats.value;
  const succLine = store.config.autoSuccessRate;
  const items = [
    {
      key: 'succ', label: '自动派单成功率', value: pct(s.successRate), icon: CheckCircleOutlined,
      warn: s.successRate != null && s.successRate < succLine,
      delta: { text: `转混合线 ${succLine}%`, tone: 'muted' } as Delta,
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
  return items.map((c) => ({ ...c, ...CARD_ACCENT[c.key] }));
});

/* ---------------- 池积压 ---------------- */
const backlogCols = [
  { title: '池名称', dataIndex: 'poolLabel', key: 'poolLabel', width: 150 },
  { title: '派单方式', key: 'mode', width: 90 },
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
        <div class="mon-filter-bar">
          <div class="filter-item">
            <span class="filter-label">时间</span>
            <a-segmented v-model:value="range" size="small" class="dispatch-time-seg" :options="RANGE_OPTS" />
          </div>
          <span class="filter-divider" aria-hidden="true" />
          <div class="filter-item">
            <span class="filter-label">组池</span>
            <a-select v-model:value="poolFilter" size="small" class="mon-pool-select" :options="poolFilterOpts" />
          </div>
          <a-button type="primary" size="small" @click="logOpen = true"><template #icon><FileSearchOutlined /></template>派单日志</a-button>
        </div>
      </template>
    </AdminPageHeader>

    <section class="block stat-block">
      <div class="stat-row">
        <div v-for="c in cards" :key="c.key" class="stat-card" :style="{ '--accent': c.accent }">
          <div class="stat-card-inner">
            <div class="stat-main">
              <div class="s-label">{{ c.label }}</div>
              <div class="s-value-row">
                <div class="s-value" :class="{ 'is-warn': c.warn }">{{ c.value }}</div>
                <div class="s-delta" :class="`t-${c.delta.tone}`">{{ c.delta.text }}</div>
              </div>
            </div>
            <div class="stat-icon" :style="{ background: c.iconBg, color: c.accent }">
              <component :is="c.icon" />
            </div>
          </div>
        </div>
      </div>
    </section>

    <div class="chart-row">
      <MonitorTrendChart :pool-ids="poolScope" />
      <MonitorPathDonut :items="stats.pathShare" :total="stats.pathTotal" :range-text="`${RANGE_TEXT[range]} · 共 ${stats.pathTotal} 次`" />
    </div>

    <MonitorPoolCards :pool-ids="poolScope" />

    <div class="monitor-table-row">
      <section class="block monitor-block">
        <div class="b-title inline">
          池积压
          <span class="b-tip">当前 {{ backlog.count }} 单 · 最长等待 {{ waitText(backlog.maxWait) }}</span>
          <a-button type="link" size="small" class="hd-btn" @click="goPoolManage">查看全部工单池 →</a-button>
        </div>
        <a-table :columns="backlogCols" :data-source="backlogTableRows" row-key="id" size="middle" :pagination="false" :scroll="{ x: 560 }">
          <template #bodyCell="{ column, record }">
            <span v-if="column.key === 'poolLabel'" class="pool-name">{{ record.poolLabel }}</span>
            <span v-else-if="column.key === 'mode'" class="dx-status" :class="`is-${MODE_TONE[record.effectiveMode as keyof typeof MODE_TONE]}`">{{ record.effectiveMode }}</span>
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
.mon { display: flex; flex-direction: column; gap: 16px; container-type: inline-size; }
.mon :deep(.admin-page-header) { flex-wrap: wrap; margin-bottom: 2px; }
.mon :deep(.aph-actions) { flex-shrink: 1; flex-wrap: wrap; align-items: center; max-width: 100%; }
.mon-filter-bar {
  display: flex; align-items: center; flex-wrap: wrap; gap: 10px 12px;
  padding: 6px 10px; background: #f8fafc; border: 1px solid #eef2f7; border-radius: 10px;
}
.mon-filter-bar .filter-item { display: inline-flex; align-items: center; gap: 8px; }
.mon-filter-bar .filter-label { font-size: 12px; font-weight: 500; color: #9ca3af; line-height: 1; flex: none; }
.mon-filter-bar .filter-divider { width: 1px; height: 16px; background: #e2e8f0; flex: none; }
.mon-pool-select { width: 148px; }
.mon-pool-select :deep(.ant-select-selector) {
  border-radius: 8px !important; border-color: #e5e7eb !important; background: #fff !important;
  height: 28px !important; padding-inline: 10px !important; align-items: center;
}
.mon-pool-select :deep(.ant-select-selection-item) {
  font-size: 12px !important; font-weight: 500 !important; color: #374151 !important; line-height: 26px !important;
}

/* 与 dispatch-config 监控页一致的区块容器 */
.stat-block { padding: 16px 20px; }

/* 统计卡：顶色条 + 右侧彩色图标 */
.stat-row { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 16px; }
.stat-card {
  min-width: 0;
  border: 1px solid #eef0f3;
  border-radius: 8px;
  padding: 16px 18px;
  position: relative;
  overflow: hidden;
  background: #fff;
  min-height: 96px;
}
.stat-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: var(--accent, #1a6fff);
}
.stat-card-inner { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding-top: 2px; }
.stat-main { flex: 1; min-width: 0; }
.stat-icon {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  flex: none;
}
.s-label { font-size: 12px; color: #6b7280; line-height: 1.4; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.s-value-row { display: flex; align-items: flex-end; gap: 8px; margin-top: 10px; flex-wrap: wrap; min-width: 0; }
.s-value {
  font-size: 28px;
  font-weight: 700;
  color: #111827;
  line-height: 1.1;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.s-value.is-warn { color: #ff7d00; }
.s-delta { font-size: 12px; line-height: 1.2; padding-bottom: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.t-muted, .t-good { color: #6b7280; }
.t-bad { color: #f59e0b; }

.chart-row { display: grid; grid-template-columns: minmax(0, 2fr) minmax(280px, 1fr); gap: 16px; }
.chart-row :deep(.dx-card) { border-color: #e5e7eb; padding: 16px 20px; }
.mon :deep(.ps) {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 16px 20px;
}
.mon :deep(.ps .dx-card) { border-color: #eef0f3; }
.n-hot { color: #ff7d00; font-weight: 600; }
.n-zero { color: #86909c; }

@container (max-width: 1080px) {
  .stat-row { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}
@container (max-width: 1100px) {
  .monitor-table-row { grid-template-columns: minmax(0, 1fr); }
}
@container (max-width: 900px) {
  .chart-row { grid-template-columns: minmax(0, 1fr); }
}
@container (max-width: 560px) {
  .stat-row { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
</style>
