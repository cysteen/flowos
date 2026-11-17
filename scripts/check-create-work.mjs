// Runs real application stores/services in an isolated in-memory browser environment; no server or external requests.
import assert from 'node:assert/strict';
import { createServer, loadConfigFromFile } from 'vite';
import { createPinia, setActivePinia } from 'pinia';
import { effectScope, createRenderer, h, nextTick, ssrContextKey, reactive } from 'vue';
import { createRouter, createMemoryHistory } from 'vue-router';

const data = new Map();
let rejectedKey = '';
globalThis.localStorage = globalThis.sessionStorage = {
  getItem: (key) => data.get(key) ?? null,
  setItem: (key, value) => { if (key === rejectedKey) throw new Error('storage full'); data.set(key, value); },
  removeItem: (key) => data.delete(key),
};
globalThis.window = globalThis;
globalThis.addEventListener = globalThis.removeEventListener = () => {};
const timers = new Set();
const interval = globalThis.setInterval, timeout = globalThis.setTimeout;
globalThis.setInterval = (...args) => { const id = interval(...args); timers.add(id); return id.unref(); };
globalThis.setTimeout = (...args) => { const id = timeout(...args); timers.add(id); return id; };
globalThis.fetch = async () => { throw new Error('External requests are forbidden in this check'); };
const { config: testConfig } = await loadConfigFromFile({ command: 'serve', mode: 'test' }, '.release-build.config.ts');
const server = await createServer({ ...testConfig, configFile: false, plugins: testConfig.plugins.filter((p) => p?.name !== 'unplugin-vue-components'), server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error' });
let checks = 0;
function check(name, fn) { fn(); checks += 1; console.log(`PASS ${name}`); }
try {
  const pinia = createPinia(); setActivePinia(pinia);
  const { TICKETS } = await server.ssrLoadModule('/src/mock/tickets.ts');
  const { TICKET_DETAIL } = await server.ssrLoadModule('/src/mock/ticketDetail.ts');
  const { useUserStore } = await server.ssrLoadModule('/src/stores/user.ts');
  const { useCreateWorkItemsStore } = await server.ssrLoadModule('/src/stores/createWorkItems.ts');
  const { useTicketDraftStore } = await server.ssrLoadModule('/src/stores/ticketDrafts.ts');
  const service = await server.ssrLoadModule('/src/views/tickets/composables/createWorkSubmission.ts');
  const ledger = await server.ssrLoadModule('/src/stores/creationLedger.ts');
  const special = await server.ssrLoadModule('/src/views/tickets/composables/specialWorkCreation.ts');
  const escalation = await server.ssrLoadModule('/src/views/tickets/composables/complaintEscalation.ts');
  const { inferCreateComplaintNatures } = await server.ssrLoadModule('/src/views/tickets/types/complaintCreateCategory.ts');
  const user = useUserStore(); user.setRole('agent-l2');
  const works = useCreateWorkItemsStore();
  const clone = (value) => JSON.parse(JSON.stringify(value));
  let seq = 0;
  function origin(type = '咨询', source = '电话', status = '处理中') {
    const row = { ...clone(TICKETS.find((ticket) => ticket.type === '咨询' && !ticket.flash && !ticket.refund && !ticket.xiaozhi)), id: `check-source-${++seq}`, no: `CHECK-SOURCE-${seq}`, type, ticketSource: source, nodeStatus: status, assignee: user.name, groupId: 'support', flash: undefined, refund: undefined, xiaozhi: undefined, closureMode: '正常流程', creationLinks: undefined, escalatedToNo: undefined, linkedAftersaleNo: undefined, aftersaleOriginNo: undefined, eventTimeline: [] };
    TICKETS.push(row);
    const detail = { ...clone(TICKET_DETAIL), no: row.no, title: row.title, type, source, status, lastHandler: row.assignee, groupId: row.groupId, linkedRecords: [], childTickets: [], linkedAftersale: undefined, delegateInfo: null, isExternalAppeal: false };
    detail.product.afterSaleEnabled = true;
    return { row, detail };
  }
  function work(action, source) { return works.open({ action, scene: 'general', source: source?.detail }); }
  function ticket(type = '咨询') {
    const row = origin(type).row;
    row.no = `CHECK-NEW-${++seq}`; row.id = row.no; row.createdAt = row.updatedAt = '2026-11-17 18:00:00';
    TICKETS.splice(TICKETS.indexOf(row), 1); return row;
  }
  for (const type of ['咨询', '建议', '商机']) check(`transfer ${type}: original closes, both links survive reopen, duplicate submission reuses receipt`, () => {
    const source = origin(); const item = work('transfer', source); const created = ticket(type);
    const result = service.submitWorkTicket(item, created, true);
    assert.equal(source.row.nodeStatus, `已转${type}`);
    assert.equal(source.row.creationLinks[0].no, result.no);
    assert.equal(TICKETS.find((row) => row.no === result.no).creationLinks[0].no, source.row.no);
    const count = TICKETS.length;
    assert.equal(service.submitWorkTicket(item, ticket(type), true).no, result.no);
    assert.equal(TICKETS.length, count);
    ledger.hydrateCreationRows(); assert.equal(source.row.nodeStatus, `已转${type}`);
  });
  check('D06: draft restore and action entry reuse the same source/action work; different sources stay separate', () => {
    const a = origin(), b = origin(); const first = work('transfer', a); first.form = { title: '手改保留' };
    assert.equal(works.save(first), true);
    assert.equal(works.open(first.context, first.draftId).id, first.id);
    assert.equal(work('transfer', a).id, first.id);
    assert.notEqual(work('transfer', b).id, first.id);
    assert.equal(first.form.title, '手改保留');
  });
  check('draft quota failure preserves inputs and previous draft contents', () => {
    const item = work('transfer', origin()); item.form = { title: 'old' }; works.save(item);
    item.form.title = 'unsaved'; rejectedKey = 'flowos-ticket-drafts';
    assert.equal(works.save(item), false); rejectedKey = '';
    assert.equal(item.form.title, 'unsaved'); assert.equal(useTicketDraftStore().get(item.draftId).form.title, 'old');
  });
  for (const change of ['status', 'handler', 'group']) check(`source ${change} change blocks submission without a new row`, () => {
    const source = origin(); const item = work('transfer', source); const created = ticket();
    if (change === 'status') source.row.nodeStatus = '已关闭';
    if (change === 'handler') source.row.assignee = 'other-handler';
    if (change === 'group') source.row.groupId = 'other-group';
    const count = TICKETS.length;
    assert.throws(() => service.submitWorkTicket(item, created, true)); assert.equal(TICKETS.length, count);
  });
  check('transaction persistence failure leaves source and ticket collection unchanged', () => {
    const source = origin(); const item = work('transfer', source); const created = ticket(); const count = TICKETS.length;
    rejectedKey = 'flowos-creation-ledger-v1'; assert.throws(() => service.submitWorkTicket(item, created, true)); rejectedKey = '';
    assert.equal(source.row.nodeStatus, '处理中'); assert.equal(TICKETS.length, count); assert.equal(ledger.creationReceipt(item.id), undefined);
  });
  for (const source of ['电话', 'IM', '客户服务小程序', '外投渠道']) check(`D08: ${source} complaint cannot escalate externally`, () => {
    assert.equal(escalation.resolveEscalateButtons(origin('投诉', source).detail, 'agent-l2').external, false);
  });
  check('D08: internal source beats stale external flag, output source fixed external', () => {
    const source = origin('投诉', '内投渠道'); source.detail.isExternalAppeal = true;
    assert.equal(escalation.resolveEscalateButtons(source.detail, 'agent-l2').external, true);
    assert.equal(escalation.buildEscalatePrefill(source.detail, 'external').ticketSource, '外投渠道');
    const created = ticket('投诉'); created.ticketSource = '外投渠道';
    service.submitWorkTicket(work('escalateExternal', source), created, true);
    assert.equal(source.row.nodeStatus, '已升级外投');
  });
  check('D08: multiple category natures are deduplicated without dropping personnel/service/business', () => {
    assert.deepEqual(inferCreateComplaintNatures([{ cat1: '服务质量投诉', cat2: '对人员服务态度不满' }, { cat1: '服务质量投诉', cat2: '承诺未兑现' }, { cat1: '产品质量投诉', cat2: '安全事故' }, { cat1: '产品质量投诉', cat2: '质量事故' }]), ['人员投诉', '服务投诉', '业务投诉']);
  });
  user.setRole('complaint-handler');
  check('standard escalation preserves an already ended source state', () => {
    const source = origin('咨询', '电话', '已结案');
    service.submitWorkTicket(work('escalateComplaint', source), ticket('投诉'), true);
    assert.equal(source.row.nodeStatus, '已结案'); assert.ok(source.row.escalatedLinkNo);
  });
  check('1025: inbound consultation can escalate and derived aftersale slot migrates once', () => {
    const source = origin('咨询', '售后系统'); Object.assign(source.row, { aftersaleOriginNo: 'CHECK-AS-ORIGIN', aftersaleRelation: 'converted' });
    const created = ticket('投诉'); service.submitWorkTicket(work('escalateComplaint', source), created, true);
    assert.equal(source.row.aftersaleOriginNo, undefined);
    assert.equal(TICKETS.find((row) => row.no === created.no).aftersaleOriginNo, 'CHECK-AS-ORIGIN');
    assert.equal(TICKETS.find((row) => row.no === created.no).aftersaleRelation, 'converted');
  });
  check('weak complaint link leaves original status unchanged', () => {
    const source = origin(); source.row.isXiaozhi = true; source.row.xiaozhi = { linkedComplaintNos: [] };
    source.detail.isXiaozhi = true;
    const created = ticket('投诉'); service.submitWorkTicket(work('linkComplaint', source), created, true);
    assert.equal(source.row.nodeStatus, '处理中'); assert.ok(source.row.xiaozhi.linkedComplaintNos.includes(created.no));
  });
  const payload = { customerName: 'check', customerPhone: '13800000000', province: '安徽省', city: '合肥市', district: '蜀山区', address: '测试地址', fault: '测试故障', faultAttachments: ['proof.png'], productCategory: '智能硬件', productName: 'test product', serviceType: '寄修检测', serviceMethod: '寄修', sn: 'TEST-SN', brand: '', productAttr: '', detail: '测试' };
  check('standalone aftersale creates a queryable local order and no customer-service ticket', () => {
    const item = work('aftersale'); const count = TICKETS.length;
    const result = service.submitWorkAftersale(item, payload);
    assert.equal(TICKETS.length, count); assert.equal(ledger.localAftersaleOrders.value.find((order) => order.no === result.no).payload.sn, 'TEST-SN');
    assert.equal(service.submitWorkAftersale(item, payload).no, result.no);
  });
  user.setRole('agent-l2');
  check('transfer to aftersale keeps the source alive and repeat relation creation is blocked', () => {
    const source = origin(); const item = work('aftersale', source); service.submitWorkAftersale(item, payload);
    assert.equal(source.row.nodeStatus, '已转出'); assert.ok(source.row.linkedAftersaleNo);
    const again = { ...item, id: 'another-work-id' }; assert.throws(() => service.submitWorkAftersale(again, payload));
  });
  check('specialized side effect then failure is reconciled without calling create again', () => {
    const item = work('transfer', origin()); let calls = 0; const created = ticket();
    assert.throws(() => special.runSpecialCreation(item, () => { calls++; TICKETS.push(created); throw new Error('after insert failure'); }));
    assert.equal(special.resumeSpecialResult(item).no, created.no); assert.equal(calls, 1);
    service.submitWorkTicket(item, special.resumeSpecialResult(item), true, true);
    assert.equal(ledger.creationReceipt(item.id).phase, 'complete');
  });
  check('915: continuation inherits source fields, collects supplement in child and bypasses auto dispatch', () => {
    const source = origin('商机', 'IM', '已结案'); source.row.groupNames = ['原归属组']; source.row.problemDesc = '原问题';
    const item = work('reopen', source); item.form = { continuationSupplement: '新补充', continuationAttachments: ['补充.png'] };
    const created = ticket('咨询');
    service.submitWorkTicket(item, created, true);
    const child = TICKETS.find((row) => row.no === created.no);
    assert.equal(child.title, source.row.title); assert.equal(child.type, '商机'); assert.equal(child.ticketSource, 'IM');
    assert.equal(child.groupId, source.row.groupId); assert.equal(child.assignee, null); assert.equal(child.nodeStatus, '未认领'); assert.equal(child.tab, 'pool');
    assert.equal(child.problemDesc, '原问题\n\n新补充'); assert.equal(child.creationSupplements.length, 1); assert.equal(child.supplementPendingCount, 1);
    assert.equal(source.row.nodeStatus, '已结案'); assert.equal(source.row.continuationChildNo, child.no);
    assert.throws(() => service.submitWorkTicket({ ...item, id: 'second-continuation' }, ticket(), false));
  });
  user.setRole('complaint-handler');
  check('830: upgraded source requires confirmation and transfers callback ownership; terminal target only logs', () => {
    const source = origin('咨询', '电话', '已升级产研'); source.detail.feishuSync = 'synced'; source.detail.feishuFeedbackNo = 'RD-CHECK';
    const item = work('escalateComplaint', source); const created = ticket('投诉');
    assert.throws(() => service.submitWorkTicket(item, created, true));
    item.context.confirmedUpgradeStatus = '已升级产研'; service.submitWorkTicket(item, created, true);
    assert.equal(source.row.upgradeReturnToNo, created.no);
    assert.equal(TICKETS.find((row) => row.no === created.no).inheritedEscalation.feishuFeedbackNo, 'RD-CHECK');
  });
  const returns = await server.ssrLoadModule('/src/views/tickets/composables/upgradeReturnRouting.ts');
  check('late upgrade return follows recorded handoff and never reopens a terminal target', () => {
    const source = TICKETS.find((row) => row.upgradeReturnToNo); const target = TICKETS.find((row) => row.no === source.upgradeReturnToNo);
    target.nodeStatus = '已关闭'; const oldState = source.nodeStatus;
    returns.receiveUpgradeReturn(source.no, { id: 'late-return-check', kind: 'tech-return', content: '迟到回传', at: '2026-11-17 19:00:00' });
    assert.equal(target.nodeStatus, '已关闭'); assert.equal(source.nodeStatus, oldState); assert.ok(target.eventTimeline.some((entry) => entry.what.includes('仅记录履历')));
  });
  user.setRole('agent-l2');
  check('aftersale created then binding conflict keeps number, preserves source, and draft resumes reconciliation only', () => {
    const source = origin(); const item = work('aftersale', source); item.surface = 'aftersale'; item.aftersaleForm = clone(payload);
    const first = service.recordWorkAftersale(item, payload); const count = ledger.localAftersaleOrders.value.length;
    source.row.linkedAftersaleNo = 'OTHER-AS'; source.row.nodeStatus = '已转出';
    assert.throws(() => service.finishWorkAftersale(item), /OTHER-AS/);
    assert.equal(source.row.linkedAftersaleNo, 'OTHER-AS'); assert.equal(ledger.creationReceipt(item.id).phase, 'created');
    item.status = 'unknown'; assert.equal(works.save(item), true); const draftId = item.draftId; works.remove(item.id);
    const resumed = works.open(item.context, draftId); assert.equal(resumed.id, item.id); assert.equal(resumed.resultNo, first.no);
    assert.equal(service.recordWorkAftersale(resumed, payload).no, first.no); assert.equal(ledger.localAftersaleOrders.value.length, count);
    delete source.row.linkedAftersaleNo; source.row.nodeStatus = '处理中';
    assert.equal(service.finishWorkAftersale(resumed).no, first.no); assert.equal(ledger.localAftersaleOrders.value.length, count);
  });
  const { buildChildTicketPrefill, buildReopenTicketPrefill } = await server.ssrLoadModule('/src/views/tickets/composables/childTicketPrefill.ts');
  const { useCreateTicketForm } = await server.ssrLoadModule('/src/views/tickets/composables/useCreateTicketForm.ts');
  check('actual legacy business source retains business/product/category/customer facts; transfer never inherits invalid high priority', () => {
    const row = TICKETS.find((ticket) => ticket.no === 'IFLYSJ-20260716-00001');
    const detail = { ...clone(TICKET_DETAIL), no: row.no, title: row.title, type: row.type, source: 'IM', businessType: '开放平台', product: { ...clone(TICKET_DETAIL.product), name: row.product, category: row.productCategory, issueTags: ['历史一类', '历史二类', '历史三类'] } };
    const prefill = buildChildTicketPrefill(detail); assert.equal(prefill.priority, undefined);
    assert.equal(prefill.productCategory, '软件服务'); assert.equal(prefill.product, '开放平台'); assert.equal(prefill.businessType, '开放平台');
    const scope = effectScope(); scope.run(() => {
      const ctx = useCreateTicketForm(() => prefill, { twoLevelProblem: true, preserveSourceFields: true }); ctx.applyPrefill(prefill);
      assert.equal(ctx.form.productName, '开放平台'); assert.equal(ctx.form.productCategory, '软件服务'); assert.equal(ctx.form.businessType, '开放平台');
      assert.equal(ctx.form.problemL1, '历史一类'); assert.equal(ctx.form.customer.region, detail.customer.region);
    }); scope.stop();
    const inherited = buildReopenTicketPrefill(detail); assert.equal(inherited.priority, 'P1'); assert.equal(inherited.formTicketType, row.type);
  });
  const { useDelegateTaskStore } = await server.ssrLoadModule('/src/stores/delegateTasks.ts');
  check('opening transfer then delegating the source blocks submission using live tasks, not the opening snapshot', () => {
    const source = origin(); const item = work('transfer', source); const created = ticket('建议');
    useDelegateTaskStore().createBatch(source.row.no, { mode: 'person', assignees: [{ name: '协办对象', task: '确认现场问题' }] }, user.name);
    const count = TICKETS.length; const delegatedState = source.row.nodeStatus; assert.throws(() => service.submitWorkTicket(item, created, true), /委派/);
    assert.equal(TICKETS.length, count); assert.equal(source.row.nodeStatus, delegatedState); assert.equal(ledger.creationReceipt(item.id), undefined);
  });
  check('SLA contract: live transfer and both escalation hops preserve effective cumulative clocks and first response; assessment starts zero', () => {
    for (const action of ['transfer', 'escalateComplaint', 'escalateExternal']) {
      user.setRole(action === 'transfer' ? 'agent-l2' : 'complaint-handler');
      const source = origin(action === 'escalateExternal' ? '投诉' : '咨询', action === 'escalateExternal' ? '内投渠道' : '电话');
      source.row.responded = true;
      source.detail.slaClocks = [{ kind: 'first', label: '整单首响', totalSec: 1800, remainSec: 600, phase: 'stopped', warnSec: 900, dueBy: '' }, { kind: 'whole', label: '整单解决', totalSec: 28800, remainSec: 18000, phase: 'running', warnSec: 1800, dueBy: '' }];
      const item = work(action, source); const created = ticket(action === 'transfer' ? '建议' : '投诉');
      if (action === 'escalateExternal') created.ticketSource = '外投渠道';
      service.submitWorkTicket(item, created, true, true);
      assert.equal(created.creationSla.customer.firstElapsedMs, 1200000);
      assert.equal(created.creationSla.customer.solveElapsedMs, 10800000);
      assert.equal(created.creationSla.customer.responded, true); assert.equal(created.responded, true);
      assert.equal(created.creationSla.assessment.solveElapsedMs, 0); assert.equal(created.creationSla.assessment.firstElapsedMs, 0);
      ledger.hydrateCreationRows(); assert.equal(TICKETS.find((t) => t.no === created.no).creationSla.inheritedFromNo, source.row.no);
    }
    user.setRole('complaint-handler');
    const source = origin('咨询', '电话', '已关闭'); const item = work('escalateComplaint', source); const created = ticket('投诉');
    service.submitWorkTicket(item, created, true, true); assert.equal(created.creationSla.inheritedFromNo, undefined); assert.equal(created.creationSla.customer.solveElapsedMs, 0);
  });
  user.setRole('agent-l2');
  check('product without aftersale service blocks new transfer but preserves existing activation route', () => {
    const source = origin(); source.row.product = '开放平台'; source.detail.product.name = '开放平台';
    const item = work('aftersale', source); const count = ledger.localAftersaleOrders.value.length;
    assert.throws(() => service.recordWorkAftersale(item, payload), /售后/); assert.equal(ledger.localAftersaleOrders.value.length, count);
  });
  check('pending aftersale receipt cannot delete its draft or work, survives reload and reconciles without creation', () => {
    const source = origin(); const item = work('aftersale', source); item.surface = 'aftersale'; item.aftersaleForm = clone(payload);
    const receipt = service.recordWorkAftersale(item, payload); item.status = 'unknown'; works.save(item);
    assert.equal(useTicketDraftStore().remove(item.draftId), false); assert.equal(works.remove(item.id), false);
    const serialized = JSON.parse(data.get('flowos-ticket-drafts')).find((d) => d.id === item.draftId);
    assert.equal(serialized.resultNo, receipt.no); assert.equal(serialized.workStatus, 'unknown');
    const count = ledger.localAftersaleOrders.value.length; assert.equal(service.finishWorkAftersale(item).no, receipt.no);
    works.complete(item, receipt.no); assert.equal(useTicketDraftStore().get(item.draftId), null); assert.equal(ledger.localAftersaleOrders.value.length, count);
  });
  const { message } = await import('ant-design-vue'); for (const key of ['error', 'info', 'success', 'warning']) message[key] = () => {};
  check('full complaint: occurrence time required for every source; channel content and numbering survive draft/build', () => {
    for (const source of ['电话', 'IM', '客户服务小程序', '内投渠道', '外投渠道']) {
      const scope = effectScope(); scope.run(() => {
        const ctx = useCreateTicketForm(() => null); ctx.form.ticketType = '投诉'; ctx.form.ticketSource = source;
        ctx.validate(); assert.equal(ctx.errors.problemTime, true);
        ctx.form.problemTime = '2026-11-17 10:20';
        ctx.form.complaintPlatforms = [{ platform: source === '内投渠道' ? '其他' : '市场监管12315平台', customPlatform: source === '内投渠道' ? '门店' : undefined, complaintNo: 'CP-12', complaintContent: '平台原文' }];
        const created = ctx.buildTicket(); assert.equal(created.problemOccurredAt, '2026-11-17 10:20');
        if (source.endsWith('渠道')) { assert.equal(created.complaintPlatforms[0].complaintContent, '平台原文'); assert.equal(created.complaintPlatforms[0].complaintNo, 'CP-12'); }
      }); scope.stop();
    }
  });
  // Execute the actual SFC setup/watchers with a headless Vue renderer (no browser/HMR).
  const component = (await server.ssrLoadModule('/src/views/tickets/components/unified-create/UnifiedCreateForm.vue')).default;
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:pathMatch(.*)*', component: { render: () => null } }] });
  await router.push('/');
  const renderer = createRenderer({ insert() {}, remove() {}, createElement: () => ({}), createText: () => ({}), createComment: () => ({}), setText() {}, setElementText() {}, parentNode: () => null, nextSibling: () => null, patchProp() {} });
  const item = work('create'); item.surface = 'ticket';
  const app = renderer.createApp({ render: () => h({ ...component, render: () => null }, { item }) });
  app.use(pinia);
  app.use(router); app.provide(ssrContextKey, {});
  const root = app.mount({});
  const state = root.$.subTree.component.setupState;
  await nextTick();
  const { PRODUCT_NAMES } = await server.ssrLoadModule('/src/views/tickets/types/createTicket.ts');
  const saleTag = state.problemTags.enabledRows.find((r) => r.exclusive === '售后' && Object.values(PRODUCT_NAMES).some((names) => names.includes(r.productName))); assert.ok(saleTag);
  const category = Object.keys(PRODUCT_NAMES).find((key) => PRODUCT_NAMES[key].includes(saleTag.productName));
  state.restoring = true;
  state.ctx.applyDraft({ ...clone(state.form), ticketType: '咨询', priority: 'P3', productCategory: category, productName: saleTag.productName, problemL1: saleTag.tagL1, problemL2: saleTag.tagL2, problemL3: saleTag.tagL3, description: '售后诉求', customer: { id: 'component-customer', name: '原客户', phone: '13800000000', region: '安徽省 / 合肥市 / 蜀山区', address: '原地址' } });
  await nextTick(); state.restoring = false;
  state.form.description = '已确认售后诉求'; await nextTick();
  await state.continueAftersale(); assert.equal(state.isAftersaleType, true);
  item.aftersaleForm = { ...clone(payload), customerName: '原客户', detail: '保留专业输入' }; item.aftersaleOpen = false;
  const guard = await server.ssrLoadModule('/src/views/tickets/composables/createWorkGuard.ts');
  const flush = async () => { await nextTick(); await nextTick(); await nextTick(); };
  state.form.ticketType = '投诉'; await flush(); assert.ok(guard.closeRequest.value);
  assert.equal(item.form.ticketType, '咨询'); assert.equal(item.surface, 'aftersale');
  guard.resolveWorkClose(false); await flush();
  assert.equal(state.form.ticketType, '咨询'); assert.equal(state.isAftersaleType, true); assert.equal(item.surface, 'aftersale');
  checks++; console.log('PASS actual unified SFC: abandoning sale-to-complaint switch restores full prior type/category/branch');
  state.form.ticketType = '投诉'; await flush(); assert.ok(guard.closeRequest.value); guard.resolveWorkClose(true); await flush();
  assert.equal(state.form.ticketType, '投诉'); assert.equal(item.surface, 'ticket'); assert.equal(works.save(item), true);
  const savedId = item.draftId; assert.equal(useTicketDraftStore().get(savedId).typeLabel, '投诉');
  works.remove(item.id); const restored = works.open(item.context, savedId);
  assert.equal(restored.surface, 'ticket'); assert.equal(restored.aftersaleOpen, false); assert.ok(restored.aftersaleForm); assert.equal(restored.form.ticketType, '投诉');
  checks++; console.log('PASS actual unified SFC: sale-to-complaint draft restores only complaint despite inactive professional snapshot');
  state.form.ticketType = '咨询'; await flush();
  assert.equal(state.isAftersaleType, true); item.surface = 'aftersale';
  const pendingReceipt = service.recordWorkAftersale(item, payload); item.status = 'unknown';
  state.form.ticketType = '投诉'; await flush();
  assert.equal(state.form.ticketType, '咨询'); assert.equal(item.surface, 'aftersale'); assert.equal(guard.closeRequest.value, null);
  const beforeCount = TICKETS.length;
  assert.throws(() => service.submitWorkTicket(item, ticket(), true), /不能复用/); assert.equal(TICKETS.length, beforeCount);
  assert.equal(ledger.creationReceipt(item.id).no, pendingReceipt.no);
  checks++; console.log('PASS actual unified SFC: pending aftersale receipt blocks branch conversion and service rejects CS creation');
  app.unmount();
  const saleComponent = (await server.ssrLoadModule('/src/views/tickets/components/operation/AftersaleCreateForm.vue')).default;
  const saleApp = renderer.createApp({ render: () => h({ ...saleComponent, render: () => null }, { snapshot: { ...clone(payload), address: '', serviceMethod: '上门', visitTime: '' } }) });
  saleApp.provide(ssrContextKey, {});
  const saleRoot = saleApp.mount({}); const saleInstance = saleRoot.$.subTree.component;
  assert.equal(saleInstance.exposed.getPayload(), null); assert.ok(saleInstance.setupState.errs.visitTime); assert.equal(saleInstance.setupState.errs.address, undefined);
  saleInstance.setupState.form.visitTime = '2026-11-18 12:00'; assert.ok(saleInstance.exposed.getPayload()); saleApp.unmount();
  checks++; console.log('PASS actual aftersale SFC: address optional, visit appointment required and correction allows submission');
  user.setRole('complaint-handler');
  const externalSource = origin('投诉', '内投渠道');
  const externalItem = work('escalateExternal', externalSource);
  const externalApp = renderer.createApp({ render: () => h({ ...component, render: () => null }, { item: externalItem }) });
  externalApp.use(pinia); externalApp.use(router); externalApp.provide(ssrContextKey, {});
  const externalRoot = externalApp.mount({}); const externalState = externalRoot.$.subTree.component.setupState; await flush();
  const { CREATE_COMPLAINT_L2_MAP } = await server.ssrLoadModule('/src/views/tickets/types/complaintCreateCategory.ts');
  const validRows = Object.entries(CREATE_COMPLAINT_L2_MAP).filter(([, rows]) => rows.length).slice(0, 2).map(([cat1, rows]) => ({ cat1, cat2: rows[0] }));
  externalState.form.externalComplaintCategories = [validRows[0], { ...validRows[1], cat2: '' }];
  externalState.form.complaintPlatforms = [{ platform: '其他', customPlatform: '外部平台一', complaintNo: 'ONE' }, { platform: '其他', customPlatform: '外部平台二', complaintNo: 'TWO' }];
  externalState.form.description = '补充外投说明';
  assert.equal(externalState.validateExternal(), false); assert.equal(externalState.errors.complaintL2, true);
  externalState.form.externalComplaintCategories = clone(validRows); assert.equal(externalState.validateExternal(), true);
  assert.equal(externalState.form.problemTime, ''); externalState.onCreate(); await flush();
  const externalReceipt = ledger.creationReceipt(externalItem.id); assert.ok(externalReceipt); assert.equal(externalReceipt.phase, 'complete');
  ledger.hydrateCreationRows(); const externalCreated = TICKETS.find((t) => t.no === externalReceipt.no);
  assert.deepEqual(externalCreated.externalComplaintCategories, validRows); assert.equal(externalCreated.complaintPlatforms.length, 2);
  assert.equal(externalCreated.complaintPlatforms[0].complaintNo, 'ONE'); assert.equal(externalCreated.complaintPlatforms[1].customPlatform, '外部平台二'); assert.equal(externalCreated.complaintPlatforms[1].complaintNo, 'TWO');
  assert.deepEqual(inferCreateComplaintNatures(externalCreated.externalComplaintCategories), [...new Set(inferCreateComplaintNatures(validRows))]);
  externalApp.unmount(); checks++; console.log('PASS actual D08 SFC: incomplete second category blocked; complete multiple categories/platform pairs persist successfully, without full-only required time');
  user.setRole('agent-l2');
  const historicalSource = origin();
  Object.assign(historicalSource.row, { problemL1: '旧一类', problemL2: '旧二类', problemL3: '旧三级' });
  const historicalItem = works.open({ action: 'transfer', scene: 'general', source: historicalSource.detail, prefill: buildChildTicketPrefill(historicalSource.detail) });
  const historicalApp = renderer.createApp({ render: () => h({ ...component, render: () => null }, { item: historicalItem }) });
  historicalApp.use(pinia); historicalApp.use(router); historicalApp.provide(ssrContextKey, {});
  const historicalRoot = historicalApp.mount({}); const historicalState = historicalRoot.$.subTree.component.setupState; await flush();
  for (const [options, value, label] of [[historicalState.l2PathOptions, historicalState.problemL2Path, '旧二类'], [historicalState.l3PathOptions, historicalState.problemL3Path, '旧三级']]) {
    const current = options.find((row) => row.value === value); assert.ok(current); assert.equal(current.label, label); assert.equal(current.label.includes('\u001f'), false); assert.equal(current.disabled, true);
  }
  const beforeHistorical = TICKETS.length; historicalState.form.priority = 'P3'; historicalState.onCreate();
  assert.match(historicalItem.error, /问题分类/); assert.equal(TICKETS.length, beforeHistorical); historicalApp.unmount();
  checks++; console.log('PASS actual unified SFC: historical L2/L3 use human labels while invalid legacy path still blocks creation');

  const productApp = renderer.createApp({ render: () => h({ ...saleComponent, render: () => null }, { snapshot: { ...clone(payload), productCategory: '', productName: '', serviceMethod: '上门', visitTime: '2026-11-18 12:00' } }) });
  productApp.provide(ssrContextKey, {}); const productRoot = productApp.mount({}); const productInstance = productRoot.$.subTree.component; const productState = productInstance.setupState;
  assert.equal(productInstance.exposed.getPayload(), null); assert.ok(productState.errs.productCategory); assert.ok(productState.errs.productName);
  assert.ok(productState.productCategoryOptions.some((row) => row.value === '智能硬件'));
  productState.form.productCategory = '智能硬件'; productState.onProductCategoryChange();
  assert.ok(productState.productNameOptions.some((row) => row.value === '智能音箱 X1')); productState.form.productName = '智能音箱 X1';
  assert.equal(productInstance.exposed.getPayload().productName, '智能音箱 X1');
  productState.form.productCategory = '翻译机系列'; productState.onProductCategoryChange(); assert.equal(productState.form.productName, '');
  assert.ok(productState.productNameOptions.some((row) => row.value === '三防翻译机')); productState.form.productName = '三防翻译机'; assert.equal(productInstance.exposed.getPayload().productName, '三防翻译机'); productApp.unmount();
  checks++; console.log('PASS actual aftersale SFC: missing product is correctable from existing create/product-tree dictionaries; category change clears conflict');

  const historySaleApp = renderer.createApp({ render: () => h({ ...saleComponent, render: () => null }, { snapshot: { ...clone(payload), productCategory: '历史产品分类', productName: '历史产品名称', serviceMethod: '上门', visitTime: '2026-11-18 12:00' } }) });
  historySaleApp.provide(ssrContextKey, {}); const historySaleRoot = historySaleApp.mount({}); const historySaleState = historySaleRoot.$.subTree.component.setupState;
  assert.ok(historySaleState.productCategoryOptions.some((row) => row.value === '历史产品分类'));
  assert.ok(historySaleState.productNameOptions.some((row) => row.value === '历史产品名称')); historySaleApp.unmount();
  checks++; console.log('PASS actual aftersale SFC: current historical product/category remain selectable and readable');

  const attachComponent = (await server.ssrLoadModule('/src/views/tickets/components/operation/shared/OpTextareaAttach.vue')).default;
  const attachProps = reactive({ modelValue: '', attachments: [], maxCount: 9, acceptExts: ['png', 'mp4'], maxFileSizeByExtMb: { png:10, mp4:20 }, readonly: false });
  let added = [];
  const attachView = { ...attachComponent, render: () => null };
  const attachApp = renderer.createApp({ render: () => h(attachView, { ...attachProps, 'onUpdate:attachments': (files) => { attachProps.attachments = files; }, onFilesAdded: (files) => { added = files; } }) });
  attachApp.provide(ssrContextKey, {}); const attachRoot = attachApp.mount({}); const attachState = attachRoot.$.subTree.component.setupState;
  const selectFiles = async (files) => { added = []; const input = { files, value: 'selected' }; attachState.onFilesSelected({ target: input }); await flush(); return added; };
  const mb = 1024 * 1024;
  await selectFiles([{ name:'limit.png', size:10*mb }, { name:'over.png', size:10*mb+1 }, { name:'limit.mp4', size:20*mb }, { name:'over.mp4', size:20*mb+1 }]);
  assert.deepEqual(attachProps.attachments, ['limit.png', 'limit.mp4']);
  attachProps.attachments = Array.from({length:7}, (_, i) => `${i}.png`); await flush();
  await selectFiles([{ name:'eighth.png', size:1 }, { name:'ninth.mp4', size:1 }, { name:'tenth.png', size:1 }]);
  assert.equal(attachProps.attachments.length, 9); assert.equal(attachProps.attachments.includes('tenth.png'), false);
  await selectFiles([{ name:'another.png', size:1 }]); assert.equal(added.length, 0); assert.equal(attachProps.attachments.length, 9);
  checks++; console.log('PASS attachment SFC: exact 10MB image/20MB video allowed, one byte over blocked, ninth allowed and tenth blocked across batches');
  attachProps.readonly = true; await flush(); await selectFiles([{ name:'readonly.png', size:1 }]); attachState.removeFile('0.png'); assert.equal(attachProps.attachments.length, 9); assert.equal(added.length, 0);
  checks++; console.log('PASS attachment SFC: readonly blocks adding/removing files'); attachApp.unmount();

  const defaultApp = renderer.createApp({ render: () => h({ ...attachComponent, render: () => null }, { modelValue:'', attachments:[], 'onUpdate:attachments': (files) => { added=files; } }) });
  defaultApp.provide(ssrContextKey, {}); const defaultRoot = defaultApp.mount({}); added=[];
  defaultRoot.$.subTree.component.setupState.onFilesSelected({ target: { files: Array.from({length:10}, (_, i) => ({ name:`default-${i}.png`, size:21*mb })), value:'selected' } });
  assert.equal(added.length, 10); defaultApp.unmount(); checks++; console.log('PASS attachment SFC: omitted new constraints preserve unrestricted existing callers');

  const pendingSaleItem = work('aftersale', origin()); pendingSaleItem.surface = 'aftersale'; pendingSaleItem.aftersaleForm = { ...clone(payload), customerName:'未提交的改动' };
  service.recordWorkAftersale(pendingSaleItem, payload); pendingSaleItem.status='unknown';
  const saleModalComponent = (await server.ssrLoadModule('/src/views/tickets/components/unified-create/WorkAftersaleModal.vue')).default;
  const pendingApp = renderer.createApp({ render: () => h({ ...saleModalComponent, render: () => null }, { item: pendingSaleItem, context:{} }) });
  pendingApp.use(pinia); pendingApp.use(router); pendingApp.provide(ssrContextKey, {}); const pendingRoot = pendingApp.mount({}); const pendingState = pendingRoot.$.subTree.component.setupState;
  assert.equal(pendingState.readOnly, true); assert.equal(pendingState.needsReconciliation, true); assert.equal(pendingState.formSnapshot.customerName, payload.customerName);
  const readonlySaleApp = renderer.createApp({ render: () => h({ ...saleComponent, render: () => null }, { snapshot: pendingState.formSnapshot, readOnly:true, onChange: () => { throw new Error('readonly snapshot must not emit edits'); } }) });
  readonlySaleApp.provide(ssrContextKey, {}); const readonlyRoot = readonlySaleApp.mount({}); assert.equal(readonlyRoot.$.subTree.component.exposed.getPayload(), null); readonlySaleApp.unmount();
  pendingState.save(); assert.equal(useTicketDraftStore().get(pendingSaleItem.draftId).aftersaleForm.customerName, payload.customerName);
  assert.equal(useTicketDraftStore().get(pendingSaleItem.draftId).resultNo, pendingSaleItem.resultNo); pendingApp.unmount();
  checks++; console.log('PASS pending aftersale SFC: persisted order payload is authoritative, professional fields are readonly and cannot resubmit as a new order');
  console.log(`${checks} checks passed`);

} finally { await server.close(); for (const id of timers) { clearTimeout(id); clearInterval(id); } }
