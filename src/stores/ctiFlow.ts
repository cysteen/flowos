import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { WorkStatus } from '@/stores/cti';
import { useUserStore } from '@/stores/user';
import { useDispatchStore } from '@/stores/dispatch';
import { TICKETS } from '@/mock/tickets';
import { isTicketClosed } from '@/views/tickets/types/ticket';
import {
  DEFAULT_WORK_TYPE, OUTBOUND_ITEM, workTypeOf, workTypesOfGroup, type WorkTypeDef,
} from '@/mock/ctiWorkTypes';

/**
 * 话务条状态流水：每次工作状态 / 子状态切换记一段（人、班组、状态、子状态、起止时刻、关联工单），
 * 外呼忙碌段同样记一段（子状态记 outbound）。另记「工单操作」时刻，供「状态存疑」统计。
 *
 * - 实时段落 localStorage（键带版本号），刷新后未结束的段以最后一次保存时刻收尾；
 * - 近两周种子按工作日 9:00–18:00 按人按日确定性生成，不入缓存（刷新、跨日都与当日对齐）；
 *   某人某日一旦有实时段，当日种子在其首段开始后截断，两份不重叠。
 * - 只给组级统计用，不出个人排名。
 */

export const CTI_FLOW_LS_KEY = 'flowos-cti-status-flow';
/** v2：去掉线下子状态「仍在进行」确认记录（confirmAt） */
export const CTI_FLOW_VERSION = 2;

/** 状态存疑：线下子状态期间每次工单操作计入其后这段时长（重叠合并，截到段尾） */
export const SUSPECT_WINDOW_MIN = 10;

const MIN = 60_000;
const DAY = 24 * 60 * MIN;
const KEEP_DAYS = 15;
const SEED_DAYS = 14;

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
}

export interface FlowOp {
  who: string;
  at: number;
  ticketNo: string | null;
}

