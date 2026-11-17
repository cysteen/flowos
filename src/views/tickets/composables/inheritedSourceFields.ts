import type { TicketDetailMeta } from '@/mock/ticketDetail';
import type { Ticket } from '../types/ticket';

/** A present row value is authoritative, including an explicit clear; only missing values use this source's detail. */
export function inheritedText(rowValue?: string, detailValue?: string) {
  const value = rowValue ?? detailValue;
  return value && !/^[\s—–\-－]*$/.test(value) ? value : undefined;
}

/** Readonly source identity only: excludes the new ticket's complaint categories, platforms and description. */
export function inheritedReadonlyTicketFields(row: Ticket, detail: TicketDetailMeta) {
  const tags = detail.product.issueTags;
  return {
    customer: inheritedText(row.customer, detail.customer.name) ?? '',
    customerPhone: inheritedText(row.customerPhone, detail.customer.contacts.find((contact) => contact.type === 'phone')?.value),
    customerRegion: inheritedText(row.customerRegion, detail.customer.region),
    customerAddress: inheritedText(row.customerAddress, detail.customer.address),
    product: inheritedText(row.product, detail.product.name) ?? '',
    productCategory: inheritedText(row.productCategory, detail.product.category),
    sn: inheritedText(row.sn, detail.product.sn),
    businessType: inheritedText(row.businessType, detail.businessType),
    businessLine: inheritedText(row.businessLine, detail.businessLine),
    productLine: row.productLine, priority: row.priority,
    problemL1: inheritedText(row.problemL1, tags[0]),
    problemL2: inheritedText(row.problemL2, tags[1]),
    problemL3: inheritedText(row.problemL3, tags[2]),
  };
}
