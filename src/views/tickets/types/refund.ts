/**
 * 个册退费单 · 常量与字段组类型 —— **单一真源**（1120 个册退费工单 PRD / 03 定稿口径）。
 *
 * 个册退费单＝咨询单 + 建单时写入的「个册退费」标识（同刷机单的做法）。建单卡片、处理页「退费信息」区块、
 * 移动工单 H5、列表标识、查询筛选**只从这里取**枚举、文案与类型。
 *
 * 本文件只放**常量、类型与纯函数**，不依赖 Pinia / 工单库。
 */
import type { TlRole } from '@/views/tickets/types/ticketDetail';
import { LOGIN_URL, templateOf } from '@/mock/notifyRules';

/** 个册退费单的工单类型：咨询单 + 「个册退费」标识 */
export const REFUND_TICKET_TYPE = '咨询' as const;

/** 标识展示名（类型位徽标、查询筛选项） */
export const REFUND_MARK_LABEL = '个册退费';

/**
 * 是否个册退费单 —— **全仓唯一判据**：读工单上的 `isRefund` 标识。
 * 标识在建单时按「所选产品的问题分类『是否个册退费』＝是」写入（后台问题分类维护），此后不可修改。
 */
export function isRefundTicket(t: { isRefund?: boolean } | null | undefined): boolean {
  return t?.isRefund === true;
}

/* ------------------------------------------------------------------ */
/* 识别：产品 + 问题分类                                                 */
/* ------------------------------------------------------------------ */

/** 个性化学习手册所在的产品分类 */
export const REFUND_PRODUCT_CATEGORY = '软件服务';
/** 识别要求的产品 */
export const REFUND_PRODUCT_NAME = '个性化学习手册';
/**
 * 「是否个册退费」出厂为是的问题分类：售后 → 退费申请 → 个册退费（种子单与出厂配置用）。
 * 识别读后台「问题分类」的开关（`stores/refundConfig.ts`），不读这里。
 */
export const REFUND_TAG_L1 = '售后';
export const REFUND_TAG_L2 = '退费申请';
export const REFUND_TAG_L3S = ['个册退费'] as const;

/* ------------------------------------------------------------------ */
/* 子状态 / 池 / 处理人                                                  */
/* ------------------------------------------------------------------ */

/** 新增子状态：提交退费后等产线结果，归「处理中」分组，处理人「系统」 */
export const REFUND_STATUS_SYSTEM = '系统退费中' as const;
/** 「系统退费中」的处理人 */
export const REFUND_SYSTEM_HANDLER = '系统';

/** 教育退费审核组（兜底池、退费成功自动下送、校园经理选「否」下送都进这里） */
export const REFUND_POOL_GROUP_ID = 'edu-refund';
export const REFUND_POOL_GROUP_NAME = '教育退费审核组';

/** 外部处理人的类别（不进角色体系，只记姓名与域账号） */
export type RefundManagerKind = '校园经理' | '城市经理';

export interface RefundManager {
  name: string;
  /** 域账号 */
  account: string;
  kind: RefundManagerKind;
}

/* ------------------------------------------------------------------ */
/* 枚举                                                                 */
/* ------------------------------------------------------------------ */

/** 退款原因（编码即产线接口 refundReason） */
export const REFUND_REASONS = [
  { code: 1, label: '购买错误' },
  { code: 2, label: '退差价' },
  { code: 3, label: '教师子女、贫困生' },
  { code: 4, label: '退学、休学、保送、转校、转专业、艺术生、疫情' },
  { code: 5, label: '学校不使用、订购人数少、老师让退' },
  { code: 6, label: '没有时间做' },
  { code: 7, label: '作用不大、效果不明显' },
  { code: 8, label: '其他' },
] as const;
export type RefundReasonCode = (typeof REFUND_REASONS)[number]['code'];

export function refundReasonLabel(code?: number | null): string {
  return REFUND_REASONS.find((r) => r.code === code)?.label ?? '';
}

/** 退回方式只有「原路退回」 */
export const REFUND_RETURN_WAY = '原路退回';
/** 退费方只有「我司」 */
export const REFUND_PARTY = '我司';

/** 沟通结果 */
export const REFUND_COMM_RESULTS = ['已联系达成一致', '已联系未达成一致', '特殊原因未联系'] as const;
export type RefundCommResult = (typeof REFUND_COMM_RESULTS)[number];
/** 需写备注的沟通结果 */
export const REFUND_COMM_NOTE_RESULTS: readonly RefundCommResult[] = ['已联系未达成一致', '特殊原因未联系'];
export const REFUND_COMM_NOTE_PLACEHOLDER = '未达成一致 / 未联系原因、是否需要协助沟通';

