/**
 * 查询中心 · 检索输入的规范化与落点判定。
 *
 * 真源：《【915】查询中心 · 查工单 PRD》§3.2「三类检索键与识别规则」、§3.6「查询异常与空态」。
 * **顶栏全局搜索与页内搜索条共用这一套** —— PRD §3.2 原话「顶栏与页内共用同一套」，
 * 两处各写一份判定必然漂（改版前就漂成了：顶栏把手机号送去查客户、页内又多一条候选人分支）。
 */
import { detectQueryKind, QUERY_KIND_LABEL, type QueryKind } from '@/mock/customerInsight';
import { TICKETS } from '@/mock/tickets';
import { isSearchableTicket } from '@/views/tickets/types/ticket';

/** E2 输入上限：超出即截断并提示 */
export const MAX_QUERY_LEN = 64;

/** 两处搜索框统一的 placeholder（PRD §4.2 · §5.2，C2） */
export const QUERY_PLACEHOLDER = '工单号 / 手机号 / 客户';

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
export function normalizeQuery(raw: string): NormalizedQuery {
  const trimmed = raw.trim();
  if (trimmed.length <= MAX_QUERY_LEN) return { text: trimmed, truncated: false };
  return { text: trimmed.slice(0, MAX_QUERY_LEN), truncated: true };
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
  return TICKETS.filter(
    (t) => isSearchableTicket(t) && (t.no.toUpperCase() === key || t.no.toUpperCase().endsWith(key)),
  );
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
  return q ? QUERY_KIND_LABEL[detectQueryKind(q)] : '';
}

/** E10 结果收敛阈值 */
export const TOO_MANY_RESULTS = 1000;
