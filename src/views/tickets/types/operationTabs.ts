/** Tab②~⑧ 展示数据类型 */

export interface TechProcessDraft {
  problemCause: string;
  processResult: string;
  problemCauseAttachments: string[];
  processResultAttachments: string[];
}

export interface RiskMonitorDraft {
  reportModule: string;
  reportTarget: string;
  assistContent: string;
  remark: string;
  remarkAttachments: string[];
  processConclusion: string;
  processReply: string;
  processReplyAttachments: string[];
  riskFlag: string;
  riskLevel: string;
  riskDesc: string;
  riskDescAttachments: string[];
}

export interface FlowHistoryNode {
  id: string;
  title: string;
  operator: string;
  when: string;
  desc: string;
  active?: boolean;
}

export interface ProcessInfoEntry {
  who: string;
  when: string;
  content: string;
  attachments?: string[];
}

export interface RelatedTicketCard {
  no: string;
  title: string;
  status: string;
  statusColor: string;
  type: string;
  typeColor: string;
  typeBgColor?: string;
  createdAt: string;
  /** 完整建单时间（表格展示） */
  createdAtFull?: string;
  builder: string;
  demand: string;
  attachments?: string[];
  processRecords?: ProcessInfoEntry[];
  /** @deprecated 使用 processRecords */
  processInfo?: string;
  /** 卡片来源系统；默认客服（本系统），售后=外部单、点击深链跳转不站内打开 */
  source?: '客服' | '售后';
  /** 售后单等外部单：点击深链跳对方系统（附件也走跳转，不内嵌，D6） */
  externalLink?: boolean;
}

export interface SimpleRecord {
  id: string;
  who: string;
  when: string;
  /** 补充类型（仅补充记录使用） */
  supplementType?: string;
  content: string;
  attachments?: string[];
  /** 坐席是否已读（催单/补充明细） */
  read?: boolean;
}

/** 取消工单原因枚举 */
export const CANCEL_REASON_OPTIONS = [
  '客户来电取消',
  '建单信息错误',
  '重复建单',
  '客户问题已自行解决',
  '其他',
] as const;

/** 坐席新建补充时的分类枚举 */
export const SUPPLEMENT_TYPE_OPTIONS = [
  '修改信息',
  '补充信息',
  '取消服务',
  '其他',
] as const;

export type SupplementType = (typeof SUPPLEMENT_TYPE_OPTIONS)[number];

export interface ContactRecord {
  id: string;
  kind: 'call' | 'sms' | 'email' | 'im';
  title: string;
  emoji: string;
  operator: string;
  when: string;
  /** 元信息前缀，默认「操作人」；邮件为「发送人」 */
  metaPrefix?: string;
  summary: string;
  recording?: { progress: string; progressPercent: number };
  asr?: { speaker: string; text: string }[];
  smsContent?: string;
  emailLines?: { text: string; bold?: boolean; muted?: boolean }[];
  /** 记录来源：一线（关联沟通）/ 二线（本席产生）；默认二线 */
  source?: '一线' | '二线';
  /** 一线关联沟通的渠道：热线 / IM */
  channel?: '热线' | 'IM';
  /** 一线小结（热线卡片，可展开查看全文）；替代二线的文本转写 */
  note?: string;
  /** IM 会话元信息（消息条数、会话时长） */
  im?: { sessionDuration: string; messageCount: number };
}

export type NotifyKind = 'upgrade' | 'timeout' | 'transfer' | 'dunning' | 'accepted';

export interface NotifyRecord {
  id: string;
  kind: NotifyKind;
  title: string;
  receiver: string;
  when: string;
  channel: string;
  status: string;
  content: string;
}

export interface SurveyRecord {
  id: string;
  title: string;
  sentAt: string;
  evaluated: boolean;
  linkLabel?: string;
  conclusion?: string;
}

export interface AttachmentHistoryRecord {
  id: string;
  name: string;
  size: string;
  uploadedAt: string;
  uploadedBy: string;
}

export type CustomerHistoryFilter = 'all' | 'processing' | 'closed' | 'complaint';

export interface CustomerHistoryTicket {
  id: string;
  no: string;
  title: string;
  status: string;
  statusColor: string;
  type: string;
  typeColor: string;
  typeBgColor: string;
  channel: string;
  date: string;
  summary: string;
  isProcessing: boolean;
  isClosed: boolean;
  isComplaint: boolean;
}

export interface CustomerHistoryData {
  customerName: string;
  totalCount: number;
  processingCount: number;
  closedCount: number;
  complaintCount: number;
  tickets: CustomerHistoryTicket[];
}

export interface OperationTabData {
  currentFlowNode: string;
  techDraft: TechProcessDraft;
  riskDraft: RiskMonitorDraft;
  flowHistory: FlowHistoryNode[];
  relatedTickets: RelatedTicketCard[];
  supplementRecords: SimpleRecord[];
  dunningRecords: SimpleRecord[];
  contactRecords: ContactRecord[];
  notifyRecords: NotifyRecord[];
  surveyRecords: SurveyRecord[];
  attachmentHistory: AttachmentHistoryRecord[];
  customerHistory: CustomerHistoryData;
}
