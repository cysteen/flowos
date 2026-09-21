import { PRIORITY_LABEL } from '@/views/tickets/types/ticket';
import type { Channel, ClosureMode, Priority, TicketType } from '@/views/tickets/types/ticket';
import type { RoleKey } from '@/config/roles';

/**
 * 新建弹窗工单类型（对齐 .pen V6xQCz 等画板）。
 * 五类（含刷机，见 930 教育刷机单 D1）：刷机是独立工单类型，常量与字段组见 `types/flash.ts`。
 */
export type CreateFormTicketType = '投诉' | '建议' | '商机' | '咨询' | '刷机';

export type BusinessType =
  | '无线音乐'
  | '智能硬件'
  | '教育'
  | '学习机'
  | '听见'
  | '合肥窗启'
  | '医疗'
  | '开放平台'
  | '政法'
  | '其他';

/** 工单来源枚举（建单下拉）。跨组调剂只会出现在系统写入的存量单上，不进建单选项。 */
export type TicketSource =
  | '电话'
  | 'IM'
  | '内投渠道'
  | '外投渠道'
  | '客户服务小程序'
  /** 售后侧转入客服的工单（多为售后转咨询）——**不支持升级投诉**（0801 定为门禁①判据） */
  | '售后系统'
  | '跨组调剂';

export const TICKET_SOURCE_OPTIONS: TicketSource[] = [
  '电话',
  'IM',
  '内投渠道',
  '外投渠道',
  '客户服务小程序',
  '售后系统',
];

/** 售后转入判据：来源为该值即视为售后转入工单（PRD §4.3.3 门禁①） */
export const AFTERSALE_INBOUND_SOURCE: TicketSource = '售后系统';

/**
 * 受角色限制的工单来源 —— 内投渠道 / 外投渠道。
 *
 * 出处：《【紧急需求】内投外投渠道可选范围与对客短信抑制-需求说明》§二 规则 A。
 * 两者同属外部投诉、**同层并列**（同文档 §四 修正口径），故按同一组收口，不分层级。
 */
export const RESTRICTED_TICKET_SOURCES: TicketSource[] = ['内投渠道', '外投渠道'];

/**
 * 能选内投 / 外投渠道的角色：**客诉专员 + 投诉督导**（同上 §二）。
 * 其余角色（含一线坐席）在建单 / 升级投诉 / 转单三处入口都不展示这两个选项。
 */
export const RESTRICTED_TICKET_SOURCE_ROLES: RoleKey[] = [
  'complaint-handler',
  'complaint-supervisor',
];

/** 某来源是否属于内投 / 外投（先归一化存量别名「内投」「外投」） */
export function isRestrictedTicketSource(source?: string): boolean {
  return (RESTRICTED_TICKET_SOURCES as string[]).includes(normalizeTicketSource(source));
}

/** 当前角色能否选内投 / 外投渠道 */
export function canPickRestrictedTicketSource(roleKey?: string): boolean {
  return RESTRICTED_TICKET_SOURCE_ROLES.includes(roleKey as RoleKey);
}

export interface TicketSourceOption {
  value: TicketSource;
  label: string;
  /** 存量值回显用：选项照常渲染，但不可被重新选中 */
  disabled?: boolean;
}

/**
 * 工单来源下拉选项 —— **建单 / 升级投诉 / 转单三处入口共用这一个判据**（规则 A，见上）。
 *
 * @param roleKey 当前登录角色（`stores/user.ts` 的 `roleKey`）
 * @param current 表单当前值：已经是内投 / 外投的存量单，非授权角色打开时照常回显该值
 *                （置灰、不可再选），不因过滤而显示为空。
 *
 * ⚠️ 只管**建单侧取值域**。筛选器里的工单来源是查询条件不是建单，仍用 `TICKET_SOURCE_OPTIONS` 全量。
 */
export function ticketSourceOptionsForRole(
  roleKey?: string,
  current?: string,
): TicketSourceOption[] {
  const allowRestricted = canPickRestrictedTicketSource(roleKey);
  const keep = normalizeTicketSource(current);
  const options: TicketSourceOption[] = [];
  for (const source of TICKET_SOURCE_OPTIONS) {
    if (allowRestricted || !isRestrictedTicketSource(source)) {
      options.push({ value: source, label: source });
    } else if (source === keep) {
      options.push({ value: source, label: source, disabled: true });
    }
  }
  return options;
}

export type CustomerContactType = '来电号码' | '联系电话' | '邮箱' | '微信';

export interface CustomerContactEntry {
  type: CustomerContactType;
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
  /** 教育分类 · 学校（§930 PRD §3.4） */
  school?: string;
  schoolTag?: string;
  serviceOwner?: string;
}

