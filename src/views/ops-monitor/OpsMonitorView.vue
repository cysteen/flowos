<script setup lang="ts">
// 工单监控 —— 运营监控大盘的实时大盘 Tab
// 风险监控已按 D7a 拆出独立立项，组件见 RiskMonitorView.vue；本页只保留
// 「风险命中」两张指标卡 + 下钻入口，明细与打标全部在那边。
//
// 【设计逻辑：异常驱动，不是指标陈列】
// 监控岗一个班次 8 小时盯屏，绝大多数时间是没事的。所以这一页的组织方式是——
//   ① 先回答"要不要动手"：有事，异常自己跳到最上面并带处置入口；没事，页面是安静的一条绿。
//   ② 再回答"正不正常"：每个数字都配基线（较昨同刻）与走势，孤立数字无法判断好坏。
//   ③ 最后回答"是谁的问题"：一行一个班组的完整体检结论，不把同一个组的故事拆到几张表里。
// 监控岗只读，指的是不能改工单；「通知责任人」恰恰是这个岗位的核心动作，必须给。
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { message } from 'ant-design-vue';
import {
  ReloadOutlined,
  WarningFilled,
  CheckCircleFilled,
  NotificationOutlined,
  RightOutlined,
  RiseOutlined,
  FallOutlined,
} from '@ant-design/icons-vue';
import MetricTipIcon from '@/components/MetricTipIcon.vue';
import { opsTip } from '@/mock/opsMonitorTips';
import { useUserStore } from '@/stores/user';
import { RISK_TAG_ROLES } from '@/config/roles';
import {
  OPS_GROUPS,
  getOpsScopeSelectGroups,
  SOON_WINDOWS,
  OVERDUE_BUCKETS,
  TREND_GRAINS,
  ALERT_POLICY,
  getOpsSnapshot,
  getGroupLoads,
  getSlaMatrix,
  getTrend,
  trendPeaks,
  deriveIssues,
  riskTicketsBySoon,
  riskTicketsByBucket,
  type OpsScope,
  type DrillRow,
  type GroupVerdict,
  type OpsIssue,
  type OpsRiskTicket,
  type OverdueBucket,
  type SoonWindow,
  type TrendGrain,
} from '@/mock/opsMonitor';
import {
  QUALITY_METRICS,
  OVERALL_TIMELY,
  GROUP_SLA,
  RISK_LEVEL_STYLE,
  PIE_COLORS,
  MONTHLY_QUALITY,
  reportQualityTrend,
  type ReportGrain,
  QUALITY_TRENDS,
  businessLineShare,
  rateTone,
  riskHitsOf,
  untaggedHighRisks,
  type RiskHit,
  type RiskLevel,
} from '@/mock/opsReport';

// 风险监控已拆到 RiskMonitorView.vue（D7a）；本组件只服务「工单监控」，
// 'report' 是 915 P1 才开的运营报表 Tab（§12.3 X4），当前被 SHOW_REPORT_TAB 关着。
const props = withDefaults(defineProps<{ board?: 'ticket' | 'report' }>(), { board: 'ticket' });

const router = useRouter();
const user = useUserStore();

/** 915 P0 先隐藏运营报表，P1 再开 */
const SHOW_REPORT_TAB = false;
/** 915 P0 隐藏「此刻状态」KPI 行（与流量卡重复） */
const SHOW_KPI_PANEL = false;
/** 915 P0 隐藏「分组诊断」 */
const SHOW_DIAG_PANEL = false;

const scopeIds = ref<string[]>([]);
const scope = computed<OpsScope>(() => (scopeIds.value.length ? scopeIds.value : 'all'));
/** 915 P0 不含「值班状态 / 异常处置」条，P1 再开 */
const SHOW_DUTY_PANEL = false;
const scopeSelectGroups = getOpsScopeSelectGroups();
const isAllScope = computed(() => scopeIds.value.length === 0);
const scopeSelectedCount = computed(() => scopeIds.value.length);
function filterScopeOption(input: string, option: { label?: string }) {
  const q = input.trim().toLowerCase();
  if (!q) return true;
  return (option.label ?? '').toLowerCase().includes(q);
}
function setScopeAll() {
  scopeIds.value = [];
}
function setScopeSingle(groupId: string) {
  scopeIds.value = [groupId];
}
function scopeTagPlaceholder(omittedValues: unknown[]) {
  return `+${omittedValues.length} 组`;
}

const snap = computed(() => getOpsSnapshot(scope.value));
const loads = computed(() => getGroupLoads(scope.value));
const slaMatrix = computed(() => getSlaMatrix(scope.value));

const reportGrain = ref<ReportGrain>('week');
const reportTrend = computed(() => reportQualityTrend(reportGrain.value));

const diagBarMax = computed(() =>
  Math.max(...loads.value.map((g) => Math.max(g.backlog, g.overdue, g.soon2h)), 1),
);

const slaHeatMax = computed(() => {
  let max = 1;
  for (const row of slaMatrix.value) {
    for (const v of Object.values(row.soon)) max = Math.max(max, v);
    for (const v of Object.values(row.overdue)) max = Math.max(max, v);
  }
  return max;
});

// ---- 模块 2.3 风险词命中 ----
/** 本地打标记录：等级之外还要存备注、打标人、打标时刻 —— 留痕要求见 saveTag 上方注释 */
const localTags = ref<Record<string, { level: RiskLevel; note: string; by: string; at: string }>>({});
const hits = computed(() => riskHitsOf(scope.value));
const untagged = computed(() => untaggedHighRisks(scope.value).filter((h) => !localTags.value[h.id]));

const issues = computed(() =>
  deriveIssues(scope.value, untagged.value.length, untagged.value[0]?.word ?? ''),
);
const criticalCount = computed(() => issues.value.filter((i) => i.level === 'critical').length);

/**
 * 打标：字段枚举待业务确认，先按风险分级 + 备注落地。
 *
 * **打标必须留痕**（PRD §6.4「留痕」行：记录打标人、打标时刻、备注，供事后复盘）。
 * 早先这里只把等级存进 localTags，备注读进弹窗又丢掉、打标人与时刻根本不写 ——
 * 于是"谁在什么时候基于什么判断打了这个标"事后查不出来，复盘无从下手。
 */
const tagOpen = ref(false);
const tagTarget = ref<RiskHit | null>(null);
const tagLevel = ref<RiskLevel>('高');
const tagNote = ref('');

/** 谁能打标：运营监控岗 ＋ 投诉处理角色（PRD §6.4），其余角色不出打标入口 */
const canRiskTag = computed(() => RISK_TAG_ROLES.includes(user.roleKey));

function openTag(h: RiskHit) {
  if (!canRiskTag.value) {
    message.warning('只有运营监控岗与投诉处理角色可以打标');
    return;
  }
  tagTarget.value = h;
  tagLevel.value = h.tagged ?? h.level;
  tagNote.value = h.taggedNote ?? '';
  tagOpen.value = true;
}
function saveTag() {
  if (!tagTarget.value) return;
  if (!canRiskTag.value) { message.warning('无打标权限'); return; }
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  localTags.value = {
    ...localTags.value,
    [tagTarget.value.id]: {
      level: tagLevel.value,
      note: tagNote.value.trim(),
      by: user.current.name,
      // 与 mock 里既有的 taggedAt 同格式：YYYY-MM-DD HH:mm
      at: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
        + ` ${pad(now.getHours())}:${pad(now.getMinutes())}`,
    },
  };
  message.success(`已对 ${tagTarget.value.ticketNo} 打标「${tagLevel.value}风险」`);
  tagOpen.value = false;
}
function tagOf(h: RiskHit): RiskLevel | undefined {
  return localTags.value[h.id]?.level ?? h.tagged;
}
/** 事后复盘要看的三项：谁打的、什么时候打的、当时怎么判断的 */
function tagTraceOf(h: RiskHit): { by: string; at: string; note: string } | undefined {
  const local = localTags.value[h.id];
  if (local) return { by: local.by, at: local.at, note: local.note };
  if (h.tagged) return { by: h.taggedBy ?? '—', at: h.taggedAt ?? '—', note: h.taggedNote ?? '' };
  return undefined;
}


/** 3.1 饼图：用 stroke-dasharray 画环形，半径 25 → 周长 ≈ 157 */
const pieSegments = computed(() => {
  const rows = businessLineShare(scope.value);
  let acc = 0;
  return rows.map((r) => {
    const len = r.ratio * 157;
    const seg = { label: r.label, value: r.value, ratio: r.ratio, len, offset: -acc };
    acc += len;
    return seg;
  });
});

/** 60s 自动刷新；原型只更新时间戳，真实实现走接口轮询 */
const lastRefresh = ref('14:20:06');
let timer: number | undefined;
function refresh() {
  const d = new Date();
  lastRefresh.value = [d.getHours(), d.getMinutes(), d.getSeconds()]
    .map((n) => String(n).padStart(2, '0'))
    .join(':');
}
onMounted(() => {
  timer = window.setInterval(refresh, 60000);
  if (SHOW_DUTY_PANEL) {
    window.setTimeout(firePopup, 600);
  }
});
onBeforeUnmount(() => { if (timer) window.clearInterval(timer); });

/**
 * 弹窗告警（模块 2.2 / 2.3 明确要求"弹窗"）。
 * 与告警疲劳的调研并不冲突——采用**分级路由**：只有 critical 弹窗，warn 仅在值班状态区列出；
 * 确认后进入静默期，本次会话不再弹同一条。
 */
const popupOpen = ref(false);
const popupIssues = ref<OpsIssue[]>([]);
const silenced = ref<Set<string>>(new Set());

function firePopup() {
  const fresh = issues.value.filter((i) => i.level === 'critical' && !silenced.value.has(i.id));
  if (!fresh.length) return;
  popupIssues.value = fresh;
  popupOpen.value = true;
}
function ackPopup() {
  const next = new Set(silenced.value);
  popupIssues.value.forEach((i) => next.add(i.id));
  silenced.value = next;
  popupOpen.value = false;
  message.success(`已确认，${ALERT_POLICY.silenceMinutes} 分钟内不再重复弹窗`);
}
function popupGo(issue: OpsIssue) {
  popupOpen.value = false;
  handleIssue(issue);
}

// ---- 模块 1.4 多粒度曲线 ----
const grain = ref<TrendGrain>('day');
const trend = computed(() => getTrend(scope.value, grain.value));
const peaks = computed(() => trendPeaks(trend.value));

// ---- 处置动作：通知责任人（走消息通知引擎，留痕） ----
const notified = ref<Record<string, string>>({});
function notify(key: string, owner: string) {
  const d = new Date();
  notified.value = {
    ...notified.value,
    [key]: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
  };
  message.success(`已通知 ${owner}，通知记录已留痕`);
}

// ---- 走势图 ----
const CHART_W = 720;
const CHART_H = 160;
const GAUGE_C = 2 * Math.PI * 48;
const SPARK_W = 88;
const SPARK_H = 28;

function polyline(values: number[], min: number, max: number, w = CHART_W, h = CHART_H): string {
  if (values.length < 2) return '';
  const span = max - min || 1;
  const step = w / (values.length - 1);
  return values
    .map((v, i) => `${(i * step).toFixed(1)},${(h - ((v - min) / span) * h).toFixed(1)}`)
    .join(' ');
}

function areaPath(values: number[], min: number, max: number, w = CHART_W, h = CHART_H): string {
  if (values.length < 2) return '';
  const span = max - min || 1;
  const step = w / (values.length - 1);
  const pts = values.map((v, i) => {
    const x = (i * step).toFixed(1);
    const y = (h - ((v - min) / span) * h).toFixed(1);
    return `${x},${y}`;
  });
  return `M0,${h} L${pts.join(' L')} L${w},${h} Z`;
}

function chartPoint(values: number[], idx: number, min: number, max: number, w = CHART_W, h = CHART_H) {
  const span = max - min || 1;
  const step = w / (values.length - 1);
  return {
    x: idx * step,
    y: h - ((values[idx] - min) / span) * h,
  };
}

function sparkline(values: number[], w = SPARK_W, h = SPARK_H): string {
  if (values.length < 2) return '';
  return polyline(values, Math.min(...values), Math.max(...values), w, h);
}

function gaugeDash(pct: number, total = GAUGE_C) {
  const len = Math.min(1, Math.max(0, pct)) * total;
  return `${len.toFixed(1)} ${total.toFixed(1)}`;
}

function healthPct(value: number, healthy: number, unit: '%' | '分') {
  if (unit === '分') return Math.min(100, (value / 5) * 100);
  return Math.min(100, value);
}

const trendBounds = computed(() => {
  const all = trend.value.flatMap((p) => [p.inbound, p.forward, p.backlog]);
  return { min: Math.min(...all, 0), max: Math.max(...all) };
});

const backlogSpark = computed(() => {
  const vals = snap.value.trend.map((p) => p.backlog);
  return polyline(vals, Math.min(...vals), Math.max(...vals), SPARK_W, SPARK_H);
});

const backlogSparkArea = computed(() => {
  const vals = snap.value.trend.map((p) => p.backlog);
  return areaPath(vals, Math.min(...vals), Math.max(...vals), SPARK_W, SPARK_H);
});

