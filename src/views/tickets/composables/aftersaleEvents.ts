/**
 * 售后回传通道（1025 客服⇄售后互转 · 地基）。
 *
 * 售后系统把三种事件推给客服侧，本模块是**唯一**的落地处：
 * - `AS_CLOSED`   售后单终态关闭 → 来源位上「已转出」的客服单正常关闭（N2：closeReason＝售后已完成、不走审批、进已办）；
 * - `AS_RETURNED` 售后转回客服   → 来源位上「已转出」的客服单清空处理人、按现行分派规则重新派单（N16 改写 D2）；
 * - `AS_PROGRESS` 售后过程状态   → 只刷关联售后卡片，不动客服单状态。
 *
 * 关联位（D7 / D9 / M1）：客服单侧 1:1；售后单侧两位 ——
 * **客服来源位**（①②，客服单上记 `linkedAftersaleNo`）/ **客服派生位**（③④，客服单上记 `aftersaleOriginNo`）。
 *
 * 纯函数：入参不改，返回新的工单行；不读写任何 store。种子数据与运行时走同一个函数（口径定稿 §4-6）。
 * 回传契约以售后侧为准（N4），这里只取客服侧需要的字段。
 */
import {
  POOL_GROUPS, isTicketClosed, type Channel, type Priority, type Ticket, type TicketType,
} from '@/views/tickets/types/ticket';
import type { TimelineEntry, TlRole } from '@/views/tickets/types/ticketDetail';
import { AFTERSALE_INBOUND_SOURCE } from '@/views/tickets/types/createTicket';
import { AFTERSALE_FROZEN_STATUS, AFTERSALE_SLOT_LABEL, type AftersaleSlot } from './aftersaleButtonForm';

/**
 * `AS_ESCALATE_COMPLAINT`：售后升级投诉（③，《【1025】》§4.1）—— 客服侧新建投诉单挂客服派生位，
 * 该售后单在客服侧呈现「冻结」。事件名为客服侧暂用名，契约以售后侧为准（§6）。
 */
export type AftersaleEventType = 'AS_CLOSED' | 'AS_RETURNED' | 'AS_PROGRESS' | 'AS_ESCALATE_COMPLAINT';

/**
 * 售后侧建客服新单时随事件带来的单据信息（③ 升级投诉 / ④ 转咨询）。
 * 客户与产品取售后单上的值；工单号由客服侧生成，种子单在此给定。
 */
export interface AftersaleInboundSeed {
  id: string;
  no: string;
  title: string;
  customer: string;
  product: string;
  customerPhone?: string;
  sn?: string;
  productCategory?: string;
  channel?: Channel;
  priority?: Priority;
  problemDesc?: string;
  /** 售后单标题（激活确认 / 回传表单的单据卡） */
  asTitle?: string;
  /** 售后服务类型（hover 卡片） */
  asServiceType?: string;
  /** 分派规则据以落池的处理组（缺省由分派规则取默认池） */
  groupId?: string;
}

export interface AftersaleEvent {
  type: AftersaleEventType;
  /** 售后工单号（＝关联 ID） */
  asNo: string;
  /** 事件 id（售后侧给；幂等键）。缺省按「单号 + 类型 + 时刻」合成 */
  eventId?: string;
  /** 事件时刻 YYYY-MM-DD HH:mm */
  at: string;
  /** 售后侧操作人 */
  operator: string;
  /** 售后单状态：AS_PROGRESS 为过程态；AS_CLOSED 为终态（缺省「已完成」）；AS_RETURNED 缺省「已转回客服」 */
  status?: string;
  /** AS_CLOSED：售后处理结果摘要 */
  resultSummary?: string;
  /** AS_RETURNED：转回原因 */
  returnReason?: string;
  /** AS_ESCALATE_COMPLAINT：升级原因 */
  escalateReason?: string;
  /** 需要客服侧新建单时（③ / ④）的单据信息 */
  inbound?: AftersaleInboundSeed;
}

/** 分派结果：派到人（assignee 有值）或落池（assignee＝null，进 groupId 那个组的池「未认领」） */
export interface DispatchOutcome {
  groupId: string;
  /** 组名，写履历用 */
  groupLabel: string;
  assignee: string | null;
}

/**
 * 分派规则的接入口：`AS_RETURNED` 不自带落点，落点由客服侧**现行分派规则**决定（N16）。
 * 调用方注入；派到人就给那个人，落池就落「未认领」，本模块不另写一套规则。
 */
export type DispatchResolver = (ticket: Ticket) => DispatchOutcome;

