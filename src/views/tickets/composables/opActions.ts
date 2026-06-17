import type { TlAction, TlRole, TimelineEntry } from '@/views/tickets/types/ticketDetail';
import type { TicketDetailMeta } from '@/mock/ticketDetail';

export type TicketOpState = 'processing' | 'suspended' | 'resolved' | 'closed' | 'archived' | 'cancelled';

export interface SuspendInfo {
  reason: string;
  detail: string;
  resumeAt: string;
  operator: string;
  at: string;
}

export type OpActionType =
  | '保存草稿' | '转办' | '挂起' | '退回' | '升级' | '标记已解决'
  | '撤回' | '恢复' | '推送产研' | '关闭工单' | '归档工单' | '取消工单';

export interface TransferPayload {
  scope: 'same' | 'cross';
  target: string;
  reason: string;
}
export interface SuspendPayload {
  reason: string;
  detail: string;
  resumeAt: string;
}
export interface RejectPayload {
  reason: string;
  targetNode: string;
  detail: string;
}
export interface EscalatePayload {
  channel: string;
  detail: string;
  syncContext: boolean;
}
export interface ResolvePayload {
  solution: string;
  createCallback: boolean;
}
export interface ClosePayload {
  target: 'resolved' | 'closed';
  result: string;
  solution: string;
  satisfaction: string;
  rootCause: string;
  sendSms: boolean;
}
export interface ArchivePayload {
  reason: string;
  retention: string;
}
export interface PushRdPayload {
  system: string;
  detail: string;
}
export interface ResumePayload {
  reason: string;
  detail: string;
}

export type OpActionPayload =
  | { type: '保存草稿' }
  | { type: '转办'; data: TransferPayload }
  | { type: '挂起'; data: SuspendPayload }
  | { type: '退回'; data: RejectPayload }
  | { type: '升级'; data: EscalatePayload }
  | { type: '标记已解决'; data: ResolvePayload }
  | { type: '撤回' }
  | { type: '恢复'; data: ResumePayload }
  | { type: '推送产研'; data: PushRdPayload }
  | { type: '关闭工单'; data: ClosePayload }
  | { type: '归档工单'; data: ArchivePayload }
  | { type: '取消工单'; reason: string };

export const TRANSFER_TARGETS = [
  '赵六 (学习机处理组, 负载 53%)',
  '王八 (学习机处理组, 负载 40%)',
  '周九 (大客户专属组, 负载 93%)',
];
export const SUSPEND_REASONS = ['等待客户反馈', '等待产研修复', '等待退费到账', '等待售后寄回', '等待备件'];
export const REJECT_REASONS = ['信息不全', '分类错误', '不属于本组', '需补充调查'];
export const REJECT_NODES = ['受理', '分派'];
export const ESCALATE_CHANNELS = ['售后管理系统（推荐）', 'RDM系统', 'TPD系统', '飞书项目', '飞书消息（紧急）'];
export const CLOSE_RESULTS = ['已解决', '未解决-客户放弃', '未解决-无法复现', '重复工单', '无效工单'];
export const ROOT_CAUSES = ['产品缺陷', '使用不当', '配置问题', '第三方问题', '需求变更'];
export const ARCHIVE_REASONS = ['已关闭超30天自动归档', '手动归档-已完结', '手动归档-合规要求'];
export const RESUME_REASONS = ['客户已反馈', '问题已解决', '备件已到货', '产研已修复', '退费已到账', '其他'];
export const PUSH_RD_SYSTEMS = ['RDM 产研需求池', 'TPD 技术问题单', '飞书项目'];

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
    resolved: '已解决',
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
        how: '转办', what: `转办至 ${target.split(' ')[0]}。原因：${reason || '—'}`,
      });
      return { opState, suspendInfo, message: `已转办至 ${target.split(' ')[0]}` };
    }

    case '挂起': {
      const { reason, detail: note, resumeAt } = payload.data;
      detail.status = '已挂起';
      detail.slaNode = '已停表';
      detail.slaWhole = '已停表';
      detail.slaNodeOverdue = false;
      const info: SuspendInfo = {
        reason, detail: note, resumeAt, operator, at: nowWhen(),
      };
      pushEntry(timeline, {
        category: 'node', action: 'hold', who: operator, role: operatorRole,
        how: '挂起 · SLA停表', what: `${reason}${note ? `：${note}` : ''}${resumeAt ? `，预计 ${resumeAt} 恢复` : ''}`,
      });
      return { opState: 'suspended', suspendInfo: info, message: '工单已挂起，SLA 暂停计时' };
    }

    case '退回': {
      const { reason, targetNode, detail: note } = payload.data;
      pushEntry(timeline, {
        category: 'node', action: 'transfer', who: operator, role: operatorRole,
        how: '退回', what: `退回至「${targetNode}」节点。原因：${reason}${note ? `；${note}` : ''}`,
      });
      return { opState, suspendInfo, message: `已退回至「${targetNode}」` };
    }

    case '升级': {
      const { channel, detail: note } = payload.data;
      detail.status = '已升级·二线';
      pushEntry(timeline, {
        category: 'node', action: 'escalate', who: operator, role: operatorRole,
        how: '升级', what: `升级至 ${channel}${note ? `。说明：${note}` : ''}`,
      });
      return { opState, suspendInfo, message: `已升级至 ${channel}` };
    }

    case '标记已解决': {
      const { solution } = payload.data;
      detail.status = '已解决';
      pushEntry(timeline, {
        category: 'resolved', action: 'resolved', who: operator, role: operatorRole,
        how: '标记已解决', what: solution,
      });
      return { opState: 'resolved', suspendInfo, message: '已标记为已解决，进入待回访确认' };
    }

    case '撤回':
      pushEntry(timeline, {
        category: 'node', action: 'transfer', who: operator, role: operatorRole,
        how: '撤回', what: '撤回上一操作，工单回到上一处理节点。',
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

    case '推送产研': {
      const { system, detail: note } = payload.data;
      pushEntry(timeline, {
        category: 'node', action: 'escalate', who: operator, role: operatorRole,
        how: '推送产研', what: `已推送至 ${system}${note ? `。${note}` : ''}`,
      });
      return { opState, suspendInfo, message: `已推送至 ${system}` };
    }

    case '关闭工单': {
      const { target, result, solution, satisfaction } = payload.data;
      detail.status = target === 'closed' ? '已关闭' : '已解决';
      pushEntry(timeline, {
        category: 'resolved', action: 'resolved', who: operator, role: operatorRole,
        how: target === 'closed' ? '关闭工单' : '标记已解决',
        what: `处理结果：${result}；满意度：${satisfaction}。${solution}`,
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
