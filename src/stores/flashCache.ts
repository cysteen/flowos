/**
 * 教育刷机单 · 本地缓存（930 教育刷机单）。写法参照 `stores/riskShared.ts`：**保质期 + 版本闸**。
 *
 * - 保质期：超过 `FLASH_STALE_MS` 的缓存整份丢弃、回到种子（种子里的推送时刻按打开页面时刻倒推，
 *   隔夜续用会让「自动刷机中」「调研超时」这些与时刻相关的样本全部失真）。
 * - 版本闸：缓存里的 `v` 与 `FLASH_CACHE_VERSION` 不一致即丢弃。**改了种子或数据形状就升版本号**。
 *
 * 🔴 **键名全部登记在 `FLASH_LS_KEYS`**，走查清库时按它逐个删除（或调 `clearFlashCache()`），
 * 不要在别处另写 `flowos-flash-*` 字面量。
 */

/** 刷机相关 localStorage 键（统一前缀 `flowos-flash-`） */
export const FLASH_LS_KEYS = {
  /** 刷机相关配置：产品刷机属性 / 问题分类专属类型＝刷机 */
  config: 'flowos-flash-config',
  /** 刷机单工单快照（种子单的最新状态 + 运行时新建的刷机单） */
  tickets: 'flowos-flash-tickets',
  /** 刷机链路履历（按工单号归档） */
  timeline: 'flowos-flash-timeline',
} as const;

export type FlashLsKey = (typeof FLASH_LS_KEYS)[keyof typeof FLASH_LS_KEYS];

/**
 * 缓存版本。种子或数据形状变更时 +1。
 * v9：刷机字段组去掉 slaPausedUntil / offlineRegisteredAt / l1RepushCount，新增 linkedComplaintNos；
 * 一线不计 SLA 后种子单的 SLA 起算与摘要随之变化。
 * v10：种子单履历「建单」改记工单来源、重推成功与短信落款对齐 PRD 文案。
 * v11：刷机字段组新增 record（刷机处理记录）；一线升级二线的种子单带刷机处理结论与刷机处理记录（1014）。
 * v12：种子单刷机处理记录 / 刷机处理结论与履历里最新一次保存对齐（⑦ ⑫ ⑭ ⑰ ⑲）；⑭ 补「线下登记」条目。
 * v13：⑰ 补一线保存刷机处理记录的履历（升级二线之前），「最新处理」卡刷机处理记录块取得到处理人与时间。
 * v14：一线一轮（10-19 C2 / C3）：⑬ 回访未解决改回一线刷机池；新增 ⑳ 一线介入过的回访未解决进教育刷机处理组池。
 * v15：刷机字段组新增 aftersaleReturnDueAt（转售后后售后回传唤起原单的到点时刻，PRD §7.1 / §7.3）。
 * v16：⑮ 调研中改为按加载时刻倒推（不再加载即调研超时结案）；新增 ㉑ 回传无响应的稳定「自动刷机中」样本。
 * v17：⑰ SLA 摘要改用展示名「已转售后·停表」（D10），缓存里的旧快照作废。
 * v18：已转出停钟期间 SLA 摘要改为「已暂停」（PRD §4.3），⑰ 与运行时转售后同口径。
 * v19：种子履历短信文案加「【讯飞客服】」签名与工单号，旧短信作废。
 * v20：刷机信息新增学生类型（分流判据）与 MDM信息图片，刷机原因改自由文本，去掉 ROM版本 / MDM版本。
 * v21：刷机信息新增产品信息图片、学习证明附件（小程序接口字段）；用户提报种子单学校改为原文（无学校库 ID）、
 * 不带 MDM信息图片，⑨ 转校生带学习证明附件。
 * v22：建单不再校验 SN 与毕业生身份（PRD v1.27）：刷机字段组去掉 verifyResult、失败原因去掉「建单校验不通过」；
 * ③ ⑩ 改为首推接收失败进一线刷机池，⑨ 转校生改进一线刷机池；建单履历不再带校验结果。
 * v23：刷机单 SLA 不停表（PRD v1.28）：⑰ 已转出照常计时，缓存里的「已暂停」快照作废。
 * v24：SLA 起算时间改存到秒（界面时刻统一「年-月-日 时:分:秒」，PRD v1.28）。
 * v25：刷机处理结论改为 10-21 五项（已登记线下表格 / 已修改信息并重新推送 / 需升级二线 / 不符合刷机条件，已婉拒 / 用户放弃刷机），
 * 删线下登记保存追加文案；刷机字段组新增 surveyDueAt（延迟调研短信）。
 * v26：删转人工短信与重推结果通知（M181）：种子履历去掉转人工短信、刷机字段组去掉 handoffSmsSent；
 * 推送记录去掉回传超时时长快照（M180）。
 * v27：升级二线进池改走到组通知、删迟到回传提示（M182）；履历坐席不带角色，旧快照作废。
 * v28：种子时刻由分钟级改到秒级（列表与查询的建单 / 更新时间带秒），v27 快照里的分钟级时间作废。
 */
export const FLASH_CACHE_VERSION = 28;

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
