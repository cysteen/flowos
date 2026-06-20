/** 工单操作页 · 处理 Tab 与侧栏展示类型 */

export interface ContactItem {
  type: 'phone' | 'email';
  value: string;
}

export interface AgentInfo {
  name: string;
  relation: string;
  contacts: ContactItem[];
}

export interface ComplaintInfo {
  complaintType: string;
  platform: string;
  complaintNo: string;
  tags: string[];
  priorFeedback: string;
  serviceReview: string;
}

export interface InsightStats {
  inboundCount: number;
  historyCount: number;
  complaintCount: number;
  recent30Count: number;
  dunningCount: number;
  supplementCount: number;
  relatedCount: number;
}

export interface ProcessFormDraft {
  problemCause: string;
  processResult: string;
  problemCauseAttachments: string[];
  processResultAttachments: string[];
  serviceMethod: string;
  serviceType: string;
  conclusion: 'resolved' | 'concession' | 'unresolved';
  complaintCat1: string;
  complaintCat2: string;
  complaintCat3: string;
  complaintNote: string;
  complaintNoteAttachments: string[];
  riskHasRisk: boolean;
  riskLevel: string;
  riskDescription: string;
  riskDescriptionAttachments: string[];
  appointmentNeeded: boolean;
  appointmentStart: string;
  appointmentEnd: string;
  qualityIsStandard: boolean;
  qualityIssueCat: string;
  qualityIssueReason: string;
  qualityIssueReasonAttachments: string[];
  /** 建议专属 */
  suggestCat1: string;
  suggestCat2: string;
  suggestAdopt: 'adopt' | 'reject' | 'toRequirement';
  /** 商机专属 */
  leadIntent: 'high' | 'mid' | 'low';
  leadAmount: string;
  leadStage: 'converted' | 'following' | 'lost';
}

/** 处理表单可折叠区块 key（含各工单类型专属区） */
export type SectionKey =
  | 'record'
  | 'service'
  | 'supplement'
  | 'external'
  | 'quality'
  | 'suggest'
  | 'lead';

export const PROCESS_TABS = [
  { key: 'process', label: '工单处理' },
  { key: 'tech', label: '技术支持处理' },
  { key: 'risk', label: '风险监控' },
  { key: 'history', label: '处理履历' },
  { key: 'related', label: '关联/补充/催单' },
  { key: 'contact', label: '联系记录' },
  { key: 'notify', label: '通知记录' },
  { key: 'survey', label: '调研记录' },
  { key: 'customerHistory', label: '客户历史工单' },
] as const;

export type ProcessTabKey = (typeof PROCESS_TABS)[number]['key'];

export type SupplementChip = 'complaint' | 'risk' | 'appointment' | 'quality';
