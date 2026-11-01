<script setup lang="ts">
// 分派监控（PRD 14.1）：统计卡（13.5）、池形态区（5.4）、派单路径占比、池积压、处理人负载、派单日志入口
import { computed, ref } from 'vue';
import { FileSearchOutlined, HistoryOutlined } from '@ant-design/icons-vue';
import { useDispatchStore } from '@/stores/dispatch';
import { stdPagination } from '@/config/adminUi';
import { SIGN_IN_STATUSES, type DispatchAuditEntry } from '@/views/tickets/types/dispatch';
import { MODE_TONE, SIGN_TONE, useClock, waitText } from './dispatchUi';
import { computeStats, minText, parseAt, type RangeKey } from './dispatchMetrics';
import PoolModeSwitchModal from './PoolModeSwitchModal.vue';
import DispatchLogDrawer from './DispatchLogDrawer.vue';

const store = useDispatchStore();
const clock = useClock();

const range = ref<RangeKey>('today');
const RANGE_OPTS = [{ value: 'today', label: '今日' }, { value: '7d', label: '近 7 日' }, { value: '30d', label: '近 30 日' }];
const poolFilter = ref<string>('all');
const poolFilterOpts = computed(() => [
  { value: 'all', label: '全部组池' },
  ...store.groups.map((g) => ({ value: g.id, label: store.poolLabel(g.id) })),
]);
const poolScope = computed(() => (poolFilter.value === 'all' ? null : [poolFilter.value]));

const stats = computed(() => {
  void clock.value;
  return computeStats(store.logs, store.agents, range.value, poolScope.value, Date.now());
});

const poolRows = computed(() => {
  void clock.value;
  void store.ticketStates;
  return store.poolViews();
});
const backlog = computed(() => {
  const rows = poolRows.value.filter((p) => !poolScope.value || poolScope.value.includes(p.id));
  return {
    count: rows.reduce((s, p) => s + p.waitingOriginal + p.queued + p.failed, 0),
    maxWait: rows.filter((p) => p.waitingOriginal + p.queued + p.failed).reduce((m, p) => Math.max(m, p.maxWaitMin), 0),
  };
});

const firstRespDeltaText = computed(() => {
  const d = stats.value.firstRespDelta;
  if (range.value !== 'today') return '';
  if (d == null) return '较昨日 —';
  const r = Math.round(d);
  return r === 0 ? '较昨日持平' : `较昨日 ${r > 0 ? '+' : '−'}${Math.abs(r)} 分钟`;
});

/* ---------------- 池形态区 ---------------- */
const globalMode = computed(() => store.globalEffectiveMode());
const modeOpen = ref(false);
const modeScope = ref<'global' | string>('global');
function openMode(scope: 'global' | string) { modeScope.value = scope; modeOpen.value = true; }

const resumeMinutes = computed(() => Number((store.config as unknown as Record<string, unknown>).resumeOkMinutes ?? 10));
/** 自动降级后各项指标连续达标：达标窗口内无派单失败回池，且降级已满窗口时长 */
const canResume = computed(() => {
  void clock.value;
  if (!store.config.autoDegraded) return false;
  const win = resumeMinutes.value * 60_000;
  const now = Date.now();
  const degradedAt = [...store.audits].reverse().find((a) => a.kind === '池形态' && a.target === '全局' && a.operator === '系统');
  if (degradedAt && now - parseAt(degradedAt.at) < win) return false;
  return !store.logs.some((l) => l.status === '派单失败回池' && now - parseAt(l.at) < win);
});

const groupModeRows = computed(() => {
  void clock.value;
  return store.groups.map((g) => ({
    id: g.id,
    label: store.poolLabel(g.id),
    groupMode: store.groupModeOf(g.id),
    effective: store.effectiveModeOf(g.id),
    switchOn: g.switchOn,
  }));
});

const recordOpen = ref(false);
const modeRecords = computed<DispatchAuditEntry[]>(() => [...store.audits].filter((a) => a.kind === '池形态' || a.kind === '全局开关' || a.kind === '班组开关').reverse());
const recordCols = [
  { title: '时间', dataIndex: 'at', key: 'at', width: 160 },
  { title: '操作方', dataIndex: 'operator', key: 'operator', width: 90 },
  { title: '范围', dataIndex: 'target', key: 'target', width: 150 },
  { title: '类型', dataIndex: 'kind', key: 'kind', width: 90 },
  { title: '切换前', dataIndex: 'before', key: 'before', width: 80 },
  { title: '切换后', dataIndex: 'after', key: 'after', width: 80 },
  { title: '触发条件或原因', dataIndex: 'reason', key: 'reason' },
];

