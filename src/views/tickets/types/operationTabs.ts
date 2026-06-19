/** Tab②~⑧ 展示数据类型 */

export interface TechProcessDraft {
  problemCause: string;
  processResult: string;
}

export interface RiskMonitorDraft {
  reportModule: string;
  reportTarget: string;
  assistContent: string;
  remark: string;
  processConclusion: string;
  processReply: string;
  riskFlag: string;
  riskLevel: string;
  riskDesc: string;
}

export interface FlowHistoryNode {
  id: string;
  title: string;
  operator: string;
  when: string;
  desc: string;
  active?: boolean;
}

export interface RelatedTicketCard {
  no: string;
  title: string;
  status: string;
  statusColor: string;
  type: string;
  typeColor: string;
  createdAt: string;
  builder: string;
  demand: string;
  attachments?: string[];
  processInfo?: string;
}

export interface SimpleRecord {
  id: string;
  who: string;
  when: string;
  content: string;
  attachments?: string[];
}

export interface ContactRecord {
  id: string;
  kind: 'call' | 'sms';
  title: string;
  operator: string;
  when: string;
  summary: string;
  recording?: { duration: string; progress: string };
  asr?: { speaker: string; text: string }[];
  smsContent?: string;
}

export interface NotifyRecord {
  id: string;
  kind: 'upgrade' | 'timeout' | 'resolved';
  title: string;
  receiver: string;
  when: string;
  content: string;
}

export interface SurveyRecord {
  id: string;
  title: string;
  sentAt: string;
  evaluated: boolean;
  linkLabel?: string;
  conclusion?: string;
  pending?: boolean;
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
}
