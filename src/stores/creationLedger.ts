import { ref } from 'vue';
import { TICKETS } from '@/mock/tickets';
import type { Ticket } from '@/views/tickets/types/ticket';
import type { AftersaleOrder } from '@/mock/aftersaleWorkbench';
import type { AftersalePayload } from '@/views/tickets/composables/opActions';
import { copy } from '@/views/tickets/types/createWork';

export interface LocalAftersaleOrder extends AftersaleOrder {
  payload: AftersalePayload;
  workId: string;
  sourceNo?: string;
  owner?: string;
  bindingStatus?: 'pending' | 'complete';
}
interface CreationReceipt { no: string; kind: 'ticket' | 'aftersale'; phase?: 'created' | 'complete'; }
interface Ledger {
  rows: Record<string, Ticket>;
  orders: LocalAftersaleOrder[];
  receipts: Record<string, CreationReceipt>;
  intents?: Record<string, string[]>;
}
const KEY = 'flowos-creation-ledger-v1';
let ledger: Ledger = { rows: {}, orders: [], receipts: {} };
try { ledger = JSON.parse(localStorage.getItem(KEY) || 'null') || ledger; } catch { /* no unconfirmed success */ }
function writeLedger(next: Ledger) {
  try { localStorage.setItem(KEY, JSON.stringify(next)); }
  catch { throw new Error('办理结果未能保存，请保留输入并重试核对。'); }
}
export const creationRevision = ref(0);
export const localAftersaleOrders = ref<LocalAftersaleOrder[]>(ledger.orders);
export function creationReceipt(id: string) { return ledger.receipts[id]; }
export function specialIntent(id: string) { return ledger.intents?.[id]; }
export function prepareSpecialIntent(id: string) {
  if (ledger.intents?.[id]) return;
  const next = copy(ledger);
  next.intents = { ...next.intents, [id]: TICKETS.map((row) => row.no) };
  writeLedger(next);
  ledger = next;
}
export function clearSpecialIntent(id: string) {
  const next = copy(ledger); delete next.intents?.[id];
  writeLedger(next); ledger = next;
}


/** Local prototype transaction: persist the receipt and both relation ends before exposing success. */
export function commitCreation(id: string, receipt: CreationReceipt, rows: Ticket[], order?: LocalAftersaleOrder) {
  if (ledger.receipts[id] && ledger.receipts[id].phase !== 'created') return ledger.receipts[id];
  const next = copy(ledger);
  rows.forEach((row) => { next.rows[row.no] = copy(row); });
  if (order) next.orders = [copy(order), ...next.orders.filter((existing) => existing.no !== order.no)];
  next.receipts[id] = receipt;
  writeLedger(next); // a quota failure leaves source rows and receipt untouched
  ledger = next;
  publishRows(rows);
  return receipt;
}
export function persistCreatedRows(rows: Ticket[]) {
  const next = copy(ledger);
  rows.forEach((row) => { next.rows[row.no] = copy(row); });
  writeLedger(next);
  ledger = next;
  publishRows(rows);
}
function publishRows(rows: Ticket[]) {
  for (const saved of rows) {
    const existing = TICKETS.find((row) => row.no === saved.no);
    if (existing) { const snapshot = copy(saved); for (const key of Object.keys(existing)) if (!(key in snapshot)) delete (existing as unknown as Record<string, unknown>)[key]; Object.assign(existing, snapshot); } else TICKETS.unshift(copy(saved));
  }
  localAftersaleOrders.value = copy(ledger.orders);
  creationRevision.value += 1;
}
export function hydrateCreationRows() {
  for (const saved of Object.values(ledger.rows)) {
    const existing = TICKETS.find((row) => row.no === saved.no);
    if (existing && (existing.updatedAt ?? '') > (saved.updatedAt ?? '')) continue;
    if (existing) { const snapshot = copy(saved); for (const key of Object.keys(existing)) if (!(key in snapshot)) delete (existing as unknown as Record<string, unknown>)[key]; Object.assign(existing, snapshot); }
    else TICKETS.unshift(copy(saved));
  }
  localAftersaleOrders.value = copy(ledger.orders);
  creationRevision.value += 1;
}
