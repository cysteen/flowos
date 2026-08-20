/** 产研产品关联 mock：工单产品 ↔ 单一产研服务（飞书/TPD/RDM/磐石 互斥） */

export type RdSystemCode = 'FEISHU' | 'TPD' | 'RDM' | 'PANSHI';

export type MappingStatus = 'VALID' | 'PENDING' | 'INVALID' | 'UNMAPPED';

export type MappingMethod = 'MANUAL' | 'API_SYNC' | 'AUTO_RULE' | 'IMPORT';

export interface RdSystemOption {
  code: RdSystemCode;
  label: string;
  color: string;
}

export const RD_SYSTEMS: RdSystemOption[] = [
  { code: 'FEISHU', label: '飞书项目', color: 'blue' },
  { code: 'TPD', label: 'TPD', color: 'purple' },
  { code: 'RDM', label: 'RDM', color: 'orange' },
  { code: 'PANSHI', label: '磐石', color: 'cyan' },
];

export function rdSystemLabel(code: RdSystemCode | undefined | null): string {
  if (!code) return '—';
  return RD_SYSTEMS.find((s) => s.code === code)?.label ?? code;
}

export interface ExternalProductOption {
  systemCode: RdSystemCode;
  externalProductId: string;
  externalProductName: string;
  externalBusinessId?: string;
  externalBusinessName?: string;
}

/** 外部产品快照（各系统 catalog，供下拉选择） */
export const EXTERNAL_PRODUCT_SNAPSHOT: ExternalProductOption[] = [
  // 飞书
  { systemCode: 'FEISHU', externalBusinessId: 'business-readwrite', externalBusinessName: '读写科技', externalProductId: '20336093', externalProductName: '读写笔记' },
  { systemCode: 'FEISHU', externalBusinessId: 'business-readwrite', externalBusinessName: '读写科技', externalProductId: '20336094', externalProductName: '录音笔H1' },
  { systemCode: 'FEISHU', externalBusinessId: 'business-readwrite', externalBusinessName: '读写科技', externalProductId: '20336095', externalProductName: '录音笔H2' },
  { systemCode: 'FEISHU', externalBusinessId: 'business-trans', externalBusinessName: '翻译机', externalProductId: '20336101', externalProductName: '三防翻译机' },
  { systemCode: 'FEISHU', externalBusinessId: 'business-trans', externalBusinessName: '翻译机', externalProductId: '20336102', externalProductName: '汉维翻译机' },
  // TPD
  { systemCode: 'TPD', externalProductId: 'TPD-REC-H1', externalProductName: '录音笔H1（TPD）' },
  { systemCode: 'TPD', externalProductId: 'TPD-TRANS-SF', externalProductName: '三防翻译机（TPD）' },
  { systemCode: 'TPD', externalProductId: 'TPD-QC-V1', externalProductName: '智能质检V1.0' },
  // RDM
  { systemCode: 'RDM', externalProductId: 'RDM-HW-001', externalProductName: '智能硬件·录音笔' },
  { systemCode: 'RDM', externalProductId: 'RDM-SW-002', externalProductName: '软件缺陷·翻译机' },
  // 磐石
  { systemCode: 'PANSHI', externalProductId: 'PS-REC-01', externalProductName: '录音笔系列' },
  { systemCode: 'PANSHI', externalProductId: 'PS-TRANS-01', externalProductName: '翻译机系列' },
];

export type PendingType = 'NEW_MATCH' | 'CONFLICT';

export interface ProductRdMappingRow {
  productKey: string;
  spuCode: string;
  productName: string;
  bgbu: string;
  bizline: string;
  prodline: string;
  targetSystem?: RdSystemCode;
  externalProductId?: string;
  externalProductName?: string;
  externalBusinessId?: string;
  externalBusinessName?: string;
  mappingStatus: MappingStatus;
  mappingMethod?: MappingMethod;
  matchConfidence?: number;
  /** 待确认原因（仅 PENDING） */
  pendingReason?: string;
  pendingType?: PendingType;
  /** 冲突待确认时，驳回可恢复的原映射 */
  previousExternalProductId?: string;
  previousExternalProductName?: string;
  previousTargetSystem?: RdSystemCode;
  invalidReason?: string;
  lastSyncedAt?: string;
}

