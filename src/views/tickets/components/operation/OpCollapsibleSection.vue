<script setup lang="ts">
import { computed } from 'vue';
import { UpOutlined, DownOutlined } from '@ant-design/icons-vue';

const props = withDefaults(defineProps<{
  title: string;
  icon?: unknown;
  expanded?: boolean;
  badge?: string;
  badgeVariant?: 'required' | 'hint' | 'count' | 'warn';
  splitHead?: boolean;
  bodyVariant?: 'default' | 'risk';
}>(), {
  expanded: true,
  badgeVariant: 'required',
  splitHead: false,
  bodyVariant: 'default',
});

const emit = defineEmits<{ toggle: [] }>();

const badgeClass = computed(() => ({
  required: 'badge-req',
  hint: 'badge-hint',
  count: 'badge-count',
  warn: 'badge-warn',
}[props.badgeVariant]));
</script>

<template>
  <div class="collapsible">
    <div class="coll-head" :class="{ 'is-collapsed': !expanded, 'split-head': splitHead }" @click="emit('toggle')">
      <div class="coll-title-group">
        <component :is="icon" v-if="icon" class="coll-icon" />
        <span class="coll-title">{{ title }}</span>
        <span v-if="badge" class="coll-badge" :class="badgeClass">{{ badge }}</span>
      </div>
      <div v-if="splitHead" class="coll-head-extra" @click.stop>
        <slot name="head-extra" />
      </div>
      <template v-else>
        <slot name="head-extra" />
      </template>
      <component :is="expanded ? UpOutlined : DownOutlined" class="chevron" />
    </div>
    <div v-show="expanded" class="coll-body" :class="`body-${bodyVariant}`">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.collapsible { display: flex; flex-direction: column; }
.coll-head {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 10px 14px; background: #fff; border: 1px solid #e5e7eb;
  border-radius: 8px 8px 0 0; cursor: pointer; user-select: none;
}
.coll-head.is-collapsed { border-radius: 8px; border-bottom: 1px solid #e5e7eb; }
.coll-head.split-head { flex-wrap: nowrap; }
.coll-title-group {
  display: flex; align-items: center; gap: 10px; flex: none;
}
.coll-head-extra {
  flex: 1; min-width: 0; display: flex; align-items: center;
  overflow-x: auto;
}
.coll-icon { color: #6b7280; font-size: 16px; }
.coll-title { font-size: 13px; font-weight: 600; color: #374151; white-space: nowrap; }
.coll-badge {
  font-size: 10px; font-weight: 600; padding: 2px 8px; border-radius: 4px; flex: none;
}
.badge-req { color: #dc2626; background: #fef2f2; border: 1px solid #fecaca; }
.badge-hint { color: #7c3aed; background: #f5f3ff; border: 1px solid #ddd6fe; }
.badge-count { color: #1a6fff; background: #eff6ff; border: 1px solid #bfdbfe; }
.badge-warn { color: #b45309; background: #fef3c7; border: 1px solid #fde68a; }
.chevron { color: #9ca3af; font-size: 16px; flex: none; margin-left: auto; }
.coll-body {
  padding: 12px 14px 14px; background: #f8fafc;
  border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;
  display: flex; flex-direction: column; gap: 12px;
  overflow: visible;
}
.body-risk {
  background: #fff7ed;
  border-color: #fed7aa;
}
</style>
