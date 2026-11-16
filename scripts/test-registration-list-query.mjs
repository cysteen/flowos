import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import ts from 'typescript';

const root = fileURLToPath(new URL('../', import.meta.url));
const modules = new Map();
function load(file) {
  const absolute = resolve(file);
  if (modules.has(absolute)) return modules.get(absolute).exports;
  const source = readFileSync(absolute, 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  });
  const module = { exports: {} };
  modules.set(absolute, module);
  const localRequire = createRequire(absolute);
  new Function('require', 'module', 'exports', outputText)(name => {
    if (name.startsWith('@/') || name.startsWith('.')) {
      const base = name.startsWith('@/') ? resolve(root, 'src', name.slice(2)) : resolve(dirname(absolute), name);
      const target = [base, `${base}.ts`, join(base, 'index.ts')].find(candidate => existsSync(candidate) && statSync(candidate).isFile());
      if (target?.endsWith('.ts')) return load(target);
      if (target) return localRequire(target);
    }
    return localRequire(name);
  }, module, module.exports);
  return module.exports;
}
const queryModule = load(resolve(root, 'src/views/self-service/registrationListQuery.ts'));
const { emptyRegistrationListQuery, registrationListRangeError, registrationListWindow, resolveRegistrationListTimeRange } = queryModule;
const now = new Date('2026-11-16T12:00:00');
const matchesRegistrationListQuery = (record, query) => queryModule.matchesRegistrationListQuery(record, query, now);
const filterRegistrationRecords = (records, query) => queryModule.filterRegistrationRecords(records, query, now);
const base = {
  no: 'IFLYZX-20261112-80012', status: '处理中', handler: '王组长', groupName: '无线音乐处理组', builder: '张三',
  createdAt: '2026-11-13 00:00:00', updatedAt: '2026-11-13 20:00:00',
  values: { businessPhone: '13800000001', contactPhone: '13900000001', refundPhone: '13700000001',
    upstreamNo: 'MG-EXAMPLE-001', productName: '个性化彩铃', feedback: '微信反馈', specificSource: '江苏移动微信投诉群',
    accessTime: '2026-11-12T23:59:59', replyTime: '2026-11-13 10:15:30.123', description: '订购核实', processResult: '待回单',
    operator: '移动', province: '江苏省', businessLine: '数字娱乐业务部', productCategory: '个彩音频',
    problemL1: '不知情订购', problemL2: '退订+退费', complaintType: '普通投诉', closedLoop: '已闭环',
    channelDetail: '江苏移动客服反馈群' },
};
const query = (patch = {}) => ({ ...emptyRegistrationListQuery(), ...patch });