/** 初始映射数据（一产品仅一条，互斥服务） */
export const PRODUCT_RD_MAPPINGS: ProductRdMappingRow[] = [
  {
    productKey: 'p-h1', spuCode: 'REC-H1', productName: '讯飞录音笔H1',
    bgbu: '消费者BG', bizline: '智能硬件业务线', prodline: '录音笔产品线',
    targetSystem: 'FEISHU',
    externalBusinessId: 'business-readwrite', externalBusinessName: '读写科技',
    externalProductId: '20336094', externalProductName: '录音笔H1',
    mappingStatus: 'VALID', mappingMethod: 'MANUAL', matchConfidence: 100,
    lastSyncedAt: '2026-08-17 09:30',
  },
  {
    productKey: 'p1', spuCode: 'TRANS-SF', productName: '三防翻译机',
    bgbu: '消费者BG', bizline: '智能硬件业务线', prodline: '翻译机产品线',
    targetSystem: 'FEISHU',
    externalBusinessId: 'business-trans', externalBusinessName: '翻译机',
    externalProductId: '20336101', externalProductName: '三防翻译机',
    mappingStatus: 'VALID', mappingMethod: 'API_SYNC', matchConfidence: 90,
    lastSyncedAt: '2026-08-17 09:30',
  },
  {
    productKey: 'p2', spuCode: 'TRANS-HW', productName: '汉维翻译机',
    bgbu: '消费者BG', bizline: '智能硬件业务线', prodline: '翻译机产品线',
    targetSystem: 'TPD',
    externalProductId: 'TPD-TRANS-SF', externalProductName: '三防翻译机（TPD）',
    mappingStatus: 'PENDING', mappingMethod: 'AUTO_RULE', matchConfidence: 75,
    pendingType: 'NEW_MATCH',
    pendingReason: '原未配置，同步 TPD 后自动匹配（名称相似 75%），需人工确认',
    lastSyncedAt: '2026-08-17 08:00',
  },
  {
    productKey: 'p-h2', spuCode: 'REC-H2', productName: '讯飞录音笔H2',
    bgbu: '消费者BG', bizline: '智能硬件业务线', prodline: '录音笔产品线',
    mappingStatus: 'UNMAPPED',
  },
  {
    productKey: 'p3', spuCode: 'QC-V1', productName: '讯飞智能质检系统V1.0',
    bgbu: '金融科技事业部', bizline: '智慧运营业务线', prodline: '智能客服产品线',
    targetSystem: 'RDM',
    externalProductId: 'RDM-SW-002', externalProductName: '软件缺陷·翻译机',
    mappingStatus: 'INVALID', mappingMethod: 'MANUAL', matchConfidence: 100,
    invalidReason: '外部产品已下架或不可用',
    lastSyncedAt: '2026-08-16 18:00',
  },
];

export function externalProductsForSystem(code: RdSystemCode, businessId?: string): ExternalProductOption[] {
  return EXTERNAL_PRODUCT_SNAPSHOT.filter((p) => {
    if (p.systemCode !== code) return false;
    if (businessId && p.externalBusinessId && p.externalBusinessId !== businessId) return false;
    return true;
  });
}

export function feishuBusinessOptions(): { id: string; name: string }[] {
  const map = new Map<string, string>();
  EXTERNAL_PRODUCT_SNAPSHOT.filter((p) => p.systemCode === 'FEISHU').forEach((p) => {
    if (p.externalBusinessId && p.externalBusinessName) {
      map.set(p.externalBusinessId, p.externalBusinessName);
    }
  });
  return [...map.entries()].map(([id, name]) => ({ id, name }));
}

export const PENDING_TYPE_LABEL: Record<PendingType, string> = {
  NEW_MATCH: '新匹配',
  CONFLICT: '映射不一致',
};

export const MAPPING_STATUS_META: Record<MappingStatus, { label: string; color: string }> = {
  VALID: { label: '已映射', color: 'success' },
  PENDING: { label: '待确认', color: 'warning' },
  INVALID: { label: '已失效', color: 'error' },
  UNMAPPED: { label: '未配置', color: 'default' },
};
