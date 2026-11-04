/**
 * 【1215】分派监控统计（PRD 13.2 引擎层指标 / 13.5 统计卡 / 14.1 派单路径占比）。
 * 只读：取 dispatch store 的派单日志与坐席、工单库的处理履历换算，不写任何数据。
 */
import { TICKETS } from '@/mock/tickets';
import type { DispatchAgent, DispatchLogEntry } from '@/views/tickets/types/dispatch';

const MIN = 60_000;

export function parseAt(s?: string): number {
  if (!s) return NaN;
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(s);
  if (!m) return NaN;
  return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0)).getTime();
}

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export type RangeKey = 'today' | '7d' | '30d';
export function rangeStart(r: RangeKey, now: number): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  const days = r === 'today' ? 0 : r === '7d' ? 6 : 29;
  return d.getTime() - days * 24 * 60 * MIN;
}

/** 引擎派出：判定且中选坐席、派单状态为空 */
export function isEngineAssign(l: DispatchLogEntry): boolean {
  return l.kind === '判定' && !!l.chosen && !l.status;
}
/** 人工拿单（领取 / 指派 / 调剂到人 / 升级三线指定人），带目标坐席 */
function isManualTake(l: DispatchLogEntry): boolean {
  return l.kind === '人工' && !!l.manual?.target && l.manual.action !== '调剂到池';
}

interface Window { from: number; to: number; poolIds: string[] | null }

function inWindow(l: DispatchLogEntry, w: Window): boolean {
  const t = parseAt(l.at);
  return t >= w.from && t < w.to && (!w.poolIds || w.poolIds.includes(l.poolId));
}

/** 首响两段（13.3 首响拆段）：池等待、派单后首响，单位分钟 */
function firstRespSegments(logs: DispatchLogEntry[], w: Window) {
  const byTicket = new Map<string, DispatchLogEntry[]>();
  for (const l of logs) {
    if (!byTicket.has(l.ticketNo)) byTicket.set(l.ticketNo, []);
    byTicket.get(l.ticketNo)!.push(l);
  }
  const waits: number[] = [];
  const resps: number[] = [];
  for (const [no, ls] of byTicket) {
    const sorted = [...ls].sort((a, b) => a.seq - b.seq);
    const enter = sorted.find((l) => l.kind === '判定');
    const take = sorted.find((l) => isEngineAssign(l) || isManualTake(l));
    if (!enter || !take || !inWindow(take, w)) continue;
    const enterAt = parseAt(enter.at);
    const takeAt = parseAt(take.at);
    if (takeAt >= enterAt) waits.push((takeAt - enterAt) / MIN);
    const who = take.kind === '判定' ? take.chosen?.name : take.manual?.target;
    const t = TICKETS.find((x) => x.no === no);
    // 工单库查不到的历史单：取派单日志记下的派单后首响时刻
    const first = t
      ? (t.eventTimeline ?? [])
        .filter((e) => e.who === who && parseAt(e.when) >= takeAt)
        .map((e) => parseAt(e.when))
        .sort((a, b) => a - b)[0]
      : parseAt((take as DispatchLogEntry & { firstRespAt?: string }).firstRespAt);
    if (first != null && Number.isFinite(first)) resps.push((first - takeAt) / MIN);
  }
  return { wait: median(waits), resp: median(resps) };
}

export interface MonitorStats {
  waitMedian: number | null;
  respMedian: number | null;
  /** 较昨日（仅今日范围）：两段合计变化，分钟 */
  firstRespDelta: number | null;
  /** 较昨日（仅今日范围）：池等待 / 派单后首响中位数各自变化，分钟 */
  waitDelta: number | null;
  respDelta: number | null;
  balance: number | null;
  successRate: number | null;
  /** 自动派单成功率的分子 / 分母（工单数） */
  successCount: number;
  successBase: number;
  pathShare: { name: string; count: number; pct: number; color: string }[];
  pathTotal: number;
}

