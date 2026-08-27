/** 投诉分类三级树（业务方 2026-08-26；展示文案不含 A/B/C 编号前缀） */

export const COMPLAINT_L1_OPTIONS = [
  '产品问题',
  '服务与运营问题',
  '客户体验与规则问题',
  '非我司责任',
  '其他特殊场景',
] as const;

export const COMPLAINT_L2_MAP: Record<string, string[]> = {
  产品问题: ['产品价格', '产品质量', '产品功能/性能'],
  服务与运营问题: ['销售与宣传', '服务质量', '内部支撑'],
  客户体验与规则问题: ['业务流程体验', '售后体验', '业务规则认知'],
  非我司责任: ['第三方问题', '客户原因', '无效会话'],
  其他特殊场景: ['风险场景', '未证实投诉', '无法归类的复杂场景'],
};

export const COMPLAINT_L3_MAP: Record<string, string[]> = {
  产品价格: ['对官方定价不认可', '对配件等附加费用不认可'],
  产品质量: [
    '质量事故（烧毁、烧焦等）',
    '产品质量故障（主板故障、电池故障、软件BUG、TP跳点等)',
    '开箱损（新品故障、瑕疵、缺件）',
    '资源错误',
    '内容合规（涉政、涉黄、涉游等）',
  ],
  '产品功能/性能': [
    '产品资源少/缺失/更新慢',
    '产品应用（自研+三方）/功能不支持、不兼容',
    '产品操作复杂',
    '产品性能未达到顾客预期',
    '对新/老版本功能差异不满',
    '对原装配置、外观颜值等主观不满',
  ],
  销售与宣传: [
    '宣传/介绍与实际不符',
    '销售政策不认可',
    '销售运营不规范（赠品未发、发错货、好评返现等）',
  ],
  服务质量: [
    '服务态度差（辱骂、推诿、抢话等）',
    '业务技能差（解答错误、指导不当）',
    '服务不及时（未按时联系、响应慢）',
    '承诺未兑现（坐席承诺未履行）',
    '一次解决不到位/虚假结单',
  ],
  内部支撑: [
    '内部系统问题（客服、售后系统故障）',
    '知识缺失/错误/不同步',
    '前后端协同规则不同步',
  ],
  业务流程体验: [
    '流程繁琐（退费、报修、解锁、绑定等）',
    '服务入口不便（找人工难、入口隐蔽）',
    '联系/响应时效规则不认可',
  ],
  售后体验: [
    '售后维修周期过长（>7天）',
    '检测结果争议（如人为损坏判定）',
    '对维修方式不认可',
    '对付费维修、运费不认可',
    '老旧产品无售后政策不认可',
  ],
  业务规则认知: [
    '对退换货、发票、充值卡有效期等规则不认可',
    '需客户提供必要信息（身份、凭证等）不认可',
    '需客户自行联系第三方（学校、运营商）不认可',
    '退费规则不认可',
  ],
  第三方问题: ['第三方APP、平台、学校导致的问题'],
  客户原因: [
    '理解偏差（对规则、功能理解有误）',
    '操作错误/信息提供错误/违规操作（刷机、拆机）',
    '主动放弃/取消（无时间配合、不接受方案）',
  ],
  无效会话: ['业务骚扰/测试/无实质内容'],
  风险场景: [
    '信息安全（数据泄露、过度采集等）',
    '人身伤害/侵权',
    '不良信息（涉黄，涉政等）',
    '群体性投诉/重大舆情风险',
  ],
  未证实投诉: [
    '已尽力排查，客户无举证，存疑归档',
    '客户拒绝配合核实',
    '多次未接电话',
  ],
  无法归类的复杂场景: ['其他新发、复杂问题'],
};

export type ComplaintNature = '业务投诉' | '服务投诉' | '人员投诉';

/** 一类口径：服务与运营问题下的「服务质量」= 服务投诉，其余 = 业务投诉（补充投诉信息时用） */
export type ComplaintKind = '服务投诉' | '业务投诉';

/** 补充场景：原单若一类为该项，视为服务类投诉 */
export const SERVICE_COMPLAINT_L1 = '服务与运营问题';

const PERSONNEL_CAT3 = '服务态度差（辱骂、推诿、抢话等）';

/** 需填写「被投诉角色」的投诉分类三（原 B2.1） */
export const COMPLAINT_CAT3_NEEDS_COMPLAINED_ROLE = PERSONNEL_CAT3;

export const COMPLAINED_ROLE_OPTIONS = [
  '一线坐席-客服部',
  '二线处理-客服部',
  '一线坐席-业务线',
  '二线处理-业务线',
  '客诉专员',
  '门店销售',
  '售后工程师',
  '服务支持',
] as const;

export function needsComplainedRole(cat3: string): boolean {
  return cat3 === COMPLAINT_CAT3_NEEDS_COMPLAINED_ROLE;
}

/** 投诉分类一/二/三（及条件字段）是否填完整 */
export function isComplaintCategoryComplete(f: {
  complaintCat1: string;
  complaintCat2: string;
  complaintCat3: string;
  complainedRole?: string[];
}): boolean {
  if (!f.complaintCat1 || !f.complaintCat2) return false;
  const l3 = COMPLAINT_L3_MAP[f.complaintCat2] ?? [];
  if (l3.length && !f.complaintCat3) return false;
  if (needsComplainedRole(f.complaintCat3) && !(f.complainedRole?.length)) return false;
  return true;
}

const SERVICE_CAT3_SET = new Set([
  PERSONNEL_CAT3,
  '业务技能差（解答错误、指导不当）',
  '服务不及时（未按时联系、响应慢）',
  '承诺未兑现（坐席承诺未履行）',
  '一次解决不到位/虚假结单',
]);

/** 由投诉三类推导投诉性质 */
export function inferComplaintNature(cat2: string, cat3?: string): ComplaintNature {
  if (cat3 === PERSONNEL_CAT3) return '人员投诉';
  if (cat3 && SERVICE_CAT3_SET.has(cat3)) return '服务投诉';
  if (cat2 === '服务质量') return '服务投诉';
  return '业务投诉';
}

/** 多组分类时去重展示性质 */
export function inferComplaintNatures(
  categories: { cat2: string; cat3?: string }[],
): ComplaintNature[] {
  const set = new Set<ComplaintNature>();
  for (const c of categories) {
    if (c.cat2) set.add(inferComplaintNature(c.cat2, c.cat3));
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

/** 业务投诉可选的一类（不含服务与运营问题） */
export function getBusinessComplaintL1Options(): string[] {
  return COMPLAINT_L1_OPTIONS.filter((l1) => l1 !== SERVICE_COMPLAINT_L1);
}
