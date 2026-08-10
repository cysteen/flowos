import type { TlRole, TimelineEntry, TimelineFieldChange } from '@/views/tickets/types/ticketDetail';
import type { TicketDetailMeta, FeishuRecord, LinkedAftersale } from '@/mock/ticketDetail';
import { AFTERSALE_INBOUND_SOURCE } from '@/views/tickets/types/createTicket';

/** 升级通道 · 飞书项目（消费者BG专属，走 OpenAPI 推送产研反馈单） */
export const FEISHU_ESCALATE_CHANNEL = '飞书项目 · 产研反馈单';

// 工单处理态状态机（轻量）：
// 待受理 → 处理中 →（已升级 / 已挂起 / 待审核）→ 待回访 → 已结案 → 已关闭
export type TicketOpState =
  | 'processing'  // 处理中
  | 'suspended'   // 已挂起
  | 'review'      // 待审核（下送后）
  | 'resolved'    // 待回访（标记已解决后）
  | 'settled'     // 已结案（强结/正常结案后）
  | 'transferred' // 已转出（非诉转售后后的等待态：原单不关闭、客服侧冻结，等售后回传终态）
  | 'closed'      // 已关闭
  | 'archived'    // 已归档
  | 'cancelled';  // 已取消

export interface SuspendInfo {
  reason: string;
  detail: string;
  resumeAt: string;
  operator: string;
  at: string;
}

// 规范的 9 子流程操作 + 常驻（保存/标记已解决）+ 管理类（关闭/归档/取消）
export type OpActionType =
  | '保存草稿' | '标记已解决'
  | '调剂' | '委派' | '下送' | '撤回' | '强结'
  | '挂起' | '恢复' | '退回' | '升级' | '同步飞书' | '转售后' | '升级投诉' | '撤销委派'
  | '激活飞书' | '激活售后'
  | '关闭工单' | '归档工单' | '取消工单';

export interface TransferPayload { scope: 'same' | 'cross'; target: string; reason: string; }
/** 委派到人：逐人任务说明 */
export interface DelegateAssigneeTask { name: string; task: string; }
export interface DelegatePayload {
  mode: 'person' | 'group';
  /** 到人：多人姓名用顿号拼接；到组：组名 */
  target: string;
  /** 到组：整体任务说明；到人时可空（以 assignees 为准） */
  reason: string;
  /** 到人时：多人 + 逐人任务说明 */
  assignees?: DelegateAssigneeTask[];
}
/**
 * 下送 = 送到下一个节点，落点取决于当前所在节点：
 * 普通处理节点 → 标记已解决·正常结案（待回访）；委派节点 → 回到委派节点（不结案）。
 */
export interface ForwardPayload { ticketTitle: string; backToDelegator?: boolean; }
export interface ForceClosePayload { reason: string; approver: string; detail: string; }
export interface SuspendPayload {
  reason: string;
  detail: string;
  resumeAt: string;
  /** 服务类型（恢复后按「服务方式×优先级」矩阵续算解决时限，故挂起前必须有值） */
  serviceType: string;
  /** 服务方式（同上） */
  serviceMethod: string;
  /** 审批组：挂起停表须经审批，由该组接单审批 */
  approvalGroup: string;
}
export interface EscalatePayload {
  channel: string;
  group: string;
  member: string;
  detail: string;
  /** 飞书项目通道必选：问题反馈分类 */
  feedbackCategory?: string;
}
export interface FeishuActivatePayload { reason: string; }
/**
 * 升级投诉（文档名「关联投诉」）：原单升级为更高阶投诉新单后，关闭原单。
 * 目标类型/同步/关联规则见《【815】关联投诉 PRD》，判定逻辑在 composables/complaintEscalation.ts。
 */
export interface EscalateComplaintPayload {
  /** 目标投诉类型：人员投诉 / 业务投诉 / 外投 */
  target: string;
  /** 新投诉单单号 */
  newNo: string;
  /** 升级原因 */
  note: string;
}
/** 处理登记（保存并登记）：坐席本次处理内容摘要 + 字段级变更，写入处理履历 */
export interface ProcessLogData { summary: string; attachment?: string; changes?: TimelineFieldChange[]; }
export interface SyncFeishuPayload { space: string; message: string; }
export interface AftersalePayload {
  /** 售后服务类型（坐席在售后建单页选） */
  serviceType: string;
  /** 售后服务方式 */
  serviceMethod: string;
  /** 转出说明 */
  detail: string;
}

/**
 * 售后单终态集合——判"是否结案"的唯一依据。
 * 结案与否决定坐席还能不能在线推进：未结案可跳售后系统补充/催单，已结案只能线下联系售后。
 * ⚠️ 该集合需与售后侧的状态枚举对齐（PRD §待讨论 5）。
 */
