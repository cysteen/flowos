/**
 * 工单池领取的共用件（用户 10-19：从工单池进入的工单自动领取，不区分工单类型；其他入口均不自动领取）。
 *
 * - 入口标记：工作台「工单池」页签打开工单时带 `?from=pool`；处理页据此自动领取一次，领取后即从地址栏去掉，
 *   刷新不会再领。「刷机池」页签、查询中心、客户全景、关联单、通知、首页、班组看板等入口不带标记。
 * - 老四类（咨询 / 投诉 / 建议 …）的领取落库：处理人＝本人、子状态「待响应」、进「我的任务」、处理履历记「领取」；
 *   售后转回重派的回流单仍走 `takeOverReturnedTicket`（直落「处理中」，1025 D10）。
 *   刷机单、小智单各由自己的服务落库，本文件不碰。
 */
import type { LocationQuery, LocationQueryRaw } from 'vue-router';
import { takeOverReturnedTicket } from './aftersaleEvents';
import type { TlRole } from '@/views/tickets/types/ticketDetail';
import {
  inGroupPoolScope, poolGroupIdsForTicket, visiblePoolGroupsFor,
  type Ticket,
} from '@/views/tickets/types/ticket';

const POOL_ENTRY_KEY = 'from';
const POOL_ENTRY_VALUE = 'pool';

/** 工单池入口的路由参数 */
export function poolEntryQuery(): LocationQueryRaw {
  return { [POOL_ENTRY_KEY]: POOL_ENTRY_VALUE };
}

/** 本次打开是否来自工单池 */
export function isPoolEntry(query: LocationQuery): boolean {
  return query[POOL_ENTRY_KEY] === POOL_ENTRY_VALUE;
}

/** 去掉入口标记后的路由参数（领取一次即去掉，刷新不再领） */
export function withoutPoolEntry(query: LocationQuery): LocationQueryRaw {
  const next: LocationQueryRaw = { ...query };
  delete next[POOL_ENTRY_KEY];
  return next;
}

/**
 * 自动领取看工单自身状态（与入口标记同时成立才领）：子状态「未认领」∧ 在工单池里 ∧ 处理人为空。
 * 已有处理人的单一律不领 —— 含处理人为「系统」的单（如直通产研、池里只留记录的单），
 * 以及退回给建单人 / 修改人、已有处理人且不在池里的单。所有工单类型共用这一道判据。
 */
export function canAutoClaim(t: Pick<Ticket, 'nodeStatus' | 'tab' | 'assignee'> | undefined): boolean {
  if (!t) return false;
  return t.nodeStatus === '未认领' && t.tab === 'pool' && !t.assignee?.trim();
}

/** 本单此刻在当前角色可见的工单池里、无人认领（与工作台「工单池」页签同一判据） */
export function inVisiblePool(t: Ticket | undefined, roleKey: string): boolean {
  if (!t) return false;
  const ids = visiblePoolGroupsFor(roleKey).map((g) => g.id);
  return inGroupPoolScope(t, poolGroupIdsForTicket(t, ids));
}

/**
 * 领取老四类工单池里的单：成功返回 true；已被他人领走 / 已不在池内返回 false，不改任何字段。
 * `who`：处理人名（工单数据源口径）；`role`：履历角色名；`at`：年-月-日 时:分。
 */
export function claimPoolTicket(t: Ticket, who: string, role: TlRole, at: string): boolean {
  if (t.tab !== 'pool' || t.assignee !== null) return false;
  const taken = takeOverReturnedTicket(t, { assignee: who, how: '领取', operator: who, operatorRole: role, at });
  if (taken) {
    Object.assign(t, taken);
    return true;
  }
  t.tab = 'mine';
  t.assignee = who;
  t.responded = false;
  // 630 §4.1：领取 未认领 → 待响应；池里其他子状态（如跨组调剂落池）不改
  if (t.nodeStatus === '未认领') t.nodeStatus = '待响应';
  t.eventTimeline = [...(t.eventTimeline ?? []), {
    id: `tl-${t.no}-claim-${(t.eventTimeline?.length ?? 0) + 1}`,
    category: 'node', action: 'accept', who, role,
    how: '领取', what: `${who} 从池中领取本单。`, when: at,
  }];
  t.updatedAt = at;
  return true;
}
