// 工单工作台类型与配色映射。配色值全部取自 iFLY-FlowOS-坐席视角.pen 画板 SJpgc 实测，
// 业务规则对齐 PRD-02。

import type { CreateFormTicketType } from '@/views/tickets/types/createTicket';

export type TabKey = 'mine' | 'done' | 'pool' | 'cc' | 'review';
/** 工单列表（全量库）视图 Tab */
export type ListViewKey = 'all' | 'mine' | 'team' | 'pool' | 'archived';

/** 我的任务 Tab 子筛选（PRD-02 v1.2） */
export type MineChipKey =
  | 'all'
  | 'unresponded'
  | 'processing'
  | 'appointment'
  | 'myUpgrade'
  | 'delegate'
  | 'supplement'
  | 'dunning'
  | 'returned'
  | 'suspended'
  | 'soon'
  | 'overdue';

/** 已办 Tab 子筛选（PRD-02 v1.2 §7④） */
export type DoneChipKey =
  | 'all'
  | 'myUpgrade'
  | 'transfer'
  | 'delegate'
  | 'closed'
  | 'forceClose';

/** @我的工单 Tab 子筛选（PRD-02 v1.2 §7⑥） */
export type MentionChipKey = 'all' | 'unread';

/** 其它主 Tab 暂用旧版 chips（待审核等） */
export type LegacyChipKey =
  | 'all'
  | 'pending'
  | 'processing'
  | 'held'
  | 'review'
  | 'delegate'
  | 'soon'
  | 'overdue'
  | 'draft';

export type ChipKey = MineChipKey | DoneChipKey | MentionChipKey | LegacyChipKey;

/** 原型当前登录坐席对应的处理人姓名（与 mock 工单 assignee 对齐） */
export const WORKBENCH_HANDLER = '王坐席';

export type TicketType = CreateFormTicketType;
export type Channel = '在线客服' | '电话' | '邮件' | '小程序' | 'APP';
export type SmartMark = '升级' | '情绪' | '相似' | '知识';
/** 客户身份标签（列表展示，替代 VIP） */
export type CustomerTag = '记者' | '老师' | '校长' | '自媒体';
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
  /** 客户手机号（筛选） */
  customerPhone?: string;
  /** 设备 SN（筛选） */
  sn?: string;
  /** 业务类型（新建工单 · 工单基础） */
  businessType?: string;
  /** 工单来源（与 channel 互补，列表列展示） */
  ticketSource?: string;
  /** 问题分类（新建工单 · 产品问题） */
  problemL1?: string;
  problemL2?: string;
  problemL3?: string;
  /** 解决时间备注 */
  resolveTimeRemark?: string;
  /** 产品分类（筛选） */
  productCategory?: string;
  /** 客户身份标签，如记者/老师/校长/自媒体 */
  customerTags?: CustomerTag[];
  product: string;
  /** 问题描述（列表行速览） */
  problemDesc?: string;
  /** 最新处理结果（列表行速览） */
  latestHandling?: string;
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
  /** 是否已做过首次响应 */
  responded?: boolean;
  /** 是否存在预约记录 */
  hasAppointment?: boolean;
  /** 预约倒计时文案 */
  appointmentText?: string;
  /** 我发起过升级且当前仍在我名下 */
  upgradedByMe?: boolean;
  /** 历史存在委派动作（含委派返回） */
  hasDelegateHistory?: boolean;
  /** 补充信息未知晓 */
  supplementUnread?: boolean;
  /** 催单未知晓 */
  dunningUnread?: boolean;
  /** 历史存在退回动作 */
  hasReturnAction?: boolean;
  /** 我申请挂起且挂起生效 */
  suspendedByMe?: boolean;
  /** 存在催单记录（行标识「催」） */
  hasDunning?: boolean;
  /** 存在补充记录（行标识「补」） */
  hasSupplement?: boolean;
  /** 已办：我发起过升级（已转出） */
  myUpgradeAction?: boolean;
  /** 已办：我做过转办 */
  myTransferAction?: boolean;
  /** 已办：我做过委派 */
  myDelegateAction?: boolean;
  /** 已办：我做过关闭工单 */
  myCloseAction?: boolean;
  /** 已办：我做过强结 */
  myForceCloseAction?: boolean;
  /** 历史上我处理过（已办数据域标记） */
  handledByMe?: boolean;
  /** 归属用户分组（本组工单池） */
  groupId?: string;
  /** 路由/技能分组名称（可多选，列表「分组名称」列） */
  groupNames?: string[];
  /** @/抄送 未知晓 */
  mentionUnread?: boolean;
  tab: TabKey;
  /** 工单列表：是否已归档 */
  archived?: boolean;
  /** 更新时间（列表默认排序） */
  updatedAt?: string;
  /** 创建时间（排序） */
  createdAt?: string;
}

