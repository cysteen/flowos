<script setup lang="ts">
defineProps<{ active: string; tabs: readonly { key: string; label: string }[]; counts: Record<string, number> }>();
const emit = defineEmits<{ change: [key: string] }>();
</script>

<template>
  <div class="ticket-tabs">
    <div v-for="tab in tabs" :key="tab.key" class="tab" :class="{ active: tab.key === active }" @click="emit('change', tab.key)">
      <span class="tab-label">{{ tab.label }}</span>
      <span class="tab-badge" :style="tab.key === active ? { background: '#1A6FFF', color: '#FFFFFF' } : { background: '#F3F4F6', color: '#6B7280' }">{{ counts[tab.key] ?? 0 }}</span>
    </div>
  </div>
</template>

<style scoped>
.ticket-tabs{display:flex;gap:4px;padding:0 16px}.tab{display:flex;align-items:center;gap:6px;padding:12px 14px;cursor:pointer;border-bottom:2px solid transparent}.tab-label{font-size:14px;color:#6b7280}.tab.active{border-bottom-color:#1a6fff}.tab.active .tab-label{color:#1a6fff;font-weight:600}.tab-badge{font-size:11px;font-weight:600;padding:1px 7px;border-radius:9px;line-height:16px}
</style>
