/**
 * 【1215】智能派单 · 运行中种子（PRD 13 / 14 / 17 章）：近两周的派单日志、审计、池内待派工单与坐席当日在岗。
 *
 * - 时间一律相对加载时刻生成：今日 08:30 起至当前时刻；前 13 天为上线以来的判定与人工记录
 *   （管理员先开放二线处理组池自动派单，第 4 天起再放开硬件、综合、技术支持三池）。
 * - 只由 `stores/dispatch.ts` 在无缓存（或版本闸失效）时调用一次，结果随 `flowos-dispatch` 落库；改本文件须升 `DISPATCH_CACHE_VERSION`。
 * - 日志里的工单号为历史单（号段 5xxxx，不在工单库）；池内待派单（号段 8xxxx）是真实工单行，随派单快照落库与回放。
 * - 历史单的派单后首响时刻记在日志 `firstRespAt`（工单库查不到该单时，分派监控按此取首响）。
 */
import type { Ticket } from '@/views/tickets/types/ticket';
import type { TimelineEntry } from '@/views/tickets/types/ticketDetail';
import {
  PRIORITY_SCORE, PROFICIENCY_SCORE, defaultScoreFactors, isProfileConfigured,
  type DispatchAgent, type DispatchAuditEntry, type DispatchAuditKind, type DispatchFailReason, type DispatchGroup,
  type DispatchLogEntry, type DispatchPath, type DispatchStatus, type DispatchTrigger, type GateKey, type ManualAction,
  type OriginalRelation, type PoolMode, type PoolRule, type RelaxLevel, type ScoreDetail, type ScoreFactorKey, type TicketDispatchState,
} from '@/views/tickets/types/dispatch';
import { splitProblemPath } from '@/stores/problemTags';

type Priority = Ticket['priority'];

/** 历史单的派单日志：带派单后首响时刻（工单库无此单时分派监控取它） */
export type SeedLogEntry = DispatchLogEntry & { firstRespAt?: string };

export interface DispatchDemo {
  logs: SeedLogEntry[];
  audits: DispatchAuditEntry[];
  ticketStates: Record<string, TicketDispatchState>;
  overAssigned: Record<string, boolean>;
  /** 池内待派的真实工单行（注入工单库） */
  rows: Ticket[];
  /** 坐席当日在岗、坐席状态、接单时刻 */
  agentPatch: Record<string, Partial<DispatchAgent>>;
}

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const ADMIN = '赵管理';
const LEADER = '王组长';
const SYSTEM = '系统';

