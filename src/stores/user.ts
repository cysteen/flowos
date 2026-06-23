import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { ROLES, type RoleDef, type RoleKey } from '@/config/roles';
import { findAccount } from '@/mock/loginAccounts';
import { DEFAULT_ROLE, MOCK_USERS, type MockUser } from '@/mock/users';
import { useTenantStore } from '@/stores/tenant';

const SESSION_KEY = 'flowos_session';

interface AuthSession {
  account: string;
  roleKey: RoleKey;
  tenantId?: string;
  remember: boolean;
}

function readSession(): AuthSession | null {
  const raw = localStorage.getItem(SESSION_KEY) ?? sessionStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthSession;
  } catch {
    return null;
  }
}

function writeSession(data: AuthSession | null) {
  localStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem(SESSION_KEY);
  if (!data) return;
  const storage = data.remember ? localStorage : sessionStorage;
  storage.setItem(SESSION_KEY, JSON.stringify(data));
}

function restoreTenantFromSession(session: AuthSession, tenantStore: ReturnType<typeof useTenantStore>) {
  tenantStore.initForAccount(session.account);
  if (tenantStore.isPlatformUser) return;

  const savedId = session.tenantId;
  if (savedId && tenantStore.membershipFor(savedId)) {
    if (tenantStore.canSwitchTo(savedId)) {
      tenantStore.currentTenantId = savedId;
      if (tenantStore.isRoleAllowedInCurrentTenant(session.roleKey)) {
        tenantStore.rememberRoleInCurrentTenant(session.roleKey);
      }
      return;
    }
  }

  const tid = tenantStore.resolveInitialTenantId();
  const roleKey = tenantStore.resolveRoleOnSwitch(tid);
  if (roleKey) tenantStore.rememberTenantContext(tid, roleKey);
}

function userFromSession(session: AuthSession | null): MockUser {
  if (!session) return MOCK_USERS[DEFAULT_ROLE];
  const tenantStore = useTenantStore();
  restoreTenantFromSession(session, tenantStore);

  const acc = findAccount(session.account);
  let roleKey = session.roleKey;
  if (!tenantStore.isPlatformUser && tenantStore.currentTenantId) {
    if (!tenantStore.isRoleAllowedInCurrentTenant(roleKey)) {
      roleKey = tenantStore.resolveRoleOnSwitch(tenantStore.currentTenantId) ?? roleKey;
    }
  }
  return MOCK_USERS[roleKey] ?? MOCK_USERS[acc?.roleKey ?? DEFAULT_ROLE];
}

// 当前登录用户 / 角色（Mock + 登录态）。
export const useUserStore = defineStore('user', () => {
  const tenantStore = useTenantStore();
  const session = ref<AuthSession | null>(readSession());
  const current = ref<MockUser>(userFromSession(session.value));

  const isLoggedIn = computed(() => !!session.value);
  const account = computed(() => session.value?.account ?? '');
  const name = computed(() => current.value.name);
  const roleKey = computed<RoleKey>(() => current.value.roleKey);
  const role = computed<RoleDef>(() => ROLES[current.value.roleKey]);
  const visibleMenus = computed(() => role.value.menus);
  const hiddenTabs = computed(() => role.value.hiddenTabs);
  const hasAdminEntry = computed(() => role.value.hasAdminEntry);
  const isPlatformUser = computed(() => tenantStore.isPlatformUser);

  /** 登录（演示：密码统一 123） */
  function login(acc: string, preferredRoleKey: RoleKey, remember = false) {
    tenantStore.initForAccount(acc);

    let roleKey = preferredRoleKey;
    let tenantId: string | undefined;

    if (!tenantStore.isPlatformUser) {
      const tid = tenantStore.currentTenantId!;
      if (tenantStore.isRoleAllowedInCurrentTenant(preferredRoleKey)) {
        roleKey = preferredRoleKey;
      } else {
        roleKey = tenantStore.resolveRoleOnSwitch(tid) ?? preferredRoleKey;
      }
      tenantId = tid;
      tenantStore.rememberTenantContext(tid, roleKey);
    }

    session.value = { account: acc, roleKey, tenantId, remember };
    current.value = MOCK_USERS[roleKey];
    writeSession(session.value);
  }

  /** 退出登录 */
  function logout() {
    session.value = null;
    current.value = MOCK_USERS[DEFAULT_ROLE];
    tenantStore.reset();
    writeSession(null);
  }

  /**
   * 切换租户（仅多租户成员；停用租户不可选）
   * @returns 切换后的角色，失败返回 null
   */
  function switchTenant(tenantId: string): RoleKey | null {
    if (!tenantStore.canSwitchTo(tenantId)) return null;

    const roleKey = tenantStore.resolveRoleOnSwitch(tenantId);
    if (!roleKey) return null;

    tenantStore.rememberTenantContext(tenantId, roleKey);
    current.value = MOCK_USERS[roleKey];
    if (session.value) {
      session.value = { ...session.value, tenantId, roleKey };
      writeSession(session.value);
    }
    return roleKey;
  }

  /** Dev 下拉切换演示角色（限定在当前租户可用角色内） */
  function setRole(key: RoleKey): boolean {
    if (!tenantStore.isPlatformUser && !tenantStore.isRoleAllowedInCurrentTenant(key)) {
      return false;
    }
    current.value = MOCK_USERS[key];
    tenantStore.rememberRoleInCurrentTenant(key);
    if (session.value) {
      session.value = { ...session.value, roleKey: key };
      writeSession(session.value);
    }
    return true;
  }

  /** 路由守卫：当前角色是否可访问某菜单 */
  function canAccess(menu?: string): boolean {
    if (!menu) return true;
    return visibleMenus.value.includes(menu);
  }

  return {
    session,
    isLoggedIn,
    account,
    current,
    name,
    roleKey,
    role,
    visibleMenus,
    hiddenTabs,
    hasAdminEntry,
    isPlatformUser,
    login,
    logout,
    switchTenant,
    setRole,
    canAccess,
  };
});