/* ---------------- 池积压 ---------------- */
const backlogCols = [
  { title: '池名称', dataIndex: 'poolLabel', key: 'poolLabel' },
  { title: '池形态', key: 'mode', width: 100 },
  { title: '等原处理人', dataIndex: 'waitingOriginal', key: 'waitingOriginal', width: 100, align: 'right' as const },
  { title: '排队中', dataIndex: 'queued', key: 'queued', width: 90, align: 'right' as const },
  { title: '派单失败回池', dataIndex: 'failed', key: 'failed', width: 110, align: 'right' as const },
  { title: '最长等待', key: 'maxWait', width: 120 },
];
const backlogTableRows = computed(() => poolRows.value.filter((p) => !poolScope.value || poolScope.value.includes(p.id)));

/* ---------------- 处理人负载 ---------------- */
const loadGroup = ref('all');
const loadSign = ref('all');
const loadGroupOpts = computed(() => [{ value: 'all', label: '全部组' }, ...store.groups.map((g) => ({ value: g.id, label: g.label }))]);
const loadSignOpts = [{ value: 'all', label: '全部状态' }, ...SIGN_IN_STATUSES.map((s) => ({ value: s, label: s }))];
const loadRows = computed(() => {
  void clock.value;
  return store.agents
    .filter((a) => !a.disabled)
    .filter((a) => loadGroup.value === 'all' || a.groupIds.includes(loadGroup.value))
    .filter((a) => loadSign.value === 'all' || a.signIn === loadSign.value)
    .map((a) => {
      const v = store.agentView(a.name)!;
      return {
        name: a.name,
        staffNo: a.staffNo,
        groups: a.groupIds.map((g) => store.groupOf(g)?.label ?? g).join('、'),
        signIn: a.signIn,
        inTransit: v.inTransit,
        cap: v.cap,
        ratio: v.cap ? v.inTransit / v.cap : 0,
        overLimit: v.overLimit,
        overAssigned: v.overAssigned,
      };
    })
    .sort((x, y) => y.ratio - x.ratio);
});
const loadCols = [
  { title: '姓名', key: 'name', width: 140 },
  { title: '所属组', dataIndex: 'groups', key: 'groups', ellipsis: true },
  { title: '签入状态', key: 'signIn', width: 100 },
  { title: '在途 / 上限', key: 'load', width: 120 },
  { title: '标记', key: 'flag', width: 120 },
];

const logOpen = ref(false);
</script>

