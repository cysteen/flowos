<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { message } from 'ant-design-vue';
import {
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  BellOutlined,
  QuestionCircleOutlined,
  GlobalOutlined,
  DownOutlined,
  CheckOutlined,
} from '@ant-design/icons-vue';
import AgentCtiBar from './AgentCtiBar.vue';
import { useUserStore } from '@/stores/user';
import { useTenantStore } from '@/stores/tenant';
import { useAdminTabsStore } from '@/stores/adminTabs';
import { useWorkspaceTabsStore } from '@/stores/workspaceTabs';
import { ROLE_OPTION_GROUPS, isRoleKey, ROLES } from '@/config/roles';
import { firstMenuPath } from '@/config/navigation';

defineProps<{ collapsed: boolean }>();
const emit = defineEmits<{ toggle: [] }>();

const user = useUserStore();
const tenant = useTenantStore();
const route = useRoute();
const router = useRouter();

const logoUrl = import.meta.env.BASE_URL + 'logo.png';

// 头部只显示角色名；租户信息在下拉的「切换租户」里体现，避免重复
const userSubtitle = computed(() => user.role.name);

/** 当前租户内可切换的演示角色（过滤掉不属于本租户的项） */
const roleOptionGroups = computed(() =>
  ROLE_OPTION_GROUPS.map((group) => ({
    ...group,
    options: group.options.filter((r) =>
      user.isPlatformUser ? true : tenant.membershipFor(tenant.currentTenantId!)?.roles.includes(r.value),
    ),
  })).filter((g) => g.options.length > 0),
);

function afterContextChange() {
  if (route.path.startsWith('/admin') && !user.hasAdminEntry) {
    router.push(firstMenuPath(user.visibleMenus));
  } else if (route.meta.menu && !user.canAccess(route.meta.menu as string)) {
    router.push(firstMenuPath(user.visibleMenus));
  }
}

function onMenuClick({ key }: { key: string | number }) {
  const k = String(key);

  if (k.startsWith('tenant:')) {
    switchTenant(k.slice('tenant:'.length));
    return;
  }

  if (isRoleKey(k)) {
    if (!user.setRole(k)) {
      message.warning('当前租户下无此角色权限');
      return;
    }
    message.success(`已切换为「${user.role.name}」`);
    afterContextChange();
    return;
  }

  if (k === 'admin') {
    router.push('/admin');
    return;
  }
  if (k === 'logout') {
    useAdminTabsStore().reset();
    useWorkspaceTabsStore().reset();
    user.logout();
    router.push('/login');
    return;
  }
  const map: Record<string, string> = {
    profile: '打开「个人设置」',
  };
  message.info(map[k] ?? '');
}

function tenantStatusLabel(status: string) {
  if (status === 'suspended') return '已停用';
  if (status === 'expired') return '已到期';
  return '';
}

function switchTenant(tenantId: string) {
  if (tenantId === tenant.currentTenantId) return;
  if (!tenant.canSwitchTo(tenantId)) {
    message.warning('该租户已停用，无法切换');
    return;
  }
  const roleKey = user.switchTenant(tenantId);
  if (!roleKey) {
    message.error('切换租户失败');
    return;
  }
  useAdminTabsStore().reset();
  useWorkspaceTabsStore().reset();
  message.success(`已切换至「${tenant.currentTenantName}」· ${ROLES[roleKey].name}`);
  afterContextChange();
  if (route.path.startsWith('/admin')) {
    router.push('/admin/overview');
  } else {
    router.push(firstMenuPath(user.visibleMenus));
  }
}
</script>

