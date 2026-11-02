<script setup lang="ts">
// 工单池管理（PRD 14.3）：一组一池；派单方式、派单状态计数与成员画像配置；池详情列池内待领工单，管理员可指派
import { computed, ref } from 'vue';
import { TICKETS } from '@/mock/tickets';
import { useDispatchStore } from '@/stores/dispatch';
import { DEFAULT_POOL_ID, PRIORITY_LEVEL } from '@/views/tickets/types/dispatch';
import type { Ticket } from '@/views/tickets/types/ticket';
import { MODE_TONE, useClock, waitText } from './dispatchUi';
import PoolModeSwitchModal from './PoolModeSwitchModal.vue';
import PoolAssignModal from './PoolAssignModal.vue';
import { SwapOutlined } from '@ant-design/icons-vue';
import './dispatchTheme.css';

const poolDetailBodyStyle = { padding: '12px 16px 16px', background: '#fff' };

const store = useDispatchStore();
const clock = useClock();

const rows = computed(() => {
  void clock.value;
  void store.ticketStates;
  return store.poolViews();
});
const backlogOf = (p: { waitingOriginal: number; queued: number; failed: number }) => p.waitingOriginal + p.queued + p.failed;
/** 指向本池的已启用入池规则（按优先级）；默认池另含「未命中任何规则」 */
function rulesOf(poolId: string): string {
  const names = [...store.rules].filter((r) => r.enabled && r.poolId === poolId).sort((a, b) => a.priority - b.priority).map((r) => r.name);
  if (poolId === DEFAULT_POOL_ID) names.push('未命中任何规则');
  return names.join('、') || '—';
}
/** 次要派单计数：只列非 0 项并标色，另附最长等待 */
function waitItems(p: { waitingOriginal: number; queued: number; failed: number; maxWaitMin: number }) {
  const xs: { label: string; value: string | number; tone: string }[] = [];
  if (p.waitingOriginal) xs.push({ label: '等原处理人', value: p.waitingOriginal, tone: 'dx-warn' });
  if (p.queued) xs.push({ label: '排队中', value: p.queued, tone: 'dx-warn' });
  if (p.failed) xs.push({ label: '派单失败回池', value: p.failed, tone: 'dx-bad' });
  xs.push({ label: '最长等待', value: waitText(p.maxWaitMin), tone: '' });
  return xs;
}
const totalBacklog = computed(() => rows.value.reduce((s, p) => s + p.waitingOriginal + p.queued + p.failed, 0));

const globalStopped = computed(() => store.globalEffectiveMode() === '人工派单');

const modeOpen = ref(false);
const modeScope = ref('');
function openMode(id: string) { modeScope.value = id; modeOpen.value = true; }

