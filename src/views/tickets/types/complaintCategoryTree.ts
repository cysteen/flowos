/** 投诉分类两级树（PRD §3.2 · 业务方 0730 给定；展示文案不含编号前缀） */

export const COMPLAINT_L1_OPTIONS = [
  '产品功能/性能投诉',
  '产品质量投诉',
  '服务质量投诉',
  '流程规则投诉',
] as const;

export const COMPLAINT_L2_MAP: Record<string, string[]> = {
  '产品功能/性能投诉': [
    '产品操作过于复杂',
    '产品新版功能比老版本差',
    '产品性能未达到顾客预期',
    '对产品原装配置不满',
  ],
  产品质量投诉: [
    '安全事故',
    '产品质量故障',
    '开箱损（新品拆封有问题）',
    '老旧产品无售后政策不认可',
    '质量事故',
  ],
  服务质量投诉: [
    '对人员服务态度不满',
    '承诺未兑现',
    '服务不及时',
    '虚假结单',
    '一次服务不到位',
  ],
  流程规则投诉: [
    '对规定的联系方式不认可',
    '对规定的联系时效不认可',
    '对老旧产品现有售后政策不认可',
    '其他业务规则不认可',
    '售后网点覆盖率低',
    '售后维修方式不认可',
    '售后维修费用·运费不认可',
    '退换货政策不认可',
    '需要顾客自行联系·处理不认可',
    '宣传·介绍与实际不符',
  ],
};

/** v0.6 起树仅两级，保留空映射以兼容旧引用 */
export const COMPLAINT_L3_MAP: Record<string, string[]> = {};

export type ComplaintNature = '业务投诉' | '服务投诉' | '人员投诉';

/** 一类口径：服务质量投诉 = 服务投诉，其余 = 业务投诉（补充投诉信息时用） */
export type ComplaintKind = '服务投诉' | '业务投诉';

export const SERVICE_COMPLAINT_L1 = '服务质量投诉';

const PERSONNEL_CAT2 = '对人员服务态度不满';
const SERVICE_CAT2_SET = new Set([
  '承诺未兑现',
  '服务不及时',
  '虚假结单',
  '一次服务不到位',
]);

/** 由投诉二类推导投诉性质（PRD §3.2） */
export function inferComplaintNature(cat2: string): ComplaintNature {
  if (cat2 === PERSONNEL_CAT2) return '人员投诉';
  if (SERVICE_CAT2_SET.has(cat2)) return '服务投诉';
  return '业务投诉';
}

/** 多组分类时去重展示性质 */
export function inferComplaintNatures(categories: { cat2: string }[]): ComplaintNature[] {
  const set = new Set<ComplaintNature>();
  for (const c of categories) {
    if (c.cat2) set.add(inferComplaintNature(c.cat2));
  }
  return [...set];
}

/** 由投诉一类推导服务/业务口径（补充场景） */
export function inferComplaintKindFromL1(cat1: string): ComplaintKind {
  return cat1 === SERVICE_COMPLAINT_L1 ? '服务投诉' : '业务投诉';
}

/** 原单投诉类型（仅一种：全为服务或全为业务；混杂则返回 null） */
export function inferOriginalComplaintKind(categories: { cat1: string }[]): ComplaintKind | null {
  if (!categories.length) return null;
  const kind = inferComplaintKindFromL1(categories[0].cat1);
  if (categories.some((c) => c.cat1 && inferComplaintKindFromL1(c.cat1) !== kind)) return null;
  return kind;
}

/** 补充时追加的投诉类型 = 原单的另一类 */
export function getSupplementComplaintKind(original: ComplaintKind): ComplaintKind {
  return original === '服务投诉' ? '业务投诉' : '服务投诉';
}

/** 业务投诉可选的一类（不含服务质量投诉） */
export function getBusinessComplaintL1Options(): string[] {
  return COMPLAINT_L1_OPTIONS.filter((l1) => l1 !== SERVICE_COMPLAINT_L1);
}
