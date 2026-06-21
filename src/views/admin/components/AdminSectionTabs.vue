<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { AdminNavItem } from '@/config/adminNav';

const props = defineProps<{
  items: AdminNavItem[];
  activeKey: string;
}>();

const route = useRoute();
const router = useRouter();

const tabs = computed(() =>
  props.items.map((i) => ({ key: i.key, label: i.label })),
);

function onTabChange(key: string) {
  const path = `/admin/${key}`;
  if (route.path !== path) router.push(path);
}
</script>

<template>
  <div class="section-tabs">
    <a-tabs :active-key="activeKey" type="line" @change="onTabChange">
      <a-tab-pane v-for="t in tabs" :key="t.key" :tab="t.label" />
    </a-tabs>
  </div>
</template>

<style scoped>
.section-tabs {
  background: #fff;
  border-bottom: 1px solid #e5e7eb;
  padding: 0 24px;
}
.section-tabs :deep(.ant-tabs-nav) {
  margin-bottom: 0;
}
</style>
