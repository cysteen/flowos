/**
 * 工单池领取的共用件（用户 10-19：从工单池进入的工单自动领取，不区分工单类型；其他入口均不自动领取）。
 *
 * - 入口标记：工作台「工单池」页签打开工单时带 `?from=pool`；处理页据此自动领取一次，领取后即从地址栏去掉，
 *   刷新不会再领。「刷机池」页签、查询中心、客户全景、关联单、通知、首页、班组看板等入口不带标记。
 * - 老四类（咨询 / 投诉 / 建议 …）的领取落库：处理人＝本人、子状态「待响应」、进「我的任务」、处理履历记「领取」；
 *   售后转回重派的回流单仍走 `takeOverReturnedTicket`（直落「处理中」，1025 D10）。
 *   个册退费单同此落库，但处理人记登录人姓名（不记演示处理人）。
 *   刷机单、小智单各由自己的服务落库，本文件不碰。
 */
import type { LocationQuery, LocationQueryRaw } from 'vue-router';
import { takeOverReturnedTicket } from './aftersaleEvents';
import { mapUserRole } from './opActions';
import type { TlRole } from '@/views/tickets/types/ticketDetail';
import {
  currentHandlerName, inGroupPoolScope, poolGroupIdsForTicket, visiblePoolGroupsFor, WORKBENCH_HANDLER,
  type Ticket,
} from '@/views/tickets/types/ticket';
import { isFlashTicket } from '@/views/tickets/types/flash';
import { isXiaozhiTicket } from '@/views/tickets/types/xiaozhi';
import { useFlashStore } from '@/stores/flash';
import { useXiaozhiStore } from '@/stores/xiaozhi';
import { isRefundTicket } from '@/views/tickets/types/refund';
import { useRefundStore } from '@/stores/refund';

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
 * 未认领单在处理页的共用门控（用户 10-19，F5）。三类工单（老四类 / 小智单 / 刷机单）都问这一道：
 * - `null`：本单不是未认领，按各自规则；
 * - `claim`：当前登录人能领取，且本类工单在处理页出「领取」（小智单、刷机单）→ 底栏只出「领取」；
 * - `hidden`：不能领取，或本类工单处理页不出「领取」（老四类：从工单池进入自动领取 / 工作台行内领取）→ 底栏不渲染。
 * 后两种情形处理表单一律只读（领取后才可填写）。
 */
export type UnclaimedGate = 'claim' | 'hidden' | null;

export function unclaimedGateOf(i: {
  /** 本单此刻未认领（无处理人、待领取） */
  unclaimed: boolean;
  /** 当前登录人此刻可领取本单 */
  claimable: boolean;
  /** 本类工单在处理页底栏出「领取」 */
  claimOnPage: boolean;
}): UnclaimedGate {
  if (!i.unclaimed) return null;
  return i.claimable && i.claimOnPage ? 'claim' : 'hidden';
}

/** 履历时刻 年-月-日 时:分 */
function nowStamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/**
 * 领取的唯一分派口：工作台行内「领取」、处理页底栏「领取」与从工单池进入的自动领取都走这里，
 * 同一张单不论从哪里领，落库都一样。按工单类型交给已有的落库：
 * 小智单 → 小智服务 `claimFromPool`；刷机单 → 刷机服务 `claimFromPool`；其余 → `claimPoolTicket`。
 */
export function claimTicketByType(t: Ticket, roleKey: string, userName: string): { ok: boolean; message: string } {
  const role = mapUserRole(roleKey);
  const me = currentHandlerName(roleKey, userName);
  if (isXiaozhiTicket(t)) {
    const ok = useXiaozhiStore().claimFromPool(t.no, { name: me, role });
    return { ok, message: ok ? `已领取 ${t.no}` : '本单已被领取或不在工单池中' };
  }
  if (isFlashTicket(t)) return useFlashStore().claimFromPool(t.no, { name: me, role });
  // 个册退费单（1120）：领取同咨询单，处理人与履历记登录人姓名（用户 10-27：二线记名统一为登录名），
  // 落库后由个册退费服务落快照；老四类仍记演示处理人 `WORKBENCH_HANDLER`
  const refund = isRefundTicket(t);
  const ok = claimPoolTicket(t, refund ? me : WORKBENCH_HANDLER, role, nowStamp());
  if (ok && refund) useRefundStore().afterClaim(t.no);
  if (ok) return { ok, message: `已领取 ${t.no}` };
  return { ok, message: t.assignee ? `该工单已被 ${t.assignee} 领取` : '该工单已不在工单池中' };
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
