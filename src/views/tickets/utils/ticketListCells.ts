import type { Ticket } from '@/views/tickets/types/ticket';
import { isFirstResponded, isSlaPaused, resolveTicketGroupNames, SLA_COLOR } from '@/views/tickets/types/ticket';
import { resolveCurrentFlowNode, resolvePreviousFlowNode } from '@/views/tickets/utils/ticketFlowNodes';

export function formatStartDate(t: Ticket): string {
  if (!t.createdAt) return '—';
  return t.createdAt.slice(0, 10);
}

/** 列表日期时间（建单 / 更新） */
export function formatListDateTime(value: string): string {
  return value.length > 16 ? value.slice(0, 16) : value;
}

/** 单号缺时间字段时的展示兜底（与 mock ensureTicketTimestamps 口径一致） */
export function inferListDateTimeFromNo(no: string): string {
  const m = no.match(/^IFLY[A-Z]{2}(\d{4})(\d{2})(\d{2})/i);
  if (!m) return '2026-06-10 09:00';
  return `${m[1]}-${m[2]}-${m[3]} 09:00`;
}

export function formatCurrentGroup(t: Ticket): string {
  const names = resolveTicketGroupNames(t);
  if (!names.length) return '—';
  if (names.length === 1) return names[0];
  return `${names[0]} +${names.length - 1}`;
}

export interface HandlerGroupCell {
  person: string;
  group: string;
}

/** 当前处理人 + 当前处理组（两行展示） */
export function formatCurrentHandlerGroup(t: Ticket): HandlerGroupCell {
  return {
    person: t.assignee ?? '— 待领',
    group: formatCurrentGroup(t),
  };
}

/** 上次处理人 + 上次处理组（两行展示） */
export function formatLastHandlerGroup(t: Ticket): HandlerGroupCell {
  return {
    person: t.lastHandler ?? '—',
    group: t.lastHandlerGroup ?? '—',
  };
}

export function formatCount(n?: number): string {
  if (n == null || Number.isNaN(n)) return '—';
  return String(n);
}

/** 列表 plain 列文案 */
export function listCellText(t: Ticket, key: string): string {
  switch (key) {
    case 'startDate':
      return formatStartDate(t);
    case 'createdAt':
      return formatListDateTime(t.createdAt ?? inferListDateTimeFromNo(t.no));
    case 'updatedAt':
      return formatListDateTime(t.updatedAt ?? t.createdAt ?? inferListDateTimeFromNo(t.no));
    case 'lastHandler':
      return t.lastHandler ?? '—';
    case 'flowNode':
      return resolveCurrentFlowNode(t);
    case 'prevFlowNode':
      return resolvePreviousFlowNode(t);
    default:
      return '—';
  }
}

/* ---------------- SLA 列：两行文本「解决：超/剩」「首响：超/剩」（PRD §8.2） ---------------- */
//
// 🔴 **从 `TicketRichList.vue` 的 `<script setup>` 里提出来的**，因为它不再只有一处用：
// 风险监控页「未标记」段那两路也要摆同一格 SLA。留在组件私有作用域里的话，第二处只能抄一份，
// 而"同一口径两处各写各的"迟早分叉 —— 这张表判「已达标 / 未达标 / 已暂停」的分支有五条，
// 抄漏任何一条，两个页面就会对同一张单给出不同的 SLA 说法。
// 组件那一侧改成 import，行为一字未动。

/** 倒计时短文案：'03:20:00'→'剩 03:20'；'已超 01:12'→'超 01:12'；'已暂停' 等非倒计时文案原样 */
export function slaShort(text: string): string {
  if (text.startsWith('已超')) return text.replace('已超', '超');
  if (!/\d/.test(text)) return text;
  return `剩 ${text.replace(/^(\d{2}:\d{2}):\d{2}$/, '$1')}`;
}

export interface SlaLine {
  text: string;
  color: string;
}

const BREACHED_LINE: SlaLine = { text: '未达标', color: SLA_COLOR.overdue };
const MET_LINE: SlaLine = { text: '已达标', color: SLA_COLOR.ok };
/**
 * 第三种终态：**中止**（PRD-730 §8.1① 第三行「已停表 · 深灰 #6B7280」）。
 * 钟不是走完的，是被掐断的 —— 本单从未被解决，也从未违约，**没有达标结论可言**。
 * `SLA_COLOR.paused` 恰为 #6B7280，与操作页表盘条（`OpSlaBar.stateLabelOf` 的 `void` 分支）同色同文案。
 */
