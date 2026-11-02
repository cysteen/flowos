<script setup lang="ts">
// 工单池管理（PRD 14.3）：一组一池；池形态、班组开关、派单状态计数与成员画像配置；池详情列池内待领工单，管理员可指派
import { computed, ref } from 'vue';
import { message, Modal } from 'ant-design-vue';
import { TICKETS } from '@/mock/tickets';
import { useDispatchStore } from '@/stores/dispatch';
import { DEFAULT_POOL_ID, PRIORITY_LEVEL } from '@/views/tickets/types/dispatch';
import type { Ticket } from '@/views/tickets/types/ticket';
import { MODE_TONE, useClock, waitText } from './dispatchUi';
import PoolModeSwitchModal from './PoolModeSwitchModal.vue';
import PoolAssignModal from './PoolAssignModal.vue';
import DispatchCard from './DispatchCard.vue';
import { InboxOutlined } from '@ant-design/icons-vue';

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
const totalBacklog = computed(() => rows.value.reduce((s, p) => s + p.waitingOriginal + p.queued + p.failed, 0));

const globalStopped = computed(() => store.globalEffectiveMode() === '停派态');
function switchTip(id: string): string | undefined {
  if (!store.config.globalSwitch) return '全局开关已关闭，班组开关暂不生效';
  if (store.groupOf(id)?.mode === '停派态') return '本组已由管理员停派';
  return undefined;
}
function onSwitch(id: string, on: boolean) {
  const g = store.groupOf(id);
  if (!g) return;
  const apply = () => {
    const r = store.setGroupSwitch(id, on);
    if (r.ok) message.success(r.message); else message.error(r.message);
  };
  if (!on) {
    Modal.confirm({
      title: '关闭班组开关',
      content: `关闭后${store.poolLabel(id)}转为降级态，本组成员不再接本组池的自动派单。确定关闭？`,
      okText: '确定', cancelText: '取消', onOk: apply,
    });
  } else apply();
}

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
const STATUS_TONE: Record<string, string> = { 等原处理人: 'blue', 排队中: 'orange', 派单失败回池: 'red' };
const detailCols = [
  { title: '工单号', dataIndex: 'no', key: 'no', width: 170 },
  { title: '标题', dataIndex: 'title', key: 'title', ellipsis: true },
  { title: '优先级', dataIndex: 'priority', key: 'priority', width: 70 },
  { title: '派单状态', key: 'status', width: 110 },
  { title: '等原处理人', key: 'reserve', width: 170 },
  { title: '进入派单时间', dataIndex: 'enteredAt', key: 'enteredAt', width: 150 },
  { title: '首响 SLA 剩余', key: 'sla', width: 110 },
  { title: '操作', key: 'op', width: 70 },
];

const assignOpen = ref(false);
const assignTicket = ref<Ticket | null>(null);
function openAssign(t: Ticket) { assignTicket.value = t; assignOpen.value = true; }
</script>

