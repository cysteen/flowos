<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { message, Modal } from 'ant-design-vue';
import {
  PlusOutlined, SearchOutlined, ReloadOutlined, DeleteOutlined, ThunderboltOutlined,
  ArrowLeftOutlined, HolderOutlined, ExportOutlined,
} from '@ant-design/icons-vue';
import AdminSectionTabs from './components/AdminSectionTabs.vue';
import AdminPageHeader from '@/components/admin/AdminPageHeader.vue';
import { SLA_NAV_ITEMS, adminNavActiveKey } from '@/config/adminNav';
import { stdPagination, toneOf } from '@/config/adminUi';
import {
  SERVICE_TYPE_OPTIONS,
  SERVICE_TYPE_TO_METHODS,
} from '@/views/tickets/types/operation';

const route = useRoute();
const router = useRouter();
const slaActiveKey = computed(() => adminNavActiveKey(route.path));

// 轻量达成概览（检验层单一口径：双层均达标 + 分项）；完整看板在运营看板/数据总览。
const slaKpis = [
  { label: '双层均达标率', value: '91.8%', tone: 'ok' },
  { label: '响应达标率', value: '97.8%', tone: 'normal' },
  { label: '解决达标率', value: '93.5%', tone: 'normal' },
  { label: '本月超时单', value: '38', tone: 'warn' },
];
function goFullDashboard() { router.push('/admin/overview'); }

// SLA 策略（PRD-55，终版单页范式）：列表(拖拽排序) + 单页六分区编辑 + 匹配测试。
// 设计依据见 PRD/SLA交互改版设计-终版框线图(单页范式).md。

type Unit = '分钟' | '小时' | '工作日';
interface MatrixRow {
  level: string;
  respVal: number; respUnit: Unit;
  solveVal: number | null; solveUnit: Unit;
}
/** ⑥ 升级：SLA 设触发阈值 + 引用 SLA 升级链（A3-05，SLA 引擎·预警与升级 维护 + 内联预览） */
interface EscRule { id: number; dim: '响应' | '解决'; cond: string; escalationRef: string }
/** ④ 临期规则：独立一等字段（对标 QuickService） */
interface DueSoon { mode: 'countdown' | 'percent' | 'none'; value: number; unit: Unit }
/** 节点时效：每个流程节点的 响应 + 处理 两钟，各自走不同日历 */
interface NodeSla { id: number; node: string; respLimit: number | null; respUnit: Unit; respCal: string; procLimit: number | null; procUnit: Unit; procCal: string }
/** 整单时效承诺哪些钟（按需勾选） */
interface CommitClocks { resp: boolean; solve: boolean }
/** 整单解决 · 服务方式 × 优先级（P1=处理标准基准，P0/P2/P3 按系数推算） */
type PriKey = 'P0' | 'P1' | 'P2' | 'P3';
const PRI_KEYS: PriKey[] = ['P0', 'P1', 'P2', 'P3'];
const PRI_COEFF: Record<PriKey, number> = { P0: 0.75, P1: 1, P2: 1.25, P3: 1.5 };
const PRI_LABELS = ['P0 紧急', 'P1 高', 'P2 中', 'P3 低'] as const;

interface ServiceMethodSolveRow {
  serviceType: string;
  serviceMethod: string;
  limits: Record<PriKey, number>;
}

/** 处理标准（非投诉）· P1 基准解决时限（小时） */
const SERVICE_METHOD_P1_HOURS: Record<string, number> = {
  与需求人建立联系: 24,
  处理人直接解决: 48,
  再次流转及后台处理: 72,
  需产研侧升级修复: 72,
  上门处理: 72,
  首响人直接办理退费: 24,
  审核退费: 72,
  '渠道/第三方退费': 72,
  '业务线/电商/门店售后': 168,
};

function spreadHoursFromP1(p1: number): Record<PriKey, number> {
  return {
    P0: Math.ceil(p1 * PRI_COEFF.P0),
    P1: p1,
    P2: Math.ceil(p1 * PRI_COEFF.P2),
    P3: Math.ceil(p1 * PRI_COEFF.P3),
  };
}

function defServiceMethodSolve(): ServiceMethodSolveRow[] {
  return SERVICE_TYPE_OPTIONS.flatMap((serviceType) =>
    (SERVICE_TYPE_TO_METHODS[serviceType] ?? []).map((serviceMethod) => {
      const p1 = SERVICE_METHOD_P1_HOURS[serviceMethod] ?? 48;
      return { serviceType, serviceMethod, limits: spreadHoursFromP1(p1) };
    }),
  );
}

function recalcServiceMethodFromP1(rows: ServiceMethodSolveRow[]) {
  rows.forEach((row) => {
    row.limits = spreadHoursFromP1(row.limits.P1);
  });
}

interface Policy {
  no: string; name: string;
  types: string[]; channels: string[]; levels: string[]; products: string[];
  calendar: string; priority: number; status: '启用' | '停用'; updatedAt: string;
  matrix: MatrixRow[]; dueSoon: DueSoon; escalations: EscRule[];
  pauseStates: string[]; remark: string;
  isDefault?: boolean;
  rate: number; // 达标率%（命中该规则工单的双层均达标率；0=新建/无数据）
  // —— SLA 承诺（计时口径 + 对客整单时限按需 + 节点 SLA）；可选，openEdit 时以 blankPolicy 补默认 ——
  clockStart?: string; clockEnd?: string; pauseEnabled?: boolean;
  commitClocks?: CommitClocks; nodeSla?: NodeSla[];
  respCalendar?: string; solveCalendar?: string; // 每类整单时效各自的日历
  /** 启用服务方式×优先级解决矩阵（非投诉/有服务方式场景） */
  solveByServiceMethod?: boolean;
  serviceMethodSolve?: ServiceMethodSolveRow[];
}

const TYPE_OPTS = ['投诉', '咨询', '建议', '商机', '报修', '退费', '退换', '技术故障'];
const CHANNEL_OPTS = ['在线客服', '电话', '邮件', '小程序', 'APP'];
const LEVEL_OPTS = ['校长', '教师', '自媒体', '大V博主', '律师', '记者'];
const PRODUCT_OPTS = ['学习机', '翻译机', '录音笔', '办公本', '智能硬件', 'AI服务', '通用'];
const SCOPE_ALL = '全部';
const CAL_OPTS = ['标准工作日历(9:00-18:00)', '7×24 自然时间', '售后工作日历'];
const UNIT_OPTS: Unit[] = ['分钟', '小时', '工作日'];
const ESC_COND_OPTS = ['剩余 ≤ 25%', '剩余 ≤ 10%', '已超时', '超时后每 30 分钟'];
const WORK_CAL = '标准工作日历(9:00-18:00)';

/** 平台标准节点类型（节点时效默认四类） */
const NODE_SLA_TYPES = ['处理', '技术', '审核', '回访'] as const;