/** 文本字段上限 */
export const REFUND_TEXT_MAX = 120;

/** 产线退费结果（taskStatus 0–4） */
export const REFUND_TASK_STATUSES = ['待审核', '待退费', '已驳回', '退费成功', '部分完成'] as const;
export type RefundTaskStatus = (typeof REFUND_TASK_STATUSES)[number];
/** 产线仍在处理（本单留「系统退费中」） */
export function isRefundTaskPending(s: RefundTaskStatus): boolean {
  return s === '待审核' || s === '待退费';
}

/** 我司退费结果（工单上回写的取值） */
export type RefundOwnResult = '已完成' | '部分完成' | '已驳回';
export function refundOwnResultOf(s: RefundTaskStatus): RefundOwnResult | '' {
  if (s === '退费成功') return '已完成';
  if (s === '部分完成') return '部分完成';
  if (s === '已驳回') return '已驳回';
  return '';
}

/** 「退费处理」进度卡的退费状态 */
export type RefundProgress = '待提交' | '系统退费中' | '已驳回' | '退费成功' | '部分完成';
export function refundProgressOf(lastRun?: Pick<RefundRun, 'status'>): RefundProgress {
  if (!lastRun) return '待提交';
  if (isRefundTaskPending(lastRun.status)) return '系统退费中';
  return lastRun.status as RefundProgress;
}

/* ------------------------------------------------------------------ */
/* 字段组类型                                                           */
/* ------------------------------------------------------------------ */

/** 可退学科一行（产线返回；金额＝可退金额，按已交付次数计算） */
export interface RefundSubject {
  commodityId: string;
  commodityName: string;
  payOrderId: string;
  subjectCode: string;
  subjectName: string;
  /** 可退金额（元） */
  amount: number;
}

/** 建单「退费信息」卡落库的值 */
export interface RefundInfo {
  schoolId: string;
  schoolName: string;
  /** 学校所在省 / 市（「省 / 市 / 区」） */
  schoolRegion: string;
  studentName: string;
  /** 智学号（登录账号） */
  studentCode: string;
  orderNo: string;
  /** 建单时所选订单的可退金额合计；手填订单号为空 */
  refundableAmount?: number;
  reason: RefundReasonCode | null;
}

/** 移动工单 H5 退费信息表单（最近保存值） */
export interface RefundHandle {
  submitRefund: '是' | '否' | '';
  commResult: RefundCommResult | '';
  commNote: string;
  orderNo: string;
  studentCode: string;
  /** 所选退费商品（逐学科） */
  subjects: RefundSubject[];
  reason: RefundReasonCode | null;
  reasonDesc: string;
  closeAuth: '是' | '否' | '';
  notCloseReason: string;
  remark: string;
  savedBy?: string;
  savedAt?: string;
}

/** 退费记录一行（每次提交一行，再次提交另起一行） */
export interface RefundRun {
  id: string;
  seq: number;
  /** 提交时间（年-月-日 时:分:秒） */
  submittedAt: string;
  submittedAtMs: number;
  /** 提交人（校园经理姓名） */
  submitter: string;
  submitterAccount: string;
  /** 退费任务号（产线返回） */
  taskId: string;
  items: RefundSubject[];
  status: RefundTaskStatus;
  /** 驳回原因（已驳回时） */
  rejectReason?: string;
  /** 最近一次结果变化时刻 */
  resultAt?: string;
  /** 本次提交时的关闭权限设置 */
  closeAuth: '是' | '否';
  notCloseReason?: string;
  /**
   * 定时查询的推算点（原型按提交时刻推算产线结果，刷新页面续得上）：到 `pendingAtMs` 转「待退费」，
   * 到 `settleAtMs` 出 `finalStatus`。种子单的在途记录不带，停在当前结果。
   */
  pendingAtMs?: number;
  settleAtMs?: number;
  finalStatus?: RefundTaskStatus;
  finalRejectReason?: string;
}

