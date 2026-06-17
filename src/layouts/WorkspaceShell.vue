<script setup lang="ts">
import { ref } from 'vue';
import AppHeader from './AppHeader.vue';
import WorkspaceSidebar from './WorkspaceSidebar.vue';

// 侧栏折叠状态（§0.3 定稿：实现折叠）
const collapsed = ref(false);

function toggleCollapsed() {
  collapsed.value = !collapsed.value;
}
</script>

<template>
  <a-layout class="workspace-shell">
    <AppHeader :collapsed="collapsed" @toggle="toggleCollapsed" />
    <a-layout class="workspace-body">
      <WorkspaceSidebar :collapsed="collapsed" />
      <a-layout-content class="workspace-content">
        <router-view />
      </a-layout-content>
    </a-layout>
  </a-layout>
</template>

<style scoped>
.workspace-shell {
  height: 100vh;
}

.workspace-body {
  height: calc(100vh - 56px);
}

.workspace-content {
  background: var(--flowos-content-bg, #f9fafb);
  padding: 24px;
  overflow: auto;
}
</style>
