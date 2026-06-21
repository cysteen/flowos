<script setup lang="ts">
import { watch } from 'vue';
import { useRoute } from 'vue-router';
import { SIDER_WIDTH } from '@/config/layout';
import AppHeader from './AppHeader.vue';
import AdminSidebar from './AdminSidebar.vue';
import AdminPageTabs from './AdminPageTabs.vue';
import { useAdminTabsStore } from '@/stores/adminTabs';

function noop() {}

const route = useRoute();
const tabsStore = useAdminTabsStore();

watch(
  () => route.path,
  (path) => {
    if (path.startsWith('/admin/') && path !== '/admin') {
      tabsStore.syncFromRoute(path, route.meta.title as string);
    }
  },
  { immediate: true },
);
</script>

<template>
  <a-layout class="admin-shell">
    <AppHeader :collapsed="false" @toggle="noop" />
    <a-layout class="admin-body">
      <!-- 须用 a-layout-sider，否则侧栏与内容区纵向堆叠 -->
      <a-layout-sider
        :width="SIDER_WIDTH"
        :collapsible="false"
        theme="light"
        class="admin-sider"
      >
        <AdminSidebar />
      </a-layout-sider>
      <a-layout-content class="admin-content">
        <AdminPageTabs />
        <div class="admin-page-body">
          <router-view />
        </div>
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
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.admin-page-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
}

:deep(.admin-sider) {
  background: #fff !important;
  border-right: 1px solid #e5e7eb;
}

:deep(.admin-sider .ant-layout-sider-children) {
  height: 100%;
  overflow: auto;
}
</style>
