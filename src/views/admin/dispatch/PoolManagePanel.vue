<script setup lang="ts">
// 工单池管理（PRD 14.3）：工单池在此新建（建池时选处理组），一个处理组可有多个池；
// 卡片：派单方式、派单状态计数与成员画像配置，编辑（只改名称）、停用 / 启用（二次确认，默认池不可停用）；
// 停用的池另列「已停用」；池详情列池内待领工单，管理员可指派
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { message } from 'ant-design-vue';
import { InboxOutlined, SwapOutlined } from '@ant-design/icons-vue';
import { TICKETS } from '@/mock/tickets';
import { useDispatchStore } from '@/stores/dispatch';
import { DEFAULT_POOL_ID, POOL_MODES, POOL_NAME_MAX, PRIORITY_LEVEL, type PoolMode } from '@/views/tickets/types/dispatch';
import type { Ticket } from '@/views/tickets/types/ticket';
import OpActionModal from '@/views/tickets/components/operation/OpActionModal.vue';
import { MODE_TONE, useClock } from './dispatchUi';
import PoolModeSwitchModal from './PoolModeSwitchModal.vue';
import PoolAssignModal from './PoolAssignModal.vue';
import DispatchConfirmModal from './DispatchConfirmModal.vue';
import { maxPoolWaitMinutes, poolTicketsOfPool } from '@/views/team-board/components/dispatchPoolTickets';
import { waitText as poolWaitText } from '@/views/tickets/composables/dispatchUi';
import './dispatchTheme.css';

const poolDetailBodyStyle = { padding: '12px 16px 16px', background: '#fff' };

const store = useDispatchStore();
const clock = useClock();
const reactiveTickets = reactive(TICKETS) as Ticket[];
/** 池内待派与其最长等待：池内全部未领取（无处理人）的工单，不区分派单方式与派单状态（与班组看板同口径） */
const pendingStats = computed(() => {
  void clock.value;
  void store.ticketStates;
  const now = Date.now();
  return new Map(allRows.value.map((p) => {
    const list = poolTicketsOfPool(p.id, reactiveTickets);
    return [p.id, { count: list.length, maxWait: maxPoolWaitMinutes(list, now) ?? 0 }];
  }));
});
const pendingOf = (id: string) => pendingStats.value.get(id)?.count ?? 0;
const pendingWaitOf = (id: string) => pendingStats.value.get(id)?.maxWait ?? 0;

const allRows = computed(() => {
  void clock.value;
  void store.ticketStates;
  void store.pools;
  return store.poolViews();
});
/** 启用中的池（卡片区） */
const rows = computed(() => allRows.value.filter((p) => p.enabled));
/** 已停用的池（另列） */
const offRows = computed(() => allRows.value.filter((p) => !p.enabled));

/* ---------------- 新建 / 编辑（14.3） ---------------- */
const formOpen = ref(false);
const formId = ref<string | null>(null);
const form = reactive<{ name: string; groupId: string | undefined; mode: PoolMode }>({ name: '', groupId: undefined, mode: '人工派单' });
const groupOpts = computed(() => store.groups.map((g) => ({ value: g.id, label: g.label })));
function openCreate() {
  formId.value = null;
  Object.assign(form, { name: '', groupId: undefined, mode: '人工派单' });
  formOpen.value = true;
}
function openEdit(id: string) {
  const p = store.poolOf(id);
  if (!p) return;
  formId.value = id;
  Object.assign(form, { name: p.name, groupId: p.groupId, mode: p.mode });
  formOpen.value = true;
}
function submitForm() {
  const err = store.validatePoolName(form.name, formId.value ?? undefined);
  if (err) { message.error(err); return; }
  const r = formId.value
    ? store.renamePool(formId.value, form.name)
    : (form.groupId ? store.addPool({ name: form.name, groupId: form.groupId, mode: form.mode }) : { ok: false, message: '请选择处理组' });
  if (!r.ok) { if (r.message) message.error(r.message); return; }
  message.success(r.message);
  formOpen.value = false;
}
defineExpose({ openCreate });