const pad = (n: number) => String(n).padStart(2, '0');
function stamp(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
function ymd(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
}
function dayStartOf(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
function hm(ms: number): string {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 确定性随机（同一天每次生成一致） */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ------------------------------------------------------------------ */
/* 工单快照模板（按池）                                                  */
/* ------------------------------------------------------------------ */

interface Snap {
  businessType?: string;
  ticketType: '咨询' | '投诉';
  productCategory?: string;
  product?: string;
  problem?: string;
  ticketSource?: string;
  customerType?: string;
}

const SNAPS: Record<string, Snap[]> = {
  line2: [
    { businessType: '智能硬件', ticketType: '咨询', productCategory: '智能硬件', product: '智能音箱 X1', problem: '功能异常 / 播放问题 / 在线播放', ticketSource: '电话', customerType: '个人用户' },
    { businessType: '学习机', ticketType: '咨询', productCategory: '智能硬件', product: '蓝牙耳机 Air', problem: '功能异常 / 播放问题 / 无法播放', ticketSource: '客户服务小程序', customerType: '个人用户' },
    { businessType: '智能硬件', ticketType: '咨询', productCategory: '智能硬件', product: '讯飞录音笔H1', problem: '功能异常 / 播放问题 / 无法播放', ticketSource: 'IM', customerType: '个人用户' },
    { businessType: '教育', ticketType: '咨询', productCategory: '软件服务', product: '智学网会员', problem: '功能异常 / 播放问题 / 无法播放', ticketSource: 'IM', customerType: '家长' },
    { businessType: '翻译机', ticketType: '咨询', productCategory: '消费电子', product: '三防翻译机', problem: '功能异常 / 触控问题 / 误触', ticketSource: '电话', customerType: '个人用户' },
    { businessType: '学习机', ticketType: '咨询', productCategory: '学习硬件', product: '学习机 T20', problem: '功能异常 / 触控问题 / 触摸失灵', ticketSource: '电话', customerType: '家长' },
  ],
  hardware: [
    { businessType: '学习机', ticketType: '咨询', productCategory: '智能硬件', product: '扫地机器人 R2', problem: '设备故障 / 无法开机 / 无响应', ticketSource: '电话', customerType: '个人用户' },
    { businessType: '学习机', ticketType: '咨询', productCategory: '智能硬件', product: '智能门锁 L1', problem: '设备故障 / 网络 / WiFi 连不上', ticketSource: '电话', customerType: '个人用户' },
    { businessType: '学习机', ticketType: '投诉', productCategory: '学习硬件', product: '学习机 T20', problem: '设备故障 / 无法开机 / 黑屏', ticketSource: '电话', customerType: '家长' },
    { businessType: '智能硬件', ticketType: '咨询', productCategory: '智能硬件', product: '智能音箱 X1', problem: '设备故障 / 无法开机 / 黑屏', ticketSource: '售后系统', customerType: '个人用户' },
  ],
  general: [
    { businessType: '智能硬件', ticketType: '咨询', productCategory: '智能硬件', product: '蓝牙耳机 Air', ticketSource: '售后系统', customerType: '个人用户' },
    { businessType: '其他', ticketType: '咨询', productCategory: '会员权益', product: '会员服务', ticketSource: '电话', customerType: '个人用户' },
    { businessType: '智能硬件', ticketType: '咨询', productCategory: '智能硬件', product: '扫地机器人 R2', ticketSource: '售后系统', customerType: '个人用户' },
    { ticketType: '咨询', productCategory: '企业服务', product: '企业版', ticketSource: 'IM', customerType: '经销商' },
    { businessType: '智能硬件', ticketType: '咨询', productCategory: '智能硬件', product: '路由器 R2', ticketSource: '电话', customerType: '个人用户' },
    { businessType: '学习机', ticketType: '咨询', productCategory: '学习硬件', product: '讯飞学习机 T20', ticketSource: '电话', customerType: '家长' },
  ],
  tech: [
    { ticketType: '咨询', productCategory: '开放平台', product: '讯飞智能质检系统V1.0', problem: '账号问题 / 登录 / 验证码失败', ticketSource: '跨组调剂', customerType: '经销商' },
    { ticketType: '咨询', productCategory: '企业服务', product: '讯飞智能质检系统V1.0', problem: '账号问题 / 登录 / 密码错误', ticketSource: '跨组调剂', customerType: '经销商' },
    { businessType: '智能硬件', ticketType: '咨询', productCategory: '智能硬件', product: '智能音箱 X1', problem: '设备故障 / 无法开机 / 无响应', ticketSource: '跨组调剂', customerType: '个人用户' },
  ],
  'edu-flash': [
    { businessType: '教育', ticketType: '咨询', productCategory: '学习硬件', product: '讯飞智慧课堂学生平板 S30', problem: '售后 / 服务申请 / 自助刷机', ticketSource: '客户服务小程序', customerType: '学生' },
    { businessType: '教育', ticketType: '咨询', productCategory: '学习硬件', product: '讯飞智慧课堂学生平板 S20', problem: '售后 / 服务申请 / 自助刷机', ticketSource: '电话', customerType: '家长' },
  ],
  edu: [
    { businessType: '教育', ticketType: '咨询', productCategory: '软件服务', product: '个性化学习手册', problem: '个册退费 / 退费申请 / 个册退费', ticketSource: '电话', customerType: '家长' },
    { businessType: '教育', ticketType: '咨询', productCategory: '软件服务', product: '智学网会员', problem: '账号问题 / 权益 / 订单未同步', ticketSource: 'IM', customerType: '家长' },
  ],
  xiaozhi: [
    { businessType: '教育', ticketType: '咨询', productCategory: '软件服务', product: '智学网会员', problem: '功能异常 / 播放问题 / 在线播放', ticketSource: 'IM', customerType: '老师' },
    { businessType: '教育', ticketType: '咨询', productCategory: '软件服务', product: '智学网会员', problem: '功能异常 / 触控问题 / 误触', ticketSource: 'IM', customerType: '老师' },
  ],
};

/** 命中规则（13.1）：按池取迁移规则名；技术支持池经调剂到池 / 升级三线进入记「指定池」 */
function ruleOf(pool: string, s: Snap): string {
  if (pool === 'line2') return '功能异常（迁移）';
  if (pool === 'hardware') return s.ticketType === '投诉' && s.product === '学习机 T20' ? '投诉自动派学习机组（迁移）' : '设备故障（迁移）';
  if (pool === 'tech') return '指定池';
  if (pool === 'edu-flash') return '自助刷机（迁移）';
  if (pool === 'edu') return '个册退费（迁移）';
  return '默认池';
}

const FIRST_RESP_LIMIT: Record<Priority, number> = { P0: 15, P1: 480, P2: 480, P3: 480 };

/* ------------------------------------------------------------------ */
/* 日志构造                                                             */
/* ------------------------------------------------------------------ */

interface Mode {
  globalMode: PoolMode;
  groupMode: PoolMode;
  effectiveMode: PoolMode;
}
const FORMAL: Mode = { globalMode: '自动派单', groupMode: '自动派单', effectiveMode: '自动派单' };
/** 本池由管理员切为混合派单 */
const HW_MIXED: Mode = { globalMode: '自动派单', groupMode: '混合派单', effectiveMode: '混合派单' };
/** 全局由管理员切为混合派单 */
const GLOBAL_MIXED: Mode = { globalMode: '混合派单', groupMode: '自动派单', effectiveMode: '混合派单' };
/** 专属工单线的组：本组混合派单，组内领取 */
const OFF_GROUP: Mode = { globalMode: '自动派单', groupMode: '混合派单', effectiveMode: '混合派单' };
/** 教育刷机处理组池：本池人工派单，手动领单 */
const FLASH_MANUAL: Mode = { globalMode: '自动派单', groupMode: '人工派单', effectiveMode: '人工派单' };

interface Tk {
  no: string;
  pool: string;
  snap: Snap;
  priority: Priority;
  /** 进入派单时首响剩余（分钟） */
  remain0: number;
  enteredAt: number;
  seq: number;
}

interface JudgeOpts {
  trigger: DispatchTrigger;
  path: DispatchPath;
  mode: Mode;
  status?: DispatchStatus | null;
  chosen?: DispatchAgent;
  relaxLevel?: RelaxLevel;
  failReason?: DispatchFailReason;
  /** 本次判定的候选数（不传按池成员估算） */
  candidates?: number;
  firstRespAt?: number;
  /** 派回原处理人 / 为原处理人保留命中的关系（不传按触发：售后转回 → 本单退回，其余 → 同客户近期） */
  relation?: OriginalRelation;
  /** 因例外不派回的原处理人 */
  excluded?: DispatchLogEntry['originalExcluded'];
}

/** 种子日志里原处理人的关系：售后转回、回访打回为本单退回；其余按时刻分到关联单 / 同客户近期（不消耗随机序列） */
function relationOf(trigger: DispatchTrigger, at: number): OriginalRelation {
  if (trigger === '售后转回' || trigger === '回访打回') return '本单退回';
  return Math.floor(at / MIN) % 4 === 0 ? '关联单' : '同客户近期';
}

function makeBuilder(agents: DispatchAgent[], groups: DispatchGroup[], r: () => number) {
  const logs: SeedLogEntry[] = [];
  let idn = 0;
  const weights = defaultScoreFactors();
  const wsum = weights.reduce((s, f) => s + f.weight, 0);
  const groupLabel = (id: string) => groups.find((g) => g.id === id)?.label ?? id;
  const poolLabel = (id: string) => `${groupLabel(id)}池`;
  const members = (pool: string) => agents.filter((a) => a.groupIds.includes(pool));
  const eligible = (pool: string) => members(pool).filter((a) => a.personalSwitch && isProfileConfigured(a.profile));
  const capOf = (a: DispatchAgent) => {
    const base = a.roles.includes('技术支持') ? 8 : a.roles.some((x) => ['班组长', '客诉专员', '督导'].includes(x)) ? 5 : 10;
    return a.capOverride ?? Math.round(base * ({ 初级: 0.6, 熟练: 1, 专家: 1.3 } as const)[a.proficiency]);
  };
  const between = (lo: number, hi: number) => lo + (hi - lo) * r();
  const pick = <T,>(xs: T[]): T => xs[Math.floor(r() * xs.length) % xs.length];

  function snapshotOf(t: Tk, at: number): DispatchLogEntry['snapshot'] {
    const remain = Math.round(t.remain0 - (at - t.enteredAt) / MIN);
    return {
      ...(t.snap.businessType ? { businessType: t.snap.businessType } : {}),
      ticketType: t.snap.ticketType,
      ...(t.snap.productCategory ? { productCategory: t.snap.productCategory } : {}),
      ...(t.snap.product ? { product: t.snap.product } : {}),
      ...(t.snap.problem ? { problem: t.snap.problem } : {}),
      ...(t.snap.ticketSource ? { ticketSource: t.snap.ticketSource } : {}),
      ...(t.snap.customerType ? { customerType: t.snap.customerType } : {}),
      priority: t.priority,
      firstRespRemainMin: Math.max(0, remain),
    };
  }

  /** 单个候选评分（4.3）：五因子加权 */
  function scoreOf(a: DispatchAgent, t: Tk, boost = 0): ScoreDetail {
    const cap = capOf(a);
    const load = Math.min(0.95, Math.max(0.1, between(0.25, 0.9) + boost));
    const factors: Record<ScoreFactorKey, number> = {
      load,
      proficiency: PROFICIENCY_SCORE[a.proficiency],
      urgency: Math.max(PRIORITY_SCORE[t.priority], between(0, 0.35)),
      recent: Math.min(1, Math.max(0, between(0.2, 1) + boost)),
      idle: Math.min(1, Math.max(0.05, between(0.1, 0.9) + boost)),
    };
    const total = Math.round((weights.reduce((s, f) => s + f.weight * factors[f.key], 0) / wsum) * 1000) / 10;
    for (const k of Object.keys(factors) as ScoreFactorKey[]) factors[k] = Math.round(factors[k] * 100) / 100;
    return { name: a.name, total, factors, idleMinutes: Math.round(factors.idle * 120), inTransit: Math.round((1 - load) * cap) };
  }

  /** 门槛淘汰（4.1）：按池成员估算各门槛淘汰人数，`keep` 为最终候选数 */
  function dropsOf(pool: string, keep: number, capBlocked = 0): Partial<Record<GateKey, number>> {
    const m = members(pool);
    const d: Partial<Record<GateKey, number>> = {};
    const outside = agents.length - m.length;
    if (outside) d['候选范围'] = outside;
    const off = m.filter((a) => !a.personalSwitch).length;
    if (off) d['个人开关'] = off;
    const unconf = m.filter((a) => a.personalSwitch && !isProfileConfigured(a.profile)).length;
    let rest = m.length - off - unconf - keep - capBlocked;
    if (rest > 0) {
      const shift = Math.min(rest, Math.round(r() * Math.min(1, rest)));
      if (shift) d['在班'] = shift;
      rest -= shift;
    }
    if (unconf) d['画像已配置'] = unconf;
    if (rest > 0) d['画像匹配'] = rest;
    if (capBlocked) d['个人上限'] = capBlocked;
    return d;
  }

  function judge(t: Tk, at: number, o: JudgeOpts): SeedLogEntry {
    t.seq += 1;
    const assignLike = !!o.chosen;
    let chosenScore: ScoreDetail | undefined;
    let top3: { name: string; total: number }[] | undefined;
    let candidates = 0;
    if (o.chosen) {
      const pool = eligible(t.pool);
      candidates = o.candidates ?? (o.path === '原处理人' ? 1 : Math.max(1, Math.min(pool.length, 1 + Math.floor(r() * pool.length))));
      chosenScore = scoreOf(o.chosen, t, 0.15);
      if (o.path !== '原处理人') {
        const others = pool.filter((a) => a.name !== o.chosen!.name).slice(0, Math.max(0, candidates - 1));
        top3 = [{ name: chosenScore.name, total: chosenScore.total }, ...others.map((a) => {
          const s = scoreOf(a, t);
          return { name: a.name, total: Math.min(s.total, Math.round((chosenScore!.total - between(1.5, 12)) * 10) / 10) };
        })].sort((x, y) => y.total - x.total).slice(0, 3);
      }
    }
    const capBlocked = o.path === '排队' ? Math.max(1, Math.min(2, eligible(t.pool).length)) : 0;
    const status = o.status ?? null;
    const e: SeedLogEntry = {
      id: `dl-seed-${(idn += 1)}`,
      ticketNo: t.no,
      seq: t.seq,
      at: stamp(at),
      kind: '判定',
      trigger: o.trigger,
      poolId: t.pool,
      poolLabel: poolLabel(t.pool),
      ruleName: ruleOf(t.pool, t.snap),
      globalMode: o.mode.globalMode,
      groupMode: o.mode.groupMode,
      effectiveMode: o.mode.effectiveMode,
      path: o.path,
      ...(o.path === '原处理人' || o.path === '预留' ? { originalRelation: o.relation ?? relationOf(o.trigger, at) } : {}),
      ...(o.excluded?.length ? { originalExcluded: o.excluded } : {}),
      relaxLevel: o.relaxLevel ?? 0,
      ...(o.path === '留池' || o.path === '预留' ? {} : { gateDrops: dropsOf(t.pool, assignLike ? candidates : 0, capBlocked), candidateCount: assignLike ? candidates : 0 }),
      ...(o.chosen ? { chosen: { name: o.chosen.name, staffNo: o.chosen.staffNo, groupLabel: groupLabel(t.pool) } } : {}),
      ...(chosenScore ? { chosenScore } : {}),
      ...(top3 ? { top3 } : {}),
      ...(o.failReason ? { failReason: o.failReason } : {}),
      status,
      snapshot: snapshotOf(t, at),
      ...(o.firstRespAt != null ? { firstRespAt: stamp(o.firstRespAt) } : {}),
    };
    logs.push(e);
    return e;
  }

  function manual(t: Tk, at: number, action: ManualAction, operator: string, mode: Mode, o: {
    target?: string; reason?: string; overCap?: '超额指派'; firstRespAt?: number; ruleName?: string;
  } = {}): SeedLogEntry {
    t.seq += 1;
    const e: SeedLogEntry = {
      id: `dl-seed-${(idn += 1)}`,
      ticketNo: t.no,
      seq: t.seq,
      at: stamp(at),
      kind: '人工',
      poolId: t.pool,
      poolLabel: poolLabel(t.pool),
      ruleName: o.ruleName ?? ruleOf(t.pool, t.snap),
      globalMode: mode.globalMode,
      groupMode: mode.groupMode,
      effectiveMode: mode.effectiveMode,
      snapshot: snapshotOf(t, at),
      manual: { action, operator, ...(o.target ? { target: o.target } : {}), ...(o.reason ? { reason: o.reason } : {}) },
      ...(o.overCap ? { overCap: o.overCap } : {}),
      ...(o.firstRespAt != null ? { firstRespAt: stamp(o.firstRespAt) } : {}),
    };
    logs.push(e);
    return e;
  }

  return { logs, judge, manual, members, eligible, poolLabel, groupLabel, between, pick, capOf };
}

type Builder = ReturnType<typeof makeBuilder>;

const REASSIGN_REASONS = ['客户要求更换处理人', '原处理人临时外出培训', '需熟悉该产品的坐席跟进'];
const TRANSFER_REASONS = ['该客户近期由其跟进', '跨组协助处理'];
const FAIL_REASONS: DispatchFailReason[] = ['均达个人上限', '均达个人上限', '均达个人上限', '无可接单成员', '无画像匹配成员', '无画像匹配成员'];

/* ------------------------------------------------------------------ */
/* 上线以来（前 13 天）                                                   */
/* ------------------------------------------------------------------ */

interface Timeline {
  today0: number;
  /** 上线：全局切为自动派单，先开放二线处理组池 */
  launchStart: number;
  /** 放开硬件、综合、技术支持三池 */
  multiStart: number;
  /** 派单服务异常，管理员把全局切为混合派单 / 切回自动派单 */
  mixedStart: number;
  mixedEnd: number;
}

function timelineOf(now: number): Timeline {
  const today0 = dayStartOf(now);
  const at = (d: number, h: number, m = 0) => today0 - d * DAY + h * HOUR + m * MIN;
  return {
    today0,
    launchStart: at(13, 9, 30),
    multiStart: at(4, 10, 30),
    mixedStart: at(3, 14, 5),
    mixedEnd: at(3, 14, 40),
  };
}

function buildHistory(b: Builder, agents: DispatchAgent[], tl: Timeline, r: () => number, now: number,
  noteTake: (name: string, at: number) => void) {
  const A = (n: string) => agents.find((a) => a.name === n)!;
  const respAt = (take: number) => {
    const at = take + (6 + 18 * r() ** 1.3) * MIN;
    return at < now ? at : undefined;
  };
  for (let d = 13; d >= 1; d -= 1) {
    const ds = tl.today0 - d * DAY;
    const wd = new Date(ds).getDay();
    const weekend = wd === 0 || wd === 6;
    let serial = 50000;
    const newTk = (pool: string, at: number, type?: '咨询' | '投诉'): Tk => {
      const base = b.pick(SNAPS[pool]);
      const snap: Snap = type ? { ...base, ticketType: type } : base;
      const x = r();
      const priority: Priority = x < 0.05 ? 'P0' : x < 0.25 ? 'P1' : x < 0.9 ? 'P2' : 'P3';
      serial += 1 + Math.floor(r() * 3);
      return {
        no: `${snap.ticketType === '投诉' ? 'IFLYTS' : 'IFLYZX'}-${ymd(ds)}-${serial}`,
        pool, snap, priority,
        remain0: priority === 'P0' ? b.between(9, 15) : b.between(180, FIRST_RESP_LIMIT[priority] - 10),
        enteredAt: at, seq: 0,
      };
    };
    const from = Math.max(ds + 8 * HOUR + 40 * MIN, tl.launchStart);
    const to = ds + 18 * HOUR + 20 * MIN;
    const stageAt = (ts: number) => (ts < tl.multiStart ? 'single' : 'multi');
    const volume = { single: weekend ? 8 : 13, multi: weekend ? 13 : 21 }[stageAt(from)];
    const times = Array.from({ length: volume }, () => from + r() * (to - from)).sort((x, y) => x - y);

    // 派单服务异常当日：系统异常判定，留原池（管理员切为混合派单前）
    if (ds <= tl.mixedStart && tl.mixedStart < ds + DAY) {
      for (const m of [1, 2, 4]) {
        const at = tl.mixedStart - (5 - m) * MIN;
        const t = newTk(m === 2 ? 'general' : 'line2', at);
        b.judge(t, at, { trigger: '新单', path: '留池', mode: FORMAL, status: null, failReason: '系统异常' });
        const who = b.pick(b.eligible(t.pool));
        const take = at + b.between(8, 20) * MIN;
        b.manual(t, take, '班组长指派', LEADER, GLOBAL_MIXED, { target: who.name, firstRespAt: respAt(take) });
      }
    }

    let movedToTech = false;
    for (const ts of times) {
      const stage = stageAt(ts);
      const pools = stage === 'single' ? ['line2'] : ['line2', 'general', 'hardware', 'tech'];
      const x = r();
      const pool = pools.length === 1 ? 'line2' : x < 0.4 ? 'line2' : x < 0.7 ? 'general' : x < 0.88 ? 'hardware' : 'tech';
      const elig = b.eligible(pool);
      const sc = r();
      // 全局混合派单期间：留池，组内领取
      if (ts >= tl.mixedStart && ts < tl.mixedEnd) {
        const t = newTk(pool, ts);
        b.judge(t, ts, { trigger: '新单', path: '留池', mode: GLOBAL_MIXED, status: null });
        const who = b.pick(elig);
        const take = ts + b.between(4, 12) * MIN;
        b.manual(t, take, '二线领取', who.name, GLOBAL_MIXED, { target: who.name, firstRespAt: respAt(take) });
        noteTake(who.name, take);
        continue;
      }
      const reserve = sc >= 0.82 && sc < 0.85;
      const t = newTk(pool, ts, reserve ? '投诉' : undefined);
      const trigger: DispatchTrigger = pool === 'tech' ? (r() < 0.6 ? '升级三线' : '调剂到池') : r() < 0.1 ? '售后转回' : '新单';
      const agent = b.pick(elig);
      let assignAt: number | null = null;
      if (sc < 0.4) {
        assignAt = ts;
        b.judge(t, ts, { trigger, path: '加权评分', mode: FORMAL, chosen: agent, firstRespAt: respAt(ts) });
      } else if (sc < 0.5) {
        assignAt = ts;
        b.judge(t, ts, { trigger, path: '原处理人', mode: FORMAL, chosen: agent, firstRespAt: respAt(ts) });
      } else if (sc < 0.78) {
        b.judge(t, ts, { trigger, path: '排队', mode: FORMAL, status: '排队中' });
        assignAt = ts + b.between(2, 16) * MIN;
        b.judge(t, assignAt, { trigger: '补单扫描', path: '加权评分', mode: FORMAL, chosen: agent, firstRespAt: respAt(assignAt) });
      } else if (sc < 0.82) {
        assignAt = ts;
        b.judge(t, ts, { trigger, path: '组内放宽', relaxLevel: r() < 0.7 ? 1 : 2, mode: FORMAL, chosen: agent, firstRespAt: respAt(ts) });
      } else if (reserve) {
        const relation = relationOf(trigger, ts);
        b.judge(t, ts, { trigger, path: '预留', mode: FORMAL, status: '等原处理人', relation });
        assignAt = ts + b.between(3, 12) * MIN;
        b.judge(t, assignAt, { trigger: '补单扫描', path: '原处理人', mode: FORMAL, chosen: agent, firstRespAt: respAt(assignAt), relation });
      } else if (sc < 0.93) {
        const reason = b.pick(FAIL_REASONS);
        let fbAt = ts;
        if (reason === '均达个人上限') {
          b.judge(t, ts, { trigger, path: '排队', relaxLevel: 2, mode: FORMAL, status: '排队中' });
          fbAt = ts + b.between(15, 22) * MIN;
        }
        b.judge(t, fbAt, {
          trigger: reason === '均达个人上限' ? '放宽产品范围' : trigger, path: '兜底回池', mode: FORMAL, status: '派单失败回池', failReason: reason,
          relaxLevel: reason === '无画像匹配成员' || reason === '均达个人上限' ? 2 : 0,
        });
        const byLeader = r() < 0.45;
        const take = fbAt + b.between(5, 30) * MIN;
        b.manual(t, take, byLeader ? '班组长指派' : '二线领取', byLeader ? LEADER : agent.name, FORMAL,
          { target: agent.name, firstRespAt: respAt(take) });
        noteTake(agent.name, take);
        continue;
      } else {
        assignAt = ts;
        b.judge(t, ts, { trigger, path: '加权评分', mode: FORMAL, chosen: agent, firstRespAt: respAt(ts) });
      }
      noteTake(agent.name, assignAt);
      const u = r();
      if (u < 0.025 && elig.length > 1) {
        const to2 = b.pick(elig.filter((a) => a.name !== agent.name));
        const at2 = assignAt + b.between(20, 90) * MIN;
        b.manual(t, at2, '改派', LEADER, FORMAL, { target: to2.name, reason: b.pick(REASSIGN_REASONS) });
        noteTake(to2.name, at2);
      } else if (u < 0.04 && elig.length > 1) {
        const to2 = b.pick(elig.filter((a) => a.name !== agent.name));
        const at2 = assignAt + b.between(20, 90) * MIN;
        b.manual(t, at2, '调剂到人', LEADER, FORMAL, { target: to2.name, reason: b.pick(TRANSFER_REASONS) });
        noteTake(to2.name, at2);
      } else if (!movedToTech && stage === 'multi' && pool === 'general' && !weekend) {
        // 调剂到池：综合处理组 → 技术支持组池，重新派送
        movedToTech = true;
        const at2 = assignAt + b.between(25, 60) * MIN;
        b.manual(t, at2, '调剂到池', agent.name, FORMAL, { target: b.poolLabel('tech'), reason: '需技术支持排查接口问题' });
        t.pool = 'tech';
        const tech = A('陈技支');
        b.judge(t, at2, { trigger: '调剂到池', path: '加权评分', mode: FORMAL, chosen: tech, candidates: 1, firstRespAt: respAt(at2) });
        noteTake(tech.name, at2);
      }
    }

    // 专属工单线的组（小智、教育支持混合派单，教育刷机人工派单）：组内领取
    const offCount = weekend ? 3 : 5;
    for (let i = 0; i < offCount; i += 1) {
      const pool = (['xiaozhi', 'edu-flash', 'edu'] as const)[i % 3];
      const ts = from + r() * (to - from);
      const t = newTk(pool, ts);
      const who = pool === 'xiaozhi' ? '谭小智' : pool === 'edu-flash' ? (r() < 0.75 ? '许文静' : '王坐席') : (r() < 0.75 ? '何教支' : '张三');
      b.manual(t, ts + b.between(3, 20) * MIN, '二线领取', who, pool === 'edu-flash' ? FLASH_MANUAL : OFF_GROUP, { target: who });
    }
  }
}

/* ------------------------------------------------------------------ */
/* 今日                                                                 */
/* ------------------------------------------------------------------ */

/** 今日引擎派出：[池, 坐席, 时刻占今日已过时长的比例] */
const TODAY_ASSIGNS: [string, string, number][] = [
  ['line2', '张三', 0.05], ['line2', '王坐席', 0.08], ['hardware', '陈坐席', 0.1], ['general', '张三', 0.12],
  ['general', '徐璐', 0.15], ['line2', '王坐席', 0.18], ['line2', '张三', 0.2], ['hardware', '李四', 0.21],
  ['tech', '陈技支', 0.22], ['general', '刘洋', 0.25], ['line2', '王坐席', 0.3], ['general', '徐璐', 0.33],
  ['general', '张三', 0.35], ['line2', '张三', 0.4], ['line2', '王坐席', 0.42], ['general', '刘洋', 0.47],
  ['line2', '林坐席', 0.5], ['tech', '陈技支', 0.55], ['general', '林坐席', 0.58], ['general', '徐璐', 0.6],
  ['line2', '林坐席', 0.65], ['general', '刘洋', 0.7], ['tech', '陈技支', 0.75], ['general', '徐璐', 0.78],
  ['line2', '林坐席', 0.8], ['general', '林坐席', 0.92],
];
/** 派出方式：d 加权评分直派、o 原处理人、x 组内放宽、q 排队后由扫描派出、r 预留后由扫描派回原处理人 */
const TODAY_VIA = 'qdqoqqdqrqdqqoqdqqxqdqrdoq';
const QUEUE_WAITS = [3, 5, 2, 8, 4, 11, 6, 3, 14, 7, 4, 9, 5, 12];
const RESERVE_WAITS = [6, 9];
/** 今日组内领取：[池, 坐席, 比例] */
const TODAY_CLAIMS: [string, string, number][] = [
  ['xiaozhi', '谭小智', 0.07], ['edu', '何教支', 0.1], ['edu-flash', '许文静', 0.14], ['line2', '王组长', 0.28],
  ['xiaozhi', '谭小智', 0.29], ['tech', '周技支', 0.3], ['edu', '何教支', 0.32], ['edu-flash', '许文静', 0.38],
  ['xiaozhi', '谭小智', 0.5], ['tech', '周技支', 0.5], ['general', '王组长', 0.52], ['edu', '何教支', 0.55],
  ['edu-flash', '许文静', 0.6], ['tech', '周技支', 0.68], ['xiaozhi', '谭小智', 0.71], ['line2', '王组长', 0.73],
  ['edu', '何教支', 0.77], ['edu-flash', '许文静', 0.84], ['hardware', '李四', 0.16], ['tech', '周技支', 0.82],
  ['line2', '王组长', 0.88],
];

interface TodayCtx {
  b: Builder;
  agents: DispatchAgent[];
  now: number;
  t0: number;
  r: () => number;
  noteTake: (name: string, at: number) => void;
}

function buildToday({ b, agents, now, t0, r, noteTake }: TodayCtx) {
  const E = now - t0;
  const at = (f: number) => t0 + f * E;
  const A = (n: string) => agents.find((a) => a.name === n)!;
  const hwMixedAt = at(0.3);
  const respAt = (take: number) => {
    const x = take + (6 + 18 * r() ** 1.2) * MIN;
    return x < now - 2 * MIN ? x : undefined;
  };
  let serial = 50000;
  const newTk = (pool: string, enter: number, type?: '咨询' | '投诉'): Tk => {
    const base = b.pick(SNAPS[pool]);
    const snap: Snap = type ? { ...base, ticketType: type } : base;
    const x = r();
    const priority: Priority = x < 0.2 ? 'P1' : x < 0.92 ? 'P2' : 'P3';
    serial += 1 + Math.floor(r() * 2);
    return {
      no: `${snap.ticketType === '投诉' ? 'IFLYTS' : 'IFLYZX'}-${ymd(now)}-${serial}`,
      pool, snap, priority, remain0: b.between(220, FIRST_RESP_LIMIT[priority] - 10), enteredAt: enter, seq: 0,
    };
  };

  let qi = 0;
  let ri = 0;
  TODAY_ASSIGNS.forEach(([pool, name, f], i) => {
    const agent = A(name);
    const take = at(f);
    const via = TODAY_VIA[i];
    const wait = via === 'q' ? QUEUE_WAITS[qi++] : via === 'r' ? RESERVE_WAITS[ri++] : 0;
    const enter = take - wait * MIN;
    const t = newTk(pool, enter, via === 'r' ? '投诉' : undefined);
    const trigger: DispatchTrigger = pool === 'tech' ? '升级三线' : i % 7 === 3 ? '售后转回' : '新单';
    if (via === 'q') {
      b.judge(t, enter, { trigger, path: '排队', mode: FORMAL, status: '排队中' });
      b.judge(t, take, { trigger: '补单扫描', path: '加权评分', mode: FORMAL, chosen: agent, firstRespAt: respAt(take) });
    } else if (via === 'r') {
      const relation = relationOf(trigger, enter);
      b.judge(t, enter, { trigger, path: '预留', mode: FORMAL, status: '等原处理人', relation });
      b.judge(t, take, { trigger: '补单扫描', path: '原处理人', mode: FORMAL, chosen: agent, firstRespAt: respAt(take), relation });
    } else {
      const path: DispatchPath = via === 'o' ? '原处理人' : via === 'x' ? '组内放宽' : '加权评分';
      // 今日三次派回原处理人各取一种关系；一次综合打分前，同客户近期的原处理人因上次回访不满意不派回
      const relation: OriginalRelation | undefined = via === 'o' ? (trigger === '售后转回' ? '本单退回' : i === 13 ? '关联单' : '同客户近期') : undefined;
      const excluded = i === 1 ? [{ relation: '同客户近期' as const, name: '林坐席', reason: '上次回访不满意' as const }] : undefined;
      b.judge(t, take, { trigger, path, relaxLevel: via === 'x' ? 2 : 0, mode: FORMAL, chosen: agent, firstRespAt: respAt(take), relation, excluded });
    }
    noteTake(name, take);
    // 改派（人工换人）：班组长把张三的一单改派给林坐席
    if (i === 13) {
      const at2 = take + 28 * MIN;
      b.manual(t, at2, '改派', LEADER, FORMAL, { target: '林坐席', reason: '客户要求更换熟悉该产品的坐席' });
      noteTake('林坐席', at2);
    }
  });

  // 硬件缺陷组池切为混合派单后：留池，组内领取、指派、调剂到人
  const hw: [number, ManualAction, string, string | undefined][] = [
    [0.35, '调剂到人', '李四', '李四熟悉学习机返修流程'],
    [0.45, '二线领取', '陈坐席', undefined],
    [0.6, '班组长指派', '陈坐席', undefined],
  ];
  for (const [f, action, target, reason] of hw) {
    const enter = Math.max(at(f), hwMixedAt + MIN);
    const t = newTk('hardware', enter);
    b.judge(t, enter, { trigger: '新单', path: '留池', mode: HW_MIXED, status: null });
    const take = enter + b.between(6, 14) * MIN;
    b.manual(t, take, action, action === '二线领取' ? target : LEADER, HW_MIXED, { target, reason, firstRespAt: respAt(take) });
    noteTake(target, take);
  }

  // 班组长指派超出个人上限（超额指派）
  {
    const take = at(0.62);
    const t = newTk('line2', take - 5 * MIN);
    b.manual(t, take, '班组长指派', LEADER, FORMAL, { target: '王坐席', reason: '客户点名要求王坐席跟进', overCap: '超额指派', firstRespAt: respAt(take) });
    noteTake('王坐席', take);
  }

  // 组内领取
  for (const [pool, name, f] of TODAY_CLAIMS) {
    const take = at(f);
    const t = newTk(pool, take - b.between(4, 18) * MIN);
    const mode = pool === 'edu-flash' ? FLASH_MANUAL : ['xiaozhi', 'edu'].includes(pool) ? OFF_GROUP : FORMAL;
    b.manual(t, take, '二线领取', name, mode, { target: name, ...(mode === FORMAL ? { firstRespAt: respAt(take) } : {}) });
    noteTake(name, take);
  }
  return { hwMixedAt };
}

/* ------------------------------------------------------------------ */
/* 池内待派（真实工单行）                                                */
/* ------------------------------------------------------------------ */

interface PoolSeed {
  key: string;
  pool: string;
  type: '咨询' | '投诉';
  priority: Priority;
  title: string;
  customer: string;
  snap: Snap;
  /** 进入派单距今（分钟） */
  enteredAgo: number;
  /** 进入派单时首响剩余（分钟） */
  remain0: number;
  status: DispatchStatus | null;
}

const POOL_SEEDS: PoolSeed[] = [
  { key: 'L-Q1', pool: 'line2', type: '咨询', priority: 'P2', title: '智能音箱在线播放频繁中断', customer: '邵明',
    snap: SNAPS.line2[0], enteredAgo: 8, remain0: 410, status: '排队中' },
  { key: 'L-Q2', pool: 'line2', type: '咨询', priority: 'P2', title: '耳机升级固件后无法播放本地音乐', customer: '江珊',
    snap: SNAPS.line2[1], enteredAgo: 19, remain0: 440, status: '排队中' },
  { key: 'L-F1', pool: 'line2', type: '咨询', priority: 'P1', title: '录音笔转写结果出现乱码', customer: '冯涛',
    snap: SNAPS.line2[2], enteredAgo: 48, remain0: -5, status: '派单失败回池' },
  { key: 'L-R1', pool: 'line2', type: '投诉', priority: 'P1', title: '翻译机识别不准，二次来电投诉', customer: '顾婷',
    snap: { ...SNAPS.line2[4], ticketType: '投诉' }, enteredAgo: 2, remain0: 300, status: '等原处理人' },
  { key: 'G-Q1', pool: 'general', type: '咨询', priority: 'P2', title: '扫地机器人 APP 无法绑定新手机', customer: '韦力',
    snap: SNAPS.general[2], enteredAgo: 12, remain0: 430, status: '排队中' },
  { key: 'G-R1', pool: 'general', type: '投诉', priority: 'P1', title: '门锁安装预约两次爽约投诉', customer: '褚倩',
    snap: { businessType: '智能硬件', ticketType: '投诉', productCategory: '智能硬件', product: '智能门锁 L1', ticketSource: '电话', customerType: '个人用户' },
    enteredAgo: 1, remain0: 320, status: '等原处理人' },
  { key: 'G-F1', pool: 'general', type: '咨询', priority: 'P2', title: '会员续费后权益未到账', customer: '房宇',
    snap: SNAPS.general[1], enteredAgo: 50, remain0: 150, status: '派单失败回池' },
  { key: 'T-F1', pool: 'tech', type: '咨询', priority: 'P2', title: 'API 回调签名校验失败，需三线排查', customer: '欧阳青',
    snap: SNAPS.tech[0], enteredAgo: 28, remain0: 400, status: '派单失败回池' },
  { key: 'T-R1', pool: 'tech', type: '投诉', priority: 'P1', title: '质检系统单点登录反复失败，投诉响应慢', customer: '程立',
    snap: { ...SNAPS.tech[1], ticketType: '投诉' }, enteredAgo: 2, remain0: 330, status: '等原处理人' },
  { key: 'H-R1', pool: 'hardware', type: '投诉', priority: 'P1', title: '学习机 T20 返修后再次花屏', customer: '包蕾',
    snap: SNAPS.hardware[2], enteredAgo: 1, remain0: 350, status: '等原处理人' },
  { key: 'H-P1', pool: 'hardware', type: '咨询', priority: 'P2', title: '门锁断网后无法远程开锁', customer: '尹航',
    snap: SNAPS.hardware[1], enteredAgo: 16, remain0: 420, status: null },
];

/**
 * 硬件缺陷组池里的客服⇄售后种子单：未经派单进池，进池时间距今（分钟）。
 * 售后业务时间线（建单、转出、回流时间）不动，池内等待时长从进池时间起算。
 */
export const POOL_ENTERED_AGO_MIN: Record<string, number> = {
  'IFLYZX-20260924-00012': 26,
  'IFLYZX-20260930-00041': 55,
  'IFLYZX-20261003-00047': 38,
};

/**
 * 教育刷机处理组池、小智工单处理组池的老种子单：未经派单进池，进池时间距今（分钟）。
 * 业务时间线字段不动；工单行由各自服务落库，进池时间单独记在派单缓存里。
 */
export const SPECIAL_POOL_ENTERED_AGO_MIN: Record<string, number> = {
  'IFLYZX-20260915-00011': 42,
  'IFLYZX-20260915-00020': 18,
  'IFLYZX-20260918-00008': 33,
};

/** 预留目标（当日在班、当前不可用：满额或小休） */
const RESERVE_FOR: Record<string, string> = { 'L-R1': '王坐席', 'G-R1': '刘洋', 'T-R1': '陈技支', 'H-R1': '李四' };

function slaTextOf(min: number): { slaText: string; slaSub: string; slaState: 'ok' | 'soon' | 'overdue' } {
  const m = Math.round(Math.abs(min));
  const t = `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
  if (min < 0) return { slaText: `已超 ${t}`, slaSub: '已超时', slaState: 'overdue' };
  return { slaText: `${t}:00`, slaSub: min < 60 ? '距超时' : '充足', slaState: min < 60 ? 'soon' : 'ok' };
}

function buildPool(b: Builder, now: number, rules: PoolRule[]) {
  const rows: Ticket[] = [];
  const states: Record<string, TicketDispatchState> = {};
  POOL_SEEDS.forEach((s, i) => {
    const enteredAt = now - s.enteredAgo * MIN;
    const no = `${s.type === '投诉' ? 'IFLYTS' : 'IFLYZX'}-${ymd(now)}-${80001 + i}`;
    const t: Tk = { no, pool: s.pool, snap: s.snap, priority: s.priority, remain0: s.remain0, enteredAt, seq: 0 };
    const label = b.groupLabel(s.pool);
    const pl = b.poolLabel(s.pool);
    const tl: Omit<TimelineEntry, 'id'>[] = [];
    const sys = (how: string, what: string, ms: number) => tl.push({
      category: 'node', action: 'transfer', who: SYSTEM, role: '系统', systemActor: true, how, what, when: stamp(ms),
    } as Omit<TimelineEntry, 'id'>);
    const st: TicketDispatchState = {
      ticketNo: no, poolId: s.pool, ruleId: null, enteredAt, status: s.status, relaxLevel: 0, queueSince: null,
      firstRespTotalMin: Math.max(FIRST_RESP_LIMIT[s.priority], s.remain0), firstRespDueAt: enteredAt + s.remain0 * MIN, seq: 0,
    };
    const mode = s.pool === 'hardware' ? HW_MIXED : FORMAL;
    if (s.key === 'L-Q1' || s.key === 'G-Q1') {
      b.judge(t, enteredAt, { trigger: '新单', path: '排队', mode, status: '排队中' });
      st.queueSince = enteredAt;
      sys('排队等待', `${pl}排队：相符成员均已满额`, enteredAt);
    } else if (s.key === 'L-Q2') {
      b.judge(t, enteredAt, { trigger: '新单', path: '排队', mode, status: '排队中' });
      const relaxAt = enteredAt + 15 * MIN;
      b.judge(t, relaxAt, { trigger: '放宽产品范围', path: '排队', relaxLevel: 1, mode, status: '排队中' });
      Object.assign(st, { relaxLevel: 1, queueSince: relaxAt });
      sys('排队等待', `${pl}排队：相符成员均已满额`, enteredAt);
      sys('放宽产品范围', '产品放宽至同产品分类', relaxAt);
    } else if (s.key === 'L-F1') {
      b.judge(t, enteredAt, { trigger: '售后转回', path: '兜底回池', mode, status: '派单失败回池', failReason: '均达个人上限' });
            sys('退回工单池', `退回工单池（均达个人上限），已通知${label}班组长`, enteredAt);
    } else if (s.key === 'G-F1') {
      b.judge(t, enteredAt, { trigger: '新单', path: '排队', relaxLevel: 2, mode, status: '排队中' });
      const fbAt = enteredAt + 15 * MIN;
      b.judge(t, fbAt, { trigger: '放宽产品范围', path: '兜底回池', relaxLevel: 2, mode, status: '派单失败回池', failReason: '均达个人上限' });
      Object.assign(st, { relaxLevel: 2 });
      sys('排队等待', `${pl}排队：相符成员均已满额`, enteredAt);
      sys('退回工单池', `退回工单池（均达个人上限），已通知${label}班组长`, fbAt);
    } else if (s.key === 'T-F1') {
      const movedAt = enteredAt;
      b.manual({ ...t, pool: 'line2' }, movedAt, '调剂到池', LEADER, FORMAL, { target: pl, reason: '需技术支持排查接口问题', ruleName: '功能异常（迁移）' });
      t.seq = 1;
      b.judge(t, movedAt, { trigger: '调剂到池', path: '兜底回池', relaxLevel: 2, mode, status: '派单失败回池', failReason: '无画像匹配成员' });
      Object.assign(st, { relaxLevel: 2, designatedPool: true });
      sys('调剂到池', `调剂到池 → ${pl}；原因：需技术支持排查接口问题`, movedAt);
      sys('退回工单池', `退回工单池（无画像相符的成员），已通知${label}班组长`, movedAt);
    } else if (s.status === '等原处理人') {
      const who = RESERVE_FOR[s.key];
      const until = enteredAt + 15 * MIN;
      const relation: OriginalRelation = '同客户近期';
      b.judge(t, enteredAt, { trigger: s.pool === 'tech' ? '升级三线' : '新单', path: '预留', mode, status: '等原处理人', relation });
      Object.assign(st, { reserveFor: who, reserveUntil: until, reserveRelation: relation, reservedOnce: true, complaintTarget: undefined });
      sys('等原处理人', `等原处理人 ${who}（${relation}），${hm(until)} 到期`, enteredAt);
    } else {
      b.judge(t, enteredAt, { trigger: '新单', path: '留池', mode, status: null });
    }
    st.seq = t.seq;
    // 命中入池规则（按规则名对应 stores/dispatch 种子规则；技术支持组池为指定池、综合处理组池为默认池，无规则）
    st.ruleId = s.pool === 'line2' || s.pool === 'hardware' ? (rules.find((x) => x.name === ruleOf(s.pool, s.snap))?.id ?? null) : null;
    if (s.pool === 'tech') st.designatedPool = true;
    states[no] = st;
    const remainNow = Math.round(s.remain0 - s.enteredAgo);
    const created = enteredAt - (s.key === 'L-F1' ? 26 * 60 : 1) * MIN;
    rows.push({
      id: `dispatch-seed-${80001 + i}`, no, type: s.type, channel: s.snap.ticketSource === 'IM' ? '在线客服' : '电话',
      title: s.title, smartMarks: s.type === '投诉' ? ['情绪'] : [], customer: s.customer, vip: false,
      customerPhone: seedPhoneOf(i),
      product: s.snap.product, productCategory: s.snap.productCategory, businessType: s.snap.businessType,
      ...(s.snap.problem ? (() => { const [l1, l2, l3] = splitProblemPath(s.snap.problem!); return { problemL1: l1, problemL2: l2, problemL3: l3 }; })() : {}),
      ticketSource: s.snap.ticketSource,
      nodeStatus: '未认领', nodeStep: 1, nodeTotal: 5, priority: s.priority,
      ...slaTextOf(remainNow), slaMinutes: remainNow,
      resolveSlaText: '24:00:00', resolveSlaState: 'ok',
      assignee: null, tab: 'pool', groupId: s.pool, groupNames: [label],
      createdAt: stamp(created), updatedAt: stamp(enteredAt),
      eventTimeline: tl.map((e, k) => ({ ...e, id: `dispatch-${no}-seed-${k + 1}` })) as TimelineEntry[],
    } as unknown as Ticket);
  });
  rows.push(surveyBadRow(now, b.groupLabel('line2')));
  rows.push(...reserveHistoryRows(now, b));
  return { rows, states };
}

/** 四张等原处理人种子单的客户手机号（与 `buildPool` 同一算法） */
function seedPhoneOf(i: number): string {
  return `1591200${pad(80 + i)}${pad(i * 7 % 100)}`;
}

/** 等原处理人种子单的上一张工单标题：同一客户 2 天前由原处理人结案（关系「同客户近期」的依据，4.2） */
const RESERVE_HISTORY_TITLE: Record<string, string> = {
  'L-R1': '翻译机识别不准，首次来电反馈',
  'G-R1': '门锁安装预约改期',
  'T-R1': '质检系统单点登录失败排查',
  'H-R1': '学习机 T20 花屏返修登记',
};
function reserveHistoryRows(now: number, b: Builder): Ticket[] {
  const at = now - 2 * DAY;
  return POOL_SEEDS.flatMap((s, i) => {
    const title = RESERVE_HISTORY_TITLE[s.key];
    if (!title) return [];
    return [{
      id: `dispatch-seed-history-${i + 1}`, no: `IFLYZX-${ymd(at)}-${79100 + i}`, type: '咨询', channel: s.snap.ticketSource === 'IM' ? '在线客服' : '电话',
      title, smartMarks: [], customer: s.customer, vip: false, customerPhone: seedPhoneOf(i),
      product: s.snap.product, productCategory: s.snap.productCategory, businessType: s.snap.businessType,
      ...(s.snap.problem ? (() => { const [l1, l2, l3] = splitProblemPath(s.snap.problem!); return { problemL1: l1, problemL2: l2, problemL3: l3 }; })() : {}),
      ticketSource: s.snap.ticketSource,
      nodeStatus: '已结案', nodeStep: 5, nodeTotal: 5, priority: 'P2',
      slaText: '—', slaSub: '已结案', slaState: 'ok', slaMinutes: 9999,
      assignee: RESERVE_FOR[s.key], tab: 'done', groupId: s.pool, groupNames: [b.groupLabel(s.pool)],
      responded: true,
      createdAt: stamp(at - 5 * HOUR), updatedAt: stamp(at),
    } as unknown as Ticket];
  });
}

/**
 * 原处理人例外「上次回访不满意」的历史单（4.2）：客户庞悦 3 天前由林坐席结案，回访人员服务打 2 分（≤ 3 计服务不满意）。
 * 该客户 7 天内再来新单时，同客户近期的原处理人林坐席不派回、不保留。
 */
export const SURVEY_BAD_PHONE = '15912009901';
function surveyBadRow(now: number, groupLabel: string): Ticket {
  const at = now - 3 * DAY;
  const snap = SNAPS.line2[0];
  const [l1, l2, l3] = splitProblemPath(snap.problem!);
  return {
    id: 'dispatch-seed-survey-bad', no: `IFLYZX-${ymd(at)}-79001`, type: '咨询', channel: '电话',
    title: '智能音箱在线播放卡顿', smartMarks: [], customer: '庞悦', vip: false, customerPhone: SURVEY_BAD_PHONE,
    product: snap.product, productCategory: snap.productCategory, businessType: snap.businessType,
    problemL1: l1, problemL2: l2, problemL3: l3, ticketSource: snap.ticketSource,
    nodeStatus: '已结案', nodeStep: 5, nodeTotal: 5, priority: 'P2',
    slaText: '—', slaSub: '已结案', slaState: 'ok', slaMinutes: 9999,
    assignee: '林坐席', tab: 'done', groupId: 'line2', groupNames: [groupLabel],
    serviceScore: 2, responded: true,
    createdAt: stamp(at - 5 * HOUR), updatedAt: stamp(at),
  } as unknown as Ticket;
}

/* ------------------------------------------------------------------ */
/* 审计（近两周）                                                        */
/* ------------------------------------------------------------------ */

function buildAudits(tl: Timeline, today: { hwMixedAt: number; t0: number; now: number }, groups: DispatchGroup[]): DispatchAuditEntry[] {
  let n = 0;
  const a = (ms: number, operator: string, kind: DispatchAuditKind, target: string, before: string, after: string, reason?: string): DispatchAuditEntry => ({
    id: `da-seed-${(n += 1)}`, at: stamp(ms), operator, kind, target, before, after, ...(reason ? { reason } : {}),
  });
  const E = today.now - today.t0;
  const pl = (id: string) => `${groups.find((g) => g.id === id)?.label ?? id}池`;
  // 上线：先只开放二线处理组池，其余池切为混合派单（教育刷机处理组池保持人工派单），再把全局切为自动派单；第 4 天起放开硬件、综合、技术支持组池
  const toMixed = ['hardware', 'general', 'tech', 'xiaozhi', 'edu'].filter((id) => groups.some((g) => g.id === id));
  const toAuto = ['hardware', 'general', 'tech'];
  return [
    ...toMixed.map((id) => a(tl.launchStart, ADMIN, '派单方式', pl(id), '自动派单', '混合派单', '首批只开放二线处理组池自动派单')),
    a(tl.launchStart + MIN, ADMIN, '派单方式', '全局', '人工派单', '自动派单'),
    ...toAuto.map((id) => a(tl.multiStart, ADMIN, '派单方式', pl(id), '混合派单', '自动派单')),
    a(tl.mixedStart, ADMIN, '派单方式', '全局', '自动派单', '混合派单', '派单服务异常，暂停自动派单，改由组内领取'),
    a(tl.mixedEnd, ADMIN, '派单方式', '全局', '混合派单', '自动派单'),
    a(today.hwMixedAt, ADMIN, '派单方式', '硬件缺陷组池', '自动派单', '混合派单', '备件库存系统今日升级，硬件故障单需人工核对备件后再派'),
    a(today.t0 + 0.45 * E, LEADER, '个人上限', '王坐席', '默认 13', '3'),
    a(today.t0 + 0.55 * E, LEADER, '个人上限', '张三', '40', '32'),
  ];
}

/* ------------------------------------------------------------------ */
/* 入口                                                                 */
/* ------------------------------------------------------------------ */

/** 坐席当前状态（小休 / 签出起点距今分钟）；其余就绪 */
const AWAY: Record<string, { signIn: '小休' | '签出'; agoMin: number }> = {
  刘洋: { signIn: '小休', agoMin: 25 },
  李四: { signIn: '小休', agoMin: 20 },
  陈技支: { signIn: '小休', agoMin: 35 },
  徐璐: { signIn: '签出', agoMin: 50 },
};
/** 当日未签入 */
const OFF_TODAY = ['吴投诉'];
/** 刚签入、尚未点就绪（不被派单、不可领取） */
const NOT_READY = ['秦督导'];

export function buildDispatchDemo(now: number, agents: DispatchAgent[], groups: DispatchGroup[], rules: PoolRule[]): DispatchDemo {
  const tl = timelineOf(now);
  const t0 = Math.min(tl.today0 + 8.5 * HOUR, now - 4 * HOUR);
  const r = rng(Math.floor(tl.today0 / DAY) * 31 + 7);
  const b = makeBuilder(agents, groups, r);
  const takes: Record<string, number[]> = {};
  const noteTake = (name: string, at: number) => { (takes[name] ??= []).push(at); };

  buildHistory(b, agents, tl, r, now, noteTake);
  const { hwMixedAt } = buildToday({ b, agents, now, t0, r, noteTake });
  const pool = buildPool(b, now, rules);
  const logs = b.logs.filter((l) => l.at <= stamp(now)).sort((x, y) => (x.at < y.at ? -1 : x.at > y.at ? 1 : 0));

  const agentPatch: Record<string, Partial<DispatchAgent>> = {};
  const day = `${new Date(now).getFullYear()}-${pad(new Date(now).getMonth() + 1)}-${pad(new Date(now).getDate())}`;
  for (const a of agents) {
    const mine = (takes[a.name] ?? []).filter((x) => x <= now && x >= now - DAY).sort((x, y) => x - y);
    const p: Partial<DispatchAgent> = { onDutyDay: day };
    const away = AWAY[a.name];
    if (OFF_TODAY.includes(a.name)) {
      Object.assign(p, { signIn: '签出', signedInToday: false, signInSince: null, onDutyMs: 0 });
    } else if (NOT_READY.includes(a.name)) {
      Object.assign(p, { signIn: '未就绪', signedInToday: true, signInSince: null, onDutyMs: 0 });
    } else if (away) {
      Object.assign(p, { signIn: away.signIn, signedInToday: true, signInSince: null, onDutyMs: Math.max(0, now - away.agoMin * MIN - t0) });
    } else {
      Object.assign(p, { signIn: '就绪', signedInToday: true, signInSince: t0, onDutyMs: 0 });
    }
    if (mine.length) Object.assign(p, { lastTakenAt: mine[mine.length - 1], recentTakes: mine });
    agentPatch[a.name] = p;
  }
  agentPatch['王坐席'] = { ...agentPatch['王坐席'], capOverride: 3 };
  agentPatch['张三'] = { ...agentPatch['张三'], capOverride: 32 };

  return {
    logs,
    audits: buildAudits(tl, { hwMixedAt, t0, now }, groups),
    ticketStates: pool.states,
    overAssigned: { 王坐席: true },
    rows: pool.rows,
    agentPatch,
  };
}
