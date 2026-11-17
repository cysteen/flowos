import { TICKETS } from '@/mock/tickets';
import type { Ticket } from '../types/ticket';
import type { CreateWorkItem } from '../types/createWork';
import { commitCreation, creationReceipt, prepareSpecialIntent, specialIntent, clearSpecialIntent } from '@/stores/creationLedger';
import { useRefundStore } from '@/stores/refund';
import { useXiaozhiStore } from '@/stores/xiaozhi';

/** Specialized services own their creation/dispatch. Record that real result before linking the source. */
function capture(item: CreateWorkItem, ticket: Ticket) {
  item.resultNo = ticket.no;
  commitCreation(item.id, { no: ticket.no, kind: 'ticket', phase: 'created' }, [ticket]);
  return ticket;
}
export function resumeSpecialResult(item: CreateWorkItem): Ticket | null {
  const receipt = creationReceipt(item.id);
  if (receipt) return TICKETS.find((row) => row.no === receipt.no) ?? null;
  const before = specialIntent(item.id);
  if (!before) return null;
  // Restore the existing specialized services before checking a previously interrupted call.
  useRefundStore(); useXiaozhiStore().hydrate();
  const found = item.resultNo ? TICKETS.filter((row) => row.no === item.resultNo) : TICKETS.filter((row) => !before.includes(row.no));
  if (found.length === 1) return capture(item, found[0]);
  if (found.length > 1) throw new Error('本次结果尚待核对，检测到多张新单，请保留本事项并在工作台核对，不能再次创建。');
  clearSpecialIntent(item.id);
  return null;
}
export function runSpecialCreation<T extends { ticket: Ticket }>(item: CreateWorkItem, create: () => T | null): T | null {
  prepareSpecialIntent(item.id); // persistence must succeed before the service has any side effects
  try {
    const result = create();
    if (!result) { clearSpecialIntent(item.id); return null; }
    capture(item, result.ticket);
    return result;
  } catch (error) {
    item.status = 'unknown';
    // A service can throw after inserting a row; preserve and reconcile that row, never call create again.
    try { resumeSpecialResult(item); } catch { /* original error and pending intent remain reviewable */ }
    throw error;
  }
}
