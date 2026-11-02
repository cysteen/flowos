<script setup lang="ts">
/**
 * 班组看板 · 工作时长分布（组级）。
 *
 * 数据取话务条状态流水（stores/ctiFlow.ts）：本组各工作类型（就绪子状态）与外呼忙碌段的时长、占比；
 * 「状态存疑」＝线下类工作状态期间又有工单操作的时段，单独列示（已含在对应线下类型的时长里，不另加进合计）。
 * 上半部分为人均口径（组合计 ÷ 统计人数），下半部分为成员明细（顺序同组员明细默认顺序，不排序、不排名、不标高亮），末行「人均」与上半部分一致。可见性随「班组看板」菜单权限（config/roles.ts 各角色 menus 含 team-board，路由守卫按此放行），
 * 块内不另设角色判断；班组跟随看板顶部「班组」筛选（由看板传入 groupId），统计人数与筛选项「（N人）」同一口径。
 */
import { computed, onBeforeUnmount, ref } from 'vue';
import { ExclamationCircleOutlined } from '@ant-design/icons-vue';
import MetricTipIcon from '@/components/MetricTipIcon.vue';
import { groupMembersOf, SUSPECT_WINDOW_MIN, useCtiFlowStore } from '@/stores/ctiFlow';

const props = defineProps<{ groupId: string; memberOrder?: string[] }>();
const flow = useCtiFlowStore();

const nowMs = ref(Date.now());
const timer = window.setInterval(() => { nowMs.value = Date.now(); }, 30_000);
onBeforeUnmount(() => window.clearInterval(timer));

/** 统计人数：本组组员（二线专员、每人只算第一个所属组） */
const memberCount = computed(() => (props.groupId ? groupMembersOf(props.groupId).length : 0));

type RangeKey = 'today' | '7d' | '14d';
const RANGES: { key: RangeKey; label: string; days: number }[] = [
  { key: 'today', label: '今日', days: 1 },
  { key: '7d', label: '近7天', days: 7 },
  { key: '14d', label: '近14天', days: 14 },
];
const range = ref<RangeKey>('7d');

const dist = computed(() => {
  if (!props.groupId) return null;
  void flow.segments.length;
  void flow.ops.length;
  const now = nowMs.value;
  const d0 = new Date(now);
  d0.setHours(0, 0, 0, 0);
  const days = RANGES.find((r) => r.key === range.value)!.days;
  const from = d0.getTime() - (days - 1) * 24 * 3_600_000;
  return flow.distribution(props.groupId, from, now, now);
});

const H = 3_600_000;

/**
 * 一位小数的最大余数分配：各项显示值（单位 0.1）相加恰等于给定合计显示值。
 * 用于：组合计 → 各成员合计；成员合计 → 该成员各类型；人均合计 → 人均各类型；组存疑 → 各成员存疑；占比 → 100%。
 */
function apportion(values: number[], targetTenths: number): number[] {
  const raw = values.map((v) => v * 10);
  const out = raw.map(Math.floor);
  let rest = targetTenths - out.reduce((s, x) => s + x, 0);
  raw
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac)
    .forEach(({ i }) => { if (rest > 0 && values[i] > 0) { out[i] += 1; rest -= 1; } });
  // 目标与原值差超过各项小数部分之和时（人均合计取整后再分配可能出现），差额落到最大项，保证总和恰等于目标
  if (rest !== 0 && values.length) {
    const big = values.indexOf(Math.max(...values));
    out[big] = Math.max(0, out[big] + rest);
  }
  return out.map((x) => x / 10);
}
const tenths = (h: number) => Math.round(h * 10);

const n = computed(() => Math.max(1, memberCount.value));