/**
 * 原型里的现行分派落点：回本单所属组的工单池「未认领」，由组内领取或班组长指派。
 * 原型没有运行时派单引擎（「智能分派」后台页只有配置，不执行），工作台的分派也只有
 * 领取 / 指派两条人工路径，故这里不派到人。接入派单引擎后只换这一个 resolver。
 */
export const dispatchByCurrentRule: DispatchResolver = (t) => {
  const g = POOL_GROUPS.find((x) => x.id === t.groupId) ?? POOL_GROUPS[0];
  return { groupId: g.id, groupLabel: g.label, assignee: null };
};

export type AftersaleEventOutcome =
  /** 来源位原单已正常关闭 */
  | 'closed'
  /** 来源位原单已清空处理人并重新派单 */
  | 'redispatched'
  /** 只刷了关联售后卡片 */
  | 'card-only'
  /** 原单已不在「已转出」：只写履历、不改状态 */
  | 'logged-only'
  /** 同一事件重复到达：丢弃 */
  | 'duplicate'
  /** 发起激活的那张客服单（派生位的单 / 来源位的回流单）未结案：售后再次转客服落原单（§4.5 支一） */
  | 'returned-again'
  /** 发起激活的那张客服单已结案：需新建咨询单承接（§4.5 支二，由 routeAftersaleEvent 建单） */
  | 'origin-settled'
  /** 新建了客服单（③ 投诉 / ④ 咨询） */
  | 'created'
  /** 新建咨询单并与已结案原单建「承接」（§4.5 支二） */
  | 'succeeded'
  /** 本单与该售后单无关联 */
  | 'unlinked';

export interface AftersaleEventResult {
  ticket: Ticket;
  outcome: AftersaleEventOutcome;
}

/** 售后单默认终态值（N7 终态集：已完成 / 已关闭 / 已取消） */
const AS_DEFAULT_CLOSED_STATUS = '已完成';
const AS_RETURNED_STATUS = '已转回客服';
/** N2：售后关单带来的关闭原因 */
export const AFTERSALE_CLOSE_REASON = '售后已完成';
const AFTERSALE_ACTOR_ROLE: TlRole = '系统';
const AFTERSALE_ACTOR = '售后系统';

function eventKey(e: AftersaleEvent): string {
  return e.eventId ?? `${e.asNo}:${e.type}:${e.at}`;
}

function entry(t: Ticket, partial: Omit<TimelineEntry, 'id'>, seq: number): TimelineEntry {
  const n = (t.eventTimeline?.length ?? 0) + seq + 1;
  return { id: `as-${t.no}-${n}`, ...partial };
}

function withEntries(t: Ticket, entries: Omit<TimelineEntry, 'id'>[]): TimelineEntry[] {
  return [...(t.eventTimeline ?? []), ...entries.map((p, i) => entry(t, p, i))];
}

function markHandled(t: Ticket, e: AftersaleEvent): string[] {
  return [...(t.aftersaleEventIds ?? []), eventKey(e)];
}

/**
 * 售后事件落客服单。
 *
 * 幂等：终态事件（AS_CLOSED / AS_RETURNED）按事件 id 去重，重复到达直接丢弃；
 * reopen 后售后再转客服不限次数（Q4）—— 每次是新事件 id，照常处理。
 * 来源位原单已不在「已转出」时：AS_CLOSED 只写履历、不改状态；AS_RETURNED 遇已结案原单按 §4.5 支二
 * 返回 `origin-settled`（由 routeAftersaleEvent 新建咨询单承接），遇未结案回流单落原单（§3.4）。
 */
