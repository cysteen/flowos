/**
 * 话务条「就绪」子状态 · 工作类型字典（按班组配置）。
 *
 * 结构对齐后台配置：一份全量工作类型目录（WORK_TYPE_CATALOG）+ 各班组启用的类型清单（GROUP_WORK_TYPES），
 * 班组未单独配置时取缺省清单（DEFAULT_WORK_TYPE_KEYS）。本轮无后台配置页，配置值写在这里。
 *
 * - 「工单处理」恒为首项与默认子状态；其余均为线下类工作（offline = true），期间照常派单（派单只看就绪 / 未就绪 / 小休 / 签出）。
 * - 「外呼」不是子状态：外呼通话由话务条自动进入忙碌，挂断后恢复原状态；流水记「忙碌 · 外呼」，统计计入「工单处理」。
 * - linkTicket = true 的类型切换时自动关联当前激活的工单（处于工单处理页时取该单，否则不关联），切换后不随页签改写。
 * - 班组 id / 组名取自工单处理组（types/ticket.ts POOL_GROUPS）；「投诉风险组」取自规则引擎 / 通知规则里的同名处理组。
 * - 配色经 dataviz 校验脚本（浅色底，相邻色 CVD ΔE ≥ 8）；同一班组内不会出现两项同色。
 */

export interface WorkTypeDef {
  key: string;
  /** 下拉菜单与统计图例名 */
  label: string;
  /** 状态胶囊文案 */
  capsule: string;
  /** 线下类工作：参与「状态存疑」统计（及其「占线下类工作」的分母） */
  offline: boolean;
  /** 切换时自动关联当前激活的工单 */
  linkTicket: boolean;
  color: string;
}

export const WORK_TYPE_CATALOG: WorkTypeDef[] = [
  { key: 'ticket_work', label: '工单处理', capsule: '工单处理中', offline: false, linkTicket: false, color: '#1A6FFF' },
  { key: 'offline_comm', label: '线下沟通', capsule: '线下沟通中', offline: true, linkTicket: false, color: '#10B981' },
  { key: 'review_comm', label: '沟通与复盘', capsule: '沟通复盘中', offline: true, linkTicket: false, color: '#10B981' },
  { key: 'verify_test', label: '验证测试', capsule: '验证测试中', offline: true, linkTicket: true, color: '#8B5CF6' },
  { key: 'remote_assist', label: '远程协助', capsule: '远程协助中', offline: true, linkTicket: true, color: '#06B6D4' },
  { key: 'wecom_comm', label: '企微沟通', capsule: '企微沟通中', offline: true, linkTicket: false, color: '#EC4899' },
  { key: 'affairs', label: '事务处理', capsule: '事务处理中', offline: true, linkTicket: false, color: '#A16207' },
];

/** 状态流水里外呼忙碌段的子状态值（不进子状态菜单，统计计入工单处理） */
export const OUTBOUND_SUB = 'outbound';

/** 小休：统计放最后一项，中性灰，与工作类型区分；按原因（开会 / 培训 / 茶歇 / 用餐）拆分 */
export const BREAK_ITEM = { key: 'break', label: '小休', color: '#A3ACB9' } as const;
export const BREAK_REASONS: { key: string; label: string }[] = [
  { key: 'meeting', label: '开会' },
  { key: 'training', label: '培训' },
  { key: 'tea', label: '茶歇' },
  { key: 'meal', label: '用餐' },
];

export const DEFAULT_WORK_TYPE = 'ticket_work';

/** 缺省清单（班组未单独配置时） */
export const DEFAULT_WORK_TYPE_KEYS = ['ticket_work', 'offline_comm', 'verify_test', 'remote_assist', 'wecom_comm', 'affairs'];

export interface GroupWorkTypeConfig {
  groupId: string;
  groupName: string;
  /** 启用的类型，按菜单顺序；首项须为工单处理 */
  types: string[];
}

export const GROUP_WORK_TYPES: GroupWorkTypeConfig[] = [
  { groupId: 'general', groupName: '综合处理组', types: ['ticket_work', 'offline_comm', 'verify_test', 'remote_assist', 'wecom_comm'] },
  { groupId: 'edu', groupName: '教育支持组', types: ['ticket_work', 'offline_comm', 'verify_test', 'remote_assist', 'wecom_comm'] },
  { groupId: 'complaint-risk', groupName: '投诉风险组', types: ['ticket_work', 'review_comm', 'verify_test', 'affairs', 'remote_assist', 'wecom_comm'] },
];

const BY_KEY = new Map(WORK_TYPE_CATALOG.map((t) => [t.key, t]));

export function workTypeOf(key: string | null | undefined): WorkTypeDef | undefined {
  return key ? BY_KEY.get(key) : undefined;
}

/** 班组启用的工作类型（含工单处理），未配置取缺省清单 */
export function workTypesOfGroup(groupId: string | null | undefined): WorkTypeDef[] {
  const keys = GROUP_WORK_TYPES.find((g) => g.groupId === groupId)?.types ?? DEFAULT_WORK_TYPE_KEYS;
  return keys.map((k) => BY_KEY.get(k)).filter((t): t is WorkTypeDef => !!t);
}
