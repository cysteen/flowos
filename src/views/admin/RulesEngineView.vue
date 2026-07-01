<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { useRoute } from 'vue-router';
import { message, Modal } from 'ant-design-vue';
import {
  PlusOutlined, SearchOutlined, ReloadOutlined, DeleteOutlined,
  ArrowLeftOutlined, HolderOutlined, ThunderboltOutlined,
  ExperimentOutlined, WarningOutlined, DownOutlined, UpOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons-vue';
import AdminSectionTabs from './components/AdminSectionTabs.vue';
import AdminPageHeader from '@/components/admin/AdminPageHeader.vue';
import { RULES_NAV_ITEMS, adminNavActiveKey } from '@/config/adminNav';
import { stdPagination, toneOf } from '@/config/adminUi';

// 规则中心（PRD-58 / 需求 A4，统一规则引擎 = V1 丰富版 + 触发时机 + 派单边界）。
// 规则(列表+统一编辑器:触发时机/IF嵌套+全运算符/多动作/规则测试/冲突检测) + 路由矩阵 + 执行日志。
// 边界(按原始需求清单 A3/A4)：SLA「分级预警(A3-04)/自动升级(A3-05)」归 SLA 引擎；
//   规则引擎的「升级路由(A4-04)」是升级到目标系统(RDM/TPD/飞书)，与 SLA 自动升级不同。
//   因此规则引擎触发时机只做 事件即时 / 定时(超时)，不含 SLA 阈值。
const route = useRoute();
const activeKey = computed(() => adminNavActiveKey(route.path));

// —— 数据模型 ——
type TriggerKind = 'event' | 'timer';
type ActionKind = '派单' | '升级路由' | '设置审核人' | '通知' | '改字段' | '改优先级' | '打标签' | 'Webhook';
interface Trigger { kind: TriggerKind; event: string; freq: string }
interface CondLeaf { id: number; field: string; op: string; value: string }
interface CondGroup { id: number; operator: 'AND' | 'OR'; leaves: CondLeaf[] }
interface Conditions { operator: 'AND' | 'OR'; leaves: CondLeaf[]; groups: CondGroup[] }
interface Action {
  id: number; kind: ActionKind;
  target: '组' | '池' | '人'; value: string; inGroup: '自动分配到人' | '进池待领';
  notifyTargets: string[]; notifyChannels: string[]; fieldName: string; fieldValue: string;
}
interface Rule {
  no: string; name: string; priority: number; status: '启用' | '停用'; remark: string;
  trigger: Trigger; conditions: Conditions; actions: Action[]; hits: number;
}

const TRIGGER_KINDS = [
  { value: 'event', label: '事件即时', desc: '工单发生事件时立即评估' },
  { value: 'timer', label: '定时(超时)', desc: '按频率轮询或定点定时，需 IF 时间条件' },
] as const;
const EVENT_OPTS = [
  { value: '工单创建', label: '工单创建', desc: '新建工单入库时' },
  { value: '工单更新', label: '工单更新', desc: '任意字段变更时' },
  { value: '状态变更', label: '状态变更', desc: '工单状态流转时' },
  { value: '客户回复', label: '客户回复', desc: '客户追加回复时' },
  { value: '字段变更', label: '字段变更', desc: '指定业务字段变更时' },
];
interface TimerFreqOpt { value: string; label: string; desc: string }
interface TimerFreqGroup { label: string; options: TimerFreqOpt[] }
// 定时(超时)：分「按频率轮询」与「定时触发」两类（轻量，非完整 cron）
const TIMER_FREQ_GROUPS: TimerFreqGroup[] = [
  {
    label: '按频率轮询',
    options: [
      { value: '每 5 分钟', label: '5 分钟', desc: '高频扫描，适合积压提醒' },
      { value: '每 15 分钟', label: '15 分钟', desc: '常规扫描' },
      { value: '每 30 分钟', label: '30 分钟', desc: '常规扫描' },
      { value: '每小时', label: '1 小时', desc: '默认；适合超时关单等' },
    ],
  },
  {
    label: '定时触发',
    options: [
      { value: '每天 09:00', label: '09:00', desc: '每日早间批处理' },
      { value: '每天 18:00', label: '18:00', desc: '每日晚间批处理' },
    ],
  },
];
const TIMER_FREQ_OPTS = TIMER_FREQ_GROUPS.flatMap((g) => g.options);
function timerFreqKind(freq: string): 'interval' | 'schedule' {
  return freq.startsWith('每天') ? 'schedule' : 'interval';
}
function timerFreqLabel(freq: string): string {
  return TIMER_FREQ_OPTS.find((o) => o.value === freq)?.label || freq;
}
// 条件变量库（左栏；照搬 V1 A4 编辑器：工单字段 / 系统变量 / 流程变量 + 函数 + 模板）
interface LibField { key: string; label: string; type: string; group?: string }
// 工单公共属性：跨工单类型通用，按规则配置使用频率排序（前 5 默认展示）
const WO_PREVIEW_COUNT = 5;
const WORKORDER_COMMON_FIELDS: LibField[] = [
  { key: '产品线', label: '产品线', type: '枚举', group: '分类路由' },
  { key: '问题一级分类', label: '问题一级分类', type: '枚举', group: '分类路由' },
  { key: '工单类型', label: '工单类型', type: '枚举', group: '基础信息' },
  { key: '优先级', label: '优先级', type: '枚举', group: '基础信息' },
  { key: '状态', label: '状态', type: '枚举', group: '基础信息' },
  { key: '问题二级分类', label: '问题二级分类', type: '枚举', group: '分类路由' },
  { key: '问题三级分类', label: '问题三级分类', type: '枚举', group: '分类路由' },
  { key: '渠道', label: '渠道', type: '枚举', group: '基础信息' },
  { key: '客户类型', label: '客户类型', type: '枚举', group: '客户信息' },
  { key: '客户等级', label: '客户等级', type: '枚举', group: '客户信息' },
  { key: '风险等级', label: '风险等级', type: '枚举', group: '风险与金额' },
  { key: '退费金额', label: '退费金额', type: '数字', group: '风险与金额' },
  { key: '创建时间', label: '创建时间', type: '日期', group: '时间' },
];
const FIELD_LIBRARY = {
  workorder: WORKORDER_COMMON_FIELDS,
  system: [
    { key: '当前用户', label: '当前用户', type: '系统' },
    { key: '当前角色', label: '当前角色', type: '系统' },
    { key: '当前组织', label: '当前组织', type: '系统' },
    { key: '当前时间', label: '当前时间', type: '系统' },
  ],
  process: [
    { key: '当前节点', label: '当前节点', type: '流程' },
    { key: '前序节点', label: '前序节点', type: '流程' },
    { key: '循环次数', label: '循环次数', type: '数字' },
  ],
  // 坐席指标（面向坐席的规则用；定时扫描每个坐席时，"当前用户"=被扫描坐席，这些指标即其实时统计）
  agent: [
    { key: '在办工单数', label: '在办工单数', type: '数字' },
    { key: '积压工单数', label: '积压工单数', type: '数字' },
    { key: '今日已处理', label: '今日已处理', type: '数字' },
    { key: '满意度', label: '满意度', type: '数字' },
  ],
};
const FIELD_OPTS = [...FIELD_LIBRARY.workorder, ...FIELD_LIBRARY.system, ...FIELD_LIBRARY.process, ...FIELD_LIBRARY.agent].map((f) => f.key);
interface FuncItem { id: string; sig: string; desc: string; expr: string; field?: string }
interface FuncCategory { name: string; items: FuncItem[] }
const FUNCTION_CATEGORIES: FuncCategory[] = [
  {
    name: '日期函数',
    items: [
      { id: 'now', sig: 'now()', desc: '当前时间', expr: 'now()', field: '创建时间' },
      { id: 'daysBetween', sig: 'daysBetween(d1,d2)', desc: '两日期间天数差', expr: 'daysBetween(创建时间, now()) > 7', field: '创建时间' },
      { id: 'addHours', sig: 'addHours(date,n)', desc: '日期加 n 小时', expr: 'addHours(创建时间, 168)', field: '创建时间' },
      { id: 'isWorkday', sig: 'isWorkday(date)', desc: '是否工作日', expr: 'isWorkday(now())', field: '创建时间' },
    ],
  },
  {
    name: '字符串函数',
    items: [
      { id: 'trim', sig: 'trim(s)', desc: '去首尾空格', expr: 'trim(标题) == "投诉"', field: '工单类型' },
      { id: 'upper', sig: 'upper(s)', desc: '转大写', expr: 'upper(渠道)', field: '渠道' },
      { id: 'lower', sig: 'lower(s)', desc: '转小写', expr: 'lower(渠道)', field: '渠道' },
      { id: 'contains', sig: 'contains(s,sub)', desc: '是否包含子串', expr: 'contains(标题, "硬件")', field: '问题一级分类' },
      { id: 'replace', sig: 'replace(s,a,b)', desc: '替换文本', expr: 'replace(标题, "旧", "新")', field: '工单类型' },
      { id: 'mask', sig: 'mask(s,a,b)', desc: '脱敏', expr: 'mask(客户电话, 3, 4)', field: '客户类型' },
    ],
  },
  {
    name: '数学函数',
    items: [
      { id: 'sum', sig: 'sum(list)', desc: '求和', expr: 'sum(退费金额) > 5000', field: '退费金额' },
      { id: 'avg', sig: 'avg(list)', desc: '平均值', expr: 'avg(退费金额) > 1000', field: '退费金额' },
      { id: 'max', sig: 'max(a,b)', desc: '取较大值', expr: 'max(退费金额, 0) > 5000', field: '退费金额' },
      { id: 'min', sig: 'min(a,b)', desc: '取较小值', expr: 'min(退费金额, 5000) > 0', field: '退费金额' },
      { id: 'round', sig: 'round(n,d)', desc: '四舍五入', expr: 'round(退费金额, 2) > 5000', field: '退费金额' },
      { id: 'abs', sig: 'abs(n)', desc: '绝对值', expr: 'abs(退费金额) > 5000', field: '退费金额' },
    ],
  },
  {
    name: '聚合函数',
    items: [
      { id: 'count', sig: 'count(field,days)', desc: '统计字段在 days 天内出现次数', expr: 'count(客户ID, 7) >= 3', field: '客户类型' },
      { id: 'lastValue', sig: 'lastValue(field)', desc: '该字段上一次取值', expr: 'lastValue(状态) == "处理中"', field: '状态' },
      { id: 'historyAvg', sig: 'historyAvg(field,days)', desc: '历史均值', expr: 'historyAvg(退费金额, 30) > 1000', field: '退费金额' },
    ],
  },
];
const TEMPLATES: { name: string; leaves: [string, string, string][] }[] = [
  { name: 'VIP客户紧急工单', leaves: [['客户等级', '等于', 'VIP'], ['优先级', '等于', 'P0 紧急']] },
  { name: '退费金额超限', leaves: [['工单类型', '等于', '退费'], ['退费金额', '大于', '5000']] },
  { name: '重复进线检测', leaves: [['客户类型', '自定义表达式', 'count(客户ID,7天) >= 3']] },
  { name: 'SLA即将超时', leaves: [['状态', '等于', '处理中']] },
  { name: '坐席积压提醒', leaves: [['积压工单数', '大于', '6']] },
];
const libKeyword = ref('');
const woExpanded = ref(false);
const libKeywordNorm = computed(() => libKeyword.value.trim().toLowerCase());
function includeKeyword(...vals: string[]): boolean {
  if (!libKeywordNorm.value) return true;
  const txt = vals.join(' ').toLowerCase();
  return txt.includes(libKeywordNorm.value);
}
const filteredWorkorder = computed(() => WORKORDER_COMMON_FIELDS.filter((f) => includeKeyword(f.key, f.label, f.type, f.group || '')));
const woShowAll = computed(() => woExpanded.value || !!libKeywordNorm.value);
const displayWorkorder = computed(() => (woShowAll.value ? filteredWorkorder.value : filteredWorkorder.value.slice(0, WO_PREVIEW_COUNT)));
const woHiddenCount = computed(() => (woShowAll.value ? 0 : Math.max(0, filteredWorkorder.value.length - WO_PREVIEW_COUNT)));
const woExpandedGroups = computed(() => {
  if (!woShowAll.value) return [];
  const seen = new Set<string>();
  return displayWorkorder.value.reduce<{ name: string; fields: LibField[] }[]>((acc, f) => {
    const g = f.group || '其他';
    if (!seen.has(g)) { seen.add(g); acc.push({ name: g, fields: [] }); }
    acc.find((x) => x.name === g)!.fields.push(f);
    return acc;
  }, []);
});
const filteredSystem = computed(() => FIELD_LIBRARY.system.filter((f) => includeKeyword(f.key, f.label, f.type)));
const filteredProcess = computed(() => FIELD_LIBRARY.process.filter((f) => includeKeyword(f.key, f.label, f.type)));
const filteredAgent = computed(() => FIELD_LIBRARY.agent.filter((f) => includeKeyword(f.key, f.label, f.type)));
const fnExpanded = ref<Record<string, boolean>>({});
const filteredFunctionCategories = computed(() => FUNCTION_CATEGORIES
  .map((cat) => ({ ...cat, items: cat.items.filter((item) => includeKeyword(cat.name, item.sig, item.desc, item.expr)) }))
  .filter((cat) => cat.items.length > 0));
function toggleFnCat(name: string) { fnExpanded.value[name] = !fnExpanded.value[name]; }
function isFnCatOpen(name: string): boolean { return !!fnExpanded.value[name] || !!libKeywordNorm.value; }
const filteredTemplates = computed(() => TEMPLATES.filter((t) => includeKeyword(t.name, t.leaves.flat().join(' '))));
// 全运算符（分组）
const OP_OPTS = [
  { label: '比较', options: ['等于', '不等于', '大于', '大于等于', '小于', '小于等于'].map((o) => ({ value: o, label: o })) },
  { label: '包含', options: ['包含', '不包含', '开头是', '结尾是'].map((o) => ({ value: o, label: o })) },
  { label: '集合', options: ['属于列表', '不属于列表'].map((o) => ({ value: o, label: o })) },
  { label: '空值', options: ['为空', '不为空'].map((o) => ({ value: o, label: o })) },
  { label: '高级', options: ['正则匹配', '区间范围', '自定义表达式'].map((o) => ({ value: o, label: o })) },
];
const ACTION_KINDS: ActionKind[] = ['派单', '升级路由', '设置审核人', '通知', '改字段', '改优先级', '打标签', 'Webhook'];
const DISPATCH_TARGETS = ['组', '池', '人'];
const GROUP_OPTS = ['学习机处理组', '技术支持组', '大客户专属组', '夜班应急组', '二线技术支持组'];
const POOL_OPTS = ['通用池', '商机池', '销服池', '大客户专属池'];
const PERSON_OPTS = ['张三', '李四', '王五'];
const IN_GROUP_OPTS = ['自动分配到人', '进池待领'];
// 升级路由（A4-04）：升级到目标系统/通道
const ESCALATE_TARGETS = ['RDM', 'TPD', '飞书', '磐石', '二线技术支持组'];
const NOTIFY_TARGETS = ['当前用户', '处理人', '班组长', '处理人+班组长', '指定人'];
const NOTIFY_CHANNELS = ['系统通知', '短信', '邮件', 'i讯飞'];
const PRIORITY_OPTS = ['P0 紧急', 'P1 高', 'P2 中', 'P3 低'];
const AUDITOR_OPTS = ['客服主管', '质检组', '二线组长'];

function dispatchValueOpts(target: string): string[] {
  return target === '池' ? POOL_OPTS : target === '人' ? PERSON_OPTS : GROUP_OPTS;
}

// —— 工具：触发/类型/命中策略/摘要 ——
function triggerText(t: Trigger): string {
  if (t.kind === 'event') return `事件·${t.event}`;
  return timerFreqKind(t.freq) === 'schedule' ? `定时·每天 ${timerFreqLabel(t.freq)}` : `轮询·每 ${timerFreqLabel(t.freq)}`;
}
function triggerPreview(t: Trigger): string {
  if (t.kind === 'event') return `当「${t.event}」时评估`;
  return timerFreqKind(t.freq) === 'schedule'
    ? `每天 ${timerFreqLabel(t.freq)} 执行`
    : `每 ${timerFreqLabel(t.freq)} 轮询`;
}
function setTriggerKind(kind: TriggerKind) {
  form.trigger.kind = kind;
  if (kind === 'timer' && !form.trigger.freq) form.trigger.freq = '每小时';
}
function setRuleStatus(enabled: boolean) {
  form.status = enabled ? '启用' : '停用';
}
function addTimerCondExample() {
  form.conditions.leaves.push(mkLeaf('状态', '等于', '待客户回复'), mkLeaf('创建时间', '自定义表达式', 'daysBetween(创建时间, now()) > 7'));
  message.success('已插入定时规则示例条件（待客户回复 + 超 7 天）');
}
function actionTypeOf(a: Action): string {
  if (a.kind === '派单') return a.target === '池' ? '工单池' : '派单';
  if (a.kind === '升级路由') return '升级路由';
  if (a.kind === '设置审核人') return '审核';
  if (a.kind === '通知') return '通知';
  if (a.kind === 'Webhook') return '集成';
  return '改值'; // 改字段 / 改优先级 / 打标签
}
function typeOf(r: Rule): string {
  const a = r.actions[0];
  return a ? actionTypeOf(a) : '改值';
}
// 多动作时的全部类型（列表 tooltip 用，避免"只显主动作"的信息损失）
function allTypesOf(r: Rule): string {
  return [...new Set(r.actions.map(actionTypeOf))].join(' · ');
}
function hitPolicyOf(r: Rule): string {
  return r.actions.some((a) => a.kind === '派单' || a.kind === '升级路由') ? '首条命中' : '全部命中';
}
function leafText(c: CondLeaf): string { return `${c.field}${c.op}${c.value}`; }
function condText(r: Rule): string {
  const root = r.conditions.leaves.map(leafText).join(` ${r.conditions.operator === 'AND' ? '∧' : '∨'} `);
  const grps = r.conditions.groups.map((g) => `(${g.leaves.map(leafText).join(g.operator === 'AND' ? '∧' : '∨')})`).join(' ∧ ');
  return [root, grps].filter(Boolean).join(' ∧ ') || '—';
}
function actionText(a: Action): string {
  if (a.kind === '派单') return `派→${a.value || a.target}${a.target === '组' ? `(${a.inGroup})` : ''}`;
  if (a.kind === '升级路由') return `升级路由→${a.value}`;
  if (a.kind === '设置审核人') return `审核人→${a.value}`;
  if (a.kind === '通知') return `通知 ${a.notifyTargets.join('+')}·${a.notifyChannels.join('/')}`;
  if (a.kind === '改优先级') return `改优先级→${a.fieldValue}`;
  if (a.kind === '改字段') return `改${a.fieldName}→${a.fieldValue}`;
  if (a.kind === '打标签') return `打标:${a.value}`;
  return `Webhook:${a.value}`;
}
const actionsText = (r: Rule) => r.actions.map(actionText).join('；') || '—';

function defTrigger(kind: TriggerKind = 'event'): Trigger { return { kind, event: '工单创建', freq: '每小时' }; }
let seq = 1000;
const nid = () => ++seq;
function mkLeaf(field = FIELD_OPTS[0], op = '等于', value = ''): CondLeaf { return { id: nid(), field, op, value }; }
function mkAction(kind: ActionKind, partial: Partial<Action> = {}): Action {
  return {
    id: nid(), kind, target: '组', value: '', inGroup: '自动分配到人',
    notifyTargets: ['处理人'], notifyChannels: ['系统通知'], fieldName: '状态', fieldValue: '', ...partial,
  };
}

// —— 规则数据（mock，均为规则引擎职责：路由/池/升级路由/审核/定时）——
const rules = ref<Rule[]>([
  {
    no: 'RL001', name: '投诉自动派学习机组', priority: 1, status: '启用', remark: '',
    trigger: defTrigger('event'),
    conditions: { operator: 'AND', leaves: [mkLeaf('工单类型', '等于', '投诉'), mkLeaf('产品线', '等于', '学习机')], groups: [] },
    actions: [mkAction('派单', { target: '组', value: '学习机处理组' })], hits: 1240,
  },
  {
    no: 'RL002', name: 'VIP 入大客户专属池', priority: 2, status: '启用', remark: '',
    trigger: defTrigger('event'),
    conditions: { operator: 'AND', leaves: [mkLeaf('客户类型', '属于列表', '大V博主,律师,记者')], groups: [] },
    actions: [mkAction('派单', { target: '池', value: '大客户专属池' })], hits: 320,
  },
  {
    no: 'RL003', name: '硬件故障升级 RDM', priority: 3, status: '启用', remark: '升级到目标系统(A4-04)',
    trigger: defTrigger('event'),
    conditions: { operator: 'AND', leaves: [mkLeaf('工单类型', '等于', '售后')], groups: [{ id: nid(), operator: 'OR', leaves: [mkLeaf('产品线', '等于', '学习机'), mkLeaf('产品线', '等于', '翻译机')] }] },
    actions: [mkAction('升级路由', { value: 'RDM' })], hits: 86,
  },
  {
    no: 'RL004', name: '7天无回复自动关单', priority: 4, status: '启用', remark: '定时(非SLA)',
    trigger: defTrigger('timer'),
    conditions: { operator: 'AND', leaves: [mkLeaf('状态', '等于', '待客户回复'), mkLeaf('创建时间', '大于', '168小时')], groups: [] },
    actions: [mkAction('改字段', { fieldName: '状态', fieldValue: '已关闭' })], hits: 210,
  },
  {
    no: 'RL005', name: '大额退款需审核', priority: 5, status: '启用', remark: '',
    trigger: defTrigger('event'),
    conditions: { operator: 'AND', leaves: [mkLeaf('工单类型', '等于', '退款')], groups: [{ id: nid(), operator: 'OR', leaves: [mkLeaf('产品线', '等于', '学习机'), mkLeaf('产品线', '等于', '翻译机')] }] },
    actions: [mkAction('设置审核人', { value: '客服主管' })], hits: 64,
  },
  {
    no: 'RL006', name: '坐席积压提醒', priority: 6, status: '启用', remark: '面向坐席·定时',
    trigger: defTrigger('timer'),
    conditions: { operator: 'AND', leaves: [mkLeaf('积压工单数', '大于', '6')], groups: [] },
    actions: [mkAction('通知', { notifyTargets: ['当前用户'], notifyChannels: ['系统通知'] })], hits: 38,
  },
]);

// —— 筛选 ——
const fTrigger = ref('全部'); const fType = ref('全部'); const fStatus = ref('全部');
const applied = reactive({ trigger: '全部', type: '全部', status: '全部' });
function onQuery() { applied.trigger = fTrigger.value; applied.type = fType.value; applied.status = fStatus.value; }
function onReset() { fTrigger.value = '全部'; fType.value = '全部'; fStatus.value = '全部'; onQuery(); }
const filtered = computed(() => rules.value.filter((r) => {
  if (applied.trigger !== '全部' && r.trigger.kind !== applied.trigger) return false;
  if (applied.type !== '全部' && typeOf(r) !== applied.type) return false;
  if (applied.status !== '全部' && r.status !== applied.status) return false;
  return true;
}));
const canReorder = computed(() => applied.trigger === '全部' && applied.type === '全部' && applied.status === '全部');

// —— 冲突检测（同触发+同类型+首条件值相同但目标不同）——
function firstLeafVal(r: Rule): string { return r.conditions.leaves[0]?.value || ''; }
function primaryTarget(r: Rule): string { const a = r.actions[0]; return a ? (a.value || a.target) : ''; }
const conflicts = computed(() => {
  const out: { a: string; b: string; key: string }[] = [];
  const rs = rules.value.filter((r) => r.status === '启用');
  for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) {
    const a = rs[i]; const b = rs[j];
    if (a.trigger.kind === b.trigger.kind && typeOf(a) === typeOf(b)) {
      const ka = firstLeafVal(a);
      if (ka && ka === firstLeafVal(b) && primaryTarget(a) !== primaryTarget(b)) out.push({ a: a.name, b: b.name, key: ka });
    }
  }
  return out;
});
function leavesCount(c: Conditions): number {
  return c.leaves.length + c.groups.reduce((sum, g) => sum + g.leaves.length, 0);
}
const currentConflicts = computed(() => {
  const draft = form as Rule;
  const out: { with: string; key: string }[] = [];
  const key = firstLeafVal(draft);
  if (!key) return out;
  const target = primaryTarget(draft);
  for (const r of rules.value) {
    if (editing.value && r.no === editing.value.no) continue;
    if (r.status !== '启用') continue;
    if (r.trigger.kind === draft.trigger.kind && typeOf(r) === typeOf(draft) && firstLeafVal(r) === key && primaryTarget(r) !== target) {
      out.push({ with: r.name, key });
    }
  }
  return out;
});

