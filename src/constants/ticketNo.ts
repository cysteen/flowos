/**
 * 工单号规则 —— 单一真源。
 *
 * 业务侧定义（《【830】翻录四个通用工单模板 · 基本属性》，2026-08-22）：
 *
 *     {类型前缀}-{YYYYMMDD}-{自增位}      例：IFLYZX-20260820-00001
 *
 * - **类型前缀跟着工单类型走**，不是一套走天下：咨询 ZX / 投诉 TS / 建议 JY / 商机 SJ。
 *   所以升级投诉、转咨询 / 转建议 / 转商机这些**建新单**的动作，新单前缀按**新类型**取。
 * - 所属应用「客服系统」**不进编号**。
 * - 自增位 **5 位**、按日重置、补零。
 *
 * 售后工单走售后侧自己的号段（SH…），不套这套规则。
 */
import type { TicketType } from '@/views/tickets/types/ticket';

/** 工单类型 → 类型前缀。四类之外没有前缀，调用方须先归一到四类 */
export const TICKET_NO_PREFIX: Record<TicketType, string> = {
  咨询: 'IFLYZX',
  投诉: 'IFLYTS',
  建议: 'IFLYJY',
  商机: 'IFLYSJ',
};

/** 工单类型 → 工单类型编码（模板编码，业务侧口径） */
export const TICKET_TYPE_CODE: Record<TicketType, string> = {
  咨询: 'general_consult',
  投诉: 'general_complaint',
  建议: 'general_suggestion',
  商机: 'general_opportunity',
};

function ymd(d: Date): string {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * 拼工单号。seq 是**当日自增序号**，补零到 5 位。
 * 交互稿没有全局计数器，调用方给一个当日不重复的数即可。
 */
export function makeTicketNo(type: TicketType, seq: number, when: Date = new Date()): string {
  return `${TICKET_NO_PREFIX[type]}-${ymd(when)}-${String(seq).padStart(5, '0')}`;
}

/** 从工单号反解类型前缀对应的工单类型；不是本规则的号（如售后 SH…）返回 null */
export function ticketTypeFromNo(no: string): TicketType | null {
  const p = no.slice(0, 6);
  const hit = (Object.keys(TICKET_NO_PREFIX) as TicketType[]).find((t) => TICKET_NO_PREFIX[t] === p);
  return hit ?? null;
}
