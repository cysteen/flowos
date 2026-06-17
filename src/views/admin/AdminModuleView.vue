<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import AdminListView from './components/AdminListView.vue';
import AdminCardGrid from './components/AdminCardGrid.vue';
import AdminPlaceholder from './AdminPlaceholder.vue';
import { ADMIN_MODULES } from '@/config/adminModules';

const route = useRoute();
const moduleKey = computed(() => route.path.split('/admin/')[1]?.split('/')[0] ?? '');
const config = computed(() => ADMIN_MODULES[moduleKey.value]);
const title = computed(() => (route.meta.title as string) ?? '');
</script>

<template>
  <AdminListView v-if="config?.type === 'list'" :key="moduleKey" :config="config" :title="title" />
  <AdminCardGrid v-else-if="config?.type === 'cards'" :key="moduleKey" :config="config" :title="title" />
  <AdminPlaceholder v-else />
</template>
