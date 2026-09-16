/**
 * 刷机单 SLA 账本读数（930 教育刷机单 PRD §4.3，D-01）。
 *
 * 【为什么有这个文件】刷机单此前没有 SLA 真源：工单行上的 `slaText` 是一串静态快照，
 * 页头把它逆推成 total/remain 后自己每秒 −1，列表直接渲染未递减的同一串字符串 ——
 * 同一张单停留越久，两处差得越多；停钟既不记起点也不记时长，恢复时只能贴回旧快照。
 * 本文件把「起算时刻 ＋ 累计停钟毫秒 ＋ 当前停钟起点 ＋ 关钟时刻」这一份账本作为**唯一真源**，
 * 页头与列表都只按同一条算式取数，采样频率不同，读数永不分叉。
 *
 * 【边界】只管刷机单。`readSla()` 第一行分流：刷机单且已起算 → 走账本；
 * **其余一律返回 `null`，由调用方转调各自现有实现**（`ticketListCells` 的老分支、
 * `useTicketOperation.buildSlaClocks`）。老四类的口径不在本文件里复制、不改写。
 */

import type { SlaClock } from '@/mock/ticketDetail';
import type { FlashState, TicketFlash } from '@/views/tickets/types/flash';
import { parseFlashStamp } from '@/views/tickets/types/flash';
import type { SlaState, Ticket } from '@/views/tickets/types/ticket';

/**
 * 取数对象：工单行（`Ticket`）与处理页详情（`TicketDetailMeta`）都能直接喂进来 ——
 * 两处画的是同一张单的同一只钟，取数入口只留这一个。
 */
export interface SlaClockSource {
  /** 工单类型；处理页详情上是裸字符串，故此处放宽为 string */
  type: string;
  flash?: TicketFlash;
  /** 是否已首响；缺省按子状态推（未认领 / 待响应 = 未响） */
  responded?: boolean;
  nodeStatus?: string;
  firstRespBreached?: boolean;
}

/** 解决时限（PRD §4.3「暂行同咨询单」：8 小时） */
export const FLASH_SLA_LIMIT_MS = 8 * 3_600_000;
/** 首响时限（暂行同咨询单：30 分钟） */
export const FLASH_SLA_FIRST_LIMIT_MS = 30 * 60_000;
/** 临期阈值：剩余 ≤ 30 分钟转橙（与处理页表盘既有 warnSec 同值） */
export const FLASH_SLA_WARN_MS = 30 * 60_000;

export type SlaClockStatus = 'running' | 'paused' | 'stopped';
export type SlaOutcome = 'met' | 'breached' | 'void';

export interface SlaReading {
  status: SlaClockStatus;
  /** 解决钟剩余毫秒（负 = 已超） */
  remainMs: number;
  /** 首响钟剩余毫秒（负 = 已超） */
  firstRemainMs: number;
  /** 已计时长（毫秒，已扣除停钟） */
  elapsedMs: number;
  startedAtMs: number;
  /** 解决钟截止时刻：在走 / 暂停 = 起算 + 时限 + 停钟；停表 = 关钟时刻 */
  dueAtMs: number;
  stoppedAtMs?: number;
  outcome?: SlaOutcome;
}

/** 'YYYY-MM-DD HH:mm(:ss)' → 毫秒；空值 → undefined */
function stampMs(s?: string): number | undefined {
  if (!s) return undefined;
  const ms = parseFlashStamp(s).getTime();
  return Number.isNaN(ms) ? undefined : ms;
}

/**
 * 账本核心算式（只此一处）：
 * `elapsed = now − startedAt − pausedAccum − (pausedSince ? now − pausedSince : 0)`
 * 停表后钟不再走，取数时刻钉在 `stoppedAt`。
 */
export function readFlashSla(st: FlashState, now: number = Date.now()): SlaReading | null {
  const startedAtMs = stampMs(st.slaStartedAt);
  if (startedAtMs == null) return null;
  const stoppedAtMs = stampMs(st.slaStoppedAt);
  const pausedSinceMs = stampMs(st.slaPausedSince);
  const at = stoppedAtMs ?? now;
  const accum = st.slaPausedAccumMs ?? 0;
  const openPause = pausedSinceMs == null ? 0 : Math.max(0, at - pausedSinceMs);
  // 下限 0：剩余不会大于时限（PRD §4.3「恢复后……不超出时限」）
  const elapsedMs = Math.max(0, at - startedAtMs - accum - openPause);
  const status: SlaClockStatus = stoppedAtMs != null
    ? 'stopped'
    : pausedSinceMs != null ? 'paused' : 'running';
  return {
    status,
    remainMs: FLASH_SLA_LIMIT_MS - elapsedMs,
    firstRemainMs: FLASH_SLA_FIRST_LIMIT_MS - elapsedMs,
    elapsedMs,
    startedAtMs,
    dueAtMs: stoppedAtMs ?? startedAtMs + FLASH_SLA_LIMIT_MS + accum + openPause,
    stoppedAtMs,
    outcome: st.slaOutcome,
  };
}

