import { ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { message, Modal } from 'ant-design-vue';
import { TICKET_DETAIL, TIMELINE } from '@/mock/ticketDetail';
import type { TicketDetailMeta, ChildTicket, SlaClock } from '@/mock/ticketDetail';
import type { TimelineEntry } from '@/views/tickets/types/ticketDetail';
import type { Ticket, Channel, TicketType, Priority } from '@/views/tickets/types/ticket';
import { TICKETS } from '@/mock/tickets';
import { TYPE_SAMPLES } from '@/mock/ticketTypeSamples';
import { useUserStore } from '@/stores/user';
import {
  ticketLatestHandlingItems,
  ticketProductIssue,
} from '@/views/tickets/utils/ticketOverview';
import {
  applyOpAction, mapUserRole, pushEntry,
  type OpActionPayload, type SuspendInfo, type TicketOpState,
} from './opActions';

// ---- 列表行 SLA 摘要 → 操作页时钟（保证工作台 ↔ 操作页状态一致，PRD §8.1/§8.2）----

/** 解析 'HH:MM:SS' / 'HH:MM' 为秒；解析失败返回 null */
function parseHms(text: string): number | null {
  const m = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(text.trim());
  if (!m) return null;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3] ?? 0);
}

/** 列表摘要剩余秒（'已超 HH:MM' → 负值；'已暂停'/'—' → null） */
function summaryRemainSec(t: Ticket): number | null {
  if (t.slaText.startsWith('已超')) {
    const s = parseHms(t.slaText.replace('已超', ''));
    return s == null ? null : -s;
  }
  return parseHms(t.slaText);
}

/** 按剩余秒 + 列表状态调校 total/warn，使表盘视觉态（正常/临期/超时）与列表一致 */
function tuneClock(c: SlaClock, rem: number, state: Ticket['slaState']): void {
  c.remainSec = rem;
  if (state === 'soon') {
    c.warnSec = Math.max(rem + 60, 900);
    c.totalSec = Math.max(rem * 3, 3600);
  } else if (state === 'overdue') {
    c.warnSec = 900;
    c.totalSec = Math.max(-rem * 2, 3600);
  } else {
    c.warnSec = Math.max(300, Math.min(1800, Math.floor(rem / 4)));
    c.totalSec = Math.max(rem * 2, 3600);
  }
}

/** 由剩余秒推算绝对截止文案（今日 HH:MM / M/D HH:MM） */
function dueByText(remSec: number): string {
  const d = new Date(Date.now() + remSec * 1000);
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay ? `今日 ${hm}` : `${d.getMonth() + 1}/${d.getDate()} ${hm}`;
}

/**
 * 由列表行 SLA 字段构建操作页双钟：
 * 已首响 → 摘要即解决钟、首响钟达标停表；未首响 → 摘要即首响钟（最急）、解决钟走独立字段；
 * 挂起 → 解决钟冻结；已关闭 → 双钟停表。
 */
function buildSlaClocks(t: Ticket): SlaClock[] {
  const responded = t.responded ?? t.nodeStatus !== '待受理';
  const solve: SlaClock = {
    label: '整单解决', kind: 'whole', phase: 'running',
    remainSec: 4 * 3600, totalSec: 8 * 3600, warnSec: 1800, dueBy: '',
  };
  const first: SlaClock = {
    label: '整单首响', kind: 'first', phase: 'running',
    remainSec: 12 * 60, totalSec: 1800, warnSec: 900, dueBy: '',
  };
  const summary = summaryRemainSec(t);

  // 首响终态：达标（绿）或超时后才响的未达标（红）
  const stopFirst = () => {
    first.phase = 'stopped';
    first.stopOutcome = t.firstRespBreached ? 'breached' : 'met';
    first.remainSec = t.firstRespBreached ? -300 : 300;
  };

  if (t.slaText === '—') {
    // 已关闭：双钟终态，按结果亮色（达标绿 / 未达标红）
    solve.phase = 'stopped';
    solve.stopOutcome = t.solveBreached ? 'breached' : 'met';
    if (t.solveBreached) solve.remainSec = -1800;
    stopFirst();
  } else if (t.slaState === 'paused') {
    // 挂起：在走的钟冻结（剩余保留、可恢复续算）
    solve.phase = 'paused';
    solve.remainSec = 2 * 3600;
    solve.totalSec = 8 * 3600;
    if (responded) stopFirst();
    else {
      first.phase = 'paused'; // 挂起且未首响：首响钟同样冻结
      first.remainSec = 10 * 60;
    }
  } else if (responded) {
    // 已首响：扁平摘要即解决钟
    if (summary != null) tuneClock(solve, summary, t.slaState);
    stopFirst();
  } else {
    // 未首响：扁平摘要即首响钟（最急钟）；解决钟走独立字段
    if (summary != null) tuneClock(first, summary, t.slaState);
    const rs = t.resolveSlaText ? parseHms(t.resolveSlaText) : null;
    if (rs != null) tuneClock(solve, rs, t.resolveSlaState ?? 'ok');
  }
  solve.dueBy = dueByText(solve.remainSec);
  first.dueBy = dueByText(first.remainSec);
  return [solve, first];
}

