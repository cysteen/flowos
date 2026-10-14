import { defineStore } from 'pinia';
import { reactive, ref, toRaw } from 'vue';
import type { Channel, Priority, Ticket } from '@/views/tickets/types/ticket';
import type { FeishuRecord } from '@/mock/ticketDetail';
import type { TimelineEntry } from '@/views/tickets/types/ticketDetail';
import { TICKETS } from '@/mock/tickets';
import { XIAOZHI_SEEDS } from '@/mock/xiaozhi/seedTickets';
import { makeTicketNo } from '@/constants/ticketNo';
import { ESCALATE_CHANNEL_TPD } from '@/views/tickets/composables/opActions';
import {
  XIAOZHI_BUSINESS_TYPE, XIAOZHI_NOTICE, XIAOZHI_POOL_GROUP_ID, XIAOZHI_POOL_GROUP_NAME,
  XIAOZHI_SLA_IDLE, XIAOZHI_SYSTEM_HANDLER, XIAOZHI_TICKET_SOURCE, XIAOZHI_TICKET_TYPE, XIAOZHI_TL,
  isXiaozhiTicket, xiaozhiRdTitle, xiaozhiReceiverOf,
  type TicketXiaozhi, type XiaozhiDemandResult, type XiaozhiIssueResult,
  type XiaozhiRdInfo, type XiaozhiRdPriority, type XiaozhiSolutionType,
} from '@/views/tickets/types/xiaozhi';
import { XIAOZHI_LS_KEYS, readXiaozhiCache, writeXiaozhiCache } from './xiaozhiCache';
import { useNotifyLogStore } from './notifyLog';

/**
 * 小智工单 · 小智服务（1130 小智工单 D1 / D5–D14 / D21 / D24 / D27）。
 *
 * 【数据源】小智单与其他工单同在工单库 `TICKETS`（`mock/tickets.ts`）：列表、处理页、
 * 查询中心都读它。本服务**只改那一份对象**，经 `reactive(对象)` 写入，已打开的列表会随之刷新；
 * 新建的小智单也追加进 `TICKETS`。不另起工单列表。
 *
 * 【复用】小智单＝咨询单 + 「小智工单」标识（D1），处理页、处理表单、动作集一律沿用通用咨询单（D27），
 * 本服务只管「建单 → 落池 / 自动流转产研 → 回传收口」这条小智专属链路。
 *
 * 【产研反馈】复用处理页「产研反馈」Tab（`tabs/OpFeishuTab.vue`）的那一套记录结构，
 * 推产研走已有的 TPD 通道（`ESCALATE_CHANNEL_TPD`），不新增通道。
 *
 * 【持久化】小智单快照与小智履历落 `XIAOZHI_LS_KEYS`（保质期 + 版本闸，见 `stores/xiaozhiCache.ts`）。
 */

/* ------------------------------------------------------------------ */
/* 对外类型                                                             */
/* ------------------------------------------------------------------ */

/** 建单入参（小智专属要素；通用字段走 `XiaozhiTicketBase`） */
export interface XiaozhiCreateInput {
  /** 问题类别（必填，W1） */
  problemCategory: string;
  /** 产品模块（走产研必填，W2） */
  rdModule: string;
  /** 产研优先级 */
  rdPriority: XiaozhiRdPriority;
  /** 一线人员域账号（选填） */
  frontlineAccount: string;
  /** 附件（文件名，选填） */
  attachments: string[];
}

/** 建单时的工单公共字段（取通用咨询单表单，D27） */
export interface XiaozhiTicketBase {
  customer: string;
  customerPhone?: string;
  vip?: boolean;
  priority?: Priority;
  title: string;
  problemDesc?: string;
  productCategory: string;
  productName: string;
  deviceSn?: string;
  problemL1: string;
  problemL2: string;
  problemL3: string;
}

/** 建单人（履历落款） */
export interface XiaozhiActor {
  name: string;
  role: TimelineEntry['role'];
}