const AFTERSALE_SETTLED_STATUS = ['已完成', '已关闭', '已取消'];

export function isAftersaleSettled(status: string): boolean {
  return AFTERSALE_SETTLED_STATUS.includes(status);
}

/**
 * 售后转入判据（同升级投诉门禁①，判据＝工单来源）。
 * 这类单的「转售后」不建新单，改为激活来源售后单——1:1 关联位已被它占着，
 * 再建一张就会产生一张与原售后单无法建联的孤单（同 D12 的理由）。
 */
export function isAftersaleInbound(detail: { source?: string }): boolean {
  return detail.source === AFTERSALE_INBOUND_SOURCE;
}

/**
 * 售后系统深链前缀。关联ID（售后工单号）拼进 URL 即得该单详情页地址，
 * 展示在关联单卡片上供坐席点击跳转；完整 URL 规范与鉴权待与售后侧对齐（PRD §待讨论 3）。
 */
export const AFTERSALE_DEEPLINK_BASE = 'https://aftersale.iflytek.com/ticket/detail';

export function aftersaleDeepLink(no: string): string {
  return `${AFTERSALE_DEEPLINK_BASE}?no=${no}`;
}

/** 转售后弹窗上下文：投诉分流 + 预填字段 + 已有关联售后单（有关联则封口，不再建单） */
export interface AftersaleContext {
  /** 投诉工单：建关联单、投诉单独立跑（状态不变）；非诉：原单进「已转出」等待售后终态 */
  isComplaint: boolean;
  customerName: string;
  customerPhone?: string;
  region: string;
  address: string;
  productCategory: string;
  productName: string;
  sn?: string;
  /**
   * 已有 1:1 关联售后单 → 入口封口、不再建单（D2 改写，激活动作取消）。
   * `settled` 决定提示与出路：false=引导去关联单 Tab 跳售后跟进；true=只能线下联系售后。
   */
  existing?: { no: string; title?: string; serviceType: string; status: string; settled: boolean };
}
/** 售后转入单再点「转售后」＝激活原关联售后单，不建第二张（见 api/aftersaleActivate.ts） */
export interface AftersaleActivatePayload {
  /** 被激活的售后工单号 */
  no: string;
  /** 售后单标题，写履历用 */
  title?: string;
  /** 激活后的售后状态，由售后接口回传 */
  status: string;
}
export interface ResolvePayload { solution: string; createCallback: boolean; }
/** 关闭工单 = 异常结案，须审核通过后才真正关闭 */
export interface ClosePayload {
  /** 关闭原因（为什么关，区别于「处理结果」） */
  reason: string;
  /** 审核组：由该组接单审批 */
  approvalGroup: string;
  /** 备注，供审核人判断 */
  note: string;
}
export interface ArchivePayload { reason: string; retention: string; }
export interface ResumePayload { reason: string; detail: string; }
/** 退回：技术支持把升级过来的工单退回给工单处理人（唯一方向，无目标节点可选） */
export interface ReturnPayload { reason: string; note: string; }

export type OpActionPayload =
  | { type: '保存草稿'; process?: ProcessLogData }
  | { type: '调剂'; data: TransferPayload }
  | { type: '委派'; data: DelegatePayload }
  | { type: '撤销委派' }
  | { type: '下送'; data: ForwardPayload }
  | { type: '强结'; data: ForceClosePayload }
  | { type: '挂起'; data: SuspendPayload }
  | { type: '升级'; data: EscalatePayload }
  | { type: '同步飞书'; data: SyncFeishuPayload }
  | { type: '激活飞书'; data: FeishuActivatePayload }
  | { type: '转售后'; data: AftersalePayload }
  | { type: '激活售后'; data: AftersaleActivatePayload }
  | { type: '升级投诉'; data: EscalateComplaintPayload }
  | { type: '标记已解决'; data: ResolvePayload }
  | { type: '撤回' }
  | { type: '恢复'; data: ResumePayload }
  | { type: '退回'; data: ReturnPayload }
  | { type: '关闭工单'; data: ClosePayload }
  | { type: '归档工单'; data: ArchivePayload }
  | { type: '取消工单'; reason: string };

