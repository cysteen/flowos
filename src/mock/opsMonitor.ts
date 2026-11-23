// 运营监控大盘（租户级）· 实时大盘数据源。
//
// 口径与守恒式（与班组看板同一套，范围从「本组」提到「全中心」）：
//   班组当前在办 = 期初 + 创建 + 转入 - 转出 - 结案
//   全中心当前在办 = 期初 + 创建 - 结案（内部转组在中心口径中抵消）
// 「下送」是过程动作，只用于流量观察，不参与在办存量推导。
//
// 【自洽保证】班组是唯一的原子维度：每个班组给一份原子数，全中心＝各组求和，
// 任何筛选下卡面数字都由明细现算得出，物理上不可能与下钻对不上。
// 渠道 / 产线 / 工单类型三个下钻维度按组内权重分配，并做尾差修正保证合计相等。

import { TICKETS } from './tickets';
import { BUSINESS_TYPES } from '@/views/tickets/types/createTicket';
import { isTicketClosed, type Ticket, type TicketType } from '@/views/tickets/types/ticket';

/** 大盘基准时刻（与工单 Mock 时间轴对齐） */
export const OPS_NOW = '2026-08-04 14:20';

export type SoonWindow = '1h' | '2h' | '4h' | '8h' | '24h';
export type OverdueBucket = 'le24' | 'le72' | 'gt72';

export type OpsGroupLine = '受理线' | '技术支持' | '专项支持' | '教育服务';

export interface OpsGroupRaw {
  id: string;
  name: string;
  /** 组织线，用于监控范围分组筛选 */
  line: OpsGroupLine;
  /** 期初积压（昨日结存） */
  opening: number;
  /** 今日新增（班组口径 = 创建 + 转入；保留给既有页面使用） */
  inbound: number;
  /** 今日创建；全中心新增只汇总此字段，避免内部转组重复 */
  created: number;
  /** 今日转入 */
  transferIn: number;
  /** 今日转出 */
  transferOut: number;
  /** 今日结案 */
  closed: number;
  /** 今日下送：过程动作，不参与存量推导 */
  forward: number;
  /** 在岗人数 */
  headcount: number;
  /** 可承接工单总容量（人 × 单人容量） */
  capacity: number;
  /** 已达容量上限的人数 */
  atCapacity: number;
  /** 仍可接单人数 */
  available: number;
  /** 距超时（累进：≤1h ⊂ ≤2h ⊂ …） */
  soon: Record<SoonWindow, number>;
  /** 已超时分桶 */
  overdue: Record<OverdueBucket, number>;
  /** 渠道 / 产线 / 工单类型的组内占比权重（和为 1） */
  channelMix: Record<string, number>;
  productMix: Record<string, number>;
  /** 统计口径为既有四类；刷机单（930）未纳入本份运营统计样本 */
  typeMix: Record<TicketType, number>;
}

const CORE_OPS_GROUPS: OpsGroupRaw[] = [
  {
    id: 'cs-1', name: '受理一组', line: '受理线',
    opening: 52, inbound: 402, created: 354, transferIn: 48, transferOut: 48, closed: 328, forward: 376,
    headcount: 12, capacity: 96, atCapacity: 3, available: 3,
    soon: { '1h': 5, '2h': 13, '4h': 25, '8h': 42, '24h': 79 },
    overdue: { le24: 6, le72: 3, gt72: 1 },
    channelMix: { 在线客服: 0.44, 电话: 0.31, 小程序: 0.13, APP: 0.08, 邮件: 0.04 },
    productMix: { 消费者BG: 0.56, 教育BG: 0.24, 开放平台: 0.12, 智慧医疗: 0.08 },
    typeMix: { 咨询: 0.57, 投诉: 0.26, 建议: 0.11, 商机: 0.06 },
  },
  {
    id: 'cs-2', name: '受理二组', line: '受理线',
    opening: 48, inbound: 341, created: 300, transferIn: 41, transferOut: 41, closed: 277, forward: 318,
    headcount: 10, capacity: 80, atCapacity: 3, available: 2,
    soon: { '1h': 4, '2h': 11, '4h': 21, '8h': 35, '24h': 68 },
    overdue: { le24: 5, le72: 2, gt72: 1 },
    channelMix: { 在线客服: 0.40, 电话: 0.34, 小程序: 0.14, APP: 0.08, 邮件: 0.04 },
    productMix: { 消费者BG: 0.52, 教育BG: 0.27, 开放平台: 0.13, 智慧医疗: 0.08 },
    typeMix: { 咨询: 0.54, 投诉: 0.28, 建议: 0.12, 商机: 0.06 },
  },
  {
    id: 'tech', name: '技术支持组', line: '技术支持',
    opening: 44, inbound: 296, created: 260, transferIn: 36, transferOut: 36, closed: 238, forward: 274,
    headcount: 9, capacity: 72, atCapacity: 3, available: 2,
    soon: { '1h': 4, '2h': 9, '4h': 18, '8h': 31, '24h': 61 },
    overdue: { le24: 5, le72: 3, gt72: 1 },
    channelMix: { 在线客服: 0.38, 电话: 0.30, 小程序: 0.12, APP: 0.11, 邮件: 0.09 },
    productMix: { 消费者BG: 0.42, 教育BG: 0.22, 开放平台: 0.28, 智慧医疗: 0.08 },
    typeMix: { 咨询: 0.52, 投诉: 0.27, 建议: 0.13, 商机: 0.08 },
  },
  {
    id: 'hardware', name: '硬件缺陷组', line: '专项支持',
    opening: 41, inbound: 254, created: 223, transferIn: 31, transferOut: 31, closed: 210, forward: 241,
    headcount: 7, capacity: 56, atCapacity: 1, available: 1,
    soon: { '1h': 3, '2h': 8, '4h': 15, '8h': 26, '24h': 48 },
    overdue: { le24: 4, le72: 2, gt72: 1 },
    channelMix: { 在线客服: 0.34, 电话: 0.39, 小程序: 0.12, APP: 0.10, 邮件: 0.05 },
    productMix: { 消费者BG: 0.71, 教育BG: 0.15, 开放平台: 0.06, 智慧医疗: 0.08 },
    typeMix: { 咨询: 0.48, 投诉: 0.36, 建议: 0.11, 商机: 0.05 },
  },
  {
    id: 'edu', name: '教育支持组', line: '教育服务',
    opening: 32, inbound: 189, created: 166, transferIn: 23, transferOut: 23, closed: 159, forward: 182,
    headcount: 4, capacity: 32, atCapacity: 1, available: 1,
    soon: { '1h': 2, '2h': 5, '4h': 10, '8h': 18, '24h': 31 },
    overdue: { le24: 3, le72: 1, gt72: 0 },
    channelMix: { 在线客服: 0.42, 电话: 0.24, 小程序: 0.18, APP: 0.06, 邮件: 0.10 },
    productMix: { 消费者BG: 0.06, 教育BG: 0.82, 开放平台: 0.08, 智慧医疗: 0.04 },
    typeMix: { 咨询: 0.61, 投诉: 0.22, 建议: 0.12, 商机: 0.05 },
  },
];