export function formatCustomerSubline(c: CustomerInfo, businessType?: string): string {
  const parts = [c.customerType, c.gender, c.region, c.address].filter(Boolean);
  if (businessType === '教育') {
    for (const item of [c.school, c.schoolTag, c.serviceOwner]) {
      if (item) parts.push(item);
    }
  }
  return parts.join(' · ');
}

/** 手机号脱敏：搜索下拉里只给中间四位打码，客户卡内仍展示完整号码 */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 7) return phone;
  return `${digits.slice(0, 3)}****${digits.slice(-4)}`;
}

/** 按客户标识取档案最新快照；取不到表示该客户在当前口径下不可用 */
export function findCustomerById(id: string): CustomerInfo | undefined {
  return CUSTOMER_DIRECTORY.find((c) => c.id === id);
}

/**
 * 保存客户 = **写回容联云档案**（930 补上的回写链路）。
 * 930 之前新建 / 修改只存本单快照、不回写，下次来电搜不到新客户、搜到的仍是旧资料；
 * 写回之后，再按联系方式搜索即可命中最新资料。
 */
export function upsertCustomer(c: CustomerInfo): void {
  const i = CUSTOMER_DIRECTORY.findIndex((x) => x.id === c.id);
  if (i >= 0) CUSTOMER_DIRECTORY.splice(i, 1, { ...c });
  else CUSTOMER_DIRECTORY.push({ ...c });
}

/** 省 / 市 / 区 存储格式；解析时兼容历史数据里不带空格的「省/市/区」 */
export const REGION_SEP = ' / ';
export function regionToArray(region?: string): string[] {
  if (!region?.trim()) return [];
  return region.split('/').map((s) => s.trim()).filter(Boolean);
}

export interface ReporterInfo {
  name: string;
  phone: string;
  relation: string;
}

export interface CreateTicketFormState {
  businessType: BusinessType;
  ticketType: CreateFormTicketType;
  /** 内部默认「正常流程」；建单弹窗不再让坐席选结案方式 */
  closureMode: ClosureMode;
  /** 工单来源，默认电话 */
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
  /** 刷机专属：「刷机信息」卡（930 教育刷机单 P1 / PRD §2.4） */
  flash: CreateTicketFlashForm;
}

/**
 * 新建工单 · 「刷机信息」卡表单（930 教育刷机单 PRD §2.2 / §2.4）。
 * 字段名、枚举与判定一律取 `types/flash.ts` 与 `stores/flash.ts`；联系手机号取客户信息区，不在本卡。
 */
export interface CreateTicketFlashForm {
  /** 产品型号（后台「支持刷机机型」启用项） */
  productModel: string;
  /** 设备SN */
  sn: string;
  /** 学生账号 */
  studentAccount: string;
  /** 学生姓名 */
  studentName: string;
  /** 学校库 ID（学校名称可搜索下拉，存 ID） */
  schoolId: string;
  /** 刷机原因（后台「刷机原因」启用项） */
  reason: string;
  /** ROM版本（选填） */
  romVersion: string;
  /** MDM版本（选填） */
  mdmVersion: string;
  /** 设备SN照片（文件名，最多 1 张，选填） */
  snPhotos: string[];
}

/** 「刷机信息」卡里参与必填提示的字段 */
export type CreateTicketFlashField = 'productModel' | 'sn' | 'studentAccount' | 'studentName' | 'schoolId' | 'reason';

export function defaultCreateTicketFlashForm(): CreateTicketFlashForm {
  return {
    productModel: '',
    sn: '',
    studentAccount: '',
    studentName: '',
    schoolId: '',
    reason: '',
    romVersion: '',
    mdmVersion: '',
    snPhotos: [],
  };
}

export const BUSINESS_TYPES: BusinessType[] = [
  '无线音乐',
  '智能硬件',
  '教育',
  '学习机',
  '听见',
  '合肥窗启',
  '医疗',
  '开放平台',
  '政法',
  '其他',
];
export const CREATE_TICKET_TYPES: CreateFormTicketType[] = ['投诉', '建议', '商机', '咨询', '刷机'];

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

/** 建单下拉按 P3 → P0 倒序：默认落在最低档，高优先级需坐席主动选 */
export const PRIORITY_OPTIONS: { value: Priority; label: string }[] =
  (['P3', 'P2', 'P1', 'P0'] as Priority[]).map((v) => ({
    value: v,
    label: `${v}（${PRIORITY_LABEL[v]}）`,
  }));

