/** 工单操作页 · 处理 Tab 与侧栏展示类型 */

export interface ContactItem {
  type: 'phone' | 'email';
  value: string;
}

export interface AgentInfo {
  name: string;
  relation: string;
  contacts: ContactItem[];
}

export interface ComplaintInfo {
  /** 投诉一类 */
  cat1: string;
  /** 投诉二类（投诉性质由此推导） */
  cat2: string;
  /** 投诉性质：业务投诉 / 服务投诉 / 人员投诉，由 cat2 推导，不单独选 */
  complaintType: string;
  platform: string;
  complaintNo: string;
  tags: string[];
  priorFeedback: string;
  serviceReview: string;
}

/** 顶部速览带 · AI 对客户与工单的联合洞察 */
export interface AiTicketInsight {
  customerBrief: string;
  ticketBrief: string;
  suggestion: string;
  /** 风险提示标签，无则省略 */
  riskTag?: string;
}

export interface InsightStats {
  contactCount: number;
  historyCount: number;
  complaintCount: number;
  /** 该客户「与当前工单同类型」的工单数（投诉单看投诉数、咨询单看咨询数…） */
  sameTypeCount: number;
  recent30Count: number;
  dunningCount: number;
  supplementCount: number;
  /** 催单 / 补充 已读条数（坐席已查看） */
  dunningReadCount?: number;
  supplementReadCount?: number;
  relatedCount: number;
}

/** 统计宫格「弹窗下钻」明细表（客户维度：联系/历史/投诉/近30天） */
export interface InsightDetailTable {
  title: string;
  columns: string[];
  /** 每行单元格，与 columns 对齐；ticketNo 存在时编号列渲染为可点链接 */
  rows: { cells: string[]; ticketNo?: string }[];
}

/** 走弹窗下钻的统计项 key（其余项跳对应 Tab） */
export type InsightModalKey = 'contact' | 'history' | 'complaint' | 'recent30';

/** 顶部「最新处理」聚合留言（多处理人，最新在前） */
export interface LatestHandlingItem {
  who: string;
  role: string;
  when: string;
  text: string;
  /** 运行态来源：处理表单 / 技术支持表单回写，用于 upsert，不污染历史记录 */
  source?: 'process' | 'tech';
}

/** 统计宫格点击后的下钻动作：弹窗看明细 或 跳对应处理 Tab */
export type InsightAction =
  | { kind: 'modal'; modalKey: InsightModalKey }
  | { kind: 'tab'; tab: 'related' | 'customerHistory' };

/** 预约回访 · 单条记录（日期 + 时分秒） */
export interface AppointmentRecord {
  id: string;
  scheduledAt: string;
  /** 已完成（已与客户电话沟通） */
  done?: boolean;
  /** 预约人（入口前移后，需记录发起预约的坐席/人员） */
  booker?: string;
  /** 预约需求（枚举：预约联系用户 / 联系后端确认） */
  demand?: string;
}

/** 预约需求枚举 */
export const APPOINTMENT_DEMAND_OPTIONS = [
  '预约联系用户',
  '联系后端确认',
] as const;

export interface ProcessFormDraft {
  problemCause: string;
  processResult: string;
  problemCauseAttachments: string[];
  processResultAttachments: string[];
  serviceMethod: string;
  serviceType: string;
  /** 问题解决结论（独立枚举，不随服务类型/方式级联） */
  conclusion: string;
  /** 解决方案（结论=已解决：服务方案解决 时必选） */
  serviceSolution: string;
  /** @deprecated 历史字段，新结论枚举不再使用 */
  concessionPlan: string;
  /** 投诉一类 */
  complaintCat1: string;
  /** 投诉二类（投诉性质由此推导，见 resolveComplaintNature；分类树只有两级） */
  complaintCat2: string;
  /** 投诉标记（有效/无效/未证实/暂缓；市场监管平台另含有责/无责等） */
  complaintMark: string;
  complaintNote: string;
  complaintNoteAttachments: string[];
  /** 外投分支 · 平台回复结果（自定义） */
  platformReplyResult: string;
  /** 外投分支 · 平台和解 */
  platformReconcile: '' | '是' | '否';
  riskFlag: string;
  /** @deprecated 兼容旧逻辑；以 riskFlag === '有风险' 为准 */
  riskHasRisk: boolean;
  riskLevel: string;
  riskDescription: string;
  riskDescriptionAttachments: string[];
  appointmentNeeded: boolean;
  /** 预约回访记录（每条一个预约时间点） */
  appointmentRecords: AppointmentRecord[];
  qualityIsStandard: boolean;
  /** 不规范原因（一级） */
  qualityIssueCat1: string;
  /** 不规范分类（联动原因） */
  qualityIssueCat2: string;
  /** 建议专属 · 是否采纳（建议服务结论；默认否，无下级字段） */
  suggestAccepted: boolean;
  /** 商机专属 · 商机解决结论 */
  leadStage: 'resolved' | 'unresolvedRejected' | 'noContact' | 'invalid' | 'toSales';
  /** 商机编号（CRM 商机单号） */
  leadNo: string;
}

