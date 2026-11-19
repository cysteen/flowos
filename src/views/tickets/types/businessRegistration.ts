import type { TicketStatus, TicketType } from './ticket';
import { statusStyle } from './ticket';
import { getActivePinia } from 'pinia';
import { useFormCatalogsStore } from '@/stores/formCatalogs';
import { formatRegistrationAmount, registrationAmountError } from '@/views/tickets/utils/registrationAmount';

/** Independent self-service records reuse platform field controls and account context. */
export const WIRELESS_REGISTRATION_TEMPLATE_ID = 'wireless-operator';
export const WIRELESS_REGISTRATION_GROUP_ID = 'wireless-music';
export const WIRELESS_REGISTRATION_GROUP_NAME = '无线音乐处理组';

/** New registrations use their own sequence; existing cached numbers remain unchanged. */
export function makeRegistrationNo(sequence: number, when = new Date()): string {
  const date = [when.getFullYear(), String(when.getMonth() + 1).padStart(2, '0'), String(when.getDate()).padStart(2, '0')].join('');
  return `IFLYZJ-${date}-${String(sequence).padStart(5, '0')}`;
}

export interface RegistrationValues {
  businessPhone: string;
  contactPhone: string;
  feedback: string;
  specificSource: string;
  channelDetail: string;
  accessTime: string;
  timeLimit: string;
  upstreamNo: string;
  businessLine: string;
  productCategory: string;
  productName: string;
  operator: string;
  province: string;
  orderTime: string;
  problemL1: string;
  problemL2: string;
  requestType: string;
  complaintType: string;
  closedLoop: string;
  description: string;
  processResult: string;
  refundPhone: string;
  refundAmount: string;
  replyTime: string;
}

export type RegistrationFieldKey = keyof RegistrationValues;
export type RegistrationValidationErrors = Partial<Record<RegistrationFieldKey, string>>;
export interface RegistrationFieldDefinition {
  key: RegistrationFieldKey;
  label: string;
  unit?: string;
  /** Input placeholder when label text differs from hint copy (e.g. 服务请求 vs 服务请求类别). */
  placeholder?: string;
  createRequired?: boolean;
  closeRequired?: boolean;
  options?: readonly string[];
}
export interface RegistrationProduct {
  name: string;
  category: string;
  /** The business must provide the independent catalog's complete ownership mapping. */
  businessLine?: string;
}
export interface RegistrationTemplate {
  id: string;
  name: string;
  businessType: string;
  ticketType: TicketType;
  groupId: string;
  groupName: string;
  includeInGeneralConsultationCount: boolean;
  fields: readonly RegistrationFieldDefinition[];
  products: readonly RegistrationProduct[];
  problemOptions: Readonly<Record<string, readonly string[]>>;
  sourceOptions: Readonly<Record<string, readonly string[]>>;
  optionLabels?: Readonly<Record<string, string>>;
  /** Enabled product lines grouped by their configured business-line parent. */
  productCategoryOptions?: Readonly<Record<string, readonly string[]>>;
  /** Stable option value to configured duration; display labels never drive timing. */
  timeLimitMinutes?: Readonly<Record<string, number>>;
}

/** Compatibility duration for tickets created before configurable promise snapshots. */
export const REGISTRATION_LEGACY_TIME_LIMIT_MINUTES: Readonly<Record<string, number>> = { 半小时: 30, '1小时': 60, '2小时': 120, '24小时': 1440 };