/** 本单的处理状态与 SLA 账本（账本字段与刷机单同名，读数走同一套 `readFlashSla`） */
export interface RefundState {
  /** 当前外部处理人（校园经理 / 城市经理）；在系统、池或组员名下时为空 */
  manager?: RefundManager;
  /** 最近一次提交退费的校园经理（驳回回退、系统退费中的催补通知落给他） */
  lastSubmitter?: RefundManager;
  /** 关联投诉单号（弱关联，两单各自流转） */
  linkedComplaintNos?: string[];
  /** SLA 起算：首次进入教育退费审核组的时刻；外部处理人名下、系统退费中不计 */
  slaStartedAt?: string;
  slaPausedAccumMs?: number;
  slaPausedSince?: string;
  slaStoppedAt?: string;
  slaOutcome?: 'met' | 'breached' | 'void';
}

/** 工单上挂的个册退费字段组 */
export interface TicketRefund {
  info: RefundInfo;
  handle: RefundHandle;
  state: RefundState;
  runs: RefundRun[];
}

export function emptyRefundHandle(info?: Pick<RefundInfo, 'orderNo' | 'studentCode' | 'reason'>): RefundHandle {
  return {
    submitRefund: '',
    commResult: '',
    commNote: '',
    orderNo: info?.orderNo ?? '',
    studentCode: info?.studentCode ?? '',
    subjects: [],
    reason: info?.reason ?? null,
    reasonDesc: '',
    closeAuth: '',
    notCloseReason: '',
    remark: '',
  };
}

/** 本单在途的退费（同一时间至多一笔） */
export function inflightRefundRun(r: Pick<TicketRefund, 'runs'> | undefined): RefundRun | undefined {
  return r?.runs.find((x) => isRefundTaskPending(x.status));
}

/** 「〈套餐〉 · 〈学科〉 〈金额〉 元」 */
export function refundItemText(s: Pick<RefundSubject, 'commodityName' | 'subjectName' | 'amount'>): string {
  return `${s.commodityName} · ${s.subjectName} ${formatRefundAmount(s.amount)} 元`;
}

/** 金额两位小数 */
export function formatRefundAmount(n: number | undefined | null): string {
  return typeof n === 'number' ? n.toFixed(2) : '';
}

export function sumRefundAmount(items: Pick<RefundSubject, 'amount'>[]): number {
  return Math.round(items.reduce((a, b) => a + b.amount, 0) * 100) / 100;
}

/* ------------------------------------------------------------------ */
/* 文案（PRD 原文）                                                     */
/* ------------------------------------------------------------------ */

export const REFUND_FIELD_LABELS = {
  school: '学校',
  studentName: '学生姓名',
  studentCode: '智学号',
  packages: '可退套餐',
  orderNo: '订单号',
  refundableAmount: '可退金额',
  reason: '退款原因',
  returnWay: '退回方式',
} as const;

export const REFUND_TIP = {
  pickSchoolFirst: '请先选择学校',
  fillCodeFirst: '请先填写智学号',
  noPackages: '该学生暂无可退套餐，请核对学校与智学号',
  queryFailed: '可退套餐查询失败，请稍后重试或手填订单号',
  noSpace: (label: string) => `${label}不能包含空格`,
  /** 「系统退费中」底栏 / 取消工单 / 查询中心调剂的置灰悬停 */
  inProgress: '退费处理中，产线返回结果后再操作',
  /** H5：系统退费中打开本单后保存 / 下送 / 转办 */
  h5Locked: '工单已提交退费，当前不可操作',
  /** 本单已有在途退费 */
  inflight: '本单已有退费申请在处理中，请等待结果',
  orderNoPackages: '该订单暂无可退套餐',
  tooLong: (label: string) => `${label}最多 ${REFUND_TEXT_MAX} 字`,
  submitFailed: (msg: string) => `退费申请提交失败：${msg}`,
  submitUnavailable: '退费申请提交失败，请稍后重试',
} as const;

export const REFUND_TOAST = {
  createdToManager: (no: string, name: string) => `已创建个册退费单 ${no}，已派给 ${name}`,
  createdToPool: (no: string) => `已创建个册退费单 ${no}，已转${REFUND_POOL_GROUP_NAME}`,
  submitted: '退费申请已提交',
} as const;

