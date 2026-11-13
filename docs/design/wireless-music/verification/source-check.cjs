/* Run from repository root: node docs/design/wireless-music/verification/source-check.cjs
 * Loads actual TypeScript source; only browser storage, actor/tenant stores, and tickets fixtures are isolated.
 * No repository or browser storage is changed.
 */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const projectRequire = createRequire(path.join(process.cwd(), 'package.json'));
const ts = projectRequire('typescript');
const vue = projectRequire('vue');
const pinia = projectRequire('pinia');
const cache = new Map();
let readHook;
global.localStorage = {
  getItem(key) { if (readHook) readHook(key); return cache.get(key) ?? null; },
  setItem(key, value) { cache.set(key, String(value)); },
  removeItem(key) { cache.delete(key); },
};
function load(file, dependencies = {}) {
  const source = fs.readFileSync(path.resolve(file), 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', js)(name => Object.hasOwn(dependencies, name) ? dependencies[name] : projectRequire(name), module, module.exports);
  return module.exports;
}
const roles = load('src/config/roles.ts');
const users = load('src/mock/users.ts');
const numbers = load('src/constants/ticketNo.ts');
const actor = vue.reactive({ ...users.MOCK_USERS['agent-l2'] });
Object.defineProperty(actor, 'role', { get() { return roles.ROLES[actor.roleKey]; } });
actor.canAccess = () => true;
const tenant = vue.reactive({ currentTenantId: 'source-check-a' });
const deps = {
  '@/config/roles': roles,
  '@/stores/user': { useUserStore: () => actor },
  '@/stores/tenant': { useTenantStore: () => tenant },
};
const catalogsModule = load('src/stores/formCatalogs.ts', deps);
const types = load('src/views/tickets/types/businessRegistration.ts', { '@/stores/formCatalogs': catalogsModule });
const tickets = [];
const registrationModule = load('src/stores/businessRegistration.ts', {
  ...deps, '@/mock/tickets': { TICKETS: tickets }, '@/mock/users': users,
  '@/constants/ticketNo': numbers, '@/views/tickets/types/businessRegistration': types,
});
pinia.setActivePinia(pinia.createPinia());
const store = registrationModule.useBusinessRegistrationStore();
const catalogs = catalogsModule.useFormCatalogsStore();
const seed = types.REGISTRATION_TEMPLATES[0];
const templateId = seed.id;
const businessKey = () => `flowos-business-registrations-v1:${tenant.currentTenantId}`;
const configKey = () => `flowos-form-catalogs-v1:${tenant.currentTenantId}`;
const copy = value => JSON.parse(JSON.stringify(value));
function setActor(key) { Object.assign(actor, users.MOCK_USERS[key]); }
function values(phone = '13800000000') { return { ...types.emptyRegistrationValues(), businessPhone: phone }; }
function save(no, nextValues, options = {}) { return store.save(no, nextValues, { expectedRevision: store.recordOf(no)?.revision ?? 0, ...options }); }
function fullValues(phone = '13800000000') {
  const template = types.registrationTemplateOf(templateId);
  const next = values(phone);
  for (const field of template.fields) if (field.closeRequired && !next[field.key]) next[field.key] = field.options?.[0] ?? 'example';
  const product = template.products[0];
  next.productName = product.name; next.productCategory = product.category;
  next.businessLine = product.businessLine ?? template.fields.find(field => field.key === 'businessLine').options[0];
  next.problemL1 = Object.keys(template.problemOptions)[0];
  next.problemL2 = template.problemOptions[next.problemL1][0];
  next.orderTime = '';
  return next;
}
let count = 0;
function check(label, fn) { fn(); console.log(`PASS ${++count}: ${label}`); }
(async () => {
  const created = store.create(values());
  const no = created.record?.no;
  check('01 number-only formal create and self handling', () => { assert.equal(created.ok, true); assert.equal(created.record.handler, actor.name); assert.equal(created.record.status, '处理中'); });
  check('02 independent record retains business phone without creating a normal ticket', () => { assert.equal(created.record.values.businessPhone, '13800000000'); assert.deepEqual(tickets, []); });
  check('03 independent numbering and consultation classification do not mix data domains', () => { assert.match(no, /^IFLYZJ-\d{8}-\d{5}$/); assert.equal(seed.ticketType, '咨询'); assert.equal(seed.includeInGeneralConsultationCount, false); assert.deepEqual(tickets, []); });
  check('04 incomplete close rejected', () => assert.equal(save(no, values(), { close: true }).ok, false));
  const future = types.registrationNow(new Date(Date.now() + 3600000)).replace(' ', 'T');
  check('05 future reminder set', () => assert.equal(store.setReminder(no, future, 'example').ok, true));
  const leader = users.MOCK_USERS['team-leader'].name;
  check('06 same-group transfer retains reminder time and changes recipient', () => { assert.equal(store.transfer(no, leader).ok, true); assert.equal(store.recordOf(no).reminder.at, future); assert.equal(store.recordOf(no).reminder.recipient, leader); });
  check('07 previous handler cannot edit', () => { assert.equal(store.canEdit(no), false); assert.equal(save(no, values()).ok, false); });
  setActor('team-leader');
  check('08 complete close with optional order time and reminder cancellation', () => { assert.equal(save(no, fullValues(), { close: true }).ok, true); assert.equal(store.recordOf(no).reminder, undefined); assert.equal(store.recordOf(no).values.orderTime, ''); });
  check('09 closed revision preserves closedAt and replyTime', () => { const before = copy(store.recordOf(no)); assert.equal(save(no, { ...before.values, description: 'revised' }, { revision: true }).ok, true); assert.equal(store.recordOf(no).closedAt, before.closedAt); assert.equal(store.recordOf(no).values.replyTime, before.values.replyTime); });
  setActor('tech-support');
  check('10 outside-group actor cannot edit/transfer/upload', () => { assert.equal(store.canEdit(no), false); assert.equal(store.canTransfer(no), false); assert.equal(store.canUpload(no), false); });
  setActor('team-leader');
  const persisted = JSON.parse(localStorage.getItem(businessKey()));
  const remote = { ...copy(persisted.records[0]), no: persisted.records[0].no.slice(0, -5) + '00999' };
  persisted.records.push(remote); localStorage.setItem(businessKey(), JSON.stringify(persisted));
  check('11 commit merges other-tab created records', () => { assert.equal(save(no, { ...store.recordOf(no).values, description: 'merged' }, { revision: true }).ok, true); assert.ok(store.recordOf(remote.no)); });
  const newer = JSON.parse(localStorage.getItem(businessKey()));
  const newerRecord = newer.records.find(record => record.no === no); newerRecord.revision += 1; newerRecord.values.description = 'remote edit';
  localStorage.setItem(businessKey(), JSON.stringify(newer));
  check('12 stale record commit rejected and current record reloaded', () => { assert.equal(save(no, { ...store.recordOf(no).values, description: 'stale' }, { revision: true }).ok, false); assert.equal(store.recordOf(no).values.description, 'remote edit'); });
  let reads = 0;
  readHook = key => {
    if (key !== businessKey() || ++reads !== 2) return;
    readHook = undefined;
    const data = JSON.parse(localStorage.getItem(key));
    data.records.push({ ...copy(data.records[0]), no: data.records[0].no.slice(0, -5) + '01000' });
    localStorage.setItem(key, JSON.stringify(data));
  };
  check('13 create collision rejected without replacing record', () => assert.equal(store.create(values('13800000001')).ok, false));
  readHook = undefined;
  let openNo;
  check('14 create recovers after collision', () => { const result = store.create(values('13800000001')); assert.equal(result.ok, true); openNo = result.record.no; });
  let finishRead;
  global.FileReader = class { readAsDataURL() { finishRead = () => { this.result = 'data:text/plain;base64,YQ=='; this.onload(); }; } };
  const uploading = store.addAttachments(openNo, [{ name: 'example.txt', size: 1, type: 'text/plain' }]);
  tenant.currentTenantId = 'source-check-b'; await vue.nextTick();
  check('15 tenant switch clears independent records without publishing any ticket projection', () => { assert.equal(store.records.length, 0); assert.equal(tickets.length, 0); });
  const otherTenant = store.create(values('13800000002'));
  finishRead(); const uploadResult = await uploading;
  check('16 async attachment cannot cross tenant', () => { assert.equal(uploadResult.ok, false); assert.equal(otherTenant.ok, true); assert.equal(store.recordOf(otherTenant.record.no).attachments.length, 0); });
  tenant.currentTenantId = 'source-check-a'; await vue.nextTick();
  check('17 tenant return restores own records', () => assert.ok(store.recordOf(openNo)));
  const baseline = store.recordOf(openNo).revision;
  assert.equal(store.setReminder(openNo, future).ok, true);
  check('18 editing baseline cannot silently overwrite latest in-memory version', () => assert.equal(store.save(openNo, values('13800000001'), { expectedRevision: baseline }).ok, false));
  check('19 save without explicit edit version rejected', () => assert.equal(store.save(openNo, values('13800000001')).ok, false));
  setActor('ops-admin');
  check('20 admin adds a form-scoped dictionary option with stable label', () => { assert.equal(catalogs.saveOption(seed, { field: 'feedback', value: 'custom-feedback', label: 'Example feedback', enabled: true }).ok, true); const template = types.registrationTemplateOf(); assert.ok(template.fields.find(field => field.key === 'feedback').options.includes('custom-feedback')); assert.equal(types.registrationOptionLabel(template, 'feedback', 'custom-feedback'), 'Example feedback'); });
  const feedbackRow = catalogs.optionRows(seed, 'feedback').find(row => row.value === 'custom-feedback');
  setActor('team-leader');
  let historicalNo;
  check('21 new dictionary option is usable in actual create', () => { const result = store.create({ ...values('13800000003'), feedback: 'custom-feedback' }); assert.equal(result.ok, true); historicalNo = result.record.no; });
  setActor('ops-admin'); assert.equal(catalogs.setOptionEnabled(seed, feedbackRow.id, false).ok, true);
  setActor('team-leader');
  check('22 disabled dictionary blocks new selection but preserves historical save', () => { assert.equal(store.create({ ...values('13800000004'), feedback: 'custom-feedback' }).ok, false); assert.equal(save(historicalNo, { ...store.recordOf(historicalNo).values, description: 'unchanged historical option' }).ok, true); assert.equal(store.recordOf(historicalNo).values.feedback, 'custom-feedback'); });
  setActor('ops-admin');
  check('23 dependent dictionary source and problem classification', () => { assert.equal(catalogs.saveOption(seed, { field: 'specificSource', value: 'source-x', parentValue: seed.fields.find(field => field.key === 'feedback').options[0], enabled: true }).ok, true); assert.equal(catalogs.saveOption(seed, { field: 'problemL1', value: 'problem-x', enabled: true }).ok, true); assert.equal(catalogs.saveOption(seed, { field: 'problemL2', value: 'problem-child', parentValue: 'problem-x', enabled: true }).ok, true); assert.deepEqual(types.registrationTemplateOf().problemOptions['problem-x'], ['problem-child']); assert.equal(catalogs.saveOption(seed, { field: 'problemL2', value: 'orphan', parentValue: 'missing', enabled: true }).ok, false); });
  const line = catalogs.optionRows(seed, 'businessLine', true)[0].value;
  check('24 independent product add includes business-line ownership', () => { assert.equal(catalogs.saveProduct(seed, { name: 'Product X', category: 'Category X', businessLine: line, enabled: true }).ok, true); const product = types.registrationTemplateOf().products.find(product => product.name === 'Product X'); assert.equal(product.businessLine, line); assert.equal(product.category, 'Category X'); });
  const productRow = catalogs.productRows(seed).find(product => product.name === 'Product X');
  setActor('team-leader');
  const productValues = { ...fullValues('13800000005'), productName: productRow.name, productCategory: productRow.category, businessLine: line };
  const historicProduct = store.create(productValues, { close: true }); assert.equal(historicProduct.ok, true);
  setActor('ops-admin'); assert.equal(catalogs.setProductEnabled(seed, productRow.id, false).ok, true);
  check('25 disabling product removes future selection with ID retained', () => { assert.equal(types.registrationTemplateOf().products.some(product => product.name === 'Product X'), false); assert.equal(catalogs.productRows(seed).find(product => product.name === 'Product X').id, productRow.id); });
  setActor('team-leader');
  check('26 historical disabled product can be revised without rewriting original values', () => { const record = store.recordOf(historicProduct.record.no); assert.equal(save(record.no, { ...record.values, description: 'historic product retained' }, { revision: true }).ok, true); assert.equal(store.recordOf(record.no).values.productName, 'Product X'); });
  check('27 ordinary member cannot mutate catalog', () => assert.equal(catalogs.saveOption(seed, { field: 'feedback', value: 'unauthorized', enabled: true }).ok, false));
  setActor('ops-admin');
  check('28 option and product names cannot be renamed', () => { assert.equal(catalogs.saveOption(seed, { ...feedbackRow, label: 'rename' }).ok, false); assert.equal(catalogs.saveProduct(seed, { ...productRow, name: 'rename', businessLine: line }).ok, false); });
  const modalRevision = catalogs.catalogOf(seed).revision;
  assert.equal(catalogs.saveOption(seed, { field: 'feedback', value: 'modal-change', enabled: true }).ok, true);
  check('29 stale admin dialog version rejected after live config update', () => assert.equal(catalogs.saveOption(seed, { field: 'feedback', value: 'stale-dialog', enabled: true, expectedRevision: modalRevision }).ok, false));
  const configSnapshot = JSON.parse(localStorage.getItem(configKey())); configSnapshot.catalogs[templateId].revision += 1;
  localStorage.setItem(configKey(), JSON.stringify(configSnapshot));
  check('30 external catalog conflict rejects old local snapshot', () => assert.equal(catalogs.saveOption(seed, { field: 'feedback', value: 'stale-cache', enabled: true }).ok, false));
  tenant.currentTenantId = 'source-check-b'; await vue.nextTick();
  check('31 form catalog scoped by tenant', () => assert.equal(catalogs.optionRows(seed, 'feedback').some(row => row.value === 'custom-feedback'), false));
  tenant.currentTenantId = 'source-check-a'; await vue.nextTick();
  check('32 returning tenant restores independent catalog', () => assert.equal(catalogs.optionRows(seed, 'feedback').find(row => row.value === 'custom-feedback').enabled, false));
  check('33 catalog changes did not rewrite persisted historical values', () => assert.equal(store.recordOf(historicalNo).values.feedback, 'custom-feedback'));
  setActor('team-leader');
  check('34 disabled historical dictionary value can complete closure', () => { const result = save(historicalNo, { ...fullValues('13800000003'), feedback: 'custom-feedback' }, { close: true }); assert.equal(result.ok, true); });
  check('35 disabled historical dictionary value remains editable after closure', () => { const before = copy(store.recordOf(historicalNo)); assert.equal(save(historicalNo, { ...before.values, description: 'closed historic option retained' }, { revision: true }).ok, true); assert.equal(store.recordOf(historicalNo).values.feedback, 'custom-feedback'); assert.equal(store.recordOf(historicalNo).closedAt, before.closedAt); assert.equal(store.recordOf(historicalNo).values.replyTime, before.values.replyTime); });
  const { clearLegacyRegistrationProjections } = load('src/views/self-service/legacyRegistrationProjection.ts', { '@/views/tickets/types/businessRegistration': types });
  const legacy = { id: `registration-${no}`, no, formTemplateId: templateId };
  const ordinarySameNo = { id: 'ordinary-same-no', no, formTemplateId: templateId, type: '咨询' };
  const unknownForm = { id: `registration-${no}`, no, formTemplateId: 'unrelated-form' };
  check('36 legacy cleanup removes only explicit registration projections, retaining same-number ordinary tickets', () => { const rows = [ordinarySameNo, legacy, unknownForm]; assert.equal(clearLegacyRegistrationProjections(rows), 1); assert.deepEqual(rows, [ordinarySameNo, unknownForm]); assert.equal(clearLegacyRegistrationProjections(rows), 0); });
  const oldCache = JSON.parse(localStorage.getItem(businessKey()));
  const oldRecord = { ...copy(store.recordOf(historicalNo)), no: 'IFLYZX-20261112-80012', handler: leader, attachments: [{ id: 'old-file', name: 'proof.txt', uploadedBy: leader, uploadedAt: '2026-11-12 18:00:00', url: 'data:text/plain;base64,YQ==', size: 1, type: 'text/plain' }], reminder: { id: 'old-reminder', recipient: leader, at: future }, history: [{ id: 'old-history', action: '创建工单', actor: leader, at: '2026-11-12 17:00:00', detail: 'preserved' }] };
  oldCache.records.push(oldRecord); localStorage.setItem(businessKey(), JSON.stringify(oldCache)); store.hydrate();
  check('37 workspace separation restores old number, attachments, history and reminder without rewriting cache', () => { assert.deepEqual(copy(store.recordOf(oldRecord.no)), oldRecord); assert.deepEqual(JSON.parse(localStorage.getItem(businessKey())).records.find(record => record.no === oldRecord.no), oldRecord); });
  check('38 new independent sequence never publishes into ordinary ticket collection', () => { const result = store.create(values('13800000006')); assert.equal(result.ok, true); assert.match(result.record.no, /^IFLYZJ-/); assert.deepEqual(tickets, []); });
  setActor('tech-support');
  check('39 read access uses self-service permission rather than the ordinary query-center menu', () => { actor.canAccess = key => key === 'query-center'; assert.equal(store.canView(oldRecord.no), false); actor.canAccess = key => key === 'self-service'; assert.equal(store.canView(oldRecord.no), true); });
  console.log(`ALL ${count} SOURCE CHECKS PASSED`);
})().catch(error => { console.error(error); process.exitCode = 1; });