<template>
  <header class="app-header">
    <!-- Logo 区（200，右边框分隔） -->
    <div class="logo-area">
      <img class="logo-icon" :src="logoUrl" alt="iFLY" />
      <div class="logo-text">
        <div class="logo-title">iFLY.FlowOS</div>
        <div class="logo-sub">智能工单流转平台</div>
      </div>
    </div>

    <div class="header-main">
      <!-- 折叠按钮 -->
      <div class="toggle" @click="emit('toggle')">
        <MenuUnfoldOutlined v-if="collapsed" :style="{ fontSize: '18px', color: '#6B7280' }" />
        <MenuFoldOutlined v-else :style="{ fontSize: '18px', color: '#6B7280' }" />
      </div>

      <!-- 二线坐席 软电话(CTI) 状态条（替代原面包屑） -->
      <AgentCtiBar />

      <!-- 工具图标 -->
      <div class="tools">
        <div class="tool"><BellOutlined :style="{ fontSize: '16px', color: '#6B7280' }" /></div>
        <div class="tool"><QuestionCircleOutlined :style="{ fontSize: '16px', color: '#6B7280' }" /></div>
        <div class="tool"><GlobalOutlined :style="{ fontSize: '16px', color: '#6B7280' }" /></div>
      </div>

      <!-- 用户区 -->
      <a-dropdown placement="bottomRight">
        <div class="user" :class="{ 'has-tenant-switch': tenant.showTenantSwitcher }">
          <span class="user-av">{{ user.name.charAt(0) }}</span>
          <div class="user-meta">
            <div class="user-name">{{ user.name }}</div>
            <div class="user-role" :title="userSubtitle">{{ userSubtitle }}</div>
          </div>
          <DownOutlined :style="{ fontSize: '14px', color: '#9CA3AF' }" />
        </div>
        <template #overlay>
          <div class="user-dropdown-panel">
            <a-menu class="user-dropdown-menu" @click="onMenuClick">
              <a-menu-item key="profile">个人设置</a-menu-item>
            <a-sub-menu v-if="tenant.showTenantSwitcher" key="tenant" title="切换租户">
              <a-menu-item
                v-for="t in tenant.tenantList"
                :key="`tenant:${t.id}`"
                :disabled="!t.selectable"
              >
                <span class="tenant-item">
                  <span class="tenant-dot" :style="{ background: t.color }"></span>
                  <span class="tenant-name">{{ t.name }}</span>
                  <span v-if="!t.selectable" class="tenant-tag">{{ tenantStatusLabel(t.status) }}</span>
                  <CheckOutlined v-else-if="t.id === tenant.currentTenantId" class="tenant-check" />
                </span>
              </a-menu-item>
            </a-sub-menu>
            <a-sub-menu v-if="roleOptionGroups.length" key="role" title="切换演示角色">
              <template v-for="group in roleOptionGroups" :key="group.label">
                <a-menu-item-group :title="group.label">
                  <a-menu-item v-for="r in group.options" :key="r.value">
                    {{ r.label }}
                  </a-menu-item>
                </a-menu-item-group>
              </template>
            </a-sub-menu>
            <a-menu-item v-if="user.hasAdminEntry" key="admin">管理后台</a-menu-item>
            <a-menu-divider />
            <a-menu-item key="logout">退出登录</a-menu-item>
            </a-menu>
          </div>
        </template>
      </a-dropdown>
    </div>
  </header>
</template>

<style scoped>
.app-header {
  display: flex;
  align-items: stretch;
  height: 72px;
  background: #fff;
  border-bottom: 1px solid #e5e7eb;
}

/* Logo 区 */
.logo-area {
  width: var(--flowos-sider-width);
  flex: none;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 20px;
  border-right: 1px solid #e5e7eb;
}
.logo-icon {
  width: 36px;
  height: 36px;
  object-fit: contain;
  flex: none;
}
.logo-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  line-height: 1.1;
}
.logo-title {
  font-size: 16px;
  font-weight: 800;
  color: #111827;
  letter-spacing: -0.16px;
}
.logo-sub {
  font-size: 10px;
  color: #9ca3af;
}

.header-main {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 16px 0 8px;
}

.toggle {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  cursor: pointer;
}
.toggle:hover {
  background: #f3f4f6;
}

.tools {
  display: flex;
  align-items: center;
  gap: 2px;
  flex: none;
}
.tool {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  cursor: pointer;
}
.tool:hover {
  background: #f3f4f6;
}

.user {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 4px 12px 4px 4px;
  border-radius: 10px;
  cursor: pointer;
  flex: none;
  max-width: 200px;
}
.user:hover {
  background: #f9fafb;
}
.user-av {
  width: 36px;
  height: 36px;
  flex: none;
  border-radius: 18px;
  background: #1a6fff;
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
}
.user-meta {
  display: flex;
  flex-direction: column;
  line-height: 1.2;
  min-width: 0;
}
.user-name {
  font-size: 12px;
  font-weight: 600;
  color: #111827;
}
.user-role {
  font-size: 10px;
  color: #9ca3af;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 148px;
}

/* 「切换租户」子菜单项内的行布局（与「切换演示角色」同为 a-sub-menu，风格统一） */
.tenant-item {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 140px;
}
.tenant-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex: none;
}
.tenant-name {
  flex: 1;
  font-size: 13px;
  color: #374151;
}
.tenant-tag {
  font-size: 10px;
  color: #9ca3af;
  background: #f3f4f6;
  padding: 1px 6px;
  border-radius: 4px;
}
.tenant-check {
  color: #1a6fff;
  font-size: 12px;
}
</style>

<style>
.user-dropdown-panel {
  min-width: 168px;
  background: #fff;
  border-radius: 8px;
  box-shadow:
    0 6px 16px 0 rgba(0, 0, 0, 0.08),
    0 3px 6px -4px rgba(0, 0, 0, 0.12);
}
.user-dropdown-menu.ant-dropdown-menu {
  min-width: 168px;
  box-shadow: none;
  border-radius: 0 0 8px 8px;
}
</style>
