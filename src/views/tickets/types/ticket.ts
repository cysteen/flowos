// 工单工作台类型与配色映射。配色值全部取自 iFLY-FlowOS-坐席视角.pen 画板 SJpgc 实测，
// 业务规则对齐 PRD-02。

export type TabKey = 'mine' | 'team' | 'pool' | 'cc' | 'review';
/** 工单列表（全量库）视图 Tab */
export type ListViewKey = 'all' | 'mine' | 'team' | 'pool' | 'archived';
export type ChipKey =
  | 'all'
  | 'pending'
  | 'processing'
  | 'held'
  | 'review'
  | 'delegate'
  | 'soon'
  | 'overdue';

export type TicketType = '投诉' | '报修' | '咨询' | '安装' | '退换' | '技术';
export type Channel = '在线客服' | '电话' | '邮件' | '小程序' | 'APP';
export type SmartMark = '升级' | '情绪' | '相似' | '知识';
export type Priority = 'P0' | 'P1' | 'P2' | 'P3';
/** 当前节点状态（状态机） */
export type NodeStatus =
  | '待受理'
  | '处理中·一线'
  | '已升级·二线'
  | '已挂起·待客户'
  | '待审核';
/** SLA 倒计时态：充足/临期/超时/已停表(挂起) */
export type SlaState = 'ok' | 'soon' | 'overdue' | 'paused';

export interface Ticket {
  id: string;
  no: string;
  type: TicketType;
  channel: Channel;
  title: string;
  smartMarks: SmartMark[];
  customer: string;
  vip: boolean;
  product: string;
  nodeStatus: NodeStatus;
  nodeStep: number;
  nodeTotal: number;
  priority: Priority;
  /** 倒计时文本，如 "00:42:10" 或 "已停表" */
  slaText: string;
  /** 下标，如 "距超时" / "挂起中" / "已超时" / "充足" */
  slaSub: string;
  slaState: SlaState;
  /** 处理人姓名；null = 工单池待领 */
  assignee: string | null;
  /** 距超时分钟数，用于 SLA 智能排序（超时为负） */
  slaMinutes: number;
  tab: TabKey;
  /** 工单列表：是否已归档 */
  archived?: boolean;
  /** 更新时间（列表默认排序） */
  updatedAt?: string;
}

// ---- 配色映射（.pen 实测 + 设计规范 §2.3 语义色）----
export const TYPE_COLOR: Record<TicketType, string> = {
  投诉: '#EF4444',
  报修: '#F59E0B',
  咨询: '#1A6FFF',
  安装: '#A855F7',
  退换: '#06B6D4',
  技术: '#10B981',
};

export const SMART_MARK_COLOR: Record<SmartMark, string> = {
  升级: '#EF4444',
  情绪: '#F97316',
  相似: '#1A6FFF',
  知识: '#10B981',
};

export const PRIORITY_COLOR: Record<Priority, string> = {
  P0: '#EF4444',
  P1: '#F59E0B',
  P2: '#1A6FFF',
  P3: '#9CA3AF',
};

export const NODE_STATUS_COLOR: Record<NodeStatus, string> = {
  待受理: '#F59E0B',
  '处理中·一线': '#1A6FFF',
  '已升级·二线': '#A855F7',
  '已挂起·待客户': '#6B7280',
  待审核: '#F59E0B',
};

export const SLA_COLOR: Record<SlaState, string> = {
  ok: '#10B981',
  soon: '#F59E0B',
  overdue: '#EF4444',
  paused: '#6B7280',
};

/** 12% 透明背景（.pen 用 1F = 约 12%） */
export function softBg(hex: string): string {
  return `${hex}1F`;
}

// ---- Tab / Chip 元信息 ----
export interface TabMeta {
  key: TabKey;
  label: string;
  /** 计数徽章激活前的语义色 */
  badge: string;
}
export const TABS: TabMeta[] = [
  { key: 'mine', label: '我的工单', badge: '#1A6FFF' },
  { key: 'team', label: '团队工单', badge: '#9CA3AF' },
  { key: 'pool', label: '工单池', badge: '#06B6D4' },
  { key: 'cc', label: '我抄送', badge: '#9CA3AF' },
  { key: 'review', label: '待审核', badge: '#F59E0B' },
];

export interface ListViewMeta {
  key: ListViewKey;
  label: string;
}
export const LIST_VIEWS: ListViewMeta[] = [
  { key: 'all', label: '全部' },
  { key: 'mine', label: '我的' },
  { key: 'team', label: '本组' },
  { key: 'pool', label: '工单池' },
  { key: 'archived', label: '已归档' },
];

/** 工单列表视图范围 */
export function inListView(t: Ticket, view: ListViewKey): boolean {
  if (view === 'archived') return !!t.archived;
  if (t.archived) return false;
  switch (view) {
    case 'all':
      return true;
    case 'mine':
      return t.tab === 'mine' || t.tab === 'cc';
    case 'team':
      return t.tab === 'team' || t.tab === 'review';
    case 'pool':
      return t.tab === 'pool';
    default:
      return true;
  }
}

export interface ChipMeta {
  key: ChipKey;
  label: string;
  /** 临期/超时为 SLA 维度，特殊配色 */
  tone?: 'warn';
}
export const CHIPS: ChipMeta[] = [
  { key: 'all', label: '全部' },
  { key: 'pending', label: '待受理' },
  { key: 'processing', label: '处理中' },
  { key: 'held', label: '已挂起' },
  { key: 'review', label: '待审核' },
  { key: 'delegate', label: '委派' },
  { key: 'soon', label: '临期', tone: 'warn' },
  { key: 'overdue', label: '超时' },
];

/** 行内动作：按 当前节点状态 + Tab 推导（PRD-02 §7⑥） */
export function rowActions(t: Ticket): { label: string; primary?: boolean }[] {
  if (t.tab === 'pool') return [{ label: '受理', primary: true }, { label: '领单' }];
  switch (t.nodeStatus) {
    case '待受理':
      return [{ label: '受理', primary: true }, { label: '转派' }];
    case '处理中·一线':
      return [{ label: '处理', primary: true }, { label: '转派' }, { label: '挂起' }];
    case '已升级·二线':
      return [{ label: '处理', primary: true }, { label: '退回' }];
    case '已挂起·待客户':
      return [{ label: '恢复', primary: true }, { label: '详情' }];
    case '待审核':
      return [{ label: '审核', primary: true }, { label: '详情' }];
    default:
      return [{ label: '详情', primary: true }];
  }
}

/** chip 是否命中某工单（与 Tab 叠加） */
export function matchChip(t: Ticket, chip: ChipKey): boolean {
  switch (chip) {
    case 'all':
      return true;
    case 'pending':
      return t.nodeStatus === '待受理';
    case 'processing':
      return t.nodeStatus === '处理中·一线' || t.nodeStatus === '已升级·二线';
    case 'held':
      return t.nodeStatus === '已挂起·待客户';
    case 'review':
      return t.nodeStatus === '待审核';
    case 'delegate':
      return t.nodeStatus === '已升级·二线';
    case 'soon':
      return t.slaState === 'soon';
    case 'overdue':
      return t.slaState === 'overdue';
    default:
      return true;
  }
}
