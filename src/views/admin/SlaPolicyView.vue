<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { message, Modal } from 'ant-design-vue';
import {
  PlusOutlined, SearchOutlined, ReloadOutlined, DeleteOutlined, ThunderboltOutlined,
  ArrowLeftOutlined, HolderOutlined, DownOutlined, RightOutlined, ExportOutlined,
} from '@ant-design/icons-vue';
import AdminSectionTabs from './components/AdminSectionTabs.vue';
import { SLA_NAV_ITEMS, adminNavActiveKey } from '@/config/adminNav';
import { stdPagination } from '@/config/adminUi';

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
  cycleVal: number | null; cycleUnit: Unit;
  cal247: boolean;
}
/** ⑥ 升级：SLA 只设触发阈值 + 引用规则中心升级规则（D6 解耦 + 内联预览） */
interface EscRule { id: number; dim: '响应' | '解决'; cond: string; escalationRef: string }
/** ④ 临期规则：独立一等字段（对标 QuickService） */
interface DueSoon { mode: 'countdown' | 'percent' | 'none'; value: number; unit: Unit }
interface Policy {
  no: string; name: string;
  types: string[]; channels: string[]; levels: string[]; products: string[];
  calendar: string; priority: number; status: '启用' | '停用'; updatedAt: string;
  matrix: MatrixRow[]; dueSoon: DueSoon; escalations: EscRule[];
  pauseStates: string[]; remark: string;
  isDefault?: boolean;
  rate: number; // 达标率%（命中该规则工单的双层均达标率；0=新建/无数据）
}

const TYPE_OPTS = ['投诉', '咨询', '建议', '商机', '报修', '退费', '退换', '技术故障'];
const CHANNEL_OPTS = ['在线客服', '电话', '邮件', '小程序', 'APP'];
const LEVEL_OPTS = ['VIP', '普通', '企业客户', '战略客户'];
const PRODUCT_OPTS = ['学习机', '翻译机', '录音笔', '办公本', '智能硬件', 'AI服务', '通用'];
const SCOPE_ALL = '全部';
const CAL_OPTS = ['标准工作日历(9:00-18:00)', '7×24 自然时间', '售后工作日历'];
const PAUSE_OPTS = ['已挂起·待客户', '待第三方', '待备件', '待审核'];
const UNIT_OPTS: Unit[] = ['分钟', '小时', '工作日'];
const ESC_COND_OPTS = ['剩余 ≤ 25%', '剩余 ≤ 10%', '已超时', '超时后每 30 分钟'];