/** 调剂候选 · 同组内：目标是「人」，从本组成员中选 */
export const TRANSFER_TARGETS_SAME = [
  '赵六',
  '王八',
];
/** 调剂候选 · 跨组：目标是「组」，不指定组内具体的人，转入后由该组领取 */
export const TRANSFER_TARGET_GROUPS = [
  '大客户专属组',
  '二线技术支持组',
  '售后服务组',
  '退费处理组',
];
/** 可跨组调剂的角色：班组长、运营管理员等管理角色；二线处理人仅限同组内 */
export const CROSS_GROUP_TRANSFER_ROLES = ['team-leader', 'ops-admin', 'system-admin', 'tenant-admin'];
export const DELEGATE_TARGETS = [
  '钱七',
  '孙十',
  '李四',
];
export const DELEGATE_GROUPS = [
  '技术售前组',
  '质检协助组',
  '产品反馈组',
  '大客户协同组',
];
export const REVIEWERS = ['班组长 · 王经理', '质检审核 · 李审核', '上级主管 · 张总监'];
export const FORCE_CLOSE_REASONS = ['客户失联', '客户主动放弃', '诉求超出处理能力', '重复/无效工单'];
export const APPROVERS = ['班组长 · 王经理', '客服主管 · 张总监'];
/** 审批组（挂起 / 关闭工单 / 强结 共用）：提交时选定，由该组接单审批 */
export const APPROVAL_GROUPS = [
  '班组长审批组',
  '质检审批组',
  '运营审批组',
];
export const SUSPEND_REASONS = [
  '故障',
  '资源错误',
  '资源缺失/更新',
  '不可抗力因素',
  '外部投诉/举报',
  '其他',
];
export const ESCALATE_CHANNELS = ['二线技术支持组（推荐）', 'RDM 产研系统', 'TPD 技术问题单'];
export const ESCALATE_GROUPS = ['硬件技术支持组', '软件技术支持组', '账号与权益组'];
export const ESCALATE_MEMBERS = ['陈伟', '林涛', '赵敏'];
/** 升级到飞书项目 · 问题反馈分类（对齐飞书客户反馈单） */
export const FEISHU_FEEDBACK_CATEGORIES = ['软件问题', '硬件问题', '效果问题', '其他问题'];
export const FEISHU_SPACES = ['飞书项目 · 售后协同', '飞书群 · 二线技术支持', '飞书群 · 产品反馈'];
export const AFTERSALE_GROUPS = ['售后维修组', '退换货处理组', '上门服务组'];
/** 售后服务类型 / 方式（数据字典，与售后建单页对齐，表1/表5） */
export const AFTERSALE_SERVICE_TYPES = ['维修', '投诉', '咨询', '安装', '展示样机拆装'];
export const AFTERSALE_SERVICE_METHODS = ['上门', '送修', '寄修', '沟通调解'];
export const CLOSE_RESULTS = ['已解决', '未解决-客户放弃', '未解决-无法复现', '重复工单', '无效工单'];
/** 关闭原因（「为什么关」，与偏"处理结果"的 CLOSE_RESULTS 语义不同，不要混用） */
export const CLOSE_REASONS = [
  '客户放弃处理',
  '问题无法复现',
  '重复工单',
  '无效工单',
  '超出服务范围',
  '其他',
];
export const ROOT_CAUSES = ['产品缺陷', '使用不当', '配置问题', '第三方问题', '需求变更'];
export const ARCHIVE_REASONS = ['已关闭超30天自动归档', '手动归档-已完结', '手动归档-合规要求'];
export const RESUME_REASONS = ['客户已反馈', '问题已解决', '备件已到货', '产研已修复', '退费已到账', '其他'];
export const RETURN_REASONS = ['信息不全', '分类错误', '不属于本组', '需补充调查'];
export const MAX_RETURN_COUNT = 3;

