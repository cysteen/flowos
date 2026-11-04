/**
 * 【1215】智能派单 · 前台页面共用件（工作台「工单池」、班组看板、话务条联动）。
 *
 * 只读 / 调用 `stores/dispatch.ts`，不改 store；页面上的置灰判据、标签文案、组内指派落库集中在这里。
 * 文案均取 PRD 原文（第 5、8、9、10 章）。
 */
import { reactive } from 'vue';
import { useDispatchStore } from '@/stores/dispatch';
import { useFlashStore } from '@/stores/flash';
import { useXiaozhiStore } from '@/stores/xiaozhi';
import { useRefundStore } from '@/stores/refund';
import { useUserStore } from '@/stores/user';
import type { WorkStatus } from '@/stores/cti';
import { isFlashTicket } from '@/views/tickets/types/flash';
import { isXiaozhiPooledRecord, isXiaozhiTicket } from '@/views/tickets/types/xiaozhi';
import { isRefundTicket } from '@/views/tickets/types/refund';
import {
  DISABLED_TIP_COLOR, DISABLED_TIP_OVERLAY_INNER_STYLE, DISABLED_TIP_OVERLAY_STYLE, isFirstResponded, type Ticket,
} from '@/views/tickets/types/ticket';
import { IN_TRANSIT_COUNT_RULE, NOT_OWN_POOL_MESSAGE, type DispatchStatus, type OccupyResult, type PoolMode, type SignInStatus } from '@/views/tickets/types/dispatch';
import { mapUserRole } from './opActions';
import { takeOverReturnedTicket } from './aftersaleEvents';

/** 智能派单悬停提示的标准样式：<a-tooltip v-bind="STD_TIP_PROPS"> */
export const STD_TIP_PROPS = {
  color: DISABLED_TIP_COLOR,
  overlayStyle: DISABLED_TIP_OVERLAY_STYLE,
  overlayInnerStyle: DISABLED_TIP_OVERLAY_INNER_STYLE,
};

const MIN = 60_000;
const pad = (n: number) => String(n).padStart(2, '0');

