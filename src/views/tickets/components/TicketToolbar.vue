<script setup lang="ts">
import {
  ThunderboltOutlined,
  FilterOutlined,
  SettingOutlined,
  UnorderedListOutlined,
} from '@ant-design/icons-vue';
import { TICKET_COLUMN_DEFS } from '@/views/tickets/composables/useTicketColumns';

defineProps<{
  selectedCount: number;
  showBatch?: boolean;
  showFilter?: boolean;
  /** 列设置：公共属性列显隐 */
  visibleColumns?: Record<string, boolean>;
}>();

const emit = defineEmits<{
  batch: [];
  filter: [];
  toggleColumn: [key: string];
  resetColumns: [];
}>();

const COLUMN_DEFS = TICKET_COLUMN_DEFS;
</script>

<template>
  <div class="wb-toolbar">
    <div class="wb-toolbar__sort smart">
      <ThunderboltOutlined :style="{ fontSize: '14px', color: '#1A6FFF' }" />
      <span>SLA 紧急度优先</span>
    </div>

    <div class="wb-toolbar__actions">
      <div v-if="showFilter !== false" class="wb-toolbar__btn" @click="emit('filter')">
        <FilterOutlined :style="{ color: '#6B7280', fontSize: '14px' }" />
        <span>筛选</span>
      </div>
      <div class="wb-toolbar__btn-group">
        <a-popover trigger="click" placement="bottomRight">
          <div class="wb-toolbar__btn">
            <SettingOutlined :style="{ color: '#6B7280', fontSize: '14px' }" />
            <span>列设置</span>
          </div>
          <template #content>
            <div class="col-settings">
              <div class="cs-head">显示列（各类工单公共属性）</div>
              <label v-for="c in COLUMN_DEFS" :key="c.key" class="cs-item">
                <a-checkbox
                  :checked="visibleColumns ? visibleColumns[c.key] !== false : true"
                  @change="emit('toggleColumn', c.key)"
                />
                <span class="cs-label">{{ c.label }}</span>
              </label>
              <div class="cs-foot">
                <span class="cs-fixed">工单/标题、操作 为固定列</span>
                <a class="cs-reset" @click="emit('resetColumns')">重置默认</a>
              </div>
            </div>
          </template>
        </a-popover>
        <div
          v-if="showBatch !== false"
          class="wb-toolbar__btn wb-toolbar__btn--batch"
          :class="{ 'is-active': selectedCount > 0 }"
          @click="selectedCount > 0 && emit('batch')"
        >
          <UnorderedListOutlined :style="{ fontSize: '14px' }" />
          <span>批量操作</span>
          <span v-if="selectedCount > 0" class="wb-toolbar__badge">{{ selectedCount }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 列设置 popover 内容 */
.col-settings { width: 200px; display: flex; flex-direction: column; gap: 2px; }
.cs-head { font-size: 12px; font-weight: 600; color: #6b7280; padding: 2px 2px 6px; }
.cs-item {
  display: flex; align-items: center; gap: 8px;
  padding: 6px 6px; border-radius: 6px; cursor: pointer;
}
.cs-item:hover { background: #f5f7ff; }
.cs-label { font-size: 13px; color: #374151; }
.cs-foot {
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
  margin-top: 6px; padding-top: 8px; border-top: 1px solid #f0f0f0;
}
.cs-fixed { font-size: 11px; color: #9ca3af; }
.cs-reset { font-size: 12px; color: #1a6fff; cursor: pointer; flex: none; }
.cs-reset:hover { text-decoration: underline; }

.wb-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  min-width: 0;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: thin;
}
.wb-toolbar__sort {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: #f3f4f6;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  color: #4b5563;
  flex: none;
}
.wb-toolbar__sort.smart {
  background: #eff6ff;
  border-color: #bfdbfe;
  color: #1a6fff;
}
.wb-toolbar__actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: none;
  margin-left: auto;
}
.wb-toolbar__btn-group {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex: none;
}
.wb-toolbar__btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 12px;
  background: #fff;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 13px;
  color: #374151;
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
  flex: none;
}
.wb-toolbar__btn:hover {
  border-color: #1a6fff;
}
.wb-toolbar__btn--batch {
  color: #6b7280;
  cursor: not-allowed;
}
.wb-toolbar__btn--batch.is-active {
  color: #1a6fff;
  border-color: #bfdbfe;
  background: #f8fbff;
  cursor: pointer;
}
.wb-toolbar__btn--batch.is-active:hover {
  border-color: #1a6fff;
}
.wb-toolbar__badge {
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  font-size: 11px;
  font-weight: 600;
  line-height: 18px;
  text-align: center;
  color: #fff;
  background: #1a6fff;
  border-radius: 9px;
}
</style>