export const EXPECT_TIMES = ['今日 18:00', '今日 20:00', '明日 12:00', '3 个工作日内'];

/** 「投诉类型」：仅工单类型=投诉 且 来源=内投/外投渠道时出现。 */
export type ComplaintType =
  | '投诉'
  | '举报'
  | '信访件'
  | '督办件'
  | '监测线索'
  | '监管同步'
  | '其他';

export const COMPLAINT_TYPE_OPTIONS: ComplaintType[] = [
  '投诉',
  '举报',
  '信访件',
  '督办件',
  '监测线索',
  '监管同步',
  '其他',
];

/** 存量别名 → 现行枚举（旧「服务投诉/产品质量/物流问题」均归入「投诉」） */
export function normalizeComplaintType(raw?: string): string {
  if (!raw) return '';
  if (raw === '服务投诉' || raw === '产品质量' || raw === '产品投诉' || raw === '物流问题' || raw === '物流投诉') {
    return '投诉';
  }
  return raw;
}
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

export function isInternalComplaintPlatform(platform?: string): boolean {
  if (!platform) return false;
  return (INTERNAL_COMPLAINT_PLATFORMS as readonly string[]).includes(platform);
}

/** 归一化工单来源（存量别名 → 现行枚举） */
export function normalizeTicketSource(source?: string): string {
  if (!source) return '';
  if (source === '热线电话') return '电话';
  if (source === 'IM在线') return 'IM';
  if (source === '售后转入') return '售后系统';
  if (source === '外投') return '外投渠道';
  if (source === '内投') return '内投渠道';
  return source;
}

/**
 * 推断投诉渠道字典用来源（对齐处理页 OpProcessForm.showComplaintChannel）：
 * ① 来源已是内投/外投；② 已有平台台账可反推；③ 外投标记。
 */
export function inferComplaintChannelSource(
  ticketSource?: string,
  platforms?: { platform?: string }[],
  isExternalAppeal?: boolean,
): '' | '内投渠道' | '外投渠道' {
  const normalized = normalizeTicketSource(ticketSource);
  if (normalized === '内投渠道' || normalized === '外投渠道') return normalized;

  const plats = (platforms ?? []).map((p) => p.platform).filter(Boolean) as string[];
  if (plats.some((p) => isExternalComplaintPlatform(p))) return '外投渠道';
  if (plats.some((p) => isInternalComplaintPlatform(p))) return '内投渠道';
  if (isExternalAppeal) return '外投渠道';
  return '';
}

/** 是否应展示投诉平台补录区（与 OpProcessForm 投诉渠道 chip 同口径） */
export function shouldShowComplaintChannelSupplement(
  ticketSource?: string,
  platforms?: { platform?: string }[],
  isExternalAppeal?: boolean,
): boolean {
  if ((platforms ?? []).some((p) => p.platform)) return true;
  const src = normalizeTicketSource(ticketSource);
  if (src === '内投渠道' || src === '外投渠道') return true;
  return !!isExternalAppeal;
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

/** 投诉分类树（三级，见 complaintCategoryTree.ts） */
export {
  COMPLAINT_L1_OPTIONS,
  COMPLAINT_L2_MAP,
  COMPLAINT_L3_MAP,
  inferComplaintNature,
  inferComplaintNatures,
  inferComplaintKindFromL1,
  inferOriginalComplaintKind,
  getSupplementComplaintKind,
  getBusinessComplaintL1Options,
  SERVICE_COMPLAINT_L1,
  COMPLAINT_CAT3_NEEDS_COMPLAINED_ROLE,
  COMPLAINED_ROLE_OPTIONS,
  needsComplainedRole,
  isComplaintCategoryComplete,
} from './complaintCategoryTree';
export type { ComplaintNature, ComplaintKind } from './complaintCategoryTree';

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
  customerType: '个人用户',
  customerTypes: ['个人用户'],
  contacts: [{ type: '来电号码', value: '138 0013 8000' }],
  gender: '男',
  region: '安徽省 / 合肥市 / 蜀山区',
  address: '望江西路666号',
};

/**
 * 客户档案库 —— 建单客户搜索的检索源。
 * 客户主数据由容联云维护，本表是工单侧检索/回填所依赖的字段口径样本：
 * 手机号唯一、教育分类客户带学校三项、部分客户资料不全（用于「信息不完整」提示）。
 */