/** 节点时效预埋（各流程节点独立配置） */
function defNodeSla(): NodeSla[] {
  const base = Date.now();
  const mk = (i: number, node: string, procLimit: number, procUnit: Unit, respLimit = 30, respUnit: Unit = '分钟'): NodeSla => ({
    id: base + i, node, respLimit, respUnit, respCal: WORK_CAL, procLimit, procUnit, procCal: WORK_CAL,
  });
  return [
    mk(1, '处理', 4, '小时', 30, '分钟'),
    mk(2, '技术', 4, '小时', 1, '小时'),
    mk(3, '审核', 2, '小时', 1, '小时'),
    mk(4, '回访', 24, '小时', 2, '小时'),
  ];
}
/** 日历短名（列表/紧凑选择器用） */
const CAL_SHORT: Record<string, string> = {
  '标准工作日历(9:00-18:00)': '工作日历', '7×24 自然时间': '7×24', '售后工作日历': '售后日历',
};
const calSelOpts = CAL_OPTS.map((c) => ({ value: c, label: CAL_SHORT[c] ?? c }));

/** 各工单类型流程节点（节点时效「节点」下拉；默认四类 + 按类型扩展） */
const NODE_TYPE_GROUPS = [
  { label: '平台节点', options: [...NODE_SLA_TYPES] },
  { label: '通用流转', options: ['建单', '处理', '技术', '转办/委派', '升级二线', '审核', '解决', '回访', '结案/关闭'] },
  { label: '投诉', options: ['一线处理', '升级技支', '服务处理'] },
  { label: '咨询', options: ['解答'] },
  { label: '建议', options: ['记录/转交'] },
  { label: '商机', options: ['商机跟进', '转销售'] },
  { label: '售后·寄修', options: ['派单至网点', '取件', '网点检测', '维修处理', '寄回', '网点完成'] },
  { label: '售后·退费', options: ['退费审批', '财务退款'] },
  { label: '售后·退换', options: ['退换审核', '换货发货'] },
  { label: '技术故障', options: ['一线诊断', '研发处理(飞书/TPD/RDM/磐石)', '验证'] },
];
const nodeNameOpts = NODE_TYPE_GROUPS.map((g) => ({ label: g.label, options: g.options.map((o) => ({ value: o, label: o })) }));

/** ⑥ 升级规则数据源 = SLA 引擎·自动升级链（mock，含内联预览链） */
const ESC_RULES = [
  { no: 'EC01', name: '响应超时升级', chain: ['L1 响应剩余≤25% → 通知处理人', 'L2 响应已超时 → 通知班组长 + 打升级标记'] },
  { no: 'EC02', name: '解决超时升二线', chain: ['L1 解决已超时 → 自动升级二线组', 'L2 超时后每30分 → 优先级+1'] },
  { no: 'EC03', name: '高优先直升主管', chain: ['L1 优先级=P0 → 通知客服主管 + 飞书同步'] },
];
const escRuleByNo = (no: string) => ESC_RULES.find((r) => r.no === no);

/** 未选或含「全部」= 匹配全部 */
function isScopeAll(values: string[]): boolean {
  return !values.length || values.includes(SCOPE_ALL);
}
function matchesScope(policyValues: string[], testValue: string): boolean {
  return isScopeAll(policyValues) || policyValues.includes(testValue);
}
/** 多选互斥：选「全部」则清空其他；选具体项则去掉「全部」 */
function normalizeScopeSelect(values: string[]): string[] {
  if (!values.length) return [];
  if (!values.includes(SCOPE_ALL)) return values;
  if (values.length === 1) return [SCOPE_ALL];
  return values[values.length - 1] === SCOPE_ALL ? [SCOPE_ALL] : values.filter((v) => v !== SCOPE_ALL);
}
function onTypesChange(values: string[]) { form.types = normalizeScopeSelect(values); }
function onChannelsChange(values: string[]) { form.channels = normalizeScopeSelect(values); }
function onLevelsChange(values: string[]) { form.levels = normalizeScopeSelect(values); }
function onProductsChange(values: string[]) { form.products = normalizeScopeSelect(values); }

function defMatrix(): MatrixRow[] {
  return [
    { level: 'P0 紧急', respVal: 15, respUnit: '分钟', solveVal: 4, solveUnit: '小时' },
    { level: 'P1 高', respVal: 30, respUnit: '分钟', solveVal: 8, solveUnit: '小时' },
    { level: 'P2 中', respVal: 2, respUnit: '小时', solveVal: 1, solveUnit: '工作日' },
    { level: 'P3 低', respVal: 4, respUnit: '小时', solveVal: 3, solveUnit: '工作日' },
  ];
}
type Lv = 'P0 紧急' | 'P1 高' | 'P2 中' | 'P3 低';
/** 基于默认矩阵，覆写指定优先级行的响应/解决（把业务"一规则一优先级"映射进矩阵模型）。 */
function matrixWith(overrides: Partial<Record<Lv, { resp: [number, Unit]; solve: [number, Unit] }>>): MatrixRow[] {
  const m = defMatrix();
  m.forEach((row) => {
    const o = overrides[row.level as Lv];
    if (o) { row.respVal = o.resp[0]; row.respUnit = o.resp[1]; row.solveVal = o.solve[0]; row.solveUnit = o.solve[1]; }
  });
  return m;
}

