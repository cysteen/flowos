/**
 * 支持刷机机型（出厂值）—— 后台「刷机配置 · 支持刷机机型」的初始数据（930 教育刷机单 M28）。
 * 运行时以 `stores/flashConfig.ts` 为准（后台可增删、改开关）。
 *
 * - `selfDeveloped`：自研 · 支持线上自助推送。非自研机型建单后进一线刷机池（M1⑤ / M8′），不展示重推（M18）。
 * - `enabled`：是否仍在「支持刷机机型」内；停用的机型建单即拦截（M1① A1）。
 */
export interface FlashModel {
  id: string;
  /** 产品型号（建单下拉展示值，与工单「产品」同名） */
  model: string;
  /** 品牌 */
  brand: string;
  /** 自研 · 支持线上自助推送 */
  selfDeveloped: boolean;
  /** 是否支持刷机 */
  enabled: boolean;
  /** 达标 ROM 版本（低于此版本回传「版本不符」） */
  minRomVersion: string;
}

export const FLASH_MODEL_SEED: FlashModel[] = [
  { id: 'FM-S20', model: '讯飞智慧课堂学生平板 S20', brand: '科大讯飞', selfDeveloped: true, enabled: true, minRomVersion: 'EDU-S20-3.2.0' },
  { id: 'FM-S30', model: '讯飞智慧课堂学生平板 S30', brand: '科大讯飞', selfDeveloped: true, enabled: true, minRomVersion: 'EDU-S30-1.4.0' },
  { id: 'FM-X3P', model: '讯飞智慧课堂学生平板 X3 Pro', brand: '科大讯飞', selfDeveloped: true, enabled: true, minRomVersion: 'EDU-X3P-2.1.0' },
  { id: 'FM-J606F', model: '联想 TB-J606F 智慧课堂定制版', brand: '联想', selfDeveloped: false, enabled: true, minRomVersion: 'TB-J606F_S250118' },
  { id: 'FM-X6C6F', model: '联想 TB-X6C6F 智慧课堂定制版', brand: '联想', selfDeveloped: false, enabled: true, minRomVersion: 'TB-X6C6F_S240902' },
  { id: 'FM-MPSE', model: '华为 MatePad SE 教育版', brand: '华为', selfDeveloped: false, enabled: true, minRomVersion: '4.0.0.120' },
  // 已退出支持：建单即拦截（A1）
  { id: 'FM-S10', model: '讯飞智慧课堂学生平板 S10', brand: '科大讯飞', selfDeveloped: true, enabled: false, minRomVersion: 'EDU-S10-5.0.0' },
];