export const CUSTOMER_DIRECTORY: CustomerInfo[] = [
  MOCK_CUSTOMER,
  {
    id: 'c-002',
    name: '赵敏',
    phone: '139 2244 7788',
    vip: true,
    customerType: '老师',
    customerTypes: ['老师'],
    contacts: [
      { type: '来电号码', value: '139 2244 7788' },
      { type: '邮箱', value: 'zhaomin@hf1z.edu.cn' },
    ],
    gender: '女',
    region: '安徽省 / 合肥市 / 庐阳区',
    address: '寿春路38号',
    school: '合肥市第一中学',
    schoolTag: '重点校',
    serviceOwner: '王明',
  },
  {
    id: 'c-003',
    name: '吴芳',
    phone: '137 8899 1200',
    vip: false,
    customerType: '家长',
    customerTypes: ['家长'],
    contacts: [{ type: '来电号码', value: '137 8899 1200' }],
    gender: '女',
    region: '安徽省 / 合肥市 / 包河区',
    address: '马鞍山路100号',
    school: '合肥八中',
    schoolTag: '示范校',
    serviceOwner: '李华',
  },
  {
    id: 'c-004',
    name: '李大海',
    phone: '135 6677 8899',
    vip: false,
    customerType: '个人用户',
    customerTypes: ['个人用户'],
    contacts: [{ type: '来电号码', value: '135 6677 8899' }],
    gender: '男',
    region: '',
    address: '',
  },
  {
    id: 'c-005',
    name: '施磊',
    phone: '186 0551 3366',
    vip: false,
    customerType: '学生',
    customerTypes: ['学生'],
    contacts: [{ type: '来电号码', value: '186 0551 3366' }],
    gender: '男',
    region: '安徽省 / 芜湖市 / 镜湖区',
    address: '北京中路12号',
  },
  {
    id: 'c-006',
    name: '孙倩',
    phone: '158 2200 4455',
    vip: false,
    customerType: '个人用户',
    customerTypes: ['个人用户'],
    contacts: [{ type: '来电号码', value: '158 2200 4455' }],
    gender: '女',
    region: '江苏省 / 南京市 / 鼓楼区',
    address: '中山北路200号',
  },
  {
    id: 'c-007',
    name: '张小雨',
    phone: '138 0013 8111',
    vip: false,
    customerType: '经销商',
    customerTypes: ['经销商'],
    contacts: [{ type: '来电号码', value: '138 0013 8111' }],
    gender: '女',
    region: '浙江省 / 杭州市 / 西湖区',
    address: '文三路90号',
  },
  {
    id: 'c-008',
    name: '田薇',
    phone: '133 4455 6677',
    vip: false,
    customerType: '个人用户',
    customerTypes: ['个人用户'],
    contacts: [{ type: '来电号码', value: '133 4455 6677' }],
    gender: '女',
    region: '广东省 / 深圳市 / 南山区',
    address: '科技园南路8号',
  },
  {
    id: 'c-009',
    name: '吴强',
    phone: '136 1122 3344',
    vip: false,
    customerType: '个人用户',
    customerTypes: ['个人用户'],
    contacts: [{ type: '来电号码', value: '136 1122 3344' }],
    gender: '男',
    region: '北京市 / 北京市 / 朝阳区',
    address: '建国路88号',
  },
  {
    id: 'c-010',
    name: '郑霞',
    phone: '132 7788 9900',
    vip: false,
    customerType: '家长',
    customerTypes: ['家长'],
    contacts: [{ type: '来电号码', value: '132 7788 9900' }],
    gender: '女',
    region: '上海市 / 上海市 / 徐汇区',
    address: '漕溪北路40号',
  },
  {
    id: 'c-011',
    name: '何敏',
    phone: '134 5566 7788',
    vip: false,
    customerType: '个人用户',
    customerTypes: ['个人用户'],
    contacts: [{ type: '来电号码', value: '134 5566 7788' }],
    gender: '女',
    region: '浙江省 / 宁波市 / 鄞州区',
    address: '天童南路500号',
  },
  {
    id: 'c-012',
    name: '孙莉',
    phone: '130 2233 4455',
    vip: false,
    customerType: '经销商',
    customerTypes: ['经销商'],
    contacts: [{ type: '来电号码', value: '130 2233 4455' }],
    gender: '女',
    region: '江苏省 / 苏州市 / 工业园区',
    address: '星湖街328号',
  },
  {
    id: 'c-013',
    name: '周杰',
    phone: '131 9900 1122',
    vip: false,
    customerType: '个人用户',
    customerTypes: ['个人用户'],
    contacts: [{ type: '来电号码', value: '131 9900 1122' }],
    gender: '男',
    region: '广东省 / 广州市 / 天河区',
    address: '珠江新城华夏路10号',
  },
];

/** 搜索下拉一次最多展示的条数；超出即提示补充关键词 */
export const CUSTOMER_SEARCH_LIMIT = 10;

