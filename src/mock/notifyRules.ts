// 【815】工单消息通知 · 事件目录 + 通知规则
//
// 设计依据（竞品调研结论，2026-07-28）：
//   · ServiceNow —— 事件注册表(sysevent_register) + 通知记录(Send when / Who will receive / What it contains)
//   · Salesforce —— 收件人配「类型」不配自由表达式；Role and Subordinates 覆盖上级链
//   · Jira 教训  —— 不做两套能发消息的机制（Notification Scheme + Automation 会重复发）
//   · Zendesk 教训 —— 规则式一旦有执行顺序就会产生隐性依赖；本模块规则互相独立、无顺序
//
// 一条规则 = 一个事件 + 条件 + 收件人 + 【多个通道，每个通道各一份内容】。
// 通道与内容一对一，但内容来源分两类：
//   · 模板通道（IM / 短信）—— 引用消息中心的模板库，规则里只选不改。
//     短信要运营商报备、IM 模板带审核状态，都必须集中管理。
//   · 编辑器通道（邮件 / 站内信）—— 无模板库，正文直接写在规则里（邮件另有主题）。
//
// 边界：SLA 的临期 / 超时 / 超时升级通知【不在本模块】，由 SLA 引擎自带的
// 「SLA 管理 · 预警与升级」配置（口径见交叉对照表 D1）。本模块不订阅 sla.* 事件。
//
// 模型：事件目录（代码维护，发版新增）+ 通知规则（纯配置，业务自助）
//   业务新增消息场景时：事件已存在 → 新建一条规则，零代码；事件不存在 → 只补一行埋点。

/* ============================ 事件目录 ============================ */

export type EventSource = 'dispatch' | 'non-dispatch' | 'approval' | 'timer';

/**
 * 负载字段的数据类型。决定三件事：
 *   ① 条件运算符的可选项（datetime/number 才有「早于/晚于」）；
 *   ② 条件取值的输入方式（enum 给下拉，避免「内投」被手打成「內投」）；
 *   ③ 能否作收件人来源（仅 userId / userId[] / phone 可以）。
 */
export type FieldType =
  | 'string' | 'number' | 'datetime' | 'boolean' | 'enum'
  | 'userId' | 'userId[]' | 'phone';

export interface EventField {
  key: string;
  label: string;
  /** 数据类型；缺省视为 string */
  type?: FieldType;
  /** type=enum 时的取值域，供条件配置渲染下拉 */
  enumValues?: readonly string[];
  /** 该字段可作为收件人来源（仅 userId / userId[] / phone） */
  isRecipient?: boolean;
}

/* ---- 枚举字典：与项目既有字典同源，改一处即全局生效 ---- */
/** 工单类型（含表扬，表扬不建单但用于抑制判定） */
export const DICT_TICKET_TYPE = ['投诉', '建议', '商机', '咨询', '表扬'] as const;
/** 工单来源 */
export const DICT_SOURCE = ['热线电话', 'IM在线', '内投', '外投', '客户服务小程序', '学习机渠道'] as const;
/** 业务分类 */
export const DICT_BIZ_TYPE = ['教育', '听见', '法院', '医疗', '其他', '智能硬件', '无线音乐', '开放平台'] as const;
/** 取消原因（同 views/tickets/types/operationTabs.ts · CANCEL_REASON_OPTIONS） */
export const DICT_CANCEL_REASON = ['客户来电取消', '建单信息错误', '重复建单', '客户问题已自行解决', '其他'] as const;
/** 补充分类（同 operationTabs.ts · SUPPLEMENT_TYPE_OPTIONS） */
export const DICT_SUPPLEMENT_TYPE = ['修改信息', '补充信息', '取消服务', '其他'] as const;
/** 审批事项：共用同一套审批机制的三个动作（动作矩阵 G3） */
export const DICT_APPROVAL_TYPE = ['挂起', '关闭工单', '强结'] as const;
/**
 * 退回来源环节。
 * 按 D16「退回仅有技术支持退回一种」收敛为单值。
 * ⚠ 待确认：`SUBMIT_RISK_FORM(53)` 暗示可能存在「风险监控」退回；若业务确认存在，
 *   在此加值即可，R08 规则的条件无需改动。
 */
export const DICT_RETURN_FROM = ['技术支持'] as const;
/** 预约类型（OpAppointmentTab：上门 / 回访） */
export const DICT_APPT_TYPE = ['上门', '回访'] as const;
/** 关闭原因。⚠ 项目内暂无统一枚举，待业务补齐后替换 */
export const DICT_CLOSE_REASON = ['问题已解决', '客户放弃', '重复工单', '转由其他单跟进', '其他'] as const;

export interface NotifyEvent {
  code: string;
  name: string;
  source: EventSource;
  /** 后端动作枚举码（WoAction），无对应则为空 */
  actionCode?: string;
  /** 事件负载：既是模板可用变量，也是收件人可引用的字段 */
  payload: EventField[];
  remark?: string;
}

