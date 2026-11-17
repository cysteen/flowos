import type { TicketDetailMeta } from '@/mock/ticketDetail';
import { TICKETS } from '@/mock/tickets';
import type { CreateTicketPrefill, Channel, Priority } from '../types/ticket';
import { PRODUCT_NAMES, normalizeTicketSource, type CreateFormTicketType, type TicketSource } from '../types/createTicket';

const CHANNEL_MAP: Record<string, Channel> = { 在线客服: '在线客服', 电话: '电话', '400热线': '电话', 邮件: '邮件', 小程序: '小程序', APP: 'APP' };
const LEGACY_CATEGORY: Record<string, string> = { 消费电子: '智能硬件', 企业服务: '软件服务', 会员权益: '软件服务', 开放平台: '软件服务', 教育服务: '软件服务' };
/** Copy the source's business facts once. Historical values remain visible; they are never replaced by a sample. */
function originPrefill(parent: TicketDetailMeta): CreateTicketPrefill {
  const row = TICKETS.find((ticket) => ticket.no === parent.no);
  const product = row?.product || parent.product.name;
  const originalCategory = row?.productCategory || parent.product.category;
  const category = PRODUCT_NAMES[originalCategory] ? originalCategory : LEGACY_CATEGORY[originalCategory] || Object.keys(PRODUCT_NAMES).find((key) => PRODUCT_NAMES[key].includes(product)) || originalCategory;
  const tags = parent.product.issueTags ?? [];
  return {
    parentNo: parent.no, parentTitle: parent.title,
    customerName: row?.customer || parent.customer.name,
    customerPhone: row?.customerPhone || parent.customer.contacts.find((contact) => contact.type === 'phone')?.value || '',
    customerRegion: row?.customerRegion || parent.customer.region, customerAddress: row?.customerAddress || parent.customer.address,
    customerTypes: [...parent.customer.types], vip: row?.vip ?? parent.customer.types.some((tag) => tag.includes('VIP')),
    businessType: row?.businessType || parent.businessType, businessLine: row?.businessLine || parent.businessLine,
    productCategory: category, product, sn: row?.sn || parent.product.sn,
    channel: CHANNEL_MAP[parent.channel] || '在线客服',
    ticketSource: normalizeTicketSource(row?.ticketSource || parent.source) as TicketSource,
    problemL1: row?.problemL1 ?? tags[0] ?? '', problemL2: row?.problemL2 ?? tags[1] ?? '', problemL3: row?.problemL3 ?? tags[2] ?? '',
    priority: (row?.priority || parent.priority) as Priority,
    complaintType: row?.complaintType || parent.complaint.complaintType,
    desc: row?.problemDesc || parent.demand, descAttachments: [...(row?.problemDescAttachments || parent.demandAttachments || [])],
  };
}
/** This is the actual transfer entry; the old internal mode name does not mean business child creation. */
export function buildChildTicketPrefill(parent: TicketDetailMeta): CreateTicketPrefill {
  const result = { ...originPrefill(parent), mode: 'child' as const, formTicketType: '咨询' as const };
  if (result.priority === 'P0' || result.priority === 'P1') result.priority = undefined;
  return result;
}
export function buildReopenTicketPrefill(parent: TicketDetailMeta): CreateTicketPrefill {
  return { ...originPrefill(parent), mode: 'reopen', noFlashScene: true, formTicketType: parent.type as CreateFormTicketType };
}
