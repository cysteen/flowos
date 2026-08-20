import type { Ticket } from '@/views/tickets/types/ticket';
import { resolveTicketGroupNames } from '@/views/tickets/types/ticket';

export type FeishuSyncState = 'none' | 'failed' | 'synced' | 'feedback' | 'closed';

export const FEISHU_SYNC_LABELS: Record<FeishuSyncState, string> = {
  none: '未同步',
  failed: '同步失败',
  synced: '已同步',
  feedback: '产研反馈中',
  closed: '已关闭',
};

export function formatStartDate(t: Ticket): string {
  if (!t.createdAt) return '—';
  return t.createdAt.slice(0, 10);
}

export function formatSynced(t: Ticket): string {
  if (t.synced === true || t.synced === '是') return '是';
  if (t.synced === false || t.synced === '否') return '否';
  return '—';
}

export function formatFeishuSync(t: Ticket): string {
  const s = t.feishuSync ?? 'none';
  return FEISHU_SYNC_LABELS[s as FeishuSyncState] ?? '—';
}

export function formatCurrentGroup(t: Ticket): string {
  const names = resolveTicketGroupNames(t);
  return names[0] ?? '—';
}

export function formatCurrentAssignee(t: Ticket): string {
  return t.assignee ?? '— 待领';
}

export function formatNodeProgress(t: Ticket): string {
  if (!t.nodeTotal) return '—';
  return `${t.nodeStep}/${t.nodeTotal}`;
}

export function formatCount(n?: number): string {
  if (n == null || Number.isNaN(n)) return '—';
  return String(n);
}

export function formatRiskWeight(t: Ticket): string {
  if (t.riskWeight == null) return '—';
  return String(t.riskWeight);
}

export function formatAppointmentTime(t: Ticket): string {
  if (t.appointmentAt) return t.appointmentAt;
  if (t.hasAppointment && t.appointmentText) return t.appointmentText;
  return '—';
}

/** 列表 plain 列文案 */
export function listCellText(t: Ticket, key: string): string {
  switch (key) {
    case 'businessType':
      return t.businessType ?? '—';
    case 'ticketType':
      return t.type;
    case 'ticketSource':
      return t.ticketSource ?? t.channel;
    case 'startDate':
      return formatStartDate(t);
    case 'synced':
      return formatSynced(t);
    case 'feishuSync':
      return formatFeishuSync(t);
    case 'currentGroup':
      return formatCurrentGroup(t);
    case 'currentAssignee':
      return formatCurrentAssignee(t);
    case 'lastHandler':
      return t.lastHandler ?? '—';
    case 'lastHandledAt':
      return t.lastHandledAt ?? '—';
    case 'upgradeCount':
      return formatCount(t.upgradeCount);
    case 'appointmentTime':
      return formatAppointmentTime(t);
    case 'riskWeight':
      return formatRiskWeight(t);
    case 'supplementPendingCount':
      return formatCount(t.supplementPendingCount);
    case 'supplementDoneCount':
      return formatCount(t.supplementDoneCount);
    case 'nodeProgress':
      return formatNodeProgress(t);
    default:
      return '—';
  }
}
