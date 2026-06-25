<script setup lang="ts">
import { ref } from 'vue';
import {
  ThunderboltOutlined,
  SettingOutlined,
  UnorderedListOutlined,
  DownOutlined,
  UpOutlined,
  SearchOutlined,
} from '@ant-design/icons-vue';
import TicketColumnSettings from '@/views/tickets/components/TicketColumnSettings.vue';

const props = withDefaults(
  defineProps<{
    selectedCount: number;
    search?: string;
    searchPlaceholder?: string;
    showSearch?: boolean;
    showCreate?: boolean;
    showBatch?: boolean;
    batchActions?: string[];
    visibleColumns?: Record<string, boolean>;
    columnOrder?: string[];
    hideAssigneeColumn?: boolean;
    hideGroupNamesColumn?: boolean;
    showFilterToggle?: boolean;
    filterExpanded?: boolean;
  }>(),
  {
    search: '',
    searchPlaceholder: '搜索工单号、手机号、SN、产品…',
    showSearch: true,
    showCreate: true,
    batchActions: () => ['转办', '退回'],
    showFilterToggle: false,
    filterExpanded: false,
  },
);

const emit = defineEmits<{
  batch: [action: string];
  'update:search': [v: string];
  create: [];
  'toggle-filter': [];
  setColumnVisible: [key: string, visible: boolean];
  reorderColumn: [fromKey: string, toKey: string];
  resetColumns: [];
}>();

const columnSettingsOpen = ref(false);
const batchOpen = ref(false);

function pickBatch(action: string, selectedCount: number) {
  if (selectedCount <= 0) return;
  batchOpen.value = false;
  emit('batch', action);
}
</script>

<template>
  <div class="wb-toolbar">
    <div class="wb-toolbar__sort smart">
      <ThunderboltOutlined :style="{ fontSize: '14px', color: '#1A6FFF' }" />
      <span class="wb-toolbar__sort-text">SLA 紧急度优先</span>
    </div>

    <div class="wb-toolbar__cluster">
      <div
        v-if="showSearch"
        class="wb-toolbar__search"
      >
        <SearchOutlined :style="{ color: '#9CA3AF', fontSize: '14px' }" />
        <input
          class="wb-toolbar__search-input"
          :placeholder="searchPlaceholder"
          :value="search"
          @input="emit('update:search', ($event.target as HTMLInputElement).value)"
        />
      </div>

      <div
        v-if="showFilterToggle"
        class="wb-toolbar__btn wb-toolbar__btn--filter"
        :class="{ 'is-active': filterExpanded }"
        @click="emit('toggle-filter')"
      >
        <span>{{ filterExpanded ? '收起' : '筛选' }}</span>
        <UpOutlined v-if="filterExpanded" :style="{ fontSize: '11px', color: '#9CA3AF' }" />
        <DownOutlined v-else :style="{ fontSize: '11px', color: '#9CA3AF' }" />
      </div>

      <div class="wb-toolbar__btn" @click="columnSettingsOpen = true">
        <SettingOutlined :style="{ color: '#6B7280', fontSize: '14px' }" />
        <span>列设置</span>
      </div>
      <TicketColumnSettings
        v-model:open="columnSettingsOpen"
        :visible-columns="visibleColumns ?? {}"
        :column-order="columnOrder"
        :hide-assignee-column="hideAssigneeColumn"
        :hide-group-names-column="hideGroupNamesColumn"
        @set-visible="(key, visible) => emit('setColumnVisible', key, visible)"
        @reorder="(fromKey, toKey) => emit('reorderColumn', fromKey, toKey)"
        @reset="emit('resetColumns')"
      />

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

      <button v-if="showCreate" type="button" class="wb-toolbar__create" @click="emit('create')">
        新建工单
      </button>
    </div>
  </div>
</template>

<style scoped>
.wb-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  min-width: 0;
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
.wb-toolbar__search {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 220px;
  height: 36px;
  padding: 0 10px;
  background: #fff;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  box-sizing: border-box;
  flex: none;
}
.wb-toolbar__search:focus-within {
  border-color: #1a6fff;
  box-shadow: 0 0 0 2px rgb(26 111 255 / 10%);
}
.wb-toolbar__search-input {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  font-size: 13px;
  color: #374151;
  background: transparent;
}
.wb-toolbar__search-input::placeholder {
  color: #9ca3af;
}
.wb-toolbar__create {
  font-size: 13px;
  font-weight: 600;
  color: #fff;
  background: #1a6fff;
  border: none;
  border-radius: 8px;
  padding: 8px 16px;
  cursor: pointer;
  white-space: nowrap;
}
.wb-toolbar__create:hover {
  background: #0f4fcc;
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
.wb-toolbar__btn--filter.is-active {
  color: #1a6fff;
  border-color: #bfdbfe;
  background: #f8fbff;
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
