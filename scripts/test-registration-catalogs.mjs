import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import ts from 'typescript';
const runtimeRequire = createRequire(import.meta.url);
const { createPinia, setActivePinia } = runtimeRequire('pinia');
const { reactive, toRaw } = runtimeRequire('vue');

const root = fileURLToPath(new URL('../', import.meta.url));
const memory = new Map();
globalThis.localStorage = { getItem: key => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value), removeItem: key => memory.delete(key) };
globalThis.sessionStorage = globalThis.localStorage;
const modules = new Map();
const identity = reactive({ name: '张三', roleKey: 'ops-admin', role: undefined, groups: ['无线音乐处理组'], canAccess: () => true });
const tenant = reactive({ currentTenantId: 'catalog-regression' });
function load(file) {
  const absolute = resolve(file);
  if (modules.has(absolute)) return modules.get(absolute).exports;
  const { outputText } = ts.transpileModule(readFileSync(absolute, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } });
  const module = { exports: {} };
  modules.set(absolute, module);
  const localRequire = createRequire(absolute);
  new Function('require', 'module', 'exports', outputText)(name => {
    if (name === '@/stores/user') return { useUserStore: () => identity };
    if (name === '@/stores/tenant') return { useTenantStore: () => tenant };
    if (name === '@/stores/cti') return { buildCallContactSummary: () => '' };
    // Transfer and CTI behavior are outside the catalog/snapshot scenarios.
    if (name === '@/views/tickets/composables/opActions') return { CROSS_GROUP_TRANSFER_ROLES: ['ops-admin'], REGISTRATION_REOPEN_ROLES: ['ops-admin'], PROCESSING_GROUPS: [] };
    if (name.startsWith('@/') || name.startsWith('.')) {
      const base = name.startsWith('@/') ? resolve(root, 'src', name.slice(2)) : resolve(dirname(absolute), name);
      const target = [base, `${base}.ts`, join(base, 'index.ts')].find(candidate => existsSync(candidate) && statSync(candidate).isFile());
      if (target?.endsWith('.ts')) return load(target);
    }
    return localRequire(name);
  }, module, module.exports);
  return module.exports;
}
identity.role = load(resolve(root, 'src/config/roles.ts')).ROLES['ops-admin'];
const types = load(resolve(root, 'src/views/tickets/types/businessRegistration.ts'));
const { useFormCatalogsStore } = load(resolve(root, 'src/stores/formCatalogs.ts'));
const editor = load(resolve(root, 'src/views/tickets/components/business/registrationEditorConfig.ts'));
const { useBusinessRegistrationStore } = load(resolve(root, 'src/stores/businessRegistration.ts'));
const { registrationTimelinessDeadlineMs } = load(resolve(root, 'src/views/self-service/registrationListTimeliness.ts'));
const seed = types.REGISTRATION_TEMPLATES[0];
function setup() { memory.clear(); setActivePinia(createPinia()); return useFormCatalogsStore(); }
function values(patch = {}) { return { ...types.emptyRegistrationValues(), businessPhone: '13912345678', ...patch }; }
function options(template, key, current) {
  const field = template.fields.find(item => item.key === key);
  return editor.registrationFieldOptions(field, template, current).filter(item => !item.disabled).map(item => item.value);
}