test('independent list needs no normal-ticket collection or catalog dependency', () => {
  assert.equal(matchesRegistrationListQuery(base, query()), true);
  assert.equal(filterRegistrationRecords([base], query()).length, 1);
});
test('business, contact and upstream numbers search the same independent record', () => {
  for (const keyword of ['13800000001', '13900000001', 'mg-example-001', base.no]) {
    assert.equal(matchesRegistrationListQuery(base, query({ keyword })), true);
  }
  assert.equal(matchesRegistrationListQuery(base, query({ keyword: 'unrelated' })), false);
});
test('status, handler, feedback, dependent source and product filters combine', () => {
  const selected = { status: '处理中', handler: '王组长', feedback: '微信反馈', specificSource: '江苏移动微信投诉群', productName: '个性化彩铃' };
  assert.equal(matchesRegistrationListQuery(base, query(selected)), true);
  for (const key of Object.keys(selected)) assert.equal(matchesRegistrationListQuery(base, query({ ...selected, [key]: 'different' })), false);
});
test('calendar date bounds include midnight and the final millisecond of the selected day', () => {
  const q = query({ dateFrom: '2026-11-13', dateTo: '2026-11-13' });
  assert.equal(matchesRegistrationListQuery(base, q), true);
  assert.equal(matchesRegistrationListQuery({ ...base, createdAt: '2026-11-13T23:59:59.999' }, q), true);
  assert.equal(matchesRegistrationListQuery({ ...base, createdAt: '2026-11-14T00:00:00' }, q), false);
});
test('creation time is fixed; a legacy alternate-field value cannot change the query meaning', () => {
  const q = query({ dateFrom: '2026-11-13', dateTo: '2026-11-13' });
  assert.equal(matchesRegistrationListQuery(base, q), true);
  assert.equal(matchesRegistrationListQuery(base, { ...q, timeField: 'accessTime' }), true);
  assert.equal(matchesRegistrationListQuery({ ...base, createdAt: '2026-10-01 12:00:00' }, q), false);
});
test('last-update time cannot make a record outside the selected creation dates appear', () => {
  const q = query({ timeField: 'updatedAt', dateFrom: '2026-11-13', dateTo: '2026-11-13' });
  assert.equal(matchesRegistrationListQuery(base, q), true);
  assert.equal(matchesRegistrationListQuery({ ...base, updatedAt: '2026-11-12 23:59:59' }, q), true);
  assert.equal(matchesRegistrationListQuery({ ...base, createdAt: '2026-10-01 12:00:00' }, q), false);
});
test('empty business dates remain searchable; missing creation time and invalid constraints never match', () => {
  const incomplete = { ...base, values: { ...base.values, accessTime: '' } };
  assert.equal(matchesRegistrationListQuery(incomplete, query({ timeField: 'accessTime' })), true);
  assert.equal(matchesRegistrationListQuery(incomplete, query({ dateFrom: '2026-11-13' })), true);
  assert.equal(matchesRegistrationListQuery({ ...base, createdAt: '' }, query()), false);
  assert.equal(matchesRegistrationListQuery(base, query({ dateFrom: 'invalid' })), false);
  assert.equal(matchesRegistrationListQuery(base, query({ dateFrom: '2026-11-14', dateTo: '2026-11-12' })), false);
});

test('dedicated ticket, business and contact numbers match independently with trimmed partial values', () => {
  assert.equal(matchesRegistrationListQuery(base, query({ ticketNo: '  iflyzx-20261112  ', businessPhone: ' 1380000 ', contactPhone: ' 1390000 ' })), true);
  assert.equal(matchesRegistrationListQuery(base, query({ businessPhone: '13900000001' })), false);
  assert.equal(matchesRegistrationListQuery(base, query({ contactPhone: '13800000001' })), false);
  assert.equal(matchesRegistrationListQuery(base, query({ ticketNo: 'MG-EXAMPLE-001' })), false);
});

test('handler and processing group are exact selections rather than partial-name searches', () => {
  assert.equal(matchesRegistrationListQuery(base, query({ handler: '王组长', groupName: '无线音乐处理组' })), true);
  assert.equal(matchesRegistrationListQuery(base, query({ handler: '王' })), false);
  assert.equal(matchesRegistrationListQuery(base, query({ groupName: '无线音乐' })), false);
});

test('business enum selections and channel-detail text combine without sharing normal-ticket dictionaries', () => {
  const selected = { operator: '移动', province: '江苏省', businessLine: '数字娱乐业务部', productCategory: '个彩音频',
    complaintType: '普通投诉', closedLoop: '已闭环', channelDetail: ' 移动客服反馈 ' };
  assert.equal(matchesRegistrationListQuery(base, query(selected)), true);
  for (const key of ['operator', 'province', 'businessLine', 'productCategory', 'complaintType', 'closedLoop']) {
    assert.equal(matchesRegistrationListQuery(base, query({ ...selected, [key]: 'different' })), false);
  }
  assert.equal(matchesRegistrationListQuery(base, query({ ...selected, province: '江苏' })), false);
  assert.equal(matchesRegistrationListQuery(base, query({ ...selected, channelDetail: '联通反馈' })), false);
});

