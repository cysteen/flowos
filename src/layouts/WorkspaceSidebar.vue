<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useUserStore } from '@/stores/user';
import { NAV_ITEMS, type NavItem } from '@/config/navigation';

defineProps<{ collapsed: boolean }>();

const user = useUserStore();
const route = useRoute();
const router = useRouter();

const menuItems = computed(() => NAV_ITEMS.filter((n) => user.visibleMenus.includes(n.key)));

function isActive(key: string) {
  return route.meta.menu === key;
}

function go(item: NavItem) {
  // 已在模块根路径：无需重复跳转
  if (route.path === item.path) return;
  router.push(item.path).catch(() => {
    // 懒加载 chunk 失败时兜底整页跳转（对齐 router.onError 自愈逻辑）
    const base = import.meta.env.BASE_URL.replace(/\/$/, '');
    window.location.assign(`${base}${item.path}`);
  });
}
</script>

<template>
  <div class="sidebar" :class="{ collapsed }">
    <div
      v-for="item in menuItems"
      :key="item.key"
      class="nav-item"
      :class="{ active: isActive(item.key) }"
      :title="collapsed ? item.label : ''"
      @click="go(item)"
    >
      <component :is="item.icon" class="nav-icon" />
      <span v-if="!collapsed" class="nav-label">{{ item.label }}</span>
    </div>
  </div>
</template>

<style scoped>
.sidebar {
  padding: 12px 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  height: 100%;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  border-left: 3px solid transparent;
  cursor: pointer;
  color: #374151;
  user-select: none;
}
.nav-item:hover {
  background: #f9fafb;
}
.nav-icon {
  font-size: 16px;
  color: #6b7280;
  flex: none;
  pointer-events: none;
}
.nav-label {
  font-size: 14px;
  font-weight: 500;
  white-space: nowrap;
  pointer-events: none;
}

.nav-item.active {
  background: #eff6ff;
  border-left-color: #1a6fff;
}
.nav-item.active .nav-icon {
  color: #1a6fff;
}
.nav-item.active .nav-label {
  color: #1a6fff;
  font-weight: 600;
}

.sidebar.collapsed .nav-item {
  justify-content: center;
  padding: 10px 0;
}
</style>
