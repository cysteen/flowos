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
// 边界：
//   · SLA 的临期 / 超时 / 超时升级通知【不在本模块】，由 SLA 引擎自带的
//     「SLA 管理 · 预警与升级」配置（D1/D20）。本模块不订阅 sla.* 事件。
//   · 短信签名【不在本模块】：签名随「消息中心 · 短信渠道」携带，本模块不做
//     业务线 → 渠道的映射配置（D21）。
//
// 事件分两类，性质不同、不套同一个模子：
//   · 【动作类】某人/某系统做了一件事 —— 一次性、有操作人、不可重复（调剂、委派、退回…）
//   · 【状态类】某张工单处于某个可关注的状态 —— 持续性、无操作人、每天重新评估（定扫）
//
// 状态类事件（定扫）的职责边界：
//   事件只回答"今天有哪些工单处于这个状态"，
//   规则回答"这些里哪些该发、发给谁"——阈值用 ≤ / ≥，周期用「每隔 N」。
//   因判断只依赖工单自身状态，天然幂等，不需记录发送历史，不与 D11「不做频控」冲突。
//
// 模型：事件目录（代码维护，发版新增）+ 通知规则（纯配置，业务自助）
//   业务新增消息场景时：事件已存在 → 新建一条规则，零代码；事件不存在 → 只补一行埋点。

/* ============================ 事件目录 ============================ */

export type EventSource = 'dispatch' | 'non-dispatch' | 'approval' | 'timer';

/**
 * 属性字段的数据类型。决定三件事：
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
  /** 这个变量是什么、什么时候用它。事件详情页逐字段展示，供运营写模板时对照 */
  desc?: string;
}

/* ---- 枚举字典：与项目既有字典同源，改一处即全局生效 ---- */
/** 工单类型（含表扬，表扬不建单但用于抑制判定） */
export const DICT_TICKET_TYPE = ['投诉', '建议', '商机', '咨询', '表扬'] as const;
/** 工单来源 */
export const DICT_SOURCE = ['热线电话', 'IM在线', '内投渠道', '外投渠道', '客户服务小程序', '学习机渠道'] as const;
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
/**
 * 分派来源：工单是经由哪条路径分派到人的。
 * 调剂 / 委派不在此列——它们是「直接到人」的动作，不经分派环节，
 * 各自的通知挂在各自的动作事件上（见 R03）。
 */
export const DICT_DISPATCH_FROM = ['建单', '认领', '转售后', '售后转入'] as const;
/** 解挂方式：区分人工解除与到期自动解除，「挂起到期提醒」靠它过滤 */
export const DICT_RESUME_TYPE = ['到期自动解挂', '人工解除挂起'] as const;
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
  /** 事件属性：既是模板可用变量，也是收件人可引用的字段 */
  payload: EventField[];
  remark?: string;
}

/** 所有事件共有的工单基础属性 */
const BASE: EventField[] = [
  { key: 'ticketNo', label: '工单号', type: 'string', desc: '工单唯一编号，几乎所有模板都以它开头，便于收件人一眼定位是哪张单' },
  { key: 'title', label: '工单标题', type: 'string', desc: '建单时填写的问题概述' },
  { key: 'ticketType', label: '工单类型', type: 'enum', enumValues: DICT_TICKET_TYPE, desc: '投诉 / 建议 / 商机 / 咨询 / 表扬。常用作条件，把不同类型分流到不同规则' },
  { key: 'source', label: '工单来源', type: 'enum', enumValues: DICT_SOURCE, desc: '客户从哪个渠道来的。对客短信的抑制条件主要靠它' },
  { key: 'bizType', label: '业务分类', type: 'enum', enumValues: DICT_BIZ_TYPE, desc: '工单归属的业务线。常用作条件，按业务线区分通知策略' },
  { key: 'productName', label: '产品名称', type: 'string', desc: '工单关联的产品型号，来自产品主数据。模板中常用于区分不同产品的通知文案' },
  { key: 'customerName', label: '客户名称', type: 'string', desc: '联系人姓名，用于对客短信的称呼' },
  { key: 'customerPhone', label: '客户手机号', type: 'phone', isRecipient: true, desc: '对客短信的收件号码。选「客户」类型收件人时取的就是它' },
  { key: 'assigneeId', label: '当前处理人', type: 'userId', isRecipient: true, desc: '工单当前归谁处理。选「处理人」类型收件人时取的就是它；工单在池中未分派时可能为空' },
  { key: 'creatorId', label: '创建人', type: 'userId', isRecipient: true, desc: '建单人。选「创建人」类型收件人时取的就是它' },
  { key: 'deepLink', label: '工单直达链接', type: 'string', desc: '点开即进入该工单详情页。IM / 邮件正文建议都带上，省去收件人自己搜索' },
];

/** 公共属性的字段名集合——事件详情页据此把「公共」与「专属」分开展示 */
export const BASE_FIELD_KEYS: ReadonlySet<string> = new Set(BASE.map((f) => f.key));

