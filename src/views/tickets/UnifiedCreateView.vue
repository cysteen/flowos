<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useCreateWorkItemsStore } from '@/stores/createWorkItems';
import { useWorkspaceTabsStore } from '@/stores/workspaceTabs';
import { workTitle, workPath } from './types/createWork';
import UnifiedCreateForm from './components/unified-create/UnifiedCreateForm.vue';

defineOptions({ name: 'UnifiedCreateView' });
const route = useRoute();
const router = useRouter();
// Capture identity at mount: a cached instance must never follow a different active route.
const workId = String(route.params.workId || '');
const works = useCreateWorkItemsStore();
const item = computed(() => works.get(workId));
if (item.value) useWorkspaceTabsStore().updateTitle(workPath(workId), workTitle(item.value.context));
</script>
<template>
  <UnifiedCreateForm v-if="item" :key="item.id" :item="item" />
  <a-result v-else title="该办理事项已关闭或无权访问"><template #extra><a-button @click="router.push('/tickets')">返回工作台</a-button></template></a-result>
</template>