function scaleRecord<T extends string>(rec: Record<T, number>, factor: number): Record<T, number> {
  const out = {} as Record<T, number>;
  for (const k of Object.keys(rec) as T[]) {
    out[k] = Math.max(0, Math.round(rec[k] * factor));
  }
  return out;
}

/** 由核心组模板缩放生成扩展班组（原型用，保证全中心加总自洽） */
function scaleGroup(
  tpl: OpsGroupRaw,
  name: string,
  id: string,
  line: OpsGroupLine,
  factor: number,
): OpsGroupRaw {
  const r = (n: number) => Math.max(1, Math.round(n * factor));
  const headcount = Math.max(2, Math.round(tpl.headcount * Math.sqrt(factor) * 2.2));
  const capacity = Math.max(8, headcount * 8);
  const atCapacity = Math.min(headcount - 1, Math.max(0, Math.round(tpl.atCapacity * factor)));

  const opening = r(tpl.opening);
  const inbound = r(tpl.inbound);
  const forward = r(tpl.forward);
  const transferIn = Math.min(inbound, r(tpl.transferIn));
  const created = Math.max(0, inbound - transferIn);
  const transferOut = Math.min(forward, r(tpl.transferOut));
  const closed = Math.max(0, forward - transferOut);
  const backlog = opening + created + transferIn - transferOut - closed;

  return {
    id,
    name,
    line,
    opening,
    inbound,
    created,
    transferIn,
    transferOut,
    closed,
    forward,
    headcount,
    capacity,
    atCapacity,
    available: Math.max(0, headcount - atCapacity),
    soon: scaleRecord(tpl.soon, factor),
    overdue: scaleRecord(tpl.overdue, factor),
    channelMix: { ...tpl.channelMix },
    productMix: { ...tpl.productMix },
    typeMix: { ...tpl.typeMix },
  };
}

function buildAllOpsGroups(): OpsGroupRaw[] {
  const groups: OpsGroupRaw[] = [...CORE_OPS_GROUPS];
  const csTpl = CORE_OPS_GROUPS[0]!;
  const techTpl = CORE_OPS_GROUPS[2]!;
  const hwTpl = CORE_OPS_GROUPS[3]!;
  const eduTpl = CORE_OPS_GROUPS[4]!;

  for (let i = 3; i <= 22; i++) {
    groups.push(scaleGroup(csTpl, `受理${i}组`, `cs-${i}`, '受理线', 0.12 + ((i - 3) % 6) * 0.04));
  }
  for (let i = 2; i <= 13; i++) {
    groups.push(scaleGroup(techTpl, `技术支持${i}组`, `tech-${i}`, '技术支持', 0.1 + ((i - 2) % 5) * 0.035));
  }
  for (let i = 2; i <= 11; i++) {
    groups.push(scaleGroup(hwTpl, `硬件缺陷${i}组`, `hw-${i}`, '专项支持', 0.08 + ((i - 2) % 4) * 0.03));
  }
  for (let i = 2; i <= 12; i++) {
    groups.push(scaleGroup(eduTpl, `教育支持${i}组`, `edu-${i}`, '教育服务', 0.09 + ((i - 2) % 5) * 0.035));
  }
  return groups;
}

export const OPS_GROUPS = buildAllOpsGroups();

const OPS_GROUP_LINES: OpsGroupLine[] = ['受理线', '技术支持', '专项支持', '教育服务'];

export interface OpsScopeSelectOption {
  value: string;
  label: string;
}

export interface OpsScopeSelectGroup {
  label: string;
  options: OpsScopeSelectOption[];
}

/** 监控范围下拉：按组织线分组的班组列表（多选；空选 = 全中心） */
export function getOpsScopeSelectGroups(): OpsScopeSelectGroup[] {
  return OPS_GROUP_LINES.map((line) => ({
    label: line,
    options: OPS_GROUPS.filter((g) => g.line === line).map((g) => ({ value: g.id, label: g.name })),
  }));
}

/** 监控范围：'all' | 单组 id | 多组 id[]；空数组同全中心 */
export type OpsScope = string | string[];

export function isAllScope(scope: OpsScope): boolean {
  if (typeof scope === 'string') return scope === 'all';
  return scope.length === 0 || scope.includes('all');
}

export function normalizeScopeIds(scope: OpsScope): string[] {
  if (typeof scope === 'string') {
    if (scope === 'all') return [];
    return [scope];
  }
  if (scope.includes('all') || scope.length === 0) return [];
  return [...new Set(scope)];
}

export function resolveScopeGroups(scope: OpsScope): OpsGroupRaw[] {
  const ids = normalizeScopeIds(scope);
  if (ids.length === 0) return OPS_GROUPS;
  return OPS_GROUPS.filter((g) => ids.includes(g.id));
}

export function scopeLabelOf(scope: OpsScope): string {
  const ids = normalizeScopeIds(scope);
  if (ids.length === 0) return '全中心';
  const names = ids
    .map((id) => OPS_GROUPS.find((g) => g.id === id)?.name)
    .filter((n): n is string => !!n);
  if (names.length === 1) return names[0];
  if (names.length <= 2) return names.join('、');
  return `已选 ${names.length} 组`;
}

export function matchesScope(ticketGroupId: string, scope: OpsScope): boolean {
  const ids = normalizeScopeIds(scope);
  if (ids.length === 0) return true;
  return ids.includes(ticketGroupId);
}

export const SOON_WINDOWS: { key: SoonWindow; label: string }[] = [
  { key: '1h', label: '≤1 小时' },
  { key: '2h', label: '≤2 小时' },
  { key: '4h', label: '≤4 小时' },
  { key: '8h', label: '≤8 小时' },
  { key: '24h', label: '≤24 小时' },
];

export const OVERDUE_BUCKETS: { key: OverdueBucket; label: string; danger?: boolean }[] = [
  { key: 'le24', label: '超时 ≤24h' },
  { key: 'le72', label: '超时 24–72h' },
  { key: 'gt72', label: '超时 >72h', danger: true },
];

/**
 * 积压告警阈值：全中心与单组各一档（阈值属租户配置，监控岗只读）。
 *
 * ⚠️ 2026-08-05 口径统一后重新标定：告警对象从「在办存量」（全中心 755）
 * 改为「积压 ＝ 超时未处理完」（全中心 87），量级差一个数量级，
 * 原来的 300 / 80 永远不会触发。当前值为默认值，待业务确认（PRD §12.2 Q3）。
 */
export const BACKLOG_THRESHOLD = { all: 60, group: 15 };