/** 所有事件共有的工单基础负载 */
const BASE: EventField[] = [
  { key: 'ticketNo', label: '工单号', type: 'string' },
  { key: 'title', label: '工单标题', type: 'string' },
  { key: 'ticketType', label: '工单类型', type: 'enum', enumValues: DICT_TICKET_TYPE },
  { key: 'source', label: '工单来源', type: 'enum', enumValues: DICT_SOURCE },
  { key: 'bizType', label: '业务分类', type: 'enum', enumValues: DICT_BIZ_TYPE },
  { key: 'customerName', label: '客户名称', type: 'string' },
  { key: 'customerPhone', label: '客户手机号', type: 'phone', isRecipient: true },
  { key: 'assigneeId', label: '当前处理人', type: 'userId', isRecipient: true },
  { key: 'creatorId', label: '创建人', type: 'userId', isRecipient: true },
  { key: 'deepLink', label: '工单直达链接', type: 'string' },
];

export const NOTIFY_EVENTS: NotifyEvent[] = [
  /* ---- 来自后端动作枚举 WoAction（经 dispatch） ---- */
  { code: 'ticket.transfer', name: '调剂', source: 'dispatch', actionCode: 'TRANSFER(10)',
    payload: [...BASE, { key: 'operatorId', label: '操作人', type: 'userId', isRecipient: true }, { key: 'targetUserId', label: '目标处理人', type: 'userId', isRecipient: true }, { key: 'crossGroup', label: '是否跨组', type: 'boolean' }] },
  { code: 'ticket.delegate', name: '委派', source: 'dispatch', actionCode: 'DELEGATE(11)',
    payload: [...BASE, { key: 'delegateeIds', label: '被委派人', type: 'userId[]', isRecipient: true }, { key: 'delegateTask', label: '委派任务说明', type: 'string' }] },
  { code: 'ticket.return', name: '退回', source: 'dispatch', actionCode: 'RETURN(12)',
    payload: [...BASE, { key: 'prevAssigneeId', label: '原处理人', type: 'userId', isRecipient: true }, { key: 'returnFrom', label: '退回来源环节', type: 'enum', enumValues: DICT_RETURN_FROM }, { key: 'returnReason', label: '退回原因', type: 'string' }] },
  { code: 'ticket.withdraw', name: '撤回', source: 'dispatch', actionCode: 'WITHDRAW(13)',
    payload: [...BASE, { key: 'prevAssigneeId', label: '原接收方', type: 'userId', isRecipient: true }] },
  { code: 'ticket.forward', name: '下送', source: 'dispatch', actionCode: 'FORWARD(14)',
    payload: [...BASE, { key: 'isSuggestion', label: '是否建议', type: 'boolean' }],
    remark: '处理完成提交，≠「建单派发」' },
  { code: 'ticket.claim', name: '认领', source: 'dispatch', actionCode: 'CLAIM(15)', payload: [...BASE] },
  { code: 'ticket.escalate', name: '升级', source: 'dispatch', actionCode: 'ESCALATE(20)',
    payload: [...BASE, { key: 'escalateTargetId', label: '升级接收方', type: 'userId', isRecipient: true }],
    remark: '枚举注释含 "or NOTIFY"，与 SLA 自动升级是否共用同一码待确认' },
  { code: 'ticket.syncFeishu', name: '同步飞书', source: 'dispatch', actionCode: 'SYNC_FEISHU(21)',
    payload: [...BASE], remark: '执行方式本身即 NOTIFY，需与《【720】飞书项目集成》对齐' },
  { code: 'ticket.toAftersale', name: '转售后', source: 'dispatch', actionCode: 'TO_AFTERSALE(22)',
    payload: [...BASE, { key: 'aftersaleReceiverId', label: '售后接收人', type: 'userId', isRecipient: true }] },
  { code: 'ticket.escalateComplaint', name: '升级投诉', source: 'dispatch', actionCode: 'ESCALATE_COMPLAINT(23)',
    payload: [...BASE, { key: 'newTicketNo', label: '新建投诉单号', type: 'string' }],
    remark: '前端编排、不经 dispatch，通知需由前端在建单成功后显式触发' },
  { code: 'ticket.suspend', name: '挂起', source: 'dispatch', actionCode: 'SUSPEND(30)',
    payload: [...BASE, { key: 'holdUntil', label: '挂起截止日期', type: 'datetime' }, { key: 'holdReason', label: '挂起原因', type: 'string' }] },
  { code: 'ticket.resume', name: '恢复（手动解挂）', source: 'dispatch', actionCode: 'RESUME(31)',
    payload: [...BASE, { key: 'operatorId', label: '操作人', type: 'userId', isRecipient: true }] },
  { code: 'ticket.resolve', name: '标记已解决', source: 'dispatch', actionCode: 'RESOLVE(40)', payload: [...BASE] },
  { code: 'ticket.close', name: '关闭工单', source: 'dispatch', actionCode: 'CLOSE(41)',
    payload: [...BASE, { key: 'closeReason', label: '关闭原因', type: 'enum', enumValues: DICT_CLOSE_REASON }] },
  { code: 'ticket.forceClose', name: '强结', source: 'dispatch', actionCode: 'FORCE_CLOSE(42)',
    payload: [...BASE, { key: 'prevAssigneeId', label: '原处理人', type: 'userId', isRecipient: true }, { key: 'closeReason', label: '强结原因', type: 'enum', enumValues: DICT_CLOSE_REASON }] },
  { code: 'ticket.archive', name: '归档', source: 'dispatch', actionCode: 'ARCHIVE(43)', payload: [...BASE] },
  { code: 'ticket.cancel', name: '取消', source: 'dispatch', actionCode: 'CANCEL(44)',
    payload: [...BASE, { key: 'cancelReason', label: '取消原因', type: 'enum', enumValues: DICT_CANCEL_REASON }] },
  { code: 'ticket.saveDraft', name: '保存草稿', source: 'dispatch', actionCode: 'SAVE_DRAFT(50)', payload: [...BASE] },
  { code: 'ticket.submitHandleForm', name: '提交处理表单', source: 'dispatch', actionCode: 'SUBMIT_HANDLE_FORM(51)', payload: [...BASE] },
  { code: 'ticket.submitTechForm', name: '提交技术支持表单', source: 'dispatch', actionCode: 'SUBMIT_TECH_FORM(52)',
    payload: [...BASE, { key: 'prevAssigneeId', label: '原处理人', type: 'userId', isRecipient: true }],
    remark: '与 RETURN(12) 的关系待确认：技支提交后是否即退回原处理人' },
  { code: 'ticket.submitRiskForm', name: '提交风险监控表单', source: 'dispatch', actionCode: 'SUBMIT_RISK_FORM(53)',
    payload: [...BASE], remark: '「风险监控」角色在动作矩阵与消息表中均无定义，待补' },

  /* ---- 审批阶段事件（枚举中是动作的阶段，需独立事件） ---- */
  { code: 'approval.submitted', name: '提交审批', source: 'approval',
    payload: [...BASE, { key: 'approverIds', label: '审核人', type: 'userId[]', isRecipient: true }, { key: 'applicantId', label: '申请人', type: 'userId', isRecipient: true }, { key: 'approvalType', label: '审批事项', type: 'enum', enumValues: DICT_APPROVAL_TYPE }] },
  { code: 'approval.approved', name: '审批通过', source: 'approval',
    payload: [...BASE, { key: 'applicantId', label: '申请人', type: 'userId', isRecipient: true }, { key: 'approvalType', label: '审批事项', type: 'enum', enumValues: DICT_APPROVAL_TYPE }] },
  { code: 'approval.rejected', name: '审批驳回', source: 'approval',
    payload: [...BASE, { key: 'applicantId', label: '申请人', type: 'userId', isRecipient: true }, { key: 'approvalType', label: '审批事项', type: 'enum', enumValues: DICT_APPROVAL_TYPE }, { key: 'rejectReason', label: '驳回原因', type: 'string' }] },

  /* ---- 不经 dispatch 的事件（需单独埋点） ---- */
  { code: 'ticket.created', name: '建单', source: 'non-dispatch',
    payload: [...BASE, { key: 'responseDueTime', label: '首响截止时间', type: 'datetime' }],
    remark: '走 createWoForm，不经 dispatch' },
  { code: 'ticket.fromAftersale', name: '售后转入工单', source: 'non-dispatch',
    payload: [...BASE, { key: 'responseDueTime', label: '首响截止时间', type: 'datetime' }],
    remark: '售后互通回传链路，与出向 TO_AFTERSALE(22) 相反' },
  { code: 'ticket.supplement', name: '新建补充', source: 'non-dispatch',
    payload: [...BASE, { key: 'supplementType', label: '补充分类', type: 'enum', enumValues: DICT_SUPPLEMENT_TYPE }, { key: 'supplementContent', label: '补充内容', type: 'string' }],
    remark: 'no flow，需在补充接口成功后显式触发' },
  { code: 'ticket.urge', name: '催单', source: 'non-dispatch',
    payload: [...BASE, { key: 'urgeContent', label: '催单信息', type: 'string' }], remark: 'no flow' },
  { code: 'comment.mentioned', name: '评论区 @', source: 'non-dispatch',
    payload: [...BASE, { key: 'mentionedIds', label: '被@人', type: 'userId[]', isRecipient: true }, { key: 'mentionerId', label: '@ 发起人', type: 'userId', isRecipient: true }, { key: 'commentText', label: '评论内容', type: 'string' }],
    remark: '动作矩阵中无「评论」动作，需回补' },
  { code: 'appointment.created', name: '新增预约', source: 'non-dispatch',
    payload: [...BASE, { key: 'apptTime', label: '预约时间', type: 'datetime' }, { key: 'apptType', label: '预约类型', type: 'enum', enumValues: DICT_APPT_TYPE }] },

  /* ---- 定时事件 ---- */
  { code: 'timer.holdExpiring', name: '挂起即将到期', source: 'timer',
    payload: [...BASE, { key: 'holdUntil', label: '挂起截止日期', type: 'datetime' }, { key: 'daysLeft', label: '剩余天数', type: 'number' }] },
  { code: 'timer.holdExpired', name: '挂起到期', source: 'timer',
    payload: [...BASE, { key: 'holdUntil', label: '挂起截止日期', type: 'datetime' }] },
  { code: 'timer.appointmentDue', name: '预约到期', source: 'timer',
    payload: [...BASE, { key: 'apptTime', label: '预约时间', type: 'datetime' }] },

];

