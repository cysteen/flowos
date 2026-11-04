<script setup lang="ts">
/**
 * 班组看板 · 在岗工作时长统计（组级）。
 *
 * 数据取话务条状态流水（stores/ctiFlow.ts）：本组各工作类型（就绪子状态，外呼通话计入工单处理）与小休的时长、占比。
 * 上半部分为人均口径（组合计 ÷ 统计人数），下半部分为成员明细（顺序同组员明细默认顺序，不排序、不排名、不标高亮），末行「人均」与上半部分一致。可见性随「班组看板」菜单权限（config/roles.ts 各角色 menus 含 team-board，路由守卫按此放行），
 * 块内不另设角色判断；班组跟随看板顶部「班组」筛选（由看板传入 groupId），统计人数与筛选项「（N人）」同一口径。
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import dayjs, { type Dayjs } from 'dayjs';
import { HOME_PERF_RANGE_OPTS, type HomePerfRangeKey } from '@/mock/homeOverview';
import { useCloseOnDeactivate } from '@/composables/useCloseOnDeactivate';
import { groupMembersOf, useCtiFlowStore } from '@/stores/ctiFlow';
import { BREAK_ITEM, BREAK_REASONS } from '@/mock/ctiWorkTypes';
import MetricTipIcon from '@/components/MetricTipIcon.vue';

const props = defineProps<{ groupId: string; memberOrder?: string[] }>();
const flow = useCtiFlowStore();

const nowMs = ref(Date.now());
const timer = window.setInterval(() => { nowMs.value = Date.now(); }, 30_000);
onBeforeUnmount(() => window.clearInterval(timer));

/** 统计人数：本组组员（二线专员、每人只算第一个所属组） */
const memberCount = computed(() => (props.groupId ? groupMembersOf(props.groupId).length : 0));

/*
 * 时间筛选：与个人门户「我的效能」同一组件与选项（HOME_PERF_RANGE_OPTS：今天 / 本周 / 本月 / 自定义），
 * 自定义的默认值（近 7 天）、打开方式（选中即弹出）与可选范围（不晚于今天、最长 31 天）照个人门户实现。
 * 口径：今天＝当日；本周＝周一至今天；本月＝1 号至今天；自定义＝所选起止日期；均含当天。
 */
const rangeKey = ref<HomePerfRangeKey>('today');
/** 空值用 undefined 而非 null：a-range-picker 的 value 只接受 [Dayjs, Dayjs] | undefined */
const customRange = ref<[Dayjs, Dayjs] | undefined>(undefined);
const pickerOpen = ref(false);
useCloseOnDeactivate(pickerOpen);

watch(rangeKey, (key) => {
  if (key === 'custom') {
    if (!customRange.value) {
      customRange.value = [dayjs().subtract(6, 'day').startOf('day'), dayjs().endOf('day')];
    }
    pickerOpen.value = true;
  } else {
    pickerOpen.value = false;
  }
});

/**
 * 浮层打开期间选择器显示这组正在选的日期：每次打开从空开始，点外面放弃时不会把只改了一端的区间提交出去。
 * 两端都选完才写入 customRange。
 */
type PickingDates = [Dayjs | null, Dayjs | null] | [];
const pickingDates = ref<PickingDates>([]);
const pickerValue = computed(() => (pickerOpen.value ? pickingDates.value : customRange.value) as [Dayjs, Dayjs] | undefined);
watch(pickerOpen, () => { pickingDates.value = []; });
function onCalendarChange(dates: unknown) {
  pickingDates.value = (dates ?? []) as PickingDates;
}
function onRangeChange(dates: unknown) {
  if (!dates) return;
  customRange.value = dates as [Dayjs, Dayjs];
  // 选中「自定义」时浮层由代码打开，选择器选完终点后会转回起点继续选：两端选完即关闭。放到下一轮，排在它转回起点之后
  setTimeout(() => { pickerOpen.value = false; }, 0);
}

