import { ref } from 'vue';
import { message, Modal } from 'ant-design-vue';
import { TICKET_DETAIL, TIMELINE } from '@/mock/ticketDetail';
import type { TicketDetailMeta, ChildTicket } from '@/mock/ticketDetail';
import type { TimelineEntry } from '@/views/tickets/types/ticketDetail';
import type { Ticket, Channel, TicketType, Priority } from '@/views/tickets/types/ticket';
import { useUserStore } from '@/stores/user';
import {
  applyOpAction, mapUserRole, pushEntry,
  type OpActionPayload, type SuspendInfo, type TicketOpState,
} from './opActions';

export function useTicketOperation() {
  const user = useUserStore();
  const detail = ref<TicketDetailMeta>(JSON.parse(JSON.stringify(TICKET_DETAIL)));
  const timeline = ref<TimelineEntry[]>([...TIMELINE]);
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

  function confirmCancel() {
    Modal.confirm({
      title: '取消工单',
      content: '取消后工单将终止处理，此操作不可撤销。确定取消？',
      okText: '确认取消',
      okType: 'danger',
      cancelText: '返回',
      onOk: () => dispatch({ type: '取消工单', reason: '处理人主动取消' }),
    });
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
    dispatch, confirmCancel, confirmWithdraw, addChildTicket, addReopenTicket,
  };
}
