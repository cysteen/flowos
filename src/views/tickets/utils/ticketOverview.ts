import type { LatestHandlingItem } from '@/views/tickets/types/operation';
import type { Ticket } from '@/views/tickets/types/ticket';
import type { TimelineEntry } from '@/views/tickets/types/ticketDetail';
import { FLASH_RESULT_ESCALATE_L2, FLASH_RESULT_ONLINE_SUCCESS, FLASH_TL } from '@/views/tickets/types/flash';

/** 最新处理 · 动作文案（速览带与列表 hover 共用） */
export const LATEST_HANDLING_ACTION = {
  PROCESS: '提交处理结果',
  TECH: '技术支持处理结果',
  REGISTER: '登记工单',
  /** 刷机单「最新处理」卡 · 刷机处理记录块 */
  FLASH_RECORD: '提交刷机处理记录',
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

/** 处理表单里算「处理结果」的字段 */
const PROCESS_RESULT_FIELDS = ['处理结果'];
/** 刷机单一线处理表单的两项（刷机处理记录 / 刷机处理结论），在「最新处理」卡单列一块 */
const FLASH_RECORD_FIELDS = ['刷机处理记录', '刷机处理结论'];
/** 技术支持 Tab 的处理结果，保存时以此字段名记入处理履历 */
export const TECH_RESULT_FIELD = '技术支持处理结果';

function resultTextOf(e: TimelineEntry, fields: string[]): string | undefined {
  const hit = [...(e.changes ?? [])].reverse().find((c) => fields.includes(c.field) && c.to && c.to !== '（已清空）');
  return hit?.to?.trim() || undefined;
}

/**
 * 「最新处理」卡条目时间统一为 YYYY-MM-DD HH:mm:ss：履历里「今天 HH:mm」补今天日期，只到分钟的补「:00」，其余原样。
 */
export function latestWhenText(when: string): string {
  const s = when.trim();
  const today = /^今天\s+(\d{2}:\d{2})(:\d{2})?$/.exec(s);
  if (today) {
    const d = new Date();
    const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return `${ymd} ${today[1]}${today[2] ?? ':00'}`;
  }
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(s)) return `${s}:00`;
  return s;
}

function blockAt(e: TimelineEntry): Omit<LatestResultBlock, 'text'> {
  return { who: e.who, role: e.role, when: latestWhenText(e.when) };
}

/** 刷机单一线的处理条目：带刷机两项的字段变更，或正文即刷机处理记录的「工单处理」条目（无字段变更） */
function isFlashRecordEntry(e: TimelineEntry): boolean {
  if (e.category !== 'handle') return false;
  if (e.changes?.length) return e.changes.some((c) => FLASH_RECORD_FIELDS.includes(c.field));
  return e.how === '工单处理' && e.role === '一线坐席';
}

/**
 * 「最新处理」卡：取处理履历里最近一次保存的处理结果与技术支持处理结果。
 * 只认「工单处理」类条目上的字段变更（处理人、时间随条目落库）；无字段变更的「工单处理」条目按正文计入。
 * 刷机单（`flash`）一线的刷机处理记录另成一块（见 `latestFlashRecordFrom`），不计入处理结果。
 * 领取、升级、流转等事件不在此列。
 */
export function latestResultsFromTimeline(entries: TimelineEntry[], flash = false): {
  process: LatestResultBlock | null;
  tech: LatestResultBlock | null;
} {
  let process: LatestResultBlock | null = null;
  let tech: LatestResultBlock | null = null;
  const processFields = flash ? PROCESS_RESULT_FIELDS : [...PROCESS_RESULT_FIELDS, '刷机处理记录'];
  for (let i = entries.length - 1; i >= 0 && (!process || !tech); i--) {
    const e = entries[i];
    if (e.category !== 'handle') continue;
    const at = blockAt(e);
    if (!tech) {
      const t = resultTextOf(e, [TECH_RESULT_FIELD]);
      if (t) tech = { ...at, text: t };
    }
    if (!process && !(flash && isFlashRecordEntry(e) && !resultTextOf(e, PROCESS_RESULT_FIELDS))) {
      const p = e.changes?.length
        ? resultTextOf(e, processFields)
        : (e.how === '工单处理' ? e.what?.trim() : undefined);
      if (p) process = { ...at, text: p };
    }
  }
  return { process, tech };
}

/** 「最新处理」卡 · 刷机处理记录块：正文与刷机处理结论取工单库现值，处理人、时间取最近一次落库的履历条目 */
export interface FlashRecordBlock extends LatestResultBlock {
  /** 刷机处理结论（标签） */
  result: string;
}

const L1_ROLE = '一线坐席';

/** 一线动作履历：一线坐席发起的处理或流转（升级二线、下送、线下登记、重新推送、撤回等），领取、建单不算（PRD §5.2 ②） */
function isL1ActionEntry(e: TimelineEntry): boolean {
  return e.role === L1_ROLE && (e.category === 'handle' || e.category === 'node')
    && e.action !== 'accept' && e.action !== 'create';
}

/** 刷机处理记录块正文（PRD §5.2）：首行「刷机处理结论：〈结论〉」，记录正文接在下面；只有结论时正文就是这一行 */
export function flashRecordBodyText(result: string, record: string): string {
  return [result ? `刷机处理结论：${result}` : '', record].filter(Boolean).join('\n');
}

