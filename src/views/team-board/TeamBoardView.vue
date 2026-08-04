<script setup lang="ts">
/**
 * 班组长看板
 *
 * 结构（对齐个人门户）：
 *   ⓪ 问候卡 greeting-card —— 提要 + 班组切换
 *   ① 存量 · 待清理 —— 全宽 2 KPI 卡；「去指派」嵌在未分派卡内；区头「待审批」
 *   ② 今日指标 —— 全宽 6 KPI 卡（数量 3 | 率值 3）；区脚常驻流转事件 3 项
 *   ③ 主体 —— 左组员明细｜右趋势 + 负载
 *
 * 关键裁决：
 *   X3 实心主按钮仅未分派卡内「去指派」一个（全页唯一）
 *   X5 抽屉打开时右列降透明 + 禁用
 *   X6 未分派卡＝数量 + 卡内「去指派」动作（同数一体，不另开入口）
 *   X7 仅「今日指标」数量卡可聚焦趋势线；积压卡 → 优先级抽屉
 *   督办：不支持（平台无 WoAction / 消息事件），入口已移除
 */
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { message } from 'ant-design-vue';
import {
  SwapOutlined,
  RightOutlined,
  LineChartOutlined,
  CaretUpOutlined,
  CaretDownOutlined,
  SettingOutlined,
  ExportOutlined,
  UserAddOutlined,
  CheckCircleFilled,
  MinusCircleOutlined,
} from '@ant-design/icons-vue';
import DrillDrawer, { type DrillGoListPayload, type DrillType } from './components/DrillDrawer.vue';
import AssignModal, {
  LOAD_STYLE,
  loadLevelOf,
  type AssignTicket,
  type AssignSubmitPayload,
  type LoadLevel,
} from './components/AssignModal.vue';
import {
  LEADER_TEAMS,
  getTeamBoardSnapshot,
  URGE_DRILL,
  RETURN_DRILL,
  TRANSFER_DRILL,
  TRAFFIC_HOURLY,
  TRAFFIC_DAILY,
  PROBLEM_TOP10,
  type MemberRow,
} from '@/mock/teamBoard';
import { useUserStore } from '@/stores/user';

const router = useRouter();
const user = useUserStore();

/* ========================= ⓪ 班组切换（组长可管多组） ========================= */
const teamId = ref(LEADER_TEAMS[0].value);
const teamOptions = LEADER_TEAMS.map((t) => ({ value: t.value, label: `${t.label}（${t.size}人）` }));
const board = computed(() => getTeamBoardSnapshot(teamId.value));
const currentTeam = computed(() => LEADER_TEAMS.find((t) => t.value === teamId.value) ?? LEADER_TEAMS[0]);

/** 问候标题：与个人门户同语汇 */
const greeting = computed(() => {
  const h = new Date().getHours();
  const period = h < 12 ? '早上好' : h < 18 ? '下午好' : '晚上好';
  return `${period}，${user.name}`;
});

/**
 * 提要数字一律从看板快照派生，禁止写死（对齐个人门户 §4.3）。
 */
function stockVal(key: string) {
  return board.value.stock.find((s) => s.key === key)?.value ?? '—';
}
function metricVal(key: string) {
  return board.value.metrics.find((m) => m.key === key)?.value ?? '—';
}

const summaryParts = computed(() => {
  const unassigned = stockVal('unassigned');
  const backlog = stockVal('backlog');
  const inbound = metricVal('inbound');
  const closed = metricVal('closed');
  const assignN = board.value.todos[0]?.count ?? 0;
  const heavy = Number(unassigned) >= 5 || Number(backlog) >= 40;
  return [
    { text: '当前「', tone: 'plain' as const },
    { text: currentTeam.value.label, tone: 'gain' as const },
    { text: '」有 ', tone: 'plain' as const },
    { text: `${unassigned} 单未分派`, tone: 'risk' as const },
    { text: '、积压 ', tone: 'plain' as const },
    { text: `${backlog}`, tone: 'risk' as const },
    { text: '；今日进线 ', tone: 'plain' as const },
    { text: `${inbound}`, tone: 'gain' as const },
    { text: '、结案 ', tone: 'plain' as const },
    { text: `${closed}`, tone: heavy ? ('plain' as const) : ('gain' as const) },
    {
      text: heavy
        ? `，建议优先去指派 ${assignN} 单。`
        : '，节奏平稳，关注质量与时效即可。',
      tone: 'plain' as const,
    },
  ];
});

/* ========================= ① 指标分组 ========================= */

/** X7：有真实时间序列的三个数量指标，只有它们可以聚焦趋势线 */
type SeriesKey = 'inbound' | 'forward' | 'closed';
const SERIES_KEYS: SeriesKey[] = ['inbound', 'forward', 'closed'];
const isSeries = (k: string): k is SeriesKey => (SERIES_KEYS as string[]).includes(k);

/** R1b：数量与率值分组展示，中间加分隔，避免「6 个数一排」读不出层次 */
const COUNT_METRICS = computed(() => board.value.metrics.filter((m) => isSeries(m.key)));
const RATE_METRICS = computed(() => board.value.metrics.filter((m) => !isSeries(m.key)));

/** 默认不聚焦：三线等权，先给全局印象；点某卡再聚焦 */
const focusKey = ref<SeriesKey | null>(null);

/** 需求模块1 第 5/6/7 条，**默认展开**：折叠会导致需求方在稿子上找不到 */
const flowOpen = ref(true);

const secondaryTodos = computed(() => board.value.todos.slice(1));
const flowTotal = computed(() =>
  board.value.flowEvents.reduce((n, f) => n + (Number.parseInt(String(f.value), 10) || 0), 0),
);

function toggleFocus(key: string) {
  if (!isSeries(key)) return;
  focusKey.value = focusKey.value === key ? null : key;
}

/* ========================= ② 下钻抽屉 ========================= */

const drawerOpen = ref(false);
const drawerKey = ref<string>('');
const drawerType = ref<DrillType | null>(null);
const drawerTitle = ref('');
const drawerSubtitle = ref('');
const drawerTotal = ref(0);
const drawerUnread = ref<number | undefined>(undefined);
const drawerFooter = ref('');

/**
 * 「未分派」标了 drill='people'，但未分派工单本就没有处理人，
 * 「下钻到人」语义上不成立 —— 故直接指向指派弹窗（与 X6 一致：数量看格、动作看弹窗）。
 */
type DrillTarget = DrillType | 'assign' | null;
function drillOf(key: string): DrillTarget {
  if (key === 'unassigned') return 'assign';
  const m = [...board.value.stock, ...board.value.metrics, ...board.value.flowEvents].find((x) => x.key === key);
  return (m?.drill as DrillType) ?? null;
}

