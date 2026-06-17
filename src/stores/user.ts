import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { ROLES, type RoleDef, type RoleKey } from '@/config/roles';
import { findAccount } from '@/mock/loginAccounts';
import { DEFAULT_ROLE, MOCK_USERS, type MockUser } from '@/mock/users';

const SESSION_KEY = 'flowos_session';

interface AuthSession {
  account: string;
  roleKey: RoleKey;
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

function userFromSession(session: AuthSession | null): MockUser {
  if (!session) return MOCK_USERS[DEFAULT_ROLE];
  const acc = findAccount(session.account);
  const roleKey = acc?.roleKey ?? session.roleKey;
  return MOCK_USERS[roleKey] ?? MOCK_USERS[DEFAULT_ROLE];
}

// 当前登录用户 / 角色（Mock + 登录态）。
export const useUserStore = defineStore('user', () => {
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

  /** 登录（演示：密码统一 123） */
  function login(account: string, roleKey: RoleKey, remember = false) {
    session.value = { account, roleKey, remember };
    current.value = MOCK_USERS[roleKey];
    writeSession(session.value);
  }

  /** 退出登录 */
  function logout() {
    session.value = null;
    current.value = MOCK_USERS[DEFAULT_ROLE];
    writeSession(null);
  }

  /** Dev 下拉切换演示角色（保持登录态） */
  function setRole(key: RoleKey) {
    current.value = MOCK_USERS[key];
    if (session.value) {
      session.value = { ...session.value, roleKey: key };
      writeSession(session.value);
    }
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
    login,
    logout,
    setRole,
    canAccess,
  };
});
