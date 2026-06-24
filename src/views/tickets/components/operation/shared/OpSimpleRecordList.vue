<script setup lang="ts">
import OpAttachList from '../shared/OpAttachList.vue';
import { TICKET_EVENT_NOTIFY_THEME as T } from '@/views/tickets/styles/ticketEventNotifyTheme';
import type { SimpleRecord } from '@/views/tickets/types/operationTabs';

defineProps<{
  records: SimpleRecord[];
  showSupplementType?: boolean;
}>();
</script>

<template>
  <div class="simple-list">
    <div v-for="r in records" :key="r.id" class="simple-item">
      <p class="record-meta">
        <span
          v-if="showSupplementType && r.supplementType"
          class="category-tag"
        >{{ r.supplementType }}</span>
        <span class="record-who">{{ r.who }}</span>
        <span class="record-sep">·</span>
        <span class="record-when">{{ r.when }}</span>
      </p>

      <p class="record-body">{{ r.content }}</p>
      <OpAttachList v-if="r.attachments?.length" :files="r.attachments" />
    </div>
  </div>
</template>

<style scoped>
.simple-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.simple-item {
  background: v-bind('T.surface');
  border: 1px solid v-bind('T.border');
  border-radius: 8px;
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.record-meta {
  margin: 0;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
  font-size: 12px;
  line-height: 1.4;
  color: v-bind('T.text.meta');
}

.record-who {
  font-weight: 500;
  color: v-bind('T.text.body');
}

.record-sep {
  color: #d1d5db;
}

.record-when {
  font-variant-numeric: tabular-nums;
}

.category-tag {
  flex: none;
  margin-right: 4px;
  padding: 1px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
  color: v-bind('T.supplement.icon');
  background: v-bind('T.supplement.iconBg');
}

.record-body {
  margin: 0;
  font-size: 12px;
  line-height: 1.55;
  color: v-bind('T.text.body');
  word-break: break-word;
}
</style>