<template>
  <div class="mon">
    <div class="mon-bar">
      <a-segmented v-model:value="range" :options="RANGE_OPTS" />
      <a-select v-model:value="poolFilter" :options="poolFilterOpts" style="width: 180px" />
      <a-button class="mon-log" type="primary" @click="logOpen = true"><template #icon><FileSearchOutlined /></template>派单日志</a-button>
    </div>

    <section class="block stat-row">
      <div class="stat-card" style="--accent: #1a6fff">
        <div class="s-label">首响时长</div>
        <div class="s-seg">
          <div><span class="s-seg-k">池等待</span><span class="s-value">{{ minText(stats.waitMedian) }}</span></div>
          <div class="s-plus">＋</div>
          <div><span class="s-seg-k">派单后首响</span><span class="s-value">{{ minText(stats.respMedian) }}</span></div>
        </div>
        <div class="s-sub">{{ firstRespDeltaText || '中位数' }}</div>
      </div>
      <div class="stat-card" style="--accent: #0ea5e9">
        <div class="s-label">派单均衡度</div>
        <div class="s-value" :class="{ warn: stats.balance != null && stats.balance > 0.25 }">{{ stats.balance == null ? '—' : stats.balance.toFixed(2) }}</div>
        <div class="s-sub">目标 0.25</div>
      </div>
      <div class="stat-card" style="--accent: #f59e0b">
        <div class="s-label">池积压</div>
        <div class="s-value">{{ backlog.count }}</div>
        <div class="s-sub">最长等待 {{ waitText(backlog.maxWait) }}</div>
      </div>
      <div class="stat-card" style="--accent: #10b981">
        <div class="s-label">自动派单成功率</div>
        <div class="s-value">{{ stats.successRate == null ? '—' : `${stats.successRate}%` }}</div>
        <div class="s-sub">兜底回池率 {{ stats.fallbackRate == null ? '—' : `${stats.fallbackRate}%` }}</div>
      </div>
    </section>

    <div class="mon-row">
      <section class="block mode-block">
        <div class="b-title">
          池形态
          <a-button class="hd-btn" size="small" @click="recordOpen = true"><template #icon><HistoryOutlined /></template>切换记录</a-button>
        </div>
        <div class="mode-global">
          <div class="mg-l">
            <span class="mg-name">全局</span>
            <a-tag :color="MODE_TONE[globalMode]">{{ globalMode }}</a-tag>
            <a-tag v-if="store.config.autoDegraded" color="orange">自动降级</a-tag>
            <span class="mg-meta">全局开关{{ store.config.globalSwitch ? '开启' : '关闭' }} · {{ store.config.runMode }}</span>
          </div>
          <div class="mg-r">
            <a-tooltip v-if="store.config.autoDegraded" :title="canResume ? undefined : `各项指标连续 ${resumeMinutes} 分钟达标后可回切`">
              <a-button size="small" type="primary" :disabled="!canResume" @click="openMode('global')">确认回切</a-button>
            </a-tooltip>
            <a-button size="small" @click="openMode('global')">切换</a-button>
          </div>
        </div>
        <div class="mode-list">
          <div v-for="g in groupModeRows" :key="g.id" class="mode-item">
            <span class="mi-name">{{ g.label }}</span>
            <a-tag :color="MODE_TONE[g.effective]">{{ g.effective }}</a-tag>
            <span class="mi-meta">本组{{ g.groupMode }} · 班组开关{{ g.switchOn ? '开启' : '关闭' }}</span>
            <a-tooltip :title="globalMode === '停派态' ? '全局已停派，本组形态不可切换' : undefined">
              <a-button size="small" type="link" :disabled="globalMode === '停派态'" @click="openMode(g.id)">切换</a-button>
            </a-tooltip>
          </div>
        </div>
      </section>

      <section class="block path-block">
        <div class="b-title">派单路径占比<span class="b-sub">共 {{ stats.pathTotal }} 次</span></div>
        <div class="path-list">
          <div v-for="p in stats.pathShare" :key="p.name" class="path-item">
            <span class="pi-name">{{ p.name }}</span>
            <div class="pi-bar"><div class="pi-fill" :style="{ width: `${p.pct}%`, background: p.color }" /></div>
            <span class="pi-pct">{{ p.pct }}%</span>
            <span class="pi-n">{{ p.count }}</span>
          </div>
        </div>
      </section>
    </div>

    <section class="block">
      <div class="b-title">池积压</div>
      <a-table :columns="backlogCols" :data-source="backlogTableRows" row-key="id" size="middle" :pagination="false">
        <template #bodyCell="{ column, record }">
          <a-tag v-if="column.key === 'mode'" :color="MODE_TONE[record.effectiveMode as keyof typeof MODE_TONE]">{{ record.effectiveMode }}</a-tag>
          <span v-else-if="column.key === 'maxWait'">{{ waitText(record.waitingOriginal + record.queued + record.failed ? record.maxWaitMin : 0) }}</span>
        </template>
      </a-table>
    </section>

    <section class="block">
      <div class="b-title">
        处理人负载
        <div class="hd-btn load-filters">
          <a-select v-model:value="loadGroup" size="small" :options="loadGroupOpts" style="width: 150px" />
          <a-select v-model:value="loadSign" size="small" :options="loadSignOpts" style="width: 110px" />
        </div>
      </div>
      <a-table :columns="loadCols" :data-source="loadRows" row-key="name" size="middle" :pagination="stdPagination()">
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'name'"><b>{{ record.name }}</b><span class="muted"> {{ record.staffNo }}</span></template>
          <a-tag v-else-if="column.key === 'signIn'" :color="SIGN_TONE[record.signIn]">{{ record.signIn }}</a-tag>
          <span v-else-if="column.key === 'load'" :class="{ 'load-full': record.inTransit >= record.cap }">在途 {{ record.inTransit }} / 上限 {{ record.cap }}</span>
          <template v-else-if="column.key === 'flag'">
            <a-tag v-if="record.overAssigned" color="red">超额指派</a-tag>
            <a-tag v-else-if="record.overLimit" color="orange">超限</a-tag>
            <span v-else class="muted">—</span>
          </template>
        </template>
      </a-table>
    </section>

    <PoolModeSwitchModal v-model:open="modeOpen" :scope="modeScope" />
    <DispatchLogDrawer v-model:open="logOpen" />

    <a-modal v-model:open="recordOpen" title="切换记录" :width="900" :footer="null">
      <a-table :columns="recordCols" :data-source="modeRecords" row-key="id" size="middle" :pagination="stdPagination()" :locale="{ emptyText: '暂无切换记录' }">
        <template #bodyCell="{ column, record }">
          <span v-if="column.key === 'reason'">{{ record.reason || '—' }}</span>
        </template>
      </a-table>
    </a-modal>
  </div>
