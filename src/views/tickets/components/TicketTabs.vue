<script setup lang="ts">
import { computed } from 'vue';
import { TABS, type WorkbenchTabKey } from '@/views/tickets/types/ticket';
import WorkspaceTaskTabs from '@/components/workspace/WorkspaceTaskTabs.vue';

const props = defineProps<{
  active: WorkbenchTabKey;
  counts: Record<string, number>;
  hiddenTabs: string[];
}>();
const emit = defineEmits<{ change: [tab: WorkbenchTabKey] }>();
const visibleTabs = computed(() => TABS.filter((tab) => !props.hiddenTabs.includes(tab.key)));
</script>

<template>
  <WorkspaceTaskTabs :active="active" :tabs="visibleTabs" :counts="counts" @change="emit('change', $event as WorkbenchTabKey)" />
</template>
