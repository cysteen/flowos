import { defineStore } from 'pinia';
import { reactive, ref, toRaw } from 'vue';
import { TICKETS } from '@/mock/tickets';
import { POOL_GROUPS, isFirstResponded, type Ticket } from '@/views/tickets/types/ticket';
import type { TimelineEntry } from '@/views/tickets/types/ticketDetail';
import { CUSTOMER_DIRECTORY } from '@/views/tickets/types/createTicket';
import { isFlashTicket } from '@/views/tickets/types/flash';
import { isXiaozhiTicket } from '@/views/tickets/types/xiaozhi';
import { isRefundTicket } from '@/views/tickets/types/refund';
import { FLASH_SLA_FIRST_LIMIT_MS, readSla } from '@/views/tickets/utils/slaClock';
import {
  registerDispatchEngine, type DispatchContext, type DispatchOutcome,
} from '@/views/tickets/composables/aftersaleEvents';
import {
  DEFAULT_POOL_ID, DEFAULT_POOL_LABEL, IN_TRANSIT_COUNT_RULE, MANAGEMENT_ROLES, POOL_NAME_MAX, PRIORITY_RANK,
  SCAN_INTERVAL_MINUTES, STALL_REMIND_HOURS, TAKEN_MESSAGE, PROFILE_DIMS, PROTECTED_POOL_TIP,
  computeScore, defaultDispatchConfig, emptyProfile, isProfileConfigured, isProtectedPool, migrateOriginalChain, stricterMode, takeIntensity,
  type OriginalExclusion, type OriginalRelation, type OriginalRelationRule,
  type AgentProfile, type DispatchAgent, type DispatchAuditEntry, type DispatchAuditKind, type DispatchConfig,
  type DispatchFailReason, type DispatchGroup, type DispatchLogEntry, type DispatchPath, type DispatchPool, type DispatchResult,
  type DispatchRole, type DispatchStatus, type DispatchTrigger, type GateKey, type ManualAction, type OccupyResult,
  type PoolMode, type PoolRule, type PoolRuleConditions, type ProductPick, type Proficiency,
  NOT_OWN_POOL_MESSAGE,
  type ScoreDetail, type SignInStatus, type TicketDispatchState,
} from '@/views/tickets/types/dispatch';
import { POOL_ENTERED_AGO_MIN, SPECIAL_POOL_ENTERED_AGO_MIN, buildDispatchDemo } from '@/mock/dispatchDemo';
import { SCORE_DIMENSION_ROWS, failLabel, pathWithRelation } from '@/views/admin/dispatch/dispatchLabels';
import { useNotifyLogStore } from './notifyLog';
import { useUserStore } from './user';
import { useFlashStore } from './flash';
import { useXiaozhiStore } from './xiaozhi';
import { useRefundStore } from './refund';
import { joinProblemPath, splitProblemPath, useProblemTagsStore } from './problemTags';

/**
 * 智能派单（【1215】PRD P0）：入池规则、人员画像 / 熟练度 / 个人上限 / 个人开关、池三态、派单引擎、派单日志与审计。
 *
 * 【数据】坐席、组、入池规则、配置、工单派单状态、派单日志、审计都在本 store；工单行只改处理人 / 子状态 / 归属组 / 履历，
 * 派单状态（排队中）按工单号存在 `ticketStates`，不写进工单行。
 * 【持久化】`flowos-dispatch` 一个键，带版本号 `DISPATCH_CACHE_VERSION`；改种子必须升版本号。
 * 派单改写过的通用工单整行随本键落库、store 建立时回放到工单库（`main.ts` 启动即建立），刷新前后工单行与派单状态 / 日志一致；
 * 刷机 / 小智 / 个册退费单的工单行由各自服务缓存落库。
 * 【引擎】`dispatchTicket(ticket, trigger)` 走第 2、4 章主流程：入池 → 派单方式 → 三步（谁可以接单 → 优先派回原处理人 → 综合打分）→ 派出 / 留池。
 * 自动派单与混合派单都走完三步，区别只在派不出时：自动派单留池排队、每 5 分钟重试，不可领取；混合派单留池待领取，无派单状态、不再重试。
 * 第 ② 步不依赖第 ① 步：原处理人只看是否已签入，坐席状态与个人上限不挡，满额派回记超额指派。
 * 派单方式（全局 / 各池）与个人开关全部由人手动切换，系统不自动切换。
 * 【两个判定时点】进池当场判定一次（新单、调剂到池、升级三线、售后转回、回访打回、池停用重新入池、重新进池）；
 * 自动派单池其余一律等 `scanPools()`，每 5 分钟扫一轮。坐席点就绪、名额释放、开个人开关、改画像、改上限、切派单方式都不立即派。
 * 【每轮扫描】
 * ① 取启用的自动派单池内未领取的单（含排队中、无派单状态的单）；混合派单池、人工派单池不取。
 * ② 排序：首响已超时的在前（超时久的最前），其后优先级高的在前，再按首响剩余比例小的在前，最后等待久的在前。
 * ③ 逐张判定：生效方式刚变为自动派单的池，其单按新进入派单处理（等待时长不清零）；其余重走主流程。
 *    没派出且派单状态不变的单不写日志、不写履历、不发通知。
 * ④ 清理超额指派 / 领取超限标记，汇总提醒滞留超过 4 小时的单。
 */

const LS_KEY = 'flowos-dispatch';
/** 种子版本闸：改种子（坐席 / 组 / 规则 / 默认配置）必须加一 */
export const DISPATCH_CACHE_VERSION = 27;
const LOG_LIMIT = 800;
const AUDIT_LIMIT = 400;
const MIN = 60_000;
const SCAN_MS = SCAN_INTERVAL_MINUTES * MIN;
const STALL_MS = STALL_REMIND_HOURS * 60 * MIN;
const SYSTEM = '系统';
/** 通用工单首响时限（分钟）：工单 SLA 规则按优先级配置的完整时限，与建单表单的 SLA 起算同源 */
const FIRST_RESP_LIMIT_MIN: Record<string, number> = { P0: 15, P1: 480, P2: 480, P3: 480 };

/* ------------------------------------------------------------------ */
/* 工具                                                                 */
/* ------------------------------------------------------------------ */

const pad = (n: number) => String(n).padStart(2, '0');
function stamp(ms: number = Date.now()): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
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
    .map((g) => ({ id: g.id, label: g.label, leaders: [LEADER] }));
}

/**
 * 初始工单池（14.3）：每个派单组一个池，池 id 与组 id 相同（专属工单线、售后转回的落池点按 id 接线），名称「〈组名〉池」。
 * 运行中种子：二线、综合、技术支持三池为自动派单；硬件缺陷组池由管理员切为混合派单（原因见审计种子）；
 * 小智、教育支持两池（专属工单线）为混合派单、组内领取；教育刷机处理组池为人工派单、手动领单。综合处理组池为默认池。
 */
const MIXED_SEED_POOL_IDS = new Set(['hardware', 'xiaozhi', 'edu']);
const MANUAL_SEED_POOL_IDS = new Set(['edu-flash']);
function seedPool(id: string, groupId: string, name: string, mode: PoolMode, at: string): DispatchPool {
  return {
    id, name, groupId, mode, status: '启用', isDefault: id === DEFAULT_POOL_ID,
    createdBy: SYSTEM, createdAt: at, updatedBy: SYSTEM, updatedAt: at,
  };
}
function seedPools(groups: DispatchGroup[], now: number): DispatchPool[] {
  const at = stamp(now);
  const modeOf = (id: string): PoolMode => {
    if (MANUAL_SEED_POOL_IDS.has(id)) return '人工派单';
    return MIXED_SEED_POOL_IDS.has(id) ? '混合派单' : '自动派单';
  };
  return groups.map((g) => seedPool(g.id, g.id, poolLabelOf(g.label), modeOf(g.id), at));
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
  // 在岗时长种子：就绪的坐席本班已就绪约 3.5 小时（不早于当日零点）；小休的坐席当日累计 1.5 小时
  const shiftStart = Math.max(dayStartOf(now), now - 210 * MIN);
  const a = (
    name: string, staffNo: string, roles: DispatchRole[], groupIds: string[],
    o: Partial<DispatchAgent> = {},
  ): DispatchAgent => {
    const row: DispatchAgent = {
      name, staffNo, roles, groupIds,
      signIn: '就绪', disabled: false,
      profile: { ...ANY }, proficiency: '熟练', capOverride: null,
      // 二线及以上专员开、管理角色关（8.1）
      personalSwitch: roles.some((r) => !MANAGEMENT_ROLES.includes(r)),
      lastTakenAt: null, todayTakes: [],
      ...o,
    };
    const on = row.signIn === '就绪';
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
      proficiency: '专家',
    }),
    // 张三：二线专员演示账号，种子单的演示处理人（我的任务、已办、审核、催补等）；同属教育刷机处理组（刷机池演示）、
    // 教育支持组（个册退费种子单的组员）。名下种子在途 34 张，个人上限设 40：不超限，并留出几张名额接引擎派单
    a('张三', 'E2002', ['二线专员'], ['line2', DEFAULT_POOL_ID, 'edu-flash', 'edu'], {
      capOverride: 40,
      profile: { ...ANY, ticketTypes: ['咨询', '建议'], products: [{ category: '智能硬件' }] },
    }),
    a('林坐席', 'E2003', ['二线专员'], ['line2', DEFAULT_POOL_ID], {
      profile: { ...ANY, products: [{ category: '学习硬件' }] },
    }),
    a('徐璐', 'E2004', ['二线专员'], [DEFAULT_POOL_ID], { proficiency: '专家' }),
    a('刘洋', 'E2005', ['二线专员'], [DEFAULT_POOL_ID], { signIn: '小休', proficiency: '初级' }),
    a('陈坐席', 'E2006', ['二线专员'], ['hardware']),
    a('李四', 'E2007', ['二线专员'], ['hardware'], {
      signIn: '小休', proficiency: '初级', profile: { ...ANY, products: [{ category: '智能硬件' }, { category: '学习硬件' }] },
    }),
    a('何教支', 'E2008', ['二线专员'], ['edu'], { profile: { ...ANY, businessTypes: ['教育'] } }),
    a('许文静', 'E2301', ['二线刷机处理人'], ['edu-flash']),
    a('谭小智', 'E2401', ['小智工单处理人'], ['xiaozhi']),
    // 技术支持：三线技术支持组（技术支持池，12.5）成员。陈技支画像已配置接引擎派单；周技支画像未配置，不接引擎派单、可领取（6.3）
    a('陈技支', 'E3001', ['技术支持'], ['tech']),
    a('周技支', 'E3002', ['技术支持'], ['tech'], { profile: emptyProfile() }),
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
 * 规则引擎来源照搬优先级排前；问题分类来源由问题分类管理的处理组生成（`problemTags.migrationRules`，11-02 D7）：
 * 只带路径不带产品，同路径同组合并，一级下全同组时上卷一级，按层级由深到浅排列。
 * 两处条件相同时问题分类那条置停用待复核。目标池映射到初始工单池（池 id 与组 id 相同）。
 */
