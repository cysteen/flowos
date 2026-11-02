<script setup lang="ts">
// 分派监控 · 池状态区（PRD 5.4 / 14.1）：全局与各组池形态卡片、切换与回切确认入口、切换记录
import { computed, ref } from 'vue';
import { GlobalOutlined, HistoryOutlined } from '@ant-design/icons-vue';
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
  <section class="block">
    <div class="b-title">
      池状态
      <a-button class="hd-btn" size="small" @click="recordOpen = true"><template #icon><HistoryOutlined /></template>切换记录</a-button>
    </div>

    <div class="pool-grid">
      <div class="pc pc-global" :class="`tone-${MODE_TONE[globalMode]}`">
        <div class="pc-hd">
          <span class="pc-ic"><GlobalOutlined /></span>
          <span class="pc-name">全局</span>
          <a-tag :color="MODE_TONE[globalMode]">{{ globalMode }}</a-tag>
          <a-tag v-if="store.config.autoDegraded" color="orange">自动降级</a-tag>
        </div>
        <div class="kv"><span class="k">全局开关</span><span class="v" :class="store.config.globalSwitch ? 'on' : 'off'">{{ store.config.globalSwitch ? '开启' : '关闭' }}</span></div>
        <div class="kv"><span class="k">运行方式</span><span class="v">{{ store.config.runMode }}</span></div>
        <div class="kv"><span class="k">上线阶段</span><span class="v">{{ stage }}</span></div>
        <div class="kv"><span class="k">开启班组</span><span class="v">{{ store.groups.filter((g) => g.switchOn).length }} / {{ store.groups.length }}</span></div>
        <div class="pc-ft">
          <a-tooltip v-if="store.config.autoDegraded" :title="canResume ? undefined : `各项指标连续 ${resumeMinutes} 分钟达标后可回切`">
            <a-button size="small" type="primary" :disabled="!canResume" @click="openMode('global')">确认回切</a-button>
          </a-tooltip>
          <a-button size="small" @click="openMode('global')">切换形态</a-button>
        </div>
      </div>

      <div class="group-grid">
      <div v-for="c in cards" :key="c.id" class="pc" :class="`tone-${MODE_TONE[c.effectiveMode]}`">
        <div class="pc-hd">
          <span class="pc-name" :title="c.poolLabel">{{ c.poolLabel }}</span>
          <a-tag :color="MODE_TONE[c.effectiveMode]">{{ c.effectiveMode }}</a-tag>
        </div>
        <div class="kv"><span class="k">本组形态</span><span class="v">{{ c.groupMode }}</span></div>
        <div class="kv"><span class="k">班组开关</span><span class="v" :class="c.switchOn ? 'on' : 'off'">{{ c.switchOn ? '开启' : '关闭' }}</span></div>
        <div class="kv"><span class="k">运行方式</span><span class="v">{{ store.config.runMode }}</span></div>
        <div class="kv"><span class="k">班组长</span><span class="v ell" :title="c.leaders.join('、')">{{ c.leaders.join('、') || '—' }}</span></div>
        <div class="kv"><span class="k">成员 · 画像配置</span><span class="v">{{ c.memberCount }} 人 · {{ c.configRate == null ? '—' : `${c.configRate}%` }}</span></div>
        <div class="rate-bar"><i :style="{ width: `${c.configRate ?? 0}%` }" /></div>
        <div class="pc-ft">
          <span class="pc-bk" :class="{ hot: c.backlog }">池内待派 {{ c.backlog }}</span>
          <a-tooltip :title="globalMode === '停派态' ? '全局已停派，本组形态不可切换' : undefined">
            <a-button size="small" :disabled="globalMode === '停派态'" @click="openMode(c.id)">切换形态</a-button>
          </a-tooltip>
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
.block { background: #fff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 16px 20px; }
.b-title { font-size: 13px; font-weight: 600; color: #111827; margin-bottom: 14px; padding-left: 10px; border-left: 3px solid #1a6fff; display: flex; align-items: center; gap: 10px; min-height: 24px; }
.b-sub { font-size: 12px; font-weight: normal; color: #9ca3af; }
.hd-btn { margin-left: auto; }
.pool-grid { display: grid; grid-template-columns: minmax(220px, 260px) minmax(0, 1fr); gap: 12px; align-items: stretch; }
.group-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 12px; min-width: 0; }
.pc-global { align-self: start; }
/* 外层分派监控根节点为尺寸容器 */
@container (max-width: 720px) {
  .pool-grid { grid-template-columns: minmax(0, 1fr); }
}
.pc { border: 1px solid #eef0f3; border-radius: 10px; padding: 12px 14px; display: flex; flex-direction: column; gap: 6px; position: relative; overflow: hidden; min-width: 0; }
.pc::before { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 3px; background: #10b981; }
.pc.tone-orange::before { background: #f59e0b; }
.pc.tone-red::before { background: #ef4444; }
.pc-global { background: #f9fafb; }
.pc-hd { display: flex; align-items: center; gap: 6px; margin-bottom: 4px; min-width: 0; }
.pc-hd :deep(.ant-tag) { margin-inline-end: 0; }
.pc-ic { color: #1a6fff; font-size: 14px; }
.pc-name { font-weight: 600; color: #111827; font-size: 13px; flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.kv { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; font-size: 12px; line-height: 20px; }
.k { color: #6b7280; flex: none; }
.v { color: #374151; min-width: 0; text-align: right; }
.v.ell { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.v.on { color: #10b981; }
.v.off { color: #9ca3af; }
.rate-bar { height: 4px; background: #f3f4f6; border-radius: 2px; overflow: hidden; }
.rate-bar i { display: block; height: 100%; background: #1a6fff; border-radius: 2px; }
.pc-ft { display: flex; align-items: center; justify-content: flex-end; gap: 8px; margin-top: auto; padding-top: 8px; border-top: 1px dashed #f0f0f0; }
.pc-bk { font-size: 12px; color: #9ca3af; margin-right: auto; }
.pc-bk.hot { color: #ea580c; }
:deep(.ant-table-thead > tr > th) { background: #f3f4f6; color: #6b7280; font-size: 12px; }
</style>
