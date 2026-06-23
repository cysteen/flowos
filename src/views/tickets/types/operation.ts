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
  /** 该客户「与当前工单同类型」的工单数（投诉单看投诉数、咨询单看咨询数…）*/
  sameTypeCount: number;
  recent30Count: number;
  dunningCount: number;
  supplementCount: number;
  relatedCount: number;
}

/** 统计宫格「弹窗下钻」明细表（客户维度：进线/历史/投诉/近30天） */
export interface InsightDetailTable {
  title: string;
  columns: string[];
  /** 每行单元格，与 columns 对齐；ticketNo 存在时编号列渲染为可点链接 */
  rows: { cells: string[]; ticketNo?: string }[];
}

/** 走弹窗下钻的统计项 key（其余项跳对应 Tab） */
export type InsightModalKey = 'inbound' | 'history' | 'complaint' | 'recent30';

/** 顶部「最新处理」聚合留言（多处理人，最新在前） */
export interface LatestHandlingItem {
  who: string;
  role: string;
  when: string;
  text: string;
}

/** 统计宫格点击后的下钻动作：弹窗看明细 或 跳对应处理 Tab */
export type InsightAction =
  | { kind: 'modal'; modalKey: InsightModalKey }
  | { kind: 'tab'; tab: 'related' | 'customerHistory' };

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

/** 各 Tab 的适用工单类型白名单；未列出的 Tab = 所有类型可见。 */
const TAB_TYPE_RESTRICTION: Partial<Record<ProcessTabKey, string[]>> = {
  tech: ['投诉', '咨询'],
  risk: ['投诉'],
  // 调研记录：四类型均保留（拍板 2026-06-20），不设类型限制
};

/** 按工单类型过滤可见处理 Tab（商机/建议精简，仅保留通用 Tab）。 */
export function visibleProcessTabs(ticketType: string) {
  return PROCESS_TABS.filter((t) => {
    const allow = TAB_TYPE_RESTRICTION[t.key];
    return !allow || allow.includes(ticketType);
  });
}

export type SupplementChip = 'complaint' | 'risk' | 'appointment' | 'quality';