function seedRules(now: number): PoolRule[] {
  const at = stamp(now);
  const r = (id: string, name: string, priority: number, c: Partial<PoolRuleConditions>, poolId: string,
    migratedFrom: PoolRule['migratedFrom'], enabled = true): PoolRule => ({
    id, name, priority, conditions: cond(c), poolId, enabled, migratedFrom, updatedBy: SYSTEM, updatedAt: at,
  });
  const engine = [
    r('pr-1', '投诉自动派学习机组（迁移）', 1, { ticketTypes: ['投诉'], products: T20 }, 'hardware', '规则引擎派单'),
  ];
  const keyOf = (c: PoolRuleConditions) => JSON.stringify(Object.entries(c).map(([k, v]) => [k, [...(v as unknown[])].map((x) => JSON.stringify(x)).sort()]));
  const engineKeys = new Set(engine.map((x) => keyOf(x.conditions)));
  const fromTags = useProblemTagsStore().migrationRules().map((m, i) => {
    const c = cond({ problems: m.problems });
    return r(`pr-pt-${i + 1}`, m.name, 10 + i, c, m.poolId, '问题分类处理组', m.enabled && !engineKeys.has(keyOf(c)));
  });
  return [...engine, ...fromTags];
}

interface Persisted {
  version: number;
  savedAt: number;
  config: DispatchConfig;
  groups: DispatchGroup[];
  pools: DispatchPool[];
  agents: DispatchAgent[];
  rules: PoolRule[];
  ticketStates: Record<string, TicketDispatchState>;
  overAssigned: Record<string, boolean>;
  /** 领取后在途超过上限的坐席（标「满载」，不算超限、超额指派，7.4） */
  overClaimed: Record<string, boolean>;
  logs: DispatchLogEntry[];
  audits: DispatchAuditEntry[];
  seq: number;
  /** 上一轮工单池扫描时刻（ms）：刷新不打断 5 分钟节奏 */
  lastScanAt?: number;
  /** 生效方式刚变为自动派单、等下一轮扫描重新判定的池 */
  resumePoolIds?: string[];
  /** 已汇总提醒过滞留的工单（同一张只提醒一次） */
  stallNoticed?: Record<string, boolean>;
  /**
   * 派单改写过的通用工单行快照（处理人 / 子状态 / 归属池 / 履历等整行），启动时回放到工单库，
   * 刷新前后工单行与派单状态、派单日志一致。刷机 / 小智 / 个册退费单的工单行由各自服务的缓存落库，不在此存。
   */
  rows?: Record<string, Ticket>;
  /** 刷机 / 小智种子单的进池时刻（ms）：其工单行不在 `rows` 里，单独落库，刷新后等待时长连续 */
  specialPoolEnteredAt?: Record<string, number>;
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

/** 缓存配置补全：旧版出池规则 ② 五项转为关系链（4.3）；已取消的保留配置与打分配置一并去掉 */
const LEGACY_CONFIG_KEYS = ['originalFirst', 'windowConsultDays', 'windowComplaintDays', 'originalSameProblem', 'reserveMinutes', 'reserveSlaPercent', 'factors', 'recentHours'];
function normalizeConfig(raw: Partial<DispatchConfig> & Record<string, unknown>): DispatchConfig {
  const next = { ...defaultDispatchConfig(), ...raw, originalChain: migrateOriginalChain(raw) } as DispatchConfig & Record<string, unknown>;
  for (const k of LEGACY_CONFIG_KEYS) delete next[k];
  return next;
}

/** 旧缓存里的派单日志：等原处理人的判定按判定时的派单方式归入排队中或留池，保留到期记补单扫描，去掉被保留人字段 */
function normalizeLogs(raw: DispatchLogEntry[]): DispatchLogEntry[] {
  return raw.map((l) => {
    const old = l as unknown as { path?: string; status?: string | null; trigger?: string; reserved?: unknown };
    const waiting = old.path === '预留' || old.status === '等原处理人';
    const expired = old.trigger === '保留到期';
    if (!waiting && !expired && !('reserved' in old)) return l;
    const { reserved: _reserved, ...rest } = l as DispatchLogEntry & { reserved?: unknown };
    const auto = l.effectiveMode === '自动派单';
    return {
      ...rest,
      ...(expired ? { trigger: '补单扫描' as const } : {}),
      ...(waiting ? { path: auto ? '排队' as const : '留池' as const, status: auto ? '排队中' as const : null, originalRelation: undefined } : {}),
    };
  });
}

/** 进池事件：混合派单、人工派单下进池且未派出发待领取提醒（重新进池不重发） */
const POOL_ENTRY_TRIGGERS: DispatchTrigger[] = ['新单', '调剂到池', '升级三线', '售后转回', '回访打回', '池停用'];

/**
 * 专属工单的到组通知（11.6：刷机、退费、小智到组通知同待领取提醒口径）。
 * 各服务在建立时登记自己的到组通知；引擎在该发待领取提醒的时点（混合派单 / 人工派单新单首次进池）
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
  /** 画像匹配且在班、仅因个人上限被挡的成员（排队原因判据） */
  blockedByCap: DispatchAgent[];
  /** 就绪成员数（排队原因判据，不看个人开关） */
  onDuty: number;
  /** 就绪且画像相符的成员数（不看个人开关、投诉回避）：有人而候选仍为空即「无可接单成员」 */
  matchedReady: number;
  /** 第一个没人满足的门槛；都有人满足时为空 */
  failedAt?: GateKey;
}

interface Decision {
  path: DispatchPath;
  assignee: string | null;
  status: DispatchStatus | null;
  score?: ScoreDetail;
  top3?: DispatchLogEntry['top3'];
  gateFailedAt?: GateKey;
  candidateCount?: number;
  failReason?: DispatchFailReason;
  /** 派回原处理人命中的关系（4.3） */
  originalRelation?: OriginalRelation;
  /** 因例外或不在岗不派回的原处理人 */
  originalExcluded?: { relation: OriginalRelation; name: string; reason: OriginalExclusion }[];
}

/** 关系链上取到的一名原处理人（每种关系只取最近一个，4.3） */
interface OriginalCandidate {
  relation: OriginalRelation;
  rule: OriginalRelationRule;
  name: string;
}

export interface DispatchOptions {
  /** 指定归属池（调剂到池、升级三线、专属工单落池点已定池时传入；不传按入池规则） */
  poolId?: string;
  /** 投诉对象（投诉回避） */
  complaintTarget?: string;
  /** 售后转回 / 回访打回：本单上一处理人（关系「本单退回」，有效期不限） */
  prevHandler?: string | null;
  /** 承接子单、升级投诉：原单号（关系「关联单」） */
  relatedNo?: string | null;
  /** 调剂到池前本单有处理人（受理短信只发一次，11.6） */
  hadHandler?: boolean;
}

/** 池视图（供工单池管理、分派监控、班组看板） */
export interface DispatchPoolView {
  /** 池 id */
  id: string;
  /** 处理组 id 与组名 */
  groupId: string;
  label: string;
  /** 池名称 */
  poolLabel: string;
  enabled: boolean;
  isDefault: boolean;
  effectiveMode: PoolMode;
  /** 本池派单方式 */
  poolMode: PoolMode;
  leaders: string[];
  /** 池内待派（未领取）张数 */
  pending: number;
  queued: number;
  /** 池内最长等待（分钟） */
  maxWaitMin: number;
  memberCount: number;
  configuredCount: number;
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
  /** 满载（7.4）：在途 ≥ 上限，含领取后超过上限；已标超限、超额指派的不再标 */
  full: boolean;
}