const columns = [
  { title: '规则名称', dataIndex: 'name', key: 'name', width: 170 },
  { title: '触发时机', key: 'trigger', width: 130 },
  { title: '类型', key: 'type', width: 84 },
  { title: '命中策略', key: 'hit', width: 90 },
  { title: 'IF 条件', key: 'cond' },
  { title: 'THEN 动作', key: 'act' },
  { title: '命中', dataIndex: 'hits', key: 'hits', width: 64 },
  { title: '状态', key: 'status', width: 76 },
  { title: '操作', key: 'op', width: 196 },
];
const pagination = stdPagination();

// —— 拖拽排序 ——
const dragIdx = ref(-1);
function rowProps(record: Rule, index: number): Record<string, unknown> {
  return {
    draggable: canReorder.value,
    onDragstart: () => { dragIdx.value = index; },
    onDragover: (e: DragEvent) => e.preventDefault(),
    onDrop: () => {
      const from = dragIdx.value; dragIdx.value = -1;
      if (from < 0 || from === index) return;
      const [m] = rules.value.splice(from, 1); rules.value.splice(index, 0, m);
      rules.value.forEach((r, i) => { r.priority = i + 1; });
      message.success('已调整优先级');
    },
  };
}

// —— 编辑（list / edit）——
const mode = ref<'list' | 'edit'>('list');
const editing = ref<Rule | null>(null);
const form = reactive<Rule>(blankRule());
function blankRule(): Rule {
  return {
    no: '', name: '', priority: 50, status: '启用', remark: '',
    trigger: defTrigger('event'),
    conditions: { operator: 'AND', leaves: [mkLeaf('工单类型', '等于', '')], groups: [] },
    actions: [mkAction('派单', { value: '学习机处理组' })], hits: 0,
  };
}
const elseEnabled = ref(false);
const elseTarget = ref('通用池');
function openNew() { editing.value = null; Object.assign(form, blankRule()); testResult.value = null; elseEnabled.value = false; elseTarget.value = '通用池'; woExpanded.value = false; mode.value = 'edit'; }
function openEdit(r: Rule) { editing.value = r; Object.assign(form, JSON.parse(JSON.stringify(r))); testResult.value = null; elseEnabled.value = false; elseTarget.value = '通用池'; woExpanded.value = false; mode.value = 'edit'; }
function backToList() { mode.value = 'list'; }

