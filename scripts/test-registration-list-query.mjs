import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const path = '../src/views/self-service/registrationListQuery.ts';
const source = readFileSync(new URL(path, import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
});
const exports = {};
runInNewContext(outputText, { exports, require(name) { throw new Error(`Unexpected runtime dependency ${name}`); } }, { filename: path });
const { emptyRegistrationListQuery, matchesRegistrationListQuery, filterRegistrationRecords } = exports;
const base = {
  no: 'IFLYZX-20261112-80012', status: '处理中', handler: '王组长', groupName: '无线音乐处理组', builder: '张三',
  createdAt: '2026-11-13 00:00:00', updatedAt: '2026-11-13 20:00:00',
  values: { businessPhone: '13800000001', contactPhone: '13900000001', refundPhone: '13700000001',
    upstreamNo: 'MG-EXAMPLE-001', productName: '个性化彩铃', feedback: '微信反馈', specificSource: '群A',
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
  const selected = { status: '处理中', handler: '王组长', feedback: '微信反馈', specificSource: '群A', productName: '个性化彩铃' };
  assert.equal(matchesRegistrationListQuery(base, query(selected)), true);
  for (const key of Object.keys(selected)) assert.equal(matchesRegistrationListQuery(base, query({ ...selected, [key]: 'different' })), false);
});
test('calendar date bounds include midnight and the final millisecond of the selected day', () => {
  const q = query({ dateFrom: '2026-11-13', dateTo: '2026-11-13' });
  assert.equal(matchesRegistrationListQuery(base, q), true);
  assert.equal(matchesRegistrationListQuery({ ...base, createdAt: '2026-11-13T23:59:59.999' }, q), true);
  assert.equal(matchesRegistrationListQuery({ ...base, createdAt: '2026-11-14T00:00:00' }, q), false);
});
test('creation versus access time uses explicit fields, never the ordinary prototype clock or last update', () => {
  const q = query({ dateFrom: '2026-11-13', dateTo: '2026-11-13' });
  assert.equal(matchesRegistrationListQuery(base, q), true);
  assert.equal(matchesRegistrationListQuery(base, { ...q, timeField: 'accessTime' }), false);
  assert.equal(matchesRegistrationListQuery({ ...base, createdAt: '2026-10-01 12:00:00' }, q), false);
});
test('empty dates keep incomplete records searchable; invalid or inverted date constraints do not match', () => {
  const incomplete = { ...base, values: { ...base.values, accessTime: '' } };
  assert.equal(matchesRegistrationListQuery(incomplete, query({ timeField: 'accessTime' })), true);
  assert.equal(matchesRegistrationListQuery(incomplete, query({ timeField: 'accessTime', dateFrom: '2026-11-13' })), false);
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

test('reply-time queries include only records with an actual reply time when a range is applied', () => {
  const q = query({ timeField: 'replyTime', dateFrom: '2026-11-13', dateTo: '2026-11-13' });
  assert.equal(matchesRegistrationListQuery(base, q), true);
  const notReplied = { ...base, values: { ...base.values, replyTime: '' } };
  assert.equal(matchesRegistrationListQuery(notReplied, q), false);
  assert.equal(matchesRegistrationListQuery(notReplied, query({ timeField: 'replyTime' })), true);
  assert.equal(matchesRegistrationListQuery({ ...base, values: { ...base.values, replyTime: undefined } }, q), false);
});

test('explicit second-level and datetime-local ranges do not expand into a whole day', () => {
  const q = query({ timeField: 'replyTime', dateFrom: '2026-11-13 10:15:30', dateTo: '2026-11-13T10:15:30' });
  assert.equal(matchesRegistrationListQuery(base, q), true);
  for (const replyTime of ['2026-11-13 10:15:29.999', '2026-11-13 10:15:31', '2026-11-13 11:15:30']) {
    assert.equal(matchesRegistrationListQuery({ ...base, values: { ...base.values, replyTime } }, q), false);
  }
});

test('minute and fractional-second endpoint precision remains inclusive only within that precision', () => {
  const minute = query({ timeField: 'replyTime', dateFrom: '2026-11-13T10:15', dateTo: '2026-11-13T10:15' });
  assert.equal(matchesRegistrationListQuery(base, minute), true);
  assert.equal(matchesRegistrationListQuery({ ...base, values: { ...base.values, replyTime: '2026-11-13T10:16:00' } }, minute), false);
  const fractional = query({ timeField: 'replyTime', dateFrom: '2026-11-13 10:15:30.1', dateTo: '2026-11-13 10:15:30.1' });
  assert.equal(matchesRegistrationListQuery(base, fractional), true);
  assert.equal(matchesRegistrationListQuery({ ...base, values: { ...base.values, replyTime: '2026-11-13T10:15:30.200' } }, fractional), false);
});

test('invalid calendar dates, out-of-range clocks and reversed explicit times never match', () => {
  for (const dateFrom of ['2026-02-30', '2026-13-01', '2026-11-13 24:00:00', '2026-11-13T10:60:00', '2026-11-13T10:15:60']) {
    assert.equal(matchesRegistrationListQuery(base, query({ dateFrom })), false);
  }
  assert.equal(matchesRegistrationListQuery(base, query({ timeField: 'replyTime', dateFrom: '2026-11-13T10:16:00', dateTo: '2026-11-13 10:15:59' })), false);
});
