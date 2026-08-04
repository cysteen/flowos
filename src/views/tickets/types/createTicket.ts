import { PRIORITY_LABEL } from '@/views/tickets/types/ticket';
import type { Channel, Priority, TicketType } from '@/views/tickets/types/ticket';

/** 新建弹窗工单类型（对齐 .pen V6xQCz 等画板） */
export type CreateFormTicketType = '投诉' | '建议' | '商机' | '咨询';

export type BusinessType = '学习机' | '翻录' | '智学网';

/** 工单来源枚举（对齐 PRD 调研回访 / 渠道管理） */
export type TicketSource =
  | '热线电话' | 'IM在线' | '内投渠道' | '外投渠道' | '客户服务小程序'
  /** 售后侧转入客服的工单（多为售后转咨询）——**不支持升级投诉**（0801 定为门禁①判据） */
  | '售后转入';

export const TICKET_SOURCE_OPTIONS: TicketSource[] = [
  '热线电话',
  'IM在线',
  '内投渠道',
  '外投渠道',
  '客户服务小程序',
  '售后转入',
];

/** 售后转入判据：来源为该值即视为售后转入工单（PRD §4.3.3 门禁①） */
export const AFTERSALE_INBOUND_SOURCE: TicketSource = '售后转入';

export interface CustomerContactEntry {
  type: '手机' | '固话' | '邮箱';
  value: string;
}

export interface CustomerInfo {
  id: string;
  name: string;
  phone: string;
  vip: boolean;
  customerType: string;
  /** 客户类型多选（与 customerType 顿号拼接字段同步） */
  customerTypes?: string[];
  /** 联系方式列表（手机号为主键去重） */
  contacts?: CustomerContactEntry[];
  gender: string;
  region: string;
  address: string;
}

export function formatCustomerSubline(c: CustomerInfo): string {
  return [c.customerType, c.gender, c.region, c.address].filter(Boolean).join(' · ');
}

export interface ReporterInfo {
  name: string;
  phone: string;
  relation: string;
}

export interface CreateTicketFormState {
  businessType: BusinessType;
  ticketType: CreateFormTicketType;
  /** 工单来源，默认热线电话 */
  ticketSource: TicketSource;
  customerQuery: string;
  customer: CustomerInfo | null;
  showReporter: boolean;
  reporter: ReporterInfo;
  productCategory: string;
  productName: string;
  deviceSn: string;
  problemL1: string;
  problemL2: string;
  problemL3: string;
  priority: Priority;
  description: string;
  /** 用户期望解决时间备注（自由文本） */
  resolveTimeRemark: string;
  title: string;
  titleManual: boolean;
  expectTime: string;
  /** 投诉专属 */
  complaintType: string;
  /**
   * 投诉平台 + 投诉编号：**成对多组**——一个平台对应一个编号，多渠道投诉就加多组
   * （与升级投诉弹窗同一套结构，见 composables/complaintEscalation.ts ComplaintPlatformPick）。
   */
  complaintPlatforms: { platform: string; customPlatform?: string; complaintNo: string }[];
  businessLine: string;
  priorFeedback: string;
  serviceReview: string;
  complaintL1: string;
  complaintL2: string;
  /** 投诉接收时间（非必填，日期时间） */
  complaintReceiveTime: string;
  problemTime: string;
  /** 建议专属 */
  suggestL1: string;
  suggestL2: string;
}

export const BUSINESS_TYPES: BusinessType[] = ['学习机', '翻录', '智学网'];
export const CREATE_TICKET_TYPES: CreateFormTicketType[] = ['投诉', '建议', '商机', '咨询'];

export const PRODUCT_CATEGORIES = ['智能硬件', '学习硬件', '软件服务'];
export const PRODUCT_NAMES: Record<string, string[]> = {
  智能硬件: ['学习机 T20', '智能音箱 X1', '扫地机器人 R2'],
  学习硬件: ['学习机 T20', '学习机 X3 Pro'],
  软件服务: ['智学网会员', '讯飞听见'],
};

export const PROBLEM_TREE: Record<string, Record<string, string[]>> = {
  功能异常: { 播放问题: ['在线播放', '无法播放'], 触控问题: ['触摸失灵', '误触'] },
  设备故障: { 无法开机: ['黑屏', '无响应'], 网络: ['WiFi 连不上', '蓝牙断连'] },
  账号问题: { 登录: ['验证码失败', '密码错误'], 权益: ['会员失效', '订单未同步'] },
};

export const PRIORITY_OPTIONS: { value: Priority; label: string }[] =
  (['P0', 'P1', 'P2', 'P3'] as Priority[]).map((v) => ({
    value: v,
    label: `${v}（${PRIORITY_LABEL[v]}）`,
  }));

export const EXPECT_TIMES = ['今日 18:00', '今日 20:00', '明日 12:00', '3 个工作日内'];

/**
 * 「投诉类型」枚举。0803 恢复为**可选字段**——它只在
 * **工单类型=投诉 且 工单来源=内投渠道/外投渠道** 时出现（见 §3.2 字段门控）。
 * ⚠️ 取值清单沿用改版前的旧枚举，**待业务确认**是否需要换成对外口径的另一套。
 */
