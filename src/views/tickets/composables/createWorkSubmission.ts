import { productHasAfterSaleService, type TicketDetailMeta } from '@/mock/ticketDetail';
import { TICKETS } from '@/mock/tickets';
import { useUserStore } from '@/stores/user';
import { useDispatchStore } from '@/stores/dispatch';
import { useDelegateTaskStore } from '@/stores/delegateTasks';
import { useDerivedTicketStore } from '@/stores/derivedTickets';
import { commitCreation, creationReceipt, persistCreatedRows, localAftersaleOrders, type LocalAftersaleOrder } from '@/stores/creationLedger';
import { copy, type CreateWorkItem } from '../types/createWork';
import { headerActionsByRole, currentHandlerName, isCurrentHandler, WORKBENCH_HANDLER, type Ticket } from '../types/ticket';
import { isFlashTicket } from '../types/flash';
import { inflightRefundRun, isRefundTicket } from '../types/refund';
import { isXiaozhiTicket, XIAOZHI_RD_PENDING_BLOCKED } from '../types/xiaozhi';
import { tabWritableFor } from '../types/operation';
import { applyOpAction, mapUserRole, type AftersalePayload } from './opActions';
import { availableActions, escalateComplaintBlockTip } from './opActionRegistry';
import { isTicketTerminated, resolveEscalateButtons, flashLinkComplaintBlockTip } from './complaintEscalation';
import { resolveAftersaleButtonForm } from './aftersaleButtonForm';
import { migrateAftersaleLink } from './aftersaleEvents';
import { attachCreationSla } from './createWorkSla';
import { prepareContinuation } from './continuationTicket';
import { directToInitiator } from './dispatchUi';

const observed = new Map<string, { detail: TicketDetailMeta; row: string }>();
export function observeOperationDetail(detail: TicketDetailMeta) {
  const row = TICKETS.find((ticket) => ticket.no === detail.no);
  if (row) observed.set(detail.no, { detail: copy(detail), row: JSON.stringify(row) });
}
function rowOf(no: string) { return TICKETS.find((row) => row.no === no) ?? useDerivedTicketStore().find(no); }
export function currentWorkSource(item: CreateWorkItem) {
  const origin = item.context.source;
  if (!origin) return null;
  const row = rowOf(origin.no);
  if (!row) throw new Error('原工单不存在或当前无查看权限，请重新核对原单。');
  const latest = observed.get(origin.no);
  const detail = copy(latest?.row === JSON.stringify(row) ? latest.detail : origin);
  if (!latest || latest.row !== JSON.stringify(row)) detail.status = row.nodeStatus;
  detail.product.afterSaleEnabled = productHasAfterSaleService(row.product);
  detail.type = row.type;
  detail.source = row.ticketSource ?? detail.source;
  detail.lastHandler = row.assignee;
  if (row.escalatedToNo) detail.status = row.escalatedToExternal ? '已升级外投' : '已升级投诉';
  if (row.creationLinks?.length) detail.linkedRecords = [...detail.linkedRecords.filter((link) => !row.creationLinks?.some((r) => r.no === link.no)), ...copy(row.creationLinks)];
  if (row.linkedAftersaleNo) detail.linkedAftersale = { no: row.linkedAftersaleNo, status: row.linkedAftersaleStatus ?? '处理中', serviceType: row.linkedAftersaleServiceType ?? '', createdAt: row.createdAt ?? '', fromComplaint: row.type === '投诉', slot: 'source' };
  else if (row.aftersaleOriginNo) detail.linkedAftersale = { no: row.aftersaleOriginNo, status: row.aftersaleOriginStatus ?? '处理中', serviceType: row.aftersaleOriginServiceType ?? '', createdAt: row.createdAt ?? '', fromComplaint: row.type === '投诉', slot: 'derived', relation: row.aftersaleRelation };
  else detail.linkedAftersale = undefined;
  return { row, detail };
}

