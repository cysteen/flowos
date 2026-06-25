<script setup lang="ts">
import { computed, ref } from 'vue';
import {
  ThunderboltOutlined,
  FilterOutlined,
  SettingOutlined,
  UnorderedListOutlined,
  DownOutlined,
} from '@ant-design/icons-vue';
import { TICKET_COLUMN_DEFS } from '@/views/tickets/composables/useTicketColumns';

const props = withDefaults(
  defineProps<{
    selectedCount: number;
    showFilter?: boolean;
    showBatch?: boolean;
    batchActions?: string[];
    /** 列设置：公共属性列显隐 */
    visibleColumns?: Record<string, boolean>;
    /** 我的任务：处理人固定为当前坐席，列设置中不展示 */
    hideAssigneeColumn?: boolean;
  }>(),
  {
    batchActions: () => ['转办', '退回'],
  },
);

const emit = defineEmits<{
  batch: [action: string];
  filter: [];
  toggleColumn: [key: string];
  resetColumns: [];
}>();

const COLUMN_DEFS = computed(() =>
  props.hideAssigneeColumn
    ? TICKET_COLUMN_DEFS.filter((c) => c.key !== 'assignee')
    : TICKET_COLUMN_DEFS,
);
const batchOpen = ref(false);

function pickBatch(action: string, selectedCount: number) {
  if (selectedCount <= 0) return;
  batchOpen.value = false;
  emit('batch', action);
}
</script>

<template>
  <div class="wb-toolbar">
    <div v-if="showFilter !== false" class="wb-toolbar__btn" @click="emit('filter')">
      <FilterOutlined :style="{ color: '#6B7280', fontSize: '14px' }" />
      <span>筛选</span>
    </div>

    <div class="wb-toolbar__spacer" />

    <div class="wb-toolbar__sort smart">
      <ThunderboltOutlined :style="{ fontSize: '14px', color: '#1A6FFF' }" />
      <span class="wb-toolbar__sort-text">SLA 紧急度优先</span>
    </div>

    <div class="wb-toolbar__cluster">
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

      <a-dropdown
        v-if="showBatch !== false"
        v-model:open="batchOpen"
        trigger="click"
        placement="bottomRight"
      >
        <div
          class="wb-toolbar__btn wb-toolbar__btn--batch"
          :class="{ 'is-active': selectedCount > 0 }"
        >
          <UnorderedListOutlined :style="{ fontSize: '14px' }" />
          <span>批量操作</span>
          <span v-if="selectedCount > 0" class="wb-toolbar__badge">{{ selectedCount }}</span>
          <DownOutlined :style="{ color: '#9CA3AF', fontSize: '12px' }" />
        </div>
        <template #overlay>
          <a-menu class="batch-menu">
            <template v-if="batchActions.length">
              <a-menu-item
                v-for="action in batchActions"
                :key="action"
                :disabled="selectedCount <= 0"
                @click="pickBatch(action, selectedCount)"
              >
                {{ action }}
              </a-menu-item>
            </template>
            <a-menu-item v-else disabled>
              暂无可用操作
            </a-menu-item>
          </a-menu>
        </template>
      </a-dropdown>
    </div>
  </div>
</template>

<style scoped>
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
  gap: 8px;
  width: 100%;
  min-width: 0;
}
.wb-toolbar__spacer {
  flex: 1;
  min-width: 8px;
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
  max-width: 160px;
  min-width: 0;
}
.wb-toolbar__sort-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.wb-toolbar__sort.smart {
  background: #eff6ff;
  border-color: #bfdbfe;
  color: #1a6fff;
}
.wb-toolbar__cluster {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex: none;
  flex-shrink: 0;
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
}
.wb-toolbar__btn--batch.is-active {
  color: #1a6fff;
  border-color: #bfdbfe;
  background: #f8fbff;
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