/** ⑥ 升级规则数据源 = 规则中心·升级路由（mock，含内联预览链） */
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
    { level: 'P0 紧急', respVal: 15, respUnit: '分钟', solveVal: 4, solveUnit: '小时', cycleVal: 1, cycleUnit: '小时', cal247: true },
    { level: 'P1 高', respVal: 30, respUnit: '分钟', solveVal: 8, solveUnit: '小时', cycleVal: null, cycleUnit: '小时', cal247: false },
    { level: 'P2 中', respVal: 2, respUnit: '小时', solveVal: 1, solveUnit: '工作日', cycleVal: null, cycleUnit: '小时', cal247: false },
    { level: 'P3 低', respVal: 4, respUnit: '小时', solveVal: 3, solveUnit: '工作日', cycleVal: null, cycleUnit: '小时', cal247: false },
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
    no: 'SLA001', name: 'VIP客户-紧急-学习机', types: ['投诉'], channels: [SCOPE_ALL], levels: ['VIP'], products: ['学习机'],
    calendar: '7×24 自然时间', priority: 1, status: '启用', updatedAt: '2026-06-14 10:20',
    matrix: matrixWith({ 'P0 紧急': { resp: [30, '分钟'], solve: [4, '小时'] } }),
    dueSoon: { mode: 'countdown', value: 30, unit: '分钟' },
    escalations: [
      { id: 1, dim: '响应', cond: '剩余 ≤ 25%', escalationRef: 'EC01' },
      { id: 2, dim: '解决', cond: '已超时', escalationRef: 'EC02' },
    ], pauseStates: ['已挂起·待客户'], remark: 'VIP 投诉走最严时限', rate: 96.2,
  },
  {
    no: 'SLA002', name: 'VIP客户-高优先级', types: [SCOPE_ALL], channels: [SCOPE_ALL], levels: ['VIP'], products: [SCOPE_ALL],
    calendar: '标准工作日历(9:00-18:00)', priority: 2, status: '启用', updatedAt: '2026-06-12 09:00',
    matrix: matrixWith({ 'P1 高': { resp: [1, '小时'], solve: [8, '小时'] } }),
    dueSoon: { mode: 'countdown', value: 1, unit: '小时' },
    escalations: [{ id: 1, dim: '响应', cond: '剩余 ≤ 25%', escalationRef: 'EC01' }],
    pauseStates: ['已挂起·待客户'], remark: 'VIP 全类型高优先', rate: 93.8,
  },
  {
    no: 'SLA003', name: '普通客户-紧急', types: ['投诉'], channels: [SCOPE_ALL], levels: ['普通'], products: [SCOPE_ALL],
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
  { title: '策略名称', dataIndex: 'name', key: 'name', width: 160 },
  { title: '适用范围', key: 'scope' },
  { title: '优先级覆盖', key: 'cover', width: 140 },
  { title: '达标率', key: 'rate', width: 100, sorter: (a: Policy, b: Policy) => a.rate - b.rate },
  { title: '工作日历', dataIndex: 'calendar', key: 'calendar', width: 170 },
  { title: '状态', dataIndex: 'status', key: 'status', width: 80 },
  { title: '更新时间', dataIndex: 'updatedAt', key: 'updatedAt', width: 150 },
  { title: '操作', key: 'action', width: 210 },
];
function scopeText(p: Policy): string {
  const typeLabel = isScopeAll(p.types) ? '全部类型' : p.types.join('/');
  const channelLabel = isScopeAll(p.channels) ? '全渠道' : p.channels.join('/');
  const levelLabel = isScopeAll(p.levels) ? '全部等级' : p.levels.join('/');
  const productLabel = isScopeAll(p.products) ? '全产品线' : p.products.join('/');
  return [typeLabel, channelLabel, levelLabel, productLabel].join(' · ');
}
const pagination = stdPagination();

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
const advancedCondOpen = ref(false);

function blankPolicy(): Policy {
  return {
    no: '', name: '', types: [SCOPE_ALL], channels: [SCOPE_ALL], levels: [SCOPE_ALL], products: [SCOPE_ALL],
    calendar: CAL_OPTS[0], priority: 50, status: '启用', updatedAt: '',
    matrix: defMatrix(), dueSoon: { mode: 'countdown', value: 30, unit: '分钟' },
    escalations: [], pauseStates: ['已挂起·待客户'], remark: '', rate: 0,
  };
}

