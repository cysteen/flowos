import type { TlRole, TimelineEntry, TimelineFieldChange } from '@/views/tickets/types/ticketDetail';
import type { TicketDetailMeta, FeishuRecord } from '@/mock/ticketDetail';

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
  | '挂起' | '恢复' | '退回' | '升级' | '同步飞书' | '转售后'
  | '激活飞书'
  | '关闭工单' | '归档工单' | '取消工单';

export interface TransferPayload { scope: 'same' | 'cross'; target: string; reason: string; }
export interface DelegatePayload { mode: 'person' | 'group'; target: string; reason: string; }
export interface ForwardPayload { ticketTitle: string; resolved: boolean; reviewer?: string; conclusion?: string; }
export interface ForceClosePayload { reason: string; approver: string; detail: string; }
export interface SuspendPayload { reason: string; detail: string; resumeAt: string; }
export interface EscalatePayload {
  channel: string;
  group: string;
  member: string;
  detail: string;
  syncContext: boolean;
  /** 飞书项目通道必选：问题反馈分类 */
  feedbackCategory?: string;
}
export interface FeishuActivatePayload { reason: string; }
/** 处理登记（保存并登记）：坐席本次处理内容摘要 + 字段级变更，写入处理履历 */
export interface ProcessLogData { summary: string; attachment?: string; changes?: TimelineFieldChange[]; }
export interface SyncFeishuPayload { space: string; message: string; }
export interface AftersalePayload { mode: 'close' | 'callback'; group: string; detail: string; }
export interface ResolvePayload { solution: string; createCallback: boolean; }
export interface ClosePayload {
  target: 'resolved' | 'closed';
  result: string;
  solution: string;
}
export interface ArchivePayload { reason: string; retention: string; }
export interface ResumePayload { reason: string; detail: string; }
export interface ReturnPayload { reason: string; targetNode: string; note: string; }

export type OpActionPayload =
  | { type: '保存草稿'; process?: ProcessLogData }
  | { type: '调剂'; data: TransferPayload }
  | { type: '委派'; data: DelegatePayload }
  | { type: '下送'; data: ForwardPayload }
  | { type: '强结'; data: ForceClosePayload }
  | { type: '挂起'; data: SuspendPayload }
  | { type: '升级'; data: EscalatePayload }
  | { type: '同步飞书'; data: SyncFeishuPayload }
  | { type: '激活飞书'; data: FeishuActivatePayload }
  | { type: '转售后'; data: AftersalePayload }
  | { type: '标记已解决'; data: ResolvePayload }
  | { type: '撤回' }
  | { type: '恢复'; data: ResumePayload }
  | { type: '退回'; data: ReturnPayload }
  | { type: '关闭工单'; data: ClosePayload }
  | { type: '归档工单'; data: ArchivePayload }
  | { type: '取消工单'; reason: string };

export const TRANSFER_TARGETS = [
  '赵六 (学习机处理组, 负载 53%)',
  '王八 (学习机处理组, 负载 40%)',
  '周九 (大客户专属组, 负载 93%)',
];
export const DELEGATE_TARGETS = [
  '钱七 (技术售前, 协助方案)',
  '孙十 (质检组, 协助调研)',
  '李四 (产品反馈组, 协助整理)',
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
export const ESCALATE_MEMBERS = ['陈伟 (硬件, 负载 45%)', '林涛 (软件, 负载 60%)', '赵敏 (账号, 负载 38%)'];
/** 升级到飞书项目 · 问题反馈分类（对齐飞书客户反馈单） */
export const FEISHU_FEEDBACK_CATEGORIES = ['软件问题', '硬件问题', '效果问题', '其他问题'];
export const FEISHU_SPACES = ['飞书项目 · 售后协同', '飞书群 · 二线技术支持', '飞书群 · 产品反馈'];
export const AFTERSALE_GROUPS = ['售后维修组', '退换货处理组', '上门服务组'];
export const CLOSE_RESULTS = ['已解决', '未解决-客户放弃', '未解决-无法复现', '重复工单', '无效工单'];
export const ROOT_CAUSES = ['产品缺陷', '使用不当', '配置问题', '第三方问题', '需求变更'];
export const ARCHIVE_REASONS = ['已关闭超30天自动归档', '手动归档-已完结', '手动归档-合规要求'];
export const RESUME_REASONS = ['客户已反馈', '问题已解决', '备件已到货', '产研已修复', '退费已到账', '其他'];
export const RETURN_REASONS = ['信息不全', '分类错误', '不属于本组', '需补充调查'];
export const RETURN_TARGET_NODES = ['受理', '分派'];
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

/** 升级到飞书：演示完整协同时间线（建关联 → 预反馈 → 关单） */
function buildFeishuSeedRecords(detail: TicketDetailMeta, operator: string, feedbackNo: string): FeishuRecord[] {
  const now = nowWhen();
  const owner = '何霄煜（飞书·技术支持）';
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
    closed: '已关闭',
    archived: '已归档',
    cancelled: '已取消',
  };
  return map[state];
}

