// 客户查询 · 客户全景（/customer-insight）数据源。
//
// 口径：以「手机号」为客户主键。当前在办/已办工单直接取自工单库（mock/tickets.ts），
// 保证与工作台、工单列表同源；早于工单库时间窗的历史单、联系记录、关联售后单、
// 满意度评价存在本文件，构成客户的长期履历。任何在工单库中出现过的手机号都可查到，
// 未建档客户按工单聚合出基础档案。

import { TICKETS } from './tickets';
import {
  isTicketClosed,
  resolveStoppedClockStatus,
  statusDisplayName,
  ticketStatusDisplayName,
  type Ticket,
} from '@/views/tickets/types/ticket';

/** 客户全景页时间基准（与工单 Mock 时间轴对齐） */
export const INSIGHT_TODAY = '2026-08-04';

/**
 * 客户角色：**客户是谁**，决定对客口径与升级敏感度。
 * 前四项与工单库 CustomerTag 同源（记者/老师/校长/自媒体），后两项为缺省身份。
 * 注意：这里不设 VIP/金牌这类付费等级——本系统按角色而非等级区分服务口径。
 */
export type CustomerRole = '记者' | '老师' | '校长' | '自媒体' | '个人客户' | '企业客户';

export type TicketTone = 'processing' | 'closed' | 'pending' | 'suspended';
export type RecordSource = '客服' | '售后';

/** 联系方式（一位客户可有多条，primary 为回访首选） */
export interface CustomerContactWay {
  kind: '手机' | '座机' | '邮箱' | '微信';
  value: string;
  primary?: boolean;
}

/** 已购产品（对齐 ServiceNow install base：产品 + 序列号 + 购买信息 + 保修权益） */
export interface CustomerPurchase {
  name: string;
  sn?: string;
  boughtAt: string;
  /** 购买渠道：官方商城 / 京东自营 / 线下门店 / 教育集采 */
  channel?: string;
  warranty: string;
  inWarranty: boolean;
}

export interface CustomerTicketRow {
  id: string;
  no: string;
  title: string;
  type: string;
  priority: string;
  statusText: string;
  tone: TicketTone;
  channel: string;
  product: string;
  createdAt: string;
  closedAt?: string;
  assignee: string;
  /** 处理结论（终态单）或最新进展（在办单） */
  conclusion?: string;
  source: RecordSource;
  satisfaction?: number;
  /** 解决时效未达标 */
  breached?: boolean;
  isComplaint: boolean;
  isProcessing: boolean;
  isClosed: boolean;
  /** 升级链：本单升级自 / 本单已升级为 */
  escalatedFromNo?: string;
  escalatedToNo?: string;
  /** 外部投诉平台（外投单） */
  complaintPlatform?: string;
  /** 是否当前在办（取自工单库，可点开处理页） */
  live: boolean;
}

export interface CustomerContactRow {
  id: string;
  kind: 'call' | 'im' | 'sms' | 'email';
  when: string;
  operator: string;
  /** 通话时长 / 会话条数 等元信息 */
  meta: string;
  summary: string;
  ticketNo?: string;
}

export interface CustomerAftersaleRow {
  no: string;
  type: string;
  product: string;
  status: string;
  createdAt: string;
  conclusion: string;
  /** 由哪张客服单转出 */
  fromTicketNo?: string;
}

export interface CustomerSurveyRow {
  ticketNo: string;
  sentAt: string;
  evaluated: boolean;
  score?: number;
  comment?: string;
}

export interface CustomerProfile {
  id: string;
  name: string;
  /** 角色＝客户是谁；服务口径按角色定，不按付费等级 */
  role: CustomerRole;
  /** 服务特征标签（易投诉 / 高价值 / 监管投诉史…），与角色分开呈现 */
  tags: string[];
  /** 主手机号，同时是客户主键 */
  phone: string;
  /** 全部联系方式 */
  contacts: CustomerContactWay[];
  region: string;
  address: string;
  /** 所属单位（学校 / 企业 / 机构），个人客户为空 */
  org?: string;
  /** 偏好联系渠道（回访优先走这条） */
  preferredChannel?: string;
  firstSeen: string;
  /** 已购产品 */
  purchases: CustomerPurchase[];
}

export interface CustomerMetrics {
  total: number;
  complaint: number;
  escalated: number;
  /** 平均满意度，无评价时为 null */
  avgSatisfaction: number | null;
  recent30: number;
  breached: number;
  aftersale: number;
}

export interface CustomerInsight {
  profile: CustomerProfile;
  metrics: CustomerMetrics;
  /** 风险提示（由履历客观推导，供二线判断对客口径） */
  riskFlags: string[];
  tickets: CustomerTicketRow[];
  contacts: CustomerContactRow[];
  aftersales: CustomerAftersaleRow[];
  surveys: CustomerSurveyRow[];
}

// ---- 客户档案（建档客户）----

