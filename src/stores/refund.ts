import { defineStore } from 'pinia';
import { reactive, ref, toRaw } from 'vue';
import type { Channel, Priority, Ticket, TicketStatus } from '@/views/tickets/types/ticket';
import { isTicketClosed } from '@/views/tickets/types/ticket';
import type { TimelineEntry, TlRole } from '@/views/tickets/types/ticketDetail';
import { TICKETS } from '@/mock/tickets';
import { REFUND_SEEDS } from '@/mock/refund/seedTickets';
import { findRefundOrder } from '@/mock/refund/commodities';
import { resolveSchoolManager } from '@/mock/refund/managers';
import { makeTicketNo } from '@/constants/ticketNo';
import { readFlashSla } from '@/views/tickets/utils/slaClock';
import { flashStamp, parseFlashStamp } from '@/views/tickets/types/flash';
import {
  REFUND_NOTIFY_EVENTS, REFUND_PENDING_STEP_MS, REFUND_POOL_GROUP_ID, REFUND_POOL_GROUP_NAME,
  REFUND_PRODUCT_CATEGORY, REFUND_PRODUCT_NAME, REFUND_RESULT_DELAY_MS, REFUND_STATUS_SYSTEM,
  REFUND_SYSTEM_HANDLER, REFUND_TICKET_TYPE, REFUND_TIP, REFUND_TL, REFUND_TOAST, REFUND_TO_MANAGER,
  emptyRefundHandle, inflightRefundRun, isRefundTicket, refundManagerTlRole, refundPooledImText,
  refundSurveySmsText, refundTodoImText, refundUrgeImText,
  type RefundHandle, type RefundInfo, type RefundManager, type RefundRun, type RefundTaskStatus,
  type TicketRefund,
} from '@/views/tickets/types/refund';
import { useNotifyLogStore } from './notifyLog';

/**
 * 个册退费单 · 个册退费服务（1120 个册退费工单 PRD 第 3–7 章）。
 *
 * 【数据源】个册退费单与其他工单同在工单库 `TICKETS`；本服务**只改那一份对象**（经 `reactive` 写入，
 * 已打开的列表随之刷新），履历写在工单行的 `eventTimeline` 上（处理页按「本单自有数据」读它）。
 *
 * 【写口】建单派单、移动工单 H5（保存 / 下送 / 转办）、产线结果定时查询（`settleDue`）、
 * 教育支持组（二线）的调剂给校园经理与下送、关联投诉。其余动作同咨询单，走处理页通用分支。
 *
 * 【持久化】个册退费单快照（含关联投诉建出的投诉单）落 localStorage，12 小时保质。
 */

export interface RefundActor {
  name: string;
  role: TlRole;
}

export type RefundActionResult = { ok: true; message: string } | { ok: false; message: string };

export interface RefundCreateBase {
  customer: string;
  customerPhone?: string;
  customerGender?: string;
  customerRegion?: string;
  customerAddress?: string;
  vip?: boolean;
  channel: Channel;
  ticketSource: string;
  priority: Priority;
  title: string;
  problemL1: string;
  problemL2: string;
  problemL3: string;
  problemDesc: string;
  problemDescAttachments: string[];
}