export function nowWhen(): string {
  const d = new Date();
  return `今天 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function mapUserRole(roleKey: string): TlRole {
  if (roleKey === 'team-leader') return '班组长';
  if (roleKey === 'agent-cs') return '二线坐席';
  if (roleKey === 'agent-as') return '二线坐席';
  return '二线坐席';
}

export function nextTimelineId(list: TimelineEntry[]): string {
  return `e${list.length + 1}-${Date.now()}`;
}

/** 生成飞书项目模拟反馈单号 */
function feishuFeedbackNo(): string {
  return `FS-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}${String(new Date().getDate()).padStart(2, '0')}-${String(Math.floor(Date.now() % 9000) + 1000)}`;
}

/** 生成模拟售后工单号（售后系统回传，AS = After-Sales） */
function aftersaleNo(): string {
  const d = new Date();
  return `AS-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(Math.floor(Date.now() % 90000) + 10000)}`;
}

/** 完整时间戳（关联卡片展示） */
function nowFull(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 升级到飞书：演示完整协同时间线（建关联 → 预反馈 → 关单） */
function buildFeishuSeedRecords(detail: TicketDetailMeta, operator: string, feedbackNo: string): FeishuRecord[] {
  const now = nowWhen();
  const owner = '张三（技术支持）';
  return [
    {
      id: `fs-push-${Date.now()}`,
      kind: 'push',
      title: '已创建产研反馈单',
      content: `已带入本单标题「${detail.title}」、优先级 ${detail.priority}、产品「${detail.product.name}」等建单信息，并挂上反馈单号。`,
      who: operator,
      side: '客服工单',
      when: now,
      meta: `反馈单号 ${feedbackNo}`,
    },
    {
      id: `fs-feedback-${Date.now() + 1}`,
      kind: 'feedback',
      title: '产研已回处理进展',
      content: '已受理反馈单并复现问题，定位为固件调度模块缺陷，正在准备修复方案。',
      who: owner,
      side: '产研侧',
      when: now,
      meta: '原因分析已明确 · 计划今日内给出方案',
      cause: '固件 v2.4 在线歌单调度模块缺陷，离线场景下歌单调度异常导致跳歌。',
      result: '拟方案：远程降级固件至 v2.3.1 并清理歌单缓存后复测验证。',
      planDate: '今天',
    },
    {
      id: `fs-result-${Date.now() + 2}`,
      kind: 'result',
      title: '产研反馈已结案',
      content: '已完成修复并通过验收，将于下个固件版本随包发布，建议引导用户升级后验证。',
      who: owner,
      side: '产研侧',
      when: now,
      meta: '处理结论 已解决 · 待用户验证',
      cause: '固件 v2.4 在线歌单调度模块缺陷（离线歌单调度异常）。',
      result: '远程降级固件至 v2.3.1 并清理歌单缓存，复测 30 分钟未再复现；根因修复将随下个固件版本随包发布。',
      conclusion: '已解决 · 待用户验证',
    },
  ];
}

export function pushEntry(
  list: TimelineEntry[],
  partial: Omit<TimelineEntry, 'id' | 'when'> & { when?: string },
): TimelineEntry {
  const entry: TimelineEntry = { id: nextTimelineId(list), when: partial.when ?? nowWhen(), ...partial };
  list.push(entry);
  return entry;
}

export function statusLabel(state: TicketOpState): string {
  const map: Record<TicketOpState, string> = {
    processing: '处理中',
    suspended: '已挂起',
    review: '待审核',
    resolved: '待回访',
    settled: '已结案',
    transferred: '已转出',
    closed: '已关闭',
    archived: '已归档',
    cancelled: '已取消',
  };
  return map[state];
}

function nowCloseTime(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `今天 ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/**
 * 计时终止（结案/关闭/取消）：关闭所有活跃钟。
 * 首响与整单分别新增一条独立关钟履历。
 */
function terminateClocks(
  detail: TicketDetailMeta,
  timeline: TimelineEntry[],
  voidStop = false,
): void {
  const closedAt = nowCloseTime();
  const closedTargets: Array<{ clock: '首响' | '整单'; closedAt: string }> = [];
  detail.slaClocks.forEach((c) => {
    if (c.phase !== 'stopped') {
      c.stopOutcome = voidStop ? 'void' : c.remainSec >= 0 ? 'met' : 'breached';
      c.closedAt = closedAt;
      if (c.kind === 'first') closedTargets.push({ clock: '首响', closedAt });
      if (c.kind === 'whole') closedTargets.push({ clock: '整单', closedAt });
    }
    c.phase = 'stopped';
    c.reviewSubmitAtMs = undefined; // 终态：清理待审核标记
  });

  closedTargets.forEach(({ clock, closedAt: targetClosedAt }) => {
    pushEntry(timeline, {
      category: 'sla',
      action: 'slaClose',
      who: '系统',
      role: '系统',
      how: `${clock}时钟关闭`,
      what: '',
      when: targetClosedAt,
      slaClose: { clock, closedAt: targetClosedAt },
    });
  });
}

/**
 * 提交审核/调研（下送）：冻结解决钟显示并记录提交时刻。
 * 通过→后续 terminateClocks 停表达标；驳回/退回→ reopenSolveOnReject 扣减审核时长后续走。
 * 首响钟若已达标(stopped)不动；仍在走(running)的解决钟才冻结。
 */
function freezeSolveForReview(detail: TicketDetailMeta): void {
  detail.slaClocks.forEach((c) => {
    if (c.kind === 'whole' && c.phase === 'running') {
      c.reviewSubmitAtMs = Date.now(); // 提交时刻，供驳回时计入等待时长
      c.phase = 'paused'; // 冻结显示（乐观：待审核结果）
    }
  });
}

/**
 * 审核/调研驳回（退回/撤回）：解决钟续走，并把「已过审核时长」计入 SLA
 * ——即剩余按提交到此刻的耗时扣减（remainSec -= 审核经过秒），再置 running。
 * 审批/调研时间计入 SLA，不因走审核而免除这段耗时。
 */