export const REGISTRATION_FIELD_DEFINITIONS: readonly RegistrationFieldDefinition[] = [
  { key: 'businessPhone', label: '业务号码', createRequired: true, closeRequired: true },
  { key: 'contactPhone', label: '联系号码' },
  { key: 'feedback', label: '反馈平台', closeRequired: true, options: [
    '咪咕系统', '通信助理工单系统', '来电名片系统', 'PRM工单', '邮件反馈', 'I讯飞群', '中移移动APP', '400客服系统', 'QQ反馈', '微信反馈',
  ] },
  { key: 'specificSource', label: '具体来源' },
  { key: 'channelDetail', label: '订购渠道', closeRequired: true },
  { key: 'accessTime', label: '派单时间', closeRequired: true },
  { key: 'timeLimit', label: '工单时效', closeRequired: true, options: ['半小时', '1小时', '2小时', '24小时'] },
  { key: 'requestType', label: '服务请求', placeholder: '填写服务请求类别' },
  { key: 'upstreamNo', label: '工单流水号' },
  { key: 'businessLine', label: '业务线', closeRequired: true, options: ['5G新通话业务部', '数字娱乐业务部'] },
  { key: 'productCategory', label: '产品分类', closeRequired: true },
  { key: 'productName', label: '产品名称', closeRequired: true },
  { key: 'operator', label: '运营商', closeRequired: true, options: ['移动', '联通', '电信', '其他'] },
  { key: 'province', label: '省份', closeRequired: true, options: ['北京市', '天津市', '河北省', '山西省', '内蒙古自治区', '辽宁省', '吉林省', '黑龙江省', '上海市', '江苏省', '浙江省', '安徽省', '福建省', '江西省', '山东省', '河南省', '湖北省', '湖南省', '广东省', '广西壮族自治区', '海南省', '重庆市', '四川省', '贵州省', '云南省', '西藏自治区', '陕西省', '甘肃省', '青海省', '宁夏回族自治区', '新疆维吾尔自治区', '香港特别行政区', '澳门特别行政区', '台湾省'] },
  { key: 'orderTime', label: '订购时间' },
  { key: 'problemL1', label: '问题分类一', closeRequired: true },
  { key: 'problemL2', label: '问题分类二', closeRequired: true },
  { key: 'complaintType', label: '投诉类型', closeRequired: true, options: ['普通投诉', '咨询', '升级投诉', '外投', '315投诉'] },
  { key: 'closedLoop', label: '是否闭环', closeRequired: true, options: ['已闭环', '待运营商回访确认', '三次联系未接通，待运营商再次反馈'] },
  { key: 'description', label: '描述内容', closeRequired: true },
  { key: 'processResult', label: '处理结果', closeRequired: true },
  { key: 'refundPhone', label: '退费号码' },
  { key: 'refundAmount', label: '退费金额', unit: '元' },
  { key: 'replyTime', label: '回复时间' },
];

