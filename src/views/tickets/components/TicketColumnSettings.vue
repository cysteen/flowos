<script setup lang="ts">
import { computed, ref } from 'vue';
import { CloseOutlined, HolderOutlined, SearchOutlined } from '@ant-design/icons-vue';
import {
  TICKET_COLUMN_DEFS,
  TICKET_FIXED_COLUMN_DEFS,
  columnLabel,
} from '@/views/tickets/composables/useTicketColumns';

const props = defineProps<{
  open: boolean;
  visibleColumns: Record<string, boolean>;
  /** 持久化后的列顺序（key 列表）；面板须按此顺序渲染，否则拖拽索引与实际列表错位 */
  columnOrder?: string[];
  hideAssigneeColumn?: boolean;
  hideGroupNamesColumn?: boolean;
}>();

const emit = defineEmits<{
  'update:open': [v: boolean];
  setVisible: [key: string, visible: boolean];
  reorder: [fromKey: string, toKey: string];
  reset: [];
}>();

const search = ref('');
const dragIndex = ref<number | null>(null);
const overIndex = ref<number | null>(null);

/** 可排序的列定义，按持久化顺序排列（缺省回退到声明顺序），保证拖拽索引与实际列表一致 */
const orderedDefs = computed(() => {
  const order = props.columnOrder?.length
    ? props.columnOrder
    : TICKET_COLUMN_DEFS.map((c) => c.key);
  const known = new Map(TICKET_COLUMN_DEFS.map((c) => [c.key, c]));
  const result: { key: string; label: string }[] = [];
  const seen = new Set<string>();
  for (const key of order) {
    const def = known.get(key);
    if (def && !seen.has(key)) {
      result.push(def);
      seen.add(key);
    }
  }
  // 持久化顺序里缺失的（新列）补到末尾
  for (const def of TICKET_COLUMN_DEFS) {
    if (!seen.has(def.key)) result.push(def);
  }
  return result;
});

function passesVariant(key: string): boolean {
  if (props.hideAssigneeColumn && key === 'assignee') return false;
  if (props.hideGroupNamesColumn && key === 'groupNames') return false;
  return true;
}

const displayed = computed(() => {
  const q = search.value.trim().toLowerCase();
  return orderedDefs.value.filter((c) => {
    if (!passesVariant(c.key)) return false;
    if (props.visibleColumns[c.key] === false) return false;
    if (q && !c.label.toLowerCase().includes(q)) return false;
    return true;
  });
});

const hidden = computed(() => {
  const q = search.value.trim().toLowerCase();
  return orderedDefs.value.filter((c) => {
    if (!passesVariant(c.key)) return false;
    if (props.visibleColumns[c.key] !== false) return false;
    if (q && !c.label.toLowerCase().includes(q)) return false;
    return true;
  });
});

const fixedDisplayed = computed(() => {
  const q = search.value.trim().toLowerCase();
  return TICKET_FIXED_COLUMN_DEFS.filter((c) => !q || c.label.toLowerCase().includes(q));
});

function close() {
  emit('update:open', false);
}

function onDragStart(index: number) {
  dragIndex.value = index;
}

function onDragOver(index: number, e: DragEvent) {
  e.preventDefault();
  overIndex.value = index;
}

function onDrop(index: number) {
  if (dragIndex.value !== null && dragIndex.value !== index && !search.value.trim()) {
    const fromKey = displayed.value[dragIndex.value]?.key;
    const toKey = displayed.value[index]?.key;
    if (fromKey && toKey) emit('reorder', fromKey, toKey);
  }
  dragIndex.value = null;
  overIndex.value = null;
}

function onDragEnd() {
  dragIndex.value = null;
  overIndex.value = null;
}
</script>

