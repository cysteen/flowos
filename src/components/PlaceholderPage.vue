<script setup lang="ts">
import type { Component } from 'vue';

withDefaults(
  defineProps<{
    title: string;
    description?: string;
    icon?: Component;
    /** 角标文案，如 "Prompt 2 实现" */
    badge?: string;
  }>(),
  {
    description: '',
    badge: '本期占位',
  }
);
</script>

<template>
  <div class="placeholder-page">
    <a-card :bordered="false" class="placeholder-card">
      <div class="placeholder-icon">
        <component :is="icon" v-if="icon" />
      </div>
      <div class="placeholder-title-row">
        <h2 class="placeholder-title">{{ title }}</h2>
        <a-tag color="processing" class="placeholder-badge">{{ badge }}</a-tag>
      </div>
      <p v-if="description" class="placeholder-desc">{{ description }}</p>
      <div class="placeholder-extra">
        <slot />
      </div>
    </a-card>
  </div>
</template>

<style scoped>
.placeholder-page {
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding-top: 64px;
  min-height: 100%;
}

.placeholder-card {
  width: 560px;
  max-width: 100%;
  text-align: center;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.04);
  border: 1px solid #f0f0f0;
}

.placeholder-icon {
  font-size: 48px;
  color: #1a6fff;
  margin-bottom: 16px;
}

.placeholder-title-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.placeholder-title {
  font-size: 20px;
  font-weight: 600;
  color: #1f2937;
}

.placeholder-badge {
  margin: 0;
}

.placeholder-desc {
  margin-top: 12px;
  color: #6b7280;
  line-height: 1.7;
}

.placeholder-extra {
  margin-top: 20px;
}
</style>
