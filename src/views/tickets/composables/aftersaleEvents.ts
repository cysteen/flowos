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
import { POOL_GROUPS, type Ticket } from '@/views/tickets/types/ticket';
import type { TimelineEntry, TlRole } from '@/views/tickets/types/ticketDetail';

export type AftersaleEventType = 'AS_CLOSED' | 'AS_RETURNED' | 'AS_PROGRESS';

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
  /** 派生位（③④）上的回流：属第二段，此处只留分支入口 */
  | 'derived-slot-pending'
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
 * 原单已不在「已转出」（如已被别的回传唤醒、或是投诉单①）时只写履历、不改状态。
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
        : { ...ticket, aftersaleOriginStatus: status },
      outcome: 'card-only',
    };
  }

  if (ticket.aftersaleEventIds?.includes(eventKey(event))) return { ticket, outcome: 'duplicate' };

  if (inDerivedSlot) {
    // 派生位（③④）：本段只处理卡片刷新
    if (event.type === 'AS_CLOSED') {
      return {
        ticket: {
          ...ticket,
          aftersaleOriginStatus: event.status ?? AS_DEFAULT_CLOSED_STATUS,
          aftersaleEventIds: markHandled(ticket, event),
        },
        outcome: 'card-only',
      };
    }
    // TODO(1025 第二段 · ④)：来源位没有等待原单、售后转咨询 —— 新建咨询单 / 落派生位原单（D11 两支）。
    return { ticket, outcome: 'derived-slot-pending' };
  }

  return event.type === 'AS_CLOSED'
    ? applyClosed(ticket, event)
    : applyReturned(ticket, event, deps.dispatch);
}

/** AS_CLOSED · 来源位 */
function applyClosed(t: Ticket, e: AftersaleEvent): AftersaleEventResult {
  const asStatus = e.status ?? AS_DEFAULT_CLOSED_STATUS;
  const summary = e.resultSummary ? `售后处理结果：${e.resultSummary}` : '';
  const waiting = t.nodeStatus === '已转出';
  const timeline = withEntries(t, [{
    category: 'node', action: 'resolved', who: AFTERSALE_ACTOR, role: AFTERSALE_ACTOR_ROLE,
    how: '售后单已关闭',
    what: waiting
      ? `售后单 ${e.asNo} 已关闭（售后侧操作人：${e.operator}），本单随之关闭，关闭原因：${AFTERSALE_CLOSE_REASON}。${summary}`
      : `售后单 ${e.asNo} 已关闭（售后侧操作人：${e.operator}）。${summary}`,
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
  const reason = e.returnReason ? `转回原因：${e.returnReason}` : '';
  const returnedEntry: Omit<TimelineEntry, 'id'> = {
    category: 'node', action: 'transfer', who: e.operator, role: AFTERSALE_ACTOR_ROLE,
    how: '售后转回客服',
    what: `售后单 ${e.asNo} 转回客服（售后侧操作人：${e.operator}）。${reason}`,
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
  const dest = to.assignee ? `${to.groupLabel} · ${to.assignee}` : to.groupLabel;
  const timeline = withEntries(t, [
    returnedEntry,
    {
      category: 'node', action: 'transfer', who: '系统', role: '系统',
      how: '重新派单',
      what: `重新派单至 ${dest}（原处理人 ${prev ?? '—'}）`,
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
      linkedAftersaleStatus: e.status ?? AS_RETURNED_STATUS,
      eventTimeline: timeline,
      aftersaleEventIds: markHandled(t, e),
      updatedAt: e.at,
    },
    outcome: 'redispatched',
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