/** 阈值告警的防抖 / 静默参数（配置化模型的默认值） */
export const ALERT_POLICY = { debounceMinutes: 10, silenceMinutes: 30 };

// ---- 派生计算 ----

export interface DrillRow {
  label: string;
  value: number;
  /** 占比（0–1） */
  ratio: number;
}

/**
 * ⚠️ 术语（2026-08-05 业务定，两页统一）：
 * · **在办存量** `backlog` ＝ 未结、SLA 未停表的全部工单（不论超没超时）。
 *   班组按 `期初 + 创建 + 转入 - 转出 - 结案` 计算；下送不参与存量计算。
 * · **积压** `overdueTotal` ＝ **已超解决时效、仍未处理完**的工单（三个超时桶合计）。
 *   与《【915】班组长看板》的「班组积压」**同口径同名**，告警盯的是它。
 * 两者不可互校，也不可互相替代 —— 曾经本页把 backlog 叫「存量积压」，
 * 与班组长看板的同名指标差一个数量级（755 vs 87）。
 */
export interface OpsSnapshot {
  scopeLabel: string;
  opening: number;
  inbound: number;
  forward: number;
  /** 今日结案；全中心按真实终态去重汇总 */
  closed: number;
  /** 今日转入/转出；全中心口径中仅用于说明，不计入新增 */
  transferIn: number;
  transferOut: number;
  /** 在办存量：未结且 SLA 未停表的全部工单。**不是「积压」** */
  backlog: number;
  /**
   * 进出比 = 新增 / 下送。>1 积压在涨，<1 在消化。
   * 比"新增 1482、下送 1391"两个孤立数字更有解释力。
   */
  ioRatio: number;
  /** 最久等待（已超时最长的单） */
  longestWaitText: string;
  /** 近 15 小时走势（积压 / 进线 / 下送），末点即当前 */
  trend: { t: string; inbound: number; forward: number; closed: number; backlog: number }[];
  soon: Record<SoonWindow, number>;
  overdue: Record<OverdueBucket, number>;
  overdueTotal: number;
  headcount: number;
  capacity: number;
  atCapacity: number;
  available: number;
  /** 人均在办 = 积压 / 在岗 */
  perHead: number;
  /** 容量利用率 = 积压 / 容量 */
  utilization: number;
  threshold: number;
  /** 积压是否超阈值 */
  alerting: boolean;
  inboundByChannel: DrillRow[];
  inboundByProduct: DrillRow[];
  inboundByBusiness: DrillRow[];
  inboundByType: DrillRow[];
  forwardByGroup: DrillRow[];
  backlogByGroup: DrillRow[];
}

export type GroupVerdict = '人力不足' | '时效恶化' | '积压偏高' | '正常';

export interface GroupLoadRow {
  id: string;
  name: string;
  headcount: number;
  backlog: number;
  capacity: number;
  utilization: number;
  available: number;
  atCapacity: number;
  /** 该组超时单数（合并时效维度，避免把同一个组的故事拆到两张表） */
  overdue: number;
  /** 其中 >72h */
  overdueSevere: number;
  /** 距超时 ≤2h */
  soon2h: number;
  /** 一行读完这个组是什么状况 —— 替用户下结论，而不是给一堆数让他自己算 */
  verdict: GroupVerdict;
  /** 结论依据，鼠标悬停可见 */
  verdictWhy: string;
}

/**
 * 组诊断：由数据推导，不写死。
 * 顺序即优先级——人力不足最需要立刻调配，其次是时效已经恶化，再次是积压偏高。
 */
function verdictOf(u: number, overdueSevere: number, overdue: number, backlog: number, available: number): { verdict: GroupVerdict; why: string } {
  if (u >= 1 || available === 0) {
    return { verdict: '人力不足', why: `容量利用率 ${Math.round(u * 100)}%，可接单 ${available} 人 —— 新单无人可派` };
  }
  if (overdueSevere > 0) {
    return { verdict: '时效恶化', why: `有 ${overdueSevere} 单已超时 72 小时以上，需专人跟进` };
  }
  if (backlog > 0 && overdue / backlog > 0.12) {
    return { verdict: '积压偏高', why: `超时 ${overdue} 单占积压 ${Math.round((overdue / backlog) * 100)}%，高于 12% 健康线` };
  }
  return { verdict: '正常', why: `容量利用率 ${Math.round(u * 100)}%，超时占比 ${backlog ? Math.round((overdue / backlog) * 100) : 0}%` };
}

function backlogOf(g: OpsGroupRaw): number {
  return g.opening + g.created + g.transferIn - g.transferOut - g.closed;
}

/**
 * 今日逐小时进出量模板（00:00–14:00）—— 只提供**形状**（早高峰 10:00、午间回落）。
 *
 * ⚠️ 这里的绝对值不是真值，也不必是：曲线的总量一律按目标总量重标定
 * （见 scaleSeries）。班组从 5 组扩到 45 组时，本表没跟着改，导致
 * 曲线 Σ进线 1482 与卡面「新增 3696」并排显示 —— 「高峰 10:00（244）」
 * 和「新增 3,696」放在一屏里当场露馅。重标定之后本表可以只维护形状。
 */
const HOURLY_ALL: { t: string; inbound: number; forward: number }[] = [
  { t: '00:00', inbound: 12, forward: 3 },
  { t: '01:00', inbound: 9, forward: 2 },
  { t: '02:00', inbound: 7, forward: 1 },
  { t: '03:00', inbound: 6, forward: 1 },
  { t: '04:00', inbound: 8, forward: 2 },
  { t: '05:00', inbound: 15, forward: 6 },
  { t: '06:00', inbound: 34, forward: 22 },
  { t: '07:00', inbound: 68, forward: 61 },
  { t: '08:00', inbound: 118, forward: 112 },
  { t: '09:00', inbound: 226, forward: 198 },
  { t: '10:00', inbound: 244, forward: 236 },
  { t: '11:00', inbound: 218, forward: 226 },
  { t: '12:00', inbound: 132, forward: 118 },
  { t: '13:00', inbound: 198, forward: 208 },
  { t: '14:00', inbound: 187, forward: 195 },
  { t: '15:00', inbound: 176, forward: 188 },
  { t: '16:00', inbound: 168, forward: 181 },
  { t: '17:00', inbound: 156, forward: 172 },
  { t: '18:00', inbound: 141, forward: 158 },
  { t: '19:00', inbound: 112, forward: 132 },
  { t: '20:00', inbound: 86, forward: 104 },
  { t: '21:00', inbound: 61, forward: 78 },
  { t: '22:00', inbound: 39, forward: 52 },
  { t: '23:00', inbound: 22, forward: 31 },
];

function hourlyShapeToNow(): typeof HOURLY_ALL {
  return HOURLY_ALL.slice(0, Math.min(HOURLY_ALL.length, new Date().getHours() + 1));
}

