<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, reactive, ref } from 'vue';
import { message, Modal } from 'ant-design-vue';
import {
  PlusOutlined, SearchOutlined, ReloadOutlined, DeleteOutlined, ThunderboltOutlined,
  ArrowLeftOutlined, HolderOutlined, QuestionCircleOutlined,
} from '@ant-design/icons-vue';
import AdminPageHeader from '@/components/admin/AdminPageHeader.vue';
import { stdPagination } from '@/config/adminUi';
import {
  SERVICE_TYPE_OPTIONS,
  SERVICE_TYPE_TO_METHODS,
} from '@/views/tickets/types/operation';
import { slaCalendars } from '@/config/slaCalendars';

const kpiTipOverlayStyle = {
  maxWidth: '320px',
  color: '#713f12',
  fontSize: '12px',
  lineHeight: '1.65',
  padding: '10px 12px',
  boxShadow: '0 6px 16px rgba(180, 130, 20, 0.12)',
  border: '1px solid #fde68a',
};

// 轻量达成概览（检验层单一口径：双层均达标 + 分项）；完整看板在运营看板/数据总览。
// 统计范围：默认近 30 天，支持切换预设或自定义；四项指标统一随所选范围联动，避免时间窗口径不一致。
const KPI_RANGE_OPTS = [
  { value: '7', label: '近 7 天' },
  { value: '30', label: '近 30 天' },
  { value: '90', label: '近 90 天' },
  { value: 'custom', label: '自定义' },
];
const kpiRange = ref('30');
const kpiCustom = ref();
// 各统计范围下的达成数据（实际由后端按所选范围统计返回）
const KPI_DATA: Record<string, [string, string, string, string]> = {
  '7': ['92.5%', '98.1%', '93.9%', '9'],
  '30': ['91.8%', '97.8%', '93.5%', '38'],
  '90': ['90.6%', '97.2%', '92.4%', '121'],
  custom: ['91.2%', '97.5%', '93.1%', '52'],
};
const KPI_DEFS = [
  { label: '双层均达标率', tone: 'ok',
    tip: '所选统计范围内，命中 SLA 策略并完成计时的工单中，响应与解决「双双」都在时效内的占比 = 双达标单数 / 统计单数 ×100%。最严口径：单层达标不算，两层都达标才计入，是达成检验的总口径。' },
  { label: '响应达标率', tone: 'normal',
    tip: '所选统计范围内，响应在 SLA 时效内完成的占比 = 响应达标数 / 统计数 ×100%。分项指标，用于定位失分是否出在响应环节。' },
  { label: '解决达标率', tone: 'normal',
    tip: '所选统计范围内，解决在 SLA 时效内完成的占比 = 解决达标数 / 统计数 ×100%。分项指标；通常低于响应达标率，是主要失分项。' },
  { label: '超时单', tone: 'warn',
    tip: '所选统计范围内，响应或解决「任一」超出 SLA 时效的工单绝对数（去重工单）。反向绝对量，反映失约总量；点「查看完整达成看板」可下钻明细。' },
];
const slaKpis = computed(() =>
  KPI_DEFS.map((d, i) => ({ ...d, value: (KPI_DATA[kpiRange.value] ?? KPI_DATA['30'])[i] })),
);

// SLA 策略（PRD-55，终版单页范式）：列表(拖拽排序) + 单页六分区编辑 + 匹配测试。
// 设计依据见 PRD/SLA交互改版设计-终版框线图(单页范式).md。

