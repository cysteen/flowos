import { defineStore } from 'pinia';
import { ref, watch } from 'vue';
import { FLASH_MODEL_SEED, type FlashModel } from '@/mock/flash/models';
import {
  FLASH_FAIL_L2_NOT_RETURNED, FLASH_FAIL_REASON_TREE, FLASH_FAIL_SEPARATOR, FLASH_PRODUCT_CATEGORY, FLASH_REASON_AUTO,
  FLASH_REASONS, FLASH_RETURN_TIMEOUT_DEFAULT_MIN, FLASH_TAG_L1, FLASH_TAG_L2, FLASH_TAG_L3S,
  type FlashFailL1, type FlashFailL2,
} from '@/views/tickets/types/flash';
import { FLASH_LS_KEYS, readFlashCache, writeFlashCache } from './flashCache';

/**
 * 刷机相关配置（930 教育刷机单 M28 / M65；1013 N1 / N2 调整归属）：
 * - 产品「是否支持刷机」（`models`）：后台「产品管理」维护（1013 N1，取代原刷机配置「支持刷机机型」）；
 * - 问题分类「是否刷机」（`flashTags`）：后台「问题分类」维护（1013 N2）；
 * - 刷机原因、失败原因、回传超时时长：后台「刷机配置」维护。
 * 刷机单识别＝产品是否支持刷机 ∧ 问题分类是否刷机（`isFlashScene`，1013 A2）。
 *
 * - 刷机原因：新增 / 改名 / 启停；「毕业」锁定（不可停用、不可改名）。新增的原因在建单分流时按特殊情况进二线池。
 * - 失败原因：两级结构与取值固定（刷机服务按取值判定），只能改**显示文案**与**启停**；
 *   二级原因停用后，对应回传显示「原因未返回」。
 *
 * 出厂值取 `mock/flash/models.ts` 与 `types/flash.ts`；改动落 `FLASH_LS_KEYS.config`。
 */

export interface FlashReasonOption {
  id: string;
  /** 刷机原因名称（落在工单上的取值） */
  name: string;
  enabled: boolean;
  /** 锁定：不可停用、不可改名（「毕业」） */
  locked: boolean;
}

export interface FlashFailL2Option {
  /** 取值（刷机服务判定用，不可改） */
  value: FlashFailL2;
  /** 显示文案 */
  label: string;
  enabled: boolean;
}

export interface FlashFailReasonOption {
  value: FlashFailL1;
  label: string;
  enabled: boolean;
  l2: FlashFailL2Option[];
}

export interface FlashConfigSnapshot {
  models: FlashModel[];
  /** 问题分类「是否刷机」开启的条目（键见 `flashTagKey`：产品名称 + 三级路径） */
  flashTags: string[];
  reasons: FlashReasonOption[];
  failReasons: FlashFailReasonOption[];
  /** 回传超时时长（分钟） */
  returnTimeoutMin: number;
}

/** 缓存里的数据形状版本（与 FLASH_CACHE_VERSION 分开计：本份结构独立演进） */
const CONFIG_SHAPE_VERSION = 3;

/** 问题分类条目键：产品名称 + 一 / 二 / 三级（问题分类按产品维护，与后台「问题分类」一行对应） */
export function flashTagKey(productName: string, l1: string, l2: string, l3: string): string {
  return [productName, l1, l2, l3].map((s) => s.trim()).join('\u0001');
}

/** 出厂：支持刷机的产品 ×「售后 → 服务申请 → 自助刷机 / 刷原生系统」默认开启「是否刷机」（1013 N2） */
function factoryFlashTags(): string[] {
  return FLASH_MODEL_SEED.flatMap((m) => FLASH_TAG_L3S.map((l3) => flashTagKey(m.model, FLASH_TAG_L1, FLASH_TAG_L2, l3)));
}

function factory(): FlashConfigSnapshot {
  return {
    models: FLASH_MODEL_SEED.map((m) => ({ ...m })),
    flashTags: factoryFlashTags(),
    reasons: FLASH_REASONS.map((name, i) => ({
      id: `FR-${i + 1}`,
      name,
      enabled: true,
      locked: name === FLASH_REASON_AUTO,
    })),
    failReasons: FLASH_FAIL_REASON_TREE.map((n) => ({
      value: n.l1,
      label: n.l1,
      enabled: true,
      l2: n.l2.map((v) => ({ value: v, label: v, enabled: true })),
    })),
    returnTimeoutMin: FLASH_RETURN_TIMEOUT_DEFAULT_MIN,
  };
}