<template>
  <a-drawer
    :open="open"
    placement="right"
    :width="360"
    :closable="false"
    :body-style="{ padding: 0 }"
    class="col-settings-drawer"
    @close="close"
  >
    <template #title>
      <div class="cs-header">
        <span class="cs-title">表头设置</span>
        <button type="button" class="cs-close" aria-label="关闭" @click="close">
          <CloseOutlined />
        </button>
      </div>
    </template>

    <div class="cs-body">
      <div class="cs-search">
        <SearchOutlined class="cs-search-icon" />
        <input
          v-model="search"
          class="cs-search-input"
          type="search"
          placeholder="搜索表头"
        />
      </div>

      <div v-if="fixedDisplayed.length" class="cs-section">
        <div class="cs-section-title">已显示的字段</div>
        <div
          v-for="col in fixedDisplayed"
          :key="col.key"
          class="cs-row cs-row--fixed"
        >
          <span class="cs-drag-placeholder" />
          <span class="cs-label">{{ col.label }}</span>
          <a-switch size="small" :checked="true" disabled />
        </div>
      </div>

      <div v-if="displayed.length" class="cs-section">
        <div v-if="!fixedDisplayed.length" class="cs-section-title">已显示的字段</div>
        <div
          v-for="(col, index) in displayed"
          :key="col.key"
          class="cs-row"
          :class="{ 'is-over': overIndex === index, 'is-dragging': dragIndex === index }"
          :draggable="!search.trim()"
          @dragstart="onDragStart(index)"
          @dragover="onDragOver(index, $event)"
          @drop="onDrop(index)"
          @dragend="onDragEnd"
        >
          <HolderOutlined class="cs-drag" />
          <span class="cs-label">{{ columnLabel(col.key) }}</span>
          <a-switch
            size="small"
            :checked="true"
            @change="emit('setVisible', col.key, false)"
          />
        </div>
      </div>

      <div v-if="hidden.length" class="cs-section">
        <div class="cs-section-title">未显示的字段</div>
        <div v-for="col in hidden" :key="col.key" class="cs-row cs-row--hidden">
          <span class="cs-drag-placeholder" />
          <span class="cs-label">{{ col.label }}</span>
          <a-switch
            size="small"
            :checked="false"
            @change="emit('setVisible', col.key, true)"
          />
        </div>
      </div>

      <div v-if="!fixedDisplayed.length && !displayed.length && !hidden.length" class="cs-empty">
        无匹配表头
      </div>

      <div class="cs-foot">
        <span class="cs-hint">工单/标题、操作为固定列</span>
        <a class="cs-reset" @click="emit('reset')">重置默认</a>
      </div>
    </div>
  </a-drawer>
</template>

<style scoped>
.col-settings-drawer :deep(.ant-drawer-header) {
  padding: 16px 20px;
  border-bottom: 1px solid #f0f0f0;
}
.col-settings-drawer :deep(.ant-drawer-body) {
  display: flex;
  flex-direction: column;
  height: 100%;
}
.cs-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}
.cs-title {
  font-size: 16px;
  font-weight: 600;
  color: #111827;
}
.cs-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  color: #6b7280;
  border-radius: 6px;
  cursor: pointer;
}
.cs-close:hover {
  background: #f3f4f6;
  color: #111827;
}
.cs-body {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 0 0 16px;
}
.cs-search {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 12px 20px;
  padding: 0 12px;
  height: 36px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #fff;
}
.cs-search:focus-within {
  border-color: #1a6fff;
  box-shadow: 0 0 0 2px rgb(26 111 255 / 10%);
}
.cs-search-icon {
  color: #9ca3af;
  font-size: 14px;
  flex: none;
}
.cs-search-input {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  font-size: 13px;
  color: #374151;
  background: transparent;
}
.cs-search-input::placeholder {
  color: #9ca3af;
}
.cs-section {
  padding: 4px 12px 8px;
}
.cs-section-title {
  padding: 8px 8px 6px;
  font-size: 12px;
  font-weight: 600;
  color: #9ca3af;
}
.cs-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 8px;
  border-radius: 8px;
  cursor: grab;
  user-select: none;
}
.cs-row:hover {
  background: #f9fafb;
}
.cs-row.is-over {
  background: #eff6ff;
}
.cs-row.is-dragging {
  opacity: 0.45;
}
.cs-row--fixed,
.cs-row--hidden {
  cursor: default;
}
.cs-drag {
  flex: none;
  font-size: 14px;
  color: #9ca3af;
}
.cs-drag-placeholder {
  width: 14px;
  flex: none;
}
.cs-label {
  flex: 1;
  min-width: 0;
  font-size: 14px;
  color: #374151;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cs-empty {
  padding: 32px 20px;
  text-align: center;
  font-size: 13px;
  color: #9ca3af;
}
.cs-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: auto;
  padding: 12px 20px 0;
  border-top: 1px solid #f0f0f0;
}
.cs-hint {
  font-size: 12px;
  color: #9ca3af;
}
.cs-reset {
  font-size: 13px;
  color: #1a6fff;
  cursor: pointer;
  flex: none;
}
.cs-reset:hover {
  text-decoration: underline;
}
</style>
