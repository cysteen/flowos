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
const modules = new Map();
function load(file, dependencies = {}) {
  const absolute = path.resolve(file);
  if (modules.has(absolute)) return modules.get(absolute).exports;
  const source = fs.readFileSync(absolute, 'utf8');
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    transformers: { before: [context => root => {
      const visit = node => ts.isMetaProperty(node) && node.keywordToken === ts.SyntaxKind.ImportKeyword
        ? context.factory.createIdentifier('__testImportMeta')
        : ts.visitEachChild(node, visit, context);
      return ts.visitNode(root, visit);
    }] },
  }).outputText;
  const module = { exports: {} };
  // Cache before evaluation: query/timeliness and the platform stores have real circular imports.
  modules.set(absolute, module);
  const localRequire = createRequire(absolute);
  new Function('require', 'module', 'exports', '__testImportMeta', `${js}\n//# sourceURL=${absolute.replaceAll('\\', '/')}`)(name => {
    if (Object.hasOwn(dependencies, name)) return dependencies[name];
    if (name.startsWith('@/') || name.startsWith('.')) {
      const base = name.startsWith('@/') ? path.resolve('src', name.slice(2)) : path.resolve(path.dirname(absolute), name);
      const target = [base, `${base}.ts`, path.join(base, 'index.ts')].find(candidate => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
      if (target?.endsWith('.ts')) return load(target, dependencies);
      if (target) return localRequire(target);
    }
    return localRequire(name);
  }, module, module.exports, { env: { MODE: 'test', DEV: false, PROD: true } });
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
  next.specificSource = template.sourceOptions[next.feedback]?.[0] ?? '';
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
  check('06 same-group transfer retains reminder time and changes recipient', () => { assert.equal(store.transfer(no, leader).ok, true); assert.equal(store.recordOf(no).reminders[0].at, future); assert.equal(store.recordOf(no).reminders[0].recipient, leader); });
  check('07 previous handler in the same group cannot edit or initiate another transfer', () => {
    const before = copy(store.recordOf(no));
    assert.equal(store.canEdit(no), false);
    assert.equal(save(no, values()).ok, false);
    assert.equal(store.canTransfer(no), false);
    assert.equal(store.transfer(no, actor.name).ok, false);
    assert.deepEqual(copy(store.recordOf(no)), before);
  });
  setActor('team-leader');
  check('08 complete close with optional order time and reminder cancellation', () => { assert.equal(save(no, fullValues(), { close: true }).ok, true); assert.equal(store.recordOf(no).reminders, undefined); assert.equal(store.recordOf(no).values.orderTime, ''); });
  check('09 closed revision preserves closure time and an unchanged reply time', () => { const before = copy(store.recordOf(no)); assert.equal(save(no, { ...before.values, description: 'revised' }, { revision: true }).ok, true); assert.equal(store.recordOf(no).closedAt, before.closedAt); assert.equal(store.recordOf(no).values.replyTime, before.values.replyTime); });
  check('closed revision can explicitly correct the manually maintained reply time', () => {
    const before = copy(store.recordOf(no));
    const replyTime = '2026-11-12 15:20:30';
    assert.equal(save(no, { ...before.values, replyTime }, { revision: true }).ok, true);
    const revised = store.recordOf(no);
    assert.equal(revised.status, '已结案');
    assert.equal(revised.closedAt, before.closedAt);
    assert.equal(revised.values.replyTime, replyTime);
    assert.ok(revised.history[0].changes.some(change => change.field === 'replyTime' && change.before === before.values.replyTime && change.after === replyTime));
  });
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
  check('15 tenant switch does not expose the previous tenant record or publish a ticket projection', () => { assert.equal(store.recordOf(openNo), undefined); assert.equal(tickets.length, 0); });
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
  check('24 product creation requires a configured business-line and product-line path', () => { assert.equal(catalogs.saveProduct(seed, { name: 'Product X', category: 'Category X', businessLine: line, enabled: true }).ok, false); assert.equal(catalogs.saveOption(seed, { field: 'productCategory', value: 'Category X', parentValue: line, enabled: true }).ok, true); assert.equal(catalogs.saveProduct(seed, { name: 'Product X', category: 'Category X', businessLine: line, enabled: true }).ok, true); const product = types.registrationTemplateOf().products.find(product => product.name === 'Product X'); assert.equal(product.businessLine, line); assert.equal(product.category, 'Category X'); });
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
  check('34 disabled historical dictionary value can complete closure', () => { const result = save(historicalNo, { ...fullValues('13800000003'), feedback: 'custom-feedback', specificSource: '' }, { close: true }); assert.equal(result.ok, true); });
  check('35 disabled historical dictionary value remains editable after closure', () => { const before = copy(store.recordOf(historicalNo)); assert.equal(save(historicalNo, { ...before.values, description: 'closed historic option retained' }, { revision: true }).ok, true); assert.equal(store.recordOf(historicalNo).values.feedback, 'custom-feedback'); assert.equal(store.recordOf(historicalNo).closedAt, before.closedAt); assert.equal(store.recordOf(historicalNo).values.replyTime, before.values.replyTime); });
  const { clearLegacyRegistrationProjections } = load('src/views/self-service/legacyRegistrationProjection.ts', { '@/views/tickets/types/businessRegistration': types });
  const legacy = { id: `registration-${no}`, no, formTemplateId: templateId };
  const ordinarySameNo = { id: 'ordinary-same-no', no, formTemplateId: templateId, type: '咨询' };
  const unknownForm = { id: `registration-${no}`, no, formTemplateId: 'unrelated-form' };
  check('36 legacy cleanup removes only explicit registration projections, retaining same-number ordinary tickets', () => { const rows = [ordinarySameNo, legacy, unknownForm]; assert.equal(clearLegacyRegistrationProjections(rows), 1); assert.deepEqual(rows, [ordinarySameNo, unknownForm]); assert.equal(clearLegacyRegistrationProjections(rows), 0); });
  const oldCache = JSON.parse(localStorage.getItem(businessKey()));
  const oldRecord = { ...copy(store.recordOf(historicalNo)), no: 'IFLYZX-20261112-80012', status: '处理中', closedAt: undefined, handler: leader, attachments: [{ id: 'old-file', name: 'proof.txt', uploadedBy: leader, uploadedAt: '2026-11-12 18:00:00', url: 'data:text/plain;base64,YQ==', size: 1, type: 'text/plain' }], reminder: { id: 'old-reminder', recipient: leader, at: future }, history: [{ id: 'old-history', action: '创建工单', actor: leader, at: '2026-11-12 17:00:00', detail: 'preserved' }] };
  oldCache.records.push(oldRecord); localStorage.setItem(businessKey(), JSON.stringify(oldCache)); store.hydrate();
  check('37 workspace separation restores old number, attachments, history and reminder without rewriting cache', () => {
    const hydrated = store.recordOf(oldRecord.no);
    assert.equal(hydrated.reminders[0].id, 'old-reminder');
    assert.equal(hydrated.reminders[0].recipient, leader);
    assert.equal(JSON.parse(localStorage.getItem(businessKey())).records.find(record => record.no === oldRecord.no).reminder.id, 'old-reminder');
  });
  check('38 new independent sequence never publishes into ordinary ticket collection', () => { const result = store.create(values('13800000006')); assert.equal(result.ok, true); assert.match(result.record.no, /^IFLYZJ-/); assert.deepEqual(tickets, []); });
  setActor('tech-support');
  check('39 read access uses self-service permission rather than the ordinary query-center menu', () => { actor.canAccess = key => key === 'query-center'; assert.equal(store.canView(oldRecord.no), false); actor.canAccess = key => key === 'self-service'; assert.equal(store.canView(oldRecord.no), true); });
  setActor('agent-l2');
  let draftNo;
  check('blank draft receives a unique IFLYZJ number but has no formal creation event', () => {
    const before = store.records.length;
    const result = store.create(types.emptyRegistrationValues(), { draft: true });
    assert.equal(result.ok, true);
    draftNo = result.record.no;
    assert.match(draftNo, /^IFLYZJ-\d{8}-\d{5}$/);
    assert.equal(result.record.status, '草稿');
    assert.equal(result.record.values.businessPhone, '');
    assert.equal(result.record.history.some(event => event.action === '创建工单'), false);
    assert.equal(store.records.length, before + 1);
    assert.equal(store.canTransfer(draftNo), false);
    assert.equal(store.addReminder(draftNo, future).ok, false);
  });
  check('another blank draft consumes the next sequence without making either draft formal', () => {
    const result = store.create(types.emptyRegistrationValues(), { draft: true });
    assert.equal(result.ok, true);
    assert.notEqual(result.record.no, draftNo);
    assert.equal(Number(result.record.no.slice(-5)), Number(draftNo.slice(-5)) + 1);
    assert.equal(store.recordOf(draftNo).status, '草稿');
    assert.equal(result.record.status, '草稿');
  });
  check('draft cannot become a formal registration until the business phone is supplied', () => {
    const before = copy(store.recordOf(draftNo));
    const result = save(draftNo, before.values, { promote: true });
    assert.equal(result.ok, false);
    assert.ok(result.errors.businessPhone);
    assert.deepEqual(copy(store.recordOf(draftNo)), before);
  });
  check('formal creation promotes the same numbered draft and writes exactly one creation event', () => {
    const beforeCount = store.records.length;
    const result = save(draftNo, values('13800000007'), { promote: true });
    assert.equal(result.ok, true);
    assert.equal(result.record.no, draftNo);
    assert.equal(result.record.status, '处理中');
    assert.equal(result.record.history.filter(event => event.action === '创建工单').length, 1);
    assert.equal(store.records.length, beforeCount);
    assert.equal(save(draftNo, result.record.values).ok, true);
    assert.equal(store.recordOf(draftNo).history.filter(event => event.action === '创建工单').length, 1);
  });
  const crossGroup = store.transferTargetGroups().find(group => store.membersForGroup(group.value).some(name => name !== leader && name !== actor.name));
  assert.ok(crossGroup, 'real platform directory must provide a target group');
  const crossHandler = store.membersForGroup(crossGroup.value).find(name => name !== leader && name !== actor.name);
  const crossUserKey = Object.entries(users.MOCK_USERS).find(([, member]) => member.name === crossHandler && member.groups.includes(crossGroup.value))?.[0];
  assert.ok(crossUserKey, 'cross-group recipient must be an actual member of the selected group');
  check('ordinary current handler can transfer within the group but cannot cross groups', () => {
    const before = copy(store.recordOf(draftNo));
    assert.equal(store.canTransfer(draftNo), true);
    assert.equal(store.canCrossGroupTransfer(), false);
    assert.equal(store.transferCrossGroup(draftNo, crossGroup.value, crossHandler).ok, false);
    assert.deepEqual(copy(store.recordOf(draftNo)), before);
  });
  setActor('team-leader');
  check('cross-group privilege alone cannot transfer another handler record', () => {
    assert.equal(store.canCrossGroupTransfer(), true);
    assert.equal(store.canTransfer(draftNo), false);
    assert.equal(store.transferCrossGroup(draftNo, crossGroup.value, crossHandler).ok, false);
  });
  setActor('agent-l2');
  assert.equal(store.transfer(draftNo, leader).ok, true);
  setActor('team-leader');
  assert.equal(store.addReminder(draftNo, future, 'first').ok, true);
  const later = types.registrationNow(new Date(Date.now() + 7200000)).replace(' ', 'T');
  assert.equal(store.addReminder(draftNo, later, 'second').ok, true);
  check('privileged current handler can cross groups and transfer every pending reminder unchanged', () => {
    const before = copy(store.recordOf(draftNo));
    const result = store.transferCrossGroup(draftNo, crossGroup.value, crossHandler, 'handover');
    assert.equal(result.ok, true);
    assert.equal(result.record.groupName, crossGroup.value);
    assert.equal(result.record.handler, crossHandler);
    assert.equal(result.record.status, '处理中');
    assert.deepEqual(result.record.reminders.map(reminder => reminder.at), before.reminders.map(reminder => reminder.at));
    assert.ok(result.record.reminders.every(reminder => reminder.recipient === crossHandler));
    assert.equal(result.record.history[0].action, '跨组调剂');
    assert.equal(store.canEdit(draftNo), false);
  });
  setActor(crossUserKey);
  check('the selected real target-group member receives handling rights immediately', () => {
    assert.equal(store.canEdit(draftNo), true);
    assert.equal(store.canTransfer(draftNo), true);
    assert.equal(save(draftNo, { ...store.recordOf(draftNo).values, processResult: 'received' }).ok, true);
    assert.deepEqual(tickets, []);
  });
  setActor('agent-l2');
  check('a blank draft can close directly with exactly one formal creation event and one closure event', () => {
    const draft = store.create(types.emptyRegistrationValues(), { draft: true });
    assert.equal(draft.ok, true);
    assert.equal(draft.record.history.filter(event => event.action === '创建工单').length, 0);
    assert.equal(draft.record.history.filter(event => event.action === '结案').length, 0);
    const beforeCount = store.records.length;
    const result = save(draft.record.no, fullValues('13800000008'), { close: true });
    assert.equal(result.ok, true);
    assert.equal(result.record.no, draft.record.no);
    assert.equal(result.record.status, '已结案');
    assert.equal(store.records.length, beforeCount);
    assert.equal(result.record.history.filter(event => event.action === '创建工单').length, 1);
    assert.equal(result.record.history.filter(event => event.action === '结案').length, 1);
    const revised = save(result.record.no, { ...result.record.values, processResult: 'revised after direct closure' }, { revision: true });
    assert.equal(revised.ok, true);
    assert.equal(revised.record.history.filter(event => event.action === '创建工单').length, 1);
    assert.equal(revised.record.history.filter(event => event.action === '结案').length, 1);
  });
  setActor('agent-l2');
  const reminderCase = store.create(values('13800000009'));
  assert.equal(reminderCase.ok, true);
  const reminderNo = reminderCase.record.no;
  const reminderAt = types.registrationNow(new Date(Date.now() + 60_000));
  check('a pending reminder can still be cancelled', () => {
    const added = store.addReminder(reminderNo, reminderAt, 'pending cancellation');
    assert.equal(added.ok, true);
    const id = added.record.reminders.at(-1).id;
    assert.equal(store.cancelReminder(reminderNo, id).ok, true);
    assert.equal(store.recordOf(reminderNo).reminders?.some(item => item.id === id) ?? false, false);
  });
  assert.equal(store.addReminder(reminderNo, reminderAt, 'refresh and acknowledgement regression').ok, true);
  const reminderId = store.recordOf(reminderNo).reminders.at(-1).id;
  const NativeDate = Date;
  const elapsedAt = NativeDate.parse(reminderAt.replace(' ', 'T')) + 1000;
  global.Date = class extends NativeDate {
    constructor(...args) { super(...(args.length ? args : [elapsedAt])); }
    static now() { return elapsedAt; }
  };
  try {
    assert.equal(store.markReminderTriggered(reminderNo, reminderId).ok, true);
    check('an edit dialog opened before a deadline cannot cancel the reminder after it triggers', () => {
      const before = copy(store.recordOf(reminderNo));
      const persisted = localStorage.getItem(businessKey());
      const result = store.cancelReminder(reminderNo, reminderId);
      assert.equal(result.ok, false);
      assert.match(result.message, /已触发/);
      assert.deepEqual(copy(store.recordOf(reminderNo)), before);
      assert.equal(localStorage.getItem(businessKey()), persisted);
    });
    check('a triggered but unacknowledged reminder is recoverable from persisted data', () => {
      store.hydrate();
      assert.deepEqual(types.unacknowledgedRegistrationReminders(store.recordOf(reminderNo).reminders).map(item => item.id), [reminderId]);
      assert.ok(store.recordOf(reminderNo).reminders[0].triggeredAt);
    });
    check('another group member and an outside-group actor cannot consume the reminder', () => {
      const before = copy(store.recordOf(reminderNo));
      for (const role of ['team-leader', 'tech-support']) {
        setActor(role);
        assert.equal(store.acknowledgeReminder(reminderNo, reminderId).ok, false);
        assert.deepEqual(copy(store.recordOf(reminderNo)), before);
      }
      setActor('agent-l2');
    });
    check('a reminder that has not triggered cannot be consumed', () => {
      const added = store.addReminder(reminderNo, types.registrationNow(new Date(Date.now() + 60_000)), 'not due');
      assert.equal(added.ok, true);
      const id = added.record.reminders.at(-1).id;
      assert.equal(store.acknowledgeReminder(reminderNo, id).ok, false);
      assert.equal(store.recordOf(reminderNo).reminders.find(item => item.id === id).acknowledgedAt, undefined);
    });
    check('failed acknowledgement persistence leaves the reminder available to display', () => {
      const before = copy(store.recordOf(reminderNo));
      const write = localStorage.setItem;
      try {
        localStorage.setItem = () => { throw new Error('storage unavailable'); };
        assert.equal(store.acknowledgeReminder(reminderNo, reminderId).ok, false);
      } finally { localStorage.setItem = write; }
      assert.deepEqual(copy(store.recordOf(reminderNo)), before);
      assert.ok(types.unacknowledgedRegistrationReminders(store.recordOf(reminderNo).reminders).some(item => item.id === reminderId));
    });
    check('consumption is persisted, idempotent and does not restore the card after rehydration', () => {
      const before = copy(store.recordOf(reminderNo).reminders.find(item => item.id === reminderId));
      assert.equal(store.acknowledgeReminder(reminderNo, reminderId).ok, true);
      const consumed = store.recordOf(reminderNo).reminders.find(item => item.id === reminderId);
      assert.ok(consumed.acknowledgedAt);
      assert.equal(consumed.triggeredAt, before.triggeredAt);
      const revision = store.recordOf(reminderNo).revision;
      assert.equal(store.acknowledgeReminder(reminderNo, reminderId).ok, true);
      assert.equal(store.recordOf(reminderNo).revision, revision);
      store.hydrate();
      assert.ok(store.recordOf(reminderNo).reminders.find(item => item.id === reminderId).acknowledgedAt);
      assert.equal(types.unacknowledgedRegistrationReminders(store.recordOf(reminderNo).reminders).some(item => item.id === reminderId), false);
    });
    check('legacy triggered reminders without consumption state remain available', () => {
      const legacy = { id: 'legacy-triggered', at: reminderAt, note: '', recipient: actor.name, triggeredAt: types.registrationNow() };
      assert.deepEqual(types.unacknowledgedRegistrationReminders([legacy]).map(item => item.id), [legacy.id]);
    });
  } finally { global.Date = NativeDate; }
  console.log(`ALL ${count} SOURCE CHECKS PASSED`);
})().catch(error => { console.error(error); process.exitCode = 1; });
