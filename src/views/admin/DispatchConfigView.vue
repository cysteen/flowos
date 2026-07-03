<script setup lang="ts">
import { ref, reactive, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { adminNavActiveKey } from '@/config/adminNav';
import { message, Modal } from 'ant-design-vue';
import {
  PlusOutlined, ArrowUpOutlined, ArrowDownOutlined,
  SwapOutlined, CheckCircleOutlined, SafetyCertificateOutlined, InboxOutlined, StarFilled,
  EditOutlined, DeleteOutlined, SearchOutlined,
} from '@ant-design/icons-vue';
import dayjs from 'dayjs';

// 智能分派：工单调度引擎的「出池」侧。进池由规则引擎路由，坐席归用户/班组管理主数据，此处只引用。
const router = useRouter();
const route = useRoute();
// 页签绑路由：智能分派各二级子项（侧栏）与页内内容一一对应
const TAB_TO_KEY: Record<string, string> = { monitor: 'dispatch-monitor', dispatch: 'dispatch-strategy', pool: 'dispatch-pool', inpool: 'dispatch-routing', profile: 'dispatch-profile' };
const KEY_TO_TAB: Record<string, string> = { 'dispatch-monitor': 'monitor', 'dispatch-strategy': 'dispatch', 'dispatch-pool': 'pool', 'dispatch-routing': 'inpool', 'dispatch-profile': 'profile' };
const activeTab = computed({
  get: () => KEY_TO_TAB[adminNavActiveKey(route.path)] ?? 'monitor',
  set: (v: string) => { const k = TAB_TO_KEY[v]; if (k && adminNavActiveKey(route.path) !== k) router.push(`/admin/${k}`); },
});

// 主数据引用（来自 用户/班组管理）
const GROUP_OPTS = ['一线客服组', '大客户组', '技术支持组', '售后服务组', '二线技术支持组', '夜班应急组'];
const AGENT_OPTS = ['张三', '李四', '王五', '赵敏', '钱伟', '孙丽', '周强', '吴敏'];
const MODE_OPTS = ['系统派单', '组内抢单', '混合'];

// ===================== ③ 工单池 =====================
type PoolType = '常驻' | '临时';
type PoolTheme = 'blue' | 'purple' | 'orange' | 'red';
interface Pool {
  id: number; name: string; code: string; type: PoolType; period: string; condition: string;
  groups: string[]; agents: string[]; mode: string; timeout: string; status: boolean;
  count: number; handlers: number; avgTime: string; theme: PoolTheme;
}
const POOL_THEMES: Record<PoolTheme, { bg: string; icon: string }> = {
  blue: { bg: '#dbeafe', icon: '#1d4ed8' },
  purple: { bg: '#ede9fe', icon: '#6d28d9' },
  orange: { bg: '#ffedd5', icon: '#c2410c' },
  red: { bg: '#fee2e2', icon: '#dc2626' },
};
const THEME_CYCLE: PoolTheme[] = ['blue', 'purple', 'orange', 'red'];
const pools = ref<Pool[]>([
  { id: 1, name: '一线客服池', code: 'POOL-GENERAL', type: '常驻', period: '', condition: '无特殊标记的工单，默认入池', groups: ['一线客服组'], agents: [], mode: '系统派单', timeout: '超时自动分配', status: true, count: 234, handlers: 45, avgTime: '2.5h', theme: 'blue' },
  { id: 2, name: '大客户专属池', code: 'POOL-VIP', type: '常驻', period: '', condition: '客户等级为大客户 / VIP', groups: ['大客户组'], agents: [], mode: '系统派单', timeout: '转派至大客户主管', status: true, count: 67, handlers: 12, avgTime: '4.2h', theme: 'purple' },
  { id: 3, name: '技术支持池', code: 'POOL-TECH', type: '常驻', period: '', condition: '售后服务类 / 技术类工单', groups: ['技术支持组'], agents: [], mode: '组内抢单', timeout: '升级至售后主管', status: true, count: 156, handlers: 32, avgTime: '3.1h', theme: 'orange' },
  { id: 4, name: '618大促反馈池', code: 'POOL-618', type: '临时', period: '2026-06-01 ~ 2026-06-30', condition: '标签 = 618大促反馈', groups: [], agents: ['张三', '李四', '王五', '赵敏'], mode: '组内抢单', timeout: '升级至组长', status: true, count: 18, handlers: 8, avgTime: '0.8h', theme: 'red' },
]);
function assignModeText(mode: string) {
  if (mode === '组内抢单') return '处理人主动认领';
  if (mode === '混合') return '混合分配';
  return '负载均衡自动分配';
}
function handlerCount(p: Pool) {
  if (p.type === '临时') return p.agents.length;
  return p.handlers;
}

const poolModalOpen = ref(false);
const editingPoolId = ref<number | null>(null);
const pf = reactive<{ name: string; code: string; type: PoolType; period: string; condition: string; groups: string[]; agents: string[]; mode: string; timeout: string }>(
  { name: '', code: '', type: '常驻', period: '', condition: '', groups: [], agents: [], mode: '系统派单', timeout: '' },
);
function openCreatePool() {
  editingPoolId.value = null;
  Object.assign(pf, { name: '', code: '', type: '常驻', period: '', condition: '', groups: [], agents: [], mode: '系统派单', timeout: '' });
  poolModalOpen.value = true;
}
function openEditPool(row: Pool) {
  editingPoolId.value = row.id;
  Object.assign(pf, { name: row.name, code: row.code, type: row.type, period: row.period, condition: row.condition, groups: [...row.groups], agents: [...row.agents], mode: row.mode, timeout: row.timeout });
  poolModalOpen.value = true;
}
function savePool() {
  if (!pf.name.trim()) { message.error('请填写池名称'); return; }
  if (pools.value.some((p) => p.name === pf.name.trim() && p.id !== editingPoolId.value)) { message.error('池名称已存在'); return; }
  const serveCount = pf.type === '常驻' ? pf.groups.length : pf.agents.length;
  if (serveCount < 1) { message.error(pf.type === '常驻' ? '请至少选择一个服务处理组' : '请至少抽调一名坐席'); return; }
  if (pf.type === '临时' && !pf.period.trim()) { message.error('临时池必须设置有效期'); return; }
  const code = pf.code.trim() || `POOL-${Date.now().toString(36).toUpperCase()}`;
  const condition = pf.condition.trim() || (pf.type === '常驻' ? `服务组：${pf.groups.join('、')}` : `跨组抽调 ${pf.agents.length} 人`);
  if (editingPoolId.value === null) {
    pools.value.push({
      id: Date.now(), name: pf.name.trim(), code, type: pf.type, period: pf.period, condition,
      groups: [...pf.groups], agents: [...pf.agents], mode: pf.mode,
      timeout: pf.timeout.trim() || '不启用', status: true,
      count: 0, handlers: serveCount * 5, avgTime: '—', theme: THEME_CYCLE[pools.value.length % 4],
    });
    message.success(`工单池「${pf.name.trim()}」已创建`);
  } else {
    const t = pools.value.find((p) => p.id === editingPoolId.value);
    if (t) Object.assign(t, {
      name: pf.name.trim(), code, type: pf.type, period: pf.period, condition,
      groups: [...pf.groups], agents: [...pf.agents], mode: pf.mode,
      timeout: pf.timeout.trim() || '不启用',
      handlers: pf.type === '常驻' ? t.handlers : pf.agents.length,
    });
    message.success('工单池已更新');
  }
  poolModalOpen.value = false;
}
function delPool(row: Pool) {
  Modal.confirm({
    title: `删除工单池「${row.name}」`,
    content: '删除前请确认池内无在途工单（将转回默认池）。删除后规则引擎中指向该池的入池规则需重新配置。',
    okText: '删除', okType: 'danger', cancelText: '取消',
    onOk: () => { pools.value = pools.value.filter((p) => p.id !== row.id); message.success('已删除'); },
  });
}

// ===================== ② 出池派单 =====================
const dispatchMode = ref<'系统派单' | '组内抢单' | '混合'>('系统派单');
const gates = reactive({ online: true, capacity: true, skill: true, schedule: false });
const forceRules = ref([
  { key: 'assign', name: '指定分配', desc: '上游已指定到人 → 直接生效', enabled: true, locked: true },
  { key: 'repeat', name: '熟客延续', desc: '有效期内优先最近接待过该客户的坐席', enabled: true, locked: false },
]);
function forceUp(i: number) { if (i <= 1) return; const a = forceRules.value; [a[i - 1], a[i]] = [a[i], a[i - 1]]; }
function forceDown(i: number) { const a = forceRules.value; if (i === 0 || i >= a.length - 1) return; [a[i + 1], a[i]] = [a[i], a[i + 1]]; }
const scoreFactors = ref([
  { key: 'skill', name: '技能熟练度', desc: '工单所需技能的熟练度评分', weight: 35, enabled: true },
  { key: 'load', name: '负载余量', desc: '剩余容量越大得分越高', weight: 25, enabled: true },
  { key: 'urgency', name: '紧急度', desc: '高优先 / 临近 SLA 优先占用最优坐席', weight: 20, enabled: true },
  { key: 'idle', name: '最久空闲', desc: '最久未被分配者优先，保障公平', weight: 15, enabled: true },
  { key: 'cost', name: '成本', desc: '外包 / 加班坐席成本更高，优先低成本产能', weight: 5, enabled: false },
]);
const weightSum = computed(() => scoreFactors.value.filter((f) => f.enabled).reduce((s, f) => s + f.weight, 0));
const batchMode = ref<'instant' | 'batch'>('instant');
const batchWindow = ref(3);
const timeoutSec = ref(30);
const fallbackSteps = ref([
  { key: 'retry', name: '重派次优坐席', desc: '按评分取次高者重派', enabled: true },
  { key: 'expand', name: '逐圈放宽技能门槛', desc: '精准命中无人时放宽所需技能', enabled: true },
  { key: 'escalate', name: '升级组长 / 专家池', desc: '仍无人接则转上级人工调度', enabled: true },
]);
const rejectDeprioritize = ref(true);
const fallbackAgent = ref('值班主管(王芳)');
const FALLBACK_OPTS = ['值班主管(王芳)', '二线组长(李强)', '售后组长(赵敏)'];
const profileCols = [
  { title: '坐席', dataIndex: 'name', key: 'name' },
  { title: '所属组', dataIndex: 'group', key: 'group' },
  { title: '技能值', dataIndex: 'skill', key: 'skill', width: 90 },
  { title: '在办 / 容量', key: 'cap', width: 110 },
  { title: '解决率', dataIndex: 'solve', key: 'solve', width: 90 },
  { title: '擅长类型', dataIndex: 'good', key: 'good' },
];
const profileRows = [
  { name: '张三', group: '技术支持组', skill: 9, load: 5, cap: 8, solve: '96%', good: '硬件故障 / 退款' },
  { name: '李四', group: '一线客服组', skill: 7, load: 7, cap: 8, solve: '91%', good: '咨询 / 投诉' },
  { name: '王五', group: '技术支持组', skill: 8, load: 3, cap: 6, solve: '94%', good: '系统问题 / 升级' },
];

// ===================== ① 积压监控 =====================
type StatIcon = 'swap' | 'check' | 'sla' | 'inbox';
const statCards: { label: string; value: string; delta: string; deltaColor: string; accent: string; iconBg: string; icon: StatIcon }[] = [
  { label: '今日分派总量', value: '356', delta: '较昨日 +12.3%', deltaColor: '#10b981', accent: '#1a6fff', iconBg: '#eff6ff', icon: 'swap' },
  { label: '平均匹配分数', value: '87.6', delta: '+2.1', deltaColor: '#10b981', accent: '#0ea5e9', iconBg: '#f0f9ff', icon: 'check' },
  { label: 'SLA 达标率', value: '96.2%', delta: '目标 95%', deltaColor: '#6b7280', accent: '#10b981', iconBg: '#ecfdf5', icon: 'sla' },
  { label: '待处理队列', value: '23', delta: '较 1 小时前 +5', deltaColor: '#f59e0b', accent: '#f59e0b', iconBg: '#fffbeb', icon: 'inbox' },
];
const trendRange = ref<'7' | '30'>('7');
const trend30Labels = Array.from({ length: 30 }, (_, i) => dayjs('2026-02-24').add(i, 'day').format('M/D'));
const trend30Data = [280, 295, 310, 305, 320, 318, 330, 325, 340, 335, 350, 345, 360, 355, 348, 352, 358, 350, 345, 360, 355, 348, 342, 350, 356, 352, 348, 355, 360, 356];
const trendSeries = {
  '7': { labels: ['3/18', '3/19', '3/20', '3/21', '3/22', '3/23', '3/24'], data: [298, 315, 342, 326, 358, 345, 356] },
  '30': { labels: trend30Labels, data: trend30Data },
};
function buildNiceTicks(data: number[], step = 20) {
  const rawMin = Math.min(...data);
  const rawMax = Math.max(...data);
  const yMin = Math.floor(rawMin / step) * step;
  const yMax = Math.ceil(rawMax / step) * step;
  const ticks: number[] = [];
  for (let v = yMax; v >= yMin; v -= step) ticks.push(v);
  return { yMin, yMax, yTicks: ticks };
}
const activeTrend = computed(() => trendSeries[trendRange.value]);
const trendChart = computed(() => {
  const { data, labels } = activeTrend.value;
  const isLong = trendRange.value === '30';
  const { yMin, yMax, yTicks } = buildNiceTicks(data);
  const w = 560; const h = 180; const pad = { top: 8, right: 8, bottom: 0, left: 0 };
  const innerW = w - pad.left - pad.right;
  const innerH = h - pad.top - pad.bottom;
  const range = yMax - yMin || 1;
  const pts = data.map((v, i) => {
    const x = pad.left + (i / (data.length - 1)) * innerW;
    const y = pad.top + innerH - ((v - yMin) / range) * innerH;
    return { x, y, v };
  });
  const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const area = `${line} L ${pts[pts.length - 1].x.toFixed(1)} ${(pad.top + innerH).toFixed(1)} L ${pts[0].x.toFixed(1)} ${(pad.top + innerH).toFixed(1)} Z`;
  const xIndices = isLong ? [0, 5, 10, 15, 20, 25, 29] : labels.map((_, i) => i);
  const xLabels = xIndices.map((i) => ({ i, text: labels[i] }));
  return { w, h, pts, line, area, yTicks, xLabels, pointCount: data.length, showDots: !isLong };
});
const algoShare = [
  { name: '技能路由', color: '#1a6fff', pct: 45 },
  { name: '负载均衡', color: '#10b981', pct: 30 },
  { name: '优先级排序', color: '#f59e0b', pct: 15 },
  { name: '人员画像', color: '#8b5cf6', pct: 10 },
];
const algoTotal = 356;
function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}
function describeDonutSegment(cx: number, cy: number, outerR: number, innerR: number, startDeg: number, endDeg: number) {
  const largeArc = endDeg - startDeg > 180 ? 1 : 0;
  const outerStart = polarToCartesian(cx, cy, outerR, endDeg);
  const outerEnd = polarToCartesian(cx, cy, outerR, startDeg);
  const innerStart = polarToCartesian(cx, cy, innerR, endDeg);
  const innerEnd = polarToCartesian(cx, cy, innerR, startDeg);
  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${outerR} ${outerR} 0 ${largeArc} 0 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerEnd.x} ${innerEnd.y}`,
    `A ${innerR} ${innerR} 0 ${largeArc} 1 ${innerStart.x} ${innerStart.y}`,
    'Z',
  ].join(' ');
}
const donutSegments = computed(() => {
  let acc = 0;
  return algoShare.map((s) => {
    const startDeg = acc * 3.6;
    acc += s.pct;
    const endDeg = acc * 3.6;
    const count = Math.round((algoTotal * s.pct) / 100);
    return {
      ...s,
      count,
      path: describeDonutSegment(70, 70, 70, 44, startDeg, endDeg),
    };
  });
});
const hoveredAlgo = ref<number | null>(null);
type AgentStatus = 'online' | 'busy' | 'offline';
interface Skill { name: string; val: number; }
interface Agent {
  name: string; group: string; status: AgentStatus; color: string;
  skills: Skill[]; capacity: number; current: number; pending: number; timeoutRisk: number;
  solve: string; good: string; affinityCount: number; affinityRate: string; avgHandle: string;
}
// 坐席主数据 + 运行态（来自 用户/班组管理 与实时统计，只读引用）；负载系数 = 在办 ÷ 容量 现算
const SEED_AGENTS: Agent[] = [
  { name: '张三', group: '售后服务组', status: 'online', color: '#1a6fff', skills: [{ name: '硬件故障', val: 9 }, { name: '退款', val: 8 }, { name: '系统', val: 7 }], capacity: 20, current: 12, pending: 3, timeoutRisk: 1, solve: '96%', good: '硬件故障 / 退款', affinityCount: 42, affinityRate: '38%', avgHandle: '18 分' },
  { name: '李四', group: '一线客服组', status: 'online', color: '#7c3aed', skills: [{ name: '咨询', val: 7 }, { name: '投诉', val: 6 }], capacity: 20, current: 18, pending: 5, timeoutRisk: 2, solve: '91%', good: '咨询 / 投诉', affinityCount: 30, affinityRate: '25%', avgHandle: '12 分' },
  { name: '王五', group: '技术支持组', status: 'online', color: '#059669', skills: [{ name: '系统问题', val: 8 }, { name: '升级', val: 7 }], capacity: 25, current: 8, pending: 1, timeoutRisk: 0, solve: '94%', good: '系统问题 / 升级', affinityCount: 20, affinityRate: '30%', avgHandle: '22 分' },
  { name: '赵敏', group: '大客户组', status: 'busy', color: '#d97706', skills: [{ name: '大客户', val: 8 }, { name: '投诉', val: 7 }], capacity: 20, current: 15, pending: 2, timeoutRisk: 1, solve: '93%', good: '大客户 / 投诉', affinityCount: 55, affinityRate: '62%', avgHandle: '25 分' },
  { name: '钱伟', group: '售后服务组', status: 'online', color: '#dc2626', skills: [{ name: '退款', val: 7 }, { name: '换货', val: 6 }], capacity: 20, current: 20, pending: 4, timeoutRisk: 3, solve: '89%', good: '退款 / 换货', affinityCount: 33, affinityRate: '20%', avgHandle: '20 分' },
  { name: '孙丽', group: '一线客服组', status: 'offline', color: '#6b7280', skills: [{ name: '咨询', val: 6 }], capacity: 15, current: 5, pending: 0, timeoutRisk: 0, solve: '90%', good: '咨询', affinityCount: 15, affinityRate: '18%', avgHandle: '10 分' },
  { name: '周强', group: '一线客服组', status: 'online', color: '#dc2626', skills: [{ name: '投诉', val: 6 }, { name: '咨询', val: 5 }], capacity: 22, current: 22, pending: 6, timeoutRisk: 4, solve: '85%', good: '投诉 / 咨询', affinityCount: 28, affinityRate: '22%', avgHandle: '15 分' },
  { name: '吴敏', group: '技术支持组', status: 'online', color: '#0891b2', skills: [{ name: '系统', val: 6 }, { name: '网络', val: 7 }], capacity: 18, current: 6, pending: 1, timeoutRisk: 0, solve: '92%', good: '系统 / 网络', affinityCount: 18, affinityRate: '28%', avgHandle: '19 分' },
  { name: '王芳', group: '二线技术支持组', status: 'busy', color: '#db2777', skills: [{ name: '疑难', val: 9 }, { name: '升级', val: 8 }], capacity: 16, current: 14, pending: 2, timeoutRisk: 1, solve: '97%', good: '疑难 / 升级', affinityCount: 40, affinityRate: '45%', avgHandle: '30 分' },
  { name: '陈静', group: '夜班应急组', status: 'online', color: '#16a34a', skills: [{ name: '应急', val: 6 }, { name: '咨询', val: 5 }], capacity: 12, current: 3, pending: 0, timeoutRisk: 0, solve: '88%', good: '应急 / 咨询', affinityCount: 12, affinityRate: '15%', avgHandle: '14 分' },
  { name: '郑浩', group: '大客户组', status: 'online', color: '#2563eb', skills: [{ name: '大客户', val: 6 }, { name: '商务', val: 7 }], capacity: 20, current: 9, pending: 1, timeoutRisk: 0, solve: '94%', good: '大客户 / 商务', affinityCount: 48, affinityRate: '50%', avgHandle: '21 分' },
  { name: '冯磊', group: '技术支持组', status: 'online', color: '#ea580c', skills: [{ name: '系统', val: 7 }, { name: '硬件', val: 6 }], capacity: 20, current: 17, pending: 3, timeoutRisk: 2, solve: '90%', good: '系统 / 硬件', affinityCount: 25, affinityRate: '24%', avgHandle: '18 分' },
];
const AGENT_TOTAL = 220;
const AGENT_SURNAMES = '王李张刘陈杨赵黄周吴徐孙胡朱高林何郭马罗梁宋郑谢韩唐冯于董萧程曹袁邓许傅沈曾彭吕苏卢蒋蔡贾丁魏薛叶阎余潘杜戴夏钟汪田任姜范方石姚谭廖邹熊金陆郝孔白崔康毛邱秦江史顾侯邵孟龙万段雷钱汤尹黎易常武乔贺赖龚文'.split('');
const AGENT_GIVEN = ['伟', '芳', '娜', '秀英', '敏', '静', '丽', '强', '磊', '军', '洋', '勇', '艳', '杰', '娟', '涛', '明', '超', '秀兰', '霞', '平', '刚', '桂英', '建华', '建国', '志强', '秀珍', '玉兰', '海燕', '雪梅'];
const AGENT_COLORS = ['#1a6fff', '#7c3aed', '#059669', '#d97706', '#dc2626', '#0891b2', '#db2777', '#16a34a', '#2563eb', '#ea580c', '#6b7280', '#0d9488'];
const GROUP_SKILLS: Record<string, string[]> = {
  一线客服组: ['咨询', '投诉', '退费', '账户', '工单分类'],
  大客户组: ['大客户', 'VIP服务', '商务协调', '合同咨询', '账单异常'],
  技术支持组: ['系统问题', '网络故障', 'API支持', '硬件故障', '远程诊断'],
  售后服务组: ['退款', '换货', '物流异常', '发票冲红', '渠道协调'],
  二线技术支持组: ['疑难升级', '架构问题', '二线支撑', '跨组协调', '技术评审'],
  夜班应急组: ['应急处理', '夜班咨询', '工单分类', '信息查询', '基础升级'],
};
function agentSeed(n: number) { const x = Math.sin(n * 9301 + 49297) * 233280; return x - Math.floor(x); }
function pickStatus(i: number): AgentStatus {
  const r = agentSeed(i + 7);
  if (r < 0.68) return 'online';
  if (r < 0.88) return 'busy';
  return 'offline';
}
function buildAgents(total: number): Agent[] {
  const list: Agent[] = [...SEED_AGENTS];
  const used = new Set(list.map((a) => a.name));
  let i = 0;
  while (list.length < total) {
    const surname = AGENT_SURNAMES[i % AGENT_SURNAMES.length];
    const given = AGENT_GIVEN[Math.floor(i / AGENT_SURNAMES.length) % AGENT_GIVEN.length];
    let name = surname + given;
    if (used.has(name)) name = `${surname}${given}${Math.floor(i / AGENT_GIVEN.length) + 1}`;
    if (used.has(name)) { i++; continue; }
    used.add(name);
    const group = GROUP_OPTS[i % GROUP_OPTS.length];
    const skillPool = GROUP_SKILLS[group] ?? GROUP_SKILLS['一线客服组'];
    const status = pickStatus(i);
    const capacity = 12 + Math.floor(agentSeed(i) * 14);
    const loadRatio = status === 'offline' ? agentSeed(i + 1) * 0.35 : 0.45 + agentSeed(i + 2) * 0.55;
    const current = Math.min(capacity, Math.max(status === 'offline' ? 0 : 1, Math.round(capacity * loadRatio)));
    const solveVal = Math.round(82 + agentSeed(i + 3) * 16);
    const s1 = skillPool[0]; const s2 = skillPool[1 % skillPool.length]; const s3 = skillPool[2 % skillPool.length];
    list.push({
      name, group, status, color: AGENT_COLORS[i % AGENT_COLORS.length],
      skills: [{ name: s1, val: 5 + Math.floor(agentSeed(i + 4) * 5) }, { name: s2, val: 4 + Math.floor(agentSeed(i + 5) * 5) }, { name: s3, val: 4 + Math.floor(agentSeed(i + 6) * 4) }],
      capacity, current, pending: Math.floor(current * agentSeed(i + 8) * 0.4),
      timeoutRisk: current >= capacity ? Math.floor(agentSeed(i + 9) * 4) : Math.floor(agentSeed(i + 10) * 2),
      solve: `${solveVal}%`, good: `${s1} / ${s2}`,
      affinityCount: Math.floor(8 + agentSeed(i + 11) * 60),
      affinityRate: `${Math.floor(10 + agentSeed(i + 12) * 55)}%`,
      avgHandle: `${8 + Math.floor(agentSeed(i + 13) * 28)} 分`,
    });
    i++;
  }
  return list;
}
const agents: Agent[] = buildAgents(AGENT_TOTAL);
const LOAD_TOP_N = 10;
function agentFactor(a: Agent) { return a.capacity ? a.current / a.capacity : 0; }
// 分派监控·负载概览：按负载降序取前 10；完整名单/筛选在「坐席画像」tab
const loadRows = computed(() => [...agents]
  .sort((x, y) => agentFactor(y) - agentFactor(x))
  .slice(0, LOAD_TOP_N)
  .map((a) => ({ name: a.name, group: a.group, current: a.current, capacity: a.capacity, status: a.status, color: a.color, loadFactor: agentFactor(a) })));
function goAgents() { router.push('/admin/users'); }
function goProfile() { activeTab.value = 'profile'; }
// —— ⑤ 坐席画像 tab ——
interface TypeStat { type: string; avgTime: string; count: number; rate: string; }
interface AgentDetail {
  empId: string; joinDate: string; totalHandled: number; resolutionRate: number;
  satisfaction: number; qaScore: number; topSkills: string[]; trend30d: number[]; typeStats: TypeStat[];
}
function mockTrend(base: number, spread = 10): number[] {
  return Array.from({ length: 30 }, (_, i) => Math.round(base + Math.sin(i / 2.5) * spread + (i % 4) * 1.5));
}
const agentProfiles: Record<string, AgentDetail> = {
  张三: { empId: 'XF-20210315', joinDate: '2021-03-15', totalHandled: 1256, resolutionRate: 94.2, satisfaction: 4.6, qaScore: 91.3, topSkills: ['直营退费', '套餐变更', '教育产品退费', '账单异常', 'VIP客户服务'], trend30d: [38, 42, 35, 41, 45, 39, 43, 47, 40, 44, 36, 42, 48, 41, 39, 45, 43, 38, 46, 42, 40, 44, 47, 41, 43, 39, 45, 42, 44, 40], typeStats: [{ type: '直营退费', avgTime: '1.8h', count: 423, rate: '96.2%' }, { type: '代理退费', avgTime: '2.5h', count: 286, rate: '93.1%' }, { type: '套餐变更', avgTime: '0.8h', count: 312, rate: '98.4%' }, { type: '账单异常', avgTime: '1.2h', count: 135, rate: '89.6%' }, { type: 'VIP服务', avgTime: '1.5h', count: 100, rate: '95.0%' }] },
  李四: { empId: 'XF-20200812', joinDate: '2020-08-12', totalHandled: 2180, resolutionRate: 91.5, satisfaction: 4.3, qaScore: 88.7, topSkills: ['产品投诉', '服务投诉', '升级处理', '风险工单', '客户安抚'], trend30d: mockTrend(44, 8), typeStats: [{ type: '产品投诉', avgTime: '2.2h', count: 756, rate: '92.4%' }, { type: '服务投诉', avgTime: '1.8h', count: 642, rate: '90.8%' }, { type: '升级处理', avgTime: '3.5h', count: 358, rate: '88.5%' }, { type: '风险工单', avgTime: '4.0h', count: 224, rate: '91.1%' }, { type: '客户安抚', avgTime: '1.5h', count: 200, rate: '94.0%' }] },
  王五: { empId: 'XF-20220601', joinDate: '2022-06-01', totalHandled: 856, resolutionRate: 96.8, satisfaction: 4.8, qaScore: 94.5, topSkills: ['语音识别', '自然语言处理', 'API技术支持', '星火大模型', 'SDK集成'], trend30d: mockTrend(32, 6), typeStats: [{ type: '语音识别', avgTime: '1.5h', count: 285, rate: '97.5%' }, { type: 'NLP技术', avgTime: '2.0h', count: 198, rate: '96.0%' }, { type: 'API支持', avgTime: '0.8h', count: 186, rate: '98.9%' }, { type: '星火大模型', avgTime: '1.8h', count: 112, rate: '94.6%' }, { type: 'SDK集成', avgTime: '2.5h', count: 75, rate: '93.3%' }] },
  赵敏: { empId: 'XF-20210920', joinDate: '2021-09-20', totalHandled: 980, resolutionRate: 93.0, satisfaction: 4.4, qaScore: 89.2, topSkills: ['大客户投诉', 'VIP服务', '商务协调', '账单异常', '升级处理'], trend30d: mockTrend(36, 7), typeStats: [{ type: '大客户投诉', avgTime: '2.5h', count: 340, rate: '93.5%' }, { type: 'VIP服务', avgTime: '1.8h', count: 280, rate: '95.8%' }, { type: '商务协调', avgTime: '2.2h', count: 165, rate: '91.2%' }, { type: '账单异常', avgTime: '1.5h', count: 110, rate: '90.3%' }, { type: '升级处理', avgTime: '3.0h', count: 85, rate: '92.6%' }] },
  钱伟: { empId: 'XF-20200518', joinDate: '2020-05-18', totalHandled: 1680, resolutionRate: 89.0, satisfaction: 4.1, qaScore: 86.5, topSkills: ['退款处理', '换货协调', '物流异常', '发票冲红', '渠道协调'], trend30d: mockTrend(40, 9), typeStats: [{ type: '退款处理', avgTime: '2.0h', count: 520, rate: '88.5%' }, { type: '换货协调', avgTime: '1.6h', count: 410, rate: '90.2%' }, { type: '物流异常', avgTime: '1.2h', count: 280, rate: '87.8%' }, { type: '发票冲红', avgTime: '1.8h', count: 245, rate: '89.6%' }, { type: '渠道协调', avgTime: '2.3h', count: 225, rate: '88.0%' }] },
  孙丽: { empId: 'XF-20230215', joinDate: '2023-02-15', totalHandled: 428, resolutionRate: 90.4, satisfaction: 4.2, qaScore: 87.5, topSkills: ['咨询解答', '信息查询', '工单分类', '基础退费', '账户管理'], trend30d: mockTrend(18, 4), typeStats: [{ type: '咨询解答', avgTime: '0.5h', count: 165, rate: '95.2%' }, { type: '信息查询', avgTime: '0.3h', count: 102, rate: '98.0%' }, { type: '工单分类', avgTime: '0.2h', count: 68, rate: '94.1%' }, { type: '基础退费', avgTime: '1.5h', count: 55, rate: '80.0%' }, { type: '账户管理', avgTime: '0.8h', count: 38, rate: '86.8%' }] },
  周强: { empId: 'XF-20190315', joinDate: '2019-03-15', totalHandled: 3420, resolutionRate: 85.0, satisfaction: 4.0, qaScore: 84.2, topSkills: ['重大投诉', '客户安抚', '升级处理', '风险工单', '危机处理'], trend30d: mockTrend(48, 10), typeStats: [{ type: '重大投诉', avgTime: '4.5h', count: 980, rate: '84.2%' }, { type: '客户安抚', avgTime: '2.0h', count: 780, rate: '86.1%' }, { type: '升级处理', avgTime: '3.5h', count: 620, rate: '83.5%' }, { type: '风险工单', avgTime: '4.0h', count: 540, rate: '85.8%' }, { type: '危机处理', avgTime: '3.0h', count: 500, rate: '87.2%' }] },
  吴敏: { empId: 'XF-20211208', joinDate: '2021-12-08', totalHandled: 720, resolutionRate: 92.0, satisfaction: 4.5, qaScore: 90.8, topSkills: ['系统问题', '网络故障', 'API支持', 'SDK集成', '部署运维'], trend30d: mockTrend(28, 6), typeStats: [{ type: '系统问题', avgTime: '1.8h', count: 245, rate: '93.5%' }, { type: '网络故障', avgTime: '2.2h', count: 180, rate: '91.2%' }, { type: 'API支持', avgTime: '1.0h', count: 132, rate: '94.8%' }, { type: 'SDK集成', avgTime: '2.5h', count: 98, rate: '90.6%' }, { type: '部署运维', avgTime: '3.0h', count: 65, rate: '89.3%' }] },
  王芳: { empId: 'XF-20180620', joinDate: '2018-06-20', totalHandled: 2890, resolutionRate: 97.0, satisfaction: 4.7, qaScore: 95.2, topSkills: ['疑难升级', '架构问题', '二线支撑', '跨组协调', '技术评审'], trend30d: mockTrend(34, 7), typeStats: [{ type: '疑难升级', avgTime: '3.5h', count: 820, rate: '97.8%' }, { type: '架构问题', avgTime: '4.0h', count: 650, rate: '96.5%' }, { type: '二线支撑', avgTime: '2.5h', count: 580, rate: '97.2%' }, { type: '跨组协调', avgTime: '2.0h', count: 420, rate: '95.8%' }, { type: '技术评审', avgTime: '1.5h', count: 420, rate: '96.4%' }] },
  陈静: { empId: 'XF-20240110', joinDate: '2024-01-10', totalHandled: 312, resolutionRate: 88.0, satisfaction: 4.1, qaScore: 85.6, topSkills: ['应急处理', '夜班咨询', '工单分类', '信息查询', '基础升级'], trend30d: mockTrend(14, 4), typeStats: [{ type: '应急处理', avgTime: '1.2h', count: 98, rate: '89.5%' }, { type: '夜班咨询', avgTime: '0.6h', count: 85, rate: '92.0%' }, { type: '工单分类', avgTime: '0.3h', count: 62, rate: '88.7%' }, { type: '信息查询', avgTime: '0.4h', count: 45, rate: '91.2%' }, { type: '基础升级', avgTime: '2.0h', count: 22, rate: '82.5%' }] },
  郑浩: { empId: 'XF-20200722', joinDate: '2020-07-22', totalHandled: 1120, resolutionRate: 94.0, satisfaction: 4.5, qaScore: 91.0, topSkills: ['大客户维护', '商务协调', '合同咨询', 'VIP服务', '账单异常'], trend30d: mockTrend(30, 6), typeStats: [{ type: '大客户维护', avgTime: '2.0h', count: 380, rate: '95.2%' }, { type: '商务协调', avgTime: '2.5h', count: 290, rate: '93.8%' }, { type: '合同咨询', avgTime: '1.5h', count: 210, rate: '94.5%' }, { type: 'VIP服务', avgTime: '1.8h', count: 145, rate: '96.0%' }, { type: '账单异常', avgTime: '1.2h', count: 95, rate: '90.8%' }] },
  冯磊: { empId: 'XF-20220305', joinDate: '2022-03-05', totalHandled: 890, resolutionRate: 90.0, satisfaction: 4.3, qaScore: 88.4, topSkills: ['系统问题', '硬件故障', '远程诊断', '固件升级', '设备返修'], trend30d: mockTrend(33, 7), typeStats: [{ type: '系统问题', avgTime: '2.0h', count: 310, rate: '91.5%' }, { type: '硬件故障', avgTime: '2.8h', count: 245, rate: '88.2%' }, { type: '远程诊断', avgTime: '1.5h', count: 180, rate: '92.0%' }, { type: '固件升级', avgTime: '1.2h', count: 95, rate: '93.5%' }, { type: '设备返修', avgTime: '3.0h', count: 60, rate: '86.8%' }] },
};
function resolveAgentDetail(agent: Agent): AgentDetail {
  const cached = agentProfiles[agent.name];
  if (cached) return cached;
  const seed = [...agent.name].reduce((s, c) => s + c.charCodeAt(0), 0);
  const r = (n: number) => agentSeed(seed + n);
  const solveNum = parseFloat(agent.solve);
  const skills = agent.skills.map((s) => s.name);
  while (skills.length < 5) skills.push((GROUP_SKILLS[agent.group] ?? ['综合处理'])[skills.length % 5]);
  const typeStats: TypeStat[] = skills.slice(0, 5).map((type, idx) => ({
    type,
    avgTime: `${(0.8 + r(idx) * 3.5).toFixed(1)}h`,
    count: Math.round(40 + r(idx + 5) * 400),
    rate: `${Math.round(solveNum - 4 + r(idx + 10) * 8)}%`,
  }));
  return {
    empId: `XF-${20180000 + (seed % 80000)}`,
    joinDate: `20${18 + (seed % 7)}-${String(1 + (seed % 12)).padStart(2, '0')}-${String(1 + (seed % 27)).padStart(2, '0')}`,
    totalHandled: Math.round(180 + r(1) * 3200),
    resolutionRate: solveNum,
    satisfaction: Math.round((3.8 + r(2) * 1.1) * 10) / 10,
    qaScore: Math.round((80 + r(3) * 16) * 10) / 10,
    topSkills: skills.slice(0, 5),
    trend30d: mockTrend(18 + Math.floor(r(4) * 32), 8),
    typeStats,
  };
}
const skillTagColors = [
  { bg: '#e8f1ff', text: '#1560e0' }, { bg: '#ecfdf5', text: '#059669' }, { bg: '#fef3c7', text: '#b45309' },
  { bg: '#ede9fe', text: '#7c3aed' }, { bg: '#fee2e2', text: '#dc2626' },
];
const profileGroup = ref('全部');
const profileStatus = ref('全部');
const profileSearch = ref('');
const profileSort = ref<'load' | 'solve'>('load');
const profilePage = ref(1);
const profilePageSize = ref(20);
const selectedAgentName = ref('张三');
const pfGroupOpts = [{ value: '全部', label: '全部处理组' }, ...GROUP_OPTS.map((g) => ({ value: g, label: g }))];
const pfStatusOpts = [{ value: '全部', label: '全部状态' }, { value: 'online', label: '在线' }, { value: 'busy', label: '忙碌' }, { value: 'offline', label: '离线' }];
const pfSortOpts = [{ value: 'load', label: '按负载降序' }, { value: 'solve', label: '按解决率降序' }];
const profileList = computed(() => {
  const kw = profileSearch.value.trim();
  const list = agents.filter((a) => (profileGroup.value === '全部' || a.group === profileGroup.value)
    && (profileStatus.value === '全部' || a.status === profileStatus.value)
    && (!kw || a.name.includes(kw)));
  return [...list].sort((x, y) => (profileSort.value === 'load' ? agentFactor(y) - agentFactor(x) : parseFloat(y.solve) - parseFloat(x.solve)));
});
watch([profileSearch, profileGroup, profileStatus, profileSort], () => { profilePage.value = 1; });
watch(profileList, (list) => {
  if (!list.some((a) => a.name === selectedAgentName.value) && list.length) selectedAgentName.value = list[0].name;
}, { immediate: true });
const profilePagedList = computed(() => profileList.value.slice(
  (profilePage.value - 1) * profilePageSize.value,
  profilePage.value * profilePageSize.value,
).map((a) => ({ ...a, loadFactor: agentFactor(a) })));
const profilePagination = computed(() => ({
  current: profilePage.value,
  pageSize: profilePageSize.value,
  total: profileList.value.length,
  size: 'small' as const,
  showSizeChanger: true,
  pageSizeOptions: ['15', '20', '30', '50'],
  showTotal: (t: number) => `共 ${t} 人`,
}));
function onProfileTableChange(pag: { current?: number; pageSize?: number }) {
  profilePage.value = pag.current ?? profilePage.value;
  profilePageSize.value = pag.pageSize ?? profilePageSize.value;
}
const profileTableWrapRef = ref<HTMLElement | null>(null);
const profileTableScrollY = ref(360);
function updateProfileTableScrollY() {
  const el = profileTableWrapRef.value;
  if (!el || activeTab.value !== 'profile') return;
  profileTableScrollY.value = Math.max(100, el.clientHeight - 88);
}
let profileTableRo: ResizeObserver | null = null;
function bindProfileTableObserver() {
  profileTableRo?.disconnect();
  if (!profileTableWrapRef.value) return;
  profileTableRo = new ResizeObserver(() => updateProfileTableScrollY());
  profileTableRo.observe(profileTableWrapRef.value);
  updateProfileTableScrollY();
}
watch(activeTab, (tab) => { if (tab === 'profile') nextTick(bindProfileTableObserver); });
watch([profilePageSize, profilePage], () => { if (activeTab.value === 'profile') nextTick(updateProfileTableScrollY); });
onMounted(() => { if (activeTab.value === 'profile') nextTick(bindProfileTableObserver); });
onBeforeUnmount(() => profileTableRo?.disconnect());
const profileListCols = [
  { title: '姓名', key: 'name', width: 96 },
  { title: '处理组', dataIndex: 'group', key: 'group', ellipsis: true, width: 96 },
  { title: '在办/容量', key: 'cap', width: 80 },
  { title: '负载', key: 'factor', width: 68 },
  { title: '状态', key: 'status', width: 64 },
];
const currentAgent = computed(() => agents.find((a) => a.name === selectedAgentName.value) ?? agents[0]);
const currentDetail = computed(() => resolveAgentDetail(currentAgent.value));
function selectAgent(name: string) { selectedAgentName.value = name; }
function profileRowClass(name: string) { return selectedAgentName.value === name ? 'profile-row-active' : ''; }
function rateColor(rate: string) {
  const n = parseFloat(rate);
  if (n >= 90) return '#10b981';
  if (n >= 75) return '#f59e0b';
  return '#ef4444';
}
const dayLabels = [1, 6, 11, 16, 21, 26, 30];
function smoothPath(pts: { x: number; y: number }[]) {
  if (pts.length < 2) return '';
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    const c1x = p1.x + (p2.x - p0.x) / 6; const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6; const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}
const profileLineChart = computed(() => {
  const data = currentDetail.value.trend30d;
  const w = 680; const h = 150; const padT = 10; const padB = 22;
  const yMax = Math.ceil(Math.max(...data, 1) / 10) * 10;
  const plotH = h - padT - padB;
  const stepX = data.length > 1 ? w / (data.length - 1) : w;
  const pts = data.map((v, i) => ({ x: i * stepX, y: padT + (1 - v / yMax) * plotH }));
  const line = smoothPath(pts);
  const area = `${line} L ${w} ${h - padB} L 0 ${h - padB} Z`;
  const yTicks = [yMax, Math.round(yMax * 0.75), Math.round(yMax * 0.5), Math.round(yMax * 0.25), 0];
  return { w, h, line, area, yTicks };
});
const loadCols = [
  { title: '姓名', key: 'name', width: 120 },
  { title: '处理组', dataIndex: 'group', key: 'group', ellipsis: true },
  { title: '当前工单数', key: 'current', width: 96 },
  { title: '容量上限', key: 'capacity', width: 88 },
  { title: '负载系数', key: 'factor', width: 110 },
  { title: '负载进度', key: 'progress', width: 100 },
  { title: '在线状态', key: 'status', width: 88 },
];
const typeStatCols = [
  { title: '工单类型', dataIndex: 'type', key: 'type' },
  { title: '平均时长', dataIndex: 'avgTime', key: 'avgTime', width: 88 },
  { title: '处理量', dataIndex: 'count', key: 'count', width: 72 },
  { title: '解决率', key: 'rate', width: 72 },
];
function loadFactorColor(f: number) { return f >= 0.8 ? '#ef4444' : f >= 0.5 ? '#f59e0b' : '#10b981'; }
function statusText(s: AgentStatus) { return s === 'online' ? '在线' : s === 'busy' ? '忙碌' : '离线'; }
function statusColor(s: AgentStatus) { return s === 'online' ? '#10b981' : s === 'busy' ? '#f59e0b' : '#9ca3af'; }
const monitorCols = [
  { title: '工单池', dataIndex: 'pool', key: 'pool' },
  { title: '在线坐席', dataIndex: 'online', key: 'online', width: 100 },
  { title: '在办', dataIndex: 'load', key: 'load', width: 80 },
  { title: '积压', key: 'backlog', width: 90 },
  { title: '平均等待', dataIndex: 'wait', key: 'wait', width: 110 },
  { title: '分派成功率', dataIndex: 'rate', key: 'rate', width: 120 },
];
const monitorRows = [
  { pool: '学习机售后池', online: '8 / 10', load: 42, backlog: 12, wait: '3.2 分', rate: '98%' },
  { pool: '技术支持池', online: '5 / 6', load: 31, backlog: 58, wait: '11.4 分', rate: '95%' },
  { pool: '大客户专属池', online: '3 / 3', load: 12, backlog: 0, wait: '1.4 分', rate: '100%' },
  { pool: '618大促反馈池', online: '12', load: 36, backlog: 23, wait: '2.1 分', rate: '97%' },
];
function backlogColor(n: number) { return n > 50 ? '#ef4444' : n > 20 ? '#f59e0b' : '#10b981'; }

interface BacklogRule { id: number; when: string; action: string; enabled: boolean; }
const backlogRules = ref<BacklogRule[]>([
  { id: 1, when: '积压 > 50 或 平均等待 > 10 分', action: '放宽技能门槛一级', enabled: true },
  { id: 2, when: '积压 > 100', action: '扩服务方（拉相邻组 / 坐席）', enabled: true },
  { id: 3, when: '积压 > 150 或 在线坐席 < 需求 50%', action: '临时开抢单 + 升级组长人工调度', enabled: true },
]);
const backlogCols = [
  { title: '触发条件', dataIndex: 'when', key: 'when' },
  { title: '调节动作', dataIndex: 'action', key: 'action' },
  { title: '状态', key: 'enabled', width: 90 },
  { title: '操作', key: 'op', width: 120 },
];
const backlogModalOpen = ref(false);
const editingBacklogId = ref<number | null>(null);
const bf = reactive({ when: '', action: '' });
function openCreateBacklog() { editingBacklogId.value = null; Object.assign(bf, { when: '', action: '' }); backlogModalOpen.value = true; }
function openEditBacklog(row: BacklogRule) { editingBacklogId.value = row.id; Object.assign(bf, { when: row.when, action: row.action }); backlogModalOpen.value = true; }
function saveBacklog() {
  if (!bf.when.trim() || !bf.action.trim()) { message.error('触发条件与调节动作均为必填'); return; }
  if (editingBacklogId.value === null) {
    backlogRules.value.push({ id: Date.now(), when: bf.when.trim(), action: bf.action.trim(), enabled: true });
    message.success('调节规则已新增');
  } else {
    const t = backlogRules.value.find((r) => r.id === editingBacklogId.value);
    if (t) Object.assign(t, { when: bf.when.trim(), action: bf.action.trim() });
    message.success('调节规则已更新');
  }
  backlogModalOpen.value = false;
}
function delBacklog(row: BacklogRule) {
  Modal.confirm({ title: '删除调节规则', content: `确认删除「${row.when}」这条积压调节规则？`, okText: '删除', okType: 'danger', cancelText: '取消', onOk: () => { backlogRules.value = backlogRules.value.filter((r) => r.id !== row.id); message.success('已删除'); } });
}

// ===================== ④ 入池规则一览（只读） =====================
const inpoolCols = [
  { title: '规则名', dataIndex: 'name', key: 'name', width: 150 },
  { title: '命中条件', dataIndex: 'cond', key: 'cond' },
  { title: '目标池', dataIndex: 'pool', key: 'pool', width: 160 },
  { title: '优先级', key: 'priority', width: 90 },
  { title: '状态', key: 'status', width: 80 },
  { title: '操作', key: 'op', width: 150 },
];
const inpoolRows = [
  { name: 'VIP 优先入池', cond: '客户等级 ∈ {校长, 大V博主, 记者}', pool: '大客户专属池', priority: 'P0', status: true },
  { name: '618 大促入池', cond: '标签 = 618大促反馈', pool: '618大促反馈池', priority: 'P1', status: true },
  { name: '学习机入池', cond: '产品线 = 学习机 且 类型 ∈ {故障, 退款}', pool: '学习机售后池', priority: 'P2', status: true },
  { name: '技术类入池', cond: '工单类型 = 系统问题', pool: '技术支持池', priority: 'P2', status: true },
  { name: '升级入池', cond: '二线坐席点击「升级」', pool: '二线升级池', priority: '', status: true },
  { name: '默认入池', cond: '其它全部', pool: '一线客服池', priority: '兜底', status: true },
];
const PRIORITY_COLOR: Record<string, string> = { P0: 'red', P1: 'orange', P2: 'blue', 兜底: 'default' };
function goRules() { router.push('/admin/rules-list'); }
</script>

<template>
  <div class="dispatch-config">
    <AdminPageHeader title="智能分派" subtitle="工单调度引擎：进池由规则引擎路由，此处负责出池选人、积压监控与工单池；坐席主数据在「用户/班组管理」维护。" />

    <div class="dc-panels">
      <!-- ① 分派监控面板 -->
      <div v-show="activeTab === 'monitor'">
        <section class="block stat-block">
          <div class="stat-row">
            <div v-for="s in statCards" :key="s.label" class="stat-card" :style="{ '--accent': s.accent }">
              <div class="stat-card-inner">
                <div class="stat-main">
                  <div class="s-label">{{ s.label }}</div>
                  <div class="s-value">{{ s.value }}</div>
                  <div class="s-delta" :style="{ color: s.deltaColor }">
                    <ArrowUpOutlined v-if="s.icon !== 'sla'" class="delta-icon" />
                    {{ s.delta }}
                  </div>
                </div>
                <div class="stat-icon" :style="{ background: s.iconBg, color: s.accent }">
                  <SwapOutlined v-if="s.icon === 'swap'" />
                  <CheckCircleOutlined v-else-if="s.icon === 'check'" />
                  <SafetyCertificateOutlined v-else-if="s.icon === 'sla'" />
                  <InboxOutlined v-else />
                </div>
              </div>
            </div>
          </div>
        </section>

        <div class="chart-row">
          <section class="block trend">
            <div class="chart-head">
              <div class="b-title inline">分派趋势（近 {{ trendRange }} 天）</div>
              <div class="range-toggle">
                <button type="button" class="range-btn" :class="{ active: trendRange === '7' }" @click="trendRange = '7'">7 天</button>
                <button type="button" class="range-btn" :class="{ active: trendRange === '30' }" @click="trendRange = '30'">30 天</button>
              </div>
            </div>
            <div class="line-chart">
              <div class="y-axis">
                <span v-for="(t, i) in trendChart.yTicks" :key="i">{{ t }}</span>
              </div>
              <div class="chart-body">
                <svg :viewBox="`0 0 ${trendChart.w} ${trendChart.h}`" preserveAspectRatio="none" class="line-svg">
                  <defs>
                    <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stop-color="#1a6fff" stop-opacity="0.12" />
                      <stop offset="100%" stop-color="#1a6fff" stop-opacity="0.01" />
                    </linearGradient>
                  </defs>
                  <path :d="trendChart.area" fill="url(#trendFill)" />
                  <path :d="trendChart.line" fill="none" stroke="#1a6fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                  <template v-for="(p, i) in trendChart.pts" :key="i">
                    <circle v-if="trendChart.showDots" :cx="p.x" :cy="p.y" r="4" fill="#fff" stroke="#1a6fff" stroke-width="2" />
                  </template>
                </svg>
                <div class="x-axis">
                  <span
                    v-for="(d, i) in trendChart.xLabels"
                    :key="i"
                    class="x-label"
                    :style="{
                      left: (d.i / (trendChart.pointCount - 1) * 100) + '%',
                      transform: d.i === 0 ? 'translateX(0)' : d.i === trendChart.pointCount - 1 ? 'translateX(-100%)' : 'translateX(-50%)',
                    }"
                  >{{ d.text }}</span>
                </div>
              </div>
            </div>
          </section>
          <section class="block algo">
            <div class="b-title inline">算法使用占比</div>
            <div class="donut-wrap">
              <svg viewBox="0 0 140 140" class="donut-svg">
                <g v-for="(seg, i) in donutSegments" :key="seg.name">
                  <a-tooltip placement="top" :mouse-enter-delay="0.1">
                    <template #title>
                      <div class="algo-tip">
                        <span class="algo-tip-name">{{ seg.name }}</span>
                        <span class="algo-tip-val">{{ seg.pct }}% · {{ seg.count }} 次</span>
                      </div>
                    </template>
                    <path
                      :d="seg.path"
                      :fill="seg.color"
                      class="donut-seg"
                      :class="{ dim: hoveredAlgo !== null && hoveredAlgo !== i, active: hoveredAlgo === i }"
                      @mouseenter="hoveredAlgo = i"
                      @mouseleave="hoveredAlgo = null"
                    />
                  </a-tooltip>
                </g>
                <circle cx="70" cy="70" r="44" fill="#fff" pointer-events="none" />
                <text x="70" y="66" text-anchor="middle" class="donut-center-label">总计</text>
                <text x="70" y="84" text-anchor="middle" class="donut-center-val">{{ algoTotal }}</text>
              </svg>
            </div>
            <div class="legend legend-row">
              <div
                v-for="(a, i) in donutSegments"
                :key="a.name"
                class="lg-item"
                :class="{ active: hoveredAlgo === i }"
                @mouseenter="hoveredAlgo = i"
                @mouseleave="hoveredAlgo = null"
              >
                <span class="lg-sw" :style="{ background: a.color }" />
                <span class="lg-nm">{{ a.name }}</span>
                <span class="lg-pc">{{ a.pct }}%</span>
              </div>
            </div>
          </section>
        </div>

        <section class="block load-block">
          <div class="b-title inline">处理人负载概览 <span class="b-tip">按负载降序取前 10 · 满载(≥1)不再派单</span>
            <a-button type="link" size="small" class="hd-btn" @click="goProfile">查看全部处理人 →</a-button>
          </div>
          <a-table :columns="loadCols" :data-source="loadRows" row-key="name" :pagination="false" size="middle">
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'name'">
                <div class="agent-name">
                  <span class="agent-avatar" :style="{ background: record.color }">{{ record.name.charAt(0) }}</span>
                  <span class="agent-nm">{{ record.name }}</span>
                </div>
              </template>
              <span v-else-if="column.key === 'current'" class="mono">{{ record.current }}</span>
              <span v-else-if="column.key === 'capacity'" class="mono muted">{{ record.capacity }}</span>
              <span v-else-if="column.key === 'factor'" class="factor-cell">
                <span class="mono factor" :style="{ color: loadFactorColor(record.loadFactor) }">{{ record.loadFactor.toFixed(2) }}</span>
                <a-tag v-if="record.loadFactor >= 1" color="red" class="full-tag">满载</a-tag>
              </span>
              <div v-else-if="column.key === 'progress'" class="load-bar">
                <div class="load-bar-fill" :style="{ width: Math.min(record.loadFactor * 100, 100) + '%', background: loadFactorColor(record.loadFactor) }" />
              </div>
              <span v-else-if="column.key === 'status'" class="status-cell">
                <span class="status-dot" :style="{ background: statusColor(record.status) }" />
                <span :style="{ color: statusColor(record.status) }">{{ statusText(record.status) }}</span>
              </span>
            </template>
          </a-table>
        </section>

        <section class="block">
          <div class="b-title">池积压监控</div>
          <a-table :columns="monitorCols" :data-source="monitorRows" row-key="pool" :pagination="false" size="middle">
            <template #bodyCell="{ column, record }">
              <span v-if="column.key === 'backlog'" :style="{ color: backlogColor(record.backlog), fontWeight: 600 }">{{ record.backlog }}</span>
              <span v-else-if="column.key === 'rate'" class="ok">{{ record.rate }}</span>
            </template>
          </a-table>
        </section>

        <section class="block">
          <div class="b-title">积压调节规则 <span class="b-tip">积压超阈值自动调整派单策略；预警通知在「规则引擎 / SLA」配置</span>
            <a-button size="small" type="primary" class="hd-btn" @click="openCreateBacklog"><template #icon><PlusOutlined /></template>新增规则</a-button>
          </div>
          <a-table :columns="backlogCols" :data-source="backlogRules" row-key="id" :pagination="false" size="middle">
            <template #bodyCell="{ column, record }">
              <a-switch v-if="column.key === 'enabled'" v-model:checked="record.enabled" size="small" />
              <template v-else-if="column.key === 'op'">
                <a-button type="link" size="small" @click="openEditBacklog(record)">编辑</a-button>
                <a-button type="link" size="small" danger @click="delBacklog(record)">删除</a-button>
              </template>
            </template>
          </a-table>
        </section>
      </div>

      <!-- ② 出池派单 -->
      <div v-show="activeTab === 'dispatch'">
        <section class="block">
          <div class="b-title">派单模式 <span class="b-tip">可在工单池上按池覆盖</span></div>
          <a-radio-group v-model:value="dispatchMode" option-type="button" button-style="solid">
            <a-radio-button v-for="m in MODE_OPTS" :key="m" :value="m">{{ m }}</a-radio-button>
          </a-radio-group>
        </section>

        <section class="block">
          <div class="b-title">候选门槛 <span class="b-tip">不满足的坐席不进入候选</span></div>
          <div class="gates">
            <label class="gate"><a-switch v-model:checked="gates.online" size="small" /><span>在线状态可接</span></label>
            <label class="gate"><a-switch v-model:checked="gates.capacity" size="small" /><span>容量未满</span></label>
            <label class="gate"><a-switch v-model:checked="gates.skill" size="small" /><span>技能达标</span></label>
            <label class="gate"><a-switch v-model:checked="gates.schedule" size="small" /><span>排班在岗</span></label>
          </div>
        </section>

        <section class="block">
          <div class="b-title">选人策略 · 强制优先 <span class="b-tip">命中即定，短路后续；可开关与调序</span></div>
          <div v-for="(s, i) in forceRules" :key="s.key" class="chain-row" :class="{ off: !s.enabled }">
            <span class="seq">{{ i + 1 }}</span>
            <div class="ci"><div class="cn">{{ s.name }}<a-tag v-if="s.locked" class="lk">锁定</a-tag></div><div class="cd">{{ s.desc }}</div></div>
            <div class="ca">
              <a-button type="text" size="small" :disabled="i <= 1" @click="forceUp(i)"><template #icon><ArrowUpOutlined /></template></a-button>
              <a-button type="text" size="small" :disabled="i === 0 || i === forceRules.length - 1" @click="forceDown(i)"><template #icon><ArrowDownOutlined /></template></a-button>
              <a-switch v-model:checked="s.enabled" size="small" :disabled="s.locked" />
            </div>
          </div>
        </section>

        <section class="block">
          <div class="b-title">选人策略 · 综合评分 <span class="b-tip">未命中强制优先时按权重打分，取最高分派出</span>
            <span class="wsum" :class="{ warn: weightSum !== 100 }">权重合计 {{ weightSum }}</span>
          </div>
          <div v-for="f in scoreFactors" :key="f.key" class="factor-row" :class="{ off: !f.enabled }">
            <a-switch v-model:checked="f.enabled" size="small" />
            <div class="fi"><div class="cn">{{ f.name }}</div><div class="cd">{{ f.desc }}</div></div>
            <div class="fw">
              <a-slider v-model:value="f.weight" :min="0" :max="100" :disabled="!f.enabled" style="width: 180px" />
              <a-input-number v-model:value="f.weight" :min="0" :max="100" :disabled="!f.enabled" size="small" style="width: 68px" />
            </div>
          </div>
        </section>

        <section class="block">
          <div class="b-title">撮合方式</div>
          <a-radio-group v-model:value="batchMode">
            <a-radio value="instant">即时派单</a-radio>
            <a-radio value="batch">攒批全局撮合</a-radio>
          </a-radio-group>
          <span v-if="batchMode === 'batch'" class="inline-field">攒批窗口 <a-input-number v-model:value="batchWindow" :min="1" :max="30" size="small" addon-after="秒" /></span>
        </section>

        <section class="block">
          <div class="b-title">未接兜底 <span class="b-tip">派出后超时未接受的处置链</span></div>
          <a-form layout="inline" class="mb">
            <a-form-item label="接单超时"><a-input-number v-model:value="timeoutSec" :min="5" :max="600" size="small" addon-after="秒" /></a-form-item>
            <a-form-item label="兜底坐席"><a-select v-model:value="fallbackAgent" size="small" style="width: 180px" :options="FALLBACK_OPTS.map((v) => ({ value: v, label: v }))" /></a-form-item>
          </a-form>
          <div v-for="(s, i) in fallbackSteps" :key="s.key" class="chain-row" :class="{ off: !s.enabled }">
            <span class="seq">{{ i + 1 }}</span>
            <div class="ci"><div class="cn">{{ s.name }}</div><div class="cd">{{ s.desc }}</div></div>
            <a-switch v-model:checked="s.enabled" size="small" />
          </div>
          <label class="gate mt"><a-switch v-model:checked="rejectDeprioritize" size="small" /><span>拒单 / 超时降权：频繁拒接的坐席降低后续派单优先级</span></label>
        </section>

        <section class="block">
          <div class="b-title">处理人能力画像 <span class="b-tip">只读 · 引用「用户/班组管理」，编辑请前往主数据</span></div>
          <a-table :columns="profileCols" :data-source="profileRows" row-key="name" :pagination="false" size="middle">
            <template #bodyCell="{ column, record }">
              <span v-if="column.key === 'cap'">{{ record.load }} / {{ record.cap }}</span>
              <a-tag v-else-if="column.key === 'skill'" color="blue">{{ record.skill }}</a-tag>
            </template>
          </a-table>
        </section>
      </div>

      <!-- ③ 工单池 -->
      <div v-show="activeTab === 'pool'">
        <section class="block pool-block">
          <div class="b-title inline">工单池 <span class="b-tip">待分配工单排队区；进池由规则引擎路由，此处定义池与服务方</span>
            <a-button size="small" type="primary" class="hd-btn" @click="openCreatePool"><template #icon><PlusOutlined /></template>新建池</a-button>
          </div>
          <div class="pool-grid">
            <div v-for="pool in pools" :key="pool.id" class="pool-card" :class="{ off: !pool.status }">
              <div class="pool-card-head">
                <div class="pool-card-id">
                  <div class="pool-icon"><InboxOutlined /></div>
                  <div class="pool-title-wrap">
                    <div class="pool-name-row">
                      <span class="pool-name">{{ pool.name }}</span>
                      <span class="pool-status" :class="pool.status ? 'on' : 'off'">
                        <span class="status-dot" />
                        {{ pool.status ? '运行中' : '已停用' }}
                      </span>
                    </div>
                    <div class="pool-code">{{ pool.code }}</div>
                  </div>
                </div>
                <div class="pool-card-actions">
                  <a-switch v-model:checked="pool.status" size="small" />
                  <a-button type="text" size="small" @click="openEditPool(pool)"><template #icon><EditOutlined /></template></a-button>
                  <a-button type="text" size="small" danger @click="delPool(pool)"><template #icon><DeleteOutlined /></template></a-button>
                </div>
              </div>
              <div v-if="pool.type === '临时'" class="pool-period"><a-tag color="orange" size="small">临时</a-tag> {{ pool.period }}</div>
              <div class="pool-condition-box">
                <span class="pool-cond-label">进入条件</span>
                <span class="pool-cond-text">{{ pool.condition }}</span>
              </div>
              <div class="pool-metrics">
                <div class="pool-metric">
                  <div class="pool-metric-val primary">{{ pool.count }}</div>
                  <div class="pool-metric-lb">当前工单</div>
                </div>
                <div class="pool-metric">
                  <div class="pool-metric-val">{{ handlerCount(pool) }}</div>
                  <div class="pool-metric-lb">处理人</div>
                </div>
                <div class="pool-metric">
                  <div class="pool-metric-val">{{ pool.avgTime }}</div>
                  <div class="pool-metric-lb">平均时长</div>
                </div>
              </div>
              <div class="pool-foot">
                <span><span class="pool-foot-lb">分配方式：</span>{{ assignModeText(pool.mode) }}</span>
                <span><span class="pool-foot-lb">超时：</span>{{ pool.timeout }}</span>
              </div>
            </div>
          </div>
        </section>
      </div>

      <!-- ④ 入池规则一览（只读） -->
      <div v-show="activeTab === 'inpool'">
        <section class="block">
          <a-alert type="info" show-icon banner class="inpool-note">
            <template #message>入池规则由「规则引擎」维护（派单→池 / 升级入池）。此处只读汇总，编辑请前往规则引擎。</template>
          </a-alert>
          <a-table :columns="inpoolCols" :data-source="inpoolRows" row-key="name" :pagination="false" size="middle" style="margin-top: 12px">
            <template #bodyCell="{ column, record }">
              <span v-if="column.key === 'priority'">
                <a-tag v-if="record.priority" :color="PRIORITY_COLOR[record.priority] || 'blue'">{{ record.priority }}</a-tag>
                <span v-else class="muted">—</span>
              </span>
              <span v-else-if="column.key === 'status'"><span class="dot" /> 启用</span>
              <a-button v-else-if="column.key === 'op'" type="link" size="small" @click="goRules">去规则引擎编辑 →</a-button>
            </template>
          </a-table>
        </section>
      </div>

      <!-- ⑤ 坐席画像 -->
      <div v-show="activeTab === 'profile'">
        <section class="block profile-split">
          <div class="b-title inline">坐席画像 <span class="b-tip">运力侧只读看板 · 引用「用户/班组管理」与历史统计</span></div>
          <div class="profile-layout">
            <aside class="profile-list-panel">
              <div class="pf-toolbar">
                <a-input v-model:value="profileSearch" size="small" placeholder="搜索姓名" allow-clear class="pf-search">
                  <template #prefix><SearchOutlined class="pf-search-icon" /></template>
                </a-input>
                <a-select v-model:value="profileGroup" size="small" :options="pfGroupOpts" />
                <a-select v-model:value="profileStatus" size="small" :options="pfStatusOpts" />
                <a-select v-model:value="profileSort" size="small" :options="pfSortOpts" />
              </div>
              <div ref="profileTableWrapRef" class="profile-table-wrap">
                <a-table
                  :columns="profileListCols"
                  :data-source="profilePagedList"
                  row-key="name"
                  size="small"
                  :pagination="profilePagination"
                  :scroll="{ y: profileTableScrollY }"
                  :row-class-name="(record) => profileRowClass(record.name)"
                  @change="onProfileTableChange"
                  @row-click="(record) => selectAgent(record.name)"
                >
                  <template #bodyCell="{ column, record }">
                    <template v-if="column.key === 'name'">
                      <span class="agent-nm">{{ record.name }}</span>
                    </template>
                    <span v-else-if="column.key === 'cap'" class="mono cap-text">{{ record.current }}/{{ record.capacity }}</span>
                    <span v-else-if="column.key === 'factor'" class="mono factor" :style="{ color: loadFactorColor(record.loadFactor) }">{{ record.loadFactor.toFixed(2) }}</span>
                    <span v-else-if="column.key === 'status'" class="status-cell compact">
                      <span class="status-dot" :style="{ background: statusColor(record.status) }" />
                      <span :style="{ color: statusColor(record.status) }">{{ statusText(record.status) }}</span>
                    </span>
                  </template>
                </a-table>
              </div>
            </aside>
            <main class="profile-detail-panel">
              <div class="pd-body">
                <div class="pd-kpis">
                  <div class="pd-kpi blue"><div class="pd-kpi-val">{{ currentDetail.totalHandled.toLocaleString() }}</div><div class="pd-kpi-lb">累计处理量</div></div>
                  <div class="pd-kpi green"><div class="pd-kpi-val">{{ currentDetail.resolutionRate }}%</div><div class="pd-kpi-lb">解决率</div></div>
                  <div class="pd-kpi orange"><div class="pd-kpi-val">{{ currentDetail.satisfaction }}/5</div><div class="pd-kpi-lb">平均满意度</div></div>
                  <div class="pd-kpi cyan"><div class="pd-kpi-val">{{ currentDetail.qaScore }}</div><div class="pd-kpi-lb">质检平均分</div></div>
                </div>

                <div class="pd-section">
                  <h4 class="pd-sec-title">擅长领域 TOP5</h4>
                  <div class="pd-skills">
                    <span
                      v-for="(skill, i) in currentDetail.topSkills"
                      :key="skill"
                      class="pd-skill-tag"
                      :style="{ background: skillTagColors[i % skillTagColors.length].bg, color: skillTagColors[i % skillTagColors.length].text }"
                    ><StarFilled class="pd-star" />{{ skill }}</span>
                  </div>
                </div>

                <div class="pd-section">
                  <h4 class="pd-sec-title">近 30 天处理量趋势</h4>
                  <div class="pd-bar-wrap">
                    <div class="pd-bar-y">
                      <span v-for="(t, i) in profileLineChart.yTicks" :key="i">{{ t }}</span>
                    </div>
                    <div class="pd-bar-main">
                      <svg :viewBox="`0 0 ${profileLineChart.w} ${profileLineChart.h}`" class="pd-line-svg" preserveAspectRatio="none">
                        <defs>
                          <linearGradient id="pdTrendArea" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stop-color="#1a6fff" stop-opacity="0.20" />
                            <stop offset="100%" stop-color="#1a6fff" stop-opacity="0" />
                          </linearGradient>
                        </defs>
                        <path :d="profileLineChart.area" fill="url(#pdTrendArea)" />
                        <path :d="profileLineChart.line" fill="none" stroke="#1a6fff" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-linecap="round" />
                      </svg>
                      <div class="pd-bar-x">
                        <span v-for="(d, i) in dayLabels" :key="i">{{ d }}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div class="pd-section pd-section-last">
                  <h4 class="pd-sec-title">各类型平均处理时长</h4>
                  <a-table :data-source="currentDetail.typeStats" :columns="typeStatCols" row-key="type" :pagination="false" size="small" class="pd-type-table" bordered>
                    <template #bodyCell="{ column, record }">
                      <span v-if="column.key === 'count'" class="mono">{{ record.count }}</span>
                      <span v-else-if="column.key === 'rate'" class="mono" :style="{ color: rateColor(record.rate), fontWeight: 600 }">{{ record.rate }}</span>
                    </template>
                  </a-table>
                </div>

                <div class="pd-foot"><a-button type="link" size="small" @click="goAgents">去用户/班组管理编辑主数据 →</a-button></div>
              </div>
            </main>
          </div>
        </section>
      </div>
    </div>

    <!-- 新建 / 编辑 工单池 -->
    <a-modal v-model:open="poolModalOpen" :title="editingPoolId === null ? '新建工单池' : '编辑工单池'" :width="560" ok-text="保存" cancel-text="取消" @ok="savePool">
      <a-form layout="vertical">
        <a-form-item label="池名称" required><a-input v-model:value="pf.name" placeholder="请输入池名称" /></a-form-item>
        <a-form-item label="池编码"><a-input v-model:value="pf.code" placeholder="如 POOL-GENERAL，留空自动生成" /></a-form-item>
        <a-form-item label="进入条件"><a-input v-model:value="pf.condition" placeholder="如 无特殊标记的工单" /></a-form-item>
        <a-form-item label="类型">
          <a-radio-group v-model:value="pf.type" option-type="button">
            <a-radio-button value="常驻">常驻</a-radio-button>
            <a-radio-button value="临时">临时</a-radio-button>
          </a-radio-group>
        </a-form-item>
        <a-form-item v-if="pf.type === '临时'" label="有效期" required><a-input v-model:value="pf.period" placeholder="如 2026-06-01 ~ 2026-06-30" /></a-form-item>
        <a-form-item v-if="pf.type === '常驻'" label="服务处理组" required>
          <a-select v-model:value="pf.groups" mode="multiple" placeholder="选择服务该池的处理组" :options="GROUP_OPTS.map((v) => ({ value: v, label: v }))" />
        </a-form-item>
        <a-form-item v-else label="跨组抽调坐席" required>
          <a-select v-model:value="pf.agents" mode="multiple" placeholder="跨组勾选参与坐席（保留原组）" :options="AGENT_OPTS.map((v) => ({ value: v, label: v }))" />
        </a-form-item>
        <a-form-item label="出池模式"><a-select v-model:value="pf.mode" :options="MODE_OPTS.map((v) => ({ value: v, label: v }))" /></a-form-item>
        <a-form-item label="超时处理"><a-input v-model:value="pf.timeout" placeholder="如 超时自动分配 / 升级至组长" /></a-form-item>
      </a-form>
    </a-modal>

    <!-- 新建 / 编辑 积压调节规则 -->
    <a-modal v-model:open="backlogModalOpen" :title="editingBacklogId === null ? '新增调节规则' : '编辑调节规则'" :width="520" ok-text="保存" cancel-text="取消" @ok="saveBacklog">
      <a-form layout="vertical">
        <a-form-item label="触发条件" required><a-input v-model:value="bf.when" placeholder="如 积压 > 50 或 平均等待 > 10 分" /></a-form-item>
        <a-form-item label="调节动作" required><a-input v-model:value="bf.action" placeholder="如 放宽技能门槛一级 / 扩服务方 / 升级" /></a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<style scoped>
.dispatch-config { display: flex; flex-direction: column; gap: 8px; padding: 16px 24px; }
.dc-tabs :deep(.ant-tabs-nav) { margin-bottom: 12px; }
.block { background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px 20px; margin-bottom: 16px; }
.b-title { font-size: 13px; font-weight: 600; color: #111827; margin-bottom: 14px; padding-left: 10px; border-left: 3px solid #1a6fff; display: flex; align-items: center; gap: 10px; }
.b-tip { font-size: 12px; font-weight: normal; color: #9ca3af; }
.hd-btn { margin-left: auto; }
.wsum { margin-left: auto; font-size: 12px; font-weight: normal; color: #6b7280; }
.wsum.warn { color: #f59e0b; }
/* 统计卡片 */
.stat-block { padding: 20px; }
.stat-row { display: flex; gap: 16px; }
.stat-card { flex: 1; border: 1px solid #eef0f3; border-radius: 8px; padding: 16px 18px; position: relative; overflow: hidden; background: #fff; }
.stat-card::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px; background: var(--accent); }
.stat-card-inner { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.stat-main { flex: 1; min-width: 0; }
.stat-icon { width: 40px; height: 40px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 18px; flex: none; }
.s-label { font-size: 12px; color: #6b7280; }
.s-value { font-size: 28px; font-weight: 700; color: #111827; margin: 6px 0 4px; line-height: 1.1; }
.s-delta { font-size: 12px; display: flex; align-items: center; gap: 4px; }
.delta-icon { font-size: 10px; }
/* 图表 */
.chart-row { display: flex; gap: 16px; }
.chart-row .trend { flex: 2; margin-bottom: 16px; }
.chart-row .algo { flex: 1; margin-bottom: 16px; }
.chart-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.b-title.inline { margin-bottom: 0; }
.range-toggle { display: flex; gap: 4px; }
.range-btn { border: none; background: transparent; padding: 4px 10px; border-radius: 4px; font-size: 12px; color: #6b7280; cursor: pointer; }
.range-btn.active { background: #eff6ff; color: #1a6fff; font-weight: 600; }
.range-btn:hover:not(.active) { background: #f9fafb; }
.line-chart { display: flex; gap: 10px; height: 220px; }
.y-axis { display: flex; flex-direction: column; justify-content: space-between; font-size: 11px; color: #9ca3af; padding: 4px 0 22px; width: 36px; text-align: right; flex: none; }
.chart-body { flex: 1; display: flex; flex-direction: column; min-width: 0; overflow: hidden; }
.line-svg { flex: 1; width: 100%; min-height: 0; }
.x-axis { position: relative; height: 20px; margin-top: 6px; }
.x-label { position: absolute; font-size: 11px; color: #9ca3af; white-space: nowrap; }
.donut-wrap { display: flex; justify-content: center; padding: 8px 0 12px; }
.donut-svg { width: 140px; height: 140px; overflow: visible; }
.donut-seg { cursor: pointer; transition: opacity 0.15s, filter 0.15s; }
.donut-seg.dim { opacity: 0.45; }
.donut-seg.active { filter: brightness(1.08); }
.donut-center-label { font-size: 11px; fill: #9ca3af; pointer-events: none; }
.donut-center-val { font-size: 18px; font-weight: 700; fill: #111827; pointer-events: none; }
.algo-tip { display: flex; flex-direction: column; gap: 2px; line-height: 1.4; }
.algo-tip-name { font-weight: 600; }
.algo-tip-val { font-size: 12px; opacity: 0.9; }
.legend { display: flex; flex-direction: column; gap: 8px; }
.legend-row { flex-direction: row; flex-wrap: wrap; justify-content: center; gap: 10px 16px; }
.lg-item { display: flex; align-items: center; gap: 6px; cursor: pointer; padding: 2px 6px; border-radius: 4px; transition: background 0.15s; }
.lg-item:hover, .lg-item.active { background: #f3f4f6; }
.lg-sw { width: 8px; height: 8px; border-radius: 50%; flex: none; }
.lg-nm { font-size: 12px; color: #374151; }
.lg-pc { font-size: 12px; font-weight: 600; color: #111827; }
/* 负载表格 */
.load-block :deep(.ant-table) { margin-top: 4px; }
.agent-name { display: flex; align-items: center; gap: 8px; }
.agent-avatar { width: 28px; height: 28px; border-radius: 50%; color: #fff; font-size: 12px; display: flex; align-items: center; justify-content: center; flex: none; }
.agent-nm { font-weight: 500; color: #111827; }
.mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
.muted { color: #6b7280; }
.factor { font-weight: 600; }
.load-bar { height: 8px; background: #eef0f3; border-radius: 4px; overflow: hidden; min-width: 120px; }
.load-bar-fill { height: 100%; border-radius: 4px; transition: width 0.3s; }
/* 坐席画像 · 左右分栏 */
.profile-split { padding: 16px 20px; margin-bottom: 0; }
.profile-layout {
  display: flex; gap: 16px; margin-top: 14px; align-items: stretch;
  height: calc(100vh - 272px); min-height: 480px;
}
.profile-list-panel {
  flex: 2; min-width: 0;
  border: 1px solid #eef0f3; border-radius: 8px; padding: 12px;
  background: #fafbfc; display: flex; flex-direction: column; overflow: hidden;
}
.pf-toolbar { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; flex-shrink: 0; }
.pf-search { width: 200px; flex: none; }
.pf-search-icon { color: #9ca3af; font-size: 13px; }
.pf-toolbar .ant-select { flex: 1; min-width: 0; }
.profile-table-wrap { flex: 1; min-height: 0; overflow: hidden; }
.profile-list-panel :deep(.ant-table-wrapper) { height: 100%; }
.profile-list-panel :deep(.ant-table) { background: #fff; border-radius: 6px; font-size: 12px; }
.profile-list-panel :deep(.ant-table-thead > tr > th),
.profile-list-panel :deep(.ant-table-tbody > tr > td) { padding: 7px 8px !important; }
.profile-list-panel :deep(.ant-table-row) { cursor: pointer; }
.profile-list-panel :deep(.profile-row-active > td) { background: #eff6ff !important; }
.profile-list-panel :deep(.ant-pagination) { margin: 8px 0 0 !important; }
.agent-nm { font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cap-text { font-size: 12px; }
.status-cell.compact { font-size: 11px; gap: 4px; }
.profile-detail-panel {
  flex: 1; min-width: 0; min-height: 0; display: flex; flex-direction: column;
  border: 1px solid #e5e7eb; border-radius: 10px;
  background: #fff; overflow: hidden;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.04);
}
.pd-body { flex: 1; min-height: 0; padding: 20px 24px 12px; display: flex; flex-direction: column; overflow-y: auto; }
.pd-kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 16px; }
.pd-kpi { text-align: center; padding: 14px 10px; border-radius: 10px; }
.pd-kpi-val { font-size: 22px; font-weight: 700; line-height: 1.2; }
.pd-kpi-lb { font-size: 12px; color: #6b7280; margin-top: 6px; }
.pd-kpi.blue { background: #eff6ff; } .pd-kpi.blue .pd-kpi-val { color: #1a6fff; }
.pd-kpi.green { background: #ecfdf5; } .pd-kpi.green .pd-kpi-val { color: #059669; }
.pd-kpi.orange { background: #fffbeb; } .pd-kpi.orange .pd-kpi-val { color: #d97706; }
.pd-kpi.cyan { background: #f0f9ff; } .pd-kpi.cyan .pd-kpi-val { color: #0284c7; }
.pd-section { margin-bottom: 16px; }
.pd-section-last { margin-bottom: 8px; }
.pd-sec-title { font-size: 13px; font-weight: 600; color: #374151; margin: 0 0 12px; }
.pd-skills { display: flex; flex-wrap: wrap; gap: 8px; }
.pd-skill-tag { display: inline-flex; align-items: center; gap: 4px; padding: 6px 14px; border-radius: 999px; font-size: 12px; font-weight: 500; }
.pd-star { font-size: 10px; }
.pd-bar-wrap { display: flex; gap: 8px; height: 150px; width: 100%; }
.pd-bar-y { display: flex; flex-direction: column; justify-content: space-between; font-size: 11px; color: #9ca3af; padding-bottom: 20px; width: 28px; text-align: right; flex: none; }
.pd-bar-main { flex: 1; display: flex; flex-direction: column; min-width: 0; }
.pd-bar-svg { flex: 1; width: 100%; min-height: 0; }
.pd-line-svg { flex: 1; width: 100%; min-height: 0; }
.pd-bar-x { display: flex; justify-content: space-between; font-size: 11px; color: #9ca3af; padding-top: 6px; }
.pd-type-table { border-radius: 8px; overflow: hidden; }
.pd-type-table :deep(.ant-table-thead > tr > th) { font-size: 12px; padding: 10px 12px; background: #f9fafb; }
.pd-type-table :deep(.ant-table-tbody > tr > td) { font-size: 13px; padding: 10px 12px; }
.pd-foot { margin-top: 8px; text-align: right; border-top: 1px solid #f3f4f6; padding-top: 12px; }
/* 工单池卡片 */
.pool-block { padding: 16px 20px; }
.pool-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-top: 14px; }
.pool-card {
  background: #fff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 14px;
  transition: box-shadow 0.2s, border-color 0.2s;
}
.pool-card:hover { box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06); border-color: #93c5fd; }
.pool-card.off { opacity: 0.72; }
.pool-card-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 10px; }
.pool-card-id { display: flex; align-items: center; gap: 8px; min-width: 0; flex: 1; }
.pool-icon { width: 34px; height: 34px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 16px; flex: none; }
.pool-title-wrap { min-width: 0; }
.pool-name-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.pool-name { font-size: 14px; font-weight: 600; color: #111827; }
.pool-code { font-size: 11px; color: #9ca3af; margin-top: 1px; }
.pool-card-actions { display: flex; align-items: center; gap: 0; flex: none; }
.pool-status-tag { margin: 0; border-radius: 999px; font-size: 11px; line-height: 18px; padding: 0 6px; }
.pool-period { margin-bottom: 8px; font-size: 11px; color: #6b7280; display: flex; align-items: center; gap: 6px; }
.pool-condition-box {
  display: flex; align-items: center; gap: 6px; background: #f9fafb; border-radius: 6px;
  padding: 6px 10px; margin-bottom: 10px; min-width: 0;
}
.pool-cond-label { font-size: 11px; color: #9ca3af; flex: none; white-space: nowrap; }
.pool-cond-text { font-size: 12px; color: #374151; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.pool-metrics { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin-bottom: 10px; }
.pool-metric { text-align: center; padding: 8px 4px; background: #f9fafb; border-radius: 6px; }
.pool-metric-val { font-size: 17px; font-weight: 700; color: #374151; line-height: 1.2; }
.pool-metric-val.primary { color: #1a6fff; }
.pool-metric-lb { font-size: 10px; color: #9ca3af; margin-top: 2px; }
.pool-foot { display: flex; flex-direction: column; gap: 4px; font-size: 11px; color: #374151; padding-top: 10px; border-top: 1px solid #f3f4f6; }
.pool-foot-lb { color: #9ca3af; }
.factor-cell { display: inline-flex; align-items: center; gap: 6px; }
.full-tag { margin: 0; font-size: 11px; line-height: 18px; padding: 0 4px; }
.status-cell { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; }
.status-dot { width: 7px; height: 7px; border-radius: 50%; flex: none; }
/* 链式行 */
.chain-row { display: flex; align-items: center; gap: 12px; padding: 10px 12px; border: 1px solid #eef0f3; border-radius: 8px; margin-bottom: 8px; background: #fcfcfd; }
.chain-row.off { opacity: 0.5; }
.seq { width: 22px; height: 22px; border-radius: 50%; background: #1a6fff; color: #fff; font-size: 12px; display: flex; align-items: center; justify-content: center; flex: none; }
.ci { flex: 1; }
.cn { font-size: 13px; font-weight: 600; color: #111827; display: flex; align-items: center; gap: 6px; }
.cn .lk { transform: scale(0.85); }
.cd { font-size: 12px; color: #6b7280; margin-top: 2px; }
.ca { display: flex; align-items: center; gap: 4px; }
.factor-row { display: flex; align-items: center; gap: 14px; padding: 8px 12px; border: 1px solid #eef0f3; border-radius: 8px; margin-bottom: 8px; background: #fcfcfd; }
.factor-row.off { opacity: 0.55; }
.factor-row .fi { flex: 1; }
.factor-row .fw { display: flex; align-items: center; gap: 10px; }
.gates { display: flex; flex-wrap: wrap; gap: 24px; }
.gate { display: flex; align-items: center; gap: 8px; font-size: 13px; color: #374151; cursor: pointer; }
.mt { margin-top: 14px; }
.mb { margin-bottom: 8px; }
.inline-field { margin-left: 16px; font-size: 13px; color: #374151; display: inline-flex; align-items: center; gap: 8px; }
.period { margin-left: 6px; font-size: 12px; color: #9ca3af; }
.muted { color: #9ca3af; }
.dot { display: inline-block; width: 7px; height: 7px; border-radius: 50%; background: #10b981; margin-right: 4px; vertical-align: middle; }
.ok { color: #10b981; font-weight: 600; }
.inpool-note :deep(.ant-alert) { border-radius: 8px; }
:deep(.ant-table-thead > tr > th) { background: #f3f4f6; color: #6b7280; font-size: 12px; font-weight: 600; }
</style>