/**
 * 建单客户检索 —— **只按联系方式检索，不支持按客户姓名检索**。
 *
 * 理由：姓名重名率高、同名多人无法区分，检索出来坐席还得逐条核号码；
 * 而建单场景坐席手里一定有联系方式（来电号码、客户报的手机/邮箱/微信）。
 * 姓名只作为下拉条目的**展示**信息，不作为检索入口。
 *
 * 检索范围覆盖客户档案中的**全部联系方式**（来电号码 / 联系电话 / 邮箱 / 微信），
 * 不限于主手机号：数字类精确匹配优先、≥4 位支持后四位模糊；非数字按包含匹配。
 */
export function searchCustomers(query: string): CustomerInfo[] {
  const q = query.trim();
  if (q.length < 2) return [];
  const digits = q.replace(/\D/g, '');
  const isNumeric = /^[\d\s-]+$/.test(q);
  const lower = q.toLowerCase();
  const hit = new Map<string, CustomerInfo>();

  for (const c of CUSTOMER_DIRECTORY) {
    const values = c.contacts?.length
      ? c.contacts.map((x) => x.value)
      : [c.phone];
    const matched = values.some((raw) => {
      if (isNumeric) {
        const cd = raw.replace(/\D/g, '');
        if (!cd) return false;
        if (cd === digits) return true;
        if (digits.length >= 4 && cd.endsWith(digits)) return true;
        return cd.includes(digits);
      }
      return raw.toLowerCase().includes(lower);
    });
    if (matched) hit.set(c.id, c);
  }
  return [...hit.values()];
}

/** 手机号租户内唯一：返回占用该号码的其他客户（用于新建/编辑时的冲突阻断） */
export function findPhoneOwner(phone: string, selfId?: string): CustomerInfo | undefined {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 7) return undefined;
  return CUSTOMER_DIRECTORY.find(
    (c) => c.id !== selfId && c.phone.replace(/\D/g, '') === digits,
  );
}

/** 列表与新建表单工单类型一致 */
export function mapFormTypeToTicketType(t: CreateFormTicketType): TicketType {
  return t;
}

/** 预填渠道 → 工单来源 */
export function mapChannelToSource(channel?: Channel): TicketSource {
  if (!channel || channel === '电话') return '电话';
  if (channel === '在线客服') return 'IM';
  if (channel === '小程序' || channel === 'APP') return '客户服务小程序';
  if (channel === '邮件') return '外投渠道';
  return '电话';
}

/** 列表/单元格解析工单来源（优先 ticketSource，缺省由接入渠道反推） */
export function resolveTicketSourceForList(t: {
  ticketSource?: string;
  channel?: string;
}): string {
  const normalized = normalizeTicketSource(t.ticketSource);
  if (normalized) return normalized;
  if (t.channel) return mapChannelToSource(t.channel as Channel);
  return '';
}

/** 工单来源枚举 → 列表/详情统一展示文案 */
export function ticketSourceDisplayLabel(source?: string): string {
  const src = normalizeTicketSource(source);
  if (src === '外投渠道') return '外部反馈渠道';
  if (src === '内投渠道') return '内部反馈渠道';
  return src || '—';
}

/**
 * 列表「工单/标题」第二行来源文案（反馈渠道口径，非接入 channel）。
 * - 外投渠道 → 外部反馈渠道
 * - 内投渠道 → 内部反馈渠道
 * - 其余常规来源（热线/IM/小程序等）→ 展示来源枚举本身（内投类）
 */
export function ticketListSourceLabel(t: {
  ticketSource?: string;
  channel?: string;
}): string {
  return ticketSourceDisplayLabel(resolveTicketSourceForList(t));
}

export function buildAutoTitle(
  productName: string,
  problemL3: string,
  ticketSource: string,
): string {
  const parts = [productName, problemL3, ticketSource].filter(Boolean);
  return parts.join(' · ');
}

/**
 * a-select 选项按 label 模糊筛选。
 *
 * `option` 声明得**尽量宽**（`unknown` 字段 + 可选）：ant-design-vue 的 filterOption 会传
 * `DefaultOptionType`，它的 label 不保证是 string（可以是 VNode）。参数是逆变位置，
 * 这里写窄了整个函数就赋不进 filterOption（原先写 `label?: string` 正是这么报的 TS2769）。
 */
export function filterSelectOption(
  input: string,
  option?: { label?: unknown; value?: unknown },
): boolean {
  const text = String(option?.label ?? option?.value ?? '');
  return text.toLowerCase().includes(input.trim().toLowerCase());
}
