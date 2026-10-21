import { defineStore } from 'pinia';
import { reactive, ref, toRaw } from 'vue';
import type { Channel, Priority, Ticket } from '@/views/tickets/types/ticket';
import type { FeishuRecord } from '@/mock/ticketDetail';
import type { TimelineEntry } from '@/views/tickets/types/ticketDetail';
import { TICKETS } from '@/mock/tickets';
import { XIAOZHI_SEEDS } from '@/mock/xiaozhi/seedTickets';
import { makeTicketNo } from '@/constants/ticketNo';
import { CLOSE_REASON_RESOLVED, ESCALATE_CHANNEL_TPD } from '@/views/tickets/composables/opActions';
import {
  XIAOZHI_BUSINESS_TYPE, XIAOZHI_CLOSED_STATUS, XIAOZHI_CONFIRM_TIMEOUT_DAYS, XIAOZHI_NOTICE,
  XIAOZHI_POOL_GROUP_ID, XIAOZHI_POOL_GROUP_NAME,
  XIAOZHI_RD_PLATFORM_AVAILABLE, XIAOZHI_RD_RETURNED_STATUS,
  XIAOZHI_SLA_IDLE, XIAOZHI_SYSTEM_HANDLER, XIAOZHI_TICKET_SOURCE, XIAOZHI_TICKET_TYPE, XIAOZHI_TL,
  isXiaozhiTicket, resolveReporterKind, xiaozhiHasReceiver, xiaozhiNoticeChannel, xiaozhiRdTitle,
  xiaozhiReceiverOf,
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
 * 本服务只管「建单 → 落池 / 自动流转产研 → 产研办结 → **完成通知** → **提报人确认** → 关闭工单」
 * 这条小智专属链路。**全程无调研环节**（一·补 B28）。
 *
 * 🔴 **办结不等于关单**（一·补 B5，推翻 D9 / D11）：产研办结只把本单转入「待提报人确认」，
 * 提报人确认「是」才落终态「**已关闭**」（一·补 B32：走关闭、不下送）、确认「否」则系统自动回传产研，
 * 超 N 天不确认按已解决自动关闭（B7）。
 * 整条确认链路**没有任何坐席按钮** —— 回传与关单都是系统动作。
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
  /** 一线人员域账号：客户（校代 / 渠道商）的讯飞域账号，选填（一·补 B29） */
  frontlineAccount: string;
  /** 附件（文件名，选填；建单取自问题描述区 descriptionAttachments） */
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
  /** 问题描述附件（建单 OpTextareaAttach，与 Ticket.problemDescAttachments 同源） */
  problemDescAttachments?: string[];
}

/** 建单人（履历落款） */
export interface XiaozhiActor {
  name: string;
  role: TimelineEntry['role'];
}

/**
 * 建单拦截。必填缺项只剩产品模块一项 —— 问题分类走通用级联控件、恒有值（一·补 B15），
 * 一线人员域账号取客户的、客户没登记就留空，故不必填（一·补 B29）。
 *
 * `reason` 是**字段级之外**的拦截（PRD §2 的两条校验）：
 * - `receiverMissing`：产品模块选了、但该模块没配产研接收人 → 文案落在产品模块那一栏下方；
 * - `platformDown`：产研平台不可用 → **工单照建**，只是不流转，由调用方落池并原样提示。
 */
export interface XiaozhiCreateBlocked {
  kind: 'blocked';
  /** 缺哪几项（字段键） */
  missing: 'rdModule'[];
  /** 非必填类拦截的原因 */
  reason?: 'receiverMissing';
}