/** The same business gates are checked again against the recorded source, never the active route. */
export function validateWorkSource(item: CreateWorkItem, sale = false) {
  const user = useUserStore();
  if (item.owner !== (user.account || `role:${user.roleKey}`) || !(user.canAccess('tickets') || (sale || item.context.action === 'aftersale') && !item.context.source && user.canAccess('aftersale'))) throw new Error('当前账号无权提交此办理事项。');
  const source = currentWorkSource(item);
  if (!source) return null;
  const { row, detail } = source;
  if (row.escalatedToNo || row.creationLinks?.some((link) => link.tag === '转单')) throw new Error(`原单已由工单 ${row.escalatedToNo || row.creationLinks?.find((link) => link.tag === '转单')?.no} 接管，请打开承接工单核对；已填内容保留。`);
  const head = headerActionsByRole(user.roleKey, isXiaozhiTicket(row));
  const action = item.context.action;
  const pendingDelegates = useDelegateTaskStore().pendingOf(row.no);
  if (pendingDelegates.length && (action === 'transfer' || action.startsWith('escalate') || sale || action === 'aftersale')) throw new Error('原单有尚未完成的委派任务，请先处理或撤销委派；本次输入保留。');
  if (action === 'transfer' || (sale || action === 'aftersale') && row.type !== '投诉') {
    const primary = row.nodeStatus === '已升级技术支持' ? row.primaryOwner ?? (row.upgradedByMe ? WORKBENCH_HANDLER : row.assignee) : row.assignee;
    const opening = item.context.source!;
    const managesOthers = ['system-admin', 'ops-admin', 'tenant-admin'].includes(user.roleKey);
    if ((!managesOthers && !isCurrentHandler(primary, user.roleKey, user.name)) || row.groupId !== opening.groupId || row.assignee !== opening.lastHandler) throw new Error('原单处理人或归属组已变化，请回原单核对；本次输入保留。');
  }
  if (action === 'transfer') {
    const allowed = availableActions({ ticketType: row.type, closureMode: row.closureMode, roleKey: user.roleKey, isFlash: isFlashTicket(row), isRefund: isRefundTicket(row), isXiaozhi: isXiaozhiTicket(row) }).some((def) => def.key === '转单');
    if (!allowed || user.role.frontline || user.role.readonlyTickets || !tabWritableFor('process', user.roleKey) || !row.assignee || isTicketTerminated(detail.status) || detail.delegateInfo || /已挂起|申请.*中|审核中|已转出|调研中/.test(detail.status)) throw new Error('原单当前状态或角色已不允许转单，请核对原单。');
    if (isRefundTicket(row) && row.refund && inflightRefundRun(row.refund)) throw new Error('原单正在系统退费，暂不可转单。');
    if (isXiaozhiTicket(row) && row.xiaozhi?.rdSync && row.xiaozhi.rdSync !== 'none' && row.xiaozhi.confirmState !== '已确认解决' && row.nodeStatus === '已升级产研' && XIAOZHI_RD_PENDING_BLOCKED.includes('转单')) throw new Error('产研尚在处理，请待产研回传及提报人确认后再转单。');
  } else if (action === 'escalateComplaint' || action === 'escalateExternal') {
    if (['已升级技术支持', '已升级产研'].includes(detail.status) && item.context.confirmedUpgradeStatus !== detail.status) throw new Error('原单已升级技术支持或产研，请重新确认关闭原单、回传改投新单后办理。');
    const buttons = resolveEscalateButtons(detail, user.roleKey);
    const block = escalateComplaintBlockTip(user.roleKey, row.type);
    if (!head.escalateComplaint || block || !(action === 'escalateExternal' ? buttons.external : buttons.complaint)) throw new Error(block || '原单当前已不允许本次升级，请核对原单。');
  } else if (action === 'linkComplaint') {
    if (!head.escalateComplaint || !(isFlashTicket(row) || isRefundTicket(row) || isXiaozhiTicket(row)) || flashLinkComplaintBlockTip(detail.status)) throw new Error('当前角色或原单状态不允许关联投诉。');
  } else if (action === 'reopen') {
    if (row.continuationChildNo || detail.childTickets.length) throw new Error(`本次补充已有承接工单 ${row.continuationChildNo || detail.childTickets[0]?.no}，请在该单上处理。`);
    if (!head.supplement || !['已结案', '已关闭', '已强结'].includes(detail.status)) throw new Error('原单不再满足重新建单条件，请核对原单。');
  }
  if (sale || action === 'aftersale') {
    const complaint = row.type === '投诉';
    const form = resolveAftersaleButtonForm(detail, { position: complaint ? 'link' : 'transfer', unclaimed: !row.assignee, isFlash: isFlashTicket(row) });
    const roleAllowed = complaint ? head.linkAftersale : !user.role.frontline && tabWritableFor('process', user.roleKey);
    if (!roleAllowed || !form.enabled || form.shape !== 'create' || isTicketTerminated(detail.status) && !complaint) throw new Error(detail.linkedAftersale ? `原单已关联售后单 ${detail.linkedAftersale.no}，不能覆盖关联，请使用原单现有激活／回传入口。` : form.tip || '原单不允许新建售后，请核对原单状态。');
  }
  return source;
}
function addLink(row: Ticket, peer: Ticket, tag: string) {
  row.creationLinks = [...(row.creationLinks ?? []).filter((link) => !(link.no === peer.no && link.tag === tag)), { no: peer.no, title: peer.title, tag, meta: peer.createdAt ?? '' }];
}
function applySourceResult(item: CreateWorkItem, ticket: Ticket, source: NonNullable<ReturnType<typeof currentWorkSource>>) {
  const user = useUserStore();
  let origin = copy(source.row);
  const detail = copy(source.detail);
  const timeline = copy(origin.eventTimeline ?? []);
  const actor = currentHandlerName(user.roleKey, user.name);
  const role = mapUserRole(user.roleKey);
  const action = item.context.action;
  if (action === 'transfer') {
    if (!['咨询', '建议', '商机'].includes(ticket.type)) throw new Error('转单目标仅支持咨询、建议、商机。');
    applyOpAction(detail, timeline, 'processing', null, { type: '转单', data: { newNo: ticket.no, newTitle: ticket.title, newType: ticket.type as '咨询' | '建议' | '商机' } }, actor, role);
    origin.nodeStatus = detail.status as Ticket['nodeStatus'];
    Object.assign(origin, { tab: 'done', slaText: '—', slaSub: `${detail.status}·停表`, slaState: 'ok', handledByMe: true });
    addLink(origin, ticket, '转单'); addLink(ticket, origin, '转单自');
  } else if (action === 'escalateComplaint' || action === 'escalateExternal') {
    const ended = isTicketTerminated(detail.status);
    if (['已升级技术支持', '已升级产研'].includes(detail.status)) {
      ticket.inheritedEscalation = { fromNo: origin.no, status: detail.status, feishuSync: detail.feishuSync, feishuFeedbackNo: detail.feishuFeedbackNo, feishuWorkItemId: detail.feishuWorkItemId, feishuRecords: copy(detail.feishuRecords ?? []), groupId: origin.groupId, primaryOwner: origin.primaryOwner ?? origin.assignee };
      origin.upgradeReturnToNo = ticket.no;
    }
    const external = action === 'escalateExternal';
    const migrated = migrateAftersaleLink(origin, ticket.no, { who: actor, role, at: ticket.createdAt! });
    origin = migrated.from;
    const creationEntries = ticket.eventTimeline ?? [];
    Object.assign(ticket, migrated.to, { eventTimeline: [...creationEntries, ...(migrated.to.eventTimeline ?? [])], escalatedFromNo: origin.no });
    applyOpAction(detail, timeline, 'processing', null, { type: '升级投诉', data: { target: external ? '外投' : '投诉', newNo: ticket.no, note: ticket.problemDesc ?? '' } }, actor, role);
    if (ended) origin.escalatedLinkNo = ticket.no;
    else Object.assign(origin, { nodeStatus: detail.status, escalatedToNo: ticket.no, escalatedToExternal: external, tab: 'done', handledByMe: true, myUpgradeAction: true, slaText: '—', slaSub: `${detail.status}·停表`, slaState: 'ok' });
    addLink(origin, ticket, '升级投诉');
  } else if (action === 'linkComplaint') {
    if (ticket.type !== '投诉') throw new Error('关联投诉的新单类型必须为投诉。');
    const tag = isFlashTicket(origin) ? '关联刷机单' : isRefundTicket(origin) ? '关联个册退费单' : '关联小智工单';
    addLink(origin, ticket, '关联投诉'); addLink(ticket, origin, tag);
    if (origin.flash) origin.flash.state.linkedComplaintNos = [...(origin.flash.state.linkedComplaintNos ?? []), ticket.no];
    if (origin.refund) origin.refund.state.linkedComplaintNos = [...(origin.refund.state.linkedComplaintNos ?? []), ticket.no];
    if (origin.xiaozhi) origin.xiaozhi.linkedComplaintNos = [...(origin.xiaozhi.linkedComplaintNos ?? []), ticket.no];
    timeline.push({ id: `cw-${item.id}-link`, when: ticket.createdAt!, category: 'relate', action: 'relate', who: actor, role, how: '关联投诉', what: `关联投诉单 ${ticket.no}，本单继续处理。` });
  } else if (action === 'reopen') {
    origin.continuationChildNo = ticket.no; ticket.continuationFromNo = origin.no;
    addLink(origin, ticket, '转单子单'); addLink(ticket, origin, '承接自');
    timeline.push({ id: `cw-${item.id}-reopen`, when: ticket.createdAt!, category: 'relate', action: 'relate', who: actor, role, how: '重新建单', what: `新建工单 ${ticket.no} 承接本次诉求，原单状态保持。` });
  }
  origin.eventTimeline = timeline;
  origin.updatedAt = ticket.createdAt;
  return origin;
}

