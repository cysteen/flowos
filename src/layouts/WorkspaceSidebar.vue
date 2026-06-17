<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useUserStore } from '@/stores/user';
import { NAV_ITEMS } from '@/config/navigation';

defineProps<{ collapsed: boolean }>();

const user = useUserStore();
const route = useRoute();
const router = useRouter();

// 按角色裁剪菜单（隐藏 ≠ 路由不存在，深链仍由守卫拦截）
const menuItems = computed(() => NAV_ITEMS.filter((n) => user.visibleMenus.includes(n.key)));

const selectedKeys = computed(() => {
  const menu = route.meta.menu;
  return menu ? [menu] : [];
});

function onClick({ key }: { key: string | number }) {
  const item = NAV_ITEMS.find((n) => n.key === key);
  if (item && route.path !== item.path) {
    router.push(item.path);
  }
}
</script>

<template>
  <a-layout-sider
    :collapsed="collapsed"
    :width="220"
    :collapsed-width="80"
    :trigger="null"
    theme="light"
    class="workspace-sider"
  >
    <a-menu
      mode="inline"
      :selected-keys="selectedKeys"
      :inline-collapsed="collapsed"
      class="workspace-menu"
      @click="onClick"
    >
      <a-menu-item v-for="item in menuItems" :key="item.key">
        <template #icon><component :is="item.icon" /></template>
        <span>{{ item.label }}</span>
      </a-menu-item>
    </a-menu>
  </a-layout-sider>
</template>

<style scoped>
.workspace-sider {
  background: #fff;
  border-right: 1px solid #f0f0f0;
}

.workspace-menu {
  border-inline-end: none !important;
  padding: 8px;
}

/* 未激活态：文字 #374151、图标 #6B7280（设计规范） */
.workspace-menu :deep(.ant-menu-item) {
  color: #374151;
  border-radius: 6px;
}

.workspace-menu :deep(.ant-menu-item .anticon) {
  color: #6b7280;
}

/* 激活态：浅底 #EFF6FF、文字主色 600、左边框 3px 主色 */
.workspace-menu :deep(.ant-menu-item-selected) {
  background: #eff6ff !important;
  color: #1a6fff !important;
  font-weight: 600;
  border-left: 3px solid #1a6fff;
  border-radius: 0 6px 6px 0;
}

.workspace-menu :deep(.ant-menu-item-selected .anticon) {
  color: #1a6fff;
}
</style>