// 条件（2 层嵌套）
function addRootLeaf() { form.conditions.leaves.push(mkLeaf()); }
function delRootLeaf(id: number) { form.conditions.leaves = form.conditions.leaves.filter((c) => c.id !== id); }
function addGroup() { form.conditions.groups.push({ id: nid(), operator: 'OR', leaves: [mkLeaf()] }); }
function delGroup(id: number) { form.conditions.groups = form.conditions.groups.filter((g) => g.id !== id); }
function addGroupLeaf(g: CondGroup) { g.leaves.push(mkLeaf()); }
function delGroupLeaf(g: CondGroup, id: number) { g.leaves = g.leaves.filter((c) => c.id !== id); }
// 动作
function addAction() { form.actions.push(mkAction('通知')); }
function delAction(id: number) { form.actions = form.actions.filter((a) => a.id !== id); }
// 变量库交互：点字段/函数/模板 快速搭条件
function defaultOp(type: string): string { return type === '数字' ? '大于' : type === '日期' ? '大于' : '等于'; }
function addFieldToCond(f: { key: string; type: string }) { form.conditions.leaves.push(mkLeaf(f.key, defaultOp(f.type), '')); }
function insertFuncItem(item: FuncItem) {
  form.conditions.leaves.push(mkLeaf(item.field || '创建时间', '自定义表达式', item.expr));
  message.success(`已插入 ${item.sig}，可按需修改表达式`);
}
function applyTemplate(t: { name: string; leaves: [string, string, string][] }) {
  form.conditions = { operator: 'AND', leaves: t.leaves.map(([f, o, v]) => mkLeaf(f, o, v)), groups: [] };
  message.success(`已套用模板：${t.name}`);
}

function save() {
  if (!form.name.trim()) { message.warning('请填写规则名称'); return; }
  if (!form.actions.length) { message.warning('至少配置一个动作'); return; }
  if (editing.value) { Object.assign(editing.value, JSON.parse(JSON.stringify(form))); message.success('已保存'); }
  else {
    form.no = `RL${String(rules.value.length + 1).padStart(3, '0')}`;
    rules.value.push(JSON.parse(JSON.stringify(form)));
    rules.value.forEach((r, i) => { r.priority = i + 1; });
    message.success('已创建');
  }
  backToList();
}
function toggle(r: Rule) {
  const next = r.status === '启用' ? '停用' : '启用';
  Modal.confirm({ title: '状态变更', content: `确定${next}「${r.name}」？`, onOk: () => { r.status = next; message.success(`已${next}`); } });
}
function copyRule(r: Rule) {
  rules.value.push({ ...JSON.parse(JSON.stringify(r)), no: `RL${String(rules.value.length + 1).padStart(3, '0')}`, name: `${r.name} 副本`, status: '停用' });
  rules.value.forEach((x, i) => { x.priority = i + 1; });
  message.success('已复制（停用态）');
}
function del(r: Rule) {
  Modal.confirm({
    title: '确认删除', okText: '删除', okType: 'danger', cancelText: '取消', content: `删除规则「${r.name}」？`,
    onOk: () => { rules.value = rules.value.filter((x) => x.no !== r.no); message.success('已删除'); },
  });
}

