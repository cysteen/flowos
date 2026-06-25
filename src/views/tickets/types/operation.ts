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

/** 顶部速览带 · AI 对客户与工单的联合洞察 */
export interface AiTicketInsight {
  customerBrief: string;
  ticketBrief: string;
  suggestion: string;
  /** 风险提示标签，无则省略 */
  riskTag?: string;
}

export interface InsightStats {
  inboundCount: number;
  historyCount: number;
  complaintCount: number;
  /** 该客户「与当前工单同类型」的工单数（投诉单看投诉数、咨询单看咨询数…） */
  sameTypeCount: number;
  recent30Count: number;
  dunningCount: number;
  supplementCount: number;
  /** 催单 / 补充 已读条数（坐席已查看） */
  dunningReadCount?: number;
  supplementReadCount?: number;
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

/** 预约回访 · 单条记录（日期 + 时分秒） */
export interface AppointmentRecord {
  id: string;
  scheduledAt: string;
  /** 已完成（已与客户电话沟通） */
  done?: boolean;
}

export interface ProcessFormDraft {
  problemCause: string;
  processResult: string;
  problemCauseAttachments: string[];
  processResultAttachments: string[];
  serviceMethod: string;
  serviceType: string;
  conclusion: 'resolved' | 'concession' | 'unresolved';
  /** 解决结论为退让时填写 */
  concessionPlan: string;
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
  /** 预约回访记录（每条一个预约时间点） */
  appointmentRecords: AppointmentRecord[];
  qualityIsStandard: boolean;
  /** 不规范原因大类 */
  qualityIssueCat1: string;
  /** 不规范原因子类（联动大类） */
  qualityIssueCat2: string;
  /** 建议专属 */
  suggestCat1: string;
  suggestCat2: string;
  /** 是否采纳（建议服务结论；默认否，无下级字段） */
  suggestAccepted: boolean;
  /** 商机专属 */
  leadIntent: 'high' | 'mid' | 'low';
  leadAmount: string;
  /** 商机解决结论 */
  leadStage: 'converted' | 'following' | 'lost';
  /** 商机编号（CRM 商机单号） */
  leadNo: string;
}

/** 处理表单可折叠区块 key（含各工单类型专属区） */
export type SectionKey =
  | 'record'
  | 'service'
  | 'supplement'
  | 'external'
  | 'quality'
  | 'suggest'
  | 'lead'
  | 'appointment';

export const PROCESS_TABS = [
  { key: 'process', label: '工单处理' },
  { key: 'tech', label: '技术支持处理' },
  { key: 'risk', label: '风险监控' },
  { key: 'history', label: '处理履历' },
  { key: 'related', label: '关联/补充/催单' },
  { key: 'contact', label: '联系记录' },
  { key: 'notify', label: '通知记录' },
  { key: 'survey', label: '调研记录' },
  { key: 'attachments', label: '附件历史' },
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

/** 建单不规范 · 原因大类 */
export const QUALITY_ISSUE_L1_OPTIONS = ['信息录入', '分类错误', '流程违规', '其他'] as const;

/** 建单不规范 · 原因子类（按大类联动） */
export const QUALITY_ISSUE_L2_MAP: Record<string, string[]> = {
  信息录入: ['客户信息缺失', '联系方式错误', '产品信息不全'],
  分类错误: ['工单类型错误', '问题分类错误', '优先级错误'],
  流程违规: ['重复建单', '未按规范流转', '遗漏必填项'],
  其他: ['其他原因'],
};

/** 服务方式（支持关键词搜索） */
export const SERVICE_METHOD_OPTIONS = [
  '远程指导',
  '电话回访',
  '上门检修',
  '寄修办理',
  '现场接待',
  '邮件答复',
] as const;

/** 服务类型（随服务方式默认带出，可搜索改选） */
export const SERVICE_TYPE_OPTIONS = [
  '技术支持',
  '客服跟进',
  '上门服务',
  '寄修服务',
  '门店服务',
  '书面答复',
  '品质服务',
  '售后服务',
] as const;

export const SERVICE_TYPE_BY_METHOD: Record<string, string> = {
  远程指导: '技术支持',
  电话回访: '客服跟进',
  上门检修: '上门服务',
  寄修办理: '寄修服务',
  现场接待: '门店服务',
  邮件答复: '书面答复',
};

/** 风险等级 */
export const RISK_LEVEL_OPTIONS = ['低风险', '中风险', '高风险'] as const;

/** 客户全景宫格：与当前工单类型对齐的统计标签（投诉/建议/商机/咨询 → ××单） */
const SAME_TYPE_STAT_LABEL: Record<string, string> = {
  投诉: '投诉单',
  建议: '建议单',
  商机: '商机单',
  咨询: '咨询单',
};

export function insightSameTypeLabel(ticketType: string): string {
  return SAME_TYPE_STAT_LABEL[ticketType] ?? `${ticketType}单`;
}