<template>
  <div class="pm">
    <DispatchCard title="组池" :sub="`共 ${rows.length} 个 · 池内待派 ${totalBacklog} 单`">
      <div class="pm-grid">
        <div v-for="p in rows" :key="p.id" class="pm-card" :class="`tone-${MODE_TONE[p.effectiveMode]}`">
          <div class="pm-hd">
            <span class="pm-ic"><InboxOutlined /></span>
            <div class="pm-tt">
              <div class="pm-name-row">
                <span class="pm-name" :title="p.poolLabel">{{ p.poolLabel }}</span>
                <span class="pm-status" :class="`t-${MODE_TONE[p.effectiveMode]}`"><i />{{ p.effectiveMode }}</span>
              </div>
              <div class="pm-grp" :title="`班组长：${p.leaders.join('、') || '—'}`">{{ p.label }} · 班组长 {{ p.leaders.join('、') || '—' }}</div>
            </div>
            <a-button type="link" size="small" class="pm-detail" @click="detailId = p.id">池详情</a-button>
          </div>
          <div class="pm-cond">
            <span class="pm-cond-lb">入池规则</span>
            <span class="pm-cond-tx" :title="rulesOf(p.id)">{{ rulesOf(p.id) }}</span>
          </div>
          <div class="pm-metrics">
            <div class="pm-m"><b class="primary" :class="{ hot: backlogOf(p) }">{{ backlogOf(p) }}</b><span>池内待派</span></div>
            <div class="pm-m"><b>{{ p.memberCount }}</b><span>成员数</span></div>
            <div class="pm-m"><b>{{ p.memberCount ? `${Math.round((p.configuredCount / p.memberCount) * 100)}%` : '—' }}</b><span>画像配置率</span></div>
          </div>
          <div class="pm-sub">
            <span>等原处理人 <b :class="{ hot: p.waitingOriginal }">{{ p.waitingOriginal }}</b></span>
            <span>排队中 <b :class="{ hot: p.queued }">{{ p.queued }}</b></span>
            <span>派单失败回池 <b :class="{ bad: p.failed }">{{ p.failed }}</b></span>
            <span>最长等待 <b>{{ waitText(backlogOf(p) ? p.maxWaitMin : 0) }}</b></span>
          </div>
          <div class="pm-ft">
            <div class="pm-ft-row">
              <span class="pm-ft-lb">形态：</span>
              <a-tag :color="MODE_TONE[p.effectiveMode]">{{ p.effectiveMode }}</a-tag>
              <a-tooltip :title="globalStopped ? '全局已停派，本组形态不可切换' : undefined">
                <a-button size="small" class="pm-ft-op" :disabled="globalStopped" @click="openMode(p.id)">切换形态</a-button>
              </a-tooltip>
            </div>
            <div class="pm-ft-row">
              <span class="pm-ft-lb">班组开关：</span>
              <a-tooltip :title="switchTip(p.id)">
                <a-switch size="small" :checked="p.switchOn" :disabled="!!switchTip(p.id)" @change="(v: unknown) => onSwitch(p.id, !!v)" />
              </a-tooltip>
              <span class="pm-ft-v">{{ p.switchOn ? '开启' : '关闭' }}</span>
            </div>
          </div>
        </div>
      </div>
    </DispatchCard>

    <a-drawer v-model:open="detailOpen" :title="detailId ? store.poolLabel(detailId) : ''" width="min(1040px, 100vw)" placement="right">
      <div v-if="detailPool" class="dt-sum">
        <div class="dt-item"><span class="k">池形态</span><a-tag :color="MODE_TONE[detailPool.effectiveMode]">{{ detailPool.effectiveMode }}</a-tag></div>
        <div class="dt-item"><span class="k">待领工单</span><b>{{ detailRows.length }}</b></div>
        <div class="dt-item"><span class="k">等原处理人</span><b>{{ detailPool.waitingOriginal }}</b></div>
        <div class="dt-item"><span class="k">排队中</span><b>{{ detailPool.queued }}</b></div>
        <div class="dt-item"><span class="k">派单失败回池</span><b :class="{ bad: detailPool.failed }">{{ detailPool.failed }}</b></div>
      </div>
      <div class="dt-title">池内待领工单</div>
      <a-table :columns="detailCols" :data-source="detailRows" row-key="no" size="middle" :pagination="false" :scroll="{ x: 940 }" :locale="{ emptyText: '池内暂无待领工单' }">
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'status'">
            <a-tag v-if="record.status" :color="STATUS_TONE[record.status]">{{ record.status }}</a-tag>
            <span v-else class="muted">—</span>
          </template>
          <template v-else-if="column.key === 'reserve'">
            <span v-if="record.reserveFor">{{ record.reserveFor }}<span class="muted"> · {{ record.reserveUntil }} 到期</span></span>
            <span v-else class="muted">—</span>
          </template>
          <template v-else-if="column.key === 'sla'">
            <span v-if="record.slaRemain == null" class="muted">—</span>
            <span v-else :class="{ overdue: record.slaRemain <= 0 }">{{ record.slaRemain <= 0 ? '已超时' : `${record.slaRemain} 分钟` }}</span>
          </template>
          <a-button v-else-if="column.key === 'op'" type="link" size="small" @click="openAssign(record.ticket)">指派</a-button>
        </template>
      </a-table>
    </a-drawer>

    <PoolModeSwitchModal v-model:open="modeOpen" :scope="modeScope" />
    <PoolAssignModal v-model:open="assignOpen" :ticket="assignTicket" :pool-id="detailId ?? ''" @done="refresh++" />
  </div>
