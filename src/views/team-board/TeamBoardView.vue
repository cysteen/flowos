<script setup lang="ts">
/**
 * 班组长看板 —— 按《需求梳理/815/看板评审稿/班组长看板-实现规格.md》重写
 *
 * 结构：
 *   ① 概览条 h72：6 指标格 + 主分隔 + 待办处理区
 *   ② 主体：左 明细卡（三维度 Tab）｜右 趋势卡 + 负载分布卡
 *
 * 关键裁决：
 *   X1 点格本体 = 选中并驱动趋势图；格内 hover 的 chevron = 打开下钻抽屉
 *   X2 禁用 #F5F9FF —— 选中一律 #EFF6FF，hover 一律 #F9FAFB
 *   X3 实心主按钮按「区」分配：概览条区仅「去指派」一个
 *   X5 抽屉打开时右列降透明 + 禁用（不做位移）
 *   X6 「未分派」格＝数量视角（驱动趋势）；「去指派」按钮＝动作视角
 */
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { message } from 'ant-design-vue';
import {
  InboxOutlined,
  DatabaseOutlined,
  LoginOutlined,
  SendOutlined,
  BellOutlined,
  RollbackOutlined,
  RightOutlined,
  LineChartOutlined,
  CaretUpOutlined,
  CaretDownOutlined,
  SwapOutlined,
  SettingOutlined,
  ExportOutlined,
  UserAddOutlined,
  ClockCircleOutlined,
  AuditOutlined,
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
import SuperviseModal, {
  type SuperviseTicket,
  type SuperviseSubmitPayload,
} from './components/SuperviseModal.vue';
import {
  BOARD_METRICS,
  BOARD_TODOS,
  TEAM_MEMBERS,
  PRIORITY_BUCKETS,
  URGE_DRILL,
  RETURN_DRILL,
  TRANSFER_DRILL,
  TRAFFIC_HOURLY,
  TRAFFIC_DAILY,
  PROBLEM_TOP10,
  type MemberRow,
} from '@/mock/teamBoard';

const router = useRouter();

/* ========================= ① 概览条 ========================= */

const ICONS: Record<string, unknown> = {
  InboxOutlined,
  DatabaseOutlined,
  LoginOutlined,
  SendOutlined,
  BellOutlined,
  RollbackOutlined,
};

/** 默认选中「班组积压」—— 班组长首要关注量 */
const selectedKey = ref('backlog');

/**
 * X6 + 数据缺口处理：
 * 「未分派」在 mock 里标了 drill='people'，但未生成对应下钻数据集
 * （未分派工单本就没有处理人，「下钻到人」语义上也不成立）。
 * 故本页把它的 chevron 直接指向指派弹窗 —— 数量看格、动作看弹窗，与 X6 一致。
 */
function drillOf(key: string): DrillType | 'assign' | null {
  if (key === 'unassigned') return 'assign';
  const m = BOARD_METRICS.find((x) => x.key === key);
  return (m?.drill as DrillType) ?? null;
}

function selectMetric(key: string) {
  selectedKey.value = key;
}

/* ========================= ② 下钻抽屉 ========================= */

const drawerOpen = ref(false);
const drawerType = ref<DrillType | null>(null);
const drawerTitle = ref('');
const drawerSubtitle = ref('');
const drawerTotal = ref(0);
const drawerUnread = ref<number | undefined>(undefined);
const drawerFooter = ref('');

function openDrill(key: string, e?: MouseEvent) {
  e?.stopPropagation();
  const d = drillOf(key);
  if (!d) return;
  if (d === 'assign') {
    openAssign();
    return;
  }
  drawerType.value = d;
  drawerUnread.value = undefined;
  if (key === 'backlog') {
    drawerTitle.value = '班组积压 · 优先级分布';
    drawerSubtitle.value = '未结且未停表 · B1 八状态口径';
    drawerTotal.value = 63;
    drawerFooter.value = '在工单工作台查看这 63 单 →';
  } else if (key === 'urge') {
    drawerTitle.value = '催单 · 补充单 · 按人员';
    drawerSubtitle.value = '组内催单与补充单，可查看未读分布';
    drawerTotal.value = 34;
    drawerUnread.value = 12;
    drawerFooter.value = '在工单工作台查看这 34 单 →';
  } else if (key === 'returnTransfer') {
    drawerTitle.value = '今日转入 · 按来源';
    drawerSubtitle.value = '其他客服组 / 跨组调剂 / 售后回传';
    drawerTotal.value = 5;
    drawerFooter.value = '在工单工作台查看这 5 单 →';
  }
  drawerOpen.value = true;
}

const drawerPeople = computed(() => (drawerTitle.value.startsWith('催单') ? URGE_DRILL : RETURN_DRILL));

function onGoList(p: DrillGoListPayload) {
  router.push({ path: p.path, query: p.query });
}

/* ========================= ③ 指派 / 督办 ========================= */

/** 待指派工单（8 单，与大盘「未分派 8」一致） */
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

/** 待督办工单（5 单，与「待督办 5」一致；s4 命中 24h 去重，用于验证置灰） */
const SUPERVISE_TICKETS: SuperviseTicket[] = [
  { id: 's1', no: 'LCMN-20260802-90114', customer: '莫某', assignee: '孙杰', assigneeId: 'm10', priority: 'P0', slaLeftMin: -32 },
  { id: 's2', no: 'LCMN-20260802-90127', customer: '陈某', assignee: '李昊', assigneeId: 'm2', priority: 'P1', slaLeftMin: 18 },
  { id: 's3', no: 'LCMN-20260803-90140', customer: '李某', assignee: '陈曦', assigneeId: 'm5', priority: 'P1', slaLeftMin: 47 },
  { id: 's4', no: 'LCMN-20260803-90156', customer: '王某', assignee: '郑楠', assigneeId: 'm9', priority: 'P2', slaLeftMin: 92, supervisedText: '2h 前 · 张经理', supervisedHoursAgo: 2 },
  { id: 's5', no: 'LCMN-20260803-90168', customer: '赵某', assignee: '孙杰', assigneeId: 'm10', priority: 'P1', slaLeftMin: 110 },
];

const assignOpen = ref(false);
const superviseOpen = ref(false);
const assignPreselect = ref<string[]>([]);
const assignRef = ref<InstanceType<typeof AssignModal> | null>(null);
const superviseRef = ref<InstanceType<typeof SuperviseModal> | null>(null);

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

function onSuperviseSubmit(p: SuperviseSubmitPayload) {
  superviseRef.value?.setSubmitting(true);
  window.setTimeout(() => {
    superviseRef.value?.setSubmitting(false);
    superviseOpen.value = false;
    message.success(`已督办 ${p.ticketIds.length} 张工单，通知已发送`);
  }, 600);
}

function onTodoClick(key: string) {
  if (key === 'assign') openAssign();
  else if (key === 'supervise') superviseOpen.value = true;
  else router.push({ path: '/approval' }); // A4：看板只跳审批中心，不实现审批
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
  { key: 'overdue', label: '超时', w: '62px', num: true, firstDir: 'desc' },
  { key: 'followRate', label: '跟进率', w: '76px', num: true, firstDir: 'asc' },
  { key: 'csat', label: '满意度', w: '72px', num: true, firstDir: 'asc' },
  { key: 'resolveRate', label: '解决率', w: '76px', num: true, firstDir: 'asc' },
  { key: 'reviewRate', label: '参评率', w: '76px', num: true, firstDir: 'asc' },
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
  let rows = [...TEAM_MEMBERS];
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
const trafficPoints = computed(() => (gran.value === 'hour' ? TRAFFIC_HOURLY : TRAFFIC_DAILY));

const TREND_TITLE: Record<string, string> = {
  unassigned: '未分派',
  backlog: '班组积压',
  inbound: '进线量',
  forward: '下送量',
  urge: '催单 · 补充单',
  returnTransfer: '退回 · 转入',
};

const W = 400;
const H = 150;
function toPath(vals: number[]) {
  if (!vals.length) return '';
  const max = Math.max(...vals, 1);
  const step = vals.length > 1 ? W / (vals.length - 1) : W;
  return vals
    .map((v, i) => `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(1)},${(H - (v / max) * (H - 12)).toFixed(1)}`)
    .join(' ');
}
const pathInbound = computed(() => toPath(trafficPoints.value.map((p) => p.inbound)));
const pathForward = computed(() => toPath(trafficPoints.value.map((p) => p.forward)));
const axisLabels = computed(() => {
  const ps = trafficPoints.value;
  const idx = [0, Math.floor(ps.length / 4), Math.floor(ps.length / 2), Math.floor((ps.length * 3) / 4), ps.length - 1];
  return idx.map((i) => ps[i]?.t ?? '');
});

/* ========================= ⑥ 负载分布卡 ========================= */

const loadDist = computed(() => {
  const g: Record<LoadLevel, number> = { 空闲: 0, 适中: 0, 满载: 0 };
  TEAM_MEMBERS.forEach((m) => {
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
  message.info('导出班组绩效报表');
}
</script>

<template>
  <div class="tb">
    <!-- ① 概览条 -->
    <div class="ov">
      <div class="ov-metrics">
        <template v-for="(m, i) in BOARD_METRICS" :key="m.key">
          <div
            v-if="i > 0"
            class="ov-sep"
            :class="{ hide: selectedKey === m.key || selectedKey === BOARD_METRICS[i - 1].key }"
          />
          <div
            class="ov-cell"
            :class="{ on: selectedKey === m.key }"
            tabindex="0"
            @click="selectMetric(m.key)"
            @keydown.enter.prevent="selectMetric(m.key)"
            @keydown.space.prevent="selectMetric(m.key)"
          >
            <div class="ov-icon" :style="{ background: m.iconBg, color: m.iconColor }">
              <component :is="ICONS[m.iconName]" :style="{ fontSize: '15px' }" />
            </div>
            <div class="ov-txt">
              <div class="ov-label">
                {{ m.label }}
                <LineChartOutlined v-if="selectedKey === m.key" class="ov-sel-ic" />
              </div>
              <div class="ov-val" :title="m.key === 'returnTransfer' ? '退回 3 单 · 今日转入 5 单' : ''">
                <!-- 一格两指标：中缀 · 弱两档，防止「3 · 5」被读成 3.5 -->
                <template v-if="m.value.includes(' · ')">
                  <span class="ov-num" :style="{ color: m.valueColor || '#111827' }">{{ m.value.split(' · ')[0] }}</span>
                  <span class="ov-mid">·</span>
                  <span class="ov-num" :style="{ color: m.valueColor || '#111827' }">{{ m.value.split(' · ')[1] }}</span>
                </template>
                <span v-else class="ov-num" :style="{ color: m.valueColor || '#111827' }">{{ m.value }}</span>
                <!-- 第 6 格的 sub 与值重复，只走 tooltip 不占位 -->
                <span v-if="m.sub && m.key !== 'returnTransfer'" class="ov-sub" :class="{ warn: m.key === 'urge' }">{{ m.sub }}</span>
                <span v-else-if="m.delta" class="ov-delta" :class="m.deltaTone">{{ m.delta }}</span>
              </div>
            </div>
            <RightOutlined v-if="drillOf(m.key)" class="ov-drill" @click="openDrill(m.key, $event)" />
          </div>
        </template>
      </div>

      <div class="ov-divider" />

      <div class="ov-todo">
        <span class="ov-todo-label">待办处理</span>
        <button class="btn-primary" @click="onTodoClick('assign')">
          <UserAddOutlined />
          去指派 {{ BOARD_TODOS[0].count }}
        </button>
        <button v-for="t in BOARD_TODOS.slice(1)" :key="t.key" class="chip" @click="onTodoClick(t.key)">
          <ClockCircleOutlined v-if="t.key === 'supervise'" class="chip-ic" />
          <AuditOutlined v-else class="chip-ic" />
          <span class="chip-n">{{ t.label }}</span>
          <span class="chip-c">{{ t.count }}</span>
        </button>
      </div>
    </div>

    <!-- ② 主体 -->
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
            默认排序：超时降序 → 跟进率升序 → 下送降序 · 任意字段可升降序 · 组内共 {{ TEAM_MEMBERS.length }} 人
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
              <div class="trend-title">{{ TREND_TITLE[selectedKey] }}</div>
              <div class="trend-sub">
                {{ gran === 'hour' ? '当日时段' : '近 30 天' }}
                <span class="trend-dot">·</span>
                点上方指标格切换
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
          <div class="concl">
            <span class="concl-mark" />
            <span>近 7 天进线 &gt; 下送，积压 +12，建议增派人手</span>
          </div>
          <div class="legend">
            <span><i style="background: #1a6fff" />进线量</span>
            <span><i style="background: #10b981" />下送量</span>
          </div>
          <div class="chart-wrap">
            <svg class="chart" :viewBox="`0 0 ${W} ${H}`" preserveAspectRatio="none">
              <line v-for="y in [0.25, 0.5, 0.75]" :key="y" x1="0" :y1="H * y" :x2="W" :y2="H * y" stroke="#EEF2F7" stroke-width="1" />
              <path :d="pathInbound" fill="none" stroke="#1A6FFF" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
              <path :d="pathForward" fill="none" stroke="#10B981" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
            </svg>
          </div>
          <div class="axis"><span v-for="(a, i) in axisLabels" :key="i">{{ a }}</span></div>
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
      :buckets="PRIORITY_BUCKETS"
      :people="drawerPeople"
      :sources="TRANSFER_DRILL"
      :footer-text="drawerFooter"
      @go-list="onGoList"
      @assign="(r) => openAssign([r.id])"
      @supervise="() => (superviseOpen = true)"
    />
    <AssignModal
      ref="assignRef"
      v-model:open="assignOpen"
      :preselected-ids="assignPreselect"
      :candidates="TEAM_MEMBERS"
      :tickets="ASSIGN_TICKETS"
      :can-cross-team="true"
      @submit="onAssignSubmit"
    />
    <SuperviseModal
      ref="superviseRef"
      v-model:open="superviseOpen"
      :tickets="SUPERVISE_TICKETS"
      @submit="onSuperviseSubmit"
    />
  </div>
</template>

<style scoped>
.tb {
  display: flex; flex-direction: column; gap: 14px;
  padding: 20px 24px 24px; min-height: 100%; width: 100%; min-width: 0;
  background: #f5f7fa;
}

/* ① 概览条 —— 指标贴左，待办贴右 */
.ov {
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
  min-height: 68px; background: #fff; border: 0.8px solid #e5e6eb;
  border-radius: 12px; padding: 8px 16px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
}
.ov-metrics { display: flex; align-items: center; flex: 1; min-width: 0; overflow-x: auto; }
.ov-sep { width: 1px; height: 28px; background: #eef2f7; flex: none; }
.ov-sep.hide { opacity: 0; }
.ov-cell {
  position: relative; display: flex; align-items: center; gap: 10px;
  flex: none; height: 52px; padding: 6px 14px; border-radius: 8px;
  cursor: pointer; transition: background 120ms ease; outline: none;
}
.ov-cell:hover { background: #f8fafc; }
.ov-cell:hover .ov-label { color: #374151; }
.ov-cell:hover .ov-drill { opacity: 1; }
.ov-cell:focus-visible { box-shadow: 0 0 0 2px #1a6fff; }
.ov-cell.on { background: #eff6ff; }
.ov-cell.on .ov-label { color: #1a6fff; font-weight: 600; }
.ov-icon {
  width: 32px; height: 32px; border-radius: 8px;
  display: flex; align-items: center; justify-content: center; flex: none;
}
.ov-txt { min-width: 0; }
.ov-label {
  display: flex; align-items: center; gap: 4px; height: 16px;
  font-size: 12px; font-weight: 500; color: #64748b; white-space: nowrap;
}
.ov-sel-ic { font-size: 11px; color: #1a6fff; }
.ov-val { display: flex; align-items: baseline; gap: 5px; height: 26px; white-space: nowrap; }
.ov-num {
  font-size: 20px; font-weight: 700; font-variant-numeric: tabular-nums;
  line-height: 26px; white-space: nowrap; color: #0f172a;
}
.ov-mid { font-size: 14px; color: #d1d5db; line-height: 26px; }
.ov-delta { font-size: 11px; font-weight: 600; }
.ov-delta.good { color: #10b981; }
.ov-delta.bad { color: #ef4444; }
.ov-delta.neutral { color: #94a3b8; }
.ov-sub {
  font-size: 10px; font-weight: 600; color: #64748b; background: #f1f5f9;
  border-radius: 4px; padding: 2px 6px; white-space: nowrap;
}
.ov-sub.warn { color: #ef4444; background: #fef2f2; }
.ov-drill {
  position: absolute; right: 4px; font-size: 11px; color: #94a3b8;
  opacity: 0; transition: opacity 120ms;
}
.ov-drill:hover { color: #1a6fff; }
.ov-divider { width: 1px; height: 28px; background: #e2e8f0; margin: 0 8px 0 4px; flex: none; }
.ov-todo { display: flex; align-items: center; gap: 8px; flex: none; }
.ov-todo-label { font-size: 12px; font-weight: 500; color: #94a3b8; }
.btn-primary {
  display: flex; align-items: center; gap: 5px; height: 30px; padding: 0 12px;
  background: #1a6fff; color: #fff; font-size: 12px; font-weight: 600;
  border: none; border-radius: 6px; cursor: pointer;
}
.btn-primary:hover { background: #0f4fcc; }
.chip {
  display: flex; align-items: center; gap: 5px; height: 30px; padding: 0 10px;
  background: #fff; border: 1px solid #e5e7eb; border-radius: 999px; cursor: pointer;
}
.chip:hover { border-color: #cbd5e1; background: #f8fafc; }
.chip-ic { font-size: 11px; color: #d97706; }
.chip-n { font-size: 12px; font-weight: 500; color: #64748b; }
.chip-c { font-size: 12px; font-weight: 700; color: #d97706; }

/* ② 主体 */
.body { display: flex; gap: 14px; flex: 1; min-height: 0; align-items: stretch; }
/* 卡片视觉基线：与个人门户 .card 统一（圆角 12 / 0.8px #E5E6EB / 0 1px 4px rgba(0,0,0,.06)） */
.card {
  background: #fff; border: 0.8px solid #e5e6eb; border-radius: 12px;
  display: flex; flex-direction: column; min-height: 0;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
}
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
}
.th.num { justify-content: flex-end; }
.th:hover { background: #eef2f7; color: #334155; }
.th.active { background: #eef2f7; color: #334155; }
.s-ic { font-size: 10px; color: #cbd5e1; flex: none; width: 12px; }
.s-ic.rot { transform: rotate(90deg); }
.s-ic.on { color: #1a6fff; }
.trow { border-bottom: 1px solid #f1f5f9; }
.trow:hover { background: #f8fafc; }
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
.trend { flex: none; padding: 14px 16px 14px; }
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
}
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
</style>