export const NOTIFY_EVENTS: NotifyEvent[] = [
  /* ---- 来自后端动作枚举 WoAction（经 dispatch） ---- */
  { code: 'ticket.transfer', name: '调剂', source: 'dispatch', actionCode: 'TRANSFER(10)',
    payload: [...BASE, { key: 'operatorId', label: '操作人', type: 'userId', isRecipient: true, desc: '执行本次调剂的人' }, { key: 'targetUserId', label: '目标处理人', type: 'userId', isRecipient: true, desc: '被调剂到的人。「组内来单」提醒发的就是他' }, { key: 'crossGroup', label: '是否跨组', type: 'boolean', desc: '调剂是否跨越了班组。跨组来单通常需额外提醒班组长，可用它作条件' }] },
  { code: 'ticket.delegate', name: '委派', source: 'dispatch', actionCode: 'DELEGATE(11)',
    payload: [...BASE, { key: 'delegateeIds', label: '被委派人', type: 'userId[]', isRecipient: true, desc: '承接委派任务的人，可多人。委派提醒发给他们' }, { key: 'delegateTask', label: '委派任务说明', type: 'string', desc: '委派时填写的任务要求，写进正文让对方知道要做什么' }] },
  { code: 'ticket.return', name: '退回', source: 'dispatch', actionCode: 'RETURN(12)',
    payload: [...BASE, { key: 'prevAssigneeId', label: '原处理人', type: 'userId', isRecipient: true, desc: '工单被退回给谁——即退回前把单子送出去的那个人' }, { key: 'returnFrom', label: '退回来源环节', type: 'enum', enumValues: DICT_RETURN_FROM, desc: '从哪个环节退回来的。用作条件可让不同来源走不同文案' }, { key: 'returnReason', label: '退回原因', type: 'string', desc: '退回方填写的原因，务必写进正文——否则收件人不知道为什么被退' }] },
  { code: 'ticket.withdraw', name: '撤回', source: 'dispatch', actionCode: 'WITHDRAW(13)',
    payload: [...BASE, { key: 'prevAssigneeId', label: '原接收方', type: 'userId', isRecipient: true, desc: '撤回前已经收到这张单的人' }] },
  { code: 'ticket.forward', name: '下送', source: 'dispatch', actionCode: 'FORWARD(14)',
    payload: [...BASE, { key: 'isSuggestion', label: '是否建议', type: 'boolean', desc: '本次下送的是否为建议单' }],
    remark: '处理完成提交，≠「建单派发」' },
  { code: 'ticket.claim', name: '认领', source: 'dispatch', actionCode: 'CLAIM(15)', payload: [...BASE] },
  { code: 'ticket.escalate', name: '升级', source: 'dispatch', actionCode: 'ESCALATE(20)',
    payload: [...BASE, { key: 'escalateTargetId', label: '升级接收方', type: 'userId', isRecipient: true, desc: '工单升级后交给谁跟进' }],
    remark: '枚举注释含 "or NOTIFY"，与 SLA 自动升级是否共用同一码待确认' },
  { code: 'ticket.syncFeishu', name: '同步飞书', source: 'dispatch', actionCode: 'SYNC_FEISHU(21)',
    payload: [...BASE], remark: '执行方式本身即 NOTIFY，需与《【720】飞书项目集成》对齐' },
  { code: 'ticket.toAftersale', name: '转售后', source: 'dispatch', actionCode: 'TO_AFTERSALE(22)',
    payload: [...BASE, { key: 'aftersaleReceiverId', label: '售后接收人', type: 'userId', isRecipient: true, desc: '售后侧承接这张单的人' }] },
  { code: 'ticket.escalateComplaint', name: '升级投诉', source: 'dispatch', actionCode: 'ESCALATE_COMPLAINT(23)',
    payload: [...BASE, { key: 'newTicketNo', label: '新建投诉单号', type: 'string', desc: '升级投诉后新建出来的投诉单号。原单会被关闭，正文给出新单号便于追踪' }],
    remark: '前端编排、不经 dispatch，通知需由前端在建单成功后显式触发' },
  { code: 'ticket.suspend', name: '挂起', source: 'dispatch', actionCode: 'SUSPEND(30)',
    payload: [...BASE, { key: 'holdUntil', label: '挂起截止日期', type: 'datetime', desc: '挂起到什么时候，到期后系统自动解挂' }, { key: 'holdReason', label: '挂起原因', type: 'string', desc: '申请挂起时填写的理由，审批人据此判断是否同意' }] },
  { code: 'ticket.resume', name: '恢复（解除挂起）', source: 'dispatch', actionCode: 'RESUME(31)',
    payload: [...BASE,
      { key: 'operatorId', label: '操作人', type: 'userId', isRecipient: true, desc: '执行本次操作的人' },
      { key: 'resumeType', label: '解挂方式', type: 'enum', enumValues: DICT_RESUME_TYPE, desc: '到期自动解挂，还是有人手工解除。「挂起到期提醒」只发前者——后者是处理人自己的操作，无需再通知他' },
      { key: 'holdUntil', label: '挂起截止日期', type: 'datetime', desc: '挂起到什么时候，到期后系统自动解挂' },
    ],
    remark: '含人工解挂与到期自动解挂两种，用「解挂方式」区分。⚠ 待研发确认：到期自动解挂是复用 RESUME(31) 跳过审批，还是另立系统事件' },
  { code: 'ticket.resolve', name: '标记已解决', source: 'dispatch', actionCode: 'RESOLVE(40)', payload: [...BASE] },
  { code: 'ticket.close', name: '关闭工单', source: 'dispatch', actionCode: 'CLOSE(41)',
    payload: [...BASE, { key: 'closeReason', label: '关闭原因', type: 'enum', enumValues: DICT_CLOSE_REASON, desc: '工单因何关闭。取值域待业务确认' }] },
  { code: 'ticket.forceClose', name: '强结', source: 'dispatch', actionCode: 'FORCE_CLOSE(42)',
    payload: [...BASE, { key: 'prevAssigneeId', label: '原处理人', type: 'userId', isRecipient: true, desc: '本次操作之前持有这张单的人' }, { key: 'closeReason', label: '强结原因', type: 'enum', enumValues: DICT_CLOSE_REASON, desc: '强制结单的理由。被强结单的原处理人需要知道为什么' }] },
  { code: 'ticket.archive', name: '归档', source: 'dispatch', actionCode: 'ARCHIVE(43)', payload: [...BASE] },
  { code: 'ticket.cancel', name: '取消', source: 'dispatch', actionCode: 'CANCEL(44)',
    payload: [...BASE, { key: 'cancelReason', label: '取消原因', type: 'enum', enumValues: DICT_CANCEL_REASON, desc: '工单因何取消，写进正文让处理人知道不必再跟进' }] },
  { code: 'ticket.saveDraft', name: '保存草稿', source: 'dispatch', actionCode: 'SAVE_DRAFT(50)', payload: [...BASE] },
  { code: 'ticket.submitHandleForm', name: '提交处理表单', source: 'dispatch', actionCode: 'SUBMIT_HANDLE_FORM(51)', payload: [...BASE] },
  { code: 'ticket.submitTechForm', name: '提交技术支持表单', source: 'dispatch', actionCode: 'SUBMIT_TECH_FORM(52)',
    payload: [...BASE, { key: 'prevAssigneeId', label: '原处理人', type: 'userId', isRecipient: true, desc: '本次操作之前持有这张单的人' }],
    remark: '与 RETURN(12) 的关系待确认：技支提交后是否即退回原处理人' },
  { code: 'ticket.submitRiskForm', name: '提交风险监控表单', source: 'dispatch', actionCode: 'SUBMIT_RISK_FORM(53)',
    payload: [...BASE], remark: '「风险监控」角色在动作矩阵与消息表中均无定义，待补' },

  /* ---- 审批阶段事件（枚举中是动作的阶段，需独立事件） ---- */
  { code: 'approval.submitted', name: '提交审批', source: 'approval',
    payload: [...BASE, { key: 'approverIds', label: '审核人', type: 'userId[]', isRecipient: true, desc: '本次审批的候选审核人，可多人。审核提醒发给他们' }, { key: 'applicantId', label: '申请人', type: 'userId', isRecipient: true, desc: '发起本次审批的人。审批通过 / 驳回的结果通知发给他' }, { key: 'approvalType', label: '审批事项', type: 'enum', enumValues: DICT_APPROVAL_TYPE, desc: '这次审批的是挂起、关闭还是强结。三者共用同一套审批流，靠它作条件分流到不同规则' }] },
  { code: 'approval.approved', name: '审批通过', source: 'approval',
    payload: [...BASE, { key: 'applicantId', label: '申请人', type: 'userId', isRecipient: true, desc: '发起本次审批的人。审批通过 / 驳回的结果通知发给他' }, { key: 'approvalType', label: '审批事项', type: 'enum', enumValues: DICT_APPROVAL_TYPE, desc: '这次审批的是挂起、关闭还是强结。三者共用同一套审批流，靠它作条件分流到不同规则' }] },
  { code: 'approval.rejected', name: '审批驳回', source: 'approval',
    payload: [...BASE, { key: 'applicantId', label: '申请人', type: 'userId', isRecipient: true, desc: '发起本次审批的人。审批通过 / 驳回的结果通知发给他' }, { key: 'approvalType', label: '审批事项', type: 'enum', enumValues: DICT_APPROVAL_TYPE, desc: '这次审批的是挂起、关闭还是强结。三者共用同一套审批流，靠它作条件分流到不同规则' }, { key: 'rejectReason', label: '驳回原因', type: 'string', desc: '审批人填写的驳回理由，必须写进正文——否则申请人不知道该怎么改' }] },

  /* ---- 不经 dispatch 的事件（需单独埋点） ---- */
  { code: 'ticket.dispatched', name: '工单分派', source: 'non-dispatch',
    payload: [...BASE,
      { key: 'dispatchFrom', label: '分派来源', type: 'enum', enumValues: DICT_DISPATCH_FROM, desc: '工单经由哪条路径分派到人。对客受理短信靠它筛出「建单」这一种，避免认领 / 转售后时重复给客户发短信' },
      { key: 'responseDueTime', label: '首响截止时间', type: 'datetime', desc: '必须在此时间前首次响应客户。注意与「解决截止时间」是两个字段，派工提醒用的是首响，别写串' },
    ],
    remark: '工单定下处理人的时刻。建单后、认领后、转售后、售后转入四条路径都汇到这里：对内派工提醒一条规则通吃，对客受理短信用「分派来源=建单」筛出。⚠ 待研发确认：是由工单调度引擎统一发出，还是各动作各自埋点' },
  { code: 'ticket.supplement', name: '新建补充', source: 'non-dispatch',
    payload: [...BASE, { key: 'supplementType', label: '补充分类', type: 'enum', enumValues: DICT_SUPPLEMENT_TYPE, desc: '客户补充了什么性质的信息。「取消服务」这类需处理人立刻知晓，可用它作条件区分紧急度' }, { key: 'supplementContent', label: '补充内容', type: 'string', desc: '客户补充的具体信息' }],
    remark: 'no flow，需在补充接口成功后显式触发' },
  { code: 'ticket.urge', name: '催单', source: 'non-dispatch',
    payload: [...BASE, { key: 'urgeContent', label: '催单信息', type: 'string', desc: '客户催单时说的话。写进提醒让处理人知道客户在急什么' }], remark: 'no flow' },
  { code: 'comment.mentioned', name: '评论区 @', source: 'non-dispatch',
    payload: [...BASE, { key: 'mentionedIds', label: '被@人', type: 'userId[]', isRecipient: true, desc: '评论里被 @ 到的人，可多人。@ 提醒发给他们' }, { key: 'mentionerId', label: '@ 发起人', type: 'userId', isRecipient: true, desc: '发出这条 @ 的人。正文里点名是谁在找你，对方才好回应' }, { key: 'commentText', label: '评论内容', type: 'string', desc: '评论正文。写进提醒里对方才知道被 @ 了什么事' }],
    remark: '动作矩阵中无「评论」动作，需回补' },
  { code: 'appointment.created', name: '新增预约', source: 'non-dispatch',
    payload: [...BASE, { key: 'apptTime', label: '预约时间', type: 'datetime', desc: '与客户约定的上门 / 回访时间。注意与「挂起截止日期」是两个字段，别写串' }, { key: 'apptType', label: '预约类型', type: 'enum', enumValues: DICT_APPT_TYPE, desc: '上门还是回访' }] },

  /* ---- 定时事件 ---- */
  { code: 'hold.dailyCheck', name: '挂起定扫', source: 'timer',
    payload: [...BASE,
      { key: 'holdUntil', label: '挂起截止日期', type: 'datetime', desc: '挂起到什么时候，到期后系统自动解挂' },
      { key: 'daysLeft', label: '距挂起到期天数', type: 'number', desc: '还有几天到期，当天为 0。用 ≤ 做阈值即得到分档提醒，如 ≤3 天起每天提醒' },
      { key: 'heldDays', label: '已挂起天数', type: 'number', desc: '自挂起之日起算已过去几天。配「每隔 N」即可做周期提醒，如每 30 天催一次' },
    ],
    remark: '每日定扫仍处于挂起中的工单，各发一次。事件只给状态快照，发不发、隔多久发一次全部由规则条件决定。挂起到期当天工单已解挂、不在扫描范围内，故与「恢复」事件不重叠' },
  { code: 'appointment.dailyCheck', name: '预约定扫', source: 'timer',
    payload: [...BASE,
      { key: 'apptTime', label: '预约时间', type: 'datetime', desc: '与客户约定的上门 / 回访时间。注意与「挂起截止日期」是两个字段，别写串' },
      { key: 'daysToAppt', label: '距预约天数', type: 'number', desc: '离预约时间还有几天。提前几天提醒由它决定，如 =1 表示只在前一天提醒' },
    ],
    remark: '每日定扫仍未完成的预约，各发一次；提前几天提醒由规则条件决定' },

];

