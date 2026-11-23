export const WORKSTATE_EVENT_SCHEMA_VERSION = 2 as const;
export const WORKSTATE_AUDIT_SCHEMA_VERSION = 1 as const;

export type WorkstateDeliveryState = 'queued' | 'sending' | 'failed' | 'acknowledged';
export type WorkstateFailureDisposition = 'retryable' | 'permanent' | null;
export type WorkstateAction = 'query' | 'summary' | 'export' | 'retry' | 'compensate';

const QUERY_EXPORT_ROLES = new Set([
  'team-leader', 'ops-monitor', 'complaint-supervisor', 'ops-admin', 'tenant-admin', 'system-admin',
]);
const RETRY_ROLES = new Set(['team-leader', 'ops-admin', 'tenant-admin', 'system-admin']);
const COMPENSATE_ROLES = new Set(['ops-admin', 'tenant-admin', 'system-admin']);

export function workstateRoleAllowsAction(roleKey: string, action: WorkstateAction): boolean {
  if (action === 'query' || action === 'summary' || action === 'export') return QUERY_EXPORT_ROLES.has(roleKey);
  if (action === 'retry') return RETRY_ROLES.has(roleKey);
  return COMPENSATE_ROLES.has(roleKey);
}

export function workstateOrganizationStorageKey(tenantId: string, actorId: string): string {
  return `flowos-workstate-current-organization-v2:${encodeURIComponent(tenantId)}:${encodeURIComponent(actorId)}`;
}

export function hasCompleteWorkstateIdentity(identity: {
  tenantId?: string | null;
  actorId?: string | null;
  organizationId?: string | null;
}): boolean {
  return !!identity.tenantId && !!identity.actorId && !!identity.organizationId;
}

export type WorkstateIdentityExclusionReason = 'tenant_snapshot_missing' | 'actor_snapshot_missing'
  | 'organization_snapshot_missing' | null;

export function workstateIdentityExclusionReason(identity: {
  tenantId?: string | null;
  actorId?: string | null;
  organizationId?: string | null;
}): WorkstateIdentityExclusionReason {
  if (!identity.tenantId) return 'tenant_snapshot_missing';
  if (!identity.actorId) return 'actor_snapshot_missing';
  if (!identity.organizationId) return 'organization_snapshot_missing';
  return null;
}

export interface WorkstateAuditRecord {
  auditId: string;
  schemaVersion: typeof WORKSTATE_AUDIT_SCHEMA_VERSION;
  action: WorkstateAction;
  actorId: string | null;
  actorRoleKey: string;
  tenantId: string | null;
  managedGroupIds: string[];
  requestedGroupId: string;
  resultCode: string;
  occurredAt: number;
}

export function createWorkstateAuditRecord(input: Omit<WorkstateAuditRecord, 'auditId' | 'schemaVersion'>): WorkstateAuditRecord {
  return {
    ...input,
    auditId: globalThis.crypto?.randomUUID?.() ?? `workstate-audit-${input.occurredAt}-${Math.random().toString(36).slice(2)}`,
    schemaVersion: WORKSTATE_AUDIT_SCHEMA_VERSION,
    managedGroupIds: [...input.managedGroupIds],
  };
}

export interface WorkstateDeliveryReceipt {
  state: WorkstateDeliveryState;
  attempts: number;
  lastAttemptAt: number | null;
  nextRetryAt: number | null;
  acknowledgedAt: number | null;
  serverReceiptId: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  /** 永久失败不得进入自动或人工重试；旧缓存缺失时按可重试迁移。 */
  failureDisposition: WorkstateFailureDisposition;
}

export interface WorkstateIdentitySnapshot {
  tenantId: string | null;
  actorId: string | null;
  actorName: string;
  actorRoleKey: string;
  staffNo: string | null;
  organizationId: string | null;
}

export interface WorkstateEventEnvelope<TPayload> {
  eventId: string;
  idempotencyKey: string;
  eventName: 'workstate.segment_started' | 'workstate.segment_closed';
  schemaVersion: typeof WORKSTATE_EVENT_SCHEMA_VERSION;
  sequence: number;
  previousEventId: string | null;
  occurredAt: number;
  recordedAt: number;
  timeZone: 'Asia/Shanghai';
  environment: 'prototype';
  timeSource: 'client_clock';
  identity: WorkstateIdentitySnapshot;
  delivery: WorkstateDeliveryReceipt;
  payload: TPayload;
}

export const endpointNotConfiguredError = {
  code: 'OBSERVATORY_ENDPOINT_NOT_CONFIGURED',
  message: '正式观星台端点尚未配置，事件仍保留在本机 Outbox。',
} as const;

export const identityInvalidError = {
  code: 'WORKSTATE_IDENTITY_INVALID',
  message: '租户、人员或工作组织身份缺失，事件不可发送，需先修复身份映射。',
} as const;

export function isRetryDue(receipt: WorkstateDeliveryReceipt, now: number): boolean {
  if (receipt.state === 'acknowledged' || receipt.state === 'sending') return false;
  if (receipt.failureDisposition === 'permanent') return false;
  return receipt.nextRetryAt == null || receipt.nextRetryAt <= now;
}

export function nextRetryDelayMs(attempts: number): number {
  return Math.min(30 * 60_000, 30_000 * 2 ** Math.max(0, attempts - 1));
}