test('two-level problem classification respects both selected levels', () => {
  const selected = query({ problemL1: '不知情订购', problemL2: '退订+退费' });
  assert.equal(matchesRegistrationListQuery(base, selected), true);
  assert.equal(matchesRegistrationListQuery({ ...base, values: { ...base.values, problemL1: '业务咨询' } }, selected), false);
  assert.equal(matchesRegistrationListQuery({ ...base, values: { ...base.values, problemL2: '无法开通' } }, selected), false);
});

test('the global keyword still matches business fields and is independent of dedicated number filters', () => {
  for (const keyword of ['江苏省', '退订+退费', '客服反馈群', '王组长', '张三']) assert.equal(matchesRegistrationListQuery(base, query({ keyword })), true);
  assert.equal(matchesRegistrationListQuery(base, query({ keyword: '13900000001', businessPhone: '13800000001' })), true);
  assert.equal(matchesRegistrationListQuery(base, query({ keyword: '13900000001', businessPhone: '13900000001' })), false);
});

test('missing reply time does not hide a record whose creation time matches', () => {
  const q = query({ timeField: 'replyTime', dateFrom: '2026-11-13', dateTo: '2026-11-13' });
  assert.equal(matchesRegistrationListQuery(base, q), true);
  const notReplied = { ...base, values: { ...base.values, replyTime: '' } };
  assert.equal(matchesRegistrationListQuery(notReplied, q), true);
  assert.equal(matchesRegistrationListQuery(notReplied, query({ timeField: 'replyTime' })), true);
  assert.equal(matchesRegistrationListQuery({ ...base, values: { ...base.values, replyTime: undefined } }, q), true);
});

test('explicit second-level and datetime-local creation ranges do not expand into a whole day', () => {
  const q = query({ dateFrom: '2026-11-13 10:15:30', dateTo: '2026-11-13T10:15:30' });
  assert.equal(matchesRegistrationListQuery({ ...base, createdAt: '2026-11-13 10:15:30.123' }, q), true);
  for (const createdAt of ['2026-11-13 10:15:29.999', '2026-11-13 10:15:31', '2026-11-13 11:15:30']) {
    assert.equal(matchesRegistrationListQuery({ ...base, createdAt }, q), false);
  }
});

test('minute and fractional-second endpoint precision remains inclusive only within that precision', () => {
  const minute = query({ dateFrom: '2026-11-13T10:15', dateTo: '2026-11-13T10:15' });
  assert.equal(matchesRegistrationListQuery({ ...base, createdAt: '2026-11-13 10:15:30.123' }, minute), true);
  assert.equal(matchesRegistrationListQuery({ ...base, createdAt: '2026-11-13T10:16:00' }, minute), false);
  const fractional = query({ dateFrom: '2026-11-13 10:15:30.1', dateTo: '2026-11-13 10:15:30.1' });
  assert.equal(matchesRegistrationListQuery({ ...base, createdAt: '2026-11-13 10:15:30.123' }, fractional), true);
  assert.equal(matchesRegistrationListQuery({ ...base, createdAt: '2026-11-13T10:15:30.200' }, fractional), false);
});

test('invalid calendar dates, out-of-range clocks and reversed explicit times never match', () => {
  for (const dateFrom of ['2026-02-30', '2026-13-01', '2026-11-13 24:00:00', '2026-11-13T10:60:00', '2026-11-13T10:15:60']) {
    assert.equal(matchesRegistrationListQuery(base, query({ dateFrom })), false);
  }
  assert.equal(matchesRegistrationListQuery(base, query({ timeField: 'replyTime', dateFrom: '2026-11-13T10:16:00', dateTo: '2026-11-13 10:15:59' })), false);
});

