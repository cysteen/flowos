/**
 * 个册退费单 · 工单库样本（1120 个册退费工单）。八张，覆盖各阶段：
 * ① 校园经理待处理（待响应）；② 系统退费中；③ 已驳回（回校园经理「处理中」）；
 * ④ 退费成功 · 教育支持组工单池（首次驳回、再次提交成功）；⑤ 部分完成 · 教育支持组组员处理中；
 * ⑥ 兜底 · 教育支持组工单池（学校未取到校园经理）；⑦ 已结案 · 已发调研短信（兜底进池后调剂给城市经理）；⑧ 调研中 · 已发调研短信。
 *
 * 时刻相对装载时刻推算：SLA 账本（建单下送起算、统计整单，10-27）读数随之自洽；整单首响取校园经理
 * 在 H5 首次保存 / 下送的时刻（`firstRespAt`），超 30 分钟才响的记首响未达标（④）。
 * 经校园经理 / 城市经理提交过退费的单，「最近处理人」`lastManager` 即该人（二线转校园经理默认取它）。
 * 并入工单库的位置：`mock/tickets.ts`（排在种子单号集合之后，处理页按「本单自有数据」展示）。
 */
import type { Ticket } from '@/views/tickets/types/ticket';
import type { TimelineEntry, TlAction, TlCategory, TlRole } from '@/views/tickets/types/ticketDetail';
import type { NotifyKind } from '@/views/tickets/types/operationTabs';
import { TICKET_NO_PREFIX } from '@/constants/ticketNo';
import { flashStamp } from '@/views/tickets/types/flash';
import {
  REFUND_POOL_GROUP_ID, REFUND_POOL_GROUP_NAME, REFUND_PRODUCT_CATEGORY, REFUND_PRODUCT_NAME,
  REFUND_STATUS_SYSTEM, REFUND_SYSTEM_HANDLER, REFUND_TAG_L1, REFUND_TAG_L2, REFUND_TAG_L3S,
  REFUND_TICKET_TYPE, REFUND_TL,
  emptyRefundHandle, refundPooledImText, refundSurveySmsText, refundTodoImText, refundManagerTlRole,
  sumRefundAmount,
  type RefundInfo, type RefundManager, type RefundRun, type RefundState, type RefundSubject, type TicketRefund,
} from '@/views/tickets/types/refund';
import { CAMPUS_MANAGERS, CITY_MANAGERS } from './managers';

export interface RefundSeedNotify {
  ticketNo: string;
  event: string;
  kind: NotifyKind;
  status: string;
  title: string;
  receiver: string;
  channel: string;
  content: string;
  when: string;
}

export interface RefundSeedBundle {
  tickets: Ticket[];
  notifies: RefundSeedNotify[];
}

const DAY = '20261020';
const no = (n: number) => `${TICKET_NO_PREFIX[REFUND_TICKET_TYPE]}-${DAY}-${String(n).padStart(5, '0')}`;

/** 建单坐席（演示用户，见 `mock/users.ts`） */
const AGENT = '刘一线';
const AGENT_ROLE: TlRole = '一线坐席';
/**
 * 教育支持组组员：二线专员演示账号 13857985858 的登录名（用户 10-27：个册退费单上的二线记名统一为「张三」，
 * 与领取、转校园经理等现场动作记的登录人姓名一致；不沿用老四类的演示处理人 `WORKBENCH_HANDLER`）
 */
const AUDITOR = '张三';
const AUDITOR_ROLE: TlRole = '二线专员';
const SOURCE = '电话';
const L3 = REFUND_TAG_L3S[0];
const TITLE = `${REFUND_PRODUCT_NAME} · ${L3} · ${SOURCE}`;

let tlSeq = 0;
function tl(
  when: string, category: TlCategory, action: TlAction, who: string, role: TlRole, how: string, what: string,
): TimelineEntry {
  tlSeq += 1;
  return {
    id: `refund-seed-${tlSeq}`, category, action, who, role, how, what, when,
    ...(role === '系统' ? { systemActor: true } : {}),
  };
}