const PROFILES: CustomerProfile[] = [
  {
    id: 'C1001', name: '张小凡', role: '记者', tags: ['易投诉', '高价值'],
    phone: '13800138001',
    contacts: [
      { kind: '手机', value: '13800138001', primary: true },
      { kind: '邮箱', value: 'zhangxf@media-sh.com' },
      { kind: '座机', value: '021-6288-4102' },
    ],
    region: '上海', address: '上海市浦东新区世纪大道 1200 号 A 座 18 层',
    org: '沪上财经传媒', preferredChannel: '电话', firstSeen: '2023-05-11',
    purchases: [
      { name: '智能音箱 X1', sn: 'SN-X1-20260301', boughtAt: '2026-03-01', channel: '官方商城', warranty: '2027-03-01', inWarranty: true },
      { name: '智能门锁 L1', sn: 'SN-L1-19022', boughtAt: '2024-09-12', channel: '京东自营', warranty: '2025-09-12', inWarranty: false },
    ],
  },
  {
    id: 'C1004', name: '赵敏', role: '校长', tags: ['续约期', '高价值'],
    phone: '13788889999',
    contacts: [
      { kind: '手机', value: '13788889999', primary: true },
      { kind: '邮箱', value: 'zhaomin@sz-shiyan.edu.cn' },
    ],
    region: '深圳', address: '深圳市南山区科苑南路 2 号实验学校行政楼',
    org: '深圳实验学校（初中部）', preferredChannel: '邮件', firstSeen: '2021-03-15',
    purchases: [
      { name: '开放平台（企业版）', boughtAt: '2021-03-15', channel: '教育集采', warranty: '2026-12-31', inWarranty: true },
      { name: '智学网校级版', boughtAt: '2024-09-01', channel: '教育集采', warranty: '2026-08-31', inWarranty: true },
    ],
  },
  {
    id: 'C1008', name: '吴强', role: '个人客户', tags: ['易投诉', '监管投诉史'],
    phone: '13700003333',
    contacts: [
      { kind: '手机', value: '13700003333', primary: true },
      { kind: '微信', value: 'wq_1988' },
    ],
    region: '成都', address: '成都市武侯区天府大道北段 1480 号 3 栋 2 单元 901',
    preferredChannel: '电话', firstSeen: '2024-02-20',
    purchases: [
      { name: '智能音箱 X1', sn: 'SN-X1-55208', boughtAt: '2025-06-18', channel: '线下门店', warranty: '2026-06-18', inWarranty: false },
    ],
  },
  {
    id: 'C1011', name: '李大海', role: '个人客户', tags: ['老客户'],
    phone: '13912345678',
    contacts: [
      { kind: '手机', value: '13912345678', primary: true },
      { kind: '邮箱', value: 'lidahai@163.com' },
    ],
    region: '北京', address: '北京市海淀区上地十街 10 号院 6 号楼 1102',
    preferredChannel: '电话', firstSeen: '2022-08-04',
    purchases: [
      { name: '扫地机器人 R2', sn: 'SN-R2-882910', boughtAt: '2025-11-20', channel: '官方商城', warranty: '2026-11-20', inWarranty: true },
      { name: '空气净化器 P3', sn: 'SN-P3-31007', boughtAt: '2023-04-02', channel: '京东自营', warranty: '2024-04-02', inWarranty: false },
    ],
  },
  {
    id: 'C1013', name: '孙莉', role: '自媒体', tags: ['新客'],
    phone: '15800002222',
    contacts: [
      { kind: '手机', value: '15800002222', primary: true },
      { kind: '微信', value: 'sunli_vlog' },
    ],
    region: '杭州', address: '杭州市余杭区文一西路 969 号 5 号楼',
    org: '「莉声评测」自媒体工作室', preferredChannel: '在线客服', firstSeen: '2026-01-09',
    purchases: [
      { name: '蓝牙耳机 Air', sn: 'SN-AIR-55102', boughtAt: '2026-05-28', channel: '官方商城', warranty: '2027-05-28', inWarranty: true },
    ],
  },
  {
    id: 'C1017', name: '陈翻译', role: '老师', tags: ['教育行业'],
    phone: '13500001234',
    contacts: [
      { kind: '手机', value: '13500001234', primary: true },
      { kind: '邮箱', value: 'chenfy@hf-no8.edu.cn' },
    ],
    region: '合肥', address: '合肥市蜀山区望江西路 169 号合肥八中外语组',
    org: '合肥市第八中学', preferredChannel: '在线客服', firstSeen: '2024-11-03',
    purchases: [
      { name: '讯飞翻译机 T10', sn: 'SN-T10-260713', boughtAt: '2026-04-19', channel: '教育集采', warranty: '2027-04-19', inWarranty: true },
    ],
  },
];

// ---- 历史工单（早于工单库时间窗，仅存于客户履历）----

type ArchiveTicket = Omit<CustomerTicketRow, 'live'>;