export function applyAftersaleEvent(
  ticket: Ticket,
  event: AftersaleEvent,
  deps: { dispatch: DispatchResolver } = { dispatch: dispatchByCurrentRule },
): AftersaleEventResult {
  const inSourceSlot = ticket.linkedAftersaleNo === event.asNo;
  const inDerivedSlot = !inSourceSlot && ticket.aftersaleOriginNo === event.asNo;
  if (!inSourceSlot && !inDerivedSlot) return { ticket, outcome: 'unlinked' };

  // 过程态：只刷卡片（两位都一样），不写履历、不改客服单状态
  if (event.type === 'AS_PROGRESS') {
    const status = event.status ?? ticket.linkedAftersaleStatus ?? '处理中';
    return {
      ticket: inSourceSlot
        ? { ...ticket, linkedAftersaleStatus: status }
        : {
            ...ticket,
            aftersaleOriginStatus: status,
            aftersaleOriginClosedAt: isAftersaleSettledStatus(status) ? ticket.aftersaleOriginClosedAt ?? event.at : undefined,
          },
      outcome: 'card-only',
    };
  }

  if (ticket.aftersaleEventIds?.includes(eventKey(event))) return { ticket, outcome: 'duplicate' };

  if (inDerivedSlot) {
    // 派生位（③④）：售后关单只刷卡片，不改客服单状态
    if (event.type === 'AS_CLOSED') {
      return {
        ticket: {
          ...ticket,
          aftersaleOriginStatus: event.status ?? AS_DEFAULT_CLOSED_STATUS,
          aftersaleOriginClosedAt: event.at,
          aftersaleEventIds: markHandled(ticket, event),
        },
        outcome: 'card-only',
      };
    }
    if (event.type === 'AS_RETURNED') return applyReturnedAgain(ticket, event, 'derived');
    // 升级投诉不落已有客服单：由 routeAftersaleEvent 新建投诉单（§4.1）
    return { ticket, outcome: 'unlinked' };
  }

  if (event.type === 'AS_ESCALATE_COMPLAINT') {
    // 来源位一律不动：只把卡片刷成「冻结」（§4.1 / §5.4）
    return { ticket: { ...ticket, linkedAftersaleStatus: AFTERSALE_FROZEN_STATUS }, outcome: 'card-only' };
  }
  if (event.type === 'AS_CLOSED') return applyClosed(ticket, event);
  // 来源位上的回流单（已不在「已转出」）：激活后售后再次转客服，同 §4.5；
  // 「已转出」期间被人工强结 / 关闭的原单：按 §4.5 支二新建咨询单承接（§3.4）
  if (isActiveReflow(ticket) || isSettledTransferOrigin(ticket)) return applyReturnedAgain(ticket, event, 'source');
  return applyReturned(ticket, event, deps.dispatch);
}

/**
 * 来源位上仍可承接「售后再次转客服」的回流单（§4.3 判据第 2 条）：经 §3.3 回流、已不在「已转出」，
 * 且尚未被承接（承接后来源位关联随原单结案转为只读，不再参与 `AS_RETURNED` 路由）。
 */
function isActiveReflow(t: Ticket): boolean {
  return !!t.returnedFromAftersale && t.nodeStatus !== '已转出' && !t.succeededByNo;
}

/** 发起激活的那张客服单是否已落终态（§4.5 支二判据） */
function isOriginSettled(t: Ticket): boolean {
  return isTicketClosed(t.nodeStatus) || t.tab === 'done' || !!t.escalatedToNo;
}

/**
 * 来源位上已离开「已转出」且已结案的转售后原单（§3.4 / §4.3 判据第 3 条）：含回流单结案，
 * 及「已转出」期间被人工强结 / 关闭的原单；投诉单（① 关联售后）不算。尚未被承接。
 */
function isSettledTransferOrigin(t: Ticket): boolean {
  return t.nodeStatus !== '已转出' && !t.succeededByNo && t.type !== '投诉' && isOriginSettled(t);
}

/**
 * 〈n〉的起点（§4.5）：④ 建单那次计 1；② 转出后第一次 `AS_RETURNED` 计 1（未回流过的来源位原单起点为 0）；
 * ③ 升级投诉转入不计
 */
function returnCountBase(t: Ticket): number {
  if (t.aftersaleReturnCount != null) return t.aftersaleReturnCount;
  if (t.aftersaleRelation === 'escalated') return 0;
  if (t.linkedAftersaleNo && !t.returnedFromAftersale) return 0;
  return 1;
}

function returnFacts(e: AftersaleEvent): string {
  return [e.returnReason ? `转回原因：${e.returnReason}` : '', `售后侧操作人：${e.operator}`]
    .filter(Boolean).join(' · ');
}

/**
 * AS_RETURNED · 发起激活的那张客服单（§4.5）：派生位上的单，或来源位上的回流单。
 * 原单未结案 → 落原单（支一，不新建、不改状态与处理人、不通知）；
 * 已结案 → 原样返回 `origin-settled`，由 routeAftersaleEvent 新建咨询单承接（支二）。
 */