/** 处理履历正文 */
export const REFUND_TL = {
  /** 附录 B：建单记「建单」（工单来源同咨询单另见页头） */
  create: (_source: string) => '建单',
  dispatchManager: (m: RefundManager) => `按学校派单 → ${m.kind} ${m.name}`,
  dispatchPool: `按学校未取到校园经理、城市经理 → ${REFUND_POOL_GROUP_NAME}工单池`,
  save: '保存退费信息',
  submit: (taskId: string, items: RefundSubject[]) =>
    `提交退费 · 退费任务号 ${taskId}；${items.map(refundItemText).join('；')}`,
  submitFail: (msg: string) => `提交退费未成功：${msg}`,
  forwardNo: (remark: string) => `不提交退费，下送${REFUND_POOL_GROUP_NAME}${remark ? `；备注：${remark}` : ''}`,
  transfer: (from: string, to: RefundManager) => `转办：${from} → ${to.kind} ${to.name}`,
  /** 附录 B：结果回写记我司退费结果；已驳回时带驳回原因（待审核 / 待退费只记产线结果） */
  result: (taskId: string, s: RefundTaskStatus, rejectReason?: string) => {
    const own = refundOwnResultOf(s);
    const body = own ? `我司退费结果：${own}` : `产线结果：${s}`;
    return `退费任务号 ${taskId} · ${body}${s === '已驳回' && rejectReason ? `；驳回原因：${rejectReason}` : ''}`;
  },
  autoForward: (s: RefundTaskStatus) => `${s}，自动下送${REFUND_POOL_GROUP_NAME}`,
  rejectBack: (reason: string, to: string) => `已驳回，驳回原因：${reason}；退回 ${to}`,
  assignManager: (m: RefundManager) => `调剂给${m.kind} ${m.name}`,
  forwardSurvey: '下送，工单进入「调研中」',
  linkComplaint: (no: string) => `关联投诉单 ${no}`,
  linkedFromRefund: (no: string) => `关联个册退费单 ${no}`,
} as const;

/** 关联投诉预填的问题描述 */
export function refundLinkComplaintDesc(no: string): string {
  return `关联个册退费单 ${no}`;
}

/* ------------------------------------------------------------------ */
/* 通知                                                                 */
/* ------------------------------------------------------------------ */

/** 移动工单 H5 地址（待办短信内的链接，打开即定位本单） */
export function refundH5Path(no: string): string {
  return `/m/refund/ticket?no=${no}`;
}
/** 短信正文里的 H5 完整链接：客服系统统一登录地址同一域名 + H5 地址 */
export function refundH5Url(no: string): string {
  return `${new URL(LOGIN_URL).origin}${refundH5Path(no)}`;
}
/** 通知内容里的 H5 链接（含域名；通知记录 Tab 据此渲染为可点） */
export const REFUND_H5_LINK_RE = /((?:https?:\/\/[^\s/]+)?\/m\/refund\/ticket\?no=[A-Za-z0-9-]+)/;

export function refundTodoSms(no: string): string {
  return `【讯飞客服】您有一张个册退费工单待处理，工单号：${no}，请登录天鹰APP工作台处理：${refundH5Url(no)}`;
}
export function refundUrgeSms(no: string, kind: 'urge' | 'supplement'): string {
  return kind === 'urge'
    ? `【讯飞客服】客户已催单，请优先处理个册退费工单 ${no}：${refundH5Url(no)}`
    : `【讯飞客服】客户补充了新信息，请及时查阅个册退费工单 ${no}：${refundH5Url(no)}`;
}
/** 到组通知：沿用咨询单待领取通知文案（IM 模板「工单池待领取提醒」IM_WO_POOLED） */
export function refundPooledImText(no: string): string {
  return (templateOf('IM', 'IM_WO_POOLED')?.body ?? '')
    .replace('${groupName}', REFUND_POOL_GROUP_NAME)
    .replace('${ticketNo}', no)
    .replace('${loginUrl}', LOGIN_URL);
}
export function refundSurveySms(no: string): string {
  return `【讯飞客服】您的个册退费诉求已处理完毕，请对本次服务进行评价。工单号：${no}。`;
}

export const REFUND_NOTIFY_EVENTS = {
  todo: 'ticket.refund.todo',
  urge: 'ticket.dunning.received',
  supplement: 'ticket.supplement.received',
  pooled: 'ticket.pooled',
  survey: 'ticket.survey.sent',
} as const;

/** 履历角色徽章：外部处理人不进角色体系，履历上按其类别（校园经理 / 城市经理）落徽章 */
export function refundManagerTlRole(m: Pick<RefundManager, 'kind'>): TlRole {
  return m.kind;
}

/** 产线结果对账节奏（原型按提交时刻推算：先「待退费」，再出终态） */
export const REFUND_PENDING_STEP_MS = 15_000;
export const REFUND_RESULT_DELAY_MS = 30_000;