export const EVENT_SOURCE_META: Record<EventSource, { label: string; color: string; desc: string }> = {
  dispatch: { label: '工单动作', color: 'blue', desc: '经 WoActionServiceImpl.dispatch，对应后端动作枚举' },
  'non-dispatch': { label: '独立埋点', color: 'orange', desc: '不经 dispatch，需在各自接口成功后显式触发' },
  approval: { label: '审批阶段', color: 'purple', desc: '审批流的提交/通过/驳回，动作枚举中为动作的阶段' },
  timer: { label: '状态定扫', color: 'gold', desc: '每日定时扫描处于特定状态的工单，各发一次事件；发不发由规则条件决定' },
};

/* ============================ 收件人类型 ============================ */

export type RecipientKind = 'field' | 'relation' | 'fixed';

export interface RecipientType {
  code: string;
  name: string;
  kind: RecipientKind;
  /** 依赖事件属性里的哪个字段；该事件没有此字段则不可选 */
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
  { code: 'customer', name: '客户', kind: 'field', requires: 'customerPhone', desc: '工单联系人，对客消息专用' },
  { code: 'leader', name: '班组长', kind: 'relation', desc: '处理人所属班组的组长' },
  // 能力保留：SLA 超时升级已移交 SLA 引擎，但强结、催单抄送等场景仍可能上溯层级
  { code: 'superior', name: '上级', kind: 'relation', hasLevel: true, desc: '沿组织树上溯 N 级（1=班组长 2=主管 3=二级部门经理）' },
  { code: 'fixed', name: '指定人员 / 角色', kind: 'fixed', desc: '固定指派，兜底用；可搜索用户或角色' },
];