export const EVENT_SOURCE_META: Record<EventSource, { label: string; color: string; desc: string }> = {
  dispatch: { label: '工单动作', color: 'blue', desc: '经 WoActionServiceImpl.dispatch，对应后端动作枚举' },
  'non-dispatch': { label: '独立埋点', color: 'orange', desc: '不经 dispatch，需在各自接口成功后显式触发' },
  approval: { label: '审批阶段', color: 'purple', desc: '审批流的提交/通过/驳回，动作枚举中为动作的阶段' },
  timer: { label: '定时扫描', color: 'gold', desc: '每日 08:00 扫描产生' },
};

/* ============================ 收件人类型 ============================ */

export type RecipientKind = 'field' | 'relation' | 'fixed';

export interface RecipientType {
  code: string;
  name: string;
  kind: RecipientKind;
  /** 依赖事件负载里的哪个字段；该事件没有此字段则不可选 */
  requires?: string;
  /** 关系型：是否需要填层级（上级 N 级） */
  hasLevel?: boolean;
  desc: string;
}

export const RECIPIENT_TYPES: RecipientType[] = [
  { code: 'assignee', name: '处理人', kind: 'field', requires: 'assigneeId', desc: '工单当前处理人' },
  { code: 'prevAssignee', name: '原处理人', kind: 'field', requires: 'prevAssigneeId', desc: '动作发生前的处理人（需快照）' },
  { code: 'creator', name: '创建人', kind: 'field', requires: 'creatorId', desc: '工单建单人' },
  { code: 'approver', name: '审核人', kind: 'field', requires: 'approverIds', desc: '当前审批任务候选人' },
  { code: 'applicant', name: '申请人', kind: 'field', requires: 'applicantId', desc: '审批单发起人' },
  { code: 'delegatee', name: '被委派人', kind: 'field', requires: 'delegateeIds', desc: '委派任务承接人，可多人' },
  { code: 'mentioned', name: '被 @ 人', kind: 'field', requires: 'mentionedIds', desc: '评论中被 @ 的人，可多人' },
  { code: 'targetUser', name: '目标处理人', kind: 'field', requires: 'targetUserId', desc: '调剂/转派的目标人' },
  { code: 'leader', name: '班组长', kind: 'relation', desc: '处理人所属班组的组长' },
  // 能力保留：SLA 超时升级已移交 SLA 引擎，但强结、催单抄送等场景仍可能上溯层级
  { code: 'superior', name: '上级', kind: 'relation', hasLevel: true, desc: '沿组织树上溯 N 级（1=班组长 2=主管 3=二级部门经理）' },
  { code: 'customer', name: '客户', kind: 'field', requires: 'customerPhone', desc: '工单联系人，对客消息专用' },
  { code: 'fixed', name: '指定人员 / 岗位', kind: 'fixed', desc: '固定指派，兜底用' },
];

