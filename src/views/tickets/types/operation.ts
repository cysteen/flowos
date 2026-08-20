/** 工单操作页 · 处理 Tab 与侧栏展示类型 */

import type { RoleKey } from '@/config/roles';

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
  /** 投诉分类：**成对多组**——一类+二类为一组，一次投诉可命中多个问题（与升级弹窗同结构）。 */
  categories: { cat1: string; cat2: string }[];
  /** 投诉类型：建单页独立可选字段（服务投诉/产品质量/物流问题/其他） */
  complaintType: string;
  /**
   * 投诉渠道记录：**一平台一组三项**——平台 + 投诉编号 + 投诉内容（830 由两项扩为三项）。
   * 建单时填，也可由「新建补充 · 补充投诉信息」追加（只追加、不覆盖）。
   */
  platforms: {
    platform: string;
    customPlatform?: string;
    complaintNo: string;
    /** 该平台上的投诉内容（830 新增） */
    complaintContent?: string;
    /** 由补充追加进来的标记：明细里可标「补充追加」，便于区分建单时填的 */
    fromSupplement?: boolean;
  }[];
  /** 投诉接收时间（非必填） */
  receivedAt: string;
  priorFeedback: string;
  /** 服务回溯：自由文本，篇幅可能较长 */
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
  /** 已取消（保留记录、不再计入待回访） */
  cancelled?: boolean;
  /** 预约人（入口前移后，需记录发起预约的坐席/人员） */
  booker?: string;
  /** 预约需求（枚举：预约联系用户 / 联系后端确认） */
  demand?: string;
  /** 草稿态：点「添加预约」后未点「保留」 */
  draft?: boolean;
}

/** 已保留（正式落盘）且未取消的预约 */
export function isCommittedAppointment(r: AppointmentRecord): boolean {
  return !r.draft && !r.cancelled;
}

/** 是否存在有效预约（已保留且未全部取消） */
export function deriveAppointmentNeeded(records: AppointmentRecord[]): boolean {
  return records.some(isCommittedAppointment);
}

