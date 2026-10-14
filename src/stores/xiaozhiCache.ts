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
 * v1：小智单首版（问题类别 + 产研流转信息 + 驳回标记 + 产研反馈记录）。
 */
export const XIAOZHI_CACHE_VERSION = 1;

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
