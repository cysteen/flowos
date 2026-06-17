import type { TicketDetailMeta } from '@/mock/ticketDetail';
import type { CreateTicketPrefill, Channel, TicketType, Priority } from '@/views/tickets/types/ticket';

const CHANNEL_MAP: Record<string, Channel> = {
  在线客服: '在线客服',
  电话: '电话',
  '400热线': '电话',
  邮件: '邮件',
  小程序: '小程序',
  APP: 'APP',
};

/** 主单类型 → 推荐子单类型 */
const CHILD_TYPE_HINT: Record<string, TicketType> = {
  投诉: '技术',
  报修: '报修',
  咨询: '咨询',
  安装: '安装',
  退换: '退换',
  技术: '技术',
};

function mapPriority(p: string): Priority {
  if (p === 'P0' || p === 'P1' || p === 'P2' || p === 'P3') return p;
  return 'P1';
}

/** 从主单详情生成子单新建弹窗预填数据 */
export function buildChildTicketPrefill(parent: TicketDetailMeta): CreateTicketPrefill {
  const parentType = parent.type as TicketType;
  const childType = CHILD_TYPE_HINT[parent.type] ?? '技术';
  const demandShort = parent.demand.length > 80 ? `${parent.demand.slice(0, 80)}…` : parent.demand;

  return {
    mode: 'child',
    parentNo: parent.no,
    parentTitle: parent.title,
    customerName: parent.customer.name,
    customerPhone: parent.customer.phones[0] ?? '',
    vip: parent.customer.types.some((t) => t.includes('VIP')),
    product: parent.product.name,
    sn: parent.product.sn,
    channel: CHANNEL_MAP[parent.channel] ?? '在线客服',
    type: childType,
    priority: mapPriority(parent.priority),
    complaintType: parent.complaintType,
    expectTime: parent.expectedResolve,
    desc: [
      `【子单·关联主单 ${parent.no}】`,
      `主单类型：${parentType} · 诉求：${demandShort}`,
      '',
      '子任务说明：',
    ].join('\n'),
  };
}

/** 从原单详情生成 reopen（重新建单）弹窗预填数据 */
export function buildReopenTicketPrefill(parent: TicketDetailMeta): CreateTicketPrefill {
  const parentType = parent.type as TicketType;
  const demandShort = parent.demand.length > 80 ? `${parent.demand.slice(0, 80)}…` : parent.demand;

  return {
    mode: 'reopen',
    parentNo: parent.no,
    parentTitle: parent.title,
    customerName: parent.customer.name,
    customerPhone: parent.customer.phones[0] ?? '',
    vip: parent.customer.types.some((t) => t.includes('VIP')),
    product: parent.product.name,
    sn: parent.product.sn,
    channel: CHANNEL_MAP[parent.channel] ?? '在线客服',
    type: parentType,
    priority: mapPriority(parent.priority),
    complaintType: parent.complaintType,
    expectTime: parent.expectedResolve,
    desc: [
      `【Reopen·关联原单 ${parent.no}】`,
      `原单标题：${parent.title}`,
      `原诉求：${demandShort}`,
      '',
      '客户再次反馈：',
    ].join('\n'),
  };
}