// —— 规则测试 ——
const sample = reactive<Record<string, string>>({ 工单类型: '投诉', 产品线: '学习机', 客户类型: '普通用户', 状态: '待受理' });
const testResult = ref<null | { hit: boolean }>(null);
function evalLeaf(c: CondLeaf): boolean {
  const v = sample[c.field] ?? '';
  switch (c.op) {
    case '等于': return v === c.value;
    case '不等于': return v !== c.value;
    case '包含': return String(v).includes(c.value);
    case '不包含': return !String(v).includes(c.value);
    case '开头是': return String(v).startsWith(c.value);
    case '结尾是': return String(v).endsWith(c.value);
    case '属于列表': return c.value.split(/[,，]/).map((s) => s.trim()).includes(v);
    case '不属于列表': return !c.value.split(/[,，]/).map((s) => s.trim()).includes(v);
    case '为空': return !v;
    case '不为空': return !!v;
    default: return true; // 比较/正则/区间/表达式：原型视为通过
  }
}
function combine(op: 'AND' | 'OR', arr: boolean[]): boolean { return arr.length === 0 ? true : (op === 'AND' ? arr.every(Boolean) : arr.some(Boolean)); }
function runTest() {
  const c = form.conditions;
  const rootLeaves = c.leaves.map(evalLeaf);
  const groupRes = c.groups.map((g) => combine(g.operator, g.leaves.map(evalLeaf)));
  testResult.value = { hit: combine(c.operator, [...rootLeaves, ...groupRes]) };
}

// —— 路由矩阵（mock）——
const PRODUCTS = ['学习机', '翻译机', '录音笔', '智能办公本'];
const TICKET_TYPES = ['咨询', '投诉', '售后', '商机'];
const ESC_TYPES = ['技术问题', '产品缺陷', '紧急事项'];
const routingMatrix: Record<string, Record<string, string>> = {
  学习机: { 咨询: '学习机一线组', 投诉: '学习机处理组', 售后: '学习机售后组', 商机: '商机跟进组' },
  翻译机: { 咨询: '翻译机一线组', 投诉: '翻译机处理组', 售后: '翻译机售后组', 商机: '商机跟进组' },
  录音笔: { 咨询: '通用一线组', 投诉: '通用处理组', 售后: '硬件售后组', 商机: '商机跟进组' },
  智能办公本: { 咨询: '通用一线组', 投诉: '通用处理组', 售后: '硬件售后组', 商机: '商机跟进组' },
};
// 升级路由矩阵（A4-04：产品线 × 升级类型 → 目标系统/通道）
const escMatrix: Record<string, Record<string, string>> = {
  学习机: { 技术问题: 'RDM', 产品缺陷: 'TPD', 紧急事项: '飞书' },
  翻译机: { 技术问题: 'RDM', 产品缺陷: 'TPD', 紧急事项: '飞书' },
  录音笔: { 技术问题: 'RDM', 产品缺陷: '磐石', 紧急事项: '飞书' },
  智能办公本: { 技术问题: 'RDM', 产品缺陷: '磐石', 紧急事项: '飞书' },
};

// —— 执行日志 ——
const logStats = { hitRate: '94.2%', coverage: '78%', total: '12,480' };
const ranking = computed(() => [...rules.value].sort((a, b) => b.hits - a.hits).slice(0, 5));
const logRows = [
  { time: '2026-06-30 11:20:05', rule: 'RL001 投诉自动派学习机组', ticket: 'LCMN-20260610-73026', result: '命中·已派发' },
  { time: '2026-06-30 11:18:30', rule: 'RL003 硬件故障升级 RDM', ticket: 'LCMN-20260610-75002', result: '命中·已升级路由' },
  { time: '2026-06-30 11:05:12', rule: 'RL002 VIP 入大客户专属池', ticket: 'LCMN-20260610-73118', result: '命中·已入池' },
  { time: '2026-06-30 10:50:44', rule: 'RL005 大额退款需审核', ticket: 'LCMN-20260610-72980', result: '命中·待审核' },
];
const logCols = [
  { title: '执行时间', dataIndex: 'time', key: 'time', width: 170 },
  { title: '规则', dataIndex: 'rule', key: 'rule' },
  { title: '工单', dataIndex: 'ticket', key: 'ticket', width: 200 },
  { title: '结果', dataIndex: 'result', key: 'result', width: 150 },
];
</script>

