<script setup lang="ts">
withDefaults(
  defineProps<{
    title?: string;
    /** 灰色副标题，如「投诉」工单专属字段 */
    subtitle?: string;
    compact?: boolean;
    bodyGap?: number;
  }>(),
  { bodyGap: 10 },
);
</script>

<template>
  <section class="part-card" :class="{ compact }">
    <div v-if="title" class="part-head">
      <i class="part-bar" />
      <span class="part-title">{{ title }}</span>
    </div>
    <div v-else-if="subtitle" class="part-subhead">
      <i class="part-bar" />
      <span class="part-subtitle">{{ subtitle }}</span>
    </div>
    <div class="part-body" :style="{ gap: `${bodyGap}px` }">
      <slot />
    </div>
  </section>
</template>

<style scoped>
.part-card {
  background: #fafbfc;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.part-card.compact {
  padding: 10px 14px;
  gap: 0;
}
.part-head,
.part-subhead {
  display: flex;
  align-items: center;
  gap: 8px;
}
.part-bar {
  display: inline-block;
  width: 3px;
  height: 13px;
  background: #1a6fff;
  border-radius: 2px;
  flex: none;
}
.part-title {
  font-size: 13px;
  font-weight: 600;
  color: #374151;
}
.part-subtitle {
  font-size: 12px;
  font-weight: 600;
  color: #6b7280;
}
.part-body {
  display: flex;
  flex-direction: column;
}
</style>
