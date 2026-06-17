<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { message } from 'ant-design-vue';
import {
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  SearchOutlined,
  BellOutlined,
  QuestionCircleOutlined,
  GlobalOutlined,
  DownOutlined,
  UserOutlined,
} from '@ant-design/icons-vue';
import { useUserStore } from '@/stores/user';
import { ROLE_OPTIONS, type RoleKey } from '@/config/roles';
import { NAV_ITEMS } from '@/config/navigation';

defineProps<{ collapsed: boolean }>();
const emit = defineEmits<{ toggle: [] }>();

const user = useUserStore();
const route = useRoute();

// 面包屑当前页标题
const currentTitle = computed(() => {
  const item = NAV_ITEMS.find((n) => n.key === route.meta.menu);
  return item?.label ?? '';
});

function onSwitchRole(value: unknown) {
  user.setRole(value as RoleKey);
}

function onUserMenuClick({ key }: { key: string | number }) {
  const map: Record<string, string> = {
    profile: '打开「个人设置」（占位）',
    admin: '进入「管理后台」（后续 Phase）',
    logout: '退出登录（占位）',
  };
  message.info(map[String(key)] ?? '');
}
</script>

<template>
  <a-layout-header class="app-header">
    <div class="app-header__left">
      <div class="app-header__logo">iFLY<span class="dot">.</span>FlowOS</div>
      <a-button type="text" class="collapse-btn" @click="emit('toggle')">
        <MenuUnfoldOutlined v-if="collapsed" />
        <MenuFoldOutlined v-else />
      </a-button>
      <a-breadcrumb class="app-header__crumb">
        <a-breadcrumb-item>运行工作区</a-breadcrumb-item>
        <a-breadcrumb-item>{{ currentTitle }}</a-breadcrumb-item>
      </a-breadcrumb>
    </div>

    <div class="app-header__right">
      <a-input class="global-search" placeholder="搜索工单 / 客户 / 关键词" allow-clear>
        <template #prefix><SearchOutlined style="color: #9ca3af" /></template>
        <template #suffix><span class="kbd">⌘K</span></template>
      </a-input>

      <a-tooltip title="Dev：切换演示角色，验证菜单裁剪与路由守卫">
        <a-select
          :value="user.roleKey"
          :options="ROLE_OPTIONS"
          size="small"
          class="role-switch"
          @change="onSwitchRole"
        />
      </a-tooltip>

      <a-space :size="4" class="header-icons">
        <a-button type="text" shape="circle"><BellOutlined /></a-button>
        <a-button type="text" shape="circle"><QuestionCircleOutlined /></a-button>
        <a-button type="text" shape="circle"><GlobalOutlined /></a-button>
      </a-space>

      <a-dropdown placement="bottomRight">
        <div class="user-area">
          <a-avatar :size="32" style="background: #1a6fff; flex: none">
            <template #icon><UserOutlined /></template>
          </a-avatar>
          <div class="user-meta">
            <div class="user-name">{{ user.name }}</div>
            <div class="user-role">{{ user.role.name }}</div>
          </div>
          <DownOutlined class="user-caret" />
        </div>
        <template #overlay>
          <a-menu @click="onUserMenuClick">
            <a-menu-item key="profile">个人设置</a-menu-item>
            <a-menu-item v-if="user.hasAdminEntry" key="admin">管理后台</a-menu-item>
            <a-menu-divider />
            <a-menu-item key="logout">退出登录</a-menu-item>
          </a-menu>
        </template>
      </a-dropdown>
    </div>
  </a-layout-header>
</template>

<style scoped>
.app-header {
  height: 56px;
  line-height: 56px;
  padding: 0 16px 0 0;
  background: #fff;
  border-bottom: 1px solid #f0f0f0;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.app-header__left {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.app-header__logo {
  width: 200px;
  padding-left: 24px;
  font-size: 18px;
  font-weight: 700;
  color: #1a6fff;
  letter-spacing: 0.2px;
}

.app-header__logo .dot {
  color: #0f4fcc;
}

.collapse-btn {
  font-size: 16px;
  color: #6b7280;
}

.app-header__crumb {
  margin-left: 4px;
}

.app-header__right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.global-search {
  width: 260px;
}

.kbd {
  display: inline-block;
  padding: 0 6px;
  font-size: 12px;
  color: #9ca3af;
  background: #f3f4f6;
  border-radius: 4px;
  line-height: 18px;
}

.role-switch {
  width: 132px;
}

.header-icons :deep(.ant-btn) {
  color: #6b7280;
}

.user-area {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 56px;
  padding-left: 8px;
  cursor: pointer;
}

.user-meta {
  display: flex;
  flex-direction: column;
  line-height: 1.2;
}

.user-name {
  font-size: 13px;
  font-weight: 600;
  color: #1f2937;
}

.user-role {
  font-size: 12px;
  color: #6b7280;
}

.user-caret {
  font-size: 12px;
  color: #9ca3af;
}
</style>
