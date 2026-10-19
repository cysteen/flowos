/**
 * 智慧课堂学生平板产品（出厂值）—— 刷机单识别只看问题分类「是否刷机」（10-19 C1），
 * 本表只记产品自身的刷机属性：产品分类、品牌、「自研 · 支持线上自助推送」（后台「产品管理」维护）、达标 ROM 版本。
 * 某产品是否出现刷机类问题分类，由后台「问题分类」里该产品挂的刷机类分类决定（`stores/flashConfig.ts` 的 `flashTags`）。
 * 运行时以 `stores/flashConfig.ts` 为准。
 *
 * - `selfDeveloped`：自研 · 支持线上自助推送。非自研机型建单后进一线刷机池（M1⑤ / M8′），不展示重推（M18）。
 */
export interface FlashModel {
  id: string;
  /** 产品名称（用户提报按型号选择，与工单「产品」同名） */
  model: string;
  /** 产品分类（产品字段两级：产品分类 + 产品名称，1013 A4；用户提报只报型号时据此带出） */
  category: string;
  /** 品牌 */
  brand: string;
  /** 自研 · 支持线上自助推送 */
  selfDeveloped: boolean;
  /** 达标 ROM 版本（低于此版本回传「版本不符」） */
  minRomVersion: string;
}

export const FLASH_MODEL_SEED: FlashModel[] = [
  { id: 'FM-S20', model: '讯飞智慧课堂学生平板 S20', category: '学习硬件', brand: '科大讯飞', selfDeveloped: true, minRomVersion: 'EDU-S20-3.2.0' },
  { id: 'FM-S30', model: '讯飞智慧课堂学生平板 S30', category: '学习硬件', brand: '科大讯飞', selfDeveloped: true, minRomVersion: 'EDU-S30-1.4.0' },
  { id: 'FM-X3P', model: '讯飞智慧课堂学生平板 X3 Pro', category: '学习硬件', brand: '科大讯飞', selfDeveloped: true, minRomVersion: 'EDU-X3P-2.1.0' },
  { id: 'FM-J606F', model: '联想 TB-J606F 智慧课堂定制版', category: '学习硬件', brand: '联想', selfDeveloped: false, minRomVersion: 'TB-J606F_S250118' },
  { id: 'FM-X6C6F', model: '联想 TB-X6C6F 智慧课堂定制版', category: '学习硬件', brand: '联想', selfDeveloped: false, minRomVersion: 'TB-X6C6F_S240902' },
  { id: 'FM-MPSE', model: '华为 MatePad SE 教育版', category: '学习硬件', brand: '华为', selfDeveloped: false, minRomVersion: '4.0.0.120' },
  // 刷机类问题分类「是否刷机」出厂为否（未挂刷机类分类）：建单不出现自助刷机 / 刷原生系统，用户提报即拦截
  { id: 'FM-S10', model: '讯飞智慧课堂学生平板 S10', category: '学习硬件', brand: '科大讯飞', selfDeveloped: true, minRomVersion: 'EDU-S10-5.0.0' },
];

/** 出厂时刷机类问题分类「是否刷机」为否的产品（演示「未挂刷机类分类」的产品） */
export const FLASH_TAG_OFF_MODELS: readonly string[] = ['讯飞智慧课堂学生平板 S10'];
