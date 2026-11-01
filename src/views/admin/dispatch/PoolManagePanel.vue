<script setup lang="ts">
// 工单池管理（PRD 14.3）：一组一池；池形态、班组开关、派单状态计数与成员画像配置；池详情列池内待领工单，管理员可指派
import { computed, ref } from 'vue';
import { message, Modal } from 'ant-design-vue';
import { TICKETS } from '@/mock/tickets';
import { useDispatchStore } from '@/stores/dispatch';
import { PRIORITY_LEVEL } from '@/views/tickets/types/dispatch';
import type { Ticket } from '@/views/tickets/types/ticket';
import { MODE_TONE, useClock, waitText } from './dispatchUi';
import PoolModeSwitchModal from './PoolModeSwitchModal.vue';
import PoolAssignModal from './PoolAssignModal.vue';

const store = useDispatchStore();
const clock = useClock();

const rows = computed(() => {
  void clock.value;
  void store.ticketStates;
  return store.poolViews();
});
const cols = [
  { title: '池名称', dataIndex: 'poolLabel', key: 'poolLabel', width: 160 },
  { title: '所属组', dataIndex: 'label', key: 'label', width: 130 },
  { title: '池形态', key: 'mode', width: 100 },
  { title: '班组开关', key: 'switch', width: 90 },
  { title: '班组长', key: 'leaders', width: 100 },
  { title: '等原处理人', dataIndex: 'waitingOriginal', key: 'waitingOriginal', width: 96, align: 'right' as const },
  { title: '排队中', dataIndex: 'queued', key: 'queued', width: 80, align: 'right' as const },
  { title: '派单失败回池', dataIndex: 'failed', key: 'failed', width: 110, align: 'right' as const },
  { title: '最长等待', key: 'maxWait', width: 110 },
  { title: '成员数', key: 'members', width: 120 },
  { title: '操作', key: 'op', width: 130 },
];

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
      const remain = st?.firstRespTotalMin != null ? Math.round(st.firstRespTotalMin - (now - st.enteredAt) / 60_000) : null;
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
  <div>
    <section class="block">
      <a-table :columns="cols" :data-source="rows" row-key="id" size="middle" :pagination="false">
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'mode'">
            <a-tag :color="MODE_TONE[record.effectiveMode as keyof typeof MODE_TONE]">{{ record.effectiveMode }}</a-tag>
          </template>
          <template v-else-if="column.key === 'switch'">
            <a-tooltip :title="switchTip(record.id)">
              <a-switch size="small" :checked="record.switchOn" :disabled="!!switchTip(record.id)" @change="(v: unknown) => onSwitch(record.id, !!v)" />
            </a-tooltip>
          </template>
          <span v-else-if="column.key === 'leaders'">{{ record.leaders.join('、') || '—' }}</span>
          <span v-else-if="column.key === 'maxWait'">{{ waitText(record.maxWaitMin) }}</span>
          <span v-else-if="column.key === 'members'">{{ record.configuredCount }} / {{ record.memberCount }}</span>
          <template v-else-if="column.key === 'op'">
            <a-button type="link" size="small" @click="detailId = record.id">详情</a-button>
            <a-tooltip :title="globalStopped ? '全局已停派，本组形态不可切换' : undefined">
              <a-button type="link" size="small" :disabled="globalStopped" @click="openMode(record.id)">切换形态</a-button>
            </a-tooltip>
          </template>
        </template>
      </a-table>
    </section>

    <a-drawer v-model:open="detailOpen" :title="detailId ? store.poolLabel(detailId) : ''" :width="1040" placement="right">
      <a-table :columns="detailCols" :data-source="detailRows" row-key="no" size="middle" :pagination="false" :locale="{ emptyText: '池内暂无待领工单' }">
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
.block { background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px 20px; margin-bottom: 16px; }
.muted { color: #9ca3af; font-size: 12px; }
.overdue { color: #ef4444; }
:deep(.ant-table-thead > tr > th) { background: #f3f4f6; color: #6b7280; font-size: 12px; }
</style>
