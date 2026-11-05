<script setup lang="ts">
// 分派监控 · 池状态区（PRD 5.4 / 14.1）：标题行含启用池统计、全局派单方式、切换派单方式入口、切换记录、查看全部工单池；工单池卡片（启用中的池按成员数倒序取前 10，筛选单个池时只显示该池）
import { computed, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { GlobalOutlined, HistoryOutlined, SwapOutlined } from '@ant-design/icons-vue';
import { TICKETS } from '@/mock/tickets';
import { useDispatchStore } from '@/stores/dispatch';
import { STD_TIP_PROPS } from '@/views/tickets/composables/dispatchUi';
import { stdPagination } from '@/config/adminUi';
import type { DispatchAuditEntry } from '@/views/tickets/types/dispatch';
import type { Ticket } from '@/views/tickets/types/ticket';
import { poolTicketsOfPool } from '@/views/team-board/components/dispatchPoolTickets';
import { MODE_TONE, useClock } from './dispatchUi';
import PoolModeSwitchModal from './PoolModeSwitchModal.vue';

const POOL_CARD_LIMIT = 10;
const LEADER_SHOW_LIMIT = 2;

const props = defineProps<{ poolIds: string[] | null }>();
const router = useRouter();
const store = useDispatchStore();
const clock = useClock();
const reactiveTickets = reactive(TICKETS) as Ticket[];

const globalMode = computed(() => store.globalEffectiveMode());

const modeOpen = ref(false);
const modeScope = ref<'global' | string>('global');
function openMode(scope: 'global' | string) { modeScope.value = scope; modeOpen.value = true; }

function goPoolManage() { router.push('/admin/dispatch-pool'); }

const enabledPools = computed(() => {
  void clock.value;
  void store.ticketStates;
  return store.poolViews().filter((p) => p.enabled);
});

/** 全部启用池按生效方式统计，不受卡片数量与页头筛选影响 */
const modeSummary = computed(() => {
  const count = (mode: string) => enabledPools.value.filter((p) => p.effectiveMode === mode).length;
  return `启用 ${enabledPools.value.length} 个 · 自动派单 ${count('自动派单')} · 混合派单 ${count('混合派单')} · 人工派单 ${count('人工派单')}`;
});

const cards = computed(() => {
  const scoped = props.poolIds
    ? enabledPools.value.filter((p) => props.poolIds!.includes(p.id))
    : [...enabledPools.value].sort((a, b) => b.memberCount - a.memberCount).slice(0, POOL_CARD_LIMIT);
  return scoped
    .map((p) => ({
      ...p,
      configRate: p.memberCount ? Math.round((p.configuredCount / p.memberCount) * 100) : null,
      /** 池内待派：池内全部未领取（无处理人）的工单数，不区分派单方式与派单状态 */
      pending: poolTicketsOfPool(p.id, reactiveTickets).length,
    }));
});

const recordOpen = ref(false);
const modeRecords = computed<DispatchAuditEntry[]>(() => [...store.audits].filter((a) => a.kind === '派单方式').reverse());
const recordCols = [
  { title: '时间', dataIndex: 'at', key: 'at', width: 160 },
  { title: '操作方', dataIndex: 'operator', key: 'operator', width: 90 },
  { title: '范围', dataIndex: 'target', key: 'target', width: 150 },
  { title: '类型', dataIndex: 'kind', key: 'kind', width: 90 },
  { title: '切换前', dataIndex: 'before', key: 'before', width: 80 },
  { title: '切换后', dataIndex: 'after', key: 'after', width: 80 },
  { title: '切换原因', dataIndex: 'reason', key: 'reason' },
];
</script>

<template>
  <section class="ps">
    <div class="dx-sec-hd">
      <span class="dx-sec-title">池状态</span>
      <span class="dx-sec-sub">{{ modeSummary }}</span>
      <span class="dx-sec-extra">
        <span class="ps-global">
          <span class="dx-icon ps-global-ic"><GlobalOutlined /></span>
          <span class="ps-global-name">全局</span>
          <span class="dx-status" :class="`is-${MODE_TONE[globalMode]}`">{{ globalMode }}</span>
        </span>
        <a-button type="link" size="small" @click="openMode('global')">切换派单方式</a-button>
        <a-button type="link" size="small" @click="recordOpen = true"><template #icon><HistoryOutlined /></template>切换记录</a-button>
        <a-button type="link" size="small" @click="goPoolManage">查看全部工单池 →</a-button>
      </span>
    </div>

    <div class="group-grid">
      <div
        v-for="c in cards"
        :key="c.id"
        class="pc"
        :class="[`pc--${MODE_TONE[c.effectiveMode]}`, { 'pc--hot': c.pending > 0 }]"
      >
        <div class="pc-accent" aria-hidden="true" />
        <div class="pc-inner">
          <div class="pc-hd">
            <span class="pc-name" :title="c.poolLabel">{{ c.poolLabel }}</span>
            <span class="pc-mode" :class="`is-${MODE_TONE[c.effectiveMode]}`">{{ c.effectiveMode }}</span>
            <a-tooltip v-bind="STD_TIP_PROPS" :title="globalMode === '人工派单' ? '全局为人工派单，本池派单方式不可切换' : '切换派单方式'">
              <a-button type="text" size="small" class="dx-icon-btn pc-op" :disabled="globalMode === '人工派单'" @click="openMode(c.id)">
                <template #icon><SwapOutlined /></template>
              </a-button>
            </a-tooltip>
          </div>
          <div class="pc-tags">
            <div class="pc-tags-main">
              <span class="pc-tag pc-tag-group">{{ c.label }}</span>
              <a-tooltip v-if="c.leaders.length" v-bind="STD_TIP_PROPS" :title="c.leaders.join('、')">
                <span class="pc-leaders">
                  <span class="pc-leaders-k">班组长</span>
                  <span class="pc-leaders-names">{{ c.leaders.slice(0, LEADER_SHOW_LIMIT).join('、') }}</span>
                  <span v-if="c.leaders.length > LEADER_SHOW_LIMIT" class="pc-leaders-more">+{{ c.leaders.length - LEADER_SHOW_LIMIT }}</span>
                </span>
              </a-tooltip>
            </div>
            <span v-if="c.poolMode !== c.effectiveMode" class="pc-tag">本池 {{ c.poolMode }}</span>
          </div>
          <div class="pc-stats">
            <div class="pc-stat pc-stat-lead">
              <span class="pc-stat-val" :class="c.pending ? 'is-warn' : 'is-calm'">{{ c.pending }}</span>
              <span class="pc-stat-lb">池内待派</span>
            </div>
            <div class="pc-stat">
              <span class="pc-stat-val">{{ c.memberCount }}</span>
              <span class="pc-stat-lb">成员</span>
            </div>
            <div class="pc-stat">
              <span class="pc-stat-val" :class="c.configRate != null && c.configRate < 100 ? 'is-warn' : ''">{{ c.configRate == null ? '—' : `${c.configRate}%` }}</span>
              <span class="pc-stat-lb">画像配置</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <PoolModeSwitchModal v-model:open="modeOpen" :scope="modeScope" />
    <a-modal v-model:open="recordOpen" title="切换记录" :width="900" :footer="null">
      <a-table :columns="recordCols" :data-source="modeRecords" row-key="id" size="middle" :pagination="stdPagination()" :locale="{ emptyText: '暂无切换记录' }">
        <template #bodyCell="{ column, record }">
          <span v-if="column.key === 'reason'">{{ record.reason || '—' }}</span>
        </template>
      </a-table>
    </a-modal>
  </section>
</template>

<style scoped>
.ps { min-width: 0; }

/* 标题行内的全局派单方式 */
.ps-global { display: inline-flex; align-items: center; gap: 6px; flex: none; }
.ps-global-ic { width: 20px; height: 20px; font-size: 12px; border-radius: 4px; }
.ps-global-name { font-size: 13px; font-weight: 600; color: #1f2329; }

/* 工单池卡：宽屏最多 4 列（外层分派监控根节点为尺寸容器） */
.group-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px; min-width: 0; }
@container (max-width: 1280px) { .group-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
@container (max-width: 960px) { .group-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@container (max-width: 560px) { .group-grid { grid-template-columns: minmax(0, 1fr); } }
.pc {
  position: relative;
  border: 1px solid #eef0f3;
  border-radius: 8px;
  background: #fff;
  overflow: hidden;
  min-width: 0;
  transition: border-color 0.2s, box-shadow 0.2s;
}
.pc:hover { border-color: #e5e7eb; box-shadow: 0 2px 10px rgba(17, 24, 39, 0.06); }
.pc--hot { border-color: #fed7aa; }
.pc-accent { height: 3px; background: #10b981; }
.pc--orange .pc-accent { background: #ff7d00; }
.pc--red .pc-accent { background: #f53f3f; }
.pc-inner { padding: 12px 14px 14px; display: flex; flex-direction: column; gap: 10px; min-width: 0; }
.pc-hd { display: flex; align-items: center; gap: 8px; min-width: 0; }
.pc-name {
  flex: 1; min-width: 0; font-size: 14px; font-weight: 600; color: #111827; line-height: 1.35;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.pc-mode {
  flex: none; font-size: 11px; font-weight: 600; line-height: 18px; padding: 0 8px; border-radius: 4px;
  background: #f2f3f5; color: #4e5969;
}
.pc-mode.is-green { background: #ecfdf5; color: #047857; }
.pc-mode.is-orange { background: #fff7ed; color: #c2410c; }
.pc-mode.is-red { background: #fef2f2; color: #dc2626; }
.pc-op { flex: none; margin-right: -4px; }
.pc-tags { display: flex; flex-wrap: wrap; gap: 6px; min-width: 0; }
.pc-tag {
  font-size: 11px; line-height: 18px; padding: 0 8px; border-radius: 4px;
  background: #f9fafb; color: #6b7280; border: 1px solid #f3f4f6;
}
/* 处理组始终完整显示，超长时折行；班组长占同一行余下宽度，姓名放不下时省略，「班组长」与 +N 始终可见，余宽不足时整块换行 */
.pc-tags-main { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 8px; flex: 1 1 auto; min-width: 0; max-width: 100%; }
.pc-tag-group { flex: 0 0 auto; max-width: 100%; overflow-wrap: anywhere; }
.pc-leaders { display: flex; align-items: center; gap: 4px; flex: 1 1 110px; min-width: 0; font-size: 11px; line-height: 20px; color: #6b7280; }
.pc-leaders-k { flex: none; color: #9ca3af; }
.pc-leaders-names { flex: 0 1 auto; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pc-leaders-more {
  flex: none; line-height: 16px; padding: 0 4px; border-radius: 4px;
  background: #f9fafb; color: #6b7280; border: 1px solid #f3f4f6; font-variant-numeric: tabular-nums;
}
.pc-stats {
  display: grid; grid-template-columns: 1.15fr 0.85fr 0.85fr; gap: 0;
  margin: 2px -14px 0; padding: 12px 14px 0; border-top: 1px solid #f2f3f5;
}
.pc-stat { display: flex; flex-direction: column; gap: 2px; min-width: 0; padding-right: 8px; }
.pc-stat + .pc-stat { padding-left: 12px; border-left: 1px solid #f2f3f5; }
.pc-stat-lead { padding-right: 12px; }
.pc-stat-val {
  font-size: 26px; font-weight: 700; color: #111827; line-height: 1.1;
  font-variant-numeric: tabular-nums;
}
.pc-stat-val.is-calm { color: #1a6fff; }
.pc-stat-val.is-warn { color: #ff7d00; }
.pc-stat-lb { font-size: 11px; color: #9ca3af; line-height: 1.3; white-space: nowrap; }
:deep(.ant-table-thead > tr > th) { background: #f3f4f6; color: #6b7280; font-size: 12px; }
</style>