/**
 * 把一列原始值按**目标总量**重标定，并把取整尾差补到最大的一点上，
 * 保证 Σ结果 === target。原始值只决定形状，不决定量级。
 */
function scaleSeries(values: number[], target: number): number[] {
  const sum = values.reduce((s, v) => s + v, 0);
  if (!sum || target <= 0) return values.map(() => 0);
  const out = values.map((v) => Math.round((v / sum) * target));
  const diff = target - out.reduce((s, v) => s + v, 0);
  if (diff !== 0) {
    const maxIdx = out.reduce((mi, v, i, arr) => (v > arr[mi] ? i : mi), 0);
    out[maxIdx] += diff;
  }
  return out;
}

/**
 * 某范围的逐小时走势。
 *
 * 三条硬约束（PRD §7.5 / §10 规则 8）：
 *   Σ进线 === 卡面「新增工单」· Σ下送 === 卡面「下送工单」· 末点积压 === 卡面「存量积压」
 * 曲线与卡片必须是同一份数，不能各算各的。
 */
function trendFor(groups: OpsGroupRaw[]): OpsSnapshot['trend'] {
  const centerScope = groups.length === OPS_GROUPS.length;
  const inbound = groups.reduce((s, g) => s + (centerScope ? g.created : g.created + g.transferIn), 0);
  const forward = groups.reduce((s, g) => s + g.forward, 0);
  const closed = groups.reduce((s, g) => s + g.closed, 0);
  const opening = groups.reduce((s, g) => s + g.opening, 0);
  const stockIn = groups.reduce((s, g) => s + g.created + (centerScope ? 0 : g.transferIn), 0);
  const stockOut = groups.reduce((s, g) => s + g.closed + (centerScope ? 0 : g.transferOut), 0);

  const shape = hourlyShapeToNow();
  const inSeries = scaleSeries(shape.map((h) => h.inbound), inbound);
  const outSeries = scaleSeries(shape.map((h) => h.forward), forward);
  const closedSeries = scaleSeries(shape.map((h) => Math.max(1, Math.round(h.forward * 0.87))), closed);
  const stockInSeries = scaleSeries(shape.map((h) => h.inbound), stockIn);
  const stockOutSeries = scaleSeries(shape.map((h) => h.forward), stockOut);

  let acc = opening;
  const rows = shape.map((h, i) => {
    acc = acc + stockInSeries[i] - stockOutSeries[i];
    return { t: h.t, inbound: inSeries[i], forward: outSeries[i], closed: closedSeries[i], backlog: acc };
  });
  // 展示线仍是新增/下送；存量线独立按创建、转组和结案事件递推。
  const last = rows[rows.length - 1];
  if (last) last.backlog = groups.reduce((sum, g) => sum + backlogOf(g), 0);
  return rows;
}

/** 已超时最久的单（用于"最久等待"）——直接取风险清单里的最大值，与清单同源 */
function longestWait(scope: OpsScope): string {
  const rows = OPS_RISK_TICKETS.filter(
    (t) => t.overdueText && matchesScope(t.groupId, scope),
  );
  if (!rows.length) return '—';
  const hours = (s: string) => Number(/已超 (\d+)/.exec(s)?.[1] ?? 0);
  const worst = rows.reduce((a, b) => (hours(b.overdueText!) > hours(a.overdueText!) ? b : a));
  return `${hours(worst.overdueText!)}h`;
}

/**
 * 按权重把总量拆成明细，并把尾差补到最大的一项上——
 * 保证 Σ明细 === 总量，界面上「下钻合计 = 卡面数字」永远成立。
 */
function splitByMix(total: number, mix: Record<string, number>): DrillRow[] {
  const keys = Object.keys(mix);
  const raw = keys.map((k) => ({ label: k, value: Math.round(total * mix[k]) }));
  const diff = total - raw.reduce((s, r) => s + r.value, 0);
  if (diff !== 0 && raw.length) {
    const maxIdx = raw.reduce((mi, r, i, arr) => (r.value > arr[mi].value ? i : mi), 0);
    raw[maxIdx].value += diff;
  }
  return raw
    .map((r) => ({ ...r, ratio: total > 0 ? r.value / total : 0 }))
    .sort((a, b) => b.value - a.value);
}

/** 多组合并权重：按各组 inbound 加权 */
function mergeMix(groups: OpsGroupRaw[], pick: (g: OpsGroupRaw) => Record<string, number>): Record<string, number> {
  const totalInbound = groups.reduce((s, g) => s + g.inbound, 0);
  const out: Record<string, number> = {};
  groups.forEach((g) => {
    const mix = pick(g);
    Object.keys(mix).forEach((k) => {
      out[k] = (out[k] ?? 0) + (mix[k] * g.inbound) / (totalInbound || 1);
    });
  });
  return out;
}

/** scope = 'all' | 单组 id | 多组 id[] */
export function getOpsSnapshot(scope: OpsScope): OpsSnapshot {
  const groups = resolveScopeGroups(scope);
  const scopeIds = normalizeScopeIds(scope);
  const centerScope = isAllScope(scope);
  const sum = (pick: (g: OpsGroupRaw) => number) => groups.reduce((s, g) => s + pick(g), 0);

  const opening = sum((g) => g.opening);
  // 全中心新增只统计创建事件；班组新增包含转入。
  const inbound = sum((g) => g.created + (centerScope ? 0 : g.transferIn));
  const forward = sum((g) => g.forward);
  const closed = sum((g) => g.closed);
  const transferIn = sum((g) => g.transferIn);
  const transferOut = sum((g) => g.transferOut);
  const backlog = sum((g) => backlogOf(g));
  const headcount = sum((g) => g.headcount);
  const capacity = sum((g) => g.capacity);
  const overdue = {
    le24: sum((g) => g.overdue.le24),
    le72: sum((g) => g.overdue.le72),
    gt72: sum((g) => g.overdue.gt72),
  };
  const threshold = scopeIds.length === 1 ? BACKLOG_THRESHOLD.group : BACKLOG_THRESHOLD.all;

  return {
    scopeLabel: scopeLabelOf(scope),
    opening,
    inbound,
    forward,
    closed,
    transferIn,
    transferOut,
    backlog,
    ioRatio: forward ? Math.round((inbound / forward) * 100) / 100 : 0,
    longestWaitText: longestWait(scope),
    trend: trendFor(groups),
    soon: {
      '1h': sum((g) => g.soon['1h']),
      '2h': sum((g) => g.soon['2h']),
      '4h': sum((g) => g.soon['4h']),
      '8h': sum((g) => g.soon['8h']),
      '24h': sum((g) => g.soon['24h']),
    },
    overdue,
    overdueTotal: overdue.le24 + overdue.le72 + overdue.gt72,
    headcount,
    capacity,
    atCapacity: sum((g) => g.atCapacity),
    available: sum((g) => g.available),
    perHead: headcount ? Math.round((backlog / headcount) * 10) / 10 : 0,
    utilization: capacity ? backlog / capacity : 0,
    threshold,
    // 告警盯的是「积压」（超时未处理完），不是在办存量 —— 在办量大不等于出了问题，
    // 超时清不掉才是。2026-08-05 两页口径统一后改。
    alerting: overdue.le24 + overdue.le72 + overdue.gt72 > threshold,
    inboundByChannel: splitByMix(inbound, mergeMix(groups, (g) => g.channelMix)),
    inboundByProduct: splitByMix(inbound, mergeMix(groups, (g) => g.productMix)),
    // 原型分布沿用演示工单的业务类型占比，按当前指标总量缩放；选项与建单共用。
    inboundByBusiness: splitByMix(inbound, Object.fromEntries(BUSINESS_TYPES.map((label) => [label, TICKETS.filter((ticket) => ticket.businessType === label).length / (TICKETS.filter((ticket) => BUSINESS_TYPES.some((type) => type === ticket.businessType)).length || 1)]))),
    inboundByType: splitByMix(inbound, mergeMix(groups, (g) => g.typeMix as Record<string, number>)),
    forwardByGroup: groups
      .map((g) => ({ label: g.name, value: g.forward, ratio: forward ? g.forward / forward : 0 }))
      .sort((a, b) => b.value - a.value),
    backlogByGroup: groups
      .map((g) => ({ label: g.name, value: backlogOf(g), ratio: backlog ? backlogOf(g) / backlog : 0 }))
      .sort((a, b) => b.value - a.value),
  };
}