/** 上半部分：人均口径。人均合计＝组合计 ÷ 人数（四舍五入到 0.1），各类型人均按人均合计配平；占比与组合计口径相同 */
const perCapita = computed(() => {
  const d = dist.value;
  if (!d) return null;
  // 人均合计取「显示的组合计 ÷ 人数」再四舍五入，保证页面上两数可直接相除核对
  const totalTenths = Math.round(tenths(d.totalMs / H) / n.value);
  const h = apportion(d.items.map((i) => i.ms / H / n.value), totalTenths);
  const p = d.totalMs ? apportion(d.items.map((i) => i.pct), 1000) : d.items.map(() => 0);
  return {
    total: (totalTenths / 10).toFixed(1),
    groupTotal: (tenths(d.totalMs / H) / 10).toFixed(1),
    suspect: (Math.round(tenths(d.suspectMs / H) / n.value) / 10).toFixed(1),
    items: d.items.map((i, k) => ({ ...i, hText: h[k].toFixed(1), pText: `${p[k].toFixed(1)}%` })),
  };
});
/** 图上只画有时长的项 */
const barItems = computed(() => (perCapita.value?.items ?? []).filter((i) => i.ms > 0));

/** 成员顺序：与组员明细默认顺序一致（由看板传入），缺省取组员名单顺序 */
const memberNames = computed(() => {
  const names = props.groupId ? groupMembersOf(props.groupId).map((m) => m.name) : [];
  if (!props.memberOrder?.length) return names;
  const ordered = props.memberOrder.filter((x) => names.includes(x));
  return [...ordered, ...names.filter((x) => !ordered.includes(x))];
});

/**
 * 下半部分：成员明细。组合计按最大余数拆成各成员合计（之和＝组合计），
 * 每人各类型再按本人合计配平（之和＝本人合计）；状态存疑同样从组存疑拆给各人。
 */
const memberRows = computed(() => {
  const d = dist.value;
  if (!d) return [];
  const names = memberNames.value;
  const row = (name: string) => d.byMember[name];
  const totals = apportion(names.map((x) => (row(x)?.totalMs ?? 0) / H), tenths(d.totalMs / H));
  const suspects = apportion(names.map((x) => (row(x)?.suspectMs ?? 0) / H), tenths(d.suspectMs / H));
  return names.map((name, k) => {
    const r = row(name);
    const cells = apportion(d.items.map((i) => (r?.ms[i.key] ?? 0) / H), Math.round(totals[k] * 10));
    return {
      name,
      total: totals[k].toFixed(1),
      suspect: suspects[k].toFixed(1),
      cells: d.items.map((i, j) => ({
        key: i.key,
        h: cells[j].toFixed(1),
        tip: `${i.label} ${cells[j].toFixed(1)} 小时 · 占本人 ${r?.totalMs ? (((r.ms[i.key] ?? 0) / r.totalMs) * 100).toFixed(1) : '0.0'}%`,
      })),
    };
  });
});
const gridCols = computed(() => `minmax(128px, 1.3fr) minmax(72px, 0.9fr) repeat(${dist.value?.items.length ?? 0}, minmax(72px, 1fr)) minmax(80px, 0.9fr)`);

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
  <div v-if="dist" class="card wtp">
    <div class="card-hd">
      <div class="hd-main">
        <h3 class="hd-title">工作时长分布</h3>
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

    <div v-if="perCapita" class="wtp-body">
      <div class="wtp-sum">
        <div class="wtp-stat">
          <span class="wtp-stat-l">人均</span>
          <span class="wtp-stat-v">{{ perCapita.total }}</span>
          <span class="wtp-stat-u">小时</span>
        </div>
        <div class="wtp-stat">
          <span class="wtp-stat-l">统计人数</span>
          <span class="wtp-stat-v">{{ memberCount }}</span>
          <span class="wtp-stat-u">人</span>
          <span class="wtp-stat-x">组合计 {{ perCapita.groupTotal }} 小时</span>
        </div>
        <div class="wtp-stat wtp-suspect">
          <ExclamationCircleOutlined class="wtp-suspect-ic" />
          <span class="wtp-stat-l">状态存疑</span>
          <MetricTipIcon :tip="suspectTip" />
          <span class="wtp-stat-v">{{ perCapita.suspect }}</span>
          <span class="wtp-stat-u">小时 / 人</span>
          <span class="wtp-stat-x">占线下类工作 {{ pctText(suspectPct) }}</span>
        </div>
      </div>

      <div v-if="dist.totalMs > 0" class="wtp-bar" role="img" :aria-label="`工作时长分布，人均 ${perCapita.total} 小时`">
        <a-tooltip v-for="i in barItems" :key="i.key" :title="`${i.label} 人均 ${i.hText} 小时 · ${i.pText}`">
          <i class="wtp-seg" :style="{ flexGrow: i.ms, background: i.color }" />
        </a-tooltip>
      </div>
      <div v-else class="wtp-empty">暂无数据</div>

      <div class="wtp-legend" role="table" aria-label="各工作类型人均时长">
        <div v-for="i in perCapita.items" :key="i.key" class="wtp-li" role="row">
          <span class="wtp-sw" :style="{ background: i.color }" />
          <span class="wtp-ln" role="cell">{{ i.label }}</span>
          <span class="wtp-lh" role="cell">{{ i.hText }} 小时</span>
          <span class="wtp-lp" role="cell">{{ i.pText }}</span>
        </div>
      </div>

      <div class="wtp-tbl" role="table" aria-label="成员工作时长明细（小时）">
        <div class="wtp-thead" role="row" :style="{ gridTemplateColumns: gridCols }">
          <div class="wtp-th" role="columnheader">成员</div>
          <div class="wtp-th num" role="columnheader">合计</div>
          <div v-for="i in dist.items" :key="i.key" class="wtp-th num" role="columnheader">
            <span class="wtp-th-sw" :style="{ background: i.color }" />{{ i.label }}
          </div>
          <div class="wtp-th num" role="columnheader">状态存疑</div>
        </div>
        <div v-for="r in memberRows" :key="r.name" class="wtp-trow" role="row" :style="{ gridTemplateColumns: gridCols }">
          <div class="wtp-td wtp-td-name" role="cell">
            <span class="m-avatar">{{ r.name.charAt(0) }}</span>
            <span class="m-name">{{ r.name }}</span>
          </div>
          <div class="wtp-td num strong" role="cell">{{ r.total }}</div>
          <a-tooltip v-for="c in r.cells" :key="c.key" :title="c.tip">
            <div class="wtp-td num" role="cell">{{ c.h }}</div>
          </a-tooltip>
          <div class="wtp-td num" role="cell">{{ r.suspect }}</div>
        </div>
        <div class="wtp-trow wtp-avg" role="row" :style="{ gridTemplateColumns: gridCols }">
          <div class="wtp-td wtp-td-name" role="cell">人均</div>
          <div class="wtp-td num strong" role="cell">{{ perCapita.total }}</div>
          <div v-for="i in perCapita.items" :key="i.key" class="wtp-td num" role="cell">{{ i.hText }}</div>
          <div class="wtp-td num" role="cell">{{ perCapita.suspect }}</div>
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