</template>

<style scoped>
.pm { min-width: 0; }
.pm-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 280px), 1fr)); gap: 12px; }
.pm-card { border: 1px solid #e5e7eb; border-radius: 10px; padding: 14px; display: flex; flex-direction: column; gap: 6px; position: relative; overflow: hidden; min-width: 0; transition: box-shadow 0.2s, border-color 0.2s; }
.pm-card:hover { box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06); border-color: #93c5fd; }
.pm-card::before { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 3px; background: #10b981; }
.pm-card.tone-orange::before { background: #f59e0b; }
.pm-card.tone-red::before { background: #ef4444; }
.pm-hd { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; min-width: 0; }
.pm-ic { width: 34px; height: 34px; border-radius: 8px; background: #eff6ff; color: #1a6fff; display: flex; align-items: center; justify-content: center; font-size: 16px; flex: none; }
.pm-tt { flex: 1; min-width: 0; }
.pm-name-row { display: flex; align-items: center; gap: 6px; min-width: 0; }
.pm-name { font-size: 14px; font-weight: 600; color: #111827; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
.pm-status { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; color: #10b981; flex: none; }
.pm-status i { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
.pm-status.t-orange { color: #f59e0b; }
.pm-status.t-red { color: #ef4444; }
.pm-grp { font-size: 11px; color: #9ca3af; margin-top: 1px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pm-detail { flex: none; padding: 0 4px; }
.pm-cond { display: flex; align-items: center; gap: 6px; background: #f9fafb; border-radius: 6px; padding: 6px 10px; min-width: 0; }
.pm-cond-lb { font-size: 11px; color: #9ca3af; flex: none; }
.pm-cond-tx { font-size: 12px; color: #374151; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
.pm-metrics { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; margin-top: 4px; }
.pm-m { text-align: center; padding: 8px 4px; background: #f9fafb; border-radius: 6px; min-width: 0; }
.pm-m b { display: block; font-size: 17px; font-weight: 700; color: #374151; line-height: 1.2; }
.pm-m b.primary { color: #1a6fff; }
.pm-m b.hot { color: #ea580c; }
.pm-m span { display: block; font-size: 11px; color: #9ca3af; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pm-sub { display: flex; flex-wrap: wrap; gap: 2px 12px; font-size: 11px; color: #9ca3af; }
.pm-sub b { font-weight: 600; color: #374151; }
.pm-sub b.hot { color: #ea580c; }
.pm-sub b.bad { color: #ef4444; }
.pm-ft { display: flex; flex-direction: column; gap: 6px; margin-top: auto; padding-top: 10px; border-top: 1px solid #f3f4f6; }
.pm-ft-row { display: flex; align-items: center; gap: 6px; font-size: 12px; color: #374151; min-height: 24px; }
.pm-ft-row :deep(.ant-tag) { margin-inline-end: 0; }
.pm-ft-lb { color: #9ca3af; }
.pm-ft-op { margin-left: auto; }
.pm-ft-v { color: #374151; }
.dt-sum { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; margin-bottom: 18px; }
.dt-item { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 10px 14px; background: #f9fafb; border: 1px solid #eef0f3; border-radius: 8px; font-size: 13px; }
.dt-item :deep(.ant-tag) { margin-inline-end: 0; }
.dt-item b { font-size: 16px; color: #111827; }
.dt-item b.bad { color: #ef4444; }
.dt-title { font-size: 13px; font-weight: 600; color: #111827; padding-left: 10px; border-left: 3px solid #1a6fff; margin-bottom: 12px; line-height: 16px; }
.muted { color: #9ca3af; font-size: 12px; }
.overdue { color: #ef4444; }
:deep(.ant-table-thead > tr > th) { background: #f3f4f6; color: #6b7280; font-size: 12px; }
</style>
