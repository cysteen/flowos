/**
 * 查询中心 · 检索输入的规范化与落点判定。
 *
 * 真源：《【915】查询中心 · 查工单 PRD》§3.2「三类检索键与识别规则」、§3.6「查询异常与空态」。
 * **顶栏全局搜索与页内搜索条共用这一套** —— PRD §3.2 原话「顶栏与页内共用同一套」，
 * 两处各写一份判定必然漂（改版前就漂成了：顶栏把手机号送去查客户、页内又多一条候选人分支）。
 */
import { detectQueryKind, QUERY_KIND_LABEL, type QueryKind } from '@/mock/customerInsight';
import { TICKETS } from '@/mock/tickets';
import { useDerivedTicketStore } from '@/stores/derivedTickets';
import { isSearchableTicket, type Ticket } from '@/views/tickets/types/ticket';

/** E2 输入上限：超出即截断并提示（单次检索） */
export const MAX_QUERY_LEN = 64;

/** 批量工单号粘贴上限（字符 / 条数） */
export const MAX_BATCH_QUERY_LEN = 2000;
export const MAX_BATCH_TICKET_COUNT = 50;

/** 两处搜索框统一的 placeholder（PRD §4.2 · §5.2，C2） */
export const QUERY_PLACEHOLDER = '工单号 / 手机号 / 客户（多单号可用逗号或换行分隔）';

/** E1 空输入提示 */
export const EMPTY_QUERY_TIP = '请输入工单号、手机号或客户';

/** E2 截断提示 */
export const TRUNCATED_TIP = `关键词过长，已截取前 ${MAX_QUERY_LEN} 字`;

/**
 * 去掉空白与横线，便于「138 0013 8000」对上库里的 13800138000、
 * 「IFLYTS-20260610-00002」对上不带连字符的输入。
 */
export function compactSearchText(s: string): string {
  return s.replace(/[\s-]/g, '').toLowerCase();
}

/** 字面包含，或压缩分隔符后再包含 */
export function matchesSearchText(hay: string, needle: string): boolean {
  const n = needle.trim().toLowerCase();
  if (!n) return true;
  const h = hay.toLowerCase();
  if (h.includes(n)) return true;
  const nc = compactSearchText(n);
  return nc.length > 0 && compactSearchText(h).includes(nc);
}

export interface NormalizedQuery {
  /** 去空格 + 截断后的检索词 */
  text: string;
  /** 是否发生过截断（E2：需给一次提示） */
  truncated: boolean;
}

/**
 * 规范化输入（E1 / E2 / E3）。
 * E3「含检索保留字符（`% _ \ '`）按字面检索」—— 本函数**不做任何转义**即是按字面：
 * 下游一律走 `String.includes`，没有通配语义可言，所以不需要额外处理，也不该报错。
 */
const BATCH_SEP_RE = /[\s,，;；\n\r\t]+/;

/** 单个 token 是否像工单号（与 detectQueryKind 的 ticket 分支一致） */
export function isTicketToken(token: string): boolean {
  const q = token.trim();
  if (!q) return false;
  const compact = compactSearchText(q);
  return /^IFLY/i.test(q) || /^\d{4,}$/.test(compact);
}