/* ============================ 通知规则 ============================ */

export type NotifyChannel = 'IM' | '短信' | '邮件' | '站内信';

/** 走模板库的通道：规则里只能选模板，内容去「消息中心」改 */
export const TEMPLATE_CHANNELS: NotifyChannel[] = ['IM', '短信'];
/** 走内联编辑器的通道：正文写在规则里 */
export const EDITOR_CHANNELS: NotifyChannel[] = ['邮件', '站内信'];
export const isTemplateChannel = (c: NotifyChannel) => TEMPLATE_CHANNELS.includes(c);
export type CondOp = 'eq' | 'ne' | 'in' | 'nin' | 'gt' | 'lt';

export interface RuleCondition {
  field: string;
  op: CondOp;
  value: string[];
}

export interface RuleRecipient {
  type: string;
  level?: number;
  fixedValue?: string;
}

export interface NotifyRule {
  id: string;
  name: string;
  event: string;
  audience: 'internal' | 'external';
  conditions: RuleCondition[];
  recipients: RuleRecipient[];
  /** 该规则触达的通道，可多选 */
  channels: NotifyChannel[];
  /** 模板通道（IM / 短信）→ 模板编码 */
  templates: Record<string, string>;
  /** 编辑器通道（邮件 / 站内信）→ 规则内联正文；邮件另有主题 */
  contents: Record<string, { subject?: string; body: string }>;
  enabled: boolean;
  /** 定时类规则的执行说明 */
  timerRule?: string;
}