function applyReturnedAgain(t: Ticket, e: AftersaleEvent, slot: AftersaleSlot): AftersaleEventResult {
  if (isOriginSettled(t)) return { ticket: t, outcome: 'origin-settled' };
  // n＝该售后单累计转客服次数，含首次转入（§4.5）
  const n = returnCountBase(t) + 1;
  const status = e.status ?? AS_RETURNED_STATUS;
  const card: Partial<Ticket> = slot === 'source'
    ? { linkedAftersaleStatus: status }
    : { aftersaleOriginStatus: status, aftersaleOriginClosedAt: isAftersaleSettledStatus(status) ? e.at : undefined };
  return {
    ticket: {
      ...t,
      ...card,
      aftersaleReturnCount: n,
      eventTimeline: withEntries(t, [{
        category: 'node', action: 'transfer', who: e.operator, role: AFTERSALE_ACTOR_ROLE,
        how: `售后再次转客服（第 ${n} 次）`,
        what: returnFacts(e),
        when: e.at,
      }]),
      aftersaleEventIds: markHandled(t, e),
      updatedAt: e.at,
    },
    outcome: 'returned-again',
  };
}

/** AS_CLOSED · 来源位 */
function applyClosed(t: Ticket, e: AftersaleEvent): AftersaleEventResult {
  const asStatus = e.status ?? AS_DEFAULT_CLOSED_STATUS;
  const waiting = t.nodeStatus === '已转出';
  // §3.2：「售后单已关闭」：售后单号 · 售后处理结果摘要
  const timeline = withEntries(t, [{
    category: 'node', action: 'resolved', who: AFTERSALE_ACTOR, role: AFTERSALE_ACTOR_ROLE,
    how: '售后单已关闭',
    what: [`售后单 ${e.asNo}`, e.resultSummary ?? ''].filter(Boolean).join(' · '),
    when: e.at,
  }]);
  const base: Ticket = {
    ...t,
    linkedAftersaleStatus: asStatus,
    eventTimeline: timeline,
    aftersaleEventIds: markHandled(t, e),
  };
  if (!waiting) return { ticket: base, outcome: 'logged-only' };
  // N2：正常关闭——不走关闭审批、不发客服侧回访；SLA 正常收口（钟走完，有达标结论，不是中止）
  return {
    ticket: {
      ...base,
      nodeStatus: '已关闭',
      closeReason: AFTERSALE_CLOSE_REASON,
      tab: 'done',
      slaText: '—',
      slaSub: AFTERSALE_CLOSE_REASON,
      slaState: 'ok',
      slaMinutes: 9999,
      updatedAt: e.at,
    },
    outcome: 'closed',
  };
}

/** AS_RETURNED · 来源位 */
function applyReturned(t: Ticket, e: AftersaleEvent, dispatch: DispatchResolver): AftersaleEventResult {
  const waiting = t.nodeStatus === '已转出';
  // §3.3：「售后转回客服」：转回原因 · 售后侧操作人
  const returnedEntry: Omit<TimelineEntry, 'id'> = {
    category: 'node', action: 'transfer', who: e.operator, role: AFTERSALE_ACTOR_ROLE,
    how: '售后转回客服',
    what: returnFacts(e),
    when: e.at,
  };
  if (!waiting) {
    return {
      ticket: {
        ...t,
        linkedAftersaleStatus: e.status ?? AS_RETURNED_STATUS,
        eventTimeline: withEntries(t, [returnedEntry]),
        aftersaleEventIds: markHandled(t, e),
      },
      outcome: 'logged-only',
    };
  }
  // N16：清空处理人 → 按现行分派规则重新派单；原处理人只留履历
  const prev = t.assignee;
  const cleared: Ticket = { ...t, assignee: null };
  const to = dispatch(cleared);
  // 《【1025】》§3.3：「回流重新派单（原处理人 〈姓名〉）」：派至 〈处理人〉 或 进入 〈组名〉 工单池 · 未认领
  const dest = to.assignee ? `派至 ${to.assignee}` : `进入 ${to.groupLabel} 工单池 · 未认领`;
  const timeline = withEntries(t, [
    returnedEntry,
    {
      category: 'node', action: 'transfer', who: '系统', role: '系统',
      how: `回流重新派单（原处理人 ${prev ?? '—'}）`,
      what: dest,
      when: e.at,
    },
  ]);
  return {
    ticket: {
      ...cleared,
      groupId: to.groupId,
      assignee: to.assignee,
      // D10：派到人＝直落「处理中」、首响不重计；落池＝「未认领」，被领取 / 指派后再直落处理中
      nodeStatus: to.assignee ? '处理中' : '未认领',
      tab: to.assignee ? 'mine' : 'pool',
      responded: true,
      returnedFromAftersale: true,
      // 〈n〉起点：② 转出后第一次 AS_RETURNED 计第 1 次（§4.5）
      aftersaleReturnCount: 1,
      linkedAftersaleStatus: e.status ?? AS_RETURNED_STATUS,
      eventTimeline: timeline,
      aftersaleEventIds: markHandled(t, e),
      updatedAt: e.at,
    },
    outcome: 'redispatched',
  };
}

