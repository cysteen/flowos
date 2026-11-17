import { TICKETS } from '@/mock/tickets';
import { persistCreatedRows } from '@/stores/creationLedger';
import { copy } from '../types/createWork';
import { isTicketTerminated } from './complaintEscalation';

export interface UpgradeReturn {
  id: string;
  kind: 'tech-return' | 'rd-feedback' | 'rd-closed';
  content: string;
  at: string;
}
/** Local return adapter. Following recorded handoffs also works after all source pages have closed. */
export function receiveUpgradeReturn(originalNo: string, event: UpgradeReturn) {
  let row = TICKETS.find((ticket) => ticket.no === originalNo);
  const visited = new Set<string>();
  while (row?.upgradeReturnToNo && !visited.has(row.no)) {
    visited.add(row.no);
    row = TICKETS.find((ticket) => ticket.no === row!.upgradeReturnToNo);
  }
  if (!row) throw new Error('未找到升级回传的承接工单，请核对单号。');
  const target = copy(row);
  if (target.eventTimeline?.some((entry) => entry.id === event.id)) return target.no;
  const ended = isTicketTerminated(target.nodeStatus);
  target.eventTimeline = [...(target.eventTimeline ?? []), {
    id: event.id, when: event.at, category: 'node', action: 'escalate', who: '系统', role: '系统',
    how: '升级回传', what: `原单 ${originalNo} 的升级回传：${event.content}${ended ? '；本单已终态，仅记录履历，不改变状态。' : ''}`,
  }];
  if (!ended) {
    if (event.kind === 'tech-return') target.nodeStatus = '处理中';
    else target.feishuSync = event.kind === 'rd-closed' ? 'closed' : 'feedback';
  }
  target.updatedAt = event.at;
  persistCreatedRows([target]);
  return target.no;
}
