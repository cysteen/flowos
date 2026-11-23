import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { WorkStatus } from '@/stores/cti';
import { useUserStore } from '@/stores/user';
import { useDispatchStore } from '@/stores/dispatch';
import { useTenantStore } from '@/stores/tenant';
import { getWorkstateTenantAuthorization } from '@/mock/tenantMembership';
import { TICKETS } from '@/mock/tickets';
import { isTicketClosed } from '@/views/tickets/types/ticket';
import {
  BREAK_ITEM, DEFAULT_WORK_TYPE, OUTBOUND_SUB, workStatKey, workTypeOf, workTypesOfGroup, type WorkTypeDef,
} from '@/mock/ctiWorkTypes';
import {
  WORKSTATE_EVENT_SCHEMA_VERSION,
  endpointNotConfiguredError,
  createWorkstateAuditRecord,
  hasCompleteWorkstateIdentity,
  identityInvalidError,
  isRetryDue,
  nextRetryDelayMs,
  workstateOrganizationStorageKey,
  workstateIdentityExclusionReason,
  workstateRoleAllowsAction,
  type WorkstateAction,
  type WorkstateAuditRecord,
  type WorkstateDeliveryReceipt,
  type WorkstateEventEnvelope,
} from '@/stores/workstateEventContract';

/**
 * 话务条状态流水：每次工作状态 / 子状态切换记一段（人、班组、状态、子状态、起止时刻、关联工单），
 * 外呼忙碌段同样记一段（子状态记 outbound）。
 *
 * - 实时段落 localStorage（键带版本号），刷新后未结束的段以最后一次保存时刻收尾；
 * - 实际切换、演示种子、旧版本无来源流水分开；默认统计与对账只取 prototype_live。
 * - 本地事件未接入观星台；导出不代表已上报。人员/班组/工单按时段开始时快照。
 * - 只给组级统计用，不出个人排名。
 */

export const CTI_FLOW_LS_KEY = 'flowos-cti-status-flow';
/** v5：正式事件契约与本地 Outbox；v3/v4 保留为 legacy_local，不伪造成新埋点。 */
export const CTI_FLOW_VERSION = 5;
export const WORKSTATE_TIME_ZONE = 'Asia/Shanghai';
export const WORKSTATE_HEARTBEAT_GAP_MS = 90_000;
export const WORKSTATE_AUDIT_LS_KEY = 'flowos-workstate-audit-v1';
export type FlowDataSource = 'live' | 'demo';
export type FlowEndReason = 'state_change' | 'sign_out' | 'group_change' | 'identity_change'
  | 'connection_lost' | 'page_exit' | 'refresh_recovery' | 'heartbeat_gap';

const MIN = 60_000;
const DAY = 24 * 60 * MIN;
/** 实时段保留天数（与种子覆盖范围一致，覆盖「本月」与跨月的自定义区间）；只影响载入时的过滤，缓存结构不变 */
const KEEP_DAYS = 62;
/** 种子覆盖近 62 天（含今日）的工作日：至少覆盖本月与上个月 */
const SEED_DAYS = 62;

export interface FlowSegment {
  id: string;
  who: string;
  groupId: string | null;
  status: WorkStatus;
  /** 就绪：工作类型 key；小休：小休原因；忙碌：outbound；未就绪：null */
  sub: string | null;
  start: number;
  /** 进行中为 null */
  end: number | null;
  ticketNo: string | null;
  source: 'prototype_live' | 'demo_seed' | 'legacy_local';
  sessionId?: string;
  /** 原型名册工号；生产统一人员ID尚待对接方确认，不用姓名冒充ID。 */
  staffNo?: string | null;
  roleKey?: string;
  eligibleForGroupStats?: boolean;
  lastSeenAt?: number;
  endReason?: FlowEndReason;
  tenantId?: string | null;
  actorId?: string | null;
}

export type WorkstateEvent = WorkstateEventEnvelope<FlowSegment>;

interface Persisted {
  version: number;
  savedAt: number;
  segments: FlowSegment[];
  events?: WorkstateEvent[];
}

export interface DistItem {
  key: string;
  label: string;
  color: string;
  ms: number;
  pct: number;
}

export interface GroupDistribution {
  items: DistItem[];
  /** 在岗时长：各工作类型（外呼计入工单处理）+ 小休（签出、未就绪不计） */
  totalMs: number;
  memberCount: number;
  /** 按人拆分：各类型时长（键同 items）、合计；只含区间内有流水的人 */
  byMember: Record<string, MemberDist>;
  /** 小休按原因拆分（meeting / training / tea / meal） */
  breakReasons: Record<string, number>;
  access: WorkstateAccessDecision;
}

export interface WorkstateAccessDecision {
  allowed: boolean;
  action: WorkstateAction;
  tenantId: string | null;
  actorId: string | null;
  actorRoleKey: string;
  managedGroupIds: string[];
  requestedGroupId: string;
  reason: 'allowed' | 'tenant_missing' | 'actor_missing' | 'menu_denied' | 'action_denied' | 'group_out_of_scope';
}

export interface MemberDist {
  ms: Record<string, number>;
  /** 在岗时长：各工作类型（外呼计入工单处理）+ 小休 */
  totalMs: number;
  breakReasons: Record<string, number>;
}

/* ------------------------------------------------------------------ */
/* 种子                                                                 */
/* ------------------------------------------------------------------ */