/* ---------------- 升级投诉时的关联迁移（基线 ※26 / R11，1025 R1.5-8） ---------------- */

/** 原单侧「关联降级」履历（§5.3，同位内改绑；〈位名〉取客服来源位 / 客服派生位） */
export function aftersaleLinkDemotedEntry(
  input: { asNo: string; toNo: string; who: string; role: TlRole; at: string; slot?: AftersaleSlot },
): Omit<TimelineEntry, 'id'> {
  const slotName = AFTERSALE_SLOT_LABEL[input.slot ?? 'source'];
  return {
    category: 'relate', action: 'relate', who: input.who, role: input.role,
    how: '关联降级',
    what: `售后单 ${input.asNo} 的${slotName}关联已转至工单 ${input.toNo}`,
    when: input.at,
  };
}

/** 新单侧「关联接入」履历（§5.3） */
export function aftersaleLinkJoinedEntry(
  input: { asNo: string; fromNo: string; who: string; role: TlRole; at: string; slot?: AftersaleSlot },
): Omit<TimelineEntry, 'id'> {
  const slotName = AFTERSALE_SLOT_LABEL[input.slot ?? 'source'];
  return {
    category: 'relate', action: 'relate', who: input.who, role: input.role,
    how: '关联接入',
    what: `接下售后单 ${input.asNo} 的${slotName}关联（原关联工单 ${input.fromNo}）`,
    when: input.at,
  };
}

/** 本单占着的那一位（来源位优先：客服单侧 1:1，两者不会同时有值） */
export function aftersaleSlotOf(t: Pick<Ticket, 'linkedAftersaleNo' | 'aftersaleOriginNo'>): AftersaleSlot | null {
  if (t.linkedAftersaleNo) return 'source';
  if (t.aftersaleOriginNo) return 'derived';
  return null;
}

/**
 * 客服⇄售后链路上的单：1025 种子单（id 以 `as-` 起头）、占着关联位、售后转回 / 承接，
 * 或关联已降级迁走只剩售后履历（条目 id 以 `as-` 起头）。
 * 处理页的履历、「最新处理」、关联单 Tab 只取本单自己的数据，不沿用类型样例。
 */
export function isAftersaleChainTicket(t: Ticket | undefined): t is Ticket {
  return !!t && !!(t.id.startsWith('as-') || t.linkedAftersaleNo || t.aftersaleOriginNo || t.returnedFromAftersale
    || t.succeedsFromNo || t.succeededByNo || (t.eventTimeline ?? []).some((e) => e.id.startsWith('as-')));
}

/** 解除本单在派生位上的关联（降级 / 承接后旧单只留履历） */
function clearDerivedLink(t: Ticket): Ticket {
  return {
    ...t,
    aftersaleOriginNo: undefined,
    aftersaleRelation: undefined,
    aftersaleOriginTitle: undefined,
    aftersaleOriginStatus: undefined,
    aftersaleOriginServiceType: undefined,
    aftersaleOriginClosedAt: undefined,
  };
}

/**
 * 升级投诉时把本单占的那一位关联迁到新投诉单（基线 ※26，§5.3）：原单解除关联、写「关联降级」；
 * 新单接上同一位、写「关联接入」。来源位（①②）与派生位（④，口径定稿 6b）都走这里，〈位名〉随位取。
 * 不做历史关联分组（Q5），旧关联只留履历。原单没有关联时原样返回、`to` 为空。
 */