export interface XiaozhiCreateOk {
  kind: 'create';
  ticket: Ticket;
  /**
   * 建成了但**没流转成**（产研平台不可用，PRD §2）：单子留在工单池里。
   * 调用方据此换提示文案 —— 不能照「已流转产研」那句报喜。
   */
  degraded?: boolean;
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
    channel?: string,
  ) {
    useNotifyLogStore().emit({ ticketNo: r.no, event, kind, title, receivers, content, channel });
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
      /**
       * 🔴 **种子 ④ 的关单走真实路径补跑**（`XiaozhiSeedBundle.confirmedResolved`）。
       *
       * 它在种子里只造到「产研已办结 · 待提报人确认」那一刻，终态由这里跑出来 ——
       * 于是 `nodeStatus` / 处理人（B9 统一改系统）/ `closeReason`（B38「问题已解决」）/
       * 关单履历文案**全部由真实代码产生**，不是种子里手抄的字符串。
       * 与种子 ⑥ 的超时兜底（下面 `settleConfirmDue()`）是同一个做法。
       *
       * ⚠️ **只在"回到种子"这一支跑**：从缓存恢复时这张单已经是关掉的，再跑一次会被
       * `receiveReporterConfirm` 的「已经确认过的不接」挡掉，但没必要走这一趟。
       * ⚠️ **排在 `settleConfirmDue()` 之前**：对账是按「未确认 ∧ 办结超 N 天」扫的，
       * 先跑确认才不会有哪天把它当成超时单结掉（④ 的办结时刻取装载前 3 小时，本就在 N 之内，
       * 这一条是双保险）。
       */
      for (const { no: seedNo, who } of XIAOZHI_SEEDS.confirmedResolved) {
        receiveReporterConfirm(seedNo, true, who);
      }
    }
    // 一·补 B7 + B32：装载时对一次「超 N 天未确认」的账，到点的就地自动落「已关闭」
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
   * 建单校验（PRD §2）。问题分类那一道在通用咨询表单里（一·补 B15），由 `validate()` 管，
   * 不在这里重复判。
   *
   * 🔴 **必填只剩产品模块一项，且是条件必填** —— 只在 `escalate`（勾了「升级 TPD」）时要，
   * 走产研才用得上。
   *
   * ⚠️ **一线人员域账号不判必填**（一·补 B29，**推翻 B24**）：它取的是**客户**（校代 / 渠道商）
   * 已登记的讯飞域账号，而客户不是人人都有 —— 判必填就等于逼建单人随手填一个，
   * 填进去的不是提报人，确认链路（B5）反而更错。老系统按「有没有这个账号」分流那条分支
   * 本轮同样不补。
   *
   * 另两条：
   * - 该产品模块必须配了产研接收人（接收人由产品模块带出、不可改，缺了推出去产研也不知道派给谁）；
   * - 产研平台可用性**不在这里判** —— 它不是「不许建单」，而是「建单成功但不流转」，
   *   见 `createXiaozhiTicket` 里的 `platformDown` 分支。拦截与降级是两回事，别混成一条。
   */
  function evaluateCreate(input: XiaozhiCreateInput, escalate: boolean): XiaozhiCreateBlocked | { kind: 'create' } {
    const missing: 'rdModule'[] = [];
    const picked = input.rdModule?.trim() ?? '';
    if (escalate && !picked) missing.push('rdModule');
    if (missing.length) return { kind: 'blocked', missing };
    if (escalate && picked && !xiaozhiHasReceiver(picked)) {
      return { kind: 'blocked', missing: [], reason: 'receiverMissing' };
    }
    return { kind: 'create' };
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
   * 建小智工单。出口只有一枚「创建」，`escalate` 来自建单弹窗「升级 TPD」勾选框（一·补 B27）：
   * - `escalate=false`（未勾）：落工单池，由小智团队领单处理结案；
   * - `escalate=true`（勾上）：**落工单池留记录后，由系统自动流转推产研**（D6），
   *   本单置「已升级产研」、处理人＝系统（一·补 B2）。
   *
   * ⚠️ **两条分支的行为与 B27 之前逐字一致** —— B27 换的只是触发方式（勾选框取代第二枚按钮）。
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
    /**
     * 🔴 **产研平台不可用时降级：工单照建、留在工单池、不流转**（PRD §2）。
     *
     * 客户的问题已经登记下来了，不能因为下游挂了就把单子也丢掉；流转那一步没成，
     * 单子就按人工那条路落池等人领，提示 `XIAOZHI_TIP.rdPlatformDownOnCreate`
     * 告诉坐席「稍后在工单内重新提交产研」（那就是底栏「升级 · 产研」那一枚）。
     * 返回 `degraded: true`，由调用方决定提示用哪一句 —— store 不碰 UI。
     *
     * 判定提到建对象之前，是因为 `tab` 要按它取值（见下）。
     */
    const platformDown = escalate && !XIAOZHI_RD_PLATFORM_AVAILABLE;
    /** 真走直通产研那一支（勾了「升级 TPD」且产研平台可用） */
    const autoEscalate = escalate && !platformDown;
    const xiaozhi: TicketXiaozhi = {
      // 一·补 B29：提报人（客户）确认凭据，**两条路都落**（未勾「升级 TPD」的单没有 rd，凭据一样要留）
      frontlineAccount: input.frontlineAccount.trim(),
      // PRD §2.2：提报人类型在建单这一下判一次就落单，下游只读它（见 `resolveReporterKind`）
      reporterKind: resolveReporterKind(input.frontlineAccount),
      // 一·补 B31 / B33：产研退回时要把处理人交回建单人，故建单这一下就把人记下来
      createdBy: actor.name,
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
      /**
       * 🔴 **两条路都落 `'pool'`**。
       *
       * 工单池页签的数据域 `inGroupPoolScope` 要 `tab === 'pool'`，我的任务 `inMineTaskScope`
       * 要 `tab === 'mine' ∧ 处理人是我`。原先新单一律写 `'mine'` + `assignee: null`，
       * **两条都不满足 —— 刚建的小智单在工单池和我的任务里都看不见**，只能从查询中心翻到。
       *
       * - 未勾「升级 TPD」：落池等人领，领取时 `claimFromPool` 再把它翻回 `'mine'`；
       * - 勾了「升级 TPD」：**PRD §2.3 字面就是「先在工单池留下记录」**，那条记录本来就是
       *   给组里看的。它有处理人（系统，一·补 B2）故**不是待领任务** —— `inGroupPoolScope`
       *   为它开了一道判据明确的例外（`isXiaozhiPooledRecord`），而 `canAutoClaim` 与
       *   底栏 `xiaozhiClaimable` 都要求「未认领」，判不中它，不会被谁领走。
       */
      tab: 'pool',
      responded: false,
      createdAt: xiaozhiMinuteStamp(now),
      updatedAt: xiaozhiMinuteStamp(now),
      problemDesc: base.problemDesc,
      problemDescAttachments: base.problemDescAttachments?.length
        ? [...base.problemDescAttachments]
        : undefined,
      xiaozhi,
    };
    TICKETS.push(raw);
    const r = reactive(raw);
    log(no, now, {
      category: 'node', action: 'create', who: actor.name, role: actor.role,
      how: '建单', what: XIAOZHI_TL.create(XIAOZHI_TICKET_SOURCE),
    });
    // 勾了「升级 TPD」：落池生成记录后由系统自动流转，不靠人领、不靠定时任务扫（D6 / 一·补 B27）
    if (autoEscalate) {
      /**
       * 🔴 **直通产研的单不发「待领取」提醒**（D6 + 通知规则 R18 的 `rdDirect` 条件）：
       * 池里留的是**记录**不是待领任务，处理人是系统（一·补 B2），没有人该去领它。
       * 发了就是叫整组去领一张领不了、也不该领的单。
       */
      r.xiaozhi!.rd = buildRdInfo(input);
      escalateToRd(no, { name: '系统', role: '系统' }, true);
    } else {
      // 平台不可用那一支也走这里：单子留在池里等人领，产研要素先存着、重新提交时直接用
      if (platformDown) r.xiaozhi!.rd = buildRdInfo(input);
      // 人工跟进那条路：新单进池待领取，提醒本组全员（D21 一个大组、进池自己领）
      notify(
        r, 'group', '新单待领取', XIAOZHI_NOTICE.pooled(no),
        [XIAOZHI_POOL_GROUP_NAME], 'ticket.pooled',
      );
      bump(no);
      persist();
    }
    return { kind: 'create', ticket: r, degraded: platformDown };
  }

  /**
   * 从工单池领取（D21：一个大组、进池自己领）。
   *
   * 只对**池里真的在等人领**的单生效（「未认领」且无处理人）：
   * 直通产研那批状态是「已升级产研」、处理人是系统（一·补 B2），池里留的是记录不是待领任务，
   * 本函数对它返回 false —— 不靠调用方自觉。
   */
  function claimFromPool(no: string, actor: XiaozhiActor): boolean {
    const r = rowOf(no);
    if (!r) return false;
    if (r.nodeStatus !== '未认领' || r.assignee) return false;
    const now = Date.now();
    /**
     * 🔴 **领取落「待响应」，不是「处理中」**（基线 §1 L25 / §4 L400）：
     * 「待响应 ＝ 认领后未保存、未打电话、未发短信、未发邮件」，领取本身**不是**响应动作。
     * 基线对「未认领 → 待响应」只开过一个例外（L106：转售后回流被调剂/指派后直落处理中，
     * 原文明写「例外只限这条链路」），小智不在其中。
     */
    r.nodeStatus = '待响应';
    r.assignee = actor.name;
    /**
     * 🔴 **`tab` 必须从 `pool` 翻到 `mine`**（与刷机 `claimFromPool` 同一步）：
     * 工单池页签的数据域是 `inGroupPoolScope`（tab==='pool' ∧ 无处理人），
     * 我的任务是 `inMineTaskScope`（**tab==='mine'** ∧ 处理人是我）——
     * 不翻这一下，领完的单从池里消失、又进不了我的任务，**两个页签都看不到它**。
     * 之前七张种子生来就是 `mine`，把这一步的缺失盖住了。
     */
    r.tab = 'mine';
    /**
     * 🔴 **`responded` 保持 false**：基线 §7 L728 写明 `responded` 的判定动作集是
     * **保存 / 电话 / 短信 / 邮件**，**领取不在其中**，且该动作集与班组看板
     * 「24 小时联络率」的分子**逐字相同**。领取就置 true 等于伪造「已联系客户」，
     * 会直接污染那个分子。
     */
    r.responded = false;
    r.updatedAt = xiaozhiMinuteStamp(now);
    log(no, now, {
      category: 'node', action: 'accept', who: actor.name, role: actor.role,
      how: '领取', what: `${actor.name} 从${XIAOZHI_POOL_GROUP_NAME}工单池领取本单。`,
    });
    bump(no);
    persist();
    return true;
  }

  /**
   * 首次响应 → 「待响应」转「处理中」（基线 §1 L25 / §7 L728）。
   *
   * 判定动作集 ＝ **保存 / 电话 / 短信 / 邮件**，与班组看板「24 小时联络率」的分子逐字相同，
   * 故**不另立判定**，由调用方在那几个动作发生时调本函数；其余子状态一概不动。
   *
   * 🔴 **这是照刷机那一份抄的，不是新造的语义** —— `stores/flash.ts` 的
   * `markRespondedByContact` 与 `saveProcess` 里那行 `if (nodeStatus === '待响应')` 是全仓
   * **仅有的**实现。通用单那条路**根本没有这个驱动**（`mock/tickets.ts` 里三张「待响应」的
   * 通用单永远停在「待响应」），所以没有「通用实现」可复用 —— 这一点已上报，
   * 等通用那条补上后，这里应当换成调用那一份、删掉本函数。
   */
  function markResponded(no: string): boolean {
    const r = rowOf(no);
    if (!r || r.nodeStatus !== '待响应') return false;
    r.nodeStatus = '处理中';
    r.responded = true;
    r.updatedAt = xiaozhiMinuteStamp(Date.now());
    bump(no);
    persist();
    return true;
  }

  /* ---------------- 推产研（D6 / 一·补 B10） ---------------- */

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
  function escalateToRd(no: string, actor: XiaozhiActor, auto = false, rd?: XiaozhiRdInfo): boolean {
    const r = rowOf(no);
    if (!r?.xiaozhi) return false;
    const now = Date.now();
    // 人工那条路（底栏「升级 · 产研」）在弹窗里才采集产研五项，故由调用方带进来
    if (rd) r.xiaozhi.rd = { ...rd };
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
      /**
       * 🔴 **两条路的履历不能共用一句**（PRD §11.2）：
       * 原先人工那条也写 `autoEscalate`，于是页面上出现「操作人：谭小智 / 动作：升级 /
       * 正文：**系统自动流转至** TPD…」—— 一条自己打自己的履历。
       */
      how: auto ? '系统自动流转' : '升级 · 产研',
      what: auto
        ? XIAOZHI_TL.autoEscalate(ESCALATE_CHANNEL_TPD, rdTitle)
        : XIAOZHI_TL.manualEscalate(ESCALATE_CHANNEL_TPD, rdTitle),
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
   * 产研「退回」回传 —— 🔴 **本单落「已退回」，处理人交回创建人 / 最后编辑人**（一·补 B31 / B33，
   * **关闭 T1**）。
   *
   * 产研的退回**主要用于信息补充场景，不是拒绝处理**（10-19 纪要）：退回来的单必须有人接着补，
   * 补完**复用底栏既有的「升级 · 产研」重新提交** —— 页面上**不另造「重新提交产研」按钮**。
   * 交回的人是**本单创建人**（建单后被编辑过的取最后编辑人），**不是 L2 组**。
   *
   * ⚠️ 与 B5② 的「提报人确认未解决 → 系统自动回传产研、状态不动」是**两条独立链路**，
   * 一条是产研不收、一条是提报人不认，各走各的，不要合并。
   *
   * ⚠️ **不要**因为「看着像失败」就把它写成 `rdSync = 'failed'`：
   * 关联失败是推单没推成、要重推；退回是推成了被退回来补料。这里落回 `'none'` ——
   * 产研侧那张单已经不在办了，本单要重新推一次才会再有产研单。
   */
  function receiveRdReject(no: string, who: string, reason: string): boolean {
    const r = rowOf(no);
    if (!r?.xiaozhi) return false;
    const now = Date.now();
    // 一·补 B31：交回创建人；建单后被编辑过的取最后编辑人
    const owner = (r.xiaozhi.lastEditor ?? r.xiaozhi.createdBy ?? '').trim();
    r.nodeStatus = XIAOZHI_RD_RETURNED_STATUS;
    if (owner) r.assignee = owner;
    /**
     * 🔴 **`rdSync` 保留真实值，不动它**。
     *
     * 底栏「升级」在 `synced / feedback / closed` 三态上置灰（`OpActionBar` 的
     * `feishuEscalateBlocked`），但那道判的是"已经升过、别再升"的**代理条件**，
     * 而「已退回」的语义恰恰是"这次升级已经结束、等补料重提" —— 开闸应当按**子状态**给
     * （`xiaozhiRdReturned`），不该靠把 `rdSync` 抹成 `'none'` 绕过去：
     * 抹掉它，「产研反馈」Tab 的出现判据（`feishuSync !== 'none'`）跟着失效，
     * **退回前提交过什么、退回原因是什么全看不见了** —— 而那正是创建人补信息要看的东西。
     * 也**不要**写成 `'failed'`：那是「关联失败、要重推」，Tab 会另给一枚「重试」，
     * 等于在「升级 · 产研」之外开第二个重新提交入口（B31 要求只留一个）。
     */
    // 本人的待办：回到「我的任务」页签（判据 tab==='mine' ∧ 处理人是我）
    r.tab = 'mine';
    r.updatedAt = xiaozhiMinuteStamp(now);
    pushRdRecord(r, {
      kind: 'feedback',
      title: '产研退回',
      content: reason || '产研因信息不全退回本单，请补充后重新提交',
      who,
      side: '产研侧',
      when: xiaozhiStamp(now),
      meta: r.xiaozhi.rdFeedbackNo,
      cause: reason,
    });
    log(no, now, {
      category: 'node', action: 'relate', who: '系统', role: '系统', systemActor: true,
      how: '产研回传', what: XIAOZHI_TL.rdReturned(owner || '本单创建人', reason),
    });
    // 2026-10-21 拍板：产研回传一律不发站内通知（中间状态 / 办结 / 退回 / 确认未解决 / 关单），
    // 坐席在工单上看状态与处理履历（PRD §9.1 规则 5）。
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
   * 🔴 **这里发的是「完成通知」，不是调研短信**（一·补 B28 / B34）：小智工单全程无调研环节，
   * 产研办结后由**工单系统**发一条「已完成，请确认」，通道二选一（见 `sendCompletionNotice`）。
   * 它必须跟着**办结**走、不能跟着关单走 —— 提报人正是收到这一条才去确认的。
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
    // 办结不发站内通知（2026-10-21 拍板，PRD §9.1 规则 5）；对客那一条照发，见下。
    // 一·补 B28 / B34：对客的「完成通知」由工单系统发，紧跟办结那一笔
    sendCompletionNotice(r, now + 1);
    bump(no);
    persist();
    return true;
  }

  /**
   * 完成通知（一·补 B28 / B34）—— 🔴 **不是调研**。
   *
   * 小智工单全程无调研环节，产研办结后只发这一条「已完成，请确认」，由**工单系统**发
   * （B34：通道判定依赖只存在于工单系统的提报人标识，产研侧拿不到，故产研那条
   * 「解决结果通知」已提对外要求关闭）。
   *
   * 通道按**提报人标识的类型**选：域账号 → IM 消息；手机号 → 短信；
   * 提报人为空 → 回落**本单客户联系手机号**短信；
   * **都没有 → 不发**，只落一条处理履历说明没发出去 —— 不编一个收件人出来。
   * 每发一条落一条沟通类处理履历。
   */
  function sendCompletionNotice(r: Ticket, at: number) {
    const pick = xiaozhiNoticeChannel(r.xiaozhi?.frontlineAccount, r.xiaozhi?.reporterKind, r.customerPhone);
    if (!pick) {
      log(r.no, at, {
        category: 'comm', action: 'sms', who: '系统', role: '系统', systemActor: true,
        how: '完成通知', what: XIAOZHI_TL.completionNoticeSkipped(),
      });
      /**
       * 🔴 **置待跟进标记**（一·补 B40）：只落一条履历是不够的 —— 履历要点开单才看得见，
       * 这张单会静默走到超时自动关单。置上后列表行出「通」字徽标（`TicketTitleCell`），
       * 坐席在列表上就看得见该去人工联系客户。
       */
      r.hasPendingNotice = true;
      return;
    }
    // 通知发出去了：清掉可能留着的待跟进标记（重办后客户补了域账号/手机号即属此例）
    r.hasPendingNotice = false;
    log(r.no, at, {
      category: 'comm', action: 'sms', who: '系统', role: '系统', systemActor: true,
      // `how` 是履历上的徽章，走哪条通道就写哪条；`action` 只决定图标，comm 两条通道共用
      how: pick.channel, what: XIAOZHI_TL.completionNotice(pick.channel, pick.to),
    });
    notify(
      r, 'accepted', '完成通知', XIAOZHI_NOTICE.completed(r.no), [pick.to],
      'ticket.xiaozhi.completed', pick.channel,
    );
  }

  /**
   * 产研那条路的关单（一·补 B5① / B7 共用的一段）。
   *
   * 🔴 **落「已关闭」，不是「已结案」**（一·补 B32）：小智工单关单走「关闭工单」、
   * **不走「下送结案」**，故终态是既有子状态「已关闭」。
   * 🔴 **不发调研**（一·补 B28）：小智工单全程无调研环节，对客只有产研办结那一刻的完成通知。
   *
   * 🔴 **处理人统一改「系统」**（一·补 B9，扩大 B2 的覆盖范围）：
   * **人工跟进过的单也一样**，不保留原处理人。原写法是 `assignee ?? 系统`（只给悬空的补一个），
   * B9 把它改成无条件覆盖 —— 办结关单这一下是系统做的，落成那位跟进过的坐席，
   * 等于把一笔系统动作记在人头上，绩效与工作量口径都会错。
   *
   * 🔴 **关闭原因落「问题已解决」，并且落到结构化字段 `closeReason` 上**（一·补 B38）：
   * 这两条路（提报人确认已解决 / 超 N 天视为已解决）语义上都是"解决了才关的"。
   * 取值引通用常量 `CLOSE_REASON_RESOLVED`，不另起小智专属字面量；
   * 字段形制照售后回传 `AS_CLOSED` 落「售后已完成」那条 —— 通用单的关闭弹窗目前只把
   * 选值拼进履历文案、不落字段，小智这两条路**落字段**，让 `closeReason` 有真实值。
   */
  function closeXiaozhi(r: Ticket, at: number, what: string) {
    r.nodeStatus = XIAOZHI_CLOSED_STATUS;
    r.tab = 'done';
    // 一·补 B9：统一改系统，不是「没人才补一个」
    r.assignee = XIAOZHI_SYSTEM_HANDLER;
    // 一·补 B38：两条自动关单路径的关闭原因都是「问题已解决」
    r.closeReason = CLOSE_REASON_RESOLVED;
    r.updatedAt = xiaozhiMinuteStamp(at);
    log(r.no, at, {
      category: 'node', action: 'resolved', who: '系统', role: '系统', systemActor: true,
      how: '自动关闭', what,
    });
    // 关单不发站内通知（2026-10-21 拍板，PRD §9.1 规则 5）
  }

  /**
   * 坐席自办答完 → 点底栏「关闭工单」（一·补 B32 路径①）。
   *
   * 🔴 **不走关闭审批，点完直落终态「已关闭」**：通用单的「关闭工单」是提交审批、进
   * 「申请关闭中」，小智单按例外免掉（体例照基线 §1 售后回传 `AS_CLOSED`「正常关闭、不走关闭审批」）。
   * 🔴 **处理人保留为操作人**，不改系统 —— B9 的「统一改系统」说的是**产研办结自动关单**
   * 那条路（关单那一下是系统做的）；这一下是坐席自己点的，记在他头上才对。
   * 🔴 **关闭原因由坐席在弹窗里自己选，不预设默认值**（一·补 B38 只给自动那两条路预填）；
   * 选什么就落什么到 `closeReason` 上，与自动那条共用同一个字段。
   */
  function closeByAgent(no: string, actor: XiaozhiActor, reason: string, note = ''): boolean {
    const r = rowOf(no);
    if (!r) return false;
    const now = Date.now();
    r.nodeStatus = XIAOZHI_CLOSED_STATUS;
    r.tab = 'done';
    r.assignee = actor.name;
    r.closeReason = reason;
    r.updatedAt = xiaozhiMinuteStamp(now);
    log(no, now, {
      category: 'node', action: 'resolved', who: actor.name, role: actor.role,
      how: '关闭工单', what: XIAOZHI_TL.closeByAgent(reason, note),
    });
    // 关单不发站内通知（2026-10-21 拍板，PRD §9.1 规则 5）
    bump(no);
    persist();
    return true;
  }

  /**
   * 记一次「本单被编辑过」（一·补 B31 / B33）：产研退回时处理人优先交回最后编辑人。
   * 由工单页在保存处理表单那一下调用，与 `markResponded` 同一个时机。
   */
  function markEdited(no: string, who: string): void {
    const r = rowOf(no);
    if (!r?.xiaozhi || !who.trim()) return;
    r.xiaozhi.lastEditor = who.trim();
    persist();
  }

  /**
   * **提报人**确认是否解决（一·补 B5；称谓照 B19，不写「校代」—— 提报对象含渠道商）。
   *
   * 🔴 **这是接口层的入口，不是页面上的按钮** —— 确认动作发生在**小智工单应用**里
   * （B6：建单入口迁 400，查询 + 确认流程保留），工单系统侧只接结果。原型里没有提报人端，
   * 三种结果（确认是 / 确认否 / 未确认）由种子数据体现，**页面上不造「模拟确认」按钮**。
   *
   * - `resolved = true` → 落终态「已关闭」（B5① + B32，**不下送、不调研**）；
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
      // 次数词序照 PRD L420「已回传产研 〈N〉 次」
      content: `${who}确认问题未解决，系统已自动回传产研（已回传产研 ${times} 次）`,
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
    // 确认未解决、自动回传产研这一下不发站内通知（2026-10-21 拍板，PRD §9.1 规则 5）：
    // 业务侧没有提过这几条通知，坐席在工单上看状态与处理履历。

    bump(no);
    persist();
    return true;
  }

  /**
   * 超 `XIAOZHI_CONFIRM_TIMEOUT_DAYS` 天未确认 → **视为已解决**，自动落「已关闭」（一·补 B7 + B32）。
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
    /** D21：从工单池领取（落「待响应」） */
    claimFromPool,
    /** 基线 §1 / §7：保存 / 电话 / 短信 / 邮件任一发生 → 「待响应」转「处理中」 */
    markResponded,
    /** B31 / B33：记最后编辑人，产研退回时处理人优先交回给他 */
    markEdited,
    escalateToRd,
    /** B32 路径①：坐席自办答完点「关闭工单」→ 直落「已关闭」，不走审批 */
    closeByAgent,
    receiveRdProgress,
    /** B31 / B33：产研退回 → 本单落「已退回」、处理人交回创建人 / 最后编辑人 */
    receiveRdReject,
    receiveRdSettle,
    /** B5：校代确认结果入口（来自小智工单应用，非页面按钮） */
    receiveReporterConfirm,
    /** B7：超 N 天未确认视为已解决 */
    settleConfirmDue,
    syncStatus,
  };
});