/* ---------------- 停用 / 启用（二次确认） ---------------- */
const toggleOpen = ref(false);
const toggleId = ref<string | null>(null);
const toggleTo = ref(false);
const toggleTip = ref('');
function openToggle(id: string, enabled: boolean) {
  const p = store.poolOf(id);
  if (!p) return;
  toggleId.value = id;
  toggleTo.value = enabled;
  if (enabled) {
    toggleTip.value = `启用后「${p.name}」可重新作为入池规则的归属池，原指向该池的入池规则保持停用，需手动启用`;
  } else {
    const im = store.poolDisableImpact(id);
    toggleTip.value = `停用后指向该池的 ${im.rules} 条入池规则将停用，池内 ${im.tickets} 张未领取工单将按入池规则重新入池`;
  }
  toggleOpen.value = true;
}
function confirmToggle() {
  if (!toggleId.value) return;
  const r = store.setPoolEnabled(toggleId.value, toggleTo.value);
  if (!r.ok) { if (r.message) message.error(r.message); return; }
  if (r.message) message.success(r.message);
  if (!toggleTo.value && detailId.value === toggleId.value) detailId.value = null;
}
const backlogOf = (p: { waitingOriginal: number; queued: number; failed: number }) => p.waitingOriginal + p.queued + p.failed;
/** 指向本池的已启用入池规则（按优先级）；默认池另含「未命中任何规则」 */
function rulesOf(poolId: string): string {
  const names = [...store.rules].filter((r) => r.enabled && r.poolId === poolId).sort((a, b) => a.priority - b.priority).map((r) => r.name);
  if (poolId === DEFAULT_POOL_ID) names.push('未命中任何规则');
  return names.join('、') || '—';
}
/** 次要派单计数：只列非 0 项并标色；均为 0 时显示一句汇总；池内有未领单时末尾附最长等待（池内全部未领单口径） */
function waitItems(p: { id: string; waitingOriginal: number; queued: number; failed: number }) {
  const xs: { label: string; value: string | number; tone: string }[] = [];
  if (p.waitingOriginal) xs.push({ label: '等原处理人', value: p.waitingOriginal, tone: 'dx-warn' });
  if (p.queued) xs.push({ label: '排队中', value: p.queued, tone: 'dx-warn' });
  if (p.failed) xs.push({ label: '派单失败回池', value: p.failed, tone: 'dx-bad' });
  if (!xs.length) xs.push({ label: '等原处理人、排队中、派单失败回池均为 0', value: '', tone: '' });
  if (pendingOf(p.id)) xs.push({ label: '最长等待', value: poolWaitText(pendingWaitOf(p.id)), tone: '' });
  return xs;
}
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
    .filter((t) => t.tab === 'pool' && !t.assignee && !t.archived && !t.isDraft && store.poolIdOf(t) === id)
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