interface Persisted {
  version: number;
  savedAt: number;
  segments: FlowSegment[];
  ops: FlowOp[];
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
  totalMs: number;
  /** 线下类工作合计 */
  offlineMs: number;
  /** 状态存疑：线下子状态期间又有工单操作的时段 */
  suspectMs: number;
  memberCount: number;
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

/** 班组成员：智能派单坐席名册里的二线专员（所属班组取其首个处理组）+ 上表各组成员 */
export function flowMembers(): FlowMember[] {
  return [
    ...useDispatchStore().agents
      .filter((a) => a.roles.includes('二线专员'))
      .map((a) => ({ name: a.name, groupId: a.groupIds[0] ?? null })),
    ...WORK_TIME_EXTRA_GROUPS.flatMap((g) => g.members.map((name) => ({ name, groupId: g.id }))),
  ];
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
  const offline = types.filter((t) => t.offline);
  const w = offline.map((_, i) => offline.length - i + 1);
  let r = rand() * w.reduce((s, x) => s + x, 0);
  for (let i = 0; i < offline.length; i++) {
    r -= w[i];
    if (r <= 0) return offline[i];
  }
  return offline[0];
}

function seedDay(m: FlowMember, day0: number, out: { segs: FlowSegment[]; ops: FlowOp[] }) {
  const rand = prng(hash(`${m.name}|${new Date(day0).toDateString()}`));
  const ri = (a: number, b: number) => a + Math.floor(rand() * (b - a + 1));
  const types = workTypesOfGroup(m.groupId);
  const tickets = inProgressNos(m.name);
  let n = 0;
  const push = (status: WorkStatus, sub: string | null, start: number, end: number, ticketNo: string | null = null) => {
    if (end <= start) return;
    out.segs.push({ id: `seed-${m.name}-${day0}-${n++}`, who: m.name, groupId: m.groupId, status, sub, start, end, ticketNo });
  };
  const op = (t: number, ticketNo: string | null = null) => out.ops.push({ who: m.name, at: t, ticketNo });
  const pickTicket = () => (tickets.length && rand() < 0.65 ? tickets[ri(0, tickets.length - 1)] : null);

  /** 就绪时段内的工作排布：工单处理与线下类工作交替，穿插少量外呼 */
  const fill = (from: number, to: number) => {
    let t = from;
    while (t < to - 5 * MIN) {
      const r = rand();
      if (r < 0.1) {
        const end = Math.min(to, t + ri(3, 12) * MIN);
        const no = pickTicket();
        op(t, no);
        push('busy', OUTBOUND_ITEM.key, t, end, no);
        t = end;
      } else if (r < 0.55) {
        const end = Math.min(to, t + ri(20, 60) * MIN);
        push('ready', DEFAULT_WORK_TYPE, t, end);
        for (let x = t + ri(2, 8) * MIN; x < end; x += ri(4, 15) * MIN) op(x);
        t = end;
      } else {
        const type = pickOffline(rand, types);
        const end = Math.min(to, t + ri(15, 75) * MIN);
        const no = type.linkTicket ? pickTicket() : null;
        push('ready', type.key, t, end, no);
        if (rand() < 0.15) {
          const k = ri(1, 2);
          for (let i = 0; i < k; i++) op(t + Math.floor(rand() * (end - t)), no);
        }
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

/** 近两周（含今日）工作日种子；今日只生成到此刻 */
function buildSeed(now: number): { segs: FlowSegment[]; ops: FlowOp[] } {
  const out = { segs: [] as FlowSegment[], ops: [] as FlowOp[] };
  const today = dayStart(now);
  const members = flowMembers();
  for (let i = SEED_DAYS - 1; i >= 0; i--) {
    const d0 = dayStart(today - i * DAY + 12 * 60 * MIN);
    const wd = new Date(d0).getDay();
    if (wd === 0 || wd === 6) continue;
    members.forEach((m) => seedDay(m, d0, out));
  }
  out.segs = out.segs
    .filter((s) => s.start < now)
    .map((s) => (s.end != null && s.end > now ? { ...s, end: now } : s));
  out.ops = out.ops.filter((o) => o.at <= now);
  return out;
}

/* ------------------------------------------------------------------ */
/* store                                                                */
/* ------------------------------------------------------------------ */

function readCache(): Persisted | null {
  try {
    const raw = localStorage.getItem(CTI_FLOW_LS_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Persisted;
    return v && v.version === CTI_FLOW_VERSION && Array.isArray(v.segments) ? v : null;
  } catch {
    return null;
  }
}

export const useCtiFlowStore = defineStore('ctiFlow', () => {
  const cached = readCache();
  const keepFrom = dayStart(Date.now()) - KEEP_DAYS * DAY;
  /** 上次会话未结束的段：以最后一次保存时刻收尾（页面关闭 / 刷新即视为结束） */
  const segments = ref<FlowSegment[]>(
    (cached?.segments ?? [])
      .filter((s) => s.start >= keepFrom)
      .map((s) => (s.end == null ? { ...s, end: Math.max(s.start, cached!.savedAt) } : s)),
  );
  const ops = ref<FlowOp[]>((cached?.ops ?? []).filter((o) => o.at >= keepFrom));
  let seq = segments.value.length;

  function save() {
    try {
      const v: Persisted = {
        version: CTI_FLOW_VERSION, savedAt: Date.now(),
        segments: segments.value, ops: ops.value,
      };
      localStorage.setItem(CTI_FLOW_LS_KEY, JSON.stringify(v));
    } catch {
      /* 存不下不影响话务条 */
    }
  }

  function me(): { who: string; groupId: string | null } {
    const who = useUserStore().name;
    return { who, groupId: useDispatchStore().agentOf(who)?.groupIds[0] ?? null };
  }

  function openOf(who: string): FlowSegment | undefined {
    for (let i = segments.value.length - 1; i >= 0; i--) {
      const s = segments.value[i];
      if (s.who === who) return s.end == null ? s : undefined;
    }
    return undefined;
  }

  /** 状态 / 子状态切换：结束本人进行中的段，签出以外开新段 */
  function transition(status: WorkStatus, sub: string | null, ticketNo: string | null) {
    const { who, groupId } = me();
    if (!who) return;
    const now = Date.now();
    const open = openOf(who);
    if (open && open.status === status && open.sub === sub && open.ticketNo === ticketNo) return;
    if (open) open.end = now;
    if (status !== 'offline') {
      segments.value.push({ id: `live-${now}-${seq++}`, who, groupId, status, sub, start: now, end: null, ticketNo });
    }
    save();
  }

  /** 工单操作信号（打开 / 保存工单处理页、在工单上外呼） */
  function noteOp(ticketNo: string | null) {
    const { who } = me();
    if (!who) return;
    ops.value.push({ who, at: Date.now(), ticketNo });
    save();
  }

  /** 进行中段的定时落盘，刷新后以此收尾 */
  function heartbeat() {
    save();
  }

  /** 种子 + 实时段合并：某人某日有实时段时，当日种子在实时首段之前截断 */
  function allSegments(now: number): { segs: FlowSegment[]; ops: FlowOp[] } {
    const seed = buildSeed(now);
    const liveFirst = new Map<string, number>();
    segments.value.forEach((s) => {
      const k = `${s.who}|${dayStart(s.start)}`;
      if (!liveFirst.has(k) || s.start < liveFirst.get(k)!) liveFirst.set(k, s.start);
    });
    const segs: FlowSegment[] = [];
    seed.segs.forEach((s) => {
      const lf = liveFirst.get(`${s.who}|${dayStart(s.start)}`);
      if (lf == null) { segs.push(s); return; }
      if (s.start >= lf) return;
      segs.push(s.end! > lf ? { ...s, end: lf } : s);
    });
    const seedOps = seed.ops.filter((o) => {
      const lf = liveFirst.get(`${o.who}|${dayStart(o.at)}`);
      return lf == null || o.at < lf;
    });
    return { segs: [...segs, ...segments.value], ops: [...seedOps, ...ops.value] };
  }

  /** 组级时长分布：本组各工作类型（含外呼）的时长与占比、线下类合计、状态存疑 */
  function distribution(groupId: string, from: number, to: number, now: number = Date.now()): GroupDistribution {
    const { segs, ops: allOps } = allSegments(now);
    const types = workTypesOfGroup(groupId);
    const ms: Record<string, number> = {};
    let suspect = 0;
    const members = new Set<string>();
    const opsByWho = new Map<string, number[]>();
    allOps.forEach((o) => {
      if (!opsByWho.has(o.who)) opsByWho.set(o.who, []);
      opsByWho.get(o.who)!.push(o.at);
    });
    segs.forEach((s) => {
      if (s.groupId !== groupId) return;
      const a = Math.max(s.start, from);
      const b = Math.min(s.end ?? now, to, now);
      if (b <= a) return;
      let key: string | null = null;
      if (s.status === 'busy') key = OUTBOUND_ITEM.key;
      else if (s.status === 'ready') key = s.sub ?? DEFAULT_WORK_TYPE;
      if (!key) return;
      members.add(s.who);
      ms[key] = (ms[key] ?? 0) + (b - a);
      if (s.status === 'ready' && workTypeOf(key)?.offline) {
        // 线下子状态期间的工单操作：每次计其后 SUSPECT_WINDOW_MIN，重叠合并，截到本段
        let cover = 0;
        let curEnd = a;
        (opsByWho.get(s.who) ?? [])
          .filter((t) => t >= a && t < b)
          .sort((x, y) => x - y)
          .forEach((t) => {
            const st = Math.max(t, curEnd);
            const en = Math.min(b, t + SUSPECT_WINDOW_MIN * MIN);
            if (en > st) { cover += en - st; curEnd = en; }
          });
        suspect += cover;
      }
    });
    const defs = [
      ...types.map((t) => ({ key: t.key, label: t.label, color: t.color })),
      { key: OUTBOUND_ITEM.key, label: OUTBOUND_ITEM.label, color: OUTBOUND_ITEM.color },
    ];
    // 历史段里本组已停用的类型也计入，避免合计少算
    Object.keys(ms).forEach((k) => {
      if (!defs.some((d) => d.key === k)) {
        const t = workTypeOf(k);
        if (t) defs.splice(defs.length - 1, 0, { key: t.key, label: t.label, color: t.color });
      }
    });
    const total = defs.reduce((s, d) => s + (ms[d.key] ?? 0), 0);
    const items = defs.map((d) => ({ ...d, ms: ms[d.key] ?? 0, pct: total ? ((ms[d.key] ?? 0) / total) * 100 : 0 }));
    const offlineMs = items.filter((i) => workTypeOf(i.key)?.offline).reduce((s, i) => s + i.ms, 0);
    return { items, totalMs: total, offlineMs, suspectMs: suspect, memberCount: members.size };
  }

  return {
    segments, ops,
    transition, noteOp, heartbeat, distribution,
  };
});