const ARCHIVE: Record<string, ArchiveTicket[]> = {
  '13800138001': [
    {
      id: 'h-13800138001-1', no: 'LCMN-20260412-30188', title: '智能音箱连接家庭 WiFi 频繁掉线',
      type: '投诉', priority: 'P1', statusText: '已结案', tone: 'closed', channel: '电话',
      product: '智能音箱 X1', createdAt: '2026-04-12 10:22', closedAt: '2026-04-15 17:40',
      assignee: '林坐席', source: '客服', satisfaction: 3,
      conclusion: '指导重置网络模块后恢复，客户对处理时长不满，已致歉并赠送 3 个月会员。',
      isComplaint: true, isProcessing: false, isClosed: true,
    },
    {
      id: 'h-13800138001-2', no: 'LCMN-20260228-21044', title: '咨询音箱固件升级方式',
      type: '咨询', priority: 'P3', statusText: '已结案', tone: 'closed', channel: '在线客服',
      product: '智能音箱 X1', createdAt: '2026-02-28 14:05', closedAt: '2026-02-28 14:31',
      assignee: '陈坐席', source: '客服', satisfaction: 5,
      conclusion: '已引导至 APP 内一键升级，客户当场确认解决。',
      isComplaint: false, isProcessing: false, isClosed: true,
    },
    {
      id: 'h-13800138001-3', no: 'AS-20250922-11208', title: '智能门锁指纹模块返修',
      type: '维修', priority: 'P2', statusText: '已完成', tone: 'closed', channel: '售后',
      product: '智能门锁 L1', createdAt: '2025-09-22 09:00', closedAt: '2025-10-08 16:00',
      assignee: '售后 · 华东仓', source: '售后',
      conclusion: '保内更换指纹模块，寄回客户并回访确认正常。',
      isComplaint: false, isProcessing: false, isClosed: true,
    },
  ],
  '13788889999': [
    {
      id: 'h-13788889999-1', no: 'LCMN-20260520-41122', title: '开放平台批量导入接口报错 500',
      type: '咨询', priority: 'P1', statusText: '已结案', tone: 'closed', channel: '邮件',
      product: '开放平台', createdAt: '2026-05-20 11:10', closedAt: '2026-05-21 10:05',
      assignee: '技术支持 · 周工', source: '客服', satisfaction: 5,
      conclusion: '定位为客户侧字段编码问题，提供修正样例后自测通过。',
      isComplaint: false, isProcessing: false, isClosed: true,
    },
    {
      id: 'h-13788889999-2', no: 'LCMN-20260118-18076', title: '续约方案与并发配额咨询',
      type: '商机', priority: 'P2', statusText: '已结案', tone: 'closed', channel: '电话',
      product: '开放平台', createdAt: '2026-01-18 15:30', closedAt: '2026-01-19 09:50',
      assignee: '王坐席', source: '客服', satisfaction: 5,
      conclusion: '转销售跟进，已签 2026 年度续约（含并发扩容至 200 QPS）。',
      isComplaint: false, isProcessing: false, isClosed: true,
    },
    {
      id: 'h-13788889999-3', no: 'LCMN-20251106-09933', title: '账号权限变更申请',
      type: '咨询', priority: 'P3', statusText: '已结案', tone: 'closed', channel: '小程序',
      product: '企业版', createdAt: '2025-11-06 09:12', closedAt: '2025-11-06 11:20',
      assignee: '林坐席', source: '客服', satisfaction: 4,
      conclusion: '已按授权函为 3 名管理员开通后台权限。',
      isComplaint: false, isProcessing: false, isClosed: true,
    },
  ],
  '13700003333': [
    {
      id: 'h-13700003333-1', no: 'LCMN-20260605-52011', title: '智能音箱送修后功能未恢复',
      type: '投诉', priority: 'P1', statusText: '已结案', tone: 'closed', channel: '电话',
      product: '智能音箱 X1', createdAt: '2026-06-05 10:40', closedAt: '2026-06-21 18:10',
      assignee: '陈坐席', source: '客服', satisfaction: 2, breached: true,
      conclusion: '二次返修后功能恢复，处理周期 16 天超出承诺，客户明确表示不满。',
      isComplaint: true, isProcessing: false, isClosed: true,
    },
    {
      id: 'h-13700003333-2', no: 'AS-20260520-13390', title: '智能音箱主板返修（保外）',
      type: '维修', priority: 'P2', statusText: '已完成', tone: 'closed', channel: '售后',
      product: '智能音箱 X1', createdAt: '2026-05-20 14:00', closedAt: '2026-06-04 15:30',
      assignee: '售后 · 西南仓', source: '售后',
      conclusion: '保外付费更换主板，收费 268 元，返机后客户反馈仍有异常。',
      isComplaint: false, isProcessing: false, isClosed: true,
    },
    {
      id: 'h-13700003333-3', no: 'LCMN-20260419-33507', title: '音箱无法唤醒',
      type: '咨询', priority: 'P2', statusText: '已结案', tone: 'closed', channel: '在线客服',
      product: '智能音箱 X1', createdAt: '2026-04-19 20:15', closedAt: '2026-04-20 09:40',
      assignee: '王坐席', source: '客服', satisfaction: 4,
      conclusion: '远程指导恢复出厂设置后可唤醒，建议观察一周。',
      isComplaint: false, isProcessing: false, isClosed: true,
    },
  ],
  '13912345678': [
    {
      id: 'h-13912345678-1', no: 'LCMN-20260401-27714', title: '扫地机器人回充失败',
      type: '咨询', priority: 'P2', statusText: '已结案', tone: 'closed', channel: '在线客服',
      product: '扫地机器人 R2', createdAt: '2026-04-01 19:22', closedAt: '2026-04-02 10:15',
      assignee: '林坐席', source: '客服', satisfaction: 5,
      conclusion: '指导清洁充电极片并调整基站位置后恢复正常。',
      isComplaint: false, isProcessing: false, isClosed: true,
    },
    {
      id: 'h-13912345678-2', no: 'LCMN-20240712-08221', title: '空气净化器噪音偏大',
      type: '投诉', priority: 'P2', statusText: '已结案', tone: 'closed', channel: '电话',
      product: '空气净化器 P3', createdAt: '2024-07-12 08:50', closedAt: '2024-07-16 16:20',
      assignee: '陈坐席', source: '客服', satisfaction: 4,
      conclusion: '保内换机处理，客户接受。',
      isComplaint: true, isProcessing: false, isClosed: true,
    },
  ],
  '15800002222': [
    {
      id: 'h-15800002222-1', no: 'LCMN-20260603-51880', title: '耳机单边无声',
      type: '咨询', priority: 'P2', statusText: '已结案', tone: 'closed', channel: 'APP',
      product: '蓝牙耳机 Air', createdAt: '2026-06-03 21:04', closedAt: '2026-06-04 11:30',
      assignee: '王坐席', source: '客服', satisfaction: 3,
      conclusion: '判断为充电仓触点接触不良，已寄出新充电仓。',
      isComplaint: false, isProcessing: false, isClosed: true,
    },
  ],
  '13500001234': [
    {
      id: 'h-13500001234-1', no: 'LCMN-20260626-56340', title: '翻译机离线包下载中断',
      type: '咨询', priority: 'P2', statusText: '已结案', tone: 'closed', channel: '在线客服',
      product: '讯飞翻译机 T10', createdAt: '2026-06-26 10:11', closedAt: '2026-06-26 15:22',
      assignee: '林坐席', source: '客服', satisfaction: 5,
      conclusion: '更换下载节点后完成离线包安装。',
      isComplaint: false, isProcessing: false, isClosed: true,
    },
    {
      id: 'h-13500001234-2', no: 'LCMN-20250308-04412', title: '批量采购发票与保修凭证',
      type: '咨询', priority: 'P3', statusText: '已结案', tone: 'closed', channel: '邮件',
      product: '讯飞翻译机 T10', createdAt: '2025-03-08 09:30', closedAt: '2025-03-09 14:00',
      assignee: '陈坐席', source: '客服', satisfaction: 5,
      conclusion: '已补开增值税专用发票并寄送保修凭证。',
      isComplaint: false, isProcessing: false, isClosed: true,
    },
  ],
};

