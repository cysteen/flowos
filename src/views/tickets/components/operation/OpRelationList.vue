<script setup lang="ts">
import type { TicketRelation } from '@/views/tickets/composables/ticketRelations';

/**
 * 关联关系清单（头部芯片浮层 / 右栏卡片共用一套渲染）。
 * 每条带**类型与方向**（Jira typed link 口径），可点直达；售后单是外部系统，走深链。
 */
defineProps<{
  relations: TicketRelation[];
  /** 紧凑模式：头部浮层用，去掉卡片内边距 */
  compact?: boolean;
}>();

const emit = defineEmits<{ open: [rel: TicketRelation] }>();
</script>

<template>
  <div class="rel-list" :class="{ compact }">
    <button
      v-for="r in relations"
      :key="`${r.kind}-${r.no}`"
      type="button"
      class="rel-item"
      @click="emit('open', r)"
    >
      <span class="rel-arrow" :class="`k-${r.kind}`">{{ r.arrow }}</span>
      <span class="rel-body">
        <span class="rel-line1">
          <span class="rel-label">{{ r.label }}</span>
          <span class="rel-no">{{ r.no }}</span>
          <span v-if="r.href" class="rel-ext">售后系统</span>
        </span>
        <span v-if="r.title || r.status" class="rel-line2">
          <span v-if="r.status" class="rel-status">{{ r.status }}</span>
          <span v-if="r.title" class="rel-title">{{ r.title }}</span>
        </span>
      </span>
    </button>
  </div>
</template>

<style scoped>
.rel-list { display: flex; flex-direction: column; gap: 4px; }
.rel-item {
  display: flex; align-items: flex-start; gap: 8px;
  width: 100%; padding: 6px 8px;
  border: none; border-radius: 6px; background: transparent;
  text-align: left; cursor: pointer; font-family: inherit;
}
.rel-item:hover { background: #f3f4f6; }
.rel-arrow {
  flex: none;
  display: inline-flex; align-items: center; justify-content: center;
  width: 20px; height: 20px; border-radius: 5px;
  font-size: 12px; font-weight: 700; color: #6b7280; background: #f3f4f6;
}
.rel-arrow.k-escalatedTo { color: #b45309; background: #fff7ed; }
.rel-arrow.k-escalatedFrom { color: #7c3aed; background: #f5f3ff; }
.rel-arrow.k-aftersale { color: #0e7490; background: #ecfeff; }
.rel-arrow.k-child { color: #1a6fff; background: #eff6ff; }
.rel-arrow.k-reopen { color: #dc2626; background: #fef2f2; }
.rel-arrow.k-following { color: #059669; background: #ecfdf5; }
.rel-body { min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.rel-line1 { display: flex; align-items: center; gap: 6px; min-width: 0; }
.rel-label { flex: none; font-size: 12px; color: #6b7280; }
.rel-no { font-size: 12px; font-weight: 600; color: #1a6fff; font-family: ui-monospace, monospace; }
.rel-ext {
  flex: none; font-size: 10px; line-height: 15px; padding: 0 4px;
  border-radius: 3px; color: #0e7490; background: #ecfeff;
}
.rel-line2 { display: flex; align-items: center; gap: 6px; min-width: 0; font-size: 11px; color: #9ca3af; }
.rel-status { flex: none; color: #6b7280; }
.rel-title { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.compact .rel-item { padding: 5px 6px; }
</style>