// 8 条业务约定 SLA 规则（V1 A3 SLA-001~008），映射进 P0–P3 矩阵模型：每条规则的优先级 → 对应矩阵行。
const policies = ref<Policy[]>([
  {
    no: 'SLA001', name: 'VIP客户-紧急-学习机', types: ['投诉'], channels: [SCOPE_ALL], levels: ['大V博主'], products: ['学习机'],
    calendar: '7×24 自然时间', priority: 1, status: '启用', updatedAt: '2026-06-14 10:20',
    matrix: matrixWith({ 'P0 紧急': { resp: [30, '分钟'], solve: [4, '小时'] } }),
    dueSoon: { mode: 'countdown', value: 30, unit: '分钟' },
    escalations: [
      { id: 1, dim: '响应', cond: '剩余 ≤ 25%', escalationRef: 'EC01' },
      { id: 2, dim: '解决', cond: '已超时', escalationRef: 'EC02' },
    ], pauseStates: ['已挂起·待客户'], remark: 'VIP 投诉走最严时限', rate: 96.2,
  },
  {
    no: 'SLA002', name: 'VIP客户-高优先级', types: [SCOPE_ALL], channels: [SCOPE_ALL], levels: ['大V博主'], products: [SCOPE_ALL],
    calendar: '标准工作日历(9:00-18:00)', priority: 2, status: '启用', updatedAt: '2026-06-12 09:00',
    matrix: matrixWith({ 'P1 高': { resp: [1, '小时'], solve: [8, '小时'] } }),
    dueSoon: { mode: 'countdown', value: 1, unit: '小时' },
    escalations: [{ id: 1, dim: '响应', cond: '剩余 ≤ 25%', escalationRef: 'EC01' }],
    pauseStates: ['已挂起·待客户'], remark: 'VIP 全类型高优先', rate: 93.8,
  },
  {
    no: 'SLA003', name: '普通客户-紧急', types: ['投诉'], channels: [SCOPE_ALL], levels: ['教师'], products: [SCOPE_ALL],
    calendar: '7×24 自然时间', priority: 3, status: '启用', updatedAt: '2026-06-11 14:00',
    matrix: matrixWith({ 'P0 紧急': { resp: [1, '小时'], solve: [8, '小时'] } }),
    dueSoon: { mode: 'percent', value: 80, unit: '分钟' },
    escalations: [{ id: 1, dim: '解决', cond: '已超时', escalationRef: 'EC02' }],
    pauseStates: ['已挂起·待客户'], remark: '', rate: 91.5,
  },
  {
    no: 'SLA004', name: '退费工单-通用', types: ['退费'], channels: [SCOPE_ALL], levels: [SCOPE_ALL], products: [SCOPE_ALL],
    calendar: '标准工作日历(9:00-18:00)', priority: 4, status: '启用', updatedAt: '2026-06-10 16:30',
    matrix: matrixWith({ 'P1 高': { resp: [2, '小时'], solve: [24, '小时'] } }),
    dueSoon: { mode: 'percent', value: 80, unit: '分钟' },
    escalations: [{ id: 1, dim: '解决', cond: '已超时', escalationRef: 'EC02' }],
    pauseStates: ['已挂起·待客户', '待第三方'], remark: '退费时限放宽', rate: 88.3,
  },
  {
    no: 'SLA005', name: '普通咨询-默认', types: ['咨询'], channels: [SCOPE_ALL], levels: [SCOPE_ALL], products: [SCOPE_ALL],
    calendar: '标准工作日历(9:00-18:00)', priority: 5, status: '启用', updatedAt: '2026-06-09 10:00',
    matrix: matrixWith({ 'P2 中': { resp: [4, '小时'], solve: [48, '小时'] } }),
    dueSoon: { mode: 'none', value: 0, unit: '小时' },
    escalations: [], pauseStates: ['已挂起·待客户'], remark: '', rate: 95.1,
  },
  {
    no: 'SLA006', name: '智能硬件-售后', types: ['技术故障'], channels: [SCOPE_ALL], levels: [SCOPE_ALL], products: ['智能硬件'],
    calendar: '标准工作日历(9:00-18:00)', priority: 6, status: '启用', updatedAt: '2026-06-08 11:00',
    matrix: matrixWith({ 'P2 中': { resp: [2, '小时'], solve: [24, '小时'] } }),
    dueSoon: { mode: 'countdown', value: 2, unit: '小时' },
    escalations: [], pauseStates: ['已挂起·待客户', '待备件'], remark: '硬件售后', rate: 92.7,
  },
  {
    no: 'SLA007', name: '低优先级-默认', types: ['咨询'], channels: [SCOPE_ALL], levels: [SCOPE_ALL], products: [SCOPE_ALL],
    calendar: '标准工作日历(9:00-18:00)', priority: 7, status: '启用', updatedAt: '2026-06-07 09:00',
    matrix: matrixWith({ 'P3 低': { resp: [8, '小时'], solve: [72, '小时'] } }),
    dueSoon: { mode: 'none', value: 0, unit: '小时' },
    escalations: [], pauseStates: ['已挂起·待客户'], remark: '', rate: 97.8,
  },
  {
    no: 'SLA008', name: 'AI服务-技术故障', types: ['技术故障'], channels: [SCOPE_ALL], levels: [SCOPE_ALL], products: ['AI服务'],
    calendar: '7×24 自然时间', priority: 8, status: '停用', updatedAt: '2026-06-05 15:00',
    matrix: matrixWith({ 'P1 高': { resp: [1, '小时'], solve: [12, '小时'] } }),
    dueSoon: { mode: 'percent', value: 90, unit: '小时' },
    escalations: [{ id: 1, dim: '解决', cond: '已超时', escalationRef: 'EC02' }],
    pauseStates: ['已挂起·待客户'], remark: 'AI 服务故障', rate: 89.4,
  },
]);

// —— 筛选 ——
const fName = ref('');
const fType = ref(SCOPE_ALL);
const fStatus = ref(SCOPE_ALL);
const applied = reactive({ name: '', type: SCOPE_ALL, status: SCOPE_ALL });
function onQuery() { applied.name = fName.value; applied.type = fType.value; applied.status = fStatus.value; }
function onReset() { fName.value = ''; fType.value = SCOPE_ALL; fStatus.value = SCOPE_ALL; onQuery(); }
const filtered = computed(() => policies.value.filter((p) => {
  if (applied.name && !p.name.includes(applied.name)) return false;
  if (applied.type !== SCOPE_ALL && !(p.types.includes(applied.type) || p.types.includes(SCOPE_ALL))) return false;
  if (applied.status !== SCOPE_ALL && p.status !== applied.status) return false;
  return true;
}));
/** 仅在无筛选时允许拖拽排序（避免索引错位） */
const canReorder = computed(() => !applied.name && applied.type === SCOPE_ALL && applied.status === SCOPE_ALL);

const columns = [
  { title: '策略名称', dataIndex: 'name', key: 'name', width: 210 },
  { title: '适用范围', key: 'scope', width: 180, ellipsis: true },
  { title: '优先级覆盖', key: 'cover', width: 140 },
  { title: '达标率', key: 'rate', width: 100, sorter: (a: Policy, b: Policy) => a.rate - b.rate },
  { title: '工作日历(响/解)', key: 'calendar', width: 170 },
  { title: '状态', dataIndex: 'status', key: 'status', width: 80 },
  { title: '更新时间', dataIndex: 'updatedAt', key: 'updatedAt', width: 150 },
  { title: '操作', key: 'action', width: 230 },
];
function scopeText(p: Policy): string {
  const productLabel = isScopeAll(p.products) ? '全部业务类型' : p.products.join('/');
  const typeLabel = isScopeAll(p.types) ? '全部工单类型' : p.types.join('/');
  const channelLabel = isScopeAll(p.channels) ? '全部工单来源' : p.channels.join('/');
  const levelLabel = isScopeAll(p.levels) ? '全部客户类型' : p.levels.join('/');
  return [productLabel, typeLabel, channelLabel, levelLabel].join(' · ');
}
/** 列表「工作日历」列：按时效日历摘要（响应/解决各自日历） */
function calText(p: Policy): string {
  const r = CAL_SHORT[p.respCalendar ?? p.calendar] ?? '—';
  const s = CAL_SHORT[p.solveCalendar ?? p.calendar] ?? '—';
  return `响:${r} / 解:${s}`;
}
const pagination = stdPagination();
/** 节点时效表列（spec：a-table size middle + pagination false） */
const nodeCols = [
  { title: '节点', key: 'node', width: 140 },
  { title: '节点响应（时限 · 日历）', key: 'resp' },
  { title: '节点处理（时限 · 日历）', key: 'proc' },
  { title: '操作', key: 'op', width: 70 },
];

// —— 拖拽排序（顺序即生效优先级，首条命中）——
const dragIdx = ref<number>(-1);
function onDrop(targetIdx: number) {
  const from = dragIdx.value;
  dragIdx.value = -1;
  if (from < 0 || from === targetIdx) return;
  const list = policies.value;
  if (list[from].isDefault || list[targetIdx].isDefault) return; // 默认策略锁定置底
  const [moved] = list.splice(from, 1);
  list.splice(targetIdx, 0, moved);
  reassignPriority();
  message.success('已调整生效优先级');
}
function reassignPriority() {
  policies.value.forEach((p, i) => { p.priority = p.isDefault ? 99 : i + 1; });
}
/** a-table 行属性：拖拽排序（默认策略锁定不可拖） */
function rowProps(record: Policy, index: number): Record<string, unknown> {
  return {
    draggable: canReorder.value && !record.isDefault,
    class: dragIdx.value === index ? 'row-dragging' : '',
    onDragstart: () => { dragIdx.value = index; },
    onDragover: (e: DragEvent) => e.preventDefault(),
    onDrop: () => onDrop(index),
  };
}