/** 按逗号 / 换行 / 空格等拆成去重后的 token 列表（保序） */
export function splitBatchTokens(raw: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const part of raw.trim().split(BATCH_SEP_RE)) {
    const t = part.trim();
    if (!t) continue;
    const key = t.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

/**
 * 批量工单号检索：**至少 2 个 token，且每个都像工单号**。
 * 否则走原有单次检索（避免把「13800138000 13800138001」误判成批量）。
 */
export function parseBatchTicketQuery(raw: string): string[] | null {
  const tokens = splitBatchTokens(raw);
  if (tokens.length < 2) return null;
  if (!tokens.every(isTicketToken)) return null;
  return tokens;
}

export function matchTicketNoToken(t: Ticket, token: string): boolean {
  const key = token.trim().toUpperCase();
  const no = t.no.toUpperCase();
  return no === key || no.endsWith(key);
}

export interface BatchTicketHit {
  token: string;
  ticket: Ticket | null;
}

/** 在给定数据源上逐 token 匹配；列表行按输入顺序去重排列 */
export function resolveBatchTicketMatches(tokens: string[], source: Ticket[]): {
  hits: BatchTicketHit[];
  orderedTickets: Ticket[];
} {
  const hits: BatchTicketHit[] = tokens.map((token) => ({
    token,
    ticket: source.find((t) => matchTicketNoToken(t, token)) ?? null,
  }));
  const orderedTickets: Ticket[] = [];
  const seen = new Set<string>();
  for (const h of hits) {
    if (!h.ticket || seen.has(h.ticket.id)) continue;
    seen.add(h.ticket.id);
    orderedTickets.push(h.ticket);
  }
  return { hits, orderedTickets };
}

export function normalizeQuery(raw: string): NormalizedQuery {
  const trimmed = raw.trim();
  const batch = parseBatchTicketQuery(trimmed);
  const maxLen = batch ? MAX_BATCH_QUERY_LEN : MAX_QUERY_LEN;
  if (trimmed.length <= maxLen) return { text: trimmed, truncated: false };
  return { text: trimmed.slice(0, maxLen), truncated: true };
}

export type SearchTarget =
  /** 精确命中唯一一张客服单 → 直跳工单操作页 */
  | { to: 'ticket'; kind: QueryKind; ticketNo: string; title: string }
  /** 其余一律落查工单列表（C1：手机号 / SN / 客户名不再分流到查客户） */
  | { to: 'list'; kind: QueryKind; hint?: string };

/**
 * 按单号找可检索的客服工单。
 * `endsWith` 是为了支持"坐席只报单号尾段"（PRD §3.2 第 2 行：4 位及以上纯数字也判工单号）。
 */
function matchTicketsByNo(q: string) {
  const key = q.toUpperCase();
  return searchableSource().filter(
    (t) => isSearchableTicket(t) && (t.no.toUpperCase() === key || t.no.toUpperCase().endsWith(key)),
  );
}

/**
 * 检索源＝静态工单库 ＋ 本次会话里运行时派生出来的单（升级投诉派生的新投诉单）。
 * 派生单是真实存在、能打开的单，只因为不在静态数组里就查不到，是个纯窟窿。
 * store 尚未就绪（pinia 未激活）时退回静态那批，检索不至于抛错。
 */
function searchableSource(): Ticket[] {
  try {
    return [...TICKETS, ...useDerivedTicketStore().tickets];
  } catch {
    return TICKETS;
  }
}

/**
 * 判定这次检索该去哪（PRD §3.2 落点列 + §3.6 E5 / E6）。
 *
 * - **工单号且精确命中唯一一张** → 直跳详情；
 * - **工单号命中多张**（只报尾号时常见）→ 落列表，**不直跳**（E6）；
 * - **工单号未命中** → 降级为关键词检索并落列表（E5）；
 * - **手机号 / 设备 SN / 客户名 / 关键词** → 一律落列表（C1 · §8 规则 3）。
 */
export function resolveSearchTarget(q: string): SearchTarget {
  const batch = parseBatchTicketQuery(q);
  if (batch) {
    if (batch.length > MAX_BATCH_TICKET_COUNT) {
      return {
        to: 'list',
        kind: 'ticket',
        hint: `单次最多查询 ${MAX_BATCH_TICKET_COUNT} 个单号，请分批检索`,
      };
    }
    const { hits } = resolveBatchTicketMatches(
      batch,
      searchableSource().filter(isSearchableTicket),
    );
    const hitCount = hits.filter((h) => h.ticket).length;
    const miss = batch.length - hitCount;
    let hint = `批量查询 ${batch.length} 个单号，命中 ${hitCount} 张`;
    if (miss > 0) hint += `，${miss} 个未找到`;
    return { to: 'list', kind: 'ticket', hint };
  }

  const kind = detectQueryKind(q);
  if (kind !== 'ticket') return { to: 'list', kind };

  const hits = matchTicketsByNo(q);
  if (hits.length === 1) {
    return { to: 'ticket', kind, ticketNo: hits[0].no, title: hits[0].title };
  }
  if (hits.length > 1) {
    return { to: 'list', kind, hint: `匹配到 ${hits.length} 张工单，请从列表中选择` };
  }
  return { to: 'list', kind, hint: '未找到该单号，已按关键词检索' };
}

/** 输入框右侧的类型徽标文案（PRD §3.2：判定结果实时回显） */
export function queryKindLabel(raw: string): string {
  const q = raw.trim();
  if (!q) return '';
  if (parseBatchTicketQuery(q)) return '批量工单号';
  return QUERY_KIND_LABEL[detectQueryKind(q)];
}

/** E10 结果收敛阈值 */
export const TOO_MANY_RESULTS = 1000;