/** 收件人三种形态的显示名（对齐 PRD §3.4 的分组表） */
export const RECIPIENT_KIND_LABEL: Record<RecipientType['kind'], string> = {
  field: '字段引用',
  relation: '关系函数',
  fixed: '固定指派',
};

/** 固定指派候选：用户 + 角色（供规则编辑「指定人员 / 角色」搜索下拉） */
export interface FixedAssignOption {
  value: string;
  label: string;
  /** 参与搜索的附加文本（账号、部门等） */
  keywords: string;
  kind: 'user' | 'role';
}

export const FIXED_ASSIGN_USERS: FixedAssignOption[] = [
  { value: '用户·王芳', label: '王芳', keywords: 'wangfang 一线客服部 班组长', kind: 'user' },
  { value: '用户·李强', label: '李强', keywords: 'liqiang 二线处理部 高级客服', kind: 'user' },
  { value: '用户·陈静', label: '陈静', keywords: 'chenjing 一线客服部 客服专员', kind: 'user' },
  { value: '用户·赵敏', label: '赵敏', keywords: 'zhaomin 售后服务部 售后工程师', kind: 'user' },
  { value: '用户·吴婷', label: '吴婷', keywords: 'wuting 一线客服部 实习坐席', kind: 'user' },
  { value: '用户·张敏', label: '张敏', keywords: 'zhangmin 受理一组 二线坐席', kind: 'user' },
  { value: '用户·李昊', label: '李昊', keywords: 'lihao 受理一组 二线坐席', kind: 'user' },
  { value: '用户·孙杰', label: '孙杰', keywords: 'sunjie 受理一组 二线坐席', kind: 'user' },
  { value: '用户·周运营', label: '周运营', keywords: 'zhouyunying 运营管理员', kind: 'user' },
];

