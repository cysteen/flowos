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
import { isXiaozhiTicket } from '@/views/tickets/types/xiaozhi';
import { isRefundTicket } from '@/views/tickets/types/refund';
import { isFirstResponded, type Ticket } from '@/views/tickets/types/ticket';
import { IN_TRANSIT_COUNT_RULE, type DispatchAgent, type DispatchStatus, type OccupyResult, type PoolMode, type SignInStatus } from '@/views/tickets/types/dispatch';
import { mapUserRole } from './opActions';
import { takeOverReturnedTicket } from './aftersaleEvents';

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
function parseStamp(s?: string): number {
  if (!s) return NaN;
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(s);
  if (!m) return NaN;
  return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0)).getTime();
}

/* ------------------------------------------------------------------ */
/* 话务条 → 签入状态（11.5：签入即在班）                                  */
/* ------------------------------------------------------------------ */

/** 话务条工作状态 → 派单签入状态：签出＝签出；小休＝小休；签入后（未就绪 / 就绪 / 通话中）＝签入 */
export function signInOfWorkStatus(s: WorkStatus): SignInStatus {
  if (s === 'offline') return '签出';
  if (s === 'break') return '小休';
  return '签入';
}

/** 话务条状态变化后同步到派单：签入后由 store 先看预留、再选排队单（4.3 名额释放选单） */
export function syncSignInFromCti(name: string, s: WorkStatus) {
  const dispatch = useDispatchStore();
  const a = dispatch.agentOf(name);
  if (!a) return;
  const next = signInOfWorkStatus(s);
  if (a.signIn === next) return;
  dispatch.setSignIn(name, next);
}

/* ------------------------------------------------------------------ */
/* 标签 · 形态                                                           */
/* ------------------------------------------------------------------ */

/** 池形态页面标识（5.2）：正常态不标 */
export function modeTagOf(mode: PoolMode): '降级' | '停派' | null {
  if (mode === '降级态') return '降级';
  if (mode === '停派态') return '停派';
  return null;
}

export const DISPATCH_STATUS_STYLE: Record<DispatchStatus, { color: string; bg: string; border: string }> = {
  派单失败回池: { color: '#DC2626', bg: '#FEF2F2', border: '#FECACA' },
  排队中: { color: '#D97706', bg: '#FFFBEB', border: '#FDE68A' },
  等原处理人: { color: '#2563EB', bg: '#EFF6FF', border: '#BFDBFE' },
};

export const MODE_TAG_STYLE: Record<'降级' | '停派', { color: string; bg: string; border: string }> = {
  降级: { color: '#D97706', bg: '#FFFBEB', border: '#FDE68A' },
  停派: { color: '#6B7280', bg: '#F3F4F6', border: '#E5E7EB' },
};

export const SIGN_IN_COLOR: Record<SignInStatus, string> = { 签入: '#10B981', 小休: '#F59E0B', 签出: '#9CA3AF' };

/** 列表排序（10.1）：派单失败回池在前，其后排队中、等原处理人，其余最后 */
export const DISPATCH_STATUS_ORDER: Record<string, number> = { 派单失败回池: 0, 排队中: 1, 等原处理人: 2 };

/** 等原处理人悬停（10.1）：「预留给 〈姓名〉，〈时:分〉 到期」 */
export function reserveTipOf(no: string): string {
  const st = useDispatchStore().ticketStateOf(no);
  if (!st || st.status !== '等原处理人' || !st.reserveFor) return '';
  return st.reserveUntil ? `预留给 ${st.reserveFor}，${hm(st.reserveUntil)} 到期` : `预留给 ${st.reserveFor}`;
}

/** 池内等待分钟：取进入派单时刻，未进入过派单的按最近更新 / 建单时刻 */
export function waitMinutesOf(t: Ticket, now: number = Date.now()): number | null {
  const st = useDispatchStore().ticketStates[t.no];
  const from = st?.enteredAt ?? (parseStamp(t.updatedAt) || parseStamp(t.createdAt));
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
/* 置灰判据（5.4 / 8.2）                                                 */
/* ------------------------------------------------------------------ */

/** 班组开关置灰提示；可操作返回空串 */
export function groupSwitchDisabledTip(groupId: string): string {
  const dispatch = useDispatchStore();
  if (!dispatch.config.globalSwitch) return '全局开关已关闭，班组开关暂不生效';
  if (dispatch.groupOf(groupId)?.mode === '停派态') return '本组已由管理员停派';
  return '';
}

/** 本组形态切换置灰提示；可操作返回空串（停派态由管理员回切） */
export function groupModeDisabledTip(groupId: string): string {
  const dispatch = useDispatchStore();
  if (dispatch.globalEffectiveMode() === '停派态') return '全局已停派，本组形态不可切换';
  if (dispatch.groupOf(groupId)?.mode === '停派态') return '本组已由管理员停派';
  return '';
}

/** 个人开关置灰提示：所在全部组的班组开关均关闭 */
export function personalSwitchDisabledTip(a: DispatchAgent): string {
  const dispatch = useDispatchStore();
  const gs = a.groupIds.map((id) => dispatch.groupOf(id)).filter((g) => !!g);
  if (gs.length && gs.every((g) => !g!.switchOn)) return '所在组均已退出自动派单，个人开关暂不生效';
  return '';
}

/** 当前登录人作为派单坐席时是否可领取（未签入置灰「签入后可领取」） */
export function claimDisabledTip(name: string): string {
  const a = useDispatchStore().agentOf(name);
  if (a && a.signIn !== '签入') return '签入后可领取';
  return '';
}

/* ------------------------------------------------------------------ */
/* 组内指派（9.3）                                                        */
/* ------------------------------------------------------------------ */

/** 指派候选行：「姓名 · 签入状态 · 在途 〈N〉 / 上限 〈M〉」，画像匹配标「匹配」，超限 / 已满标橙色 */
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
        matched: !!t && dispatch.profileMatches(a, t, 0),
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
