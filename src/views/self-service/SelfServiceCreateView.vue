<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useWorkspaceTabsStore } from '@/stores/workspaceTabs';
import BusinessRegistrationEditor from '@/views/tickets/components/business/BusinessRegistrationEditor.vue';
import { WIRELESS_REGISTRATION_TEMPLATE_ID } from '@/views/tickets/types/businessRegistration';
import { useSelfServiceLeaveGuard } from './useSelfServiceLeaveGuard';

defineOptions({ name: 'SelfServiceCreateView' });
const tabs = useWorkspaceTabsStore();
const dirty = ref(false);
const editor = ref<InstanceType<typeof BusinessRegistrationEditor>>();
const session = ref(0);
const opened = computed(() => tabs.tabs.some((tab) => tab.path === '/self-service/new'));
watch(opened, (now, before) => { if (before && !now && !dirty.value) session.value += 1; });
useSelfServiceLeaveGuard(dirty, () => editor.value?.reset());
</script>

<template>
  <div class="self-service-editor-page">
    <BusinessRegistrationEditor ref="editor" :key="session" :template-id="WIRELESS_REGISTRATION_TEMPLATE_ID" @dirty-change="dirty = $event" />
  </div>
</template>

<style scoped>
.self-service-editor-page{height:100%;min-height:0;display:flex;flex-direction:column}
</style>
