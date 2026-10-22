import { defineStore } from 'pinia';
import { ref, watch } from 'vue';
import { REFUND_PRODUCT_NAME, REFUND_TAG_L1, REFUND_TAG_L2, REFUND_TAG_L3S } from '@/views/tickets/types/refund';

/**
 * 个册退费单 · 问题分类「是否个册退费」（1120 PRD 1.1；写法同 `stores/flashConfig.ts` 的「是否刷机」）。
 * 后台「问题分类」维护开关，建单识别读同一份：所选产品 + 问题分类「是否个册退费」＝是 → 个册退费单。
 *
 * 出厂值：个性化学习手册 ×「售后 → 退费申请 → 个册退费」；改动落 `flowos-refund-config`。
 */

const LS_KEY = 'flowos-refund-config';
/** 缓存数据形状版本：结构变更时 +1 */
const CONFIG_SHAPE_VERSION = 1;
const STALE_MS = 12 * 60 * 60 * 1000;

interface RefundConfigSnapshot {
  /** 问题分类「是否个册退费」开启的条目（键见 `refundTagKey`：产品名称 + 三级路径） */
  refundTags: string[];
}

/** 问题分类条目键：产品名称 + 一 / 二 / 三级（与后台「问题分类」一行对应） */
export function refundTagKey(productName: string, l1: string, l2: string, l3: string): string {
  return [productName, l1, l2, l3].map((s) => s.trim()).join('\u0001');
}

function factory(): RefundConfigSnapshot {
  return { refundTags: REFUND_TAG_L3S.map((l3) => refundTagKey(REFUND_PRODUCT_NAME, REFUND_TAG_L1, REFUND_TAG_L2, l3)) };
}

function readCache(): RefundConfigSnapshot | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as RefundConfigSnapshot & { v?: number; savedAt?: number };
    if (saved?.v === CONFIG_SHAPE_VERSION && typeof saved.savedAt === 'number'
      && Date.now() - saved.savedAt < STALE_MS && Array.isArray(saved.refundTags)) return saved;
    localStorage.removeItem(LS_KEY);
    return null;
  } catch {
    return null;
  }
}

export const useRefundConfigStore = defineStore('refundConfig', () => {
  const refundTags = ref<string[]>((readCache() ?? factory()).refundTags);

  watch(refundTags, (tags) => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({ refundTags: tags, v: CONFIG_SHAPE_VERSION, savedAt: Date.now() }));
    } catch {
      /* 配额超限等忽略 */
    }
  }, { deep: true });

  /** 问题分类条目「是否个册退费」是否开启 */
  function isRefundTag(productName: string, l1: string, l2: string, l3: string): boolean {
    if (!productName || !l1 || !l2 || !l3) return false;
    return refundTags.value.includes(refundTagKey(productName, l1, l2, l3));
  }

  /** 产品挂了个册退费类问题分类：本产品至少有一条「是否个册退费」开启的分类 */
  function hasRefundTag(productName: string): boolean {
    const key = productName.trim();
    if (!key) return false;
    const prefix = `${key}\u0001`;
    return refundTags.value.some((k) => k.startsWith(prefix));
  }

  /** 用后台「问题分类」当前开启的条目整体替换（问题分类页的行即真源） */
  function replaceRefundTags(keys: string[]): void {
    const next = [...new Set(keys)].sort();
    const cur = [...refundTags.value].sort();
    if (next.join('\u0002') !== cur.join('\u0002')) refundTags.value = next;
  }

  /** 个册退费单识别：所选产品 + 问题分类「是否个册退费」＝是 */
  function isRefundScene(productName: string, l1: string, l2: string, l3: string): boolean {
    return isRefundTag(productName, l1, l2, l3);
  }

  return { refundTags, isRefundTag, hasRefundTag, replaceRefundTags, isRefundScene };
});