/** 新建工单弹窗预填（子单 / reopen 场景从原单继承客户/产品/渠道等） */
export interface CreateTicketPrefill {
  mode?: 'normal' | 'child' | 'reopen';
  parentNo?: string;
  parentTitle?: string;
  customerName?: string;
  customerPhone?: string;
  vip?: boolean;
  product?: string;
  sn?: string;
  channel?: Channel;
  /** 列表侧工单类型（旧枚举，兼容 Mock） */
  type?: TicketType;
  /** 新建弹窗表单工单类型（投诉/建议/商机/咨询） */
  formTicketType?: CreateFormTicketType;
  priority?: Priority;
  complaintType?: string;
  desc?: string;
  expectTime?: string;
}

// ---- 配色映射（设计风格规范 §2.3 语义色）----
// 工作台列表（TicketRichList）：仅用 PRIORITY_COLOR（色条/圆点）、SLA_COLOR；
//   类型/节点/客户标签一律中性灰 — 见 PRD-02 §7⑨。
// 操作页/详情/关联列表：TYPE_COLOR、NODE_STATUS_COLOR、CUSTOMER_TAG_COLOR 等仍可用。
export const TYPE_COLOR: Record<TicketType, string> = {
  投诉: '#EF4444',
  建议: '#10B981',
  商机: '#F59E0B',
  咨询: '#1A6FFF',
};

export const SMART_MARK_COLOR: Record<SmartMark, string> = {
  升级: '#EF4444',
  情绪: '#F97316',
  相似: '#1A6FFF',
  知识: '#10B981',
};

export const CUSTOMER_TAG_COLOR: Record<CustomerTag, string> = {
  记者: '#DC2626',
  老师: '#2563EB',
  校长: '#D97706',
  自媒体: '#9333EA',
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
  { key: 'mine', label: '我的任务', badge: '#1A6FFF' },
  { key: 'done', label: '已办', badge: '#9CA3AF' },
  { key: 'pool', label: '本组工单池', badge: '#06B6D4' },
  { key: 'review', label: '待审核', badge: '#F59E0B' },
];

/** 工作台主 Tab：支持快捷搜索 + 结构化筛选 */
export function isWorkbenchSearchTab(tab: TabKey): boolean {
  return tab === 'mine' || tab === 'done' || tab === 'pool';
}

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
      return t.tab === 'done' || t.tab === 'review';
    case 'pool':
      return t.tab === 'pool';
    default:
      return true;
  }
}

export interface ChipMeta {
  /** 内置 chip 或已保存筛选器 `sf:{id}` */
  key: ChipKey | string;
  label: string;
  /** 临期/超时为 SLA 维度，唯一保留彩色（临期=warn 橙 / 超时=danger 红）；其余为状态分类，中性。见 PRD-02 §7⑨ */
  tone?: 'warn' | 'danger';
}

/** 我的任务 · 子筛选 chips（PRD-02 v1.2 §7②） */
export const MINE_CHIPS: ChipMeta[] = [
  { key: 'all', label: '全部' },
  { key: 'unresponded', label: '待响应' },
  { key: 'processing', label: '处理中' },
  { key: 'appointment', label: '预约' },
  { key: 'myUpgrade', label: '已升级' },
  { key: 'delegate', label: '委派' },
  { key: 'supplement', label: '新补充' },
  { key: 'dunning', label: '被催办' },
  { key: 'returned', label: '被退回' },
  { key: 'suspended', label: '已挂起' },
  { key: 'soon', label: '临期', tone: 'warn' },
  { key: 'overdue', label: '已超时', tone: 'danger' },
];