/**
 * 分流入口：**刷机单且已起算**才有账本读数；其余（老四类、未起算的刷机单）返回 `null`，
 * 调用方转调现有实现。
 */
export function readSla(t: SlaClockSource, now: number = Date.now()): SlaReading | null {
  if (t.type !== '刷机' || !t.flash) return null;
  return readFlashSla(t.flash.state, now);
}

/** 'HH:MM' 剩余短文案：剩 03:20 / 超 01:12 */
export function formatSlaRemain(remainMs: number): string {
  const total = Math.floor(Math.abs(remainMs) / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const body = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  return remainMs < 0 ? `超 ${body}` : `剩 ${body}`;
}

/** 'HH:MM:SS' 全量剩余（写回工单行 `slaText` 用，口径同老四类的倒计时字符串） */
export function formatSlaClock(remainMs: number): string {
  const total = Math.floor(Math.abs(remainMs) / 1000);
  const p = (n: number) => String(n).padStart(2, '0');
  const body = `${p(Math.floor(total / 3600))}:${p(Math.floor((total % 3600) / 60))}:${p(total % 60)}`;
  return remainMs < 0 ? `已超 ${body}` : body;
}

/** 在走的钟按剩余取色档（超 → 红、临期 → 橙、其余绿） */
export function slaStateOf(remainMs: number): SlaState {
  if (remainMs < 0) return 'overdue';
  return remainMs <= FLASH_SLA_WARN_MS ? 'soon' : 'ok';
}

/** 账本 → 表盘钟（处理页页头）。`kind` 决定取解决钟还是首响钟。 */
export function flashSlaClock(
  r: SlaReading,
  kind: 'whole' | 'first',
  opts: { responded?: boolean; firstRespBreached?: boolean } = {},
): SlaClock {
  const whole = kind === 'whole';
  const remainMs = whole ? r.remainMs : r.firstRemainMs;
  // 首响已完成 → 首响钟按结果停表（达标 / 超时后才响的未达标）
  const firstStopped = !whole && !!opts.responded;
  const phase: SlaClock['phase'] = r.status === 'stopped' || firstStopped
    ? 'stopped'
    : r.status === 'paused' ? 'paused' : 'running';
  const outcome: SlaClock['stopOutcome'] = firstStopped
    ? (opts.firstRespBreached ? 'breached' : 'met')
    : r.status === 'stopped'
      ? r.outcome ?? (remainMs >= 0 ? 'met' : 'breached')
      : undefined;
  return {
    label: whole ? '整单解决' : '整单首响',
    kind,
    phase,
    remainSec: Math.round(remainMs / 1000),
    totalSec: (whole ? FLASH_SLA_LIMIT_MS : FLASH_SLA_FIRST_LIMIT_MS) / 1000,
    warnSec: FLASH_SLA_WARN_MS / 1000,
    dueBy: whenText(whole ? r.dueAtMs : r.startedAtMs + FLASH_SLA_FIRST_LIMIT_MS),
    stopOutcome: outcome,
    closedAt: phase === 'stopped' ? whenText(r.stoppedAtMs ?? r.startedAtMs + r.elapsedMs) : undefined,
  };
}

/** 账本 → 页头双钟（首响 + 整单解决）。非刷机单 / 未起算返回 `null`。 */
export function flashSlaClocks(t: SlaClockSource, now: number = Date.now()): SlaClock[] | null {
  const r = readSla(t, now);
  if (!r) return null;
  const responded = t.responded ?? (t.nodeStatus !== '未认领' && t.nodeStatus !== '待响应');
  return [
    flashSlaClock(r, 'whole'),
    flashSlaClock(r, 'first', { responded, firstRespBreached: t.firstRespBreached }),
  ];
}

/** 绝对时刻文案：今日 HH:MM / M/D HH:MM（与 OpSlaBar / buildSlaClocks 同口径） */
function whenText(ms: number): string {
  const d = new Date(ms);
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return d.toDateString() === new Date().toDateString()
    ? `今日 ${hm}`
    : `${d.getMonth() + 1}/${d.getDate()} ${hm}`;
}