const VERDICT_RANK: Record<GroupVerdict, number> = {
  人力不足: 0, 时效恶化: 1, 积压偏高: 2, 正常: 3,
};

/** 时效分层热力矩阵：班组 × 分桶 */
export interface SlaMatrixRow {
  id: string;
  name: string;
  soon: Record<SoonWindow, number>;
  overdue: Record<OverdueBucket, number>;
}

export function getSlaMatrix(scope: OpsScope): SlaMatrixRow[] {
  const groups = resolveScopeGroups(scope);
  return groups.map((g) => ({
    id: g.id,
    name: g.name,
    soon: { ...g.soon },
    overdue: { ...g.overdue },
  }));
}

/** 按"最该管的排最前"排序：先看诊断结论，同结论再看容量利用率 */
export function getGroupLoads(scope: OpsScope): GroupLoadRow[] {
  const groups = resolveScopeGroups(scope);
  return groups
    .map((g) => {
      const backlog = backlogOf(g);
      const utilization = g.capacity ? backlog / g.capacity : 0;
      const overdue = g.overdue.le24 + g.overdue.le72 + g.overdue.gt72;
      const { verdict, why } = verdictOf(utilization, g.overdue.gt72, overdue, backlog, g.available);
      return {
        id: g.id,
        name: g.name,
        headcount: g.headcount,
        backlog,
        capacity: g.capacity,
        utilization,
        available: g.available,
        atCapacity: g.atCapacity,
        overdue,
        overdueSevere: g.overdue.gt72,
        soon2h: g.soon['2h'],
        verdict,
        verdictWhy: why,
      };
    })
    .sort((a, b) => VERDICT_RANK[a.verdict] - VERDICT_RANK[b.verdict] || b.utilization - a.utilization);
}

// ---- 全部班组总览 ----

export type OpsGroupSeverity = 'critical' | 'warning' | 'normal';

export interface OpsGroupPanoramaRow {
  id: string;
  name: string;
  line: OpsGroupLine;
  /** 今日新增：本组创建 + 从其他组转入 */
  inbound: number;
  forward: number;
  closed: number;
  current: number;
  soon: number;
  overdue: number;
  severity: OpsGroupSeverity;
  severityLabel: string;
}

export interface OpsGroupFlowPoint {
  t: string;
  inbound: number;
  forward: number;
  closed: number;
}

export type OpsGroupSlaBucket = 'soon' | 'le24' | 'le72' | 'gt72' | 'normal';

export interface OpsGroupTicketRow {
  groupId: string;
  bucket: OpsGroupSlaBucket;
  no: string;
  title: string;
  priority: string;
  assignee: string;
  sla: string;
  status: string;
}

function groupSeverity(g: OpsGroupRaw): Pick<OpsGroupPanoramaRow, 'severity' | 'severityLabel'> {
  const overdue = g.overdue.le24 + g.overdue.le72 + g.overdue.gt72;
  if (g.overdue.gt72 > 0 || overdue >= BACKLOG_THRESHOLD.group) {
    return { severity: 'critical', severityLabel: '超时告警' };
  }
  if (overdue >= 2 || g.soon['2h'] >= 3) {
    return { severity: 'warning', severityLabel: '临期关注' };
  }
  return { severity: 'normal', severityLabel: '运行平稳' };
}

/**
 * 一次返回全部有效班组。排序只改变扫描顺序，不过滤班组：红色异常优先，其次橙色关注，
 * 正常班组最后；同级按超时、临期、在办量降序。
 */
export function getOpsGroupPanorama(): OpsGroupPanoramaRow[] {
  const rank: Record<OpsGroupSeverity, number> = { critical: 0, warning: 1, normal: 2 };
  return OPS_GROUPS.map((g) => {
    const severity = groupSeverity(g);
    return {
      id: g.id,
      name: g.name,
      line: g.line,
      inbound: g.created + g.transferIn,
      forward: g.forward,
      closed: g.closed,
      current: backlogOf(g),
      soon: g.soon['2h'],
      overdue: g.overdue.le24 + g.overdue.le72 + g.overdue.gt72,
      ...severity,
    };
  }).sort((a, b) => {
    const severityOrder = rank[a.severity] - rank[b.severity];
    if (severityOrder !== 0) return severityOrder;
    if (a.severity === 'normal') return a.name.localeCompare(b.name, 'zh-CN');
    return b.overdue - a.overdue
      || b.soon - a.soon
      || b.current - a.current
      || a.name.localeCompare(b.name, 'zh-CN');
  });
}

/** 抽屉中的三条流量趋势；三条线分别锚定本组今日新增、下送、结案总量。 */
export function getOpsGroupFlowTrend(groupId: string): OpsGroupFlowPoint[] {
  const g = OPS_GROUPS.find((item) => item.id === groupId);
  if (!g) return [];
  const shape = hourlyShapeToNow();
  const inbound = scaleSeries(shape.map((p) => p.inbound), g.created + g.transferIn);
  const forward = scaleSeries(shape.map((p) => p.forward), g.forward);
  const closed = scaleSeries(shape.map((p) => Math.max(1, Math.round((p.forward * 9) / 10))), g.closed);
  return shape.map((p, i) => ({ t: p.t, inbound: inbound[i], forward: forward[i], closed: closed[i] }));
}

