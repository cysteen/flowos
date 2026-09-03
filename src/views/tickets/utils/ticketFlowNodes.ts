import type { FlowNode, NodeStatus, Ticket } from '@/views/tickets/types/ticket';

/** 流程节点枚举（列表「当前节点 / 上一个节点」） */
export const FLOW_NODES: FlowNode[] = [
  '工单处理',
  '技术支持',
  '调研回访',
  '挂起审批',
  '强结审批',
];

const TERMINAL_STATUSES = new Set<NodeStatus>([
  '已结案',
  '已关闭',
  '已强结',
  '直接结案',
  '已取消',
  '已转咨询',
  '已转建议',
  '已转商机',
  '已升级投诉',
  '已升级外投',
]);

/** 子状态 → 当前流程节点（无显式 flowNode 时按此推断） */
const STATUS_FLOW_NODE: Partial<Record<NodeStatus, FlowNode>> = {
  申请挂起中: '挂起审批',
  申请强结中: '强结审批',
  申请关闭中: '强结审批',
  已升级技术支持: '技术支持',
  调研中: '调研回访',
};

/** 当前节点 → 上一节点兜底（真实数据以接口 prevFlowNode 为准） */
const DEFAULT_PREV_NODE: Partial<Record<FlowNode, FlowNode>> = {
  技术支持: '工单处理',
  调研回访: '工单处理',
  挂起审批: '工单处理',
  强结审批: '工单处理',
};

export function isFlowNode(value: string): value is FlowNode {
  return (FLOW_NODES as string[]).includes(value);
}

/** 列表 · 当前流程节点 */
export function resolveCurrentFlowNode(t: Ticket): string {
  if (t.flowNode) return t.flowNode;
  const status = t.nodeStatus;
  if (TERMINAL_STATUSES.has(status)) return '—';
  return STATUS_FLOW_NODE[status] ?? '工单处理';
}

/** 列表 · 上一流程节点 */
export function resolvePreviousFlowNode(t: Ticket): string {
  if (t.prevFlowNode) return t.prevFlowNode;
  const cur = resolveCurrentFlowNode(t);
  if (cur === '—' || !isFlowNode(cur)) return '—';
  return DEFAULT_PREV_NODE[cur] ?? '—';
}