/** 自定义区间最长 31 天：以已选的一端为准，前后各 30 天内可选；不晚于今天 */
function disabledRangeDate(current: Dayjs) {
  if (!current) return false;
  if (current.isAfter(dayjs().endOf('day'))) return true;
  const [start, end] = pickingDates.value;
  if (start && Math.abs(current.diff(start, 'day')) > 30) return true;
  if (end && Math.abs(current.diff(end, 'day')) > 30) return true;
  return false;
}

const span = computed<[number, number]>(() => {
  const now = nowMs.value;
  const today = dayjs(now).startOf('day');
  if (rangeKey.value === 'week') {
    // dayjs 的 day()：周日为 0；本周从周一算
    const back = (today.day() + 6) % 7;
    return [today.subtract(back, 'day').valueOf(), now];
  }
  if (rangeKey.value === 'month') return [today.startOf('month').valueOf(), now];
  if (rangeKey.value === 'custom' && customRange.value) {
    const [a, b] = customRange.value;
    return [a.startOf('day').valueOf(), Math.min(b.endOf('day').valueOf(), now)];
  }
  return [today.valueOf(), now];
});

const dist = computed(() => {
  if (!props.groupId) return null;
  void flow.segments.length;
  const [from, to] = span.value;
  return flow.distribution(props.groupId, from, to, nowMs.value);
});

const H = 3_600_000;

/**
 * 小休按原因列出小时数（divisor＝人数时为人均），如「开会 1.20 · 培训 0.00 · 茶歇 0.30 · 用餐 6.80」。
 * 各原因按 shownHours（提示里显示的小休时长）配平，之和恰等于该显示值。
 */
function breakText(reasons: Record<string, number>, divisor: number, shownHours: number): string {
  const parts = apportion(BREAK_REASONS.map((r) => (reasons[r.key] ?? 0) / H / divisor), hundredths(shownHours), HOUR_SCALE);
  return BREAK_REASONS.map((r, k) => `${r.label} ${parts[k].toFixed(2)}`).join(' · ');
}

/** 显示精度：小时两位小数（单位 0.01），占比一位小数（单位 0.1） */
const HOUR_SCALE = 100;
const PCT_SCALE = 10;

/**
 * 最大余数分配：各项显示值（单位 1/scale）相加恰等于给定合计显示值 target（单位同样是 1/scale 的整数）。
 * 用于：组合计 → 各成员合计；成员合计 → 该成员各类型；人均合计 → 人均各类型；小休 → 四个原因（小时）；占比 → 100%。
 */
function apportion(values: number[], target: number, scale: number): number[] {
  const raw = values.map((v) => v * scale);
  const out = raw.map(Math.floor);
  let rest = target - out.reduce((s, x) => s + x, 0);
  raw
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac)
    .forEach(({ i }) => { if (rest > 0 && values[i] > 0) { out[i] += 1; rest -= 1; } });
  // 目标与原值差超过各项小数部分之和时（人均合计取整后再分配可能出现），差额落到最大项，保证总和恰等于目标
  if (rest !== 0 && values.length) {
    const big = values.indexOf(Math.max(...values));
    out[big] = Math.max(0, out[big] + rest);
  }
  return out.map((x) => x / scale);
}
/** 小时 → 0.01 小时的整数 */
const hundredths = (h: number) => Math.round(h * HOUR_SCALE);

const n = computed(() => Math.max(1, memberCount.value));