export function useTicketOperation() {
  const user = useUserStore();
  const route = useRoute();
  const detail = ref<TicketDetailMeta>(JSON.parse(JSON.stringify(TICKET_DETAIL)));
  const timeline = ref<TimelineEntry[]>([...TIMELINE]);
  const opState = ref<TicketOpState>('processing');
  const suspendInfo = ref<SuspendInfo | null>(null);

  /** 按列表点击的工单号解析对应工单，覆盖样例 detail 的头部与类型，
   *  使处理页（Tab① 表单结构）随工单类型而变。匹配不到则回退样例。 */
  function loadDetail(no: string) {
    const base = JSON.parse(JSON.stringify(TICKET_DETAIL)) as TicketDetailMeta;
    const t = TICKETS.find((x) => x.no === no);
    if (t) {
      base.no = t.no;
      base.title = t.title;
      base.type = t.type;
      base.channel = t.channel;
      base.priority = t.priority;
      base.customer.name = t.customer;
      base.product.name = t.product;
      base.productBg = t.productBg;
      base.feishuSync = 'none';
      base.feishuRecords = [];
      base.productIssue = ticketProductIssue(t);
      base.slaClocks = buildSlaClocks(t); // 时钟与列表行 SLA 摘要一致
      if (t.slaState === 'paused') {
        base.status = '已挂起';
        opState.value = 'suspended';
      } else {
        opState.value = 'processing';
      }
      suspendInfo.value = null;
      if (t.problemDesc?.trim()) {
        base.demand = t.problemDesc.trim();
      }
      base.latestHandling = ticketLatestHandlingItems(t);
    }
    // 按类型覆盖概要（无工单级文案时回退类型样例）
    const sample = TYPE_SAMPLES[base.type]?.detail;
    if (!t?.problemDesc?.trim() && sample?.demand) base.demand = sample.demand;
    if (sample?.insight) base.insight = sample.insight;
    if (sample?.aiInsight) base.aiInsight = sample.aiInsight;
    detail.value = base;
  }

  watch(
    () => route.params.ticketNo as string,
    (no) => { if (no) loadDetail(no); },
    { immediate: true },
  );
  const draftSavedAt = ref<string | null>(null);

  function dispatch(raw: Record<string, unknown>) {
    const payload = raw as OpActionPayload;
    const operator = user.name;
    const role = mapUserRole(user.roleKey);

    if (payload.type === '保存草稿') {
      const now = new Date();
      draftSavedAt.value = `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`;
      // 保存并登记：若已填写处理内容，追加一条「处理登记」进处理履历
      if (payload.process?.summary) {
        pushEntry(timeline.value, {
          category: 'handle', action: 'handle', who: operator, role,
          how: '工单处理', what: payload.process.summary,
          attachment: payload.process.attachment,
          changes: payload.process.changes,
        });
        message.success('已保存并登记处理进展');
      } else {
        message.success('已保存，可稍后继续处理');
      }
      return;
    }

    const result = applyOpAction(
      detail.value, timeline.value, opState.value, suspendInfo.value,
      payload, operator, role,
    );
    opState.value = result.opState;
    suspendInfo.value = result.suspendInfo;
    message.success(result.message);
  }

  function confirmWithdraw() {
    Modal.confirm({
      title: '撤回操作',
      content: '将撤回上一流转操作，工单回到上一处理节点。确定撤回？',
      okText: '确认撤回',
      cancelText: '取消',
      onOk: () => dispatch({ type: '撤回' }),
    });
  }

  function addChildTicket(ticket: Ticket) {
    const operator = user.name;
    const role = mapUserRole(user.roleKey);
    const now = new Date();
    const child: ChildTicket = {
      no: ticket.no,
      title: ticket.title,
      time: `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${operator}`,
      typeTag: '子单',
      statusTag: '待受理',
      typeColor: '#A855F7',
      statusColor: '#F59E0B',
    };
    detail.value.childTickets.unshift(child);
    pushEntry(timeline.value, {
      category: 'node',
      action: 'create',
      who: operator,
      role,
      how: '创建子单',
      what: `创建子工单 ${ticket.no}「${ticket.title}」，关联主单 ${detail.value.no}。`,
    });
  }

  function addReopenTicket(ticket: Ticket) {
    const operator = user.name;
    const role = mapUserRole(user.roleKey);
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    detail.value.linkedRecords.unshift({
      no: ticket.no,
      title: ticket.title,
      tag: 'Reopen',
      meta: `${month}-${day} ${operator} reopen`,
    });
    pushEntry(timeline.value, {
      category: 'node',
      action: 'create',
      who: operator,
      role,
      how: '重新建单',
      what: `Reopen 创建工单 ${ticket.no}「${ticket.title}」，关联原单 ${detail.value.no}。`,
    });
  }

  return {
    detail, timeline, opState, suspendInfo, draftSavedAt,
    dispatch, confirmWithdraw, addChildTicket, addReopenTicket,
  };
}