// ---- 联系记录 ----

const CONTACTS: Record<string, CustomerContactRow[]> = {
  '13800138001': [
    { id: 'ct-1', kind: 'call', when: '2026-06-10 14:12', operator: '王坐席', meta: '通话 6 分 12 秒', summary: '客户情绪激动，强调本人为媒体从业者，要求当日给出明确答复，已承诺 24 小时内回电。', ticketNo: 'LCMN-20260610-73026' },
    { id: 'ct-2', kind: 'im', when: '2026-06-10 09:30', operator: '一线 · 李坐席', meta: '在线会话 18 条', summary: '首次反馈播放跳曲问题，已采集日志并升级二线。', ticketNo: 'LCMN-20260610-73026' },
    { id: 'ct-3', kind: 'call', when: '2026-04-15 17:20', operator: '林坐席', meta: '通话 4 分 40 秒', summary: '回访掉线问题处理结果，客户表示可用但对时长不满。', ticketNo: 'LCMN-20260412-30188' },
    { id: 'ct-4', kind: 'sms', when: '2026-04-12 10:30', operator: '系统', meta: '受理通知', summary: '您反馈的问题已受理，工单号 LCMN-20260412-30188。', ticketNo: 'LCMN-20260412-30188' },
  ],
  '13700003333': [
    { id: 'ct-11', kind: 'call', when: '2026-07-11 14:05', operator: '王坐席', meta: '通话 11 分 03 秒', summary: '客户告知已向 12315 提交投诉，要求赔偿维修期间损失，本次通话未达成一致。', ticketNo: 'LCMN-20260711-61550' },
    { id: 'ct-12', kind: 'call', when: '2026-06-21 16:40', operator: '陈坐席', meta: '通话 8 分 27 秒', summary: '告知二次返修完成，客户质疑同一故障重复发生，要求书面说明。', ticketNo: 'LCMN-20260605-52011' },
    { id: 'ct-13', kind: 'im', when: '2026-06-05 10:45', operator: '一线 · 李坐席', meta: '在线会话 26 条', summary: '反馈送修后功能未恢复，已登记并转技术支持。', ticketNo: 'LCMN-20260605-52011' },
  ],
  '13788889999': [
    { id: 'ct-21', kind: 'email', when: '2026-06-10 13:00', operator: '王坐席', meta: '发送人 王坐席', summary: '就 429 限流提供临时配额提升方案与重试指引，等待客户技术侧确认。', ticketNo: 'LCMN-20260610-75002' },
    { id: 'ct-22', kind: 'call', when: '2026-01-19 09:30', operator: '王坐席', meta: '通话 15 分 08 秒', summary: '沟通续约方案，客户确认扩容需求并同意转销售。', ticketNo: 'LCMN-20260118-18076' },
  ],
  '13912345678': [
    { id: 'ct-31', kind: 'call', when: '2026-06-10 16:00', operator: '王坐席', meta: '通话 3 分 51 秒', summary: '客户催问上门时间，已说明配件在途，承诺次日 12 点前反馈。', ticketNo: 'LCMN-20260610-73118' },
    { id: 'ct-32', kind: 'call', when: '2026-04-02 10:05', operator: '林坐席', meta: '通话 5 分 20 秒', summary: '远程指导回充问题，客户当场验证成功。', ticketNo: 'LCMN-20260401-27714' },
  ],
  '15800002222': [
    { id: 'ct-41', kind: 'im', when: '2026-06-10 11:35', operator: '王坐席', meta: '在线会话 14 条', summary: '客户提出退货并提及会在社交平台反馈体验，已按自媒体标签上报班组长。', ticketNo: 'LCMN-20260610-75240' },
  ],
  '13500001234': [
    { id: 'ct-51', kind: 'im', when: '2026-07-13 09:20', operator: '一线 · 李坐席', meta: '在线会话 21 条', summary: '反馈离线长句漏译，已采集样本音频与日志，升级二线。', ticketNo: 'LCMN-20260713-90001' },
    { id: 'ct-52', kind: 'call', when: '2026-06-26 15:10', operator: '林坐席', meta: '通话 4 分 05 秒', summary: '确认离线包安装完成，客户确认可用。', ticketNo: 'LCMN-20260626-56340' },
  ],
};