</template>

<style scoped>
.mon { display: flex; flex-direction: column; }
.mon-bar { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }
.mon-log { margin-left: auto; }
.block { background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px 20px; margin-bottom: 16px; }
.b-title { font-size: 13px; font-weight: 600; color: #111827; margin-bottom: 14px; padding-left: 10px; border-left: 3px solid #1a6fff; display: flex; align-items: center; gap: 10px; min-height: 24px; }
.b-sub { font-size: 12px; font-weight: normal; color: #9ca3af; }
.hd-btn { margin-left: auto; }
.load-filters { display: flex; gap: 8px; }
.muted { color: #9ca3af; font-size: 12px; margin-left: 4px; }
.stat-row { display: flex; gap: 16px; }
.stat-card { flex: 1; border: 1px solid #eef0f3; border-radius: 8px; padding: 14px 18px; position: relative; overflow: hidden; min-height: 104px; }
.stat-card::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px; background: var(--accent); }
.s-label { font-size: 12px; color: #6b7280; }
.s-value { font-size: 26px; font-weight: 700; color: #111827; line-height: 1.2; margin-top: 8px; }
.s-value.warn { color: #f59e0b; }
.s-sub { font-size: 12px; color: #6b7280; margin-top: 6px; }
.s-seg { display: flex; align-items: flex-end; gap: 10px; }
.s-seg > div:not(.s-plus) { display: flex; flex-direction: column; }
.s-seg .s-value { font-size: 20px; margin-top: 2px; }
.s-seg-k { font-size: 11px; color: #9ca3af; margin-top: 8px; }
.s-plus { color: #9ca3af; padding-bottom: 4px; }
.mon-row { display: flex; gap: 16px; }
.mode-block { flex: 3; min-width: 0; }
.path-block { flex: 2; min-width: 0; }
.mode-global { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 12px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; margin-bottom: 10px; }
.mg-l, .mg-r { display: flex; align-items: center; gap: 8px; }
.mg-name { font-weight: 600; color: #111827; }
.mg-meta, .mi-meta { font-size: 12px; color: #6b7280; }
.mode-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px 16px; }
.mode-item { display: flex; align-items: center; gap: 8px; padding: 6px 4px; border-bottom: 1px dashed #f0f0f0; }
.mi-name { width: 132px; flex: none; color: #374151; font-size: 13px; }
.mi-meta { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.path-list { display: flex; flex-direction: column; gap: 12px; padding-top: 4px; }
.path-item { display: flex; align-items: center; gap: 10px; font-size: 13px; }
.pi-name { width: 76px; color: #374151; flex: none; }
.pi-bar { flex: 1; height: 8px; background: #f3f4f6; border-radius: 4px; overflow: hidden; }
.pi-fill { height: 100%; border-radius: 4px; }
.pi-pct { width: 52px; text-align: right; color: #111827; font-weight: 600; }
.pi-n { width: 36px; text-align: right; color: #9ca3af; font-size: 12px; }
.load-full { color: #ea580c; }
:deep(.ant-table-thead > tr > th) { background: #f3f4f6; color: #6b7280; font-size: 12px; }
</style>
