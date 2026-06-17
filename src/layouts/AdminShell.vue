<script setup lang="ts">
import AppHeader from './AppHeader.vue';
import AdminSidebar from './AdminSidebar.vue';

// 管理后台外壳（AppShell）：复用统一顶栏 + 配置侧栏。
function noop() {}
</script>

<template>
  <a-layout class="admin-shell">
    <AppHeader :collapsed="false" @toggle="noop" />
    <a-layout class="admin-body">
      <AdminSidebar />
      <a-layout-content class="admin-content">
        <router-view />
      </a-layout-content>
    </a-layout>
  </a-layout>
</template>

<style scoped>
.admin-shell {
  height: 100vh;
}
.admin-body {
  height: calc(100vh - 56px);
}
.admin-content {
  background: #f9fafb;
  padding: 0;
  overflow: auto;
}
</style>