// ---- 关联售后单 ----

const AFTERSALES: Record<string, CustomerAftersaleRow[]> = {
  '13800138001': [
    { no: 'AS-20250922-11208', type: '返修', product: '智能门锁 L1', status: '已完成', createdAt: '2025-09-22', conclusion: '保内更换指纹模块' },
  ],
  '13700003333': [
    { no: 'AS-20260712-14026', type: '返修', product: '智能音箱 X1', status: '处理中', createdAt: '2026-07-12', conclusion: '三次返修，已升级至品质部门排查批次问题', fromTicketNo: 'LCMN-20260711-61551' },
    { no: 'AS-20260520-13390', type: '返修', product: '智能音箱 X1', status: '已完成', createdAt: '2026-05-20', conclusion: '保外付费更换主板（268 元）' },
  ],
  '15800002222': [
    { no: 'AS-20260610-13905', type: '退货', product: '蓝牙耳机 Air', status: '待审核', createdAt: '2026-06-10', conclusion: '客户申请七天无理由退货，待仓库验机', fromTicketNo: 'LCMN-20260610-75240' },
  ],
  '13912345678': [
    { no: 'AS-20260610-13901', type: '上门', product: '扫地机器人 R2', status: '处理中', createdAt: '2026-06-10', conclusion: '主刷电机配件在途，预约上门待确认', fromTicketNo: 'LCMN-20260610-73118' },
  ],
};

// ---- 满意度评价 ----

const SURVEYS: Record<string, CustomerSurveyRow[]> = {
  '13800138001': [
    { ticketNo: 'LCMN-20260412-30188', sentAt: '2026-04-15 18:00', evaluated: true, score: 3, comment: '问题解决了，但来回折腾了三天。' },
    { ticketNo: 'LCMN-20260228-21044', sentAt: '2026-02-28 15:00', evaluated: true, score: 5, comment: '响应很快。' },
  ],
  '13700003333': [
    { ticketNo: 'LCMN-20260605-52011', sentAt: '2026-06-21 18:30', evaluated: true, score: 2, comment: '同一个问题修了两次还没好。' },
    { ticketNo: 'LCMN-20260419-33507', sentAt: '2026-04-20 10:00', evaluated: true, score: 4 },
    { ticketNo: 'LCMN-20260711-61550', sentAt: '2026-07-11 15:00', evaluated: false },
  ],
  '13788889999': [
    { ticketNo: 'LCMN-20260520-41122', sentAt: '2026-05-21 10:30', evaluated: true, score: 5, comment: '技术支持很专业。' },
    { ticketNo: 'LCMN-20260118-18076', sentAt: '2026-01-19 10:20', evaluated: true, score: 5 },
  ],
  '13912345678': [
    { ticketNo: 'LCMN-20260401-27714', sentAt: '2026-04-02 11:00', evaluated: true, score: 5 },
    { ticketNo: 'LCMN-20240712-08221', sentAt: '2024-07-16 17:00', evaluated: true, score: 4 },
  ],
  '15800002222': [
    { ticketNo: 'LCMN-20260603-51880', sentAt: '2026-06-04 12:00', evaluated: true, score: 3, comment: '寄新充电仓有点慢。' },
  ],
  '13500001234': [
    { ticketNo: 'LCMN-20260626-56340', sentAt: '2026-06-26 16:00', evaluated: true, score: 5 },
    { ticketNo: 'LCMN-20250308-04412', sentAt: '2025-03-09 15:00', evaluated: true, score: 5 },
  ],
};

/* -------------------------------------------------------------------------
 * 履历完整性校验（构建期）
 *
 * 本页的工单号分两类，两类的**约束刚好相反**，所以必须分开管：
 *   ① 在办 / 已办单：来自工单数据源，`live: true`，行内单号可点开办理页
 *      → 单号必须在工单库里存在（这一类由工单库自己保证，本文件不手写）。
 *   ② 历史单（ARCHIVE）：早于工单库时间窗，只存在于履历，`live: false`，
 *      界面上以「已归档」标记呈现且**不可点开**（openTicket 对 !live 直接返回）。
 *      → 单号必须**不在**工单库里：一旦重号，同一张单会在客户履历里出现两行。
 *
 * 联系记录 / 满意度 / 关联售后单只是**指向**某张单，故校验两件事：单号能落到某张单上，
 * 且那张单属于**同一位客户** —— 挂到别人名下的记录，界面上看不出错，读的人却会当真。
 * ----------------------------------------------------------------------- */