export function submitWorkTicket(item: CreateWorkItem, ticket: Ticket, processAfter: boolean, alreadyDispatched = false) {
  const previous = creationReceipt(item.id);
  if (previous?.kind === 'aftersale') throw new Error(`售后单 ${previous.no} 已生成，请完成售后核对，不能复用本事项创建客服单。`);
  if (previous && previous.phase !== 'created') return previous;
  const source = validateWorkSource(item);
  if (['escalateComplaint', 'escalateExternal', 'linkComplaint'].includes(item.context.action) && ticket.type !== '投诉') throw new Error('本事项仅能创建投诉工单。');
  if (item.context.action === 'escalateExternal' && ticket.ticketSource !== '外投渠道') throw new Error('外投新单来源必须为外投渠道。');
  if (source && item.context.action === 'reopen') prepareContinuation(item, ticket, source.row, source.detail);
  const inherits = !!source && !isTicketTerminated(source.detail.status) && ['transfer', 'escalateComplaint', 'escalateExternal'].includes(item.context.action);
  attachCreationSla(ticket, source ?? undefined, inherits);
  const origin = source ? applySourceResult(item, ticket, source) : null;
  const migratedSale = source?.detail.linkedAftersale && item.context.action.startsWith('escalate') ? localAftersaleOrders.value.find((order) => order.no === source.detail.linkedAftersale!.no) : undefined;
  if (source?.detail.linkedAftersale && item.context.action.startsWith('escalate') && !migratedSale) {
    ticket.eventTimeline = [...(ticket.eventTimeline ?? []), { id: `cw-${item.id}-manual-sale`, when: ticket.createdAt!, category: 'relate', action: 'relate', who: '系统', role: '系统', how: '售后关联迁移核对', what: `原单 ${source.row.no} 关联的售后单 ${source.detail.linkedAftersale.no} 未自动迁移，请人工核对（外部迁移接口未连接）。` }];
  }
  const receipt = commitCreation(item.id, { no: ticket.no, kind: 'ticket', phase: 'complete' }, origin ? [origin, ticket] : [ticket], migratedSale ? { ...migratedSale, sourceNo: ticket.no } : undefined);
  const stored = TICKETS.find((row) => row.no === ticket.no)!;
  try {
    if (alreadyDispatched || item.context.action === 'reopen') return receipt;
    if (processAfter && ['escalateComplaint', 'escalateExternal'].includes(item.context.action) && useUserStore().roleKey !== 'agent-l1') directToInitiator(stored);
    else if (!processAfter || ['escalateComplaint', 'escalateExternal'].includes(item.context.action)) useDispatchStore().dispatchNewTicket(stored, item.context.action.startsWith('escalate') ? { relatedNo: source?.row.no } : {});
    persistCreatedRows([stored]);
  } catch { item.error = `工单 ${stored.no} 已创建，派单结果待核对，请打开该单查看；请勿重复创建。`; }
  return receipt;
}

