/**
 * 升级 · 三线技术支持落工单库（基线 §1 ※14 / ※14b，F13）。咨询单与刷机单共用这一份：
 * 处理页的通用「升级」只改页面上的详情，工单行不动，单子就进不了技术支持组的工单池、技术支持工作台看不到。
 *
 * - 升级：子状态「已升级技术支持」、处理人清空、进技术支持组工单池等人领；二线主责记 `primaryOwner`；
 * - 退回（技术支持 → 二线）：回二线主责名下「处理中」，归属组还原。
 */
import { POOL_GROUPS, type Ticket } from '@/views/tickets/types/ticket';
import { isXiaozhiTicket } from '@/views/tickets/types/xiaozhi';

/** 技术支持组工单池（「二线技术支持组」分组，所选具体技术支持组记在分组名称里） */
export const TECH_SUPPORT_POOL_GROUP_ID = 'line2';

/** 升级通道是不是三线技术支持（与 opActions「升级」分支同一判据：通道名含「技术支持」） */
export function isTechEscalateChannel(channel: unknown): boolean {
  return typeof channel === 'string' && channel.includes('技术支持');
}

/**
 * 升级 · 技术支持之后工单行要改的字段。`group` ＝ 弹窗所选的目标组别。
 * 小智工单没有技术支持路径（基线 ※33）：入口在升级弹窗已不出该通道，这里再兜一道，返回空补丁、工单行不动。
 */
export function techEscalationRowPatch(row: Ticket, group: string | undefined, at: string): Partial<Ticket> {
  if (isXiaozhiTicket(row)) return {};
  const pool = POOL_GROUPS.find((g) => g.id === TECH_SUPPORT_POOL_GROUP_ID)!;
  return {
    nodeStatus: '已升级技术支持',
    primaryOwner: row.assignee ?? row.primaryOwner,
    assignee: null,
    tab: 'pool',
    groupId: pool.id,
    groupNames: [group?.trim() || pool.label],
    upgradeCount: (row.upgradeCount ?? 0) + 1,
    updatedAt: at,
  };
}

/** 技术支持退回之后工单行要改的字段：回二线主责「处理中」。`groupId` / `groupNames` ＝ 二线所在组 */
export function techReturnRowPatch(
  row: Ticket,
  back: { groupId?: string; groupNames?: string[] },
  at: string,
): Partial<Ticket> {
  return {
    nodeStatus: '处理中',
    assignee: row.primaryOwner ?? row.assignee,
    primaryOwner: undefined,
    tab: 'mine',
    ...(back.groupId ? { groupId: back.groupId } : {}),
    ...(back.groupNames ? { groupNames: back.groupNames } : {}),
    updatedAt: at,
  };
}