function drawerConf(key: string) {
  const n = (k: string) => Number.parseInt(String(
    [...board.value.stock, ...board.value.flowEvents].find((x) => x.key === k)?.value ?? '0',
  ), 10) || 0;
  const map: Record<string, { title: string; subtitle: string; total: number; unread?: number; footer: string }> = {
    backlog: {
      title: '班组积压 · 优先级分布',
      subtitle: `${currentTeam.value.label} · 未结且未停表 · B1 八状态口径`,
      total: n('backlog'),
      footer: `在工单工作台查看这 ${n('backlog')} 单 →`,
    },
    urge: {
      title: '催单 · 补充单 · 按人员',
      subtitle: '组内催单与补充单，可查看未读分布',
      total: n('urge'),
      unread: 12,
      footer: `在工单工作台查看这 ${n('urge')} 单 →`,
    },
    returned: {
      title: '退回 · 按人员',
      subtitle: '仅技术支持退回（决策 D16）',
      total: n('returned'),
      footer: `在工单工作台查看这 ${n('returned')} 单 →`,
    },
    transferIn: {
      title: '今日转入 · 按来源',
      subtitle: '其他客服组 / 跨组调剂 / 售后回传',
      total: n('transferIn'),
      footer: `在工单工作台查看这 ${n('transferIn')} 单 →`,
    },
  };
  return map[key];
}

function openDrill(key: string, e?: MouseEvent) {
  e?.stopPropagation();
  const d = drillOf(key);
  if (!d) return;
  if (d === 'assign') {
    openAssign();
    return;
  }
  const c = drawerConf(key);
  if (!c) return;
  drawerKey.value = key;
  drawerType.value = d;
  drawerTitle.value = c.title;
  drawerSubtitle.value = c.subtitle;
  drawerTotal.value = c.total;
  drawerUnread.value = c.unread;
  drawerFooter.value = c.footer;
  drawerOpen.value = true;
}

const drawerPeople = computed(() => (drawerKey.value === 'urge' ? URGE_DRILL : RETURN_DRILL));

function onGoList(p: DrillGoListPayload) {
  router.push({ path: p.path, query: p.query });
}

/* ========================= ③ 指派 ========================= */

/** 待指派工单（8 单，与存量区「累计未分派 8」一致） */
const ASSIGN_TICKETS: AssignTicket[] = [
  { id: 'a1', no: 'LCMN-20260803-10021', customer: '莫某', type: '投诉', priority: 'P0', slaLeftMin: 26, createdAt: '08-03 09:12' },
  { id: 'a2', no: 'LCMN-20260803-10034', customer: '陈某', type: '咨询', priority: 'P2', slaLeftMin: 132, createdAt: '08-03 09:40' },
  { id: 'a3', no: 'LCMN-20260803-10047', customer: '李某', type: '报修', priority: 'P1', slaLeftMin: 74, createdAt: '08-03 10:05' },
  { id: 'a4', no: 'LCMN-20260803-10058', customer: '王某', type: '投诉', priority: 'P1', slaLeftMin: -18, createdAt: '08-03 08:31' },
  { id: 'a5', no: 'LCMN-20260803-10066', customer: '赵某', type: '建议', priority: 'P3', slaLeftMin: 320, createdAt: '08-03 10:22' },
  { id: 'a6', no: 'LCMN-20260803-10071', customer: '孙某', type: '咨询', priority: 'P2', slaLeftMin: 188, createdAt: '08-03 10:48' },
  { id: 'a7', no: 'LCMN-20260803-10085', customer: '周某', type: '退换', priority: 'P2', slaLeftMin: 95, createdAt: '08-03 11:03' },
  { id: 'a8', no: 'LCMN-20260803-10093', customer: '吴某', type: '投诉', priority: 'P0', slaLeftMin: 12, createdAt: '08-03 11:20' },
];

const assignOpen = ref(false);
const assignPreselect = ref<string[]>([]);
const assignRef = ref<InstanceType<typeof AssignModal> | null>(null);

function openAssign(preselect: string[] = []) {
  assignPreselect.value = preselect;
  assignOpen.value = true;
}

/** 原型阶段判全成功。接口就位后改为 setSubmitting(true) → 回调 applyResults(rows) 进部分失败态 */
function onAssignSubmit(p: AssignSubmitPayload) {
  assignRef.value?.setSubmitting(true);
  window.setTimeout(() => {
    assignRef.value?.setSubmitting(false);
    assignOpen.value = false;
    message.success(`已指派 ${p.ticketIds.length} 张工单给 ${p.targetName}`);
  }, 600);
}

function onTodoClick(key: string) {
  if (key === 'assign') openAssign();
  else router.push({ path: '/approval' }); // A4：看板只跳审批中心，不实现审批
}

/** 存量卡：读屏与 title，避免「标签+数字」粘成一串 */
function stockClickHint(key: string) {
  if (key === 'unassigned') return ''; // 卡内已有「去指派」按钮，不再叠角标
  return board.value.stock.find((x) => x.key === key)?.clickHint
    ?? (key === 'backlog' ? '优先级分布' : '');
}

function stockTitle(s: { key: string; label: string; clickHint?: string }) {
  if (s.key === 'unassigned') {
    return `${s.label}：点击卡片或「去指派」进入指派`;
  }
  if (s.key === 'backlog') {
    return `${s.label}：点击查看${s.clickHint ?? '优先级分布'}`;
  }
  return s.label;
}

function stockAria(s: {
  key: string;
  label: string;
  value: string;
  delta?: string;
  deltaHint?: string;
  sub?: string;
  balance?: { opening: number; inbound: number; closed: number };
  clickHint?: string;
}) {
  const parts = [`${s.label} ${s.value}`];
  if (s.delta && s.delta !== '0') {
    parts.push(`${s.deltaHint ?? '环比'} ${s.delta}`);
  }
  if (s.balance) {
    parts.push(
      `守恒 期初 ${s.balance.opening} 加进线 ${s.balance.inbound} 减结案 ${s.balance.closed}`,
    );
  } else if (s.sub) {
    parts.push(s.sub);
  }
  if (s.key === 'unassigned') {
    parts.push('可点「去指派」或卡片进入指派');
  } else {
    const hint = stockClickHint(s.key);
    if (hint) parts.push(`点击${hint}`);
  }
  return parts.join('，');
}

function todoTitle(key: string) {
  if (key === 'assign') {
    return '进入指派（数量与本卡「累计未分派」一致）';
  }
  if (key === 'approve') {
    return '跳转审批中心（看板内不审批）';
  }
  return '';
}

/* ========================= ④ 明细卡 ========================= */

type Tab = 'perf' | 'load' | 'problem';
const tab = ref<Tab>('perf');
const TABS: [Tab, string][] = [
  ['perf', '效能排行'],
  ['load', '组员负载'],
  ['problem', '问题 TOP10'],
];

type SortKey = 'name' | 'online' | 'forwardToday' | 'avgHandle' | 'overdue' | 'followRate' | 'csat' | 'resolveRate' | 'reviewRate';
type SortDir = 'asc' | 'desc' | null;

const COLS: { key: SortKey; label: string; w: string; num: boolean; firstDir: 'asc' | 'desc' }[] = [
  { key: 'name', label: '组员', w: '1.1fr', num: false, firstDir: 'asc' },
  { key: 'online', label: '状态', w: '78px', num: false, firstDir: 'asc' },
  { key: 'forwardToday', label: '下送', w: '64px', num: true, firstDir: 'desc' },
  { key: 'avgHandle', label: '均处理', w: '76px', num: true, firstDir: 'desc' },
  /* 列宽须容得下「表头文字 + 12px 排序图标」，否则表头会竖排折行（超时/满意度都踩过） */
  { key: 'overdue', label: '超时', w: '70px', num: true, firstDir: 'desc' },
  { key: 'followRate', label: '跟进率', w: '82px', num: true, firstDir: 'asc' },
  { key: 'csat', label: '满意度', w: '82px', num: true, firstDir: 'asc' },
  { key: 'resolveRate', label: '解决率', w: '82px', num: true, firstDir: 'asc' },
  { key: 'reviewRate', label: '参评率', w: '82px', num: true, firstDir: 'asc' },
];
const gridCols = COLS.map((c) => c.w).join(' ');

