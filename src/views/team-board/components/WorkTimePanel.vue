<script setup lang="ts">
/**
 * 班组看板 · 工作时长分布（组级）。
 *
 * 数据取话务条状态流水（stores/ctiFlow.ts）：本组各工作类型（就绪子状态）与外呼忙碌段的时长、占比；
 * 「状态存疑」＝线下类工作状态期间又有工单操作的时段，单独列示（已含在对应线下类型的时长里，不另加进合计）。
 * 只出组级，不出个人列表与排名。仅班组长 / 督导 / 管理员可见；组取本人任班组长的处理组，督导与管理员看全部有成员的组。
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { ExclamationCircleOutlined } from '@ant-design/icons-vue';
import MetricTipIcon from '@/components/MetricTipIcon.vue';
import { useDispatchStore } from '@/stores/dispatch';
import { useUserStore } from '@/stores/user';
import { flowMembers, SUSPECT_WINDOW_MIN, useCtiFlowStore } from '@/stores/ctiFlow';
import type { RoleKey } from '@/config/roles';

const dispatch = useDispatchStore();
const user = useUserStore();
const flow = useCtiFlowStore();

const VIEW_ROLES: RoleKey[] = ['team-leader', 'complaint-supervisor', 'system-admin', 'ops-admin', 'tenant-admin'];
const canView = computed(() => VIEW_ROLES.includes(user.roleKey));

const nowMs = ref(Date.now());
const timer = window.setInterval(() => { nowMs.value = Date.now(); }, 30_000);
onBeforeUnmount(() => window.clearInterval(timer));

/** 有流水成员的组 */
const groups = computed(() => {
  const withMembers = new Set(flowMembers().map((m) => m.groupId));
  const all = dispatch.groups.filter((g) => withMembers.has(g.id));
  if (user.roleKey === 'team-leader') return all.filter((g) => g.leaders.includes(user.name));
  return all;
});
const groupId = ref<string | null>(null);
watch(groups, (gs) => {
  if (!gs.some((g) => g.id === groupId.value)) groupId.value = gs[0]?.id ?? null;
}, { immediate: true });

type RangeKey = 'today' | '7d' | '14d';
const RANGES: { key: RangeKey; label: string; days: number }[] = [
  { key: 'today', label: '今日', days: 1 },
  { key: '7d', label: '近7天', days: 7 },
  { key: '14d', label: '近14天', days: 14 },
];
const range = ref<RangeKey>('7d');

const dist = computed(() => {
  if (!groupId.value) return null;
  void flow.segments.length;
  void flow.ops.length;
  const now = nowMs.value;
  const d0 = new Date(now);
  d0.setHours(0, 0, 0, 0);
  const days = RANGES.find((r) => r.key === range.value)!.days;
  const from = d0.getTime() - (days - 1) * 24 * 3_600_000;
  return flow.distribution(groupId.value, from, now, now);
});

/**
 * 一位小数的最大余数分配：各项显示值相加恰等于合计显示值（小时、占比各分配一次）。
 */
function apportion(values: number[], total: number): number[] {
  const target = Math.round(total * 10);
  const raw = values.map((v) => v * 10);
  const out = raw.map(Math.floor);
  let rest = target - out.reduce((s, x) => s + x, 0);
  raw
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac)
    .forEach(({ i }) => { if (rest > 0 && values[i] > 0) { out[i] += 1; rest -= 1; } });
  return out.map((x) => x / 10);
}

/** 图例全列（外呼单列在末项），时长与占比按合计配平 */
const legend = computed(() => {
  const d = dist.value;
  if (!d) return [];
  const h = apportion(d.items.map((i) => i.ms / 3_600_000), d.totalMs / 3_600_000);
  const p = d.totalMs ? apportion(d.items.map((i) => i.pct), 100) : d.items.map(() => 0);
  return d.items.map((i, k) => ({ ...i, hText: h[k].toFixed(1), pText: `${p[k].toFixed(1)}%` }));
});
/** 图上只画有时长的项 */
const barItems = computed(() => legend.value.filter((i) => i.ms > 0));

function hours(ms: number): string {
  return (ms / 3_600_000).toFixed(1);
}
function pctText(p: number): string {
  return `${p.toFixed(1)}%`;
}
const suspectPct = computed(() => {
  const d = dist.value;
  return d && d.offlineMs ? (d.suspectMs / d.offlineMs) * 100 : 0;
});
const suspectTip = { define: `线下类工作状态期间又有工单操作的时段（每次操作计其后 ${SUSPECT_WINDOW_MIN} 分钟），已含在对应工作类型内` };
</script>