/** 预约 chip / Tab 是否已填齐（有效预约均含时间与需求） */
export function isAppointmentFilled(records: AppointmentRecord[]): boolean {
  return records.some(
    (r) => isCommittedAppointment(r) && !!r.scheduledAt?.trim() && !!r.demand?.trim(),
  );
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
  /** 投诉分类一 */
  complaintCat1: string;
  /** 投诉分类二 */
  complaintCat2: string;
  /** 投诉分类三 */
  complaintCat3: string;
  /** 投诉标记（有效/无效/未证实/暂缓；市场监管平台另含有责/无责等） */
  complaintMark: string;
  complaintNote: string;
  complaintNoteAttachments: string[];
  /**
   * 投诉渠道跟进 · 各平台的回复结果（与建单 platforms 一一对应）。
   * 内投渠道（公司前台/官网监督举报等）与外投渠道（12315/黑猫等）均在此维护。
   */
  platformFollowups: {
    platform: string;
    complaintNo?: string;
    replyResult: string;
    reconcile: '' | '是' | '否';
  }[];
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

/**
 * Tab × 角色：取值为「无」的格子 —— 该角色**整个 Tab 不渲染**。
 *
 * 取自《用户角色与权限矩阵 · 运行工作区》#41–51 的九列取值，通篇只有 6 格是「无」：
 * - **技术支持处理**：② ③ 二线技术顾问（不接手技术侧处理）、⑥ 投诉处理角色、⑦ 运营监控岗
 * - **风险监控**：① 一线坐席（该 Tab 不在它的页面上）
 * - **预约**：① 一线坐席、④ 三线技术支持（预约是对客动作，三线不接触客户；
 *   读权亦不给 —— 本 Tab 对三线无业务意义，暂行「无」，待裁决）
 *
 * 其余格子是「只读」或「可用 / 条件可用」，**Tab 都可见** —— 本表只管"看不看得到"，
 * "能不能改"由 tabWritableFor（逐 Tab 逐角色）与 tabsReadonly（整区一档）共同决定。
 *
 * **产研反馈**（`feishu`）在矩阵协同信息区没有单独一行，矩阵在 #41 的门控说明里给了口径：
 * 「取值随行 56『同步飞书』」。该行的「无」是 ① 一线、④ 三线、⑦ 运营监控岗、⑧ 质检/抄送，
 * 故按此落 deny（⑧ 尚无 RoleKey，落不到代码里）。
 */
const TAB_ROLE_DENY: Partial<Record<ProcessTabKey, string[]>> = {
  feishu: ['agent-l1', 'tech-support', 'ops-monitor'],
  tech: ['agent-cs', 'agent-as', 'complaint-handler', 'ops-monitor'],
  risk: ['agent-l1'],
  appointment: ['agent-l1', 'tech-support'],
};

/**
 * 按工单类型 **+ 当前角色**过滤可见处理 Tab（商机/建议精简，仅保留通用 Tab）。
 * 「产研反馈」Tab：关联中 / 关联失败 / 已回进展 / 已结案时出现。
 *
 * `roleKey` 是**必需参数**，故意不做可选 —— 可选的话调用方忘了传就等于全 Tab 放行，
 * 而这个函数此前正是全文不读角色，11 个 Tab 对所有角色一视同仁（2026-08-20 补角色维度）。
 *
 * 「产研反馈」是第 12 个 Tab，矩阵协同信息区只单列了 11 行，它的取值随「同步飞书」行 —— 见
 * TAB_ROLE_DENY 上方说明。**角色黑名单先判、feishuActive 后判**：反过来写的话 feishu 会在
 * 角色检查之前就 return，deny 永远命不中。
 */
export function visibleProcessTabs(
  ticketType: string,
  roleKey: string,
  opts?: { feishuActive?: boolean },
) {
  return PROCESS_TABS.filter((t) => {
    const deny = TAB_ROLE_DENY[t.key];
    if (deny && deny.includes(roleKey)) return false;
    if (t.key === 'feishu') return !!opts?.feishuActive;
    const allow = TAB_TYPE_RESTRICTION[t.key];
    return !allow || allow.includes(ticketType);
  });
}

/**
 * 矩阵「⑨ 管理员」一列对应的三个角色 —— 矩阵按业务把三者并成一列，代码里是三个 RoleKey。
 * 下方判据表凡出现 ⑨ 的格子都展开成这三个。
 */
const MATRIX_ADMIN_ROLES: readonly RoleKey[] = ['system-admin', 'ops-admin', 'tenant-admin'];

/**
 * Tab × 角色：**该 Tab 内可写**的角色白名单（矩阵取值为「可用」的格子）。
 *
 * 取自《用户角色与权限矩阵 · 运行工作区》协同信息区 11 行（#41–51）的九列取值。
 * 三档取值在这里的落法：
 * - **可用** → 进白名单，Tab 内的写动作放出；
 * - **只读** → 不进白名单，Tab 可见但写动作收掉；
 * - **无** → 也不进白名单，且该 Tab 整个不渲染（另见 TAB_ROLE_DENY）；
 * - **条件可用** → **按不可写处理**，理由见下方「⑥ 投诉处理角色」。
 *
 * 矩阵列 → RoleKey：① agent-l1、② agent-cs、③ agent-as、④ tech-support、⑤ team-leader、
 * ⑥ complaint-handler、⑦ ops-monitor、⑨ MATRIX_ADMIN_ROLES。
 * **⑧ 质检/抄送尚无 RoleKey**，落不到代码里（它在 11 行里全是「只读」，落进来也是空手）。
 *
 * ⚠️ **⑥ 投诉处理角色（complaint-handler）一律不进白名单**。矩阵在 #41 #45 #46 #47 给它
 * 「条件可用」，条件是**已管控**（点过「工单管控」把单拿到自己名下）。但「工单管控」这个功能
 * **全库未落地** —— `writableAfterTakeover` 只在角色定义里声明、零消费方，运行时拿不到"是否已管控"
 * 这个状态，判不出条件成立与否。故此处按**不可写**处理（保守侧：宁可少给，不可未经管控就放开
 * 全中心任意单的写权）。**待「工单管控」落地后**，把管控态接进 tabWritableFor 的入参，
 * 这四个 Tab 对该角色在"已管控"时应转为可写。#43 风险监控给它的是无条件「可用」，已在表内。
 *
 * 全空数组的 5 个 Tab（history / notify / survey / attachments / customerHistory）对应矩阵
 * #44 #48 #49 #50 #51 —— 九格全「只读」，纯读留痕、无写动作，含 ⑨ 管理员也不给写。
 *
 * `feishu`（产研反馈）不在协同信息区 11 行里，矩阵在 #41 门控说明中给了口径「取值随行 56
 * 同步飞书」：该行 ② ③ ⑤ ⑨ 可用、⑥ 条件可用、① ④ ⑦ ⑧ 无，故白名单与预约同形。
 *
 * 用 `Record`（非 `Partial`）是故意的：新增 Tab 忘了给判据会直接编译不过，
 * 不会静悄悄退化成"全角色可写"。
 */
const TAB_ROLE_WRITABLE: Record<ProcessTabKey, readonly RoleKey[]> = {
  // #41 工单处理：① 只读 ② 可用 ③ 可用 ④ 可用 ⑤ 可用 ⑥ 条件可用 ⑦ 只读 ⑧ 只读 ⑨ 可用
  process: ['agent-cs', 'agent-as', 'tech-support', 'team-leader', ...MATRIX_ADMIN_ROLES],
  // 行 56 同步飞书：① 无 ② 可用 ③ 可用 ④ 无 ⑤ 可用 ⑥ 条件可用 ⑦ 无 ⑧ 无 ⑨ 可用
  feishu: ['agent-cs', 'agent-as', 'team-leader', ...MATRIX_ADMIN_ROLES],
  // #42 技术支持处理：① 只读 ② 无 ③ 无 ④ 可用 ⑤ 可用 ⑥ 无 ⑦ 无 ⑧ 只读 ⑨ 可用
  tech: ['tech-support', 'team-leader', ...MATRIX_ADMIN_ROLES],
  // #43 风险监控：① 无 ② 只读 ③ 只读 ④ 只读 ⑤ 只读 ⑥ 可用 ⑦ 可用 ⑧ 只读 ⑨ 可用
  // 写动作＝风险词打标；矩阵原话「⑦『只读』约束的是工单内容，打标不受此限」，故 ⑦ 在表内可写。
  risk: ['complaint-handler', 'ops-monitor', ...MATRIX_ADMIN_ROLES],
  // #44 处理履历：九格全「只读」——完整事件时间线，纯读无写动作
  history: [],
  // #45 预约：① 无 ② 可用 ③ 可用 ④ 无 ⑤ 可用 ⑥ 条件可用 ⑦ 只读 ⑧ 只读 ⑨ 可用
  // 写动作＝新增/保留/取消预约、标记已沟通，属对客动作
  appointment: ['agent-cs', 'agent-as', 'team-leader', ...MATRIX_ADMIN_ROLES],
  // #46 关联/补充/催单：① 可用 ② 可用 ③ 可用 ④ 可用 ⑤ 可用 ⑥ 条件可用 ⑦ 只读 ⑧ 只读 ⑨ 可用
  // Tab 内唯一写动作是「已知晓（标记已读）」；催单/补充记录本身任何角色都不可改不可删
  related: ['agent-l1', 'agent-cs', 'agent-as', 'tech-support', 'team-leader', ...MATRIX_ADMIN_ROLES],
  // #47 联系记录：① 只读 ② 可用 ③ 可用 ④ 只读 ⑤ 可用 ⑥ 条件可用 ⑦ 只读 ⑧ 只读 ⑨ 可用
  // 写动作＝「标记已沟通」，属联系客户类，④ 三线不接触客户故只读
  contact: ['agent-cs', 'agent-as', 'team-leader', ...MATRIX_ADMIN_ROLES],
  // #48 通知记录：九格全「只读」——系统发出的通知留痕
  notify: [],
  // #49 调研记录：九格全「只读」——回访调研结果留痕
  survey: [],
  // #50 附件历史：九格全「只读」——查看/下载保留，**上传入口在处理表单区**，不在本 Tab
  attachments: [],
  // #51 客户历史工单：九格全「只读」
  customerHistory: [],
};

/**
 * 当前角色在指定 Tab 内**能不能写**。
 *
 * 与 `visibleProcessTabs` 分工：那个管"看不看得到"（矩阵取值「无」的格子整个不渲染），
 * 这个管"看得到之后能不能改"（矩阵「只读」vs「可用」）。
 *
 * 调用方仍须与整区开关取或/与：`tabsReadonly`（一线视角 / 只读角色整区禁用）是**更强的约束**，
 * 命中时无论本函数返回什么都不可写。
 */
export function tabWritableFor(tabKey: ProcessTabKey, roleKey: RoleKey): boolean {
  return TAB_ROLE_WRITABLE[tabKey].includes(roleKey);
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
  '免费维修',
  '折扣维修',
  '礼品赠送',
  '权益赠送',
  '免费换新',
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