function stamp(ms: number = Date.now()): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
function hm(ms: number): string {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/* ------------------------------------------------------------------ */
/* 话务条 → 坐席状态（11.5：就绪即在班）                                  */
/* ------------------------------------------------------------------ */

/**
 * 话务条工作状态 → 派单坐席状态：签出＝签出；小休＝小休；签入后未点就绪＝未就绪；就绪＝就绪；
 * 通话中算就绪（外呼只能从就绪发起）。
 */
export function signInOfWorkStatus(s: WorkStatus): SignInStatus {
  if (s === 'offline') return '签出';
  if (s === 'break') return '小休';
  if (s === 'logged_in') return '未就绪';
  return '就绪';
}

/** 话务条状态变化后同步到派单：点就绪不立即来单，由下一轮工单池扫描派出 */
export function syncSignInFromCti(name: string, s: WorkStatus, _beforeCall?: WorkStatus | null) {
  const dispatch = useDispatchStore();
  const a = dispatch.agentOf(name);
  if (!a) return;
  const next = signInOfWorkStatus(s);
  if (a.signIn === next) return;
  dispatch.setSignIn(name, next);
}

/* ------------------------------------------------------------------ */
/* 标签 · 派单方式                                                       */
/* ------------------------------------------------------------------ */

export type ModeTag = Exclude<PoolMode, '自动派单'>;

/** 派单方式页面标识（5.2）：自动派单不标 */
export function modeTagOf(mode: PoolMode): ModeTag | null {
  return mode === '自动派单' ? null : mode;
}

export const DISPATCH_STATUS_STYLE: Record<DispatchStatus, { color: string; bg: string; border: string }> = {
  排队中: { color: '#D97706', bg: '#FFFBEB', border: '#FDE68A' },
  等原处理人: { color: '#2563EB', bg: '#EFF6FF', border: '#BFDBFE' },
};

export const MODE_TAG_STYLE: Record<ModeTag, { color: string; bg: string; border: string }> = {
  混合派单: { color: '#D97706', bg: '#FFFBEB', border: '#FDE68A' },
  人工派单: { color: '#6B7280', bg: '#F3F4F6', border: '#E5E7EB' },
};

export const SIGN_IN_COLOR: Record<SignInStatus, string> = { 就绪: '#10B981', 未就绪: '#F97316', 小休: '#F59E0B', 签出: '#9CA3AF' };

/** 列表排序（10.1）：排队中在前，其后等原处理人，其余最后 */
export const DISPATCH_STATUS_ORDER: Record<string, number> = { 排队中: 1, 等原处理人: 2 };

/** 等原处理人悬停（10.1）：「预留给 〈姓名〉，〈时:分〉 到期」 */
export function reserveTipOf(no: string): string {
  const st = useDispatchStore().ticketStateOf(no);
  if (!st || st.status !== '等原处理人' || !st.reserveFor) return '';
  return st.reserveUntil ? `预留给 ${st.reserveFor}，${hm(st.reserveUntil)} 到期` : `预留给 ${st.reserveFor}`;
}

/** 池内等待分钟：取进入派单时刻，未经派单进池的单从进池时间起算 */
export function waitMinutesOf(t: Ticket, now: number = Date.now()): number | null {
  // 小智直通产研的记录单不是待领任务，不计等待
  if (isXiaozhiPooledRecord(t)) return null;
  const dispatch = useDispatchStore();
  const from = dispatch.ticketStates[t.no]?.enteredAt ?? dispatch.poolEnteredAtOf(t, NaN);
  if (!Number.isFinite(from)) return null;
  return Math.max(0, Math.floor((now - from) / MIN));
}

export function waitText(min: number | null): string {
  if (min == null) return '—';
  if (min < 60) return `${min} 分钟`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} 小时 ${min % 60} 分`;
  return `${Math.floor(h / 24)} 天 ${h % 24} 小时`;
}

/* ------------------------------------------------------------------ */
/* 置灰判据（10.2）                                                      */
/* ------------------------------------------------------------------ */

/** 当前登录人是否可领取（10.1 / 10.2）：非本组的池只读；未就绪、小休置灰「就绪后可领取」，签出置灰「签入后可领取」 */
export function claimDisabledTip(name: string, t?: Ticket): string {
  const dispatch = useDispatchStore();
  if (t && !dispatch.isOwnPool(t, name)) return NOT_OWN_POOL_MESSAGE;
  const a = dispatch.agentOf(name);
  if (!a || a.signIn === '就绪') return '';
  return a.signIn === '签出' ? '签入后可领取' : '就绪后可领取';
}

/** 指派、改派给非就绪坐席的二次确认（9.3）；就绪返回空串 */
export function notReadyConfirmText(name: string, signIn: SignInStatus, verb: string): string {
  if (signIn === '就绪') return '';
  const state: Record<Exclude<SignInStatus, '就绪'>, string> = { 小休: '小休中', 未就绪: '未就绪', 签出: '未签入' };
  return `${name}当前${state[signIn]}，确定${verb}？`;
}

/* ------------------------------------------------------------------ */
/* 组内指派（9.3）                                                        */
/* ------------------------------------------------------------------ */

/** 指派候选行：「姓名 · 坐席状态 · 在途 〈N〉 / 上限 〈M〉」，画像匹配标「匹配」，超限 / 已满标橙色 */
export interface AssignCandidate {
  name: string;
  staffNo: string;
  signIn: SignInStatus;
  inTransit: number;
  cap: number;
  matched: boolean;
  /** 在途 ≥ 上限：已满或超限 */
  full: boolean;
}

export function assignCandidatesOf(groupId: string, t: Ticket | null): AssignCandidate[] {
  const dispatch = useDispatchStore();
  return dispatch.membersOf(groupId)
    .filter((a) => !a.disabled && (!t || a.name !== t.assignee))
    .map((a) => {
      const v = dispatch.agentView(a.name)!;
      return {
        name: a.name,
        staffNo: a.staffNo,
        signIn: a.signIn,
        inTransit: v.inTransit,
        cap: v.cap,
        matched: !!t && dispatch.profileMatches(a, t),
        full: v.inTransit >= v.cap,
      };
    });
}

/**
 * 班组长指派落库（9.3）：先到先得 → 写处理人 / 子状态「待响应」/ 履历「指派」→ 交 store 记人工日志与超额指派。
 * 刷机、小智、个册退费单走各自服务落库。
 */
export function assignInTeam(ticket: Ticket, assignee: string): OccupyResult {
  const dispatch = useDispatchStore();
  const user = useUserStore();
  const t = reactive(ticket) as Ticket;
  const occ = dispatch.checkOccupy(t);
  if (!occ.ok) return occ;
  if (t.tab !== 'pool') return { ok: false, message: dispatch.checkOccupy(undefined).message };
  const operator = user.name;
  const role = mapUserRole(user.roleKey);
  const at = stamp();
  if (isFlashTicket(t)) {
    const res = useFlashStore().assignFromPool(t.no, assignee, { name: operator, role });
    if (!res.ok) return { ok: false, message: res.message };
  } else {
    const taken = takeOverReturnedTicket(t, { assignee, how: '指派', operator, operatorRole: role, at });
    if (taken) {
      // 回流单被指派：直落「处理中」、首响不重计（1025 D10）
      Object.assign(t, taken);
    } else {
      Object.assign(t, {
        tab: 'mine',
        assignee,
        // 整单首响已记成的不重计（9.3）
        responded: isFirstResponded(t),
        nodeStatus: t.nodeStatus === '未认领' ? '待响应' : t.nodeStatus,
        updatedAt: at,
      });
      const entry = {
        category: 'node' as const, action: 'transfer' as const, who: operator, role,
        how: '指派', what: `指派 → ${assignee}`, when: at,
      };
      if (isXiaozhiTicket(t)) {
        useXiaozhiStore().syncStatus(t.no, t.nodeStatus, { assignee });
        useXiaozhiStore().appendLog(t.no, entry);
      } else {
        t.eventTimeline = [...(t.eventTimeline ?? []), { id: `tl-${t.no}-assign-${(t.eventTimeline?.length ?? 0) + 1}`, ...entry }];
      }
    }
    if (isRefundTicket(t)) useRefundStore().afterClaim(t.no);
  }
  dispatch.recordManualTake(t, assignee, '班组长指派', operator);
  writeOverCapEntry(t, assignee);
  return { ok: true, message: `已指派给${assignee}` };
}

/** 超出个人上限时补记「超额指派」履历（13.1）：取本单最近一条人工派单日志 */
export function writeOverCapEntry(t: Ticket, name: string) {
  const dispatch = useDispatchStore();
  const manual = dispatch.logsOf(t.no).filter((x) => x.kind === '人工');
  const last = manual[manual.length - 1];
  if (last?.overCap !== '超额指派' || last.manual?.target !== name) return;
  const v = dispatch.agentView(name);
  if (!v) return;
  const entry = {
    category: 'node' as const, action: 'transfer' as const, who: '系统', role: '系统' as const, systemActor: true,
    how: '超额指派', what: `${name}在途 ${v.inTransit} / 上限 ${v.cap}，记超额指派`, when: stamp(),
  };
  if (isFlashTicket(t)) useFlashStore().logProcess(t.no, { name: '系统', role: '系统' }, entry);
  else if (isXiaozhiTicket(t)) useXiaozhiStore().appendLog(t.no, entry);
  else t.eventTimeline = [...(t.eventTimeline ?? []), { id: `tl-${t.no}-overcap-${(t.eventTimeline?.length ?? 0) + 1}`, ...entry }];
}

/**
 * 升级投诉 · 自主发起（7.3 / 11.2）：新投诉单直派发起人本人，不进入派单；计入其在途，不受上限拦截，
 * 超出记超额指派并写派单日志。调用时新单已落工单库。
 */
export function directToInitiator(ticket: Ticket): void {
  const t = reactive(ticket) as Ticket;
  const name = t.assignee;
  if (!name) return;
  const dispatch = useDispatchStore();
  if (!dispatch.agentOf(name)) return;
  Object.assign(t, { tab: 'mine', nodeStatus: t.nodeStatus === '未认领' ? '待响应' : t.nodeStatus, responded: false });
  dispatch.recordManualTake(t, name, '升级投诉直派', useUserStore().name || name);
  writeOverCapEntry(t, name);
}

/* ------------------------------------------------------------------ */
/* 改派（9.3）                                                            */
/* ------------------------------------------------------------------ */

/** 改派可选工单：归属本组的在途工单（已派出、已领取）；刷机单只含二线刷机单（一线刷机池不进入派单，12.3） */
export function reassignableTicketsOf(groupId: string, tickets: Ticket[]): Ticket[] {
  return tickets.filter((t) => t.groupId === groupId && !!t.assignee && !t.archived && !t.isDraft
    && IN_TRANSIT_COUNT_RULE[t.nodeStatus] === 'assignee' && (!isFlashTicket(t) || t.flash?.state.pool === 'l2'));
}

/**
 * 班组长改派落库（9.3）：改派原因必填、最多 200 字；先确认工单仍在原处理人名下 → 换处理人（子状态不变，SLA 不停钟不重置）→
 * 履历「指派 → 〈姓名〉；原因：〈原因〉」→ 交 store 记「改派」人工日志与超额指派。
 */
export function reassignInTeam(ticket: Ticket, assignee: string, reason: string, expectedFrom: string | null): OccupyResult {
  const dispatch = useDispatchStore();
  const user = useUserStore();
  const t = reactive(ticket) as Ticket;
  const r = reason.trim();
  if (!r) return { ok: false, message: '请填写改派原因' };
  if (r.length > 200) return { ok: false, message: '改派原因最多 200 字' };
  // 先到先得：弹窗打开后工单已被他人改动（换了处理人或已离开在途），按「该工单已被领取」处理
  if (!t.assignee || t.assignee !== expectedFrom || IN_TRANSIT_COUNT_RULE[t.nodeStatus] !== 'assignee') {
    return { ok: false, message: dispatch.checkOccupy(undefined).message };
  }
  const operator = user.name;
  const role = mapUserRole(user.roleKey);
  const at = stamp();
  if (isFlashTicket(t)) {
    // 二线刷机单走刷机服务落库：写处理人、履历并落刷机缓存（12.3）
    const res = useFlashStore().reassign(t.no, assignee, { name: operator, role }, r);
    if (!res.ok) return { ok: false, message: res.message };
    dispatch.recordManualTake(t, assignee, '改派', operator, r);
    writeOverCapEntry(t, assignee);
    return { ok: true, message: `已改派给${assignee}` };
  }
  Object.assign(t, { assignee, tab: 'mine', updatedAt: at });
  const entry = {
    category: 'node' as const, action: 'transfer' as const, who: operator, role,
    how: '改派', what: `指派 → ${assignee}；原因：${r}`, when: at,
  };
  if (isXiaozhiTicket(t)) {
    useXiaozhiStore().syncStatus(t.no, t.nodeStatus, { assignee });
    useXiaozhiStore().appendLog(t.no, entry);
  } else {
    t.eventTimeline = [...(t.eventTimeline ?? []), { id: `tl-${t.no}-reassign-${(t.eventTimeline?.length ?? 0) + 1}`, ...entry }];
  }
  if (isRefundTicket(t)) useRefundStore().afterClaim(t.no);
  dispatch.recordManualTake(t, assignee, '改派', operator, r);
  writeOverCapEntry(t, assignee);
  return { ok: true, message: `已改派给${assignee}` };
}
