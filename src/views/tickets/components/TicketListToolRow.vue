<script setup lang="ts">
import { PlusOutlined, DownloadOutlined, SettingOutlined } from '@ant-design/icons-vue';
import { LIST_VIEWS, type ListViewKey } from '@/views/tickets/types/ticket';

defineProps<{
  activeView: ListViewKey;
  viewCounts: Record<ListViewKey, number>;
  selectedCount: number;
}>();

const emit = defineEmits<{
  'update:view': [view: ListViewKey];
  create: [];
  batch: [];
  export: [];
  columns: [];
}>();
</script>

<template>
  <div class="tool-row">
    <div class="view-tabs">
      <div
        v-for="v in LIST_VIEWS"
        :key="v.key"
        class="view-tab"
        :class="{ active: activeView === v.key }"
        @click="emit('update:view', v.key)"
      >
        <span>{{ v.label }}</span>
        <span class="count">{{ viewCounts[v.key] }}</span>
      </div>
    </div>
    <div class="tool-actions">
      <button type="button" class="btn-primary" @click="emit('create')">
        <PlusOutlined />
        新建工单
      </button>
      <button
        type="button"
        class="btn-batch"
        :class="{ enabled: selectedCount > 0 }"
        :disabled="selectedCount === 0"
        @click="selectedCount > 0 && emit('batch')"
      >
        批量操作 ({{ selectedCount }})
      </button>
      <button type="button" class="btn-ghost" @click="emit('export')">
        <DownloadOutlined />
        导出
      </button>
      <button type="button" class="btn-ghost" @click="emit('columns')">
        <SettingOutlined />
        列设置
      </button>
    </div>
  </div>
</template>

<style scoped>
.tool-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}
.view-tabs {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
}
.view-tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 13px;
  color: #6b7280;
  cursor: pointer;
}
.view-tab.active {
  background: #eff6ff;
  color: #1a6fff;
  font-weight: 600;
}
.count {
  font-size: 12px;
  color: #9ca3af;
  font-weight: 500;
}
.view-tab.active .count {
  color: #1a6fff;
}
.tool-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.btn-primary {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 34px;
  padding: 0 14px;
  font-size: 13px;
  color: #fff;
  background: #1a6fff;
  border: none;
  border-radius: 6px;
  cursor: pointer;
}
.btn-batch {
  height: 34px;
  padding: 0 14px;
  font-size: 13px;
  color: #9ca3af;
  background: #f9fafb;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  cursor: not-allowed;
}
.btn-batch.enabled {
  color: #1a6fff;
  background: #fff;
  border-color: #1a6fff;
  cursor: pointer;
}
.btn-ghost {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 34px;
  padding: 0 12px;
  font-size: 13px;
  color: #374151;
  background: #fff;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  cursor: pointer;
}
.btn-ghost:hover {
  border-color: #1a6fff;
  color: #1a6fff;
}
</style>