export function migrateAftersaleLink(
  from: Ticket,
  toNo: string,
  ctx: { who: string; role: TlRole; at: string },
): { from: Ticket; to: Partial<Ticket> } {
  const slot = aftersaleSlotOf(from);
  if (!slot) return { from, to: {} };
  const asNo = (slot === 'source' ? from.linkedAftersaleNo : from.aftersaleOriginNo)!;
  const demotedId = `as-${from.no}-demoted-${asNo}`;
  const already = from.eventTimeline?.some((e) => e.id === demotedId);
  const timeline = already
    ? from.eventTimeline
    : [...(from.eventTimeline ?? []), { id: demotedId, ...aftersaleLinkDemotedEntry({ asNo, toNo, slot, ...ctx }) }];
  const joined = [{
    id: `as-${toNo}-joined-${asNo}`,
    ...aftersaleLinkJoinedEntry({ asNo, fromNo: from.no, slot, ...ctx }),
  }];
  if (slot === 'derived') {
    return {
      from: { ...clearDerivedLink(from), eventTimeline: timeline },
      to: {
        aftersaleOriginNo: asNo,
        // 关系类型随单保留：④ 咨询单升级投诉后，投诉新单的派生位关联仍是「转咨询转入」（口径定稿 6d）
        aftersaleRelation: from.aftersaleRelation ?? (from.type === '投诉' ? 'escalated' : 'converted'),
        aftersaleOriginTitle: from.aftersaleOriginTitle,
        aftersaleOriginStatus: from.aftersaleOriginStatus,
        aftersaleOriginServiceType: from.aftersaleOriginServiceType,
        aftersaleOriginClosedAt: from.aftersaleOriginClosedAt,
        eventTimeline: joined,
      },
    };
  }
  return {
    from: { ...from, linkedAftersaleNo: undefined, eventTimeline: timeline },
    to: {
      linkedAftersaleNo: asNo,
      linkedAftersaleStatus: from.linkedAftersaleStatus,
      linkedAftersaleServiceType: from.linkedAftersaleServiceType,
      eventTimeline: joined,
    },
  };
}

/* ---------------- 售后发起：③ 升级投诉转入 / ④ 转咨询转入（§4.1 / §4.3 / §4.5） ---------------- */

export interface AftersaleRouteResult {
  /** 入参各行处理后的结果（顺序、长度与入参一致） */
  rows: Ticket[];
  /** 本次新建的客服单（③ 投诉 / ④ 咨询） */
  created?: Ticket;
  outcome: AftersaleEventOutcome;
}

/** 按 `AS_RETURNED` / `AS_ESCALATE_COMPLAINT` 新建客服单：来源「售后转入」、未认领、挂客服派生位 */
function buildInboundTicket(
  e: AftersaleEvent,
  type: TicketType,
  entries: Omit<TimelineEntry, 'id'>[],
  dispatch: DispatchResolver,
): Ticket {
  const s = e.inbound;
  if (!s) throw new Error(`[aftersaleEvents] ${e.type} 缺少新单信息（inbound）`);
  const draft: Ticket = {
    id: s.id, no: s.no, type, channel: s.channel ?? '电话',
    title: s.title, smartMarks: [], customer: s.customer, vip: false, product: s.product,
    customerPhone: s.customerPhone, sn: s.sn, productCategory: s.productCategory,
    problemDesc: s.problemDesc,
    ticketSource: AFTERSALE_INBOUND_SOURCE,
    ...(type === '投诉' ? { complaintType: '投诉' } : {}),
    nodeStatus: '未认领', nodeStep: 1, nodeTotal: 5, priority: s.priority ?? 'P2',
    slaText: '04:00:00', slaSub: '充足', slaState: 'ok', slaMinutes: 240,
    assignee: null, tab: 'pool', groupId: s.groupId,
    aftersaleOriginNo: e.asNo,
    // 关系类型（口径定稿 6d）：③ 升级投诉转入 / ④ 转咨询转入
    aftersaleRelation: type === '投诉' ? 'escalated' : 'converted',
    aftersaleOriginTitle: s.asTitle,
    aftersaleOriginServiceType: s.asServiceType,
    createdAt: e.at, updatedAt: e.at, responded: false,
  };
  // ③ 按投诉现行分派规则、④ 系统派单进客服工单池：落池「未认领」（N5-c）
  const to = dispatch(draft);
  const t: Ticket = { ...draft, groupId: to.groupId };
  return {
    ...t,
    eventTimeline: entries.map((p, i) => ({ id: `as-${s.no}-${i + 1}`, ...p })),
    aftersaleEventIds: [eventKey(e)],
  };
}

/**
 * 售后单两位路由（§5.2「事件按关系类型路由」）：入参是挂在该售后单上的客服单（来源位 / 派生位，可空），
 * 返回各行处理结果与可能新建的那张单。三条售后侧事件与种子数据都走这里。
 * - `AS_RETURNED`（§4.3，命中即止）：来源位有「已转出」原单 → 回流（§3.3）；来源位有回流单或已结案的转售后原单
 *   （含「已转出」期间被人工强结，§3.4）、否则派生位有单 →
 *   未结案落原单（§4.5 支一），已结案新建咨询单并建「承接」（§4.5 支二）；两位都空 → 新建咨询单（§4.3）；
 * - `AS_ESCALATE_COMPLAINT`：新建投诉单挂派生位（§4.1），派生位已占 → 同位降级（§5.3）；来源位不动、卡片置「冻结」；
 * - `AS_PROGRESS` / `AS_CLOSED`：两位各自落（§3.2 / §3.4）。
 */
