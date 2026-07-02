import { ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { message, Modal } from 'ant-design-vue';
import { TICKET_DETAIL, TIMELINE } from '@/mock/ticketDetail';
import type { TicketDetailMeta, ChildTicket } from '@/mock/ticketDetail';
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

export function useTicketOperation() {
  const user = useUserStore();
  const route = useRoute();
  const detail = ref<TicketDetailMeta>(JSON.parse(JSON.stringify(TICKET_DETAIL)));
  const timeline = ref<TimelineEntry[]>([...TIMELINE]);

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
      base.productIssue = ticketProductIssue(t);
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
  const opState = ref<TicketOpState>('processing');
  const suspendInfo = ref<SuspendInfo | null>(null);
  const draftSavedAt = ref<string | null>(null);

  function dispatch(raw: Record<string, unknown>) {
    const payload = raw as OpActionPayload;
    const operator = user.name;
    const role = mapUserRole(user.roleKey);

    if (payload.type === '保存草稿') {
      const now = new Date();
      draftSavedAt.value = `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`;
      message.success('已保存，可稍后继续处理');
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