const LIVE_TICKET_BY_NO = new Map(TICKETS.map((t) => [t.no, t]));

Object.entries(ARCHIVE).forEach(([phone, rows]) => {
  rows.forEach((r) => {
    if (LIVE_TICKET_BY_NO.has(r.no)) {
      throw new Error(
        `[customerInsight] 历史单 ${r.no}（${phone}）与工单库重号，客户履历会出现两行同一张单`,
      );
    }
  });
});

function assertTicketBelongsTo(phone: string, no: string, where: string): void {
  const live = LIVE_TICKET_BY_NO.get(no);
  if (live) {
    if (live.customerPhone !== phone) {
      throw new Error(
        `[customerInsight] ${where} 引用的 ${no} 是 ${live.customerPhone ?? '未登记手机号'} 的单，不是 ${phone} 的`,
      );
    }
    return;
  }
  if ((ARCHIVE[phone] ?? []).some((r) => r.no === no)) return;
  throw new Error(`[customerInsight] ${where} 引用了既不在工单库、也不在本客户履历里的单号：${no}`);
}

Object.entries(CONTACTS).forEach(([phone, rows]) => {
  rows.forEach((r) => {
    if (r.ticketNo) assertTicketBelongsTo(phone, r.ticketNo, `联系记录 ${r.id}`);
  });
});
Object.entries(SURVEYS).forEach(([phone, rows]) => {
  rows.forEach((r) => assertTicketBelongsTo(phone, r.ticketNo, `满意度评价（${r.sentAt}）`));
});
Object.entries(AFTERSALES).forEach(([phone, rows]) => {
  rows.forEach((r) => {
    if (r.fromTicketNo) assertTicketBelongsTo(phone, r.fromTicketNo, `售后单 ${r.no} 的来源客服单`);
  });
});

// ---- 工单库 → 客户履历行 ----

/** 终态口径与工单库一致：SLA 钟为「—」即无活跃钟 */
function isClosedTicket(t: Ticket): boolean {
  return t.slaText === '—' || !!t.archived;
}

function toneOf(t: Ticket): TicketTone {
  if (isClosedTicket(t)) return 'closed';
  if (t.nodeStatus === '已挂起') return 'suspended';
  if (t.nodeStatus === '未认领') return 'pending';
  return 'processing';
}

/**
 * 履历行的状态取**页面展示名称**（基线 §1 第三列：履历属"用户读到的文案"那一档），
 * 落库值仍是工单的 nodeStatus，两者由 ticketStatusDisplayName 收口、不各拼一份。
 *
 * 「已归档」不写进状态位：它不是状态，是与状态正交的另一个维度（行尾已另有「已归档」标记），
 * 拿它顶掉状态位等于让归档单看不出自己是怎么结束的。
 *
 * 少数已办单的 SLA 钟已停、nodeStatus 却还停在在办态（工单数据源的已知问题），
 * 这里按它做过的动作折算到基线终态子状态，而不是把在办态照抄出来。
 */
function statusTextOf(t: Ticket): string {
  if (!isClosedTicket(t) || isTicketClosed(t.nodeStatus)) return ticketStatusDisplayName(t);
  const status = resolveStoppedClockStatus(t);
  return statusDisplayName(status, {
    transferredToType: t.transferredToType,
    externalAppeal: t.ticketSource === '外投渠道',
  });
}

function complaintPlatformOf(t: Ticket): string | undefined {
  const m = /投诉平台：([^｜|]+)/.exec(t.problemDesc ?? '');
  return m ? m[1].trim() : undefined;
}

function fromTicket(t: Ticket): CustomerTicketRow {
  const closed = isClosedTicket(t);
  return {
    id: t.id,
    no: t.no,
    title: t.title,
    type: t.type,
    priority: t.priority,
    statusText: statusTextOf(t),
    tone: toneOf(t),
    channel: t.ticketSource || t.channel,
    product: t.product,
    createdAt: t.createdAt ?? t.updatedAt ?? '',
    closedAt: closed ? t.updatedAt : undefined,
    assignee: t.assignee ?? '待领取',
    conclusion: t.latestHandling || t.problemDesc,
    source: '客服',
    breached: t.solveBreached || t.firstRespBreached,
    isComplaint: t.type === '投诉',
    isProcessing: !closed,
    isClosed: closed,
    escalatedFromNo: t.escalatedFromNo,
    escalatedToNo: t.escalatedToNo,
    complaintPlatform: complaintPlatformOf(t),
    live: true,
  };
}

/** 'YYYY-MM-DD hh:mm' → 天数差（相对基准日） */
function daysBefore(when: string, base = INSIGHT_TODAY): number {
  const d = new Date(when.slice(0, 10).replace(/-/g, '/'));
  const b = new Date(base.replace(/-/g, '/'));
  return Math.round((b.getTime() - d.getTime()) / 86400000);
}

function sortByCreatedDesc(a: CustomerTicketRow, b: CustomerTicketRow): number {
  return b.createdAt.localeCompare(a.createdAt);
}

// ---- 档案索引 ----

const PROFILE_BY_PHONE = new Map(PROFILES.map((p) => [p.phone, p]));

/** 工单库中出现过的手机号 → 该客户的全部在办/已办单 */
const LIVE_BY_PHONE = new Map<string, Ticket[]>();
TICKETS.forEach((t) => {
  if (!t.customerPhone) return;
  const arr = LIVE_BY_PHONE.get(t.customerPhone);
  if (arr) arr.push(t);
  else LIVE_BY_PHONE.set(t.customerPhone, [t]);
});