export function routeAftersaleEvent(
  rows: Ticket[],
  e: AftersaleEvent,
  deps: { dispatch: DispatchResolver } = { dispatch: dispatchByCurrentRule },
): AftersaleRouteResult {
  const out = [...rows];
  const srcIdx = out.findIndex((t) => t.linkedAftersaleNo === e.asNo);
  const derIdx = out.findIndex((t) => t.aftersaleOriginNo === e.asNo);
  const src = srcIdx >= 0 ? out[srcIdx] : undefined;
  const der = derIdx >= 0 ? out[derIdx] : undefined;

  if (e.type === 'AS_PROGRESS' || e.type === 'AS_CLOSED') {
    let outcome: AftersaleEventOutcome = 'card-only';
    if (der) out[derIdx] = applyAftersaleEvent(der, e, deps).ticket;
    if (src) {
      const r = applyAftersaleEvent(src, e, deps);
      out[srcIdx] = r.ticket;
      outcome = r.outcome;
    }
    return { rows: out, outcome };
  }

  if (e.type === 'AS_ESCALATE_COMPLAINT') {
    const entries: Omit<TimelineEntry, 'id'>[] = [{
      category: 'node', action: 'create', who: e.operator, role: AFTERSALE_ACTOR_ROLE,
      how: '售后升级投诉转入',
      what: [`售后单 ${e.asNo}`, e.escalateReason ? `升级原因：${e.escalateReason}` : '', `售后侧操作人：${e.operator}`]
        .filter(Boolean).join(' · '),
      when: e.at,
    }];
    if (der) {
      entries.push(aftersaleLinkJoinedEntry({
        asNo: e.asNo, fromNo: der.no, who: AFTERSALE_ACTOR, role: AFTERSALE_ACTOR_ROLE, at: e.at, slot: 'derived',
      }));
      out[derIdx] = {
        ...clearDerivedLink(der),
        eventTimeline: withEntries(der, [aftersaleLinkDemotedEntry({
          asNo: e.asNo, toNo: e.inbound?.no ?? '', who: AFTERSALE_ACTOR, role: AFTERSALE_ACTOR_ROLE, at: e.at, slot: 'derived',
        })]),
      };
    }
    const created = buildInboundTicket(e, '投诉', entries, deps.dispatch);
    created.aftersaleOriginStatus = AFTERSALE_FROZEN_STATUS;
    if (src) out[srcIdx] = applyAftersaleEvent(src, e, deps).ticket;
    return { rows: out, created, outcome: 'created' };
  }

  // AS_RETURNED
  if (src && src.nodeStatus === '已转出') {
    const r = applyAftersaleEvent(src, e, deps);
    out[srcIdx] = r.ticket;
    return { rows: out, outcome: r.outcome };
  }
  // 发起激活的那张客服单（§4.5）：先看来源位上的回流单，再看派生位上的单
  const origin = src && (isActiveReflow(src) || isSettledTransferOrigin(src))
    ? { idx: srcIdx, t: src, slot: 'source' as const }
    : der ? { idx: derIdx, t: der, slot: 'derived' as const } : undefined;
  if (origin) {
    const r = applyAftersaleEvent(origin.t, e, deps);
    if (r.outcome !== 'origin-settled') {
      out[origin.idx] = r.ticket;
      return { rows: out, outcome: r.outcome };
    }
    // 支二：新建咨询单挂派生位、承接已结案原单。派生位原单的关联随之解除；来源位回流单的关联随原单结案转为只读。
    // 两条承接履历留痕，不另写「关联降级」
    const prior = origin.t;
    const newNo = e.inbound?.no ?? '';
    const created = buildInboundTicket(e, '咨询', [{
      category: 'relate', action: 'relate', who: e.operator, role: AFTERSALE_ACTOR_ROLE,
      how: `承接工单 ${prior.no}（售后再次转客服）`,
      what: `售后单 ${e.asNo} · ${returnFacts(e)}`,
      when: e.at,
    }], deps.dispatch);
    created.aftersaleOriginStatus = e.status ?? AS_RETURNED_STATUS;
    if (isAftersaleSettledStatus(created.aftersaleOriginStatus)) created.aftersaleOriginClosedAt = e.at;
    created.aftersaleReturnCount = returnCountBase(prior) + 1;
    created.succeedsFromNo = prior.no;
    out[origin.idx] = {
      // 来源位原单：关联转只读保留，售后卡片照常刷成最新状态（§3.4）
      ...(origin.slot === 'derived' ? clearDerivedLink(prior) : { ...prior, linkedAftersaleStatus: e.status ?? AS_RETURNED_STATUS }),
      succeededByNo: newNo,
      eventTimeline: withEntries(prior, [{
        category: 'relate', action: 'relate', who: AFTERSALE_ACTOR, role: AFTERSALE_ACTOR_ROLE,
        how: `本单已结案，售后再次转客服已承接至 ${newNo}`,
        what: `售后单 ${e.asNo} · ${returnFacts(e)}`,
        when: e.at,
      }]),
    };
    return { rows: out, created, outcome: 'succeeded' };
  }
  // 两位都空（来源位上没有「已转出」原单、也没有回流单）：新建咨询单挂派生位（§4.3），来源位一律不动
  const overComplaint = src?.type === '投诉';
  const created = buildInboundTicket(e, '咨询', [{
    category: 'node', action: 'create', who: e.operator, role: AFTERSALE_ACTOR_ROLE,
    how: '售后转入建单',
    what: [`来源售后单 ${e.asNo}`, returnFacts(e), overComplaint ? '售后侧越过投诉关联限制转出' : '']
      .filter(Boolean).join(' · '),
    when: e.at,
  }], deps.dispatch);
  created.aftersaleOriginStatus = e.status ?? AS_RETURNED_STATUS;
  created.aftersaleReturnCount = 1;
  if (isAftersaleSettledStatus(created.aftersaleOriginStatus)) created.aftersaleOriginClosedAt = e.at;
  return { rows: out, created, outcome: 'created' };
}