const sortKey = ref<SortKey | null>(null);
const sortDir = ref<SortDir>(null);
const ONLINE_ORDER: Record<string, number> = { 离线: 0, 小休: 1, 在线: 2 };
const ONLINE_COLOR: Record<string, string> = { 在线: '#10B981', 小休: '#F59E0B', 离线: '#9CA3AF' };

function numOf(v: string | number): number {
  if (typeof v === 'number') return v;
  const m = String(v).match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : 0;
}

/** 默认排序：超时 desc → 跟进率 asc → 下送 desc（三级键，健康日不退化为无序） */
function defaultCompare(a: MemberRow, b: MemberRow) {
  if (a.overdue !== b.overdue) return b.overdue - a.overdue;
  const fa = numOf(a.followRate);
  const fb = numOf(b.followRate);
  if (fa !== fb) return fa - fb;
  return b.forwardToday - a.forwardToday;
}

/** 负载分布卡联动：点某档过滤表格 */
const loadFilter = ref<LoadLevel | null>(null);
const levelOf = (m: MemberRow): LoadLevel => (m.loadLevel as LoadLevel) ?? loadLevelOf(m.workload);

const sortedMembers = computed(() => {
  let rows = [...board.value.members];
  if (loadFilter.value) rows = rows.filter((r) => levelOf(r) === loadFilter.value);
  if (!sortKey.value || !sortDir.value) return rows.sort(defaultCompare);
  const k = sortKey.value;
  const dir = sortDir.value === 'asc' ? 1 : -1;
  return rows.sort((a, b) => {
    let r: number;
    if (k === 'name') r = a.name.localeCompare(b.name, 'zh');
    else if (k === 'online') r = ONLINE_ORDER[a.online] - ONLINE_ORDER[b.online];
    else r = numOf(a[k] as string | number) - numOf(b[k] as string | number);
    return r * dir || defaultCompare(a, b);
  });
});

/** 三态循环：默认 → 首点方向 → 反向 → 回默认 */
function toggleSort(c: (typeof COLS)[number]) {
  if (sortKey.value !== c.key) {
    sortKey.value = c.key;
    sortDir.value = c.firstDir;
  } else if (sortDir.value === c.firstDir) {
    sortDir.value = c.firstDir === 'asc' ? 'desc' : 'asc';
  } else {
    sortKey.value = null;
    sortDir.value = null;
  }
}

/** 默认态下「超时」列渲染为降序高亮态，让用户知道当前顺序从何而来 */
function colState(c: (typeof COLS)[number]): { active: boolean; dir: SortDir } {
  if (!sortKey.value) return { active: c.key === 'overdue', dir: c.key === 'overdue' ? 'desc' : null };
  return { active: sortKey.value === c.key, dir: sortKey.value === c.key ? sortDir.value : null };
}

function sortTip(c: (typeof COLS)[number]) {
  if (colState(c).active && sortKey.value) return '再次点击恢复默认排序';
  return c.firstDir === 'desc' ? `点击按${c.label}从高到低` : `点击按${c.label}从低到高`;
}

/* ========================= ⑤ 趋势卡 ========================= */

const gran = ref<'hour' | 'day'>('day');
const trafficPoints = computed(() => {
  const base = gran.value === 'hour' ? TRAFFIC_HOURLY : TRAFFIC_DAILY;
  const s = board.value.trafficScale;
  if (s === 1) return base;
  return base.map((p) => ({
    t: p.t,
    inbound: Math.round(p.inbound * s),
    forward: Math.round(p.forward * s),
    closed: Math.round(p.closed * s),
  }));
});

/**
 * 结案画虚线：稳态下结案与进线几乎重合（这正是「收支平衡」的表现），
 * 两条实线叠在一起会互相遮蔽，读者分不清是一条还是两条。
 */
const SERIES: { key: SeriesKey; label: string; color: string; dash?: string }[] = [
  { key: 'inbound', label: '进线', color: '#1A6FFF' },
  { key: 'forward', label: '下送', color: '#10B981' },
  { key: 'closed', label: '结案', color: '#8B5CF6', dash: '5 3' },
];

const trendTitle = computed(() => {
  const s = SERIES.find((x) => x.key === focusKey.value);
  return s ? `${s.label}趋势` : '进线 · 下送 · 结案';
});

const W = 400;
const H = 150;

/** 三线共用同一 Y 轴刻度，否则线之间的高低差没有可比性 */
const yMax = computed(() =>
  Math.max(1, ...trafficPoints.value.flatMap((p) => [p.inbound, p.forward, p.closed])),
);

function toPath(vals: number[]) {
  if (!vals.length) return '';
  const step = vals.length > 1 ? W / (vals.length - 1) : W;
  return vals
    .map((v, i) => `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(1)},${(H - (v / yMax.value) * (H - 12)).toFixed(1)}`)
    .join(' ');
}

const paths = computed(() =>
  SERIES.map((s) => ({
    ...s,
    d: toPath(trafficPoints.value.map((p) => p[s.key])),
    dim: !!focusKey.value && focusKey.value !== s.key,
  })),
);

const axisLabels = computed(() => {
  const ps = trafficPoints.value;
  const idx = [0, Math.floor(ps.length / 4), Math.floor(ps.length / 2), Math.floor((ps.length * 3) / 4), ps.length - 1];
  return idx.map((i) => ps[i]?.t ?? '');
});

/* ========================= ⑥ 负载分布卡 ========================= */

const loadDist = computed(() => {
  const g: Record<LoadLevel, number> = { 空闲: 0, 适中: 0, 满载: 0 };
  board.value.members.forEach((m) => {
    g[levelOf(m)] += 1;
  });
  return [
    { level: '空闲' as LoadLevel, count: g.空闲, hint: '≤5 单' },
    { level: '适中' as LoadLevel, count: g.适中, hint: '6–12 单' },
    { level: '满载' as LoadLevel, count: g.满载, hint: '>12 单' },
  ];
});

function toggleLoadFilter(l: LoadLevel) {
  loadFilter.value = loadFilter.value === l ? null : l;
}

function onExport() {
  message.info(`导出「${currentTeam.value.label}」绩效报表`);
}

watch(teamId, () => {
  focusKey.value = null;
  flowOpen.value = false;
  loadFilter.value = null;
  drawerOpen.value = false;
  sortKey.value = null;
  sortDir.value = null;
});
</script>