/* ---------------- 定位到池（?pool=池 id） ---------------- */
const route = useRoute();
const focusPoolId = ref<string | null>(null);
let focusTimer: ReturnType<typeof setTimeout> | undefined;
function locatePool(id: unknown) {
  if (typeof id !== 'string' || !id) return;
  focusPoolId.value = id;
  nextTick(() => document.querySelector(`[data-pool-id="${id}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }));
  clearTimeout(focusTimer);
  focusTimer = setTimeout(() => { focusPoolId.value = null; }, 2400);
}
watch(() => route.query.pool, locatePool, { immediate: true });
onBeforeUnmount(() => clearTimeout(focusTimer));
</script>

<template>
  <section class="block pool-panel pm">
    <div class="meta-strip">
      <div class="meta-chip">
        <span class="meta-chip-val">{{ allRows.length }}</span>
        <span class="meta-chip-lb">个工单池</span>
      </div>
      <div v-if="offRows.length" class="meta-chip">
        <span class="meta-chip-lb">其中停用</span>
        <span class="meta-chip-val">{{ offRows.length }}</span>
        <span class="meta-chip-lb">个</span>
      </div>
    </div>
    <div class="pm-grid">
      <div
        v-for="p in rows"
        :key="p.id"
        class="pm-card"
        :data-pool-id="p.id"
        :class="[`pm--${MODE_TONE[p.effectiveMode]}`, { 'pm--hot': backlogOf(p) > 0, 'pm--focus': focusPoolId === p.id }]"
      >
        <div class="pm-accent" aria-hidden="true" />
        <div class="pm-inner">
          <div class="pm-card-hd">
            <span class="pm-name" :title="p.poolLabel">{{ p.poolLabel }}</span>
            <span class="pm-mode" :class="`is-${MODE_TONE[p.effectiveMode]}`">{{ p.effectiveMode }}</span>
            <a-tooltip :title="globalStopped ? '全局为人工派单，本池派单方式不可切换' : '切换派单方式'">
              <a-button type="text" size="small" class="dx-icon-btn" :disabled="globalStopped" @click="openMode(p.id)">
                <template #icon><SwapOutlined /></template>
              </a-button>
            </a-tooltip>
          </div>
          <div class="pm-row">
            <div class="pm-cond"><em>处理组</em>{{ p.label }}<span v-if="p.isDefault" class="pm-default">默认池</span></div>
            <span class="pm-ops">
              <a-button type="link" size="small" class="pm-op" @click="detailId = p.id">池详情</a-button>
              <a-button type="link" size="small" class="pm-op" @click="openEdit(p.id)">编辑</a-button>
              <a-tooltip :title="p.isDefault ? '默认池不可停用' : undefined">
                <a-button type="link" size="small" danger class="pm-op" :disabled="p.isDefault" @click="openToggle(p.id, false)">停用</a-button>
              </a-tooltip>
            </span>
          </div>
          <div class="pm-cond" :title="rulesOf(p.id)"><em>入池</em>{{ rulesOf(p.id) }}</div>
          <div class="pm-stats">
            <div class="pm-stat pm-stat-lead">
              <span class="pm-stat-val" :class="backlogOf(p) ? 'is-warn' : 'is-calm'">{{ pendingOf(p.id) }}</span>
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
            <span class="pm-sub-st">
              <template v-for="(s, i) in waitItems(p)" :key="s.label"><i v-if="i" class="dx-meta-sep">·</i><span v-if="s.value === ''" class="muted">{{ s.label }}</span><template v-else>{{ s.label }} <b :class="s.tone">{{ s.value }}</b></template></template>
            </span>
          </div>
        </div>
      </div>
    </div>

    <template v-if="offRows.length">
      <div class="pm-off-hd">已停用<span class="pm-off-sub">{{ offRows.length }} 个</span></div>
      <div class="pm-grid">
        <div v-for="p in offRows" :key="p.id" class="pm-card pm--off">
          <div class="pm-inner">
            <div class="pm-card-hd">
              <span class="pm-name" :title="p.poolLabel">{{ p.poolLabel }}</span>
              <span class="pm-mode">已停用</span>
            </div>
            <div class="pm-row">
              <div class="pm-cond"><em>处理组</em>{{ p.label }}</div>
              <span class="pm-ops">
                <a-button type="link" size="small" class="pm-op" @click="openEdit(p.id)">编辑</a-button>
                <a-button type="link" size="small" class="pm-op" @click="openToggle(p.id, true)">启用</a-button>
              </span>
            </div>
            <div class="pm-cond"><em>更新</em>{{ store.poolOf(p.id)?.updatedBy }} · {{ store.poolOf(p.id)?.updatedAt }}</div>
          </div>
        </div>
      </div>
    </template>

    <!-- 新建 / 编辑工单池（14.3） -->
    <OpActionModal
      v-model:open="formOpen"
      :title="formId ? '编辑工单池' : '新建工单池'"
      :icon="InboxOutlined"
      tone="primary"
      :width="480"
      :ok-text="formId ? '保存' : '创建'"
      cancel-text="取消"
      @ok="submitForm"
    >
      <div class="op-form">
        <div class="op-field op-field-h">
          <span class="op-label req">池名称</span>
          <div class="pm-grow"><a-input v-model:value="form.name" :maxlength="POOL_NAME_MAX" show-count placeholder="请输入池名称" /></div>
        </div>
        <div class="op-field op-field-h">
          <span class="op-label" :class="{ req: !formId }">处理组</span>
          <div class="pm-grow">
            <a-select v-model:value="form.groupId" :options="groupOpts" :disabled="!!formId" placeholder="请选择处理组" style="width: 100%" />
          </div>
        </div>
        <div class="op-field op-field-h">
          <span class="op-label" :class="{ req: !formId }">派单方式</span>
          <a-radio-group v-model:value="form.mode" :disabled="!!formId">
            <a-radio v-for="m in POOL_MODES" :key="m" :value="m">{{ m }}</a-radio>
          </a-radio-group>
        </div>
      </div>
    </OpActionModal>

    <DispatchConfirmModal
      v-model:open="toggleOpen"
      :title="toggleTo ? '启用工单池' : '停用工单池'"
      :tip="toggleTip"
      :ok-text="toggleTo ? '确认启用' : '确认停用'"
      :danger="!toggleTo"
      @ok="confirmToggle"
    />

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
            处理组 <b class="pd-group">{{ detailPool.label }}</b>
            <i class="dx-meta-sep">·</i>
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
.pm-card.pm--focus { border-color: #1a6fff; box-shadow: 0 0 0 3px rgba(26, 111, 255, 0.15); }
.pm-accent { height: 3px; background: #10b981; }
.pm--orange .pm-accent { background: #ff7d00; }
.pm--red .pm-accent { background: #f53f3f; }
.pm-inner { padding: 12px 14px 14px; display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.pm-card-hd { display: flex; align-items: center; gap: 8px; min-width: 0; flex-wrap: wrap; }
.pm-name {
  flex: 1 1 0; min-width: 96px; font-size: 14px; font-weight: 600; color: #111827;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.pm-mode {
  flex: none; font-size: 11px; font-weight: 600; line-height: 18px; padding: 0 8px; border-radius: 4px;
  background: #f2f3f5; color: #4e5969;
}
.pm-mode.is-green { background: #ecfdf5; color: #047857; }
.pm-mode.is-orange { background: #fff7ed; color: #c2410c; }
.pm-mode.is-red { background: #fef2f2; color: #dc2626; }
.pm-row { display: flex; align-items: center; gap: 8px; min-width: 0; margin: -2px 0; }
.pm-row .pm-cond { flex: 1; min-width: 0; }
.pm-ops { flex: none; display: inline-flex; align-items: center; gap: 2px; margin-left: auto; margin-right: -4px; }
.pm-op { padding: 0 4px; height: 22px; font-size: 12px; }
.pm-default {
  margin-left: 8px; font-size: 11px; line-height: 16px; padding: 0 6px; border-radius: 4px;
  background: #eff6ff; color: #1a6fff;
}
.pm-off-hd { display: flex; align-items: baseline; gap: 8px; margin: 20px 0 10px; font-size: 13px; font-weight: 600; color: #4e5969; }
.pm-off-sub { font-size: 12px; font-weight: normal; color: #9ca3af; }
.pm--off { background: #fafbfc; }
.pm--off .pm-name { color: #6b7280; }
.pm-grow { flex: 1; min-width: 0; }
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
.pd-group { font-weight: 600; color: #1f2329; }
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