const SETTLED = ['已完成', '已关闭', '已取消'];
function isAftersaleSettledStatus(s: string): boolean {
  return SETTLED.includes(s);
}

/* ---------------- 回传处理结果（③，§4.2） ---------------- */

/** 回传处理结果入参 */
export interface AftersaleResultInput {
  conclusion: string;
  note: string;
  who: string;
  role: TlRole;
  at: string;
  /** 首次回传解冻后，售后侧返回的售后单状态（解冻后状态由售后侧定） */
  unfrozenStatus?: string;
}

/**
 * 回传处理结果落客服单：本单状态、处理人都不变；第一次回传使售后单解冻（卡片取售后侧返回状态），
 * 第二次起标「补充回传」、不再解冻。返回更新后的工单行与那条履历。
 */
export function applyAftersaleResult(
  t: Ticket,
  input: AftersaleResultInput,
): { ticket: Ticket; entry: Omit<TimelineEntry, 'id'>; first: boolean } {
  const first = (t.aftersaleResultCount ?? 0) === 0;
  const entry: Omit<TimelineEntry, 'id'> = {
    category: 'handle', action: 'handle', who: input.who, role: input.role,
    how: '回传处理结果',
    what: `${input.conclusion} · ${input.note.trim()} · ${first ? '首次回传 · 已解冻' : '补充回传'}`,
    when: input.at,
  };
  return {
    ticket: {
      ...t,
      aftersaleResultCount: (t.aftersaleResultCount ?? 0) + 1,
      aftersaleOriginStatus: first ? (input.unfrozenStatus ?? '处理中') : t.aftersaleOriginStatus,
      eventTimeline: withEntries(t, [entry]),
      updatedAt: input.at,
    },
    entry,
    first,
  };
}

/**
 * 回流单被领取 / 被指派（D10）：**直落「处理中」、首响不重计**。
 * 只对 `returnedFromAftersale` 且仍「未认领」的单生效；其余单返回 null，由调用方走原领取 / 指派流转。
 */
export function takeOverReturnedTicket(
  t: Ticket,
  input: { assignee: string; how: '领取' | '指派'; operator: string; operatorRole: TlRole; at: string },
): Ticket | null {
  if (!t.returnedFromAftersale || t.nodeStatus !== '未认领') return null;
  const what = input.how === '领取'
    ? `${input.assignee} 从池中领取本单。`
    : `${input.operator} 指派本单给 ${input.assignee}。`;
  return {
    ...t,
    assignee: input.assignee,
    nodeStatus: '处理中',
    tab: 'mine',
    responded: true,
    eventTimeline: withEntries(t, [{
      category: 'node', action: 'accept', who: input.operator, role: input.operatorRole,
      how: input.how, what, when: input.at,
    }]),
    updatedAt: input.at,
  };
}
