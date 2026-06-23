import type { TlRole, TimelineEntry } from '@/views/tickets/types/ticketDetail';
import type { TicketDetailMeta } from '@/mock/ticketDetail';

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
  | '转办' | '委派' | '下送' | '撤回' | '强结'
  | '挂起' | '恢复' | '升级' | '同步飞书' | '转售后'
  | '关闭工单' | '归档工单' | '取消工单';

export interface TransferPayload { scope: 'same' | 'cross'; target: string; reason: string; }
export interface DelegatePayload { assistant: string; reason: string; }
export interface ForwardPayload { ticketTitle: string; resolved: boolean; reviewer?: string; conclusion?: string; }
export interface ForceClosePayload { reason: string; approver: string; detail: string; }
export interface SuspendPayload { reason: string; detail: string; resumeAt: string; }
export interface EscalatePayload { channel: string; group: string; member: string; detail: string; syncContext: boolean; }
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

export type OpActionPayload =
  | { type: '保存草稿' }
  | { type: '转办'; data: TransferPayload }
  | { type: '委派'; data: DelegatePayload }
  | { type: '下送'; data: ForwardPayload }
  | { type: '强结'; data: ForceClosePayload }
  | { type: '挂起'; data: SuspendPayload }
  | { type: '升级'; data: EscalatePayload }
  | { type: '同步飞书'; data: SyncFeishuPayload }
  | { type: '转售后'; data: AftersalePayload }
  | { type: '标记已解决'; data: ResolvePayload }
  | { type: '撤回' }
  | { type: '恢复'; data: ResumePayload }
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
export const REVIEWERS = ['班组长 · 王经理', '质检审核 · 李审核', '上级主管 · 张总监'];
export const FORCE_CLOSE_REASONS = ['客户失联', '客户主动放弃', '诉求超出处理能力', '重复/无效工单'];
export const APPROVERS = ['班组长 · 王经理', '客服主管 · 张总监'];
export const SUSPEND_REASONS = ['等待客户反馈', '等待产研修复', '等待退费到账', '等待售后寄回', '等待备件'];
export const ESCALATE_CHANNELS = ['二线技术支持组（推荐）', 'RDM 产研系统', 'TPD 技术问题单'];
export const ESCALATE_GROUPS = ['硬件技术支持组', '软件技术支持组', '账号与权益组'];
export const ESCALATE_MEMBERS = ['陈伟 (硬件, 负载 45%)', '林涛 (软件, 负载 60%)', '赵敏 (账号, 负载 38%)'];
export const FEISHU_SPACES = ['飞书项目 · 售后协同', '飞书群 · 二线技术支持', '飞书群 · 产品反馈'];
export const AFTERSALE_GROUPS = ['售后维修组', '退换货处理组', '上门服务组'];
export const CLOSE_RESULTS = ['已解决', '未解决-客户放弃', '未解决-无法复现', '重复工单', '无效工单'];
export const ROOT_CAUSES = ['产品缺陷', '使用不当', '配置问题', '第三方问题', '需求变更'];
export const ARCHIVE_REASONS = ['已关闭超30天自动归档', '手动归档-已完结', '手动归档-合规要求'];
export const RESUME_REASONS = ['客户已反馈', '问题已解决', '备件已到货', '产研已修复', '退费已到账', '其他'];

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

    case '转办': {
      const { target, reason } = payload.data;
      pushEntry(timeline, {
        category: 'node', action: 'transfer', who: operator, role: operatorRole,
        how: '转办', what: `转办至 ${target.split(' ')[0]}（处理人变更，状态仍为处理中）。原因：${reason || '—'}`,
      });
      return { opState, suspendInfo, message: `已转办至 ${target.split(' ')[0]}` };
    }

    case '委派': {
      const { assistant, reason } = payload.data;
      pushEntry(timeline, {
        category: 'node', action: 'transfer', who: operator, role: operatorRole,
        how: '委派', what: `委派 ${assistant.split(' ')[0]} 协助办理（主责不变）。${reason ? `说明：${reason}` : ''}`,
      });
      return { opState, suspendInfo, message: `已委派 ${assistant.split(' ')[0]} 协助` };
    }

    case '下送': {
      const { ticketTitle, resolved } = payload.data;
      detail.status = '待审核';
      pushEntry(timeline, {
        category: 'node', action: 'transfer', who: operator, role: operatorRole,
        how: '下送审核',
        what: `工单「${ticketTitle}」下送审核，是否已解决：${resolved ? '是' : '否'}`,
      });
      return { opState: 'review', suspendInfo, message: '已下送审核，工单进入待审核' };
    }

    case '强结': {
      const { reason, approver, detail: note } = payload.data;
      detail.status = '已结案';
      pushEntry(timeline, {
        category: 'resolved', action: 'resolved', who: operator, role: operatorRole,
        how: '强结 · 审批通过', what: `【强制结案】原因：${reason}；审批：${approver}。${note ? `说明：${note}` : ''}（绕过满意度回访）`,
      });
      return { opState: 'settled', suspendInfo, message: '强结审批通过，工单已结案' };
    }

    case '挂起': {
      const { reason, detail: note, resumeAt } = payload.data;
      detail.status = '已挂起';
      detail.slaNode = '已停表';
      detail.slaWhole = '已停表';
      detail.slaNodeOverdue = false;
      const info: SuspendInfo = { reason, detail: note, resumeAt, operator, at: nowWhen() };
      pushEntry(timeline, {
        category: 'node', action: 'hold', who: operator, role: operatorRole,
        how: '挂起 · SLA停表', what: `${reason}${note ? `：${note}` : ''}${resumeAt ? `，预计 ${resumeAt} 恢复` : ''}`,
      });
      return { opState: 'suspended', suspendInfo: info, message: '工单已挂起，SLA 暂停计时' };
    }

    case '升级': {
      const { channel, group, member, detail: note } = payload.data;
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

    case '转售后': {
      const { mode, group, detail: note } = payload.data;
      if (mode === 'close') {
        detail.status = '已关闭';
        pushEntry(timeline, {
          category: 'resolved', action: 'resolved', who: operator, role: operatorRole,
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
        category: 'resolved', action: 'resolved', who: operator, role: operatorRole,
        how: '标记已解决', what: solution,
      });
      return { opState: 'resolved', suspendInfo, message: '已标记为已解决，进入待回访确认' };
    }

    case '撤回':
      pushEntry(timeline, {
        category: 'node', action: 'transfer', who: operator, role: operatorRole,
        how: '撤回', what: '撤回上一流转操作，工单回到操作前的状态和处理人。',
        internal: true,
      });
      return { opState, suspendInfo, message: '已撤回上一操作' };

    case '恢复': {
      const { reason, detail: note } = payload.data;
      detail.status = '处理中';
      detail.slaNode = '01:45:00';
      detail.slaWhole = '02:15:00';
      pushEntry(timeline, {
        category: 'node', action: 'accept', who: operator, role: operatorRole,
        how: '恢复处理', what: `挂起结束，恢复处理。原因：${reason}${note ? `；${note}` : ''}`,
      });
      return { opState: 'processing', suspendInfo: null, message: '工单已恢复，SLA 继续计时' };
    }

    case '关闭工单': {
      const { target, result, solution } = payload.data;
      detail.status = target === 'closed' ? '已关闭' : '待回访';
      pushEntry(timeline, {
        category: 'resolved', action: 'resolved', who: operator, role: operatorRole,
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
