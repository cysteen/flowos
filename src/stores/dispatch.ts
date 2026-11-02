import { defineStore } from 'pinia';
import { reactive, ref, toRaw } from 'vue';
import { TICKETS } from '@/mock/tickets';
import { POOL_GROUPS, isFirstResponded, type Ticket } from '@/views/tickets/types/ticket';
import type { TimelineEntry } from '@/views/tickets/types/ticketDetail';
import { CUSTOMER_DIRECTORY } from '@/views/tickets/types/createTicket';
import { isFlashTicket } from '@/views/tickets/types/flash';
import { isXiaozhiTicket } from '@/views/tickets/types/xiaozhi';
import { isRefundTicket } from '@/views/tickets/types/refund';
import {
  registerDispatchEngine, type DispatchContext, type DispatchOutcome,
} from '@/views/tickets/composables/aftersaleEvents';
import {
  DEFAULT_POOL_ID, DEFAULT_POOL_LABEL, IN_TRANSIT_COUNT_RULE, MANAGEMENT_ROLES, PRIORITY_SCORE, PROFICIENCY_SCORE,
  RELAX_LEVEL_LABEL, TAKEN_MESSAGE, PROFILE_DIMS,
  defaultDispatchConfig, emptyProfile, isProfileConfigured, stricterMode,
  type AgentProfile, type DispatchAgent, type DispatchAuditEntry, type DispatchAuditKind, type DispatchConfig,
  type DispatchFailReason, type DispatchGroup, type DispatchLogEntry, type DispatchPath, type DispatchResult,
  type DispatchRole, type DispatchStatus, type DispatchTrigger, type GateKey, type ManualAction, type OccupyResult,
  ROLLOUT_STAGES,
  type PoolMode, type PoolRule, type PoolRuleConditions, type ProductPick, type Proficiency, type RelaxLevel,
  type RolloutStage, type RunMode, type ScoreDetail, type ScoreFactorKey, type SignInStatus, type TicketDispatchState,
} from '@/views/tickets/types/dispatch';
import { useNotifyLogStore } from './notifyLog';
import { useUserStore } from './user';
import { useFlashStore } from './flash';
import { useXiaozhiStore } from './xiaozhi';
import { useRefundStore } from './refund';

/**
 * 智能派单（【1215】PRD P0）：入池规则、人员画像 / 熟练度 / 个人上限 / 三级开关、池三态、派单引擎、派单日志与审计。
 *
 * 【数据】坐席、组、入池规则、配置、工单派单状态、派单日志、审计都在本 store；工单行只改处理人 / 子状态 / 归属组 / 履历，
 * 派单状态（等原处理人 / 排队中 / 派单失败回池）按工单号存在 `ticketStates`，不写进工单行。
 * 【持久化】`flowos-dispatch` 一个键，带版本号 `DISPATCH_CACHE_VERSION`；改种子必须升版本号。
 * 派单改写过的通用工单整行随本键落库、store 建立时回放到工单库（`main.ts` 启动即建立），刷新前后工单行与派单状态 / 日志一致；
 * 刷机 / 小智 / 个册退费单的工单行由各自服务缓存落库。
 * 【引擎】`dispatchTicket(ticket, trigger)` 走第 2、4 章主流程：入池 → 形态 → 原处理人优先（含投诉预留）→ 门槛 → 评分 → 派出 / 留池；
 * 试运行只写建议到派单日志、不改处理人。定时判定（预留到期、排队放宽、兜底、名额释放）由 `tick()` 驱动，store 内每 30 秒跑一次。
 */

const LS_KEY = 'flowos-dispatch';
/** 种子版本闸：改种子（坐席 / 组 / 规则 / 默认配置）必须加一 */
export const DISPATCH_CACHE_VERSION = 6;
const LOG_LIMIT = 800;
const AUDIT_LIMIT = 400;
const TICK_MS = 30_000;
const MIN = 60_000;
const SYSTEM = '系统';

/* ------------------------------------------------------------------ */
/* 工具                                                                 */
/* ------------------------------------------------------------------ */

const pad = (n: number) => String(n).padStart(2, '0');
function stamp(ms: number = Date.now()): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
function hm(ms: number): string {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function parseStamp(s?: string): number {
  if (!s) return NaN;
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(s);
  if (!m) return NaN;
  return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0)).getTime();
}
function digits(s?: string | null): string {
  return (s ?? '').replace(/\D/g, '');
}
function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}
function poolLabelOf(label: string): string {
  return `${label}池`;
}

/* ------------------------------------------------------------------ */
/* 种子                                                                 */
/* ------------------------------------------------------------------ */

/** 不进入派单的组：一线客服组（含一线刷机池，1.2） */
const NON_DISPATCH_GROUP_IDS = new Set(['line1']);
const LEADER = '王组长';

function seedGroups(): DispatchGroup[] {
  return POOL_GROUPS
    .filter((g) => !NON_DISPATCH_GROUP_IDS.has(g.id))
    .map((g) => ({ id: g.id, label: g.label, switchOn: true, mode: '正常态' as PoolMode, leaders: [LEADER] }));
}

const ANY: AgentProfile = {
  businessTypes: 'any', ticketTypes: 'any', products: 'any', problems: 'any', customerTypes: 'any',
};

function dayKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function dayStartOf(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function seedAgents(now: number): DispatchAgent[] {
  // 在岗时长种子：签入的坐席本班已签入约 3.5 小时（不早于当日零点）；小休的坐席当日累计 1.5 小时
  const shiftStart = Math.max(dayStartOf(now), now - 210 * MIN);
  const a = (
    name: string, staffNo: string, roles: DispatchRole[], groupIds: string[],
    o: Partial<DispatchAgent> = {},
  ): DispatchAgent => {
    const row: DispatchAgent = {
      name, staffNo, roles, groupIds,
      signIn: '签入', signedInToday: true, disabled: false,
      profile: { ...ANY }, proficiency: '熟练', capOverride: null,
      // 二线及以上专员开、管理角色关（8.1）
      personalSwitch: roles.some((r) => !MANAGEMENT_ROLES.includes(r)),
      lastTakenAt: now - 60 * MIN, recentTakes: [],
      ...o,
    };
    const on = row.signIn === '签入';
    return {
      ...row,
      signInSince: on ? shiftStart : null,
      onDutyMs: on ? 0 : Math.min(90 * MIN, now - dayStartOf(now)),
      onDutyDay: dayKey(now),
    };
  };
  return [
    // 王坐席：另一位二线坐席，名下只留少量种子单（原处理人、他人在途演示）；个人上限按默认值
    a('王坐席', 'E2001', ['二线专员'], ['line2', 'edu-flash'], {
      proficiency: '专家', lastTakenAt: now - 20 * MIN, recentTakes: [now - 20 * MIN, now - 55 * MIN, now - 90 * MIN],
    }),
    // 张三：二线专员演示账号，种子单的演示处理人（我的任务、已办、审核、催补等）；同属教育刷机处理组（刷机池演示）、
    // 教育支持组（个册退费种子单的组员）。名下种子在途 34 张，个人上限设 40：不超限，并留出几张名额接引擎派单
    a('张三', 'E2002', ['二线专员'], ['line2', DEFAULT_POOL_ID, 'edu-flash', 'edu'], {
      capOverride: 40,
      profile: { ...ANY, ticketTypes: ['咨询', '建议'], products: [{ category: '智能硬件' }] },
      lastTakenAt: now - 50 * MIN, recentTakes: [now - 50 * MIN],
    }),
    a('林坐席', 'E2003', ['二线专员'], ['line2', DEFAULT_POOL_ID], {
      profile: { ...ANY, products: [{ category: '学习硬件' }] },
      lastTakenAt: now - 95 * MIN, recentTakes: [now - 95 * MIN, now - 110 * MIN],
    }),
    a('徐璐', 'E2004', ['二线专员'], [DEFAULT_POOL_ID], { proficiency: '专家', lastTakenAt: now - 130 * MIN }),
    a('刘洋', 'E2005', ['二线专员'], [DEFAULT_POOL_ID], { signIn: '小休', proficiency: '初级' }),
    a('陈坐席', 'E2006', ['二线专员'], ['hardware'], { lastTakenAt: now - 40 * MIN, recentTakes: [now - 40 * MIN] }),
    a('李四', 'E2007', ['二线专员'], ['hardware'], {
      signIn: '小休', proficiency: '初级', profile: { ...ANY, products: [{ category: '智能硬件' }] },
    }),
    a('何教支', 'E2008', ['二线专员'], ['edu'], { profile: { ...ANY, businessTypes: ['教育'] } }),
    a('许文静', 'E2301', ['二线刷机处理人'], ['edu-flash']),
    a('谭小智', 'E2401', ['小智工单处理人'], ['xiaozhi']),
    // 技术支持：三线技术支持组（技术支持池，12.5）成员。陈技支画像已配置接引擎派单；周技支画像未配置，不接引擎派单、可领取（6.3）
    a('陈技支', 'E3001', ['技术支持'], ['tech']),
    a('周技支', 'E3002', ['技术支持'], ['tech'], { profile: emptyProfile(), lastTakenAt: now - 70 * MIN }),
    a('王组长', 'E2101', ['班组长'], ['line2', DEFAULT_POOL_ID, 'hardware', 'edu'], { proficiency: '专家', personalSwitch: false }),
    a('秦督导', 'E2201', ['督导'], ['hardware'], { personalSwitch: false }),
    a('吴投诉', 'E2202', ['客诉专员'], ['edu', DEFAULT_POOL_ID], { personalSwitch: false }),
  ];
}

const T20: ProductPick[] = [{ category: '智能硬件', name: '学习机 T20' }, { category: '学习硬件', name: '学习机 T20' }];

function cond(p: Partial<PoolRuleConditions>): PoolRuleConditions {
  return { businessTypes: [], ticketTypes: [], problems: [], products: [], ticketSources: [], customerTypes: [], priorities: [], ...p };
}

/**
 * 入池规则种子：由规则引擎「派单 → 组」与问题分类「处理组」迁移而来（3.4），名称带「（迁移）」。
 * 规则引擎来源照搬优先级排前；问题分类来源按层级由深到浅；两处条件相同时问题分类那条置停用待复核。
 * 归属池映射到原型现有组池（一组一池）。
 */
function seedRules(now: number): PoolRule[] {
  const at = stamp(now);
  const r = (id: string, name: string, priority: number, c: Partial<PoolRuleConditions>, poolId: string,
    migratedFrom: PoolRule['migratedFrom'], enabled = true): PoolRule => ({
    id, name, priority, conditions: cond(c), poolId, enabled, migratedFrom, updatedBy: SYSTEM, updatedAt: at,
  });
  return [
    r('pr-1', '投诉自动派学习机组（迁移）', 1, { ticketTypes: ['投诉'], products: T20 }, 'hardware', '规则引擎派单'),
    r('pr-2', '自助刷机（迁移）', 10, { problems: ['售后/服务申请/自助刷机', '售后/服务申请/刷原生系统'] }, 'edu-flash', '问题分类处理组'),
    r('pr-3', '个册退费（迁移）', 11, { problems: ['个册退费/退费申请/个册退费'] }, 'edu', '问题分类处理组'),
    r('pr-4', '设备故障（迁移）', 20, { problems: ['设备故障'] }, 'hardware', '问题分类处理组'),
    r('pr-5', '功能异常（迁移）', 21, { problems: ['功能异常'] }, 'line2', '问题分类处理组'),
    r('pr-6', '学习机投诉（迁移）', 30, { ticketTypes: ['投诉'], products: T20 }, 'hardware', '问题分类处理组', false),
  ];
}

interface Persisted {
  version: number;
  savedAt: number;
  config: DispatchConfig;
  groups: DispatchGroup[];
  agents: DispatchAgent[];
  rules: PoolRule[];
  ticketStates: Record<string, TicketDispatchState>;
  overAssigned: Record<string, boolean>;
  logs: DispatchLogEntry[];
  audits: DispatchAuditEntry[];
  seq: number;
  /**
   * 派单改写过的通用工单行快照（处理人 / 子状态 / 归属池 / 履历等整行），启动时回放到工单库，
   * 刷新前后工单行与派单状态、派单日志一致。刷机 / 小智 / 个册退费单的工单行由各自服务的缓存落库，不在此存。
   */
  rows?: Record<string, Ticket>;
  health?: DispatchHealthState;
}

/** 自动降级判定的运行态（5.3 / 5.4） */
interface DispatchHealthState {
  /** 各项指标自此刻起持续达标（null＝当前未达标） */
  okSince: number | null;
  /** 引擎无响应起始时刻（开发态开关模拟） */
  engineDownSince: number | null;
  /** 坐席状态数据停止同步起始时刻（开发态开关模拟） */
  syncStalledSince: number | null;
}

function readCache(): Persisted | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Persisted;
    return v && v.version === DISPATCH_CACHE_VERSION ? v : null;
  } catch {
    return null;
  }
}

