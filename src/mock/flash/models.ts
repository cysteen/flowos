/**
 * 智慧课堂学生平板产品（出厂值）—— 刷机单识别只看问题分类「专属类型＝刷机」（10-19 C1），
 * 本表只记产品自身的刷机属性：产品分类、品牌、达标 ROM 版本。
 * 某产品是否出现刷机类问题分类，由后台「问题分类」里该产品挂的刷机类分类决定（`stores/flashConfig.ts` 的 `flashTags`）。
 * 运行时以 `stores/flashConfig.ts` 为准。
 *
 * 是否自研机型不在本表：只看产品在不在自研机型表（`FLASH_SELF_DEV_MODELS`，PRD 附录 A.4，后台维护、不设页面）。
 * 不在表中的产品（联想 / 华为）为非自研机型，建单后进一线刷机池「非自研机型」，修改刷机信息弹窗底部为「保存」。
 */
export interface FlashModel {
  id: string;
  /** 产品名称（用户提报按型号选择，与工单「产品」同名） */
  model: string;
  /** 产品分类（产品字段两级：产品分类 + 产品名称，1013 A4；用户提报只报型号时据此带出） */
  category: string;
  /** 品牌 */
  brand: string;
  /** 达标 ROM 版本（低于此版本回传「版本不符」） */
  minRomVersion: string;
}

export const FLASH_MODEL_SEED: FlashModel[] = [
  { id: 'FM-S20', model: '讯飞智慧课堂学生平板 S20', category: '学习硬件', brand: '科大讯飞', minRomVersion: 'EDU-S20-3.2.0' },
  { id: 'FM-S30', model: '讯飞智慧课堂学生平板 S30', category: '学习硬件', brand: '科大讯飞', minRomVersion: 'EDU-S30-1.4.0' },
  { id: 'FM-X3P', model: '讯飞智慧课堂学生平板 X3 Pro', category: '学习硬件', brand: '科大讯飞', minRomVersion: 'EDU-X3P-2.1.0' },
  { id: 'FM-J606F', model: '联想 TB-J606F 智慧课堂定制版', category: '学习硬件', brand: '联想', minRomVersion: 'TB-J606F_S250118' },
  { id: 'FM-X6C6F', model: '联想 TB-X6C6F 智慧课堂定制版', category: '学习硬件', brand: '联想', minRomVersion: 'TB-X6C6F_S240902' },
  { id: 'FM-MPSE', model: '华为 MatePad SE 教育版', category: '学习硬件', brand: '华为', minRomVersion: '4.0.0.120' },
  // 刷机类问题分类出厂未设「专属类型＝刷机」（未挂刷机类分类）：坐席建单不出现自助刷机 / 刷原生系统
  { id: 'FM-S10', model: '讯飞智慧课堂学生平板 S10', category: '学习硬件', brand: '科大讯飞', minRomVersion: 'EDU-S10-5.0.0' },
];

/** 出厂时刷机类问题分类未设「专属类型＝刷机」的产品（演示「未挂刷机类分类」的产品） */
export const FLASH_TAG_OFF_MODELS: readonly string[] = ['讯飞智慧课堂学生平板 S10'];

/* ------------------------------------------------------------------ */
/* 自研机型表（PRD 附录 A.4）                                            */
/* ------------------------------------------------------------------ */

/** 自研机型表一行：工单系统产品名称 → 智能硬件平台产品名称 → OTA 型号（推送入参「设备型号」） */
export interface FlashSelfDevModel {
  /** 产品名称（工单系统） */
  name: string;
  /** 产品名称（智能硬件平台） */
  platformName: string;
  /** OTA 型号 */
  otaModel: string;
}

/** 自研机型表：在表中的产品为自研机型，可线上推送，按表取 OTA 型号推送（PRD 附录 A.4，8 行） */
export const FLASH_SELF_DEV_MODELS: readonly FlashSelfDevModel[] = [
  { name: '科大讯飞平板-学生机iclass C6', platformName: '畅言智慧课堂学生机C6', otaModel: 'iClass_C6' },
  { name: '科大讯飞平板-学生机iclass C6 Plus', platformName: '畅言智慧课堂学生机C6PLUS', otaModel: 'iClass_C6PLUS' },
  { name: '科大讯飞畅言智慧课堂（学生机）C6s', platformName: '畅言智慧课堂学生机C6s', otaModel: 'C6s' },
  { name: '科大讯飞畅言智慧课堂（学生机）C8', platformName: '畅言智慧课堂学生机C8', otaModel: 'iClass_C8' },
  { name: '科大讯飞畅言智慧课堂（学生机）C8 Air', platformName: '畅言智慧课堂学生机C8Air', otaModel: 'C8Air' },
  { name: '科大讯飞畅言智慧课堂（学生机）C8h Pro', platformName: '畅言智慧课堂学生机C8hPro', otaModel: 'C8hPro' },
  { name: '科大讯飞畅言智慧课堂（学生机）C8 Paper', platformName: '畅言智慧课堂学生机C8Paper', otaModel: 'CB-C8Paper-STU' },
  { name: '科大讯飞畅言智慧课堂（学生机）C8 Pro', platformName: '畅言智慧课堂学生机C8Pro', otaModel: 'C8Pro' },
];

/**
 * 原型产品库（共享产品树）里的讯飞学生平板与自研机型表的对应：产品树名称不改，在刷机侧按此映射到表中机型。
 * 联想 / 华为不在表中，为非自研机型。
 */
export const FLASH_SELF_DEV_ALIASES: Readonly<Record<string, string>> = {
  '讯飞智慧课堂学生平板 S20': '科大讯飞畅言智慧课堂（学生机）C8',
  '讯飞智慧课堂学生平板 S30': '科大讯飞畅言智慧课堂（学生机）C8 Pro',
  '讯飞智慧课堂学生平板 X3 Pro': '科大讯飞畅言智慧课堂（学生机）C8h Pro',
  '讯飞智慧课堂学生平板 S10': '科大讯飞畅言智慧课堂（学生机）C6s',
};

/** 按产品名称查自研机型表；不在表中返回 undefined */
export function selfDevModelOf(product: string): FlashSelfDevModel | undefined {
  const key = product.trim();
  if (!key) return undefined;
  const name = FLASH_SELF_DEV_ALIASES[key] ?? key;
  return FLASH_SELF_DEV_MODELS.find((m) => m.name === name);
}

/** 自研机型：产品在自研机型表中 */
export function isSelfDevModel(product: string): boolean {
  return !!selfDevModelOf(product);
}
