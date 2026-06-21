<script setup lang="ts">
// 标准页头（见 docs/admin-ui-spec.md §1）：标题 + 副标题 + 右侧主操作插槽。
defineProps<{ title: string; subtitle?: string }>();
</script>

<template>
  <div class="admin-page-header">
    <div class="aph-l">
      <h2 class="aph-title">{{ title }}</h2>
      <p v-if="subtitle" class="aph-sub">{{ subtitle }}</p>
    </div>
    <div class="aph-actions"><slot name="actions" /></div>
  </div>
</template>

<style scoped>
.admin-page-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 18px; }
.aph-title { font-size: 18px; font-weight: 700; color: #111827; margin: 0; }
.aph-sub { font-size: 13px; color: #6b7280; margin: 3px 0 0; }
.aph-actions { display: flex; gap: 10px; flex-shrink: 0; }
</style>
