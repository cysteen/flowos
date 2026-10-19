/**
 * 小智工单 · 本地缓存（1130 小智工单）。写法照 `stores/flashCache.ts`：**保质期 + 版本闸**。
 *
 * - 保质期：超过 `XIAOZHI_STALE_MS` 的缓存整份丢弃、回到种子。
 * - 版本闸：缓存里的 `v` 与 `XIAOZHI_CACHE_VERSION` 不一致即丢弃。**改了种子或数据形状就升版本号**。
 *
 * 🔴 **键名全部登记在 `XIAOZHI_LS_KEYS`**，走查清库时按它逐个删除（或调 `clearXiaozhiCache()`），
 * 不要在别处另写 `flowos-xiaozhi-*` 字面量。小智单自带一套键，不与刷机缓存共用。
 */

/** 小智相关 localStorage 键（统一前缀 `flowos-xiaozhi-`） */
export const XIAOZHI_LS_KEYS = {
  /** 小智单工单快照（种子单的最新状态 + 运行时新建的小智单） */
  tickets: 'flowos-xiaozhi-tickets',
  /** 小智链路履历（按工单号归档） */
  timeline: 'flowos-xiaozhi-timeline',
} as const;

export type XiaozhiLsKey = (typeof XIAOZHI_LS_KEYS)[keyof typeof XIAOZHI_LS_KEYS];

/**
 * 缓存版本。种子或数据形状变更时 +1。
 * - v1：小智单首版（问题类别 + 产研流转信息 + 驳回标记 + 产研反馈记录）。
 * - v2：一·补第二轮拍板。`problemCategory` 并回通用问题分类（B15）、`rdRejected` /
 *   `rdResubmitCount` 去掉（T1 驳回链路不实现），新增 `settledAt` / `confirmState` /
 *   `confirmAt` / `confirmBy` / `rdReturnCount`（B5 / B7 / B8）。**形状变了必须升版**：
 *   v1 的缓存里 `rdSync` 还可能是已删掉的 `'rejected'`，不丢弃就会渲染出一个不存在的状态档。
 * - v3：一·补 B24 新增工单层 `frontlineAccount`（提报人确认凭据，建单必填）。
 *   v2 的缓存里这一项是空的 —— 不丢弃的话，旧快照里的单看起来就像「违反了必填规则还建出来了」。
 * - v4：一·补第六 / 七轮（B26–B34）。**种子与形状同时变了，必须升版**：
 *   ① 终态由「已结案」改「已关闭」（B32）—— v3 的快照会把种子 ④ 按「已结案」盖回去；
 *   ② 新增 `createdBy` / `lastEditor`（B31 / B33 产研退回要交回创建人 / 最后编辑人），
 *      v3 的快照里两项都是空的，退回时找不到人可交；
 *   ③ 新建的未认领单 `tab` 由 `'mine'` 改 `'pool'`，旧快照里那批仍是 `'mine'`，
 *      照样在两个页签都看不见；
 *   ④ 履历里的调研短信那一条已删、换成完成通知（B28），旧履历快照还留着调研那句。
 * - v5：走查收口（B38 / B40 + 直通单进池 + 新增「已退回」种子）。**种子与形状又变了**：
 *   ① 直通产研的单 `tab` 由 `'mine'` 改 `'pool'`（PRD §2.3 留记录），旧快照里那批仍是 `'mine'`、
 *      照样两个页签都看不见；
 *   ② 新增种子 ⑨「已退回」，旧快照会把它按不存在处理；
 *   ③ 工单上新增 `hasPendingNotice`（B40 待跟进标记）与 `closeReason` 的真实值（B38），
 *      v4 的快照里两项都是空的。
 * - v6：种子 ④ 改为「停在办结待确认、装载时走 `receiveReporterConfirm` 真实路径关单」。
 *   v5 的快照里 ④ 是按旧种子写死的终态、`closeReason` 为空，不丢弃就还是那张
 *   「关闭原因为空的已关闭工单」；④ 的各时刻也由写死日期改成相对装载时刻取。
 */
export const XIAOZHI_CACHE_VERSION = 6;

/** 保质期：12 小时（与刷机 / 风险两条线同口径） */
export const XIAOZHI_STALE_MS = 12 * 60 * 60 * 1000;

export function readXiaozhiCache<T extends object>(
  key: XiaozhiLsKey,
  version = XIAOZHI_CACHE_VERSION,
): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const saved = JSON.parse(raw) as T & { v?: number; savedAt?: number };
    const fresh = saved?.v === version
      && typeof saved.savedAt === 'number'
      && Date.now() - saved.savedAt < XIAOZHI_STALE_MS;
    if (fresh) return saved;
    localStorage.removeItem(key);
    return null;
  } catch {
    return null;
  }
}

export function writeXiaozhiCache(
  key: XiaozhiLsKey,
  payload: object,
  version = XIAOZHI_CACHE_VERSION,
): void {
  try {
    localStorage.setItem(key, JSON.stringify({ ...payload, v: version, savedAt: Date.now() }));
  } catch {
    /* 配额超限等忽略 */
  }
}

/** 清掉全部小智缓存（下次打开页面回到种子） */
export function clearXiaozhiCache(): void {
  for (const key of Object.values(XIAOZHI_LS_KEYS)) {
    try { localStorage.removeItem(key); } catch { /* ignore */ }
  }
}