/* ---------------- 池详情 ---------------- */
const detailId = ref<string | null>(null);
const detailOpen = computed({ get: () => !!detailId.value, set: (v: boolean) => { if (!v) detailId.value = null; } });
const refresh = ref(0);
const detailPool = computed(() => rows.value.find((p) => p.id === detailId.value) ?? null);
const detailRows = computed(() => {
  void clock.value;
  void refresh.value;
  void store.ticketStates;
  const id = detailId.value;
  if (!id) return [];
  const now = Date.now();
  return TICKETS
    .filter((t) => t.groupId === id && t.tab === 'pool' && !t.assignee && !t.archived && !t.isDraft)
    .map((t) => {
      const st = store.ticketStateOf(t.no);
      const due = st?.firstRespTotalMin != null ? st.firstRespDueAt ?? st.enteredAt + st.firstRespTotalMin * 60_000 : null;
      const remain = due != null && !t.responded ? Math.round((due - now) / 60_000) : null;
      return {
        ticket: t,
        no: t.no,
        title: t.title,
        priority: PRIORITY_LEVEL[t.priority],
        status: st?.status ?? null,
        reserveFor: st?.status === '等原处理人' ? st.reserveFor : undefined,
        reserveUntil: st?.status === '等原处理人' && st.reserveUntil ? fmt(st.reserveUntil) : undefined,
        enteredAt: st ? fmt(st.enteredAt) : '—',
        slaRemain: remain,
      };
    });
});
function fmt(ms: number) {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
const STATUS_TONE: Record<string, string> = { 等原处理人: 'default', 排队中: 'orange', 派单失败回池: 'red' };
const detailCols = [
  { title: '工单号', dataIndex: 'no', key: 'no', width: 148, fixed: 'left' as const },
  { title: '标题', dataIndex: 'title', key: 'title', ellipsis: true, width: 160 },
  { title: '优先级', dataIndex: 'priority', key: 'priority', width: 64 },
  { title: '派单状态', key: 'status', width: 96 },
  { title: '等原处理人', key: 'reserve', width: 120, ellipsis: true },
  { title: '入池时间', dataIndex: 'enteredAt', key: 'enteredAt', width: 128 },
  { title: 'SLA', key: 'sla', width: 88 },
  { title: '操作', key: 'op', width: 56, fixed: 'right' as const },
];

const assignOpen = ref(false);
const assignTicket = ref<Ticket | null>(null);
function openAssign(t: Ticket) { assignTicket.value = t; assignOpen.value = true; }
</script>

<template>
  <section class="block pool-panel pm">
    <div class="meta-strip">
      <div class="meta-chip">
        <span class="meta-chip-val">{{ rows.length }}</span>
        <span class="meta-chip-lb">个组池</span>
      </div>
      <div class="meta-chip" :class="{ 'is-warn': totalBacklog > 0 }">
        <span class="meta-chip-val">{{ totalBacklog }}</span>
        <span class="meta-chip-lb">池内待派（单）</span>
      </div>
    </div>
    <div class="pm-grid">
      <div
        v-for="p in rows"
        :key="p.id"
        class="pm-card"
        :class="[`pm--${MODE_TONE[p.effectiveMode]}`, { 'pm--hot': backlogOf(p) > 0 }]"
      >
        <div class="pm-accent" aria-hidden="true" />
        <div class="pm-inner">
          <div class="pm-card-hd">
            <span class="pm-name" :title="p.poolLabel">{{ p.poolLabel }}</span>
            <span class="pm-mode" :class="`is-${MODE_TONE[p.effectiveMode]}`">{{ p.effectiveMode }}</span>
            <a-tooltip :title="globalStopped ? '全局为人工派单，本组派单方式不可切换' : '切换派单方式'">
              <a-button type="text" size="small" class="dx-icon-btn" :disabled="globalStopped" @click="openMode(p.id)">
                <template #icon><SwapOutlined /></template>
              </a-button>
            </a-tooltip>
            <a-button type="link" size="small" class="pm-detail" @click="detailId = p.id">池详情</a-button>
          </div>
          <div class="pm-cond" :title="rulesOf(p.id)"><em>入池</em>{{ rulesOf(p.id) }}</div>
          <div class="pm-stats">
            <div class="pm-stat pm-stat-lead">
              <span class="pm-stat-val" :class="backlogOf(p) ? 'is-warn' : 'is-calm'">{{ backlogOf(p) }}</span>
              <span class="pm-stat-lb">池内待派</span>
            </div>
            <div class="pm-stat">
              <span class="pm-stat-val">{{ p.memberCount }}</span>
              <span class="pm-stat-lb">成员</span>
            </div>
            <div class="pm-stat">
              <span class="pm-stat-val">{{ p.memberCount ? `${Math.round((p.configuredCount / p.memberCount) * 100)}%` : '—' }}</span>
              <span class="pm-stat-lb">画像配置</span>
            </div>
          </div>
          <div class="pm-sub">
            <span v-if="!backlogOf(p)" class="pm-sub-st muted">待派明细均为 0</span>
            <span v-else class="pm-sub-st">
              <template v-for="(s, i) in waitItems(p)" :key="s.label"><i v-if="i" class="dx-meta-sep">·</i>{{ s.label }} <b :class="s.tone">{{ s.value }}</b></template>
            </span>
          </div>
        </div>
      </div>
    </div>

    <a-drawer
      v-model:open="detailOpen"
      :title="detailId ? store.poolLabel(detailId) : ''"
      width="720"
      placement="right"
      :body-style="poolDetailBodyStyle"
      class="pool-detail-drawer"
    >
      <div v-if="detailPool" class="pd-body">
        <div class="pd-overview">
          <span class="pd-mode">
            派单方式
            <span class="dx-status" :class="`is-${MODE_TONE[detailPool.effectiveMode]}`">{{ detailPool.effectiveMode }}</span>
          </span>
          <div class="pd-stats">
            <div class="pd-stat">
              <b>{{ detailRows.length }}</b><span>待领</span>
            </div>
            <div class="pd-stat">
              <b :class="{ warn: detailPool.waitingOriginal }">{{ detailPool.waitingOriginal }}</b><span>等原</span>
            </div>
            <div class="pd-stat">
              <b :class="{ warn: detailPool.queued }">{{ detailPool.queued }}</b><span>排队</span>
            </div>
            <div class="pd-stat">
              <b :class="{ bad: detailPool.failed }">{{ detailPool.failed }}</b><span>失败回池</span>
            </div>
          </div>
        </div>

        <div class="pd-table-hd">
          <span>池内待领工单</span>
          <span class="pd-table-sub">{{ detailRows.length }} 单</span>
        </div>
        <div class="table-shell pd-table">
          <a-table
            :columns="detailCols"
            :data-source="detailRows"
            row-key="no"
            size="small"
            :pagination="false"
            :scroll="{ x: 860 }"
            :locale="{ emptyText: '池内暂无待领工单' }"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'status'">
                <span v-if="record.status" class="dx-status" :class="`is-${STATUS_TONE[record.status]}`">{{ record.status }}</span>
                <span v-else class="muted">—</span>
              </template>
              <template v-else-if="column.key === 'reserve'">
                <span v-if="record.reserveFor" class="pd-ellipsis" :title="`${record.reserveFor} · ${record.reserveUntil} 到期`">{{ record.reserveFor }}</span>
                <span v-else class="muted">—</span>
              </template>
              <template v-else-if="column.key === 'sla'">
                <span v-if="record.slaRemain == null" class="muted">—</span>
                <span v-else :class="{ overdue: record.slaRemain <= 0 }">{{ record.slaRemain <= 0 ? '已超时' : `${record.slaRemain} 分` }}</span>
              </template>
              <a-button v-else-if="column.key === 'op'" type="link" size="small" class="pd-op" @click="openAssign(record.ticket)">指派</a-button>
            </template>
          </a-table>
        </div>
      </div>
    </a-drawer>

    <PoolModeSwitchModal v-model:open="modeOpen" :scope="modeScope" />
    <PoolAssignModal v-model:open="assignOpen" :ticket="assignTicket" :pool-id="detailId ?? ''" @done="refresh++" />
  </section>
</template>

<style scoped>
.pool-panel { padding: 16px 20px 20px; }
.pm { min-width: 0; container-type: inline-size; }
/* 宽屏最多 4 列 */
.pm-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
@container (min-width: 1680px) { .pm-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
@container (max-width: 960px) { .pm-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@container (max-width: 600px) { .pm-grid { grid-template-columns: minmax(0, 1fr); } }
.pm-card {
  position: relative; overflow: hidden;
  background: #fff; border: 1px solid #eef0f3; border-radius: 8px;
  transition: border-color 0.2s, box-shadow 0.2s;
}
.pm-card:hover { border-color: #e5e7eb; box-shadow: 0 2px 10px rgba(17, 24, 39, 0.06); }
.pm--hot { border-color: #fed7aa; }
.pm-accent { height: 3px; background: #10b981; }
.pm--orange .pm-accent { background: #ff7d00; }
.pm--red .pm-accent { background: #f53f3f; }
.pm-inner { padding: 12px 14px 14px; display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.pm-card-hd { display: flex; align-items: center; gap: 8px; min-width: 0; flex-wrap: wrap; }
.pm-name {
  flex: 1; min-width: 120px; font-size: 14px; font-weight: 600; color: #111827;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.pm-mode {
  flex: none; font-size: 11px; font-weight: 600; line-height: 18px; padding: 0 8px; border-radius: 4px;
  background: #f2f3f5; color: #4e5969;
}
.pm-mode.is-green { background: #ecfdf5; color: #047857; }
.pm-mode.is-orange { background: #fff7ed; color: #c2410c; }
.pm-mode.is-red { background: #fef2f2; color: #dc2626; }
.pm-detail { flex: none; padding: 0 2px; margin-left: auto; }
.pm-cond { font-size: 11px; color: #6b7280; line-height: 16px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pm-cond em { font-style: normal; color: #9ca3af; margin-right: 6px; }
.pm-stats {
  display: grid; grid-template-columns: 1.15fr 0.85fr 0.85fr; gap: 0;
  margin: 2px -14px 0; padding: 12px 14px 0; border-top: 1px solid #f2f3f5;
}
.pm-stat { display: flex; flex-direction: column; gap: 2px; min-width: 0; padding-right: 8px; }
.pm-stat + .pm-stat { padding-left: 12px; border-left: 1px solid #f2f3f5; }
.pm-stat-lead { padding-right: 12px; }
.pm-stat-val { font-size: 26px; font-weight: 700; color: #111827; line-height: 1.1; font-variant-numeric: tabular-nums; }
.pm-stat-val.is-calm { color: #1a6fff; }
.pm-stat-val.is-warn { color: #ff7d00; }
.pm-stat-lb { font-size: 11px; color: #9ca3af; line-height: 1.3; }
.pm-sub { font-size: 11px; color: #6b7280; line-height: 1.4; padding-top: 4px; }
.pm-sub .muted { color: #9ca3af; }
.pm-sub-st { min-width: 0; }
.pm-sub-st .dx-meta-sep { font-style: normal; }
.pm-sub b { font-weight: 600; color: #1f2329; }
.pm-sub b.dx-warn { color: #ff7d00; }
.pm-sub b.dx-bad { color: #f53f3f; }
.pd-body { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
.pd-overview {
  display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap;
  padding: 10px 12px; background: #fafbfc; border: 1px solid #eef0f3; border-radius: 8px;
}
.pd-mode { display: inline-flex; align-items: center; gap: 8px; font-size: 12px; color: #6b7280; }
.pd-mode .dx-status { font-size: 12px; line-height: 20px; }
.pd-stats { display: flex; flex-wrap: wrap; gap: 8px; }
.pd-stat {
  display: inline-flex; align-items: baseline; gap: 6px;
  padding: 4px 10px; background: #fff; border: 1px solid #eef0f3; border-radius: 6px;
}
.pd-stat b { font-size: 16px; font-weight: 700; color: #111827; font-variant-numeric: tabular-nums; line-height: 1.2; }
.pd-stat b.warn { color: #ff7d00; }
.pd-stat b.bad { color: #f53f3f; }
.pd-stat span { font-size: 11px; color: #9ca3af; }
.pd-table-hd {
  display: flex; align-items: baseline; gap: 8px;
  font-size: 12px; font-weight: 600; color: #111827;
}
.pd-table-sub { font-size: 11px; font-weight: normal; color: #9ca3af; }
.pd-table { min-width: 0; }
.pd-table :deep(.ant-table) { font-size: 12px; color: #374151; }
.pd-table :deep(.ant-table-tbody > tr > td),
.pd-table :deep(.ant-table-thead > tr > th) {
  font-size: 12px;
  line-height: 1.45;
  vertical-align: middle;
}
.pd-table :deep(.ant-table-tbody > tr > td) { color: #374151; }
.pd-table :deep(.ant-table-tbody > tr:hover > td) { background: #f9fafb !important; }
.pd-table :deep(.ant-table-cell-fix-left),
.pd-table :deep(.ant-table-cell-fix-right) { background: #fff; }
.pd-table :deep(.ant-table-tbody > tr:hover > .ant-table-cell-fix-left),
.pd-table :deep(.ant-table-tbody > tr:hover > .ant-table-cell-fix-right) { background: #f9fafb !important; }
.pd-table :deep(.ant-table-tbody > tr > td:first-child) {
  font-variant-numeric: tabular-nums;
  color: #111827;
  font-weight: 500;
}
.pd-ellipsis { display: block; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pd-op { padding: 0 4px; height: auto; font-size: 12px; }
.pd-table .muted { color: #9ca3af; font-size: 12px; }
.pd-table .overdue { color: #f53f3f; font-size: 12px; }
.pd-table .dx-status { font-size: 12px; line-height: 20px; }
</style>
