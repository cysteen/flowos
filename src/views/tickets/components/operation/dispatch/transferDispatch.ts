/**
 * 【1215】智能派单 · 处理页「调剂」「升级 · 三线技术支持」接入派单（PRD 9.4 / 9.5 / 12.5）。
 *
 * - 调剂到人：指定人直派，不经门槛与评分；可超个人上限（记超额指派）；归属池由调剂人在此人所在各组的启用池中选一个，
 *   归属组随池；落库后 `recordManualTake('调剂到人')`。
 * - 调剂到池：清空处理人、改归属池，`redispatchToPool('调剂到池')` 重新派送。
 * - 升级三线：到技术支持池 → `redispatchToPool('升级三线')`；指定技术支持 → 直派并 `recordManualTake('升级三线指定人')`。
 *   二线仍为主责（工单行 `primaryOwner`），三线退回沿用现行逻辑。
 *
 * 【落库次序】处理页在通用动作之后还会改工单行（升级 · 技术支持的进池补丁、刷机单子状态同步），
 * 引擎判定必须排在那些写入之后，故到池 / 升级的派单放到本轮动作结束后的微任务里执行。
 */
import { reactive } from 'vue';
import { TICKETS } from '@/mock/tickets';
import { useDispatchStore } from '@/stores/dispatch';
import { useFlashStore } from '@/stores/flash';
import { useXiaozhiStore } from '@/stores/xiaozhi';
import { isFlashTicket } from '@/views/tickets/types/flash';
import { isXiaozhiTicket } from '@/views/tickets/types/xiaozhi';
import { TECH_SUPPORT_POOL_GROUP_ID } from '@/views/tickets/composables/techEscalation';
import type { Ticket } from '@/views/tickets/types/ticket';
import type { TicketDetailMeta } from '@/mock/ticketDetail';
import type { TimelineEntry, TlRole } from '@/views/tickets/types/ticketDetail';

/** 技术支持池（三线技术支持组，与 `techEscalation.TECH_SUPPORT_POOL_GROUP_ID` 同一个组） */
export const TECH_POOL_ID = TECH_SUPPORT_POOL_GROUP_ID;

export function techPoolLabel(): string {
  return useDispatchStore().poolLabel(TECH_POOL_ID);
}

