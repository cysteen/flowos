import { prototypeDayEnd } from '@/config/prototypeDate';
import { BUSINESS_TYPES } from '@/views/tickets/types/createTicket';
import { PRODUCT_NAMES_BY_CATEGORY } from '@/views/tickets/types/mineQuery';
import {
  isFirstResponded,
  resolveTicketGroupNames,
  type SlaState,
  type Ticket,
  type TicketType,
} from '@/views/tickets/types/ticket';

/** 查询中心 · 工单列表筛选条件 */
export interface ListFilters {
  /** 顶栏综合搜索（工单号/标题/客户） */
  keyword: string;
  ticketNo: string;
  phone: string;
  dateFrom: string;
  dateTo: string;
  type?: TicketType;
  groupName: string;
  assignee?: string;
  businessType: string;
  bgbu: string;
  businessLine: string;
  productLine: string;
  product: string;
  priority?: string;
  slaStatus?: SlaState | 'all';
  status?: string;
  channel?: string;
}

export const EMPTY_LIST_FILTERS = (): ListFilters => ({
  keyword: '',
  ticketNo: '',
  phone: '',
  dateFrom: '',
  dateTo: '',
  type: undefined,
  groupName: '',
  assignee: undefined,
  businessType: '',
  bgbu: '',
  businessLine: '',
  productLine: '',
  product: '',
  priority: undefined,
  slaStatus: undefined,
  status: undefined,
  channel: undefined,
});

export const QUERY_STATUS_OPTIONS = [
  { value: '', label: '请选择' },
  { value: 'pending', label: '待受理' },
  { value: 'processing', label: '处理中' },
  { value: 'held', label: '已挂起' },
  { value: 'review', label: '待审核' },
  { value: 'delegated', label: '已委派' },
  { value: 'transferred', label: '已转出' },
  { value: 'returned', label: '被退回' },
  { value: 'transferIn', label: '转入' },
] as const;

export const QUERY_PRIORITY_OPTIONS = [
  { value: '', label: '请选择' },
  { value: 'P0', label: 'P0' },
  { value: 'P1', label: 'P1' },
  { value: 'P2', label: 'P2' },
  { value: 'P3', label: 'P3' },
] as const;

export const QUERY_SLA_OPTIONS = [
  { value: '', label: '请选择' },
  { value: 'ok', label: '正常' },
  { value: 'soon', label: '临期' },
  { value: 'overdue', label: '超时' },
  { value: 'paused', label: '挂起中' },
] as const;

export const QUERY_TYPE_OPTIONS: TicketType[] = ['投诉', '建议', '商机', '咨询'];

export const QUERY_CHANNEL_OPTIONS = ['在线客服', '电话', '邮件', '小程序', 'APP'] as const;

export const QUERY_ASSIGNEE_OPTIONS = ['王坐席', '陈坐席', '林坐席', '周二线', '孙坐席', '周工'] as const;

/** 业务类型（含 Mock 扩展项） */
export const QUERY_BUSINESS_TYPES = [...BUSINESS_TYPES, '翻译机'] as const;

export const QUERY_BGBU_OPTIONS = ['消费者BG', '教育事业群', '金融科技事业部'] as const;

export const QUERY_BUSINESS_LINE_OPTIONS = [
  '智能硬件业务线',
  '学习机业务线',
  '翻录业务线',
  '智学网业务线',
  '智慧运营业务线',
] as const;

export const QUERY_PRODUCT_LINE_OPTIONS = [
  '录音笔产品线',
  '翻译机产品线',
  '智能客服产品线',
  '课堂产品线',
  '智慧窗产品线',
] as const;

export const QUERY_GROUP_OPTIONS = [
  '受理一组',
  '受理二组',
  '硬件缺陷组',
  '教育支持组',
  '技术支持组',
  '翻录投诉',
  '翻录咨询',
  '翻录商机',
  '学习机投诉',
  '学习机咨询',
  '智学网咨询',
] as const;

const QUERY_PRODUCT_OPTIONS = [
  ...new Set([
    ...Object.values(PRODUCT_NAMES_BY_CATEGORY).flat(),
    '讯飞翻译机 T10',
    '讯飞录音笔 H1',
    '讯飞录音笔 H2',
  ]),
].sort();

export { QUERY_PRODUCT_OPTIONS };

function includes(hay: string, needle: string): boolean {
  return hay.toLowerCase().includes(needle.trim().toLowerCase());
}

function ts(s?: string): number {
  if (!s) return 0;
  return new Date(s.replace(' ', 'T')).getTime() || 0;
}

function dayStart(ymd: string): number {
  return new Date(`${ymd}T00:00:00`).getTime() || 0;
}

function dayEnd(ymd: string): number {
  return new Date(`${ymd}T23:59:59.999`).getTime() || 0;
}