type Unit = '分钟' | '小时' | '自然日';
interface MatrixRow {
  level: string;
  respVal: number; respUnit: Unit;
  solveVal: number | null; solveUnit: Unit;
}
/** ⑥ 升级：SLA 设触发阈值 + 引用 SLA 升级链（A3-05，SLA 引擎·预警与升级 维护 + 内联预览） */
interface EscRule { id: number; dim: '响应' | '解决'; cond: string; escalationRef: string }
/** ④ 临期规则：独立一等字段（对标 QuickService） */
interface DueSoon { mode: 'countdown' | 'percent' | 'none'; value: number; unit: Unit }
/** 节点时效：每个流程节点的 响应 + 处理 两类时效，各自走不同日历 */
interface NodeSla { id: number; node: string; respLimit: number | null; respUnit: Unit; respCal: string; procLimit: number | null; procUnit: Unit; procCal: string }
/** 整单时效承诺哪些时效（按需勾选） */
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
const UNIT_OPTS: Unit[] = ['分钟', '小时', '自然日'];
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
/** 日历选项与计时规则页共享单一真源（slaCalendars）；新增/改名日历即时反映到策略下拉 */
const calSelOpts = computed(() => slaCalendars.map((c) => ({ value: c.name, label: CAL_SHORT[c.name] ?? c.name })));
/** 表单区日历选项（完整名称，便于配置时识别） */
const calFormOpts = computed(() => slaCalendars.map((c) => ({ value: c.name, label: c.name })));

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
    { level: 'P2 中', respVal: 2, respUnit: '小时', solveVal: 1, solveUnit: '自然日' },
    { level: 'P3 低', respVal: 4, respUnit: '小时', solveVal: 3, solveUnit: '自然日' },
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
  { title: '策略名称', dataIndex: 'name', key: 'name', width: 200 },
  { title: '优先级', key: 'priority', width: 72, align: 'center' as const },
  { title: '适用范围', key: 'scope', width: 180, ellipsis: true },
  { title: '优先级覆盖', key: 'cover', width: 140 },
  { title: '达标率', key: 'rate', width: 100, sorter: (a: Policy, b: Policy) => a.rate - b.rate },
  { title: '工作日历(响/解)', key: 'calendar', width: 170 },
  { title: '状态', dataIndex: 'status', key: 'status', width: 88 },
  { title: '更新时间', dataIndex: 'updatedAt', key: 'updatedAt', width: 150 },
  { title: '操作', key: 'action', width: 180 },
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

