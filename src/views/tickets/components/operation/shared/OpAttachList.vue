<script setup lang="ts">
import { PaperClipOutlined } from '@ant-design/icons-vue';

defineProps<{ files: string[] }>();
</script>

<template>
  <div v-if="files.length" class="attach-list">
    <span v-for="f in files" :key="f" class="attach">
      <PaperClipOutlined :style="{ fontSize: '13px', color: '#6B7280' }" />{{ f }}
    </span>
  </div>
</template>

<style scoped>
.attach-list { display: flex; gap: 8px; flex-wrap: wrap; }
.attach {
  display: inline-flex; align-items: center; gap: 6px;
  font-size: 12px; color: #374151; background: #f3f4f6;
  border-radius: 6px; padding: 6px 10px;
}
</style>
