<script setup lang="ts">
import AppHeader from './AppHeader.vue';
import AdminSidebar from './AdminSidebar.vue';

function noop() {}
</script>

<template>
  <a-layout class="admin-shell">
    <AppHeader :collapsed="false" @toggle="noop" />
    <a-layout class="admin-body">
      <!-- 须用 a-layout-sider，否则侧栏与内容区纵向堆叠 -->
      <a-layout-sider
        :width="240"
        :collapsible="false"
        theme="light"
        class="admin-sider"
      >
        <AdminSidebar />
      </a-layout-sider>
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
  flex: 1;
  min-height: 0;
  min-width: 0;
}

.admin-content {
  flex: 1;
  min-width: 0;
  background: #f9fafb;
  padding: 0;
  overflow: auto;
}

:deep(.admin-sider) {
  background: #f5f6f7 !important;
  border-right: 1px solid #e5e7eb;
}

:deep(.admin-sider .ant-layout-sider-children) {
  height: 100%;
  overflow: auto;
}
</style>