// —— 单页编辑（list / edit 双态）——
const mode = ref<'list' | 'edit'>('list');
const editing = ref<Policy | null>(null);
const form = reactive<Policy>(blankPolicy());
const escExpanded = reactive<Record<number, boolean>>({});

function blankPolicy(): Policy {
  return {
    no: '', name: '', types: [SCOPE_ALL], channels: [SCOPE_ALL], levels: [SCOPE_ALL], products: [SCOPE_ALL],
    calendar: CAL_OPTS[0], priority: 50, status: '启用', updatedAt: '',
    matrix: defMatrix(), dueSoon: { mode: 'countdown', value: 30, unit: '分钟' },
    escalations: [], pauseStates: ['已挂起·待客户'], remark: '', rate: 0,
    clockStart: '工单创建', clockEnd: '工单结案', pauseEnabled: true,
    commitClocks: { resp: true, solve: true }, nodeSla: defNodeSla(),
    respCalendar: '标准工作日历(9:00-18:00)', solveCalendar: '7×24 自然时间',
    solveByServiceMethod: true, serviceMethodSolve: defServiceMethodSolve(),
  };
}

const serviceMethodGroups = computed(() => {
  const map = new Map<string, ServiceMethodSolveRow[]>();
  (form.serviceMethodSolve ?? []).forEach((row) => {
    const list = map.get(row.serviceType) ?? [];
    list.push(row);
    map.set(row.serviceType, list);
  });
  return [...map.entries()].map(([serviceType, rows]) => ({ serviceType, rows }));
});

function onRecalcServiceMethodLimits() {
  recalcServiceMethodFromP1(form.serviceMethodSolve ?? []);
  message.success('已按各服务方式 P1 值重算 P0/P2/P3（系数 0.75 / 1 / 1.25 / 1.5）');
}