export function recordWorkAftersale(item: CreateWorkItem, payload: AftersalePayload) {
  const previous = creationReceipt(item.id);
  if (previous) return previous;
  validateWorkSource(item, true);
  const no = item.resultNo || `AS-${Date.now()}-${item.id.slice(-6)}`;
  const now = new Date().toLocaleString('sv-SE');
  const order: LocalAftersaleOrder = {
    id: no, no, workId: item.id, owner: item.owner, bindingStatus: 'pending', payload: copy(payload),
    customer: payload.customerName, phone: payload.customerPhone, product: payload.productName,
    address: [payload.province, payload.city, payload.district, payload.address].filter(Boolean).join(' '),
    serviceType: payload.serviceType, status: '待接单', statusColor: '#1A6FFF', statusBg: '#1A6FFF1A', createdAt: now, tab: 'outlet',
  };
  const receipt = commitCreation(item.id, { no, kind: 'aftersale', phase: 'created' }, [], order);
  item.resultNo = no;
  return receipt;
}
export function finishWorkAftersale(item: CreateWorkItem) {
  const previous = creationReceipt(item.id);
  if (!previous || previous.kind !== 'aftersale') throw new Error('未找到本次售后创建结果，请保留输入并核对。');
  if (previous.phase !== 'created') return previous;
  const order = localAftersaleOrders.value.find((row) => row.no === previous.no);
  if (!order || order.owner !== item.owner) throw new Error('仅本次发起人可以核对和继续关联。');
  const source = validateWorkSource(item, true);
  const payload = order.payload;
  const no = previous.no;
  const now = new Date().toLocaleString('sv-SE');
  const user = useUserStore();
  let origin: Ticket | undefined;
  if (source) {
    origin = copy(source.row);
    const detail = copy(source.detail);
    const timeline = copy(origin.eventTimeline ?? []);
    const type = origin.type === '投诉' ? '关联售后' : '转售后';
    const before = copy(source.row);
    applyOpAction(detail, timeline, 'processing', null, { type, data: { ...payload, createdNo: no } }, currentHandlerName(user.roleKey, user.name), mapUserRole(user.roleKey));
    // respondFirstClock updates the live first-response flag; only publish it with the transaction.
    const responded = source.row.responded;
    const breached = source.row.firstRespBreached;
    for (const key of Object.keys(source.row)) if (!(key in before)) delete (source.row as unknown as Record<string, unknown>)[key];
    Object.assign(source.row, before);
    Object.assign(origin, { linkedAftersaleNo: no, linkedAftersaleStatus: '待接单', linkedAftersaleServiceType: payload.serviceType, eventTimeline: timeline, updatedAt: now });
    if (type === '转售后') Object.assign(origin, { nodeStatus: '已转出', responded, firstRespBreached: breached });
  }
  return commitCreation(item.id, { no, kind: 'aftersale', phase: 'complete' }, origin ? [origin] : [], { ...order, sourceNo: source?.row.no, bindingStatus: 'complete' });
}
export function submitWorkAftersale(item: CreateWorkItem, payload: AftersalePayload) {
  recordWorkAftersale(item, payload);
  return finishWorkAftersale(item);
}
