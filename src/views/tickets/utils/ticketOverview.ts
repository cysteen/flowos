import type { LatestHandlingItem } from '@/views/tickets/types/operation';
import type { Ticket } from '@/views/tickets/types/ticket';
import type { TimelineEntry } from '@/views/tickets/types/ticketDetail';

/** 最新处理 · 动作文案（速览带与列表 hover 共用） */
export const LATEST_HANDLING_ACTION = {
  PROCESS: '提交工单处理结果',
  TECH: '提交技术支持处理结果',
  REGISTER: '登记工单',
} as const;

/** 展示用：优先 action，否则按 source / role 推断 */
export function resolveLatestHandlingAction(h: LatestHandlingItem): string {
  if (h.action?.trim()) return h.action.trim();
  if (h.source === 'tech') return LATEST_HANDLING_ACTION.TECH;
  if (h.source === 'process') return LATEST_HANDLING_ACTION.PROCESS;
  if (h.role === '技术支持') return LATEST_HANDLING_ACTION.TECH;
  if (h.role === '一线坐席') return LATEST_HANDLING_ACTION.REGISTER;
  return LATEST_HANDLING_ACTION.PROCESS;
}

/** 列表与处理页速览带共用：产品&问题一行文案 */
export function ticketProductIssue(t: Ticket): string {
  const parts = [t.productCategory, t.product].filter(Boolean);
  return parts.length ? parts.join('-') : t.product;
}

function formatOverviewWhen(updatedAt?: string): string {
  if (!updatedAt) return '最近';
  const today = new Date();
  const ymd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  if (updatedAt.startsWith(ymd)) {
    const hm = updatedAt.slice(11, 16);
    return hm ? `今天 ${hm}` : '今天';
  }
  return updatedAt.slice(5, 16);
}

/** 列表「最新」与处理页「最新处理」首条对齐 */
export function ticketLatestHandlingItems(t: Ticket): LatestHandlingItem[] {
  const text = t.latestHandling?.trim();
  if (!text) return [];
  return [{
    who: t.assignee ?? '处理人',
    role: '二线专员',
    action: LATEST_HANDLING_ACTION.PROCESS,
    when: formatOverviewWhen(t.updatedAt),
    text,
  }];
}

export function ticketLatestHandlingPreview(t: Ticket): LatestHandlingItem | null {
  const items = ticketLatestHandlingItems(t);
  return items[0] ?? null;
}

/** 「最新处理」卡的一块：处理人 · 时间 + 正文 */
export interface LatestResultBlock {
  who: string;
  role: string;
  when: string;
  text: string;
}

/** 处理表单里算「处理结果」的字段（刷机单一线的刷机处理记录同样计入） */
const PROCESS_RESULT_FIELDS = ['处理结果', '刷机处理记录'];
/** 技术支持 Tab 的处理结果，保存时以此字段名记入处理履历 */
export const TECH_RESULT_FIELD = '技术支持处理结果';

function resultTextOf(e: TimelineEntry, fields: string[]): string | undefined {
  const hit = [...(e.changes ?? [])].reverse().find((c) => fields.includes(c.field) && c.to && c.to !== '（已清空）');
  return hit?.to?.trim() || undefined;
}

/**
 * 「最新处理」卡：取处理履历里最近一次保存的处理结果与技术支持处理结果。
 * 只认「工单处理」类条目上的字段变更（处理人、时间随条目落库）；
 * 刷机单一线的处理条目正文即刷机处理记录（无字段变更），按正文计入。
 * 领取、升级、流转等事件不在此列。
 */
export function latestResultsFromTimeline(entries: TimelineEntry[]): {
  process: LatestResultBlock | null;
  tech: LatestResultBlock | null;
} {
  let process: LatestResultBlock | null = null;
  let tech: LatestResultBlock | null = null;
  for (let i = entries.length - 1; i >= 0 && (!process || !tech); i--) {
    const e = entries[i];
    if (e.category !== 'handle') continue;
    const at = { who: e.who, role: e.role, when: e.when.length > 16 ? e.when.slice(0, 16) : e.when };
    if (!tech) {
      const t = resultTextOf(e, [TECH_RESULT_FIELD]);
      if (t) tech = { ...at, text: t };
    }
    if (!process) {
      const p = e.changes?.length
        ? resultTextOf(e, PROCESS_RESULT_FIELDS)
        : (e.how === '工单处理' ? e.what?.trim() : undefined);
      if (p) process = { ...at, text: p };
    }
  }
  return { process, tech };
}
