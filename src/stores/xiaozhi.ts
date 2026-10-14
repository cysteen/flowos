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
  XIAOZHI_BUSINESS_TYPE, XIAOZHI_CONFIRM_TIMEOUT_DAYS, XIAOZHI_NOTICE,
  XIAOZHI_POOL_GROUP_ID, XIAOZHI_POOL_GROUP_NAME,
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
 * 本服务只管「建单 → 落池 / 自动流转产研 → 产研办结 → **校代确认** → 关单下送调研」这条小智专属链路。
 *
 * 🔴 **办结不等于关单**（一·补 B5，推翻 D9 / D11）：产研办结只把本单转入「待校代确认」，
 * 校代确认「是」才关单下送调研、确认「否」则系统自动回传产研，超 N 天不确认按已解决自动结案（B7）。
 * 整条确认链路**没有任何坐席按钮** —— 回传与结案都是系统动作。
 *
 * 【产研反馈】复用处理页「产研反馈」Tab（`tabs/OpFeishuTab.vue`）的那一套记录结构，
 * 推产研走已有的 TPD 通道（`ESCALATE_CHANNEL_TPD`），不新增通道。
 *
 * 【持久化】小智单快照与小智履历落 `XIAOZHI_LS_KEYS`（保质期 + 版本闸，见 `stores/xiaozhiCache.ts`）。
 */

/* ------------------------------------------------------------------ */
/* 对外类型                                                             */
/* ------------------------------------------------------------------ */

/**
 * 建单入参（小智专属要素；通用字段走 `XiaozhiTicketBase`）。
 * ⚠️ **没有问题类别** —— 它是通用咨询表单的问题分类三级，走 `XiaozhiTicketBase.problemL1/2/3`（一·补 B15）。
 */
export interface XiaozhiCreateInput {
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

/**
 * 建单必填缺项。只剩产品模块一项 —— 问题分类走通用级联控件、恒有值（一·补 B15），
 * 不再有「问题类别未选」这档拦截。
 */
export interface XiaozhiCreateBlocked {
  kind: 'blocked';
  /** 缺哪几项（字段键） */
  missing: 'rdModule'[];
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

