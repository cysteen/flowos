import { defineStore } from 'pinia';
import { ref } from 'vue';

export type OutboundSyncStatus = 'synced' | 'pending-review' | 'sync-failed' | 'unknown';
export type OutboundRecordingStatus =
  | 'pending'
  | 'available'
  | 'not-generated'
  | 'generation-failed'
  | 'unknown';
export type OutboundVerificationResult = 'target-exists' | 'target-missing' | 'unresolved';
export type RecordingAccessScope = 'visible' | 'masked';

export type RecordingScopedRecord<T extends { recording?: unknown; asr?: unknown }> =
  | (T & { recordingAccess: 'visible' })
  | (Omit<T, 'recording' | 'asr'> & {
    recordingAccess: 'masked';
    recording?: never;
    asr?: never;
  });

/**
 * Apply recording permission before records enter a presentation component.
 * The masked shape never contains recording or transcript fields, so rendering
 * cannot reveal whether a resource exists by checking optional properties.
 */
export function scopeRecordsForRecordingAccess<T extends { recording?: unknown; asr?: unknown }>(
  records: readonly T[],
  canAccessRecording: boolean,
): RecordingScopedRecord<T>[] {
  if (canAccessRecording) {
    return records.map((record) => ({ ...record, recordingAccess: 'visible' as const }));
  }
  return records.map((record) => {
    const { recording: _recording, asr: _asr, ...safeRecord } = record;
    return { ...safeRecord, recordingAccess: 'masked' as const };
  });
}

export interface PersistedOutboundInteropRecord {
  key: string;
  ticketNo: string;
  contactRecordId: string;
  attemptId: string;
  platformCallId: string;
  originEntry: string;
  linkedAt: string;
  syncStatus: OutboundSyncStatus;
  syncMessage: string;
  lastCheckedAt: string;
  verificationReason: string;
  retryCount: number;
}

export interface VisibleRecordingView {
  masked: false;
  status: OutboundRecordingStatus;
  message: string;
}

export interface MaskedRecordingView {
  masked: true;
  message: string;
}

export interface OutboundInteropView extends PersistedOutboundInteropRecord {
  recording: VisibleRecordingView | MaskedRecordingView;
}

export interface EnsureOutboundInteropInput {
  ticketNo: string;
  contactRecordId: string;
  occurredAt: string;
  originEntry?: string;
  connected: boolean;
  hasRecording: boolean;
}