test('reviewed demo paths expose eight products; all 45 catalog rows remain maintainable', () => {
  const catalog = setup();
  assert.equal(catalog.productRows(seed).length, 45);
  const template = catalog.resolve(seed);
  assert.equal(template.products.length, 8);
  assert.equal(template.productCategoryOptions['数字娱乐业务部'].length, 4);
  assert.deepEqual(options(template, 'productCategory', values({ businessLine: '5G新通话业务部' })), []);
  assert.ok(options(template, 'productName', values({ businessLine: '数字娱乐业务部', productCategory: '个彩音频' })).includes('个性化彩铃'));
  assert.ok(!options(template, 'productName', values({ businessLine: '数字娱乐业务部', productCategory: '个彩音频' })).includes('安徽彩铃升级版'));
  assert.equal(editor.registrationFieldDisabled('productName', values()), true);
});
test('product paths reject missing parents and cross-line combinations, including filled drafts', () => {
  const catalog = setup();
  assert.equal(catalog.saveOption(seed, { field: 'productCategory', value: '新产品线', enabled: true }).ok, false);
  assert.equal(catalog.saveProduct(seed, { name: '新产品', category: '新产品线', businessLine: '数字娱乐业务部', enabled: true }).ok, false);
  assert.equal(catalog.saveOption(seed, { field: 'productCategory', value: '新产品线', parentValue: '5G新通话业务部', enabled: true }).ok, true);
  assert.equal(catalog.saveProduct(seed, { name: '新产品', category: '新产品线', businessLine: '5G新通话业务部', enabled: true }).ok, true);
  assert.ok(types.validateRegistrationValues(values({ businessLine: '数字娱乐业务部', productCategory: '新产品线', productName: '新产品' }), 'draft').productCategory);
  assert.deepEqual(types.validateRegistrationValues(values({ businessLine: '5G新通话业务部', productCategory: '新产品线', productName: '新产品' }), 'draft'), {});
});
test('historical unmapped products and disabled sources remain visible and save unchanged', () => {
  const catalog = setup();
  const previous = values({ businessLine: '数字娱乐业务部', productCategory: '个彩音频', productName: '安徽彩铃升级版', feedback: 'QQ反馈', specificSource: '科大QQ-（2482417583）' });
  for (const row of catalog.optionRows(seed, 'specificSource').filter(row => row.parentValue === 'QQ反馈')) assert.equal(catalog.setOptionEnabled(seed, row.id, false).ok, true);
  const template = catalog.resolve(seed);
  assert.equal(editor.registrationFieldVisible({ key: 'specificSource' }, template, previous), true);
  assert.deepEqual(types.validateRegistrationValues(previous, 'create', seed.id, previous), {});
  assert.ok(types.validateRegistrationValues(previous, 'create').productName);
});
test('compatibility initialization preserves custom mapping and disabled rows', () => {
  const catalog = setup();
  const stored = structuredClone(toRaw(catalog.catalogOf(seed)));
  stored.products.find(product => product.name === '个性化彩铃').businessLine = '5G新通话业务部';
  stored.products.find(product => product.name === '乐响铃声').enabled = false;
  catalog.catalogs[seed.id] = stored;
  assert.equal(catalog.productRows(seed).find(product => product.name === '个性化彩铃').businessLine, '5G新通话业务部');
  assert.equal(catalog.productRows(seed).find(product => product.name === '乐响铃声').enabled, false);
});
test('legacy flat product lines retain every explicitly configured business path', () => {
  const catalog = setup();
  const stored = structuredClone(toRaw(catalog.catalogOf(seed)));
  stored.options.filter(row => row.field === 'productCategory').forEach(row => { delete row.parentValue; });
  stored.products.forEach(product => { delete product.businessLine; });
  stored.products.find(product => product.name === '个性化彩铃').businessLine = '5G新通话业务部';
  stored.products.find(product => product.name === '乐响铃声').businessLine = '数字娱乐业务部';
  catalog.catalogs[seed.id] = stored;
  const template = catalog.resolve(seed);
  assert.ok(template.productCategoryOptions['5G新通话业务部'].includes('个彩音频'));
  assert.ok(template.productCategoryOptions['数字娱乐业务部'].includes('个彩音频'));
  assert.ok(template.products.some(product => product.name === '个性化彩铃' && product.businessLine === '5G新通话业务部'));
  assert.ok(template.products.some(product => product.name === '乐响铃声' && product.businessLine === '数字娱乐业务部'));
  stored.options.find(row => row.field === 'productCategory' && row.value === '个彩音频').enabled = false;
  catalog.catalogs[seed.id] = stored;
  assert.ok(!catalog.resolve(seed).products.some(product => product.category === '个彩音频'));
});
test('configured duration affects new promises, snapshots survive edits, and legacy promises keep old duration', () => {
  const catalog = setup();
  assert.equal(catalog.saveOption(seed, { field: 'timeLimit', value: 'four-hours', label: '4小时', minutes: 240, enabled: true }).ok, true);
  assert.equal(catalog.saveOption(seed, { field: 'timeLimit', value: 'bad', label: '无时长', enabled: true }).ok, false);
  assert.equal(catalog.saveOption(seed, { field: 'timeLimit', value: 'bad', label: '小数时长', minutes: 1.5, enabled: true }).ok, false);
  const records = useBusinessRegistrationStore();
  const created = records.create(values({ timeLimit: 'four-hours', accessTime: '2026-11-16 12:00:00' }));
  assert.equal(created.ok, true, created.message);
  let record = created.record;
  assert.equal(record.timeLimitMinutes, 240);
  assert.equal(record.timeLimitLabel, '4小时');
  assert.equal(registrationTimelinessDeadlineMs(record), new Date('2026-11-16T16:00:00').getTime());
  const row = catalog.optionRows(seed, 'timeLimit').find(item => item.value === 'four-hours');
  assert.equal(catalog.saveOption(seed, { ...row, label: '6小时', minutes: 360 }).ok, false);
  assert.equal(catalog.saveOption(seed, { ...row, value: 'six-hours', minutes: 360 }).ok, false);
  assert.equal(catalog.saveOption(seed, { ...row, minutes: 360 }).ok, true);
  let saved = records.save(record.no, record.values, { expectedRevision: record.revision });
  assert.equal(saved.ok, true, saved.message);
  assert.equal(saved.record.timeLimitMinutes, 240);
  assert.equal(saved.record.timeLimitLabel, '4小时');
  record = saved.record;
  saved = records.save(record.no, { ...record.values, timeLimit: '1小时' }, { expectedRevision: record.revision });
  assert.equal(saved.record.timeLimitMinutes, 60);
  record = saved.record;
  saved = records.save(record.no, { ...record.values, timeLimit: 'four-hours' }, { expectedRevision: record.revision });
  assert.equal(saved.record.timeLimitMinutes, 360);
  const legacy = { ...record, timeLimitMinutes: undefined, values: { ...record.values, timeLimit: '1小时', accessTime: '2026-11-16 12:00:00' } };
  const hour = catalog.optionRows(seed, 'timeLimit').find(item => item.value === '1小时');
  assert.equal(catalog.saveOption(seed, { ...hour, minutes: 90 }).ok, true);
  assert.equal(registrationTimelinessDeadlineMs(legacy), new Date('2026-11-16T13:00:00').getTime());
});
test('list/export display resolves configured labels without changing stored keys or historical fallbacks', () => {
  const catalog = setup();
  assert.equal(catalog.saveOption(seed, { field: 'feedback', value: 'DEMO_PLATFORM', label: '演示反馈平台', enabled: true }).ok, true);
  assert.equal(catalog.saveOption(seed, { field: 'specificSource', value: 'DEMO_SOURCE', label: '演示来源', parentValue: 'DEMO_PLATFORM', enabled: true }).ok, true);
  assert.equal(catalog.saveOption(seed, { field: 'productCategory', value: 'DEMO_LINE', label: '演示产品线', parentValue: '数字娱乐业务部', enabled: true }).ok, true);
  const record = { templateId: seed.id, values: values({ feedback: 'DEMO_PLATFORM', specificSource: 'DEMO_SOURCE', productCategory: 'DEMO_LINE', businessLine: '数字娱乐业务部', timeLimit: 'DEMO_4H', description: '记录原文' }), timeLimitLabel: '4小时', timeLimitMinutes: 240 };
  assert.equal(types.registrationDisplayValue(record, 'feedback'), '演示反馈平台');
  assert.equal(types.registrationDisplayValue(record, 'specificSource'), '演示来源');
  assert.equal(types.registrationDisplayValue(record, 'productCategory'), '演示产品线');
  assert.equal(types.registrationDisplayValue(record, 'timeLimit'), '4小时');
  assert.equal(types.registrationDisplayValue(record, 'description'), '记录原文');
  const row = catalog.optionRows(seed, 'feedback').find(item => item.value === 'DEMO_PLATFORM');
  catalog.setOptionEnabled(seed, row.id, false);
  assert.equal(types.registrationDisplayValue(record, 'feedback'), '演示反馈平台');
  record.values.feedback = '未知历史平台';
  assert.equal(types.registrationDisplayValue(record, 'feedback'), '未知历史平台');
  assert.equal(record.values.specificSource, 'DEMO_SOURCE');
});