/** 处理表单可折叠区块 key（含各工单类型专属区） */
export type SectionKey =
  | 'record'
  | 'service'
  | 'supplement'
  | 'external'
  | 'quality'
  | 'suggest'
  | 'lead'
  | 'appointment';

export const PROCESS_TABS = [
  { key: 'process', label: '工单处理' },
  { key: 'feishu', label: '产研反馈' },
  { key: 'tech', label: '技术支持处理' },
  { key: 'risk', label: '风险监控' },
  { key: 'history', label: '处理履历' },
  { key: 'appointment', label: '预约' },
  { key: 'related', label: '关联/补充/催单' },
  { key: 'contact', label: '联系记录' },
  { key: 'notify', label: '通知记录' },
  { key: 'survey', label: '调研记录' },
  { key: 'attachments', label: '附件历史' },
  { key: 'customerHistory', label: '客户历史工单' },
] as const;

export type ProcessTabKey = (typeof PROCESS_TABS)[number]['key'];

/** 各 Tab 的适用工单类型白名单；未列出的 Tab = 所有类型可见。 */
const TAB_TYPE_RESTRICTION: Partial<Record<ProcessTabKey, string[]>> = {
  tech: ['投诉', '咨询'],
  risk: ['投诉'],
  // 调研记录：四类型均保留（拍板 2026-06-20），不设类型限制
};

/** 按工单类型过滤可见处理 Tab（商机/建议精简，仅保留通用 Tab）。
 *  「产研反馈」Tab：关联中 / 关联失败 / 已回进展 / 已结案时出现。 */
export function visibleProcessTabs(ticketType: string, opts?: { feishuActive?: boolean }) {
  return PROCESS_TABS.filter((t) => {
    if (t.key === 'feishu') return !!opts?.feishuActive;
    const allow = TAB_TYPE_RESTRICTION[t.key];
    return !allow || allow.includes(ticketType);
  });
}

export type SupplementChip = 'complaint' | 'risk' | 'appointment' | 'quality' | 'external';

/** 建单不规范 · 不规范原因（一级） */
export const QUALITY_ISSUE_L1_OPTIONS = [
  '标签类型选择有误',
  '建单信息有误',
  '建单要素不完整',
  '未按已知流程和知识处理',
  '重复建单',
  '关联工单建单问题',
] as const;

/** 建单不规范 · 不规范分类（按原因联动） */
export const QUALITY_ISSUE_L2_MAP: Record<string, string[]> = {
  标签类型选择有误: [
    '优先级勾选有误',
    '呼入类型勾选有误',
    '投诉标签勾选有误',
    '产品名称勾选有误',
    '问题分类勾选有误',
  ],
  建单信息有误: ['用户信息有误', '问题描述有误', '预处理描述不清晰'],
  建单要素不完整: ['必要建单信息不完整', '附件信息提供不完整'],
  未按已知流程和知识处理: ['预处理不足', '预处理错误', '已知方案场景拦截不足'],
  重复建单: ['重复建单'],
  关联工单建单问题: ['非关联场景建关联', '关联单场景未建关联'],
};

/** 全部不规范分类（未选原因时展示） */
export const QUALITY_ISSUE_L2_ALL_OPTIONS = Object.values(QUALITY_ISSUE_L2_MAP).flat();

/** 不规范分类 → 不规范原因（反向联动） */
export const QUALITY_ISSUE_L2_TO_L1: Record<string, string> = Object.fromEntries(
  Object.entries(QUALITY_ISSUE_L2_MAP).flatMap(([l1, l2s]) => l2s.map((l2) => [l2, l1])),
);