export const useDispatchStore = defineStore('dispatch', () => {
  const now0 = Date.now();
  const cached = readCache();

  // 运行中种子：全局自动派单（上线以来的切换记录见审计种子）
  const config = ref<DispatchConfig>(cached
    ? normalizeConfig(cached.config as unknown as Partial<DispatchConfig> & Record<string, unknown>)
    : { ...defaultDispatchConfig(), globalMode: '自动派单' });
  const groups = ref<DispatchGroup[]>(cached?.groups ?? seedGroups());
  const pools = ref<DispatchPool[]>(cached?.pools ?? seedPools(groups.value, now0));
  const agents = ref<DispatchAgent[]>(cached?.agents ?? seedAgents(now0));
  const rules = ref<PoolRule[]>(cached?.rules ?? seedRules(now0));
  const ticketStates = ref<Record<string, TicketDispatchState>>(cached?.ticketStates ?? {});
  const overAssigned = ref<Record<string, boolean>>(cached?.overAssigned ?? {});
  const overClaimed = ref<Record<string, boolean>>(cached?.overClaimed ?? {});
  const logs = ref<DispatchLogEntry[]>(normalizeLogs(cached?.logs ?? []));
  const audits = ref<DispatchAuditEntry[]>(cached?.audits ?? []);
  let seq = cached?.seq ?? 0;
  let lastScanAt = cached?.lastScanAt ?? now0;
  let resumePoolIds = new Set<string>(cached?.resumePoolIds ?? []);
  let stallNoticed: Record<string, boolean> = cached?.stallNoticed ?? {};
  const errorNoticed = new Set<string>();

  /** 无缓存时铺运行中种子：近两周派单日志与审计、池内待派、坐席当日在岗与接单时刻（`mock/dispatchDemo.ts`） */
  const demo = cached ? null : buildDispatchDemo(now0, agents.value, groups.value, rules.value);
  if (demo) {
    for (const a of agents.value) Object.assign(a, demo.agentPatch[a.name] ?? {});
    ticketStates.value = demo.ticketStates;
    overAssigned.value = demo.overAssigned;
    logs.value = demo.logs.slice(-LOG_LIMIT);
    audits.value = demo.audits;
  }

  // 默认池（综合处理组池）不在缓存里时补上
  if (!groups.value.some((g) => g.id === DEFAULT_POOL_ID)) {
    groups.value.push({ id: DEFAULT_POOL_ID, label: DEFAULT_POOL_LABEL, leaders: [LEADER] });
  }
  if (!pools.value.some((p) => p.id === DEFAULT_POOL_ID)) {
    pools.value.push(seedPool(DEFAULT_POOL_ID, DEFAULT_POOL_ID, poolLabelOf(DEFAULT_POOL_LABEL), '自动派单', stamp(now0)));
  }

  /** 旧缓存里等原处理人的单：自动派单池落到排队中，其余无派单状态；一并去掉保留字段 */
  function normalizeTicketStates() {
    for (const st of Object.values(ticketStates.value)) {
      const old = st as unknown as { status: string | null; reserveFor?: unknown; reserveUntil?: unknown; reserveRelation?: unknown; reservedOnce?: unknown };
      if (old.status === '等原处理人') old.status = effectiveModeOf(st.poolId) === '自动派单' ? '排队中' : null;
      delete old.reserveFor;
      delete old.reserveUntil;
      delete old.reserveRelation;
      delete old.reservedOnce;
    }
  }
  normalizeTicketStates();

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
  // 种子池内待派单注入工单库，并随派单快照落库（刷新后由回放补回）
  if (demo) {
    for (const row of demo.rows) {
      if (!TICKETS.some((x) => x.no === row.no)) TICKETS.unshift(row);
      touchRow(row);
    }
    for (const [no, ago] of Object.entries(POOL_ENTERED_AGO_MIN)) {
      const row = TICKETS.find((x) => x.no === no);
      if (!row) continue;
      row.poolEnteredAt = stamp(now0 - ago * MIN);
      touchRow(row);
    }
  }
  const specialPoolEnteredAt: Record<string, number> = cached?.specialPoolEnteredAt ?? Object.fromEntries(
    Object.entries(SPECIAL_POOL_ENTERED_AGO_MIN).map(([no, ago]) => [no, now0 - ago * MIN]),
  );

  function persist() {
    try {
      const data: Persisted = {
        version: DISPATCH_CACHE_VERSION,
        savedAt: Date.now(),
        config: config.value,
        groups: groups.value,
        pools: pools.value,
        agents: agents.value,
        rules: rules.value,
        ticketStates: ticketStates.value,
        overAssigned: overAssigned.value,
        overClaimed: overClaimed.value,
        logs: logs.value.slice(-LOG_LIMIT),
        audits: audits.value.slice(-AUDIT_LIMIT),
        seq,
        lastScanAt,
        resumePoolIds: [...resumePoolIds],
        stallNoticed,
        rows: rowSnapshots(),
        specialPoolEnteredAt,
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

  /** 待领取提醒 / 到组通知（11.6，进池且未派出）：专属工单走各自服务的到组通知，其余发通用待领取提醒 */
  function notifyPoolArrival(t: Ticket, poolId: string) {
    for (const fn of poolArrivalNotifiers.values()) {
      try {
        if (fn(t)) return;
      } catch {
        /* 某一路通知异常不影响其余 */
      }
    }
    notify(t.no, 'group', '待领取提醒', [poolGroupOf(poolId)?.label ?? ''], `${poolLabel(poolId)}有一张待领取工单 ${t.no}。`);
  }

  /**
   * 派单方式、工单池变更通知（5.4 / 14.3）：全部管理员及受影响班组长，渠道为站内信与 IM。
   * `poolIds` 为受影响的池（班组长取池所属处理组）；全局变更传全部池。
   */
  function notifyAdmins(title: string, poolIds: string[], content: string) {
    const leaders = [...new Set(poolIds.flatMap((id) => poolGroupOf(id)?.leaders ?? []))];
    const receivers = ['全部管理员', ...leaders];
    notify('—', 'timeout', title, receivers, content, '站内信');
    notify('—', 'timeout', title, receivers, content, 'IM');
  }

  /* ---------------- 读：组 · 池 · 派单方式 ---------------- */

  /** 处理组（派单组） */
  function groupOf(id?: string | null): DispatchGroup | undefined {
    return id ? groups.value.find((g) => g.id === id) : undefined;
  }
  /** 是否派单组（用户分组中进入派单的处理组） */
  function isDispatchGroup(id?: string | null): boolean {
    return !!groupOf(id);
  }
  /** 工单池（含已停用） */
  function poolOf(id?: string | null): DispatchPool | undefined {
    return id ? pools.value.find((p) => p.id === id) : undefined;
  }
  /** 是否工单池（含已停用） */
  function isDispatchPool(id?: string | null): boolean {
    return !!poolOf(id);
  }
  function isPoolEnabled(id?: string | null): boolean {
    return poolOf(id)?.status === '启用';
  }
  /** 池所属处理组 id；非池返回空 */
  function poolGroupIdOf(poolId?: string | null): string | undefined {
    return poolOf(poolId)?.groupId;
  }
  function poolGroupOf(poolId?: string | null): DispatchGroup | undefined {
    return groupOf(poolGroupIdOf(poolId));
  }
  /** 池名称；非池时按「〈组名〉池」 */
  function poolLabel(id: string): string {
    return poolOf(id)?.name ?? poolLabelOf(groupOf(id)?.label ?? id);
  }
  /** 处理组下的池（`enabledOnly` 只取启用中的） */
  function poolsOfGroup(groupId?: string | null, enabledOnly = false): DispatchPool[] {
    if (!groupId) return [];
    return pools.value.filter((p) => p.groupId === groupId && (!enabledOnly || p.status === '启用'));
  }
  function enabledPools(): DispatchPool[] {
    return pools.value.filter((p) => p.status === '启用');
  }
  /**
   * 工单所在池：派单侧记录的池（仍与工单归属组一致时）→ 与归属组同 id 的池 → 归属组下首个启用池；
   * 归属组不是派单组时返回空。
   */
  function poolIdOf(t: Pick<Ticket, 'no' | 'groupId'>): string | undefined {
    const st = ticketStates.value[t.no];
    const p = poolOf(st?.poolId);
    if (p && (!t.groupId || p.groupId === t.groupId)) return p.id;
    if (!t.groupId) return undefined;
    const same = poolOf(t.groupId);
    if (same && same.groupId === t.groupId) return same.id;
    return poolsOfGroup(t.groupId, true)[0]?.id;
  }
  /** 全局派单方式（5.4）：人工派单＝全局不派单 */
  function globalEffectiveMode(): PoolMode {
    return config.value.globalMode;
  }
  /** 本池派单方式（5.4）；已停用或非池为人工派单 */
  function poolModeOf(id: string): PoolMode {
    const p = poolOf(id);
    return p && p.status === '启用' ? p.mode : '人工派单';
  }
  /** 作用于本池的派单方式：全局与本池取较严者（5.1） */
  function effectiveModeOf(id: string): PoolMode {
    return stricterMode(globalEffectiveMode(), poolModeOf(id));
  }
  /** 处理组成员 */
  function membersOf(groupId: string): DispatchAgent[] {
    return agents.value.filter((a) => a.groupIds.includes(groupId));
  }
  /** 池的候选成员：池所属处理组的成员 */
  function poolMembersOf(poolId: string): DispatchAgent[] {
    const gid = poolGroupIdOf(poolId);
    return gid ? membersOf(gid) : [];
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
    const claimedFlag = !!overClaimed.value[a.name] && over;
    return {
      agent: a,
      inTransit,
      cap,
      defaultCap: dc,
      defaultCapText: `${dc}（${role}基准 ${config.value.roleBase[role]} × ${a.proficiency} ${config.value.proficiencyCoef[a.proficiency]}）`,
      profileConfigured: isProfileConfigured(a.profile),
      overLimit: over && !assignedFlag && !claimedFlag,
      overAssigned: assignedFlag,
      full: inTransit >= cap && (!over || (claimedFlag && !assignedFlag)),
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
    const segs = splitProblemPath(pick);
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
      .filter((r) => r.enabled && isPoolEnabled(r.poolId))
      .sort((a, b) => a.priority - b.priority)
      .find((r) => ruleHit(r, t));
    return hit ? { poolId: hit.poolId, ruleId: hit.id, ruleName: hit.name } : { poolId: DEFAULT_POOL_ID, ruleId: null, ruleName: '默认池' };
  }

  /* ---------------- 画像匹配（6.2） ---------------- */

  function listHit(sel: AgentProfile['businessTypes'], value: string[] | string | undefined): boolean {
    if (sel === 'any') return true;
    if (!sel) return false;
    const vs = (Array.isArray(value) ? value : value ? [value] : []).filter(Boolean);
    return vs.length > 0 && vs.some((v) => sel.includes(v));
  }

  /** 五维匹配 */
  function profileMatches(a: DispatchAgent, t: Ticket): boolean {
    const p = a.profile;
    if (!isProfileConfigured(p)) return false;
    if (!listHit(p.businessTypes, t.businessType)) return false;
    if (!listHit(p.ticketTypes, t.type)) return false;
    if (!listHit(p.customerTypes, customerTypesOf(t))) return false;
    if (p.problems !== 'any') {
      const path = problemPathOf(t);
      if (!p.problems || !path.length || !p.problems.some((x) => pathHit(path, x))) return false;
    }
    if (p.products !== 'any') {
      if (!p.products || !t.productCategory || !p.products.some((x) => productExact(t, x))) return false;
    }
    return true;
  }

  /** 「匹配我」：本人画像匹配（10.1）；画像未配置不出 */
  function matchesMe(t: Ticket, name: string): boolean {
    const a = agentOf(name);
    return !!a && profileMatches(a, t);
  }

  /* ---------------- SLA ---------------- */

  /**
   * 首响时限与当前剩余（分钟，4.4）：时限取工单 SLA 规则配置的完整时限，不取进入派单时的剩余。
   * 刷机 / 个册退费单按各自 SLA 账本（首响时限 30 分钟）；其余按优先级取首响时限（与建单起算同源），
   * 种子单剩余大于配置值时以剩余为时限（比例不超过 1）。已首响、未计时或停钟的单无首响 SLA。
   */
  function firstRespOf(t: Ticket, now: number): { limitMin: number; remainMin: number } | null {
    if (t.responded) return null;
    if (isFlashTicket(t) || isRefundTicket(t)) {
      // 个册退费单整单首响一经记下即停（驳回回退、自动下送后 responded 复位也不重开首响钟）
      if (isRefundTicket(t) && t.refund?.state.firstRespAt) return null;
      const r = readSla(t, now);
      if (!r || r.status !== 'running') return null;
      return { limitMin: FLASH_SLA_FIRST_LIMIT_MS / MIN, remainMin: r.firstRemainMs / MIN };
    }
    if (!Number.isFinite(t.slaMinutes) || t.slaMinutes >= 9000) return null;
    const remainMin = t.slaState === 'overdue' ? Math.min(t.slaMinutes, 0) : t.slaMinutes;
    const limitMin = Math.max(FIRST_RESP_LIMIT_MIN[t.priority] ?? FIRST_RESP_LIMIT_MIN.P2, remainMin);
    return { limitMin, remainMin };
  }
  /** 首响 SLA 剩余分钟（可为负＝已超时）；无首响 SLA 为 null */
  function slaRemainRaw(t: Ticket, st: TicketDispatchState, now: number): number | null {
    if (!st.firstRespTotalMin || t.responded) return null;
    // 旧缓存无截止时刻：按进入派单时剩余＝时限回落
    const due = st.firstRespDueAt ?? st.enteredAt + st.firstRespTotalMin * MIN;
    return (due - now) / MIN;
  }
  /** 首响剩余比例（0–1）＝首响 SLA 剩余 ÷ 首响时限（4.4）；无首响 SLA 为 null */
  function slaRemainRatio(t: Ticket, st: TicketDispatchState, now: number): number | null {
    const remain = slaRemainRaw(t, st, now);
    if (remain == null) return null;
    return Math.min(1, Math.max(0, remain) / st.firstRespTotalMin!);
  }
  function slaRemainMin(t: Ticket, st: TicketDispatchState, now: number): number | undefined {
    const remain = slaRemainRaw(t, st, now);
    return remain == null ? undefined : Math.max(0, Math.round(remain));
  }
  /* ---------------- 门槛（4.1） ---------------- */

  function gates(t: Ticket, st: TicketDispatchState): GateOutcome {
    let failedAt: GateKey | undefined;
    let list = [...agents.value];
    const step = (key: GateKey, keep: (a: DispatchAgent) => boolean) => {
      list = list.filter(keep);
      if (!list.length && !failedAt) failedAt = key;
    };
    const poolGroupId = poolGroupIdOf(st.poolId);
    const ready = list.filter((a) => !!poolGroupId && a.groupIds.includes(poolGroupId) && !a.disabled && a.roles.length > 0 && a.signIn === '就绪');
    const matchedReady = ready.filter((a) => profileMatches(a, t)).length;
    step('候选范围', (a) => !!poolGroupId && a.groupIds.includes(poolGroupId));
    step('个人开关', (a) => a.personalSwitch);
    step('角色', (a) => !a.disabled && a.roles.length > 0);
    step('在班', (a) => a.signIn === '就绪');
    step('投诉回避', (a) => !st.complaintTarget || a.name !== st.complaintTarget);
    step('画像已配置', (a) => isProfileConfigured(a.profile));
    step('画像匹配', (a) => profileMatches(a, t));
    const matched = list;
    step('个人上限', (a) => inTransitOf(a.name, t.no) < capOf(a));
    return { passed: list, blockedByCap: matched.filter((a) => !list.includes(a)), onDuty: ready.length, matchedReady, failedAt };
  }

  /* ---------------- 评分（4.4） ---------------- */

  /** 今日接单强度：今日接单量跨日清零 */
  function intensityOf(a: DispatchAgent, now: number): number {
    const from = dayStartOf(now);
    return takeIntensity(a.todayTakes.filter((x) => x >= from).length, onDutyHoursOf(a.name, now), capOf(a));
  }

  function score(t: Ticket, a: DispatchAgent, pool: DispatchAgent[], now: number): ScoreDetail {
    const inTransit = inTransitOf(a.name, t.no);
    const { total, values } = computeScore({
      proficiency: a.proficiency, inTransit, cap: capOf(a),
      intensity: intensityOf(a, now),
      maxIntensity: Math.max(0, ...pool.map((x) => intensityOf(x, now))),
    });
    return { name: a.name, staffNo: a.staffNo, total, values, lastTakenAt: a.lastTakenAt, inTransit };
  }

  /** 同分：距上次分配时长长者 → 在途少者 → 工号小者（4.4）；没有分配过的视为最久 */
  function rank(list: ScoreDetail[]): ScoreDetail[] {
    return [...list].sort((x, y) => y.total - x.total
      || (x.lastTakenAt ?? 0) - (y.lastTakenAt ?? 0)
      || x.inTransit - y.inTransit
      || x.staffNo.localeCompare(y.staffNo, undefined, { numeric: true }));
  }

  /* ---------------- 原处理人（4.2） ---------------- */

  /** 历史工单最近一次处理时间（有效期起算点） */
  function handledAtOf(x: Ticket): number {
    const at = parseStamp(x.updatedAt);
    return Number.isFinite(at) ? at : parseStamp(x.createdAt);
  }
  /** 层级（4.2 通用约束）：只认二线及以上（派单坐席）；技术支持组池只认三线 */
  function layerOk(a: DispatchAgent, st: TicketDispatchState, trigger: DispatchTrigger): boolean {
    if (trigger === '升级三线' || poolGroupIdOf(st.poolId) === 'tech') return a.roles.includes('技术支持');
    return true;
  }
  /** 某张历史工单的最后一名二线及以上处理人：当前处理人 → 上次处理人 → 履历中最近的处理人 */
  function lastHandlerOf(x: Ticket, st: TicketDispatchState, trigger: DispatchTrigger): DispatchAgent | undefined {
    const names = [x.assignee, x.lastHandler, ...[...(x.eventTimeline ?? [])].reverse().map((e) => e.who)];
    for (const n of names) {
      const a = agentOf(n);
      if (a && layerOk(a, st, trigger)) return a;
    }
    return undefined;
  }

  /** 关系链一行取原处理人（每种关系只取最近一个）；取不到返回空 */
  function candidateOf(rule: OriginalRelationRule, t: Ticket, st: TicketDispatchState, trigger: DispatchTrigger, now: number): OriginalCandidate | undefined {
    const from = rule.days == null ? -Infinity : now - rule.days * 24 * 60 * MIN;
    if (rule.relation === '本单退回') {
      // 售后转回、回访打回：本单上一处理人，有效期不限
      const a = agentOf(st.prevHandler);
      return a && layerOk(a, st, trigger) ? { relation: rule.relation, rule, name: a.name } : undefined;
    }
    if (rule.relation === '关联单') {
      // 承接子单、升级投诉：建单时带入的原单；外投单：工单行「升级自」
      const no = st.relatedNo ?? t.escalatedFromNo;
      const origin = no && no !== t.no ? TICKETS.find((x) => x.no === no) : undefined;
      if (!origin || handledAtOf(origin) < from) return undefined;
      const a = lastHandlerOf(origin, st, trigger);
      return a ? { relation: rule.relation, rule, name: a.name } : undefined;
    }
    // 同客户近期：同一客户（手机号）最近一次工单的处理人；技术支持组池取最近一次三线处理人
    const phone = digits(t.customerPhone);
    if (!phone) return undefined;
    const path = joinProblemPath(problemPathOf(t));
    let best: { name: string; at: number } | undefined;
    for (const x of TICKETS) {
      if (x.no === t.no || !x.assignee || digits(x.customerPhone) !== phone) continue;
      const a = agentOf(x.assignee);
      if (!a || !layerOk(a, st, trigger)) continue;
      if (rule.sameProblem && joinProblemPath(problemPathOf(x)) !== path) continue;
      const at = handledAtOf(x);
      if (!Number.isFinite(at) || at < from) continue;
      if (!best || at > best.at) best = { name: a.name, at };
    }
    return best ? { relation: rule.relation, rule, name: best.name } : undefined;
  }

  /** 该客户上一次对此人的回访评价为不满意（人员服务 1–3 分，与班组看板「服务不满意」同口径） */
  function lastSurveyBad(t: Ticket, name: string): boolean {
    const phone = digits(t.customerPhone);
    let last: { at: number; score: number } | undefined;
    for (const x of TICKETS) {
      if (x.serviceScore == null || (x.assignee !== name && x.lastHandler !== name)) continue;
      if (x.no !== t.no && (!phone || digits(x.customerPhone) !== phone)) continue;
      const at = handledAtOf(x);
      if (!last || at > last.at) last = { at: Number.isFinite(at) ? at : 0, score: x.serviceScore };
    }
    return !!last && last.score <= 3;
  }

  /** 例外清单（4.3，统一判定）：命中即不派回 */
  function exclusionOf(t: Ticket, st: TicketDispatchState, c: OriginalCandidate): OriginalExclusion | null {
    if (st.complaintTarget && c.name === st.complaintTarget) return '被投诉人';
    const a = agentOf(c.name);
    const gid = poolGroupIdOf(st.poolId);
    if (!a || a.disabled || !gid || !a.groupIds.includes(gid)) return '不在归属组或已停用';
    // 小智产研退回、确认未解决：回小智工单处理组池待领，不派回原处理人（【1120】）
    if (c.relation === '本单退回' && isXiaozhiTicket(t)) return '小智退回';
    if (lastSurveyBad(t, c.name)) return '上次回访不满意';
    return null;
  }

  /**
   * 按次序走关系链（4.3）：每行取一名原处理人。命中不派回例外（含个人开关关闭、岗位不符、画像不符）的不算，查下一行；
   * 第一位不命中例外的原处理人：已签入（就绪、小休、未就绪、满额）即派给他，不在岗（签出，含当日未签入）直接进入综合打分，
   * 不再查后面的关系。
   */
  function walkChain(t: Ticket, st: TicketDispatchState, trigger: DispatchTrigger, now: number) {
    const excluded: NonNullable<Decision['originalExcluded']> = [];
    const seen = new Set<string>();
    for (const rule of config.value.originalChain) {
      if (!rule.enabled) continue;
      const c = candidateOf(rule, t, st, trigger, now);
      if (!c || seen.has(c.name)) continue;
      seen.add(c.name);
      const ex = exclusionOf(t, st, c);
      if (ex) {
        excluded.push({ relation: c.relation, name: c.name, reason: ex });
        continue;
      }
      const a = agentOf(c.name)!;
      if (!originalAcceptable(t, a)) continue;
      if (a.signIn === '签出') {
        excluded.push({ relation: c.relation, name: c.name, reason: '不在岗' });
        return { hit: undefined, excluded };
      }
      return { hit: c, excluded };
    }
    return { hit: undefined, excluded };
  }

  /** 原处理人的接单条件（4.3）：坐席状态与个人上限不挡；归属组、停用、被投诉人已由例外清单判定 */
  function originalAcceptable(t: Ticket, a: DispatchAgent): boolean {
    return a.personalSwitch && a.roles.length > 0 && profileMatches(a, t);
  }

  /* ---------------- 判定（第 2、4 章） ---------------- */

  /**
   * 三步（4.2–4.4）：第 ① 步的结果照实记入日志，第 ② 步不依赖它 —— 没人可接时已签入的原处理人仍派回。
   * 派不出时：自动派单排队中，混合派单留池无派单状态。
   */
  function decide(t: Ticket, st: TicketDispatchState, trigger: DispatchTrigger, mode: PoolMode, now: number): Decision {
    if (mode === '人工派单') return { path: '留池', assignee: null, status: null };

    const g = gates(t, st);
    const chain = walkChain(t, st, trigger, now);
    const ex = chain.excluded.length ? { originalExcluded: chain.excluded } : {};
    if (chain.hit) {
      const a = agentOf(chain.hit.name)!;
      return {
        path: '原处理人', assignee: a.name, status: null, originalRelation: chain.hit.relation,
        score: score(t, a, g.passed.length ? g.passed : [a], now), gateFailedAt: g.failedAt, candidateCount: g.passed.length, ...ex,
      };
    }
    const d = decideScore(t, st, now);
    if (mode === '混合派单' && !d.assignee) return { ...d, path: '留池', status: null, ...ex };
    return { ...d, ...ex };
  }

  /** 未派出原因（A.1）：同一次进入派单只记首次判定时的原因 */
  function emptyReasonOf(g: GateOutcome): DispatchFailReason {
    if (g.onDuty === 0) return '组内暂无已就绪成员';
    if (g.blockedByCap.length) return '均达个人上限';
    return g.matchedReady > 0 ? '无可接单成员' : '无画像匹配成员';
  }

  /**
   * 步骤 ③：综合打分选人（4.4）。自动派单下没有可接单的坐席时留池排队（4.5），每轮扫描重试，直到派出或被人工领取、指派；
   * 不设次数和时限上限，超时提醒由 SLA 通知负责。混合派单由 `decide` 转为留池。
   */
  function decideScore(t: Ticket, st: TicketDispatchState, now: number): Decision {
    const g = gates(t, st);
    if (g.passed.length) {
      const ranked = rank(g.passed.map((a) => score(t, a, g.passed, now)));
      const best = ranked[0];
      return {
        path: '加权评分', assignee: best.name, status: null,
        score: best, top3: ranked.slice(0, 3).map((x) => ({ name: x.name, staffNo: x.staffNo, total: x.total, values: x.values })),
        candidateCount: g.passed.length,
      };
    }
    return { path: '排队', assignee: null, status: '排队中', gateFailedAt: g.failedAt, candidateCount: 0, failReason: emptyReasonOf(g) };
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

  /** 专属工单的服务在判定前建立（建立时按各自缓存回填工单行，须早于派单写入） */
  function ensureSpecialService(t: Ticket) {
    try {
      if (isRefundTicket(t)) useRefundStore();
      else if (isFlashTicket(t)) useFlashStore();
      // 小智服务建立时不回填缓存，须显式装载（N2：未装载时池内判定读到种子态，会把已派出的单再派一次）
      else if (isXiaozhiTicket(t)) useXiaozhiStore().hydrate();
    } catch {
      /* 服务不可用时按工单行现值判定 */
    }
  }

  function ensureAllSpecialServices() {
    try {
      useRefundStore();
      useFlashStore();
      useXiaozhiStore().hydrate();
    } catch {
      /* 同上 */
    }
  }

  /** 专属工单落快照（刷机 / 小智由各自履历写入时已落，个册退费在此落） */
  function commitSpecial(t: Ticket) {
    if (isRefundTicket(t)) useRefundStore().afterClaim(t.no);
  }

  /** 派出落处理人：整单首响一经记成不因换人重计（9.3 / 11.1 / 13.3），首响标记沿用工单行现值 */
  function writeAssign(t: Ticket, name: string, at: number) {
    const keepStatus = t.nodeStatus === '已升级技术支持';
    // 售后转回的单派出后直落「处理中」（领取、指派同，见 takeOverReturnedTicket）
    const toProcessing = !!t.returnedFromAftersale;
    Object.assign(t, {
      assignee: name,
      tab: 'mine',
      nodeStatus: keepStatus ? t.nodeStatus : toProcessing ? '处理中' : '待响应',
      responded: toProcessing ? true : !!t.responded,
      updatedAt: stamp(at),
    });
    if (isXiaozhiTicket(t)) useXiaozhiStore().syncStatus(t.no, t.nodeStatus, { assignee: name });
  }

  /** 落池：归属组＝池所属处理组 */
  function writePool(t: Ticket, poolId: string, at: number) {
    const g = poolGroupOf(poolId);
    const keepStatus = t.nodeStatus === '已升级技术支持';
    Object.assign(t, {
      assignee: null,
      tab: 'pool',
      groupId: g?.id ?? poolId,
      ...(g ? { groupNames: [g.label, ...(t.groupNames ?? []).slice(1).filter((n) => n !== g.label)] } : {}),
      nodeStatus: keepStatus ? t.nodeStatus : '未认领',
      updatedAt: stamp(at),
    });
  }

  function recordTake(name: string, at: number) {
    const a = agentOf(name);
    if (!a) return;
    a.lastTakenAt = at;
    a.todayTakes = [...a.todayTakes.filter((x) => x >= dayStartOf(at)), at];
  }

  /* ---------------- 日志 ---------------- */

  function snapshotOf(t: Ticket, st: TicketDispatchState, now: number): DispatchLogEntry['snapshot'] {
    return {
      businessType: t.businessType,
      ticketType: t.type,
      productCategory: t.productCategory,
      product: t.product,
      problem: joinProblemPath(problemPathOf(t)) || undefined,
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

  /** 履历里的得分串：维度用界面名称（与出池规则页一致） */
  function scoreText(s: ScoreDetail): string {
    const parts = SCORE_DIMENSION_ROWS.map((x) => `${x.dimension} ${s.values[x.key].toFixed(2)}`);
    return `综合得分 ${s.total.toFixed(1)}（${parts.join(' · ')}）`;
  }

  /* ---------------- 派单引擎（对外） ---------------- */

  function ensureState(t: Ticket, trigger: DispatchTrigger, opts: DispatchOptions, now: number): TicketDispatchState {
    // 切为自动派单、重新进池按新进入派单处理（2.5）；首响截止与进入时刻沿用，见下
    const resumed = trigger === '切为自动派单';
    // 从未进入过派单、由扫描纳入的单：归属池取所在池
    const scanned = trigger === '补单扫描';
    const fresh = trigger === '新单' || trigger === '调剂到池' || trigger === '升级三线' || trigger === '售后转回' || trigger === '回访打回'
      || trigger === '池停用' || trigger === '重新进池' || resumed;
    const prev = ticketStates.value[t.no];
    if (prev && !fresh && isPoolEnabled(prev.poolId)) {
      if (opts.complaintTarget) prev.complaintTarget = opts.complaintTarget;
      return prev;
    }
    // 指定池已停用：按入池规则重新确定归属池（14.3）
    let poolId = opts.poolId && isPoolEnabled(opts.poolId) ? opts.poolId : undefined;
    let ruleId: string | null = null;
    let designated = !!opts.poolId && poolId === opts.poolId && (trigger === '调剂到池' || trigger === '升级三线');
    if (!poolId) {
      // 售后转回 / 回访打回 / 切为自动派单 / 扫描：回本单所在池（启用中，已停用按入池规则）；新单、池停用重新入池按入池规则
      const cur = trigger === '售后转回' || trigger === '回访打回' || resumed || scanned ? poolIdOf(t) : undefined;
      if (cur && isPoolEnabled(cur)) poolId = cur;
      else {
        const r = resolvePool(t);
        poolId = r.poolId;
        ruleId = r.ruleId;
      }
    }
    // 回本单所在池的几种触发：命中规则不丢（沿用上次；无上次时按入池规则核对，不一致记指定池）
    if (resumed || scanned || trigger === '售后转回' || trigger === '回访打回') {
      if (prev && prev.poolId === poolId) {
        ruleId = prev.ruleId;
        designated = !!prev.designatedPool;
      } else if (!ruleId) {
        const r = resolvePool(t);
        if (r.poolId === poolId) ruleId = r.ruleId;
        else designated = poolId !== DEFAULT_POOL_ID;
      }
    }
    const fr = resumed && prev?.firstRespDueAt != null ? null : firstRespOf(t, now);
    const st: TicketDispatchState = {
      ticketNo: t.no,
      poolId,
      ruleId,
      // 未经派单进池的单从进池时间起算；切为自动派单等待时长不清零
      enteredAt: resumed || scanned ? prev?.enteredAt ?? poolEnteredAtOf(t, now) : now,
      status: null,
      ...(fr ? { firstRespTotalMin: fr.limitMin, firstRespDueAt: now + fr.remainMin * MIN } : {}),
      ...(resumed && prev?.firstRespDueAt != null ? { firstRespTotalMin: prev.firstRespTotalMin, firstRespDueAt: prev.firstRespDueAt } : {}),
      ...(designated ? { designatedPool: true } : {}),
      complaintTarget: opts.complaintTarget ?? prev?.complaintTarget,
      prevHandler: opts.prevHandler ?? (resumed ? prev?.prevHandler : undefined),
      relatedNo: opts.relatedNo ?? (resumed ? prev?.relatedNo : undefined),
      seq: prev?.seq ?? 0,
      everAssigned: prev?.everAssigned || !!opts.prevHandler || !!opts.hadHandler || undefined,
    };
    ticketStates.value = { ...ticketStates.value, [t.no]: st };
    return ticketStates.value[t.no];
  }

  /** 命中规则（13.1）：入池规则名称；未命中记「默认池」；经调剂到池、升级三线指定池进入的记「指定池」 */
  function ruleNameOf(st: TicketDispatchState): string {
    if (st.ruleId) return rules.value.find((r) => r.id === st.ruleId)?.name ?? '默认池';
    return st.designatedPool ? '指定池' : '默认池';
  }

  /**
   * 判定并落库。`write=false` 时只判定与记日志、不改工单行（售后回传 resolver 用：工单行由调用方组装）。
   */
  function run(t: Ticket, trigger: DispatchTrigger, opts: DispatchOptions, write: boolean): DispatchResult | null {
    // 专属工单的服务先就绪（G5）：服务首次建立时会用自己的缓存回填工单行，
    // 若在派出之后才建立，会把刚写的处理人盖回池内态（日志记已派出、工单仍在池里）
    ensureSpecialService(t);
    // 先到先得：已有处理人不判定
    if (t.assignee) return null;
    const now = Date.now();
    const st = ensureState(t, trigger, opts, now);
    const g = poolGroupOf(st.poolId);
    const globalMode = globalEffectiveMode();
    const groupMode = poolModeOf(st.poolId);
    const effectiveMode = stricterMode(globalMode, groupMode);

    let d: Decision;
    try {
      d = decide(t, st, trigger, effectiveMode, now);
    } catch {
      // 系统判断出错：留原池、派单状态不变，通知班组长和管理员；自动派单下一轮重新判断，混合派单留池待领取
      d = { path: '留池', assignee: null, status: st.status, failReason: '系统异常' };
    }
    const actualAssign = d.assignee;
    const status: DispatchStatus | null = d.status;
    // 扫描没派出且派单状态不变：同一次进入派单只记一条，不逐轮写日志、不写履历、不发通知
    if (trigger === '补单扫描' && !actualAssign && d.failReason !== '系统异常' && st.status === status) return null;

    st.seq = nextTicketSeq(t.no);
    const chosenAgent = agentOf(actualAssign);
    // 派回原处理人不受个人上限约束，超出记超额指派（5.3）；综合打分只在可接单的坐席里选，不会超出
    const overCap = !!chosenAgent && d.path === '原处理人' && inTransitOf(chosenAgent.name, t.no) + 1 > capOf(chosenAgent);
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
      path: d.path,
      ...(d.originalRelation ? { originalRelation: d.originalRelation } : {}),
      ...(d.originalExcluded?.length ? { originalExcluded: d.originalExcluded } : {}),
      ...(d.gateFailedAt ? { gateFailedAt: d.gateFailedAt } : {}),
      candidateCount: d.candidateCount,
      ...(chosenAgent ? { chosen: { name: chosenAgent.name, staffNo: chosenAgent.staffNo, groupLabel: g?.label ?? '' } } : {}),
      ...(d.score ? { chosenScore: d.score } : {}),
      ...(d.top3 ? { top3: d.top3 } : {}),
      ...(d.failReason ? { failReason: d.failReason } : {}),
      status,
      snapshot: snapshotOf(t, st, now),
      ...(overCap ? { overCap: '超额指派' as const } : {}),
    };
    pushLog(log);

    // 派单状态
    const prevStatus = st.status;
    st.status = status;

    const pathText = d.originalRelation && d.path === '原处理人' ? `${d.path} · ${d.originalRelation}` : d.path;
    let reason: string;
    if (actualAssign) {
      reason = `系统派单 → ${actualAssign}（${pathText}）${d.score ? `；${scoreText(d.score)}` : ''}`;
    } else if (status === '排队中') {
      reason = `${poolLabel(st.poolId)}排队：${d.failReason === '均达个人上限' ? '相符成员均已满额' : failLabel(d.failReason)}`;
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
        if (overCap) writeTimeline(target, '超额指派', `${actualAssign}在途 ${inTransitOf(actualAssign, t.no) + 1} / 上限 ${capOf(chosenAgent!)}，记超额指派`, now);
        commitSpecial(target);
      } else {
        writePool(target, st.poolId, now);
        if (status !== prevStatus && status === '排队中') writeTimeline(target, '排队等待', reason, now);
        commitSpecial(target);
      }
    }
    if (overCap) overAssigned.value = { ...overAssigned.value, [chosenAgent!.name]: true };

    // 通知
    if (d.failReason === '系统异常') {
      // 同一张单连续出错只通知一次
      if (!errorNoticed.has(t.no)) {
        errorNoticed.add(t.no);
        const receivers = ['全部管理员', ...(g?.leaders ?? [])];
        const content = effectiveMode === '自动派单'
          ? `${t.no}自动派单未派出（系统异常），系统将在下一轮重新判断。`
          : `${t.no}${effectiveMode}未派出（系统异常），留在工单池待领取。`;
        notify(t.no, 'timeout', '系统异常', receivers, content, '站内信');
        notify(t.no, 'timeout', '系统异常', receivers, content, 'IM');
      }
      // 混合派单不再重试：判断出错也按进池未派出发待领取提醒
      if (POOL_ENTRY_TRIGGERS.includes(trigger) && effectiveMode !== '自动派单' && !poolOf(st.poolId)?.isDefault) notifyPoolArrival(t, st.poolId);
    } else if (actualAssign) {
      notifyAssigned(t, st, actualAssign);
      st.status = null;
    } else if (!actualAssign && POOL_ENTRY_TRIGGERS.includes(trigger) && effectiveMode !== '自动派单' && !poolOf(st.poolId)?.isDefault) {
      // 混合派单、人工派单：进池且未派出即发（新单、调剂到池、升级三线、售后转回、回访打回、池停用重新入池），进入默认池不发；
      // 刷机、退费、小智单发各自的到组通知；重新进池的单不重发
      notifyPoolArrival(t, st.poolId);
    }

    if (d.failReason !== '系统异常') errorNoticed.delete(t.no);
    ticketStates.value = { ...ticketStates.value };
    persist();
    return {
      assignee: actualAssign,
      poolId: st.poolId,
      poolLabel: poolLabel(st.poolId),
      path: d.path,
      status,
      reason,
      log,
    };
  }

  /** 本单此前到过人手：派单侧记过、上一处理人 / 主责有值、售后转回过或已首响（接入派单前的种子单没有派单状态） */
  function hadHandlerBefore(t: Ticket, st: TicketDispatchState): boolean {
    return !!st.everAssigned || !!st.prevHandler || !!t.lastHandler || !!t.primaryOwner || !!t.returnedFromAftersale || !!t.responded;
  }

  /** 派到人的通知（2.3 / 11.6）：派发提醒；受理短信每张单只在首次派到人时发一次（刷机、小智、退费单除外） */
  function notifyAssigned(t: Ticket, st: TicketDispatchState, name: string) {
    const first = !hadHandlerBefore(t, st);
    notify(t.no, 'assign', '派发提醒', [name], `工单 ${t.no} 已派给你，分派来源：${first ? '系统派单' : '系统重派'}。`);
    if (first && !isFlashTicket(t) && !isXiaozhiTicket(t) && !isRefundTicket(t)) {
      notify(t.no, 'accepted', '受理短信', [t.customer], `您的问题已受理，工单号 ${t.no}。`, '短信');
    }
    st.everAssigned = true;
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
    const hadHandler = !!t.assignee;
    // 落池前把首响结论落成显式值：子状态改「未认领」后不再能由子状态推出（9.4 首响已记成的不重计）
    Object.assign(t, { responded: isFirstResponded(t), assignee: null, tab: 'pool', groupId: poolGroupIdOf(poolId) ?? poolId, ...(keep ? {} : { nodeStatus: '未认领' }) });
    if (trigger === '调剂到池') {
      manualLog(t, '调剂到池', operator ?? operatorName(), poolLabel(poolId), reason);
      writeTimeline(t, '调剂到池', `调剂到池 → ${poolLabel(poolId)}${reason ? `；原因：${reason}` : ''}`, Date.now());
    }
    return run(t, trigger, { poolId, hadHandler }, true);
  }

  /** 售后回传 resolver（`aftersaleEvents.dispatchByCurrentRule` 经注册调用）：只判定、不改入参工单行 */
  function resolveForAftersale(t: Ticket, ctx?: DispatchContext): DispatchOutcome {
    const trigger: DispatchTrigger = ctx?.trigger ?? '新单';
    const r = run({ ...t, assignee: null }, trigger, { prevHandler: ctx?.prevAssignee ?? undefined }, false);
    if (!r) return { groupId: t.groupId ?? DEFAULT_POOL_ID, groupLabel: groupOf(t.groupId)?.label ?? DEFAULT_POOL_LABEL, assignee: null };
    if (r.assignee) recordTake(r.assignee, Date.now());
    // 归属组＝池所属处理组；所在池记在派单侧（ticketStates）
    const g = poolGroupOf(r.poolId);
    return {
      groupId: g?.id ?? r.poolId, groupLabel: g?.label ?? r.poolId, assignee: r.assignee,
      reason: r.assignee ? pathWithRelation(r.path, r.log.originalRelation) : undefined,
      dispatchText: r.assignee ? r.reason : undefined,
    };
  }

  /* ---------------- 先到先得 · 人工动作 ---------------- */

  /** 占用校验（2.4）：引擎派、领取、指派共用；已有处理人即失败 */
  function checkOccupy(t: Pick<Ticket, 'assignee'> | undefined): OccupyResult {
    if (!t) return { ok: false, message: TAKEN_MESSAGE };
    return t.assignee ? { ok: false, message: TAKEN_MESSAGE } : { ok: true, message: '' };
  }

  /** 工单所在池是否本人所在组的池（10.1）：派单池只有处理组成员可领，其他角色只读；不进入派单的组池不在此限 */
  function isOwnPool(t: Pick<Ticket, 'no' | 'groupId'>, name: string): boolean {
    const pid = poolIdOf(t);
    return !pid || poolMembersOf(pid).some((a) => a.name === name);
  }

  /** 工单在待领取范围（9.2）：生效方式为混合派单、人工派单的池；不进入派单的组池不在此限。自动派单池的单由系统派出，不可领取 */
  function inClaimablePool(t: Pick<Ticket, 'no' | 'groupId'>): boolean {
    const pid = poolIdOf(t);
    return !pid || effectiveModeOf(pid) !== '自动派单';
  }

  /** 领取前置（6.1）：占用校验 ＋ 待领取范围 ＋ 本人所在组的池 ＋ 就绪才可领；不校验画像、不受个人上限约束 */
  function checkClaim(t: Pick<Ticket, 'assignee' | 'no' | 'groupId'> | undefined, name: string): OccupyResult {
    const occ = checkOccupy(t);
    if (!occ.ok) return occ;
    if (t && !inClaimablePool(t)) return { ok: false, message: '该工单由系统派单，不可领取' };
    if (t && !isOwnPool(t, name)) return { ok: false, message: NOT_OWN_POOL_MESSAGE };
    const a = agentOf(name);
    if (a && a.signIn !== '就绪') return { ok: false, message: a.signIn === '签出' ? '签入后可领取' : '就绪后可领取' };
    return occ;
  }

  function manualLog(t: Ticket, action: ManualAction, operator: string, target?: string, reason?: string, overCap?: DispatchLogEntry['overCap']) {
    const st = ticketStates.value[t.no];
    const poolId = st?.poolId ?? poolIdOf(t) ?? DEFAULT_POOL_ID;
    const now = Date.now();
    pushLog({
      id: nextId('dl'), ticketNo: t.no, seq: nextTicketSeq(t.no), at: stamp(now), kind: '人工',
      poolId, poolLabel: poolLabel(poolId), ruleName: st ? ruleNameOf(st) : '—',
      globalMode: globalEffectiveMode(), groupMode: poolModeOf(poolId), effectiveMode: effectiveModeOf(poolId),
      snapshot: st ? snapshotOf(t, st, now) : { ticketType: t.type, priority: t.priority },
      manual: { action, operator, ...(target ? { target } : {}), ...(reason ? { reason } : {}) },
      ...(overCap ? { overCap } : {}),
    });
  }

  /**
   * 人工拿单落库后调用（领取 / 班组长指派 / 改派 / 调剂到人 / 升级三线指定人 / 升级投诉自主发起直派）：结束排队、写人工记录、记接单时刻；
   * 指定人派送超出个人上限时记超额指派（5.3）。领取不记超额指派。人工记录不进派单日志页，分派监控统计与超额指派判断取它。
   */
  function recordManualTake(t: Ticket, assignee: string, action: ManualAction, operator?: string, reason?: string) {
    const st = ticketStates.value[t.no];
    if (st) {
      st.status = null;
      st.everAssigned = true;
      ticketStates.value = { ...ticketStates.value };
    }
    const a = agentOf(assignee);
    let overCap: DispatchLogEntry['overCap'];
    // 本单已落到此人名下：在途按「除本单外的在途 ＋ 本单」计（新建单此刻尚未落工单库、子状态仍为未认领）
    if (a && inTransitOf(a.name, t.no) + 1 > capOf(a)) {
      if (action === '二线领取') {
        overClaimed.value = { ...overClaimed.value, [a.name]: true };
      } else {
        overCap = '超额指派';
        overAssigned.value = { ...overAssigned.value, [a.name]: true };
      }
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

  /** 取消工单：同步撤出排队（4.1） */
  function withdrawTicket(no: string) {
    const st = ticketStates.value[no];
    if (!st) return;
    st.status = null;
    ticketStates.value = { ...ticketStates.value };
    persist();
  }

  /* ---------------- 工单池扫描 ---------------- */

  function poolTicket(no: string): Ticket | undefined {
    const raw = TICKETS.find((x) => x.no === no);
    return raw ? (reactive(raw) as Ticket) : undefined;
  }

  /** 未经派单进池的单的进池时刻：工单行记的进池时间；没记时通用工单取建单时间，专属工单取最近更新（其进池即更新） */
  function poolEnteredAtOf(t: Ticket, fallback: number = Date.now()): number {
    const seeded = specialPoolEnteredAt[t.no];
    if (seeded != null) return seeded;
    const at = parseStamp(t.poolEnteredAt ?? (isSpecialTicket(t) ? t.updatedAt ?? t.createdAt : t.createdAt));
    return Number.isFinite(at) ? at : fallback;
  }

  /** 首响剩余分钟（排序用）；无首响 SLA 为 null */
  function firstRespRemainOf(t: Ticket, now: number): number | null {
    const st = ticketStates.value[t.no];
    return st ? slaRemainRaw(t, st, now) : firstRespOf(t, now)?.remainMin ?? null;
  }

  /** 首响剩余比例（排序用，0–1）；无首响 SLA 为 null */
  function firstRespRatioOf(t: Ticket, now: number): number | null {
    const st = ticketStates.value[t.no];
    if (st) return slaRemainRatio(t, st, now);
    const fr = firstRespOf(t, now);
    return fr ? Math.min(1, Math.max(0, fr.remainMin) / fr.limitMin) : null;
  }

  /** 本轮要判定的单（处理顺序见文件头 ②）：首响已超时 → 优先级 → 首响剩余比例小 → 等待久；无首响 SLA 的排在同优先级最后 */
  function scanTickets(now: number): { t: Ticket; poolId: string }[] {
    const rows: { t: Ticket; poolId: string; overdue: number; rank: number; ratio: number; at: number }[] = [];
    for (const raw of TICKETS) {
      if (raw.assignee || raw.tab !== 'pool' || raw.archived || raw.isDraft || !raw.groupId) continue;
      // 只取待领取的单：未认领，或升级三线留在技术支持组池的单（其余子状态不进入派单）
      if (raw.nodeStatus !== '未认领' && raw.nodeStatus !== '已升级技术支持') continue;
      const poolId = poolIdOf(raw);
      if (!poolId || !isPoolEnabled(poolId)) continue;
      // 只扫自动派单池：混合派单只在进池时判定一次，人工派单不派单
      if (effectiveModeOf(poolId) !== '自动派单') continue;
      const remain = firstRespRemainOf(raw, now);
      rows.push({
        t: reactive(raw) as Ticket, poolId,
        overdue: remain != null && remain <= 0 ? -remain : -1,
        rank: PRIORITY_RANK[raw.priority] ?? 0,
        ratio: firstRespRatioOf(raw, now) ?? 2,
        at: ticketStates.value[raw.no]?.enteredAt ?? poolEnteredAtOf(raw, now),
      });
    }
    return rows.sort((a, b) => b.overdue - a.overdue || b.rank - a.rank || a.ratio - b.ratio || a.at - b.at);
  }

  /** 滞留汇总提醒：池内未领取超过 4 小时的单按组汇总提醒班组长；同一张只提醒一次 */
  function remindStalled(now: number) {
    const pendingNos = new Set<string>();
    for (const g of groups.value) {
      const list = poolsOfGroup(g.id, true).flatMap((p) => pendingTicketsOf(p.id));
      list.forEach((t) => pendingNos.add(t.no));
      const waitOf = (t: Ticket) => now - (ticketStates.value[t.no]?.enteredAt ?? poolEnteredAtOf(t, now));
      const stalled = list.filter((t) => waitOf(t) >= STALL_MS);
      const fresh = stalled.filter((t) => !stallNoticed[t.no]);
      if (!fresh.length) continue;
      fresh.forEach((t) => { stallNoticed[t.no] = true; });
      const content = `${g.label}有 ${stalled.length} 张工单在池内滞留超过 ${STALL_REMIND_HOURS} 小时，请指派或调剂。`;
      notify('—', 'timeout', '滞留提醒', g.leaders, content, '站内信');
      notify('—', 'timeout', '滞留提醒', g.leaders, content, 'IM');
    }
    stallNoticed = Object.fromEntries(Object.entries(stallNoticed).filter(([no]) => pendingNos.has(no)));
  }

  /** 工单池扫描：引擎除进池判定外的唯一入口，每 5 分钟一轮（处理顺序见文件头） */
  function scanPools(now: number = Date.now()) {
    lastScanAt = now;
    // 专属工单服务先按各自缓存回填工单行，再按工单行现值筛池内单（G5）
    ensureAllSpecialServices();
    for (const st of Object.values(ticketStates.value)) {
      if (!st.status) continue;
      const t = poolTicket(st.ticketNo);
      if (!t || t.assignee || t.tab !== 'pool') st.status = null;
    }
    for (const { t, poolId } of scanTickets(now)) {
      if (t.assignee) continue;
      if (resumePoolIds.has(poolId)) run(t, '切为自动派单', { poolId }, true);
      else run(t, '补单扫描', {}, true);
    }
    resumePoolIds = new Set();
    for (const a of agents.value) {
      if (inTransitOf(a.name) > capOf(a)) continue;
      if (overAssigned.value[a.name]) {
        const next = { ...overAssigned.value };
        delete next[a.name];
        overAssigned.value = next;
      }
      if (overClaimed.value[a.name]) {
        const next = { ...overClaimed.value };
        delete next[a.name];
        overClaimed.value = next;
      }
    }
    remindStalled(now);
    ticketStates.value = { ...ticketStates.value };
    persist();
  }

  /* ---------------- 派单方式 ---------------- */

  /**
   * 自动派单切为混合派单 / 人工派单后的池内工单（2.5）：排队中清空派单状态。`mode` 给出时待领取的单履历记一条。
   */
  function clearStatuses(poolIds: string[], mode?: PoolMode) {
    const now = Date.now();
    for (const st of Object.values(ticketStates.value)) {
      if (!poolIds.includes(st.poolId) || !st.status) continue;
      st.status = null;
      const t = mode ? poolTicket(st.ticketNo) : undefined;
      if (t && !t.assignee && t.tab === 'pool') {
        touchRow(t);
        writeTimeline(t, '派单方式切换', `派单方式切为${mode}，派单状态已清除`, now);
      }
    }
    ticketStates.value = { ...ticketStates.value };
  }

  /** 生效派单方式为自动派单的启用池 */
  function autoPoolIds(): Set<string> {
    return new Set(enabledPools().filter((p) => effectiveModeOf(p.id) === '自动派单').map((p) => p.id));
  }
  /** 切换后：生效方式由非自动变为自动的池交下一轮扫描重新判定；不再是自动的池撤出（5.1） */
  function queueResume(before: Set<string>) {
    const after = autoPoolIds();
    after.forEach((id) => { if (!before.has(id)) resumePoolIds.add(id); });
    resumePoolIds.forEach((id) => { if (!after.has(id)) resumePoolIds.delete(id); });
  }

  /** 全部池 id（含已停用：清派单状态等收尾用） */
  function allPoolIds(): string[] {
    return pools.value.map((p) => p.id);
  }
  function enabledPoolIds(): string[] {
    return enabledPools().map((p) => p.id);
  }

  /** 池内未领取的工单（所在池为 `poolId`） */
  function pendingTicketsOf(poolId: string): Ticket[] {
    return TICKETS.filter((t) => !t.assignee && t.tab === 'pool' && !t.archived && !t.isDraft && poolIdOf(t) === poolId);
  }

  /** 全局派单方式切换（5.4，管理员）：人工派单＝全局不派单；切回自动派单后池内未领取的单由下一轮扫描重新派送 */
  function setGlobalMode(mode: PoolMode, reason = '', operator?: string): OccupyResult {
    if (mode !== '自动派单' && !reason.trim()) return { ok: false, message: '请填写切换原因' };
    if (reason.length > 200) return { ok: false, message: '切换原因最多 200 字' };
    const before = config.value.globalMode;
    if (before === mode) return { ok: false, message: '请选择切换后的派单方式' };
    audit('派单方式', '全局', before, mode, operator, reason.trim() || undefined);
    const autoBefore = autoPoolIds();
    config.value.globalMode = mode;
    if (mode !== '自动派单') clearStatuses(allPoolIds(), mode);
    queueResume(autoBefore);
    notifyAdmins('派单方式切换', enabledPoolIds(),
      `${operator ?? operatorName()}已将智能派单全局派单方式由${before}切换为${mode}${reason.trim() ? `：${reason.trim()}` : ''}。`);
    persist();
    return { ok: true, message: `已切换为${mode}` };
  }

  /** 本池派单方式切换（5.4）：管理员可切全部池，班组长切处理组为本组的池（权限由页面判定） */
  function setPoolMode(poolId: string, mode: PoolMode, reason = '', operator?: string): OccupyResult {
    const p = poolOf(poolId);
    if (!p) return { ok: false, message: '' };
    if (p.status !== '启用') return { ok: false, message: '工单池已停用' };
    if (globalEffectiveMode() === '人工派单') return { ok: false, message: '全局为人工派单，本池派单方式不可切换' };
    if (p.mode === mode) return { ok: false, message: '请选择切换后的派单方式' };
    if (mode !== '自动派单' && !reason.trim()) return { ok: false, message: '请填写切换原因' };
    if (reason.length > 200) return { ok: false, message: '切换原因最多 200 字' };
    const beforeMode = p.mode;
    audit('派单方式', p.name, beforeMode, mode, operator, reason.trim() || undefined);
    const autoBefore = autoPoolIds();
    p.mode = mode;
    p.updatedBy = operator ?? operatorName();
    p.updatedAt = stamp();
    if (mode !== '自动派单') clearStatuses([poolId], mode);
    queueResume(autoBefore);
    notifyAdmins('派单方式切换', [poolId],
      `${operator ?? operatorName()}已将${p.name}由${beforeMode}切换为${mode}${reason.trim() ? `：${reason.trim()}` : ''}。`);
    persist();
    return { ok: true, message: `已切换为${mode}` };
  }

  /* ---------------- 工单池（14.3）：新建 · 改名 · 停用 / 启用 ---------------- */

  /** 池名称校验；通过返回空串（14.3 校验表） */
  function validatePoolName(name: string, excludeId?: string): string {
    const n = name.trim();
    if (!n) return '请输入池名称';
    if (n.length > POOL_NAME_MAX) return `池名称最多 ${POOL_NAME_MAX} 字`;
    if (pools.value.some((p) => p.id !== excludeId && p.name === n)) return '池名称已存在';
    return '';
  }

  /** 新建工单池：处理组必填（派单组范围），派单方式默认人工派单 */
  function addPool(draft: { name: string; groupId: string; mode?: PoolMode }, operator?: string): OccupyResult & { pool?: DispatchPool } {
    const err = validatePoolName(draft.name);
    if (err) return { ok: false, message: err };
    if (!draft.groupId || !isDispatchGroup(draft.groupId)) return { ok: false, message: '请选择处理组' };
    const op = operator ?? operatorName();
    const at = stamp();
    const pool: DispatchPool = {
      id: nextId('pool'), name: draft.name.trim(), groupId: draft.groupId, mode: draft.mode ?? '人工派单',
      status: '启用', isDefault: false, createdBy: op, createdAt: at, updatedBy: op, updatedAt: at,
    };
    pools.value = [...pools.value, pool];
    audit('工单池', pool.name, '—', `新建 · ${groupOf(pool.groupId)?.label ?? pool.groupId} · ${pool.mode}`, op);
    persist();
    return { ok: true, message: '工单池已创建', pool };
  }

  /** 改池名称（处理组创建后不可改） */
  function renamePool(id: string, name: string, operator?: string): OccupyResult {
    const p = poolOf(id);
    if (!p) return { ok: false, message: '' };
    const err = validatePoolName(name, id);
    if (err) return { ok: false, message: err };
    const n = name.trim();
    if (n === p.name) return { ok: true, message: '已保存' };
    const op = operator ?? operatorName();
    audit('工单池', p.name, p.name, `改名为 ${n}`, op);
    p.name = n;
    p.updatedBy = op;
    p.updatedAt = stamp();
    persist();
    return { ok: true, message: '已保存' };
  }

  /** 停用影响（二次确认文案用）：指向该池的启用中入池规则数、池内未领取工单数 */
  function poolDisableImpact(id: string): { rules: number; tickets: number } {
    return {
      rules: rules.value.filter((r) => r.poolId === id && r.enabled).length,
      tickets: pendingTicketsOf(id).length,
    };
  }

  /**
   * 停用 / 启用工单池（14.3）。固定落点池（默认池、技术支持、小智、教育刷机、教育支持）不可停用。
   * 停用：指向该池的入池规则自动停用；池内未领取工单按入池规则重新确定归属池并交引擎判定；已派出的工单保留在处理人名下。
   * 启用：入池规则不自动恢复。
   */
  function setPoolEnabled(id: string, enabled: boolean, operator?: string): OccupyResult & { moved?: number; rulesOff?: number } {
    const p = poolOf(id);
    if (!p) return { ok: false, message: '' };
    if ((p.status === '启用') === enabled) return { ok: true, message: '' };
    if (!enabled && isProtectedPool(id)) return { ok: false, message: PROTECTED_POOL_TIP[id] };
    const op = operator ?? operatorName();
    const at = stamp();
    if (enabled) {
      audit('工单池', p.name, '停用', '启用', op);
      const autoBefore = autoPoolIds();
      p.status = '启用';
      queueResume(autoBefore);
      p.updatedBy = op;
      p.updatedAt = at;
      notifyAdmins('工单池启用', [id], `${op}已启用${p.name}。`);
      persist();
      return { ok: true, message: '已启用' };
    }
    // 先停规则、再停池，重新入池时不再命中本池
    let rulesOff = 0;
    rules.value = rules.value.map((r) => {
      if (r.poolId !== id || !r.enabled) return r;
      rulesOff += 1;
      audit('入池规则', r.name, `${r.priority} · ${p.name} · 启用`, `${r.priority} · ${p.name} · 停用`, op, '工单池停用');
      return { ...r, enabled: false, updatedBy: op, updatedAt: at };
    });
    audit('工单池', p.name, '启用', '停用', op);
    resumePoolIds.delete(id);
    p.status = '停用';
    p.updatedBy = op;
    p.updatedAt = at;
    ensureAllSpecialServices();
    const pending = pendingTicketsOf(id);
    clearStatuses([id]);
    let moved = 0;
    for (const raw of pending) {
      const t = reactive(raw) as Ticket;
      // 履历先记重新入池，再由引擎判定（与 ensureState 同一入池规则判定）
      touchRow(t);
      writeTimeline(t, '重新入池', `${p.name}已停用，按入池规则重新入池 → ${poolLabel(resolvePool(t).poolId)}`, Date.now());
      if (run(t, '池停用', {}, true)) moved += 1;
    }
    notifyAdmins('工单池停用', [id],
      `${op}已停用${p.name}，指向该池的 ${rulesOff} 条入池规则已停用，池内 ${moved} 张未领取工单已按入池规则重新入池。`);
    persist();
    return { ok: true, message: '已停用', moved, rulesOff };
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
    if (!isPoolEnabled(draft.poolId)) return '归属池已停用，请选择启用中的工单池';
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

  /* ---------------- 坐席维护（6.5 / 7.5 / 8.1 / 11.4 / 11.5） ---------------- */

  /** 此人是固定落点池处理组的最后一名成员时返回提示（不能移出，停用账号不算成员）；否则空串 */
  function lastMemberTip(name: string, groupId: string): string {
    const pool = poolsOfGroup(groupId).find((p) => isProtectedPool(p.id));
    if (!pool) return '';
    const members = membersOf(groupId).filter((a) => !a.disabled);
    return members.length === 1 && members[0].name === name ? `${pool.name}的处理组至少保留一名成员` : '';
  }

  /** 加入 / 移出处理组（11.4）：记审计；加入后画像相符即可接本组的池，由下一轮扫描派单 */
  function setAgentGroup(name: string, groupId: string, joined: boolean, operator?: string): OccupyResult {
    const a = agentOf(name);
    if (!a) return { ok: false, message: '' };
    if (a.groupIds.includes(groupId) === joined) return { ok: true, message: '' };
    const lastTip = joined ? '' : lastMemberTip(a.name, groupId);
    if (lastTip) return { ok: false, message: lastTip };
    audit('组成员', a.name, joined ? '—' : groupOf(groupId)?.label ?? groupId, joined ? `加入${groupOf(groupId)?.label ?? groupId}` : '移出', operator);
    a.groupIds = joined ? [...a.groupIds, groupId] : a.groupIds.filter((id) => id !== groupId);
    persist();
    return { ok: true, message: '' };
  }

  /** 调剂到人后的归属池（9.4）：只改派单侧记录，处理人与归属组由调用方落到工单行 */
  function setTicketPool(no: string, poolId: string) {
    const prev = ticketStates.value[no];
    if (prev?.poolId === poolId) return;
    const base: TicketDispatchState = prev ?? {
      ticketNo: no, poolId, ruleId: null, enteredAt: Date.now(), status: null, seq: 0,
    };
    ticketStates.value = { ...ticketStates.value, [no]: { ...base, poolId, ruleId: null, designatedPool: true } };
    persist();
  }

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
    return { ok: true, message: '个人上限已更新' };
  }

  function setPersonalSwitch(name: string, on: boolean, operator?: string): OccupyResult {
    const a = agentOf(name);
    if (!a) return { ok: false, message: '' };
    if (a.personalSwitch === on) return { ok: true, message: '' };
    audit('个人开关', a.name, a.personalSwitch ? '开启' : '关闭', on ? '开启' : '关闭', operator);
    a.personalSwitch = on;
    persist();
    return { ok: true, message: `已${on ? '开启' : '关闭'}${a.name}的接收派单` };
  }

  /** 坐席状态（5.5）：就绪即在班（P0），点就绪后最多等 5 分钟由扫描来单 */
  function setSignIn(name: string, status: SignInStatus) {
    const a = agentOf(name);
    if (!a || a.signIn === status) return;
    const now = Date.now();
    // 在岗时长（13.2）：就绪期间累计；离开就绪时把本次时长并入当日累计
    rollOnDuty(a, now);
    if (a.signIn === '就绪' && a.signInSince) a.onDutyMs = (a.onDutyMs ?? 0) + Math.max(0, now - a.signInSince);
    a.signInSince = status === '就绪' ? now : null;
    a.signIn = status;
    persist();
  }

  /** 跨日清零当日在岗累计；本次就绪跨日时从当日零点起算 */
  function rollOnDuty(a: DispatchAgent, now: number) {
    const today = dayKey(now);
    if (a.onDutyDay === today) return;
    a.onDutyDay = today;
    a.onDutyMs = 0;
    if (a.signInSince) a.signInSince = Math.max(a.signInSince, dayStartOf(now));
  }

  /** 当日在岗小时数（就绪时长，13.2 派单均衡度「每在岗小时」） */
  function onDutyHoursOf(name: string, now: number = Date.now()): number {
    const a = agentOf(name);
    if (!a) return 0;
    const sameDay = a.onDutyDay === dayKey(now);
    const acc = sameDay ? a.onDutyMs ?? 0 : 0;
    const since = a.signIn === '就绪' && a.signInSince ? Math.max(a.signInSince, dayStartOf(now)) : null;
    return (acc + (since ? Math.max(0, now - since) : 0)) / (60 * MIN);
  }

  /** 派单策略（14.2 出池规则 / 个人上限）保存：返回提示文案 */
  function updateConfig(patch: Partial<DispatchConfig>, operator?: string): OccupyResult {
    const next: DispatchConfig = { ...config.value, ...clone(patch) };
    // 关系链（8.3 校验表）
    const intIn = (v: unknown, a: number, b: number) => typeof v === 'number' && Number.isInteger(v) && v >= a && v <= b;
    for (const row of next.originalChain) {
      if (row.relation !== '本单退回' && !intIn(row.days, 1, 30)) return { ok: false, message: '请输入 1–30 的整数' };
    }
    if (!next.originalChain.some((r) => r.enabled)) return { ok: false, message: '请至少启用一种原处理人关系' };
    if (Object.values(next.roleBase).some((v) => !Number.isInteger(v) || v < 1 || v > 50)) return { ok: false, message: '请输入 1–50 的整数' };
    if (Object.values(next.proficiencyCoef).some((v) => v < 0.1 || v > 3)) return { ok: false, message: '请输入 0.1–3 的数值' };
    // 全局派单方式走 setGlobalMode（带审计与重派），不随派单策略保存
    const { globalMode, ...rest } = next;
    void globalMode;
    const changed = (Object.keys(patch) as (keyof DispatchConfig)[])
      .filter((k) => k !== 'globalMode' && JSON.stringify(config.value[k]) !== JSON.stringify(next[k]));
    if (changed.length) audit('派单策略', '全局', changed.join('、'), '已修改', operator);
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
  /** 每池一行（含已停用池，按 `enabled` 区分）；池内工单按所在池计 */
  function poolViews(): DispatchPoolView[] {
    const now = Date.now();
    const byPool = new Map<string, Ticket[]>();
    for (const t of TICKETS) {
      if (t.tab !== 'pool' || t.assignee || t.archived || t.isDraft) continue;
      const pid = poolIdOf(t);
      if (pid) byPool.set(pid, [...(byPool.get(pid) ?? []), t]);
    }
    return pools.value.map((p) => {
      const g = groupOf(p.groupId);
      const inPool = byPool.get(p.id) ?? [];
      const st = inPool.map((t) => ticketStateOf(t.no)).filter((x): x is TicketDispatchState => !!x);
      const members = membersOf(p.groupId);
      return {
        id: p.id,
        groupId: p.groupId,
        label: g?.label ?? p.groupId,
        poolLabel: p.name,
        enabled: p.status === '启用',
        isDefault: p.isDefault,
        effectiveMode: effectiveModeOf(p.id),
        poolMode: p.mode,
        leaders: g?.leaders ?? [],
        pending: inPool.length,
        queued: st.filter((x) => x.status === '排队中').length,
        // 池积压口径：只算有派单状态的单；工单池管理、班组看板按全部未领单（poolTicketsOfPool）
        maxWaitMin: st.filter((x) => x.status).reduce((m, x) => Math.max(m, Math.round((now - x.enteredAt) / MIN)), 0),
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
    // 每 5 分钟一轮；刷新不打断节奏（按上一轮时刻接着算）
    const scheduleScan = () => {
      window.setTimeout(() => {
        try {
          scanPools();
        } catch {
          lastScanAt = Date.now();
        }
        scheduleScan();
      }, Math.max(0, lastScanAt + SCAN_MS - Date.now()));
    };
    scheduleScan();
    // 刷新 / 关页前把派单改写过的工单行现值落一次
    window.addEventListener('pagehide', () => persist());
    // 开发态：控制台 `__flowosDispatch.scan()` 手动跑一轮工单池扫描
    if (import.meta.env.DEV) {
      (window as unknown as Record<string, unknown>).__flowosDispatch = {
        scan: scanPools,
        // 客户回访打回：`__flowosDispatch.surveyReturn('工单号')`（调研中的通用工单）
        surveyReturn: (no: string) => {
          const t = poolTicket(no);
          return t ? returnFromSurvey(t) : null;
        },
        // 新单进入派单：`__flowosDispatch.dispatchNew(工单行, { relatedNo: '原单号' })`（关联单 / 同客户近期演示）
        dispatchNew: (row: Ticket, opts: DispatchOptions = {}) => {
          if (!TICKETS.some((x) => x.no === row.no)) TICKETS.unshift(row);
          const t = poolTicket(row.no);
          return t ? dispatchNewTicket(t, opts) : null;
        },
      };
    }
  }

  return {
    // state
    config, groups, pools, agents, rules, ticketStates, overAssigned, overClaimed, logs, audits,
    // 读
    groupOf, isDispatchGroup, poolOf, isDispatchPool, isPoolEnabled, poolGroupIdOf, poolGroupOf, poolLabel, poolsOfGroup, enabledPools,
    poolIdOf, globalEffectiveMode, poolModeOf, effectiveModeOf, membersOf, poolMembersOf,
    agentOf, agentView, capOf, inTransitOf, profileMatches, matchesMe, isOwnPool, poolEnteredAtOf, lastMemberTip,
    ticketStateOf, dispatchStatusOf, logsOf, poolViews, nextRulePriority, validateProfile,
    // 引擎
    dispatchTicket, dispatchNewTicket, redispatchToPool, returnFromSurvey,
    // 先到先得 · 人工动作
    checkOccupy, checkClaim, inClaimablePool, recordManualTake, withdrawTicket,
    // 派单方式
    setGlobalMode, setPoolMode, onDutyHoursOf,
    // 工单池
    validatePoolName, addPool, renamePool, poolDisableImpact, setPoolEnabled,
    // 入池规则
    addPoolRule, updatePoolRule, setPoolRuleEnabled, removePoolRule,
    // 坐席
    setProfile, batchSetProfile, setProficiency, setCapOverride, setPersonalSwitch, setSignIn, setAgentGroup, setTicketPool,
    // 配置
    updateConfig,
  };
});