  function notify(
    r: Ticket,
    kind: 'group' | 'upgrade' | 'return' | 'accepted',
    title: string,
    content: string,
    receivers: (string | null | undefined)[],
    event = `ticket.xiaozhi.${kind}`,
  ) {
    useNotifyLogStore().emit({ ticketNo: r.no, event, kind, title, receivers, content });
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
    // 一·补 B7：装载时对一次「超 N 天未确认」的账，到点的就地自动结案 + 下送调研
    settleConfirmDue();
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

  /**
   * 建单必填校验。小智专属的只剩一条：**走产研的要选产品模块**（W2）。
   * 问题分类那一道在通用咨询表单里（一·补 B15），由 `validate()` 管，不在这里重复判。
   */
  function evaluateCreate(input: XiaozhiCreateInput, escalate: boolean): XiaozhiCreateBlocked | { kind: 'create' } {
    const missing: 'rdModule'[] = [];
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
      rdSync: 'none',
      rdRecords: [],
      rdReturnCount: 0,
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
    // 「创建并流转」：落池生成记录后由系统自动流转，不靠人领、不靠定时任务扫（D6）
    if (escalate) {
      /**
       * 🔴 **直通产研的单不发「待领取」提醒**（D6 + 通知规则 R18 的 `rdDirect` 条件）：
       * 池里留的是**记录**不是待领任务，处理人是系统（一·补 B2），没有人该去领它。
       * 发了就是叫整组去领一张领不了、也不该领的单。
       */
      r.xiaozhi!.rd = buildRdInfo(input);
      escalateToRd(no, { name: '系统', role: '系统' }, true);
    } else {
      // 人工跟进那条路：新单进池待领取，提醒本组全员（D21 一个大组、进池自己领）
      notify(
        r, 'group', '新单待领取', XIAOZHI_NOTICE.pooled(no),
        [XIAOZHI_POOL_GROUP_NAME], 'ticket.pooled',
      );
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
   * 两者都置「已升级产研」、**处理人不转移**（D6）。
   *
   * ⚠️ 回传后**不再自动关单**（一·补 B5 推翻 D9 / D11）：产研办结只是把本单转入
   * 「待校代确认」，关不关由校代那一下决定，见 `receiveRdSettle` 与 `receiveReporterConfirm`。
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

  /* ---------------- 回传与校代确认（一·补 B5 / B7 / B8 / B9；T1） ---------------- */

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
   * 产研「驳回」回传 —— 🔴 **本轮只写处理履历，不驱动本单状态、页面上也没有按钮**（待沟通项 T1）。
   *
   * TPD 状态同步接口的「驳回」指产研**不接这单、退回来**，与 B5 的「校代确认未解决」是两回事：
   * 退回来之后由谁接、怎么再推，业务侧明确「待定，需要沟通」，故本轮不落状态机。
   * 这里保留的是**接口层的接收能力** —— 信息照常进履历、不丢，等口径定了再接状态与动作；
   * 处理方式与 D7 的「处理中」中间态完全一致（同走 `feedback` 记录档，不另开一档）。
   *
   * ⚠️ **不要**因为「看着像失败」就把它写成 `rdSync = 'failed'`：
   * 关联失败是推单没推成、要重推；驳回是推成了被退回，重推解决不了。
   */
  function receiveRdReject(no: string, who: string, reason: string): boolean {
    const r = rowOf(no);
    if (!r?.xiaozhi) return false;
    const now = Date.now();
    // 状态、处理人、Tab 一律不动 —— 只有记录与履历
    pushRdRecord(r, {
      kind: 'feedback',
      title: '产研驳回回传',
      content: reason || '产研已驳回本单（后续处理口径待定）',
      who,
      side: '产研侧',
      when: xiaozhiStamp(now),
      meta: r.xiaozhi.rdFeedbackNo,
      cause: reason,
    });
    log(no, now, {
      category: 'node', action: 'relate', who: '系统', role: '系统', systemActor: true,
      how: '产研回传', what: XIAOZHI_TL.rdRejectedNoted(reason),
    });
    bump(no);
    persist();
    return true;
  }

  /**
   * 产研「办结」回传 —— 🔴 **不关单**，本单转入「待校代确认」（一·补 B5，**推翻 D9 / D11**）。
   *
   * 落的是：办结结果（问题类 / 需求类两套，W8）＋ 办结时刻 ＋ `confirmState = '未确认'`。
   * **状态、处理人、Tab 一律不动** —— 本单仍是「已升级产研」，因为产研那边确实还没从本单脱手，
   * 校代说「未解决」就要原地回传回去（B5②），搬到别的状态再搬回来是白搬。
   * `rdSync = 'closed'` 说的是**产研那张反馈单**结了，不是本单结了，两者别混。
   *
   * ⚠️ 这里**不发调研短信** —— 调研在关单那一刻才下送（`closeXiaozhi`）。原先 D9 把
   * 「办结即关单即下送」焊成一笔，B5 把它拆成两步后，调研必须跟着关单走、不能跟着办结走，
   * 否则校代还没确认、人就先收到满意度调研了。
   */
  function receiveRdSettle(no: string, who: string, payload: XiaozhiSettlePayload): boolean {
    const r = rowOf(no);
    if (!r?.xiaozhi) return false;
    const now = Date.now();
    r.xiaozhi.rdSync = 'closed';
    r.xiaozhi.rdSolutionType = payload.solutionType;
    if (payload.issue) r.xiaozhi.rdIssueResult = { ...payload.issue };
    if (payload.demand) r.xiaozhi.rdDemandResult = { ...payload.demand };
    r.xiaozhi.settledAt = xiaozhiStamp(now);
    r.xiaozhi.confirmState = '未确认';
    r.xiaozhi.confirmAt = undefined;
    r.xiaozhi.confirmBy = undefined;
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
      category: 'node', action: 'relate', who: '系统', role: '系统', systemActor: true,
      how: '产研回传', what: XIAOZHI_TL.rdSettled(payload.solutionType),
    });
    notify(r, 'accepted', '产研办结', XIAOZHI_NOTICE.rdSettled(no), [r.assignee, XIAOZHI_POOL_GROUP_NAME]);
    bump(no);
    persist();
    return true;
  }

  /**
   * 关单 + 下送调研（一·补 B5① / B7 共用的一段）。
   *
   * 🔴 **处理人统一改「系统」**（一·补 B9，扩大 B2 的覆盖范围）：
   * **人工跟进过的单也一样**，不保留原处理人。原写法是 `assignee ?? 系统`（只给悬空的补一个），
   * B9 把它改成无条件覆盖 —— 办结关单这一下是系统做的，落成那位跟进过的坐席，
   * 等于把一笔系统动作记在人头上，绩效与工作量口径都会错。
   *
   * 调研短信由**工单系统**发、发给提问人本人（D12 / D14②）；产研的「解决结果通知」短信
   * 由 TPD 自己发（B12 保留两条），工单系统不重复发。回「未解决」不拉回（D13）。
   */
  function closeXiaozhi(r: Ticket, at: number, what: string) {
    r.nodeStatus = '已结案';
    r.tab = 'done';
    // 一·补 B9：统一改系统，不是「没人才补一个」
    r.assignee = XIAOZHI_SYSTEM_HANDLER;
    r.updatedAt = xiaozhiMinuteStamp(at);
    log(r.no, at, {
      category: 'node', action: 'resolved', who: '系统', role: '系统', systemActor: true,
      how: '自动结案', what,
    });
    log(r.no, at + 1, {
      category: 'comm', action: 'sms', who: '系统', role: '系统', systemActor: true,
      how: '短信', what: `已向提问人发送满意度调研短信（工单号：${r.no}）`,
    });
    notify(r, 'accepted', '工单结案', XIAOZHI_NOTICE.closed(r.no), [XIAOZHI_POOL_GROUP_NAME]);
  }

  /**
   * 校代（提报人）确认是否解决（一·补 B5）。
   *
   * 🔴 **这是接口层的入口，不是页面上的按钮** —— 确认动作发生在**小智工单应用**里
   * （B6：建单入口迁 400，查询 + 确认流程保留），工单系统侧只接结果。原型里没有校代端，
   * 三种结果（确认是 / 确认否 / 未确认）由种子数据体现，**页面上不造「模拟确认」按钮**。
   *
   * - `resolved = true` → 关单 + 下送调研（B5①）；
   * - `resolved = false` → 本单**留在「已升级产研」、状态不动**，系统**自动**回传产研「未解决」
   *   （B5②：回传是系统动作不是坐席动作，故**没有「二次提交产研」按钮**），
   *   产研重新处理后再办结、再等确认。循环**不封顶**，但每轮累加 `rdReturnCount`（B8）。
   */
  function receiveReporterConfirm(no: string, resolved: boolean, who: string): boolean {
    const r = rowOf(no);
    // 没走到办结、或已经确认过的，不接
    if (!r?.xiaozhi || r.xiaozhi.confirmState !== '未确认') return false;
    const now = Date.now();
    r.xiaozhi.confirmAt = xiaozhiStamp(now);
    r.xiaozhi.confirmBy = who;
    if (resolved) {
      r.xiaozhi.confirmState = '已确认解决';
      closeXiaozhi(r, now, XIAOZHI_TL.confirmResolved(who));
      bump(no);
      persist();
      return true;
    }
    r.xiaozhi.confirmState = '已确认未解决';
    // 系统自动回传产研「未解决」：产研那张单重新开工，本单状态不动
    const times = (r.xiaozhi.rdReturnCount ?? 0) + 1;
    r.xiaozhi.rdReturnCount = times;
    r.xiaozhi.rdSync = 'synced';
    // 新一轮等产研再办结，故办结结果与确认状态一并清回未办结
    r.xiaozhi.settledAt = undefined;
    r.xiaozhi.confirmState = undefined;
    r.xiaozhi.rdSolutionType = undefined;
    r.xiaozhi.rdIssueResult = undefined;
    r.xiaozhi.rdDemandResult = undefined;
    r.updatedAt = xiaozhiMinuteStamp(now);
    pushRdRecord(r, {
      kind: 'push',
      title: `系统自动回传${ESCALATE_CHANNEL_TPD}`,
      content: `${who}确认问题未解决，系统已自动回传产研（第 ${times} 次回传产研）`,
      who: '系统',
      side: '客服工单',
      when: xiaozhiStamp(now),
      meta: r.xiaozhi.rdFeedbackNo,
    });
    log(no, now, {
      category: 'node', action: 'relate', who: '系统', role: '系统', systemActor: true,
      how: '系统自动回传',
      what: XIAOZHI_TL.confirmUnresolved(who, times, ESCALATE_CHANNEL_TPD),
    });
    notify(r, 'upgrade', '已回传产研', XIAOZHI_NOTICE.returnedToRd(no, times), [XIAOZHI_POOL_GROUP_NAME]);
    bump(no);
    persist();
    return true;
  }

  /**
   * 超 `XIAOZHI_CONFIRM_TIMEOUT_DAYS` 天未确认 → **视为已解决**，自动结案 + 下送调研（一·补 B7）。
   *
   * 形制照刷机单的「调研超时未评价自动结案」（`stores/flash.ts` 的 `settleDue`）：
   * 不起定时任务，**装载时按办结时刻 + N 天对一次账**，到点的就地结掉，结案时刻取到点时刻
   * （不取打开页面的时刻，否则同一张单在不同时间打开会算出不同的结案时间）。
   */
  function settleConfirmDue(now: number = Date.now()): number {
    let settled = 0;
    const dueMs = XIAOZHI_CONFIRM_TIMEOUT_DAYS * 24 * 3_600_000;
    for (const t of TICKETS) {
      if (!isXiaozhiTicket(t) || !t.xiaozhi) continue;
      if (t.xiaozhi.confirmState !== '未确认' || !t.xiaozhi.settledAt) continue;
      const due = new Date(t.xiaozhi.settledAt.replace(/-/g, '/')).getTime() + dueMs;
      if (!Number.isFinite(due) || due > now) continue;
      const r = reactive(t);
      r.xiaozhi!.confirmState = '已确认解决';
      r.xiaozhi!.confirmAt = xiaozhiStamp(due);
      // 超时视为已解决是系统判的，不是哪位校代点的
      r.xiaozhi!.confirmBy = XIAOZHI_SYSTEM_HANDLER;
      closeXiaozhi(r, due, XIAOZHI_TL.confirmTimeoutClosed(XIAOZHI_CONFIRM_TIMEOUT_DAYS));
      bump(r.no);
      settled += 1;
    }
    if (settled) persist();
    return settled;
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
    receiveRdProgress,
    /** T1：只写履历、不驱动状态。接口层能力保留，页面上无入口 */
    receiveRdReject,
    receiveRdSettle,
    /** B5：校代确认结果入口（来自小智工单应用，非页面按钮） */
    receiveReporterConfirm,
    /** B7：超 N 天未确认视为已解决 */
    settleConfirmDue,
    syncStatus,
  };
});
