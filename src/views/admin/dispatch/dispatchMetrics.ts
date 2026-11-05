/**
 * 【1215】分派监控统计（PRD 13.2 引擎层指标 / 13.5 统计卡 / 14.1 进出池趋势与出池方式占比）。
 * 只读：取 dispatch store 的派单日志与坐席、工单库的处理履历换算，不写任何数据。
 */
import { TICKETS } from '@/mock/tickets';
import type { DispatchAgent, DispatchLogEntry, DispatchTrigger } from '@/views/tickets/types/dispatch';

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
  /** 系统派单成功率的分子 / 分母（工单数） */
  successCount: number;
  successBase: number;
}

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

  // 进入系统派单：判定时生效方式为自动派单或混合派单的工单（人工派单不走系统派单）
  const formal = inRange.filter((l) => l.kind === '判定' && l.effectiveMode !== '人工派单');
  const entered = new Set(formal.map((l) => l.ticketNo));
  // 系统派单成功率（A.3）：进入系统派单的工单中，已由系统派出的占比；不含直派规则单
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
  };
}

/* ---------------- 进出池（进出池趋势、出池方式占比） ---------------- */

const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/**
 * 进池事件：工单每进入一次工单池算一次。
 * 切为自动派单、补单扫描、跨班次回收是同一次在池内的重新判定，不算。
 */
const POOL_IN_TRIGGERS: ReadonlySet<DispatchTrigger> = new Set<DispatchTrigger>([
  '新单', '调剂到池', '升级三线', '售后转回', '回访打回', '池停用', '重新进池',
]);

function isPoolIn(l: DispatchLogEntry): boolean {
  return l.kind === '判定' && !!l.trigger && POOL_IN_TRIGGERS.has(l.trigger);
}

/** 工单离开工单池的五种方式。改派、调剂到人、调剂到池、升级三线指定人、升级投诉直派不计入 */
const OUT_GROUPS: { name: string; items: { name: string; color: string; hit: (l: DispatchLogEntry) => boolean }[] }[] = [
  {
    name: '系统派出',
    items: [
      { name: '按规则直派', color: '#1344b4', hit: (l) => isEngineAssign(l) && l.path === '直派规则' },
      { name: '派回原处理人', color: '#1a6fff', hit: (l) => isEngineAssign(l) && l.path === '原处理人' },
      { name: '综合打分', color: '#7eb0ff', hit: (l) => isEngineAssign(l) && l.path === '加权评分' },
    ],
  },
  {
    name: '人工接手',
    items: [
      { name: '领取', color: '#b45309', hit: (l) => l.kind === '人工' && l.manual?.action === '二线领取' },
      { name: '指派', color: '#f59e0b', hit: (l) => l.kind === '人工' && l.manual?.action === '班组长指派' },
    ],
  },
];
const OUT_ITEMS = OUT_GROUPS.flatMap((g) => g.items);

function isPoolOut(l: DispatchLogEntry): boolean {
  return OUT_ITEMS.some((x) => x.hit(l));
}

export interface PoolFlowPoint { key: number; label: string; in: number; out: number }
export interface OutShareItem { name: string; color: string; count: number; pct: number }
export interface OutShareGroup { name: string; count: number; pct: number; items: OutShareItem[] }
export interface PoolFlow {
  /** 今日按小时到当前小时；近 7 日、近 30 日按日，含今天 */
  points: PoolFlowPoint[];
  inTotal: number;
  outTotal: number;
  outGroups: OutShareGroup[];
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/** 进出池统计：趋势与占比取同一批记录 */
export function buildPoolFlow(logs: DispatchLogEntry[], range: RangeKey, poolIds: string[] | null, now: number): PoolFlow {
  const from = rangeStart(range, now);
  const size = range === 'today' ? HOUR : DAY;
  const n = Math.floor((now - from) / size) + 1;
  const points: PoolFlowPoint[] = Array.from({ length: n }, (_, i) => {
    const d = new Date(from + i * size);
    return {
      key: from + i * size,
      label: range === 'today' ? `${pad2(d.getHours())}:00` : `${d.getMonth() + 1}/${d.getDate()}`,
      in: 0,
      out: 0,
    };
  });
  const inRange = logs.filter((l) => inWindow(l, { from, to: now + 1, poolIds }));
  for (const l of inRange) {
    const p = points[Math.floor((parseAt(l.at) - from) / size)];
    if (!p) continue;
    if (isPoolIn(l)) p.in += 1;
    if (isPoolOut(l)) p.out += 1;
  }
  const outTotal = points.reduce((s, p) => s + p.out, 0);
  const pctOf = (c: number) => (outTotal ? Math.round((c / outTotal) * 1000) / 10 : 0);
  const outGroups = OUT_GROUPS.map((g) => {
    const items = g.items.map((x) => {
      const count = inRange.filter(x.hit).length;
      return { name: x.name, color: x.color, count, pct: pctOf(count) };
    });
    const count = items.reduce((s, x) => s + x.count, 0);
    return { name: g.name, count, pct: pctOf(count), items };
  });
  return { points, inTotal: points.reduce((s, p) => s + p.in, 0), outTotal, outGroups };
}

export function minText(v: number | null): string {
  if (v == null) return '—';
  if (v < 1) return '<1 分钟';
  if (v < 60) return `${Math.round(v)} 分钟`;
  const h = Math.floor(v / 60);
  const m = Math.round(v % 60);
  return m ? `${h} 小时 ${m} 分钟` : `${h} 小时`;
}