export const COND_OP_LABEL: Record<CondOp, string> = {
  eq: '等于', ne: '不等于', in: '属于', nin: '不属于', gt: '大于', lt: '小于',
};

/** 按字段类型收敛可用运算符：布尔只有等于，数值/时间才有大于小于 */
export function opsForType(t?: FieldType): CondOp[] {
  switch (t) {
    case 'boolean': return ['eq'];
    case 'number':
    case 'datetime': return ['eq', 'ne', 'gt', 'lt'];
    case 'enum':
    case 'userId':
    case 'userId[]':
    case 'phone':
    default: return ['eq', 'ne', 'in', 'nin'];
  }
}
/** 该字段的取值是否应渲染成下拉（有固定取值域） */
export function optionsForField(f?: EventField): string[] | null {
  if (!f) return null;
  if (f.type === 'boolean') return ['是', '否'];
  if (f.type === 'enum') return [...(f.enumValues ?? [])];
  return null;
}

export const NOTIFY_RULES: NotifyRule[] = [
  /* ---------- 派工 ---------- */
  { id: 'R01', name: '建单派发通知', event: 'ticket.created', audience: 'internal',
    conditions: [], recipients: [{ type: 'assignee' }], channels: ['IM'], templates: { IM: 'IM_WO_DISPATCH' }, contents: {}, enabled: true },
  { id: 'R02', name: '建单受理通知', event: 'ticket.created', audience: 'external',
    conditions: [
      { field: 'source', op: 'nin', value: ['内投', '外投', '客户服务小程序'] },
      { field: 'bizType', op: 'ne', value: ['无线音乐'] },
      { field: 'ticketType', op: 'ne', value: ['表扬'] },
    ],
    recipients: [{ type: 'customer' }], channels: ['短信'], templates: { 短信: 'SMS_WO_ACCEPTED' }, contents: {}, enabled: true },
  { id: 'R03', name: '组内来单（调剂）', event: 'ticket.transfer', audience: 'internal',
    conditions: [], recipients: [{ type: 'targetUser' }], channels: ['IM'], templates: { IM: 'IM_WO_DISPATCH' }, contents: {}, enabled: true },
  { id: 'R04', name: '售后转入工单', event: 'ticket.fromAftersale', audience: 'internal',
    conditions: [], recipients: [{ type: 'assignee' }], channels: ['IM'], templates: { IM: 'IM_WO_DISPATCH' }, contents: {}, enabled: true },
  { id: 'R05', name: '委派提醒', event: 'ticket.delegate', audience: 'internal',
    conditions: [], recipients: [{ type: 'delegatee' }],
    channels: ['IM', '邮件'],
    templates: { IM: 'IM_WO_DELEGATE' },
    contents: {
      邮件: {
        subject: '【工单委派通知】您有一条委派工单 ${ticketNo}',
        body: '您好，工单 ${ticketNo} 已转派至您名下，任务说明：${delegateTask}，请尽快登录系统查看工单详情。',
      },
    },
    enabled: true },

  /* ---------- 客户侧输入 ---------- */
  { id: 'R06', name: '新建补充提醒', event: 'ticket.supplement', audience: 'internal',
    conditions: [], recipients: [{ type: 'assignee' }], channels: ['IM'], templates: { IM: 'IM_WO_SUPPLEMENT' }, contents: {}, enabled: true },
  { id: 'R07', name: '催单提醒', event: 'ticket.urge', audience: 'internal',
    conditions: [], recipients: [{ type: 'assignee' }], channels: ['IM'], templates: { IM: 'IM_WO_URGE' }, contents: {}, enabled: true },

  /* ---------- 流转异常 ---------- */
  { id: 'R08', name: '退回提醒（技术支持）', event: 'ticket.return', audience: 'internal',
    conditions: [{ field: 'returnFrom', op: 'eq', value: ['技术支持'] }],
    recipients: [{ type: 'prevAssignee' }], channels: ['IM'], templates: { IM: 'IM_WO_RETURN' }, contents: {}, enabled: true },
  { id: 'R09', name: '拒绝挂起提醒', event: 'approval.rejected', audience: 'internal',
    conditions: [{ field: 'approvalType', op: 'eq', value: ['挂起'] }],
    recipients: [{ type: 'applicant' }], channels: ['IM'], templates: { IM: 'IM_HOLD_REJECT' }, contents: {}, enabled: true },
  { id: 'R10', name: '审核提醒', event: 'approval.submitted', audience: 'internal',
    conditions: [], recipients: [{ type: 'approver' }], channels: ['IM'], templates: { IM: 'IM_APPROVAL_PENDING' }, contents: {}, enabled: true },

  /* ---------- 协作 ---------- */
  { id: 'R11', name: '评论区 @ 提醒', event: 'comment.mentioned', audience: 'internal',
    conditions: [], recipients: [{ type: 'mentioned' }], channels: ['IM'], templates: { IM: 'IM_COMMENT_MENTION' }, contents: {}, enabled: true },

  /* ---------- 终局 ---------- */
  { id: 'R12', name: '取消工单提醒', event: 'ticket.cancel', audience: 'internal',
    conditions: [], recipients: [{ type: 'assignee' }], channels: ['IM'], templates: { IM: 'IM_WO_CANCEL' }, contents: {}, enabled: true },
  { id: 'R13', name: '建议单感谢短信', event: 'ticket.forward', audience: 'external',
    conditions: [
      { field: 'ticketType', op: 'eq', value: ['建议'] },
      { field: 'isSuggestion', op: 'eq', value: ['是'] },
    ],
    recipients: [{ type: 'customer' }], channels: ['短信'], templates: { 短信: 'SMS_SUGGEST_THANKS' }, contents: {}, enabled: true },

  /* ---------- 定时 ---------- */
  { id: 'R14', name: '挂起即将到期提醒', event: 'timer.holdExpiring', audience: 'internal',
    conditions: [], recipients: [{ type: 'assignee' }], channels: ['邮件'], templates: {},
    contents: {
      邮件: {
        subject: '【挂起即将到期通知】工单 ${ticketNo}',
        body: '您好，工单 ${ticketNo} 挂起即将到期（剩余 ${daysLeft} 天），挂起时限截止：${holdUntil}，请尽快核实问题处理进展。',
      },
    },
    enabled: true,
    timerRule: '剩余 ≤3 天：每日提醒；已挂起 >1 个月：每月提醒一次' },
  { id: 'R15', name: '挂起到期提醒', event: 'timer.holdExpired', audience: 'internal',
    conditions: [], recipients: [{ type: 'assignee' }], channels: ['邮件'], templates: {},
    contents: {
      邮件: {
        subject: '【挂起到期通知】工单 ${ticketNo}',
        body: '您好，工单 ${ticketNo} 已到期自动解除挂起，挂起时限截止：${holdUntil}，请尽快核实问题处理进展。',
      },
    },
    enabled: true, timerRule: '到期即触发，不重复' },
  { id: 'R16', name: '预约到期提醒', event: 'timer.appointmentDue', audience: 'internal',
    conditions: [], recipients: [{ type: 'assignee' }], channels: ['IM'], templates: { IM: 'IM_APPT_DUE' }, contents: {}, enabled: true, timerRule: '预约时间前 1 天提醒一次' },

];