/** 整单首响关钟履历（同通用工单「首响时钟关闭」） */
function firstClose(when: string): TimelineEntry {
  return { ...tl(when, 'sla', 'slaClose', '系统', '系统', '首响时钟关闭', ''), slaClose: { clock: '首响', closedAt: when } };
}

function subj(commodityName: string, commodityId: string, payOrderId: string, list: [string, string, number][]): RefundSubject[] {
  return list.map(([subjectCode, subjectName, amount]) => ({ commodityId, commodityName, payOrderId, subjectCode, subjectName, amount, refundAmount: amount }));
}

const SLA_OPEN = { slaText: '08:00:00', slaSub: '充足', slaState: 'ok' as const, slaMinutes: 480 };
const SLA_DONE = { slaText: '—', slaSub: '已结案', slaState: 'ok' as const, slaMinutes: 9999 };

function row(
  n: number,
  p: {
    customer: string;
    phone: string;
    info: RefundInfo;
    refund: Omit<TicketRefund, 'info'>;
    timeline: TimelineEntry[];
  } & Pick<Ticket, 'nodeStatus' | 'assignee' | 'tab' | 'createdAt' | 'updatedAt'> & Omit<Partial<Ticket>, 'refund'>,
): Ticket {
  const { customer, phone, info, refund, timeline, ...rest } = p;
  return {
    id: `refund-${n}`,
    no: no(n),
    type: REFUND_TICKET_TYPE,
    isRefund: true,
    channel: '电话',
    ticketSource: SOURCE,
    title: TITLE,
    smartMarks: [],
    customer,
    vip: false,
    customerPhone: phone,
    businessType: '教育',
    businessLine: '教育业务线',
    productCategory: REFUND_PRODUCT_CATEGORY,
    product: REFUND_PRODUCT_NAME,
    problemL1: REFUND_TAG_L1,
    problemL2: REFUND_TAG_L2,
    problemL3: L3,
    problemDesc: `学生${info.studentName}（${info.schoolName}）家长再次来电，反映个册退费申请提交后 5 个工作日仍未到账，要求尽快退费。`,
    priority: 'P2',
    nodeStep: 2,
    nodeTotal: 5,
    groupId: REFUND_POOL_GROUP_ID,
    groupNames: [REFUND_POOL_GROUP_NAME],
    responded: true,
    ...SLA_OPEN,
    ...rest,
    eventTimeline: timeline,
    refund: { info, ...refund },
  } as Ticket;
}

function run(
  seq: number, ticketNo: string, m: RefundManager, items: RefundSubject[], submittedMs: number,
  status: RefundRun['status'], resultMs?: number, rejectReason?: string,
): RefundRun {
  return {
    id: `refund-run-${ticketNo}-${seq}`,
    seq,
    submittedAt: flashStamp(submittedMs),
    submittedAtMs: submittedMs,
    submitter: m.name,
    submitterAccount: m.account,
    taskId: `RT${ticketNo.slice(-5)}${String(seq).padStart(2, '0')}${String(submittedMs).slice(-6)}`,
    items,
    status,
    ...(rejectReason ? { rejectReason } : {}),
    ...(resultMs ? { resultAt: flashStamp(resultMs) } : {}),
    closeAuth: '是',
  };
}

