import assert from 'node:assert/strict';
import {
  OUTBOUND_INTEROP_STORAGE_KEY,
  createOutboundInteropEngine,
  scopeRecordsForRecordingAccess,
  type EnsureOutboundInteropInput,
  type StorageLike,
} from '../src/stores/outboundInterop.ts';

function input(id: string): EnsureOutboundInteropInput {
  return {
    ticketNo: 'IFLYTS-20260610-00002',
    contactRecordId: id,
    occurredAt: '2026-11-22 10:00:00',
    originEntry: 'regression',
    connected: true,
    hasRecording: true,
  };
}

function memoryStorage(): StorageLike & { writes: string[] } {
  const data = new Map<string, string>();
  const writes: string[] = [];
  return {
    writes,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => { data.set(key, value); writes.push(value); },
    removeItem: (key) => { data.delete(key); },
  };
}

function verifyPermissionMasking() {
  const source = [
    { id: 'with', kind: 'call', recording: { id: 'secret' }, asr: [{ text: 'secret' }] },
    { id: 'without', kind: 'call' },
  ];
  const masked = scopeRecordsForRecordingAccess(source, false);
  assert.equal(masked.length, 2);
  for (const row of masked) {
    assert.equal(row.recordingAccess, 'masked');
    assert.equal('recording' in row, false);
    assert.equal('asr' in row, false);
  }
  assert.equal('recording' in source[0], true, 'source data must not be mutated');

  const engine = createOutboundInteropEngine(memoryStorage());
  const withResource = engine.ensure(input('with'), false);
  const withoutResource = engine.ensure({ ...input('without'), hasRecording: false }, false);
  assert.deepEqual(withResource.recording, withoutResource.recording);
  assert.equal(withResource.recording.masked, true);
}

function verifyThreeReconciliationResults() {
  const engine = createOutboundInteropEngine(memoryStorage(), () => '2026-11-22 10:01:00');
  const cases = [
    ['target-exists', 'synced'],
    ['target-missing', 'sync-failed'],
    ['unresolved', 'unknown'],
  ] as const;
  for (const [result, expected] of cases) {
    const seed = input(`verify-${result}`);
    const initial = engine.ensure(seed, true);
    if (initial.syncStatus !== 'pending-review' && initial.syncStatus !== 'unknown') {
      const record = engine.ensure(input('c3'), true);
      const action = engine.verifySync(record.key, result, '回归核对依据', true);
      assert.equal(action.ok, true);
      assert.equal(engine.get(record.key, input('c3'), true)?.syncStatus, expected);
    } else {
      const action = engine.verifySync(initial.key, result, '回归核对依据', true);
      assert.equal(action.ok, true);
      assert.equal(engine.get(initial.key, seed, true)?.syncStatus, expected);
    }
  }
}

function verifyStableIdentifiersAndNoDuplicate() {
  const storage = memoryStorage();
  const engine = createOutboundInteropEngine(storage, () => '2026-11-22 10:02:00');
  const seed = input('c-nc1');
  const before = engine.ensure(seed, true);
  const count = engine.getPersistedRecordCount();
  const action = engine.retrySync(before.key, true);
  const after = engine.get(before.key, seed, true);
  assert.equal(action.ok, true);
  assert.equal(after?.attemptId, before.attemptId);
  assert.equal(after?.platformCallId, before.platformCallId);
  assert.equal(engine.getPersistedRecordCount(), count);
}

function verifyPersistenceFailureRecovery() {
  let failing = true;
  const data = new Map<string, string>();
  const storage: StorageLike = {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      if (failing) throw new Error('quota');
      data.set(key, value);
    },
    removeItem: (key) => { data.delete(key); },
  };
  const engine = createOutboundInteropEngine(storage);
  engine.ensure(input('persist-recovery'), true);
  assert.match(engine.getPersistenceError(), /保存失败/);
  failing = false;
  const recovered = engine.retryPersistence();
  assert.equal(recovered.ok, true);
  assert.equal(engine.getPersistenceError(), '');
  assert.ok(data.get(OUTBOUND_INTEROP_STORAGE_KEY));
}

verifyPermissionMasking();
verifyThreeReconciliationResults();
verifyStableIdentifiersAndNoDuplicate();
verifyPersistenceFailureRecovery();
console.log('outbound-interop regression: 4/4 passed');