export interface OutboundInteropActionResult {
  ok: boolean;
  message: string;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

interface StoredPayload {
  version: number;
  records: Record<string, PersistedOutboundInteropRecord>;
}

interface RecordingState {
  status: OutboundRecordingStatus;
  message: string;
}

export const OUTBOUND_INTEROP_STORAGE_KEY = 'flowos-outbound-interop:v2';
const LEGACY_STORAGE_KEY = 'flowos-outbound-interop:v1';
const STORAGE_VERSION = 2;
export const STABLE_EMPTY_CONTACT_TICKET_NO = 'IFLYZX-20261020-00005';

export function isStableEmptyContactTicket(ticketNo?: string): boolean {
  return ticketNo === STABLE_EMPTY_CONTACT_TICKET_NO;
}

function stableHash(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function digits(input: string): string {
  return input.replace(/\D/g, '');
}

function beijingNowText(): string {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).format(new Date()).replace('T', ' ');
}

function seedSyncStatus(recordId: string, hash: number): OutboundSyncStatus {
  const fixed: Record<string, OutboundSyncStatus> = {
    c1: 'synced', c3: 'pending-review', 'c-nc': 'unknown',
    'c-nc1': 'sync-failed', 'c-nc2': 'unknown', 'c-nc3': 'synced',
  };
  return fixed[recordId] ?? (['synced', 'pending-review', 'sync-failed', 'unknown'] as const)[hash % 4];
}

function seedRecordingStatus(input: EnsureOutboundInteropInput, hash: number): OutboundRecordingStatus {
  const fixed: Record<string, OutboundRecordingStatus> = {
    c1: 'available', c3: 'pending', 'c-nc': 'unknown',
    'c-nc1': 'not-generated', 'c-nc2': 'generation-failed', 'c-nc3': 'unknown',
  };
  if (fixed[input.contactRecordId]) return fixed[input.contactRecordId];
  if (!input.connected) return hash % 2 === 0 ? 'not-generated' : 'unknown';
  if (input.hasRecording) return 'available';
  return (['pending', 'generation-failed', 'unknown'] as const)[hash % 3];
}

function syncMessage(status: OutboundSyncStatus): string {
  if (status === 'synced') return '已核对目标记录存在，并关联至本联系记录。';
  if (status === 'pending-review') return '已收到处理回执，等待核对目标记录。';
  if (status === 'sync-failed') return '关联写入失败，可沿用原外呼尝试重试。';
  return '未取得明确结果，需核对目标记录是否存在。';
}

function recordingMessage(status: OutboundRecordingStatus): string {
  if (status === 'available') return '录音已回传，可在原联系记录中查询。';
  if (status === 'pending') return '平台录音仍在生成，可手动刷新。';
  if (status === 'not-generated') return '平台已明确返回本次通话未生成录音。';
  if (status === 'generation-failed') return '录音生成失败，可重试并刷新原记录。';
  return '尚未取得明确录音结果，可稍后重新核对。';
}

function createSeed(input: EnsureOutboundInteropInput): PersistedOutboundInteropRecord {
  const ticketNo = input.ticketNo || '当前工单';
  const key = `${ticketNo}::${input.contactRecordId}`;
  const hash = stableHash(key);
  const syncStatus = seedSyncStatus(input.contactRecordId, hash);
  const timestamp = digits(input.occurredAt).slice(0, 14).padEnd(14, '0');
  const suffix = String(hash % 1_000_000).padStart(6, '0');
  const ticketSuffix = digits(ticketNo).slice(-8).padStart(8, '0');
  return {
    key, ticketNo, contactRecordId: input.contactRecordId,
    attemptId: `OUT-${ticketSuffix}-${suffix}`,
    platformCallId: `RL-${timestamp}-${suffix}`,
    originEntry: input.originEntry ?? '工单处理页 · 外呼',
    linkedAt: input.occurredAt || '—', syncStatus, syncMessage: syncMessage(syncStatus),
    lastCheckedAt: input.occurredAt || '—', verificationReason: '', retryCount: 0,
  };
}

function isPersistedRecord(value: unknown): value is PersistedOutboundInteropRecord {
  if (!value || typeof value !== 'object') return false;
  const row = value as Partial<PersistedOutboundInteropRecord>;
  return typeof row.key === 'string' && typeof row.ticketNo === 'string'
    && typeof row.contactRecordId === 'string' && typeof row.attemptId === 'string'
    && typeof row.platformCallId === 'string' && typeof row.syncStatus === 'string';
}

export function createOutboundInteropEngine(storage?: StorageLike, now: () => string = beijingNowText) {
  const records: Record<string, PersistedOutboundInteropRecord> = {};
  const recordings = new Map<string, RecordingState>();
  let persistenceError = '';

  function load() {
    if (!storage) return;
    try {
      storage.removeItem(LEGACY_STORAGE_KEY);
      const payload = JSON.parse(storage.getItem(OUTBOUND_INTEROP_STORAGE_KEY) ?? 'null') as StoredPayload | null;
      if (payload?.version !== STORAGE_VERSION || !payload.records) return;
      for (const [key, value] of Object.entries(payload.records)) {
        if (isPersistedRecord(value)) records[key] = { ...value };
      }
    } catch {
      persistenceError = '本地核对结果读取失败；当前会话仍可操作，刷新后可能丢失。';
    }
  }

  function persist(): boolean {
    if (!storage) {
      persistenceError = '本地存储不可用；当前会话结果已保留在内存中，刷新后可能丢失。';
      return false;
    }
    try {
      storage.setItem(OUTBOUND_INTEROP_STORAGE_KEY, JSON.stringify({ version: STORAGE_VERSION, records } satisfies StoredPayload));
      persistenceError = '';
      return true;
    } catch {
      persistenceError = '本地保存失败；当前会话结果已保留在内存中，刷新后可能丢失。';
      return false;
    }
  }

  function recordingFor(input: EnsureOutboundInteropInput): RecordingState {
    const key = `${input.ticketNo || '当前工单'}::${input.contactRecordId}`;
    const current = recordings.get(key);
    if (current) return current;
    const status = seedRecordingStatus(input, stableHash(key));
    const created = { status, message: recordingMessage(status) };
    recordings.set(key, created);
    return created;
  }

  function view(record: PersistedOutboundInteropRecord, input: EnsureOutboundInteropInput, canAccessRecording: boolean): OutboundInteropView {
    const recording: OutboundInteropView['recording'] = canAccessRecording
      ? { masked: false, ...recordingFor(input) }
      : { masked: true, message: '当前账号无录音查询权限，录音资源状态已隐藏。' };
    return { ...record, recording };
  }

  function ensure(input: EnsureOutboundInteropInput, canAccessRecording: boolean): OutboundInteropView {
    const key = `${input.ticketNo || '当前工单'}::${input.contactRecordId}`;
    if (!records[key]) {
      records[key] = createSeed(input);
      persist();
    }
    return view(records[key], input, canAccessRecording);
  }

  function get(key: string, input: EnsureOutboundInteropInput, canAccessRecording: boolean): OutboundInteropView | undefined {
    const record = records[key];
    return record ? view(record, input, canAccessRecording) : undefined;
  }

  function retrySync(key: string, allowed: boolean): OutboundInteropActionResult {
    const record = records[key];
    if (!record) return { ok: false, message: '未找到对应的外呼互通记录。' };
    if (!allowed) return { ok: false, message: '当前账号仅可查看，无互通重试权限。' };
    if (record.syncStatus !== 'sync-failed') return { ok: false, message: '当前状态应先核对目标记录，不允许直接重试或判定成功。' };
    record.syncStatus = 'pending-review';
    record.retryCount += 1;
    record.lastCheckedAt = now();
    record.verificationReason = '沿用原外呼尝试重新提交，等待核对目标记录。';
    record.syncMessage = `已沿用外呼尝试 ${record.attemptId} 重新提交，未新增联系记录。`;
    persist();
    return { ok: true, message: record.syncMessage };
  }

  function verifySync(key: string, result: OutboundVerificationResult, reason: string, allowed: boolean): OutboundInteropActionResult {
    const record = records[key];
    if (!record) return { ok: false, message: '未找到对应的外呼互通记录。' };
    if (!allowed) return { ok: false, message: '当前账号仅可查看，无互通核对权限。' };
    const normalizedReason = reason.trim();
    if (!normalizedReason) return { ok: false, message: '请填写本次核对依据或原因。' };
    if (record.syncStatus !== 'pending-review' && record.syncStatus !== 'unknown') {
      return { ok: false, message: '当前状态无需执行目标记录核对。' };
    }
    record.lastCheckedAt = now();
    record.verificationReason = normalizedReason;
    if (result === 'target-exists') {
      record.syncStatus = 'synced';
      record.syncMessage = `模拟核对：目标记录存在，已关联原联系记录 ${record.contactRecordId}。`;
    } else if (result === 'target-missing') {
      record.syncStatus = 'sync-failed';
      record.syncMessage = '模拟核对：未找到目标记录，未创建重复记录，可按原外呼尝试重试。';
    } else {
      record.syncStatus = 'unknown';
      record.syncMessage = '模拟核对：仍无法确认目标记录是否存在，状态保持结果不明。';
    }
    persist();
    return { ok: true, message: record.syncMessage };
  }

  function refreshRecording(key: string, input: EnsureOutboundInteropInput, allowed: boolean): OutboundInteropActionResult {
    if (!records[key]) return { ok: false, message: '未找到对应的外呼互通记录。' };
    if (!allowed) return { ok: false, message: '当前账号无录音查询权限。' };
    const recording = recordingFor(input);
    if (recording.status === 'not-generated') return { ok: false, message: '平台已明确未生成录音，无需继续刷新。' };
    if (recording.status === 'available') return { ok: true, message: '录音已在原联系记录中可查询。' };
    if (recording.status === 'unknown') {
      recording.message = '重新核对后仍未取得明确录音结果，请稍后再试。';
      return { ok: true, message: recording.message };
    }
    if (recording.status === 'generation-failed') {
      recording.status = 'pending';
      recording.message = `已按平台通话标识 ${records[key].platformCallId} 重试生成，仍关联原记录。`;
    } else {
      recording.status = 'available';
      recording.message = `迟到录音已回填原联系记录 ${records[key].contactRecordId}，未新增记录。`;
    }
    return { ok: true, message: recording.message };
  }

  function retryPersistence(): OutboundInteropActionResult {
    const ok = persist();
    return { ok, message: ok ? '当前会话的核对结果已重新保存。' : persistenceError };
  }

  function getPersistenceError(): string { return persistenceError; }
  function getPersistedRecordCount(): number { return Object.keys(records).length; }

  load();
  return { ensure, get, retrySync, verifySync, refreshRecording, retryPersistence, getPersistenceError, getPersistedRecordCount };
}

export const useOutboundInteropStore = defineStore('outboundInterop', () => {
  const storage = typeof localStorage === 'undefined' ? undefined : localStorage;
  const engine = createOutboundInteropEngine(storage);
  const revision = ref(0);
  const persistenceWarning = ref(engine.getPersistenceError());

  function syncState() {
    revision.value += 1;
    persistenceWarning.value = engine.getPersistenceError();
  }

  function ensure(input: EnsureOutboundInteropInput, canAccessRecording: boolean): OutboundInteropView {
    void revision.value;
    const result = engine.ensure(input, canAccessRecording);
    const warning = engine.getPersistenceError();
    if (persistenceWarning.value !== warning) persistenceWarning.value = warning;
    return result;
  }

  function get(key: string, input: EnsureOutboundInteropInput, canAccessRecording: boolean): OutboundInteropView | undefined {
    void revision.value;
    return engine.get(key, input, canAccessRecording);
  }

  function retrySync(key: string, allowed: boolean): OutboundInteropActionResult {
    const result = engine.retrySync(key, allowed); syncState(); return result;
  }

  function verifySync(key: string, result: OutboundVerificationResult, reason: string, allowed: boolean): OutboundInteropActionResult {
    const action = engine.verifySync(key, result, reason, allowed); syncState(); return action;
  }

  function refreshRecording(key: string, input: EnsureOutboundInteropInput, allowed: boolean): OutboundInteropActionResult {
    const result = engine.refreshRecording(key, input, allowed); syncState(); return result;
  }

  function retryPersistence(): OutboundInteropActionResult {
    const result = engine.retryPersistence(); syncState(); return result;
  }

  return { persistenceWarning, ensure, get, retrySync, verifySync, refreshRecording, retryPersistence };
});
