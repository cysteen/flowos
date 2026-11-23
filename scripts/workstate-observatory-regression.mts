import assert from 'node:assert/strict';
import {
  createWorkstateAuditRecord,
  hasCompleteWorkstateIdentity,
  workstateIdentityExclusionReason,
  workstateOrganizationStorageKey,
  workstateRoleAllowsAction,
} from '../src/stores/workstateEventContract.ts';
import { getWorkstateTenantAuthorization } from '../src/mock/tenantMembership.ts';

assert.equal(workstateRoleAllowsAction('ops-monitor', 'query'), true);
assert.equal(workstateRoleAllowsAction('ops-monitor', 'export'), true);
assert.equal(workstateRoleAllowsAction('ops-monitor', 'retry'), false);
assert.equal(workstateRoleAllowsAction('complaint-supervisor', 'compensate'), false);
assert.equal(workstateRoleAllowsAction('team-leader', 'retry'), true);
assert.equal(workstateRoleAllowsAction('ops-admin', 'compensate'), true);

const mainTenant = getWorkstateTenantAuthorization('13857985858', 't1');
const educationTenant = getWorkstateTenantAuthorization('13857985858', 't4');
assert.notDeepEqual(mainTenant, educationTenant);
assert.deepEqual(getWorkstateTenantAuthorization('13857985858', 'unknown-tenant'), {
  managedGroupIds: [], workGroupIds: [],
});

assert.notEqual(
  workstateOrganizationStorageKey('prototype:t1', 'prototype:actor-a'),
  workstateOrganizationStorageKey('prototype:t2', 'prototype:actor-a'),
);
assert.notEqual(
  workstateOrganizationStorageKey('prototype:t1', 'prototype:actor-a'),
  workstateOrganizationStorageKey('prototype:t1', 'prototype:actor-b'),
);

assert.equal(hasCompleteWorkstateIdentity({ tenantId: 't1', actorId: 'a1', organizationId: 'g1' }), true);
assert.equal(hasCompleteWorkstateIdentity({ tenantId: 't1', actorId: null, organizationId: 'g1' }), false);
assert.equal(workstateIdentityExclusionReason({ tenantId: 't1', actorId: null, organizationId: 'g1' }), 'actor_snapshot_missing');
assert.equal(workstateIdentityExclusionReason({ tenantId: null, actorId: 'a1', organizationId: 'g1' }), 'tenant_snapshot_missing');
assert.equal(workstateIdentityExclusionReason({ tenantId: 't1', actorId: 'a1', organizationId: null }), 'organization_snapshot_missing');

const audit = createWorkstateAuditRecord({
  action: 'retry', actorId: 'prototype:a1', actorRoleKey: 'ops-monitor', tenantId: 'prototype:t1',
  managedGroupIds: ['line1'], requestedGroupId: 'line1', resultCode: 'DENIED_ACTION_DENIED', occurredAt: 1,
});
assert.equal(audit.action, 'retry');
assert.equal(audit.resultCode, 'DENIED_ACTION_DENIED');
assert.equal(audit.tenantId, 'prototype:t1');
assert.deepEqual(audit.managedGroupIds, ['line1']);
assert.ok(audit.auditId);

console.log('workstate-observatory regression: passed');