/* 成员明细：沿用看板「组员明细」表格风格 */
.wtp-tbl { margin: 0 -16px -14px; overflow-x: auto; border-top: 1px solid #eef2f7; }
.wtp-thead, .wtp-trow { display: grid; align-items: center; }
.wtp-thead { background: #f8fafc; }
.wtp-th {
  display: flex; align-items: center; gap: 5px; padding: 8px 12px;
  font-size: 12px; font-weight: 600; color: #64748b; white-space: nowrap;
}
.wtp-th:first-child { padding-left: 16px; }
.wtp-th.num { justify-content: flex-end; }
.wtp-th-sw { width: 8px; height: 8px; border-radius: 2px; flex: none; }
.wtp-trow { border-bottom: 1px solid #f1f5f9; }
.wtp-trow:hover { background: #f9fafb; }
.wtp-td { display: flex; align-items: center; gap: 8px; padding: 10px 12px; font-size: 12px; color: #334155; }
.wtp-td.num { justify-content: flex-end; font-variant-numeric: tabular-nums; }
.wtp-td.strong { font-weight: 600; color: #0f172a; }
.wtp-td-name { padding-left: 16px; min-width: 0; }
.wtp-avg { background: #f8fafc; border-bottom: none; }
.wtp-avg:hover { background: #f8fafc; }
.wtp-avg .wtp-td { font-weight: 600; color: #0f172a; }
.m-avatar {
  flex: none; width: 28px; height: 28px; border-radius: 8px;
  display: inline-flex; align-items: center; justify-content: center;
  font-size: 12px; font-weight: 700; color: #1a6fff; background: #eff6ff; border: 1px solid #dbeafe;
}
.m-name { font-weight: 600; color: #111827; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
</style>
