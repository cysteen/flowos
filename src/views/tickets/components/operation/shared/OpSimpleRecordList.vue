<script setup lang="ts">
import { CheckOutlined } from '@ant-design/icons-vue';
import OpAttachList from '../shared/OpAttachList.vue';
import { TICKET_EVENT_NOTIFY_THEME as T } from '@/views/tickets/styles/ticketEventNotifyTheme';
import type { SimpleRecord } from '@/views/tickets/types/operationTabs';

defineProps<{
  records: SimpleRecord[];
  showSupplementType?: boolean;
  /** 只读：唯一写动作「已知晓」（标记已读）不出；已知晓/已联系标签照常展示 */
  readonly?: boolean;
}>();

const emit = defineEmits<{
  'mark-read': [id: string];
}>();
</script>

<template>
  <div class="simple-list">
    <div v-for="r in records" :key="r.id" class="simple-item" :class="{ 'is-read': r.read }">
      <p class="record-meta">
        <span
          v-if="showSupplementType && r.supplementType"
          class="category-tag"
        >{{ r.supplementType }}</span>
        <span class="record-who">{{ r.who }}</span>
        <span class="record-sep">·</span>
        <span class="record-when">{{ r.when }}</span>
        <span class="record-read-slot">
          <span v-if="r.contacted" class="record-contact-tag">已联系</span>
          <span v-if="r.read" class="record-read-tag"><CheckOutlined /> 已知晓</span>
          <button
            v-else-if="!readonly"
            type="button"
            class="record-read-btn"
            @click="emit('mark-read', r.id)"
          >已知晓</button>
        </span>
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

/* 已知晓 / 已联系：靠右并排 */
.record-read-slot {
  margin-left: auto;
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.record-contact-tag {
  display: inline-flex;
  align-items: center;
  padding: 0 8px;
  height: 22px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
  color: #0369a1;
  background: #e0f2fe;
  white-space: nowrap;
}
.record-read-btn {
  padding: 1px 10px;
  height: 22px;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  background: #fff;
  font-size: 12px;
  color: #1a6fff;
  cursor: pointer;
  white-space: nowrap;
  transition: border-color 0.15s, background 0.15s;
}
.record-read-btn:hover {
  border-color: #1a6fff;
  background: #f5f9ff;
}
.record-read-tag {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 12px;
  color: #16a34a;
}
.simple-item.is-read {
  background: #fafafa;
}
.simple-item.is-read .record-body {
  color: v-bind('T.text.meta');
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