const PATH_ITEMS: { name: string; color: string; hit: (l: DispatchLogEntry) => boolean }[] = [
  { name: '按规则直派', color: '#8b5cf6', hit: (l) => isEngineAssign(l) && l.path === '直派规则' },
  { name: '派回原处理人', color: '#0ea5e9', hit: (l) => isEngineAssign(l) && l.path === '原处理人' },
  { name: '综合打分', color: '#1a6fff', hit: (l) => isEngineAssign(l) && l.path === '加权评分' },
  { name: '二线领取', color: '#10b981', hit: (l) => l.kind === '人工' && l.manual?.action === '二线领取' },
  { name: '班组长指派', color: '#f59e0b', hit: (l) => l.kind === '人工' && (l.manual?.action === '班组长指派' || l.manual?.action === '改派') },
  { name: '调剂', color: '#ef4444', hit: (l) => l.kind === '人工' && (l.manual?.action === '调剂到人' || l.manual?.action === '调剂到池') },
  { name: '升级三线指定', color: '#6366f1', hit: (l) => l.kind === '人工' && l.manual?.action === '升级三线指定人' },
];

/** 派单均衡度只计当日在岗满该时长的坐席（13.2） */
export const BALANCE_MIN_ON_DUTY_HOURS = 2;

/**
 * 派单均衡度（13.2）：同一熟练度内各坐席「当日每在岗小时接单量」的标准差 ÷ 平均值，再按人数加权。
 * 某等级不足 2 人或平均值为 0 时不计入；都不计入时为 null。
 */
function balanceOf(rows: { proficiency: string; perHour: number }[]): number | null {
  const levels = new Map<string, number[]>();
  for (const x of rows) levels.set(x.proficiency, [...(levels.get(x.proficiency) ?? []), x.perHour]);
  let weighted = 0;
  let people = 0;
  for (const xs of levels.values()) {
    const mean = xs.reduce((s, x) => s + x, 0) / xs.length;
    if (xs.length < 2 || mean <= 0) continue;
    const sd = Math.sqrt(xs.reduce((s, x) => s + (x - mean) ** 2, 0) / xs.length);
    weighted += (sd / mean) * xs.length;
    people += xs.length;
  }
  return people ? Math.round((weighted / people) * 100) / 100 : null;
}

export function computeStats(
  logs: DispatchLogEntry[], agents: DispatchAgent[], range: RangeKey, poolIds: string[] | null, now: number,
  /** 坐席当日在岗小时数（就绪时长） */
  onDutyHoursOf: (name: string) => number = () => 0,
  /** 池所属处理组（工单池筛选下均衡度取该组成员，14.1） */
  poolGroupIdOf: (poolId: string) => string | undefined = (id) => id,
): MonitorStats {
  const from = rangeStart(range, now);
  const w: Window = { from, to: now + 1, poolIds };
  const scoped = logs.filter((l) => !poolIds || poolIds.includes(l.poolId));
  const inRange = scoped.filter((l) => inWindow(l, w));

  // 进入派单：判定时生效方式为自动派单的工单（混合派单 / 人工派单留池的单不进入自动派单）
  const formal = inRange.filter((l) => l.kind === '判定' && l.effectiveMode === '自动派单');
  const entered = new Set(formal.map((l) => l.ticketNo));
  // 自动派单成功率（13.2）：进入派单的工单中，已由系统派出的占比；不含直派规则单
  const success = new Set(formal.filter((l) => isEngineAssign(l) && l.path !== '直派规则').map((l) => l.ticketNo));

  const seg = firstRespSegments(scoped, w);
  let firstRespDelta: number | null = null;
  let waitDelta: number | null = null;
  let respDelta: number | null = null;
  if (range === 'today') {
    const y = firstRespSegments(scoped, { from: from - 24 * 60 * MIN, to: from, poolIds });
    if (seg.wait != null && y.wait != null) firstRespDelta = (seg.wait + (seg.resp ?? 0)) - (y.wait + (y.resp ?? 0));
    if (seg.wait != null && y.wait != null) waitDelta = seg.wait - y.wait;
    if (seg.resp != null && y.resp != null) respDelta = seg.resp - y.resp;
  }

  // 派单均衡度（13.2）：仅计当日在岗 2 小时及以上的坐席，不含直派规则单；接单量含系统派单与人工拿单
  const dayFrom = rangeStart('today', now);
  const todayTakes = scoped.filter((l) => parseAt(l.at) >= dayFrom && (isEngineAssign(l) || isManualTake(l)) && l.path !== '直派规则');
  const scopeGroupIds = poolIds?.map((id) => poolGroupIdOf(id) ?? id) ?? null;
  const pool = agents
    .filter((a) => !a.disabled && (!scopeGroupIds || a.groupIds.some((g) => scopeGroupIds.includes(g))))
    .map((a) => ({ a, hours: onDutyHoursOf(a.name) }))
    .filter((x) => x.hours >= BALANCE_MIN_ON_DUTY_HOURS);
  const balance = balanceOf(pool.map(({ a, hours }) => ({
    proficiency: a.proficiency,
    perHour: todayTakes.filter((l) => (l.kind === '判定' ? l.chosen?.name : l.manual?.target) === a.name).length / hours,
  })));

  const pathCounts = PATH_ITEMS.map((p) => ({ name: p.name, color: p.color, count: inRange.filter(p.hit).length }));
  const pathTotal = pathCounts.reduce((s, x) => s + x.count, 0);

  return {
    waitMedian: seg.wait,
    respMedian: seg.resp,
    firstRespDelta,
    waitDelta,
    respDelta,
    balance,
    successRate: entered.size ? Math.round((success.size / entered.size) * 1000) / 10 : null,
    successCount: success.size,
    successBase: entered.size,
    pathShare: pathCounts.map((p) => ({ ...p, pct: pathTotal ? Math.round((p.count / pathTotal) * 1000) / 10 : 0 })),
    pathTotal,
  };
}

