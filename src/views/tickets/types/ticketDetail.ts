// 工单操作页类型与配色。配色/图标对齐 PRD-03 §7 F4（6 类语义色 + lucide 图标），
// 角色徽章另用一套色（PRD-03 §7 F4）。

/**
 * 时间线条目语义类别（决定卡片色条/底色）。
 *
 * 🔴 **`risk`（风险结论）是《【720】》§3.2 定的第八类**，定义名「人对风险下的结论」，
 * 界面与图例写短名「风险结论」。它收报备提交 / 评估结论 / 协同处理 / 核实打标 / 等级变更五件。
 *
 * 【为什么不能塞进 `handle`】`handle` 是**坐席在自己这张单上的办理留痕**（字段级 diff，
 * 走「保存并登记」）；风险结论是**另一个角色对这张单下的判断**，处理人只是被告知的一方。
 * 混在一类里，质检复盘时点「工单处理」会同时捞出坐席填的字段与客诉专员给的意见，
 * 而《【720】》§2.3 V12 要的恰恰是"点风险结论，一屏看全报备、评估、协同、打标、等级变更"。
 */
export type TlCategory = 'node' | 'relate' | 'handle' | 'comm' | 'customer' | 'dunning' | 'sla' | 'praise' | 'risk';
/**
 * 条目动作（决定图标 + How 徽章文案）。
 * 第八类那几件**共用 `risk` 色条、图标各不相同**（《【720】》§5.1）：协同处理＝双人。
 */
export type TlAction =
  | 'create' | 'accept' | 'escalate' | 'hold' | 'transfer'
  | 'relate'
  | 'handle'
  | 'slaClose'
  | 'phone' | 'sms'
  | 'supplement' | 'reply'
  | 'dunning'
  | 'resolved'
  | 'praise'
  /**
   * 第八类「风险结论」那五件的图标位（《【720】》§5.1 逐件指定，**共用 `risk` 色条**）：
   * `riskReport` ＝ 报备提交（盾）、`riskAssess` ＝ 评估结论（盾+✓）、
   * `collab` ＝ 协同处理（双人）、`riskTag` ＝ 打标（放大镜+✓）、
   * `riskGrade` ＝ 风险等级变更（警示三角）。
   *
   * 🔴 **五件各占一枚、不合并成一个 `risk`**：色条已经把它们归到同一类了，
   * 图标是质检点开这一类之后**区分五件**的唯一线索；合并之后一屏全是同一个图形，
   * 而《【720】》§2.3 V12 要的正是"一屏看全报备、评估、协同、打标、等级变更"。
   */
  | 'collab' | 'riskReport' | 'riskAssess' | 'riskTag' | 'riskGrade';
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
  /**
   * 第八类「风险结论」条目的**来源记录 id**（`stores/riskHistory.ts` 的 `RiskHistoryRecord.id`）。
   *
   * 【为什么要挂这一格】履历是按工单现搭的内存态、风险结论落在持久化的 store 里，
   * 工单页每次要把后者**投影**进前者。投影必须幂等，而"已经投过没有"只能靠记录 id 认 ——
   * 靠"数一数已有几条"在多类混排时会数错，靠文案比对则会被同一个人连做两次同样的动作骗过去。
   */
  riskRecordId?: string;
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

/**
 * 语义色：色条 + 浅底 + 图例标签（催办预警后为 SLA 时效）。
 * 🔴 **本对象的键序就是图例的排列顺序**（`OpTimeline.vue` 直接 `Object.entries` 它），
 * 故第八类 `risk` 摆在最后一格，与《【720】》§3.2 的类别表编号一致。
 */
export const CATEGORY_META: Record<TlCategory, { color: string; bg: string; label: string }> = {
  node: { color: '#7C3AED', bg: '#F5F3FF', label: '流转节点' },
  relate: { color: '#4F46E5', bg: '#EEF2FF', label: '关联单' },
  handle: { color: '#0D9488', bg: '#F0FDFA', label: '工单处理' },
  comm: { color: '#06B6D4', bg: '#ECFEFF', label: '对客沟通' },
  customer: { color: '#2563EB', bg: '#EFF6FF', label: '客户输入' },
  dunning: { color: '#EF4444', bg: '#FEF2F2', label: '催办预警' },
  sla: { color: '#64748B', bg: '#F1F5F9', label: 'SLA时效' },
  praise: { color: '#F59E0B', bg: '#FFFBEB', label: '客户评价' },
  // 第八类。玫红取《【720】》§3.2 原值 #DB2777，浅底取同色系最浅一档，与另七类的深浅关系一致
  risk: { color: '#DB2777', bg: '#FDF2F8', label: '风险结论' },
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
