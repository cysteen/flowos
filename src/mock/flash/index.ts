/**
 * 教育刷机单底数（930 教育刷机单 D21）：支持刷机产品 · 自研机型表 · MDM 设备台账 · 工单库样本。
 * 学校库与教育客户档案共用，见 `mock/schools.ts`。
 */
export { FLASH_MODEL_SEED, FLASH_SELF_DEV_MODELS, isSelfDevModel, selfDevModelOf, type FlashModel, type FlashSelfDevModel } from './models';
export { MDM_DEVICES, findMdmDevice, mdmStudentOf, isMdmGraduate, type MdmDevice, type MdmOnlineState } from './mdmDevices';
export { FLASH_SEEDS, buildFlashSeeds, type FlashSeedBundle } from './seedTickets';