export const FIXED_ASSIGN_ROLES: FixedAssignOption[] = [
  { value: '角色·客服班组长', label: '客服班组长', keywords: '班组长 leader', kind: 'role' },
  { value: '角色·客服·二线坐席', label: '客服·二线坐席', keywords: '二线坐席 agent', kind: 'role' },
  { value: '角色·售后·二线坐席', label: '售后·二线坐席', keywords: '售后 agent', kind: 'role' },
  { value: '角色·运营管理员', label: '运营管理员', keywords: '运营 ops', kind: 'role' },
  { value: '角色·租户管理员', label: '租户管理员', keywords: '租户 admin', kind: 'role' },
  { value: '角色·质检专员', label: '质检专员', keywords: '质检 qa', kind: 'role' },
  { value: '角色·售后回访专员', label: '售后回访专员', keywords: '回访', kind: 'role' },
];

export const FIXED_ASSIGN_OPTIONS = [
  {
    label: '用户',
    options: FIXED_ASSIGN_USERS.map((u) => ({
      value: u.value,
      label: u.label,
      title: u.keywords,
    })),
  },
  {
    label: '角色',
    options: FIXED_ASSIGN_ROLES.map((r) => ({
      value: r.value,
      label: r.label,
      title: r.keywords,
    })),
  },
];

/** 固定指派下拉：按关键词搜 label / value / keywords */
export function filterFixedAssignOption(
  input: string,
  option?: { label?: string; value?: string; title?: string },
): boolean {
  const q = input.trim().toLowerCase();
  if (!q) return true;
  const hay = `${option?.label ?? ''} ${option?.value ?? ''} ${option?.title ?? ''}`.toLowerCase();
  return hay.includes(q);
}

/* ============================ 通知规则 ============================ */

export type NotifyChannel = 'IM' | '短信' | '邮件' | '站内信';

/** 走模板库的通道：规则里只能选模板，内容去「消息中心」改 */
export const TEMPLATE_CHANNELS: NotifyChannel[] = ['IM', '短信'];
/** 走内联编辑器的通道：正文写在规则里 */
export const EDITOR_CHANNELS: NotifyChannel[] = ['邮件', '站内信'];
export const isTemplateChannel = (c: NotifyChannel) => TEMPLATE_CHANNELS.includes(c);
export type CondOp = 'eq' | 'ne' | 'in' | 'nin' | 'gt' | 'gte' | 'lt' | 'lte' | 'every';

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
}

export const COND_OP_LABEL: Record<CondOp, string> = {
  eq: '等于', ne: '不等于', in: '属于', nin: '不属于',
  gt: '大于', gte: '大于等于', lt: '小于', lte: '小于等于',
  /**
   * 每隔 N —— 语义为 `值 > 0 且 值 % N === 0`。
   * 定时提醒的"周期性重复"靠它表达：扫描器每天跑，只在第 N/2N/3N… 天命中。
   * 这样判断只依赖工单自身状态（已挂起天数），无需记录"上次发送时间"，天然幂等。
   */
  every: '每隔',
};

