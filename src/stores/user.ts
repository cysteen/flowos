import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { ROLES, type AgentPost, type RoleDef, type RoleKey } from '@/config/roles';
import { findAccount } from '@/mock/loginAccounts';
import { DEFAULT_ROLE, mockUserFor, type MockUser } from '@/mock/users';
import { useTenantStore } from '@/stores/tenant';

const SESSION_KEY = 'flowos_session';

interface AuthSession {
  account: string;
  roleKey: RoleKey;
  /** 二线专员的分岗（客服 / 售后）。分岗是用户属性、不是角色，见基线 §3.0 */
  post?: AgentPost;
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
  if (!session) return mockUserFor(DEFAULT_ROLE, ROLES[DEFAULT_ROLE].post);
  const tenantStore = useTenantStore();
  restoreTenantFromSession(session, tenantStore);

  const acc = findAccount(session.account);
  let roleKey = session.roleKey;
  if (!tenantStore.isPlatformUser && tenantStore.currentTenantId) {
    if (!tenantStore.isRoleAllowedInCurrentTenant(roleKey)) {
      roleKey = tenantStore.resolveRoleOnSwitch(tenantStore.currentTenantId) ?? roleKey;
    }
  }
  const post = session.post ?? acc?.post ?? ROLES[roleKey]?.post;
  return mockUserFor(roleKey, post) ?? mockUserFor(acc?.roleKey ?? DEFAULT_ROLE, post);
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
  /** 当前分岗（仅二线专员有意义）：用户属性优先，缺省回落到角色定义 */
  const post = computed<AgentPost | undefined>(() => current.value.post ?? role.value.post);
  /**
   * 可见菜单 = 角色菜单 ∩ 分岗裁剪。
   *
   * 「售后工作台按分岗（客服 / 售后）出」（PRD-08 §2 注）：0830 起客服 / 售后不再是两个角色，
   * 是二线专员的分岗属性，所以 `aftersale` 写在角色菜单里、由分岗做二次过滤 ——
   * 别为了出这一项再拆一个 RoleKey 回去。其余角色不受分岗影响。
   */
  const visibleMenus = computed(() => {
    if (role.value.key === 'agent-l2' && post.value !== 'as') {
      return role.value.menus.filter((m) => m !== 'aftersale');
    }
    return role.value.menus;
  });
  const hiddenTabs = computed(() => role.value.hiddenTabs);
  const hasAdminEntry = computed(() => role.value.hasAdminEntry);
  const isPlatformUser = computed(() => tenantStore.isPlatformUser);

  /** 登录（演示：密码统一 123） */
  function login(acc: string, preferredRoleKey: RoleKey, remember = false) {
    tenantStore.initForAccount(acc);

    let roleKey = preferredRoleKey;
    let tenantId: string | undefined;
    // 分岗随账号走（一个人的分岗不会因为切租户而变）
    const post = findAccount(acc)?.post ?? ROLES[preferredRoleKey]?.post;

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

    session.value = { account: acc, roleKey, post, tenantId, remember };
    current.value = mockUserFor(roleKey, post);
    writeSession(session.value);
  }

  /** 退出登录 */
  function logout() {
    session.value = null;
    current.value = mockUserFor(DEFAULT_ROLE, ROLES[DEFAULT_ROLE].post);
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
    const post = session.value?.post ?? ROLES[roleKey]?.post;
    current.value = mockUserFor(roleKey, post);
    if (session.value) {
      session.value = { ...session.value, tenantId, roleKey, post };
      writeSession(session.value);
    }
    return roleKey;
  }

  /** Dev 下拉切换演示角色（限定在当前租户可用角色内） */
  function setRole(key: RoleKey): boolean {
    if (!tenantStore.isPlatformUser && !tenantStore.isRoleAllowedInCurrentTenant(key)) {
      return false;
    }
    // 切角色时分岗回落到该角色缺省（切到二线专员＝客服岗；售后岗视角用售后账号登录）
    const post = ROLES[key].post;
    current.value = mockUserFor(key, post);
    tenantStore.rememberRoleInCurrentTenant(key);
    if (session.value) {
      session.value = { ...session.value, roleKey: key, post };
      writeSession(session.value);
    }
    return true;
  }

  /**
   * 路由守卫：当前角色是否可访问某菜单。
   *
   * ⚠️ **没标 `meta.menu` 的路由一律放行**，这是 fail-open ——
   * 登录页、404 这类公开页靠它才进得去，所以不能简单反转成 fail-closed。
   * 代价是：**新增业务路由若忘了标 `meta.menu`，等于对全部角色开放**。
   * 加业务页时必须一并标 menu；要真正收紧，得先给公开路由建白名单再把默认改成拒绝。
   */
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
    post,
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
