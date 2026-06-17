// 工单操作页类型与配色。配色/图标对齐 PRD-03 §7 F4（6 类语义色 + lucide 图标），
// 角色徽章另用一套色（PRD-03 §7 F4）。

/** 时间线条目语义类别（决定卡片色条/底色） */
export type TlCategory = 'node' | 'comm' | 'customer' | 'dunning' | 'resolved' | 'praise';
/** 条目动作（决定图标 + How 徽章文案） */
export type TlAction =
  | 'create' | 'accept' | 'escalate' | 'hold' | 'transfer'
  | 'phone' | 'sms'
  | 'supplement' | 'reply'
  | 'dunning'
  | 'resolved'
  | 'praise';
export type TlRole = '客户' | '一线坐席' | '二线坐席' | '班组长' | '系统';

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
}

/** 6 类语义色（PRD-03 §7 F4）：色条 + 浅底 + 图例标签 */
export const CATEGORY_META: Record<TlCategory, { color: string; bg: string; label: string }> = {
  node: { color: '#7C3AED', bg: '#F5F3FF', label: '流转节点' },
  comm: { color: '#06B6D4', bg: '#ECFEFF', label: '对客沟通' },
  customer: { color: '#2563EB', bg: '#EFF6FF', label: '客户输入' },
  dunning: { color: '#EF4444', bg: '#FEF2F2', label: '催办预警' },
  resolved: { color: '#10B981', bg: '#ECFDF5', label: '已解决' },
  praise: { color: '#F59E0B', bg: '#FFFBEB', label: '客户评价' },
};

/** 角色徽章配色（与事件色区分，PRD-03 §7 F4） */
export const ROLE_BADGE: Record<TlRole, string> = {
  客户: '#6B7280',
  一线坐席: '#2563EB',
  二线坐席: '#7C3AED',
  班组长: '#0D9488',
  系统: '#9CA3AF',
};

export function softBg(hex: string): string {
  return `${hex}1F`;
}