const ROLE_FROM_TAG: CustomerRole[] = ['记者', '老师', '校长', '自媒体'];

/** 未建档客户：按其工单聚合出基础档案（角色取工单上的客户身份标签） */
function fallbackProfile(phone: string, live: Ticket[]): CustomerProfile {
  const first = live[0];
  const tagRole = live.flatMap((t) => t.customerTags ?? []).find((t) => ROLE_FROM_TAG.includes(t as CustomerRole));
  const purchases: CustomerPurchase[] = [];
  live.forEach((t) => {
    if (purchases.some((d) => d.name === t.product)) return;
    purchases.push({ name: t.product, sn: t.sn, boughtAt: '—', warranty: '—', inWarranty: true });
  });
  return {
    id: `C-${phone.slice(-4)}`,
    name: first?.customer ?? '未知客户',
    role: (tagRole as CustomerRole) ?? '个人客户',
    tags: [],
    phone,
    contacts: [{ kind: '手机', value: phone, primary: true }],
    region: '—',
    address: '—',
    firstSeen: live.map((t) => t.createdAt ?? '').filter(Boolean).sort()[0]?.slice(0, 10) ?? '—',
    purchases,
  };
}

function riskFlagsOf(profile: CustomerProfile, rows: CustomerTicketRow[], metrics: CustomerMetrics): string[] {
  const flags: string[] = [];
  const recentComplaint = rows.filter((r) => r.isComplaint && daysBefore(r.createdAt) <= 90).length;
  if (rows.some((r) => r.complaintPlatform)) flags.push('已发生外部监管投诉，对客口径需经班组长确认');
  if (recentComplaint >= 2) flags.push(`近 90 天 ${recentComplaint} 次投诉，存在升级风险`);
  if (metrics.recent30 >= 2) flags.push(`近 30 天 ${metrics.recent30} 次来单，属重复联系客户`);
  if (metrics.breached > 0) flags.push(`历史 ${metrics.breached} 单时效未达标，慎作时间承诺`);
  if (metrics.avgSatisfaction !== null && metrics.avgSatisfaction < 3.5) flags.push(`平均满意度 ${metrics.avgSatisfaction.toFixed(1)} 分，低于健康线`);
  if (profile.role === '记者' || profile.role === '自媒体') {
    flags.push(`客户角色为${profile.role}，涉舆情风险，回复留痕`);
  }
  const repeatProduct = new Map<string, number>();
  rows.forEach((r) => repeatProduct.set(r.product, (repeatProduct.get(r.product) ?? 0) + 1));
  const worst = [...repeatProduct.entries()].sort((a, b) => b[1] - a[1])[0];
  if (worst && worst[1] >= 3) flags.push(`同一产品「${worst[0]}」累计 ${worst[1]} 单，建议核查是否批次问题`);
  return flags;
}

/** 组装某手机号的客户全景；号码在工单库与档案中均不存在时返回 null */
export function buildCustomerInsight(phone: string): CustomerInsight | null {
  const live = LIVE_BY_PHONE.get(phone) ?? [];
  const profile = PROFILE_BY_PHONE.get(phone) ?? (live.length ? fallbackProfile(phone, live) : null);
  if (!profile) return null;

  const archive: CustomerTicketRow[] = (ARCHIVE[phone] ?? []).map((t) => ({ ...t, live: false }));
  const tickets = [...live.map(fromTicket), ...archive].sort(sortByCreatedDesc);
  const surveys = SURVEYS[phone] ?? [];
  const aftersales = AFTERSALES[phone] ?? [];

  const scored = surveys.filter((s) => s.evaluated && typeof s.score === 'number');
  const metrics: CustomerMetrics = {
    total: tickets.length,
    complaint: tickets.filter((t) => t.isComplaint).length,
    // 按「升级次数」计：一条升级链（原单→新单）算一次，取发起端
    escalated: tickets.filter((t) => t.escalatedToNo).length,
    avgSatisfaction: scored.length
      ? Math.round((scored.reduce((s, r) => s + (r.score ?? 0), 0) / scored.length) * 10) / 10
      : null,
    recent30: tickets.filter((t) => t.createdAt && daysBefore(t.createdAt) <= 30).length,
    breached: tickets.filter((t) => t.breached).length,
    aftersale: aftersales.length,
  };

  const contacts = CONTACTS[phone] ?? [];
  return {
    profile,
    metrics,
    riskFlags: riskFlagsOf(profile, tickets, metrics),
    tickets,
    contacts,
    aftersales,
    surveys,
  };
}

// ---- 搜索：手机号 / 工单号 / SN / 客户姓名 ----

export type QueryKind = 'phone' | 'ticket' | 'sn' | 'name';

export interface CustomerCandidate {
  phone: string;
  name: string;
  role: CustomerRole;
  tags: string[];
  ticketCount: number;
  lastAt: string;
  /** 命中原因，如「工单 LCMN-… 的报单人」 */
  reason: string;
}

export interface CustomerSearchResult {
  kind: QueryKind;
  candidates: CustomerCandidate[];
  /** 按工单号查询时，需在结果页高亮的工单 */
  highlightTicketNo?: string;
}