/**
 * 专属工单的到组通知（11.6：刷机、退费、小智到组通知同待领取提醒口径）。
 * 各服务在建立时登记自己的到组通知；引擎在该发待领取提醒的时点（正常态兜底回池、降级态 / 停派态 / 试运行新单首次进池）
 * 先交给登记的通知处理，返回 true 即已发；都不认领的工单发通用待领取提醒。
 */
type PoolArrivalNotifier = (t: Ticket) => boolean;
/** 按服务名登记，同名重复登记以后者为准（热更新重建服务时不重复发） */
const poolArrivalNotifiers = new Map<string, PoolArrivalNotifier>();
export function registerPoolArrivalNotifier(key: string, fn: PoolArrivalNotifier) {
  poolArrivalNotifiers.set(key, fn);
}

/* ------------------------------------------------------------------ */
/* 内部判定结构                                                          */
/* ------------------------------------------------------------------ */

interface GateOutcome {
  /** 通过全部门槛的候选 */
  passed: DispatchAgent[];
  /** 画像匹配且在班、仅因个人上限被挡的成员（排队判据） */
  blockedByCap: DispatchAgent[];
  /** 在班成员数（失败原因判据） */
  onDuty: number;
  drops: Partial<Record<GateKey, number>>;
}

interface Decision {
  path: DispatchPath;
  assignee: string | null;
  status: DispatchStatus | null;
  relaxLevel: RelaxLevel;
  score?: ScoreDetail;
  top3?: { name: string; total: number }[];
  drops?: Partial<Record<GateKey, number>>;
  candidateCount?: number;
  failReason?: DispatchFailReason;
  reserveFor?: string;
  reserveUntil?: number;
}

export interface DispatchOptions {
  /** 指定归属池（调剂到池、升级三线、专属工单落池点已定池时传入；不传按入池规则） */
  poolId?: string;
  /** 投诉对象（投诉回避） */
  complaintTarget?: string;
  /** 售后转回 / 回访打回：本单上一处理人（原处理人不受时间窗限制） */
  prevHandler?: string | null;
}

/** 池视图（供工单池管理、分派监控、工作台分段标题） */
export interface DispatchPoolView {
  id: string;
  label: string;
  poolLabel: string;
  effectiveMode: PoolMode;
  groupMode: PoolMode;
  switchOn: boolean;
  leaders: string[];
  waitingOriginal: number;
  queued: number;
  failed: number;
  /** 池内最长等待（分钟） */
  maxWaitMin: number;
  memberCount: number;
  configuredCount: number;
}

/** 自动降级指标视图（5.3）：供分派监控「确认回切」与监控卡片 */
export interface DispatchHealthView {
  /** 5 分钟内派单失败率（%）；样本不足为 null */
  failRate: number | null;
  /** 15 分钟内自动派单成功率（%）；样本不足为 null */
  successRate: number | null;
  /** 坐席状态数据未同步时长（分钟） */
  syncStaleMinutes: number;
  /** 引擎无响应时长（分钟） */
  engineDownMinutes: number;
  /** 当前触发的自动降级条件（文案）；空＝各项指标达标 */
  breaches: string[];
  /** 各项指标连续达标起始时刻；未达标为 null */
  okSince: number | null;
  /** 已连续达标分钟数 */
  okMinutes: number;
  /** 自动降级后已满足回切条件（各项指标连续 N 分钟达标） */
  resumeReady: boolean;
}

/** 坐席视图（负载、标识） */
export interface DispatchAgentView {
  agent: DispatchAgent;
  inTransit: number;
  cap: number;
  defaultCap: number;
  /** 默认值说明「N（角色基准 B × 熟练度 系数）」 */
  defaultCapText: string;
  profileConfigured: boolean;
  /** 超限（7.3）：不计上限的工单流回致在途超过上限 */
  overLimit: boolean;
  /** 超额指派（7.3） */
  overAssigned: boolean;
}