/* ============================ 模板库 ============================ */

export interface RuleTemplate { code: string; name: string; content: string }

/** 模板库只覆盖模板通道（IM / 短信）；邮件与站内信无模板，正文写在规则里 */
export const RULE_TEMPLATES: Record<string, RuleTemplate[]> = {
  IM: [
    { code: 'IM_WO_DISPATCH', name: '工单派发提醒', content: '【工单处理通知】您有一条工单待处理\n\n您好，客服系统有 1 条待处理工单（${ticketNo}），工单标题为「${title}」，请于 ${responseDueTime} 前响应客户，请尽快完成处理。' },
    { code: 'IM_WO_DELEGATE', name: '工单委派通知', content: '【工单委派通知】您有一条委派工单\n\n您好，工单 ${ticketNo} 已转派至您名下，任务说明：${delegateTask}，请尽快登录系统查看并在规定时效内完成处理。' },
    { code: 'IM_WO_SUPPLEMENT', name: '工单补充通知', content: '【工单补充通知】客户补充了新信息\n\n您好，工单 ${ticketNo}（${title}）新增一条补充信息（${supplementType}），请及时查阅并跟进。' },
    { code: 'IM_WO_URGE', name: '工单催办通知', content: '【工单催办通知】客户催办\n\n您好，工单 ${ticketNo}（${title}）客户已催办：${urgeContent}，请尽快处理并回复客户。' },
    { code: 'IM_WO_RETURN', name: '退回工单通知', content: '【退回工单通知】您有一条工单被退回\n\n您好，工单 ${ticketNo} 已从${returnFrom}退回，退回原因：${returnReason}，请您重新完成处理。' },
    { code: 'IM_HOLD_REJECT', name: '拒绝挂起通知', content: '【拒绝挂起通知】您有一条挂起工单被拒绝\n\n您好，工单 ${ticketNo} 挂起申请已被拒绝，原因：${rejectReason}，请您重新完成处理。' },
    { code: 'IM_APPROVAL_PENDING', name: '待审核通知', content: '【待审核通知】您有一条工单待审核\n\n您好，工单 ${ticketNo} 提交了${approvalType}审核，请您尽快完成审批。' },
    { code: 'IM_COMMENT_MENTION', name: '工单 @ 通知', content: '【工单@通知】有人在评论区提到了您\n\n您好，工单 ${ticketNo} 的评论区提到了您：${commentText}，请点击查看：${deepLink}' },
    { code: 'IM_WO_CANCEL', name: '工单取消通知', content: '【工单取消通知】您的待处理工单已被取消\n\n您好，工单 ${ticketNo} 已被取消（${cancelReason}），工单已自动关闭，无需继续跟进处理。' },
    { code: 'IM_APPT_DUE', name: '预约到期提醒', content: '【预约到期提醒】您有一条预约即将到期\n\n您好，工单 ${ticketNo}（${title}）的预约时间为 ${apptTime}，请及时安排上门 / 回访。' },
    { code: 'IM_WO_GENERIC', name: '工单通用提醒', content: '工单 ${ticketNo}（${title}）有新动态，请及时查看：${deepLink}' },
  ],
  短信: [
    { code: 'SMS_WO_ACCEPTED', name: '建单受理通知', content: '尊敬的用户您好，您反馈的问题已收到，工单号为 ${ticketNo}，我们已安排专人跟进处理。处理进度会通过短信或 0551 开头的电话同步给您，烦请保持手机畅通，耐心等待。感谢您的信任与支持' },
    { code: 'SMS_SUGGEST_THANKS', name: '建议单感谢短信', content: '尊敬用户您好，您提出的建议对我们不断改进非常重要，很感谢您对我们的关注，祝您生活愉快！' },
  ],
};

