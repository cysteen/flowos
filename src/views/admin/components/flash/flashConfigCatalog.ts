import { FLASH_MODEL_SEED } from '@/mock/flash/models';
import { PRODUCT_CATEGORIES, PRODUCT_NAMES_BY_CATEGORY } from '@/views/tickets/types/mineQuery';
import type { FlashFailL1, FlashFailL2 } from '@/views/tickets/types/flash';
import type { RoleKey } from '@/config/roles';

/**
 * 后台「刷机配置」页用到的产品库口径与常量（930 教育刷机单 PRD §10）。
 *
 * - 产品库：沿用工单侧产品分类 → 产品名称目录；刷机机型（智慧课堂学生平板等）归「学习硬件」分类。
 * - 平台回传码：智能硬件平台回传的原因码（只读展示）。
 */

/** 可见 · 可维护的角色：工单运营 + 管理员（PRD §10 重点规则 1） */
export const FLASH_CONFIG_ROLES: RoleKey[] = ['ops-monitor', 'system-admin', 'ops-admin', 'tenant-admin'];

/** 刷机机型所在的产品分类 */
const FLASH_CATEGORY = '学习硬件';

/** 学习硬件分类下的智慧课堂学生平板（含尚未加入「支持刷机机型」的机型） */
const EDU_TABLETS: Array<{ model: string; brand: string; minRomVersion: string }> = [
  ...FLASH_MODEL_SEED.map((m) => ({ model: m.model, brand: m.brand, minRomVersion: m.minRomVersion })),
  { model: '讯飞智慧课堂学生平板 S30 Pro', brand: '科大讯飞', minRomVersion: 'EDU-S30P-1.0.0' },
  { model: '讯飞智慧课堂学生平板 X5', brand: '科大讯飞', minRomVersion: 'EDU-X5-1.0.0' },
  { model: '联想 TB-X606F 智慧课堂定制版', brand: '联想', minRomVersion: 'TB-X606F_S230615' },
  { model: '华为 MatePad 11 教育版', brand: '华为', minRomVersion: '4.2.0.100' },
];

const catalog = (() => {
  const byCat = new Map<string, Set<string>>();
  for (const cat of PRODUCT_CATEGORIES) byCat.set(cat, new Set(PRODUCT_NAMES_BY_CATEGORY[cat] ?? []));
  if (!byCat.has(FLASH_CATEGORY)) byCat.set(FLASH_CATEGORY, new Set());
  for (const t of EDU_TABLETS) byCat.get(FLASH_CATEGORY)!.add(t.model);
  const sortZh = (a: string, b: string) => a.localeCompare(b, 'zh-CN');
  const categories = [...byCat.keys()].sort(sortZh);
  const namesByCategory: Record<string, string[]> = {};
  for (const c of categories) namesByCategory[c] = [...byCat.get(c)!].sort(sortZh);
  return { categories, namesByCategory };
})();

/** 产品库 · 产品分类 */
export const FLASH_PRODUCT_CATEGORIES: string[] = catalog.categories;

/** 产品库 · 分类下的机型 */
export function productNamesOf(category?: string): string[] {
  return category ? catalog.namesByCategory[category] ?? [] : [];
}

/** 机型所属产品分类（刷机机型优先归「学习硬件」） */
export function productCategoryOf(model: string): string {
  if (catalog.namesByCategory[FLASH_CATEGORY]?.includes(model)) return FLASH_CATEGORY;
  const hit = catalog.categories.find((c) => catalog.namesByCategory[c].includes(model));
  return hit ?? FLASH_CATEGORY;
}

/** 新增机型时补齐品牌与达标 ROM 版本 */
export function productMetaOf(model: string): { brand: string; minRomVersion: string } {
  const t = EDU_TABLETS.find((x) => x.model === model);
  if (t) return { brand: t.brand, minRomVersion: t.minRomVersion };
  const brand = model.startsWith('联想') ? '联想' : model.startsWith('华为') ? '华为' : '科大讯飞';
  return { brand, minRomVersion: '' };
}

/** 智能硬件平台回传码（只有「接收失败」下的二级原因由平台回传） */
export const FLASH_FAIL_RETURN_CODES: Partial<Record<FlashFailL1, Partial<Record<FlashFailL2, string>>>> = {
  接收失败: { 未开机: 'E1001', 未联网: 'E1002', 版本不符: 'E1003', 其他: 'E1099' },
};

/** 系统判定项：状态不可停用 */
export const FLASH_FAIL_LOCKED_L1: FlashFailL1[] = ['建单校验不通过', '推送异常'];

/** 回传超时时长取值范围（小时） */
export const FLASH_TIMEOUT_MIN_H = 1;
export const FLASH_TIMEOUT_MAX_H = 48;
