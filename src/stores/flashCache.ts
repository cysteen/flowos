/**
 * 教育刷机单 · 本地缓存（930 教育刷机单）。写法参照 `stores/riskShared.ts`：**保质期 + 版本闸**。
 *
 * - 保质期：超过 `FLASH_STALE_MS` 的缓存整份丢弃、回到种子（种子里的推送时刻按打开页面时刻倒推，
 *   隔夜续用会让「自动刷机中」「线下登记暂停」这些与时刻相关的样本全部失真）。
 * - 版本闸：缓存里的 `v` 与 `FLASH_CACHE_VERSION` 不一致即丢弃。**改了种子或数据形状就升版本号**。
 *
 * 🔴 **键名全部登记在 `FLASH_LS_KEYS`**，走查清库时按它逐个删除（或调 `clearFlashCache()`），
 * 不要在别处另写 `flowos-flash-*` 字面量。
 */

/** 刷机相关 localStorage 键（统一前缀 `flowos-flash-`） */
export const FLASH_LS_KEYS = {
  /** 后台「刷机配置」：支持刷机机型 / 刷机原因 / 失败原因 / 回传超时时长 */
  config: 'flowos-flash-config',
  /** 刷机单工单快照（种子单的最新状态 + 运行时新建的刷机单） */
  tickets: 'flowos-flash-tickets',
  /** 刷机链路履历（按工单号归档） */
  timeline: 'flowos-flash-timeline',
} as const;

export type FlashLsKey = (typeof FLASH_LS_KEYS)[keyof typeof FLASH_LS_KEYS];

/** 缓存版本。种子或数据形状变更时 +1 */
export const FLASH_CACHE_VERSION = 2;

/** 保质期：12 小时（与风险两条线 `RISK_STALE_MS` 同口径） */
export const FLASH_STALE_MS = 12 * 60 * 60 * 1000;

export function readFlashCache<T extends object>(key: FlashLsKey, version = FLASH_CACHE_VERSION): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const saved = JSON.parse(raw) as T & { v?: number; savedAt?: number };
    const fresh = saved?.v === version
      && typeof saved.savedAt === 'number'
      && Date.now() - saved.savedAt < FLASH_STALE_MS;
    if (fresh) return saved;
    localStorage.removeItem(key);
    return null;
  } catch {
    return null;
  }
}

export function writeFlashCache(key: FlashLsKey, payload: object, version = FLASH_CACHE_VERSION): void {
  try {
    localStorage.setItem(key, JSON.stringify({ ...payload, v: version, savedAt: Date.now() }));
  } catch {
    /* 配额超限等忽略 */
  }
}

/** 清掉全部刷机缓存（下次打开页面回到种子） */
export function clearFlashCache(): void {
  for (const key of Object.values(FLASH_LS_KEYS)) {
    try { localStorage.removeItem(key); } catch { /* ignore */ }
  }
}