const pad = (n: number) => String(n).padStart(2, '0');
function stampNow(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

let seq = 0;
function entryId(no: string): string {
  seq += 1;
  return `dsp-${no}-${Date.now()}-${seq}`;
}

export function ticketRowOf(no?: string | null): Ticket | undefined {
  return no ? TICKETS.find((t) => t.no === no) : undefined;
}

/** 写一条履历：刷机 / 小智单进各自服务的履历；其余写工单行并同步到本页履历 */
function writeEntry(
  row: Ticket,
  timeline: TimelineEntry[],
  partial: Omit<TimelineEntry, 'id' | 'when'>,
) {
  if (isFlashTicket(row)) {
    useFlashStore().logProcess(row.no, { name: partial.who, role: partial.role }, partial);
    return;
  }
  if (isXiaozhiTicket(row)) {
    useXiaozhiStore().appendLog(row.no, partial);
    return;
  }
  const entry: TimelineEntry = { id: entryId(row.no), when: stampNow(), ...partial };
  row.eventTimeline = [...(row.eventTimeline ?? []), entry];
  timeline.push({ ...entry });
}

/** 引擎写在工单行上的新履历并入本页（刷机 / 小智单由各自服务的修订号驱动本页重投影） */
function syncNewRowEntries(row: Ticket, timeline: TimelineEntry[], beforeIds: Set<string>) {
  if (isFlashTicket(row) || isXiaozhiTicket(row)) return;
  const pageIds = new Set(timeline.map((e) => e.id));
  for (const e of row.eventTimeline ?? []) {
    if (beforeIds.has(e.id) || pageIds.has(e.id)) continue;
    timeline.push({ ...e });
  }
}

function rowIds(row: Ticket): Set<string> {
  return new Set((row.eventTimeline ?? []).map((e) => e.id));
}

/** 详情页的处理人 / 子状态 / 归属组跟随工单行 */
function syncDetail(detail: TicketDetailMeta, row: Ticket, opts: { handler?: boolean } = {}) {
  detail.status = row.nodeStatus;
  detail.groupId = row.groupId;
  detail.groupNames = row.groupNames ? [...row.groupNames] : row.groupNames;
  if (opts.handler) detail.lastHandler = row.assignee ?? null;
}

function groupNamesWith(row: Ticket, label: string): string[] {
  return [label, ...(row.groupNames ?? []).slice(1).filter((n) => n !== label)];
}

/** 指定人直派超出上限时补记「超额指派」履历（13.1） */
function writeOverCapEntry(row: Ticket, timeline: TimelineEntry[], name: string) {
  const store = useDispatchStore();
  const manual = store.logsOf(row.no).filter((x) => x.kind === '人工');
  const last = manual[manual.length - 1];
  if (last?.overCap !== '超额指派' || last.manual?.target !== name) return;
  const v = store.agentView(name);
  if (!v) return;
  writeEntry(row, timeline, {
    category: 'node', action: 'transfer', who: '系统', role: '系统', systemActor: true,
    how: '超额指派', what: `${name}在途 ${v.inTransit} / 上限 ${v.cap}，记超额指派`,
  });
}

/** 调剂到池 / 升级进池后的提示：目标池可派单时「系统将重新派送」，混合派单、人工派单时「等待组内领取」 */
function poolWillDispatch(poolId: string): boolean {
  return useDispatchStore().effectiveModeOf(poolId) === '自动派单';
}

/* ------------------------------------------------------------------ */
/* 调剂                                                                 */
/* ------------------------------------------------------------------ */

export interface TransferDispatchInput {
  mode: 'person' | 'pool';
  /** 到人：处理人姓名 */
  target?: string;
  /** 到人：调剂后的归属池；到池：目标池（工单池 id，启用中的池） */
  poolId?: string;
  reason: string;
}

export function applyTransferDispatch(
  detail: TicketDetailMeta,
  timeline: TimelineEntry[],
  input: TransferDispatchInput,
  operator: string,
  role: TlRole,
): { message: string; handled: boolean } {
  const row = ticketRowOf(detail.no);
  if (!row) return { message: '', handled: false };
  const store = useDispatchStore();
  const reason = input.reason.trim();

  if (input.mode === 'pool' && input.poolId) {
    const poolId = input.poolId;
    const label = store.poolLabel(poolId);
    const willDispatch = poolWillDispatch(poolId);
    // 刷机单处理页在通用动作后还会同步子状态并清处理人，派单排在它之后
    queueMicrotask(() => {
      const target = reactive(row) as Ticket;
      const before = rowIds(target);
      const g = store.poolGroupOf(poolId);
      if (g) target.groupNames = groupNamesWith(target, g.label);
      target.myTransferAction = true;
      store.redispatchToPool(target, poolId, '调剂到池', operator, reason);
      // 引擎以系统身份记「调剂到池」，操作人改回发起人（13.1）
      target.eventTimeline = (target.eventTimeline ?? []).map((e) => (
        !before.has(e.id) && e.how === '调剂到池' && e.systemActor
          ? { ...e, who: operator, role, systemActor: undefined }
          : e
      ));
      syncNewRowEntries(target, timeline, before);
      syncDetail(detail, target, { handler: true });
    });
    return {
      handled: true,
      message: willDispatch ? `已调剂到${label}，系统将重新派送` : `已调剂到${label}，等待组内领取`,
    };
  }

  const name = input.target ?? '';
  if (!name) return { message: '', handled: false };
  const target = reactive(row) as Ticket;
  const newPool = store.poolOf(input.poolId);
  const newGroup = newPool && newPool.groupId !== target.groupId ? store.groupOf(newPool.groupId) : undefined;
  Object.assign(target, {
    assignee: name,
    tab: 'mine',
    nodeStatus: target.nodeStatus === '未认领' ? '待响应' : target.nodeStatus,
    myTransferAction: true,
    updatedAt: stampNow(),
    ...(newGroup ? { groupId: newGroup.id, groupNames: groupNamesWith(target, newGroup.label) } : {}),
  });
  if (isXiaozhiTicket(target)) useXiaozhiStore().syncStatus(target.no, target.nodeStatus, { assignee: name });
  writeEntry(target, timeline, {
    category: 'node', action: 'transfer', who: operator, role,
    how: '调剂到人', what: `调剂到人 → ${name}${reason ? `；原因：${reason}` : ''}`,
  });
  if (newPool) store.setTicketPool(target.no, newPool.id);
  store.recordManualTake(target, name, '调剂到人', operator, reason);
  writeOverCapEntry(target, timeline, name);
  syncDetail(detail, target, { handler: true });
  return { handled: true, message: `已调剂给${name}` };
}

/**
 * 列表侧（查询中心行内调剂、工作台批量调剂）复用处理页同一套调剂落库：到池清空处理人、改归属池并重新派送；
 * 到人指定人直派并记派单日志。列表侧无处理页详情与本页履历，传空壳。
 */
export function applyTransferToRow(
  row: Ticket,
  input: TransferDispatchInput,
  operator: string,
  role: TlRole,
): { message: string; handled: boolean } {
  return applyTransferDispatch({ no: row.no } as TicketDetailMeta, [], input, operator, role);
}

/* ------------------------------------------------------------------ */
/* 升级三线                                                              */
/* ------------------------------------------------------------------ */

export interface EscalateDispatchInput {
  mode: 'pool' | 'person';
  /** 指定技术支持：姓名 */
  member?: string;
  reason: string;
  /** 处理页已记的「升级三线 → …」履历：随派单写进工单行，刷新后保留（13.1） */
  escalateEntry?: TimelineEntry;
}

/** 升级履历落到工单行（同 id，本页并入时不重复）；刷机单经刷机履历落快照 */
function persistEscalateEntry(row: Ticket, entry?: TimelineEntry) {
  if (!entry) return;
  if (isFlashTicket(row)) {
    const { id: _id, when: _when, ...partial } = entry;
    useFlashStore().logProcess(row.no, { name: entry.who, role: entry.role }, partial);
    return;
  }
  if (isXiaozhiTicket(row)) return;
  if ((row.eventTimeline ?? []).some((e) => e.id === entry.id)) return;
  row.eventTimeline = [...(row.eventTimeline ?? []), { ...entry }];
}

/**
 * 升级 · 三线技术支持之后的派单（处理页已把工单行改成「已升级技术支持」、进技术支持池、二线记主责）。
 * 返回提示文案。
 */
export function scheduleEscalateDispatch(
  detail: TicketDetailMeta,
  timeline: TimelineEntry[],
  input: EscalateDispatchInput,
  operator: string,
  role: TlRole = '二线专员',
): string {
  const store = useDispatchStore();
  const label = store.poolLabel(TECH_POOL_ID);
  const reason = input.reason.trim();
  const no = detail.no;
  if (input.mode === 'person' && input.member) {
    const name = input.member;
    queueMicrotask(() => {
      const row = ticketRowOf(no);
      if (!row) return;
      const target = reactive(row) as Ticket;
      persistEscalateEntry(target, input.escalateEntry);
      Object.assign(target, { assignee: name, tab: 'mine', updatedAt: stampNow() });
      // 刷机单的工单行由刷机服务落库（刷机缓存）：经刷机履历写一条指定记录并落快照
      if (isFlashTicket(target)) {
        useFlashStore().logProcess(target.no, { name: operator, role }, {
          category: 'node', action: 'transfer', who: operator, role,
          how: '升级三线指定人', what: `指定技术支持 ${name} 处理${reason ? `；说明：${reason}` : ''}`,
        });
      }
      store.recordManualTake(target, name, '升级三线指定人', operator, reason);
      writeOverCapEntry(target, timeline, name);
    });
    return `已升级至 ${name}`;
  }
  const willDispatch = poolWillDispatch(TECH_POOL_ID);
  queueMicrotask(() => {
    const row = ticketRowOf(no);
    if (!row) return;
    const target = reactive(row) as Ticket;
    persistEscalateEntry(target, input.escalateEntry);
    const before = rowIds(target);
    store.redispatchToPool(target, TECH_POOL_ID, '升级三线', operator, reason);
    syncNewRowEntries(target, timeline, before);
  });
  return willDispatch ? `已升级到${label}，系统将重新派送` : `已升级到${label}，等待组内领取`;
}