/* ---------------- 派单趋势（按日派出量） ---------------- */

/** 历史基线：各组池日均派出量（今日之前的日期叠加派单日志实计） */
const TREND_BASE: Record<string, { out: number }> = {
  line2: { out: 46 },
  hardware: { out: 22 },
  'edu-flash': { out: 0 },
  xiaozhi: { out: 14 },
  edu: { out: 20 },
  general: { out: 24 },
};
const DAY = 24 * 60 * MIN;

/** 按日期取确定的波动系数（同一天每次打开一致） */
function dayWave(dayStart: number, salt: number): number {
  const d = Math.floor(dayStart / DAY) + salt * 7919;
  const x = Math.sin(d * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

export interface TrendPoint { label: string; dayStart: number; out: number }

export function buildTrend(logs: DispatchLogEntry[], days: 7 | 30, poolIds: string[] | null, now: number): TrendPoint[] {
  const today = rangeStart('today', now);
  const ids = poolIds ?? Object.keys(TREND_BASE);
  const baseOut = ids.reduce((s, id) => s + (TREND_BASE[id]?.out ?? 0), 0);
  const scoped = logs.filter((l) => !poolIds || poolIds.includes(l.poolId));
  const pts: TrendPoint[] = [];
  // 只取已结束的整日：近 N 天＝昨日往前 N 天
  for (let i = days; i >= 1; i -= 1) {
    const ds = today - i * DAY;
    const de = ds + DAY;
    const dayLogs = scoped.filter((l) => { const t = parseAt(l.at); return t >= ds && t < de; });
    const out = dayLogs.filter(isEngineAssign).length;
    const wd = new Date(ds).getDay();
    const weekend = wd === 0 || wd === 6 ? 0.72 : 1;
    const bOut = Math.round(baseOut * weekend * (0.86 + dayWave(ds, 1) * 0.28));
    const d = new Date(ds);
    pts.push({ label: `${d.getMonth() + 1}/${d.getDate()}`, dayStart: ds, out: bOut + out });
  }
  return pts;
}

export function minText(v: number | null): string {
  if (v == null) return '—';
  if (v < 1) return '<1 分钟';
  if (v < 60) return `${Math.round(v)} 分钟`;
  const h = Math.floor(v / 60);
  const m = Math.round(v % 60);
  return m ? `${h} 小时 ${m} 分钟` : `${h} 小时`;
}