for (const timeField of ['createdAt']) {
  test(`${timeField} alone controls an exact timestamp interval with other record times outside it`, () => {
    const at = '2026-11-13 12:34:56';
    const outside = '2026-11-12 12:34:56';
    const record = { ...base, createdAt: outside, updatedAt: outside, values: { ...base.values, accessTime: outside, replyTime: outside } };
    const withTime = time => timeField in record.values
      ? { ...record, values: { ...record.values, [timeField]: time } }
      : { ...record, [timeField]: time };
    const selected = query({ timeField, dateFrom: at, dateTo: at });
    assert.equal(matchesRegistrationListQuery(withTime(at), selected), true);
    assert.equal(matchesRegistrationListQuery(withTime('2026-11-13 12:34:55.999'), selected), false);
    assert.equal(matchesRegistrationListQuery(withTime('2026-11-13 12:34:57'), selected), false);
    assert.equal(matchesRegistrationListQuery(withTime(''), selected), false);
    assert.equal(matchesRegistrationListQuery(withTime(''), query({ timeField })), false);
  });
}

test('blank or widened dates cannot bypass the three-calendar-month creation window', () => {
  for (const q of [query(), query({ dateFrom: '2020-01-01', dateTo: '2030-01-01' })]) {
    assert.equal(matchesRegistrationListQuery({ ...base, createdAt: '2026-08-16 00:00:00' }, q), true);
    assert.equal(matchesRegistrationListQuery({ ...base, createdAt: '2026-08-15 23:59:59.999' }, q), false);
    assert.equal(matchesRegistrationListQuery({ ...base, createdAt: '2026-11-16 12:00:00' }, q), true);
    assert.equal(matchesRegistrationListQuery({ ...base, createdAt: '2026-11-16 12:00:00.001' }, q), false);
  }
});

test('calendar-month cutoff clamps month ends and differs from a fixed 90 days', () => {
  const window = registrationListWindow(new Date('2026-05-31T12:34:56'));
  assert.equal(window.from.getMonth(), 1);
  assert.equal(window.from.getDate(), 28);
  assert.equal(window.from.getHours(), 0);
  const leap = registrationListWindow(new Date('2024-05-31T12:34:56'));
  assert.equal(leap.from.getDate(), 29);
});

test('all four quick ranges share real current time rather than the old prototype anchor', () => {
  assert.deepEqual(resolveRegistrationListTimeRange('3m', now), { from: '2026-08-16 00:00:00', to: '2026-11-16 12:00:00' });
  assert.deepEqual(resolveRegistrationListTimeRange('today', now), { from: '2026-11-16 00:00:00', to: '2026-11-16 12:00:00' });
  assert.deepEqual(resolveRegistrationListTimeRange('week', new Date('2026-11-18T12:00:00')), { from: '2026-11-16 00:00:00', to: '2026-11-18 12:00:00' });
  assert.deepEqual(resolveRegistrationListTimeRange('month', now), { from: '2026-11-01 00:00:00', to: '2026-11-16 12:00:00' });
});

test('custom ranges reject missing, invalid, reversed, old and future endpoints', () => {
  assert.equal(registrationListRangeError('2026-08-16 00:00:00', '2026-11-16 12:00:00', now), undefined);
  for (const [from, to] of [
    ['', '2026-11-13'], ['2026-11-13', ''], ['bad', '2026-11-13'],
    ['2026-11-14', '2026-11-13'], ['2026-08-15 23:59:59', '2026-11-13'],
    ['2026-11-13', '2026-11-16 12:00:01'],
  ]) assert.equal(typeof registrationListRangeError(from, to, now), 'string');
});

test('today, week and month narrow the same population without deleting historical stored rows', () => {
  const records = [base, { ...base, no: 'old', createdAt: '2026-07-01 00:00:00' }, { ...base, no: 'today', createdAt: '2026-11-16 10:00:00' }];
  const original = JSON.stringify(records);
  const today = resolveRegistrationListTimeRange('today', now);
  assert.deepEqual(filterRegistrationRecords(records, query({ dateFrom: today.from })).map(r => r.no), ['today']);
  assert.equal(filterRegistrationRecords(records, query()).length, 2);
  assert.equal(JSON.stringify(records), original);
});
