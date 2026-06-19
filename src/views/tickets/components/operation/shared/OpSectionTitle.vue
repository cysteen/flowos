<script setup lang="ts">
defineProps<{ title: string; count?: number }>();
</script>

<template>
  <div class="section-title">
    <i class="bar" />
    <span>{{ count != null ? `${title} (${count})` : title }}</span>
  </div>
</template>

<style scoped>
.section-title {
  display: flex; align-items: center; gap: 8px;
  font-size: 13px; font-weight: 600; color: #374151;
}
.bar {
  display: inline-block; width: 3px; height: 13px;
  background: #1a6fff; border-radius: 2px; flex: none;
}
</style>