export function resolveListDateRange(f: ListFilters): { from: number; to: number } | null {
  if (!f.dateFrom && !f.dateTo) return null;
  const end = prototypeDayEnd();
  return {
    from: f.dateFrom ? dayStart(f.dateFrom) : 0,
    to: f.dateTo ? dayEnd(f.dateTo) : end.getTime(),
  };
}

function ticketCreatedTime(t: Ticket): number {
  return ts(t.createdAt);
}

function ticketBgbu(t: Ticket): string {
  return t.productBg ?? '';
}

function ticketBusinessLine(t: Ticket): string {
  return t.businessLine ?? '';
}

function ticketProductLine(t: Ticket): string {
  return t.productLine ?? t.productCategory ?? '';
}

function matchStatus(t: Ticket, status: string): boolean {
  if (status === 'delegated') {
    return !!(t.hasDelegateHistory || t.myDelegateAction);
  }
  if (status === 'transferred') {
    return String(t.nodeStatus).includes('已转出') || !!t.linkedAftersaleNo;
  }
  if (status === 'returned') return !!t.hasReturnAction;
  if (status === 'transferIn') {
    return t.ticketSource === '售后转入' || t.ticketSource === '跨组调剂';
  }
  if (status === 'escalated') {
    // 基线只有一个「已升级」状态（三线技术支持 / 产研两类目标都落它，差别在处理人）。
    // 本项筛的是"升级过的单"，与升级目标无关，故不按目标再分。
    return t.nodeStatus === '已升级' || !!t.smartMarks?.includes('升级');
  }
  if (status === 'firstResponseOverdue') {
    return !isFirstResponded(t) && t.slaState === 'overdue';
  }
  if (status === 'resolutionOverdue') {
    const resolveState = isFirstResponded(t) ? t.slaState : t.resolveSlaState;
    return resolveState === 'overdue';
  }
  if (status === 'contactMissed') return !isFirstResponded(t);
  if (status === 'serviceBad') return t.serviceScore != null && t.serviceScore <= 3;

  const map: Record<string, string[]> = {
    pending: ['未认领', '待响应'],
    processing: ['处理中', '已升级', '已委派', '已退回', '调研中'],
    held: ['已挂起'],
    review: ['申请挂起中', '申请关闭中', '申请强结中', '业务动作审核中'],
  };
  const allowed = map[status];
  return !allowed || allowed.includes(t.nodeStatus);
}

export function matchListQuery(t: Ticket, f: ListFilters): boolean {
  if (f.keyword) {
    const kw = f.keyword.toLowerCase();
    const hay = `${t.no} ${t.title} ${t.customer}`.toLowerCase();
    if (!hay.includes(kw)) return false;
  }
  if (f.ticketNo) {
    const kw = f.ticketNo.trim().toLowerCase();
    if (!`${t.no} ${t.title}`.toLowerCase().includes(kw)) return false;
  }
  if (f.phone) {
    const phone = t.customerPhone ?? '';
    if (!includes(phone, f.phone) && !includes(t.customer, f.phone)) return false;
  }

  const range = resolveListDateRange(f);
  if (range) {
    const created = ticketCreatedTime(t);
    if (!created || created < range.from || created > range.to) return false;
  }

  if (f.type && t.type !== f.type) return false;
  if (f.groupName) {
    const names = resolveTicketGroupNames(t);
    if (!names.some((n) => includes(n, f.groupName))) return false;
  }
  if (f.assignee === 'pool' && t.assignee !== null) return false;
  if (f.assignee && f.assignee !== 'pool') {
    const name = t.assignee ?? '';
    if (!includes(name, f.assignee)) return false;
  }
  if (f.businessType && t.businessType !== f.businessType) return false;
  if (f.bgbu && ticketBgbu(t) !== f.bgbu) return false;
  if (f.businessLine && ticketBusinessLine(t) !== f.businessLine) return false;
  if (f.productLine && ticketProductLine(t) !== f.productLine) return false;
  if (f.product && !includes(t.product, f.product)) return false;
  if (f.priority && t.priority !== f.priority) return false;
  if (f.slaStatus && f.slaStatus !== 'all' && t.slaState !== f.slaStatus) return false;
  if (f.channel && t.channel !== f.channel) return false;
  if (f.status && f.status !== 'all' && !matchStatus(t, f.status)) return false;

  return true;
}

export function hasListQuery(f: ListFilters): boolean {
  return !!(
    f.keyword
    || f.ticketNo
    || f.phone
    || f.dateFrom
    || f.dateTo
    || f.type
    || f.groupName
    || f.assignee
    || f.businessType
    || f.bgbu
    || f.businessLine
    || f.productLine
    || f.product
    || f.priority
    || f.slaStatus
    || f.status
    || f.channel
  );
}
