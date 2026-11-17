import type { TicketDetailMeta } from '@/mock/ticketDetail';
import type { Ticket } from '../types/ticket';
import type { CreateWorkItem } from '../types/createWork';
import { copy } from '../types/createWork';
import { currentHandlerName } from '../types/ticket';
import { useUserStore } from '@/stores/user';

/** 【915】7.3.1: immutable inherited identity; only the new supplement is collected. */
export function prepareContinuation(item: CreateWorkItem, ticket: Ticket, row: Ticket, detail: TicketDetailMeta) {
  const text = String(item.form?.continuationSupplement ?? '').trim();
  if (!text) throw new Error('请填写本次补充内容。');
  const attachments = copy((item.form?.continuationAttachments ?? []) as string[]);
  const user = useUserStore();
  Object.assign(ticket, {
    title: row.title, type: row.type, businessType: row.businessType, ticketSource: row.ticketSource,
    channel: row.channel, customer: row.customer, customerPhone: row.customerPhone,
    customerGender: row.customerGender, customerRegion: row.customerRegion, customerAddress: row.customerAddress,
    vip: row.vip, product: row.product, productCategory: row.productCategory, sn: row.sn,
    problemL1: row.problemL1, problemL2: row.problemL2, problemL3: row.problemL3,
    priority: row.priority, businessLine: row.businessLine, productLine: row.productLine,
    complaintType: row.complaintType, complaintL1: row.complaintL1, complaintL2: row.complaintL2,
    complaintPlatforms: copy(row.complaintPlatforms ?? []),
    problemDesc: `${row.problemDesc || detail.demand}\n\n${text}`,
    problemDescAttachments: [...(row.problemDescAttachments ?? []), ...attachments],
    nodeStatus: '未认领', tab: 'pool', assignee: null, groupId: row.groupId,
    groupNames: copy(row.groupNames ?? []), poolEnteredAt: ticket.createdAt, responded: false,
    supplementUnread: true, supplementContacted: false, supplementPendingCount: 1,
    creationSupplements: [{ id: `cw-${item.id}-supplement`, who: currentHandlerName(user.roleKey, user.name), when: ticket.createdAt!, content: text, supplementType: '问题描述补充', attachments, read: false, contacted: false }],
  });
}