/** 建单必填缺项 */
export interface XiaozhiCreateBlocked {
  kind: 'blocked';
  /** 缺哪几项（字段键） */
  missing: ('problemCategory' | 'rdModule')[];
}

export interface XiaozhiCreateOk {
  kind: 'create';
  ticket: Ticket;
}

/** 办结回传入参（W8：问题类 / 需求类两套） */
export interface XiaozhiSettlePayload {
  solutionType: XiaozhiSolutionType;
  issue?: XiaozhiIssueResult;
  demand?: XiaozhiDemandResult;
}

interface TicketsCache { tickets: Ticket[] }
interface TimelineCache { timelines: Record<string, TimelineEntry[]>; seq: number }

const pad = (n: number) => String(n).padStart(2, '0');

/** `YYYY-MM-DD HH:mm:ss` */
export function xiaozhiStamp(d: Date | number = new Date()): string {
  const x = typeof d === 'number' ? new Date(d) : d;
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())} ${pad(x.getHours())}:${pad(x.getMinutes())}:${pad(x.getSeconds())}`;
}

/** `YYYY-MM-DD HH:mm` */
export function xiaozhiMinuteStamp(d: Date | number = new Date()): string {
  return xiaozhiStamp(d).slice(0, 16);
}

export const useXiaozhiStore = defineStore('xiaozhi', () => {
  /** 工单号 → 小智履历（时间正序） */
  const timelines = ref<Record<string, TimelineEntry[]>>({});
  /** 工单号 → 变更版本号：处理页据此重读本单 */
  const revisions = ref<Record<string, number>>({});
  let tlSeq = 0;
  let rdSeq = 0;
  let hydrated = false;

  /* ---------------- 读 ---------------- */

  function rawOf(no: string): Ticket | undefined {
    return TICKETS.find((t) => t.no === no);
  }

  /** 工单库里的小智单（响应式代理，写入会刷新已打开的列表） */
  function rowOf(no: string): Ticket | undefined {
    const t = rawOf(no);
    return t && isXiaozhiTicket(t) && t.xiaozhi ? reactive(t) : undefined;
  }

  function xiaozhiOf(no: string): TicketXiaozhi | undefined {
    return rowOf(no)?.xiaozhi;
  }

  function timelineOf(no: string): TimelineEntry[] {
    return timelines.value[no] ?? [];
  }

  function revisionOf(no: string): number {
    return revisions.value[no] ?? 0;
  }

  /* ---------------- 写：公共 ---------------- */

  function bump(no: string) {
    revisions.value = { ...revisions.value, [no]: revisionOf(no) + 1 };
  }

  function persist() {
    const tickets = TICKETS.filter((t) => isXiaozhiTicket(t) && t.xiaozhi).map((t) => toRaw(t));
    writeXiaozhiCache(XIAOZHI_LS_KEYS.tickets, { tickets } satisfies TicketsCache);
    writeXiaozhiCache(XIAOZHI_LS_KEYS.timeline, { timelines: timelines.value, seq: tlSeq } satisfies TimelineCache);
  }

  function log(no: string, at: number, partial: Omit<TimelineEntry, 'id' | 'when'>): TimelineEntry {
    tlSeq += 1;
    const entry: TimelineEntry = { id: `xiaozhi-${no}-${tlSeq}`, when: xiaozhiStamp(at), ...partial };
    timelines.value = { ...timelines.value, [no]: [...timelineOf(no), entry] };
    return entry;
  }

  function pushRdRecord(r: Ticket, rec: Omit<FeishuRecord, 'id'>) {
    rdSeq += 1;
    const list = r.xiaozhi?.rdRecords ?? [];
    r.xiaozhi!.rdRecords = [...list, { id: `xz-rd-${r.no}-${rdSeq}`, ...rec }];
  }

  function notify(r: Ticket, kind: 'group' | 'upgrade' | 'return' | 'accepted', title: string, content: string, receivers: (string | null | undefined)[]) {
    useNotifyLogStore().emit({
      ticketNo: r.no, event: `ticket.xiaozhi.${kind}`, kind, title, receivers, content,
    });
  }

  /* ---------------- 种子与缓存装载 ---------------- */

  /**
   * 恢复小智履历与工单快照。种子单本身已随 `XIAOZHI_SEEDS.tickets` 并入工单库
   * （`mock/tickets.ts` 的 `TICKETS`），这里只负责履历与「演示中改过的状态」。
   * 幂等：一个会话只跑一次。
   */
  function hydrate() {
    if (hydrated) return;
    hydrated = true;
    const cachedTickets = readXiaozhiCache<TicketsCache>(XIAOZHI_LS_KEYS.tickets);
    const cachedTl = readXiaozhiCache<TimelineCache>(XIAOZHI_LS_KEYS.timeline);
    if (cachedTickets && cachedTl && Array.isArray(cachedTickets.tickets)) {
      for (const saved of cachedTickets.tickets) {
        const existing = rawOf(saved.no);
        if (existing) Object.assign(existing, saved);
        else TICKETS.push(saved);
      }
      timelines.value = cachedTl.timelines ?? {};
      tlSeq = typeof cachedTl.seq === 'number' ? cachedTl.seq : 0;
    } else {
      timelines.value = JSON.parse(JSON.stringify(XIAOZHI_SEEDS.timelines)) as Record<string, TimelineEntry[]>;
      tlSeq = 0;
    }
  }

  /* ---------------- 建单（D5） ---------------- */

  function nextNo(now: number): string {
    const d = new Date(now);
    // 小智单沿用咨询单号（D1）：与当日咨询单共用一个自增号段
    const probe = makeTicketNo(XIAOZHI_TICKET_TYPE, 1, d).slice(0, -5);
    const max = TICKETS
      .filter((t) => t.no.startsWith(probe))
      .reduce((m, t) => Math.max(m, Number(t.no.slice(-5)) || 0), 0);
    return makeTicketNo(XIAOZHI_TICKET_TYPE, max + 1, d);
  }

  /** 建单必填校验：问题类别（W1）；走产研的还要产品模块（W2） */
  function evaluateCreate(input: XiaozhiCreateInput, escalate: boolean): XiaozhiCreateBlocked | { kind: 'create' } {
    const missing: ('problemCategory' | 'rdModule')[] = [];
    if (!input.problemCategory?.trim()) missing.push('problemCategory');
    if (escalate && !input.rdModule?.trim()) missing.push('rdModule');
    return missing.length ? { kind: 'blocked', missing } : { kind: 'create' };
  }

  function buildRdInfo(input: XiaozhiCreateInput): XiaozhiRdInfo {
    return {
      module: input.rdModule,
      receiver: xiaozhiReceiverOf(input.rdModule),
      priority: input.rdPriority,
      frontlineAccount: input.frontlineAccount.trim(),
      attachments: [...input.attachments],
    };
  }

  /**
   * 建小智工单。两条路径（D5）：
   * - `escalate=false`：落工单池，由小智团队领单处理结案；
   * - `escalate=true`：**落工单池留记录后，由系统自动流转推产研**（D6），本单置「已升级产研」、
   *   **处理人不转移**。
   */
  function createXiaozhiTicket(
    input: XiaozhiCreateInput,
    base: XiaozhiTicketBase,
    actor: XiaozhiActor,
    escalate: boolean,
  ): XiaozhiCreateBlocked | XiaozhiCreateOk {
    const evaluation = evaluateCreate(input, escalate);
    if (evaluation.kind === 'blocked') return evaluation;
    const now = Date.now();
    const no = nextNo(now);
    const xiaozhi: TicketXiaozhi = {
      problemCategory: input.problemCategory.trim(),
      rdSync: 'none',
      rdRecords: [],
      rdResubmitCount: 0,
    };
    const raw: Ticket = {
      id: `xiaozhi-${no}`,
      no,
      // 小智工单＝咨询单 + 不可改的「小智工单」标识（D1）
      type: XIAOZHI_TICKET_TYPE,
      isXiaozhi: true,
      // 来源渠道统一记 IM（D24）；列表「渠道」列对应「在线客服」
      channel: '在线客服' as Channel,
      ticketSource: XIAOZHI_TICKET_SOURCE,
      title: base.title.trim(),
      smartMarks: [],
      customer: base.customer,
      vip: base.vip ?? false,
      customerPhone: base.customerPhone,
      sn: base.deviceSn,
      product: base.productName,
      productCategory: base.productCategory,
      problemL1: base.problemL1,
      problemL2: base.problemL2,
      problemL3: base.problemL3,
      businessType: XIAOZHI_BUSINESS_TYPE,
      // 分派＝一个大组、进池自己领（D21）
      groupId: XIAOZHI_POOL_GROUP_ID,
      groupNames: [XIAOZHI_POOL_GROUP_NAME],
      nodeStatus: '未认领',
      nodeStep: 1,
      nodeTotal: 5,
      priority: base.priority ?? 'P2',
      // 小智工单不纳入 SLA 考核（一·补 B1）：列表 SLA 列恒为空闲态
      ...XIAOZHI_SLA_IDLE,
      assignee: null,
      tab: 'mine',
      responded: false,
      createdAt: xiaozhiMinuteStamp(now),
      updatedAt: xiaozhiMinuteStamp(now),
      problemDesc: base.problemDesc,
      xiaozhi,
    };
    TICKETS.push(raw);
    const r = reactive(raw);
    log(no, now, {
      category: 'node', action: 'create', who: actor.name, role: actor.role,
      how: '建单', what: XIAOZHI_TL.create(XIAOZHI_TICKET_SOURCE),
    });
    notify(r, 'group', '新单待领取', XIAOZHI_NOTICE.pooled(no), [XIAOZHI_POOL_GROUP_NAME]);
    // 「创建并流转」：落池生成记录后由系统自动流转，不靠人领、不靠定时任务扫（D6）
    if (escalate) {
      r.xiaozhi!.rd = buildRdInfo(input);
      escalateToRd(no, { name: '系统', role: '系统' }, true);
    } else {
      bump(no);
      persist();
    }
    return { kind: 'create', ticket: r };
  }

  /* ---------------- 推产研（D6 / D8） ---------------- */

  function rdFeedbackNo(): string {
    const d = new Date();
    return `TPD-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${String(Math.floor(Date.now() % 9000) + 1000)}`;
  }

  /**
   * 推产研。`auto=true` 是建单后的系统自动流转（D6）；`auto=false` 是人工跟进后再转产研。
   * 两者都置「已升级产研」、**处理人不转移**（D6），回传后一律自动关单（D11）。
   *
   * 🔴 **系统自动流转那一支的处理人 ＝「系统」**（一·补 B2，修订 D10 原写的「系统或建单人」）：
   * 工单池里留的是**记录**不是待领任务，**不经领取**就直接到「已升级产研」——
   * 落成建单人的话，池子里那条记录会变成一个谁都能领、领了也无事可做的待领任务。
   * 人工跟进后再转产研的那一支处理人照旧是跟进人，不被改写。
   */
  function escalateToRd(no: string, actor: XiaozhiActor, auto = false): boolean {
    const r = rowOf(no);
    if (!r?.xiaozhi) return false;
    const now = Date.now();
    if (!r.xiaozhi.rd) return false;
    const rdTitle = xiaozhiRdTitle(r.xiaozhi.rd.module);
    r.xiaozhi.rdSync = 'synced';
    r.xiaozhi.rdFeedbackNo = r.xiaozhi.rdFeedbackNo ?? rdFeedbackNo();
    r.nodeStatus = '已升级产研';
    if (auto) r.assignee = XIAOZHI_SYSTEM_HANDLER;
    r.updatedAt = xiaozhiMinuteStamp(now);
    pushRdRecord(r, {
      kind: 'push',
      title: `已推送${ESCALATE_CHANNEL_TPD}`,
      content: `产研单标题：${rdTitle}；产品模块：${r.xiaozhi.rd.module}；接收人：${r.xiaozhi.rd.receiver}；优先级：${r.xiaozhi.rd.priority}`,
      who: actor.name,
      side: '客服工单',
      when: xiaozhiStamp(now),
      meta: r.xiaozhi.rdFeedbackNo,
    });
    log(no, now, {
      category: 'node', action: 'escalate', who: actor.name, role: actor.role,
      systemActor: auto,
      how: auto ? '系统自动流转' : '升级',
      what: XIAOZHI_TL.autoEscalate(ESCALATE_CHANNEL_TPD, rdTitle),
    });
    bump(no);
    persist();
    return true;
  }

  /** 二次提交产研（D8：驳回后允许再提交） */
  function resubmitToRd(no: string, actor: XiaozhiActor): boolean {
    const r = rowOf(no);
    if (!r?.xiaozhi || r.xiaozhi.rdSync !== 'rejected') return false;
    const now = Date.now();
    r.xiaozhi.rdSync = 'synced';
    r.xiaozhi.rdRejected = false;
    r.xiaozhi.rdResubmitCount = (r.xiaozhi.rdResubmitCount ?? 0) + 1;
    r.nodeStatus = '已升级产研';
    r.updatedAt = xiaozhiMinuteStamp(now);
    pushRdRecord(r, {
      kind: 'resubmit',
      title: `二次提交${ESCALATE_CHANNEL_TPD}`,
      content: `第 ${r.xiaozhi.rdResubmitCount} 次提交产研`,
      who: actor.name,
      side: '客服工单',
      when: xiaozhiStamp(now),
      meta: r.xiaozhi.rdFeedbackNo,
    });
    log(no, now, {
      category: 'node', action: 'escalate', who: actor.name, role: actor.role,
      how: '升级', what: XIAOZHI_TL.resubmit(ESCALATE_CHANNEL_TPD),
    });
    bump(no);
    persist();
    return true;
  }

  /* ---------------- 回传（D7 / D8 / D9 / D10 / D11） ---------------- */

  /**
   * 产研「处理中」等中间态回传：**只写处理履历留痕，不驱动本单状态**（D7）。
   */
  function receiveRdProgress(no: string, who: string, note: string): boolean {
    const r = rowOf(no);
    if (!r?.xiaozhi) return false;
    const now = Date.now();
    pushRdRecord(r, {
      kind: 'feedback',
      title: '产研处理中',
      content: note || '产研已接手，正在处理',
      who,
      side: '产研侧',
      when: xiaozhiStamp(now),
      meta: r.xiaozhi.rdFeedbackNo,
    });
    log(no, now, {
      category: 'node', action: 'relate', who: '系统', role: '系统', systemActor: true,
      how: '产研回传', what: XIAOZHI_TL.rdProgress(who, note),
    });
    bump(no);
    persist();
    return true;
  }

  /**
   * 产研「驳回」回传：本单落**驳回标记**，允许二次提交产研（D8）。
   * ⚠️ 不是「关联失败」—— 关联失败（`failed`）是推单没推成，要重推；驳回是推成了被退回。
   */
  function receiveRdReject(no: string, who: string, reason: string): boolean {
    const r = rowOf(no);
    if (!r?.xiaozhi) return false;
    const now = Date.now();
    r.xiaozhi.rdSync = 'rejected';
    r.xiaozhi.rdRejected = true;
    r.updatedAt = xiaozhiMinuteStamp(now);
    pushRdRecord(r, {
      kind: 'reject',
      title: '产研驳回',
      content: reason || '产研已驳回本单',
      who,
      side: '产研侧',
      when: xiaozhiStamp(now),
      meta: r.xiaozhi.rdFeedbackNo,
      cause: reason,
    });
    log(no, now, {
      category: 'node', action: 'relate', who: '系统', role: '系统', systemActor: true,
      how: '产研回传', what: XIAOZHI_TL.rdRejected(reason),
    });
    notify(r, 'return', '产研驳回', XIAOZHI_NOTICE.rdRejected(no), [r.assignee, XIAOZHI_POOL_GROUP_NAME]);
    bump(no);
    persist();
    return true;
  }

  /**
   * 产研「办结」回传：**自动关单 + 自动下送调研**，不论产研解没解决（D9）。
   * 自动关单的单也要有处理人可落（D10）：本单无处理人时落「系统」。
   * 人工跟进后再转产研的那批**一样**直接关单下送（D11）。
   * 调研短信由工单系统发、发给提问人本人（D12 / D14②）；回「未解决」不拉回（D13）。
   */
  function receiveRdSettle(no: string, who: string, payload: XiaozhiSettlePayload): boolean {
    const r = rowOf(no);
    if (!r?.xiaozhi) return false;
    const now = Date.now();
    r.xiaozhi.rdSync = 'closed';
    r.xiaozhi.rdRejected = false;
    r.xiaozhi.rdSolutionType = payload.solutionType;
    if (payload.issue) r.xiaozhi.rdIssueResult = { ...payload.issue };
    if (payload.demand) r.xiaozhi.rdDemandResult = { ...payload.demand };
    r.nodeStatus = '已结案';
    r.tab = 'done';
    // D10 / 一·补 B2：自动关单的单也要有处理人，不能悬空；无人跟进过的落「系统」
    r.assignee = r.assignee ?? XIAOZHI_SYSTEM_HANDLER;
    r.updatedAt = xiaozhiMinuteStamp(now);
    const summary = payload.solutionType === '问题'
      ? payload.issue?.solution ?? ''
      : payload.demand?.solution ?? payload.demand?.evaluation ?? '';
    pushRdRecord(r, {
      kind: 'result',
      title: '产研办结',
      content: summary || '产研已给出最终结果',
      who,
      side: '产研侧',
      when: xiaozhiStamp(now),
      meta: r.xiaozhi.rdFeedbackNo,
      result: summary,
      conclusion: `${payload.solutionType}类办结`,
    });
    log(no, now, {
      category: 'node', action: 'resolved', who: '系统', role: '系统', systemActor: true,
      how: '产研回传', what: XIAOZHI_TL.rdSettled(payload.solutionType),
    });
    // 调研短信由工单系统发（D14②），产研的「解决结果通知」短信由 TPD 自己发，不重复
    log(no, now + 1, {
      category: 'comm', action: 'sms', who: '系统', role: '系统', systemActor: true,
      how: '短信', what: `已向提问人发送满意度调研短信（工单号：${no}）`,
    });
    notify(r, 'accepted', '产研办结', XIAOZHI_NOTICE.rdSettled(no), [r.assignee, XIAOZHI_POOL_GROUP_NAME]);
    bump(no);
    persist();
    return true;
  }

  /** 处理页改了状态后同步回工单库（领取 / 调剂等走通用咨询单流程时用） */
  function syncStatus(no: string, status: string, opts?: { assignee?: string | null }) {
    const r = rowOf(no);
    if (!r) return;
    r.nodeStatus = status as Ticket['nodeStatus'];
    if (opts && 'assignee' in opts) r.assignee = opts.assignee ?? null;
    r.updatedAt = xiaozhiMinuteStamp(Date.now());
    bump(no);
    persist();
  }

  return {
    timelines,
    revisions,
    hydrate,
    rowOf,
    xiaozhiOf,
    timelineOf,
    revisionOf,
    evaluateCreate,
    createXiaozhiTicket,
    escalateToRd,
    resubmitToRd,
    receiveRdProgress,
    receiveRdReject,
    receiveRdSettle,
    syncStatus,
  };
});