<template>
  <div v-if="canView && groups.length && dist" class="card wtp">
    <div class="card-hd">
      <div class="hd-main">
        <h3 class="hd-title">工作时长分布</h3>
        <div class="wtp-groups" role="tablist">
          <button
            v-for="g in groups"
            :key="g.id"
            type="button"
            class="wtp-group"
            :class="{ on: g.id === groupId }"
            @click="groupId = g.id"
          >
            {{ g.label }}
          </button>
        </div>
      </div>
      <div class="seg">
        <div
          v-for="r in RANGES"
          :key="r.key"
          class="seg-i"
          :class="{ on: range === r.key }"
          @click="range = r.key"
        >
          {{ r.label }}
        </div>
      </div>
    </div>

    <div class="wtp-body">
      <div class="wtp-sum">
        <div class="wtp-stat">
          <span class="wtp-stat-l">合计</span>
          <span class="wtp-stat-v">{{ hours(dist.totalMs) }}</span>
          <span class="wtp-stat-u">小时</span>
        </div>
        <div class="wtp-stat">
          <span class="wtp-stat-l">统计人数</span>
          <span class="wtp-stat-v">{{ dist.memberCount }}</span>
          <span class="wtp-stat-u">人</span>
        </div>
        <div class="wtp-stat wtp-suspect">
          <ExclamationCircleOutlined class="wtp-suspect-ic" />
          <span class="wtp-stat-l">状态存疑</span>
          <MetricTipIcon :tip="suspectTip" />
          <span class="wtp-stat-v">{{ hours(dist.suspectMs) }}</span>
          <span class="wtp-stat-u">小时</span>
          <span class="wtp-stat-x">占线下类工作 {{ pctText(suspectPct) }}</span>
        </div>
      </div>

      <div v-if="dist.totalMs > 0" class="wtp-bar" role="img" :aria-label="`工作时长分布，合计 ${hours(dist.totalMs)} 小时`">
        <a-tooltip v-for="i in barItems" :key="i.key" :title="`${i.label} ${i.hText} 小时 · ${i.pText}`">
          <i class="wtp-seg" :style="{ flexGrow: i.ms, background: i.color }" />
        </a-tooltip>
      </div>
      <div v-else class="wtp-empty">暂无数据</div>

      <div class="wtp-legend" role="table" aria-label="各工作类型时长">
        <div v-for="i in legend" :key="i.key" class="wtp-li" role="row">
          <span class="wtp-sw" :style="{ background: i.color }" />
          <span class="wtp-ln" role="cell">{{ i.label }}</span>
          <span class="wtp-lh" role="cell">{{ i.hText }} 小时</span>
          <span class="wtp-lp" role="cell">{{ i.pText }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.card {
  display: flex;
  flex-direction: column;
  min-width: 0;
  background: #fff;
  border: 0.8px solid #e5e6eb;
  border-radius: 12px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
  overflow: hidden;
}
.card-hd {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 16px 12px;
  border-bottom: 1px solid #eef2f7;
  flex-wrap: wrap;
}
.hd-main { display: flex; align-items: center; gap: 14px; min-width: 0; flex-wrap: wrap; }
.hd-title { margin: 0; font-size: 15px; font-weight: 700; color: #0f172a; line-height: 1.3; }
.wtp-groups { display: flex; gap: 6px; flex-wrap: wrap; }
.wtp-group {
  display: inline-flex; align-items: center; gap: 6px;
  height: 28px; padding: 0 10px; font-size: 12px; color: #475569; font-family: inherit;
  background: #fff; border: 1px solid #e2e8f0; border-radius: 6px; cursor: pointer; white-space: nowrap;
}
.wtp-group:hover { background: #f9fafb; }
.wtp-group.on { color: #1a6fff; background: #eff6ff; border-color: #bfdbfe; font-weight: 600; }

.seg { display: flex; background: #f1f5f9; border-radius: 6px; padding: 2px; gap: 2px; }
.seg-i { padding: 3px 10px; font-size: 12px; color: #64748b; border-radius: 4px; cursor: pointer; }
.seg-i.on { background: #fff; color: #1a6fff; font-weight: 600; box-shadow: 0 1px 2px rgba(15, 23, 42, 0.06); }

.wtp-body { display: flex; flex-direction: column; gap: 12px; padding: 12px 16px 14px; }
.wtp-sum { display: flex; align-items: baseline; gap: 24px; flex-wrap: wrap; }
.wtp-stat { display: inline-flex; align-items: baseline; gap: 4px; font-variant-numeric: tabular-nums; }
.wtp-stat-l { font-size: 12px; color: #64748b; margin-right: 2px; }
.wtp-stat-v { font-size: 18px; font-weight: 700; color: #0f172a; }
.wtp-stat-u { font-size: 12px; color: #64748b; }
.wtp-stat-x { font-size: 12px; color: #64748b; margin-left: 6px; }
.wtp-suspect { align-items: center; padding: 2px 10px; border-radius: 999px; background: #fffbeb; border: 1px solid #fde68a; }
.wtp-suspect .wtp-stat-v { font-size: 15px; }
.wtp-suspect-ic { color: #d97706; font-size: 13px; }

.wtp-bar { display: flex; gap: 2px; height: 14px; border-radius: 4px; overflow: hidden; }
.wtp-seg { display: block; min-width: 2px; height: 100%; flex-basis: 0; }
.wtp-seg:first-child { border-radius: 4px 0 0 4px; }
.wtp-seg:last-child { border-radius: 0 4px 4px 0; }
.wtp-empty { font-size: 12px; color: #9ca3af; padding: 4px 0; }

.wtp-legend {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 6px 20px;
}
.wtp-li { display: flex; align-items: center; gap: 8px; font-size: 12px; min-width: 0; padding: 4px 0; border-bottom: 1px dashed #eef2f7; }
.wtp-sw { width: 10px; height: 10px; border-radius: 3px; flex: none; }
.wtp-ln { color: #374151; flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.wtp-lh { color: #0f172a; font-weight: 600; font-variant-numeric: tabular-nums; }
.wtp-lp { color: #64748b; width: 48px; text-align: right; font-variant-numeric: tabular-nums; }
</style>
