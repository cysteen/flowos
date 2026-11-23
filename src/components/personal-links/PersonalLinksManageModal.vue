<script setup lang="ts">
import LinksManageModal from './LinksManageModal.vue';
import { usePersonalLinksStore } from '@/stores/personalLinks';
const open = defineModel<boolean>('open', { required: true });
const store = usePersonalLinksStore();
</script>
<template>
  <LinksManageModal v-model:open="open" :store="store" title="维护个人网址" subtitle="仅本人可见 · 最多 30 条" />
</template>