/** 计时终止（结案/关闭/取消）：所有活跃钟置「停表」，永久停止、不可重启 */
function terminateClocks(detail: TicketDetailMeta): void {
  detail.slaClocks.forEach((c) => {
    c.phase = 'stopped';
    c.reviewSubmitAtMs = undefined; // 终态：清理待审核标记
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
      const { target, reason } = payload.data;
      pushEntry(timeline, {
        category: 'node', action: 'transfer', who: operator, role: operatorRole,
        how: '调剂', what: `调剂至 ${target.split(' ')[0]}（处理人变更，状态仍为处理中）。原因：${reason || '—'}`,
      });
      return { opState, suspendInfo, message: `已调剂至 ${target.split(' ')[0]}` };
    }

    case '委派': {
      const { mode, target, reason } = payload.data;
      const dest = mode === 'person' ? target.split(' ')[0] : target;
      pushEntry(timeline, {
        category: 'node', action: 'transfer', who: operator, role: operatorRole,
        how: '委派',
        what: `委派${mode === 'person' ? '至' : '至组'} ${dest} 协办办理（主责不变，完成后回到当前处理人）。${reason ? `说明：${reason}` : ''}`,
      });
      return { opState, suspendInfo, message: `已委派${mode === 'person' ? '' : '至组'} ${dest} 协办` };
    }

    case '下送': {
      const { ticketTitle, resolved } = payload.data;
      detail.status = '待审核';
      freezeSolveForReview(detail); // 提交即冻结解决钟、记录提交快照（通过→停表 / 驳回→回拨续走）
      pushEntry(timeline, {
        category: 'node', action: 'transfer', who: operator, role: operatorRole,
        how: '下送审核',
        what: `工单「${ticketTitle}」下送审核，是否已解决：${resolved ? '是' : '否'}。解决 SLA 已冻结（待审核，通过即停表、驳回则计入审核时长后续走）`,
      });
      return { opState: 'review', suspendInfo, message: '已下送审核，工单进入待审核' };
    }

    case '强结': {
      const { reason, approver, detail: note } = payload.data;
      detail.status = '已结案';
      terminateClocks(detail);
      pushEntry(timeline, {
        category: 'node', action: 'resolved', who: operator, role: operatorRole,
        how: '强结 · 审批通过', what: `【强制结案】原因：${reason}；审批：${approver}。${note ? `说明：${note}` : ''}（绕过满意度回访）`,
      });
      return { opState: 'settled', suspendInfo, message: '强结审批通过，工单已结案' };
    }

    case '挂起': {
      const { reason, detail: note, resumeAt } = payload.data;
      detail.status = '已挂起';
      // 暂停：计时冻结，剩余秒保留，恢复后可续算
      detail.slaClocks.forEach((c) => {
        c.phase = 'paused';
      });
      const info: SuspendInfo = { reason, detail: note, resumeAt, operator, at: nowWhen() };
      pushEntry(timeline, {
        category: 'node', action: 'hold', who: operator, role: operatorRole,
        how: '挂起 · SLA停表', what: `${reason}${note ? `：${note}` : ''}${resumeAt ? `，预计 ${resumeAt} 恢复` : ''}`,
      });
      return { opState: 'suspended', suspendInfo: info, message: '工单已挂起，SLA 暂停计时' };
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
      const { mode, group, detail: note } = payload.data;
      if (mode === 'close') {
        detail.status = '已关闭';
        pushEntry(timeline, {
          category: 'node', action: 'resolved', who: operator, role: operatorRole,
          how: '转售后 · 关闭模式', what: `转 ${group} 承接，客服工单结束（已关闭）。${note ? `说明：${note}` : ''}`,
        });
        return { opState: 'closed', suspendInfo, message: `已转 ${group}，客服工单关闭` };
      }
      detail.status = '已升级·待回流';
      pushEntry(timeline, {
        category: 'node', action: 'escalate', who: operator, role: operatorRole,
        how: '转售后 · 等回流', what: `转 ${group} 处理，等待结果回流后继续闭环。${note ? `说明：${note}` : ''}`,
      });
      return { opState, suspendInfo, message: `已转 ${group}，等待回流` };
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
      detail.slaClocks = [
        {
          label: '整单解决',
          kind: 'whole',
          phase: 'running',
          remainSec: 8100, // 02:15:00
          totalSec: 17280,
          warnSec: 1800,
          dueBy: '今日 16:40',
          nodePctOnWhole: 71,
        },
        {
          label: '整单首响',
          kind: 'first',
          phase: 'running',
          remainSec: 6300, // 01:45:00
          totalSec: 7200,
          warnSec: 900,
          dueBy: '今日 15:20',
        },
      ];
      pushEntry(timeline, {
        category: 'node', action: 'accept', who: operator, role: operatorRole,
        how: '恢复处理', what: `挂起结束，恢复处理。原因：${reason}${note ? `；${note}` : ''}`,
      });
      return { opState: 'processing', suspendInfo: null, message: '工单已恢复，SLA 继续计时' };
    }

    case '退回': {
      const { reason, targetNode, note } = payload.data;
      const count = (detail.returnCount ?? 0) + 1;
      detail.returnCount = count;
      detail.status = targetNode === '受理' ? '待受理' : '待分派';
      const reopened = reopenSolveOnReject(detail); // 审核驳回/退回→解决钟续走，审核等待时长计入 SLA
      pushEntry(timeline, {
        category: 'node', action: 'transfer', who: operator, role: operatorRole,
        how: '退回',
        what: `退回至「${targetNode}」节点。原因：${reason}${note ? `；说明：${note}` : ''}（第 ${count} 次退回）${reopened ? '。解决 SLA 已续走，审核等待时长计入' : ''}`,
      });
      return { opState: 'processing', suspendInfo, message: `已退回至${targetNode}节点` };
    }

    case '关闭工单': {
      const { target, result, solution } = payload.data;
      detail.status = target === 'closed' ? '已关闭' : '待回访';
      if (target === 'closed') terminateClocks(detail);
      pushEntry(timeline, {
        category: 'node', action: 'resolved', who: operator, role: operatorRole,
        how: target === 'closed' ? '关闭工单' : '标记已解决',
        what: `处理结果：${result}。${solution}`,
      });
      return {
        opState: target === 'closed' ? 'closed' : 'resolved',
        suspendInfo,
        message: target === 'closed' ? '工单已关闭' : '已标记为已解决',
      };
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
      terminateClocks(detail);
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