export function buildRefundSeeds(nowMs: number): RefundSeedBundle {
  tlSeq = 0;
  const MIN = 60_000;
  const HOUR = 60 * MIN;
  const at = (ms: number) => flashStamp(ms);
  const tickets: Ticket[] = [];
  const notifies: RefundSeedNotify[] = [];
  const todo = (ticketNo: string, m: RefundManager, ms: number) => notifies.push({
    ticketNo, event: 'ticket.refund.todo', kind: 'assign', status: '已发送', title: '待办通知',
    receiver: m.name, channel: 'IM', content: refundTodoImText(ticketNo), when: at(ms),
  });
  const pooled = (ticketNo: string, ms: number) => notifies.push({
    ticketNo, event: 'ticket.pooled', kind: 'group', status: '未读', title: '到组通知',
    receiver: REFUND_POOL_GROUP_NAME, channel: 'IM', content: refundPooledImText(ticketNo), when: at(ms),
  });

  /* ① 校园经理待处理 */
  {
    const n = no(1);
    const m = CAMPUS_MANAGERS.yangfan;
    const c = nowMs - 20 * MIN;
    const items = subj('2026春季个性化学习手册（高一）', 'CM-26S-G1-01', 'PO20260301007701', [['02', '数学', 128], ['05', '物理', 96], ['06', '化学', 96]]);
    const info: RefundInfo = {
      schoolId: 'SCH-340103-001', schoolName: '合肥市第一中学', schoolRegion: '安徽省 / 合肥市 / 庐阳区',
      studentName: '林子涵', studentCode: '47429', orderNo: 'PO20260301007701', refundableAmount: sumRefundAmount(items), reason: 6,
    };
    // 建单即起算：校园经理名下照常计时，未保存过 → 首响钟在走
    const state: RefundState = { manager: m, slaStartedAt: at(c) };
    tickets.push(row(1, {
      customer: '林女士', phone: '13955100101', info,
      refund: { handle: emptyRefundHandle(info), state, runs: [] },
      nodeStatus: '待响应', assignee: m.name, tab: 'mine', responded: false,
      // 外部处理人名下 / 系统退费中不计入任何班组（附录 C）
      groupId: undefined, groupNames: [],
      createdAt: at(c), updatedAt: at(c + MIN),
      timeline: [
        tl(at(c), 'node', 'create', AGENT, AGENT_ROLE, '建单', REFUND_TL.create(SOURCE)),
        tl(at(c + 20_000), 'node', 'transfer', '系统', '系统', '派单', REFUND_TL.dispatchManager(m)),
      ],
    }));
    todo(n, m, c + 20_000);
  }

  /* ② 系统退费中 */
  {
    const n = no(2);
    const m = CAMPUS_MANAGERS.yangfan;
    const c = nowMs - 5 * HOUR;
    const sv = c + 20 * MIN;
    const s = nowMs - 3 * HOUR;
    const items = subj('2026春季个性化学习手册（高三）', 'CM-26S-G3-02', 'PO20260303010452', [['01', '语文', 132], ['03', '英语', 132]]);
    const info: RefundInfo = {
      schoolId: 'SCH-340111-168', schoolName: '合肥一六八中学', schoolRegion: '安徽省 / 合肥市 / 包河区',
      studentName: '刘若溪', studentCode: '56342', orderNo: 'PO20260303010452', refundableAmount: sumRefundAmount(items), reason: 5,
    };
    const r1 = run(1, n, m, items, s, '待退费', s + 40 * MIN);
    tickets.push(row(2, {
      customer: '刘先生', phone: '13955100102', info,
      refund: {
        handle: {
          ...emptyRefundHandle(info), submitRefund: '是', commResult: '已联系达成一致', subjects: items,
          reasonDesc: '学校本学期取消个册统一订购，家长申请退回剩余学科费用', closeAuth: '是', savedBy: m.name, savedAt: at(s),
        },
        state: { lastSubmitter: m, lastManager: m, slaStartedAt: at(c), firstRespAt: at(sv) },
        runs: [r1],
      },
      nodeStatus: REFUND_STATUS_SYSTEM, assignee: REFUND_SYSTEM_HANDLER, tab: 'mine',
      // 外部处理人名下 / 系统退费中不计入任何班组（附录 C）
      groupId: undefined, groupNames: [],
      createdAt: at(c), updatedAt: at(s + 40 * MIN),
      timeline: [
        tl(at(c), 'node', 'create', AGENT, AGENT_ROLE, '建单', REFUND_TL.create(SOURCE)),
        tl(at(c + 15_000), 'node', 'transfer', '系统', '系统', '派单', REFUND_TL.dispatchManager(m)),
        tl(at(sv), 'handle', 'handle', m.name, refundManagerTlRole(m), '保存', REFUND_TL.save),
        firstClose(at(sv)),
        tl(at(s), 'node', 'handle', m.name, refundManagerTlRole(m), '提交退费', REFUND_TL.submit(r1.taskId, items)),
        tl(at(s + 40 * MIN), 'node', 'handle', '系统', '系统', '退费结果更新', REFUND_TL.result(r1.taskId, '待退费')),
      ],
    }));
    todo(n, m, c + 15_000);
  }

  /* ③ 已驳回：回最近一次提交退费的校园经理「处理中」 */
  {
    const n = no(3);
    const m = CAMPUS_MANAGERS.wujing;
    const c = nowMs - 30 * HOUR;
    const sv = c + 25 * MIN;
    const s = nowMs - 6 * HOUR;
    const rj = nowMs - 2 * HOUR;
    const reason = '退费学科与已交付记录不符，请核对后重新提交';
    const items = subj('2026春季个性化学习手册（高二）', 'CM-26S-G2-03', 'PO20260305012288', [['03', '英语', 112.5], ['02', '数学', 112.5]]);
    const info: RefundInfo = {
      schoolId: 'SCH-340104-050', schoolName: '合肥市五十中学', schoolRegion: '安徽省 / 合肥市 / 蜀山区',
      studentName: '周雨桐', studentCode: '52016', orderNo: 'PO20260305012288', refundableAmount: sumRefundAmount(items), reason: 7,
    };
    const r1 = run(1, n, m, items, s, '已驳回', rj, reason);
    tickets.push(row(3, {
      customer: '周女士', phone: '13955100103', info,
      refund: {
        handle: {
          ...emptyRefundHandle(info), submitRefund: '是', commResult: '已联系达成一致', subjects: items,
          reasonDesc: '学生反馈学习手册内容与课堂进度不匹配，申请退费', closeAuth: '是', savedBy: m.name, savedAt: at(s),
        },
        state: { manager: m, lastSubmitter: m, lastManager: m, slaStartedAt: at(c), firstRespAt: at(sv) },
        runs: [r1],
      },
      nodeStatus: '处理中', assignee: m.name, tab: 'mine',
      // 外部处理人名下 / 系统退费中不计入任何班组（附录 C）
      groupId: undefined, groupNames: [],
      createdAt: at(c), updatedAt: at(rj),
      timeline: [
        tl(at(c), 'node', 'create', AGENT, AGENT_ROLE, '建单', REFUND_TL.create(SOURCE)),
        tl(at(c + 15_000), 'node', 'transfer', '系统', '系统', '派单', REFUND_TL.dispatchManager(m)),
        tl(at(sv), 'handle', 'handle', m.name, refundManagerTlRole(m), '保存', REFUND_TL.save),
        firstClose(at(sv)),
        tl(at(s), 'node', 'handle', m.name, refundManagerTlRole(m), '提交退费', REFUND_TL.submit(r1.taskId, items)),
        tl(at(rj), 'node', 'handle', '系统', '系统', '退费结果更新', REFUND_TL.result(r1.taskId, '已驳回', reason)),
        tl(at(rj + 1000), 'node', 'transfer', '系统', '系统', '驳回回退', REFUND_TL.rejectBack(reason, m.name)),
      ],
    }));
    todo(n, m, c + 15_000);
    todo(n, m, rj + 1000);
  }

  /* ④ 退费成功 · 教育支持组工单池（首次驳回、再次提交成功；校园经理建单 5 小时后才首次下送 → 首响未达标） */
  {
    const n = no(4);
    const m = CAMPUS_MANAGERS.wujing;
    const c = nowMs - 3 * 24 * HOUR;
    const s1 = c + 5 * HOUR;
    const rj = c + 20 * HOUR;
    const s2 = nowMs - 4 * HOUR;
    const ok = nowMs - 20 * MIN;
    const reason = '退费学科与已交付记录不符，请核对后重新提交';
    const all = subj('2026春季个性化学习手册（高一）', 'CM-26S-G1-01', 'PO20260310021044', [['02', '数学', 128], ['03', '英语', 128], ['05', '物理', 96]]);
    const info: RefundInfo = {
      schoolId: 'SCH-340104-007', schoolName: '合肥市第七中学', schoolRegion: '安徽省 / 合肥市 / 蜀山区',
      studentName: '何宇航', studentCode: '58731', orderNo: 'PO20260310021044', refundableAmount: sumRefundAmount(all), reason: 1,
    };
    const r1 = run(1, n, m, all, s1, '已驳回', rj, reason);
    const items2 = all.slice(0, 2);
    const r2 = run(2, n, m, items2, s2, '退费成功', ok);
    tickets.push(row(4, {
      customer: '何先生', phone: '13955100104', info,
      refund: {
        handle: {
          ...emptyRefundHandle(info), submitRefund: '是', commResult: '已联系达成一致', subjects: items2,
          reasonDesc: '家长重复购买，申请退回重复订购的数学、英语两科', closeAuth: '是', savedBy: m.name, savedAt: at(s2),
        },
        state: { lastSubmitter: m, lastManager: m, slaStartedAt: at(c), firstRespAt: at(s1) },
        runs: [r1, r2],
      },
      nodeStatus: '未认领', assignee: null, tab: 'pool', responded: false, firstRespBreached: true,
      createdAt: at(c), updatedAt: at(ok + 1000),
      timeline: [
        tl(at(c), 'node', 'create', AGENT, AGENT_ROLE, '建单', REFUND_TL.create(SOURCE)),
        tl(at(c + 15_000), 'node', 'transfer', '系统', '系统', '派单', REFUND_TL.dispatchManager(m)),
        tl(at(s1), 'node', 'handle', m.name, refundManagerTlRole(m), '提交退费', REFUND_TL.submit(r1.taskId, all)),
        firstClose(at(s1)),
        tl(at(rj), 'node', 'handle', '系统', '系统', '退费结果更新', REFUND_TL.result(r1.taskId, '已驳回', reason)),
        tl(at(rj + 1000), 'node', 'transfer', '系统', '系统', '驳回回退', REFUND_TL.rejectBack(reason, m.name)),
        tl(at(s2), 'node', 'handle', m.name, refundManagerTlRole(m), '提交退费', REFUND_TL.submit(r2.taskId, items2)),
        tl(at(ok), 'node', 'handle', '系统', '系统', '退费结果更新', REFUND_TL.result(r2.taskId, '退费成功')),
        tl(at(ok + 1000), 'node', 'transfer', '系统', '系统', '自动下送', REFUND_TL.autoForward('退费成功')),
      ],
    }));
    todo(n, m, c + 15_000);
    todo(n, m, rj + 1000);
    pooled(n, ok + 1000);
  }

  /* ⑤ 部分完成 · 教育支持组组员处理中 */
  {
    const n = no(5);
    const m = CAMPUS_MANAGERS.maxiao;
    const c = nowMs - 28 * HOUR;
    const sv = c + 15 * MIN;
    const s = nowMs - 8 * HOUR;
    const done = nowMs - 3 * HOUR;
    const claim = nowMs - 2 * HOUR;
    const items = subj('2026春季个性化学习手册（高三）', 'CM-26S-G3-02', 'PO20260308020615', [['02', '数学', 150], ['07', '生物', 88]]);
    const info: RefundInfo = {
      schoolId: 'SCH-341502-001', schoolName: '六安第一中学', schoolRegion: '安徽省 / 六安市 / 金安区',
      studentName: '陈思远', studentCode: '61873', orderNo: 'PO20260308020615', refundableAmount: sumRefundAmount(items), reason: 4,
    };
    const r1 = run(1, n, m, items, s, '部分完成', done);
    tickets.push(row(5, {
      customer: '陈女士', phone: '13955100105', info,
      refund: {
        handle: {
          ...emptyRefundHandle(info), submitRefund: '是', commResult: '已联系未达成一致', subjects: items,
          commNote: '家长要求生物学科一并退费，生物已交付完毕不可退，需协助沟通',
          reasonDesc: '学生转校至外省，申请退回剩余学科费用', closeAuth: '是', savedBy: m.name, savedAt: at(s),
        },
        state: { lastSubmitter: m, lastManager: m, slaStartedAt: at(c), firstRespAt: at(sv) },
        runs: [r1],
      },
      nodeStatus: '处理中', assignee: AUDITOR, tab: 'mine',
      createdAt: at(c), updatedAt: at(claim + 10 * MIN),
      timeline: [
        tl(at(c), 'node', 'create', AGENT, AGENT_ROLE, '建单', REFUND_TL.create(SOURCE)),
        tl(at(c + 15_000), 'node', 'transfer', '系统', '系统', '派单', REFUND_TL.dispatchManager(m)),
        tl(at(sv), 'handle', 'handle', m.name, refundManagerTlRole(m), '保存', REFUND_TL.save),
        firstClose(at(sv)),
        tl(at(s), 'node', 'handle', m.name, refundManagerTlRole(m), '提交退费', REFUND_TL.submit(r1.taskId, items)),
        tl(at(done), 'node', 'handle', '系统', '系统', '退费结果更新', REFUND_TL.result(r1.taskId, '部分完成')),
        tl(at(done + 1000), 'node', 'transfer', '系统', '系统', '自动下送', REFUND_TL.autoForward('部分完成')),
        tl(at(claim), 'node', 'accept', AUDITOR, AUDITOR_ROLE, '领取', `${AUDITOR} 从池中领取本单。`),
      ],
    }));
    todo(n, m, c + 15_000);
    pooled(n, done + 1000);
  }

  /* ⑥ 兜底 · 教育支持组工单池（学校未取到校园经理） */
  {
    const n = no(6);
    const c = nowMs - 12 * MIN;
    const items = subj('2026春季个性化学习手册（高二）', 'CM-26S-G2-03', 'PO20260306015530', [['05', '物理', 104]]);
    const info: RefundInfo = {
      schoolId: 'SCH-340202-001', schoolName: '芜湖市第一中学', schoolRegion: '安徽省 / 芜湖市 / 镜湖区',
      studentName: '赵一鸣', studentCode: '70125', orderNo: 'PO20260306015530', refundableAmount: sumRefundAmount(items), reason: 2,
    };
    tickets.push(row(6, {
      customer: '赵先生', phone: '13955100106', info,
      refund: { handle: emptyRefundHandle(info), state: { slaStartedAt: at(c) }, runs: [] },
      nodeStatus: '未认领', assignee: null, tab: 'pool', responded: false,
      createdAt: at(c), updatedAt: at(c),
      timeline: [
        tl(at(c), 'node', 'create', AGENT, AGENT_ROLE, '建单', REFUND_TL.create(SOURCE)),
        tl(at(c + 20_000), 'node', 'transfer', '系统', '系统', '派单', REFUND_TL.dispatchPool),
      ],
    }));
    pooled(n, c + 20_000);
  }

  /* ⑦ 已结案 · 已发调研短信（学校无校园经理进池，二线调剂给城市经理处理） */
  {
    const n = no(7);
    const m = CITY_MANAGERS.chengli;
    const c = nowMs - 2 * 24 * HOUR;
    const c0 = c + 5 * MIN;
    const s = c + 25 * MIN;
    const ok = c + 3 * HOUR;
    const claim = ok + 20 * MIN;
    const fwd = ok + 1 * HOUR;
    const closed = fwd + 26 * HOUR;
    const items = subj('2026春季个性化学习手册（高一）', 'CM-26S-G1-01', 'PO20260302009947', [['02', '数学', 128], ['03', '英语', 128]]);
    const info: RefundInfo = {
      schoolId: 'SCH-340111-008', schoolName: '合肥八中', schoolRegion: '安徽省 / 合肥市 / 包河区',
      studentName: '王可欣', studentCode: '38820', orderNo: 'PO20260302009947', refundableAmount: sumRefundAmount(items), reason: 3,
    };
    const r1 = run(1, n, m, items, s, '退费成功', ok);
    const startedMs = ok + 1000;
    tickets.push(row(7, {
      customer: '王女士', phone: '13955100107', info,
      refund: {
        handle: {
          ...emptyRefundHandle(info), submitRefund: '是', commResult: '已联系达成一致', subjects: items,
          reasonDesc: '学生为教师子女，按学校政策免费使用，申请退回已缴费用', closeAuth: '否',
          notCloseReason: '教师子女按学校政策继续使用', savedBy: m.name, savedAt: at(s),
        },
        state: {
          lastSubmitter: m, lastManager: m, slaStartedAt: at(c), firstRespAt: at(s),
          slaPausedAccumMs: 0, slaStoppedAt: at(fwd), slaOutcome: 'met',
        },
        runs: [{ ...r1, closeAuth: '否', notCloseReason: '教师子女按学校政策继续使用' }],
      },
      nodeStatus: '已结案', assignee: AUDITOR, tab: 'done',
      ...SLA_DONE,
      createdAt: at(c), updatedAt: at(closed),
      timeline: [
        tl(at(c), 'node', 'create', AGENT, AGENT_ROLE, '建单', REFUND_TL.create(SOURCE)),
        tl(at(c + 15_000), 'node', 'transfer', '系统', '系统', '派单', REFUND_TL.dispatchPool),
        tl(at(c0), 'node', 'accept', AUDITOR, AUDITOR_ROLE, '领取', `${AUDITOR} 从池中领取本单。`),
        tl(at(c0 + MIN), 'node', 'transfer', AUDITOR, AUDITOR_ROLE, '调剂', REFUND_TL.assignManager(m)),
        tl(at(s), 'node', 'handle', m.name, refundManagerTlRole(m), '提交退费', REFUND_TL.submit(r1.taskId, items)),
        firstClose(at(s)),
        tl(at(ok), 'node', 'handle', '系统', '系统', '退费结果更新', REFUND_TL.result(r1.taskId, '退费成功')),
        tl(at(startedMs), 'node', 'transfer', '系统', '系统', '自动下送', REFUND_TL.autoForward('退费成功')),
        tl(at(claim), 'node', 'accept', AUDITOR, AUDITOR_ROLE, '领取', `${AUDITOR} 从池中领取本单。`),
        tl(at(fwd), 'node', 'transfer', AUDITOR, AUDITOR_ROLE, '下送', REFUND_TL.forwardSurvey),
        tl(at(closed), 'node', 'resolved', '系统', '系统', '结案', '回访已解决，工单结案。'),
      ],
    }));
    pooled(n, c + 15_000);
    todo(n, m, c0 + MIN);
    pooled(n, startedMs);
    notifies.push({
      ticketNo: n, event: 'ticket.survey.sent', kind: 'accepted', status: '已发送', title: '调研短信',
      receiver: '王女士(客户)', channel: '短信', content: refundSurveySmsText(n, '王女士'), when: at(fwd),
    });
  }

  /* ⑧ 调研中 · 退费成功后教育支持组领取、审核下送，已发调研短信（解决时效暂止） */
  {
    const n = no(8);
    const m = CAMPUS_MANAGERS.maxiao;
    const c = nowMs - 26 * HOUR;
    const sv = c + 18 * MIN;
    const s = c + 30 * MIN;
    const ok = c + 3 * HOUR;
    const pooledMs = ok + 1000;
    const claim = ok + 30 * MIN;
    const fwd = nowMs - 2 * HOUR;
    const items = subj('2026春季个性化学习手册（高二）', 'CM-26S-G2-03', 'PO20260307018826', [['06', '化学', 96], ['05', '物理', 104]]);
    const info: RefundInfo = {
      schoolId: 'SCH-341502-001', schoolName: '六安第一中学', schoolRegion: '安徽省 / 六安市 / 金安区',
      studentName: '许诺', studentCode: '63308', orderNo: 'PO20260307018826', refundableAmount: sumRefundAmount(items), reason: 1,
    };
    const r1 = run(1, n, m, items, s, '退费成功', ok);
    const sms = refundSurveySmsText(n, '许女士');
    tickets.push(row(8, {
      customer: '许女士', phone: '13955100108', info,
      refund: {
        handle: {
          ...emptyRefundHandle(info), submitRefund: '是', commResult: '已联系达成一致', subjects: items,
          reasonDesc: '家长误购高二册，学生实际就读高一，申请退回化学、物理两科', closeAuth: '是', savedBy: m.name, savedAt: at(s),
        },
        state: {
          lastSubmitter: m, lastManager: m, slaStartedAt: at(c), firstRespAt: at(sv),
          slaPausedAccumMs: 0, slaPausedSince: at(fwd),
        },
        runs: [r1],
      },
      nodeStatus: '调研中', assignee: AUDITOR, tab: 'mine', nodeStep: 4,
      slaText: '—', slaSub: '调研中', slaState: 'ok', slaMinutes: 9999,
      createdAt: at(c), updatedAt: at(fwd + 1000),
      timeline: [
        tl(at(c), 'node', 'create', AGENT, AGENT_ROLE, '建单', REFUND_TL.create(SOURCE)),
        tl(at(c + 15_000), 'node', 'transfer', '系统', '系统', '派单', REFUND_TL.dispatchManager(m)),
        tl(at(sv), 'handle', 'handle', m.name, refundManagerTlRole(m), '保存', REFUND_TL.save),
        firstClose(at(sv)),
        tl(at(s), 'node', 'handle', m.name, refundManagerTlRole(m), '提交退费', REFUND_TL.submit(r1.taskId, items)),
        tl(at(ok), 'node', 'handle', '系统', '系统', '退费结果更新', REFUND_TL.result(r1.taskId, '退费成功')),
        tl(at(pooledMs), 'node', 'transfer', '系统', '系统', '自动下送', REFUND_TL.autoForward('退费成功')),
        tl(at(claim), 'node', 'accept', AUDITOR, AUDITOR_ROLE, '领取', `${AUDITOR} 从池中领取本单。`),
        tl(at(fwd), 'node', 'transfer', AUDITOR, AUDITOR_ROLE, '下送', REFUND_TL.forwardSurvey),
        tl(at(fwd + 1000), 'comm', 'sms', '系统', '系统', '短信通知', `发送至 13955100108：${sms}`),
      ],
    }));
    todo(n, m, c + 15_000);
    pooled(n, pooledMs);
    notifies.push({
      ticketNo: n, event: 'ticket.survey.sent', kind: 'accepted', status: '已发送', title: '调研短信',
      receiver: '许女士(客户)', channel: '短信', content: sms, when: at(fwd + 1000),
    });
  }

  return { tickets, notifies };
}

export const REFUND_SEEDS: RefundSeedBundle = buildRefundSeeds(Date.now());