/** 已办 · 子筛选 chips（PRD-02 v1.2 §7④） */
export const DONE_CHIPS: ChipMeta[] = [
  { key: 'all', label: '全部' },
  { key: 'myUpgrade', label: '已升级' },
  { key: 'transfer', label: '转办' },
  { key: 'delegate', label: '委派' },
  { key: 'closed', label: '已关闭' },
  { key: 'forceClose', label: '强结' },
];

/** @我的工单 · 子筛选 chips（PRD-02 v1.2 §7⑥） */
export const MENTION_CHIPS: ChipMeta[] = [
  { key: 'all', label: '全部' },
  { key: 'unread', label: '未知晓' },
];

/** 其它 Tab 沿用 v1.1 chips */
export const LEGACY_CHIPS: ChipMeta[] = [
  { key: 'all', label: '全部' },
  { key: 'pending', label: '待受理' },
  { key: 'processing', label: '处理中' },
  { key: 'held', label: '已挂起' },
  { key: 'review', label: '待审核' },
  { key: 'delegate', label: '委派' },
  { key: 'soon', label: '临期', tone: 'warn' },
  { key: 'overdue', label: '已超时', tone: 'danger' },
  { key: 'draft', label: '草稿' },
];

/** @deprecated 使用 chipsForTab */
export const CHIPS = LEGACY_CHIPS;

/** 本组工单池 · 用户分组（原型 Mock，对齐 BPM 用户分组） */
export interface PoolGroupMeta {
  id: string;
  label: string;
}

export const POOL_GROUPS: PoolGroupMeta[] = [
  { id: 'line1', label: '一线客服组' },
  { id: 'line2', label: '二线技术支持组' },
  { id: 'hardware', label: '硬件缺陷组' },
];

/** 列表「分组名称」列：优先 groupNames，否则按业务线+工单类型推断 */
export function resolveTicketGroupNames(t: Ticket): string[] {
  if (t.groupNames?.length) return t.groupNames;
  const names: string[] = [];
  const biz = t.businessType?.trim();
  if (biz) {
    const typeSuffix: Record<TicketType, string> = {
      咨询: '咨询',
      投诉: '投诉',
      建议: '建议',
      商机: '商机',
    };
    names.push(`${biz}${typeSuffix[t.type] ?? t.type}`);
  }
  if (t.nodeStatus === '已升级·二线' || t.smartMarks?.includes('升级')) {
    if (!names.includes('技术支持')) names.push('技术支持');
  }
  return names;
}

export type PoolGroupFilterKey = 'all' | string;

export function chipsForTab(tab: TabKey): ChipMeta[] {
  if (tab === 'mine') return MINE_CHIPS;
  if (tab === 'done') return DONE_CHIPS;
  if (tab === 'pool') return [];
  if (tab === 'cc') return MENTION_CHIPS;
  return LEGACY_CHIPS;
}

/** 我的任务数据域：当前处理人=我 且未归档 */
export function inMineTaskScope(t: Ticket, handler = WORKBENCH_HANDLER): boolean {
  return t.tab === 'mine' && t.assignee === handler && !t.archived;
}

/** 本组工单池数据域：待领取/未分配 且归属可见分组 */
export function inGroupPoolScope(t: Ticket, visibleGroupIds?: string[]): boolean {
  if (t.tab !== 'pool' || t.assignee !== null || t.archived) return false;
  if (!t.groupId) return true;
  if (!visibleGroupIds || visibleGroupIds.length === 0) return true;
  return visibleGroupIds.includes(t.groupId);
}

export function matchPoolGroup(t: Ticket, group: PoolGroupFilterKey): boolean {
  if (group === 'all') return true;
  return t.groupId === group;
}