export const useDispatchStore = defineStore('dispatch', () => {
  const now0 = Date.now();
  const cached = readCache();

  const config = ref<DispatchConfig>(cached ? { ...defaultDispatchConfig(), ...cached.config } : defaultDispatchConfig());
  const groups = ref<DispatchGroup[]>(cached?.groups ?? seedGroups());
  const agents = ref<DispatchAgent[]>(cached?.agents ?? seedAgents(now0));
  const rules = ref<PoolRule[]>(cached?.rules ?? seedRules(now0));
  const ticketStates = ref<Record<string, TicketDispatchState>>(cached?.ticketStates ?? {});
  const overAssigned = ref<Record<string, boolean>>(cached?.overAssigned ?? {});
  const logs = ref<DispatchLogEntry[]>(cached?.logs ?? []);
  const audits = ref<DispatchAuditEntry[]>(cached?.audits ?? []);
  let seq = cached?.seq ?? 0;
  const health = ref<DispatchHealthState>(cached?.health ?? { okSince: null, engineDownSince: null, syncStalledSince: null });

  // 默认池（综合处理组）不在旧缓存里时补上
  if (!groups.value.some((g) => g.id === DEFAULT_POOL_ID)) {
    groups.value.push({ id: DEFAULT_POOL_ID, label: DEFAULT_POOL_LABEL, switchOn: true, mode: '正常态', leaders: [LEADER] });
  }

  /* ---------------- 工单行快照（刷新前后一致） ---------------- */

  /** 派单改写过的通用工单（按工单号）；持久化时取工单库里的现行整行 */
  const touchedRows = new Map<string, Ticket>();
  const savedRows: Record<string, Ticket> = cached?.rows ?? {};

  function isSpecialTicket(t: Ticket): boolean {
    return isFlashTicket(t) || isXiaozhiTicket(t) || isRefundTicket(t);
  }

  /** 记下派单改写过的工单（专属工单由各自服务落库）；建单弹窗先判定、后落工单库，故同时记住对象本身 */
  let persistQueued = false;
  function touchRow(t: Ticket) {
    if (isSpecialTicket(t)) return;
    touchedRows.set(t.no, toRaw(t));
    // 调用方在派单之后同一轮里还会补写工单行（处理页履历、超额指派等），本轮结束再落一次
    if (!persistQueued) {
      persistQueued = true;
      queueMicrotask(() => {
        persistQueued = false;
        persist();
      });
    }
  }

  function rowSnapshots(): Record<string, Ticket> {
    const out: Record<string, Ticket> = { ...savedRows };
    for (const [no, obj] of touchedRows) {
      const row = TICKETS.find((x) => x.no === no) ?? obj;
      out[no] = clone(toRaw(row));
    }
    return out;
  }

  /** 启动回放：工单库为种子态时，把派单改写过的工单行恢复到刷新前（工单库里没有的新建单补回） */
  function replayRows() {
    for (const [no, saved] of Object.entries(savedRows)) {
      if (!saved || isSpecialTicket(saved)) continue;
      const existing = TICKETS.find((x) => x.no === no);
      if (existing) {
        const r = reactive(existing) as unknown as Record<string, unknown>;
        Object.keys(existing).forEach((k) => { if (!(k in saved)) delete r[k]; });
        Object.assign(r, clone(saved));
        touchedRows.set(no, existing);
      } else {
        const row = clone(saved);
        TICKETS.unshift(row);
        touchedRows.set(no, row);
      }
    }
  }
  replayRows();

  function persist() {
    try {
      const data: Persisted = {
        version: DISPATCH_CACHE_VERSION,
        savedAt: Date.now(),
        config: config.value,
        groups: groups.value,
        agents: agents.value,
        rules: rules.value,
        ticketStates: ticketStates.value,
        overAssigned: overAssigned.value,
        logs: logs.value.slice(-LOG_LIMIT),
        audits: audits.value.slice(-AUDIT_LIMIT),
        seq,
        rows: rowSnapshots(),
        health: health.value,
      };
      localStorage.setItem(LS_KEY, JSON.stringify(data));
    } catch {
      /* 存储满或不可用时只保留内存态 */
    }
  }

  function nextId(prefix: string): string {
    seq += 1;
    return `${prefix}-${Date.now().toString(36)}-${seq}`;
  }

  function operatorName(): string {
    try {
      return useUserStore().name || SYSTEM;
    } catch {
      return SYSTEM;
    }
  }

  function audit(kind: DispatchAuditKind, target: string, before: string, after: string, operator?: string, reason?: string) {
    audits.value = [...audits.value, {
      id: nextId('da'), at: stamp(), operator: operator ?? operatorName(), kind, target, before, after,
      ...(reason ? { reason } : {}),
    }].slice(-AUDIT_LIMIT);
  }

  function notify(ticketNo: string, kind: 'assign' | 'group' | 'timeout' | 'accepted', title: string, receivers: string[], content: string, channel = 'IM') {
    try {
      useNotifyLogStore().emit({ ticketNo, event: `dispatch.${kind}`, kind, title, receivers, content, channel });
    } catch {
      /* 通知失败不影响派单 */
    }
  }

  /** 待领取提醒 / 到组通知（11.6）：专属工单走各自服务的到组通知，其余发通用待领取提醒 */
  function notifyPoolArrival(t: Ticket, poolId: string) {
    for (const fn of poolArrivalNotifiers.values()) {
      try {
        if (fn(t)) return;
      } catch {
        /* 某一路通知异常不影响其余 */
      }
    }
    notify(t.no, 'group', '待领取提醒', [groupOf(poolId)?.label ?? ''], `${poolLabel(poolId)}有一张待领取工单 ${t.no}。`);
  }

  /**
   * 形态、开关、上线阶段变更通知（5.4 / 8.3 / 17）：全部管理员及受影响班组长，渠道同 5.3（站内信与 IM）。
   * `groupIds` 为受影响的组；全局变更传全部组。
   */
  function notifyAdmins(title: string, groupIds: string[], content: string) {
    const leaders = [...new Set(groupIds.flatMap((id) => groupOf(id)?.leaders ?? []))];
    const receivers = ['全部管理员', ...leaders];
    notify('—', 'timeout', title, receivers, content, '站内信');
    notify('—', 'timeout', title, receivers, content, 'IM');
  }

  /* ---------------- 读：组 · 池 · 形态 ---------------- */

  function groupOf(id?: string | null): DispatchGroup | undefined {
    return id ? groups.value.find((g) => g.id === id) : undefined;
  }
  function isDispatchPool(id?: string | null): boolean {
    return !!groupOf(id);
  }
  function poolLabel(id: string): string {
    return poolLabelOf(groupOf(id)?.label ?? id);
  }
  /** 全局生效形态：全局开关关闭＝停派态（8.1） */
  function globalEffectiveMode(): PoolMode {
    return config.value.globalSwitch ? config.value.globalMode : '停派态';
  }
  /** 本组形态：本组形态与班组开关（关＝降级态）取较严者 */
  function groupModeOf(id: string): PoolMode {
    const g = groupOf(id);
    if (!g) return '停派态';
    return stricterMode(g.mode, g.switchOn ? '正常态' : '降级态');
  }
  /** 作用于本组池的形态：全局与本组取较严者（5.1） */
  function effectiveModeOf(id: string): PoolMode {
    return stricterMode(globalEffectiveMode(), groupModeOf(id));
  }
  function membersOf(groupId: string): DispatchAgent[] {
    return agents.value.filter((a) => a.groupIds.includes(groupId));
  }

  /* ---------------- 读：坐席 · 上限 · 在途 ---------------- */

  function agentOf(name?: string | null): DispatchAgent | undefined {
    return name ? agents.value.find((a) => a.name === name) : undefined;
  }

  function baseRoleOf(a: DispatchAgent): DispatchRole {
    return a.roles.reduce((best, r) => (config.value.roleBase[r] > config.value.roleBase[best] ? r : best), a.roles[0] ?? '二线专员');
  }
  /** 默认值＝角色基准值 × 熟练度系数，四舍五入（7.1；多角色取基准值最高者） */
  function defaultCapOf(a: DispatchAgent): number {
    return Math.round(config.value.roleBase[baseRoleOf(a)] * config.value.proficiencyCoef[a.proficiency]);
  }
  function capOf(a: DispatchAgent): number {
    return a.capOverride ?? defaultCapOf(a);
  }

  /** 在途计数（7.2）：处理人为本人、非草稿 / 非归档、子状态计入 */
  function inTransitOf(name: string, excludeNo?: string): number {
    let n = 0;
    for (const t of TICKETS) {
      if (t.assignee !== name || t.no === excludeNo || t.isDraft || t.archived) continue;
      if (IN_TRANSIT_COUNT_RULE[t.nodeStatus] === 'assignee') n += 1;
    }
    return n;
  }

  function agentView(name: string): DispatchAgentView | undefined {
    const a = agentOf(name);
    if (!a) return undefined;
    const inTransit = inTransitOf(a.name);
    const cap = capOf(a);
    const role = baseRoleOf(a);
    const dc = defaultCapOf(a);
    const over = inTransit > cap;
    const assignedFlag = !!overAssigned.value[a.name] && over;
    return {
      agent: a,
      inTransit,
      cap,
      defaultCap: dc,
      defaultCapText: `${dc}（${role}基准 ${config.value.roleBase[role]} × ${a.proficiency} ${config.value.proficiencyCoef[a.proficiency]}）`,
      profileConfigured: isProfileConfigured(a.profile),
      overLimit: over && !assignedFlag,
      overAssigned: assignedFlag,
    };
  }

  /* ---------------- 读：工单字段 ---------------- */

  function customerTypesOf(t: Ticket): string[] {
    const phone = digits(t.customerPhone);
    if (!phone) return [];
    const c = CUSTOMER_DIRECTORY.find((x) => digits(x.phone) === phone);
    return c?.customerTypes?.length ? c.customerTypes : c?.customerType ? c.customerType.split('、') : [];
  }
  function problemPathOf(t: Ticket): string[] {
    return [t.problemL1, t.problemL2, t.problemL3].filter((x): x is string => !!x);
  }
  function pathHit(ticketPath: string[], pick: string): boolean {
    const segs = pick.split('/').filter(Boolean);
    return segs.length > 0 && segs.length <= ticketPath.length && segs.every((s, i) => ticketPath[i] === s);
  }
  function productExact(t: Ticket, p: ProductPick): boolean {
    return !!t.productCategory && p.category === t.productCategory && (!p.name || p.name === t.product);
  }

  /* ---------------- 入池规则（第 3 章） ---------------- */

  function ruleHit(rule: PoolRule, t: Ticket): boolean {
    const c = rule.conditions;
    if (c.businessTypes.length && !c.businessTypes.includes(t.businessType ?? '')) return false;
    if (c.ticketTypes.length && !c.ticketTypes.includes(t.type)) return false;
    if (c.problems.length && !c.problems.some((p) => pathHit(problemPathOf(t), p))) return false;
    if (c.products.length && !c.products.some((p) => productExact(t, p))) return false;
    if (c.ticketSources.length && !c.ticketSources.includes(t.ticketSource ?? '')) return false;
    if (c.customerTypes.length) {
      const ct = customerTypesOf(t);
      if (!ct.length || !ct.some((x) => c.customerTypes.includes(x))) return false;
    }
    if (c.priorities.length && !c.priorities.includes(t.priority)) return false;
    return true;
  }

  /** 按优先级取首条命中的启用规则；未命中落默认池（3.1） */
  function resolvePool(t: Ticket): { poolId: string; ruleId: string | null; ruleName: string } {
    const hit = [...rules.value]
      .filter((r) => r.enabled && isDispatchPool(r.poolId))
      .sort((a, b) => a.priority - b.priority)
      .find((r) => ruleHit(r, t));
    return hit ? { poolId: hit.poolId, ruleId: hit.id, ruleName: hit.name } : { poolId: DEFAULT_POOL_ID, ruleId: null, ruleName: '默认池' };
  }

  /* ---------------- 画像匹配（6.2） ---------------- */

  /** 产品维在某放宽层级下是否匹配；返回命中所用的最低层级（未命中为 null） */
  function productLevel(a: DispatchAgent, t: Ticket): RelaxLevel | null {
    const sel = a.profile.products;
    if (sel === 'any') return 0;
    if (!sel || !t.productCategory) return 2;
    if (sel.some((p) => productExact(t, p))) return 0;
    if (sel.some((p) => p.category === t.productCategory)) return 1;
    return 2;
  }

  function listHit(sel: AgentProfile['businessTypes'], value: string[] | string | undefined): boolean {
    if (sel === 'any') return true;
    if (!sel) return false;
    const vs = (Array.isArray(value) ? value : value ? [value] : []).filter(Boolean);
    return vs.length > 0 && vs.some((v) => sel.includes(v));
  }

  /** 五维匹配；`level` 只放宽产品维（2＝不校验产品） */
  function profileMatches(a: DispatchAgent, t: Ticket, level: RelaxLevel): boolean {
    const p = a.profile;
    if (!isProfileConfigured(p)) return false;
    if (!listHit(p.businessTypes, t.businessType)) return false;
    if (!listHit(p.ticketTypes, t.type)) return false;
    if (!listHit(p.customerTypes, customerTypesOf(t))) return false;
    if (p.problems !== 'any') {
      const path = problemPathOf(t);
      if (!p.problems || !path.length || !p.problems.some((x) => pathHit(path, x))) return false;
    }
    if (level < 2 && p.products !== 'any') {
      const lv = productLevel(a, t);
      if (lv === null || lv > level) return false;
      if (!t.productCategory) return false;
    }
    return true;
  }

  /** 「匹配我」：本人画像精确层匹配（10.1）；画像未配置不出 */
  function matchesMe(t: Ticket, name: string): boolean {
    const a = agentOf(name);
    return !!a && profileMatches(a, t, 0);
  }

  /* ---------------- SLA ---------------- */

  /** 首响 SLA 剩余比例（0–1）；无首响 SLA 为 null */
  function slaRemainRatio(t: Ticket, st: TicketDispatchState, now: number): number | null {
    if (!st.firstRespTotalMin || t.responded) return null;
    const remain = st.firstRespTotalMin - (now - st.enteredAt) / MIN;
    return Math.max(0, remain) / st.firstRespTotalMin;
  }
  function slaRemainMin(t: Ticket, st: TicketDispatchState, now: number): number | undefined {
    if (!st.firstRespTotalMin || t.responded) return undefined;
    return Math.max(0, Math.round(st.firstRespTotalMin - (now - st.enteredAt) / MIN));
  }

  /* ---------------- 门槛（4.1） ---------------- */

  function gates(t: Ticket, st: TicketDispatchState, level: RelaxLevel, opts: { only?: string } = {}): GateOutcome {
    const drops: Partial<Record<GateKey, number>> = {};
    const g = groupOf(st.poolId);
    let list = agents.value.filter((a) => !opts.only || a.name === opts.only);
    const step = (key: GateKey, keep: (a: DispatchAgent) => boolean) => {
      const next = list.filter(keep);
      const d = list.length - next.length;
      if (d) drops[key] = (drops[key] ?? 0) + d;
      list = next;
    };
    step('候选范围', (a) => a.groupIds.includes(st.poolId));
    step('三级开关', (a) => config.value.globalSwitch && !!g?.switchOn && a.personalSwitch);
    step('角色', (a) => !a.disabled && a.roles.length > 0);
    step('在班', (a) => a.signIn === '签入');
    const onDuty = list.length;
    step('投诉回避', (a) => !st.complaintTarget || a.name !== st.complaintTarget);
    step('画像已配置', (a) => isProfileConfigured(a.profile));
    step('画像匹配', (a) => profileMatches(a, t, level));
    const matched = list;
    step('个人上限', (a) => inTransitOf(a.name, t.no) < capOf(a));
    return { passed: list, blockedByCap: matched.filter((a) => !list.includes(a)), onDuty, drops };
  }

  /* ---------------- 评分（4.3） ---------------- */

  function recentCount(a: DispatchAgent, now: number): number {
    const from = now - config.value.recentHours * 60 * MIN;
    return a.recentTakes.filter((x) => x >= from).length;
  }

  function score(t: Ticket, st: TicketDispatchState, a: DispatchAgent, pool: DispatchAgent[], level: RelaxLevel, now: number): ScoreDetail {
    const inTransit = inTransitOf(a.name, t.no);
    const cap = capOf(a);
    const relaxedHit = level > 0 && !profileMatches(a, t, 0);
    const ratio = slaRemainRatio(t, st, now);
    const maxRecent = Math.max(0, ...pool.map((x) => recentCount(x, now)));
    const idleMinutes = a.lastTakenAt == null ? 9999 : Math.max(0, (now - a.lastTakenAt) / MIN);
    const factors: Record<ScoreFactorKey, number> = {
      load: cap > 0 ? Math.max(0, 1 - inTransit / cap) : 0,
      proficiency: PROFICIENCY_SCORE[a.proficiency] * (relaxedHit ? 0.5 : 1),
      urgency: Math.max(PRIORITY_SCORE[t.priority] ?? 0, ratio == null ? 0 : 1 - ratio),
      recent: maxRecent === 0 ? 1 : 1 - recentCount(a, now) / maxRecent,
      idle: Math.min(1, idleMinutes / 120),
    };
    const on = config.value.factors.filter((f) => f.enabled);
    const wsum = on.reduce((s, f) => s + f.weight, 0);
    const total = wsum > 0 ? Math.round((on.reduce((s, f) => s + f.weight * factors[f.key], 0) / wsum) * 1000) / 10 : 0;
    for (const k of Object.keys(factors) as ScoreFactorKey[]) factors[k] = Math.round(factors[k] * 100) / 100;
    return { name: a.name, total, factors, idleMinutes: Math.round(idleMinutes), inTransit };
  }

  /** 同分：空闲时长长者 → 在途计数少者（4.3） */
  function rank(list: ScoreDetail[]): ScoreDetail[] {
    return [...list].sort((x, y) => y.total - x.total || y.idleMinutes - x.idleMinutes || x.inTransit - y.inTransit);
  }

  /* ---------------- 原处理人（4.2） ---------------- */

  function findOriginalHandler(t: Ticket, st: TicketDispatchState, trigger: DispatchTrigger, now: number): string | undefined {
    if (st.prevHandler) return agentOf(st.prevHandler) ? st.prevHandler : undefined;
    if (!config.value.originalFirst) return undefined;
    const phone = digits(t.customerPhone);
    if (!phone) return undefined;
    const days = t.type === '投诉' ? config.value.windowComplaintDays : config.value.windowConsultDays;
    const from = now - days * 24 * 60 * MIN;
    const path = problemPathOf(t).join('/');
    let best: { name: string; at: number } | undefined;
    for (const x of TICKETS) {
      if (x.no === t.no || !x.assignee || digits(x.customerPhone) !== phone) continue;
      const a = agentOf(x.assignee);
      if (!a) continue;
      // 升级三线：取同一客户最近一次三线处理人（9.5）
      if (trigger === '升级三线' && !a.roles.includes('技术支持')) continue;
      if (config.value.originalSameProblem && problemPathOf(x).join('/') !== path) continue;
      const at = parseStamp(x.updatedAt) || parseStamp(x.createdAt);
      if (!Number.isFinite(at) || at < from) continue;
      if (!best || at > best.at) best = { name: a.name, at };
    }
    return best?.name;
  }

  function reserveUntilOf(t: Ticket, st: TicketDispatchState, now: number): number {
    const remain = slaRemainMin(t, st, now);
    const cap = remain == null ? config.value.reserveMinutes : Math.min(config.value.reserveMinutes, (remain * config.value.reserveSlaPercent) / 100);
    return now + Math.max(1, cap) * MIN;
  }

  /* ---------------- 判定（第 2、4 章） ---------------- */

  function decide(t: Ticket, st: TicketDispatchState, trigger: DispatchTrigger, mode: PoolMode, now: number): Decision {
    if (mode === '停派态') return { path: '留池', assignee: null, status: null, relaxLevel: st.relaxLevel };

    // 原处理人优先（降级态同样执行）
    const orig = trigger === '预留到期' ? undefined : findOriginalHandler(t, st, trigger, now);
    if (orig && orig !== st.complaintTarget) {
      const a = agentOf(orig)!;
      const inGroup = a.groupIds.includes(st.poolId);
      if (inGroup) {
        const g = gates(t, st, 0, { only: orig });
        if (g.passed.length) {
          const pool = gates(t, st, st.relaxLevel).passed;
          return {
            path: '原处理人', assignee: orig, status: null, relaxLevel: 0,
            score: score(t, st, a, pool.length ? pool : [a], 0, now), drops: g.drops, candidateCount: 1,
          };
        }
        // 投诉预留：原处理人当日在班但当前不可用
        if (t.type === '投诉' && a.signedInToday && !a.disabled) {
          return {
            path: '预留', assignee: null, status: '等原处理人', relaxLevel: st.relaxLevel,
            reserveFor: orig, reserveUntil: st.reserveFor === orig && st.reserveUntil ? st.reserveUntil : reserveUntilOf(t, st, now),
          };
        }
      }
    }
    if (mode === '降级态') return { path: '留池', assignee: null, status: null, relaxLevel: st.relaxLevel };

    // 候选集为空时（4.4）：首响剩余 < 兜底阈值 → 兜底；无画像匹配在班成员或首响剩余 < 放宽阈值 → 放宽一级；
    // 有匹配成员但均达上限 → 排队；放宽至最远层级仍无 → 兜底
    const ratio = slaRemainRatio(t, st, now);
    let level: RelaxLevel = st.relaxLevel;
    const maxLevel: RelaxLevel = config.value.relaxEnabled ? config.value.relaxMaxLevel : 0;
    for (;;) {
      const g = gates(t, st, level);
      if (g.passed.length) {
        const ranked = rank(g.passed.map((a) => score(t, st, a, g.passed, level, now)));
        const best = ranked[0];
        return {
          path: level > 0 ? '组内放宽' : '加权评分', assignee: best.name, status: null, relaxLevel: level,
          score: best, top3: ranked.slice(0, 3).map((x) => ({ name: x.name, total: x.total })),
          drops: g.drops, candidateCount: g.passed.length,
        };
      }
      const failReason: DispatchFailReason = g.blockedByCap.length ? '均达个人上限' : g.onDuty === 0 ? '无在班成员' : '无画像匹配成员';
      const fallback: Decision = {
        path: '兜底回池', assignee: null, status: '派单失败回池', relaxLevel: level, drops: g.drops, candidateCount: 0, failReason,
      };
      if (ratio != null && ratio * 100 < config.value.fallbackSlaPercent) return fallback;
      const relaxNow = !g.blockedByCap.length || (ratio != null && ratio * 100 < config.value.relaxSlaPercent);
      if (relaxNow && level < maxLevel) {
        level = (level + 1) as RelaxLevel;
        continue;
      }
      if (g.blockedByCap.length) {
        return { path: '排队', assignee: null, status: '排队中', relaxLevel: level, drops: g.drops, candidateCount: 0 };
      }
      return fallback;
    }
  }

  /* ---------------- 写：工单行 ---------------- */

  function sysEntry(t: Ticket, how: string, what: string, at: number): Omit<TimelineEntry, 'id' | 'when'> & { when: string } {
    return { category: 'node', action: 'transfer', who: SYSTEM, role: '系统', systemActor: true, how, what, when: stamp(at) };
  }

  /** 履历写入：刷机 / 小智单走各自服务的履历，其余写工单行 eventTimeline */
  function writeTimeline(t: Ticket, how: string, what: string, at: number) {
    const e = sysEntry(t, how, what, at);
    if (isFlashTicket(t)) {
      useFlashStore().logProcess(t.no, { name: SYSTEM, role: '系统' }, e);
      return;
    }
    if (isXiaozhiTicket(t)) {
      useXiaozhiStore().appendLog(t.no, e);
      return;
    }
    t.eventTimeline = [...(t.eventTimeline ?? []), { id: `dispatch-${t.no}-${nextId('tl')}`, ...e }];
  }

  /** 专属工单落快照（刷机 / 小智由各自履历写入时已落，个册退费在此落） */
  function commitSpecial(t: Ticket) {
    if (isRefundTicket(t)) useRefundStore().afterClaim(t.no);
  }

  /** 派出落处理人：整单首响一经记成不因换人重计（9.3 / 11.1 / 13.3），首响标记沿用工单行现值 */
  function writeAssign(t: Ticket, name: string, at: number) {
    const keepStatus = t.nodeStatus === '已升级技术支持';
    const toProcessing = !!ticketStates.value[t.no]?.prevHandler && t.returnedFromAftersale;
    Object.assign(t, {
      assignee: name,
      tab: 'mine',
      nodeStatus: keepStatus ? t.nodeStatus : toProcessing ? '处理中' : '待响应',
      responded: toProcessing ? true : !!t.responded,
      updatedAt: stamp(at),
    });
    if (isXiaozhiTicket(t)) useXiaozhiStore().syncStatus(t.no, t.nodeStatus, { assignee: name });
  }

  function writePool(t: Ticket, poolId: string, at: number) {
    const g = groupOf(poolId);
    const keepStatus = t.nodeStatus === '已升级技术支持';
    Object.assign(t, {
      assignee: null,
      tab: 'pool',
      groupId: poolId,
      ...(g ? { groupNames: [g.label, ...(t.groupNames ?? []).slice(1).filter((n) => n !== g.label)] } : {}),
      nodeStatus: keepStatus ? t.nodeStatus : '未认领',
      updatedAt: stamp(at),
    });
  }

  function recordTake(name: string, at: number) {
    const a = agentOf(name);
    if (!a) return;
    a.lastTakenAt = at;
    a.recentTakes = [...a.recentTakes.filter((x) => x >= at - 24 * 60 * MIN), at];
  }

  /* ---------------- 日志 ---------------- */

  function snapshotOf(t: Ticket, st: TicketDispatchState, now: number): DispatchLogEntry['snapshot'] {
    return {
      businessType: t.businessType,
      ticketType: t.type,
      productCategory: t.productCategory,
      product: t.product,
      problem: problemPathOf(t).join(' / ') || undefined,
      ticketSource: t.ticketSource,
      customerType: customerTypesOf(t).join('、') || undefined,
      priority: t.priority,
      firstRespRemainMin: slaRemainMin(t, st, now),
    };
  }

  function pushLog(e: DispatchLogEntry) {
    logs.value = [...logs.value, e].slice(-LOG_LIMIT);
  }

  function nextTicketSeq(no: string): number {
    return logs.value.filter((x) => x.ticketNo === no).reduce((m, x) => Math.max(m, x.seq), 0) + 1;
  }

  function factorText(s: ScoreDetail): string {
    const label: Record<ScoreFactorKey, string> = {
      load: '负载', proficiency: '熟练度', urgency: '紧急度', recent: `近 ${config.value.recentHours} 小时接单量`, idle: '空闲时长',
    };
    const on = config.value.factors.filter((f) => f.enabled).map((f) => `${label[f.key]} ${s.factors[f.key].toFixed(2)}`);
    return `综合得分 ${s.total.toFixed(1)}（${on.join(' · ')}）`;
  }

  /* ---------------- 派单引擎（对外） ---------------- */

  function ensureState(t: Ticket, trigger: DispatchTrigger, opts: DispatchOptions, now: number): TicketDispatchState {
    const fresh = trigger === '新单' || trigger === '调剂到池' || trigger === '升级三线' || trigger === '售后转回' || trigger === '回访打回';
    const prev = ticketStates.value[t.no];
    if (prev && !fresh) {
      if (opts.complaintTarget) prev.complaintTarget = opts.complaintTarget;
      return prev;
    }
    let poolId = opts.poolId;
    let ruleId: string | null = null;
    if (!poolId) {
      // 售后转回 / 回访打回 / 回切重派：回本单归属池；新单按入池规则
      if ((trigger === '售后转回' || trigger === '回访打回' || trigger === '回切重派') && isDispatchPool(t.groupId)) poolId = t.groupId!;
      else {
        const r = resolvePool(t);
        poolId = r.poolId;
        ruleId = r.ruleId;
      }
    }
    const st: TicketDispatchState = {
      ticketNo: t.no,
      poolId,
      ruleId,
      enteredAt: now,
      status: null,
      relaxLevel: 0,
      queueSince: null,
      firstRespTotalMin: !t.responded && t.slaMinutes > 0 && t.slaMinutes < 9000 ? t.slaMinutes : undefined,
      complaintTarget: opts.complaintTarget ?? prev?.complaintTarget,
      prevHandler: opts.prevHandler ?? undefined,
      seq: prev?.seq ?? 0,
      everAssigned: prev?.everAssigned,
    };
    ticketStates.value = { ...ticketStates.value, [t.no]: st };
    return ticketStates.value[t.no];
  }

  function ruleNameOf(st: TicketDispatchState): string {
    return st.ruleId ? rules.value.find((r) => r.id === st.ruleId)?.name ?? '默认池' : '默认池';
  }

  /**
   * 判定并落库。`write=false` 时只判定与记日志、不改工单行（售后回传 resolver 用：工单行由调用方组装）。
   */
  function run(t: Ticket, trigger: DispatchTrigger, opts: DispatchOptions, write: boolean): DispatchResult | null {
    // 先到先得：已有处理人不判定
    if (t.assignee) return null;
    const now = Date.now();
    const st = ensureState(t, trigger, opts, now);
    const g = groupOf(st.poolId);
    const globalMode = globalEffectiveMode();
    const groupMode = groupModeOf(st.poolId);
    const effectiveMode = stricterMode(globalMode, groupMode);
    const runMode: RunMode = config.value.runMode;
    const trial = runMode === '试运行' && config.value.globalSwitch;
    // 试运行：按正式口径算建议（全局开关开启时），工单按停派态留池
    const decideMode: PoolMode = trial ? stricterMode(config.value.globalMode, groupMode) : effectiveMode;

    let d: Decision;
    try {
      if (health.value.engineDownSince && decideMode !== '停派态') throw new Error('engine down');
      d = decide(t, st, trigger, decideMode, now);
    } catch {
      d = { path: '兜底回池', assignee: null, status: '派单失败回池', relaxLevel: st.relaxLevel, failReason: '引擎异常' };
    }
    const suggested = d.assignee;
    const actualAssign = trial ? null : d.assignee;
    const status: DispatchStatus | null = trial ? null : d.status;

    st.seq = nextTicketSeq(t.no);
    const chosenAgent = agentOf(suggested);
    const log: DispatchLogEntry = {
      id: nextId('dl'),
      ticketNo: t.no,
      seq: st.seq,
      at: stamp(now),
      kind: '判定',
      trigger,
      poolId: st.poolId,
      poolLabel: poolLabel(st.poolId),
      ruleName: ruleNameOf(st),
      globalMode,
      groupMode,
      effectiveMode,
      runMode,
      path: d.path,
      relaxLevel: d.relaxLevel,
      gateDrops: d.drops,
      candidateCount: d.candidateCount,
      ...(chosenAgent ? { chosen: { name: chosenAgent.name, staffNo: chosenAgent.staffNo, groupLabel: g?.label ?? '' } } : {}),
      ...(d.score ? { chosenScore: d.score } : {}),
      ...(d.top3 ? { top3: d.top3 } : {}),
      ...(d.failReason ? { failReason: d.failReason } : {}),
      status,
      snapshot: snapshotOf(t, st, now),
      ...(trial ? { trial: { suggested, actual: t.assignee ?? null, same: !!suggested && suggested === t.assignee } } : {}),
    };
    pushLog(log);

    // 派单状态
    const prevStatus = st.status;
    const prevLevel = st.relaxLevel;
    st.status = status;
    st.relaxLevel = d.relaxLevel;
    if (status === '排队中') st.queueSince = prevStatus === '排队中' && prevLevel === d.relaxLevel && st.queueSince ? st.queueSince : now;
    else st.queueSince = null;
    if (status === '等原处理人') {
      st.reserveFor = d.reserveFor;
      st.reserveUntil = d.reserveUntil;
    } else {
      st.reserveFor = undefined;
      st.reserveUntil = undefined;
    }
    st.fallbackDone = status === '派单失败回池';

    const relaxSuffix = d.relaxLevel > 0 && actualAssign ? `；产品放宽至${RELAX_LEVEL_LABEL[d.relaxLevel]}` : '';
    let reason: string;
    if (actualAssign) {
      reason = `系统派单 → ${actualAssign}（${d.path}）${relaxSuffix}${d.score ? `；${factorText(d.score)}` : ''}`;
    } else if (trial) {
      reason = suggested ? `试运行建议 ${suggested}（${d.path}）` : `试运行未出建议（${d.failReason ?? d.path}）`;
    } else if (status === '排队中') {
      reason = `${poolLabel(st.poolId)}排队：画像匹配成员均已满载`;
    } else if (status === '等原处理人') {
      reason = `等原处理人 ${d.reserveFor}，${hm(d.reserveUntil!)} 到期`;
    } else if (status === '派单失败回池') {
      reason = `自动派单未派出（${d.failReason}），已通知${g?.label ?? ''}班组长`;
    } else {
      reason = `留${poolLabel(st.poolId)}（${effectiveMode}）`;
    }

    if (write) {
      const target = reactive(t) as Ticket;
      touchRow(target);
      if (actualAssign) {
        writePool(target, st.poolId, now);
        writeAssign(target, actualAssign, now);
        recordTake(actualAssign, now);
        writeTimeline(target, '系统派单', reason, now);
        commitSpecial(target);
      } else {
        writePool(target, st.poolId, now);
        if (!trial && (status !== prevStatus || d.relaxLevel !== prevLevel)) {
          if (status === '排队中' && d.relaxLevel > prevLevel) writeTimeline(target, '组内放宽', `产品放宽至${RELAX_LEVEL_LABEL[d.relaxLevel]}`, now);
          if (status === '排队中') writeTimeline(target, '排队', reason, now);
          if (status === '等原处理人') writeTimeline(target, '等原处理人', reason, now);
          if (status === '派单失败回池') writeTimeline(target, '兜底回池', reason, now);
        }
        commitSpecial(target);
      }
    }

    // 通知
    if (actualAssign) {
      const source = trigger === '新单' ? '系统派单' : '系统重派';
      notify(t.no, 'assign', '派发提醒', [actualAssign], `工单 ${t.no} 已派给你，分派来源：${source}。`);
      if (!st.everAssigned && !isFlashTicket(t) && !isXiaozhiTicket(t) && !isRefundTicket(t)) {
        notify(t.no, 'accepted', '受理短信', [t.customer], `您的问题已受理，工单号 ${t.no}。`, '短信');
      }
      st.everAssigned = true;
      st.status = null;
    } else if (status === '派单失败回池' && prevStatus !== '派单失败回池') {
      const leaders = g?.leaders ?? [];
      notify(t.no, 'timeout', '兜底回池通知', leaders, `${t.no}自动派单未派出（${d.failReason}），请指派或调剂。`, '站内信');
      notify(t.no, 'timeout', '兜底回池通知', leaders, `${t.no}自动派单未派出（${d.failReason}），请指派或调剂。`, 'IM');
      notifyPoolArrival(t, st.poolId);
    } else if (!actualAssign && trigger === '新单' && (effectiveMode !== '正常态' || trial)) {
      // 降级态、停派态、试运行：新单首次进池即发（恢复【1025】规则）；刷机、退费、小智单发各自的到组通知
      notifyPoolArrival(t, st.poolId);
    }

    ticketStates.value = { ...ticketStates.value };
    persist();
    return {
      assignee: actualAssign,
      poolId: st.poolId,
      poolLabel: poolLabel(st.poolId),
      path: d.path,
      status,
      reason,
      ...(trial ? { suggested } : {}),
      log,
    };
  }

  /**
   * 派单引擎主入口：对一张进入派单的工单执行一次判定并落库（派出 / 留池并标派单状态）。
   * 工单已有处理人时不派（先到先得），返回留池结果。
   */
  function dispatchTicket(ticket: Ticket, trigger: DispatchTrigger, opts: DispatchOptions = {}): DispatchResult | null {
    return run(ticket, trigger, opts, true);
  }

  /**
   * 新建通用工单进入派单（2.3 触发「新单」）：清空建单时的处理人、落池，再交引擎判定。
   * 直接结案单不进入派单，返回 null。
   */
  function dispatchNewTicket(ticket: Ticket, opts: DispatchOptions = {}): DispatchResult | null {
    if (ticket.closureMode === '直接结案') return null;
    Object.assign(ticket, { assignee: null, tab: 'pool', nodeStatus: '未认领', responded: false });
    return run(ticket, '新单', opts, true);
  }

  /** 调剂到池 / 升级三线到技术支持池（3.2）：清空处理人、改归属池、重新派送 */
  function redispatchToPool(ticket: Ticket, poolId: string, trigger: '调剂到池' | '升级三线' = '调剂到池', operator?: string, reason?: string): DispatchResult | null {
    const t = reactive(ticket) as Ticket;
    const keep = t.nodeStatus === '已升级技术支持';
    // 落池前把首响结论落成显式值：子状态改「未认领」后不再能由子状态推出（9.4 首响已记成的不重计）
    Object.assign(t, { responded: isFirstResponded(t), assignee: null, tab: 'pool', groupId: poolId, ...(keep ? {} : { nodeStatus: '未认领' }) });
    if (trigger === '调剂到池') {
      manualLog(t, '调剂到池', operator ?? operatorName(), poolLabel(poolId), reason);
      writeTimeline(t, '调剂到池', `调剂到池 → ${poolLabel(poolId)}${reason ? `；原因：${reason}` : ''}`, Date.now());
    }
    return run(t, trigger, { poolId }, true);
  }

  /** 售后回传 resolver（`aftersaleEvents.dispatchByCurrentRule` 经注册调用）：只判定、不改入参工单行 */
  function resolveForAftersale(t: Ticket, ctx?: DispatchContext): DispatchOutcome {
    const trigger: DispatchTrigger = ctx?.trigger ?? '新单';
    const r = run({ ...t, assignee: null }, trigger, { prevHandler: ctx?.prevAssignee ?? undefined }, false);
    if (!r) return { groupId: t.groupId ?? DEFAULT_POOL_ID, groupLabel: groupOf(t.groupId)?.label ?? DEFAULT_POOL_LABEL, assignee: null };
    if (r.assignee) recordTake(r.assignee, Date.now());
    const g = groupOf(r.poolId);
    return { groupId: r.poolId, groupLabel: g?.label ?? r.poolId, assignee: r.assignee, reason: r.assignee ? r.path : undefined };
  }

  /* ---------------- 先到先得 · 人工动作 ---------------- */

  /** 占用校验（2.4）：引擎派、领取、指派共用；已有处理人即失败 */
  function checkOccupy(t: Pick<Ticket, 'assignee'> | undefined): OccupyResult {
    if (!t) return { ok: false, message: TAKEN_MESSAGE };
    return t.assignee ? { ok: false, message: TAKEN_MESSAGE } : { ok: true, message: '' };
  }

  /** 领取前置（10.2）：占用校验 ＋ 未签入不可领；不校验画像、不受个人上限约束 */
  function checkClaim(t: Pick<Ticket, 'assignee'> | undefined, name: string): OccupyResult {
    const occ = checkOccupy(t);
    if (!occ.ok) return occ;
    const a = agentOf(name);
    if (a && a.signIn !== '签入') return { ok: false, message: '签入后可领取' };
    return occ;
  }

  function manualLog(t: Ticket, action: ManualAction, operator: string, target?: string, reason?: string, overCap?: DispatchLogEntry['overCap']) {
    const st = ticketStates.value[t.no];
    const poolId = st?.poolId ?? (isDispatchPool(t.groupId) ? t.groupId! : DEFAULT_POOL_ID);
    const now = Date.now();
    pushLog({
      id: nextId('dl'), ticketNo: t.no, seq: nextTicketSeq(t.no), at: stamp(now), kind: '人工',
      poolId, poolLabel: poolLabel(poolId), ruleName: st ? ruleNameOf(st) : '—',
      globalMode: globalEffectiveMode(), groupMode: groupModeOf(poolId), effectiveMode: effectiveModeOf(poolId), runMode: config.value.runMode,
      snapshot: st ? snapshotOf(t, st, now) : { ticketType: t.type, priority: t.priority },
      manual: { action, operator, ...(target ? { target } : {}), ...(reason ? { reason } : {}) },
      ...(overCap ? { overCap } : {}),
      ...(config.value.runMode === '试运行' && config.value.globalSwitch && target
        ? (() => {
          const s = [...logs.value].reverse().find((x) => x.ticketNo === t.no && x.kind === '判定' && x.trial);
          return s?.trial ? { trial: { suggested: s.trial.suggested, actual: target, same: s.trial.suggested === target } } : {};
        })()
        : {}),
    });
  }

  /**
   * 人工拿单落库后调用（领取 / 班组长指派 / 改派 / 调剂到人 / 升级三线指定人 / 升级投诉自主发起直派）：结束排队与预留、写派单日志、记接单时刻；
   * 指定人派送超出个人上限时记超额指派（7.3）。领取不记超额指派。
   */
  function recordManualTake(t: Ticket, assignee: string, action: ManualAction, operator?: string, reason?: string) {
    const st = ticketStates.value[t.no];
    if (st) {
      st.status = null;
      st.queueSince = null;
      st.reserveFor = undefined;
      st.reserveUntil = undefined;
      st.everAssigned = true;
      ticketStates.value = { ...ticketStates.value };
    }
    const a = agentOf(assignee);
    let overCap: DispatchLogEntry['overCap'];
    // 本单已落到此人名下：在途按「除本单外的在途 ＋ 本单」计（新建单此刻尚未落工单库、子状态仍为未认领）
    if (a && action !== '二线领取' && inTransitOf(a.name, t.no) + 1 > capOf(a)) {
      overCap = '超额指派';
      overAssigned.value = { ...overAssigned.value, [a.name]: true };
    }
    recordTake(assignee, Date.now());
    manualLog(t, action, operator ?? operatorName(), assignee, reason, overCap);
    touchRow(t);
    persist();
  }

  /**
   * 客户回访打回（11.1）：回访反馈未解决的单回本单归属池，按原处理人优先派出 ——
   * 原处理人取本单上一处理人，须为归属组成员，不受时间窗限制；不可用时按出池规则；派出后「待响应」。
   */
  function returnFromSurvey(ticket: Ticket, opts: { prevHandler?: string | null; reason?: string } = {}): DispatchResult | null {
    const t = reactive(ticket) as Ticket;
    if (t.nodeStatus !== '调研中') return null;
    const prev = opts.prevHandler ?? t.assignee ?? null;
    const now = Date.now();
    touchRow(t);
    // 已记成的首响不重计（11.1）：落池前把首响结论落成显式值
    Object.assign(t, { responded: isFirstResponded(t), assignee: null, tab: 'pool', nodeStatus: '未认领', updatedAt: stamp(now) });
    writeTimeline(t, '回访打回', `${opts.reason ?? '客户回访反馈未解决'}，打回本单归属池重新派送`, now);
    return run(t, '回访打回', { prevHandler: prev }, true);
  }

  /** 取消工单：同步撤出排队与预留（4.4） */
  function withdrawTicket(no: string) {
    const st = ticketStates.value[no];
    if (!st) return;
    st.status = null;
    st.queueSince = null;
    st.reserveFor = undefined;
    st.reserveUntil = undefined;
    ticketStates.value = { ...ticketStates.value };
    persist();
  }

  /* ---------------- 定时判定 · 名额释放 ---------------- */

  function poolTicket(no: string): Ticket | undefined {
    const raw = TICKETS.find((x) => x.no === no);
    return raw ? (reactive(raw) as Ticket) : undefined;
  }

  /** 某坐席名额释放 / 恢复可用：先看预留给他的单，再按评分在其可接的排队单中选一张（4.3 名额释放选单） */
  function releaseCapacity(name: string): DispatchResult | null {
    const a = agentOf(name);
    if (!a) return null;
    const now = Date.now();
    const states = Object.values(ticketStates.value);
    // 预留给他的单
    for (const st of states) {
      if (st.status !== '等原处理人' || st.reserveFor !== name) continue;
      const t = poolTicket(st.ticketNo);
      if (!t || t.assignee) continue;
      if (gates(t, st, 0, { only: name }).passed.length) return dispatchTicket(t, '名额释放');
    }
    let best: { t: Ticket; st: TicketDispatchState; s: ScoreDetail } | undefined;
    for (const st of states) {
      if (st.status !== '排队中' || st.fallbackDone || !a.groupIds.includes(st.poolId)) continue;
      if (effectiveModeOf(st.poolId) !== '正常态' || config.value.runMode === '试运行') continue;
      const t = poolTicket(st.ticketNo);
      if (!t || t.assignee) continue;
      const g = gates(t, st, st.relaxLevel);
      if (!g.passed.some((x) => x.name === name)) continue;
      const s = score(t, st, a, g.passed, st.relaxLevel, now);
      if (!best || s.total > best.s.total || (s.total === best.s.total && st.enteredAt < best.st.enteredAt)) best = { t, st, s };
    }
    if (!best) return null;
    const { t, st, s } = best;
    // 直接派给该坐席
    st.seq = nextTicketSeq(t.no);
    const g = groupOf(st.poolId);
    const reasonText = `系统派单 → ${name}（${st.relaxLevel > 0 ? '组内放宽' : '加权评分'}）${st.relaxLevel > 0 ? `；产品放宽至${RELAX_LEVEL_LABEL[st.relaxLevel]}` : ''}；${factorText(s)}`;
    pushLog({
      id: nextId('dl'), ticketNo: t.no, seq: st.seq, at: stamp(now), kind: '判定', trigger: '名额释放',
      poolId: st.poolId, poolLabel: poolLabel(st.poolId), ruleName: ruleNameOf(st),
      globalMode: globalEffectiveMode(), groupMode: groupModeOf(st.poolId), effectiveMode: effectiveModeOf(st.poolId), runMode: config.value.runMode,
      path: st.relaxLevel > 0 ? '组内放宽' : '加权评分', relaxLevel: st.relaxLevel, candidateCount: 1,
      chosen: { name, staffNo: a.staffNo, groupLabel: g?.label ?? '' }, chosenScore: s, status: null,
      snapshot: snapshotOf(t, st, now),
    });
    touchRow(t);
    writeAssign(t, name, now);
    recordTake(name, now);
    writeTimeline(t, '系统派单', reasonText, now);
    commitSpecial(t);
    notify(t.no, 'assign', '派发提醒', [name], `工单 ${t.no} 已派给你，分派来源：系统重派。`);
    st.status = null;
    st.queueSince = null;
    st.everAssigned = true;
    ticketStates.value = { ...ticketStates.value };
    persist();
    return {
      assignee: name, poolId: st.poolId, poolLabel: poolLabel(st.poolId), path: st.relaxLevel > 0 ? '组内放宽' : '加权评分',
      status: null, reason: reasonText, log: logs.value[logs.value.length - 1],
    };
  }

  /** 坐席恢复可用（签入、开个人开关、名额释放）时调用 */
  function onAgentAvailable(name: string) {
    let guard = 0;
    while (guard < 20 && releaseCapacity(name)) guard += 1;
  }

  /* ---------------- 自动降级（5.3）· 回切条件（5.4） ---------------- */

  /** 指标统计的最少样本（进入派单的工单数），样本不足不判 */
  const HEALTH_MIN_SAMPLE = 5;
  const FAIL_WINDOW_MIN = 5;
  const SUCCESS_WINDOW_MIN = 15;
  /** 引擎派出的判定路径（不含预留 / 排队 / 留池 / 兜底） */
  const ENGINE_ASSIGN_PATHS: DispatchPath[] = ['原处理人', '加权评分', '组内放宽'];
  /** 派出后被人工改派 / 调剂、被回收即不计成功 */
  const UNDO_ACTIONS: ManualAction[] = ['改派', '调剂到人', '调剂到池', '班组长指派'];

  /** 正式派单、正常态下进入派单的判定记录（自动降级只看引擎真正执行主流程的判定） */
  function engineLogsSince(from: number): DispatchLogEntry[] {
    return logs.value.filter((x) => x.kind === '判定' && x.runMode === '正式派单' && x.effectiveMode === '正常态' && parseStamp(x.at) >= from);
  }

  function healthMetrics(now: number): Omit<DispatchHealthView, 'okSince' | 'okMinutes' | 'resumeReady'> {
    const c = config.value;
    // 派单失败率＝派单失败回池的工单数 ÷ 进入派单的工单数（5.3）
    const failLogs = engineLogsSince(now - FAIL_WINDOW_MIN * MIN);
    const failEntered = new Set(failLogs.map((x) => x.ticketNo));
    const failed = new Set(failLogs.filter((x) => x.status === '派单失败回池').map((x) => x.ticketNo));
    const failRate = failEntered.size >= HEALTH_MIN_SAMPLE ? Math.round((failed.size / failEntered.size) * 100) : null;
    // 自动派单成功率＝引擎派出且未被回收、未被人工改派的工单 ÷ 进入派单的工单（16 章）
    const succFrom = now - SUCCESS_WINDOW_MIN * MIN;
    const succLogs = engineLogsSince(succFrom);
    const succEntered = new Set(succLogs.map((x) => x.ticketNo));
    let succ = 0;
    for (const no of [...succEntered]) {
      const assigned = succLogs.filter((x) => x.ticketNo === no && x.status === null && !!x.chosen && !!x.path && ENGINE_ASSIGN_PATHS.includes(x.path));
      if (!assigned.length) {
        // 仍在排队 / 等原处理人的单尚无派单结果，不计入（结果出来后再计）
        const st = ticketStateOf(no)?.status;
        if (st === '排队中' || st === '等原处理人') succEntered.delete(no);
        continue;
      }
      const lastSeq = Math.max(...assigned.map((x) => x.seq));
      const undone = logs.value.some((x) => x.ticketNo === no && x.seq > lastSeq
        && ((x.kind === '人工' && !!x.manual && UNDO_ACTIONS.includes(x.manual.action)) || x.trigger === '跨班次回收'));
      if (!undone) succ += 1;
    }
    const successRate = succEntered.size >= HEALTH_MIN_SAMPLE ? Math.round((succ / succEntered.size) * 100) : null;
    const syncStaleMinutes = health.value.syncStalledSince ? Math.max(0, Math.floor((now - health.value.syncStalledSince) / MIN)) : 0;
    const engineDownMinutes = health.value.engineDownSince ? Math.max(0, Math.floor((now - health.value.engineDownSince) / MIN)) : 0;
    const breaches: string[] = [];
    if (failRate != null && failRate >= c.autoFailRate) breaches.push(`${FAIL_WINDOW_MIN} 分钟内派单失败率 ≥ ${c.autoFailRate}%`);
    if (successRate != null && successRate < c.autoSuccessRate) breaches.push(`${SUCCESS_WINDOW_MIN} 分钟内自动派单成功率 ＜ ${c.autoSuccessRate}%`);
    if (health.value.syncStalledSince && syncStaleMinutes > c.autoSyncMinutes) breaches.push(`坐席状态数据超过 ${c.autoSyncMinutes} 分钟未同步`);
    if (health.value.engineDownSince && engineDownMinutes >= c.autoEngineMinutes) breaches.push(`引擎连续 ${c.autoEngineMinutes} 分钟无响应`);
    return { failRate, successRate, syncStaleMinutes, engineDownMinutes, breaches };
  }

  /** 自动降级指标视图（含回切条件「各项指标连续 N 分钟达标」） */
  function healthView(now: number = Date.now()): DispatchHealthView {
    const m = healthMetrics(now);
    const okSince = m.breaches.length ? null : health.value.okSince ?? now;
    const okMinutes = okSince == null ? 0 : Math.max(0, Math.floor((now - okSince) / MIN));
    const resumeReady = config.value.autoDegraded && okSince != null && now - okSince >= config.value.resumeOkMinutes * MIN;
    return { ...m, okSince, okMinutes, resumeReady };
  }

  /** 自动降级后是否满足回切条件 */
  function resumeReady(now: number = Date.now()): boolean {
    return healthView(now).resumeReady;
  }

  /** 定时判定里更新达标起点，满足任一条件即转全局降级态（停派态不自动进入） */
  function checkAutoDegrade(now: number) {
    const m = healthMetrics(now);
    const okSince = m.breaches.length ? null : health.value.okSince ?? now;
    if (okSince !== health.value.okSince) health.value = { ...health.value, okSince };
    if (!m.breaches.length) return;
    if (!config.value.globalSwitch || config.value.globalMode !== '正常态' || config.value.runMode === '试运行') return;
    const cause = m.breaches.join('；');
    config.value.globalMode = '降级态';
    config.value.autoDegraded = true;
    audit('池形态', '全局', '正常态', '降级态', SYSTEM, cause);
    const receivers = ['全部管理员', ...new Set(groups.value.flatMap((g) => g.leaders))];
    const text = `智能派单已自动转为降级态：${cause}。工单按入池规则留组池，请组内领取或指派。`;
    notify('—', 'timeout', '自动降级', receivers, text, '站内信');
    notify('—', 'timeout', '自动降级', receivers, text, 'IM');
    clearStatuses(groups.value.map((g) => g.id), true);
  }

  /**
   * 开发态开关：模拟引擎无响应 / 坐席状态数据停止同步（自动降级条件演示用）。
   * 引擎无响应期间新判定按「引擎异常」兜底回池。
   */
  function simulateEngineDown(on: boolean, now: number = Date.now()) {
    health.value = { ...health.value, engineDownSince: on ? health.value.engineDownSince ?? now : null };
    persist();
  }
  function simulateAgentSyncStall(on: boolean, now: number = Date.now()) {
    health.value = { ...health.value, syncStalledSince: on ? health.value.syncStalledSince ?? now : null };
    persist();
  }

  /** 定时判定：预留到期、排队放宽、兜底、名额释放（4.2 / 4.4） */
  function tick(now: number = Date.now()) {
    for (const st of Object.values(ticketStates.value)) {
      if (!st.status || st.fallbackDone) continue;
      const t = poolTicket(st.ticketNo);
      if (!t || t.assignee || t.tab !== 'pool') {
        st.status = null;
        continue;
      }
      if (st.status === '等原处理人') {
        const target = st.reserveFor;
        if (target && gates(t, st, 0, { only: target }).passed.length) dispatchTicket(t, '名额释放');
        else if (st.reserveUntil && now >= st.reserveUntil) dispatchTicket(t, '预留到期');
        continue;
      }
      if (st.status === '排队中') {
        const ratio = slaRemainRatio(t, st, now);
        const queuedMin = st.queueSince ? (now - st.queueSince) / MIN : 0;
        const maxLevel: RelaxLevel = config.value.relaxEnabled ? config.value.relaxMaxLevel : 0;
        const relaxDue = ratio == null
          ? queuedMin >= config.value.relaxQueueMinutes
          : queuedMin >= config.value.relaxQueueMinutes || ratio * 100 < config.value.relaxSlaPercent;
        // 无首响 SLA（4.4）：放宽按排队时长判定，放宽至最远层级后排队满「无首响 SLA · 兜底排队时长」转兜底回池
        const fallbackDue = ratio == null
          ? st.relaxLevel >= maxLevel && queuedMin >= config.value.noSlaFallbackMinutes
          : ratio * 100 < config.value.fallbackSlaPercent || (relaxDue && st.relaxLevel >= maxLevel);
        if (fallbackDue) {
          fallback(t, st, '均达个人上限', now);
        } else if (relaxDue && st.relaxLevel < maxLevel) {
          st.relaxLevel = (st.relaxLevel + 1) as RelaxLevel;
          st.queueSince = now;
          dispatchTicket(t, '组内放宽');
        }
      }
    }
    for (const a of agents.value) {
      if (inTransitOf(a.name) <= capOf(a) && overAssigned.value[a.name]) {
        const next = { ...overAssigned.value };
        delete next[a.name];
        overAssigned.value = next;
      }
      if (a.signIn === '签入' && a.personalSwitch) onAgentAvailable(a.name);
    }
    checkAutoDegrade(now);
    persist();
  }

  function fallback(t: Ticket, st: TicketDispatchState, reason: DispatchFailReason, now: number) {
    const g = groupOf(st.poolId);
    st.status = '派单失败回池';
    st.fallbackDone = true;
    st.queueSince = null;
    st.seq = nextTicketSeq(t.no);
    const text = `自动派单未派出（${reason}），已通知${g?.label ?? ''}班组长`;
    pushLog({
      id: nextId('dl'), ticketNo: t.no, seq: st.seq, at: stamp(now), kind: '判定', trigger: '组内放宽',
      poolId: st.poolId, poolLabel: poolLabel(st.poolId), ruleName: ruleNameOf(st),
      globalMode: globalEffectiveMode(), groupMode: groupModeOf(st.poolId), effectiveMode: effectiveModeOf(st.poolId), runMode: config.value.runMode,
      path: '兜底回池', relaxLevel: st.relaxLevel, failReason: reason, status: '派单失败回池', snapshot: snapshotOf(t, st, now),
    });
    touchRow(t);
    writeTimeline(t, '兜底回池', text, now);
    commitSpecial(t);
    notify(t.no, 'timeout', '兜底回池通知', g?.leaders ?? [], `${t.no}自动派单未派出（${reason}），请指派或调剂。`, '站内信');
    notify(t.no, 'timeout', '兜底回池通知', g?.leaders ?? [], `${t.no}自动派单未派出（${reason}），请指派或调剂。`, 'IM');
    notifyPoolArrival(t, st.poolId);
    ticketStates.value = { ...ticketStates.value };
  }

  /* ---------------- 形态 · 开关 · 运行方式 ---------------- */

  /**
   * 进入降级态 / 停派态时清池内派单状态（5.2：降级态派单状态为空，停派态全部为空）。
   * `keepReserve`：降级态保留「等原处理人」（原处理人优先照常）。
   */
  function clearStatuses(groupIds: string[], keepReserve: boolean) {
    for (const st of Object.values(ticketStates.value)) {
      if (!groupIds.includes(st.poolId) || !st.status) continue;
      if (keepReserve && st.status === '等原处理人') continue;
      st.status = null;
      st.queueSince = null;
      st.fallbackDone = false;
      st.reserveFor = undefined;
      st.reserveUntil = undefined;
    }
    ticketStates.value = { ...ticketStates.value };
  }

  /** 回切重派（5.1）：池内未领取的工单交回引擎重新执行主流程 */
  function resumePools(groupIds: string[]): number {
    if (config.value.runMode === '试运行' && !config.value.globalSwitch) return 0;
    let n = 0;
    for (const raw of TICKETS) {
      if (raw.assignee || raw.tab !== 'pool' || raw.nodeStatus !== '未认领' || !raw.groupId || !groupIds.includes(raw.groupId)) continue;
      if (raw.archived || raw.isDraft) continue;
      if (effectiveModeOf(raw.groupId) === '停派态') continue;
      const st = ticketStates.value[raw.no];
      if (st) {
        st.fallbackDone = false;
        st.poolId = raw.groupId;
      }
      dispatchTicket(reactive(raw) as Ticket, '回切重派', { poolId: raw.groupId });
      n += 1;
    }
    return n;
  }

  function setGlobalSwitch(on: boolean, operator?: string): OccupyResult {
    if (config.value.globalSwitch === on) return { ok: true, message: '' };
    audit('全局开关', '全局', config.value.globalSwitch ? '开启' : '关闭', on ? '开启' : '关闭', operator);
    config.value.globalSwitch = on;
    if (!on) clearStatuses(groups.value.map((g) => g.id), false);
    notifyAdmins('全局开关变更', groups.value.map((g) => g.id),
      on ? `${operator ?? operatorName()}已开启智能派单全局开关，各组按班组开关接入自动派单。`
        : `${operator ?? operatorName()}已关闭智能派单全局开关，全部组池为停派态，工单按入池规则留组池，请组内领取或指派。`);
    persist();
    if (on) resumePools(groups.value.map((g) => g.id));
    return { ok: true, message: on ? '已开启全局开关' : '已关闭全局开关，全部组池为停派态' };
  }

  function setGlobalMode(mode: PoolMode, reason = '', operator?: string): OccupyResult {
    if (!config.value.globalSwitch && mode !== '停派态') return { ok: false, message: '全局开关已关闭，请先在派单策略开启' };
    if (mode !== '正常态' && !reason.trim()) return { ok: false, message: '请填写切换原因' };
    if (reason.length > 200) return { ok: false, message: '切换原因最多 200 字' };
    const before = config.value.globalMode;
    if (before === mode) return { ok: false, message: '请选择切换后的形态' };
    // 自动降级的回切须各项指标连续达标后由管理员确认（5.4）
    if (config.value.autoDegraded && mode === '正常态' && !resumeReady()) {
      return { ok: false, message: `各项指标连续 ${config.value.resumeOkMinutes} 分钟达标后可回切` };
    }
    audit('池形态', '全局', before, mode, operator, reason.trim() || undefined);
    config.value.globalMode = mode;
    config.value.autoDegraded = false;
    if (mode !== '正常态') clearStatuses(groups.value.map((g) => g.id), mode === '降级态');
    notifyAdmins('池形态切换', groups.value.map((g) => g.id),
      `${operator ?? operatorName()}已将智能派单全局形态由${before}切换为${mode}${reason.trim() ? `：${reason.trim()}` : ''}。`);
    persist();
    if (mode === '正常态') resumePools(groups.value.map((g) => g.id));
    return { ok: true, message: `已切换为${mode}` };
  }

  function setGroupSwitch(groupId: string, on: boolean, operator?: string): OccupyResult {
    const g = groupOf(groupId);
    if (!g) return { ok: false, message: '' };
    if (!config.value.globalSwitch) return { ok: false, message: '全局开关已关闭，班组开关暂不生效' };
    if (g.mode === '停派态') return { ok: false, message: '本组已由管理员停派' };
    if (g.switchOn === on) return { ok: true, message: '' };
    audit('班组开关', g.label, g.switchOn ? '开启' : '关闭', on ? '开启' : '关闭', operator);
    g.switchOn = on;
    if (!on) clearStatuses([groupId], false);
    notifyAdmins('班组开关变更', [groupId],
      on ? `${operator ?? operatorName()}已开启${g.label}班组开关，${g.label}已接入自动派单。`
        : `${operator ?? operatorName()}已关闭${g.label}班组开关，${poolLabel(groupId)}转为降级态，本组成员不再接本组池的自动派单。`);
    persist();
    if (on) resumePools([groupId]);
    return { ok: true, message: on ? `${g.label}已接入自动派单` : `${g.label}已退出自动派单` };
  }

  function setGroupMode(groupId: string, mode: PoolMode, reason = '', operator?: string): OccupyResult {
    const g = groupOf(groupId);
    if (!g) return { ok: false, message: '' };
    if (globalEffectiveMode() === '停派态') return { ok: false, message: '全局已停派，本组形态不可切换' };
    if (g.mode === mode) return { ok: false, message: '请选择切换后的形态' };
    if (mode !== '正常态' && !reason.trim()) return { ok: false, message: '请填写切换原因' };
    if (reason.length > 200) return { ok: false, message: '切换原因最多 200 字' };
    const beforeMode = g.mode;
    audit('池形态', poolLabel(groupId), beforeMode, mode, operator, reason.trim() || undefined);
    g.mode = mode;
    if (mode !== '正常态') clearStatuses([groupId], mode === '降级态');
    notifyAdmins('池形态切换', [groupId],
      `${operator ?? operatorName()}已将${poolLabel(groupId)}由${beforeMode}切换为${mode}${reason.trim() ? `：${reason.trim()}` : ''}。`);
    persist();
    if (mode === '正常态') resumePools([groupId]);
    return { ok: true, message: `已切换为${mode}` };
  }

  function setRunMode(mode: RunMode, operator?: string): OccupyResult {
    if (config.value.runMode === mode) return { ok: true, message: '' };
    audit('运行方式', '全局', config.value.runMode, mode, operator);
    config.value.runMode = mode;
    persist();
    if (mode === '正式派单' && config.value.globalSwitch) resumePools(groups.value.map((g) => g.id));
    return { ok: true, message: '已保存，对此后派单生效' };
  }

  /* ---------------- 上线阶段（第 17 章） ---------------- */

  const ROLLOUT_TARGET = '上线阶段';

  /** 当前上线阶段：试运行；正式派单下按开启班组开关的组数判定单组试点 / 多组 / 全量 */
  function rolloutStage(): RolloutStage {
    if (config.value.runMode === '试运行') return '试运行';
    const on = groups.value.filter((g) => g.switchOn).length;
    if (on >= groups.value.length) return '全量';
    return on <= 1 ? '单组试点' : '多组';
  }

  /** 进入某阶段的时刻（取最近一次推进 / 退回到该阶段的审计；试运行另认全局开关开启） */
  function rolloutStageSince(stage: RolloutStage): number | null {
    const hit = [...audits.value].reverse().find((a) => (a.target === ROLLOUT_TARGET && a.after === stage)
      || (stage === '试运行' && ((a.kind === '全局开关' && a.after === '开启') || (a.kind === '运行方式' && a.target === '全局' && a.after === '试运行'))));
    const at = hit ? parseStamp(hit.at) : NaN;
    return Number.isFinite(at) ? at : null;
  }

  /**
   * 推进 / 退回上线阶段（第 17 章）：由管理员在运行设置确认，记审计并通知全部管理员及受影响班组长。
   * - 试运行 → 单组试点：切正式派单，只开启试点组的班组开关（`groupIds` 一个），其余组关闭；
   * - 单组试点 → 多组：逐组开启（`groupIds` 为本次开启的组）；多组 → 全量：全部组开启；
   * - 退回：单组试点 → 试运行切回试运行；多组 → 单组试点只保留 `groupIds` 一个组开启；全量 → 多组关闭 `groupIds`。
   */
  function setRolloutStage(to: RolloutStage, groupIds: string[] = [], operator?: string): OccupyResult {
    const from = rolloutStage();
    if (from === to) return { ok: false, message: '' };
    if (!config.value.globalSwitch) return { ok: false, message: '全局开关已关闭，请先在派单策略开启' };
    const fromIdx = ROLLOUT_STAGES.indexOf(from);
    const toIdx = ROLLOUT_STAGES.indexOf(to);
    if (Math.abs(fromIdx - toIdx) !== 1) return { ok: false, message: '' };
    const forward = toIdx > fromIdx;
    const valid = groupIds.filter((id) => !!groupOf(id));
    // 各组目标开关
    const target = new Map(groups.value.map((g) => [g.id, g.switchOn]));
    if (to === '单组试点') {
      if (valid.length !== 1) return { ok: false, message: '请选择试点组' };
      groups.value.forEach((g) => target.set(g.id, g.id === valid[0]));
    } else if (to === '多组') {
      if (!valid.length) return { ok: false, message: forward ? '请选择开启的组' : '请选择关闭的组' };
      valid.forEach((id) => target.set(id, forward));
      const onCount = [...target.values()].filter(Boolean).length;
      if (onCount <= 1 || onCount >= groups.value.length) return { ok: false, message: forward ? '请选择开启的组' : '请选择关闭的组' };
    } else if (to === '全量') {
      groups.value.forEach((g) => target.set(g.id, true));
    }
    const affected = groups.value.filter((g) => target.get(g.id) !== g.switchOn).map((g) => g.id);
    const opened = groups.value.filter((g) => target.get(g.id) && !g.switchOn).map((g) => g.label);
    const closed = groups.value.filter((g) => !target.get(g.id) && g.switchOn).map((g) => g.label);
    if (to === '试运行') {
      audit('运行方式', '全局', config.value.runMode, '试运行', operator);
      config.value.runMode = '试运行';
    } else {
      if (from === '试运行') {
        audit('运行方式', '全局', config.value.runMode, '正式派单', operator);
        config.value.runMode = '正式派单';
      }
      for (const g of groups.value) {
        const on = target.get(g.id)!;
        if (on === g.switchOn) continue;
        audit('班组开关', g.label, g.switchOn ? '开启' : '关闭', on ? '开启' : '关闭', operator);
        g.switchOn = on;
        if (!on) clearStatuses([g.id], false);
      }
    }
    audit('运行方式', ROLLOUT_TARGET, from, to, operator);
    const detail = [
      ...(opened.length ? [`开启班组开关：${opened.join('、')}`] : []),
      ...(closed.length ? [`关闭班组开关：${closed.join('、')}`] : []),
    ].join('；');
    notifyAdmins(forward ? '上线阶段推进' : '上线阶段退回', to === '试运行' || from === '试运行' ? groups.value.map((g) => g.id) : affected,
      `${operator ?? operatorName()}已将智能派单上线阶段由${from}${forward ? '推进至' : '退回至'}${to}${detail ? `，${detail}` : ''}。`);
    persist();
    if (to !== '试运行') resumePools(groups.value.filter((g) => g.switchOn).map((g) => g.id));
    return { ok: true, message: forward ? `已推进至${to}` : `已退回至${to}` };
  }

  /* ---------------- 入池规则 CRUD（3.3） ---------------- */

  function condKey(c: PoolRuleConditions): string {
    const norm = (xs: unknown[]) => xs.map((x) => JSON.stringify(x)).sort();
    return JSON.stringify(Object.fromEntries(Object.entries(c).map(([k, v]) => [k, norm(v as unknown[])])));
  }

  /** 入池规则校验；通过返回空串，否则返回提示文案（3.3 校验表） */
  function validatePoolRule(draft: Omit<PoolRule, 'id' | 'updatedBy' | 'updatedAt'>, excludeId?: string): string {
    const name = draft.name.trim();
    if (!name) return '请输入规则名称';
    if (name.length > 30) return '规则名称最多 30 字';
    const others = rules.value.filter((r) => r.id !== excludeId);
    if (others.some((r) => r.name === name)) return '规则名称已存在';
    if (!Number.isInteger(draft.priority) || draft.priority < 1 || draft.priority > 999) return '请输入 1–999 的整数';
    const dup = others.find((r) => r.priority === draft.priority);
    if (dup) return `优先级 ${draft.priority} 已被规则「${dup.name}」使用`;
    if (!draft.poolId || !isDispatchPool(draft.poolId)) return '请选择归属池';
    if (Object.values(draft.conditions).every((v) => !(v as unknown[]).length)) return '请至少设置一个条件';
    if (draft.enabled) {
      const same = others.find((r) => r.enabled && condKey(r.conditions) === condKey(draft.conditions));
      if (same) return `与规则「${same.name}」条件相同，请调整条件或优先级`;
    }
    return '';
  }

  function nextRulePriority(): number {
    return Math.min(999, rules.value.reduce((m, r) => Math.max(m, r.priority), 0) + 1);
  }

  function addPoolRule(draft: Omit<PoolRule, 'id' | 'updatedBy' | 'updatedAt'>, operator?: string): OccupyResult & { rule?: PoolRule } {
    const err = validatePoolRule(draft);
    if (err) return { ok: false, message: err };
    const rule: PoolRule = { ...clone(draft), name: draft.name.trim(), id: nextId('pr'), updatedBy: operator ?? operatorName(), updatedAt: stamp() };
    rules.value = [...rules.value, rule];
    audit('入池规则', rule.name, '—', `新增 · ${poolLabel(rule.poolId)}`, operator);
    persist();
    return { ok: true, message: '已保存，对此后派单生效', rule };
  }

  function updatePoolRule(id: string, patch: Partial<Omit<PoolRule, 'id'>>, operator?: string): OccupyResult {
    const cur = rules.value.find((r) => r.id === id);
    if (!cur) return { ok: false, message: '' };
    const next = { ...cur, ...clone(patch) };
    const err = validatePoolRule(next, id);
    if (err) return { ok: false, message: err };
    audit('入池规则', cur.name, `${cur.priority} · ${poolLabel(cur.poolId)} · ${cur.enabled ? '启用' : '停用'}`,
      `${next.priority} · ${poolLabel(next.poolId)} · ${next.enabled ? '启用' : '停用'}`, operator);
    rules.value = rules.value.map((r) => (r.id === id ? { ...next, name: next.name.trim(), updatedBy: operator ?? operatorName(), updatedAt: stamp() } : r));
    persist();
    return { ok: true, message: '已保存，对此后派单生效' };
  }

  function setPoolRuleEnabled(id: string, enabled: boolean, operator?: string): OccupyResult {
    return updatePoolRule(id, { enabled }, operator);
  }

  function removePoolRule(id: string, operator?: string): OccupyResult {
    const cur = rules.value.find((r) => r.id === id);
    if (!cur) return { ok: false, message: '' };
    rules.value = rules.value.filter((r) => r.id !== id);
    audit('入池规则', cur.name, `${cur.priority} · ${poolLabel(cur.poolId)}`, '删除', operator);
    persist();
    return { ok: true, message: '已删除' };
  }

  /* ---------------- 坐席维护（6.5 / 7.5 / 8.1 / 11.5） ---------------- */

  function profileText(p: AgentProfile): string {
    return PROFILE_DIMS.map((d) => {
      const v = p[d.key];
      if (v === null) return `${d.label}:未设`;
      if (v === 'any') return `${d.label}:不限`;
      return `${d.label}:${(v as (string | ProductPick)[]).map((x) => (typeof x === 'string' ? x : x.name ?? x.category)).join('、')}`;
    }).join('；');
  }

  /** 画像校验：返回提示文案或空串 */
  function validateProfile(p: AgentProfile): string {
    for (const d of PROFILE_DIMS) {
      const v = p[d.key];
      if (v === null) return `请设置${d.label}`;
      if (Array.isArray(v) && v.length === 0) return `请选择${d.label}，或改为不限`;
    }
    return '';
  }

  function setProfile(name: string, profile: AgentProfile, proficiency?: Proficiency, operator?: string): OccupyResult {
    const a = agentOf(name);
    if (!a) return { ok: false, message: '' };
    const err = validateProfile(profile);
    if (err) return { ok: false, message: err };
    audit('人员画像', a.name, profileText(a.profile), profileText(profile), operator);
    a.profile = clone(profile);
    if (proficiency && proficiency !== a.proficiency) {
      audit('熟练度', a.name, a.proficiency, proficiency, operator);
      a.proficiency = proficiency;
    }
    persist();
    onAgentAvailable(a.name);
    return { ok: true, message: '人员画像已保存，对此后派单生效' };
  }

  /** 批量设置画像（6.5）：`patch` 中未给出的维度＝不修改 */
  function batchSetProfile(names: string[], patch: Partial<AgentProfile>, proficiency?: Proficiency, operator?: string): OccupyResult {
    for (const d of PROFILE_DIMS) {
      const v = patch[d.key];
      if (Array.isArray(v) && v.length === 0) return { ok: false, message: `请选择${d.label}，或改为不限` };
    }
    let n = 0;
    for (const name of names) {
      const a = agentOf(name);
      if (!a) continue;
      const next = { ...a.profile, ...clone(patch) };
      audit('人员画像', a.name, profileText(a.profile), profileText(next), operator);
      a.profile = next;
      if (proficiency && proficiency !== a.proficiency) {
        audit('熟练度', a.name, a.proficiency, proficiency, operator);
        a.proficiency = proficiency;
      }
      n += 1;
    }
    persist();
    return { ok: true, message: `已为 ${n} 名坐席设置人员画像` };
  }

  function setProficiency(name: string, p: Proficiency, operator?: string): OccupyResult {
    const a = agentOf(name);
    if (!a) return { ok: false, message: '' };
    if (a.proficiency === p) return { ok: true, message: '' };
    audit('熟练度', a.name, a.proficiency, p, operator);
    a.proficiency = p;
    persist();
    return { ok: true, message: '人员画像已保存，对此后派单生效' };
  }

  /**
   * 个人上限个人值（7.5）：`null` 恢复默认。个人值小于当前在途时返回 `needConfirm`（调用方二次确认后带 `force` 再调）。
   */
  function setCapOverride(name: string, value: number | null, opts: { force?: boolean; operator?: string } = {}): OccupyResult & { needConfirm?: string } {
    const a = agentOf(name);
    if (!a) return { ok: false, message: '' };
    if (value !== null && (!Number.isInteger(value) || value < 1 || value > 50)) return { ok: false, message: '请输入 1–50 的整数' };
    const inTransit = inTransitOf(a.name);
    if (value !== null && value < inTransit && !opts.force) {
      return { ok: false, message: '', needConfirm: `当前在途 ${inTransit} 张已超过新上限，已派出的工单不收回，此后不再派新单直至回落` };
    }
    audit('个人上限', a.name, a.capOverride == null ? `默认 ${defaultCapOf(a)}` : String(a.capOverride),
      value == null ? `默认 ${defaultCapOf(a)}` : String(value), opts.operator);
    a.capOverride = value;
    persist();
    onAgentAvailable(a.name);
    return { ok: true, message: '个人上限已更新' };
  }

  function setPersonalSwitch(name: string, on: boolean, operator?: string): OccupyResult {
    const a = agentOf(name);
    if (!a) return { ok: false, message: '' };
    if (a.personalSwitch === on) return { ok: true, message: '' };
    audit('个人开关', a.name, a.personalSwitch ? '开启' : '关闭', on ? '开启' : '关闭', operator);
    a.personalSwitch = on;
    persist();
    if (on) onAgentAvailable(a.name);
    return { ok: true, message: `已${on ? '开启' : '关闭'}${a.name}的自动派单` };
  }

  /** 签入状态（11.5）：签入即在班（P0）；签入后触发预留与排队选单 */
  function setSignIn(name: string, status: SignInStatus) {
    const a = agentOf(name);
    if (!a || a.signIn === status) return;
    const now = Date.now();
    // 在岗时长（13.2）：签入期间累计；离开签入时把本次签入时长并入当日累计
    rollOnDuty(a, now);
    if (a.signIn === '签入' && a.signInSince) a.onDutyMs = (a.onDutyMs ?? 0) + Math.max(0, now - a.signInSince);
    a.signInSince = status === '签入' ? now : null;
    a.signIn = status;
    if (status === '签入') a.signedInToday = true;
    persist();
    if (status === '签入') onAgentAvailable(a.name);
  }

  /** 跨日清零当日在岗累计；本次签入跨日时从当日零点起算 */
  function rollOnDuty(a: DispatchAgent, now: number) {
    const today = dayKey(now);
    if (a.onDutyDay === today) return;
    a.onDutyDay = today;
    a.onDutyMs = 0;
    if (a.signInSince) a.signInSince = Math.max(a.signInSince, dayStartOf(now));
  }

  /** 当日在岗小时数（签入时长，13.2 派单均衡度「每在岗小时」） */
  function onDutyHoursOf(name: string, now: number = Date.now()): number {
    const a = agentOf(name);
    if (!a) return 0;
    const sameDay = a.onDutyDay === dayKey(now);
    const acc = sameDay ? a.onDutyMs ?? 0 : 0;
    const since = a.signIn === '签入' && a.signInSince ? Math.max(a.signInSince, dayStartOf(now)) : null;
    return (acc + (since ? Math.max(0, now - since) : 0)) / (60 * MIN);
  }

  /** 派单策略（14.2 运行设置 / 出池规则 / 个人上限）保存：返回提示文案 */
  function updateConfig(patch: Partial<DispatchConfig>, operator?: string): OccupyResult {
    const next: DispatchConfig = { ...config.value, ...clone(patch) };
    if (!next.factors.some((f) => f.enabled)) return { ok: false, message: '请至少启用一个评分因子' };
    if (next.factors.some((f) => !Number.isInteger(f.weight) || f.weight < 0 || f.weight > 100)) return { ok: false, message: '请输入 0–100 的整数' };
    if (next.relaxSlaPercent <= next.fallbackSlaPercent) return { ok: false, message: '放宽阈值须大于兜底阈值' };
    if (next.noSlaFallbackMinutes <= next.relaxQueueMinutes) return { ok: false, message: '兜底排队时长须大于放宽排队时长' };
    if (Object.values(next.roleBase).some((v) => !Number.isInteger(v) || v < 1 || v > 50)) return { ok: false, message: '请输入 1–50 的整数' };
    if (Object.values(next.proficiencyCoef).some((v) => v < 0.1 || v > 3)) return { ok: false, message: '请输入 0.1–3 的数值' };
    // 运行设置 · 自动降级 / 回切 / 小休阈值（14.2）
    const RUN_RANGES: [keyof DispatchConfig, number, number][] = [
      ['autoFailRate', 1, 100], ['autoSuccessRate', 1, 100], ['autoSyncMinutes', 5, 120],
      ['autoEngineMinutes', 1, 30], ['resumeOkMinutes', 1, 60], ['idleToBreakMinutes', 5, 240],
    ];
    for (const [k, lo, hi] of RUN_RANGES) {
      const v = next[k] as number;
      if (!Number.isInteger(v) || v < lo || v > hi) return { ok: false, message: `请输入 ${lo}–${hi} 的整数` };
    }
    const changed = (Object.keys(patch) as (keyof DispatchConfig)[]).filter((k) => JSON.stringify(config.value[k]) !== JSON.stringify(next[k]));
    if (changed.length) audit('派单策略', '全局', changed.join('、'), '已修改', operator);
    // 开关、形态、运行方式走各自 action（带审计与重派）
    const { globalSwitch, globalMode, runMode, autoDegraded, ...rest } = next;
    void globalSwitch; void globalMode; void runMode; void autoDegraded;
    config.value = { ...config.value, ...rest };
    persist();
    return { ok: true, message: '已保存，对此后派单生效' };
  }

  /* ---------------- 读：视图 ---------------- */

  function ticketStateOf(no: string): TicketDispatchState | undefined {
    const st = ticketStates.value[no];
    if (!st) return undefined;
    const raw = TICKETS.find((x) => x.no === no);
    // 已有处理人或已离池：派单状态失效
    if (raw && (raw.assignee || raw.tab !== 'pool')) return { ...st, status: null };
    return st;
  }
  function dispatchStatusOf(no: string): DispatchStatus | null {
    return ticketStateOf(no)?.status ?? null;
  }
  function logsOf(no: string): DispatchLogEntry[] {
    return logs.value.filter((x) => x.ticketNo === no).sort((a, b) => a.seq - b.seq);
  }
  function poolViews(): DispatchPoolView[] {
    const now = Date.now();
    return groups.value.map((g) => {
      const inPool = TICKETS.filter((t) => t.groupId === g.id && t.tab === 'pool' && !t.assignee && !t.archived);
      const st = inPool.map((t) => ticketStateOf(t.no)).filter((x): x is TicketDispatchState => !!x);
      const members = membersOf(g.id);
      return {
        id: g.id,
        label: g.label,
        poolLabel: poolLabelOf(g.label),
        effectiveMode: effectiveModeOf(g.id),
        groupMode: groupModeOf(g.id),
        switchOn: g.switchOn,
        leaders: g.leaders,
        waitingOriginal: st.filter((x) => x.status === '等原处理人').length,
        queued: st.filter((x) => x.status === '排队中').length,
        failed: st.filter((x) => x.status === '派单失败回池').length,
        maxWaitMin: st.reduce((m, x) => Math.max(m, Math.round((now - x.enteredAt) / MIN)), 0),
        memberCount: members.length,
        configuredCount: members.filter((a) => isProfileConfigured(a.profile)).length,
      };
    });
  }

  /* ---------------- 定时器 · 注册 ---------------- */

  // 接入售后回传的派单落点（`aftersaleEvents.dispatchByCurrentRule`）：store 建立时注册，
  // 不在模块加载时注册 —— 种子单在模块加载期经同一函数构建，须仍走原落池口径
  registerDispatchEngine((t, ctx) => resolveForAftersale(t, ctx));

  if (typeof window !== 'undefined') {
    window.setInterval(() => {
      try {
        tick();
      } catch {
        /* 定时判定异常不影响页面 */
      }
    }, TICK_MS);
    // 刷新 / 关页前把派单改写过的工单行现值落一次
    window.addEventListener('pagehide', () => persist());
    // 开发态开关：控制台 `__flowosDispatch.simulateEngineDown(true)` 等模拟自动降级条件
    if (import.meta.env.DEV) {
      (window as unknown as Record<string, unknown>).__flowosDispatch = {
        simulateEngineDown, simulateAgentSyncStall, tick, healthView,
        // 客户回访打回：`__flowosDispatch.surveyReturn('工单号')`（调研中的通用工单）
        surveyReturn: (no: string) => {
          const t = poolTicket(no);
          return t ? returnFromSurvey(t) : null;
        },
      };
    }
  }

  return {
    // state
    config, groups, agents, rules, ticketStates, overAssigned, logs, audits,
    // 读
    groupOf, isDispatchPool, poolLabel, globalEffectiveMode, groupModeOf, effectiveModeOf, membersOf,
    agentOf, agentView, defaultCapOf, capOf, inTransitOf, resolvePool, profileMatches, matchesMe,
    ticketStateOf, dispatchStatusOf, logsOf, poolViews, nextRulePriority, validatePoolRule, validateProfile,
    // 自动降级 · 回切
    health, healthView, resumeReady, simulateEngineDown, simulateAgentSyncStall,
    // 引擎
    dispatchTicket, dispatchNewTicket, redispatchToPool, resolveForAftersale, releaseCapacity, onAgentAvailable, tick, resumePools,
    returnFromSurvey,
    // 先到先得 · 人工动作
    checkOccupy, checkClaim, recordManualTake, withdrawTicket,
    // 形态 · 开关 · 运行方式 · 上线阶段
    setGlobalSwitch, setGlobalMode, setGroupSwitch, setGroupMode, setRunMode,
    rolloutStage, rolloutStageSince, setRolloutStage, onDutyHoursOf,
    // 入池规则
    addPoolRule, updatePoolRule, setPoolRuleEnabled, removePoolRule,
    // 坐席
    setProfile, batchSetProfile, setProficiency, setCapOverride, setPersonalSwitch, setSignIn,
    // 配置
    updateConfig,
  };
});