export function detectQueryKind(raw: string): QueryKind {
  const q = raw.trim();
  if (/^1[3-9]\d{9}$/.test(q)) return 'phone';
  // 工单号全称、或 4 位以上纯数字（坐席常只报单号尾段）
  if (/^(LCMN|AS)-/i.test(q) || /^\d{4,}$/.test(q)) return 'ticket';
  if (/^SN-/i.test(q)) return 'sn';
  return 'name';
}

/** 全部可查客户的手机号（档案 + 工单库） */
function allPhones(): string[] {
  return [...new Set([...PROFILE_BY_PHONE.keys(), ...LIVE_BY_PHONE.keys()])];
}

function toCandidate(phone: string, reason: string): CustomerCandidate | null {
  const insight = buildCustomerInsight(phone);
  if (!insight) return null;
  return {
    phone,
    name: insight.profile.name,
    role: insight.profile.role,
    tags: insight.profile.tags,
    ticketCount: insight.metrics.total,
    lastAt: insight.tickets[0]?.createdAt?.slice(0, 10) ?? '—',
    reason,
  };
}

/** 按工单号反查报单客户（含仅存于客户履历的历史单与售后单） */
function phoneByTicketNo(no: string): { phone: string; matchedNo: string } | null {
  const key = no.trim().toUpperCase();
  const live = TICKETS.find((t) => t.no.toUpperCase() === key || t.no.endsWith(key));
  if (live?.customerPhone) return { phone: live.customerPhone, matchedNo: live.no };
  for (const [phone, rows] of Object.entries(ARCHIVE)) {
    const hit = rows.find((r) => r.no.toUpperCase() === key || r.no.endsWith(key));
    if (hit) return { phone, matchedNo: hit.no };
  }
  for (const [phone, rows] of Object.entries(AFTERSALES)) {
    const hit = rows.find((r) => r.no.toUpperCase() === key);
    if (hit) return { phone, matchedNo: hit.no };
  }
  return null;
}

export function searchCustomers(raw: string): CustomerSearchResult {
  const q = raw.trim();
  const kind = detectQueryKind(q);

  if (kind === 'phone') {
    const c = toCandidate(q, '手机号精确匹配');
    return { kind, candidates: c ? [c] : [] };
  }

  if (kind === 'ticket') {
    const hit = phoneByTicketNo(q);
    if (!hit) return { kind, candidates: [] };
    const c = toCandidate(hit.phone, `工单 ${hit.matchedNo} 的报单客户`);
    return { kind, candidates: c ? [c] : [], highlightTicketNo: hit.matchedNo };
  }

  if (kind === 'sn') {
    const key = q.toUpperCase();
    const out: CustomerCandidate[] = [];
    allPhones().forEach((phone) => {
      const insight = buildCustomerInsight(phone);
      const device = insight?.profile.purchases.find((d) => d.sn?.toUpperCase().includes(key));
      const ticket = LIVE_BY_PHONE.get(phone)?.find((t) => t.sn?.toUpperCase().includes(key));
      if (device || ticket) {
        const c = toCandidate(phone, `设备 ${device?.sn ?? ticket?.sn} 的登记客户`);
        if (c) out.push(c);
      }
    });
    return { kind, candidates: out };
  }

  const out: CustomerCandidate[] = [];
  allPhones().forEach((phone) => {
    const insight = buildCustomerInsight(phone);
    if (insight && insight.profile.name.includes(q)) {
      const c = toCandidate(phone, '客户姓名匹配');
      if (c) out.push(c);
    }
  });
  return { kind, candidates: out.sort((a, b) => b.ticketCount - a.ticketCount) };
}

/** 最近查询过的客户（页面空态时给二线一个起点：近 30 天有单且履历较重的客户） */
export function suggestedCustomers(limit = 6): CustomerCandidate[] {
  return allPhones()
    .map((phone) => toCandidate(phone, ''))
    .filter((c): c is CustomerCandidate => !!c)
    .sort((a, b) => b.ticketCount - a.ticketCount || b.lastAt.localeCompare(a.lastAt))
    .slice(0, limit);
}

/** 交互稿可搜示例（Mock 库内真实数据） */
export const DEMO_SEARCH_HINTS = [
  { label: '张小凡', query: '13800138001', tip: '手机号 · 完整档案' },
  { label: '赵敏', query: '13788889999', tip: '手机号 · 校长/企业客户' },
  { label: '吴强', query: '13700003333', tip: '手机号 · 外投投诉史' },
  { label: '李大海', query: '13912345678', tip: '手机号' },
  { label: '陈翻译', query: '13500001234', tip: '手机号 · 飞书同步演示' },
  { label: '工单号', query: 'LCMN-20260610-73026', tip: '张小凡的投诉单' },
  { label: 'SN', query: 'SN-T10-260713', tip: '陈翻译 · 翻译机' },
] as const;

// 可搜示例必须真的搜得到 —— 演示第一步就落空态，比没有示例更糟
DEMO_SEARCH_HINTS.forEach((h) => {
  if (!searchCustomers(h.query).candidates.length) {
    throw new Error(`[customerInsight] 可搜示例「${h.label}」查不到任何客户：${h.query}`);
  }
});

export const QUERY_KIND_LABEL: Record<QueryKind, string> = {
  phone: '手机号',
  ticket: '工单号',
  sn: '设备 SN',
  name: '客户姓名',
};