// 锚点导航
const SECTIONS = [
  { key: 'basic', label: '① 基本信息' },
  { key: 'scope', label: '② 适用范围' },
  { key: 'matrix', label: '③ 时限矩阵' },
  { key: 'duesoon', label: '④ 临期规则' },
  { key: 'timing', label: '⑤ 计时口径' },
  { key: 'escalate', label: '⑥ 升级' },
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
  Object.assign(form, copy);
  enterEdit();
}
function enterEdit() {
  Object.keys(escExpanded).forEach((k) => delete escExpanded[Number(k)]);
  advancedCondOpen.value = false;
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
function goNewEscRule() { message.info('跳转「规则中心 · 升级路由」新建升级规则（原型占位）'); }
function goEscRoute() { message.info('前往「规则中心 · 升级路由」（原型占位）'); }

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
  if (!form.types.length) { message.warning('请选择适用工单类型（或全部）'); scrollToSection('scope'); return; }
  if (!matrixValid()) { message.warning('时限矩阵不合法：响应须>0，解决须 ≥ 响应'); scrollToSection('matrix'); return; }
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
const testLevel = ref('VIP');
const testProduct = ref('学习机');
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
        <div class="toolbar">
          <div class="tb-left">
            <span class="tb-title">SLA 策略</span><span class="tb-count">共 {{ filtered.length }} 条</span>
            <span class="tb-hint">· 拖拽 <HolderOutlined /> 调整生效优先级（越靠上越优先，首条命中）</span>
          </div>
          <div class="tb-right">
            <a-button @click="testOpen = true"><template #icon><ThunderboltOutlined /></template>匹配测试</a-button>
            <a-button type="primary" @click="openNew"><template #icon><PlusOutlined /></template>新建策略</a-button>
          </div>
        </div>

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
            <span v-else-if="column.key === 'scope'" class="scope-cell">{{ scopeText(record as Policy) }}</span>
            <span v-else-if="column.key === 'cover'">
              <a-tag v-for="m in (record as Policy).matrix" :key="m.level" color="blue" style="margin:1px">{{ m.level.split(' ')[0] }}</a-tag>
            </span>
            <span v-else-if="column.key === 'rate'" class="rate" :class="(record as Policy).rate >= 95 ? 'ok' : (record as Policy).rate >= 85 ? 'warn' : 'bad'">
              {{ (record as Policy).rate ? (record as Policy).rate + '%' : '—' }}
            </span>
            <template v-else-if="column.key === 'status'">
              <span class="status" :class="(record as Policy).status === '启用' ? 'on' : 'off'" @click="toggle(record as Policy)">● {{ (record as Policy).status }}</span>
            </template>
            <template v-else-if="column.key === 'action'">
              <span class="act primary" @click="openEdit(record as Policy)">编辑</span>
              <span class="act" @click="toggle(record as Policy)">{{ (record as Policy).status === '启用' ? '停用' : '启用' }}</span>
              <span class="act" @click="copyPolicy(record as Policy)">复制</span>
              <span v-if="!(record as Policy).isDefault" class="act danger" @click="del(record as Policy)">删除</span>
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
            <a-form layout="vertical">
              <a-row :gutter="16">
                <a-col :span="12"><a-form-item label="策略名称" required><a-input v-model:value="form.name" placeholder="如 投诉-VIP 加严" /></a-form-item></a-col>
                <a-col :span="6"><a-form-item label="生效优先级"><a-input-number v-model:value="form.priority" :min="1" style="width:100%" :disabled="form.isDefault" /></a-form-item></a-col>
                <a-col :span="6"><a-form-item label="状态"><a-radio-group v-model:value="form.status"><a-radio value="启用">启用</a-radio><a-radio value="停用">停用</a-radio></a-radio-group></a-form-item></a-col>
              </a-row>
              <a-form-item label="备注"><a-textarea v-model:value="form.remark" :rows="2" /></a-form-item>
            </a-form>
          </section>

          <!-- ② 适用范围 -->
          <section id="sec-scope" class="sec">
            <div class="sec-h">② 适用范围 <span class="sec-sub">工单同时满足以下条件才命中本策略</span></div>
            <a-form layout="vertical">
              <a-row :gutter="16">
                <a-col :span="12"><a-form-item label="适用工单类型" required>
                  <a-select v-model:value="form.types" mode="multiple" placeholder="选择类型，或选「全部」"
                    :options="[SCOPE_ALL, ...TYPE_OPTS].map((o) => ({ value: o, label: o }))" @change="onTypesChange" />
                </a-form-item></a-col>
                <a-col :span="12"><a-form-item label="适用渠道">
                  <a-select v-model:value="form.channels" mode="multiple" placeholder="选择渠道，或选「全部」"
                    :options="[SCOPE_ALL, ...CHANNEL_OPTS].map((o) => ({ value: o, label: o }))" @change="onChannelsChange" />
                </a-form-item></a-col>
              </a-row>
              <a-row :gutter="16">
                <a-col :span="12"><a-form-item label="客户等级">
                  <a-select v-model:value="form.levels" mode="multiple" placeholder="选择等级，或选「全部」"
                    :options="[SCOPE_ALL, ...LEVEL_OPTS].map((o) => ({ value: o, label: o }))" @change="onLevelsChange" />
                </a-form-item></a-col>
                <a-col :span="12"><a-form-item label="产品线 / 应用归属">
                  <a-select v-model:value="form.products" mode="multiple" placeholder="选择产品线，或选「全部」"
                    :options="[SCOPE_ALL, ...PRODUCT_OPTS].map((o) => ({ value: o, label: o }))" @change="onProductsChange" />
                </a-form-item></a-col>
              </a-row>
              <div class="tip">多策略命中时取列表顺序最靠前一条**唯一生效**，不叠加。</div>
            </a-form>
          </section>

          <!-- ③ 时限矩阵 -->
          <section id="sec-matrix" class="sec">
            <div class="sec-h">③ 时限矩阵 · 有限多钟 <span class="sec-sub">响应 / 解决 / 周期更新 三钟并行，解决 ≥ 响应</span></div>
            <table class="matrix">
              <thead><tr><th>优先级</th><th>响应时限</th><th>解决时限</th><th>周期更新<span class="th-opt">(可选)</span></th><th>计时</th></tr></thead>
              <tbody>
                <tr v-for="m in form.matrix" :key="m.level">
                  <td class="lv">{{ m.level }}</td>
                  <td>
                    <a-input-number v-model:value="m.respVal" :min="0" size="small" style="width:66px" />
                    <a-select v-model:value="m.respUnit" size="small" style="width:76px;margin-left:4px" :options="UNIT_OPTS.map((u) => ({ value: u, label: u }))" />
                  </td>
                  <td>
                    <a-input-number v-model:value="m.solveVal" :min="0" size="small" style="width:66px" placeholder="不设" />
                    <a-select v-model:value="m.solveUnit" size="small" style="width:76px;margin-left:4px" :options="UNIT_OPTS.map((u) => ({ value: u, label: u }))" />
                  </td>
                  <td>
                    <a-input-number v-model:value="m.cycleVal" :min="0" size="small" style="width:66px" placeholder="关闭" />
                    <a-select v-model:value="m.cycleUnit" size="small" style="width:76px;margin-left:4px" :options="UNIT_OPTS.map((u) => ({ value: u, label: u }))" />
                  </td>
                  <td><a-switch v-model:checked="m.cal247" size="small" checked-children="7×24" un-checked-children="工作时间" /></td>
                </tr>
              </tbody>
            </table>
            <div class="tip">周期更新 = 两次对客进展的最大间隔（防"已受理却晾着"），每次对客回复后重置。三钟独立计时、独立判定、并行。「计时」开关让该优先级单独走 7×24（如 P0）。</div>
          </section>

          <!-- ④ 临期规则 -->
          <section id="sec-duesoon" class="sec">
            <div class="sec-h">④ 临期规则 <span class="sec-sub">进入临期 → 橙色预警，可作为⑥升级的触发点</span></div>
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

          <!-- ⑤ 计时口径 -->
          <section id="sec-timing" class="sec">
            <div class="sec-h">⑤ 计时口径</div>
            <a-form layout="vertical">
              <a-form-item label="关联工作日历" required>
                <a-select v-model:value="form.calendar" style="max-width:360px" :options="CAL_OPTS.map((o) => ({ value: o, label: o }))" />
                <div class="hint">时限按工作时间推进；非工作时段不计入（除非选 7×24 自然时间）。</div>
              </a-form-item>
              <a-form-item label="暂停状态集（停表）">
                <a-select v-model:value="form.pauseStates" mode="multiple" style="max-width:480px" :options="PAUSE_OPTS.map((o) => ({ value: o, label: o }))" />
                <div class="hint">这些状态停止 SLA 计时，恢复后续算（如挂起·待客户）。</div>
              </a-form-item>
              <div class="adv-toggle" @click="advancedCondOpen = !advancedCondOpen">
                <component :is="advancedCondOpen ? DownOutlined : RightOutlined" /> 高级：自定义 SLA 开始 / 结束条件
                <span class="adv-badge">默认跟随状态机</span>
              </div>
              <div v-if="advancedCondOpen" class="adv-body">
                <div class="hint">开始条件 ⊕新增 / 结束条件 ⊕新增（字段 + 运算符 + 值，条件驱动计时）。</div>
                <a-alert type="info" show-icon banner message="条件驱动计时为 P1 能力，本轮仅预留入口，默认按状态机（建单起 / 首响停 / 下送停）。" />
              </div>
              <div class="tip">已拍板：待回访停整单解决计时、单独起回访时限；已结案/已关闭不再计时（PRD-55 §9）。</div>
            </a-form>
          </section>

          <!-- ⑥ 升级 -->
          <section id="sec-escalate" class="sec">
            <div class="sec-h">⑥ 升级 <span class="sec-sub">SLA 设触发阈值 → 引用「规则中心 · 升级路由」升级规则</span></div>
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
                <div class="ep-title">{{ escRuleByNo(e.escalationRef)?.name }}（只读 · 来自规则中心）</div>
                <div v-for="(l, i) in escRuleByNo(e.escalationRef)?.chain || []" :key="i" class="ep-line">{{ l }}</div>
              </div>
            </div>
            <a-button type="dashed" block @click="addEsc"><template #icon><PlusOutlined /></template>添加触发阈值</a-button>
            <div class="tip">升级动作（通知谁 / 改派 / 提优先级）统一在「规则中心 · 升级路由」维护；此处设触发时机并引用，可内联预览，缺规则可
              <a @click="goEscRoute">前往升级路由 ↗</a> 新建。</div>
          </section>
        </div>
      </div>

      <div class="ed-footer">
        <a-button @click="backToList">取消</a-button>
        <a-button type="primary" @click="save">保存策略</a-button>
      </div>
    </div>

    <!-- 匹配测试 -->
    <a-modal v-model:open="testOpen" title="SLA 策略匹配测试" :footer="null" width="480">
      <div class="test-body">
        <div class="fi"><span class="fl">工单类型</span><a-select v-model:value="testType" style="width:180px" :options="TYPE_OPTS.map((o) => ({ value: o, label: o }))" /></div>
        <div class="fi"><span class="fl">渠道</span><a-select v-model:value="testChannel" style="width:180px" :options="CHANNEL_OPTS.map((o) => ({ value: o, label: o }))" /></div>
        <div class="fi"><span class="fl">客户等级</span><a-select v-model:value="testLevel" style="width:180px" :options="LEVEL_OPTS.map((o) => ({ value: o, label: o }))" /></div>
        <div class="fi"><span class="fl">产品线</span><a-select v-model:value="testProduct" style="width:180px" :options="PRODUCT_OPTS.map((o) => ({ value: o, label: o }))" /></div>
        <div class="test-result">
          <template v-if="testResult">
            命中策略：<b>{{ testResult.name }}</b>（生效优先级 {{ testResult.priority }}）
            <div class="tr-clocks">各钟截止（P0 示例）：响应 {{ fmtClock(testResult.matrix[0].respVal, testResult.matrix[0].respUnit) }}
              / 解决 {{ fmtClock(testResult.matrix[0].solveVal, testResult.matrix[0].solveUnit) }}
              / 周期更新 {{ fmtClock(testResult.matrix[0].cycleVal, testResult.matrix[0].cycleUnit) }}</div>
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
.table-card { background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; }
.toolbar { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; border-bottom: 1px solid #e5e7eb; }
.tb-left { display: flex; align-items: baseline; gap: 8px; }
.tb-title { font-size: 14px; font-weight: 600; color: #111827; }
.tb-count { font-size: 12px; color: #9ca3af; }
.tb-hint { font-size: 12px; color: #b0b4bb; }
.tb-right { display: flex; gap: 8px; }
.act { font-size: 13px; color: #6b7280; cursor: pointer; margin-right: 12px; }
.act.primary { color: #1a6fff; } .act.danger { color: #ef4444; } .act:hover { opacity: 0.7; }
.cell-link { color: #1a6fff; cursor: pointer; }
.drag-h { color: #c0c4cc; margin-right: 6px; cursor: grab; }
.scope-cell { font-size: 12px; color: #4b5563; }
.rate { font-size: 13px; font-weight: 700; }
.rate.ok { color: #10b981; } .rate.warn { color: #f59e0b; } .rate.bad { color: #ef4444; }
.status { cursor: pointer; font-size: 13px; } .status.on { color: #10b981; } .status.off { color: #9ca3af; }
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
.sec-h { font-size: 14px; font-weight: 600; color: #111827; margin-bottom: 14px; }
.sec-sub { font-size: 12px; font-weight: normal; color: #9ca3af; margin-left: 8px; }
.matrix { width: 100%; border-collapse: collapse; }
.matrix th { background: #f3f4f6; color: #6b7280; font-size: 12px; font-weight: 600; text-align: left; padding: 8px 10px; border: 1px solid #e5e7eb; }
.matrix td { padding: 8px 10px; border: 1px solid #e5e7eb; }
.matrix td.lv { font-weight: 600; color: #374151; width: 110px; }
.th-opt { font-weight: normal; color: #9ca3af; margin-left: 2px; }
.due-group { display: flex; flex-direction: column; gap: 12px; }
.due-row { display: flex; align-items: center; gap: 8px; font-size: 13px; color: #4b5563; }
.adv-toggle { font-size: 13px; color: #1a6fff; cursor: pointer; display: flex; align-items: center; gap: 6px; margin: 4px 0; }
.adv-badge { font-size: 11px; color: #9ca3af; background: #f3f4f6; border-radius: 4px; padding: 1px 6px; }
.adv-body { margin: 6px 0 10px; display: flex; flex-direction: column; gap: 8px; }
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
