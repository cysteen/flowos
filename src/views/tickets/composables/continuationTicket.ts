import type { TicketDetailMeta } from '@/mock/ticketDetail';
import type { Ticket } from '../types/ticket';
import type { CreateWorkItem } from '../types/createWork';
import { copy } from '../types/createWork';
import { currentHandlerName } from '../types/ticket';
import { useUserStore } from '@/stores/user';
import { inheritedText } from './inheritedSourceFields';

/** 【915】7.3.1: immutable inherited identity; only the new supplement is collected. */
export function prepareContinuation(item: CreateWorkItem, ticket: Ticket, row: Ticket, detail: TicketDetailMeta) {
  const text = String(item.form?.continuationSupplement ?? '').trim();
  if (!text) throw new Error('请填写本次补充内容。');
  const attachments = copy((item.form?.continuationAttachments ?? []) as string[]);
  const user = useUserStore();
  const tags = detail.product.issueTags;
  const complaint = row.type === '投诉' ? detail.complaint : undefined;
  const originalDescription = inheritedText(row.problemDesc, detail.demand);
  Object.assign(ticket, {
    title: row.title, type: row.type,
    businessType: inheritedText(row.businessType, detail.businessType),
    ticketSource: inheritedText(row.ticketSource, detail.source),
    channel: row.channel, customer: row.customer,
    customerPhone: inheritedText(row.customerPhone, detail.customer.contacts.find((contact) => contact.type === 'phone')?.value),
    customerGender: inheritedText(row.customerGender, detail.customer.gender),
    customerRegion: inheritedText(row.customerRegion, detail.customer.region),
    customerAddress: inheritedText(row.customerAddress, detail.customer.address),
    vip: row.vip, product: row.product,
    productCategory: inheritedText(row.productCategory, detail.product.category),
    productBg: inheritedText(row.productBg, detail.productBg),
    sn: inheritedText(row.sn, detail.product.sn),
    problemL1: inheritedText(row.problemL1, tags[0]),
    problemL2: inheritedText(row.problemL2, tags[1]),
    problemL3: inheritedText(row.problemL3, tags[2]),
    problemOccurredAt: inheritedText(row.problemOccurredAt, detail.issueOccurredAt),
    priority: row.priority, businessLine: inheritedText(row.businessLine, detail.businessLine), productLine: row.productLine,
    complaintType: inheritedText(row.complaintType, complaint?.complaintType),
    complaintL1: inheritedText(row.complaintL1, row.type === '投诉' ? detail.createComplaintL1 : undefined),
    complaintL2: inheritedText(row.complaintL2, row.type === '投诉' ? detail.createComplaintL2 : undefined),
    serviceComplaintCategory: inheritedText(row.serviceComplaintCategory, row.type === '投诉' ? detail.serviceComplaintCategory : undefined),
    complaintPlatforms: copy(row.complaintPlatforms ?? complaint?.platforms ?? []),
    priorFeedback: inheritedText(row.priorFeedback, complaint?.priorFeedback),
    serviceReview: inheritedText(row.serviceReview, complaint?.serviceReview),
    complaintReceiveTime: inheritedText(row.complaintReceiveTime, complaint?.receivedAt),
    externalComplaintCategories: row.externalComplaintCategories ? copy(row.externalComplaintCategories) : undefined,
    problemDesc: [originalDescription, text].filter(Boolean).join('\n\n'),
    problemDescAttachments: [...(row.problemDescAttachments ?? detail.demandAttachments ?? []), ...attachments],
    nodeStatus: '未认领', tab: 'pool', assignee: null, groupId: row.groupId ?? detail.groupId,
    groupNames: copy(row.groupNames ?? detail.groupNames ?? []), poolEnteredAt: ticket.createdAt, responded: false,
    supplementUnread: true, supplementContacted: false, supplementPendingCount: 1,
    creationSupplements: [{ id: `cw-${item.id}-supplement`, who: currentHandlerName(user.roleKey, user.name), when: ticket.createdAt!, content: text, supplementType: '问题描述补充', attachments, read: false, contacted: false }],
  });
}