/**
 * 刷机处理结论的写入时刻：「已线上刷机成功」取最近一次回传「接收成功」（迟到回传不改结论，不算）；
 * 「升级二线」取最近一次升级二线；其余结论随刷机处理记录一并保存，取最近一次带刷机处理结论的保存。
 */
function conclusionWrittenAt(entries: TimelineEntry[], result: string): string | undefined {
  const hit = (pred: (e: TimelineEntry) => boolean) => {
    for (let i = entries.length - 1; i >= 0; i--) if (pred(entries[i])) return latestWhenText(entries[i].when);
    return undefined;
  };
  if (!result) return undefined;
  if (result === FLASH_RESULT_ONLINE_SUCCESS) return hit((e) => e.action === 'flashSuccess' && e.what !== FLASH_TL.lateSuccess);
  if (result === FLASH_RESULT_ESCALATE_L2) return hit((e) => e.action === 'escalate' && e.role === L1_ROLE);
  return hit((e) => e.category === 'handle' && !!e.changes?.some((c) => c.field === '刷机处理结论'));
}

/**
 * 刷机处理记录块（刷机单）：刷机处理记录与刷机处理结论都为空时不出；抬头一定带操作人，按序兜底：
 * ① 最近一次保存刷机处理记录的一线坐席与保存时刻；
 * ② 没有 ① 时，最近一条一线动作履历（升级二线、下送、线下登记等）的操作人与时刻；
 * ③ 一线未参与、刷机处理结论由系统写入（回传「接收成功」写「已线上刷机成功」）时，「系统」与回传成功时刻；
 * ④ 都没有时，最近一次领取本单的一线坐席，再没有取本单当前处理人（不带时间）。
 * 浏览器里残留的旧缓存缺 ① 的保存履历时，同样由 ②–④ 兜住。
 */
export function latestFlashRecordFrom(
  entries: TimelineEntry[],
  state: { record?: string; result?: string } | undefined,
  assignee?: string | null,
): FlashRecordBlock | null {
  const record = state?.record?.trim() ?? '';
  const result = state?.result?.trim() ?? '';
  if (!record && !result) return null;
  const text = flashRecordBodyText(result, record);
  const latest = (pred: (e: TimelineEntry) => boolean) => {
    for (let i = entries.length - 1; i >= 0; i--) if (pred(entries[i])) return entries[i];
    return undefined;
  };
  const saved = latest(isFlashRecordEntry);
  if (saved) {
    // 抬头时间取「刷机处理记录保存时刻」与「刷机处理结论写入时刻」中较晚的一个（如重推接收成功由系统写结论）
    const block = { ...blockAt(saved), text, result };
    const written = conclusionWrittenAt(entries, result);
    if (written && written > block.when) block.when = written;
    return block;
  }
  const l1 = latest(isL1ActionEntry);
  if (l1) {
    const block = { ...blockAt(l1), text, result };
    const written = conclusionWrittenAt(entries, result);
    if (written && written > block.when) block.when = written;
    return block;
  }
  if (result === FLASH_RESULT_ONLINE_SUCCESS) {
    const sys = latest((e) => e.action === 'flashSuccess' && e.what !== FLASH_TL.lateSuccess);
    if (sys) return { ...blockAt(sys), who: '系统', role: '系统', text, result };
  }
  const claim = latest((e) => e.role === L1_ROLE && e.action === 'accept');
  if (claim) return { ...blockAt(claim), text, result };
  return { who: assignee?.trim() || L1_ROLE, role: L1_ROLE, when: '', text, result };
}

/** 「最新处理」整卡的取数结果：刷机处理记录块（刷机单）+ 处理结果 / 技术支持处理结果 */
export interface LatestHandlingSnapshot {
  flashRecord: FlashRecordBlock | null;
  items: LatestHandlingItem[];
}

/**
 * 「最新处理」唯一取数（处理页速览带与列表「最新」格 / 悬停摘要共用，D4）：按处理履历与刷机字段组现值算，
 * 不读保存时回写的摘要字符串。`flash` 传刷机字段组现值（刷机单）；老四类不传。
 */
export function latestHandlingFrom(
  entries: TimelineEntry[],
  flash?: { record?: string; result?: string; assignee?: string | null },
): LatestHandlingSnapshot {
  const { process, tech } = latestResultsFromTimeline(entries, !!flash);
  const items: LatestHandlingItem[] = [];
  if (process) items.push({ ...process, action: LATEST_HANDLING_ACTION.PROCESS, source: 'process' });
  if (tech) items.push({ ...tech, action: LATEST_HANDLING_ACTION.TECH, source: 'tech' });
  const flashRecord = flash ? latestFlashRecordFrom(entries, flash, flash.assignee) : null;
  return { flashRecord, items };
}

/** 列表「最新」：取数结果里时间最近的一条（刷机处理记录块与处理结果比时间，无时间的排最后） */
export function latestHandlingPreviewOf(s: LatestHandlingSnapshot): LatestHandlingItem | null {
  const all: LatestHandlingItem[] = [...s.items];
  if (s.flashRecord?.text) {
    const { who, role, when, text } = s.flashRecord;
    all.push({ who, role, when, text, action: LATEST_HANDLING_ACTION.FLASH_RECORD });
  }
  return all.reduce<LatestHandlingItem | null>((best, h) => (!best || h.when > best.when ? h : best), null);
}
