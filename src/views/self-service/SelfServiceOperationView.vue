<script setup lang="ts">
import { ref } from 'vue';
import { useRoute } from 'vue-router';
import BusinessRegistrationEditor from '@/views/tickets/components/business/BusinessRegistrationEditor.vue';
import { useSelfServiceLeaveGuard } from './useSelfServiceLeaveGuard';

defineOptions({ name: 'SelfServiceOperationView' });
const route = useRoute();
// Workspace instances are cached by full path. Each instance owns its original record.
const ticketNo = String(route.params.ticketNo ?? '');
const dirty = ref(false);
const editor = ref<InstanceType<typeof BusinessRegistrationEditor>>();
useSelfServiceLeaveGuard(dirty, () => editor.value?.reset());
</script>

<template>
  <div class="self-service-editor-page">
    <BusinessRegistrationEditor ref="editor" :key="ticketNo" :ticket-no="ticketNo" @dirty-change="dirty = $event" />
  </div>
</template>

<style scoped>
.self-service-editor-page{height:100%;min-height:0;display:flex;flex-direction:column}
</style>