const LS_KEY = 'flowos-refund-cache';
/**
 * v4：通知文案与收件人改版（到组通知走 IM_WO_POOLED、短信带完整 H5 链接、收件人只写姓名）
 * v5：种子时刻由分钟级改到秒级（列表与查询的建单 / 更新时间带秒），v4 快照里的分钟级时间作废
 * v6：SLA 自建单下送起算、加整单首响时刻 `firstRespAt`；二线落组由「教育退费审核组」(edu-refund) 改为
 *     通用「教育支持组」(edu)（10-27 拍板），v5 快照里的旧起算时刻与旧组作废
 * v7：按学校只取校园经理、取不到进池（不再派城市经理）；种子单问题分类一级改「个册退费」；
 *     选「否」下送履历改「不在线退费」（10-27 拍板），v6 快照里的旧派单与旧分类作废
 * v8：退费商品逐学科加「退费金额」`refundAmount`（H5 可改，默认等于可退金额；提交退费按它提交，
 *     退费记录展示它；用户 10-27），v7 快照里不带该字段的已选商品与退费记录作废
 * v9：新增种子单 ⑧ IFLYZX-20261020-00008（调研中，已发调研短信；用户 10-27），v8 快照里没有这张单
 * v10：本单状态加「最近处理人」`lastManager`（H5 保存 / 下送 / 提交退费写入，二线转校园经理默认取它；
 *      用户 10-27 方案 B），v9 快照里的种子单不带该字段
 * v11：退费信息加「退费方」`party`（我司 / 渠道两项，H5 可选，默认「我司」；用户 10-27 评审），v10 快照里的处理表单不带该字段
 * v12：二线记名统一为登录名「张三」（种子单领取 / 调剂 / 下送履历与处理人由「王坐席」改「张三」，领取落库记登录人姓名；
 *      用户 10-27），v11 快照里的旧记名作废
 * v13：处理履历事件名「退费结果回写」改「退费结果更新」（种子单与产线结果回传落库同改；用户 10-27），v12 快照里的旧事件名作废
 * v15：回退页头「关联工单」与关联咨询（业务未定，用户 10-28），v14 快照里的关联咨询字段 `linkedConsultNos` 作废
 */
const CACHE_VERSION = 15;
const STALE_MS = 12 * 60 * 60 * 1000;

interface RefundCache { v: number; savedAt: number; tickets: Ticket[] }

function readCache(): RefundCache | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as RefundCache;
    if (c?.v !== CACHE_VERSION || typeof c.savedAt !== 'number' || Date.now() - c.savedAt > STALE_MS || !Array.isArray(c.tickets)) {
      localStorage.removeItem(LS_KEY);
      return null;
    }
    return c;
  } catch {
    return null;
  }
}

