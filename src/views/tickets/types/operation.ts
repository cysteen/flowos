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
  serviceMethod: string;
  serviceType: string;
  conclusion: 'resolved' | 'concession' | 'unresolved';
  complaintCat1: string;
  complaintCat2: string;
  complaintCat3: string;
  complaintNote: string;
  riskHasRisk: boolean;
  riskLevel: string;
  riskDescription: string;
  appointmentNeeded: boolean;
  appointmentStart: string;
  appointmentEnd: string;
  qualityIsStandard: boolean;
  qualityIssueCat: string;
  qualityIssueReason: string;
}

export const PROCESS_TABS = [
  { key: 'process', label: '工单处理' },
  { key: 'tech', label: '技术支持处理' },
  { key: 'risk', label: '风险监控' },
  { key: 'history', label: '处理履历' },
  { key: 'related', label: '关联/补充/催单' },
  { key: 'contact', label: '联系记录' },
  { key: 'notify', label: '通知记录' },
  { key: 'survey', label: '调研记录' },
] as const;

export type ProcessTabKey = (typeof PROCESS_TABS)[number]['key'];

export type SupplementChip = 'complaint' | 'risk' | 'appointment' | 'quality';
