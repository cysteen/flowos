<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useUserStore } from '@/stores/user';
import { NAV_ITEMS } from '@/config/navigation';

const props = defineProps<{ collapsed: boolean }>();

const user = useUserStore();
const route = useRoute();
const router = useRouter();

const menuItems = computed(() => NAV_ITEMS.filter((n) => user.visibleMenus.includes(n.key)));

function isActive(key: string) {
  return route.meta.menu === key;
}
function go(path: string) {
  if (route.path !== path) router.push(path);
}
</script>

<template>
  <aside class="sidebar" :class="{ collapsed }">
    <div
      v-for="item in menuItems"
      :key="item.key"
      class="nav-item"
      :class="{ active: isActive(item.key) }"
      :title="collapsed ? item.label : ''"
      @click="go(item.path)"
    >
      <component :is="item.icon" class="nav-icon" />
      <span v-if="!collapsed" class="nav-label">{{ item.label }}</span>
    </div>
  </aside>
</template>

<style scoped>
.sidebar {
  width: 220px;
  flex: none;
  background: #fff;
  border-right: 1px solid #e5e7eb;
  padding: 12px 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  transition: width 0.18s ease;
}
.sidebar.collapsed {
  width: 64px;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  border-left: 3px solid transparent;
  cursor: pointer;
  color: #374151;
}
.nav-item:hover {
  background: #f9fafb;
}
.nav-icon {
  font-size: 16px;
  color: #6b7280;
  flex: none;
}
.nav-label {
  font-size: 14px;
  font-weight: 500;
  white-space: nowrap;
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