/** 班组 SLA 演示明细：按本组快照生成，分层数量与统计一致；编号不映射真实工单。 */
export function getOpsGroupTickets(groupId: string): OpsGroupTicketRow[] {
  const group = OPS_GROUPS.find((g) => g.id === groupId);
  if (!group) return [];
  const buckets: { key: OpsGroupSlaBucket; count: number }[] = [
    { key: 'soon', count: group.soon['2h'] },
    { key: 'le24', count: group.overdue.le24 },
    { key: 'le72', count: group.overdue.le72 },
    { key: 'gt72', count: group.overdue.gt72 },
  ];
  buckets.push({ key: 'normal', count: Math.max(0, backlogOf(group) - buckets.reduce((sum, b) => sum + b.count, 0)) });
  return buckets.flatMap(({ key, count }) => Array.from({ length: count }, (_, index) => {
    const minutes = key === 'soon' ? 1 + index % 119 : key === 'le24' ? 1 + index % 23 : key === 'le72' ? 24 + index % 48 : 73 + index;
    return {
      groupId, bucket: key,
      no: `DEMO-${groupId}-${key}-${String(index + 1).padStart(3, '0')}`,
      title: `${group.name} · ${key === 'soon' ? '临期' : key === 'normal' ? '在办' : '超时'}工单 ${index + 1}`,
      priority: key === 'gt72' ? 'P1' : 'P2',
      assignee: '班组处理人',
      sla: key === 'soon' ? `剩余 ${minutes} 分钟` : key === 'normal' ? '剩余 4 小时' : `已超时 ${minutes} 小时`,
      status: '处理中',
    };
  }));
}

// ---- 待处置事项：整页的驱动源 ----

export type IssueLevel = 'critical' | 'warn';

export interface OpsIssue {
  id: string;
  level: IssueLevel;
  /** 一句话说清"出了什么事" */
  title: string;
  /** 影响面与依据 */
  detail: string;
  /** 该通知谁 */
  owner: string;
  /** 处置入口：查看对应清单 */
  action: 'overdue-severe' | 'soon' | 'group' | 'backlog' | 'riskword';
  /** 关联组（action=group 时） */
  groupId?: string;
}

/**
 * 由当前快照推导「此刻需要处置什么」——这是整页的灵魂：
 * 无事时页面应当是安静的，有事时异常自己跳到最上面，并直接带处置入口。
 * 规则写在这里，数据一变结论就变，不硬编码任何一条。
 */
export function deriveIssues(scope: OpsScope, untaggedHighRiskCount = 0, topRiskWord = ''): OpsIssue[] {
  const snap = getOpsSnapshot(scope);
  const loads = getGroupLoads(scope);
  const issues: OpsIssue[] = [];

  // 风险词命中排在最前：舆情类风险的处置窗口最短，且已经有具体的单可处置
  if (untaggedHighRiskCount > 0) {
    issues.push({
      id: 'riskword',
      level: 'critical',
      title: `${untaggedHighRiskCount} 单命中高危风险词，尚未标记`,
      detail: topRiskWord
        ? `最新命中「${topRiskWord}」；命中即已按词表推送责任人，需核实后标记并跟进`
        : '命中即已按词表推送责任人，需核实后标记并跟进',
      owner: '李文萍、值班经理',
      action: 'riskword',
    });
  }

  if (snap.alerting) {
    const top = loads.slice(0, 2).map((g) => `${g.name} ${g.overdue}`).join('、');
    issues.push({
      id: 'backlog',
      level: 'critical',
      title: `${snap.scopeLabel}积压 ${snap.overdueTotal} 超阈值 ${snap.threshold}`,
      detail: `超出 ${snap.overdueTotal - snap.threshold} 单，已持续 ${ALERT_POLICY.debounceMinutes + 8} 分钟；积压最多：${top}`,
      owner: '值班经理、各组组长',
      action: 'backlog',
    });
  }

  if (snap.overdue.gt72 > 0) {
    issues.push({
      id: 'gt72',
      level: 'critical',
      title: `${snap.overdue.gt72} 单超时已超过 72 小时`,
      detail: `最久一单已等待 ${snap.longestWaitText}，客户二次投诉与外投风险高`,
      owner: '对应班组组长',
      action: 'overdue-severe',
    });
  }

  loads
    .filter((g) => g.verdict === '人力不足')
    .forEach((g) => {
      issues.push({
        id: `hr-${g.id}`,
        level: 'critical',
        title: `${g.name}人力不足，新单无人可派`,
        detail: `${g.verdictWhy}；在办 ${g.backlog} / 容量 ${g.capacity}`,
        owner: `${g.name}组长`,
        action: 'group',
        groupId: g.id,
      });
    });

  if (snap.soon['2h'] > 0 && snap.available < snap.soon['2h'] / 4) {
    issues.push({
      id: 'soon',
      level: 'warn',
      title: `${snap.soon['2h']} 单将在 2 小时内超时`,
      detail: `当前仅 ${snap.available} 人可接单，按现有人力恐难在时限内清完`,
      owner: '各组组长',
      action: 'soon',
    });
  }

  // 逐组的时效恶化只在**单组视图**下报。
  // 全中心视图里，它与上面那条「N 单超时 >72h」讲的是同一件事，
  // 逐组重复一遍会把真正紧急的项淹掉——要定位到组，看下面的分组诊断表即可。
  if (!isAllScope(scope)) {
    loads
      .filter((g) => g.verdict === '时效恶化')
      .forEach((g) => {
        issues.push({
          id: `sla-${g.id}`,
          level: 'warn',
          title: `${g.name}时效恶化`,
          detail: g.verdictWhy,
          owner: `${g.name}组长`,
          action: 'group',
          groupId: g.id,
        });
      });
  }

  return issues;
}

// ---- 风险工单清单（时效分层下钻）----

export interface OpsRiskTicket {
  no: string;
  title: string;
  type: TicketType;
  priority: string;
  groupId: string;
  groupName: string;
  assignee: string;
  /** 已超时时长文本；距超时单为空 */
  overdueText?: string;
  /** 距超时剩余文本；已超时单为空 */
  remainText?: string;
  bucket?: OverdueBucket;
  /** 落在哪个距超时窗口（累进，取最小命中窗口） */
  window?: SoonWindow;
  customer: string;
}