const inboundPeak = computed(() => {
  const vals = trend.value.map((p) => p.inbound);
  let idx = 0;
  vals.forEach((v, i) => { if (v > vals[idx]) idx = i; });
  return { idx, point: chartPoint(vals, idx, trendBounds.value.min, trendBounds.value.max) };
});

const capGauge = computed(() => ({
  pct: snap.value.utilization,
  dash: gaugeDash(snap.value.utilization),
  color: utilColor(snap.value.utilization),
}));

const pieTotal = computed(() => pieSegments.value.reduce((s, r) => s + r.value, 0));

const reportTrendBounds = computed(() => {
  const d = reportTrend.value;
  const all = [...d.timely, ...d.contact, ...d.resolve];
  return { min: Math.min(...all) - 2, max: Math.max(...all) + 2 };
});

const timelyGaugeDash = computed(() => gaugeDash(OVERALL_TIMELY.value / 100));
const timelyGaugeColor = computed(() => rateTone(OVERALL_TIMELY.value).color);

// ---- 流量指标内联展开（点击卡面 → 下方饼图/柱图/进出曲线）----
type MetricKey = 'inbound' | 'forward' | 'backlog' | 'io';
type InboundDim = 'channel' | 'product' | 'type';
const activeMetric = ref<MetricKey>('inbound');

const INBOUND_DIMS: { key: InboundDim; label: string }[] = [
  { key: 'channel', label: '渠道' },
  { key: 'product', label: '产线' },
  { key: 'type', label: '类型' },
];

const FLOW_LIST_TITLE: Record<Exclude<MetricKey, 'io'>, string> = {
  inbound: '今日新增', forward: '今日下送', backlog: '积压',
};

/** 卡片主值 —— 下钻合计必须等于它（backlog 卡展示的是超时未处理完，不是在办存量） */
function metricTotal(metric: Exclude<MetricKey, 'io'>, s = snap.value): number {
  if (metric === 'inbound') return s.inbound;
  if (metric === 'forward') return s.forward;
  return s.overdueTotal;
}

function scaleRowsByTotal(rows: DrillRow[], total: number): DrillRow[] {
  if (!rows.length || total <= 0) return [];
  const sum = rows.reduce((s, r) => s + r.value, 0);
  if (!sum) return rows.map((r) => ({ ...r, value: 0, ratio: 0 }));
  let acc = 0;
  return rows.map((r, i) => {
    const value = i === rows.length - 1 ? total - acc : Math.round((r.value / sum) * total);
    acc += value;
    return { label: r.label, value, ratio: total ? value / total : 0 };
  });
}

function rowsForDim(metric: Exclude<MetricKey, 'io'>, dim: InboundDim, s = snap.value): DrillRow[] {
  const base =
    dim === 'product' ? s.inboundByProduct
    : dim === 'type' ? s.inboundByType
    : s.inboundByChannel;
  const safe = Array.isArray(base) ? base : [];
  if (metric === 'inbound') return safe;
  return scaleRowsByTotal(safe, metricTotal(metric, s));
}

/** 三维度并列面板数据 */
const metricDimPanels = computed(() => {
  const m = activeMetric.value;
  if (m === 'io') return [];
  return INBOUND_DIMS.map((d) => {
    const rows = rowsForDim(m, d.key);
    const barMax = rows.length ? Math.max(...rows.map((r) => r.value)) : 1;
    return { key: d.key, label: d.label, rows, barMax: barMax || 1 };
  });
});

const VBAR_W = 220;
const VBAR_PLOT_H = 82;
const VBAR_TOTAL_H = 118;
function vbarW(n: number) {
  const gap = 10;
  return n ? Math.max(14, (VBAR_W - gap * (n + 1)) / n) : 14;
}
function vbarX(i: number, n: number) {
  const gap = 10;
  const w = vbarW(n);
  return gap + i * (w + gap);
}
function vbarCenterX(i: number, n: number) {
  return vbarX(i, n) + vbarW(n) / 2;
}
function vbarHeight(value: number, max: number) {
  return max ? Math.max(4, (value / max) * (VBAR_PLOT_H - 10)) : 4;
}
function vbarTop(value: number, max: number) {
  return VBAR_PLOT_H - vbarHeight(value, max) - 1;
}
function vbarValY(value: number, max: number) {
  return Math.max(10, vbarTop(value, max) - 16);
}
function vbarPctY(value: number, max: number) {
  return Math.max(18, vbarTop(value, max) - 8);
}
function vbarLabel(label: string, n: number) {
  const maxLen = n > 4 ? 3 : 4;
  return label.length > maxLen ? `${label.slice(0, maxLen)}…` : label;
}

const expandTotal = computed(() =>
  activeMetric.value === 'io' ? 0 : metricTotal(activeMetric.value),
);

const ioTrend = computed(() => snap.value.trend);
const ioTrendBounds = computed(() => {
  const all = ioTrend.value.flatMap((p) => [p.inbound, p.forward]);
  if (!all.length) return { min: 0, max: 1 };
  return { min: Math.min(...all) * 0.92, max: Math.max(...all) * 1.06 };
});

const canGoTicketList = computed(() => user.canAccess('tickets'));

function toggleMetric(key: MetricKey) {
  activeMetric.value = key;
}

function focusMetric(key: MetricKey) {
  activeMetric.value = key;
}

function goFlowList(key: Exclude<MetricKey, 'io'>) {
  if (!canGoTicketList.value) {
    message.info('监控岗请从「时效分层」进入工单清单查证');
    return;
  }
  const label = `${FLOW_LIST_TITLE[key]} · ${snap.value.scopeLabel}`;
  router.push({
    path: '/query',
    query: {
      tab: 'tickets',
      scope: 'all',
      view: 'all',
      _from: `ops.flow.${key}`,
      _label: label,
    },
  });
}

const riskOpen = ref(false);
const riskTitle = ref('');
const riskRows = ref<OpsRiskTicket[]>([]);
const riskTotal = ref(0);

/**
 * 点热力格子**只开抽屉，不动监控范围**（2026-08-05 业务定）。
 * 盯屏的节奏是「扫全局 → 抽查一格 → 继续扫」，切范围会把用户按在某个组里，
 * 关掉抽屉还得手动清空才回得来。
 */
function openSoonList(win: SoonWindow, groupId?: string, count?: number) {
  const activeScope: OpsScope = groupId ?? scope.value;
  const gName = groupId
    ? OPS_GROUPS.find((g) => g.id === groupId)?.name ?? snap.value.scopeLabel
    : snap.value.scopeLabel;
  // 标题里的窗口写法必须与列头逐字一致，SOON_UI 是唯一来源。
  // 曾经这里取 SOON_WINDOWS.label（「≤2 小时」）而列头取 SOON_UI（「2 小时内」），
  // 同一个格子点开前后是两种叫法。
  riskTitle.value = `距超时 ${SOON_UI[win].time} · ${gName}`;
  riskRows.value = riskTicketsBySoon(activeScope, win);
  const row = groupId ? slaMatrix.value.find((r) => r.id === groupId) : undefined;
  riskTotal.value = count ?? row?.soon[win] ?? snap.value.soon[win];
  riskOpen.value = true;
}

/** 同 openSoonList：只开抽屉，不动监控范围 */
function openOverdueList(b: OverdueBucket, groupId?: string, count?: number) {
  const activeScope: OpsScope = groupId ?? scope.value;
  const gName = groupId
    ? OPS_GROUPS.find((g) => g.id === groupId)?.name ?? snap.value.scopeLabel
    : snap.value.scopeLabel;
  const ui = OVERDUE_UI[b];
  riskTitle.value = `${ui.sub} · ${ui.time} · ${gName}`;
  riskRows.value = riskTicketsByBucket(activeScope, b);
  const row = groupId ? slaMatrix.value.find((r) => r.id === groupId) : undefined;
  riskTotal.value = count ?? row?.overdue[b] ?? snap.value.overdue[b];
  riskOpen.value = true;
}

function barPct(val: number, max: number) {
  return Math.max(val > 0 ? 4 : 0, Math.round((val / max) * 100));
}

function slaHeatColor(value: number, max: number, kind: 'soon' | 'overdue', danger = false) {
  if (value === 0) return '#f8fafc';
  const t = max ? value / max : 0.5;
  if (kind === 'overdue') {
    if (danger) return `rgba(220, 38, 38, ${0.28 + t * 0.62})`;
    return `rgba(234, 88, 12, ${0.22 + t * 0.52})`;
  }
  return `rgba(217, 119, 6, ${0.18 + t * 0.48})`;
}

function slaCellText(value: number, max: number) {
  if (value === 0) return '#cbd5e1';
  return value >= max * 0.55 ? '#fff' : '#334155';
}