const wirelessProducts: readonly RegistrationProduct[] = [
  // Complete demo paths below come only from the eight reviewed seedRecords;
  // products without a demonstrated business-line owner remain pending configuration.
  { name: '个性化彩铃', category: '个彩音频', businessLine: '数字娱乐业务部' },
  { name: '乐响铃声', category: '个彩音频', businessLine: '数字娱乐业务部' },
  { name: '沃阅读', category: '个彩音频', businessLine: '数字娱乐业务部' },
  { name: '安徽彩铃升级版', category: '个彩音频' },
  { name: '新悦铃音盒', category: '个彩音频' },
  { name: '音乐我最牛', category: '个彩音频' },
  { name: '会员畅听包', category: '个彩音频', businessLine: '数字娱乐业务部' },
  { name: '白金会员', category: '个彩音频', businessLine: '数字娱乐业务部' },
  { name: '真心点歌', category: '个彩音频' },
  { name: '音乐乐翻天', category: '个彩音频' },
  { name: 'VIP尽享包', category: '个彩音频' },
  { name: '潮流金榜', category: '个彩音频' },
  { name: '健康咨询', category: '个彩音频' },
  { name: '开心一刻', category: '个彩音频' },
  { name: '历史上的今天', category: '个彩音频' },
  { name: '小说乐享包热门音乐', category: '个彩音频' },
  { name: '炫铃俱乐部', category: '个彩音频' },
  { name: '炫友俱乐部', category: '个彩音频' },
  { name: '炫友音乐盒', category: '个彩音频' },
  { name: '5元超值铃音盒', category: '个彩音频' },
  { name: '我也是歌手', category: '个彩音频' },
  { name: '热门音乐节目', category: '个彩音频' },
  { name: '音乐汇铃音盒', category: '个彩音频' },
  { name: '中国新歌声', category: '个彩音频' },
  { name: '彩铃之声', category: '个彩音频' },
  { name: '学乐乐课程', category: '个彩音频' },
  { name: '流行佳音', category: '个彩音频' },
  { name: '畅享铃声', category: '个彩音频' },
  { name: '畅享壁纸', category: '个彩音频' },
  { name: '商务彩铃-瑞元H5', category: '商彩-互联网' },
  { name: '商务彩铃-0元H5', category: '商彩-互联网' },
  { name: '移动企业视频彩铃', category: '商彩-互联网' },
  { name: '铃音盒-个性化彩铃商务版5元包', category: '商彩-音频' },
  { name: '音乐名片', category: '商彩-音频' },
  { name: '商务炫铃', category: '商彩-音频', businessLine: '数字娱乐业务部' },
  { name: '铃音盒-个性化彩铃3元', category: '商彩-音频' },
  { name: '联通视频彩铃商务版DIY10元包', category: '商彩-音频' },
  { name: '商务视频彩铃', category: '商彩-音频' },
  { name: '咪咕音乐天籁VIP', category: '天籁会员', businessLine: '数字娱乐业务部' },
  { name: '咪咕音乐天籁会员', category: '天籁会员' },
  { name: '音乐全曲包-曼曼之声10元包', category: '亲情提醒' },
  { name: 'AI视频彩铃-标准版', category: 'AIGC' },
  { name: '咪咕音乐视宣号标准版', category: '视宣号' },
  { name: '咪咕音乐视宣号精英版', category: '视宣号' },
  { name: '咪咕音乐明星闹铃经济版', category: '个彩视频', businessLine: '数字娱乐业务部' },
];

export const REGISTRATION_TEMPLATES: readonly RegistrationTemplate[] = [{
  id: WIRELESS_REGISTRATION_TEMPLATE_ID,
  name: '无线音乐运营商登记',
  businessType: '无线音乐',
  ticketType: '咨询',
  groupId: WIRELESS_REGISTRATION_GROUP_ID,
  groupName: WIRELESS_REGISTRATION_GROUP_NAME,
  includeInGeneralConsultationCount: false,
  timeLimitMinutes: REGISTRATION_LEGACY_TIME_LIMIT_MINUTES,
  fields: REGISTRATION_FIELD_DEFINITIONS,
  products: wirelessProducts,
  problemOptions: {
    不知情订购: ['退订+退费', '退订+退费+联系用户', '仅做文档', '退订+退费+做文档', '退订+退费+做文档+联系用户'],
    业务咨询: ['无法开通', '铃音无法使用', '咨询如何设置彩铃', '开通渠道咨询'],
    用户类: ['黑名单屏蔽', '用户诉求', '用户建议'],
    非我司业务: ['派单错误'],
  },
  sourceOptions: {
    咪咕系统: [
      'AI视频彩铃系统', '个彩系统', '酷音系统', '天天彩铃系统', '泾县视频彩铃系统', '视频彩铃系统',
      '瑞元系统', '讯飞甄选系统', '仰平系统', '浙江金讯系统',
    ],
    微信反馈: [
      '彩铃包月投诉口径', '江苏移动微信投诉群', '科大讯飞&安徽移动业务推广群', '个彩铃投诉处理', 'KD投诉审核群',
      '云南视频彩铃渠道客诉群', '安徽视频彩铃投诉处理群', '科大-爱音乐投诉处理微信群（重要群）', '（爱音乐）江苏前置支撑群',
      '【科大讯飞】商务视频彩铃支撑群', '陕西个彩客服群', '重庆渠道客诉处理群', 'TS处理（重要群）', '有声名片处理群（非常重要群）',
      '[甘肃]视频彩铃渠道投诉处理沟通群', '5G新通话-彩铃投诉处理群', 'OBU三方支付业务沟通群', '山东5g秘书沟通群',
      '（内）重庆移动客服联动群', '县订阅包客服沟通群（核实渠道，审核文档）', '酷电秀主叫彩铃彩铃对接', '重庆呼叫秀-科大讯飞沟通群',
      '浙江金讯&讯飞甄选贵州音乐售后', '飞尊&讯飞樽鸿贵州音乐',
    ],
    QQ反馈: ['科大QQ-（2482417583）', '科大400-电信客服群', '科大-安徽电信客服群'],
  },
}];

