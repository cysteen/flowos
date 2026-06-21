<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router';
import { message } from 'ant-design-vue';
import {
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  BellOutlined,
  QuestionCircleOutlined,
  GlobalOutlined,
  DownOutlined,
} from '@ant-design/icons-vue';
import AgentCtiBar from './AgentCtiBar.vue';
import { useUserStore } from '@/stores/user';
import { useAdminTabsStore } from '@/stores/adminTabs';
import { useWorkspaceTabsStore } from '@/stores/workspaceTabs';
import { ROLE_OPTION_GROUPS, isRoleKey } from '@/config/roles';
import { firstMenuPath } from '@/config/navigation';

defineProps<{ collapsed: boolean }>();
const emit = defineEmits<{ toggle: [] }>();

const user = useUserStore();
const route = useRoute();
const router = useRouter();

const logoUrl = import.meta.env.BASE_URL + 'logo.png';

function onMenuClick({ key }: { key: string | number }) {
  const k = String(key);
  if (isRoleKey(k)) {
    user.setRole(k);
    message.success(`已切换为「${user.role.name}」`);
    if (route.path.startsWith('/admin') && !user.hasAdminEntry) {
      router.push(firstMenuPath(user.visibleMenus));
    } else if (route.meta.menu && !user.canAccess(route.meta.menu as string)) {
      router.push(firstMenuPath(user.visibleMenus));
    }
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
    profile: '打开「个人设置」（占位）',
  };
  message.info(map[k] ?? '');
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
        <div class="user">
          <span class="user-av">{{ user.name.charAt(0) }}</span>
          <div class="user-meta">
            <div class="user-name">{{ user.name }}</div>
            <div class="user-role">{{ user.role.name }}</div>
          </div>
          <DownOutlined :style="{ fontSize: '14px', color: '#9CA3AF' }" />
        </div>
        <template #overlay>
          <a-menu @click="onMenuClick">
            <a-menu-item key="profile">个人设置</a-menu-item>
            <a-sub-menu key="role" title="切换演示角色">
              <template v-for="group in ROLE_OPTION_GROUPS" :key="group.label">
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

.breadcrumb {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 8px;
}
.breadcrumb .sep {
  font-size: 12px;
  color: #d1d5db;
}
.breadcrumb .current {
  font-size: 13px;
  font-weight: 600;
  color: #111827;
}

.search {
  width: 260px;
  flex: none;
  height: 34px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  cursor: text;
}
.search-ph {
  font-size: 12px;
  color: #9ca3af;
}
.search-sp {
  flex: 1;
}
.kbd {
  font-size: 10px;
  color: #9ca3af;
  background: #f3f4f6;
  border: 1px solid #e5e7eb;
  border-radius: 3px;
  padding: 1px 6px;
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
}
.user-name {
  font-size: 12px;
  font-weight: 600;
  color: #111827;
}
.user-role {
  font-size: 10px;
  color: #9ca3af;
}
</style>