/** 服务类型（先选，驱动服务方式级联） */
export const SERVICE_TYPE_OPTIONS = [
  '商务合作',
  '软件问题/其他',
  '退费处理',
  '硬件维修/退换货',
] as const;

/** 服务方式（随服务类型级联过滤） */
export const SERVICE_TYPE_TO_METHODS: Record<string, readonly string[]> = {
  商务合作: ['与需求人建立联系'],
  '软件问题/其他': [
    '处理人直接解决',
    '再次流转及后台处理',
    '需产研侧升级修复',
    '上门处理',
  ],
  退费处理: ['首响人直接办理退费', '审核退费', '渠道/第三方退费'],
  '硬件维修/退换货': ['业务线/电商/门店售后'],
};

/** 问题解决结论（独立平铺，不级联） */
export const RESOLUTION_CONCLUSION_OPTIONS = [
  '已解决：技术方案解决',
  '已解决：服务方案解决',
  '已解决：处理人解决',
  '未解决：已给方案，用户未操作/未验证',
  '未解决：有方案，用户对方案不认可',
  '未解决：联系不上用户',
  '未解决：无解决方案',
  '无效商机',
  '转销售渠道处理',
  '转售后网点处理',
  '需求待评估（仅学习机使用）',
] as const;

/** 触发「解决方案」枚举的结论 */
export const SERVICE_SOLUTION_CONCLUSION = '已解决：服务方案解决';

/** 解决方案（服务方案解决时） */
export const SERVICE_SOLUTION_OPTIONS = [
  '代金券',
  '优惠券',
  '积分补偿',
  '赠品',
  '部分退款',
  '全额退款',
  '会员延期',
  '换货/换新',
  '维修减免',
  '其他',
] as const;

/** 商机解决结论 */
export const LEAD_STAGE_OPTIONS: { label: string; value: ProcessFormDraft['leadStage'] }[] = [
  { label: '已解决：处理人解决', value: 'resolved' },
  { label: '未解决：有方案，用户对方案不认可', value: 'unresolvedRejected' },
  { label: '未解决：联系不上用户', value: 'noContact' },
  { label: '无效商机', value: 'invalid' },
  { label: '转销售渠道处理', value: 'toSales' },
];

/** 投诉标记 · 常驻选项 */
export const COMPLAINT_MARK_BASE_OPTIONS = [
  '有效投诉',
  '无效投诉',
  '未证实投诉',
  '暂缓判定',
] as const;

/** 投诉标记 · 仅市场监管 12345/12315 平台可见 */
export const COMPLAINT_MARK_REGULATOR_OPTIONS = [
  '有责投诉',
  '无责投诉',
  '无责可改善投诉',
] as const;

/** 可展示「有责/无责」类投诉标记的平台 */
export const REGULATOR_COMPLAINT_PLATFORMS = [
  '市场监管12345平台',
  '市场监管12315平台',
] as const;

export function isRegulatorComplaintPlatform(platform?: string): boolean {
  if (!platform) return false;
  return (REGULATOR_COMPLAINT_PLATFORMS as readonly string[]).includes(platform)
    || platform === '12345'
    || platform === '12315';
}

export function complaintMarkOptions(platform?: string): string[] {
  const base = [...COMPLAINT_MARK_BASE_OPTIONS];
  if (isRegulatorComplaintPlatform(platform)) {
    return [...base, ...COMPLAINT_MARK_REGULATOR_OPTIONS];
  }
  return base;
}

/** 风险标记（投诉 · 风险管理）：有风险才需选风险等级；顺序由轻到重 */
export const RISK_FLAG_OPTIONS = ['无风险', '疑似风险', '有风险'] as const;
export type RiskFlag = (typeof RISK_FLAG_OPTIONS)[number];

/** 风险等级（仅「有风险」可选） */
export const RISK_LEVEL_OPTIONS = ['低风险', '中风险', '高风险'] as const;

/** 客户全景宫格：与当前工单类型对齐的统计标签（投诉/建议/商机/咨询 → ××单） */
const SAME_TYPE_STAT_LABEL: Record<string, string> = {
  投诉: '投诉单',
  建议: '建议单',
  商机: '商机单',
  咨询: '咨询单',
};

export function insightSameTypeLabel(ticketType: string): string {
  return SAME_TYPE_STAT_LABEL[ticketType] ?? `${ticketType}单`;
}