function blankPolicy(): Policy {
  return {
    no: '', name: '', types: [SCOPE_ALL], channels: [SCOPE_ALL], levels: [SCOPE_ALL], products: [SCOPE_ALL],
    calendar: CAL_OPTS[0], priority: 50, status: '停用', updatedAt: '',
    matrix: defMatrix(), dueSoon: { mode: 'countdown', value: 30, unit: '分钟' },
    escalations: [], pauseStates: ['已挂起·待客户'], remark: '', rate: 0,
    clockStart: '工单创建', clockEnd: '工单结案', pauseEnabled: true,
    commitClocks: { resp: true, solve: true }, nodeSla: defNodeSla(),
    respCalendar: '标准工作日历(9:00-18:00)', solveCalendar: '7×24 自然时间',
    solveByServiceMethod: false, serviceMethodSolve: defServiceMethodSolve(),
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
  if (form.solveByServiceMethod == null) form.solveByServiceMethod = false;
  enterEdit();
}
function enterEdit() {
  activeSection.value = 'basic';
  mode.value = 'edit';
  nextTick(setupObserver);
}
function backToList() {
  observer?.disconnect();
  mode.value = 'list';
}

function addNode() {
  (form.nodeSla ??= []).push({
    id: Date.now(), node: '处理', respLimit: 30, respUnit: '分钟', respCal: WORK_CAL,
    procLimit: 4, procUnit: '小时', procCal: WORK_CAL,
  });
}
function delNode(id: number) { form.nodeSla = (form.nodeSla ?? []).filter((n) => n.id !== id); }

function unitToMinutes(v: number, u: Unit): number {
  if (u === '分钟') return v;
  if (u === '小时') return v * 60;
  return v * 24 * 60; // 自然日 = 24 小时连续计时
}

function matrixValid(): boolean {
  return form.matrix.every((r) => {
    if (r.respVal <= 0) return false;
    if (r.solveVal != null && r.solveVal > 0) {
      if (unitToMinutes(r.solveVal, r.solveUnit) < unitToMinutes(r.respVal, r.respUnit)) return false;
    }
    return true;
  });
}
function save() {
  if (!form.name.trim()) { message.warning('请填写策略名称'); scrollToSection('basic'); return; }
  if (!form.types.length) { message.warning('请选择工单类型（或全部）'); scrollToSection('scope'); return; }
  if (!matrixValid()) { message.warning('时限矩阵不合法：响应须>0，解决须 ≥ 响应'); scrollToSection('commit'); return; }
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
    message.success('已创建（停用态），启用后即参与新工单计时');
  }
  backToList();
}
function onListStatusChange(p: Policy, enabled: boolean) {
  const next = enabled ? '启用' : '停用';
  if (p.status === next) return;
  Modal.confirm({
    title: '状态变更',
    content: `确定${next}「${p.name}」？`,
    onOk: () => { p.status = next; message.success(`已${next}`); },
  });
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

const testRespPreview = computed(() => {
  if (!testResult.value) return null;
  const m = testResult.value.matrix[testPriorityIdx.value];
  return { val: m?.respVal ?? null, unit: m?.respUnit ?? '分钟' };
});

const testSolvePreview = computed(() => {
  if (!testResult.value) return null;
  return resolveSolveLimit(testResult.value, testPriorityIdx.value, testServiceMethod.value);
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
</script>

<template>
  <div class="sla-page">
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
          <div class="kb-label">
            {{ k.label }}
            <a-tooltip
              :title="k.tip"
              placement="top"
              :mouse-enter-delay="0.1"
              color="#fffbeb"
              :overlay-inner-style="kpiTipOverlayStyle"
            >
              <QuestionCircleOutlined class="kb-tip-ic" />
            </a-tooltip>
          </div>
        </div>
        <div class="kb-range">
          <span class="kb-range-label">统计范围</span>
          <div class="kb-range-control">
            <a-select v-model:value="kpiRange" size="small" :options="KPI_RANGE_OPTS" style="width: 96px" />
            <a-range-picker v-if="kpiRange === 'custom'" v-model:value="kpiCustom" size="small" style="width: 220px" />
          </div>
        </div>
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
            <template v-if="column.key === 'priority'">
              <span v-if="(record as Policy).isDefault" class="pri-rank pri-rank--last">末位</span>
              <span v-else class="pri-rank">{{ (record as Policy).priority }}</span>
            </template>
            <template v-else-if="column.key === 'name'">
              <span class="name-cell">
                <HolderOutlined v-if="canReorder && !(record as Policy).isDefault" class="drag-h" />
                <span class="cell-link" @click="openEdit(record as Policy)">{{ (record as Policy).name }}</span>
                <a-tag v-if="(record as Policy).isDefault" color="default" style="margin-left:6px">兜底</a-tag>
              </span>
            </template>
            <span v-else-if="column.key === 'scope'" class="scope-cell" :title="scopeText(record as Policy)">{{ scopeText(record as Policy) }}</span>
            <span v-else-if="column.key === 'calendar'" class="scope-cell">{{ calText(record as Policy) }}</span>
            <span v-else-if="column.key === 'cover'">
              <a-tag v-for="m in (record as Policy).matrix" :key="m.level" color="blue" style="margin:1px">{{ m.level.split(' ')[0] }}</a-tag>
            </span>
            <span v-else-if="column.key === 'rate'" class="rate" :class="(record as Policy).rate >= 95 ? 'ok' : (record as Policy).rate >= 85 ? 'warn' : 'bad'">
              {{ (record as Policy).rate ? (record as Policy).rate + '%' : '—' }}
            </span>
            <a-switch
              v-else-if="column.key === 'status'"
              size="small"
              :checked="(record as Policy).status === '启用'"
              checked-children="启用"
              un-checked-children="停用"
              @change="(checked: boolean) => onListStatusChange(record as Policy, checked)"
            />
            <template v-else-if="column.key === 'action'">
              <a-button type="link" size="small" @click="openEdit(record as Policy)">编辑</a-button>
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
                  <a-input v-model:value="form.name" class="kv-control" size="small" placeholder="如 投诉-VIP 加严" />
                </div>
                <div class="kv-row">
                  <span class="kv-label">生效优先级</span>
                  <span class="kv-control kv-readonly">
                    {{ form.isDefault ? '末位（兜底）' : editing ? `第 ${form.priority} 位` : '保存后置于队尾' }}
                    <a-tooltip
                      title="生效优先级由列表位置唯一决定（顺序即优先级，首条命中即止）。如需调整，请在策略列表拖拽排序，不在此手填。"
                      placement="top"
                      :mouse-enter-delay="0.1"
                      color="#ffffff"
                      :overlay-inner-style="kpiTipOverlayStyle"
                    >
                      <QuestionCircleOutlined class="kv-tip-ic" />
                    </a-tooltip>
                  </span>
                </div>
                <div class="kv-row">
                  <span class="kv-label">状态</span>
                  <a-radio-group v-model:value="form.status" class="kv-control" size="small">
                    <a-radio value="启用">启用</a-radio>
                    <a-radio value="停用">停用</a-radio>
                  </a-radio-group>
                </div>
              </div>
              <div class="kv-row">
                <span class="kv-label">备注</span>
                <a-textarea v-model:value="form.remark" class="kv-control" size="small" :rows="1" :auto-size="{ minRows: 1, maxRows: 3 }" />
              </div>
            </div>
          </section>

          <!-- ② 适用范围 -->
          <section id="sec-scope" class="sec">
            <div class="sec-h">② 适用范围 <span class="sec-sub">工单同时满足以下条件才命中本策略</span></div>
            <div class="kv-form kv-grid-2">
              <div class="kv-row">
                <span class="kv-label">业务类型</span>
                <a-select v-model:value="form.products" class="kv-control" size="small" mode="multiple" placeholder="选择业务类型，或选「全部」"
                  :options="[SCOPE_ALL, ...PRODUCT_OPTS].map((o) => ({ value: o, label: o }))" @change="onProductsChange" />
              </div>
              <div class="kv-row">
                <span class="kv-label required">工单类型</span>
                <a-select v-model:value="form.types" class="kv-control" size="small" mode="multiple" placeholder="选择工单类型，或选「全部」"
                  :options="[SCOPE_ALL, ...TYPE_OPTS].map((o) => ({ value: o, label: o }))" @change="onTypesChange" />
              </div>
              <div class="kv-row">
                <span class="kv-label">工单来源</span>
                <a-select v-model:value="form.channels" class="kv-control" size="small" mode="multiple" placeholder="选择工单来源，或选「全部」"
                  :options="[SCOPE_ALL, ...CHANNEL_OPTS].map((o) => ({ value: o, label: o }))" @change="onChannelsChange" />
              </div>
              <div class="kv-row">
                <span class="kv-label">客户类型</span>
                <a-select v-model:value="form.levels" class="kv-control" size="small" mode="multiple" placeholder="选择客户类型，或选「全部」"
                  :options="[SCOPE_ALL, ...LEVEL_OPTS].map((o) => ({ value: o, label: o }))" @change="onLevelsChange" />
              </div>
            </div>
          </section>

          <!-- ③ SLA 承诺 -->
          <section id="sec-commit" class="sec">
            <div class="sec-h">③ SLA 承诺 <span class="sec-sub">整单时效 + 节点时效；临期判定与升级链见「SLA 引擎 · 预警与升级」</span></div>

            <!-- 整单时效 -->
            <div class="block-h">整单时效</div>
            <div class="clock-toggles">
              <a-checkbox v-model:checked="form.commitClocks!.resp">整单响应（创建→首响）</a-checkbox>
              <a-checkbox v-model:checked="form.commitClocks!.solve">整单解决（创建→解决）</a-checkbox>
            </div>

            <!-- 整单响应 / 整单解决：并列展示 -->
            <div
              v-if="form.commitClocks!.resp || form.commitClocks!.solve"
              class="commit-matrix-row"
              :class="{ 'commit-matrix-row--dual': form.commitClocks!.resp && form.commitClocks!.solve }"
            >
              <div v-if="form.commitClocks!.resp" class="commit-matrix-col">
                <div class="sub-h sm commit-col-head">
                  <span class="matrix-panel-title">整单响应</span>
                  <label class="commit-cal-pick">
                    <span class="commit-cal-label">计时日历</span>
                    <a-select v-model:value="form.respCalendar" size="small" style="width:196px" :options="calFormOpts" />
                  </label>
                </div>
                <table class="matrix">
                  <thead>
                    <tr><th>优先级</th><th>时限</th></tr>
                  </thead>
                  <tbody>
                    <tr v-for="m in form.matrix" :key="`${m.level}-resp`">
                      <td class="lv">{{ m.level }}</td>
                      <td>
                        <a-input-number v-model:value="m.respVal" :min="0" size="small" style="width:66px" />
                        <a-select v-model:value="m.respUnit" size="small" style="width:76px;margin-left:4px" :options="UNIT_OPTS.map((u) => ({ value: u, label: u }))" />
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div v-if="form.commitClocks!.solve" class="commit-matrix-col">
                <div class="sub-h sm commit-col-head">
                  <span class="matrix-panel-title">整单解决</span>
                  <label class="commit-cal-pick">
                    <span class="commit-cal-label">计时日历</span>
                    <a-select v-model:value="form.solveCalendar" size="small" style="width:196px" :options="calFormOpts" />
                  </label>
                </div>
                <table class="matrix">
                  <thead>
                    <tr><th>优先级</th><th>时限</th></tr>
                  </thead>
                  <tbody>
                    <tr v-for="m in form.matrix" :key="`${m.level}-solve`">
                      <td class="lv">{{ m.level }}</td>
                      <td>
                        <a-input-number v-model:value="m.solveVal" :min="0" size="small" style="width:66px" placeholder="不设" />
                        <a-select v-model:value="m.solveUnit" size="small" style="width:76px;margin-left:4px" :options="UNIT_OPTS.map((u) => ({ value: u, label: u }))" />
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <!-- 节点时效 -->
            <div class="block-h block-h--mt">
              <span class="block-h-title">节点时效</span>
              <span class="block-h-sub">每个流程节点的响应 + 处理时效，各自关联计时日历</span>
              <a-button type="link" size="small" class="sub-add" @click="addNode"><template #icon><PlusOutlined /></template>添加节点</a-button>
            </div>
            <a-table :columns="nodeCols" :data-source="form.nodeSla" row-key="id" :pagination="false" size="small" class="node-sla-table">
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
          </section>
        </div>
      </div>

    </div>

    <!-- 匹配测试 -->
    <a-modal
      v-model:open="testOpen"
      title="SLA 策略匹配测试"
      :footer="null"
      width="560"
      centered
      destroy-on-close
      class="sla-test-modal"
    >
      <div class="test-modal">
        <section class="test-section">
          <div class="test-section-title">模拟工单</div>
          <div class="test-form-grid">
            <div class="test-field">
              <label>业务类型</label>
              <a-select v-model:value="testProduct" size="small" :options="PRODUCT_OPTS.map((o) => ({ value: o, label: o }))" />
            </div>
            <div class="test-field">
              <label>工单类型</label>
              <a-select v-model:value="testType" size="small" :options="TYPE_OPTS.map((o) => ({ value: o, label: o }))" />
            </div>
            <div class="test-field">
              <label>工单来源</label>
              <a-select v-model:value="testChannel" size="small" :options="CHANNEL_OPTS.map((o) => ({ value: o, label: o }))" />
            </div>
            <div class="test-field">
              <label>客户类型</label>
              <a-select v-model:value="testLevel" size="small" :options="LEVEL_OPTS.map((o) => ({ value: o, label: o }))" />
            </div>
            <div class="test-field test-field--full">
              <label>优先级</label>
              <a-select v-model:value="testPriorityIdx" size="small" :options="PRI_LABELS.map((l, i) => ({ value: i, label: l }))" />
            </div>
          </div>
        </section>

        <section class="test-section">
          <div class="test-section-title">匹配结果</div>
          <template v-if="testResult">
            <div class="test-hit">
              <div class="test-hit-head">
                <span class="test-hit-name">{{ testResult.name }}</span>
                <span class="test-hit-badge">优先级 {{ testResult.priority }}</span>
              </div>
              <div class="test-clocks">
                <div v-if="testRespPreview" class="test-clock-row">
                  <span class="test-clock-k">整单响应</span>
                  <span class="test-clock-v">{{ fmtClock(testRespPreview.val, testRespPreview.unit) }}</span>
                  <span class="test-clock-cal">{{ CAL_SHORT[testResult.respCalendar ?? testResult.calendar] ?? '—' }}</span>
                </div>
                <div v-if="testSolvePreview?.val != null" class="test-clock-row">
                  <span class="test-clock-k">整单解决</span>
                  <span class="test-clock-v">{{ fmtClock(testSolvePreview.val, testSolvePreview.unit) }}</span>
                  <span class="test-clock-cal">{{ CAL_SHORT[testResult.solveCalendar ?? testResult.calendar] ?? '—' }}</span>
                </div>
              </div>
            </div>
          </template>
          <div v-else class="test-miss">
            <span class="test-miss-icon">!</span>
            <span>无命中策略，该工单将无 SLA 约束</span>
          </div>
        </section>
      </div>
    </a-modal>
  </div>
</template>

<style scoped>
.sla-page { display: flex; flex-direction: column; min-height: 100%; }
.admin-page { display: flex; flex-direction: column; gap: 16px; padding: 16px 24px; }
.admin-page :deep(.admin-page-header) { margin-bottom: 0; }
.kpi-band { display: flex; align-items: flex-end; gap: 12px; flex-wrap: wrap; }
.kb-item { flex: 1; min-width: 130px; background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px 16px; }
.kb-val { font-size: 22px; font-weight: 700; color: #111827; }
.kb-item.ok .kb-val { color: #10b981; }
.kb-item.warn .kb-val { color: #ef4444; }
.kb-label { font-size: 12px; color: #9ca3af; margin-top: 2px; display: flex; align-items: center; gap: 4px; }
.kb-tip-ic { color: #1a6fff; font-size: 13px; cursor: help; opacity: 0.75; }
.kb-tip-ic:hover { opacity: 1; }
.kb-range {
  flex: none;
  margin-left: auto;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
  align-self: flex-end;
  padding-bottom: 2px;
}
.kb-range-label { font-size: 12px; color: #6b7280; line-height: 1.2; }
.kb-range-control { display: flex; align-items: center; justify-content: flex-end; gap: 6px; flex-wrap: wrap; }
.filter-card { background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px 16px; display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
.filters { display: flex; gap: 16px; flex-wrap: wrap; }
.fi { display: flex; align-items: center; gap: 8px; }
.fl { font-size: 12px; color: #6b7280; white-space: nowrap; }
.fa { display: flex; gap: 8px; }
.table-card { background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; }
.cell-link { color: #1a6fff; cursor: pointer; }
.drag-h { color: #c0c4cc; cursor: grab; flex: none; }
.name-cell { display: inline-flex; align-items: center; gap: 8px; min-width: 0; }
.pri-rank { display: inline-flex; align-items: center; justify-content: center; min-width: 22px; height: 22px; padding: 0 6px; border-radius: 6px; background: #eef4ff; color: #1a6fff; font-weight: 600; font-size: 13px; }
.pri-rank--last { background: #f3f4f6; color: #9ca3af; font-weight: 500; }
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
.form-area { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 14px; font-size: 13px; color: #374151; line-height: 1.5; }
.form-area :deep(.ant-input),
.form-area :deep(.ant-input-number-input),
.form-area :deep(.ant-select-selector),
.form-area :deep(.ant-input-affix-wrapper),
.form-area :deep(.ant-picker-input > input) {
  font-size: 13px !important;
}
.form-area :deep(.ant-checkbox-wrapper),
.form-area :deep(.ant-radio-wrapper) {
  font-size: 13px;
  color: #374151;
}
.sec { background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px 20px; scroll-margin-top: 80px; }
.sec-h { font-size: 13px; font-weight: 600; color: #111827; margin-bottom: 14px; padding-left: 10px; border-left: 3px solid #1a6fff; line-height: 1.4; }
.sec-sub { font-size: 12px; font-weight: 400; color: #9ca3af; margin-left: 8px; }
.kv-form { display: flex; flex-direction: column; gap: 10px; }
.kv-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 20px; }
.kv-grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px 16px; }
.kv-row { display: flex; align-items: center; gap: 10px; min-width: 0; }
.kv-label { flex: none; width: 72px; text-align: right; font-size: 12px; color: #6b7280; line-height: 1.4; }
.kv-label.required::before { content: '* '; color: #ff4d4f; }
.kv-control { flex: 1; min-width: 0; }
.kv-control :deep(.ant-input-number) { width: 100%; }
.kv-readonly { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; color: #374151; }
.kv-tip-ic { color: #1a6fff; font-size: 13px; cursor: help; opacity: 0.75; }
.kv-tip-ic:hover { opacity: 1; }
@media (max-width: 900px) {
  .kv-grid-2, .kv-grid-3 { grid-template-columns: 1fr; }
}
.matrix { width: 100%; border-collapse: collapse; font-size: 13px; }
.matrix th { background: #f3f4f6; color: #6b7280; font-size: 12px; font-weight: 600; text-align: left; padding: 8px 10px; border: 1px solid #e5e7eb; }
.matrix td { padding: 8px 10px; border: 1px solid #e5e7eb; color: #374151; }
.matrix td.lv { font-weight: 500; color: #374151; width: 110px; }
.sm-matrix td.type-cell { vertical-align: top; background: #fafafa; min-width: 100px; }
.sm-matrix td.method-cell { color: #4b5563; min-width: 160px; }
.unit-tag { font-size: 12px; color: #9ca3af; margin-left: 2px; }
.tip-info { color: #1e40af; background: #eff6ff; border-color: #bfdbfe; }
.th-opt { font-weight: normal; color: #9ca3af; margin-left: 2px; }
.block-h {
  font-size: 13px; font-weight: 600; color: #374151;
  margin: 14px 0 10px; padding-left: 8px;
  border-left: 2px solid #93c5fd;
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  line-height: 1.4;
}
.block-h--mt { margin-top: 22px; }
.block-h-title { font-weight: 600; color: inherit; }
.block-h-sub { font-size: 12px; font-weight: 400; color: #9ca3af; }
.block-h .sub-add { margin-left: auto; }
.sub-h { font-size: 13px; font-weight: 600; color: #374151; margin: 4px 0 10px; display: flex; align-items: center; gap: 10px; }
.sub-h.sm { font-size: 13px; font-weight: 600; color: #374151; margin-top: 12px; }
.sub-h.sm.mt { margin-top: 16px; }
.sub-h.mt { margin-top: 20px; }
.solve-sm-head { flex-wrap: wrap; }
.sub-h .sub-add { margin-left: auto; }
.clock-toggles { display: flex; gap: 20px; margin-bottom: 12px; font-size: 13px; }
.commit-matrix-row { display: grid; grid-template-columns: 1fr; gap: 16px; margin-top: 4px; }
.commit-matrix-row--dual { grid-template-columns: 1fr 1fr; }
.commit-matrix-col { min-width: 0; }
.commit-matrix-col .sub-h.sm { margin-top: 0; }
.commit-col-head { justify-content: space-between; flex-wrap: wrap; }
.matrix-panel-title { font-size: 13px; font-weight: 600; color: #374151; }
.commit-cal-pick { display: inline-flex; align-items: center; gap: 8px; font-weight: normal; margin-left: auto; font-size: 13px; }
.commit-cal-label { font-size: 12px; color: #6b7280; white-space: nowrap; }
.node-sla-table :deep(.ant-table-thead > tr > th) { font-size: 12px; }
.node-sla-table :deep(.ant-table-tbody > tr > td) { font-size: 13px; }
@media (max-width: 1100px) {
  .commit-matrix-row--dual { grid-template-columns: 1fr; }
}
.matrix .cal-row td { background: #fafafa; }
.hint { font-size: 12px; color: #9ca3af; margin-top: 4px; }
.test-modal { display: flex; flex-direction: column; gap: 16px; }
.test-section-title { font-size: 12px; font-weight: 600; color: #6b7280; margin-bottom: 10px; }
.test-form-grid {
  display: grid; grid-template-columns: 1fr 1fr; gap: 10px 16px;
  padding: 12px 14px; background: #f9fafb; border: 1px solid #f0f0f0; border-radius: 8px;
}
.test-field { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.test-field--full { grid-column: 1 / -1; }
.test-field label { font-size: 12px; color: #6b7280; }
.test-field :deep(.ant-select) { width: 100%; }
.test-hit {
  padding: 12px 14px; background: #fff; border: 1px solid #e5e7eb; border-radius: 8px;
}
.test-hit-head { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; flex-wrap: wrap; }
.test-hit-name { font-size: 14px; font-weight: 600; color: #111827; }
.test-hit-badge {
  font-size: 11px; color: #1a6fff; background: #eff6ff; border: 1px solid #bfdbfe;
  padding: 1px 8px; border-radius: 4px;
}
.test-clocks { display: flex; flex-direction: column; gap: 6px; }
.test-clock-row {
  display: grid; grid-template-columns: 72px 1fr auto; gap: 8px; align-items: center;
  font-size: 13px; padding: 8px 10px; background: #f9fafb; border-radius: 6px;
}
.test-clock-k { color: #6b7280; font-size: 12px; }
.test-clock-v { font-weight: 600; color: #111827; }
.test-clock-cal { font-size: 12px; color: #9ca3af; }
.test-miss {
  display: flex; align-items: center; gap: 8px; padding: 12px 14px;
  background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; font-size: 13px; color: #92400e;
}
.test-miss-icon {
  display: inline-flex; align-items: center; justify-content: center;
  width: 18px; height: 18px; border-radius: 50%; background: #f59e0b; color: #fff;
  font-size: 12px; font-weight: 700; flex: none;
}
:deep(.sla-test-modal .ant-modal-body) { padding-top: 12px; }
</style>
