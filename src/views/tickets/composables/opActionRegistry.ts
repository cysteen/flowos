// 工单可操作项注册表（单一数据源）。按工单类型 + 条件过滤出底部操作条要展示的操作。
// 类型矩阵（规范）：
//   投诉/咨询 = 9 全量；建议 = 8（去转售后）；商机 = 5（强结/下送/转办/委派/撤回）。
// 底栏扁平展示顺序见 OpActionBar；此处仅登记能力与类型矩阵。
import type { TicketType } from '@/views/tickets/types/ticket';
import type { OpActionType } from './opActions';

export interface ActionDef {
  key: OpActionType;
  label: string;
  /** ant 图标组件名，OpActionBar 内查表解析 */
  icon: string;
  /** primary=主操作区；more=更多·子流程；manage=更多·管理类（不属于9操作） */
  group: 'primary' | 'more' | 'manage';
  /** 适用工单类型 */
  types: TicketType[];
  /** 转售后：受产品售后能力显隐 */
  needsAftersale?: boolean;
  danger?: boolean;
}

const ALL: TicketType[] = ['投诉', '咨询', '建议', '商机'];
const NO_LEAD: TicketType[] = ['投诉', '咨询', '建议']; // 商机不支持
const COMPLAINT_CONSULT: TicketType[] = ['投诉', '咨询']; // 仅投诉/咨询

export const ACTION_DEFS: ActionDef[] = [
  // —— 主操作区（高频流转）——
  { key: '转办', label: '转办', icon: 'ArrowRightOutlined', group: 'primary', types: ALL },
  { key: '委派', label: '委派', icon: 'TeamOutlined', group: 'primary', types: ALL },
  { key: '下送', label: '下送', icon: 'VerticalAlignBottomOutlined', group: 'primary', types: ALL },
  { key: '挂起', label: '挂起', icon: 'PauseCircleOutlined', group: 'primary', types: NO_LEAD },
  { key: '退回', label: '退回', icon: 'RollbackOutlined', group: 'primary', types: NO_LEAD },
  { key: '升级', label: '升级', icon: 'RiseOutlined', group: 'primary', types: NO_LEAD },
  // —— 更多 · 子流程（低频/协同/异常）——
  { key: '撤回', label: '撤回', icon: 'UndoOutlined', group: 'more', types: ALL },
  { key: '强结', label: '强结', icon: 'StopOutlined', group: 'more', types: ALL, danger: true },
  { key: '同步飞书', label: '同步飞书', icon: 'ShareAltOutlined', group: 'more', types: NO_LEAD },
  { key: '转售后', label: '转售后', icon: 'ToolOutlined', group: 'more', types: COMPLAINT_CONSULT, needsAftersale: true },
  // —— 更多 · 管理类（不属于 9 子流程）——
  { key: '关闭工单', label: '关闭工单', icon: 'CheckCircleOutlined', group: 'manage', types: ALL },
  { key: '归档工单', label: '归档工单', icon: 'InboxOutlined', group: 'manage', types: ALL },
  { key: '取消工单', label: '取消工单', icon: 'CloseOutlined', group: 'manage', types: ALL, danger: true },
];

export interface ActionCtx {
  ticketType: string;
  afterSaleEnabled: boolean;
}

/** 按工单类型 + 条件过滤可见操作。 */
export function availableActions(ctx: ActionCtx): ActionDef[] {
  return ACTION_DEFS.filter((a) => {
    if (!a.types.includes(ctx.ticketType as TicketType)) return false;
    if (a.needsAftersale && !ctx.afterSaleEnabled) return false;
    return true;
  });
}
