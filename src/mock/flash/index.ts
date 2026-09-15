/**
 * 教育刷机单底数（930 教育刷机单 D21）：支持刷机机型 · MDM 设备台账 · 毕业名单 · 工单库样本。
 * 学校库与教育客户档案共用，见 `mock/schools.ts`。
 */
export { FLASH_MODEL_SEED, type FlashModel } from './models';
export { MDM_DEVICES, findMdmDevice, type MdmDevice, type MdmOnlineState } from './mdmDevices';
export { GRADUATE_ROSTER, isGraduate, type GraduateRecord } from './graduates';
export { FLASH_SEEDS, buildFlashSeeds, type FlashSeedBundle } from './seedTickets';
