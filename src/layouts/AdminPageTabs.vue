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

function onTabKeydown(e: KeyboardEvent, key: string) {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    onTabClick(key);
  }
}

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
  <div v-if="tabsStore.tabs.length" ref="barRef" class="tabs-bar" id="pageTabs" role="tablist">
    <div
      v-for="tab in tabsStore.tabs"
      :key="tab.key"
      role="tab"
      tabindex="0"
      class="page-tab"
      :class="{ active: tabsStore.activeKey === tab.key }"
      :aria-selected="tabsStore.activeKey === tab.key"
      @click="onTabClick(tab.key)"
      @keydown="onTabKeydown($event, tab.key)"
    >
      <span class="page-tab-text">{{ tab.title }}</span>
      <span class="page-tab-close" role="button" tabindex="-1" @click="onClose($event, tab.key)">&times;</span>
    </div>
  </div>
</template>
