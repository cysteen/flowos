<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useWorkspaceTabsStore } from '@/stores/workspaceTabs';
import { UNIFIED_CREATE_PATH, unifiedCreateScene } from './composables/unifiedCreateEntry';
import UnifiedCreateForm from './components/unified-create/UnifiedCreateForm.vue';

defineOptions({ name: 'UnifiedCreateView' });

const tabs = useWorkspaceTabsStore();
/** 页签关掉后 keep-alive 里的实例还在：换 key 重建表单，下次打开是空白页 */
const session = ref(0);
const opened = computed(() => tabs.tabs.some((t) => t.key === UNIFIED_CREATE_PATH));
watch(opened, (now, before) => {
  if (!before || now) return;
  unifiedCreateScene.value = 'general';
  session.value += 1;
});
</script>

<template>
  <UnifiedCreateForm :key="`${session}-${unifiedCreateScene}`" :scene="unifiedCreateScene" />
</template>