/** 状态条上的处置入口：每类异常直达对应清单/范围 */
function handleIssue(issue: OpsIssue) {
  if (issue.action === 'overdue-severe') return openOverdueList('gt72');
  if (issue.action === 'soon') return openSoonList('2h');
  if (issue.action === 'riskword') {
    document.querySelector('#risk-word-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }
  if (issue.action === 'group' && issue.groupId) {
    setScopeSingle(issue.groupId);
    return;
  }
  focusMetric('backlog');
}

function openTicket(no: string) {
  router.push(`/tickets/${no}`);
}

/**
 * 下钻到风险监控（D7a）：把当前监控范围带过去，不让人到了新页面再选一遍。
 * pending=true 时另预置「仅看待打标」。
 */
function goRiskMonitor(pending = false) {
  const query: Record<string, string> = {};
  if (scopeIds.value.length) query.scope = scopeIds.value.join(',');
  if (pending) query.pending = '1';
  router.push({ path: '/ops-monitor/risk', query });
}

// ---- 视觉映射 ----
const VERDICT_STYLE: Record<GroupVerdict, { color: string; bg: string }> = {
  人力不足: { color: '#b91c1c', bg: '#fee2e2' },
  时效恶化: { color: '#b45309', bg: '#fef3c7' },
  积压偏高: { color: '#1d4ed8', bg: '#dbeafe' },
  正常: { color: '#047857', bg: '#d1fae5' },
};
const PRIORITY_COLOR: Record<string, string> = {
  P0: '#EF4444', P1: '#F59E0B', P2: '#1A6FFF', P3: '#9CA3AF',
};

function utilColor(u: number) {
  if (u >= 1) return '#dc2626';
  if (u >= 0.9) return '#d97706';
  return '#059669';
}

/** 时效分层 · 界面文案（比 mock 枚举更易读） */
const SOON_UI: Record<SoonWindow, { time: string; sub: string }> = {
  '1h': { time: '1 小时内', sub: '将到 SLA' },
  '2h': { time: '2 小时内', sub: '将到 SLA' },
  '4h': { time: '4 小时内', sub: '将到 SLA' },
  '8h': { time: '8 小时内', sub: '将到 SLA' },
  '24h': { time: '24 小时内', sub: '将到 SLA' },
};

const OVERDUE_UI: Record<OverdueBucket, { time: string; sub: string }> = {
  le24: { time: '不足 1 天', sub: '刚超时' },
  le72: { time: '1–3 天', sub: '已超时' },
  gt72: { time: '超过 3 天', sub: '严重超时' },
};
</script>

<template>
  <div class="ops-monitor">
    <!-- 页头 -->
    <header class="monitor-header">
      <div class="head-left">
        <h1 class="head-title">{{ props.board === 'ticket' ? '工单监控' : '运营报表' }}</h1>
        <span class="head-tag">只读</span>
      </div>
    </header>

    <template v-if="props.board === 'ticket'">
      <!-- 监控顶栏：范围 + 刷新（大盘工具条，非操作台） -->
      <div class="monitor-bar">
        <div class="monitor-bar-left">
          <span class="monitor-bar-label">监控范围</span>
          <div class="monitor-scope-picker">
            <button
              type="button"
              class="monitor-scope-all-btn"
              :class="{ active: isAllScope }"
              @click="setScopeAll"
            >
              全中心
            </button>
            <a-select
              v-model:value="scopeIds"
              mode="multiple"
              show-search
              allow-clear
              size="small"
              :options="scopeSelectGroups"
              :filter-option="filterScopeOption"
              class="monitor-scope-select"
              :dropdown-match-select-width="false"
              placeholder="筛选班组（可多选）"
              :max-tag-count="1"
              :max-tag-placeholder="scopeTagPlaceholder"
            />
            <span class="monitor-scope-meta">
              {{ isAllScope ? `共 ${OPS_GROUPS.length} 组` : `已选 ${scopeSelectedCount} 组` }}
            </span>
          </div>
        </div>
        <div class="monitor-bar-right">
          <span class="live-badge"><i class="live-dot" />实时 · 60s</span>
          <span class="monitor-clock">{{ lastRefresh }}</span>
          <button type="button" class="monitor-refresh" title="刷新" @click="refresh">
            <ReloadOutlined />
          </button>
        </div>
      </div>

      <!-- ① 值班状态：915 不做，P1 再开 -->
      <template v-if="SHOW_DUTY_PANEL">
      <section v-if="issues.length" class="duty-panel alert">
        <div class="duty-head">
          <WarningFilled class="duty-ic" />
          <span class="duty-title">{{ issues.length }} 项需要处置</span>
          <span v-if="criticalCount" class="duty-count">{{ criticalCount }} 项紧急</span>
          <span class="duty-scope">{{ snap.scopeLabel }} · {{ lastRefresh }}</span>
        </div>
        <div class="issue-list">
          <div v-for="it in issues" :key="it.id" class="issue-row" :class="it.level">
            <i class="issue-dot" />
            <div class="issue-body">
              <div class="issue-title">{{ it.title }}</div>
              <div class="issue-detail">{{ it.detail }}</div>
            </div>
            <div class="issue-actions">
              <span class="issue-owner">责任人：{{ it.owner }}</span>
              <button type="button" class="ia-btn ghost" @click="handleIssue(it)">
                查看<RightOutlined class="ia-arrow" />
              </button>
              <span v-if="notified[it.id]" class="ia-done">已通知 {{ notified[it.id] }}</span>
              <button v-else type="button" class="ia-btn primary" @click="notify(it.id, it.owner)">
                <NotificationOutlined />通知
              </button>
            </div>
          </div>
        </div>
      </section>
      <section v-else class="duty-panel ok">
        <CheckCircleFilled class="duty-ic ok-ic" />
        <span class="duty-title">{{ snap.scopeLabel }}当前一切正常</span>
        <span class="duty-scope">
          积压 {{ snap.overdueTotal }}（阈值 {{ snap.threshold }}）· 无超 72 小时工单 · 各组人力充足
        </span>
      </section>
      </template>

      <!-- ② 流量指标带 -->
      <section class="panel dash-panel">
        <div class="dash-head">
          <div class="dash-head-main">
            <h2 class="dash-title">工单流量</h2>
            <p class="dash-formula dash-hint-inline">进出流量监控 · 点卡片展开渠道 / 产线 / 类型分布</p>
            <p class="dash-formula">
              今日 {{ snap.opening }} ＋ {{ snap.inbound }} − {{ snap.forward }} ＝ 在办存量 {{ snap.backlog.toLocaleString() }}<MetricTipIcon :tip="opsTip('workingStock')!" />
              <span class="note-sep">|</span>
              本月 {{ snap.monthOpening }} ＋ {{ snap.monthInbound.toLocaleString() }} − {{ snap.monthForward.toLocaleString() }} ＝ {{ snap.backlog.toLocaleString() }}
            </p>
          </div>
        </div>
        <div class="metric-strip">
          <div
            class="metric-tile drillable"
            :class="{ active: activeMetric === 'inbound' }"
            tabindex="0"
            @click="toggleMetric('inbound')"
            @keydown.enter.prevent="toggleMetric('inbound')"
          >
            <div class="mt-label">新增工单<MetricTipIcon :tip="opsTip('inbound')!" /></div>
            <div class="mt-value-row">
              <span class="mt-value">{{ snap.inbound.toLocaleString() }}</span>
              <span class="mt-unit">当日</span>
            </div>
            <div class="mt-sub">本月累计 {{ snap.monthInbound.toLocaleString() }}</div>
          </div>

          <div
            class="metric-tile drillable"
            :class="{ active: activeMetric === 'forward' }"
            tabindex="0"
            @click="toggleMetric('forward')"
            @keydown.enter.prevent="toggleMetric('forward')"
          >
            <div class="mt-label">下送工单<MetricTipIcon :tip="opsTip('forward')!" /></div>
            <div class="mt-value-row">
              <span class="mt-value">{{ snap.forward.toLocaleString() }}</span>
              <span class="mt-unit">当日</span>
            </div>
            <div class="mt-sub">本月累计 {{ snap.monthForward.toLocaleString() }}</div>
          </div>

          <div
            class="metric-tile drillable"
            :class="{ 'is-alert': snap.alerting, active: activeMetric === 'backlog' }"
            tabindex="0"
            @click="toggleMetric('backlog')"
            @keydown.enter.prevent="toggleMetric('backlog')"
          >
            <!--
              「积压」＝ 超解决时效且仍未处理完（＝下方时效分层三个超时桶合计），
              与《【915】班组长看板》同口径同名（2026-08-05 业务定）。
              在办存量 755 在上方守恒式里给，两者差一个数量级，不可互校。
            -->
            <div class="mt-label">积压<MetricTipIcon :tip="opsTip('backlog')!" /></div>
            <div class="mt-value-row">
              <span class="mt-value" :class="{ danger: snap.alerting }">{{ snap.overdueTotal.toLocaleString() }}</span>
              <span class="mt-unit">此刻</span>
            </div>
            <div class="mt-sub">
              超解决时效未处理完 · 其中超 3 天
              <b :class="snap.overdue.gt72 > 0 ? 'up' : 'down'">{{ snap.overdue.gt72 }}</b>
              · 阈值 {{ snap.threshold }}
            </div>
          </div>

          <div
            class="metric-tile drillable"
            :class="{ active: activeMetric === 'io' }"
            tabindex="0"
            @click="toggleMetric('io')"
            @keydown.enter.prevent="toggleMetric('io')"
          >
            <div class="mt-label">进出比<MetricTipIcon :tip="opsTip('io')!" /></div>
            <div class="mt-value-row">
              <span class="mt-value" :class="{ warn: snap.ioRatio > 1 }">{{ snap.ioRatio }}</span>
              <span class="mt-unit">进÷出</span>
            </div>
            <div class="mt-sub mt-sub-em">
              {{ snap.ioRatio > 1 ? '进大于出，积压在涨' : '出大于进，正在消化' }}
            </div>
            <div class="mt-foot">最久等待 {{ snap.longestWaitText }}<MetricTipIcon :tip="opsTip('longestWait')!" /></div>
          </div>
        </div>

        <div class="metric-expand">
          <div v-if="activeMetric !== 'io'" class="me-body">
            <div class="me-dims-grid">
              <div v-for="panel in metricDimPanels" :key="panel.key" class="me-dim-col">
                <h4 class="me-dim-title">{{ panel.label }}</h4>
                <svg class="me-vchart" :viewBox="`0 0 ${VBAR_W} ${VBAR_TOTAL_H}`" preserveAspectRatio="xMidYMid meet">
                  <line :x1="0" :y1="VBAR_PLOT_H - 1" :x2="VBAR_W" :y2="VBAR_PLOT_H - 1" class="me-vbase" />
                  <g v-for="(r, i) in panel.rows" :key="r.label" class="me-vgroup">
                    <rect
                      class="me-vbar"
                      :x="vbarX(i, panel.rows.length)"
                      :y="vbarTop(r.value, panel.barMax)"
                      :width="vbarW(panel.rows.length)"
                      :height="vbarHeight(r.value, panel.barMax)"
                      :fill="PIE_COLORS[i % PIE_COLORS.length]"
                      rx="2"
                    />
                    <text
                      class="me-vval"
                      :x="vbarCenterX(i, panel.rows.length)"
                      :y="vbarValY(r.value, panel.barMax)"
                      text-anchor="middle"
                    >{{ r.value.toLocaleString() }}</text>
                    <text
                      class="me-vpct"
                      :x="vbarCenterX(i, panel.rows.length)"
                      :y="vbarPctY(r.value, panel.barMax)"
                      text-anchor="middle"
                    >{{ Math.round(r.ratio * 100) }}%</text>
                    <text
                      class="me-vname"
                      :x="vbarCenterX(i, panel.rows.length)"
                      :y="VBAR_PLOT_H + 13"
                      text-anchor="middle"
                      :title="r.label"
                    >{{ vbarLabel(r.label, panel.rows.length) }}</text>
                  </g>
                </svg>
              </div>
            </div>
            <div class="me-foot">
              <button
                v-if="canGoTicketList"
                type="button"
                class="me-go"
                @click="goFlowList(activeMetric)"
              >
                在工单工作台查看这 {{ expandTotal.toLocaleString() }} 单 →
              </button>
              <p v-else class="me-note">监控岗为只读视图，请从「时效分层」进入工单清单查证。</p>
            </div>
          </div>

          <div v-else class="me-body me-io">
            <div class="legend me-legend">
              <span class="lg lg-in">进线</span>
              <span class="lg lg-out">下送</span>
              <span class="legend-unit">每小时</span>
            </div>
            <svg class="chart chart-md" :viewBox="`0 0 ${CHART_W} ${CHART_H}`" preserveAspectRatio="none">
              <defs>
                <linearGradient id="grad-io-in" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stop-color="#475569" stop-opacity="0.18" />
                  <stop offset="100%" stop-color="#475569" stop-opacity="0" />
                </linearGradient>
                <linearGradient id="grad-io-out" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stop-color="#059669" stop-opacity="0.14" />
                  <stop offset="100%" stop-color="#059669" stop-opacity="0" />
                </linearGradient>
              </defs>
              <line
                v-for="i in 4"
                :key="'io-g' + i"
                :x1="0"
                :y1="(CHART_H / 4) * i"
                :x2="CHART_W"
                :y2="(CHART_H / 4) * i"
                class="chart-grid"
              />
              <path
                :d="areaPath(ioTrend.map((p) => p.inbound), ioTrendBounds.min, ioTrendBounds.max)"
                fill="url(#grad-io-in)"
              />
              <path
                :d="areaPath(ioTrend.map((p) => p.forward), ioTrendBounds.min, ioTrendBounds.max)"
                fill="url(#grad-io-out)"
              />
              <polyline
                :points="polyline(ioTrend.map((p) => p.inbound), ioTrendBounds.min, ioTrendBounds.max)"
                fill="none" stroke="#475569" stroke-width="2.5"
              />
              <polyline
                :points="polyline(ioTrend.map((p) => p.forward), ioTrendBounds.min, ioTrendBounds.max)"
                fill="none" stroke="#059669" stroke-width="2"
              />
            </svg>
            <div class="axis me-axis">
              <span v-for="p in ioTrend" :key="p.t" class="axis-t">{{ p.t }}</span>
            </div>
          </div>
        </div>
      </section>

      <!-- 流量走势（工单监控 · 进出趋势） -->
      <section class="panel dash-panel">
        <div class="dash-head">
          <h2 class="dash-title">流量走势<MetricTipIcon :tip="opsTip('trendStock')!" /></h2>
          <div class="grain-row">
            <span v-if="peaks.peak" class="peak-note">
              高峰 {{ peaks.peak.t }}（{{ peaks.peak.inbound.toLocaleString() }}）·
              低谷 {{ peaks.valley?.t }}（{{ peaks.valley?.inbound.toLocaleString() }}）
            </span>
            <button
              v-for="g in TREND_GRAINS"
              :key="g.key"
              type="button"
              class="grain-chip"
              :class="{ active: grain === g.key }"
              :title="g.unit"
              @click="grain = g.key"
            >
              {{ g.label }}
            </button>
          </div>
        </div>
        <div class="chart-wrap chart-pro">
          <div class="legend">
            <span class="lg lg-in">进线</span><span class="lg lg-out">下送</span><span class="lg lg-bl">积压</span>
            <span class="legend-unit">{{ TREND_GRAINS.find((g) => g.key === grain)?.unit }}</span>
          </div>
          <svg class="chart chart-lg" :viewBox="`0 0 ${CHART_W} ${CHART_H}`" preserveAspectRatio="none">
            <defs>
              <linearGradient id="grad-in" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#475569" stop-opacity="0.22" />
                <stop offset="100%" stop-color="#475569" stop-opacity="0" />
              </linearGradient>
              <linearGradient id="grad-out" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#059669" stop-opacity="0.18" />
                <stop offset="100%" stop-color="#059669" stop-opacity="0" />
              </linearGradient>
              <linearGradient id="grad-bl" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#d97706" stop-opacity="0.14" />
                <stop offset="100%" stop-color="#d97706" stop-opacity="0" />
              </linearGradient>
            </defs>
            <line
              v-for="i in 4"
              :key="'g' + i"
              :x1="0"
              :y1="(CHART_H / 4) * i"
              :x2="CHART_W"
              :y2="(CHART_H / 4) * i"
              class="chart-grid"
            />
            <path
              :d="areaPath(trend.map((p) => p.inbound), trendBounds.min, trendBounds.max)"
              fill="url(#grad-in)"
            />
            <path
              :d="areaPath(trend.map((p) => p.forward), trendBounds.min, trendBounds.max)"
              fill="url(#grad-out)"
            />
            <path
              :d="areaPath(trend.map((p) => p.backlog), trendBounds.min, trendBounds.max)"
              fill="url(#grad-bl)"
            />
            <polyline
              :points="polyline(trend.map((p) => p.inbound), trendBounds.min, trendBounds.max)"
              fill="none" stroke="#475569" stroke-width="2.5"
            />
            <polyline
              :points="polyline(trend.map((p) => p.forward), trendBounds.min, trendBounds.max)"
              fill="none" stroke="#059669" stroke-width="2"
            />
            <polyline
              :points="polyline(trend.map((p) => p.backlog), trendBounds.min, trendBounds.max)"
              fill="none" stroke="#d97706" stroke-width="2" stroke-dasharray="5 4"
            />
            <g v-if="peaks.peak">
              <circle
                :cx="inboundPeak.point.x"
                :cy="inboundPeak.point.y"
                r="4"
                fill="#475569"
                stroke="#fff"
                stroke-width="2"
              />
              <text
                :x="inboundPeak.point.x"
                :y="Math.max(14, inboundPeak.point.y - 10)"
                class="peak-label"
                text-anchor="middle"
              >峰 {{ peaks.peak.t }}</text>
            </g>
          </svg>
          <div class="axis">
            <span v-for="p in trend" :key="p.t" class="axis-t">{{ grain === 'day' ? p.t.slice(0, 2) : p.t }}</span>
          </div>
        </div>
      </section>

      <div class="dash-stack">
        <section v-if="SHOW_KPI_PANEL" class="panel dash-panel">
          <div class="dash-head compact">
            <h2 class="dash-title">此刻状态</h2>
            <span class="dash-hint">较昨日同刻 · 容量视角</span>
          </div>
          <div class="kpi-row">
            <div class="kpi-cell">
              <div class="kpi-label">当前积压</div>
              <div class="kpi-value" :class="{ danger: snap.alerting }">{{ snap.backlog }}</div>
              <div class="kpi-meta">
                <span :class="snap.vsYesterday > 0 ? 'up' : 'down'">
                  <component :is="snap.vsYesterday > 0 ? RiseOutlined : FallOutlined" />
                  {{ snap.vsYesterday > 0 ? '+' : '' }}{{ snap.vsYesterday }}
                  （{{ snap.vsYesterdayPct > 0 ? '+' : '' }}{{ Math.round(snap.vsYesterdayPct * 100) }}%）
                </span>
                昨同刻 {{ snap.yesterdayBacklog }}
              </div>
              <svg class="kpi-spark" viewBox="0 0 88 28" preserveAspectRatio="none">
                <path :d="backlogSparkArea" :fill="snap.alerting ? 'rgba(239,68,68,0.12)' : 'rgba(71,85,105,0.12)'" />
                <polyline :points="backlogSpark" fill="none" :stroke="snap.alerting ? '#ef4444' : '#475569'" stroke-width="1.5" />
              </svg>
            </div>
            <div class="kpi-cell">
              <div class="kpi-label">在岗二线</div>
              <div class="kpi-value">{{ snap.headcount }}<span class="kpi-unit">人</span></div>
              <div class="kpi-meta">人均在办 <b>{{ snap.perHead }}</b> · 已满 <b class="up">{{ snap.atCapacity }}</b> 人</div>
            </div>
            <div class="kpi-cell kpi-cell-gauge">
              <div class="kpi-label">仍可接单</div>
              <div class="kpi-gauge-wrap">
                <svg class="kpi-gauge" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r="42" fill="none" stroke="#e8ecf1" stroke-width="8" />
                  <circle
                    cx="50" cy="50" r="42" fill="none"
                    :stroke="capGauge.color" stroke-width="8" stroke-linecap="round"
                    :stroke-dasharray="capGauge.dash"
                    transform="rotate(-90 50 50)"
                  />
                </svg>
                <div class="kpi-gauge-center">
                  <span class="kpi-value" :class="{ danger: snap.available === 0, warn: snap.available > 0 && snap.available <= 3 }">
                    {{ snap.available }}
                  </span>
                  <span class="kpi-unit">人</span>
                </div>
              </div>
              <div class="kpi-meta">
                容量利用 <b :style="{ color: utilColor(snap.utilization) }">{{ Math.round(snap.utilization * 100) }}%</b>
                （{{ snap.backlog }}/{{ snap.capacity }}）
              </div>
            </div>
          </div>
        </section>

        <section class="panel dash-panel now-sla">
          <div class="dash-head compact">
            <h2 class="dash-title">即将超期监控<MetricTipIcon :tip="opsTip('soon')!" /></h2>
            <span class="dash-hint">时效分层 · 班组 × 分桶热力 · 点击格子查清单</span>
          </div>
          <div class="sla-heatmap-wrap">
            <div class="sla-heat-legend">
              <span class="shl-item"><i class="shl-swatch soon" />还没超时（累计）</span>
              <span class="shl-sep">|</span>
              <span class="shl-item"><i class="shl-swatch overdue" />已经超时（互斥）</span>
              <span class="shl-scale">色越深单量越多</span>
            </div>
            <div class="sla-heatmap" role="grid">
              <div class="sh-row sh-head" role="row">
                <div class="sh-corner" role="columnheader">班组</div>
                <div class="sh-group-label soon" :style="{ gridColumn: `span ${SOON_WINDOWS.length}` }">还没超时 · 距 SLA 截止<MetricTipIcon :tip="opsTip('soon')!" /></div>
                <div class="sh-split" aria-hidden="true" />
                <div class="sh-group-label overdue" :style="{ gridColumn: `span ${OVERDUE_BUCKETS.length}` }">已经超时<MetricTipIcon :tip="opsTip('overdueGt72')!" /></div>
              </div>
              <div class="sh-row sh-subhead" role="row">
                <div class="sh-corner" />
                <div
                  v-for="w in SOON_WINDOWS"
                  :key="'h-soon-' + w.key"
                  class="sh-col-head soon"
                  role="columnheader"
                >{{ SOON_UI[w.key].time }}</div>
                <div class="sh-split" aria-hidden="true" />
                <div
                  v-for="b in OVERDUE_BUCKETS"
                  :key="'h-over-' + b.key"
                  class="sh-col-head overdue"
                  :class="{ danger: b.danger }"
                  role="columnheader"
                >{{ OVERDUE_UI[b.key].time }}</div>
              </div>
              <div
                v-for="row in slaMatrix"
                :key="row.id"
                class="sh-row sh-body"
                role="row"
              >
                <div class="sh-row-label" role="rowheader">{{ row.name }}</div>
                <button
                  v-for="w in SOON_WINDOWS"
                  :key="row.id + '-s-' + w.key"
                  type="button"
                  class="sh-cell soon"
                  :style="{
                    background: slaHeatColor(row.soon[w.key], slaHeatMax, 'soon'),
                    color: slaCellText(row.soon[w.key], slaHeatMax),
                  }"
                  :title="`${row.name} · ${SOON_UI[w.key].time} · ${row.soon[w.key]} 单`"
                  @click="openSoonList(w.key, row.id, row.soon[w.key])"
                >{{ row.soon[w.key] || '·' }}</button>
                <div class="sh-split body" aria-hidden="true" />
                <button
                  v-for="b in OVERDUE_BUCKETS"
                  :key="row.id + '-o-' + b.key"
                  type="button"
                  class="sh-cell overdue"
                  :class="{ danger: b.danger }"
                  :style="{
                    background: slaHeatColor(row.overdue[b.key], slaHeatMax, 'overdue', b.danger),
                    color: slaCellText(row.overdue[b.key], slaHeatMax),
                  }"
                  :title="`${row.name} · ${OVERDUE_UI[b.key].time} · ${row.overdue[b.key]} 单`"
                  @click="openOverdueList(b.key, row.id, row.overdue[b.key])"
                >{{ row.overdue[b.key] || '·' }}</button>
              </div>
            </div>
          </div>
        </section>
      </div>

      <!--
        风险命中 —— 只留两张指标卡 + 下钻入口（D7a）
        明细表、打标弹窗、预警词表抽屉已随模块四拆出，全部搬到「风险监控」页。
        大盘其余模块都是只读指标，只有风险带写动作；写动作寄居在只读页里长不出闭环。
      -->
      <section class="panel dash-panel">
        <div class="dash-head compact">
          <h2 class="dash-title">风险命中<MetricTipIcon :tip="opsTip('riskHits')!" /></h2>
          <button type="button" class="row-btn" @click="goRiskMonitor()">
            进入风险监控<RightOutlined />
          </button>
        </div>
        <div class="risk-brief">
          <button type="button" class="rb-card" @click="goRiskMonitor()">
            <span class="rb-label">命中条数</span>
            <span class="rb-num">{{ hits.length }}</span>
            <span class="rb-sub">近 24h · 实时 60s</span>
          </button>
          <button type="button" class="rb-card" :class="{ warn: untagged.length > 0 }" @click="goRiskMonitor(true)">
            <span class="rb-label">待打标（高危）<MetricTipIcon :tip="opsTip('riskUntagged')!" /></span>
            <span class="rb-num">{{ untagged.length }}</span>
            <span class="rb-sub">未核实的高危命中</span>
          </button>
        </div>
      </section>

      <!-- 分组诊断 · 横向对比 -->
      <section v-if="SHOW_DIAG_PANEL" class="panel dash-panel">
        <div class="dash-head compact">
          <h2 class="dash-title">分组诊断</h2>
          <span class="dash-hint">横向对比 · 点行切换监控范围</span>
        </div>
        <div class="diag-bars">
          <div class="db-legend">
            <span class="db-lg"><i class="db-dot bl" />积压</span>
            <span class="db-lg"><i class="db-dot od" />超时</span>
            <span class="db-lg"><i class="db-dot sv" />距超时 2h</span>
            <span class="db-lg"><i class="db-dot ut" />容量利用</span>
          </div>
          <div
            v-for="g in loads"
            :key="g.id"
            class="diag-bar-row"
            :class="{ bad: g.verdict !== '正常' }"
            @click="setScopeSingle(g.id)"
          >
            <div class="db-head">
              <span class="db-name">{{ g.name }}</span>
              <span
                class="verdict"
                :style="{ color: VERDICT_STYLE[g.verdict].color, background: VERDICT_STYLE[g.verdict].bg }"
                :title="g.verdictWhy"
              >{{ g.verdict }}</span>
              <span class="db-meta">在岗 {{ g.headcount }} · 可接 <b :class="{ zero: g.available === 0 }">{{ g.available }}</b></span>
              <div class="db-actions" @click.stop>
                <span v-if="notified['hr-' + g.id]" class="row-done">已通知</span>
                <button
                  v-else-if="g.verdict !== '正常'"
                  type="button"
                  class="row-btn"
                  @click="notify('hr-' + g.id, g.name + '组长')"
                >通知组长</button>
              </div>
            </div>
            <div class="db-chart">
              <div class="db-bar-line">
                <span class="db-bar-label">积压</span>
                <div class="db-bar-track">
                  <div class="db-bar-fill fill-bl" :style="{ width: barPct(g.backlog, diagBarMax) + '%' }" />
                </div>
                <span class="db-bar-val">{{ g.backlog }}</span>
              </div>
              <div class="db-bar-line">
                <span class="db-bar-label">超时</span>
                <div class="db-bar-track">
                  <div class="db-bar-fill fill-od" :style="{ width: barPct(g.overdue, diagBarMax) + '%' }" />
                  <div
                    v-if="g.overdueSevere > 0"
                    class="db-bar-mark"
                    :style="{ left: barPct(g.overdueSevere, diagBarMax) + '%' }"
                    title="其中 >72h"
                  />
                </div>
                <span class="db-bar-val">{{ g.overdue }}<small v-if="g.overdueSevere">/{{ g.overdueSevere }}</small></span>
              </div>
              <div class="db-bar-line">
                <span class="db-bar-label">2h内</span>
                <div class="db-bar-track">
                  <div class="db-bar-fill fill-sv" :style="{ width: barPct(g.soon2h, diagBarMax) + '%' }" />
                </div>
                <span class="db-bar-val">{{ g.soon2h }}</span>
              </div>
              <div class="db-bar-line">
                <span class="db-bar-label">容量</span>
                <div class="db-bar-track">
                  <div
                    class="db-bar-fill fill-ut"
                    :style="{ width: Math.min(100, g.utilization * 100) + '%', background: utilColor(g.utilization) }"
                  />
                  <div class="db-bar-bench" style="left: 90%" title="预警线 90%" />
                  <div class="db-bar-bench danger" style="left: 100%" title="满载 100%" />
                </div>
                <span class="db-bar-val" :style="{ color: utilColor(g.utilization) }">{{ Math.round(g.utilization * 100) }}%</span>
              </div>
            </div>
          </div>
        </div>
      </section>

    </template>


    <!-- Tab② 运营报表（模块 3） -->
    <template v-else-if="SHOW_REPORT_TAB && props.board === 'report'">
      <div class="monitor-bar">
        <div class="monitor-bar-left">
          <span class="monitor-bar-label">监控范围</span>
          <div class="monitor-scope-picker">
            <button
              type="button"
              class="monitor-scope-all-btn"
              :class="{ active: isAllScope }"
              @click="setScopeAll"
            >
              全中心
            </button>
            <a-select
              v-model:value="scopeIds"
              mode="multiple"
              show-search
              allow-clear
              size="small"
              :options="scopeSelectGroups"
              :filter-option="filterScopeOption"
              class="monitor-scope-select"
              :dropdown-match-select-width="false"
              placeholder="筛选班组（可多选）"
              :max-tag-count="1"
              :max-tag-placeholder="scopeTagPlaceholder"
            />
            <span class="monitor-scope-meta">
              {{ isAllScope ? `共 ${OPS_GROUPS.length} 组` : `已选 ${scopeSelectedCount} 组` }}
            </span>
          </div>
        </div>
        <span class="report-note">对比口径：今日 vs 昨日同期 vs 上周同期</span>
      </div>

      <!-- 质量走势（周 / 月可切换） -->
      <section class="panel dash-panel">
        <div class="dash-head compact">
          <h2 class="dash-title">质量走势</h2>
          <div class="grain-row">
            <button
              type="button"
              class="grain-chip"
              :class="{ active: reportGrain === 'week' }"
              @click="reportGrain = 'week'"
            >近 7 日</button>
            <button
              type="button"
              class="grain-chip"
              :class="{ active: reportGrain === 'month' }"
              @click="reportGrain = 'month'"
            >近 4 周</button>
          </div>
        </div>
        <div class="chart-wrap chart-pro report-trend">
          <div class="legend">
            <span class="lg lg-in">解决及时率</span>
            <span class="lg lg-out">24h 联络率</span>
            <span class="lg lg-bl">解决率</span>
            <span class="legend-unit">{{ reportGrain === 'week' ? '日粒度' : '周粒度' }}</span>
          </div>
          <svg class="chart chart-lg" viewBox="0 0 720 160" preserveAspectRatio="none">
            <defs>
              <linearGradient id="grad-qt" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#334155" stop-opacity="0.2" />
                <stop offset="100%" stop-color="#334155" stop-opacity="0" />
              </linearGradient>
            </defs>
            <line v-for="i in 4" :key="'rg' + i" :x1="0" :y1="40 * i" :x2="720" :y2="40 * i" class="chart-grid" />
            <line
              x1="0"
              :y1="160 - ((95 - reportTrendBounds.min) / (reportTrendBounds.max - reportTrendBounds.min)) * 160"
              x2="720"
              :y2="160 - ((95 - reportTrendBounds.min) / (reportTrendBounds.max - reportTrendBounds.min)) * 160"
              class="chart-bench"
            />
            <path :d="areaPath(reportTrend.timely, reportTrendBounds.min, reportTrendBounds.max)" fill="url(#grad-qt)" />
            <polyline :points="polyline(reportTrend.timely, reportTrendBounds.min, reportTrendBounds.max)" fill="none" stroke="#334155" stroke-width="2.5" />
            <polyline :points="polyline(reportTrend.contact, reportTrendBounds.min, reportTrendBounds.max)" fill="none" stroke="#059669" stroke-width="2" />
            <polyline :points="polyline(reportTrend.resolve, reportTrendBounds.min, reportTrendBounds.max)" fill="none" stroke="#d97706" stroke-width="2" stroke-dasharray="5 4" />
          </svg>
          <div class="axis">
            <span v-for="l in reportTrend.labels" :key="l" class="axis-t">{{ l }}</span>
          </div>
        </div>
      </section>

      <!-- 3.2 整体解决及时率 + 3.3 质量四率（含 3.4 同环比） -->
      <section class="panel dash-panel">
        <div class="dash-head compact">
          <h2 class="dash-title">质量指标</h2>
          <span class="dash-hint">低于健康线标黄；同环比向下标红</span>
        </div>
        <div class="report-hero">
          <div class="gauge-panel">
            <svg class="gauge-svg" viewBox="0 0 120 120">
              <circle cx="60" cy="60" r="48" fill="none" stroke="#e8ecf1" stroke-width="9" />
              <circle
                cx="60" cy="60" r="48" fill="none"
                :stroke="timelyGaugeColor" stroke-width="9" stroke-linecap="round"
                :stroke-dasharray="timelyGaugeDash"
                transform="rotate(-90 60 60)"
              />
            </svg>
            <div class="gauge-center">
              <span class="gauge-val" :style="{ color: timelyGaugeColor }">{{ OVERALL_TIMELY.value }}<small>%</small></span>
              <span class="gauge-lbl">{{ OVERALL_TIMELY.label }}</span>
              <span class="gauge-health">健康线 {{ OVERALL_TIMELY.healthy }}%</span>
            </div>
            <svg class="gauge-spark" viewBox="0 0 88 28" preserveAspectRatio="none">
              <polyline :points="sparkline(QUALITY_TRENDS.overall)" fill="none" :stroke="timelyGaugeColor" stroke-width="1.5" opacity="0.7" />
            </svg>
            <div class="q-cmp gauge-cmp">
              <span :class="OVERALL_TIMELY.value >= OVERALL_TIMELY.yesterday ? 'down' : 'up'">
                昨日 {{ (OVERALL_TIMELY.value - OVERALL_TIMELY.yesterday).toFixed(1) }}
              </span>
              <span class="dot">·</span>
              <span :class="OVERALL_TIMELY.value >= OVERALL_TIMELY.lastWeek ? 'down' : 'up'">
                上周 {{ (OVERALL_TIMELY.value - OVERALL_TIMELY.lastWeek).toFixed(1) }}
              </span>
            </div>
          </div>
          <div class="quality-grid quality-grid-side">
            <div v-for="q in QUALITY_METRICS" :key="q.key" class="quality-cell">
              <div class="q-label">{{ q.label }}<span class="q-tip" :title="q.tip">?</span></div>
              <div class="q-value" :class="{ warn: q.value < q.healthy }">
                {{ q.value }}<span class="q-unit">{{ q.unit }}</span>
              </div>
              <div class="q-bar-wrap">
                <div class="q-bar-track">
                  <div
                    class="q-bar-fill"
                    :class="{ warn: q.value < q.healthy }"
                    :style="{ width: healthPct(q.value, q.healthy, q.unit) + '%' }"
                  />
                  <div class="q-bar-mark" :style="{ left: healthPct(q.healthy, q.healthy, q.unit) + '%' }" />
                </div>
              </div>
              <svg class="q-spark" viewBox="0 0 88 28" preserveAspectRatio="none">
                <polyline
                  :points="sparkline(QUALITY_TRENDS[q.key] ?? QUALITY_TRENDS.overall)"
                  fill="none"
                  :stroke="q.value < q.healthy ? '#d97706' : '#64748b'"
                  stroke-width="1.5"
                />
              </svg>
              <div class="q-cmp">
                <span :class="q.value >= q.yesterday ? 'down' : 'up'">
                  昨 {{ (q.value - q.yesterday).toFixed(1) }}
                </span>
                <span class="dot">·</span>
                <span :class="q.value >= q.lastWeek ? 'down' : 'up'">
                  周 {{ (q.value - q.lastWeek).toFixed(1) }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div class="report-row">
        <!-- 3.1 各业务线占比 -->
        <section class="panel dash-panel">
          <div class="dash-head compact">
            <h2 class="dash-title">业务线工单占比</h2>
            <span class="dash-hint">与实时大盘产线下钻同源</span>
          </div>
          <div class="report-body">
            <div class="pie-wrap">
              <div class="pie-chart">
                <svg class="pie" viewBox="0 0 100 100">
                  <circle
                    v-for="(seg, i) in pieSegments"
                    :key="seg.label"
                    class="pie-seg"
                    cx="50" cy="50" r="25"
                    :stroke="PIE_COLORS[i % PIE_COLORS.length]"
                    :stroke-dasharray="`${seg.len} ${157 - seg.len}`"
                    :stroke-dashoffset="seg.offset"
                  />
                </svg>
                <div class="pie-center">
                  <span class="pie-total">{{ pieTotal.toLocaleString() }}</span>
                  <span class="pie-total-lbl">今日新增</span>
                </div>
              </div>
              <div class="pie-legend">
                <div v-for="(seg, i) in pieSegments" :key="seg.label" class="pl-row">
                  <i class="pl-dot" :style="{ background: PIE_COLORS[i % PIE_COLORS.length] }" />
                  <span class="pl-label">{{ seg.label }}</span>
                  <span class="pl-value">{{ seg.value.toLocaleString() }}</span>
                  <span class="pl-pct">{{ Math.round(seg.ratio * 100) }}%</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- 3.2 各班组时效达成率对比 -->
        <section class="panel dash-panel">
          <div class="dash-head compact">
            <h2 class="dash-title">班组时效达成率</h2>
            <span class="dash-hint">绿 ≥95 / 黄 85–95 / 红 &lt;85</span>
          </div>
          <div class="report-body">
            <div class="sla-list">
              <div v-for="g in GROUP_SLA" :key="g.id" class="sla-item">
                <span class="si-name">{{ g.name }}</span>
                <div class="si-track-wrap">
                  <div class="si-bench" style="left: 95%" title="达标线 95%" />
                  <div class="si-track">
                    <div class="si-fill" :style="{ width: g.rate + '%', background: rateTone(g.rate).color }" />
                  </div>
                </div>
                <span class="si-rate" :style="{ color: rateTone(g.rate).color }">{{ g.rate }}%</span>
                <span class="si-delta" :class="g.rate >= g.yesterday ? 'down' : 'up'">
                  {{ (g.rate - g.yesterday).toFixed(1) }}
                </span>
                <span class="si-vol">{{ g.volume }} 单</span>
              </div>
            </div>
          </div>
        </section>
      </div>
    </template>

    <!-- 风险工单清单 -->
    <a-drawer v-model:open="riskOpen" :title="riskTitle" width="720" placement="right">
      <div v-if="!riskRows.length" class="empty-inline">该范围下没有对应工单</div>
      <div v-else class="risk-count">共 <b>{{ riskTotal }}</b> 单，按紧急度排序展示前 {{ riskRows.length }} 条</div>
      <table v-if="riskRows.length" class="risk-table">
        <thead>
          <tr><th>工单号</th><th>标题</th><th>优先级</th><th>班组</th><th>处理人</th><th>时效</th></tr>
        </thead>
        <tbody>
          <tr v-for="t in riskRows" :key="t.no">
            <td><button type="button" class="rt-no" @click="openTicket(t.no)">{{ t.no }}</button></td>
            <td class="rt-title">{{ t.title }}</td>
            <td><span class="pri" :style="{ color: PRIORITY_COLOR[t.priority] }">{{ t.priority }}</span></td>
            <td>{{ t.groupName }}</td>
            <td>{{ t.assignee }}</td>
            <td>
              <span v-if="t.overdueText" class="sla-over">{{ t.overdueText }}</span>
              <span v-else class="sla-soon">{{ t.remainText }}</span>
            </td>
          </tr>
        </tbody>
      </table>
      <p class="drawer-note">监控岗为只读视图，点击工单号进入详情后不出任何流转操作。</p>
    </a-drawer>

    <!-- 弹窗告警：随值班状态区一并关闭（915 不做） -->
    <a-modal v-if="SHOW_DUTY_PANEL" v-model:open="popupOpen" :width="560" :footer="null" :closable="false" centered>
      <div class="pop">
        <div class="pop-head">
          <WarningFilled class="pop-ic" />
          <span class="pop-title">{{ popupIssues.length }} 项紧急告警</span>
          <span class="pop-time">{{ snap.scopeLabel }} · {{ lastRefresh }}</span>
        </div>
        <div class="pop-list">
          <div v-for="i in popupIssues" :key="i.id" class="pop-row">
            <div class="pop-body">
              <div class="pop-t">{{ i.title }}</div>
              <div class="pop-d">{{ i.detail }}</div>
              <div class="pop-o">责任人：{{ i.owner }}</div>
            </div>
            <button type="button" class="ia-btn ghost" @click="popupGo(i)">去处置</button>
          </div>
        </div>
        <div class="pop-foot">
          <span class="pop-policy">
            超阈值持续 {{ ALERT_POLICY.debounceMinutes }} 分钟才触发；确认后 {{ ALERT_POLICY.silenceMinutes }} 分钟静默
          </span>
          <button type="button" class="ia-btn primary" @click="ackPopup">知道了</button>
        </div>
      </div>
    </a-modal>

    <!-- 打标（模块 2.3）：字段枚举待业务确认，先按风险分级 + 备注 -->
    <a-modal v-model:open="tagOpen" :width="460" title="工单打标" ok-text="保存" cancel-text="取消" @ok="saveTag">
      <div v-if="tagTarget" class="tag-form">
        <div class="tf-row"><span class="tf-label">工单</span><b>{{ tagTarget.ticketNo }}</b></div>
        <div class="tf-row"><span class="tf-label">命中</span>{{ tagTarget.word }} · {{ tagTarget.position }}</div>
        <div class="tf-row"><span class="tf-label">原文</span><span class="tf-ex">「{{ tagTarget.excerpt }}」</span></div>
        <div class="tf-row">
          <span class="tf-label">风险等级</span>
          <div class="tf-levels">
            <button
              v-for="lv in (['高', '中', '低'] as RiskLevel[])"
              :key="lv"
              type="button"
              class="lv-chip"
              :class="{ active: tagLevel === lv }"
              :style="tagLevel === lv ? { color: RISK_LEVEL_STYLE[lv].color, background: RISK_LEVEL_STYLE[lv].bg } : {}"
              @click="tagLevel = lv"
            >{{ lv }}风险</button>
          </div>
        </div>
        <div class="tf-row">
          <span class="tf-label">处置备注</span>
          <a-textarea v-model:value="tagNote" :rows="2" placeholder="记录核实结论与后续动作" />
        </div>
      </div>
    </a-modal>

  </div>
</template>

<style scoped>
/* ── 监控大盘：数据陈列优先，不做班组看板的「操作台」视觉 ── */
.ops-monitor {
  display: flex;
  flex-direction: column;
  gap: 0;
  padding: 0 0 24px;
  background: #e8ecf1;
  min-height: 100%;
}

.panel {
  background: #fff;
  border: 1px solid #d5dce6;
  border-radius: 4px;
  padding: 0;
  box-shadow: none;
}
.dash-panel { margin: 0 16px 12px; }
.dash-head {
  display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; flex-wrap: wrap;
  padding: 12px 16px 10px;
  border-bottom: 1px solid #e8ecf1;
  background: #fafbfc;
}
.dash-head.compact { align-items: center; padding: 10px 16px; }
.dash-head-main { min-width: 0; }
.dash-title {
  margin: 0; font-size: 13px; font-weight: 600; color: #334155;
  letter-spacing: 0.03em; text-transform: uppercase;
}
.dash-formula {
  margin: 4px 0 0; font-size: 11px; color: #64748b;
  font-variant-numeric: tabular-nums; line-height: 1.45;
}
.dash-hint { font-size: 11px; color: #94a3b8; }
.dash-dim {
  display: flex; align-items: center; gap: 4px; flex-wrap: wrap;
}
.dash-dim-label { font-size: 11px; color: #94a3b8; margin-right: 4px; }
.dash-dim-btn {
  border: 1px solid #e2e8f0; background: #fff; color: #64748b; border-radius: 3px;
  padding: 2px 8px; font-size: 11px; font-weight: 500; cursor: pointer; font-family: inherit;
}
.dash-dim-btn.active { background: #334155; border-color: #334155; color: #fff; }

.ob-head {
  display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap;
  padding: 10px 16px; border-bottom: 1px solid #e8ecf1; background: #fafbfc;
}
.ob-title { display: inline-flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 600; color: #334155; }
.ob-bar { display: none; }
.ob-note { font-size: 11px; color: #94a3b8; font-variant-numeric: tabular-nums; }
.link-btn { border: none; background: none; padding: 0; color: #475569; font-size: 11px; cursor: pointer; font-family: inherit; text-decoration: underline; text-underline-offset: 2px; }
.ob-empty { padding: 16px; font-size: 12px; color: #94a3b8; text-align: center; }

/* 顶栏：与 monitor-bar 同系，不做深色大屏顶 */
.monitor-header {
  display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap;
  margin: 12px 16px 0; padding: 8px 12px;
  background: #fff; border: 1px solid #d5dce6; border-radius: 4px;
}
.head-left { display: flex; align-items: center; gap: 8px; min-width: 0; }
.head-title { margin: 0; font-size: 15px; font-weight: 600; color: #0f172a; line-height: 1.3; }
.head-tag {
  font-size: 10px; font-weight: 600; color: #64748b;
  background: #f1f5f9; border-radius: 3px; padding: 1px 6px;
}
.head-tag-complaint {
  color: #c2410c;
  background: #ffedd5;
}
.dash-hint-inline { margin-bottom: 2px; color: #94a3b8; }
.risk-board-note {
  margin: 0;
  padding: 8px 16px 0;
  font-size: 11px;
  color: #64748b;
  line-height: 1.5;
}
.word-table-inline { margin: 8px 16px 0; }
.drawer-note.inline { margin: 8px 16px 12px; }

/* 工具条 */
.monitor-bar {
  display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap;
  margin: 12px 16px; padding: 8px 12px;
  background: #fff; border: 1px solid #d5dce6; border-radius: 4px;
}
.monitor-bar-label { font-size: 11px; font-weight: 600; color: #64748b; margin-right: 8px; text-transform: uppercase; letter-spacing: 0.04em; }
.monitor-bar-left { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
.monitor-scope-picker { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.monitor-scope-all-btn {
  border: 1px solid #e2e8f0; background: #fff; color: #64748b; border-radius: 3px;
  padding: 2px 10px; font-size: 12px; font-weight: 500; cursor: pointer; font-family: inherit; height: 24px;
}
.monitor-scope-all-btn:hover { background: #f1f5f9; color: #334155; }
.monitor-scope-all-btn.active { background: #334155; color: #fff; border-color: #334155; }
.monitor-scope-select { min-width: 220px; max-width: 360px; flex: 1; }
.monitor-scope-select :deep(.ant-select-selector) { border-radius: 3px !important; font-size: 12px; min-height: 24px !important; }
.monitor-scope-meta { font-size: 11px; color: #94a3b8; white-space: nowrap; }
.monitor-bar-right { display: flex; align-items: center; gap: 10px; margin-left: auto; }
.monitor-clock { font-size: 12px; color: #64748b; font-variant-numeric: tabular-nums; font-weight: 500; }
.monitor-refresh {
  display: inline-flex; align-items: center; justify-content: center;
  width: 28px; height: 28px; border: 1px solid #e2e8f0; background: #fff; border-radius: 3px;
  color: #64748b; cursor: pointer; font-size: 12px;
}
.monitor-refresh:hover { background: #f8fafc; color: #334155; }
.live-badge {
  display: inline-flex; align-items: center; gap: 5px;
  font-size: 11px; font-weight: 600; color: #047857; background: #ecfdf5; border-radius: 3px; padding: 2px 8px;
}
.live-dot { width: 5px; height: 5px; border-radius: 50%; background: #10b981; animation: pulse 2s infinite; }
@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }

/* 流量指标带 */
.metric-strip {
  display: grid; grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 1px; background: #e2e8f0;
}
.metric-tile {
  background: #fff; padding: 14px 16px 12px; min-height: 88px;
  display: flex; flex-direction: column; min-width: 0;
}
.metric-tile.drillable { cursor: pointer; }
.metric-tile.drillable:hover { background: #fafbfc; }
.metric-tile.drillable.active {
  background: #fff;
  box-shadow: inset 0 -3px 0 #475569;
  position: relative;
  z-index: 1;
}
.metric-tile.is-alert.drillable.active {
  background: #fff;
  box-shadow: inset 0 -3px 0 #dc2626;
}
.mt-label { font-size: 11px; font-weight: 600; color: #64748b; letter-spacing: 0.02em; }
.mt-value-row { display: flex; align-items: baseline; gap: 6px; margin-top: 4px; }
.mt-value {
  font-size: 28px; font-weight: 700; color: #0f172a; line-height: 1.1;
  font-variant-numeric: tabular-nums; letter-spacing: -0.02em;
}
.mt-value.danger { color: #dc2626; }
.mt-value.warn { color: #d97706; }
.mt-unit { font-size: 11px; color: #94a3b8; font-weight: 500; }
.mt-sub { font-size: 11px; color: #64748b; margin-top: 2px; line-height: 1.4; }
.mt-sub b.up { color: #dc2626; font-weight: 600; }
.mt-sub b.down { color: #059669; font-weight: 600; }
.mt-sub-em { color: #475569; margin-top: 6px; }
.mt-foot { margin-top: auto; padding-top: 8px; font-size: 11px; color: #94a3b8; }
.metric-tile.drillable:focus-visible { outline: 2px solid #64748b; outline-offset: -2px; }
.metric-tile.is-alert { background: #fef2f2; }
.metric-tile.is-alert.drillable:hover { background: #fee2e2; }
/* 指标卡内联展开 — 与指标带同一面板延续 */
.metric-expand {
  border-top: 1px solid #e2e8f0;
  background: #fff;
  padding: 10px 16px 12px;
  margin-top: -1px;
}
.me-body { display: block; }
.me-dims-grid {
  display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1px;
  background: #e2e8f0;
  border: 1px solid #e2e8f0;
  border-radius: 4px;
  overflow: hidden;
}
.me-dim-col {
  background: #fafbfc; padding: 10px 12px 8px;
  min-height: 168px;
}
.me-dim-title {
  margin: 0 0 6px; font-size: 11px; font-weight: 700; color: #64748b;
  letter-spacing: 0.02em;
}
.me-vchart { width: 100%; height: 118px; display: block; }
.me-vbase { stroke: #e2e8f0; stroke-width: 1; }
.me-vbar { transition: height 0.25s ease, y 0.25s ease; }
.me-vval {
  font-size: 8px; font-weight: 700; fill: #0f172a;
  font-family: ui-sans-serif, system-ui, sans-serif; font-variant-numeric: tabular-nums;
}
.me-vpct {
  font-size: 7px; fill: #94a3b8;
  font-family: ui-sans-serif, system-ui, sans-serif; font-variant-numeric: tabular-nums;
}
.me-vname {
  font-size: 7px; fill: #64748b;
  font-family: ui-sans-serif, system-ui, sans-serif;
}
.me-foot { padding-top: 10px; margin-top: 10px; border-top: 1px solid #f1f5f9; }
.me-go {
  border: none; background: transparent; padding: 0; font-size: 12px; font-weight: 600;
  color: #475569; cursor: pointer;
}
.me-go:hover { color: #0f172a; text-decoration: underline; }
.me-note { margin: 0; font-size: 11px; color: #94a3b8; }
.me-io { padding-top: 4px; }
.me-legend { margin-bottom: 8px; }
.chart-md { width: 100%; height: 140px; display: block; }
.me-axis { margin-top: 6px; }

/* 此刻 KPI 行 */
.dash-stack { display: flex; flex-direction: column; gap: 0; }
.kpi-row {
  display: grid; grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1px; background: #e2e8f0; margin: 0;
}
.kpi-cell {
  position: relative; background: #fff; padding: 14px 16px 12px; min-height: 96px;
}
.kpi-label { font-size: 11px; font-weight: 600; color: #64748b; }
.kpi-value {
  font-size: 32px; font-weight: 700; color: #0f172a; line-height: 1.1;
  margin: 4px 0 2px; font-variant-numeric: tabular-nums;
}
.kpi-value.danger { color: #dc2626; }
.kpi-value.warn { color: #d97706; }
.kpi-unit { font-size: 13px; color: #94a3b8; font-weight: 500; margin-left: 2px; }
.kpi-meta { font-size: 11px; color: #94a3b8; line-height: 1.5; }
.kpi-meta .up { color: #dc2626; font-weight: 600; }
.kpi-meta .down { color: #059669; font-weight: 600; }
.kpi-meta b { font-weight: 600; color: #475569; }
.kpi-spark { position: absolute; right: 12px; top: 14px; width: 88px; height: 28px; opacity: 0.75; }
.kpi-cell-gauge { display: flex; flex-direction: column; }
.kpi-gauge-wrap { position: relative; width: 88px; height: 88px; margin: 2px 0 4px; }
.kpi-gauge { width: 100%; height: 100%; display: block; }
.kpi-gauge-center {
  position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  gap: 2px;
}
.kpi-gauge-center .kpi-value { font-size: 26px; margin: 0; }
.kpi-gauge-center .kpi-unit { font-size: 12px; }

/* 时效分层 · 热力矩阵 */
.sla-heatmap-wrap { padding: 10px 16px 14px; overflow-x: auto; }
.sla-heat-legend {
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  margin-bottom: 10px; font-size: 11px; color: #64748b;
}
.shl-item { display: inline-flex; align-items: center; gap: 5px; }
.shl-swatch { width: 12px; height: 12px; border-radius: 2px; display: inline-block; }
.shl-swatch.soon { background: rgba(217, 119, 6, 0.45); }
.shl-swatch.overdue { background: rgba(220, 38, 38, 0.5); }
.shl-sep { color: #e2e8f0; }
.shl-scale { margin-left: auto; font-size: 10px; color: #cbd5e1; }
.sla-heatmap { min-width: 640px; }
.sh-row {
  display: grid;
  grid-template-columns: 88px repeat(5, minmax(40px, 1fr)) 6px repeat(3, minmax(48px, 1fr));
  gap: 2px; align-items: stretch;
}
.sh-row + .sh-row { margin-top: 2px; }
.sh-corner { font-size: 10px; color: #94a3b8; padding: 4px 6px 4px 0; }
.sh-group-label {
  text-align: center; font-size: 10px; font-weight: 600; letter-spacing: 0.03em;
  padding: 4px 0; border-radius: 3px 3px 0 0;
}
.sh-group-label.soon { background: #fffbeb; color: #b45309; }
.sh-group-label.overdue { background: #fef2f2; color: #b91c1c; }
.sh-col-head {
  font-size: 10px; font-weight: 600; color: #64748b; text-align: center;
  padding: 4px 2px; white-space: nowrap;
}
.sh-col-head.overdue.danger { color: #b91c1c; }
.sh-split { background: #e2e8f0; border-radius: 1px; min-height: 8px; }
.sh-split.body { margin: 0 1px; }
.sh-row-label {
  font-size: 12px; font-weight: 600; color: #334155; padding: 8px 6px 8px 0;
  display: flex; align-items: center;
}
.sh-cell {
  border: none; border-radius: 3px; min-height: 36px;
  font-size: 13px; font-weight: 700; font-variant-numeric: tabular-nums;
  cursor: pointer; font-family: inherit; transition: transform 0.1s, box-shadow 0.1s;
}
.sh-cell:hover { transform: scale(1.04); box-shadow: 0 2px 8px rgba(15, 23, 42, 0.12); z-index: 1; }
.sh-cell:focus-visible { outline: 2px solid #64748b; outline-offset: 1px; }

/* 分组诊断 · 横向条形图 */
.diag-bars { padding: 10px 16px 14px; display: flex; flex-direction: column; gap: 10px; }
.db-legend { display: flex; gap: 14px; flex-wrap: wrap; font-size: 11px; color: #64748b; margin-bottom: 2px; }
.db-lg { display: inline-flex; align-items: center; gap: 5px; }
.db-dot { width: 8px; height: 8px; border-radius: 2px; display: inline-block; }
.db-dot.bl { background: #475569; }
.db-dot.od { background: #ea580c; }
.db-dot.sv { background: #d97706; }
.db-dot.ut { background: #059669; }
.diag-bar-row {
  padding: 10px 12px; background: #fafbfc; border: 1px solid #e8ecf1; border-radius: 4px;
  cursor: pointer; transition: background 0.12s;
}
.diag-bar-row:hover { background: #f1f5f9; }
.diag-bar-row.bad { background: #fffbeb; border-color: #fde68a; }
.diag-bar-row.bad:hover { background: #fef3c7; }
.db-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 8px; }
.db-name { font-size: 13px; font-weight: 600; color: #0f172a; min-width: 72px; }
.db-meta { font-size: 11px; color: #94a3b8; margin-left: auto; }
.db-meta b.zero { color: #dc2626; }
.db-actions { flex: none; }
.db-chart { display: flex; flex-direction: column; gap: 5px; }
.db-bar-line { display: flex; align-items: center; gap: 8px; min-width: 0; }
.db-bar-label { flex: none; width: 36px; font-size: 10px; font-weight: 600; color: #94a3b8; text-align: right; }
.db-bar-track { position: relative; flex: 1; height: 8px; background: #e8ecf1; border-radius: 2px; overflow: visible; }
.db-bar-fill { height: 100%; border-radius: 2px; min-width: 0; transition: width 0.25s; }
.db-bar-fill.fill-bl { background: #475569; }
.db-bar-fill.fill-od { background: #ea580c; }
.db-bar-fill.fill-sv { background: #f59e0b; }
.db-bar-fill.fill-ut { background: #059669; }
.db-bar-mark {
  position: absolute; top: -2px; width: 2px; height: 12px;
  background: #dc2626; border-radius: 1px; transform: translateX(-50%);
}
.db-bar-bench {
  position: absolute; top: 0; bottom: 0; width: 1px;
  background: #059669; opacity: 0.45; transform: translateX(-50%);
}
.db-bar-bench.danger { background: #dc2626; opacity: 0.55; }
.db-bar-val {
  flex: none; width: 52px; text-align: right; font-size: 11px; font-weight: 700;
  color: #334155; font-variant-numeric: tabular-nums;
}
.db-bar-val small { font-size: 10px; color: #dc2626; font-weight: 600; margin-left: 1px; }

/* 时效分层（旧 ladder 保留兼容） */
.now-sla .sla-ladder { padding: 12px 16px 14px; }

/* ① 值班状态 */
.duty-panel { border-radius: 8px; padding: 12px 14px; box-shadow: 0 2px 8px rgba(17, 24, 39, 0.07); }
.duty-panel.alert { background: #fff; border: 1px solid #fecaca; border-top: 3px solid #dc2626; }
.duty-panel.ok {
  display: flex; align-items: center; gap: 10px;
  background: linear-gradient(90deg, #f0fdf4 0%, #fff 100%);
  border: 1px solid #bbf7d0; border-top: 3px solid #10b981;
}
.duty-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 10px; }
.duty-ic { color: #dc2626; font-size: 16px; }
.ok-ic { color: #10b981; }
.duty-title { font-size: 15px; font-weight: 700; color: #111827; }
.duty-count {
  font-size: 11px; font-weight: 700; color: #b91c1c; background: #fee2e2;
  border-radius: 4px; padding: 1px 7px;
}
.duty-scope { margin-left: auto; font-size: 11px; color: #9ca3af; font-variant-numeric: tabular-nums; }
.duty-panel.ok .duty-scope { margin-left: 0; }

.issue-list { display: flex; flex-direction: column; gap: 8px; }
.issue-row {
  display: flex; align-items: center; gap: 10px;
  border: 1px solid #f3f4f6; border-radius: 6px; padding: 8px 10px; background: #fafbfc;
}
.issue-row.critical { background: #fef2f2; border-color: #fecaca; }
.issue-dot { flex: none; width: 6px; height: 6px; border-radius: 50%; background: #f59e0b; }
.issue-row.critical .issue-dot { background: #dc2626; }
.issue-body { flex: 1; min-width: 0; }
.issue-title { font-size: 13px; font-weight: 600; color: #111827; line-height: 1.5; }
.issue-detail { font-size: 11px; color: #6b7280; line-height: 1.5; margin-top: 1px; }
.issue-actions { display: flex; align-items: center; gap: 8px; flex: none; }
.issue-owner { font-size: 11px; color: #9ca3af; white-space: nowrap; }
.ia-btn {
  display: inline-flex; align-items: center; gap: 4px; border-radius: 4px;
  padding: 4px 12px; font-size: 12px; font-weight: 600; cursor: pointer; font-family: inherit; white-space: nowrap;
}
.ia-btn.ghost { border: 1px solid #e5e7eb; background: #fff; color: #4b5563; }
.ia-btn.ghost:hover { border-color: #64748b; color: #334155; }
.ia-btn.primary { border: 1px solid #dc2626; background: #dc2626; color: #fff; }
.ia-btn.primary:hover { background: #b91c1c; }
.ia-arrow { font-size: 10px; }
.ia-done { font-size: 11px; font-weight: 600; color: #10b981; white-space: nowrap; }

/* ② 此刻 —— 已迁移为 kpi-row */
.sla-ladder { display: flex; flex-direction: column; gap: 0; }
.sl-zone { min-width: 0; }
.sl-zone-head {
  display: flex; align-items: baseline; flex-wrap: wrap; gap: 8px 12px;
  margin-bottom: 8px;
}
.sl-zone-tag {
  flex: none; font-size: 11px; font-weight: 700; border-radius: 4px; padding: 2px 8px;
}
.sl-zone-tag.soon { color: #b45309; background: #fffbeb; }
.sl-zone-tag.overdue { color: #dc2626; background: #fef2f2; }
.sl-zone-desc { font-size: 11px; color: #94a3b8; line-height: 1.45; }
.sl-zone-desc strong { font-weight: 600; color: #64748b; }
.sl-track {
  display: flex; align-items: stretch; gap: 0; min-width: 0;
  border: 1px solid #e2e8f0; border-radius: 3px; overflow: hidden; background: #e2e8f0;
}
.sl-chev { display: none; }
.sl-split {
  display: flex; align-items: center; gap: 10px; margin: 12px 0 10px;
}
.sl-split-line { flex: 1; height: 1px; background: linear-gradient(90deg, #fde68a, #fecaca); }
.sl-split-label {
  flex: none; font-size: 10px; font-weight: 600; color: #94a3b8;
  letter-spacing: 0.04em;
}
.sl-step {
  flex: 1; min-width: 0;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 2px; min-height: 64px; padding: 8px 6px;
  border: none; border-right: 1px solid #e2e8f0;
  border-radius: 0; background: #fafbfc;
  cursor: pointer; font-family: inherit;
  transition: background 0.12s;
}
.sl-step:last-child { border-right: none; }
.sl-step:hover { background: #f1f5f9; }
.sl-step-sub { font-size: 10px; font-weight: 600; color: #94a3b8; line-height: 1.2; }
.sl-step-time { font-size: 12px; font-weight: 600; color: #475569; line-height: 1.25; text-align: center; }
.sl-step-row { display: flex; align-items: baseline; gap: 2px; margin-top: 2px; }
.sl-step-n {
  font-size: 22px; font-weight: 700; color: #111827;
  font-variant-numeric: tabular-nums; line-height: 1;
}
.sl-step-unit { font-size: 11px; color: #94a3b8; font-weight: 500; }
.sl-step.soon.hot { background: #fffbeb; border-color: #fde68a; }
.sl-step.soon.hot .sl-step-n { color: #b45309; }
.sl-step.soon:hover { border-color: #f59e0b; background: #fffbeb; }
.sl-step.overdue.warn.hot { background: #fff7ed; border-color: #fed7aa; }
.sl-step.overdue.warn.hot .sl-step-n { color: #ea580c; }
.sl-step.overdue.danger.hot { background: #fef2f2; border-color: #fecaca; }
.sl-step.overdue.danger.hot .sl-step-n { color: #dc2626; }
.sl-step.overdue.warn:hover { border-color: #fb923c; }
.sl-step.overdue.danger:hover { border-color: #f87171; }

@media (max-width: 900px) {
  .sl-track { flex-wrap: wrap; gap: 6px; }
  .sl-chev { display: none; }
  .sl-step { flex: 1 1 calc(33% - 6px); min-width: 88px; }
  .sl-track:not(.sl-track-3) .sl-step { flex: 1 1 calc(50% - 6px); }
}

/* ③ 分组诊断 */
.diag-table { width: 100%; border-collapse: collapse; }
.diag-table th {
  text-align: left; font-size: 11px; font-weight: 600; color: #64748b;
  padding: 8px 12px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; white-space: nowrap;
}
.diag-table th.w-bar { width: 150px; }
.diag-table td {
  font-size: 12px; color: #334155; padding: 9px 12px; border-bottom: 1px solid #f1f5f9;
  font-variant-numeric: tabular-nums;
}
.diag-table tbody tr { cursor: pointer; }
.diag-table tbody tr:hover { background: #f8fafc; }
.diag-table tbody tr.bad { background: #fffbeb; }
.diag-table tbody tr.bad:hover { background: #fef3c7; }
.dt-name { font-weight: 600; color: #111827; white-space: nowrap; }
.verdict { font-size: 11px; font-weight: 700; border-radius: 4px; padding: 2px 8px; white-space: nowrap; }
.severe { color: #dc2626; font-weight: 700; }
.bar-wrap { display: flex; align-items: center; gap: 8px; }
.bar-track { flex: 1; height: 6px; background: #f3f4f6; border-radius: 3px; overflow: hidden; }
.bar-fill { height: 100%; border-radius: 3px; }
.bar-text { font-size: 11px; font-weight: 700; flex: none; }
.avail { font-weight: 700; color: #10b981; }
.avail.zero { color: #ef4444; }
.row-btn {
  border: none; background: none; padding: 0;
  font-size: 11px; font-weight: 500; color: #64748b; cursor: pointer; font-family: inherit;
  text-decoration: underline; text-underline-offset: 2px; white-space: nowrap;
}
.row-btn:hover { color: #334155; }

/* 风险命中：只留两张卡 + 下钻（D7a） */
.risk-brief { display: grid; grid-template-columns: repeat(2, minmax(0, 240px)); gap: 12px; }
.rb-card {
  display: flex; flex-direction: column; align-items: flex-start; gap: 2px;
  padding: 10px 14px; text-align: left; cursor: pointer;
  background: #fff; border: 1px solid #e2e8f0; border-radius: 8px;
}
.rb-card:hover { border-color: #94a3b8; }
.rb-card.warn { border-color: #fca5a5; background: #fff7f7; }
.rb-label { font-size: 12px; color: #64748b; display: inline-flex; align-items: center; gap: 3px; }
.rb-num { font-size: 26px; font-weight: 600; color: #0f172a; font-variant-numeric: tabular-nums; line-height: 1.2; }
.rb-card.warn .rb-num { color: #b91c1c; }
.rb-sub { font-size: 11px; color: #94a3b8; }
.row-done { font-size: 11px; color: #10b981; font-weight: 600; }

/* 表格 / 图表区 */
.dash-panel .diag-table,
.dash-panel .hit-table { margin: 0; }
.dash-panel .ob-empty { padding: 20px 16px; }
.chart-wrap { padding: 12px 16px 14px; }
.chart-pro { background: linear-gradient(180deg, #fafbfc 0%, #fff 60%); }
.chart-lg { width: 100%; height: 160px; display: block; }
.chart-grid { stroke: #eef2f7; stroke-width: 1; }
.chart-bench { stroke: #059669; stroke-width: 1; stroke-dasharray: 4 4; opacity: 0.45; }
.peak-label { font-size: 10px; fill: #64748b; font-weight: 600; font-family: inherit; }
.report-trend { margin: 0; }

/* ④ 走势 */
.legend { display: flex; gap: 14px; margin: 0 0 8px; }
.lg { font-size: 11px; color: #64748b; display: inline-flex; align-items: center; gap: 5px; }
.lg::before { content: ''; width: 14px; height: 2px; border-radius: 1px; }
.lg-in::before { background: #475569; }
.lg-out::before { background: #059669; }
.lg-bl::before { background: #d97706; }
.legend-unit { font-size: 11px; color: #cbd5e1; margin-left: auto; }
.chart { width: 100%; height: 140px; display: block; }
.axis { display: flex; justify-content: space-between; margin-top: 4px; padding: 0 2px; }
.axis-t { font-size: 10px; color: #cbd5e1; font-variant-numeric: tabular-nums; }
.grain-row { display: flex; align-items: center; gap: 5px; flex-wrap: wrap; }
.peak-note { font-size: 11px; color: #94a3b8; margin-right: 6px; font-variant-numeric: tabular-nums; }
.grain-chip {
  border: 1px solid #e2e8f0; background: #fff; color: #64748b; border-radius: 3px;
  padding: 3px 10px; font-size: 11px; font-weight: 500; cursor: pointer; font-family: inherit;
}
.grain-chip.active { background: #334155; border-color: #334155; color: #fff; font-weight: 600; }

/* ⑤ 风险词 */
.hit-table { width: 100%; border-collapse: collapse; }
.hit-table th {
  text-align: left; font-size: 11px; font-weight: 600; color: #64748b;
  padding: 8px 12px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; white-space: nowrap;
}
.hit-table td { font-size: 12px; color: #334155; padding: 9px 12px; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
.hit-table tr.untagged { background: #fef2f2; }
.risk-word { font-size: 11px; font-weight: 700; border-radius: 4px; padding: 2px 8px; white-space: nowrap; }
.hit-title { font-size: 11px; color: #64748b; margin-top: 2px; max-width: 180px; }
.hit-excerpt { max-width: 300px; color: #475569; line-height: 1.5; }
.hit-pos {
  font-size: 10px; color: #64748b; background: #f1f5f9;
  border-radius: 3px; padding: 1px 5px; margin-right: 5px;
}
.hit-sub { font-size: 11px; color: #94a3b8; }
.hit-when { font-variant-numeric: tabular-nums; white-space: nowrap; }
.tag-done { font-size: 11px; font-weight: 700; border-radius: 4px; padding: 2px 8px; white-space: nowrap; }

@media (max-width: 1100px) {
  .metric-strip { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .me-dims-grid { grid-template-columns: 1fr; }
  .kpi-row { grid-template-columns: 1fr; }
  .quality-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .quality-grid-side { grid-template-columns: 1fr; }
  .report-hero { grid-template-columns: 1fr; }
  .report-row { grid-template-columns: 1fr; }
}
@media (max-width: 640px) {
  .metric-strip { grid-template-columns: 1fr; }
  .quality-grid { grid-template-columns: 1fr; }
  .dash-head { flex-direction: column; align-items: flex-start; }
}

/* Tab② 报表 */
.report-note { margin-left: auto; font-size: 11px; color: #94a3b8; }
.report-body { padding: 12px 16px 14px; }
.report-hero {
  display: grid; grid-template-columns: 220px minmax(0, 1fr);
  gap: 1px; background: #e2e8f0;
}
.gauge-panel {
  position: relative; background: linear-gradient(160deg, #1e293b 0%, #334155 100%);
  padding: 18px 16px 14px; display: flex; flex-direction: column; align-items: center;
  min-height: 220px;
}
.gauge-svg { width: 120px; height: 120px; display: block; }
.gauge-center {
  position: absolute; top: 52px; left: 50%; transform: translateX(-50%);
  text-align: center; pointer-events: none;
}
.gauge-val { display: block; font-size: 28px; font-weight: 700; color: #f8fafc; font-variant-numeric: tabular-nums; line-height: 1; }
.gauge-val small { font-size: 14px; font-weight: 600; opacity: 0.75; }
.gauge-lbl { display: block; font-size: 10px; color: #94a3b8; margin-top: 4px; max-width: 120px; line-height: 1.3; }
.gauge-health { display: block; font-size: 10px; color: #64748b; margin-top: 2px; }
.gauge-spark { width: 88px; height: 28px; margin-top: 8px; opacity: 0.85; }
.gauge-cmp { margin-top: 6px; color: #94a3b8 !important; }
.gauge-cmp .up { color: #fca5a5 !important; }
.gauge-cmp .down { color: #6ee7b7 !important; }

.quality-grid {
  display: grid; grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 1px; background: #e2e8f0; margin: 0;
}
.quality-grid-side {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  background: #e2e8f0;
}
.quality-cell { background: #fff; padding: 14px 16px 12px; min-width: 0; }
.quality-cell.primary { border-top: 2px solid #334155; }
.q-label { font-size: 11px; font-weight: 600; color: #64748b; display: flex; align-items: center; gap: 4px; }
.q-tip {
  width: 13px; height: 13px; border-radius: 50%; background: #e2e8f0; color: #64748b;
  font-size: 9px; display: inline-flex; align-items: center; justify-content: center; cursor: help;
}
.q-value {
  font-size: 28px; font-weight: 700; color: #0f172a; line-height: 1.1;
  margin: 4px 0 6px; font-variant-numeric: tabular-nums;
}
.q-value.warn { color: #d97706; }
.q-unit { font-size: 12px; color: #94a3b8; margin-left: 2px; font-weight: 500; }
.q-bar-wrap { margin-bottom: 6px; }
.q-bar-track { position: relative; height: 4px; background: #e8ecf1; border-radius: 2px; overflow: visible; }
.q-bar-fill { height: 100%; background: #334155; border-radius: 2px; transition: width 0.3s; }
.q-bar-fill.warn { background: linear-gradient(90deg, #d97706, #f59e0b); }
.q-bar-mark {
  position: absolute; top: -3px; width: 2px; height: 10px;
  background: #059669; border-radius: 1px; transform: translateX(-50%);
}
.q-spark { width: 100%; height: 24px; display: block; margin-bottom: 4px; opacity: 0.8; }
.q-cmp { font-size: 11px; color: #94a3b8; display: flex; align-items: center; flex-wrap: wrap; gap: 2px; }
.q-cmp .up { color: #dc2626; }
.q-cmp .down { color: #059669; }
.q-health { font-size: 10px; color: #cbd5e1; margin-top: 4px; }

.report-row { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 12px; align-items: start; margin: 0 16px; }
.pie-wrap { display: flex; align-items: center; gap: 20px; margin: 0; }
.pie-chart { position: relative; width: 150px; height: 150px; flex: none; }
.pie { width: 100%; height: 100%; display: block; transform: rotate(-90deg); }
.pie-center {
  position: absolute; inset: 0; display: flex; flex-direction: column;
  align-items: center; justify-content: center; pointer-events: none;
}
.pie-total { font-size: 22px; font-weight: 700; color: #0f172a; font-variant-numeric: tabular-nums; line-height: 1.1; }
.pie-total-lbl { font-size: 10px; color: #94a3b8; margin-top: 2px; }
.pie-seg { fill: none; stroke-width: 14; }
.pie-legend { flex: 1; display: flex; flex-direction: column; gap: 7px; min-width: 0; }
.pl-row { display: flex; align-items: center; gap: 8px; font-size: 12px; }
.pl-dot { width: 8px; height: 8px; border-radius: 2px; flex: none; }
.pl-label { flex: 1; color: #374151; }
.pl-value { color: #111827; font-weight: 600; font-variant-numeric: tabular-nums; }
.pl-pct { width: 38px; text-align: right; color: #9ca3af; font-variant-numeric: tabular-nums; }

.sla-list { display: flex; flex-direction: column; gap: 10px; margin: 0; }
.sla-item { display: flex; align-items: center; gap: 8px; font-size: 12px; }
.si-name { flex: none; width: 78px; color: #374151; }
.si-track-wrap { position: relative; flex: 1; }
.si-bench {
  position: absolute; top: -2px; bottom: -2px; width: 2px;
  background: #059669; opacity: 0.5; border-radius: 1px; transform: translateX(-50%); z-index: 1;
}
.si-track { height: 8px; background: #f3f4f6; border-radius: 4px; overflow: hidden; }
.si-fill { height: 100%; border-radius: 4px; }
.si-rate { flex: none; width: 46px; text-align: right; font-weight: 700; font-variant-numeric: tabular-nums; }
.si-delta { flex: none; width: 38px; text-align: right; font-size: 11px; font-variant-numeric: tabular-nums; }
.si-delta.up { color: #dc2626; }
.si-delta.down { color: #059669; }
.si-vol { flex: none; width: 52px; text-align: right; font-size: 11px; color: #9ca3af; }

/* 抽屉 · 流量构成 */
.drill-sub { margin: 0 0 12px; font-size: 12px; color: #94a3b8; line-height: 1.5; }
.dim-row { display: flex; gap: 6px; margin-bottom: 14px; }
.dim-chip {
  border: none; background: #f3f4f6; color: #6b7280; border-radius: 4px;
  padding: 4px 14px; font-size: 12px; font-weight: 500; cursor: pointer; font-family: inherit;
}
.dim-chip.active { background: #334155; border: 1px solid #334155; color: #fff; font-weight: 600; }
.drill-table {
  width: 100%; border-collapse: collapse; margin-top: 4px;
}
.drill-table th {
  text-align: left; font-size: 11px; font-weight: 600; color: #9ca3af;
  padding: 8px 10px; background: #f9fafb; border-bottom: 1px solid #eef2f7;
}
.drill-table td {
  font-size: 13px; color: #374151; padding: 9px 10px;
  border-bottom: 1px solid #f3f4f6; font-variant-numeric: tabular-nums;
}
.drill-table tfoot td {
  font-size: 12px; font-weight: 600; color: #111827;
  border-bottom: none; border-top: 1px solid #eef2f7; background: #fafbfc;
}
.drill-table .col-num { text-align: right; width: 88px; }
.dr-name { font-weight: 500; }
.dr-pct { color: #94a3b8; font-weight: 500; }
.drill-foot {
  margin-top: 16px; padding-top: 14px; border-top: 1px solid #f0f0f0;
}
.drill-go {
  display: inline-flex; align-items: center; gap: 4px;
  border: none; background: none; padding: 0;
  font-size: 13px; font-weight: 600; color: #475569; cursor: pointer; font-family: inherit;
}
.drill-go:hover { text-decoration: underline; }
.foot-note { margin: 0; }

.risk-count { font-size: 12px; color: #6b7280; margin-bottom: 10px; }
.risk-count b { color: #111827; font-size: 14px; }
.risk-table { width: 100%; border-collapse: collapse; }
.risk-table th {
  text-align: left; font-size: 11px; font-weight: 600; color: #9ca3af;
  padding: 6px 8px; background: #f9fafb; border-bottom: 1px solid #eef2f7;
}
.risk-table td { font-size: 12px; color: #374151; padding: 8px; border-bottom: 1px solid #f3f4f6; }
.rt-no {
  border: none; background: none; padding: 0; font-family: ui-monospace, monospace;
  font-size: 12px; font-weight: 600; color: #475569; cursor: pointer;
}
.rt-no:hover { text-decoration: underline; }
.rt-title { max-width: 220px; }
.pri { font-weight: 700; }
.sla-over { color: #dc2626; font-weight: 600; font-variant-numeric: tabular-nums; }
.sla-soon { color: #b45309; font-weight: 600; font-variant-numeric: tabular-nums; }
.drawer-note { margin-top: 12px; font-size: 11px; color: #9ca3af; }
.empty-inline { font-size: 12px; color: #9ca3af; padding: 20px 0; text-align: center; }

.bar-red { background: #dc2626; }
.note-sep { color: #d1d5db; margin: 0 6px; }
.dot { color: #d1d5db; margin: 0 3px; }
.head-badge {
  font-size: 11px; font-weight: 700; color: #b91c1c; background: #fee2e2;
  border-radius: 4px; padding: 1px 7px; margin-left: 6px;
}

/* 弹窗告警 */
.pop { display: flex; flex-direction: column; gap: 12px; }
.pop-head { display: flex; align-items: center; gap: 8px; }
.pop-ic { color: #dc2626; font-size: 18px; }
.pop-title { font-size: 16px; font-weight: 700; color: #111827; }
.pop-time { margin-left: auto; font-size: 11px; color: #9ca3af; font-variant-numeric: tabular-nums; }
.pop-list { display: flex; flex-direction: column; gap: 8px; }
.pop-row {
  display: flex; align-items: center; gap: 10px;
  background: #fef2f2; border: 1px solid #fecaca; border-radius: 6px; padding: 9px 11px;
}
.pop-body { flex: 1; min-width: 0; }
.pop-t { font-size: 13px; font-weight: 600; color: #111827; line-height: 1.5; }
.pop-d { font-size: 11px; color: #6b7280; line-height: 1.5; margin-top: 1px; }
.pop-o { font-size: 11px; color: #9ca3af; margin-top: 2px; }
.pop-foot { display: flex; align-items: center; gap: 12px; }
.pop-policy { flex: 1; font-size: 11px; color: #9ca3af; line-height: 1.5; }

/* 打标弹窗 */
.tag-form { display: flex; flex-direction: column; gap: 10px; }
.tf-row { display: flex; align-items: flex-start; gap: 8px; font-size: 12px; color: #374151; }
.tf-label { flex: none; width: 62px; color: #9ca3af; padding-top: 2px; }
.tf-ex { color: #4b5563; line-height: 1.5; }
.tf-levels { display: flex; gap: 6px; }
.lv-chip {
  border: 1px solid #e5e7eb; background: #fff; color: #6b7280; border-radius: 4px;
  padding: 3px 12px; font-size: 12px; font-weight: 600; cursor: pointer; font-family: inherit;
}
.lv-chip.active { border-color: currentColor; }

/* 预警词表 */
.word-table { width: 100%; border-collapse: collapse; }
.word-table th {
  text-align: left; font-size: 11px; font-weight: 600; color: #9ca3af;
  padding: 7px 8px; background: #f9fafb; border-bottom: 1px solid #eef2f7;
}
.word-table td { font-size: 12px; color: #374151; padding: 8px; border-bottom: 1px solid #f3f4f6; }
.word-table tr.off { opacity: 0.55; }
.wt-word { font-weight: 600; color: #111827; }
.wt-state { font-size: 11px; font-weight: 600; border-radius: 3px; padding: 1px 7px; }
.wt-state.on { color: #047857; background: #d1fae5; }
.wt-state.off { color: #6b7280; background: #f3f4f6; }
.hits-high { color: #dc2626; font-weight: 700; }
.drawer-note.top { margin: 0 0 12px; }
</style>
