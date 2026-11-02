<script setup lang="ts">
// 分派监控 · 池状态区（PRD 5.4 / 14.1）：全局状态条 + 组池卡片、切换与回切确认入口、切换记录
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
/** 自动降级后各项指标连续 N 分钟达标（5.4，由派单引擎判定） */
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

    <!-- 全局状态条：形态、全局开关、运行方式、上线阶段、开启班组；右侧切换形态 / 确认回切 -->
    <div class="dx-card gs">
      <div class="gs-main">
        <span class="dx-icon gs-ic"><GlobalOutlined /></span>
        <span class="gs-name">全局</span>
        <span class="dx-status" :class="`is-${MODE_TONE[globalMode]}`">{{ globalMode }}</span>
        <span v-if="store.config.autoDegraded" class="dx-status is-orange">自动降级</span>
      </div>
      <div class="gs-meta">
        <span class="gs-kv"><em>全局开关</em>{{ store.config.globalSwitch ? '开启' : '关闭' }}</span>
        <span class="gs-kv"><em>运行方式</em>{{ store.config.runMode }}</span>
        <span class="gs-kv"><em>上线阶段</em>{{ stage }}</span>
        <span class="gs-kv"><em>开启班组</em>{{ store.groups.filter((g) => g.switchOn).length }} / {{ store.groups.length }}</span>
      </div>
      <div class="gs-ops">
        <a-tooltip v-if="store.config.autoDegraded" :title="canResume ? undefined : `各项指标连续 ${resumeMinutes} 分钟达标后可回切`">
          <a-button type="link" size="small" :disabled="!canResume" @click="openMode('global')">确认回切</a-button>
        </a-tooltip>
        <a-button type="link" size="small" @click="openMode('global')">切换形态</a-button>
      </div>
    </div>

    <div class="group-grid">
      <div v-for="c in cards" :key="c.id" class="dx-card pc">
        <div class="pc-hd">
          <span class="dx-card-title" :title="c.poolLabel">{{ c.poolLabel }}</span>
          <span class="dx-status" :class="`is-${MODE_TONE[c.effectiveMode]}`">{{ c.effectiveMode }}</span>
          <span class="pc-sp" />
          <a-tooltip :title="globalMode === '停派态' ? '全局已停派，本组形态不可切换' : '切换形态'">
            <a-button type="text" size="small" class="dx-icon-btn pc-op" :disabled="globalMode === '停派态'" @click="openMode(c.id)">
              <template #icon><SwapOutlined /></template>
            </a-button>
          </a-tooltip>
        </div>
        <div class="dx-meta pc-meta" :title="`本组形态 ${c.groupMode} · 班组开关 ${c.switchOn ? '开启' : '关闭'} · ${store.config.runMode} · 班组长 ${c.leaders.join('、') || '—'}`">
          本组{{ c.groupMode }}<i class="dx-meta-sep">·</i>班组开关 {{ c.switchOn ? '开启' : '关闭' }}<i class="dx-meta-sep">·</i>{{ store.config.runMode }}<i class="dx-meta-sep">·</i>{{ c.leaders.join('、') || '—' }}
        </div>
        <div class="dx-metrics">
          <div class="dx-metric"><b :class="c.backlog ? 'is-warn' : 'is-primary'">{{ c.backlog }}</b><span>池内待派</span></div>
          <div class="dx-metric"><b>{{ c.memberCount }}</b><span>成员数</span></div>
          <div class="dx-metric"><b>{{ c.configRate == null ? '—' : `${c.configRate}%` }}</b><span>画像配置率</span></div>
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
.pc { display: flex; flex-direction: column; gap: 12px; }
.pc-hd { display: flex; align-items: center; gap: 8px; min-width: 0; margin: -4px 0; }
.pc-sp { flex: 1; min-width: 0; }
.pc-meta { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: -6px; }
.pc-meta .dx-meta-sep { font-style: normal; }
:deep(.ant-table-thead > tr > th) { background: #f3f4f6; color: #6b7280; font-size: 12px; }
</style>
