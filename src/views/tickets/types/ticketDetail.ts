// 工单操作页类型与配色。配色/图标对齐 PRD-03 §7 F4（6 类语义色 + lucide 图标），
// 角色徽章另用一套色（PRD-03 §7 F4）。

/** 时间线条目语义类别（决定卡片色条/底色） */
export type TlCategory = 'node' | 'relate' | 'handle' | 'comm' | 'customer' | 'dunning' | 'sla' | 'praise';
/** 条目动作（决定图标 + How 徽章文案） */
export type TlAction =
  | 'create' | 'accept' | 'escalate' | 'hold' | 'transfer'
  | 'relate'
  | 'handle'
  | 'slaClose'
  | 'phone' | 'sms'
  | 'supplement' | 'reply'
  | 'dunning'
  | 'resolved'
  | 'praise';
/**
 * 处理履历上的角色徽章文案。取 0830 正式角色名（基线 §3.0 新旧名对照）：
 * 旧名「二线专员」→「二线专员」、「班组长」→「二线班组长」、「三线技术支持」→「技术支持」。
 * 「客户」「系统」不是角色，是履历里的两类非人/非本系统主体，保留。
 */
export type TlRole =
  | '客户'
  | '一线坐席'
  | '二线专员'
  | '技术支持'
  | '二线班组长'
  | '客诉专员'
  | '投诉督导'
  | '工单运营'
  | '质检'
  | '管理员'
  | '系统';

export interface AsrLine {
  speaker: '客户' | '坐席';
  text: string;
}
export interface TimelineEntry {
  id: string;
  category: TlCategory;
  action: TlAction;
  who: string;
  role: TlRole;
  /** How 徽章文案 */
  how: string;
  when: string;
  what: string;
  /** 内部备注标识 */
  internal?: boolean;
  /** 附件名（客户补充） */
  attachment?: string;
  /** 电话录音时长，如 "02:15" */
  recording?: string;
  /** 语音识别转写 */
  asr?: AsrLine[];
  /** 催单第 N 次 */
  dunningTimes?: number;
  /** 好评星级 */
  stars?: number;
  /** 关联单（relate 事件）：派生的关联工单卡片信息，时间线内联展示 */
  relatedTicket?: RelatedTicketBrief;
  /** 工单处理（handle 事件）：本次提交的字段级变更（补充/修改） */
  changes?: TimelineFieldChange[];
  /** SLA 单个时钟关闭记录 */
  slaClose?: {
    clock: '首响' | '整单';
    closedAt: string;
  };
}

/** 工单处理字段变更：补充=从空到有；修改=值变更（含旧→新） */
export interface TimelineFieldChange {
  /** 字段名，如「问题原因」「问题解决结论」 */
  field: string;
  kind: '补充' | '修改';
  /** 修改前值（kind=修改 时有） */
  from?: string;
  /** 当前值 */
  to: string;
}

/** 履历「关联单」事件挂载的关联工单摘要（对齐关联单卡片 rel-card 字段） */
export interface RelatedTicketBrief {
  no: string;
  title: string;
  /** 工单类型：投诉 / 售后 / 咨询 … */
  type: string;
  typeColor?: string;
  /** 当前状态：未认领 / 待响应 / 处理中 …（完整 25 个子状态见 TicketStatus） */
  status: string;
  statusColor?: string;
  builder?: string;
  createdAt?: string;
}

/** 语义色：色条 + 浅底 + 图例标签（催办预警后为 SLA 时效） */
export const CATEGORY_META: Record<TlCategory, { color: string; bg: string; label: string }> = {
  node: { color: '#7C3AED', bg: '#F5F3FF', label: '流转节点' },
  relate: { color: '#4F46E5', bg: '#EEF2FF', label: '关联单' },
  handle: { color: '#0D9488', bg: '#F0FDFA', label: '工单处理' },
  comm: { color: '#06B6D4', bg: '#ECFEFF', label: '对客沟通' },
  customer: { color: '#2563EB', bg: '#EFF6FF', label: '客户输入' },
  dunning: { color: '#EF4444', bg: '#FEF2F2', label: '催办预警' },
  sla: { color: '#64748B', bg: '#F1F5F9', label: 'SLA时效' },
  praise: { color: '#F59E0B', bg: '#FFFBEB', label: '客户评价' },
};

/** 角色徽章配色（与事件色区分，PRD-03 §7 F4） */
export const ROLE_BADGE: Record<TlRole, string> = {
  客户: '#6B7280',
  一线坐席: '#2563EB',
  二线专员: '#7C3AED',
  技术支持: '#4F46E5',
  二线班组长: '#0D9488',
  客诉专员: '#DC2626',
  投诉督导: '#B45309',
  工单运营: '#0369A1',
  质检: '#6D28D9',
  管理员: '#374151',
  系统: '#9CA3AF',
};

export function softBg(hex: string): string {
  return `${hex}1F`;
}