export const COMPLAINT_TYPE_OPTIONS = ['服务投诉', '产品质量', '物流问题', '其他'];
export const COMPLAINT_PLATFORM_OPTIONS = [
  '市场监管12345平台',
  '市场监管12315平台',
  '12315-消费者ODR平台',
  '地方监管局',
  '全国消协智慧315平台',
  '工信部互联网投诉平台',
  '舆情-公关监测',
  '安徽省消费者权益保护委员会',
  '黑猫消费者服务平台',
  '其他',
];

/** 外投投诉平台（工单来源属外投时选用；命中则处理页展示外投分支字段） */
export const EXTERNAL_COMPLAINT_PLATFORMS = COMPLAINT_PLATFORM_OPTIONS;

/** 内投渠道的投诉平台（业务方 0801 给定） */
export const INTERNAL_COMPLAINT_PLATFORMS = [
  '公司/分公司「前台」',
  '公司官网「监督举报」',
  '其他',
];

/** 选「其他」时需手动填写平台名称 */
export const CUSTOM_PLATFORM_OPTION = '其他';

/**
 * 按工单来源给出可选投诉平台：
 * 外投渠道 → 外部平台字典；内投渠道 → 内部渠道字典；其余来源无平台可选。
 */
export function complaintPlatformsBySource(source?: string): string[] {
  if (source === '外投渠道') return EXTERNAL_COMPLAINT_PLATFORMS;
  if (source === '内投渠道') return INTERNAL_COMPLAINT_PLATFORMS;
  return [];
}

export function isExternalComplaintPlatform(platform?: string): boolean {
  if (!platform) return false;
  return (EXTERNAL_COMPLAINT_PLATFORMS as readonly string[]).includes(platform);
}
export const BUSINESS_LINE_OPTIONS = ['学习机业务线', '翻录业务线', '智学网业务线'];
export const YES_NO_OPTIONS = ['是', '否'];
/** 投诉专属 · 前期反馈 */
export const PRIOR_FEEDBACK_OPTIONS = [
  '是-400',
  '是-线上店铺',
  '是-线下店铺',
  '是-业务渠道',
  '否',
] as const;
export const SERVICE_REVIEW_OPTIONS = ['需要回溯', '无需回溯'];
/**
 * 投诉性质：**由投诉二类推导，不单独选**（业务方 0730 口径）。
 * 「人员投诉 / 业务投诉」是投诉的性质分类，不是升阶层级——外投才是升阶（来源=外投渠道）。
 */
export type ComplaintNature = '业务投诉' | '服务投诉' | '人员投诉';

/** 投诉一类（业务方 0730 给定分类树） */
export const COMPLAINT_L1_OPTIONS = [
  '产品功能/性能投诉',
  '产品质量投诉',
  '服务质量投诉',
  '流程规则投诉',
];

/** 投诉一类 → 投诉二类 */
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
    '承诺未兑现',
    '对人员服务态度不满',
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
    '售后维修费用 / 运费不认可',
    '退换货政策不认可',
    '需要顾客自行联系 / 处理不认可',
    '宣传 / 介绍与实际不符',
  ],
};

/**
 * 投诉二类 → 投诉性质。
 * 除「服务质量投诉」下的 5 项分别落 服务/人员 外，其余一律业务投诉。
 */
export const COMPLAINT_NATURE_MAP: Record<string, ComplaintNature> = {
  承诺未兑现: '服务投诉',
  对人员服务态度不满: '人员投诉',
  服务不及时: '服务投诉',
  虚假结单: '服务投诉',
  一次服务不到位: '服务投诉',
};

/** 按投诉二类推导投诉性质；未命中特例即业务投诉，无二类时返回空 */
export function resolveComplaintNature(complaintL2?: string): ComplaintNature | '' {
  if (!complaintL2) return '';
  return COMPLAINT_NATURE_MAP[complaintL2] ?? '业务投诉';
}
export const SUGGEST_L1_OPTIONS = ['产品体验', '功能优化', '服务流程'];
export const SUGGEST_L2_MAP: Record<string, string[]> = {
  产品体验: ['功能建议', '交互优化'],
  功能优化: ['性能', '稳定性'],
  服务流程: ['响应时效', '回访机制'],
};

export const MOCK_CUSTOMER: CustomerInfo = {
  id: 'c-001',
  name: '张小凡',
  phone: '138 0013 8000',
  vip: true,
  customerType: '个人客户',
  customerTypes: ['个人客户'],
  contacts: [{ type: '手机', value: '138 0013 8000' }],
  gender: '男',
  region: '安徽省/合肥市/蜀山区',
  address: '望江西路666号',
};

/** 列表与新建表单工单类型一致 */
export function mapFormTypeToTicketType(t: CreateFormTicketType): TicketType {
  return t;
}

/** 预填渠道 → 工单来源 */
export function mapChannelToSource(channel?: Channel): TicketSource {
  if (!channel || channel === '电话') return '热线电话';
  if (channel === '在线客服') return 'IM在线';
  if (channel === '小程序' || channel === 'APP') return '客户服务小程序';
  if (channel === '邮件') return '外投渠道';
  return '热线电话';
}

export function buildAutoTitle(
  productName: string,
  problemL3: string,
  ticketSource: string,
): string {
  const parts = [productName, problemL3, ticketSource].filter(Boolean);
  return parts.join(' · ');
}

/** a-select 选项按 label 模糊筛选 */
export function filterSelectOption(
  input: string,
  option: { label?: string; value?: unknown },
): boolean {
  const text = String(option?.label ?? option?.value ?? '');
  return text.toLowerCase().includes(input.trim().toLowerCase());
}