<template>
  <div class="tb">
    <!-- ⓪ 问候卡：布局对齐个人门户 greeting-card；右侧为班组切换 + 去指派 -->
    <div class="greeting-card">
      <div class="greeting-text">
        <div class="greeting-title">
          {{ greeting }}
          <span class="greeting-wave" aria-hidden="true">👋</span>
        </div>
        <div class="greeting-sub">
          <template v-for="(p, i) in summaryParts" :key="i">
            <span v-if="p.tone === 'plain'">{{ p.text }}</span>
            <span v-else class="summary-chip" :class="p.tone">{{ p.text }}</span>
          </template>
        </div>
      </div>
      <div class="greeting-aside">
        <div class="section-filters">
          <div class="filter-item">
            <span class="filter-label">班组</span>
            <a-select
              v-model:value="teamId"
              size="small"
              :options="teamOptions"
              class="team-select"
              :dropdown-match-select-width="false"
            />
          </div>
          <span class="filter-meta">管辖 {{ LEADER_TEAMS.length }} 组</span>
        </div>
      </div>
    </div>

    <!-- ① 存量区：对齐个人门户 overview-section；区头右侧放行动（同问候区 CTA） -->
    <section class="overview-section ov" aria-labelledby="ov-title">
      <div class="section-head">
        <div class="section-head-main">
          <h2 id="ov-title" class="section-title">存量 · 待清理</h2>
          <p class="section-sub">
            <span class="ov-team">{{ currentTeam.label }}</span>
            <span class="ov-dot" aria-hidden="true">·</span>
            <span>先清未分派，再清积压</span>
          </p>
        </div>
        <div class="section-head-aside">
          <div class="ov-actions" role="group" aria-label="次级待办">
            <button
              v-for="t in secondaryTodos"
              :key="t.key"
              type="button"
              class="sec-chip"
              :title="todoTitle(t.key)"
              :aria-label="`${t.label} ${t.count}${t.unit}`"
              @click="onTodoClick(t.key)"
            >
              {{ t.label }} <em>{{ t.count }}</em>
            </button>
          </div>
        </div>
      </div>
      <div class="kpi-strip stock-strip" role="list" aria-label="存量指标">
        <div
          v-for="s in board.stock"
          :key="s.key"
          role="listitem"
          class="kpi-card"
          :class="{
            drillable: !!drillOf(s.key),
            'tone-risk': s.deltaTone === 'bad',
            'has-cta': s.key === 'unassigned',
          }"
          :style="{ '--kpi-accent': s.valueColor || s.iconColor || '#94a3b8' }"
          tabindex="0"
          :title="stockTitle(s)"
          :aria-label="stockAria(s)"
          @click="openDrill(s.key)"
          @keydown.enter.prevent="openDrill(s.key)"
          @keydown.space.prevent="openDrill(s.key)"
        >
          <div class="kpi-body">
            <div class="kpi-label">
              <span class="kpi-label-text">{{ s.label }}</span>
              <span v-if="stockClickHint(s.key)" class="kpi-hint" aria-hidden="true">
                {{ stockClickHint(s.key) }}
                <RightOutlined />
              </span>
            </div>
            <div class="kpi-value-row">
              <span class="kpi-value" :style="{ color: s.valueColor || '#111827' }">{{ s.value }}</span>
              <span
                v-if="s.delta"
                class="kpi-delta"
                :class="[s.deltaTone, { emph: s.key === 'backlog' && s.deltaTone === 'bad' }]"
                :title="s.deltaHint || undefined"
              >
                <template v-if="s.key === 'backlog' && s.deltaHint">{{ s.deltaHint }} {{ s.delta }}</template>
                <template v-else>{{ s.delta }}</template>
              </span>
            </div>
            <div v-if="s.balance" class="kpi-eq" aria-hidden="true">
              <span>期初 {{ s.balance.opening }}</span>
              <span class="op">＋</span>
              <span>进线 {{ s.balance.inbound }}</span>
              <span class="op">−</span>
              <span>结案 {{ s.balance.closed }}</span>
            </div>
            <div v-else-if="s.sub" class="kpi-sub">{{ s.sub }}</div>
          </div>
          <button
            v-if="s.key === 'unassigned'"
            type="button"
            class="btn-primary btn-in-card"
            :title="todoTitle('assign')"
            :aria-label="`去指派 ${s.value} 单`"
            @click.stop="onTodoClick('assign')"
          >
            <UserAddOutlined />
            去指派 {{ s.value }}
          </button>
        </div>
      </div>
    </section>

    <!-- ② 今日指标：同 overview-section；6 卡全宽等分（数量 | 率值），流转折叠 -->
    <section class="overview-section today" aria-labelledby="today-title">
      <div class="section-head">
        <div class="section-head-main">
          <h2 id="today-title" class="section-title">今日指标</h2>
          <p class="section-sub">承接 → 产出 → 终结 · 右侧质量与时效 · 点数量卡聚焦趋势</p>
        </div>
        <span class="snapshot-badge soft">准实时</span>
      </div>

      <div class="kpi-strip today-strip" role="list" aria-label="今日指标">
        <div
          v-for="m in COUNT_METRICS"
          :key="m.key"
          role="listitem"
          class="kpi-card interactive"
          :class="{ on: focusKey === m.key, 'tone-gain': m.deltaTone === 'good', 'tone-risk': m.deltaTone === 'bad' && m.key === 'closed' }"
          :style="{ '--kpi-accent': m.valueColor || m.iconColor || '#1A6FFF' }"
          tabindex="0"
          :title="`点击在趋势图中聚焦「${m.label}」`"
          :aria-label="`${m.label} ${m.value}${m.delta ? '，' + m.delta : ''}，${m.sub || ''}，点击聚焦趋势`"
          @click="toggleFocus(m.key)"
          @keydown.enter.prevent="toggleFocus(m.key)"
          @keydown.space.prevent="toggleFocus(m.key)"
        >
          <div class="kpi-body">
            <div class="kpi-label">
              <span class="kpi-label-text">{{ m.label }}</span>
              <LineChartOutlined v-if="focusKey === m.key" class="kpi-sel" />
            </div>
            <div class="kpi-value-row">
              <span class="kpi-value" :style="{ color: m.valueColor || '#0f172a' }">{{ m.value }}</span>
              <span v-if="m.delta" class="kpi-delta" :class="m.deltaTone">{{ m.delta }}</span>
            </div>
            <div class="kpi-sub">{{ m.sub }}</div>
          </div>
        </div>

        <div class="kpi-strip-sep" role="separator" aria-hidden="true" />

        <div
          v-for="m in RATE_METRICS"
          :key="m.key"
          role="listitem"
          class="kpi-card static"
          :style="{ '--kpi-accent': m.valueColor || m.iconColor || '#94a3b8' }"
          :title="m.sub"
          :aria-label="`${m.label} ${m.value}${m.delta ? '，' + m.delta : ''}，${m.sub || ''}`"
        >
          <div class="kpi-body">
            <div class="kpi-label">
              <span class="kpi-label-text">{{ m.label }}</span>
            </div>
            <div class="kpi-value-row">
              <span class="kpi-value" :style="{ color: m.valueColor || '#0f172a' }">{{ m.value }}</span>
              <span v-if="m.delta" class="kpi-delta" :class="m.deltaTone">{{ m.delta }}</span>
            </div>
            <div class="kpi-sub">{{ m.sub }}</div>
          </div>
        </div>
      </div>

      <!--
        流转事件（需求模块1 第 5/6/7 条：催单·补充 / 退回 / 转入）
        ⚠️ 曾默认折叠，导致需求方在稿子上找不到这三项 —— 已改为**默认展开**。
        视觉上仍弱于主指标（小字号、无大数字），但不再需要点开才能看见。
      -->
      <div class="flow-wrap">
        <button type="button" class="flow-toggle" @click="flowOpen = !flowOpen">
          <span>流转事件</span>
          <span class="flow-n">{{ flowTotal }}</span>
          <CaretDownOutlined class="flow-caret" :class="{ open: flowOpen }" />
        </button>
        <div v-if="flowOpen" class="flowbar">
          <button v-for="f in board.flowEvents" :key="f.key" class="fb-item" @click="openDrill(f.key, $event)">
            <span class="fb-l">{{ f.label }}</span>
            <span class="fb-v" :style="{ color: f.iconColor }">{{ f.value }}</span>
            <span v-if="f.sub" class="fb-s">{{ f.sub }}</span>
            <RightOutlined class="fb-go" />
          </button>
        </div>
      </div>
    </section>

    <!-- ③ 主体 -->
    <div class="body">
      <div class="card detail">
        <div class="card-hd">
          <div class="hd-l">
            <span class="hd-title">组员明细</span>
            <div class="tabs">
              <div v-for="t in TABS" :key="t[0]" class="tab" :class="{ on: tab === t[0] }" @click="tab = t[0]">
                {{ t[1] }}
              </div>
            </div>
          </div>
          <div class="hd-r">
            <button class="btn-ghost" @click="onExport"><ExportOutlined /> 导出</button>
            <button class="btn-ghost"><SettingOutlined /> 设置指标</button>
            <span class="badge">准实时 5min</span>
          </div>
        </div>

        <!-- 效能排行 -->
        <div v-if="tab === 'perf'" class="tbl">
          <div class="thead" :style="{ gridTemplateColumns: gridCols }">
            <div
              v-for="c in COLS"
              :key="c.key"
              class="th"
              :class="{ active: colState(c).active, num: c.num }"
              :title="sortTip(c)"
              @click="toggleSort(c)"
            >
              {{ c.label }}
              <CaretUpOutlined v-if="colState(c).dir === 'asc'" class="s-ic on" />
              <CaretDownOutlined v-else-if="colState(c).dir === 'desc'" class="s-ic on" />
              <SwapOutlined v-else class="s-ic rot" />
            </div>
          </div>
          <div v-for="r in sortedMembers" :key="r.id" class="trow" :style="{ gridTemplateColumns: gridCols }">
            <div class="td" :class="{ colon: colState(COLS[0]).active }">{{ r.name }}</div>
            <div class="td" :class="{ colon: colState(COLS[1]).active }">
              <i class="dot" :style="{ background: ONLINE_COLOR[r.online] }" />{{ r.online }}
            </div>
            <div class="td num" :class="{ colon: colState(COLS[2]).active }">{{ r.forwardToday }}</div>
            <div class="td num" :class="{ colon: colState(COLS[3]).active }">{{ r.avgHandle }}</div>
            <div class="td num" :class="[{ colon: colState(COLS[4]).active }, r.overdue > 2 ? 'danger' : '']">{{ r.overdue }}</div>
            <div class="td num" :class="{ colon: colState(COLS[5]).active }">{{ r.followRate }}</div>
            <div class="td num" :class="{ colon: colState(COLS[6]).active }">{{ r.csat }}</div>
            <div class="td num" :class="{ colon: colState(COLS[7]).active }">{{ r.resolveRate }}</div>
            <div class="td num" :class="{ colon: colState(COLS[8]).active }">{{ r.reviewRate }}</div>
          </div>
        </div>

        <!-- 组员负载 -->
        <div v-else-if="tab === 'load'" class="tbl">
          <div class="thead load-grid">
            <div class="th">组员</div>
            <div class="th">在线状态</div>
            <div class="th num">在办工单</div>
            <div class="th">负载</div>
            <div class="th num">今日下送</div>
            <div class="th">操作</div>
          </div>
          <div v-for="r in sortedMembers" :key="r.id" class="trow load-grid">
            <div class="td">{{ r.name }}</div>
            <div class="td"><i class="dot" :style="{ background: ONLINE_COLOR[r.online] }" />{{ r.online }}</div>
            <div class="td num">{{ r.workload }}</div>
            <div class="td">
              <div class="lbar">
                <i :style="{ width: Math.min(100, (r.workload / 16) * 100) + '%', background: LOAD_STYLE[levelOf(r)].color }" />
              </div>
              <span class="ltag" :style="{ color: LOAD_STYLE[levelOf(r)].color, background: LOAD_STYLE[levelOf(r)].bg }">
                {{ levelOf(r) }}
              </span>
            </div>
            <div class="td num">{{ r.forwardToday }}</div>
            <div class="td"><a class="link" @click="openAssign()">指派</a></div>
          </div>
        </div>

        <!-- 问题 TOP10 -->
        <div v-else class="tbl">
          <div class="thead prob-grid">
            <div class="th">#</div>
            <div class="th">问题分类（二级）</div>
            <div class="th num">工单量</div>
            <div class="th">占比</div>
            <div class="th num">环比</div>
            <div class="th">已沉淀方案</div>
            <div class="th">操作</div>
          </div>
          <div v-for="p in PROBLEM_TOP10" :key="p.rank" class="trow prob-grid">
            <div class="td num">{{ p.rank }}</div>
            <div class="td">{{ p.category }}</div>
            <div class="td num">{{ p.count }}</div>
            <div class="td">
              <div class="pbar"><i :style="{ width: Math.min(100, p.ratio * 4) + '%' }" /></div>
              <span class="pnum">{{ p.ratio.toFixed(1) }}%</span>
            </div>
            <div class="td num" :class="p.mom.startsWith('+') ? 'danger' : 'good'">{{ p.mom }}</div>
            <div class="td">
              <CheckCircleFilled v-if="p.solved" style="color: #10b981" />
              <MinusCircleOutlined v-else style="color: #9ca3af" />
              <span class="solved-t">{{ p.solved ? '已沉淀' : '待沉淀' }}</span>
            </div>
            <div class="td">
              <a class="link" @click="router.push({ path: '/tickets/list', query: { category: p.category } })">查看工单</a>
            </div>
          </div>
        </div>

        <div class="card-ft">
          <span v-if="tab === 'perf'">
            默认排序：超时降序 → 跟进率升序 → 下送降序 · 任意字段可升降序 · 组内共 {{ board.members.length }} 人
          </span>
          <span v-else-if="tab === 'load'">
            负载阈值：空闲 ≤5 / 适中 6–12 / 满载 &gt;12（暂定，待业务确认）· 点右侧分布卡可筛选
          </span>
          <span v-else>
            分类粒度＝二级（按哪级聚合待业务确认）·「已沉淀方案」用于追踪一线前置解答的落实情况
          </span>
        </div>
      </div>

      <!-- 右列：X5 抽屉打开时降透明并禁用，不做位移 -->
      <div class="rightcol" :class="{ dim: drawerOpen }">
        <div class="card trend">
          <div class="trend-hd">
            <div class="trend-hd-main">
              <div class="trend-title">{{ trendTitle }}</div>
              <div class="trend-sub">
                {{ gran === 'hour' ? '当日时段' : '近 30 天' }}
                <span class="trend-dot">·</span>
                {{ focusKey ? '再次点该卡取消聚焦' : '点上方数量卡可聚焦单线' }}
              </div>
            </div>
            <div class="hd-r">
              <div class="seg">
                <div class="seg-i" :class="{ on: gran === 'hour' }" @click="gran = 'hour'">时</div>
                <div class="seg-i" :class="{ on: gran === 'day' }" @click="gran = 'day'">日</div>
              </div>
              <span class="badge soft">离线 T+1</span>
            </div>
          </div>
          <!-- 结论先行：图上能看出的事，用一句话替读者说完 -->
          <div class="concl">
            <span class="concl-mark" />
            <span>{{ board.conclusion }}</span>
          </div>
          <div class="legend">
            <span v-for="s in paths" :key="s.key" :class="{ dim: s.dim }">
              <!-- 图例条也要跟着虚实变化，否则图上是虚线、图例是实线，对不上 -->
              <i
                :style="s.dash
                  ? { background: `repeating-linear-gradient(90deg, ${s.color} 0 4px, transparent 4px 7px)` }
                  : { background: s.color }"
              />{{ s.label }}
            </span>
          </div>
          <div class="chart-wrap">
            <svg class="chart" :viewBox="`0 0 ${W} ${H}`" preserveAspectRatio="none">
              <line v-for="y in [0.25, 0.5, 0.75]" :key="y" x1="0" :y1="H * y" :x2="W" :y2="H * y" stroke="#EEF2F7" stroke-width="1" />
              <path
                v-for="s in paths"
                :key="s.key"
                :d="s.d"
                fill="none"
                :stroke="s.color"
                :stroke-width="s.dim ? 1.5 : 2"
                :stroke-dasharray="s.dash"
                :opacity="s.dim ? 0.22 : 1"
                stroke-linejoin="round"
                stroke-linecap="round"
              />
            </svg>
          </div>
          <div class="axis"><span v-for="(a, i) in axisLabels" :key="i">{{ a }}</span></div>
          <div class="trend-ft">期初积压 {{ board.openingBacklog }} ＋ 进线 − 结案 ＝ 当前积压，进线线与结案线之间的面积即积压增量</div>
        </div>

        <div class="card load">
          <div class="load-hd">
            <span class="hd-title">组员负载分布</span>
            <span class="badge soft">实时 60s</span>
          </div>
          <div class="ld-row">
            <div
              v-for="d in loadDist"
              :key="d.level"
              class="ld-cell"
              :class="{ on: loadFilter === d.level }"
              :style="{ '--ld-c': LOAD_STYLE[d.level].color, '--ld-bg': LOAD_STYLE[d.level].bg }"
              @click="toggleLoadFilter(d.level)"
            >
              <div class="ld-v">
                {{ d.count }}<span class="ld-u">人</span>
              </div>
              <div class="ld-l"><b>{{ d.level }}</b> {{ d.hint }}</div>
            </div>
          </div>
          <div class="ld-ft">{{ loadFilter ? `已筛选「${loadFilter}」，再点取消` : '点某档可筛选左侧组员表' }}</div>
        </div>
      </div>
    </div>

    <DrillDrawer
      v-model:open="drawerOpen"
      :type="drawerType"
      :title="drawerTitle"
      :subtitle="drawerSubtitle"
      :total="drawerTotal"
      :total-unread="drawerUnread"
      :buckets="board.priorityBuckets"
      :people="drawerPeople"
      :sources="TRANSFER_DRILL"
      :footer-text="drawerFooter"
      @go-list="onGoList"
      @assign="(r) => openAssign([r.id])"
    />
    <AssignModal
      ref="assignRef"
      v-model:open="assignOpen"
      :preselected-ids="assignPreselect"
      :candidates="board.members"
      :tickets="ASSIGN_TICKETS"
      :can-cross-team="true"
      @submit="onAssignSubmit"
    />
  </div>
