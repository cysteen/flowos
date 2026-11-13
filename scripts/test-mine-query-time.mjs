import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

// Execute the production query module with a fixed wall clock. Only unrelated
// catalog/search/status dependencies are isolated; date parsing and matching run unchanged.
const now = new Date('2026-11-13T12:00:00');
class TestDate extends Date {
  constructor(...args) { super(...(args.length ? args : [now.getTime()])); }
  static now() { return now.getTime(); }
}
function loadSource(path, dependencies = {}) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  });
  const exports = {};
  runInNewContext(outputText, {
    exports,
    Date: TestDate,
    require(name) {
      assert.ok(name in dependencies, `Unexpected dependency: ${name}`);
      return dependencies[name];
    },
  }, { filename: path });
  return exports;
}
const prototypeDate = loadSource('../src/config/prototypeDate.ts');
const { DEFAULT_DONE_QUERY, EMPTY_MINE_QUERY, matchMineQuery, resolveMineTimeRange } = loadSource('../src/views/tickets/types/mineQuery.ts', {
  '@/config/prototypeDate': prototypeDate,
  '@/mock/tickets': { TICKETS: [] },
  '@/views/query/queryCenterSearch': { matchesSearchText: () => false },
  '@/views/tickets/types/ticket': { matchSlaFilters: () => true },
  '@/views/tickets/types/flash': {},
  '@/views/tickets/types/xiaozhi': {},
  '@/views/tickets/types/refund': {},
});
const ticket = { no: 'date-regression', title: '', customer: '', createdAt: '2026-11-13 09:00:00', updatedAt: '2026-11-13 10:00:00' };
const registration = (createdAt, accessTime = createdAt) => ({ createdAt, values: { accessTime } });
const stamp = (value) => new Date(value).getTime();

test('newly closed registration remains in the default last-30-days view', () => {
  assert.equal(matchMineQuery(ticket, DEFAULT_DONE_QUERY(), registration('2026-11-13 09:00:00')), true);
});

test('registration created 31 days ago is excluded even when updated today', () => {
  assert.equal(matchMineQuery(ticket, DEFAULT_DONE_QUERY(), registration('2026-10-13 09:00:00')), false);
});

test('registration access-time selection uses the real current-day window', () => {
  const query = { ...DEFAULT_DONE_QUERY(), registrationTimeField: 'accessTime' };
  assert.equal(matchMineQuery(ticket, query, registration('2026-10-01 09:00:00', '2026-11-13 08:00:00')), true);
  assert.equal(matchMineQuery(ticket, query, registration('2026-11-13 09:00:00', '2026-10-13 08:00:00')), false);
});

test('ordinary sample tickets retain the fixed prototype window', () => {
  const query = DEFAULT_DONE_QUERY();
  const range = resolveMineTimeRange(query);
  assert.equal(range.from, stamp('2026-07-20T00:00:00'));
  assert.equal(range.to, stamp('2026-08-18T23:59:59.999'));
  assert.equal(matchMineQuery({ ...ticket, updatedAt: '2026-08-18 10:00:00' }, query), true);
  assert.equal(matchMineQuery(ticket, query), false);
});

test('explicit custom dates stay unchanged under either reference day', () => {
  const query = { ...EMPTY_MINE_QUERY(), timePreset: 'custom', dateFrom: '2026-08-01', dateTo: '2026-08-10' };
  for (const referenceDay of [undefined, now]) {
    const range = resolveMineTimeRange(query, referenceDay);
    assert.equal(range.from, stamp('2026-08-01T00:00:00'));
    assert.equal(range.to, stamp('2026-08-10T23:59:59.999'));
  }
});

test('relative ranges include whole days and do not mutate the supplied reference', () => {
  const referenceDay = new Date(now);
  const range = resolveMineTimeRange(DEFAULT_DONE_QUERY(), referenceDay);
  assert.equal(range.from, stamp('2026-10-15T00:00:00'));
  assert.equal(range.to, stamp('2026-11-13T23:59:59.999'));
  assert.equal(referenceDay.getTime(), now.getTime());
});