function dayStart(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
function at(day0: number, h: number, m: number): number {
  return day0 + (h * 60 + m) * MIN;
}
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function prng(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface FlowMember {
  name: string;
  groupId: string | null;
}

export interface WorkTimeGroup {
  id: string;
  label: string;
  leaders: string[];
}

/**
 * 不在工单处理组（POOL_GROUPS）与派单名册里的班组：只进工作时长统计的数据源，
 * 不进工单池、派单配置、入池规则与派单名册。投诉风险组的工作类型取字典 complaint-risk 那一份。
 */
const WORK_TIME_EXTRA_GROUPS: (WorkTimeGroup & { members: string[] })[] = [
  { id: 'complaint-risk', label: '投诉风险组', leaders: ['王组长'], members: ['罗坐席', '邓坐席', '姚坐席'] },
];

function tenantWorkstateScope() {
  const tenant = useTenantStore();
  if (!tenant.currentTenantId || !tenant.account) return { managedGroupIds: [], workGroupIds: [] };
  return getWorkstateTenantAuthorization(tenant.account, tenant.currentTenantId);
}

function availableWorkGroupsOf(_name: string): string[] {
  return tenantWorkstateScope().workGroupIds;
}

function currentActorRef(): string | null {
  const user = useUserStore();
  const agent = useDispatchStore().agentOf(user.name);
  const ref = user.domainAccount || user.account || agent?.staffNo || '';
  return ref ? `prototype:${ref}` : null;
}

function currentTenantRef(): string | null {
  const tenantId = useTenantStore().currentTenantId;
  return tenantId ? `prototype:${tenantId}` : null;
}

function readWorkOrganization(tenantId: string, actorId: string): string | null {
  try {
    const raw = sessionStorage.getItem(workstateOrganizationStorageKey(tenantId, actorId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { tenantId?: string; actorId?: string; groupId?: string };
    return parsed.tenantId === tenantId && parsed.actorId === actorId && parsed.groupId ? parsed.groupId : null;
  } catch {
    return null;
  }
}

/** 明确设置当前人员的工作组织；多组人员不得通过数组首项隐式归组。 */
export function setCurrentWorkOrganization(groupId: string | null): boolean {
  const user = useUserStore();
  const tenantId = currentTenantRef();
  const actorId = currentActorRef();
  if (!tenantId || !actorId) return false;
  if (groupId && !availableWorkGroupsOf(user.name).includes(groupId)) return false;
  const key = workstateOrganizationStorageKey(tenantId, actorId);
  if (!groupId) sessionStorage.removeItem(key);
  else sessionStorage.setItem(key, JSON.stringify({ tenantId, actorId, groupId, selectedAt: Date.now() }));
  return true;
}

export function currentWorkOrganization(): string | null {
  const tenantId = currentTenantRef();
  const actorId = currentActorRef();
  if (!tenantId || !actorId) return null;
  const selected = readWorkOrganization(tenantId, actorId);
  return selected && tenantWorkstateScope().workGroupIds.includes(selected) ? selected : null;
}

export function workstateOrganizationOptions(): { value: string; label: string }[] {
  const labels = new Map(workTimeGroups().map((group) => [group.id, group.label]));
  return tenantWorkstateScope().workGroupIds.map((groupId) => ({ value: groupId, label: labels.get(groupId) ?? groupId }));
}

/**
 * 当前工作组织优先取显式上下文；处理具体工单时可由该工单的组织快照建立上下文。
 * 仅单组人员允许无选择自动落到唯一组织，多组人员绝不固定取 groupIds[0]。
 */
export function workstateGroupOf(name: string, ticketNo?: string | null): string | null {
  const groups = availableWorkGroupsOf(name);
  const actorId = currentActorRef();
  const tenantId = currentTenantRef();
  const ticketGroup = ticketNo ? TICKETS.find((ticket) => ticket.no === ticketNo)?.groupId ?? null : null;
  if (actorId && ticketGroup && groups.includes(ticketGroup)) {
    setCurrentWorkOrganization(ticketGroup);
    return ticketGroup;
  }
  const selected = actorId && tenantId ? readWorkOrganization(tenantId, actorId) : null;
  if (selected && groups.includes(selected)) return selected;
  return groups.length === 1 ? groups[0] : null;
}

const WORKTIME_AGENT_ROLES = new Set(['二线专员', '小智工单处理人', '二线刷机处理人', '技术支持', '客诉专员']);
const WORKTIME_ROLE_KEYS = new Set(['agent-l1', 'xiaozhi-agent', 'agent-l2', 'tech-support', 'complaint-handler']);

/** 班组成员：所有会产生坐席工作状态流水的岗位，管理角色操作不计入。 */
export function flowMembers(): FlowMember[] {
  return [
    ...useDispatchStore().agents
      .filter((a) => !a.disabled && a.roles.some((role) => WORKTIME_AGENT_ROLES.has(role)))
      .flatMap((a) => a.groupIds.map((groupId) => ({ name: a.name, groupId }))),
    ...WORK_TIME_EXTRA_GROUPS.flatMap((g) => g.members.map((name) => ({ name, groupId: g.id }))),
  ];
}

/** 班组看板可选班组：仅返回当前租户身份被授予的班组，不因拥有菜单而默认放开全部。 */
export function teamBoardGroups(roleKey: string, name: string): WorkTimeGroup[] {
  const all = workTimeGroups();
  void roleKey;
  void name;
  const authorizedIds = new Set(tenantWorkstateScope().managedGroupIds);
  return all.filter((group) => authorizedIds.has(group.id));
}

/** 当前名册仅用于补零和权限展示；历史统计始终以事件发生时的组织快照为准。 */
export function groupMembersOf(groupId: string): FlowMember[] {
  return flowMembers().filter((m) => m.groupId === groupId);
}

/** 工作时长统计可选的班组：有成员的处理组（派单组）+ 上表各组 */
export function workTimeGroups(): WorkTimeGroup[] {
  const withMembers = new Set(flowMembers().map((m) => m.groupId));
  return [
    ...useDispatchStore().groups
      .filter((g) => withMembers.has(g.id))
      .map((g) => ({ id: g.id, label: g.label, leaders: g.leaders })),
    ...WORK_TIME_EXTRA_GROUPS.map(({ id, label, leaders }) => ({ id, label, leaders })),
  ];
}

function inProgressNos(name: string): string[] {
  return TICKETS
    .filter((t) => t.assignee === name && !t.archived && !t.isDraft && !isTicketClosed(t.nodeStatus))
    .map((t) => t.no);
}

/** 线下类型的抽取权重：组内清单越靠前越常见 */
function pickOffline(rand: () => number, types: WorkTypeDef[]): WorkTypeDef {
  const offline = types.filter((t) => t.key !== DEFAULT_WORK_TYPE);
  const w = offline.map((_, i) => offline.length - i + 1);
  let r = rand() * w.reduce((s, x) => s + x, 0);
  for (let i = 0; i < offline.length; i++) {
    r -= w[i];
    if (r <= 0) return offline[i];
  }
  return offline[0];
}

function seedDay(m: FlowMember, day0: number, out: FlowSegment[]) {
  const rand = prng(hash(`${m.name}|${new Date(day0).toDateString()}`));
  const ri = (a: number, b: number) => a + Math.floor(rand() * (b - a + 1));
  const types = workTypesOfGroup(m.groupId);
  const tickets = inProgressNos(m.name);
  let n = 0;
  const push = (status: WorkStatus, sub: string | null, start: number, end: number, ticketNo: string | null = null) => {
    if (end <= start) return;
    out.push({ id: `seed-${m.name}-${day0}-${n++}`, who: m.name, groupId: m.groupId, status, sub, start, end, ticketNo, source: 'demo_seed' });
  };
  const pickTicket = () => (tickets.length && rand() < 0.65 ? tickets[ri(0, tickets.length - 1)] : null);

  /** 就绪时段内的工作排布：工单处理与线下类工作交替，穿插少量外呼 */
  const fill = (from: number, to: number) => {
    let t = from;
    while (t < to - 5 * MIN) {
      const r = rand();
      if (r < 0.1) {
        const end = Math.min(to, t + ri(3, 12) * MIN);
        const no = pickTicket();
        push('busy', OUTBOUND_SUB, t, end, no);
        t = end;
      } else if (r < 0.55) {
        const end = Math.min(to, t + ri(20, 60) * MIN);
        push('ready', DEFAULT_WORK_TYPE, t, end);
        t = end;
      } else {
        const type = pickOffline(rand, types);
        const end = Math.min(to, t + ri(15, 75) * MIN);
        const no = type.linkTicket ? pickTicket() : null;
        push('ready', type.key, t, end, no);
        t = end;
      }
    }
    if (t < to) push('ready', DEFAULT_WORK_TYPE, t, to);
  };

  const signIn = at(day0, 9, ri(0, 8));
  const ready = signIn + ri(2, 5) * MIN;
  push('logged_in', null, signIn, ready);
  const mealStart = at(day0, 12, ri(0, 10));
  const mealEnd = at(day0, 13, ri(25, 35));
  fill(ready, mealStart);
  push('break', 'meal', mealStart, mealEnd);

  const dayEnd = at(day0, 18, ri(0, 15));
  const hasMeeting = rand() < 0.25;
  const hasTea = rand() < 0.4;
  let t = mealEnd;
  if (hasMeeting) {
    const ms = at(day0, 14, ri(0, 30));
    fill(t, ms);
    const me = ms + ri(40, 70) * MIN;
    push('break', rand() < 0.3 ? 'training' : 'meeting', ms, me);
    t = me;
  }
  if (hasTea) {
    const ts = Math.max(t + 20 * MIN, at(day0, 15, ri(20, 50)));
    fill(t, ts);
    const te = ts + ri(10, 15) * MIN;
    push('break', 'tea', ts, te);
    t = te;
  }
  fill(t, dayEnd);
}

/** 整日种子按「当日 + 成员名单」缓存：同一天内只生成一次，每次调用只按此刻截断 */
let seedCache: { key: string; segs: FlowSegment[] } | null = null;

function seedCurrentMoment(m: FlowMember, today: number, now: number, out: FlowSegment[]) {
  const start = Math.max(today, now - 3 * 60 * MIN);
  if (now <= start) return;
  const signedInEnd = Math.min(now, start + Math.max(1, Math.floor((now - start) * 0.08)));
  const breakStart = start + Math.floor((now - start) * 0.58);
  const breakEnd = Math.min(now, breakStart + Math.max(1, Math.floor((now - start) * 0.12)));
  const base = `seed-current-${m.name}-${today}`;
  out.push({ id: `${base}-0`, who: m.name, groupId: m.groupId, status: 'logged_in', sub: null,
    start, end: signedInEnd, ticketNo: null, source: 'demo_seed' });
  if (signedInEnd < breakStart) out.push({ id: `${base}-1`, who: m.name, groupId: m.groupId, status: 'ready',
    sub: DEFAULT_WORK_TYPE, start: signedInEnd, end: breakStart, ticketNo: null, source: 'demo_seed' });
  if (breakStart < breakEnd) out.push({ id: `${base}-2`, who: m.name, groupId: m.groupId, status: 'break',
    sub: 'tea', start: breakStart, end: breakEnd, ticketNo: null, source: 'demo_seed' });
  if (breakEnd < now) out.push({ id: `${base}-3`, who: m.name, groupId: m.groupId, status: 'ready',
    sub: DEFAULT_WORK_TYPE, start: breakEnd, end: now, ticketNo: null, source: 'demo_seed' });
}

/** 近 62 天（含今日）种子；任意日期与周末的“今天”均有稳定可走查数据。 */
function buildSeed(now: number): FlowSegment[] {
  const today = dayStart(now);
  const members = flowMembers();
  const key = `${today}|${members.map((m) => `${m.name}:${m.groupId}`).join(',')}`;
  if (seedCache?.key !== key) {
    const out: FlowSegment[] = [];
    for (let i = SEED_DAYS - 1; i >= 0; i--) {
      const d0 = dayStart(today - i * DAY + 12 * 60 * MIN);
      const isToday = d0 === today;
      const wd = new Date(d0).getDay();
      if (!isToday && (wd === 0 || wd === 6)) continue;
      if (isToday) members.forEach((m) => seedCurrentMoment(m, d0, now, out));
      else members.forEach((m) => seedDay(m, d0, out));
    }
    seedCache = { key, segs: out };
  }
  return seedCache.segs
    .filter((s) => s.start < now)
    .map((s) => (s.end != null && s.end > now ? { ...s, end: now } : s));
}

/* ------------------------------------------------------------------ */
/* store                                                                */
/* ------------------------------------------------------------------ */

/** 时段只计到已观测心跳；断线空窗不因打开看板或导出而补算。 */
function observedEnd(s: FlowSegment, now: number): number {
  return Math.min(s.end ?? s.lastSeenAt ?? s.start, now);
}

/** 上海业务日切片，半开区间；切片不制造状态切换事件，也不改原时段ID。 */
export function workstateDaySlices(s: FlowSegment, from: number, to: number, now: number) {
  const rows: { segmentId: string; businessDate: string; start: number; end: number; durationMs: number }[] = [];
  const offset = 8 * 60 * MIN;
  const end = Math.min(observedEnd(s, now), to);
  for (let start = Math.max(s.start, from); start < end;) {
    const nextDay = Math.floor((start + offset) / DAY) * DAY + DAY - offset;
    const until = Math.min(end, nextDay);
    rows.push({ segmentId: s.id, businessDate: new Date(start + offset).toISOString().slice(0, 10), start, end: until, durationMs: until - start });
    start = until;
  }
  return rows;
}

/** 按事件组织快照对账；当前名册只标注、不参与历史排除，所有排除项逐条给出原因。 */
export function reconcileWorkstateSegments(
  segs: FlowSegment[], groupId: string, currentTenantId: string, members: string[], from: number, to: number, now: number,
) {
  const rows = segs.filter((s) => s.groupId === groupId && s.start < Math.min(to, now) && observedEnd(s, now) > from).flatMap((s) => {
    const statKey = workStatKey(s.status, s.sub);
    const identityExclusion = workstateIdentityExclusionReason({
      tenantId: s.tenantId, actorId: s.actorId, organizationId: s.groupId,
    });
    const exclusionReason = s.source !== 'prototype_live' ? `source_${s.source}`
      : identityExclusion
        ? identityExclusion
        : s.tenantId !== currentTenantId ? 'tenant_mismatch'
        : !s.eligibleForGroupStats ? 'not_eligible_agent_role' : !statKey ? 'not_on_duty' : null;
    return workstateDaySlices(s, from, to, now).map((slice) => ({
      ...slice, who: s.who, staffNo: s.staffNo ?? null, groupId: s.groupId, roleKey: s.roleKey ?? null,
      status: s.status, sub: s.sub, ticketNo: s.ticketNo, sessionId: s.sessionId ?? null,
      tenantId: s.tenantId ?? null, actorId: s.actorId ?? null, source: s.source, statKey,
      currentRosterMember: members.includes(s.who), includedInBoard: exclusionReason === null, exclusionReason,
    }));
  });
  const byTypeMs: Record<string, number> = {};
  const byBusinessDateMs: Record<string, number> = {};
  for (const row of rows) {
    if (!row.includedInBoard || !row.statKey) continue;
    byTypeMs[row.statKey] = (byTypeMs[row.statKey] ?? 0) + row.durationMs;
    byBusinessDateMs[row.businessDate] = (byBusinessDateMs[row.businessDate] ?? 0) + row.durationMs;
  }
  return {
    rows,
    includedRows: rows.filter((row) => row.includedInBoard),
    excludedRows: rows.filter((row) => !row.includedInBoard),
    totalMs: Object.values(byTypeMs).reduce((a, b) => a + b, 0),
    byTypeMs,
    byBusinessDateMs,
  };
}

function readCache(): Persisted | null {
  try {
    const raw = localStorage.getItem(CTI_FLOW_LS_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Persisted;
    return v && [3, 4, CTI_FLOW_VERSION].includes(v.version) && Array.isArray(v.segments) ? v : null;
  } catch {
    return null;
  }
}

function readAuditCache(): WorkstateAuditRecord[] {
  try {
    const raw = localStorage.getItem(WORKSTATE_AUDIT_LS_KEY);
    const parsed = raw ? JSON.parse(raw) as WorkstateAuditRecord[] : [];
    return Array.isArray(parsed) ? parsed.slice(-500) : [];
  } catch {
    return [];
  }
}

export const useCtiFlowStore = defineStore('ctiFlow', () => {
  const cached = readCache();
  const keepFrom = dayStart(Date.now()) - KEEP_DAYS * DAY;
  /** 上次会话未结束的段：以最后一次保存时刻收尾（页面关闭 / 刷新即视为结束） */
  const segments = ref<FlowSegment[]>(
    (cached?.segments ?? [])
      .filter((s) => Number.isFinite(s.start) && s.start >= keepFrom && s.start <= Date.now())
      .map((s) => cached?.version === 3
        ? { ...s, source: 'legacy_local' as const, end: s.end ?? Math.max(s.start, Math.min(Date.now(), cached.savedAt)) }
        : { ...s }),
  );
  const keptIds = new Set(segments.value.map((s) => s.id));
  const legacyEvents = cached && cached.version >= 4 && Array.isArray(cached.events) ? cached.events as unknown[] : [];
  const events = ref<WorkstateEvent[]>(legacyEvents.map((raw, index): WorkstateEvent => {
    const old = raw as Record<string, any>;
    const payload = (old.payload ?? old.segment) as FlowSegment;
    const legacyDelivery = old.delivery as Partial<WorkstateDeliveryReceipt> | undefined;
    const delivery: WorkstateDeliveryReceipt = {
      state: legacyDelivery?.state ?? 'queued', attempts: legacyDelivery?.attempts ?? 0,
      lastAttemptAt: legacyDelivery?.lastAttemptAt ?? null, nextRetryAt: legacyDelivery?.nextRetryAt ?? null,
      acknowledgedAt: legacyDelivery?.acknowledgedAt ?? null, serverReceiptId: legacyDelivery?.serverReceiptId ?? null,
      lastErrorCode: legacyDelivery?.lastErrorCode ?? null, lastErrorMessage: legacyDelivery?.lastErrorMessage ?? null,
      failureDisposition: legacyDelivery?.failureDisposition
        ?? (legacyDelivery?.state === 'failed' ? 'retryable' : null),
    };
    return {
      eventId: old.eventId, idempotencyKey: old.idempotencyKey ?? old.eventId,
      eventName: old.eventName, schemaVersion: WORKSTATE_EVENT_SCHEMA_VERSION,
      sequence: old.sequence ?? index + 1, previousEventId: old.previousEventId ?? null,
      occurredAt: old.occurredAt, recordedAt: old.recordedAt, timeZone: WORKSTATE_TIME_ZONE,
      environment: 'prototype', timeSource: 'client_clock',
      identity: old.identity ?? {
        tenantId: payload.tenantId ?? null, actorId: payload.actorId ?? null,
        actorName: payload.who, actorRoleKey: payload.roleKey ?? '', staffNo: payload.staffNo ?? null,
        organizationId: payload.groupId,
      },
      delivery, payload,
    };
  }).filter((event) => keptIds.has(event.payload.id)));
  const storageStatus = ref<'saved' | 'memory_only'>('saved');
  const deliveryBusy = ref(false);
  const auditRecords = ref<WorkstateAuditRecord[]>(readAuditCache());
  const sessionId = globalThis.crypto?.randomUUID?.() ?? `session-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let seq = segments.value.length;

  function actionAccess(groupId: string, action: WorkstateAction): WorkstateAccessDecision {
    const user = useUserStore();
    const tenant = useTenantStore();
    const tenantId = tenant.currentTenantId ? `prototype:${tenant.currentTenantId}` : null;
    const actorId = currentActorRef();
    const managedGroupIds = teamBoardGroups(user.roleKey, user.name).map((group) => group.id);
    let reason: WorkstateAccessDecision['reason'] = 'allowed';
    if (!tenantId) reason = 'tenant_missing';
    else if (!actorId) reason = 'actor_missing';
    else if (!user.canAccess('team-board')) reason = 'menu_denied';
    else if (!workstateRoleAllowsAction(user.roleKey, action)) reason = 'action_denied';
    else if (!managedGroupIds.includes(groupId)) reason = 'group_out_of_scope';
    return {
      allowed: reason === 'allowed', action, tenantId, actorId, actorRoleKey: user.roleKey,
      managedGroupIds, requestedGroupId: groupId, reason,
    };
  }

  function recordAudit(decision: WorkstateAccessDecision, resultCode: string) {
    auditRecords.value.push(createWorkstateAuditRecord({
      action: decision.action,
      actorId: decision.actorId,
      actorRoleKey: decision.actorRoleKey,
      tenantId: decision.tenantId,
      managedGroupIds: decision.managedGroupIds,
      requestedGroupId: decision.requestedGroupId,
      resultCode,
      occurredAt: Date.now(),
    }));
    auditRecords.value = auditRecords.value.slice(-500);
    try {
      localStorage.setItem(WORKSTATE_AUDIT_LS_KEY, JSON.stringify(auditRecords.value));
    } catch {
      storageStatus.value = 'memory_only';
    }
  }

  function assertActionAccess(groupId: string, action: WorkstateAction): WorkstateAccessDecision {
    const decision = actionAccess(groupId, action);
    if (!decision.allowed) {
      recordAudit(decision, `DENIED_${decision.reason.toUpperCase()}`);
      throw new Error(`WORKSTATE_ACCESS_DENIED:${decision.reason}`);
    }
    return decision;
  }

  function save() {
    try {
      const v: Persisted = {
        version: CTI_FLOW_VERSION, savedAt: Date.now(),
        segments: segments.value,
        events: events.value,
      };
      localStorage.setItem(CTI_FLOW_LS_KEY, JSON.stringify(v));
      storageStatus.value = 'saved';
    } catch {
      storageStatus.value = 'memory_only';
    }
  }

  function me(ticketNo?: string | null) {
    const user = useUserStore();
    const tenant = useTenantStore();
    const agent = useDispatchStore().agentOf(user.name);
    const groupId = workstateGroupOf(user.name, ticketNo);
    const tenantId = tenant.currentTenantId ? `prototype:${tenant.currentTenantId}` : null;
    const actorRef = user.domainAccount || user.account || agent?.staffNo || '';
    return { who: user.name, groupId, staffNo: agent?.staffNo ?? null, roleKey: user.roleKey,
      tenantId, actorId: actorRef ? `prototype:${actorRef}` : null,
      eligibleForGroupStats: WORKTIME_ROLE_KEYS.has(user.roleKey) && !!tenantId && !!actorRef && groupId !== null };
  }

  function openOf(who: string): FlowSegment | undefined {
    for (let i = segments.value.length - 1; i >= 0; i--) {
      const s = segments.value[i];
      if (s.source === 'prototype_live' && s.who === who) return s.end == null ? s : undefined;
    }
    return undefined;
  }

  function event(s: FlowSegment, closed: boolean) {
    const eventId = `${s.id}:${closed ? 'closed' : 'started'}`;
    if (events.value.some((e) => e.eventId === eventId)) return;
    const previous = [...events.value].reverse().find((candidate) => (
      candidate.identity.tenantId === (s.tenantId ?? null)
      && candidate.identity.actorId === (s.actorId ?? null)
      && candidate.payload.sessionId === s.sessionId
    )) ?? null;
    events.value.push({
      eventId, idempotencyKey: eventId,
      eventName: closed ? 'workstate.segment_closed' : 'workstate.segment_started',
      schemaVersion: WORKSTATE_EVENT_SCHEMA_VERSION, sequence: (previous?.sequence ?? 0) + 1,
      previousEventId: previous?.eventId ?? null,
      occurredAt: closed ? s.end! : s.start, recordedAt: Date.now(), timeZone: WORKSTATE_TIME_ZONE,
      environment: 'prototype', timeSource: 'client_clock',
      identity: {
        tenantId: s.tenantId ?? null, actorId: s.actorId ?? null, actorName: s.who,
        actorRoleKey: s.roleKey ?? '', staffNo: s.staffNo ?? null, organizationId: s.groupId,
      },
      delivery: {
        state: 'queued', attempts: 0, lastAttemptAt: null, nextRetryAt: null,
        acknowledgedAt: null, serverReceiptId: null, lastErrorCode: null, lastErrorMessage: null,
        failureDisposition: null,
      },
      payload: { ...s },
    });
  }

  function close(s: FlowSegment, at: number, reason: FlowEndReason) {
    if (s.end != null) return;
    s.end = Math.max(s.start, at);
    s.endReason = reason;
    event(s, true);
  }

  function openSegment(identity: ReturnType<typeof me>, status: WorkStatus, sub: string | null, ticketNo: string | null, now: number) {
    const s: FlowSegment = { id: `${sessionId}-${seq++}`, ...identity, status, sub, start: now, end: null,
      ticketNo, source: 'prototype_live', sessionId, lastSeenAt: now };
    segments.value.push(s);
    event(s, false);
  }

  /** 浏览器断线不是CTI服务端断线凭证；仅收口本机观测，不补未观测时间。 */
  function interrupt(reason: 'connection_lost' | 'page_exit' | 'identity_change') {
    const now = Date.now();
    for (const s of segments.value) {
      if (s.source !== 'prototype_live' || s.end != null) continue;
      const last = s.lastSeenAt ?? s.start;
      close(s, reason === 'page_exit' && now - last <= WORKSTATE_HEARTBEAT_GAP_MS ? now : last, reason);
    }
    save();
  }

  /** 状态/子态/工单/人员归组变化开新段；同值不重复埋点，签出只收口。 */
  function transition(status: WorkStatus, sub: string | null, ticketNo: string | null): boolean {
    const identity = me(ticketNo);
    const { who } = identity;
    if (!who) return false;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) { interrupt('connection_lost'); return false; }
    const now = Date.now();
    for (const s of segments.value) {
      if (s.source === 'prototype_live' && s.end == null && s.who !== who) close(s, s.lastSeenAt ?? s.start, 'identity_change');
    }
    const open = openOf(who);
    const identityComplete = hasCompleteWorkstateIdentity({
      tenantId: identity.tenantId, actorId: identity.actorId, organizationId: identity.groupId,
    });
    if (status !== 'offline' && !identityComplete) {
      if (open) close(open, now, 'identity_change');
      save();
      return false;
    }
    const gap = open && now - (open.lastSeenAt ?? open.start) > WORKSTATE_HEARTBEAT_GAP_MS;
    const sameGroup = open?.groupId === identity.groupId && open?.roleKey === identity.roleKey && open?.staffNo === identity.staffNo;
    if (open && !gap && sameGroup && open.status === status && open.sub === sub && open.ticketNo === ticketNo) {
      open.lastSeenAt = now; save(); return true;
    }
    if (open) close(open, gap ? open.lastSeenAt ?? open.start : now,
      gap ? 'heartbeat_gap' : status === 'offline' ? 'sign_out' : !sameGroup ? 'group_change' : 'state_change');
    if (status !== 'offline') {
      openSegment(identity, status, sub, ticketNo, now);
    }
    save();
    return true;
  }

  /** 进行中段的定时落盘，刷新后以此收尾 */
  function heartbeat() {
    const s = openOf(me().who);
    if (s) transition(s.status, s.sub, s.ticketNo);
    else save();
  }

  function allSegments(now: number, source: FlowDataSource): FlowSegment[] {
    return source === 'demo' ? buildSeed(now) : segments.value.filter((s) => s.source === 'prototype_live');
  }

  function integrationStatusFor(groupId: string) {
    const access = actionAccess(groupId, 'summary');
    const scopedEvents = access.allowed ? events.value.filter((item) => (
      item.identity.tenantId === access.tenantId && item.identity.organizationId === groupId
      && hasCompleteWorkstateIdentity(item.identity)
    )) : [];
    const counts = { queued: 0, sending: 0, failed: 0, acknowledged: 0 };
    scopedEvents.forEach((item) => { counts[item.delivery.state] += 1; });
    let lastError: string | null = null;
    for (let index = scopedEvents.length - 1; index >= 0; index -= 1) {
      if (scopedEvents[index].delivery.lastErrorCode) {
        lastError = scopedEvents[index].delivery.lastErrorMessage;
        break;
      }
    }
    const now = Date.now();
    recordAudit(access, access.allowed ? 'OK_SUMMARY' : `DENIED_${access.reason.toUpperCase()}`);
    return {
      contractVersion: WORKSTATE_EVENT_SCHEMA_VERSION,
      endpointConfigured: false,
      mode: 'prototype_outbox' as const,
      counts,
      total: scopedEvents.length,
      dueRetryCount: scopedEvents.filter((item) => isRetryDue(item.delivery, now)).length,
      permanentFailureCount: scopedEvents.filter((item) => item.delivery.failureDisposition === 'permanent').length,
      lastError,
      access,
    };
  }

  async function retryOutboxDelivery(groupId: string) {
    const access = assertActionAccess(groupId, 'retry');
    if (deliveryBusy.value) {
      recordAudit(access, 'RETRY_BUSY');
      return { attempted: 0, permanent: 0, waiting: 0, busy: true };
    }
    const now = Date.now();
    const scoped = events.value.filter((item) => (
      item.identity.organizationId === groupId
      && (item.identity.tenantId === access.tenantId || item.identity.tenantId == null)
    ));
    let permanent = 0;
    scoped.forEach((item) => {
      if (item.identity.tenantId && item.identity.actorId && item.identity.organizationId) return;
      if (item.delivery.state === 'acknowledged') return;
      item.delivery.state = 'failed';
      item.delivery.failureDisposition = 'permanent';
      item.delivery.nextRetryAt = null;
      item.delivery.lastErrorCode = identityInvalidError.code;
      item.delivery.lastErrorMessage = identityInvalidError.message;
      permanent += 1;
    });
    const candidates = scoped.filter((item) => isRetryDue(item.delivery, now));
    const waiting = scoped.filter((item) => (
      item.delivery.failureDisposition !== 'permanent'
      && item.delivery.state !== 'acknowledged'
      && item.delivery.state !== 'sending'
      && item.delivery.nextRetryAt != null
      && item.delivery.nextRetryAt > now
    )).length;
    if (!candidates.length) {
      if (permanent) save();
      recordAudit(access, permanent ? 'RETRY_IDENTITY_PERMANENT_FAILURE' : waiting ? 'RETRY_NOT_DUE' : 'RETRY_NOTHING_DUE');
      return { attempted: 0, permanent, waiting, busy: false };
    }
    deliveryBusy.value = true;
    const attemptedAt = now;
    candidates.forEach((item) => { item.delivery.state = 'sending'; item.delivery.lastAttemptAt = attemptedAt; });
    save();
    await new Promise((resolve) => window.setTimeout(resolve, 450));
    const failedAt = Date.now();
    candidates.forEach((item) => {
      item.delivery.attempts += 1;
      item.delivery.state = 'failed';
      item.delivery.failureDisposition = 'retryable';
      item.delivery.nextRetryAt = failedAt + nextRetryDelayMs(item.delivery.attempts);
      if (!item.delivery.lastErrorCode || item.delivery.lastErrorCode === endpointNotConfiguredError.code) {
        item.delivery.lastErrorCode = endpointNotConfiguredError.code;
        item.delivery.lastErrorMessage = endpointNotConfiguredError.message;
      }
    });
    deliveryBusy.value = false;
    save();
    recordAudit(access, 'RETRY_ENDPOINT_NOT_CONFIGURED');
    return { attempted: candidates.length, permanent, waiting, busy: false };
  }

  function requestWorkstateCompensation(groupId: string) {
    const access = assertActionAccess(groupId, 'compensate');
    const resultCode = 'COMPENSATION_ENDPOINT_NOT_CONNECTED';
    recordAudit(access, resultCode);
    return { accepted: false, resultCode };
  }

  /** 组级时长分布：本组各工作类型、小休的时长与占比（合计＝在岗时长；外呼通话计入工单处理） */
  function distribution(groupId: string, from: number, to: number, now: number = Date.now(), source: FlowDataSource = 'live'): GroupDistribution {
    const access = actionAccess(groupId, 'query');
    const segs = allSegments(now, source);
    const types = workTypesOfGroup(groupId);
    const ms: Record<string, number> = {};
    const members = new Set<string>(access.allowed ? groupMembersOf(groupId).map((member) => member.name) : []);
    const byMember: Record<string, { ms: Record<string, number>; breakReasons: Record<string, number> }> = {};
    const breakReasons: Record<string, number> = {};
    if (!access.allowed) {
      recordAudit(access, `DENIED_${access.reason.toUpperCase()}`);
      const defs = [...types.map((t) => ({ key: t.key, label: t.label, color: t.color })),
        { key: BREAK_ITEM.key, label: BREAK_ITEM.label, color: BREAK_ITEM.color }];
      return { items: defs.map((def) => ({ ...def, ms: 0, pct: 0 })), totalMs: 0, memberCount: 0,
        byMember: {}, breakReasons: {}, access };
    }
    segs.forEach((s) => {
      if (s.groupId !== groupId || (source === 'live' && (
        s.tenantId !== access.tenantId
        || !s.eligibleForGroupStats
        || !hasCompleteWorkstateIdentity({ tenantId: s.tenantId, actorId: s.actorId, organizationId: s.groupId })
      ))) return;
      const a = Math.max(s.start, from);
      const b = Math.min(source === 'demo' ? s.end ?? now : observedEnd(s, now), to, now);
      if (b <= a) return;
      const key = workStatKey(s.status, s.sub);
      if (!key) return;
      members.add(s.who);
      ms[key] = (ms[key] ?? 0) + (b - a);
      const mm = (byMember[s.who] ??= { ms: {}, breakReasons: {} });
      mm.ms[key] = (mm.ms[key] ?? 0) + (b - a);
      if (key === BREAK_ITEM.key) {
        const r = s.sub ?? 'meeting';
        breakReasons[r] = (breakReasons[r] ?? 0) + (b - a);
        mm.breakReasons[r] = (mm.breakReasons[r] ?? 0) + (b - a);
      }
    });
    const defs = [
      ...types.map((t) => ({ key: t.key, label: t.label, color: t.color })),
      { key: BREAK_ITEM.key, label: BREAK_ITEM.label, color: BREAK_ITEM.color },
    ];
    // 历史段里本组已停用的类型也计入，避免合计少算（插在小休之前）
    Object.keys(ms).forEach((k) => {
      if (!defs.some((d) => d.key === k)) {
        const t = workTypeOf(k);
        if (t) defs.splice(defs.length - 1, 0, { key: t.key, label: t.label, color: t.color });
      }
    });
    const total = defs.reduce((s, d) => s + (ms[d.key] ?? 0), 0);
    const items = defs.map((d) => ({ ...d, ms: ms[d.key] ?? 0, pct: total ? ((ms[d.key] ?? 0) / total) * 100 : 0 }));
    const keys = new Set(defs.map((d) => d.key));
    const memberRows: Record<string, MemberDist> = {};
    Object.entries(byMember).forEach(([who, v]) => {
      const rowMs: Record<string, number> = {};
      keys.forEach((k) => { rowMs[k] = v.ms[k] ?? 0; });
      memberRows[who] = {
        ms: rowMs, totalMs: Object.values(rowMs).reduce((s, x) => s + x, 0), breakReasons: v.breakReasons,
      };
    });
    recordAudit(access, source === 'live' ? 'OK_QUERY' : 'OK_QUERY_DEMO');
    return { items, totalMs: total, memberCount: members.size, byMember: memberRows, breakReasons, access };
  }

  function exportReconciliation(groupId: string, from: number, to: number, now = Date.now()) {
    const access = assertActionAccess(groupId, 'export');
    const members = groupMembersOf(groupId).map((m) => m.name);
    const reconciliation = reconcileWorkstateSegments(segments.value, groupId, access.tenantId!, members, from, to, now);
    const ids = new Set(reconciliation.rows.map((row) => row.segmentId));
    const board = distribution(groupId, from, to, now, 'live');
    const integration = integrationStatusFor(groupId);
    const bundle = {
      schemaVersion: 2, exportedAt: now, timeZone: WORKSTATE_TIME_ZONE,
      authorization: { action: 'export', tenantId: access.tenantId, actorId: access.actorId,
        actorRoleKey: access.actorRoleKey, managedGroupIds: access.managedGroupIds, requestedGroupId: groupId },
      integration: {
        mode: 'prototype_outbox', contractVersion: WORKSTATE_EVENT_SCHEMA_VERSION,
        endpointConfigured: false, receivedByObservatory: false,
        storageStatus: storageStatus.value, deliveryCounts: { ...integration.counts },
      },
      scope: { groupId, from, to, memberNames: members, memberCount: members.length,
        statistics: 'group_work_distribution', personalPerformance: 'excluded',
        externalAssessmentScope: 'excluded',
        tenantId: access.tenantId,
        identityMapping: 'prototype_namespace_only' },
      segments: segments.value.filter((s) => ids.has(s.id)).map((s) => ({ ...s })),
      events: events.value.filter((e) => ids.has(e.payload.id)).map((e) => ({ ...e, payload: { ...e.payload } })),
      reconciliation: { ...reconciliation, boardTotalMs: board.totalMs, differenceMs: reconciliation.totalMs - board.totalMs },
      exclusionRecords: reconciliation.excludedRows,
      limitations: ['single_browser_local_evidence', 'client_clock', 'not_server_received', 'prototype_identity_namespace'],
    };
    recordAudit(access, 'OK_EXPORT');
    return bundle;
  }

  let recovered = false;
  for (const s of segments.value) {
    if (s.source === 'prototype_live' && s.end == null) {
      close(s, Math.min(Date.now(), s.lastSeenAt ?? cached?.savedAt ?? s.start), 'refresh_recovery');
      recovered = true;
    }
  }
  if (recovered) save();

  return {
    segments, events, storageStatus, deliveryBusy, auditRecords,
    transition, heartbeat, interrupt, distribution, exportReconciliation, retryOutboxDelivery,
    requestWorkstateCompensation, actionAccess, integrationStatusFor,
  };
});
