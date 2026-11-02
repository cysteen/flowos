<script setup lang="ts">
// 分派监控 · 池状态区（PRD 5.4 / 14.1）：全局状态条 + 组池卡片、切换与恢复确认入口、切换记录
import { computed, ref } from 'vue';
import { GlobalOutlined, HistoryOutlined, SwapOutlined } from '@ant-design/icons-vue';
import { useDispatchStore } from '@/stores/dispatch';
import { stdPagination } from '@/config/adminUi';
import type { DispatchAuditEntry } from '@/views/tickets/types/dispatch';
import { MODE_TONE, useClock } from './dispatchUi';
import PoolModeSwitchModal from './PoolModeSwitchModal.vue';

const props = defineProps<{ poolIds: string[] | null }>();
const store = useDispatchStore();
const clock = useClock();

const globalMode = computed(() => store.globalEffectiveMode());
const stage = computed(() => store.rolloutStage());
const resumeMinutes = computed(() => store.config.resumeOkMinutes);
/** 自动转混合后各项指标连续 N 分钟达标（5.4，由派单引擎判定） */
const canResume = computed(() => {
  void clock.value;
  return store.resumeReady();
});

const modeOpen = ref(false);
const modeScope = ref<'global' | string>('global');
function openMode(scope: 'global' | string) { modeScope.value = scope; modeOpen.value = true; }

const cards = computed(() => {
  void clock.value;
  void store.ticketStates;
  return store.poolViews()
    .filter((p) => !props.poolIds || props.poolIds.includes(p.id))
    .map((p) => ({
      ...p,
      configRate: p.memberCount ? Math.round((p.configuredCount / p.memberCount) * 100) : null,
      backlog: p.waitingOriginal + p.queued + p.failed,
    }));
});

const recordOpen = ref(false);
const modeRecords = computed<DispatchAuditEntry[]>(() => [...store.audits].filter((a) => a.kind === '派单方式' || a.kind === '全局开关').reverse());
const recordCols = [
  { title: '时间', dataIndex: 'at', key: 'at', width: 160 },
  { title: '操作方', dataIndex: 'operator', key: 'operator', width: 90 },
  { title: '范围', dataIndex: 'target', key: 'target', width: 150 },
  { title: '类型', dataIndex: 'kind', key: 'kind', width: 90 },
  { title: '切换前', dataIndex: 'before', key: 'before', width: 80 },
  { title: '切换后', dataIndex: 'after', key: 'after', width: 80 },
  { title: '触发条件或原因', dataIndex: 'reason', key: 'reason' },
];
</script>

<template>
  <section class="ps">
    <div class="dx-sec-hd">
      <span class="dx-sec-title">池状态</span>
      <span class="dx-sec-sub">共 {{ cards.length }} 个组池</span>
      <span class="dx-sec-extra">
        <a-button type="link" size="small" @click="recordOpen = true"><template #icon><HistoryOutlined /></template>切换记录</a-button>
      </span>
    </div>

    <!-- 全局状态条：派单方式、全局开关、运行方式、上线阶段、自动派单组；右侧切换派单方式 / 确认恢复 -->
    <div class="dx-card gs">
      <div class="gs-main">
        <span class="dx-icon gs-ic"><GlobalOutlined /></span>
        <span class="gs-name">全局</span>
        <span class="dx-status" :class="`is-${MODE_TONE[globalMode]}`">{{ globalMode }}</span>
        <span v-if="store.config.autoDegraded" class="dx-status is-orange">自动转混合</span>
      </div>
      <div class="gs-meta">
        <span class="gs-kv"><em>全局开关</em>{{ store.config.globalSwitch ? '开启' : '关闭' }}</span>
        <span class="gs-kv"><em>运行方式</em>{{ store.config.runMode }}</span>
        <span class="gs-kv"><em>上线阶段</em>{{ stage }}</span>
        <span class="gs-kv"><em>自动派单组</em>{{ store.groups.filter((g) => g.mode === '自动派单').length }} / {{ store.groups.length }}</span>
      </div>
      <div class="gs-ops">
        <a-tooltip v-if="store.config.autoDegraded" :title="canResume ? undefined : `各项指标连续 ${resumeMinutes} 分钟达标后可恢复`">
          <a-button type="link" size="small" :disabled="!canResume" @click="openMode('global')">确认恢复</a-button>
        </a-tooltip>
        <a-button type="link" size="small" @click="openMode('global')">切换派单方式</a-button>
      </div>
    </div>

    <div class="group-grid">
      <div
        v-for="c in cards"
        :key="c.id"
        class="pc"
        :class="[`pc--${MODE_TONE[c.effectiveMode]}`, { 'pc--hot': c.backlog > 0 }]"
      >
        <div class="pc-accent" aria-hidden="true" />
        <div class="pc-inner">
          <div class="pc-hd">
            <span class="pc-name" :title="c.poolLabel">{{ c.poolLabel }}</span>
            <span class="pc-mode" :class="`is-${MODE_TONE[c.effectiveMode]}`">{{ c.effectiveMode }}</span>
            <a-tooltip :title="globalMode === '人工派单' ? '全局为人工派单，本组派单方式不可切换' : '切换派单方式'">
              <a-button type="text" size="small" class="dx-icon-btn pc-op" :disabled="globalMode === '人工派单'" @click="openMode(c.id)">
                <template #icon><SwapOutlined /></template>
              </a-button>
            </a-tooltip>
          </div>
          <div class="pc-tags">
            <span class="pc-tag">本组 {{ c.groupMode }}</span>
            <span class="pc-tag">{{ store.config.runMode }}</span>
          </div>
          <div class="pc-stats">
            <div class="pc-stat pc-stat-lead">
              <span class="pc-stat-val" :class="c.backlog ? 'is-warn' : 'is-calm'">{{ c.backlog }}</span>
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
          <div v-if="c.leaders.length" class="pc-foot" :title="c.leaders.join('、')">
            <span class="pc-foot-k">班组长</span>{{ c.leaders.join('、') }}
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

/* 全局状态条 */
.gs { display: flex; align-items: center; gap: 12px 32px; flex-wrap: wrap; padding: 16px 20px; margin-bottom: 16px; }
.gs-main { display: flex; align-items: center; gap: 12px; flex: none; }
.gs-ic { width: 32px; height: 32px; font-size: 15px; }
.gs-name { font-size: 14px; font-weight: 600; color: #1f2329; }
.gs-meta { display: flex; align-items: center; flex-wrap: wrap; gap: 4px 24px; font-size: 13px; color: #1f2329; min-width: 0; flex: 1; }
.gs-kv { white-space: nowrap; }
.gs-kv em { font-style: normal; color: #86909c; margin-right: 8px; }
.gs-ops { display: flex; align-items: center; gap: 4px; margin-left: auto; }

/* 组池卡：宽屏最多 4 列（外层分派监控根节点为尺寸容器） */
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
.pc-foot {
  font-size: 11px; color: #6b7280; line-height: 1.4;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.pc-foot-k { color: #9ca3af; margin-right: 6px; }
:deep(.ant-table-thead > tr > th) { background: #f3f4f6; color: #6b7280; font-size: 12px; }
</style>