/* ============================ 规则测试用样例工单 ============================ */

export interface SampleTicket {
  id: string;
  label: string;
  data: Record<string, string>;
}

export const SAMPLE_TICKETS: SampleTicket[] = [
  {
    id: 'S1', label: 'IFLYKF20260728001 · 热线来源 · 咨询单',
    data: {
      ticketNo: 'IFLYKF20260728001', title: '学习机无法开机', ticketType: '咨询',
      source: '热线电话', bizType: '智能硬件', customerName: '王女士', customerPhone: '138****2046',
      assigneeId: '李强（二线处理组）', creatorId: '张敏（一线客服）',
      responseDueTime: '2026-07-28 16:30',
      returnFrom: '技术支持', returnReason: '需客户补充设备序列号',
      deepLink: 'https://xfkf.iflytek.com/t/001',
    },
  },
  {
    id: 'S2', label: 'IFLYKF20260728002 · 内投来源 · 投诉单',
    data: {
      ticketNo: 'IFLYKF20260728002', title: '售后响应慢', ticketType: '投诉',
      source: '内投', bizType: '教育', customerName: '刘先生', customerPhone: '139****8821',
      assigneeId: '陈静（投诉专席）', creatorId: '张敏（一线客服）',
      responseDueTime: '2026-07-28 15:00',
      returnFrom: '调研',
      deepLink: 'https://xfkf.iflytek.com/t/002',
    },
  },
  {
    id: 'S3', label: 'IFLYKF20260728003 · 无线音乐业务 · 建议单',
    data: {
      ticketNo: 'IFLYKF20260728003', title: '希望增加歌单导入', ticketType: '建议',
      source: '客户服务小程序', bizType: '无线音乐', customerName: '赵先生', customerPhone: '137****5510',
      assigneeId: '周涛（产品支持组）', creatorId: '张敏（一线客服）', isSuggestion: '是',
      responseDueTime: '2026-07-29 10:00',
      deepLink: 'https://xfkf.iflytek.com/t/003',
    },
  },
];

/** 组织树（供「上级(N)」解析演示） */
export const SUPERIOR_CHAIN: Record<string, string[]> = {
  '李强（二线处理组）': ['王海（二线一组组长）', '孙磊（客服中心主管）', '吴敏（二级部门经理）'],
  '陈静（投诉专席）': ['王海（二线一组组长）', '孙磊（客服中心主管）', '吴敏（二级部门经理）'],
  '周涛（产品支持组）': ['马超（产品支持组长）', '孙磊（客服中心主管）', '吴敏（二级部门经理）'],
};

/* ============================ 发送评估日志（Skip Reason） ============================ */

export type EvalResult = '已发送' | '已跳过' | '发送失败';

export interface EvalLog {
  time: string;
  ticketNo: string;
  ruleId: string;
  ruleName: string;
  recipient: string;
  channel: string;
  result: EvalResult;
  /** 已跳过时必填 */
  skipReason?: string;
}

