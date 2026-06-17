import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { ROLES, type RoleDef, type RoleKey } from '@/config/roles';
import { DEFAULT_ROLE, MOCK_USERS, type MockUser } from '@/mock/users';

// 当前登录用户 / 角色（本期 Mock）。
export const useUserStore = defineStore('user', () => {
  const current = ref<MockUser>(MOCK_USERS[DEFAULT_ROLE]);

  const name = computed(() => current.value.name);
  const roleKey = computed<RoleKey>(() => current.value.roleKey);
  const role = computed<RoleDef>(() => ROLES[current.value.roleKey]);
  const visibleMenus = computed(() => role.value.menus);
  const hiddenTabs = computed(() => role.value.hiddenTabs);
  const hasAdminEntry = computed(() => role.value.hasAdminEntry);

  /** Dev 下拉切换演示角色 */
  function setRole(key: RoleKey) {
    current.value = MOCK_USERS[key];
  }

  /** 路由守卫：当前角色是否可访问某菜单 */
  function canAccess(menu?: string): boolean {
    if (!menu) return true;
    return visibleMenus.value.includes(menu);
  }

  return {
    current,
    name,
    roleKey,
    role,
    visibleMenus,
    hiddenTabs,
    hasAdminEntry,
    setRole,
    canAccess,
  };
});
