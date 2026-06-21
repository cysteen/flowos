<script setup lang="ts">
import { ref, watch, nextTick } from 'vue';
import { useAdminTabsStore } from '@/stores/adminTabs';

const tabsStore = useAdminTabsStore();
const barRef = ref<HTMLElement>();

function onTabClick(key: string) {
  tabsStore.activate(key);
}

function onClose(e: Event, key: string) {
  e.stopPropagation();
  tabsStore.close(key);
}

// 激活页签变化时，自动将其滚动进可视区（页签较多时无需手动查找）
watch(
  () => tabsStore.activeKey,
  async () => {
    await nextTick();
    const el = barRef.value?.querySelector('.page-tab.active') as HTMLElement | null;
    el?.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' });
  },
);
</script>

<template>
  <div v-if="tabsStore.tabs.length" ref="barRef" class="tabs-bar" id="pageTabs">
    <button
      v-for="tab in tabsStore.tabs"
      :key="tab.key"
      type="button"
      class="page-tab"
      :class="{ active: tabsStore.activeKey === tab.key }"
      @click="onTabClick(tab.key)"
    >
      <span class="page-tab-text">{{ tab.title }}</span>
      <span class="page-tab-close" @click="onClose($event, tab.key)">&times;</span>
    </button>
  </div>
</template>

<style scoped>
.tabs-bar {
  height: 40px;
  background: #f4f6fa;
  border-bottom: 1px solid #e5e7eb;
  display: flex;
  align-items: center;
  padding: 0 16px;
  gap: 4px;
  overflow-x: auto;
  flex-shrink: 0;
}

.page-tab {
  width: 160px;
  padding: 6px 8px 6px 12px;
  border-radius: 6px 6px 0 0;
  font-size: 13px;
  cursor: pointer;
  color: #111827;
  border: none;
  background: #fff;
  display: flex;
  align-items: center;
  justify-content: space-between;
  transition: all 0.15s;
  font-weight: 500;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
  flex-shrink: 0;
  font-family: inherit;
}
.page-tab:hover {
  background: #f9fafb;
  color: #111827;
}
.page-tab.active {
  background: #1a6fff;
  color: #fff;
  box-shadow: 0 -2px 0 #1a6fff inset, 0 2px 4px rgba(26, 111, 255, 0.2);
  margin-bottom: -1px;
  font-weight: 600;
}
.page-tab-text {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
  margin-right: 6px;
  text-align: center;
  letter-spacing: 1px;
}
.page-tab-close {
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0.5;
  font-size: 16px;
  line-height: 1;
  flex-shrink: 0;
  border-radius: 4px;
  transition: all 0.15s;
}
.page-tab-close:hover {
  opacity: 1;
  background: rgba(0, 0, 0, 0.1);
}
.page-tab.active .page-tab-close {
  opacity: 0.8;
}
.page-tab.active .page-tab-close:hover {
  background: rgba(255, 255, 255, 0.2);
}
</style>