export const EVAL_LOGS: EvalLog[] = [
  { time: '2026-07-28 14:22:10', ticketNo: 'IFLYKF20260728001', ruleId: 'R01', ruleName: '建单派发通知', recipient: '李强（二线处理组）', channel: 'IM', result: '已发送' },
  { time: '2026-07-28 14:22:10', ticketNo: 'IFLYKF20260728001', ruleId: 'R02', ruleName: '建单受理通知', recipient: '138****2046', channel: '短信', result: '已发送' },
  { time: '2026-07-28 14:18:44', ticketNo: 'IFLYKF20260728002', ruleId: 'R02', ruleName: '建单受理通知', recipient: '139****8821', channel: '短信', result: '已跳过', skipReason: '不满足触发条件：工单来源「内投」属于排除项' },
  { time: '2026-07-28 14:18:44', ticketNo: 'IFLYKF20260728002', ruleId: 'R01', ruleName: '建单派发通知', recipient: '陈静（投诉专席）', channel: 'IM', result: '已发送' },
  { time: '2026-07-28 13:55:02', ticketNo: 'IFLYKF20260728003', ruleId: 'R02', ruleName: '建单受理通知', recipient: '137****5510', channel: '短信', result: '已跳过', skipReason: '不满足触发条件：业务分类「无线音乐」属于排除项' },
  { time: '2026-07-28 11:40:31', ticketNo: 'IFLYKF20260727088', ruleId: 'R10', ruleName: '审核提醒', recipient: '—', channel: 'IM', result: '已跳过', skipReason: '收件人解析为空：该审批单未配置审核组' },
  { time: '2026-07-28 10:12:07', ticketNo: 'IFLYKF20260727061', ruleId: 'R11', ruleName: '评论区 @ 提醒', recipient: '钱伟（技术支持）', channel: 'IM', result: '发送失败', skipReason: '渠道返回：该用户未完成 i讯飞账号映射' },
  { time: '2026-07-28 09:30:55', ticketNo: 'IFLYKF20260727054', ruleId: 'R08', ruleName: '退回提醒（技术支持）', recipient: '—', channel: 'IM', result: '已跳过', skipReason: '不满足触发条件：退回来源环节为「调研」' },
  { time: '2026-07-28 08:00:12', ticketNo: 'IFLYKF20260715022', ruleId: 'R14', ruleName: '挂起即将到期提醒', recipient: '周涛（产品支持组）', channel: '邮件', result: '已发送' },
  { time: '2026-07-28 08:00:12', ticketNo: 'IFLYKF20260710009', ruleId: 'R14', ruleName: '挂起即将到期提醒', recipient: '—', channel: '邮件', result: '已跳过', skipReason: '规则已停用' },
];

/* ============================ 签名路由 ============================ */

export interface SignRoute {
  id: number;
  bizLine: string;
  channelName: string;
  sign: string;
  isDefault: boolean;
}

export const SIGN_ROUTES: SignRoute[] = [
  { id: 1, bizLine: '默认（未匹配业务线）', channelName: '消息中心 · 客服', sign: '【科大讯飞】', isDefault: true },
  { id: 2, bizLine: '壹师壹生', channelName: '消息中心 · 壹师壹生', sign: '【合肥窗启】', isDefault: false },
];

/* ============================ 工具函数 ============================ */

export const eventOf = (code: string) => NOTIFY_EVENTS.find((e) => e.code === code);
export const recipientTypeOf = (code: string) => RECIPIENT_TYPES.find((r) => r.code === code);

/** 某事件下可用的收件人类型：field 型需事件负载含对应字段 */
export function availableRecipients(eventCode: string): RecipientType[] {
  const ev = eventOf(eventCode);
  if (!ev) return [];
  const keys = new Set(ev.payload.map((p) => p.key));
  return RECIPIENT_TYPES.filter((r) => r.kind !== 'field' || (r.requires && keys.has(r.requires)));
}

/** 收件人显示名 */
export function recipientLabel(r: RuleRecipient): string {
  const t = recipientTypeOf(r.type);
  if (!t) return r.type;
  if (t.hasLevel) return `${t.name}(${r.level ?? 1})`;
  if (t.kind === 'fixed') return r.fixedValue ? `${t.name}：${r.fixedValue}` : t.name;
  return t.name;
}

/** 取若干段文本中用到的全部变量名，不含 ${} */
export function varsIn(...texts: (string | undefined)[]): string[] {
  const raw = texts.filter(Boolean).join('\n');
  return [...new Set((raw.match(/\$\{([a-zA-Z]+)\}/g) ?? []).map((v) => v.slice(2, -1)))];
}
/** 取模板正文中用到的全部变量名 */
export const templateVars = (t: RuleTemplate) => varsIn(t.content);

/** 条件显示文本 */
export function condLabel(c: RuleCondition, eventCode: string): string {
  const f = eventOf(eventCode)?.payload.find((p) => p.key === c.field);
  return `${f?.label ?? c.field} ${COND_OP_LABEL[c.op]} ${c.value.join(' / ')}`;
}