// 锚点导航
const SECTIONS = [
  { key: 'basic', label: '① 基本信息' },
  { key: 'scope', label: '② 适用范围' },
  { key: 'commit', label: '③ SLA 承诺' },
  { key: 'duesoon', label: '④ 临期规则' },
  { key: 'escalate', label: '⑤ 升级' },
];
const activeSection = ref('basic');
let observer: IntersectionObserver | null = null;
function scrollToSection(key: string) {
  activeSection.value = key;
  document.getElementById(`sec-${key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function setupObserver() {
  observer?.disconnect();
  observer = new IntersectionObserver(
    (entries) => {
      const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (visible) activeSection.value = visible.target.id.replace('sec-', '');
    },
    { rootMargin: '-10% 0px -70% 0px', threshold: 0 },
  );
  SECTIONS.forEach((s) => { const el = document.getElementById(`sec-${s.key}`); if (el) observer!.observe(el); });
}
onBeforeUnmount(() => observer?.disconnect());

function openNew() {
  editing.value = null;
  Object.assign(form, blankPolicy());
  enterEdit();
}
function openEdit(p: Policy) {
  editing.value = p;
  const copy = JSON.parse(JSON.stringify(p)) as Policy;
  if (isScopeAll(copy.channels)) copy.channels = [SCOPE_ALL];
  if (isScopeAll(copy.levels)) copy.levels = [SCOPE_ALL];
  if (isScopeAll(copy.products)) copy.products = [SCOPE_ALL];
  if (!copy.types.length) copy.types = [SCOPE_ALL];
  Object.assign(form, blankPolicy(), copy); // blankPolicy 补齐承诺新字段(老策略可能缺)
  if (!form.serviceMethodSolve?.length) form.serviceMethodSolve = defServiceMethodSolve();
  if (form.solveByServiceMethod == null) form.solveByServiceMethod = true;
  enterEdit();
}
function enterEdit() {
  Object.keys(escExpanded).forEach((k) => delete escExpanded[Number(k)]);
  activeSection.value = 'basic';
  mode.value = 'edit';
  nextTick(setupObserver);
}
function backToList() {
  observer?.disconnect();
  mode.value = 'list';
}

function addEsc() {
  const id = Date.now();
  form.escalations.push({ id, dim: '响应', cond: '剩余 ≤ 25%', escalationRef: 'EC01' });
}
function removeEsc(id: number) { form.escalations = form.escalations.filter((e) => e.id !== id); }
function addNode() {
  (form.nodeSla ??= []).push({
    id: Date.now(), node: '处理', respLimit: 30, respUnit: '分钟', respCal: WORK_CAL,
    procLimit: 4, procUnit: '小时', procCal: WORK_CAL,
  });
}
function delNode(id: number) { form.nodeSla = (form.nodeSla ?? []).filter((n) => n.id !== id); }
function goNewEscRule() { message.info('跳转「SLA 引擎 · 预警与升级」新建升级链（原型占位）'); }
function goEscRoute() { message.info('前往「SLA 引擎 · 预警与升级」（原型占位）'); }

function matrixValid(): boolean {
  return form.matrix.every((r) => {
    if (r.respVal <= 0) return false;
    if (r.solveVal != null && r.solveVal > 0) {
      const toMin = (v: number, u: Unit) => v * (u === '分钟' ? 1 : u === '小时' ? 60 : 480);
      if (toMin(r.solveVal, r.solveUnit) < toMin(r.respVal, r.respUnit)) return false;
    }
    return true;
  });
}
function save() {
  if (!form.name.trim()) { message.warning('请填写策略名称'); scrollToSection('basic'); return; }
  if (!form.types.length) { message.warning('请选择工单类型（或全部）'); scrollToSection('scope'); return; }
  if (!matrixValid()) { message.warning('时限矩阵不合法：响应须>0，解决须 ≥ 响应'); scrollToSection('commit'); return; }
  if (form.escalations.some((e) => !e.escalationRef)) { message.warning('请为每条升级阈值引用一条升级规则'); scrollToSection('escalate'); return; }
  form.updatedAt = '2026-06-29 18:00';
  if (editing.value) {
    Object.assign(editing.value, JSON.parse(JSON.stringify(form)));
    message.success('已保存');
  } else {
    form.no = `SLA${String(policies.value.length + 1).padStart(3, '0')}`;
    // 新策略插入到默认策略之前（默认恒置底）
    const idx = policies.value.findIndex((p) => p.isDefault);
    const clone = JSON.parse(JSON.stringify(form)) as Policy;
    if (idx >= 0) policies.value.splice(idx, 0, clone); else policies.value.push(clone);
    reassignPriority();
    message.success('已创建，新工单即刻参与计时');
  }
  backToList();
}
function toggle(p: Policy) {
  const next = p.status === '启用' ? '停用' : '启用';
  Modal.confirm({ title: '状态变更', content: `确定${next}「${p.name}」？`, onOk: () => { p.status = next; message.success(`已${next}`); } });
}
function copyPolicy(p: Policy) {
  const idx = policies.value.findIndex((x) => x.isDefault);
  const clone: Policy = {
    ...JSON.parse(JSON.stringify(p)),
    no: `SLA${String(policies.value.length + 1).padStart(3, '0')}`,
    name: `${p.name} 副本`, status: '停用', isDefault: false,
  };
  if (idx >= 0) policies.value.splice(idx, 0, clone); else policies.value.push(clone);
  reassignPriority();
  message.success('已复制为新策略（停用态）');
}
function del(p: Policy) {
  Modal.confirm({
    title: '确认删除', okText: '删除', okType: 'danger', cancelText: '取消',
    content: `删除策略「${p.name}」后，命中该范围的工单将改走默认策略或失去 SLA 约束。建议优先停用。`,
    onOk: () => { policies.value = policies.value.filter((x) => x.no !== p.no); reassignPriority(); message.success('已删除'); },
  });
}

// —— 匹配测试 ——
const testOpen = ref(false);
const testType = ref('投诉');
const testChannel = ref('在线客服');
const testLevel = ref('校长');
const testProduct = ref('学习机');
const testPriorityIdx = ref(1);
const testServiceMethod = ref<string | undefined>(undefined);
const SERVICE_METHOD_OPTS = defServiceMethodSolve().map((r) => ({
  value: r.serviceMethod,
  label: r.serviceMethod,
}));

function priKeyFromIdx(idx: number): PriKey {
  return PRI_KEYS[idx] ?? 'P1';
}

function resolveSolveLimit(
  policy: Policy,
  priorityIdx: number,
  serviceMethod?: string,
): { val: number | null; unit: Unit; source: string } {
  const fallback = policy.matrix[priorityIdx];
  if (
    serviceMethod
    && policy.solveByServiceMethod
    && policy.serviceMethodSolve?.length
  ) {
    const row = policy.serviceMethodSolve.find((s) => s.serviceMethod === serviceMethod);
    if (row) {
      const pk = priKeyFromIdx(priorityIdx);
      return { val: row.limits[pk], unit: '小时', source: '服务方式动态调整' };
    }
  }
  return {
    val: fallback?.solveVal ?? null,
    unit: fallback?.solveUnit ?? '小时',
    source: '默认（按优先级）',
  };
}

const testSolvePreview = computed(() => {
  if (!testResult.value) return null;
  const m = testResult.value.matrix[testPriorityIdx.value];
  return { val: m?.solveVal ?? null, unit: m?.solveUnit ?? '小时' };
});

const testResult = computed(() => {
  // 按列表顺序首条命中（启用态）
  return policies.value.find((p) => p.status === '启用'
    && matchesScope(p.types, testType.value)
    && matchesScope(p.channels, testChannel.value)
    && matchesScope(p.levels, testLevel.value)
    && matchesScope(p.products, testProduct.value)) ?? null;
});
function fmtClock(v: number | null, u: Unit): string { return v == null ? '不设' : `${v}${u}`; }

const dueSoonText = (d: DueSoon) => d.mode === 'countdown' ? `剩余 ${d.value}${d.unit} 进入临期`
  : d.mode === 'percent' ? `已用 ${d.value}% 进入临期` : '无临期预警';
</script>

<template>
  <div class="sla-page">
    <AdminSectionTabs :items="SLA_NAV_ITEMS" :active-key="slaActiveKey" />

    <!-- ============ 列表态 ============ -->
    <div v-if="mode === 'list'" class="admin-page">
      <AdminPageHeader
        title="SLA 策略"
        subtitle="SLA 策略 = 服务时效承诺：为匹配范围的工单设定多久内必须响应 / 解决；多策略命中时按生效优先级唯一命中一条。"
      >
        <template #actions>
          <a-button @click="testOpen = true"><template #icon><ThunderboltOutlined /></template>匹配测试</a-button>
          <a-button type="primary" @click="openNew"><template #icon><PlusOutlined /></template>新建策略</a-button>
        </template>
      </AdminPageHeader>

      <!-- 轻量达成概览(检验就近):完整看板见运营看板/数据总览 -->
      <div class="kpi-band">
        <div v-for="k in slaKpis" :key="k.label" class="kb-item" :class="k.tone">
          <div class="kb-val">{{ k.value }}</div>
          <div class="kb-label">{{ k.label }}</div>
        </div>
        <a class="kb-more" @click="goFullDashboard">查看完整达成看板 →</a>
      </div>

      <div class="filter-card">
        <div class="filters">
          <div class="fi"><span class="fl">策略名称</span><a-input v-model:value="fName" placeholder="请输入" allow-clear style="width:160px" @press-enter="onQuery" /></div>
          <div class="fi"><span class="fl">适用类型</span><a-select v-model:value="fType" style="width:130px" :options="[SCOPE_ALL, ...TYPE_OPTS].map((o) => ({ value: o, label: o }))" /></div>
          <div class="fi"><span class="fl">状态</span><a-select v-model:value="fStatus" style="width:120px" :options="[SCOPE_ALL, '启用', '停用'].map((o) => ({ value: o, label: o }))" /></div>
        </div>
        <div class="fa">
          <a-button type="primary" @click="onQuery"><template #icon><SearchOutlined /></template>查询</a-button>
          <a-button @click="onReset"><template #icon><ReloadOutlined /></template>重置</a-button>
        </div>
      </div>

      <div class="table-card">
        <a-table
          :columns="columns" :data-source="filtered" row-key="no" :pagination="pagination" size="middle"
          :custom-row="(rowProps as any)"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'name'">
              <HolderOutlined v-if="canReorder && !(record as Policy).isDefault" class="drag-h" />
              <span class="cell-link" @click="openEdit(record as Policy)">{{ (record as Policy).name }}</span>
              <a-tag v-if="(record as Policy).isDefault" color="default" style="margin-left:6px">兜底</a-tag>
            </template>
            <span v-else-if="column.key === 'scope'" class="scope-cell" :title="scopeText(record as Policy)">{{ scopeText(record as Policy) }}</span>
            <span v-else-if="column.key === 'calendar'" class="scope-cell">{{ calText(record as Policy) }}</span>
            <span v-else-if="column.key === 'cover'">
              <a-tag v-for="m in (record as Policy).matrix" :key="m.level" color="blue" style="margin:1px">{{ m.level.split(' ')[0] }}</a-tag>
            </span>
            <span v-else-if="column.key === 'rate'" class="rate" :class="(record as Policy).rate >= 95 ? 'ok' : (record as Policy).rate >= 85 ? 'warn' : 'bad'">
              {{ (record as Policy).rate ? (record as Policy).rate + '%' : '—' }}
            </span>
            <template v-else-if="column.key === 'status'">
              <a-tag :color="toneOf((record as Policy).status)">{{ (record as Policy).status }}</a-tag>
            </template>
            <template v-else-if="column.key === 'action'">
              <a-button type="link" size="small" @click="openEdit(record as Policy)">编辑</a-button>
              <a-button type="link" size="small" @click="toggle(record as Policy)">{{ (record as Policy).status === '启用' ? '停用' : '启用' }}</a-button>
              <a-button type="link" size="small" @click="copyPolicy(record as Policy)">复制</a-button>
              <a-button type="link" size="small" danger @click="del(record as Policy)">删除</a-button>
            </template>
          </template>
        </a-table>
      </div>
    </div>

    <!-- ============ 单页编辑态 ============ -->
    <div v-else class="editor">
      <div class="ed-head">
        <a-button type="text" class="back" @click="backToList"><template #icon><ArrowLeftOutlined /></template>返回</a-button>
        <span class="ed-title">{{ editing ? '编辑 SLA 策略' : '新建 SLA 策略' }}{{ form.name ? '：' + form.name : '' }}</span>
        <div class="ed-actions">
          <a-button @click="backToList">取消</a-button>
          <a-button type="primary" @click="save">保存策略</a-button>
        </div>
      </div>

      <div class="ed-body">
        <!-- 左锚点 -->
        <nav class="anchor-nav">
          <div
            v-for="s in SECTIONS" :key="s.key"
            class="anchor-item" :class="{ active: activeSection === s.key }"
            @click="scrollToSection(s.key)"
          >{{ s.label }}</div>
        </nav>

        <!-- 右表单 -->
        <div class="form-area">
          <!-- ① 基本信息 -->
          <section id="sec-basic" class="sec">
            <div class="sec-h">① 基本信息</div>
            <div class="kv-form">
              <div class="kv-grid kv-grid-3">
                <div class="kv-row">
                  <span class="kv-label required">策略名称</span>
                  <a-input v-model:value="form.name" class="kv-control" placeholder="如 投诉-VIP 加严" />
                </div>
                <div class="kv-row">
                  <span class="kv-label">生效优先级</span>
                  <a-input-number v-model:value="form.priority" class="kv-control" :min="1" :disabled="form.isDefault" />
                </div>
                <div class="kv-row">
                  <span class="kv-label">状态</span>
                  <a-radio-group v-model:value="form.status" class="kv-control">
                    <a-radio value="启用">启用</a-radio>
                    <a-radio value="停用">停用</a-radio>
                  </a-radio-group>
                </div>
              </div>
              <div class="kv-row">
                <span class="kv-label">备注</span>
                <a-textarea v-model:value="form.remark" class="kv-control" :rows="1" :auto-size="{ minRows: 1, maxRows: 3 }" />
              </div>
            </div>
          </section>

          <!-- ② 适用范围 -->
          <section id="sec-scope" class="sec">
            <div class="sec-h">② 适用范围 <span class="sec-sub">工单同时满足以下条件才命中本策略</span></div>
            <div class="kv-form kv-grid-2">
              <div class="kv-row">
                <span class="kv-label">业务类型</span>
                <a-select v-model:value="form.products" class="kv-control" mode="multiple" placeholder="选择业务类型，或选「全部」"
                  :options="[SCOPE_ALL, ...PRODUCT_OPTS].map((o) => ({ value: o, label: o }))" @change="onProductsChange" />
              </div>
              <div class="kv-row">
                <span class="kv-label required">工单类型</span>
                <a-select v-model:value="form.types" class="kv-control" mode="multiple" placeholder="选择工单类型，或选「全部」"
                  :options="[SCOPE_ALL, ...TYPE_OPTS].map((o) => ({ value: o, label: o }))" @change="onTypesChange" />
              </div>
              <div class="kv-row">
                <span class="kv-label">工单来源</span>
                <a-select v-model:value="form.channels" class="kv-control" mode="multiple" placeholder="选择工单来源，或选「全部」"
                  :options="[SCOPE_ALL, ...CHANNEL_OPTS].map((o) => ({ value: o, label: o }))" @change="onChannelsChange" />
              </div>
              <div class="kv-row">
                <span class="kv-label">客户类型</span>
                <a-select v-model:value="form.levels" class="kv-control" mode="multiple" placeholder="选择客户类型，或选「全部」"
                  :options="[SCOPE_ALL, ...LEVEL_OPTS].map((o) => ({ value: o, label: o }))" @change="onLevelsChange" />
              </div>
            </div>
          </section>

          <!-- ③ SLA 承诺 -->
          <section id="sec-commit" class="sec">
            <div class="sec-h">③ SLA 承诺 <span class="sec-sub">整单时效 + 节点时效（每类时效各自走不同日历；起算与停表口径在「工作日历与停表」全局维护）</span></div>

            <!-- 整单时效 -->
            <div class="sub-h">整单时效</div>
            <div class="clock-toggles">
              <a-checkbox v-model:checked="form.commitClocks!.resp">整单响应（创建→首响）</a-checkbox>
              <a-checkbox v-model:checked="form.commitClocks!.solve">整单解决（创建→解决）</a-checkbox>
            </div>

            <!-- 整单响应：一行（P0–P3 横排 + 日历）-->
            <template v-if="form.commitClocks!.resp">
              <div class="sub-h sm">整单响应 · 按优先级</div>
              <div class="resp-inline">
                <div v-for="m in form.matrix" :key="`${m.level}-resp`" class="ri-cell">
                  <span class="ri-lv">{{ m.level }}</span>
                  <a-input-number v-model:value="m.respVal" :min="0" size="small" style="width:60px" />
                  <a-select v-model:value="m.respUnit" size="small" style="width:66px;margin-left:4px" :options="UNIT_OPTS.map((u) => ({ value: u, label: u }))" />
                </div>
                <div class="ri-cell"><span class="ri-lv">走哪本日历</span><a-select v-model:value="form.respCalendar" size="small" style="width:150px" :options="calSelOpts" /></div>
              </div>
            </template>

            <!-- 整单解决：按优先级 -->
            <template v-if="form.commitClocks!.solve">
              <div class="sub-h sm mt">整单解决 · 按优先级</div>
              <table class="matrix">
                <thead>
                  <tr><th>优先级</th><th>整单解决</th></tr>
                </thead>
                <tbody>
                  <tr class="cal-row">
                    <td class="lv">走哪本日历</td>
                    <td><a-select v-model:value="form.solveCalendar" size="small" style="width:160px" :options="calSelOpts" /></td>
                  </tr>
                  <tr v-for="m in form.matrix" :key="`${m.level}-solve`">
                    <td class="lv">{{ m.level }}</td>
                    <td>
                      <a-input-number v-model:value="m.solveVal" :min="0" size="small" style="width:66px" placeholder="不设" />
                      <a-select v-model:value="m.solveUnit" size="small" style="width:76px;margin-left:4px" :options="UNIT_OPTS.map((u) => ({ value: u, label: u }))" />
                    </td>
                  </tr>
                </tbody>
              </table>
            </template>

            <div class="tip">整单响应=创建→首次响应；整单解决=创建→解决，均<b>按优先级</b>。服务方式的差异化解决时效属特殊逻辑，在「工作日历与停表 · 整单解决·服务方式动态调整」统一维护，不在标准策略里配。</div>

            <!-- 节点时效 -->
            <div class="sub-h mt">节点时效 <span class="sec-sub">每个流程节点的 响应 + 处理 时效，各自走不同日历</span>
              <a-button type="link" size="small" class="sub-add" @click="addNode"><template #icon><PlusOutlined /></template>添加节点</a-button>
            </div>
            <a-table :columns="nodeCols" :data-source="form.nodeSla" row-key="id" :pagination="false" size="middle">
              <template #bodyCell="{ column, record }">
                <a-select v-if="column.key === 'node'" v-model:value="record.node" size="small" style="width:170px" :options="nodeNameOpts" show-search option-filter-prop="label" placeholder="选择节点" />
                <template v-else-if="column.key === 'resp'">
                  <a-input-number v-model:value="record.respLimit" :min="0" size="small" style="width:58px" />
                  <a-select v-model:value="record.respUnit" size="small" style="width:62px;margin:0 4px" :options="UNIT_OPTS.map((u) => ({ value: u, label: u }))" />
                  <a-select v-model:value="record.respCal" size="small" style="width:118px" :options="calSelOpts" />
                </template>
                <template v-else-if="column.key === 'proc'">
                  <a-input-number v-model:value="record.procLimit" :min="0" size="small" style="width:58px" />
                  <a-select v-model:value="record.procUnit" size="small" style="width:62px;margin:0 4px" :options="UNIT_OPTS.map((u) => ({ value: u, label: u }))" />
                  <a-select v-model:value="record.procCal" size="small" style="width:118px" :options="calSelOpts" />
                </template>
                <a-button v-else-if="column.key === 'op'" type="link" size="small" danger @click="delNode(record.id)">删除</a-button>
              </template>
            </a-table>
            <div class="tip">节点时效 = 各流程节点的内部时效：节点响应=进入节点→该节点首次响应，节点处理=进入节点→该节点处理完。此处填 <b>P1 基准</b>；P0/P2/P3 按全局优先级系数（×0.75 / 1 / 1.25 / 1.5）自动推算（与整单口径一致；竞品 OLA 多为条件/任务驱动，本系数为可选轻量差异化）。</div>
          </section>

          <!-- ④ 临期规则 -->
          <section id="sec-duesoon" class="sec">
            <div class="sec-h">④ 临期规则 <span class="sec-sub">进入临期 → 橙色预警，可作为⑤升级的触发点</span></div>
            <a-radio-group v-model:value="form.dueSoon.mode" class="due-group">
              <div class="due-row">
                <a-radio value="countdown">到期倒计时</a-radio>
                <template v-if="form.dueSoon.mode === 'countdown'">
                  剩余 <a-input-number v-model:value="form.dueSoon.value" :min="1" size="small" style="width:72px" />
                  <a-select v-model:value="form.dueSoon.unit" size="small" style="width:80px" :options="UNIT_OPTS.map((u) => ({ value: u, label: u }))" /> 进入临期
                </template>
              </div>
              <div class="due-row">
                <a-radio value="percent">到期百分比</a-radio>
                <template v-if="form.dueSoon.mode === 'percent'">
                  已用 <a-input-number v-model:value="form.dueSoon.value" :min="1" :max="99" size="small" style="width:72px" /> % 进入临期
                </template>
              </div>
              <div class="due-row"><a-radio value="none">无</a-radio></div>
            </a-radio-group>
          </section>

          <!-- ⑤ 升级 -->
          <section id="sec-escalate" class="sec">
            <div class="sec-h">⑤ 升级 <span class="sec-sub">SLA 设触发阈值 → 引用「SLA 引擎 · 升级链」(A3-05)</span></div>
            <div v-for="e in form.escalations" :key="e.id" class="esc-block">
              <div class="esc-row">
                <a-select v-model:value="e.dim" size="small" style="width:90px" :options="[{ value: '响应', label: '响应' }, { value: '解决', label: '解决' }]" />
                <a-select v-model:value="e.cond" size="small" style="width:150px" :options="ESC_COND_OPTS.map((o) => ({ value: o, label: o }))" />
                <span class="arrow">→</span>
                <a-select v-model:value="e.escalationRef" size="small" style="flex:1;min-width:180px"
                  :options="ESC_RULES.map((r) => ({ value: r.no, label: `${r.no} ${r.name}` }))" placeholder="引用升级规则" />
                <a class="esc-link" @click="escExpanded[e.id] = !escExpanded[e.id]">{{ escExpanded[e.id] ? '收起' : '预览' }}</a>
                <a class="esc-link" @click="goNewEscRule"><ExportOutlined /> 新建</a>
                <DeleteOutlined class="del-ic" @click="removeEsc(e.id)" />
              </div>
              <div v-if="escExpanded[e.id]" class="esc-preview">
                <div class="ep-title">{{ escRuleByNo(e.escalationRef)?.name }}（只读 · 来自 SLA 升级链）</div>
                <div v-for="(l, i) in escRuleByNo(e.escalationRef)?.chain || []" :key="i" class="ep-line">{{ l }}</div>
              </div>
            </div>
            <a-button type="dashed" block @click="addEsc"><template #icon><PlusOutlined /></template>添加触发阈值</a-button>
            <div class="tip">升级链（升到谁 / 多级 / 附加动作）统一在「SLA 引擎 · 预警与升级」维护；此处设触发时机并引用，可内联预览，缺升级链可
              <a @click="goEscRoute">前往预警与升级 ↗</a> 新建。</div>
          </section>
        </div>
      </div>

      <div class="ed-footer">
        <a-button @click="backToList">取消</a-button>
        <a-button type="primary" @click="save">保存策略</a-button>
      </div>
    </div>

    <!-- 匹配测试 -->
    <a-modal v-model:open="testOpen" title="SLA 策略匹配测试" :footer="null" width="520">
      <div class="test-body">
        <div class="fi"><span class="fl">业务类型</span><a-select v-model:value="testProduct" style="width:180px" :options="PRODUCT_OPTS.map((o) => ({ value: o, label: o }))" /></div>
        <div class="fi"><span class="fl">工单类型</span><a-select v-model:value="testType" style="width:180px" :options="TYPE_OPTS.map((o) => ({ value: o, label: o }))" /></div>
        <div class="fi"><span class="fl">工单来源</span><a-select v-model:value="testChannel" style="width:180px" :options="CHANNEL_OPTS.map((o) => ({ value: o, label: o }))" /></div>
        <div class="fi"><span class="fl">客户类型</span><a-select v-model:value="testLevel" style="width:180px" :options="LEVEL_OPTS.map((o) => ({ value: o, label: o }))" /></div>
        <div class="fi"><span class="fl">优先级</span><a-select v-model:value="testPriorityIdx" style="width:180px" :options="PRI_LABELS.map((l, i) => ({ value: i, label: l }))" /></div>
        <div class="test-result">
          <template v-if="testResult">
            命中策略：<b>{{ testResult.name }}</b>（生效优先级 {{ testResult.priority }}）
            <div class="tr-clocks">整单响应（{{ PRI_LABELS[testPriorityIdx] }}）：{{ fmtClock(testResult.matrix[testPriorityIdx].respVal, testResult.matrix[testPriorityIdx].respUnit) }}（{{ CAL_SHORT[testResult.respCalendar ?? testResult.calendar] ?? '—' }}）</div>
            <div v-if="testSolvePreview" class="tr-clocks">
              整单解决（{{ PRI_LABELS[testPriorityIdx] }}）：{{ fmtClock(testSolvePreview.val, testSolvePreview.unit) }}（{{ CAL_SHORT[testResult.solveCalendar ?? testResult.calendar] ?? '—' }}）
            </div>
            <div class="tr-clocks">临期：{{ dueSoonText(testResult.dueSoon) }}</div>
          </template>
          <template v-else><span class="miss">无命中——该工单将无 SLA 约束，建议配置默认策略</span></template>
        </div>
      </div>
    </a-modal>
  </div>
</template>

<style scoped>
.sla-page { display: flex; flex-direction: column; min-height: 100%; }
.admin-page { display: flex; flex-direction: column; gap: 16px; padding: 16px 24px; }
.kpi-band { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.kb-item { flex: 1; min-width: 130px; background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px 16px; }
.kb-val { font-size: 22px; font-weight: 700; color: #111827; }
.kb-item.ok .kb-val { color: #10b981; }
.kb-item.warn .kb-val { color: #ef4444; }
.kb-label { font-size: 12px; color: #9ca3af; margin-top: 2px; }
.kb-more { flex: none; font-size: 13px; color: #1a6fff; cursor: pointer; white-space: nowrap; align-self: center; }
.filter-card { background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px 16px; display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
.filters { display: flex; gap: 16px; flex-wrap: wrap; }
.fi { display: flex; align-items: center; gap: 8px; }
.fl { font-size: 12px; color: #6b7280; white-space: nowrap; }
.fa { display: flex; gap: 8px; }
.table-card { background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; }
.cell-link { color: #1a6fff; cursor: pointer; }
.drag-h { color: #c0c4cc; margin-right: 6px; cursor: grab; }
.scope-cell { font-size: 12px; color: #4b5563; }
.rate { font-size: 13px; font-weight: 700; }
.rate.ok { color: #10b981; } .rate.warn { color: #f59e0b; } .rate.bad { color: #ef4444; }
:deep(.row-dragging) { opacity: 0.5; }
:deep(.ant-table-thead > tr > th) { background: #f3f4f6; color: #6b7280; font-size: 12px; font-weight: 600; }

/* 单页编辑 */
.editor { display: flex; flex-direction: column; flex: 1; min-height: 0; }
.ed-head { display: flex; align-items: center; gap: 12px; padding: 12px 24px; background: #fff; border-bottom: 1px solid #e5e7eb; position: sticky; top: 0; z-index: 5; }
.ed-head .back { padding-left: 0; color: #4b5563; }
.ed-title { font-size: 15px; font-weight: 600; color: #111827; }
.ed-actions { margin-left: auto; display: flex; gap: 8px; }
.ed-body { display: flex; gap: 20px; padding: 16px 24px; align-items: flex-start; }
.anchor-nav { position: sticky; top: 72px; flex: none; width: 132px; display: flex; flex-direction: column; gap: 2px; }
.anchor-item { padding: 8px 12px; font-size: 13px; color: #6b7280; border-radius: 6px; cursor: pointer; border-left: 2px solid transparent; }
.anchor-item:hover { background: #f3f4f6; }
.anchor-item.active { color: #1a6fff; background: #eff6ff; border-left-color: #1a6fff; font-weight: 600; }
.form-area { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 14px; }
.sec { background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px 20px; scroll-margin-top: 80px; }
.sec-h { font-size: 13px; font-weight: 600; color: #111827; margin-bottom: 14px; padding-left: 10px; border-left: 3px solid #1a6fff; line-height: 1.4; }
.sec-sub { font-size: 12px; font-weight: normal; color: #9ca3af; margin-left: 8px; }
.kv-form { display: flex; flex-direction: column; gap: 10px; }
.kv-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 20px; }
.kv-grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px 16px; }
.kv-row { display: flex; align-items: center; gap: 10px; min-width: 0; }
.kv-label { flex: none; font-size: 12px; color: #6b7280; white-space: nowrap; }
.kv-label.required::before { content: '* '; color: #ff4d4f; }
.kv-control { flex: 1; min-width: 0; }
.kv-control :deep(.ant-input-number) { width: 100%; }
@media (max-width: 900px) {
  .kv-grid-2, .kv-grid-3 { grid-template-columns: 1fr; }
}
.resp-inline { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 18px; padding: 4px 0 8px; }
.resp-inline .ri-cell { display: flex; flex-direction: column; gap: 3px; }
.resp-inline .ri-lv { font-size: 12px; color: #6b7280; }
.matrix { width: 100%; border-collapse: collapse; }
.matrix th { background: #f3f4f6; color: #6b7280; font-size: 12px; font-weight: 600; text-align: left; padding: 8px 10px; border: 1px solid #e5e7eb; }
.matrix td { padding: 8px 10px; border: 1px solid #e5e7eb; }
.matrix td.lv { font-weight: 600; color: #374151; width: 110px; }
.sm-matrix td.type-cell { vertical-align: top; background: #fafafa; min-width: 100px; }
.sm-matrix td.method-cell { font-size: 12px; color: #4b5563; min-width: 160px; }
.unit-tag { font-size: 11px; color: #9ca3af; margin-left: 2px; }
.tip-info { color: #1e40af; background: #eff6ff; border-color: #bfdbfe; }
.th-opt { font-weight: normal; color: #9ca3af; margin-left: 2px; }
.due-group { display: flex; flex-direction: column; gap: 12px; }
.due-row { display: flex; align-items: center; gap: 8px; font-size: 13px; color: #4b5563; }
.sub-h { font-size: 13px; font-weight: 600; color: #374151; margin: 4px 0 10px; display: flex; align-items: center; gap: 10px; }
.sub-h.sm { font-size: 12px; font-weight: 600; color: #4b5563; margin-top: 12px; }
.sub-h.sm.mt { margin-top: 16px; }
.sub-h.mt { margin-top: 20px; }
.solve-sm-head { flex-wrap: wrap; }
.sub-h .sub-add { margin-left: auto; }
.clock-toggles { display: flex; gap: 20px; margin-bottom: 12px; }
.matrix .cal-row td { background: #fafafa; }
.esc-block { margin-bottom: 10px; }
.esc-row { display: flex; align-items: center; gap: 8px; }
.esc-row .arrow { color: #9ca3af; }
.esc-link { font-size: 12px; color: #1a6fff; white-space: nowrap; cursor: pointer; }
.del-ic { color: #ef4444; cursor: pointer; flex: none; }
.esc-preview { margin: 6px 0 0 98px; padding: 8px 12px; background: #f9fafb; border: 1px solid #eef0f2; border-radius: 6px; }
.ep-title { font-size: 12px; font-weight: 600; color: #6d28d9; margin-bottom: 4px; }
.ep-line { font-size: 12px; color: #4b5563; line-height: 1.8; }
.ed-footer { position: sticky; bottom: 0; display: flex; justify-content: flex-end; gap: 8px; padding: 12px 24px; background: #fff; border-top: 1px solid #e5e7eb; z-index: 5; }
.tip { margin-top: 12px; font-size: 12px; color: #b45309; background: #fffbeb; border: 1px solid #fde68a; border-radius: 6px; padding: 8px 12px; line-height: 1.6; }
.tip a { color: #1a6fff; }
.hint { font-size: 11px; color: #9ca3af; margin-top: 4px; }
.test-body { display: flex; flex-direction: column; gap: 12px; }
.test-result { margin-top: 8px; padding: 12px; background: #f0f6ff; border: 1px solid #bfdbfe; border-radius: 8px; font-size: 13px; }
.tr-clocks { margin-top: 6px; font-size: 12px; color: #4b5563; }
.test-result .miss { color: #b45309; }
</style>
