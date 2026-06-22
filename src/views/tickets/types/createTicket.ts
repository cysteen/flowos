import type { Channel, Priority, TicketType } from '@/views/tickets/types/ticket';

/** 新建弹窗工单类型（对齐 .pen V6xQCz 等画板） */
export type CreateFormTicketType = '投诉' | '建议' | '商机' | '咨询';

export type BusinessType = '学习机' | '翻录' | '智学网';

/** 工单来源枚举（对齐 PRD-04 / 渠道管理） */
export type TicketSource = '400呼入' | '在线客服' | '邮件' | '小程序' | 'APP';

export const TICKET_SOURCE_OPTIONS: TicketSource[] = [
  '400呼入',
  '在线客服',
  '邮件',
  '小程序',
  'APP',
];

export interface CustomerInfo {
  id: string;
  name: string;
  phone: string;
  vip: boolean;
  customerType: string;
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
  /** 工单来源，默认 400 呼入 */
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
  complaintPlatform: string;
  businessLine: string;
  complaintNo: string;
  priorFeedback: string;
  serviceReview: string;
  complaintL1: string;
  complaintL2: string;
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

export const PRIORITY_OPTIONS: { value: Priority; label: string }[] = [
  { value: 'P0', label: 'P0（VIP + 紧急）' },
  { value: 'P1', label: 'P1（紧急）' },
  { value: 'P2', label: 'P2（普通）' },
  { value: 'P3', label: 'P3（低）' },
];

export const EXPECT_TIMES = ['今日 18:00', '今日 20:00', '明日 12:00', '3 个工作日内'];

export const COMPLAINT_TYPE_OPTIONS = ['服务投诉', '产品质量', '物流问题', '其他'];
export const COMPLAINT_PLATFORM_OPTIONS = ['12315', '黑猫投诉', '微博', '其他平台'];
export const BUSINESS_LINE_OPTIONS = ['学习机业务线', '翻录业务线', '智学网业务线'];
export const YES_NO_OPTIONS = ['是', '否'];
export const SERVICE_REVIEW_OPTIONS = ['需要回溯', '无需回溯'];
export const COMPLAINT_L1_OPTIONS = ['产品质量', '服务态度', '物流问题'];
export const COMPLAINT_L2_MAP: Record<string, string[]> = {
  产品质量: ['功能缺陷', '外观瑕疵', '配件缺失'],
  服务态度: ['响应慢', '态度差'],
  物流问题: ['延迟', '破损'],
};
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
  if (!channel || channel === '电话') return '400呼入';
  return channel;
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