/**
 * 清单**只声明哪些单**，其余一律回工单数据源（mock/tickets.ts）现算：
 * 标题 / 工单类型 / 优先级 / 处理人 / 客户来自工单本身，超时时长与距超时剩余取工单的
 * SLA 钟，分桶与距超时窗口由钟面反算。
 *
 * 早先这里手写了全套字段，其中 12 个单号在工单库里根本查不到 —— 点开只能静默打到
 * 默认演示单，一整列不同的单号打开的都是同一张单。改为派生后，配错单号在构建期就炸。
 *
 * 【只有班组仍手写，且必须手写】工单数据源没有「监控组织线」这一维：Ticket.groupId 是
 * 工单池分组，只有 line1 / line2 / hardware 三个值，覆盖不了本页的 45 个监控班组。
 * 故按**该单的业务归属**逐条指定，让「标题 · 班组」在一行里读得通
 * （Webhook 丢包归技术支持组、屏幕花屏归硬件缺陷组、学习机激活归教育支持组）。
 *
 * ⚠️ 已知不自洽：同一位处理人会出现在多个班组里。工单数据源只有四位处理人
 * （王坐席 / 陈坐席 / 林坐席 / 赵三线），撑不起 45 个班组的名册；真实系统里工单按业务
 * 路由到组、坐席只属于一个组，两者对不上是 mock 规模问题，不是本页口径问题。
 * 修它得先给工单数据源补齐分组与坐席名册，那会牵动整个工作台。
 */
function riskTicketOf(no: string): Ticket {
  const t = TICKETS.find((x) => x.no === no);
  // 配错单号就在构建期炸掉，不要留到监控岗点进去才发现打不中真单
  if (!t) throw new Error(`[opsMonitor] 风险清单引用了不存在的工单号：${no}`);
  if (isTicketClosed(t.nodeStatus)) {
    throw new Error(`[opsMonitor] ${no} 已是终态「${t.nodeStatus}」，不该出现在风险清单里`);
  }
  if (t.slaText === '—' || t.slaState === 'paused') {
    throw new Error(`[opsMonitor] ${no} 的 SLA 已停表（${t.slaSub}），既不超时也没有距超时可言`);
  }
  return t;
}

/** 「已超 96:12」→ 96 */
function overdueHoursOf(text: string): number {
  return Number(/已超\s*(\d+)/.exec(text)?.[1] ?? 0);
}

function bucketOf(hours: number): OverdueBucket {
  if (hours > 72) return 'gt72';
  if (hours > 24) return 'le72';
  return 'le24';
}

/** 距超时窗口取**最小命中**的那一档（窗口本身是累进的） */
function windowOf(minutes: number): SoonWindow {
  if (minutes <= 60) return '1h';
  if (minutes <= 120) return '2h';
  if (minutes <= 240) return '4h';
  if (minutes <= 480) return '8h';
  return '24h';
}

/** 清单里唯一手写的两项：单号 + 该单归哪个监控班组 */
interface RiskTicketSpec {
  no: string;
  groupId: string;
}

function toRiskTicket({ no, groupId }: RiskTicketSpec): OpsRiskTicket {
  const t = riskTicketOf(no);
  const group = OPS_GROUPS.find((g) => g.id === groupId);
  if (!group) throw new Error(`[opsMonitor] ${no} 指定的监控班组 ${groupId} 不存在`);

  const overdue = t.slaState === 'overdue';
  return {
    no: t.no,
    title: t.title,
    type: t.type,
    priority: t.priority,
    groupId: group.id,
    groupName: group.name,
    assignee: t.assignee ?? '待认领',
    overdueText: overdue ? t.slaText : undefined,
    bucket: overdue ? bucketOf(overdueHoursOf(t.slaText)) : undefined,
    remainText: overdue ? undefined : t.slaText,
    window: overdue ? undefined : windowOf(t.slaMinutes),
    customer: t.customer,
  };
}

/**
 * 风险清单的取单口径：**未结案、SLA 未停表**的单。
 * 分桶不写死，由各单自己的钟决定 —— 工单库改了时长，清单自动换桶。
 */
const RISK_TICKET_SPECS: RiskTicketSpec[] = [
  // ── 已超时 >72h：跨天积压，全在其他班组（本工作台的数据域里没有这种单）──
  { no: 'IFLYTS-20260731-00001', groupId: 'hardware' }, // 智能音箱返修超期未回寄
  { no: 'IFLYTS-20260730-00001', groupId: 'edu' },      // 学习机批量激活失败
  { no: 'IFLYZX-20260731-00002', groupId: 'tech' },     // 开放平台配额申请无人跟进
  // ── 已超时 24–72h ──
  { no: 'IFLYTS-20260802-00001', groupId: 'hardware' }, // 扫地机器人主刷电机异响
  { no: 'IFLYZX-20260802-00002', groupId: 'tech' },     // API 网关 502
  { no: 'IFLYZX-20260802-00003', groupId: 'cs-2' },     // 发票重开申请未处理
  // ── 已超时 ≤24h ──
  { no: 'IFLYZX-20260610-00004', groupId: 'cs-1' },     // 设备无法开机
  { no: 'IFLYTS-20260716-00002', groupId: 'cs-2' },     // 退款迟迟未到账
  { no: 'IFLYZX-20260610-00012', groupId: 'tech' },     // 扫地机器人充电故障（池内未认领）
  // ── 距超时 ≤1h ──
  { no: 'IFLYTS-20260610-00002', groupId: 'cs-1' },     // 无线音乐播放跳过歌曲
  { no: 'IFLYSJ-20260716-00001', groupId: 'tech' },     // Webhook 推送偶发丢失
  { no: 'IFLYTS-20260817-00004', groupId: 'edu' },      // 学习机批量固件升级失败
  { no: 'IFLYTS-20260610-00014', groupId: 'hardware' }, // 屏幕花屏需返厂检测
  // ── 距超时 ≤2h ──
  { no: 'IFLYTS-20260711-00002', groupId: 'hardware' }, // 外投·维修超期未解决
  { no: 'IFLYSJ-20260610-00006', groupId: 'tech' },     // API 调用返回 429 限流
  { no: 'IFLYTS-20260609-00005', groupId: 'cs-2' },     // 账号被异常登录
  { no: 'IFLYZX-20260610-00015', groupId: 'tech' },     // API 鉴权失败排查
  // ── 距超时 ≤4h ──
  { no: 'IFLYZX-20260713-00001', groupId: 'edu' },      // 翻译机离线翻译结果异常
  { no: 'IFLYZX-20260715-00003', groupId: 'hardware' }, // 空气净化器滤芯指示灯常亮
  { no: 'IFLYTS-20260804-00004', groupId: 'cs-2' },     // 跨组调剂·二组转入
  // ── 距超时 ≤8h ──
  { no: 'IFLYTS-20260610-00007', groupId: 'cs-1' },     // 收到商品与描述不符
  { no: 'IFLYJY-20260610-00008', groupId: 'cs-1' },     // 预约上门安装智能门锁
  { no: 'IFLYSJ-20260609-00004', groupId: 'tech' },     // 批量导入用户报错
  { no: 'IFLYZX-20260609-00006', groupId: 'cs-1' },     // 协助确认退款政策
  { no: 'IFLYTS-20260610-00013', groupId: 'cs-1' },     // 七天无理由退货咨询
  // ── 距超时 ≤24h ──
  { no: 'IFLYZX-20260609-00002', groupId: 'cs-2' },     // 已答复绑定流程，待审核
];