function reopenSolveOnReject(detail: TicketDetailMeta): boolean {
  let reopened = false;
  detail.slaClocks.forEach((c) => {
    if (c.kind === 'whole' && c.reviewSubmitAtMs != null) {
      const elapsedSec = Math.max(0, Math.floor((Date.now() - c.reviewSubmitAtMs) / 1000));
      c.remainSec -= elapsedSec; // 审核等待时长计入（可为负=已超时）
      c.reviewSubmitAtMs = undefined;
      c.phase = 'running'; // 重新计时
      reopened = true;
    }
  });
  return reopened;
}

export function applyOpAction(
  detail: TicketDetailMeta,
  timeline: TimelineEntry[],
  opState: TicketOpState,
  suspendInfo: SuspendInfo | null,
  payload: OpActionPayload,
  operator: string,
  operatorRole: TlRole,
): { opState: TicketOpState; suspendInfo: SuspendInfo | null; message: string } {
  switch (payload.type) {
    case '保存草稿':
      return { opState, suspendInfo, message: '已保存，可稍后继续处理' };

    case '调剂': {
      // 同组内=调剂到人（直接换处理人）；跨组=调剂到组（转入目标组工单池，由组内领取，不指定人）
      const { scope, target, reason } = payload.data;
      const isCross = scope === 'cross';
      if (isCross) {
        detail.status = '待分派';
        pushEntry(timeline, {
          category: 'node', action: 'transfer', who: operator, role: operatorRole,
          how: '跨组调剂',
          what: `跨组调剂至「${target}」（转入该组工单池待领取，不指定处理人；SLA 不停钟）。原因：${reason || '—'}`,
        });
        return { opState, suspendInfo, message: `已跨组调剂至 ${target}` };
      }
      pushEntry(timeline, {
        category: 'node', action: 'transfer', who: operator, role: operatorRole,
        how: '调剂',
        what: `同组内调剂至 ${target}（处理人变更，状态仍为处理中；SLA 不停钟）。原因：${reason || '—'}`,
      });
      return { opState, suspendInfo, message: `已同组内调剂至 ${target}` };
    }

    case '委派': {
      const { mode, target, reason, assignees } = payload.data;
      if (mode === 'person' && assignees?.length) {
        const dest = assignees.map((a) => a.name).join('、');
        const taskLines = assignees.map((a) => `${a.name}：${a.task}`).join('；');
        detail.delegateInfo = { mode: 'person', targets: dest, operator, at: nowWhen() };
        pushEntry(timeline, {
          category: 'node', action: 'transfer', who: operator, role: operatorRole,
          how: '委派',
          what: `委派至 ${dest} 协办办理（主责不变，工单进入委派中，`
            + `下送/委派/调剂/关闭工单/强结 暂锁定）。任务：${taskLines}`,
        });
        return { opState, suspendInfo, message: `已委派至 ${dest} 协办` };
      }
      const dest = target;
      detail.delegateInfo = { mode: 'group', targets: dest, operator, at: nowWhen() };
      pushEntry(timeline, {
        category: 'node', action: 'transfer', who: operator, role: operatorRole,
        how: '委派',
        what: `委派至组 ${dest} 协办办理（主责不变，工单进入委派中，`
          + `下送/委派/调剂/关闭工单/强结 暂锁定）。${reason ? `任务说明：${reason}` : ''}`,
      });
      return { opState, suspendInfo, message: `已委派至组 ${dest} 协办` };
    }

    case '撤销委派': {
      // 委派锁住了几乎所有流转动作，必须留撤销口：协办未响应时可单方面撤销，立即解锁
      const targets = detail.delegateInfo?.targets ?? '';
      detail.delegateInfo = null;
      pushEntry(timeline, {
        category: 'node', action: 'transfer', who: operator, role: operatorRole,
        how: '撤销委派',
        what: `撤销对 ${targets} 的委派，工单回到本节点，已解锁流转与结案动作。`,
        internal: true,
      });
      return { opState, suspendInfo, message: '已撤销委派，工单回到本节点' };
    }

    case '下送': {
      // 下送 = 标记已解决 = 正常结案，直接进待回访、不经审核（审核只服务关闭/强结等异常结案）。
      // 停整单解决钟结算，回访时限起算；后续回访满意/超时 → 已结案（正常关闭）。
      const { ticketTitle, backToDelegator } = payload.data;
      // 委派节点下送：协办完成、回送委派节点，不结案、不停钟
      if (backToDelegator) {
        const targets = detail.delegateInfo?.targets ?? '';
        detail.delegateInfo = null;
        pushEntry(timeline, {
          category: 'node', action: 'transfer', who: operator, role: operatorRole,
          how: '下送 · 回到委派节点',
          what: `${targets ? `${targets} ` : ''}协办完成，工单「${ticketTitle}」送回委派节点，`
            + `已解锁流转与结案动作。SLA 未受影响，继续计时。`,
        });
        return { opState, suspendInfo, message: '协办已完成，工单回到委派节点' };
      }
      detail.status = '待回访';
      terminateClocks(detail, timeline);
      pushEntry(timeline, {
        category: 'node', action: 'resolved', who: operator, role: operatorRole,
        how: '下送 · 标记已解决',
        what: `工单「${ticketTitle}」处理完毕并标记已解决。`
          + `整单解决 SLA 已停表结算，回访时限起算；回访满意或超时未评价即结案。`,
      });
      return { opState: 'resolved', suspendInfo, message: '已下送，工单进入待回访' };
    }

    case '强结': {
      const { reason, approver, detail: note } = payload.data;
      detail.status = '已结案';
      terminateClocks(detail, timeline);
      pushEntry(timeline, {
        category: 'node', action: 'resolved', who: operator, role: operatorRole,
        how: '强结 · 审批通过', what: `【强制结案】原因：${reason}；审批：${approver}。${note ? `说明：${note}` : ''}（绕过满意度回访）`,
      });
      return { opState: 'settled', suspendInfo, message: '强结审批通过，工单已结案' };
    }

    case '挂起': {
      // 挂起会停表，须经审批：提交只进「待审核」，SLA 照常走（避免提个申请就先把表停了）；
      // 审批通过后才置「已挂起」并冻结在走的钟。
      const { reason, detail: note, resumeAt, serviceType, serviceMethod, approvalGroup } = payload.data;
      detail.status = '待审核';
      const group = approvalGroup.replace(/（.*?）$/, '');
      pushEntry(timeline, {
        category: 'node', action: 'hold', who: operator, role: operatorRole,
        how: '提交挂起申请',
        what: `挂起原因：${reason}${note ? `；${note}` : ''}${resumeAt ? `，预计 ${resumeAt} 恢复` : ''}。`
          + `服务类型/方式：${serviceType} · ${serviceMethod}。已提交 ${group} 审批，`
          + `审批通过后工单挂起、SLA 停表；审批期间 SLA 继续计时。`,
      });
      return { opState: 'review', suspendInfo: null, message: `挂起申请已提交，等待${group}审批` };
    }

    case '升级': {
      const { channel, group, member, detail: note, feedbackCategory } = payload.data;
      // 飞书项目通道：建关联 + 演示预反馈/关单时间线（原型默认落到 closed 以便点二次激活）
      if (channel === FEISHU_ESCALATE_CHANNEL) {
        const feedbackNo = feishuFeedbackNo();
        detail.feishuSync = 'closed';
        detail.feishuFeedbackNo = feedbackNo;
        detail.feishuFailReason = undefined;
        detail.feishuRecords = buildFeishuSeedRecords(detail, operator, feedbackNo);
        detail.status = '已升级·产研';
        const catPart = feedbackCategory ? `，问题反馈分类：${feedbackCategory}` : '';
        pushEntry(timeline, {
          category: 'node', action: 'escalate', who: operator, role: operatorRole,
          how: '升级 · 产研反馈',
          what: `升级至产研反馈，建客户反馈单 ${feedbackNo}${catPart}${note ? `。说明：${note}` : ''}`,
        });
        return { opState, suspendInfo, message: `已升级至产研反馈 · 反馈单 ${feedbackNo}` };
      }
      detail.status = '已升级·二线';
      const toTech = channel.includes('技术支持');
      const dest = toTech && group ? `${channel} · ${group}${member ? ` · ${member.split(' ')[0]}` : ''}` : channel;
      pushEntry(timeline, {
        category: 'node', action: 'escalate', who: operator, role: operatorRole,
        how: '升级', what: `升级至 ${dest}${note ? `。说明：${note}` : ''}`,
      });
      return { opState, suspendInfo, message: `已升级至 ${toTech ? group || channel : channel}` };
    }

    case '同步飞书': {
      const { space, message: msg } = payload.data;
      pushEntry(timeline, {
        category: 'node', action: 'escalate', who: operator, role: operatorRole,
        how: '同步飞书 · 协同', what: `已同步至 ${space}（不改变工单状态）。${msg ? `内容：${msg}` : ''}`,
        internal: true,
      });
      return { opState, suspendInfo, message: `已同步至 ${space}` };
    }

    case '激活飞书': {
      const { reason } = payload.data;
      detail.feishuSync = 'synced';
      const rec: FeishuRecord = {
        id: `fs-activate-${Date.now()}`,
        kind: 'activate',
        title: '二次激活 · 已重新打开产研反馈单',
        content: `二线坐席二次激活，请产研继续处理。激活原因：${reason || '用户反馈未解决'}`,
        who: operator,
        side: '客服工单',
        when: nowWhen(),
        meta: `激活原因 ${reason?.split('：')[0] || '用户反馈未解决'}`,
      };
      detail.feishuRecords = [...(detail.feishuRecords ?? []), rec];
      pushEntry(timeline, {
        category: 'node', action: 'escalate', who: operator, role: operatorRole,
        how: '二次激活产研反馈',
        what: `二次激活产研反馈单，回推产研继续处理。${reason ? `原因：${reason}` : ''}`,
        internal: true,
      });
      return { opState, suspendInfo, message: '已二次激活产研反馈单' };
    }

    case '转售后': {
      // 按 D1 分流：投诉=建关联单、投诉单独立跑（状态不变）；非诉=原单进「已转出」等待态（D11，不关闭）。
      // D2 改写：已有 1:1 关联时按钮就该置灰、走不到这里——售后系统没有「激活」动作，
      // 未结案去关联单 Tab 跳售后跟进、已结案只能线下联系售后，两者都不再建第二张单。
      const { serviceType, serviceMethod, detail: note } = payload.data;
      const isComplaint = detail.type === '投诉';

      detail.linkedAftersale = {
        no: aftersaleNo(),
        status: '待接单',
        serviceType,
        serviceMethod,
        createdAt: nowFull(),
        fromComplaint: isComplaint,
      };
      pushEntry(timeline, {
        category: 'node', action: 'transfer', who: operator, role: operatorRole,
        how: '转售后 · 建关联售后单',
        what: `新建售后单 ${detail.linkedAftersale.no}（${serviceType}·${serviceMethod}），与本单建立关联。${note ? `说明：${note}` : ''}`,
      });

      const asNo = detail.linkedAftersale.no;
      if (isComplaint) {
        // 投诉：建关联单，投诉单独立继续跑（状态不变，不进「已转出」）
        return { opState, suspendInfo, message: `已建关联售后单 ${asNo}，投诉单继续跟进` };
      }
      // 非诉：原单进「已转出」等待态——不关闭、客服侧冻结，出态只由售后回传驱动
      // （售后已关闭 → 已关闭进已办；售后转回客服 → 回处理中续跑原流程）
      detail.status = '已转出';
      return {
        opState: 'transferred',
        suspendInfo,
        message: `已转售后 ${asNo}，工单转入「已转出」，等待售后处理结果`,
      };
    }

    case '激活售后': {
      // 售后转入单：关联位已被来源售后单占着，「转售后」走激活而非建第二张（同 D12 的理由）。
      // 激活成功后本单不进「已转出」——球回到售后手上，但客服侧仍持单跟进回传结果。
      const { no, title, status } = payload.data;
      if (detail.linkedAftersale) detail.linkedAftersale.status = status;
      pushEntry(timeline, {
        category: 'node', action: 'transfer', who: operator, role: operatorRole,
        how: '转售后 · 激活来源售后单',
        what: `本单由售后转入，已激活来源售后单 ${no}${title ? `（${title}）` : ''}，售后状态更新为「${status}」。未新建售后单，1:1 关联不变。`,
      });
      return { opState, suspendInfo, message: `售后工单 ${no} 激活成功，已重回售后工单池` };
    }

    case '升级投诉': {
      // 升级成功 = 关原单 + 建新投诉单 + 双向关联（PRD §4.3.1/§4.3.2）。
      // 原单已是终态（已关闭/取消/归档/结案）则跳过关闭步骤，只留关联（PRD §4.3.1）。
      const { target, newNo, note } = payload.data;
      const alreadyEnded = /已关闭|已取消|已归档|已结案|已转单/.test(detail.status);
      if (!alreadyEnded) {
        // 因派生新单而终止：状态用「已转单」而非「已关闭」——
        // 让坐席一眼分清"这单是正常关的"还是"业务已经转到别的单上了"（PRD §5.6.3）
        detail.status = '已转单';
        terminateClocks(detail, timeline, true); // 因升级而终止：停表结果=中止(灰)，不计达标/未达标
      }
      pushEntry(timeline, {
        category: 'node', action: 'transfer', who: operator, role: operatorRole,
        how: '升级投诉 · 关闭原单',
        what: alreadyEnded
          ? `原单已是「${detail.status}」，跳过关闭步骤；已升级为${target}单 ${newNo}并保留双向关联。升级原因：${note}`
          : `诉求升级为${target}，已生成新投诉单 ${newNo}并双向关联，原单关闭（SLA 停表·中止）。`
            + `升级原因：${note}。本单转为「已转单」并锁定只读，后续补充/催单请在新单处理。`,
      });
      return {
        opState: alreadyEnded ? opState : 'closed',
        suspendInfo: null,
        message: alreadyEnded ? `已关联${target}单 ${newNo}` : `已升级为${target}单 ${newNo}，原单转为「已转单」`,
      };
    }

    case '标记已解决': {
      const { solution } = payload.data;
      detail.status = '待回访';
      pushEntry(timeline, {
        category: 'node', action: 'resolved', who: operator, role: operatorRole,
        how: '标记已解决', what: solution,
      });
      return { opState: 'resolved', suspendInfo, message: '已标记为已解决，进入待回访确认' };
    }

    case '撤回': {
      const reopened = reopenSolveOnReject(detail); // 撤回下送→解决钟按已过审核时长计入后续走
      pushEntry(timeline, {
        category: 'node', action: 'transfer', who: operator, role: operatorRole,
        how: '撤回',
        what: `撤回上一流转操作，工单回到操作前的状态和处理人。${reopened ? '解决 SLA 已续走（审核等待时长计入）。' : ''}`,
        internal: true,
      });
      return { opState, suspendInfo, message: '已撤回上一操作' };
    }

    case '恢复': {
      const { reason, detail: note } = payload.data;
      detail.status = '处理中';
      // 解冻续走：挂起冻结的钟按保留的剩余续算；停表钟为终态不动
      detail.slaClocks.forEach((c) => {
        if (c.phase === 'paused') c.phase = 'running';
      });
      pushEntry(timeline, {
        category: 'node', action: 'accept', who: operator, role: operatorRole,
        how: '解除挂起', what: `解除挂起，恢复处理，SLA 按剩余续走。原因：${reason}${note ? `；${note}` : ''}`,
      });
      return { opState: 'processing', suspendInfo: null, message: '已解除挂起，SLA 继续计时' };
    }

    case '退回': {
      // 退回只有一个方向：技术支持 → 工单处理人。无目标节点可选，工单回到处理中。
      const { reason, note } = payload.data;
      const count = (detail.returnCount ?? 0) + 1;
      detail.returnCount = count;
      detail.status = '处理中';
      const reopened = reopenSolveOnReject(detail); // 退回→解决钟续走，技术支持处理期间的时长计入 SLA
      pushEntry(timeline, {
        category: 'node', action: 'transfer', who: operator, role: operatorRole,
        how: '退回',
        what: `技术支持退回给工单处理人。原因：${reason}${note ? `；说明：${note}` : ''}`
          + `（第 ${count} 次退回）${reopened ? '。解决 SLA 已续走，技术支持处理时长计入' : ''}`,
      });
      return { opState: 'processing', suspendInfo, message: '已退回给工单处理人' };
    }

    case '关闭工单': {
      // 关闭工单 = 异常结案，须审核：提交只进「待审核」，解决钟冻结并记录提交时刻；
      // 审核通过 → 已关闭（停表结算，非正常关闭）；退回 → 解决钟按审核等待时长回拨续走。
      const { reason, approvalGroup, note } = payload.data;
      detail.status = '待审核';
      freezeSolveForReview(detail);
      const group = approvalGroup.replace(/（.*?）$/, '');
      pushEntry(timeline, {
        category: 'node', action: 'transfer', who: operator, role: operatorRole,
        how: '提交关闭审核',
        what: `关闭原因：${reason}${note ? `；${note}` : ''}。已提交 ${group} 审核，`
          + `通过后工单关闭（非正常关闭，关单后不支持补充/催单）；退回则回到本人继续处理。`
          + `解决 SLA 已冻结，退回时审核等待时长计入。`,
      });
      return { opState: 'review', suspendInfo, message: `关闭申请已提交，等待${group}审核` };
    }

    case '归档工单': {
      detail.status = '已归档';
      pushEntry(timeline, {
        category: 'node', action: 'create', who: '系统', role: '系统',
        how: '归档', what: `工单已归档（${payload.data.reason}），仅支持只读查询。`,
      });
      return { opState: 'archived', suspendInfo, message: '工单已归档' };
    }

    case '取消工单': {
      detail.status = '已取消';
      terminateClocks(detail, timeline, true); // 业务中止：停表结果=中止(灰)，不计达标/未达标
      pushEntry(timeline, {
        category: 'node', action: 'transfer', who: operator, role: operatorRole,
        how: '取消工单', what: payload.reason || '工单已取消。',
      });
      return { opState: 'cancelled', suspendInfo: null, message: '工单已取消' };
    }

    default:
      return { opState, suspendInfo, message: '操作已完成' };
  }
}