/** @我的工单数据域：抄送/@ 列表包含我 */
export function inMentionScope(t: Ticket): boolean {
  return t.tab === 'cc' && !t.archived;
}

export function isMentionUnread(t: Ticket): boolean {
  return t.mentionUnread !== false;
}

/** 已办数据域：当前处理人≠我 且历史上我处理过 且未归档 */
export function inDoneScope(t: Ticket, handler = WORKBENCH_HANDLER): boolean {
  return (
    t.tab === 'done'
    && t.assignee !== handler
    && t.assignee !== null
    && !t.archived
    && t.handledByMe !== false
  );
}

/** 本组工单池 · 行内动作（PRD-02 v1.2：领取） */
export function poolRowActions(): { label: string; primary?: boolean }[] {
  return [{ label: '领取', primary: true }];
}

/** @我的工单 · 行内动作（PRD-02 v1.2：仅双击进详情） */
export function mentionRowActions(): { label: string; primary?: boolean }[] {
  return [];
}

/** 已办 · 行内动作（PRD-02 v1.2：仅双击进详情，无行内按钮） */
export function doneRowActions(): { label: string; primary?: boolean }[] {
  return [];
}

/** 我的任务 · 行内动作（PRD-02 v1.2：转办 / 退回） */
export function mineRowActions(): { label: string; primary?: boolean }[] {
  return [
    { label: '转办', primary: true },
    { label: '退回' },
  ];
}

/** 行内动作：按 当前节点状态 + Tab 推导（PRD-02 §7⑥） */
export function rowActions(t: Ticket): { label: string; primary?: boolean }[] {
  if (t.tab === 'pool') return poolRowActions();
  switch (t.nodeStatus) {
    case '待受理':
      return [{ label: '受理', primary: true }, { label: '转办' }];
    case '处理中·一线':
      return [{ label: '处理', primary: true }, { label: '转办' }, { label: '挂起' }];
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

/** 我的任务 chip 是否命中 */
export function matchMineChip(t: Ticket, chip: MineChipKey): boolean {
  switch (chip) {
    case 'all':
      return true;
    case 'unresponded':
      return !t.responded;
    case 'processing':
      return !!t.responded;
    case 'appointment':
      return !!t.hasAppointment;
    case 'myUpgrade':
      return !!t.upgradedByMe;
    case 'delegate':
      return !!t.hasDelegateHistory;
    case 'supplement':
      return !!t.supplementUnread;
    case 'dunning':
      return !!t.dunningUnread;
    case 'returned':
      return !!t.hasReturnAction;
    case 'suspended':
      return !!t.suspendedByMe;
    case 'soon':
      return t.slaState === 'soon';
    case 'overdue':
      return t.slaState === 'overdue';
    default:
      return true;
  }
}

/** 已办 chip 是否命中 */
export function matchDoneChip(t: Ticket, chip: DoneChipKey): boolean {
  switch (chip) {
    case 'all':
      return true;
    case 'myUpgrade':
      return !!t.myUpgradeAction;
    case 'transfer':
      return !!t.myTransferAction;
    case 'delegate':
      return !!t.myDelegateAction;
    case 'closed':
      return !!t.myCloseAction;
    case 'forceClose':
      return !!t.myForceCloseAction;
    default:
      return true;
  }
}

/** @我的工单 chip 是否命中 */
export function matchMentionChip(t: Ticket, chip: MentionChipKey): boolean {
  switch (chip) {
    case 'all':
      return true;
    case 'unread':
      return isMentionUnread(t);
    default:
      return true;
  }
}

/** chip 是否命中某工单（与 Tab 叠加） */
export function matchChip(t: Ticket, chip: ChipKey, tab: TabKey = 'mine'): boolean {
  if (tab === 'mine') {
    return matchMineChip(t, chip as MineChipKey);
  }
  if (tab === 'done') {
    return matchDoneChip(t, chip as DoneChipKey);
  }
  if (tab === 'cc') {
    return matchMentionChip(t, chip as MentionChipKey);
  }
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
    case 'draft':
      return false;
    case 'unread':
      return false;
    default:
      return true;
  }
}
