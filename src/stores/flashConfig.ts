import { defineStore } from 'pinia';
import { ref, watch } from 'vue';
import { FLASH_MODEL_SEED, FLASH_TAG_OFF_MODELS, type FlashModel } from '@/mock/flash/models';
import { FLASH_TAG_L1, FLASH_TAG_L2, FLASH_TAG_L3S } from '@/views/tickets/types/flash';
import { FLASH_LS_KEYS, readFlashCache, writeFlashCache } from './flashCache';

/**
 * 刷机相关配置（930 教育刷机单 M28；1013 N1 / N2 调整归属；M180 删后台「刷机配置」页）：
 * - 产品刷机属性（`models`：产品分类、品牌）；是否自研机型只看自研机型表（`mock/flash/models.ts`，PRD 附录 A.4，不设页面）；
 * - 问题分类「是否刷机」（`flashTags`）：后台「问题分类」维护（1013 N2）。
 * 刷机单识别只看问题分类「是否刷机」（`isFlashScene`，10-19 C1）；产品挂了「是否刷机」开启的问题分类，建单才出现刷机类分类。
 * 失败原因码表与回传超时时长为系统内置（`types/flash.ts`，PRD 附录 A.4），不在本 store。
 *
 * 出厂值取 `mock/flash/models.ts` 与 `types/flash.ts`；改动落 `FLASH_LS_KEYS.config`。
 */

export interface FlashConfigSnapshot {
  models: FlashModel[];
  /** 问题分类「是否刷机」开启的条目（键见 `flashTagKey`：产品名称 + 三级路径） */
  flashTags: string[];
}

/** 缓存里的数据形状版本（与 FLASH_CACHE_VERSION 分开计：本份结构独立演进）。v7：去掉失败原因与回传超时时长（M180） */
const CONFIG_SHAPE_VERSION = 7;

/** 问题分类条目键：产品名称 + 一 / 二 / 三级（问题分类按产品维护，与后台「问题分类」一行对应） */
export function flashTagKey(productName: string, l1: string, l2: string, l3: string): string {
  return [productName, l1, l2, l3].map((s) => s.trim()).join('\u0001');
}

/** 出厂：智慧课堂学生平板 ×「售后 → 服务申请 → 自助刷机 / 刷原生系统」默认开启「是否刷机」（1013 N2）；S10 出厂为否 */
function factoryFlashTags(): string[] {
  return FLASH_MODEL_SEED.filter((m) => !FLASH_TAG_OFF_MODELS.includes(m.model)).flatMap((m) => FLASH_TAG_L3S.map((l3) => flashTagKey(m.model, FLASH_TAG_L1, FLASH_TAG_L2, l3)));
}

function factory(): FlashConfigSnapshot {
  return {
    models: FLASH_MODEL_SEED.map((m) => ({ ...m })),
    flashTags: factoryFlashTags(),
  };
}

export const useFlashConfigStore = defineStore('flashConfig', () => {
  const init = readFlashCache<FlashConfigSnapshot>(FLASH_LS_KEYS.config, CONFIG_SHAPE_VERSION) ?? factory();
  const models = ref<FlashModel[]>(init.models);
  const flashTags = ref<string[]>(init.flashTags);

  watch(
    [models, flashTags],
    () => writeFlashCache(FLASH_LS_KEYS.config, {
      models: models.value,
      flashTags: flashTags.value,
    }, CONFIG_SHAPE_VERSION),
    { deep: true },
  );

  /* ---------------- 产品刷机属性 ---------------- */

  /** 按产品名称取；不在表内返回 undefined */
  function modelOf(model: string): FlashModel | undefined {
    const key = model.trim();
    return models.value.find((m) => m.model === key);
  }

  /**
   * 产品挂了刷机类问题分类（10-19 C1）：后台「问题分类」里本产品至少有一条「是否刷机」开启的分类。
   * 不再看产品字段；建单页刷机类分类的显隐、修改刷机信息弹窗的产品下拉都读这一个判据（用户提报不判产品，10-19）。
   */
  function isSupportedModel(model: string): boolean {
    const key = model.trim();
    if (!key) return false;
    const prefix = `${key}\u0001`;
    return flashTags.value.some((k) => k.startsWith(prefix));
  }

  /* ---------------- 问题分类「是否刷机」（1013 N2） ---------------- */

  /** 问题分类条目「是否刷机」是否开启 */
  function isFlashTag(productName: string, l1: string, l2: string, l3: string): boolean {
    if (!productName || !l1 || !l2 || !l3) return false;
    return flashTags.value.includes(flashTagKey(productName, l1, l2, l3));
  }

  /** 用后台「问题分类」当前开启的条目整体替换（问题分类页的行即真源） */
  function replaceFlashTags(keys: string[]): void {
    const next = [...new Set(keys)].sort();
    const cur = [...flashTags.value].sort();
    if (next.join('\u0002') !== cur.join('\u0002')) flashTags.value = next;
  }

  /** 刷机单识别（10-19 C1）：只看所选问题分类「是否刷机」（问题分类按产品维护，键里已含产品） */
  function isFlashScene(productName: string, l1: string, l2: string, l3: string): boolean {
    return isFlashTag(productName, l1, l2, l3);
  }

  /** 坐席建单 / 修改刷机信息可选的产品：挂了刷机类问题分类的产品 */
  function enabledModels(): FlashModel[] {
    return models.value.filter((m) => isSupportedModel(m.model));
  }

  function upsertModel(m: FlashModel): void {
    const i = models.value.findIndex((x) => x.id === m.id);
    if (i >= 0) models.value.splice(i, 1, { ...m });
    else models.value.push({ ...m });
  }

  function removeModel(id: string): void {
    models.value = models.value.filter((m) => m.id !== id);
  }

  /** 恢复出厂值 */
  function resetToFactory(): void {
    const f = factory();
    models.value = f.models;
    flashTags.value = f.flashTags;
  }

  return {
    models, flashTags,
    modelOf, isSupportedModel, enabledModels, upsertModel, removeModel,
    isFlashTag, replaceFlashTags, isFlashScene,
    resetToFactory,
  };
});