export const useFlashConfigStore = defineStore('flashConfig', () => {
  const init = readFlashCache<FlashConfigSnapshot>(FLASH_LS_KEYS.config, CONFIG_SHAPE_VERSION) ?? factory();
  const models = ref<FlashModel[]>(init.models);
  const flashTags = ref<string[]>(init.flashTags);
  const reasons = ref<FlashReasonOption[]>(init.reasons);
  const failReasons = ref<FlashFailReasonOption[]>(init.failReasons);
  const returnTimeoutMin = ref<number>(init.returnTimeoutMin);

  watch(
    [models, flashTags, reasons, failReasons, returnTimeoutMin],
    () => writeFlashCache(FLASH_LS_KEYS.config, {
      models: models.value,
      flashTags: flashTags.value,
      reasons: reasons.value,
      failReasons: failReasons.value,
      returnTimeoutMin: returnTimeoutMin.value,
    }, CONFIG_SHAPE_VERSION),
    { deep: true },
  );

  /* ---------------- 产品「是否支持刷机」（1013 N1） ---------------- */

  /** 按产品名称取；不在表内返回 undefined */
  function modelOf(model: string): FlashModel | undefined {
    const key = model.trim();
    return models.value.find((m) => m.model === key);
  }

  /** 产品「是否支持刷机」开启（在表内且开启，M1① A1） */
  function isSupportedModel(model: string): boolean {
    return !!modelOf(model)?.enabled;
  }

  /**
   * 产品管理页切换「是否支持刷机」。表内没有的产品开启时补一条（按非自研处理：建单后进一线刷机池）。
   * `category` ＝ 该产品在产品管理中的产品分类。
   */
  function setProductFlashSupported(model: string, enabled: boolean, category?: string): void {
    const name = model.trim();
    if (!name) return;
    const hit = modelOf(name);
    if (hit) {
      hit.enabled = enabled;
      if (category && !hit.category) hit.category = category;
      return;
    }
    if (!enabled) return;
    const brand = name.startsWith('联想') ? '联想' : name.startsWith('华为') ? '华为' : '科大讯飞';
    models.value.push({
      id: `FM-${Date.now()}`, model: name, category: category || FLASH_PRODUCT_CATEGORY, brand,
      selfDeveloped: false, enabled: true, minRomVersion: '',
    });
  }

  /**
   * 产品管理页切换「自研 · 支持线上自助推送」（1013 B7）。表内没有的产品补一条（「是否支持刷机」保持关闭）。
   */
  function setProductSelfDeveloped(model: string, selfDeveloped: boolean, category?: string): void {
    const name = model.trim();
    if (!name) return;
    const hit = modelOf(name);
    if (hit) {
      hit.selfDeveloped = selfDeveloped;
      return;
    }
    const brand = name.startsWith('联想') ? '联想' : name.startsWith('华为') ? '华为' : '科大讯飞';
    models.value.push({
      id: `FM-${Date.now()}`, model: name, category: category || FLASH_PRODUCT_CATEGORY, brand,
      selfDeveloped, enabled: false, minRomVersion: '',
    });
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

  /** 刷机单识别（1013 A2）：产品「是否支持刷机」∧ 问题分类「是否刷机」 */
  function isFlashScene(productName: string, l1: string, l2: string, l3: string): boolean {
    return isSupportedModel(productName) && isFlashTag(productName, l1, l2, l3);
  }

  /** 是否自研 · 支持线上自助推送 */
  function isSelfDeveloped(model: string): boolean {
    return !!modelOf(model)?.selfDeveloped;
  }

  /** 建单下拉可选的机型（启用中） */
  function enabledModels(): FlashModel[] {
    return models.value.filter((m) => m.enabled);
  }

  function upsertModel(m: FlashModel): void {
    const i = models.value.findIndex((x) => x.id === m.id);
    if (i >= 0) models.value.splice(i, 1, { ...m });
    else models.value.push({ ...m });
  }

  function removeModel(id: string): void {
    models.value = models.value.filter((m) => m.id !== id);
  }

  /* ---------------- 刷机原因 ---------------- */

  /** 建单下拉可选的刷机原因（启用中） */
  function enabledReasons(): string[] {
    return reasons.value.filter((r) => r.enabled).map((r) => r.name);
  }

  /** 新增刷机原因；重名或空名返回 false */
  function addReason(name: string): boolean {
    const nm = name.trim();
    if (!nm || reasons.value.some((r) => r.name === nm)) return false;
    reasons.value.push({ id: `FR-${Date.now()}`, name: nm, enabled: true, locked: false });
    return true;
  }

  /** 改名；锁定项、重名、空名返回 false */
  function renameReason(id: string, name: string): boolean {
    const r = reasons.value.find((x) => x.id === id);
    const nm = name.trim();
    if (!r || r.locked || !nm || reasons.value.some((x) => x.id !== id && x.name === nm)) return false;
    r.name = nm;
    return true;
  }

  /** 启停；锁定项返回 false */
  function setReasonEnabled(id: string, enabled: boolean): boolean {
    const r = reasons.value.find((x) => x.id === id);
    if (!r || r.locked) return false;
    r.enabled = enabled;
    return true;
  }

  /* ---------------- 失败原因 ---------------- */

  function failL1Option(l1: FlashFailL1): FlashFailReasonOption | undefined {
    return failReasons.value.find((n) => n.value === l1);
  }

  function failL2Option(l1: FlashFailL1, l2: FlashFailL2): FlashFailL2Option | undefined {
    return failL1Option(l1)?.l2.find((x) => x.value === l2);
  }

  /** 改显示文案（一级传 l2 为空） */
  function setFailReasonLabel(l1: FlashFailL1, l2: FlashFailL2 | null, label: string): boolean {
    const txt = label.trim();
    if (!txt) return false;
    const target = l2 ? failL2Option(l1, l2) : failL1Option(l1);
    if (!target) return false;
    target.label = txt;
    return true;
  }

  /** 启停（一级传 l2 为空） */
  function setFailReasonEnabled(l1: FlashFailL1, l2: FlashFailL2 | null, enabled: boolean): boolean {
    const target = l2 ? failL2Option(l1, l2) : failL1Option(l1);
    if (!target) return false;
    target.enabled = enabled;
    return true;
  }

  /** 二级原因是否启用；停用的二级原因在回传时按「原因未返回」处理 */
  function isFailL2Enabled(l1: FlashFailL1, l2: FlashFailL2): boolean {
    return failL2Option(l1, l2)?.enabled ?? false;
  }

  /**
   * 失败原因显示文案（按后台配置的显示文案与启停）：`一级 · 细分`；
   * 细分缺失或已停用 → 接收失败显示「接收失败 · 原因未返回」，其余只显示一级。
   */
  function failReasonText(l1?: FlashFailL1 | null, l2?: FlashFailL2 | null): string {
    if (!l1) return '';
    const l1Label = failL1Option(l1)?.label ?? l1;
    const l2Opt = l2 ? failL2Option(l1, l2) : undefined;
    if (l2Opt?.enabled) return `${l1Label}${FLASH_FAIL_SEPARATOR}${l2Opt.label}`;
    if (l1 === '接收失败') return `${l1Label}${FLASH_FAIL_SEPARATOR}${FLASH_FAIL_L2_NOT_RETURNED}`;
    return l1Label;
  }

  /* ---------------- 回传超时时长 ---------------- */

  function setReturnTimeoutMin(min: number): void {
    if (Number.isFinite(min) && min > 0) returnTimeoutMin.value = Math.round(min);
  }

  /** 恢复出厂值 */
  function resetToFactory(): void {
    const f = factory();
    models.value = f.models;
    flashTags.value = f.flashTags;
    reasons.value = f.reasons;
    failReasons.value = f.failReasons;
    returnTimeoutMin.value = f.returnTimeoutMin;
  }

  return {
    models, flashTags, reasons, failReasons, returnTimeoutMin,
    modelOf, isSupportedModel, isSelfDeveloped, enabledModels, upsertModel, removeModel,
    setProductFlashSupported, setProductSelfDeveloped, isFlashTag, replaceFlashTags, isFlashScene,
    enabledReasons, addReason, renameReason, setReasonEnabled,
    setFailReasonLabel, setFailReasonEnabled, isFailL2Enabled, failReasonText,
    setReturnTimeoutMin, resetToFactory,
  };
});