export function registrationTemplateOf(id = WIRELESS_REGISTRATION_TEMPLATE_ID): RegistrationTemplate | undefined {
  const seed = REGISTRATION_TEMPLATES.find((template) => template.id === id);
  return seed && getActivePinia() ? useFormCatalogsStore().resolve(seed) : seed;
}
export function registrationOptionLabel(template: RegistrationTemplate, field: RegistrationFieldKey, value: string, parentValue = ''): string {
  return template.optionLabels?.[[field, parentValue, value].join('\u0001')] ?? value;
}
export function emptyRegistrationValues(_templateId = WIRELESS_REGISTRATION_TEMPLATE_ID): RegistrationValues {
  const values = Object.fromEntries(REGISTRATION_FIELD_DEFINITIONS.map((f) => [f.key, ''])) as unknown as RegistrationValues;
  values.accessTime = registrationNow();
  return values;
}
export function normalizeRegistrationValues(values: Partial<RegistrationValues>): RegistrationValues {
  const result = emptyRegistrationValues();
  for (const key of Object.keys(result) as RegistrationFieldKey[]) result[key] = typeof values[key] === 'string' ? values[key]!.trim() : '';
  result.refundAmount = formatRegistrationAmount(result.refundAmount);
  return result;
}
export function validateRegistrationValues(values: RegistrationValues, stage: 'create' | 'close' | 'draft', templateId = WIRELESS_REGISTRATION_TEMPLATE_ID, previous?: RegistrationValues): RegistrationValidationErrors {
  const errors: RegistrationValidationErrors = {};
  const template = registrationTemplateOf(templateId);
  for (const field of template?.fields ?? REGISTRATION_FIELD_DEFINITIONS) {
    if (stage !== 'draft' && (field.createRequired || (stage === 'close' && field.closeRequired)) && !values[field.key]?.trim()) errors[field.key] = `请填写${field.label}`;
    const unchanged = !!previous && previous[field.key] === values[field.key];
    if (values[field.key] && field.options && !['specificSource', 'problemL1', 'problemL2'].includes(field.key) && !field.options.includes(values[field.key]) && !unchanged) errors[field.key] = `请选择启用中的${field.label}`;
  }
  const amountError = registrationAmountError(values.refundAmount);
  if (amountError) errors.refundAmount = amountError;
  if (template) {
    const unchangedProblem = !!previous && previous.problemL1 === values.problemL1 && previous.problemL2 === values.problemL2;
    if (values.problemL1 && !Object.keys(template.problemOptions).includes(values.problemL1) && !(previous && previous.problemL1 === values.problemL1)) errors.problemL1 = '请选择启用中的问题分类一';
    if (values.problemL2 && !template.problemOptions[values.problemL1]?.includes(values.problemL2) && !unchangedProblem) errors.problemL2 = '请选择与问题分类一对应的启用中二级分类';
    const sourceChoices = template.sourceOptions[values.feedback] ?? [];
    if (stage !== 'draft' && values.feedback?.trim() && sourceChoices.length > 0 && !values.specificSource?.trim()) {
      errors.specificSource = '请选择具体来源';
    }
    if (values.specificSource && !sourceChoices.includes(values.specificSource) && !(previous && previous.feedback === values.feedback && previous.specificSource === values.specificSource)) errors.specificSource = '请选择与反馈平台对应的启用中具体来源';
    const product = template.products.find((item) => item.name === values.productName);
    const unchangedProduct = !!previous && previous.productName === values.productName && previous.productCategory === values.productCategory && previous.businessLine === values.businessLine;
    const productCategories = template.productCategoryOptions?.[values.businessLine] ?? template.products.filter((item) => item.businessLine === values.businessLine).map((item) => item.category);
    if (values.productCategory && !productCategories.includes(values.productCategory) && !unchangedProduct) errors.productCategory = '请选择与业务线对应的启用中产品分类';
    if (values.productName && (!values.businessLine || !values.productCategory) && !unchangedProduct) errors.productName = '请先选择业务线和产品分类';
    if (values.productName && !product && !unchangedProduct) errors.productName = '请选择启用中的产品名称';
    if (product && !unchangedProduct) {
      if (values.productCategory && values.productCategory !== product.category) errors.productCategory = '产品分类与所选产品不一致';
      if (product.businessLine && values.businessLine && values.businessLine !== product.businessLine) errors.businessLine = '业务线与所选产品归属不一致';
    }
  }
  return errors;
}
export function registrationNow(date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())} ${p(date.getHours())}:${p(date.getMinutes())}:${p(date.getSeconds())}`;
}
export interface RegistrationChange { field: RegistrationFieldKey; label: string; before: string; after: string }
export interface RegistrationHistory { id: string; action: string; actor: string; at: string; detail: string; changes?: RegistrationChange[] }
export interface RegistrationAttachment { id: string; name: string; size: number; type: string; url?: string; uploadedBy: string; uploadedAt: string }
export interface RegistrationContact {
  id: string;
  phone: string;
  actor: string;
  at: string;
  /** 接通 / 未接通；旧数据可能为示意文案 */
  result: string;
  recordingUrl?: string;
  /** 与标准工单 ContactRecord.summary 一致，供 OpContactRecordsTab 展示 */
  summary?: string;
  callSpan?: { startedAt: string; connectedAt?: string; endedAt: string };
  recording?: { progress: string; progressPercent: number };
}
export interface RegistrationNotification { id: string; at: string; content: string; recipient: string; status: string; kind: 'reminder' | 'reopen' | 'material' | 'sms' | 'email' }
export interface RegistrationReminder { id: string; at: string; note: string; recipient: string; triggeredAt?: string; acknowledgedAt?: string }
export interface RegistrationRecord {
  no: string;
  /** Local prototype conflict token; each successful mutation advances it once. */
  revision?: number;
  templateId: string;
  values: RegistrationValues;
  /** Snapshot selected when the promise is first saved or deliberately changed. */
  timeLimitMinutes?: number;
  timeLimitLabel?: string;
  status: '草稿' | '处理中' | '已结案';
  groupId: string;
  groupName: string;
  builder: string;
  handler: string;
  createdAt: string;
  updatedAt: string;
  closedAt?: string;
  /** 班组长退回重开时间；内部状态仍为处理中，列表展示「已退回」直至再次结案 */
  reopenedAt?: string;
  history: RegistrationHistory[];
  attachments: RegistrationAttachment[];
  contacts: RegistrationContact[];
  notifications: RegistrationNotification[];
  reminders?: RegistrationReminder[];
  /** 描述内容 / 处理结果区 OpTextareaAttach 文件名（与附件历史同步上传） */
  descriptionAttachments?: string[];
  processResultAttachments?: string[];
}
/** Display labels share dictionary resolution; stored keys and query comparisons stay unchanged. */
export function registrationDisplayValue(record: RegistrationRecord, field: RegistrationFieldKey, template = registrationTemplateOf(record.templateId)): string {
  const value = record.values[field]?.trim() ?? '';
  if (!value) return '';
  if (field === 'timeLimit' && record.timeLimitLabel) return record.timeLimitLabel;
  const parent = field === 'specificSource' ? record.values.feedback : field === 'problemL2' ? record.values.problemL1 : field === 'productCategory' ? record.values.businessLine : '';
  return template ? registrationOptionLabel(template, field, value, parent) : value;
}
export interface RegistrationOperationResult { ok: boolean; message: string; record?: RegistrationRecord; errors?: RegistrationValidationErrors }

type LegacyRegistrationRecord = RegistrationRecord & { reminder?: RegistrationReminder };

export function parseRegistrationReminderAt(at: string): number {
  return new Date(at.replace(' ', 'T')).getTime();
}

export function pendingRegistrationReminders(reminders: RegistrationReminder[] | undefined): RegistrationReminder[] {
  return (reminders ?? []).filter((item) => !item.triggeredAt);
}

export function unacknowledgedRegistrationReminders(reminders: RegistrationReminder[] | undefined): RegistrationReminder[] {
  return (reminders ?? []).filter((item) => !!item.triggeredAt && !item.acknowledgedAt);
}

export function registrationReopenNotification(item: RegistrationNotification): boolean {
  return item.kind === 'reopen' || item.content.startsWith('班组长退回重开');
}

/** 原处理人待跟进：班组长退回重开且通知仍为待处理（同单多条时取 at 最新一条） */
export function registrationPendingReopenNotice(
  record: RegistrationRecord,
  recipient: string,
): RegistrationNotification | undefined {
  const pending = (record.notifications ?? []).filter((item) => item.recipient === recipient
    && item.status === '待处理'
    && registrationReopenNotification(item));
  if (!pending.length) return undefined;
  return pending.slice().sort((a, b) => parseRegistrationReminderAt(b.at) - parseRegistrationReminderAt(a.at))[0];
}

export const REGISTRATION_REOPEN_LIST_STATUS = '已退回' as const;

/** 班组长退回后、尚未再次结案：展示「已退回」；知晓通知或保存不改变此展示（产品口径） */
export function registrationReopenedAwaitingClose(record: RegistrationRecord): boolean {
  if (record.status !== '处理中') return false;
  if (record.reopenedAt?.trim()) return true;
  const reopenIdx = record.history.findIndex((entry) => entry.action === '退回重开');
  if (reopenIdx < 0) return false;
  const newer = record.history.slice(0, reopenIdx);
  return !newer.some((entry) => entry.action === '结案');
}

export type RegistrationListDisplayStatus = RegistrationRecord['status'] | typeof REGISTRATION_REOPEN_LIST_STATUS;

export function registrationListDisplayStatus(record: RegistrationRecord): RegistrationListDisplayStatus {
  return registrationReopenedAwaitingClose(record) ? REGISTRATION_REOPEN_LIST_STATUS : record.status;
}

export function registrationListDisplayStatusStyle(record: RegistrationRecord): { color: string; background: string } {
  const label = registrationListDisplayStatus(record);
  if (label === REGISTRATION_REOPEN_LIST_STATUS) {
    return statusStyle(REGISTRATION_REOPEN_LIST_STATUS as TicketStatus);
  }
  return statusStyle(label as TicketStatus);
}

export function nextUpcomingRegistrationReminder(reminders: RegistrationReminder[] | undefined): RegistrationReminder | undefined {
  const pending = pendingRegistrationReminders(reminders);
  if (!pending.length) return undefined;
  return pending.slice().sort((a, b) => parseRegistrationReminderAt(a.at) - parseRegistrationReminderAt(b.at))[0];
}

/** 从旧版单条 reminder 字段迁入 reminders 数组（仅内存归一化，不写回缓存） */
export function hydrateRegistrationReminders(record: LegacyRegistrationRecord): RegistrationRecord {
  const next = { ...record } as LegacyRegistrationRecord;
  if (!next.reminders?.length && next.reminder) next.reminders = [next.reminder];
  delete next.reminder;
  if (next.status === '已结案') delete next.reminders;
  return next;
}
