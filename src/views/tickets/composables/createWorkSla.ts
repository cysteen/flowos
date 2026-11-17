import type { TicketDetailMeta, SlaClock } from '@/mock/ticketDetail';
import type { Ticket } from '../types/ticket';
import { isFirstResponded } from '../types/ticket';
import { readSla, formatSlaClock, slaStateOf } from '../utils/slaClock';
import { copy } from '../types/createWork';

/** Snapshot contract for the existing clocks; no calendar or SLA engine is duplicated here. */
export interface CreationSla {
  capturedAt: string;
  inheritedFromNo?: string;
  customer: { startedAt: string; firstElapsedMs: number; solveElapsedMs: number; responded: boolean; firstRespBreached: boolean; clocks: SlaClock[] };
  assessment: { startedAt: string; firstElapsedMs: number; solveElapsedMs: number; responded: boolean };
}
export function attachCreationSla(ticket: Ticket, source?: { row: Ticket; detail: TicketDetailMeta }, inherit = false) {
  const at = ticket.createdAt || new Date().toLocaleString('sv-SE');
  const previous = inherit ? source?.row.creationSla : undefined;
  const clocks = copy(inherit && source ? source.detail.slaClocks : []);
  const first = clocks.find((c) => c.kind === 'first');
  const solve = clocks.find((c) => c.kind === 'whole');
  const ledger = inherit && source ? readSla(source.row) : null;
  const elapsed = (clock?: SlaClock) => clock && Number.isFinite(clock.totalSec) && Number.isFinite(clock.remainSec) ? Math.max(0, (clock.totalSec - clock.remainSec) * 1000) : 0;
  const responded = inherit && source ? isFirstResponded(source.row) : false;
  ticket.creationSla = {
    capturedAt: at, inheritedFromNo: inherit ? source?.row.no : undefined,
    customer: {
      startedAt: previous?.customer.startedAt || (inherit ? source?.row.createdAt || source?.detail.createdAtFull : at) || at,
      firstElapsedMs: first ? elapsed(first) : previous?.customer.firstElapsedMs ?? (ledger?.elapsedMs || 0),
      solveElapsedMs: ledger?.elapsedMs ?? (solve ? elapsed(solve) : previous?.customer.solveElapsedMs || 0),
      responded, firstRespBreached: inherit ? !!source?.row.firstRespBreached : false, clocks,
    },
    assessment: { startedAt: at, firstElapsedMs: 0, solveElapsedMs: 0, responded: false },
  };
  if (inherit && source) {
    ticket.responded = responded;
    ticket.firstRespBreached = source.row.firstRespBreached;
    const current = responded ? solve : first;
    if (current) {
      ticket.slaText = formatSlaClock(current.remainSec * 1000);
      ticket.slaMinutes = current.remainSec / 60;
      ticket.slaState = slaStateOf(current.remainSec * 1000);
    }
    if (solve) { ticket.resolveSlaText = formatSlaClock(solve.remainSec * 1000); ticket.resolveSlaState = slaStateOf(solve.remainSec * 1000); }
  }
  const c = ticket.creationSla.customer;
  ticket.eventTimeline = [...(ticket.eventTimeline || []), {
    id: `cw-${ticket.no}-sla`, when: at, category: 'sla', action: 'create', who: '系统', role: '系统', how: '建单时效起点',
    what: inherit ? `对客时效继承自 ${source!.row.no}：首响已计 ${c.firstElapsedMs / 60000} 分钟、解决已计 ${c.solveElapsedMs / 60000} 分钟（已扣停表段），${responded ? '已首响' : '未首响'}；对客起点 ${c.startedAt}。本单考核首响／解决自 ${at} 分别从零起算。` : `对客首响／解决及本单考核首响／解决自 ${at} 分别从零起算，不继承原单时长。`,
  }];
}