export const OPS_RISK_TICKETS: OpsRiskTicket[] = RISK_TICKET_SPECS.map(toRiskTicket);

const WINDOW_ORDER: SoonWindow[] = ['1h', '2h', '4h', '8h', '24h'];

/** 「已超 96:12」/「01:48:30」→ 秒，用于排序；取不到按 0 计 */
function durationSeconds(text?: string): number {
  if (!text) return 0;
  const parts = text.replace(/[^\d:]/g, '').split(':').map(Number);
  if (!parts.length || parts.some(Number.isNaN)) return 0;
  const [h = 0, m = 0, s = 0] = parts;
  return h * 3600 + m * 60 + s;
}

/**
 * 抽屉副标题写的是「按紧急度排序」，这里必须真排 —— 否则那句话是空头承诺。
 * 紧急度定义：已超时的排在前面、超得越久越靠前；距超时的排在后面、剩得越少越靠前。
 */
function sortByUrgency(rows: OpsRiskTicket[]): OpsRiskTicket[] {
  return [...rows].sort((a, b) => {
    const aOver = !!a.overdueText;
    const bOver = !!b.overdueText;
    if (aOver !== bOver) return aOver ? -1 : 1;
    if (aOver) return durationSeconds(b.overdueText) - durationSeconds(a.overdueText);
    return durationSeconds(a.remainText) - durationSeconds(b.remainText);
  });
}

/** 距超时窗口是累进的：选 ≤4h 时，≤1h / ≤2h 的单也在内 */
export function riskTicketsBySoon(scope: OpsScope, win: SoonWindow): OpsRiskTicket[] {
  const limit = WINDOW_ORDER.indexOf(win);
  return sortByUrgency(
    OPS_RISK_TICKETS.filter(
      (t) => t.window && WINDOW_ORDER.indexOf(t.window) <= limit && matchesScope(t.groupId, scope),
    ),
  );
}

export function riskTicketsByBucket(scope: OpsScope, bucket: OverdueBucket): OpsRiskTicket[] {
  return sortByUrgency(
    OPS_RISK_TICKETS.filter((t) => t.bucket === bucket && matchesScope(t.groupId, scope)),
  );
}

// ---- 阈值告警记录 ----

export interface OpsAlertRecord {
  id: string;
  when: string;
  scope: string;
  value: number;
  threshold: number;
  /** 已通知的人 */
  receivers: string[];
  /** 已被谁确认 */
  ackBy?: string;
  ackAt?: string;
}

export const OPS_ALERTS: OpsAlertRecord[] = [
  {
    id: 'al-1', when: '2026-08-04 14:02:06', scope: '全中心',
    value: 308, threshold: 300,
    receivers: ['张组长', '李组长', '值班经理·郑'],
  },
  {
    id: 'al-2', when: '2026-08-04 10:35:04', scope: '硬件缺陷组',
    value: 83, threshold: 80,
    receivers: ['陈组长'],
    ackBy: '陈组长', ackAt: '2026-08-04 10:41:35',
  },
];

// ---- 模块 1.4 · 流量曲线（日 / 周）----
// 工单监控一期不提供月度、同比或环比数据。

export type TrendGrain = 'day' | 'week';

export const TREND_GRAINS: { key: TrendGrain; label: string; unit: string }[] = [
  { key: 'day', label: '日', unit: '今日逐小时' },
  { key: 'week', label: '周', unit: '近 7 天' },
];

export interface TrendPoint {
  t: string;
  inbound: number;
  forward: number;
  closed: number;
  backlog: number;
}

/** 周：工作日高、周末低 */
const WEEK_RAW = [
  { t: '07-29', inbound: 1516, forward: 1502 },
  { t: '07-30', inbound: 1604, forward: 1571 },
  { t: '07-31', inbound: 1688, forward: 1642 },
  { t: '08-01', inbound: 1402, forward: 1449 },
  { t: '08-02', inbound: 806, forward: 861 },
  { t: '08-03', inbound: 742, forward: 705 },
  { t: '08-04', inbound: 1482, forward: 1391 },
];

/**
 * 历史序列重标定：**末点锚定到当前实际值**，其余点等比缩放保持形状。
 *
 * 末点就是当前统计日；一期不生成月度及对比序列。
 * 用户切粒度时会拿末点跟上方卡片对，对不上就是穿帮。
 *
 * 期初存量由 `末点积压 − Σ(进−出)` **反解**，这样积压线自然落到当前积压，
 * 不需要在最后一点上硬掰一下（硬掰会在图上留一个突兀的跳变）。
 */
function anchorSeries(
  raw: { t: string; inbound: number; forward: number }[],
  lastInbound: number,
  lastForward: number,
  lastClosed: number,
  backlog: number,
): TrendPoint[] {
  const tail = raw[raw.length - 1];
  const fIn = tail && tail.inbound ? lastInbound / tail.inbound : 1;
  const fOut = tail && tail.forward ? lastForward / tail.forward : 1;
  const fClosed = tail && tail.forward ? lastClosed / tail.forward : 1;

  const flows = raw.map((r, i) => {
    const isLast = i === raw.length - 1;
    return {
      t: r.t,
      inbound: isLast ? lastInbound : Math.round(r.inbound * fIn),
      forward: isLast ? lastForward : Math.round(r.forward * fOut),
      closed: isLast ? lastClosed : Math.round(r.forward * fClosed),
    };
  });

  const net = flows.reduce((s, r) => s + r.inbound - r.closed, 0);
  let acc = backlog - net;
  return flows.map((r) => {
    acc = acc + r.inbound - r.closed;
    return { ...r, backlog: acc };
  });
}

/**
 * 某范围 × 某粒度的曲线。
 * 各粒度末点的锚：日＝今日逐小时，周＝今天。
 */
export function getTrend(scope: OpsScope, grain: TrendGrain): TrendPoint[] {
  const snap = getOpsSnapshot(scope);
  if (grain === 'day') return snap.trend;
  return anchorSeries(WEEK_RAW, snap.inbound, snap.forward, snap.closed, snap.backlog);
}

/** 高低峰：曲线上直接标出来，不让用户自己找 */
export function trendPeaks(points: TrendPoint[]): { peak: TrendPoint | null; valley: TrendPoint | null } {
  if (!points.length) return { peak: null, valley: null };
  return {
    peak: points.reduce((a, b) => (b.inbound > a.inbound ? b : a)),
    valley: points.reduce((a, b) => (b.inbound < a.inbound ? b : a)),
  };
}