</template>

<style scoped>
/* 页壳对齐个人门户 home-overview */
.tb {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 24px;
  min-height: 100%;
  width: 100%;
  min-width: 0;
  background:
    radial-gradient(ellipse 80% 40% at 0% 0%, rgba(26, 111, 255, 0.08), transparent 55%),
    radial-gradient(ellipse 60% 30% at 100% 8%, rgba(16, 185, 129, 0.05), transparent 50%),
    #f3f6fb;
}
/* 问候卡：对齐个人门户 greeting-card */
.greeting-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 22px 24px;
  gap: 16px;
  border-radius: 16px;
  border: 1px solid rgba(26, 111, 255, 0.18);
  background:
    linear-gradient(135deg, #eff6ff 0%, #f8fbff 48%, #ecfdf5 100%);
  box-shadow: 0 4px 16px rgba(26, 111, 255, 0.08);
}
.greeting-text { min-width: 0; flex: 1; }
.greeting-title {
  font-size: 22px;
  font-weight: 800;
  color: #0f172a;
  letter-spacing: -0.02em;
  line-height: 1.25;
}
.greeting-wave {
  display: inline-block;
  transform-origin: 70% 70%;
  animation: wave-hi 1.6s ease-in-out 1;
}
@keyframes wave-hi {
  0%, 100% { transform: rotate(0deg); }
  20% { transform: rotate(14deg); }
  40% { transform: rotate(-8deg); }
  60% { transform: rotate(10deg); }
  80% { transform: rotate(-4deg); }
}
.greeting-sub {
  margin-top: 10px;
  font-size: 13px;
  color: #64748b;
  line-height: 1.65;
}
.summary-chip {
  display: inline;
  font-weight: 700;
  padding: 1px 0;
}
.summary-chip.risk { color: #c2410c; }
.summary-chip.gain { color: #047857; }
.greeting-aside {
  display: flex;
  align-items: center;
  flex: none;
}
/* 与个人门户「我的效能」section-filters 同语汇 */
.section-filters {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px 12px;
  padding: 6px 10px;
  background: rgba(255, 255, 255, 0.72);
  border: 1px solid #eef2f7;
  border-radius: 10px;
}
.filter-item {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.filter-label {
  flex: none;
  font-size: 12px;
  font-weight: 500;
  color: #9ca3af;
  line-height: 1;
}
.filter-meta {
  font-size: 11px;
  color: #94a3b8;
  font-weight: 500;
  padding-left: 4px;
  border-left: 1px solid #e5e7eb;
  line-height: 1;
}
.team-select {
  width: 148px;
}
.team-select :deep(.ant-select-selector) {
  border-radius: 8px !important;
  border-color: #e5e7eb !important;
  background: #fff !important;
  height: 28px !important;
  padding-inline: 10px !important;
  align-items: center;
}
.team-select :deep(.ant-select-selection-item),
.team-select :deep(.ant-select-selection-placeholder) {
  font-size: 12px !important;
  font-weight: 500 !important;
  color: #374151 !important;
  line-height: 26px !important;
}
.team-select :deep(.ant-select-arrow) {
  font-size: 10px;
  color: #9ca3af;
}

/* 卡片基线：与个人门户 overview-section / card 对齐 */
.card {
  background: #fff;
  border: 0.8px solid #e5e6eb;
  border-radius: 16px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
}

/* ============ 共享：overview-section（对齐个人门户今日概览） ============ */
.overview-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px 16px;
  background: #fff;
  border: 0.8px solid #e5e6eb;
  border-radius: 16px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
}
.section-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}
.section-head-main { min-width: 0; }
.section-title {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  color: #111827;
  line-height: 1.3;
}
.section-sub {
  margin: 2px 0 0;
  font-size: 11px;
  color: #9ca3af;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
}
.section-head-aside {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  flex: none;
}
.ov-team { color: #64748b; font-weight: 500; }
.ov-dot { color: #d1d5db; }
.snapshot-badge {
  flex: none;
  font-size: 11px;
  font-weight: 700;
  color: #1a6fff;
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  border-radius: 999px;
  padding: 3px 10px;
  line-height: 1.2;
  cursor: help;
}
.snapshot-badge.soft {
  color: #94a3b8;
  background: #f8fafc;
  border-color: #eef2f7;
  cursor: default;
}

/* KPI 条：个人门户同款 */
.kpi-strip {
  display: grid;
  gap: 8px;
  min-width: 0;
}
.stock-strip {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.today-strip {
  grid-template-columns: repeat(3, minmax(0, 1fr)) 1px repeat(3, minmax(0, 1fr));
  align-items: stretch;
}
.kpi-strip-sep {
  width: 1px;
  background: #eef2f7;
  align-self: stretch;
  margin: 4px 0;
}
.kpi-card {
  position: relative;
  min-height: 72px;
  padding: 10px 10px 10px 12px;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
  overflow: hidden;
  outline: none;
  transition: border-color 0.15s, box-shadow 0.15s, transform 0.15s;
}
.kpi-card::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  background: var(--kpi-accent, #94a3b8);
  border-radius: 10px 0 0 10px;
}
.kpi-card.tone-risk {
  background: linear-gradient(180deg, #fffaf5 0%, #fff 70%);
}
.kpi-card.tone-gain {
  background: linear-gradient(180deg, #f0fdf4 0%, #fff 70%);
}
.kpi-card.drillable,
.kpi-card.interactive {
  cursor: pointer;
}
.kpi-card.has-cta {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-right: 12px;
}
.kpi-card.has-cta .kpi-body {
  flex: 1;
  min-width: 0;
}
.kpi-card.drillable:hover,
.kpi-card.interactive:hover {
  border-color: #cbd5e1;
  box-shadow: 0 4px 12px rgba(15, 23, 42, 0.07);
  transform: translateY(-1px);
}
.kpi-card.interactive.on {
  background: #eff6ff;
  border-color: #bfdbfe;
}
.kpi-card.interactive.on .kpi-label-text {
  color: #1a6fff;
  font-weight: 600;
}
.kpi-card.static { cursor: default; }
.kpi-card:focus-visible { box-shadow: 0 0 0 2px #1a6fff; }
.kpi-body { min-width: 0; }
.kpi-label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  margin-bottom: 6px;
  min-width: 0;
}
.kpi-label-text {
  font-size: 12px;
  color: #9ca3af;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.kpi-hint {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-size: 10px;
  font-weight: 500;
  color: #94a3b8;
  white-space: nowrap;
  flex: none;
}
.kpi-card.drillable:hover .kpi-hint { color: #1a6fff; }
.kpi-sel { font-size: 11px; color: #1a6fff; flex: none; }
.kpi-value-row {
  display: flex;
  align-items: baseline;
  gap: 6px;
  white-space: nowrap;
}
.kpi-value {
  font-size: 24px;
  font-weight: 700;
  line-height: 1;
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
}
.kpi-card.tone-risk .kpi-value { font-weight: 800; }
.kpi-delta { font-size: 11px; font-weight: 600; }
.kpi-delta.emph { font-size: 12px; font-weight: 700; }
.kpi-delta.good { color: #10b981; }
.kpi-delta.bad { color: #ef4444; }
.kpi-delta.neutral { color: #94a3b8; }
.kpi-sub {
  margin-top: 4px;
  font-size: 11px;
  color: #94a3b8;
  line-height: 15px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.kpi-eq {
  margin-top: 5px;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 3px;
  font-size: 10px;
  color: #cbd5e1;
  line-height: 1.3;
  font-variant-numeric: tabular-nums;
}
.kpi-eq .op {
  color: #e2e8f0;
  margin: 0 1px;
}

/* 存量区头行动：对齐个人门户问候区右侧 CTA */
.ov-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
.btn-primary {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 32px;
  padding: 0 14px;
  font-size: 13px;
  font-weight: 700;
  color: #fff;
  background: linear-gradient(180deg, #3b82f6 0%, #1a6fff 100%);
  border: none;
  border-radius: 10px;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(26, 111, 255, 0.28);
  transition: transform 0.15s, box-shadow 0.15s, filter 0.15s;
}
.btn-primary:hover {
  filter: brightness(1.04);
  box-shadow: 0 6px 16px rgba(26, 111, 255, 0.34);
  transform: translateY(-1px);
}
.btn-in-card {
  flex: none;
  height: 36px;
  padding: 0 16px;
  border-radius: 8px;
}
@media (max-width: 860px) {
  .greeting-card {
    flex-direction: column;
    align-items: stretch;
  }
  .greeting-aside {
    align-items: stretch;
  }
  .kpi-card.has-cta {
    flex-wrap: wrap;
  }
}
.sec-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 28px;
  padding: 0 10px;
  border: 1px solid #e5e7eb;
  border-radius: 999px;
  background: #fff;
  font-size: 12px;
  color: #64748b;
  cursor: pointer;
  font-family: inherit;
}
.sec-chip em {
  font-style: normal;
  font-weight: 700;
  color: #d97706;
}
.sec-chip:hover {
  border-color: #bfdbfe;
  color: #1a6fff;
}

@media (max-width: 960px) {
  .today-strip {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  .kpi-strip-sep { display: none; }
}
@media (max-width: 640px) {
  .stock-strip,
  .today-strip {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .section-head-aside {
    width: 100%;
    justify-content: space-between;
  }
}

/* 流转事件 —— 默认折叠 */
.flow-wrap {
  margin-top: 2px;
  padding-top: 8px;
  border-top: 1px dashed #eef2f7;
}
.flow-toggle {
  display: inline-flex; align-items: center; gap: 6px;
  border: none; background: none; padding: 2px 0;
  font-size: 12px; color: #94a3b8; cursor: pointer; font-family: inherit;
}
.flow-toggle:hover { color: #64748b; }
.flow-n {
  font-size: 11px; font-weight: 700; color: #64748b;
  background: #f1f5f9; border-radius: 8px; padding: 0 6px; line-height: 16px;
}
.flow-caret { font-size: 10px; transition: transform 150ms; }
.flow-caret.open { transform: rotate(180deg); }
.flowbar {
  display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
  margin-top: 6px;
}
.fb-item {
  display: flex; align-items: center; gap: 6px;
  padding: 4px 8px; background: transparent; border: 1px solid transparent;
  border-radius: 6px; cursor: pointer;
}
.fb-item:hover { background: #f9fafb; border-color: #eef2f7; }
.fb-item:hover .fb-go { opacity: 1; }
.fb-l { font-size: 12px; color: #64748b; }
.fb-v { font-size: 13px; font-weight: 700; font-variant-numeric: tabular-nums; }
.fb-s { font-size: 11px; color: #b6bec9; }
.fb-go { font-size: 10px; color: #cbd5e1; opacity: 0; transition: opacity 120ms; }

/* ============ ③ 主体 ============ */
.body { display: flex; gap: 12px; flex: 1; min-height: 0; align-items: stretch; }
.card { display: flex; flex-direction: column; min-height: 0; }
.detail { flex: 1; min-width: 0; overflow: hidden; }
.rightcol {
  width: 380px; flex: none; display: flex; flex-direction: column; gap: 12px;
  transition: opacity 180ms ease;
}
.rightcol.dim { opacity: 0.35; pointer-events: none; }

.card-hd {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 16px; border-bottom: 1px solid #eef2f7;
}
.hd-l { display: flex; align-items: center; gap: 12px; min-width: 0; }
.hd-r { display: flex; align-items: center; gap: 8px; flex: none; }
.hd-title { font-size: 14px; font-weight: 600; color: #0f172a; }
.tabs { display: flex; background: #f1f5f9; border-radius: 7px; padding: 2px; gap: 2px; }
.tab {
  padding: 5px 12px; font-size: 12px; color: #64748b; border-radius: 5px; cursor: pointer;
}
.tab.on { background: #fff; color: #1a6fff; font-weight: 600; box-shadow: 0 1px 2px rgba(15, 23, 42, 0.06); }
.btn-ghost {
  display: flex; align-items: center; gap: 5px; height: 28px; padding: 0 10px;
  font-size: 12px; font-weight: 500; color: #475569; background: #fff;
  border: 1px solid #e2e8f0; border-radius: 6px; cursor: pointer;
}
.btn-ghost:hover { border-color: #1a6fff; color: #1a6fff; }
.badge {
  font-size: 11px; font-weight: 600; color: #64748b; background: #f1f5f9;
  border-radius: 4px; padding: 2px 7px; white-space: nowrap;
}
.badge.soft { background: #f8fafc; color: #94a3b8; border: 1px solid #eef2f7; }

/* 表格 */
.tbl { flex: 1; overflow: auto; min-height: 0; }
.thead, .trow { display: grid; align-items: center; }
.load-grid { grid-template-columns: 1.1fr 92px 84px 1fr 84px 72px; }
.prob-grid { grid-template-columns: 40px 1.4fr 76px 1fr 72px 96px 84px; }
.thead { position: sticky; top: 0; z-index: 1; background: #f8fafc; }
.th {
  display: flex; align-items: center; gap: 4px; padding: 10px 12px;
  font-size: 12px; font-weight: 600; color: #64748b; cursor: pointer; transition: background 100ms;
  white-space: nowrap;
}
.th.num { justify-content: flex-end; }
.th:hover { background: #eef2f7; color: #334155; }
.th.active { background: #eef2f7; color: #334155; }
.s-ic { font-size: 10px; color: #cbd5e1; flex: none; width: 12px; }
.s-ic.rot { transform: rotate(90deg); }
.s-ic.on { color: #1a6fff; }
.trow { border-bottom: 1px solid #f1f5f9; }
.trow:hover { background: #f9fafb; }
.td { display: flex; align-items: center; gap: 5px; padding: 11px 12px; font-size: 12px; color: #334155; }
.td.num { justify-content: flex-end; font-variant-numeric: tabular-nums; }
.td.colon { background: #f8fafc; }
.td.danger { color: #ef4444; font-weight: 600; }
.td.good { color: #10b981; }
.dot { width: 6px; height: 6px; border-radius: 50%; flex: none; }
.link { color: #1a6fff; cursor: pointer; }
.lbar { width: 72px; height: 6px; background: #f1f5f9; border-radius: 3px; overflow: hidden; }
.lbar i { display: block; height: 100%; border-radius: 3px; }
.ltag { font-size: 10px; font-weight: 600; border-radius: 4px; padding: 1px 6px; }
.pbar { width: 88px; height: 6px; background: #f1f5f9; border-radius: 3px; overflow: hidden; }
.pbar i { display: block; height: 100%; background: #1a6fff; border-radius: 3px; }
.pnum { font-size: 11px; color: #64748b; font-variant-numeric: tabular-nums; }
.solved-t { font-size: 11px; color: #64748b; }
.card-ft {
  padding: 8px 16px; border-top: 1px solid #eef2f7;
  font-size: 11px; color: #94a3b8; line-height: 1.5;
}

/* 趋势卡 —— 不再无限拉高，图表固定高度 */
.trend { flex: none; padding: 14px 16px 12px; }
.trend-hd {
  display: flex; align-items: flex-start; justify-content: space-between; gap: 12px;
}
.trend-hd-main { min-width: 0; }
.trend-title { font-size: 14px; font-weight: 600; color: #0f172a; line-height: 1.3; }
.trend-sub {
  margin-top: 3px; font-size: 12px; color: #94a3b8; line-height: 1.3;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.trend-dot { margin: 0 4px; color: #cbd5e1; }
.concl {
  display: flex; align-items: flex-start; gap: 8px;
  margin-top: 12px; padding: 8px 10px;
  background: #fef2f2; color: #b91c1c; font-size: 12px; font-weight: 500;
  border-radius: 7px; border: 1px solid #fecaca; line-height: 1.45;
}
.concl-mark {
  flex: none; width: 6px; height: 6px; margin-top: 5px;
  border-radius: 50%; background: #ef4444;
}
.legend { display: flex; gap: 14px; margin-top: 12px; }
.legend span {
  display: flex; align-items: center; gap: 6px;
  font-size: 11px; font-weight: 500; color: #64748b;
  transition: opacity 120ms;
}
.legend span.dim { opacity: 0.35; }
.legend i { width: 12px; height: 3px; border-radius: 2px; }
.chart-wrap {
  margin-top: 8px; height: 168px;
  background: linear-gradient(180deg, #f8fafc 0%, #fff 100%);
  border: 1px solid #eef2f7; border-radius: 8px; padding: 10px 8px 4px;
}
.chart { width: 100%; height: 100%; display: block; }
.axis {
  display: flex; justify-content: space-between;
  margin-top: 6px; font-size: 11px; color: #94a3b8;
}
.trend-ft { margin-top: 8px; font-size: 11px; color: #b6bec9; line-height: 1.45; }
.seg { display: flex; background: #f1f5f9; border-radius: 6px; padding: 2px; gap: 2px; }
.seg-i {
  padding: 3px 10px; font-size: 12px; color: #64748b; border-radius: 4px; cursor: pointer;
}
.seg-i.on { background: #fff; color: #1a6fff; font-weight: 600; box-shadow: 0 1px 2px rgba(15, 23, 42, 0.06); }

/* 负载卡 */
.load { flex: 1; min-height: 0; padding: 14px 16px 12px; }
.load-hd {
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
}
.ld-row { display: flex; gap: 8px; margin-top: 12px; }
.ld-cell {
  flex: 1; background: var(--ld-bg, #f8fafc); border: 1px solid transparent;
  border-radius: 8px; padding: 10px 10px 9px; cursor: pointer;
  border-top: 2px solid var(--ld-c, #cbd5e1);
  transition: border-color 120ms, box-shadow 120ms, transform 120ms;
}
.ld-cell:hover { box-shadow: 0 2px 6px rgba(15, 23, 42, 0.06); }
.ld-cell.on {
  border-color: #1a6fff; background: #eff6ff;
  box-shadow: 0 0 0 1px rgba(26, 111, 255, 0.12);
}
.ld-v {
  font-size: 20px; font-weight: 700; font-variant-numeric: tabular-nums;
  color: var(--ld-c, #0f172a); line-height: 1.2;
}
.ld-u { font-size: 11px; font-weight: 400; color: #94a3b8; margin-left: 2px; }
.ld-l { font-size: 11px; color: #64748b; margin-top: 4px; line-height: 1.35; }
.ld-l b { font-weight: 600; color: #334155; }
.ld-ft { margin-top: 10px; font-size: 11px; color: #94a3b8; line-height: 1.4; }

/* 窄屏：率值组换到第二行，两组仍各自成组 */
@media (max-width: 1440px) {
  .today-row { flex-direction: column; }
  .grp-sep { width: auto; height: 1px; margin: 2px 0; }
}
</style>