<template>
  <div class="rules-engine">
    <AdminSectionTabs :items="RULES_NAV_ITEMS" :active-key="activeKey" />

    <!-- ============ 路由矩阵 ============ -->
    <div v-if="activeKey === 'rules-matrix'" class="body">
      <AdminPageHeader title="路由矩阵" subtitle="流转路由 / 升级路由 的直观矩阵视图（产品线 × 类型 → 目标）；编辑仍在「规则」统一编辑器。" />
      <div class="panel">
        <div class="sec-h">流转路由矩阵（产品线 × 工单类型 → 处理组）</div>
        <table class="matrix">
          <thead><tr><th>产品线 \ 类型</th><th v-for="t in TICKET_TYPES" :key="t">{{ t }}</th></tr></thead>
          <tbody>
            <tr v-for="p in PRODUCTS" :key="p"><td class="rowh">{{ p }}</td>
              <td v-for="t in TICKET_TYPES" :key="t"><a-tag color="geekblue">{{ routingMatrix[p][t] }}</a-tag></td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="panel">
        <div class="sec-h">升级路由矩阵（产品线 × 升级类型 → 目标系统）<span class="sec-sub">SLA 超时自动升级在 SLA 引擎；此处为升级到目标系统(A4-04)</span></div>
        <table class="matrix">
          <thead><tr><th>产品线 \ 升级类型</th><th v-for="t in ESC_TYPES" :key="t">{{ t }}</th></tr></thead>
          <tbody>
            <tr v-for="p in PRODUCTS" :key="p"><td class="rowh">{{ p }}</td>
              <td v-for="t in ESC_TYPES" :key="t"><a-tag color="orange">{{ escMatrix[p][t] }}</a-tag></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- ============ 执行日志 ============ -->
    <div v-else-if="activeKey === 'rules-logs'" class="body">
      <AdminPageHeader title="执行日志" subtitle="规则命中率 / 覆盖率 / 命中排行 + 明细（灰度发布、版本回滚为 P1）">
        <template #actions><ThunderboltOutlined style="color:#1a6fff" /></template>
      </AdminPageHeader>
      <div class="stat-row">
        <div class="stat"><div class="s-l">规则命中率</div><div class="s-v rate-ok">{{ logStats.hitRate }}</div></div>
        <div class="stat"><div class="s-l">规则覆盖率</div><div class="s-v">{{ logStats.coverage }}</div></div>
        <div class="stat"><div class="s-l">今日执行</div><div class="s-v">{{ logStats.total }}</div></div>
      </div>
      <div class="log-grid">
        <div class="panel">
          <div class="sec-h">执行明细</div>
          <a-table :columns="logCols" :data-source="logRows" row-key="time" :pagination="pagination" size="middle">
            <template #bodyCell="{ column, record }">
              <span v-if="column.key === 'result'" class="rate-ok">{{ record.result }}</span>
              <span v-else-if="column.key === 'ticket'" class="cell-link">{{ record.ticket }}</span>
            </template>
          </a-table>
        </div>
        <div class="panel rank">
          <div class="sec-h">规则命中排行</div>
          <div v-for="(r, i) in ranking" :key="r.no" class="rank-row">
            <span class="rk" :class="{ top: i < 3 }">{{ i + 1 }}</span>
            <span class="rk-name">{{ r.name }}</span>
            <span class="rk-hit">{{ r.hits }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- ============ 规则 · 列表 ============ -->
    <div v-else-if="mode === 'list'" class="body">
      <AdminPageHeader title="规则" subtitle="统一规则引擎：触发时机(事件/定时) → 条件(可嵌套/全运算符) → 动作；命中按类型(派单/升级路由首条、通知/打标全部)。SLA 预警/升级在 SLA 引擎。">
        <template #actions><a-button type="primary" @click="openNew"><template #icon><PlusOutlined /></template>新建规则</a-button></template>
      </AdminPageHeader>

      <div v-if="conflicts.length" class="conflict-bar">
        <WarningOutlined />
        <span>检测到 <b>{{ conflicts.length }}</b> 组潜在冲突：{{ conflicts.map((c) => `「${c.a}」与「${c.b}」在 ${c.key} 上目标不同`).join('；') }}</span>
      </div>

      <div class="filter-card">
        <div class="filters">
          <div class="fi"><span class="fl">触发时机</span><a-select v-model:value="fTrigger" style="width:130px" :options="[{ value: '全部', label: '全部' }, ...TRIGGER_KINDS]" /></div>
          <div class="fi"><span class="fl">类型</span><a-select v-model:value="fType" style="width:120px" :options="['全部', '派单', '工单池', '升级路由', '审核', '通知', '改值', '集成'].map((o) => ({ value: o, label: o }))" /></div>
          <div class="fi"><span class="fl">状态</span><a-select v-model:value="fStatus" style="width:110px" :options="['全部', '启用', '停用'].map((o) => ({ value: o, label: o }))" /></div>
        </div>
        <div class="fa">
          <a-button type="primary" @click="onQuery"><template #icon><SearchOutlined /></template>查询</a-button>
          <a-button @click="onReset"><template #icon><ReloadOutlined /></template>重置</a-button>
        </div>
      </div>

      <div class="table-card">
        <a-table :columns="columns" :data-source="filtered" row-key="no" :pagination="pagination" size="middle" :custom-row="(rowProps as any)">
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'name'">
              <HolderOutlined v-if="canReorder" class="drag-h" />
              <span class="cell-link" @click="openEdit(record as Rule)">{{ (record as Rule).name }}</span>
            </template>
            <a-tag v-else-if="column.key === 'trigger'" color="purple">{{ triggerText((record as Rule).trigger) }}</a-tag>
            <a-tooltip v-else-if="column.key === 'type'" :title="`全部动作类型：${allTypesOf(record as Rule)}`">
              <a-tag color="blue">{{ typeOf(record as Rule) }}<span v-if="(record as Rule).actions.length > 1" class="type-more">+{{ (record as Rule).actions.length - 1 }}</span></a-tag>
            </a-tooltip>
            <span v-else-if="column.key === 'hit'" class="muted">{{ hitPolicyOf(record as Rule) }}</span>
            <span v-else-if="column.key === 'cond'" class="sum" :title="condText(record as Rule)">{{ condText(record as Rule) }}</span>
            <span v-else-if="column.key === 'act'" class="sum" :title="actionsText(record as Rule)">{{ actionsText(record as Rule) }}</span>
            <a-tag v-else-if="column.key === 'status'" :color="toneOf((record as Rule).status)">{{ (record as Rule).status }}</a-tag>
            <template v-else-if="column.key === 'op'">
              <a-button type="link" size="small" @click="openEdit(record as Rule)">编辑</a-button>
              <a-button type="link" size="small" @click="toggle(record as Rule)">{{ (record as Rule).status === '启用' ? '停用' : '启用' }}</a-button>
              <a-button type="link" size="small" @click="copyRule(record as Rule)">复制</a-button>
              <a-button type="link" size="small" danger @click="del(record as Rule)">删除</a-button>
            </template>
          </template>
        </a-table>
      </div>
    </div>

    <!-- ============ 规则 · 单页编辑 ============ -->
    <div v-else class="editor">
      <div class="ed-head">
        <a-button type="text" class="back" @click="backToList"><template #icon><ArrowLeftOutlined /></template>返回</a-button>
        <span class="ed-title">{{ editing ? '编辑规则' : '新建规则' }}{{ form.name ? '：' + form.name : '' }}</span>
        <a-tooltip title="类型由 THEN 动作自动推导，无需手选：派单到组/人=路由、派单到池=工单池、升级路由=升级路由、设审核人=审核、通知=通知。">
          <span class="ed-type-hint">{{ typeOf(form) }} · 类型自动</span>
        </a-tooltip>
        <div class="ed-actions"><a-button @click="backToList">取消</a-button><a-button type="primary" @click="save">保存</a-button></div>
      </div>

      <div class="ed-main">
        <!-- 左：条件变量库 -->
        <aside class="ed-lib">
          <div class="lib-h">条件变量库</div>
          <a-input v-model:value="libKeyword" size="small" allow-clear class="lib-search" placeholder="搜索变量 / 函数 / 模板" />
          <div class="lib-grp lib-grp-head">
            <span>工单公共属性</span>
            <span class="lib-grp-sub">{{ filteredWorkorder.length }} 项</span>
          </div>
          <template v-if="woShowAll">
            <template v-for="grp in woExpandedGroups" :key="grp.name">
              <div class="lib-subgrp">{{ grp.name }}</div>
              <div v-for="f in grp.fields" :key="f.key" class="lib-chip wo has-type" @click="addFieldToCond(f)">
                <span class="lc-dot" /><span class="lc-label">{{ f.label }}</span><span class="lc-type">{{ f.type }}</span>
              </div>
            </template>
          </template>
          <template v-else>
            <div v-for="f in displayWorkorder" :key="f.key" class="lib-chip wo has-type" @click="addFieldToCond(f)">
              <span class="lc-dot" /><span class="lc-label">{{ f.label }}</span><span class="lc-type">{{ f.type }}</span>
            </div>
          </template>
          <button v-if="woHiddenCount > 0" type="button" class="lib-toggle" @click="woExpanded = true">
            <DownOutlined />展开其余 {{ woHiddenCount }} 项
          </button>
          <button v-else-if="woExpanded && !libKeywordNorm && filteredWorkorder.length > WO_PREVIEW_COUNT" type="button" class="lib-toggle" @click="woExpanded = false">
            <UpOutlined />收起
          </button>
          <div class="lib-grp">系统变量</div>
          <div v-for="f in filteredSystem" :key="f.key" class="lib-chip sys" @click="addFieldToCond(f)">
            <span class="lc-dot" /><span class="lc-label">{{ f.label }}</span>
          </div>
          <div class="lib-grp">流程变量</div>
          <div v-for="f in filteredProcess" :key="f.key" class="lib-chip proc" @click="addFieldToCond(f)">
            <span class="lc-dot" /><span class="lc-label">{{ f.label }}</span>
          </div>
          <div class="lib-grp">坐席指标</div>
          <div v-for="f in filteredAgent" :key="f.key" class="lib-chip agent has-type" @click="addFieldToCond(f)">
            <span class="lc-dot" /><span class="lc-label">{{ f.label }}</span><span class="lc-type">{{ f.type }}</span>
          </div>
          <div class="lib-grp">内置函数<span class="field-tip">（点击分类展开，再点函数插入 IF 条件）</span></div>
          <div v-for="cat in filteredFunctionCategories" :key="cat.name" class="fn-cat">
            <button type="button" class="lib-chip fn fn-cat-head" @click="toggleFnCat(cat.name)">
              <span class="lc-fx">f(x)</span>
              <span class="lc-label">{{ cat.name }}</span>
              <span class="fn-count">{{ cat.items.length }}</span>
              <DownOutlined v-if="!isFnCatOpen(cat.name)" class="fn-chevron" />
              <UpOutlined v-else class="fn-chevron" />
            </button>
            <div v-if="isFnCatOpen(cat.name)" class="fn-items">
              <button v-for="item in cat.items" :key="item.id" type="button" class="fn-item" :title="item.expr" @click="insertFuncItem(item)">
                <code class="fn-sig">{{ item.sig }}</code>
                <span class="fn-desc">{{ item.desc }}</span>
              </button>
            </div>
          </div>
          <div class="lib-grp">快捷模板</div>
          <div v-for="t in filteredTemplates" :key="t.name" class="lib-tpl" @click="applyTemplate(t)">
            <div class="lt-name">{{ t.name }}</div>
            <div class="lt-desc">{{ t.leaves.map((l) => l.join(' ')).join(' · ') }}</div>
          </div>
          <div
            v-if="!filteredWorkorder.length && !filteredSystem.length && !filteredProcess.length && !filteredAgent.length && !filteredFunctionCategories.length && !filteredTemplates.length"
            class="lib-empty"
          >
            未找到匹配项
          </div>
        </aside>

        <!-- 中：规则画布（对齐 V1 IF-THEN-ELSE 视觉） -->
        <div class="ed-canvas">
          <!-- 基本信息 -->
          <section class="rule-block meta-block">
            <div class="block-head">
              <span class="badge badge-meta">INFO</span>
              <span class="block-title">基本信息</span>
              <span class="block-sub meta-summary">
                <span v-if="form.no" class="meta-tag">{{ form.no }}</span>
                <span class="meta-tag">{{ typeOf(form) }}</span>
                <span class="meta-summary-text">{{ hitPolicyOf(form) }}</span>
              </span>
            </div>
            <div class="block-body meta-body">
              <div class="meta-row-main">
                <div class="meta-field meta-field-name">
                  <label class="meta-label">规则名称<span class="meta-req">*</span></label>
                  <a-input v-model:value="form.name" placeholder="如 学习机产品路由规则" />
                </div>
                <div class="meta-field meta-field-priority">
                  <label class="meta-label">优先级<span class="field-tip">（越小越优先）</span></label>
                  <a-input-number v-model:value="form.priority" :min="1" class="meta-priority-input" />
                </div>
                <div class="meta-field meta-field-status">
                  <label class="meta-label">状态</label>
                  <a-switch
                    :checked="form.status === '启用'"
                    checked-children="启用"
                    un-checked-children="停用"
                    @change="setRuleStatus"
                  />
                </div>
              </div>
              <div class="meta-row-remark">
                <label class="meta-label">备注<span class="field-tip">（可选，说明规则用途或变更原因）</span></label>
                <a-input v-model:value="form.remark" placeholder="说明规则用途或变更原因" allow-clear />
              </div>
            </div>
          </section>

          <!-- WHEN 触发时机 -->
          <section class="rule-block when-block">
            <div class="block-head">
              <span class="badge badge-when">WHEN</span>
              <span class="block-title">触发时机</span>
              <span class="block-sub when-preview">{{ triggerPreview(form.trigger) }}</span>
            </div>
            <div class="block-body when-body">
              <div class="when-modes">
                <button
                  v-for="t in TRIGGER_KINDS"
                  :key="t.value"
                  type="button"
                  class="when-mode-chip"
                  :class="{ active: form.trigger.kind === t.value }"
                  :title="t.desc"
                  @click="setTriggerKind(t.value)"
                >
                  <ThunderboltOutlined v-if="t.value === 'event'" class="wmc-icon" />
                  <ClockCircleOutlined v-else class="wmc-icon" />
                  <span>{{ t.label }}</span>
                </button>
              </div>

              <div class="when-detail" :class="`when-detail--${form.trigger.kind}`">
                <div v-if="form.trigger.kind === 'event'" class="when-sentence">
                  <span class="ws-part">当</span>
                  <a-select
                    v-model:value="form.trigger.event"
                    class="when-inline-select"
                    :options="EVENT_OPTS.map((o) => ({ value: o.value, label: o.label, title: o.desc }))"
                  />
                  <span class="ws-part">时，评估下方 IF 条件并执行 THEN 动作</span>
                </div>
                <template v-else>
                  <div class="when-sentence">
                    <template v-if="timerFreqKind(form.trigger.freq) === 'schedule'">
                      <span class="ws-part">每天</span>
                      <a-select v-model:value="form.trigger.freq" class="when-inline-select when-inline-select--time">
                        <a-select-opt-group v-for="grp in TIMER_FREQ_GROUPS" :key="grp.label" :label="grp.label">
                          <a-select-option v-for="o in grp.options" :key="o.value" :value="o.value" :title="o.desc">{{ o.label }}</a-select-option>
                        </a-select-opt-group>
                      </a-select>
                      <span class="ws-part">定时执行，匹配 IF 条件</span>
                    </template>
                    <template v-else>
                      <span class="ws-part">每</span>
                      <a-select v-model:value="form.trigger.freq" class="when-inline-select when-inline-select--freq">
                        <a-select-opt-group v-for="grp in TIMER_FREQ_GROUPS" :key="grp.label" :label="grp.label">
                          <a-select-option v-for="o in grp.options" :key="o.value" :value="o.value" :title="o.desc">{{ o.label }}</a-select-option>
                        </a-select-opt-group>
                      </a-select>
                      <span class="ws-part">轮询一次，匹配 IF 条件</span>
                    </template>
                  </div>
                  <div class="when-actions">
                    <span class="when-note">须在 IF 区配置时间/状态条件<span class="field-tip">（避免误命中；SLA 预警/升级在 SLA 引擎）</span></span>
                    <a-button type="link" size="small" class="when-link-btn" @click="addTimerCondExample">插入示例条件</a-button>
                  </div>
                </template>
              </div>
            </div>
          </section>

          <!-- IF 条件 -->
          <section class="rule-block if-block">
            <div class="block-head">
              <span class="badge badge-if">IF</span>
              <span class="block-title">当满足以下条件时</span>
            </div>
            <div class="block-body if-body">
              <div class="logic-bar">
                <a-radio-group v-model:value="form.conditions.operator" size="small" button-style="solid" class="logic-toggle">
                  <a-radio-button value="AND">AND</a-radio-button>
                  <a-radio-button value="OR">OR</a-radio-button>
                </a-radio-group>
              </div>
              <div v-for="c in form.conditions.leaves" :key="c.id" class="logic-row">
                <a-select v-model:value="c.field" class="cell-field" :options="FIELD_OPTS.map((o) => ({ value: o, label: o }))" />
                <a-select v-model:value="c.op" class="cell-op" :options="OP_OPTS" />
                <a-input v-model:value="c.value" class="cell-val" placeholder="值（属于列表用逗号分隔）" />
                <button type="button" class="cell-del" aria-label="删除条件" @click="delRootLeaf(c.id)"><DeleteOutlined /></button>
              </div>
              <div v-for="g in form.conditions.groups" :key="g.id" class="logic-subgrp">
                <div class="logic-bar sub">
                  <a-radio-group v-model:value="g.operator" size="small" button-style="solid" class="logic-toggle sub-toggle">
                    <a-radio-button value="AND">AND</a-radio-button>
                    <a-radio-button value="OR">OR</a-radio-button>
                  </a-radio-group>
                  <a-button type="link" size="small" danger class="sub-del" @click="delGroup(g.id)">删除组</a-button>
                </div>
                <div v-for="c in g.leaves" :key="c.id" class="logic-row">
                  <a-select v-model:value="c.field" class="cell-field" :options="FIELD_OPTS.map((o) => ({ value: o, label: o }))" />
                  <a-select v-model:value="c.op" class="cell-op" :options="OP_OPTS" />
                  <a-input v-model:value="c.value" class="cell-val" placeholder="值" />
                  <button type="button" class="cell-del" aria-label="删除条件" @click="delGroupLeaf(g, c.id)"><DeleteOutlined /></button>
                </div>
                <a-button type="dashed" size="small" class="logic-add" @click="addGroupLeaf(g)"><template #icon><PlusOutlined /></template>添加条件</a-button>
              </div>
              <div class="logic-foot">
                <a-button type="dashed" size="small" @click="addRootLeaf"><template #icon><PlusOutlined /></template>添加条件</a-button>
                <a-button type="dashed" size="small" @click="addGroup"><template #icon><PlusOutlined /></template>添加条件组</a-button>
              </div>
            </div>
          </section>

          <!-- THEN 动作 -->
          <section class="rule-block then-block">
            <div class="block-head">
              <span class="badge badge-then">THEN</span>
              <span class="block-title">执行以下动作</span>
              <span class="block-sub">命中策略：{{ hitPolicyOf(form) }}<span class="field-tip">（含派单/升级路由=首条命中，否则全部命中）</span></span>
            </div>
            <div class="block-body then-body">
              <div v-for="a in form.actions" :key="a.id" class="action-card">
                <div class="action-main">
                  <a-select v-model:value="a.kind" class="act-kind" :options="ACTION_KINDS.map((o) => ({ value: o, label: o }))" />
                  <template v-if="a.kind === '派单'">
                    <a-select v-model:value="a.target" class="act-target-type" :options="DISPATCH_TARGETS.map((o) => ({ value: o, label: '到' + o }))" />
                    <a-select v-model:value="a.value" class="act-target-val" :options="dispatchValueOpts(a.target).map((o) => ({ value: o, label: o }))" placeholder="目标" />
                  </template>
                  <template v-else-if="a.kind === '升级路由'">
                    <a-select v-model:value="a.value" class="act-grow" :options="ESCALATE_TARGETS.map((o) => ({ value: o, label: o }))" placeholder="升级到目标系统" />
                  </template>
                  <template v-else-if="a.kind === '设置审核人'">
                    <a-select v-model:value="a.value" class="act-grow" :options="AUDITOR_OPTS.map((o) => ({ value: o, label: o }))" placeholder="审核人" />
                  </template>
                  <template v-else-if="a.kind === '通知'">
                    <a-select v-model:value="a.notifyTargets" mode="multiple" class="act-grow" :options="NOTIFY_TARGETS.map((o) => ({ value: o, label: o }))" placeholder="通知对象" />
                    <a-select v-model:value="a.notifyChannels" mode="multiple" class="act-grow" :options="NOTIFY_CHANNELS.map((o) => ({ value: o, label: o }))" placeholder="通知方式" />
                  </template>
                  <template v-else-if="a.kind === '改优先级'">
                    <a-select v-model:value="a.fieldValue" class="act-grow" :options="PRIORITY_OPTS.map((o) => ({ value: o, label: o }))" placeholder="目标优先级" />
                  </template>
                  <template v-else-if="a.kind === '改字段'">
                    <a-select v-model:value="a.fieldName" class="act-field" :options="FIELD_OPTS.map((o) => ({ value: o, label: o }))" />
                    <a-input v-model:value="a.fieldValue" class="act-grow" placeholder="目标值" />
                  </template>
                  <template v-else>
                    <a-input v-model:value="a.value" class="act-grow" :placeholder="a.kind === 'Webhook' ? 'URL' : '标签'" />
                  </template>
                  <button type="button" class="cell-del" aria-label="删除动作" @click="delAction(a.id)"><DeleteOutlined /></button>
                </div>
                <div v-if="a.kind === '派单' && a.target === '组'" class="action-sub">
                  <span class="action-sub-label">分配模式<span class="field-tip">（自动分配到人 / 进池待领）</span></span>
                  <a-select v-model:value="a.inGroup" class="act-sub-val" :options="IN_GROUP_OPTS.map((o) => ({ value: o, label: o }))" />
                </div>
              </div>
              <a-button type="dashed" block class="logic-add-block" @click="addAction"><template #icon><PlusOutlined /></template>添加动作</a-button>
            </div>
          </section>

          <!-- ELSE 兜底（可选） -->
          <section class="rule-block else-block">
            <div class="block-head">
              <span class="badge badge-else">ELSE</span>
              <span class="block-title">否则执行（可选）</span>
              <a-checkbox v-model:checked="elseEnabled" class="else-toggle">启用</a-checkbox>
            </div>
            <div v-if="elseEnabled" class="block-body else-body">
              <span class="else-label">路由到</span>
              <a-select v-model:value="elseTarget" class="else-target" :options="POOL_OPTS.map((o) => ({ value: o, label: o }))" />
            </div>
          </section>
        </div>

        <!-- 右：规则测试 + 提示 -->
        <aside class="ed-aux">
          <section class="sec">
            <div class="sec-h">规则概览</div>
            <div class="meta-grid">
              <div class="meta-item"><span class="mk">类型</span><span class="mv">{{ typeOf(form) }}</span></div>
              <div class="meta-item"><span class="mk">触发</span><span class="mv">{{ triggerText(form.trigger) }}</span></div>
              <div class="meta-item"><span class="mk">优先级</span><span class="mv">P{{ form.priority }}</span></div>
              <div class="meta-item"><span class="mk">状态</span><span class="mv">{{ form.status }}</span></div>
              <div class="meta-item"><span class="mk">条件数</span><span class="mv">{{ leavesCount(form.conditions) }}</span></div>
              <div class="meta-item"><span class="mk">动作数</span><span class="mv">{{ form.actions.length }}</span></div>
            </div>
          </section>
          <section class="sec">
            <div class="sec-h">规则测试</div>
            <div class="test-col">
              <div class="ti"><span class="tl">工单类型</span><a-input v-model:value="sample.工单类型" size="small" /></div>
              <div class="ti"><span class="tl">产品线</span><a-input v-model:value="sample.产品线" size="small" /></div>
              <div class="ti"><span class="tl">客户类型</span><a-input v-model:value="sample.客户类型" size="small" /></div>
              <div class="ti"><span class="tl">状态</span><a-input v-model:value="sample.状态" size="small" /></div>
              <a-button type="primary" size="small" block @click="runTest">测试命中</a-button>
            </div>
            <div v-if="testResult" class="test-res" :class="testResult.hit ? 'ok' : 'no'">
              <template v-if="testResult.hit">✓ 命中 → {{ actionsText(form) }}</template>
              <template v-else>✗ 未命中（条件不满足）</template>
            </div>
          </section>
          <section class="sec">
            <div class="sec-h">配置提示<span class="field-tip">（类型由动作自动推导；左栏点变量/函数/模板快速搭条件）</span></div>
            <div class="aux-tip">当前类型 <b>{{ typeOf(form) }}</b>，命中策略 <b>{{ hitPolicyOf(form) }}</b></div>
          </section>
          <section class="sec">
            <div class="sec-h">版本历史</div>
            <div class="ver-list">
              <div class="ver-row"><span class="vv">v3</span><span class="vt">当前</span><span class="vd">2026-03-20</span></div>
              <div class="ver-row"><span class="vv">v2</span><span class="vt">陈文博</span><span class="vd">2026-03-05</span></div>
              <div class="ver-row"><span class="vv">v1</span><span class="vt">陈文博</span><span class="vd">2026-02-10</span></div>
            </div>
          </section>
          <section class="sec">
            <div class="sec-h">冲突检测</div>
            <div v-if="currentConflicts.length" class="conflict-mini">
              <div v-for="(item, idx) in currentConflicts" :key="idx">存在潜在冲突：与「{{ item.with }}」在「{{ item.key }}」下目标不一致</div>
            </div>
            <div v-else class="aux-ok">当前规则未检测到潜在冲突</div>
          </section>
        </aside>
      </div>

      <div class="ed-footer"><a-button @click="backToList">取消</a-button><a-button type="primary" @click="save">保存</a-button></div>
    </div>
  </div>
</template>

<style scoped>
.rules-engine { display: flex; flex-direction: column; min-height: 100%; }
.body { padding: 16px 24px; display: flex; flex-direction: column; gap: 16px; }
.panel { background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px 20px; }
.filter-card { background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px 16px; display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
.filters { display: flex; gap: 16px; flex-wrap: wrap; }
.fi { display: flex; align-items: center; gap: 8px; }
.fl { font-size: 12px; color: #6b7280; white-space: nowrap; }
.fa { display: flex; gap: 8px; }
.table-card { background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; }
.cell-link { color: #1a6fff; cursor: pointer; }
.drag-h { color: #c0c4cc; margin-right: 6px; cursor: grab; }
.muted { color: #9ca3af; }
.rate-ok { color: #10b981; font-weight: 600; }
.sum { font-size: 12px; color: #4b5563; display: inline-block; max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; vertical-align: bottom; }
:deep(.ant-table-thead > tr > th) { background: #f3f4f6; color: #6b7280; font-size: 12px; font-weight: 600; }

.conflict-bar { display: flex; align-items: center; gap: 8px; background: #fffbeb; border: 1px solid #fde68a; color: #b45309; border-radius: 8px; padding: 10px 14px; font-size: 13px; }

.matrix { width: 100%; border-collapse: collapse; }
.matrix th, .matrix td { border: 1px solid #e5e7eb; padding: 8px 12px; font-size: 13px; text-align: center; }
.matrix th { background: #f9fafb; color: #6b7280; font-weight: 600; }
.matrix .rowh { background: #f9fafb; color: #111827; font-weight: 600; }

.stat-row { display: flex; gap: 16px; }
.stat { flex: 1; background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px 20px; }
.s-l { font-size: 12px; color: #6b7280; margin-bottom: 6px; }
.s-v { font-size: 24px; font-weight: 700; color: #111827; }
.log-grid { display: grid; grid-template-columns: 1fr 320px; gap: 16px; }
.rank-row { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-bottom: 1px solid #f3f4f6; font-size: 13px; }
.rk { width: 20px; height: 20px; border-radius: 4px; background: #f3f4f6; color: #6b7280; font-size: 12px; display: flex; align-items: center; justify-content: center; }
.rk.top { background: #1a6fff; color: #fff; }
.rk-name { flex: 1; color: #111827; }
.rk-hit { color: #6b7280; font-weight: 600; }

.editor {
  --re-bg: #fff;
  --re-bg-subtle: #fafbfc;
  --re-border: #e5e7eb;
  --re-border-light: #f0f2f5;
  --re-text: #111827;
  --re-text-secondary: #6b7280;
  --re-text-muted: #9ca3af;
  --re-primary: #1a6fff;
  --re-primary-soft: #eef4ff;
  --re-success: #047857;
  --re-success-bg: #f0fdf4;
  --re-warning: #b45309;
  --re-warning-bg: #fffbeb;
  --re-danger: #b91c1c;
  --re-danger-bg: #fef2f2;
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}
.ed-head { display: flex; align-items: center; gap: 10px; padding: 8px 20px; background: var(--re-bg); border-bottom: 1px solid var(--re-border); position: sticky; top: 0; z-index: 5; }
.ed-head .back { padding-left: 0; color: var(--re-text-secondary); }
.ed-title { font-size: 15px; font-weight: 600; color: var(--re-text); }
.ed-type-hint {
  margin-left: 4px;
  padding: 2px 8px;
  border-radius: 4px;
  background: var(--re-bg-subtle);
  border: 1px solid var(--re-border-light);
  font-size: 12px;
  color: var(--re-text-secondary);
  cursor: help;
}
.ed-actions { margin-left: auto; display: flex; gap: 8px; }
.ed-body { padding: 16px 24px; display: flex; flex-direction: column; gap: 14px; }
/* 三栏编辑器：左变量库 / 中画布 / 右测试 */
.ed-main {
  flex: 1;
  display: grid;
  grid-template-columns: 224px minmax(0, 1fr) 280px;
  gap: 10px;
  min-height: 0;
  padding: 10px 20px;
  align-items: start;
}
.ed-lib { width: 224px; min-height: 0; overflow-y: auto; background: var(--re-bg); border: 1px solid var(--re-border); border-radius: 8px; padding: 10px; }
.ed-canvas { min-width: 0; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; }
.ed-aux { width: 280px; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; }

/* 字段名右侧提示（括号包裹） */
.field-tip { font-weight: 400; color: var(--re-text-muted); margin-left: 2px; }

/* —— 基本信息 —— */
.badge-meta { background: #6366f1; color: #fff; border: none; }
.meta-body { display: flex; flex-direction: column; gap: 0; }
.meta-summary { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; justify-content: flex-end; }
.meta-tag {
  display: inline-block;
  padding: 0 6px;
  border-radius: 4px;
  background: var(--re-bg-subtle);
  border: 1px solid var(--re-border-light);
  font-size: 11px;
  color: var(--re-text-secondary);
  line-height: 20px;
}
.meta-summary-text { font-size: 12px; color: var(--re-text-muted); }
.meta-row-main {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 72px 64px;
  gap: 10px;
  align-items: end;
}
.meta-field { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.meta-label { font-size: 12px; color: #6b7280; line-height: 1.3; }
.meta-row-main .meta-label { white-space: nowrap; }
.meta-label .field-tip { font-size: 11px; }
.meta-req { margin-left: 2px; color: #ef4444; }
.meta-priority-input { width: 100%; }
.meta-field-status :deep(.ant-switch) { margin-top: 0; }
.meta-row-remark {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px dashed #eef0f3;
}
.ed-canvas :deep(.meta-field .ant-input),
.ed-canvas :deep(.meta-priority-input),
.ed-canvas :deep(.meta-priority-input .ant-input-number-input) { min-height: 32px !important; }

/* —— IF / WHEN / THEN / ELSE 区块 —— */
.rule-block { background: var(--re-bg); border: 1px solid var(--re-border); border-radius: 8px; overflow: hidden; }
.meta-block { border-left: 3px solid #6366f1; }
.when-block { border-left: 3px solid #7c3aed; }
.if-block { border-left: 3px solid #ea580c; }
.then-block { border-left: 3px solid #059669; }
.else-block { border-left: 3px solid #64748b; }
.block-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid #f0f2f5;
  min-height: 36px;
  background: linear-gradient(to right, #fafbfc 0%, #fff 48px);
}
.block-title { font-size: 13px; font-weight: 600; color: #111827; }
.block-sub { margin-left: auto; font-size: 11px; font-weight: 400; color: #9ca3af; text-align: right; line-height: 1.3; }
.badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 48px;
  height: 26px;
  padding: 0 10px;
  border-radius: 5px;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: .6px;
  flex: none;
  box-shadow: 0 1px 2px rgba(0, 0, 0, .06);
}
.badge-when { background: #7c3aed; color: #fff; border: none; }
.badge-if { background: #ea580c; color: #fff; border: none; }
.badge-then { background: #059669; color: #fff; border: none; }
.badge-else { background: #64748b; color: #fff; border: none; }
.block-body { padding: 10px 12px 12px; }

/* WHEN */
.when-body { display: flex; flex-direction: column; gap: 6px; background: var(--re-bg-subtle); border-top: 1px solid var(--re-border-light); }
.when-preview { color: var(--re-text-secondary); font-weight: 500; font-size: 11px; }
.when-modes { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.when-mode-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 28px;
  padding: 0 10px;
  border: 1px solid var(--re-border);
  border-radius: 6px;
  background: var(--re-bg);
  font-size: 13px;
  color: var(--re-text-secondary);
  cursor: pointer;
  transition: border-color .15s, background .15s, color .15s;
}
.when-mode-chip:hover { border-color: var(--re-primary); color: var(--re-primary); }
.when-mode-chip.active {
  border-color: var(--re-primary);
  background: var(--re-primary-soft);
  color: var(--re-primary);
  font-weight: 600;
}
.wmc-icon { font-size: 13px; color: inherit; flex: none; }
.when-detail {
  padding: 8px 10px;
  border-radius: 6px;
  background: var(--re-bg);
  border: 1px solid var(--re-border);
}
.when-detail--event,
.when-detail--timer { border-left: 3px solid var(--re-border); }
.when-sentence {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  font-size: 13px;
  color: #374151;
  line-height: 28px;
}
.ws-part { white-space: nowrap; }
.when-inline-select { width: 148px; flex: none; }
.when-inline-select--freq { width: 96px; }
.when-inline-select--time { width: 88px; }
.when-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px 6px;
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px dashed var(--re-border-light);
}
.when-note { font-size: 11px; color: var(--re-text-secondary); }
.when-link-btn { padding: 0; height: auto; font-size: 11px; }
.ed-canvas :deep(.when-inline-select .ant-select-selector) { min-height: 32px !important; }

/* IF */
.if-body { background: var(--re-bg-subtle); border-top: 1px solid var(--re-border-light); }
.logic-bar { display: flex; align-items: center; margin-bottom: 6px; }
.logic-bar.sub { margin-bottom: 6px; }
.sub-del { margin-left: auto; padding: 0; height: auto; }
.logic-row {
  display: grid;
  grid-template-columns: minmax(140px, 1fr) 112px minmax(120px, 1.4fr) 28px;
  gap: 6px;
  align-items: center;
  margin-bottom: 6px;
}
.logic-subgrp {
  margin: 6px 0 8px;
  padding: 8px 10px;
  border: 1px dashed var(--re-border);
  border-radius: 6px;
  background: var(--re-bg);
}
.logic-foot, .logic-add { display: flex; gap: 6px; }
.logic-foot { margin-top: 2px; }
.logic-add-block { margin-top: 2px; }

/* THEN */
.then-body { background: var(--re-bg-subtle); border-top: 1px solid var(--re-border-light); }
.action-card {
  padding: 8px 10px;
  margin-bottom: 6px;
  background: var(--re-bg);
  border: 1px solid var(--re-border);
  border-radius: 6px;
}
.action-main {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 28px;
}
.action-sub {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
  padding-left: 108px;
}
.meta-label .field-tip { font-size: 11px; }
.block-sub .field-tip { display: inline; }
.action-sub-label { font-size: 12px; color: #6b7280; white-space: nowrap; }
.action-sub-label .field-tip { font-size: 10px; }
.act-kind { width: 108px; flex: none; }
.act-target-type { width: 72px; flex: none; }
.act-target-val { flex: 1; min-width: 140px; }
.act-field { width: 120px; flex: none; }
.act-grow { flex: 1; min-width: 140px; }
.act-sub-val { width: 180px; }
.action-main .cell-del { margin-left: auto; }

/* ELSE */
.else-toggle { margin-left: auto; }
.else-body {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 12px 10px;
  padding: 8px 10px;
  border: 1px dashed #d1d5db;
  border-radius: 6px;
  background: #fafafa;
}
.else-label { font-size: 13px; color: #6b7280; white-space: nowrap; }
.else-target { width: 220px; }

/* 删除按钮列对齐 */
.cell-del {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: #ef4444;
  cursor: pointer;
  flex: none;
}
.cell-del:hover { background: #fef2f2; }

/* 控件统一高度 */
.ed-canvas :deep(.ant-input),
.ed-canvas :deep(.ant-input-number),
.ed-canvas :deep(.ant-input-number-input),
.ed-canvas :deep(.ant-select-selector) { min-height: 32px !important; }
.ed-canvas :deep(.ant-select-single .ant-select-selector) { align-items: center; }
.ed-canvas :deep(.ant-input-number) { width: 100%; }
.cell-field, .cell-op, .cell-val,
.when-event, .else-target, .act-sub-val { width: 100%; min-width: 0; }

/* IF 顶层 AND/OR + 子组 toggle */
.logic-toggle :deep(.ant-radio-button-wrapper-checked),
.sub-toggle :deep(.ant-radio-button-wrapper-checked) {
  background: var(--re-primary) !important;
  border-color: var(--re-primary) !important;
}
.lib-h { position: sticky; top: -10px; z-index: 2; font-size: 13px; font-weight: 600; color: #111827; margin: -10px -10px 6px; padding: 8px 10px 6px; background: #fff; border-bottom: 1px solid #f0f2f5; }
.lib-search { margin-bottom: 8px; }
.lib-grp { font-size: 11px; color: #374151; font-weight: 600; letter-spacing: .3px; margin: 8px 0 4px; line-height: 1.4; }
.lib-grp .field-tip { font-size: 10px; font-weight: 400; letter-spacing: 0; }
.lib-grp-head { display: flex; align-items: center; justify-content: space-between; margin-top: 4px; color: #374151; font-size: 12px; }
.lib-grp-sub { font-weight: 500; color: #9ca3af; letter-spacing: 0; }
.lib-subgrp { font-size: 10px; color: #6b7280; margin: 8px 0 4px; padding-left: 2px; }
.lib-chip {
  display: grid;
  grid-template-columns: 6px minmax(0, 1fr);
  column-gap: 8px;
  align-items: center;
  padding: 7px 10px;
  margin-bottom: 4px;
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  font-size: 12px;
  color: #374151;
  cursor: pointer;
  transition: all .15s;
}
.lib-chip.has-type { grid-template-columns: 6px minmax(0, 1fr) 32px; }
.lib-chip.fn { grid-template-columns: 28px minmax(0, 1fr); background: var(--re-bg-subtle); border-color: var(--re-border); }
.lib-chip:hover { border-color: var(--re-primary); background: var(--re-primary-soft); }
.lc-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--re-text-muted); flex: none; }
.lc-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; line-height: 1.3; }
.lib-chip.sys .lc-dot,
.lib-chip.proc .lc-dot,
.lib-chip.agent .lc-dot { background: var(--re-text-muted); }
.lc-type { font-size: 10px; color: var(--re-text-muted); text-align: right; line-height: 1; white-space: nowrap; }
.lc-fx { color: var(--re-text-secondary); font-weight: 600; font-size: 11px; line-height: 1; }
.lib-toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  width: 100%;
  margin: 4px 0 8px;
  padding: 6px 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--re-primary);
  font-size: 12px;
  cursor: pointer;
}
.lib-toggle:hover { background: var(--re-primary-soft); }
.fn-cat { margin-bottom: 3px; }
.fn-cat-head { width: 100%; grid-template-columns: 28px minmax(0, 1fr) 22px 14px !important; cursor: pointer; text-align: left; border: none; font: inherit; }
.fn-count { font-size: 10px; color: #9ca3af; text-align: right; }
.fn-chevron { font-size: 10px; color: #9ca3af; }
.fn-items { margin: 0 0 6px 8px; padding-left: 8px; border-left: 2px solid var(--re-border-light); display: flex; flex-direction: column; gap: 3px; }
.fn-item {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  width: 100%;
  padding: 6px 8px;
  border: 1px solid var(--re-border);
  border-radius: 5px;
  background: var(--re-bg);
  cursor: pointer;
  text-align: left;
  transition: all .15s;
}
.fn-item:hover { border-color: var(--re-primary); background: var(--re-primary-soft); }
.fn-sig { font-size: 11px; color: var(--re-text); font-family: ui-monospace, monospace; line-height: 1.3; }
.fn-desc { font-size: 10px; color: var(--re-text-secondary); line-height: 1.3; }
.lib-tpl { padding: 8px 10px; margin-bottom: 5px; background: var(--re-bg-subtle); border: 1px solid var(--re-border); border-radius: 6px; cursor: pointer; transition: background .15s, border-color .15s; }
.lib-tpl:hover { background: var(--re-primary-soft); border-color: var(--re-primary); }
.lt-name { font-size: 12px; font-weight: 600; color: var(--re-text); }
.lt-desc { font-size: 11px; color: var(--re-text-secondary); margin-top: 2px; }
.lib-empty { margin-top: 8px; color: #9ca3af; font-size: 12px; text-align: center; padding: 8px 0; }
.test-col { display: flex; flex-direction: column; gap: 8px; }
.test-col .ti { display: flex; flex-direction: column; gap: 3px; }
.aux-tip { font-size: 12px; color: #6b7280; line-height: 1.5; margin-top: -4px; }
.sec { background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px 12px; }
.sec-h { font-size: 13px; font-weight: 600; color: var(--re-text); margin-bottom: 8px; padding-left: 8px; border-left: 3px solid var(--re-border); line-height: 1.35; display: flex; align-items: baseline; flex-wrap: wrap; gap: 0; }
.sec-h .field-tip { font-size: 10px; font-weight: 400; }
.sec-sub { font-size: 12px; font-weight: normal; color: #9ca3af; margin-left: 8px; }
.ti { display: flex; flex-direction: column; gap: 3px; }
.tl { font-size: 11px; color: #6b7280; }
.test-res { margin-top: 8px; padding: 8px 10px; border-radius: 6px; font-size: 12px; }
.test-res.ok { background: var(--re-success-bg); border: 1px solid #bbf7d0; color: var(--re-success); }
.test-res.no { background: var(--re-danger-bg); border: 1px solid #fecaca; color: var(--re-danger); }
.meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.meta-item { display: flex; flex-direction: column; gap: 2px; padding: 6px 8px; border: 1px solid #eef0f3; border-radius: 6px; background: #fafbfc; }
.mk { font-size: 11px; color: #9ca3af; }
.mv { font-size: 12px; color: #111827; font-weight: 600; }
.ver-list { display: flex; flex-direction: column; gap: 8px; }
.ver-row { display: grid; grid-template-columns: 34px 1fr auto; gap: 8px; align-items: center; font-size: 12px; color: #4b5563; }
.vv { color: var(--re-text); font-weight: 700; }
.vt { color: #6b7280; }
.vd { color: #9ca3af; }
.conflict-mini { font-size: 12px; color: var(--re-warning); background: var(--re-warning-bg); border: 1px solid #fde68a; border-radius: 6px; padding: 8px 10px; line-height: 1.6; display: flex; flex-direction: column; gap: 4px; }
.aux-ok { font-size: 12px; color: var(--re-text-secondary); background: var(--re-bg-subtle); border: 1px solid var(--re-border); border-radius: 6px; padding: 8px 10px; }
.ed-footer { position: sticky; bottom: 0; display: flex; justify-content: flex-end; gap: 8px; padding: 8px 20px; background: #fff; border-top: 1px solid #e5e7eb; z-index: 5; }

@media (max-width: 1440px) {
  .ed-main { grid-template-columns: 208px minmax(0, 1fr) 260px; }
}

@media (max-width: 1280px) {
  .ed-main { grid-template-columns: 208px minmax(0, 1fr); }
  .ed-aux { width: auto; }
  .meta-row-main { grid-template-columns: 1fr 72px 64px; }
}
</style>
