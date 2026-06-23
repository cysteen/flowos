import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import type { RoleKey } from '@/config/roles';
import { TENANTS } from '@/mock/platformAdmin';
import {
  getMembershipsForAccount,
  getTenantProfile,
  type TenantMembership,
  type TenantProfile,
} from '@/mock/tenantMembership';

const LS_LAST_TENANT = 'flowos-last-tenant-id';
const LS_LAST_ROLE_BY_TENANT = 'flowos-last-role-by-tenant';

export type TenantStatus = 'active' | 'suspended' | 'expired';

export interface TenantListItem {
  id: string;
  name: string;
  code: string;
  status: TenantStatus;
  color: string;
  selectable: boolean;
  membership: TenantMembership;
}

function readLastTenantId(): string | null {
  return localStorage.getItem(LS_LAST_TENANT);
}

function writeLastTenantId(id: string) {
  localStorage.setItem(LS_LAST_TENANT, id);
}

function readLastRoleByTenant(): Record<string, RoleKey> {
  try {
    const raw = localStorage.getItem(LS_LAST_ROLE_BY_TENANT);
    return raw ? (JSON.parse(raw) as Record<string, RoleKey>) : {};
  } catch {
    return {};
  }
}

function writeLastRoleByTenant(map: Record<string, RoleKey>) {
  localStorage.setItem(LS_LAST_ROLE_BY_TENANT, JSON.stringify(map));
}

function tenantStatusFromMock(id: string): TenantStatus {
  const t = TENANTS.find((x) => x.id === id);
  if (!t) return 'active';
  if (t.status === 'suspended') return 'suspended';
  return 'active';
}

/** 方案 A：按租户解析角色（优先上次在该租户使用的角色 → defaultRole → 唯一角色） */
export function resolveRoleForTenant(
  membership: TenantMembership,
  lastRoleByTenant: Record<string, RoleKey>,
): RoleKey {
  const last = lastRoleByTenant[membership.tenantId];
  if (last && membership.roles.includes(last)) return last;
  if (membership.defaultRole && membership.roles.includes(membership.defaultRole)) {
    return membership.defaultRole;
  }
  return membership.roles[0];
}

export const useTenantStore = defineStore('tenant', () => {
  const account = ref('');
  const memberships = ref<TenantMembership[]>([]);
  const currentTenantId = ref<string | null>(null);
  const lastRoleByTenant = ref<Record<string, RoleKey>>(readLastRoleByTenant());

  const isPlatformUser = computed(() => memberships.value.length === 0);

  const tenantList = computed<TenantListItem[]>(() =>
    memberships.value.map((m) => {
      const mock = TENANTS.find((t) => t.id === m.tenantId);
      const status = tenantStatusFromMock(m.tenantId);
      return {
        id: m.tenantId,
        name: mock?.name ?? getTenantProfile(m.tenantId).name,
        code: mock?.code ?? m.tenantId,
        status,
        color: mock?.color ?? '#1A6FFF',
        selectable: status === 'active',
        membership: m,
      };
    }),
  );

  const currentTenant = computed(() =>
    tenantList.value.find((t) => t.id === currentTenantId.value) ?? null,
  );

  const currentProfile = computed<TenantProfile | null>(() => {
    if (!currentTenantId.value || isPlatformUser.value) return null;
    return getTenantProfile(currentTenantId.value);
  });

  const currentTenantName = computed(() => currentProfile.value?.name ?? '');

  const showTenantSwitcher = computed(
    () => !isPlatformUser.value && tenantList.value.length > 1,
  );

  const showTenantName = computed(() => !isPlatformUser.value && !!currentTenantName.value);

  function membershipFor(tenantId: string): TenantMembership | undefined {
    return memberships.value.find((m) => m.tenantId === tenantId);
  }

  function isRoleAllowedInCurrentTenant(roleKey: RoleKey): boolean {
    const m = currentTenantId.value ? membershipFor(currentTenantId.value) : undefined;
    return !!m?.roles.includes(roleKey);
  }

  function resolveInitialTenantId(): string {
    const lastId = readLastTenantId();
    if (lastId) {
      const item = tenantList.value.find((t) => t.id === lastId);
      if (item?.selectable) return lastId;
    }
    const firstActive = tenantList.value.find((t) => t.selectable);
    return firstActive?.id ?? memberships.value[0].tenantId;
  }

  /** 登录后按账号初始化租户列表 */
  function initForAccount(acc: string) {
    account.value = acc;
    memberships.value = getMembershipsForAccount(acc);
    if (memberships.value.length === 0) {
      currentTenantId.value = null;
      return null;
    }
    const resolved = resolveInitialTenantId();
    currentTenantId.value = resolved;
    return resolved;
  }

  /** 方案 A：解析目标租户下的角色 */
  function resolveRoleOnSwitch(tenantId: string): RoleKey | null {
    const m = membershipFor(tenantId);
    if (!m) return null;
    return resolveRoleForTenant(m, lastRoleByTenant.value);
  }

  function rememberTenantContext(tenantId: string, roleKey: RoleKey) {
    currentTenantId.value = tenantId;
    writeLastTenantId(tenantId);
    lastRoleByTenant.value = { ...lastRoleByTenant.value, [tenantId]: roleKey };
    writeLastRoleByTenant(lastRoleByTenant.value);
  }

  function rememberRoleInCurrentTenant(roleKey: RoleKey) {
    if (!currentTenantId.value) return;
    lastRoleByTenant.value = { ...lastRoleByTenant.value, [currentTenantId.value]: roleKey };
    writeLastRoleByTenant(lastRoleByTenant.value);
  }

  function canSwitchTo(tenantId: string): boolean {
    const item = tenantList.value.find((t) => t.id === tenantId);
    return !!item?.selectable;
  }

  function reset() {
    account.value = '';
    memberships.value = [];
    currentTenantId.value = null;
  }

  return {
    account,
    memberships,
    currentTenantId,
    lastRoleByTenant,
    isPlatformUser,
    tenantList,
    currentTenant,
    currentProfile,
    currentTenantName,
    showTenantSwitcher,
    showTenantName,
    membershipFor,
    isRoleAllowedInCurrentTenant,
    initForAccount,
    resolveInitialTenantId,
    resolveRoleOnSwitch,
    rememberTenantContext,
    rememberRoleInCurrentTenant,
    canSwitchTo,
    reset,
  };
});