export const useRefundStore = defineStore('refund', () => {
  const revisions = ref<Record<string, number>>({});
  let tlSeq = 0;

  /* ---------------- 读 ---------------- */

  function rawOf(no: string): Ticket | undefined {
    return TICKETS.find((t) => t.no === no);
  }

  /** 工单库里的个册退费单（响应式代理） */
  function rowOf(no: string): Ticket | undefined {
    const t = rawOf(no);
    return t && isRefundTicket(t) && t.refund ? reactive(t) : undefined;
  }

  function revisionOf(no: string): number {
    return revisions.value[no] ?? 0;
  }

  /** 与某投诉单弱关联的个册退费单号 */
  function refundNoLinkedTo(complaintNo: string): string | undefined {
    return TICKETS.find((t) => isRefundTicket(t) && t.refund?.state.linkedComplaintNos?.includes(complaintNo))?.no;
  }

  /* ---------------- 写：公共 ---------------- */

  function bump(no: string) {
    revisions.value = { ...revisions.value, [no]: revisionOf(no) + 1 };
  }

  function persist() {
    try {
      const linked = new Set(TICKETS.flatMap((t) => (isRefundTicket(t) ? t.refund?.state.linkedComplaintNos ?? [] : [])));
      const tickets = TICKETS.filter((t) => (isRefundTicket(t) && t.refund) || linked.has(t.no)).map((t) => toRaw(t));
      localStorage.setItem(LS_KEY, JSON.stringify({ v: CACHE_VERSION, savedAt: Date.now(), tickets } satisfies RefundCache));
    } catch {
      /* 配额超限等忽略 */
    }
  }

  function commit(r: Ticket) {
    persist();
    bump(r.no);
  }

  function log(r: Ticket, at: number, partial: Omit<TimelineEntry, 'id' | 'when'>) {
    tlSeq += 1;
    const entry: TimelineEntry = {
      id: `refund-${r.no}-${Date.now().toString(36)}-${tlSeq}`,
      when: flashStamp(at),
      ...(partial.role === '系统' ? { systemActor: true } : {}),
      ...partial,
    };
    r.eventTimeline = [...(r.eventTimeline ?? []), entry];
  }

  const SYS = { who: '系统', role: '系统' as TlRole };

  /* ---------------- 通知 ---------------- */

  /** 待办通知：IM，同新系统委派通知；收件人只写姓名 */
  function todoIm(r: Ticket, m: RefundManager) {
    useNotifyLogStore().emit({
      ticketNo: r.no, event: REFUND_NOTIFY_EVENTS.todo, kind: 'assign', title: '待办通知',
      receivers: [m.name], content: refundTodoImText(r.no), channel: 'IM', status: '已发送',
    });
  }

  /** 到组通知：沿用咨询单待领取通知（IM 模板 IM_WO_POOLED，渠道 IM，同刷机单 notifyPoolArrival） */
  function poolIm(r: Ticket) {
    useNotifyLogStore().emit({
      ticketNo: r.no, event: REFUND_NOTIFY_EVENTS.pooled, kind: 'group', title: '到组通知',
      receivers: [REFUND_POOL_GROUP_NAME], content: refundPooledImText(r.no), channel: 'IM',
    });
  }

  function surveySms(r: Ticket, at: number) {
    const content = refundSurveySmsText(r.no, r.customer);
    useNotifyLogStore().emit({
      ticketNo: r.no, event: REFUND_NOTIFY_EVENTS.survey, kind: 'accepted', title: '调研短信',
      receivers: [`${r.customer}(客户)`], content, channel: '短信', status: '已发送',
    });
    log(r, at, { category: 'comm', action: 'sms', ...SYS, how: '短信通知', what: `发送至 ${r.customerPhone ?? r.customer}：${content}` });
  }

  /* ---------------- SLA 账本（与刷机单同名字段，读数走 readFlashSla） ---------------- */

  /** 同通用工单：建单下送起算、统计整单，此后在校园经理名下、系统退费中照常计时 */
  function startSla(r: Ticket, at: number) {
    const st = r.refund!.state;
    if (!st.slaStartedAt) st.slaStartedAt = flashStamp(at);
  }

  /**
   * 整单首响（复用通用工单首响判定）：首次响应时按首响钟剩余判达标 / 未达标并关钟，记「首响时钟关闭」履历。
   * 移动工单 H5 只有「保存」一种首响动作（下送同时保存，计入）；已首响的单不重算。
   */
  function firstResponse(r: Ticket, at: number) {
    const st = r.refund!.state;
    if (st.firstRespAt) return;
    const read = readFlashSla(st, at);
    if (read && read.firstRemainMs < 0) r.firstRespBreached = true;
    st.firstRespAt = flashStamp(at);
    const closedAt = flashStamp(at);
    log(r, at, { category: 'sla', action: 'slaClose', ...SYS, how: '首响时钟关闭', what: '', slaClose: { clock: '首响', closedAt } });
  }

  function pauseSla(r: Ticket, at: number) {
    const st = r.refund!.state;
    if (st.slaStartedAt && !st.slaPausedSince && !st.slaStoppedAt) st.slaPausedSince = flashStamp(at);
  }

  function resumeSla(r: Ticket, at: number) {
    const st = r.refund!.state;
    if (!st.slaPausedSince) return;
    st.slaPausedAccumMs = (st.slaPausedAccumMs ?? 0) + Math.max(0, at - parseFlashStamp(st.slaPausedSince).getTime());
    st.slaPausedSince = undefined;
  }

  /* ---------------- 去向 ---------------- */

  function toManager(r: Ticket, m: RefundManager, at: number, status: TicketStatus = '待响应') {
    // 外部处理人不计入任何班组（附录 C）：名下不挂组，组列显示「—」
    Object.assign(r, {
      nodeStatus: status, assignee: m.name, tab: 'mine', responded: status !== '待响应',
      groupId: undefined, groupNames: [], updatedAt: flashStamp(at),
    });
    r.refund!.state.manager = m;
    todoIm(r, m);
  }

  function toPool(r: Ticket, at: number) {
    Object.assign(r, {
      nodeStatus: '未认领', assignee: null, tab: 'pool', responded: false,
      groupId: REFUND_POOL_GROUP_ID, groupNames: [REFUND_POOL_GROUP_NAME], updatedAt: flashStamp(at),
    });
    r.refund!.state.manager = undefined;
    poolIm(r);
  }

  /* ---------------- 建单 ---------------- */

  function nextNo(now: number): string {
    const d = new Date(now);
    const used = new Set(TICKETS.map((t) => t.no));
    let seq = 900 + (TICKETS.filter((t) => isRefundTicket(t)).length % 90);
    let n = makeTicketNo(REFUND_TICKET_TYPE, seq, d);
    while (used.has(n)) {
      seq += 1;
      n = makeTicketNo(REFUND_TICKET_TYPE, seq, d);
    }
    return n;
  }

  /**
   * 建个册退费单并按建单所填校代对接人派单；校代对接人为空进教育支持组工单池。SLA 自建单下送起算。
   * `manager` 不传时按学校取校园经理，传 `null` 表示建单时清空了校代对接人。
   */
  function createRefundTicket(
    info: RefundInfo, base: RefundCreateBase, actor: RefundActor, manager?: RefundManager | null,
  ): { ticket: Ticket; message: string } {
    const now = Date.now();
    const no = nextNo(now);
    const r = reactive({
      id: `refund-rt-${no}`,
      no,
      type: REFUND_TICKET_TYPE,
      isRefund: true,
      channel: base.channel,
      ticketSource: base.ticketSource,
      title: base.title,
      smartMarks: [],
      customer: base.customer,
      vip: !!base.vip,
      customerPhone: base.customerPhone,
      customerGender: base.customerGender,
      customerRegion: base.customerRegion,
      customerAddress: base.customerAddress,
      businessType: '教育',
      businessLine: '教育业务线',
      productCategory: REFUND_PRODUCT_CATEGORY,
      product: REFUND_PRODUCT_NAME,
      problemL1: base.problemL1,
      problemL2: base.problemL2,
      problemL3: base.problemL3,
      problemDesc: base.problemDesc,
      problemDescAttachments: base.problemDescAttachments,
      priority: base.priority,
      closureMode: '正常流程',
      nodeStep: 1,
      nodeTotal: 5,
      nodeStatus: '待响应',
      assignee: null,
      tab: 'mine',
      slaText: '08:00:00', slaSub: '充足', slaState: 'ok', slaMinutes: 480,
      createdAt: flashStamp(now),
      updatedAt: flashStamp(now),
      feishuSync: 'none',
      eventTimeline: [],
      refund: { info, handle: emptyRefundHandle(info), state: {}, runs: [] } satisfies TicketRefund,
    } as Ticket);
    TICKETS.unshift(toRaw(r));
    log(r, now, { category: 'node', action: 'create', who: actor.name, role: actor.role, how: '建单', what: REFUND_TL.create(base.ticketSource) });
    startSla(r, now);
    const bySchool = resolveSchoolManager(info.schoolId);
    const m = manager === undefined ? bySchool : manager ?? undefined;
    let message: string;
    if (m) {
      toManager(r, m, now);
      const what = bySchool?.account === m.account ? REFUND_TL.dispatchManager(m) : REFUND_TL.dispatchPicked(m);
      log(r, now + 1, { category: 'node', action: 'transfer', ...SYS, how: '派单', what });
      message = REFUND_TOAST.createdToManager(no, m.name);
    } else {
      toPool(r, now);
      const what = bySchool ? REFUND_TL.dispatchPoolCleared : REFUND_TL.dispatchPool;
      log(r, now + 1, { category: 'node', action: 'transfer', ...SYS, how: '派单', what });
      message = REFUND_TOAST.createdToPool(no);
    }
    commit(r);
    return { ticket: rawOf(no)!, message };
  }

  /* ---------------- 移动工单 H5（校园经理 / 城市经理） ---------------- */

  /** H5 当前操作人：本单的外部处理人；系统退费中为最近一次提交人 */
  function h5ActorOf(no: string): RefundManager | undefined {
    const st = rawOf(no)?.refund?.state;
    return st?.manager ?? st?.lastSubmitter;
  }

  /** H5 上可操作（保存 / 下送 / 转办）：单在外部处理人名下 */
  function h5Gate(no: string): RefundActionResult {
    const r = rawOf(no);
    if (!r?.refund) return { ok: false, message: '' };
    if (r.nodeStatus === REFUND_STATUS_SYSTEM) return { ok: false, message: REFUND_TIP.h5Locked };
    if (!r.refund.state.manager || isTicketClosed(r.nodeStatus)) return { ok: false, message: '' };
    return { ok: true, message: '' };
  }

  /** 响应：待响应 → 处理中；整单首响未记过的，此刻记首响 */
  function markResponded(r: Ticket, at: number = Date.now()) {
    if (r.nodeStatus === '待响应') r.nodeStatus = '处理中';
    r.responded = true;
    firstResponse(r, at);
  }

  function h5Save(no: string, handle: RefundHandle): RefundActionResult {
    const gate = h5Gate(no);
    if (!gate.ok) return gate;
    const r = rowOf(no)!;
    const m = r.refund!.state.manager!;
    const now = Date.now();
    r.refund!.handle = { ...structuredClone(toRaw(handle)), savedBy: m.name, savedAt: flashStamp(now) };
    r.refund!.state.lastManager = m;
    r.updatedAt = flashStamp(now);
    log(r, now, { category: 'handle', action: 'handle', who: m.name, role: refundManagerTlRole(m), how: '保存', what: REFUND_TL.save });
    markResponded(r, now);
    commit(r);
    return { ok: true, message: '已保存' };
  }

  /**
   * H5 下送：「是」→ 创建退费（产线受理进「系统退费中」/ 拒绝留本人「处理中」）；
   * 「否」→ 教育支持组工单池。表单校验由页面先做（PRD 5.1 下送校验）。
   */
  function h5Forward(no: string, handle: RefundHandle): RefundActionResult {
    const gate = h5Gate(no);
    if (!gate.ok) return gate;
    const r = rowOf(no)!;
    const ref = r.refund!;
    const m = ref.state.manager!;
    const now = Date.now();
    ref.handle = { ...structuredClone(toRaw(handle)), savedBy: m.name, savedAt: flashStamp(now) };
    ref.state.lastManager = m;
    markResponded(r, now);
    if (handle.submitRefund === '否') {
      log(r, now, { category: 'node', action: 'transfer', who: m.name, role: refundManagerTlRole(m), how: '下送', what: REFUND_TL.forwardNo(handle.remark.trim()) });
      toPool(r, now);
      commit(r);
      return { ok: true, message: '已下送' };
    }
    if (inflightRefundRun(ref)) return { ok: false, message: REFUND_TIP.inflight };
    const order = findRefundOrder(handle.orderNo);
    if (order?.createError) {
      log(r, now, { category: 'node', action: 'handle', who: m.name, role: refundManagerTlRole(m), how: '提交退费', what: REFUND_TL.submitFail(order.createError) });
      r.updatedAt = flashStamp(now);
      commit(r);
      return { ok: false, message: REFUND_TIP.submitFailed(order.createError) };
    }
    const seq = ref.runs.length + 1;
    const plan = order?.plan ?? [];
    const finalStatus: RefundTaskStatus = plan[seq - 1] ?? plan[plan.length - 1] ?? '退费成功';
    const run: RefundRun = {
      id: `refund-run-${no}-${seq}-${now}`,
      seq,
      submittedAt: flashStamp(now),
      submittedAtMs: now,
      submitter: m.name,
      submitterAccount: m.account,
      taskId: `RT${no.slice(-5)}${String(seq).padStart(2, '0')}${String(now).slice(-6)}`,
      items: structuredClone(toRaw(handle.subjects)),
      status: '待审核',
      closeAuth: handle.closeAuth === '否' ? '否' : '是',
      ...(handle.closeAuth === '否' ? { notCloseReason: handle.notCloseReason.trim() } : {}),
      pendingAtMs: now + REFUND_PENDING_STEP_MS,
      settleAtMs: now + REFUND_RESULT_DELAY_MS,
      finalStatus,
      ...(finalStatus === '已驳回' ? { finalRejectReason: order?.rejectReason ?? '退费信息有误，请核对后重新提交' } : {}),
    };
    ref.runs = [...ref.runs, run];
    ref.state.lastSubmitter = m;
    ref.state.manager = undefined;
    Object.assign(r, { nodeStatus: REFUND_STATUS_SYSTEM, assignee: REFUND_SYSTEM_HANDLER, updatedAt: flashStamp(now) });
    log(r, now, { category: 'node', action: 'handle', who: m.name, role: refundManagerTlRole(m), how: '提交退费', what: REFUND_TL.submit(run.taskId, run.items) });
    commit(r);
    return { ok: true, message: REFUND_TOAST.submitted };
  }

  /** H5 转办（即本系统的调剂）：转给所选校园经理 / 城市经理，「待响应」 */
  function h5Transfer(no: string, target: RefundManager): RefundActionResult {
    const gate = h5Gate(no);
    if (!gate.ok) return gate;
    const r = rowOf(no)!;
    const from = r.refund!.state.manager!;
    const now = Date.now();
    log(r, now, { category: 'node', action: 'transfer', who: from.name, role: refundManagerTlRole(from), how: '转办', what: REFUND_TL.transfer(from.name, target) });
    toManager(r, target, now);
    commit(r);
    return { ok: true, message: '已转办' };
  }

  /* ---------------- 产线结果定时查询 ---------------- */

  /** 已提示过「单已离开系统退费中、结果未回写」的退费任务，每个只提示一次 */
  const warnedStale = new Set<string>();

  function settleDue(now: number = Date.now()): number {
    let changed = 0;
    for (const t of TICKETS) {
      if (!isRefundTicket(t) || !t.refund) continue;
      const run = inflightRefundRun(t.refund);
      if (!run || !run.settleAtMs) continue;
      // 结果只回写「系统退费中」的单：单已离开该子状态（如终态）时不改字段
      if (t.nodeStatus !== REFUND_STATUS_SYSTEM) {
        if (warnedStale.has(run.id)) continue;
        warnedStale.add(run.id);
        console.warn(`[个册退费] ${t.no} 已离开「${REFUND_STATUS_SYSTEM}」（当前「${t.nodeStatus}」），退费结果未回写`);
        continue;
      }
      const r = reactive(t);
      const ref = r.refund!;
      const live = ref.runs.find((x) => x.id === run.id)!;
      if (live.status === '待审核' && live.pendingAtMs && now >= live.pendingAtMs) {
        live.status = '待退费';
        live.resultAt = flashStamp(live.pendingAtMs);
        log(r, live.pendingAtMs, { category: 'node', action: 'handle', ...SYS, how: '退费结果更新', what: REFUND_TL.result(live.taskId, '待退费') });
        changed += 1;
      }
      const settleAt = run.settleAtMs;
      if (now < settleAt) {
        if (changed) commit(r);
        continue;
      }
      const at = settleAt;
      const fin = live.finalStatus ?? '退费成功';
      live.status = fin;
      live.resultAt = flashStamp(at);
      if (fin === '已驳回') live.rejectReason = live.finalRejectReason;
      log(r, at, { category: 'node', action: 'handle', ...SYS, how: '退费结果更新', what: REFUND_TL.result(live.taskId, fin, live.rejectReason) });
      if (fin === '已驳回') {
        const back = ref.state.lastSubmitter!;
        log(r, at + 1, { category: 'node', action: 'transfer', ...SYS, how: '驳回回退', what: REFUND_TL.rejectBack(live.rejectReason ?? '', back.name) });
        toManager(r, back, at, '处理中');
      } else {
        log(r, at + 1, { category: 'node', action: 'transfer', ...SYS, how: '自动下送', what: REFUND_TL.autoForward(fin) });
        toPool(r, at);
      }
      changed += 1;
      commit(r);
    }
    return changed;
  }

  /* ---------------- PC：教育支持组（二线） ---------------- */

  /** 领取（通用落库 `claimPoolTicket` 之后）：落快照、刷新处理页 */
  function afterClaim(no: string) {
    const r = rowOf(no);
    if (r) releaseManagerOf(r);
  }

  /**
   * 单从外部处理人名下被领走 / 接走（催补待回领取等通用落库之后）：清掉外部处理人，
   * 归属回教育支持组，落快照。
   */
  function releaseManager(no: string) {
    const r = rowOf(no);
    if (r) releaseManagerOf(r);
  }

  function releaseManagerOf(r: Ticket) {
    r.refund!.state.manager = undefined;
    if (!r.groupId) Object.assign(r, { groupId: REFUND_POOL_GROUP_ID, groupNames: [REFUND_POOL_GROUP_NAME] });
    commit(r);
  }

  /** 同组内调剂给组员（非外部处理人）：同咨询单落「待响应」，清掉外部处理人 */
  function assignToMember(no: string, name: string, by: RefundActor, reason?: string): RefundActionResult {
    const r = rowOf(no);
    if (!r) return { ok: false, message: '' };
    if (r.nodeStatus === REFUND_STATUS_SYSTEM) return { ok: false, message: REFUND_TIP.inProgress };
    const now = Date.now();
    log(r, now, { category: 'node', action: 'transfer', who: by.name, role: by.role, how: '调剂', what: `调剂给 ${name}${reason?.trim() ? `；调剂原因：${reason.trim()}` : ''}` });
    Object.assign(r, { nodeStatus: '待响应', assignee: name, tab: 'mine', responded: false, updatedAt: flashStamp(now) });
    releaseManagerOf(r);
    return { ok: true, message: `已同组内调剂至 ${name}` };
  }

  /**
   * 交给校园经理 / 城市经理：带 `reason` 即二线「转校园经理」（履历「转校园经理」、原因必填，用户 10-27 方案 B）；
   * 不带为历史「调剂给校园经理」（查询中心旧路径）。落「待响应」、处理组「—」、发待办通知；SLA 不重置、首响不重算。
   */
  function assignToManager(no: string, m: RefundManager, by: RefundActor, reason?: string): RefundActionResult {
    const r = rowOf(no);
    if (!r) return { ok: false, message: '' };
    if (r.nodeStatus === REFUND_STATUS_SYSTEM || inflightRefundRun(r.refund)) return { ok: false, message: REFUND_TIP.inProgress };
    const now = Date.now();
    const why = reason?.trim();
    if (why) {
      log(r, now, { category: 'node', action: 'transfer', who: by.name, role: by.role, how: REFUND_TO_MANAGER.label, what: REFUND_TL.toManager(by.name, m, why) });
    } else {
      log(r, now, { category: 'node', action: 'transfer', who: by.name, role: by.role, how: '调剂', what: REFUND_TL.assignManager(m) });
    }
    toManager(r, m, now);
    commit(r);
    return { ok: true, message: why ? REFUND_TO_MANAGER.done : `已调剂给 ${m.name}` };
  }

  /** 二线下送：进「调研中」，发调研短信（不经工单运营审核） */
  function forwardToSurvey(no: string, by: RefundActor): RefundActionResult {
    const r = rowOf(no);
    if (!r) return { ok: false, message: '' };
    const now = Date.now();
    Object.assign(r, { nodeStatus: '调研中', updatedAt: flashStamp(now), responded: true });
    log(r, now, { category: 'node', action: 'transfer', who: by.name, role: by.role, how: '下送', what: REFUND_TL.forwardSurvey });
    pauseSla(r, now);
    surveySms(r, now + 1);
    commit(r);
    return { ok: true, message: '已下送，工单进入「调研中」' };
  }

  /** 通用动作改了子状态后同步回工单库（催补拉回、撤回等） */
  function syncStatus(no: string, status: string, note?: { how: string; what: string }) {
    const r = rowOf(no);
    if (!r || r.nodeStatus === status) return;
    const now = Date.now();
    if (note) log(r, now, { category: 'node', action: 'handle', ...SYS, ...note });
    if (r.nodeStatus === '调研中') resumeSla(r, now);
    if (status === '调研中') pauseSla(r, now);
    r.nodeStatus = status as TicketStatus;
    r.updatedAt = flashStamp(now);
    commit(r);
  }

  /** 处理页「保存」/ 外呼 / 短信 / 邮件（二线首次响应动作集）：待响应 → 处理中，未记过整单首响的记首响 */
  function markRespondedOnPage(no: string) {
    const r = rowOf(no);
    if (!r || r.responded) return;
    markResponded(r);
    commit(r);
  }

  /** 关联投诉（弱关联，两单各自流转，本单状态不变） */
  function linkComplaint(no: string, complaint: Ticket, by: RefundActor): RefundActionResult {
    const r = rowOf(no);
    if (!r) return { ok: false, message: '' };
    const now = Date.now();
    r.refund!.state.linkedComplaintNos = [...(r.refund!.state.linkedComplaintNos ?? []), complaint.no];
    log(r, now, { category: 'relate', action: 'relate', who: by.name, role: by.role, how: '关联投诉', what: REFUND_TL.linkComplaint(complaint.no) });
    // 建单弹窗在回调之后才把新单写进工单库：这里先落，关联履历与快照才有处可写
    if (!rawOf(complaint.no)) TICKETS.unshift(complaint);
    const c = rawOf(complaint.no);
    if (c) {
      c.eventTimeline = [...(c.eventTimeline ?? []), {
        id: `refund-link-${complaint.no}-${now}`, category: 'relate', action: 'relate', who: by.name, role: by.role,
        how: '关联投诉', what: REFUND_TL.linkedFromRefund(no), when: flashStamp(now),
      }];
    }
    commit(r);
    return { ok: true, message: `已关联投诉单 ${complaint.no}` };
  }

  /**
   * 催单 / 新建补充的催补通知（第 6 章）：外部处理人名下发给当前处理人；
   * 系统退费中不拉回，发给最近一次提交退费的校园经理。IM，同新系统催单 / 补充通知；
   * `detail` 为催单内容 / 补充类型。其余子状态同咨询单。
   */
  function onCustomerUrge(no: string, kind: 'urge' | 'supplement', detail = '') {
    const r = rawOf(no);
    if (!r?.refund) return;
    const st = r.refund.state;
    const to = r.nodeStatus === REFUND_STATUS_SYSTEM ? st.lastSubmitter : st.manager;
    if (!to) return;
    useNotifyLogStore().emit({
      ticketNo: no, event: kind === 'urge' ? REFUND_NOTIFY_EVENTS.urge : REFUND_NOTIFY_EVENTS.supplement,
      kind, title: '催补通知',
      receivers: [to.name], content: refundUrgeImText(no, r.title, kind, detail), channel: 'IM', status: '已发送',
    });
  }

  /* ---------------- 装载 ---------------- */

  function hydrate() {
    const cached = readCache();
    if (cached) {
      for (const saved of cached.tickets) {
        const existing = rawOf(saved.no);
        if (existing) {
          (Object.keys(existing) as (keyof Ticket)[]).forEach((k) => {
            if (!(k in saved)) delete (existing as unknown as Record<string, unknown>)[k];
          });
          Object.assign(existing, saved);
        } else {
          TICKETS.push(saved);
        }
      }
    }
    // 种子单的通知记录（待办通知 / 到组通知 / 调研短信）：按 id 幂等补进通知记录；
    // 已落通知记录缓存的同 id 条目按种子现值覆盖（文案、收件人、渠道随种子更新）
    const notifyLog = useNotifyLogStore();
    REFUND_SEEDS.notifies.forEach((n, i) => {
      const id = `refund-seed-${n.ticketNo}-${i}`;
      const rec = {
        id, ticketNo: n.ticketNo, event: n.event, kind: n.kind, title: n.title,
        receiver: n.receiver, when: n.when, channel: n.channel, status: n.status, content: n.content,
      };
      const idx = notifyLog.records.findIndex((x) => x.id === id);
      if (idx >= 0) Object.assign(notifyLog.records[idx], rec);
      else notifyLog.records.push(rec);
    });
  }

  function syncFromOtherTab() {
    const cached = readCache();
    if (!cached) return;
    for (const saved of cached.tickets) {
      const existing = rawOf(saved.no);
      if (existing) {
        const r = reactive(existing) as unknown as Record<string, unknown>;
        Object.keys(existing).forEach((k) => { if (!(k in saved)) delete r[k]; });
        Object.assign(r, saved);
      } else {
        TICKETS.push(saved);
      }
      bump(saved.no);
    }
  }

  hydrate();
  settleDue();
  persist();
  if (typeof window !== 'undefined') {
    window.setInterval(() => settleDue(), 1000);
    window.addEventListener('storage', (e) => {
      if (e.key === LS_KEY && e.newValue) syncFromOtherTab();
    });
  }

  return {
    revisions,
    rowOf,
    revisionOf,
    refundNoLinkedTo,
    createRefundTicket,
    h5ActorOf,
    h5Gate,
    h5Save,
    h5Forward,
    h5Transfer,
    settleDue,
    afterClaim,
    releaseManager,
    assignToMember,
    assignToManager,
    forwardToSurvey,
    syncStatus,
    markRespondedOnPage,
    linkComplaint,
    onCustomerUrge,
  };
});