/** 上半部分：人均口径。人均合计＝组合计 ÷ 人数（四舍五入到 0.01），各类型人均按人均合计配平；占比与组合计口径相同 */
const perCapita = computed(() => {
  const d = dist.value;
  if (!d) return null;
  // 人均合计取「显示的组合计 ÷ 人数」再四舍五入，保证页面上两数可直接相除核对
  const groupHundredths = hundredths(d.totalMs / H);
  const totalHundredths = Math.round(groupHundredths / n.value);
  const h = apportion(d.items.map((i) => i.ms / H / n.value), totalHundredths, HOUR_SCALE);
  const p = d.totalMs ? apportion(d.items.map((i) => i.pct), 100 * PCT_SCALE, PCT_SCALE) : d.items.map(() => 0);
  return {
    total: (totalHundredths / HOUR_SCALE).toFixed(2),
    groupTotal: (groupHundredths / HOUR_SCALE).toFixed(2),
    items: d.items.map((i, k) => {
      const hText = h[k].toFixed(2);
      const pText = `${p[k].toFixed(1)}%`;
      const tip = i.key === BREAK_ITEM.key
        ? `小休 人均 ${hText} 小时 · ${pText}（${breakText(d.breakReasons, n.value, h[k])}）`
        : `${i.label} 人均 ${hText} 小时 · ${pText}`;
      return { ...i, hText, pText, tip };
    }),
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
 * 每人各类型再按本人合计配平（之和＝本人合计）。
 */
const memberRows = computed(() => {
  const d = dist.value;
  if (!d) return [];
  const names = memberNames.value;
  const row = (name: string) => d.byMember[name];
  const totals = apportion(names.map((x) => (row(x)?.totalMs ?? 0) / H), hundredths(d.totalMs / H), HOUR_SCALE);
  return names.map((name, k) => {
    const r = row(name);
    const cells = apportion(d.items.map((i) => (r?.ms[i.key] ?? 0) / H), hundredths(totals[k]), HOUR_SCALE);
    return {
      name,
      total: totals[k].toFixed(2),
      cells: d.items.map((i, j) => ({
        key: i.key,
        h: cells[j].toFixed(2),
        tip: i.key === BREAK_ITEM.key
          ? `小休 ${cells[j].toFixed(2)} 小时（${breakText(r?.breakReasons ?? {}, 1, cells[j])}）`
          : `${i.label} ${cells[j].toFixed(2)} 小时 · 占本人 ${r?.totalMs ? (((r.ms[i.key] ?? 0) / r.totalMs) * 100).toFixed(1) : '0.0'}%`,
      })),
    };
  });
});
const gridCols = computed(() => `minmax(112px, 1.3fr) minmax(60px, 0.9fr) repeat(${dist.value?.items.length ?? 0}, minmax(60px, 1fr))`);

/** 指标行的问号提示 */
const TOTAL_TIP = { define: '所选时间内，本组二线专员的在岗时长之和。在岗时长包含各工作类型与小休，外呼计入工单处理，不含未就绪、签出。' };
const COUNT_TIP = { define: '本组名单内的二线专员人数，多组成员只计入第一个所属组；不含班组长，不区分当天是否出勤。' };
const AVG_TIP = { define: '人工在岗时长 ÷ 统计人数。' };

/** 长条与图例悬停联动：当前高亮的项；时长为 0 的项不在长条上，不参与联动 */
const hoverKey = ref<string | null>(null);
function hoverOn(item: { key: string; ms: number }) {
  hoverKey.value = item.ms > 0 ? item.key : null;
}
function hoverOff() {
  hoverKey.value = null;
}
</script>

<template>
  <div v-if="dist" class="card wtp">
    <div class="card-hd">
      <div class="hd-main">
        <h3 class="hd-title">在岗工作时长统计</h3>
      </div>
      <div class="section-filters">
        <div class="filter-item">
          <span class="filter-label">时间</span>
          <a-segmented
            v-model:value="rangeKey"
            size="small"
            :options="HOME_PERF_RANGE_OPTS"
          />
          <a-range-picker
            v-if="rangeKey === 'custom'"
            :value="pickerValue"
            v-model:open="pickerOpen"
            @calendar-change="onCalendarChange"
            @change="onRangeChange"
            size="small"
            :allow-clear="false"
            :disabled-date="disabledRangeDate"
            format="MM-DD"
            class="range-picker"
          />
        </div>
      </div>
    </div>

    <div v-if="perCapita" class="wtp-body">
      <div class="wtp-sum">
        <div class="wtp-stat">
          <span class="wtp-stat-l">人工在岗时长</span>
          <span class="wtp-stat-v">{{ perCapita.groupTotal }}</span>
          <span class="wtp-stat-u">小时</span>
          <MetricTipIcon :tip="TOTAL_TIP" />
        </div>
        <div class="wtp-stat">
          <span class="wtp-stat-l">统计人数</span>
          <span class="wtp-stat-v">{{ memberCount }}</span>
          <span class="wtp-stat-u">人</span>
          <MetricTipIcon :tip="COUNT_TIP" />
        </div>
        <div class="wtp-stat">
          <span class="wtp-stat-l">平均在岗时长</span>
          <span class="wtp-stat-v">{{ perCapita.total }}</span>
          <span class="wtp-stat-u">小时</span>
          <MetricTipIcon :tip="AVG_TIP" />
        </div>
      </div>

      <div v-if="dist.totalMs > 0" class="wtp-bar" role="img" :aria-label="`在岗工作时长统计，平均在岗时长 ${perCapita.total} 小时`">
        <!-- 小休在最右、提示最长，放右上方落在指标行右侧空白处；其余放下方，不遮指标行 -->
        <a-tooltip v-for="i in barItems" :key="i.key" :title="i.tip" :placement="i.key === BREAK_ITEM.key ? 'topRight' : 'bottom'">
          <i
            class="wtp-seg"
            :class="{ 'is-dim': hoverKey && hoverKey !== i.key }"
            :style="{ flexGrow: i.ms, background: i.color }"
            @mouseenter="hoverOn(i)"
            @mouseleave="hoverOff"
          />
        </a-tooltip>
      </div>
      <div v-else class="wtp-empty">暂无数据</div>

      <div class="wtp-legend" role="table" aria-label="各工作类型人均时长">
        <a-tooltip v-for="i in perCapita.items" :key="i.key" :title="i.key === BREAK_ITEM.key ? i.tip : undefined" placement="topRight">
          <div
            class="wtp-li"
            :class="{ 'is-dim': hoverKey && hoverKey !== i.key, 'is-on': hoverKey === i.key }"
            role="row"
            @mouseenter="hoverOn(i)"
            @mouseleave="hoverOff"
          >
            <span class="wtp-sw" :style="{ background: i.color }" />
            <span class="wtp-ln" role="cell">{{ i.label }}</span>
            <span class="wtp-lh" role="cell">{{ i.hText }}h</span>
            <span class="wtp-lp" role="cell">{{ i.pText }}</span>
          </div>
        </a-tooltip>
      </div>

      <div class="wtp-tbl" role="table" aria-label="成员工作时长明细（小时）">
        <div class="wtp-thead" role="row" :style="{ gridTemplateColumns: gridCols }">
          <div class="wtp-th" role="columnheader">成员</div>
          <div class="wtp-th num" role="columnheader">合计</div>
          <div v-for="i in dist.items" :key="i.key" class="wtp-th num" role="columnheader">
            <span class="wtp-th-sw" :style="{ background: i.color }" />{{ i.label }}
          </div>
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
        </div>
        <div class="wtp-trow wtp-avg" role="row" :style="{ gridTemplateColumns: gridCols }">
          <div class="wtp-td wtp-td-name" role="cell">人均</div>
          <div class="wtp-td num strong" role="cell">{{ perCapita.total }}</div>
          <a-tooltip v-for="i in perCapita.items" :key="i.key" :title="i.key === BREAK_ITEM.key ? i.tip : undefined">
            <div class="wtp-td num" role="cell">{{ i.hText }}</div>
          </a-tooltip>
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

/* 时间筛选：样式照个人门户「我的效能」section-filters */
.section-filters {
  display: flex; align-items: center; flex-wrap: wrap; gap: 10px 12px;
  padding: 6px 10px; background: #f8fafc; border: 1px solid #eef2f7; border-radius: 10px;
}
.filter-item { display: inline-flex; align-items: center; gap: 8px; }
.filter-label { flex: none; font-size: 12px; font-weight: 500; color: #9ca3af; line-height: 1; }
.section-filters :deep(.ant-segmented) { background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 2px; }
.section-filters :deep(.ant-segmented-item-label) {
  font-size: 12px; font-weight: 500; color: #6b7280; line-height: 22px; min-height: 22px; padding: 0 10px;
}
.section-filters :deep(.ant-segmented-item-selected .ant-segmented-item-label) { color: #1a6fff; font-weight: 600; }
.section-filters :deep(.ant-segmented-item-selected) { box-shadow: 0 1px 2px rgba(26, 111, 255, 0.12); }
.range-picker { width: 168px; }
.range-picker :deep(.ant-picker) { border-radius: 8px; height: 28px; }
.range-picker :deep(.ant-picker-input > input) { font-size: 12px; color: #374151; font-weight: 500; }

.wtp-body { display: flex; flex-direction: column; gap: 12px; padding: 12px 16px 14px; }
.wtp-sum { display: flex; align-items: baseline; gap: 24px; flex-wrap: wrap; }
.wtp-stat { display: inline-flex; align-items: baseline; gap: 4px; font-variant-numeric: tabular-nums; }
.wtp-stat-l { font-size: 12px; color: #64748b; margin-right: 2px; }
.wtp-stat-v { font-size: 18px; font-weight: 700; color: #0f172a; }
.wtp-stat-u { font-size: 12px; color: #64748b; }
.wtp-stat :deep(.kpi-tip-wrap) { align-self: center; }

.wtp-bar { display: flex; gap: 2px; height: 14px; border-radius: 4px; overflow: hidden; }
.wtp-seg { display: block; min-width: 2px; height: 100%; flex-basis: 0; transition: opacity 0.15s; }
.wtp-seg.is-dim { opacity: 0.3; }
.wtp-seg:first-child { border-radius: 4px 0 0 4px; }
.wtp-seg:last-child { border-radius: 0 4px 4px 0; }
.wtp-empty { font-size: 12px; color: #9ca3af; padding: 4px 0; }

/* 图例一行：各项按内容宽度排开，余量均分到项间 */
.wtp-legend { display: flex; justify-content: space-between; gap: 6px; min-width: 0; }
.wtp-li {
  display: flex; align-items: center; gap: 3px; flex: none; padding: 2px; border-radius: 4px;
  font-size: 12px; white-space: nowrap; cursor: default; transition: opacity 0.15s, background 0.15s;
}
.wtp-li.is-dim { opacity: 0.4; }
.wtp-li.is-on { background: #f1f5f9; }
.wtp-sw { width: 10px; height: 10px; border-radius: 3px; flex: none; }
.wtp-ln { color: #374151; }
.wtp-lh { color: #0f172a; font-weight: 600; font-variant-numeric: tabular-nums; }
.wtp-lp { color: #64748b; font-variant-numeric: tabular-nums; }

/* 成员明细：沿用看板「组员明细」表格风格 */
.wtp-tbl { margin: 0 -16px -14px; overflow-x: auto; border-top: 1px solid #eef2f7; }
.wtp-thead, .wtp-trow { display: grid; align-items: center; }
.wtp-thead { background: #f8fafc; }
.wtp-th {
  display: flex; align-items: center; gap: 4px; padding: 8px 8px;
  font-size: 12px; font-weight: 600; color: #64748b; white-space: nowrap;
}
.wtp-th:first-child { padding-left: 16px; }
.wtp-th.num { justify-content: flex-end; }
.wtp-th-sw { width: 8px; height: 8px; border-radius: 2px; flex: none; }
.wtp-trow { border-bottom: 1px solid #f1f5f9; }
.wtp-trow:hover { background: #f9fafb; }
.wtp-td { display: flex; align-items: center; gap: 8px; padding: 10px 8px; font-size: 12px; color: #334155; }
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
