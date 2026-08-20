/** 产研产品关联 mock：工单产品 ↔ 单一产研服务（飞书/TPD/RDM/磐石 互斥） */

export type RdTargetSystem = 'FEISHU' | 'TPD' | 'RDM' | 'PANSHI';
export type MappingStatus = 'VALID' | 'PENDING' | 'INVALID' | 'UNMAPPED';
export type MappingMethod = 'MANUAL' | 'API_SYNC' | 'AUTO_RULE' | 'IMPORT';

export const RD_SYSTEM_LABEL: Record<RdTargetSystem, string> = {
  FEISHU: '飞书项目',
  TPD: 'TPD',
  RDM: 'RDM',
  PANSHI: '磐石',
};

export const RD_SYSTEM_COLOR: Record<RdTargetSystem, string> = {
  FEISHU: 'blue',
  TPD: 'purple',
  RDM: 'orange',
  PANSHI: 'cyan',
};

export const MAPPING_STATUS_LABEL: Record<MappingStatus, string> = {
  VALID: '已生效',
  PENDING: '待确认',
  INVALID: '已失效',
  UNMAPPED: '未配置',
};

export interface ExternalProductOption {
  id: string;
  name: string;
  businessId?: string;
  businessName?: string;
}

export interface ProductRdMappingRow {
  key: string;
  name: string;
  spuCode: string;
  bgbu: string;
  bizline: string;
  prodline: string;
  targetSystem?: RdTargetSystem;
  externalProductId?: string;
  externalProductName?: string;
  externalBusinessName?: string;
  mappingStatus: MappingStatus;
  mappingMethod?: MappingMethod;
  matchConfidence?: number;
  lastSyncedAt?: string;
}

/** 飞书外部产品快照（示例） */
export const FEISHU_PRODUCT_OPTIONS: ExternalProductOption[] = [
  { id: '20336093', name: '读写笔记', businessId: 'business-readwrite', businessName: '读写科技' },
  { id: '20336094', name: '录音笔H1', businessId: 'business-readwrite', businessName: '读写科技' },
  { id: '20336095', name: '三防翻译机', businessId: 'business-translator', businessName: '翻译机业务' },
  { id: '20336096', name: '汉维翻译机', businessId: 'business-translator', businessName: '翻译机业务' },
];

export const TPD_PRODUCT_OPTIONS: ExternalProductOption[] = [
  { id: 'TPD-10021', name: '讯飞录音笔H1-TPD', businessName: '智能硬件' },
  { id: 'TPD-10022', name: '翻译机系列-TPD', businessName: '智能硬件' },
];

export const RDM_PRODUCT_OPTIONS: ExternalProductOption[] = [
  { id: 'RDM-HW-881', name: '录音笔硬件缺陷池', businessName: '硬件缺陷' },
  { id: 'RDM-SW-442', name: '读写软件问题池', businessName: '软件缺陷' },
];

export const PANSHI_PRODUCT_OPTIONS: ExternalProductOption[] = [
  { id: 'PS-LEARN-01', name: '学习机-磐石', businessName: '教育硬件' },
];

export function externalOptionsFor(system: RdTargetSystem): ExternalProductOption[] {
  switch (system) {
    case 'FEISHU': return FEISHU_PRODUCT_OPTIONS;
    case 'TPD': return TPD_PRODUCT_OPTIONS;
    case 'RDM': return RDM_PRODUCT_OPTIONS;
    case 'PANSHI': return PANSHI_PRODUCT_OPTIONS;
    default: return [];
  }
}

export const PRODUCT_RD_MAPPING_ROWS: ProductRdMappingRow[] = [
  {
    key: 'p-h1', name: '讯飞录音笔H1', spuCode: 'REC-H1',
    bgbu: '消费者BG', bizline: '智能硬件业务线', prodline: '录音笔产品线',
    targetSystem: 'FEISHU', externalProductId: '20336094', externalProductName: '录音笔H1',
    externalBusinessName: '读写科技', mappingStatus: 'VALID', mappingMethod: 'MANUAL',
    matchConfidence: 100, lastSyncedAt: '2026-08-17 09:30',
  },
  {
    key: 'p1', name: '三防翻译机', spuCode: 'TRN-SF',
    bgbu: '消费者BG', bizline: '智能硬件业务线', prodline: '翻译机产品线',
    targetSystem: 'FEISHU', externalProductId: '20336095', externalProductName: '三防翻译机',
    externalBusinessName: '翻译机业务', mappingStatus: 'VALID', mappingMethod: 'API_SYNC',
    matchConfidence: 90, lastSyncedAt: '2026-08-17 09:30',
  },
  {
    key: 'p2', name: '汉维翻译机', spuCode: 'TRN-HW',
    bgbu: '消费者BG', bizline: '智能硬件业务线', prodline: '翻译机产品线',
    targetSystem: 'TPD', externalProductId: 'TPD-10022', externalProductName: '翻译机系列-TPD',
    externalBusinessName: '智能硬件', mappingStatus: 'VALID', mappingMethod: 'MANUAL',
    matchConfidence: 100, lastSyncedAt: '2026-08-16 18:00',
  },
  {
    key: 'p-h2', name: '讯飞录音笔H2', spuCode: 'REC-H2',
    bgbu: '消费者BG', bizline: '智能硬件业务线', prodline: '录音笔产品线',
    targetSystem: 'FEISHU', externalProductId: '20336094', externalProductName: '录音笔H1',
    externalBusinessName: '读写科技', mappingStatus: 'PENDING', mappingMethod: 'AUTO_RULE',
    matchConfidence: 75, lastSyncedAt: '2026-08-17 09:30',
  },
  {
    key: 'p3', name: '讯飞智能质检系统V1.0', spuCode: 'QC-V1',
    bgbu: '金融科技事业部', bizline: '智慧运营业务线', prodline: '智能客服产品线',
    targetSystem: 'RDM', externalProductId: 'RDM-SW-442', externalProductName: '读写软件问题池',
    externalBusinessName: '软件缺陷', mappingStatus: 'INVALID', mappingMethod: 'API_SYNC',
    matchConfidence: 90, lastSyncedAt: '2026-08-15 12:00',
  },
  {
    key: '1', name: '阿尔法蛋学习耳机B…', spuCode: 'AD-EAR-B',
    bgbu: '安徽淘云科…', bizline: '安徽淘云科…', prodline: '安徽淘云科…',
    mappingStatus: 'UNMAPPED',
  },
  {
    key: '2', name: '讯飞智能耳背式助…', spuCode: 'MED-HA-01',
    bgbu: '讯飞医疗科…', bizline: '智慧医院业…', prodline: '智能硬件产…',
    mappingStatus: 'UNMAPPED',
  },
];