const VOID_LINE: SlaLine = { text: '已停表', color: SLA_COLOR.paused };

/**
 * 中止类停表原因。取值对齐 `opActions.terminateClocks(voidStop=true)` 的三个调用点：
 * 升级派生新单（:861）、转到新单/转售后等待回传（:681）、取消等业务中止（:949）。
 * 其余停表原因（已结案 / 已关闭 / 已强结 / 直接结案 / 售后已完成）都是**解决收口**，
 * 钟是走完的，达标结论有效，不在此列。
 */
// 「未计时」：刷机单自助刷机成功直进回访，从未进过人工池、SLA 从未起算（930 教育刷机单 D18），无达标结论
const VOID_STOP_REASON_RE = /升级|转出|取消|中止|未计时/;

/**
 * 这张单是否应按「中止停表」展示。
 *
 * 🔴 `solveBreached` **优先于中止**：真超时过再被掐钟，超时是已经发生的事实，
 * 不能被一次升级/转出洗成"无结论"。同时这条优先级保住了 `isSlaBreachedNow`
 * ——否则 t41（超时 15 天后升外投）会从「已超时」筛选里凭空消失。
 */
export function isSlaVoidStop(t: Ticket): boolean {
  return t.slaText === '—' && !t.solveBreached && VOID_STOP_REASON_RE.test(t.slaSub ?? '');
}

/**
 * 刷机单 SLA 不计时（930 教育刷机单 PRD §4.3 / §9.2，M88 / M103）：从未起算（首推「自动刷机中」、
 * 自动刷机成功直进回访）或「调研中」，列表 SLA 列显示「—」，与处理页页头同一口径。老四类恒为 false。
 */
export function isFlashSlaIdle(t: Ticket): boolean {
  if (t.type !== '刷机' || !t.flash) return false;
  return !t.flash.state.slaStartedAt || t.nodeStatus === '调研中';
}

const IDLE_LINE: SlaLine = { text: '—', color: SLA_COLOR.paused };

/**
 * 解决行状态全枚举：剩(正常绿/临期橙)/超(红·在计)/已暂停(灰·挂起)
 * /已达标(绿·时限内收口)/未达标(红·超时后收口)/已停表(深灰·中止，无结论)
 */
export function slaResolveLine(t: Ticket): SlaLine {
  if (isFlashSlaIdle(t)) return IDLE_LINE;
  if (t.slaText === '—') {
    // 已停表：先看有没有记过超时（事实优先），再分「中止无结论」与「收口按结果」
    if (t.solveBreached) return BREACHED_LINE;
    return isSlaVoidStop(t) ? VOID_LINE : MET_LINE;
  }
  // 刷机单停钟（自动刷机中 / 线下登记待批推，930 D18 / M31）：挂起单仍走下方原逻辑
  if (t.slaState !== 'paused' && isSlaPaused(t)) return { text: '已暂停', color: SLA_COLOR.paused };
  if (!isFirstResponded(t) && t.resolveSlaText) {
    return { text: slaShort(t.resolveSlaText), color: SLA_COLOR[t.resolveSlaState ?? 'ok'] };
  }
  return { text: slaShort(t.slaText), color: SLA_COLOR[t.slaState] };
}

/** 首响行状态全枚举：剩(正常绿/临期橙)/超(红·未响仍在计)/已暂停(灰·挂起且未响)/已达标(绿)/未达标(红·超时后才响) */
export function slaFirstLine(t: Ticket): SlaLine {
  if (isFlashSlaIdle(t)) return IDLE_LINE;
  if (isFirstResponded(t)) return t.firstRespBreached ? BREACHED_LINE : MET_LINE;
  if (isSlaPaused(t)) return { text: '已暂停', color: SLA_COLOR.paused };
  return { text: slaShort(t.slaText), color: SLA_COLOR[t.slaState] };
}

/**
 * 这张单**此刻是不是超时态**（解决或首响任一未达标 / 已超）。
 * 供"按 SLA 是否超时"这类筛选用 —— 判据取上面那两行的**结论文案**，
 * 不另起一套阈值比较：另写一套的话，筛出来的行与它自己那一格显示的颜色迟早对不上。
 */
export function isSlaBreachedNow(t: Ticket): boolean {
  const r = slaResolveLine(t);
  const f = slaFirstLine(t);
  const bad = (l: SlaLine) => l.text === '未达标' || l.text.startsWith('超');
  return bad(r) || bad(f);
}