/** 按字段类型收敛可用运算符：布尔只有等于；数值可比大小、可取周期；时间只比大小 */
export function opsForType(t?: FieldType): CondOp[] {
  switch (t) {
    case 'boolean': return ['eq'];
    case 'number': return ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'every'];
    case 'datetime': return ['eq', 'ne', 'gt', 'gte', 'lt', 'lte'];
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
  // 建单 / 认领 / 转售后 / 售后转入 四条路径共用这一条——它们发的本就是同一句"你有一张新单"
  { id: 'R01', name: '工单派发提醒', event: 'ticket.dispatched', audience: 'internal',
    conditions: [], recipients: [{ type: 'assignee' }], channels: ['IM'], templates: { IM: 'IM_WO_DISPATCH' }, contents: {}, enabled: true },
  // 受理短信发的是"有人接手了"，因此挂分派而非建单——新单若进池无人接，不该告诉客户已受理
  { id: 'R02', name: '建单受理通知', event: 'ticket.dispatched', audience: 'external',
    conditions: [
      { field: 'dispatchFrom', op: 'eq', value: ['建单'] },
      { field: 'source', op: 'nin', value: ['内投渠道', '外投渠道', '客户服务小程序'] },
      { field: 'bizType', op: 'ne', value: ['无线音乐'] },
      { field: 'ticketType', op: 'ne', value: ['表扬'] },
    ],
    recipients: [{ type: 'customer' }], channels: ['短信'], templates: { 短信: 'SMS_WO_ACCEPTED' }, contents: {}, enabled: true },
  { id: 'R03', name: '组内来单（调剂）', event: 'ticket.transfer', audience: 'internal',
    conditions: [], recipients: [{ type: 'targetUser' }], channels: ['IM'], templates: { IM: 'IM_WO_DISPATCH' }, contents: {}, enabled: true },
  { id: 'R05', name: '委派提醒', event: 'ticket.delegate', audience: 'internal',
    conditions: [], recipients: [{ type: 'delegatee' }],
    channels: ['IM', '邮件'],
    templates: { IM: 'IM_WO_DELEGATE' },
    contents: {
      邮件: {
        subject: '【工单委派通知】您有一条委派工单',
        body: '您好，有一条科大讯飞客服工单（${ticketNo}）已转派至您名下，请您尽快登录系统查看工单详情，并在规定时效内完成响应及处理。\n\n系统登陆地址：http://xfkf.iflytek.com/ngs/SSOVerifyLogin',
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

  /* ---------- 状态定扫 ---------- */
  { id: 'R14', name: '挂起临期提醒', event: 'hold.dailyCheck', audience: 'internal',
    // 剩 3/2/1/0 天各命中一次 = 业务要的"每日提醒"
    conditions: [{ field: 'daysLeft', op: 'lte', value: ['3'] }],
    recipients: [{ type: 'assignee' }], channels: ['邮件'], templates: {},
    contents: {
      邮件: {
        subject: '【挂起即将到期通知】您有一条工单挂起即将到期',
        body: '您好，您有一条工单：${ticketNo}，挂起即将到期，挂起时限截止：${holdUntil}。请尽快核实问题处理进展！\n系统登陆地址：http://xfkf.iflytek.com/ngs/SSOVerifyLogin',
      },
    },
    enabled: true },
  { id: 'R17', name: '长期挂起提醒', event: 'hold.dailyCheck', audience: 'internal',
    // 每隔 30：只在挂起满 30/60/90… 天当天命中，自挂起之日起算
    conditions: [{ field: 'heldDays', op: 'every', value: ['30'] }],
    recipients: [{ type: 'assignee' }], channels: ['邮件'], templates: {},
    contents: {
      邮件: {
        subject: '【长期挂起提醒】工单 ${ticketNo} 已挂起 ${heldDays} 天',
        body: '您好，工单 ${ticketNo} 已挂起 ${heldDays} 天（挂起时限截止：${holdUntil}），请核实是否仍需继续挂起。',
      },
    },
    enabled: true },
  { id: 'R15', name: '挂起到期提醒', event: 'ticket.resume', audience: 'internal',
    // 挂起到期自动解挂才发；人工解除不发（是处理人自己操作的）
    conditions: [{ field: 'resumeType', op: 'eq', value: ['到期自动解挂'] }],
    recipients: [{ type: 'assignee' }], channels: ['邮件'], templates: {},
    contents: {
      邮件: {
        subject: '【挂起到期通知】您有一条挂起工单已到期',
        body: '您好，您有一条工单：${ticketNo}已到期自动解除挂起，挂起时限截止：${holdUntil}。请尽快核实问题处理进展！\n\n系统登陆地址：http://xfkf.iflytek.com/ngs/SSOVerifyLogin',
      },
    },
    enabled: true },
  { id: 'R16', name: '预约到期提醒', event: 'appointment.dailyCheck', audience: 'internal',
    // 距预约 1 天当天命中一次
    conditions: [{ field: 'daysToAppt', op: 'eq', value: ['1'] }],
    recipients: [{ type: 'assignee' }], channels: ['IM'], templates: { IM: 'IM_APPT_DUE' }, contents: {}, enabled: true },

];

/** 客服系统统一登陆地址，各模板正文末尾引用 */
const LOGIN_URL = 'http://xfkf.iflytek.com/ngs/SSOVerifyLogin';

/* ============================ 模板库 ============================ */

export interface RuleTemplate {
  code: string;
  name: string;
  /** IM 消息标题；短信通道无标题 */
  subject?: string;
  body: string;
}

/** 模板库只覆盖模板通道（IM / 短信）；邮件与站内信无模板，正文写在规则里 */
export const RULE_TEMPLATES: Record<string, RuleTemplate[]> = {
  IM: [
    {
      code: 'IM_WO_DISPATCH', name: '工单派发提醒',
      subject: '【工单处理通知】您有一条工单待处理',
      body: `您好，客服系统有1条待处理工单(\${ticketNo}),工单标题为\${title},请于(\${responseDueTime})前响应客户，请尽快完成处理。\n\n系统登陆地址：${LOGIN_URL}`,
    },
    {
      code: 'IM_WO_CANCEL', name: '工单取消通知',
      subject: '【工单取消通知】您的待处理工单已被取消',
      body: `您的待处理工单：\${ticketNo}已被取消，工单已自动关闭，无需继续跟进处理。\n系统登陆地址：${LOGIN_URL}`,
    },
    {
      code: 'IM_SLA_RESPONSE_SOON', name: '响应即将超时提醒',
      subject: '【响应即将超时通知】您有一条工单响应即将超时',
      body: `您好，您有一条待处理工单：\${ticketNo}，响应即将超时（截止时间\${responseDueTime}），请您关注，并尽快完成首答响应。\n\n系统登陆地址：${LOGIN_URL}`,
    },
    {
      code: 'IM_SLA_RESPONSE_OVERDUE', name: '响应超时提醒',
      subject: '【响应超时通知】您有一条工单响应已超时',
      body: `您好，您有一条待处理工单：\${ticketNo}，响应已超时，请您尽快处理。\n\n系统登陆地址：${LOGIN_URL}`,
    },
    {
      code: 'IM_SLA_RESOLVE_SOON', name: '解决即将超时提醒',
      subject: '【解决即将超时通知】您有一条工单即将超时',
      body: `您好，您有一条处理中的工单：\${ticketNo}，解决即将超时（截止时间\${resolveDueTime}），请您关注，并尽快完成处理。\n\n系统登陆地址：${LOGIN_URL}`,
    },
    {
      code: 'IM_SLA_RESOLVE_OVERDUE', name: '解决超时提醒',
      subject: '【解决超时通知】您有一条工单已超时',
      body: `您好，您有一条处理中的工单：\${ticketNo}，解决已超时，请您尽快处理。\n\n系统登陆地址：${LOGIN_URL}`,
    },
    {
      code: 'IM_SLA_RESPONSE_ESCALATE', name: '响应超时升级通知',
      subject: '【响应超时升级通知】',
      body: `您好：工单编号\${ticketNo}，已超时预警\${warnCount}次，请您关注，可登陆${LOGIN_URL} 添加处理意见。`,
    },
    {
      code: 'IM_SLA_RESOLVE_ESCALATE', name: '处理超时升级通知',
      subject: '【处理超时升级通知】',
      body: `您好：工单编号\${ticketNo}，已超时预警\${warnCount}次，请您关注，可登陆${LOGIN_URL} 添加处理意见。`,
    },
    {
      code: 'IM_WO_RETURN', name: '退回工单通知',
      subject: '【退回工单通知】您有一条工单被退回',
      body: `您好，您有一条工单：\${ticketNo}，已被退回，请您重新完成处理。\n\n系统登陆地址：${LOGIN_URL}`,
    },
    {
      code: 'IM_HOLD_REJECT', name: '拒绝挂起通知',
      subject: '【拒绝挂起通知】您有一条挂起工单被拒绝',
      body: `您好，您有一条工单：\${ticketNo}，挂起已被拒绝，请您重新完成处理。\n\n系统登陆地址：${LOGIN_URL}`,
    },
    {
      code: 'IM_HOLD_DUE_SOON', name: '挂起即将到期提醒',
      subject: '【挂起即将到期通知】您有一条工单挂起即将到期',
      body: `您好，您有一条工单：\${ticketNo}，挂起即将到期，挂起时限截止：\${holdUntil}。请尽快核实问题处理进展！\n系统登陆地址：${LOGIN_URL}`,
    },
    {
      code: 'IM_HOLD_EXPIRED', name: '挂起到期提醒',
      subject: '【挂起到期通知】您有一条挂起工单已到期',
      body: `您好，您有一条工单：\${ticketNo}已到期自动解除挂起，挂起时限截止：\${holdUntil}。请尽快核实问题处理进展！\n\n系统登陆地址：${LOGIN_URL}`,
    },
    {
      code: 'IM_APPROVAL_PENDING', name: '待审核通知',
      subject: '【待审核通知】您有一条工单待审核',
      body: `您好，您有一条工单待审核：\${ticketNo}，请您尽快完成处理\n\n系统登陆地址：${LOGIN_URL}`,
    },
    {
      code: 'IM_WO_DELEGATE', name: '工单委派通知',
      subject: '【工单委派通知】您有一条委派工单',
      body: `您好，有一条科大讯飞客服工单（\${ticketNo}）已转派至您名下，请您尽快登录系统查看工单详情，并在规定时效内完成响应及处理。\n\n系统登陆地址：${LOGIN_URL}`,
    },
    {
      code: 'IM_COMMENT_MENTION', name: '工单 @ 通知',
      subject: '【工单@通知】${mentionerId}在评论区提到了您',
      body: '您好，${mentionerId}在工单：${ticketNo} 的评论区提到了您，请点击下方链接查看完整工单详情及评论区，及时回复或处理。\n\n链接地址：${deepLink}',
    },
    /* ---- 以下模板业务清单未单列，保留供对应规则使用 ---- */
    {
      code: 'IM_WO_SUPPLEMENT', name: '工单补充通知',
      subject: '【工单补充通知】客户补充了新信息',
      body: `您好，工单 \${ticketNo}（\${title}）新增一条补充信息（\${supplementType}），请及时查阅并跟进。\n\n系统登陆地址：${LOGIN_URL}`,
    },
    {
      code: 'IM_WO_URGE', name: '工单催办通知',
      subject: '【工单催办通知】客户催办',
      body: `您好，工单 \${ticketNo}（\${title}）客户已催办：\${urgeContent}，请尽快处理并回复客户。\n\n系统登陆地址：${LOGIN_URL}`,
    },
    {
      code: 'IM_APPT_DUE', name: '预约到期提醒',
      subject: '【预约到期提醒】您有一条预约即将到期',
      body: `您好，工单 \${ticketNo}（\${title}）的预约时间为 \${apptTime}，请及时安排上门 / 回访。\n\n系统登陆地址：${LOGIN_URL}`,
    },
    {
      code: 'IM_WO_GENERIC', name: '工单通用提醒',
      subject: '【工单提醒】',
      body: '工单 ${ticketNo}（${title}）有新动态，请及时查看：${deepLink}',
    },
  ],
  短信: [
    { code: 'SMS_WO_ACCEPTED', name: '建单受理通知', body: '【科大讯飞】尊敬的用户您好，您反馈的${productName}问题已收到，工单号为 ${ticketNo}，我们已安排专人跟进处理。处理进度会通过短信或0551开头的电话同步给您，烦请保持手机畅通，耐心等待。感谢您的信任与支持' },
  ],
};

/* ============================ 规则测试的预设数据 ============================ */

/**
 * 规则测试用的**构造数据**，不是真实工单。
 *
 * 为什么不挂真实工单：
 *   ① 数据权限——运营管理员未必有权查看任意一张工单的客户姓名与手机号，
 *      而测试要渲染正文，等于把 ${customerPhone} 明文摊在配置页上；
 *   ② 选真实单只能碰运气碰到想测的组合。要验证"无线音乐业务不发对客短信"，
 *      得先翻出一张无线音乐的单；构造数据把 bizType 一改即可。
 *
 * 所以这里给的是**几组典型取值**，进测试弹窗后逐字段可改——
 * 规则测试测的是配置本身对不对，不是查某张单会不会发。
 *
 * 人名与工单号沿用项目既有 mock（users.ts / tickets.ts）的写法，
 * 免得原型里出现两套人名、两套单号规则。
 */
export interface TestPreset {
  id: string;
  label: string;
  data: Record<string, string>;
}

export const TEST_PRESETS: TestPreset[] = [
  {
    id: 'P1', label: '典型对内场景 · 热线来源 · 咨询单',
    data: {
      ticketNo: 'LCMN-20260728-90001', title: '扫地机器人无法开机', ticketType: '咨询',
      source: '热线电话', bizType: '智能硬件', productName: '扫地机器人R2', customerName: '孙权', customerPhone: '138****2046',
      assigneeId: '林坐席', creatorId: '张三',
      responseDueTime: '2026-07-28 16:30',
      resolveDueTime: '2026-07-29 16:30',
      warnCount: '2',
      returnFrom: '技术支持', returnReason: '需客户补充设备序列号',
      holdUntil: '2026-08-05', daysLeft: '2', heldDays: '12', apptTime: '2026-08-02 14:00', daysToAppt: '1',
      resumeType: '到期自动解挂', dispatchFrom: '建单',
      operatorId: '张三', targetUserId: '王坐席', crossGroup: '否',
      prevAssigneeId: '张三',
      delegateeIds: '陈坐席', delegateTask: '协助排查主板供电',
      escalateTargetId: '王组长', aftersaleReceiverId: '李四',
      newTicketNo: 'LCMN-20260728-90009', isSuggestion: '否',
      holdReason: '等待客户寄回设备', closeReason: '问题已解决',
      supplementType: '补充信息', supplementContent: '设备序列号 SN20250612XY',
      urgeContent: '客户表示已等待两天', urgeCount: '2',
      mentionedIds: '林坐席', mentionerId: '张三',
      commentText: '客户补充了序列号，请查看附件',
      apptType: '上门',
      approverIds: '王组长', applicantId: '林坐席',
      approvalType: '挂起', rejectReason: '挂起时长超出上限，请缩短至 7 天内',
      deepLink: 'https://xfkf.iflytek.com/t/90001',
    },
  },
  {
    id: 'P2', label: '对客抑制场景 · 内投渠道 · 投诉单',
    data: {
      ticketNo: 'LCMN-20260728-90002', title: '投诉客服响应慢', ticketType: '投诉',
      source: '内投渠道', bizType: '教育', productName: '学习机 T20', customerName: '刘备', customerPhone: '139****8821',
      assigneeId: '陈坐席', creatorId: '张三',
      responseDueTime: '2026-07-28 15:00',
      dispatchFrom: '建单',
      deepLink: 'https://xfkf.iflytek.com/t/90002',
    },
  },
  {
    id: 'P3', label: '对客抑制场景 · 无线音乐业务 · 建议单',
    data: {
      ticketNo: 'LCMN-20260728-90003', title: '希望增加歌单导入', ticketType: '建议',
      source: '客户服务小程序', bizType: '无线音乐', productName: '讯飞智能耳机', customerName: '曹操', customerPhone: '137****5510',
      assigneeId: '王坐席', creatorId: '王组长', isSuggestion: '是',
      responseDueTime: '2026-07-29 10:00',
      dispatchFrom: '建单',
      deepLink: 'https://xfkf.iflytek.com/t/90003',
    },
  },
];

/**
 * 组织树（供「上级(N)」解析演示）。
 * 只有两级——配「上级(3)」时会解析为空，正好演示越界报错。
 */
export const SUPERIOR_CHAIN: Record<string, string[]> = {
  '林坐席': ['王组长', '赵管理'],
  '王坐席': ['王组长', '赵管理'],
  '陈坐席': ['王组长', '赵管理'],
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
  { time: '2026-07-28 14:18:44', ticketNo: 'IFLYKF20260728002', ruleId: 'R02', ruleName: '建单受理通知', recipient: '139****8821', channel: '短信', result: '已跳过', skipReason: '不满足触发条件：工单来源「内投渠道」属于排除项' },
  { time: '2026-07-28 14:18:44', ticketNo: 'IFLYKF20260728002', ruleId: 'R01', ruleName: '建单派发通知', recipient: '陈静（投诉专席）', channel: 'IM', result: '已发送' },
  { time: '2026-07-28 13:55:02', ticketNo: 'IFLYKF20260728003', ruleId: 'R02', ruleName: '建单受理通知', recipient: '137****5510', channel: '短信', result: '已跳过', skipReason: '不满足触发条件：业务分类「无线音乐」属于排除项' },
  { time: '2026-07-28 11:40:31', ticketNo: 'IFLYKF20260727088', ruleId: 'R10', ruleName: '审核提醒', recipient: '—', channel: 'IM', result: '已跳过', skipReason: '收件人解析为空：该审批单未配置审核组' },
  { time: '2026-07-28 10:12:07', ticketNo: 'IFLYKF20260727061', ruleId: 'R11', ruleName: '评论区 @ 提醒', recipient: '钱伟（技术支持）', channel: 'IM', result: '发送失败', skipReason: '渠道返回：该用户未完成 i讯飞账号映射' },
  { time: '2026-07-28 09:30:55', ticketNo: 'IFLYKF20260727054', ruleId: 'R08', ruleName: '退回提醒（技术支持）', recipient: '—', channel: 'IM', result: '已跳过', skipReason: '不满足触发条件：退回来源环节为「调研」' },
  { time: '2026-07-28 08:00:12', ticketNo: 'IFLYKF20260715022', ruleId: 'R14', ruleName: '挂起即将到期提醒', recipient: '周涛（产品支持组）', channel: '邮件', result: '已发送' },
  { time: '2026-07-28 08:00:12', ticketNo: 'IFLYKF20260710009', ruleId: 'R14', ruleName: '挂起即将到期提醒', recipient: '—', channel: '邮件', result: '已跳过', skipReason: '规则已停用' },
];


/* ============================ 工具函数 ============================ */

export const eventOf = (code: string) => NOTIFY_EVENTS.find((e) => e.code === code);
export const recipientTypeOf = (code: string) => RECIPIENT_TYPES.find((r) => r.code === code);

/** 某事件下可用的收件人类型：field 型需事件属性含对应字段 */
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
export const templateVars = (t: RuleTemplate) => varsIn(t.subject, t.body);

/** 取当前选中的模板对象 */
export function templateOf(ch: string, code: string): RuleTemplate | undefined {
  return (RULE_TEMPLATES[ch] ?? []).find((t) => t.code === code);
}

/** 条件显示文本 */
export function condLabel(c: RuleCondition, eventCode: string): string {
  const f = eventOf(eventCode)?.payload.find((p) => p.key === c.field);
  return `${f?.label ?? c.field} ${COND_OP_LABEL[c.op]} ${c.value.join(' / ')}`;
}
