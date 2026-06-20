<script setup lang="ts">
import { ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { SIDER_COLLAPSED_WIDTH, SIDER_WIDTH } from '@/config/layout';
import AppHeader from './AppHeader.vue';
import WorkspaceSidebar from './WorkspaceSidebar.vue';
import WorkspacePageTabs from './WorkspacePageTabs.vue';
import { useWorkspaceTabsStore } from '@/stores/workspaceTabs';

const route = useRoute();
const tabsStore = useWorkspaceTabsStore();

// 侧栏折叠状态（§0.3 定稿：实现折叠）
const collapsed = ref(false);

function toggleCollapsed() {
  collapsed.value = !collapsed.value;
}

watch(
  () => route.path,
  (path) => {
    tabsStore.syncFromRoute(path, route.meta.title as string | undefined);
  },
  { immediate: true },
);
</script>

<template>
  <a-layout class="workspace-shell">
    <AppHeader :collapsed="collapsed" @toggle="toggleCollapsed" />
    <a-layout class="workspace-body">
      <!-- 须用 a-layout-sider，否则 ant-layout 默认纵向堆叠，侧栏与内容区会错乱 -->
      <a-layout-sider
        v-model:collapsed="collapsed"
        :width="SIDER_WIDTH"
        :collapsed-width="SIDER_COLLAPSED_WIDTH"
        :trigger="null"
        theme="light"
        class="workspace-sider"
      >
        <WorkspaceSidebar :collapsed="collapsed" />
      </a-layout-sider>
      <a-layout-content class="workspace-content">
        <WorkspacePageTabs />
        <div class="workspace-page-body">
          <router-view v-slot="{ Component, route: r }">
            <keep-alive :max="12">
              <component :is="Component" v-if="Component" :key="r.fullPath" />
            </keep-alive>
          </router-view>
        </div>
      </a-layout-content>
    </a-layout>
  </a-layout>
</template>

<style scoped>
.workspace-shell {
  height: 100vh;
}

.workspace-body {
  flex: 1;
  min-height: 0;
  min-width: 0;
}

.workspace-content {
  flex: 1;
  min-width: 0;
  background: var(--flowos-content-bg, #f9fafb);
  padding: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.workspace-page-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
}

:deep(.workspace-sider) {
  background: #fff !important;
  border-right: 1px solid #e5e7eb;
}

:deep(.workspace-sider .ant-layout-sider-children) {
  height: 100%;
  overflow: auto;
}
</style>
