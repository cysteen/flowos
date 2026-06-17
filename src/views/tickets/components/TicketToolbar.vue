<script setup lang="ts">
import {
  ThunderboltOutlined,
  DownOutlined,
  FilterOutlined,
  SettingOutlined,
} from '@ant-design/icons-vue';

defineProps<{ selectedCount: number }>();
const emit = defineEmits<{ batch: []; sort: []; filter: []; columns: [] }>();
</script>

<template>
  <div class="toolbar">
    <div class="sort-pill">
      <ThunderboltOutlined :style="{ color: '#7C3AED', fontSize: '14px' }" />
      <span>智能排序 · SLA 紧急度优先</span>
    </div>

    <div class="tools">
      <div class="tool" @click="emit('sort')">
        <span>排序</span>
        <DownOutlined :style="{ color: '#9CA3AF', fontSize: '12px' }" />
      </div>
      <div class="tool" @click="emit('filter')">
        <FilterOutlined :style="{ color: '#6B7280', fontSize: '14px' }" />
        <span>筛选</span>
      </div>
      <div class="tool" @click="emit('columns')">
        <SettingOutlined :style="{ color: '#6B7280', fontSize: '14px' }" />
        <span>列设置</span>
      </div>
      <div
        class="batch"
        :class="{ enabled: selectedCount > 0 }"
        @click="selectedCount > 0 && emit('batch')"
      >
        批量操作 ({{ selectedCount }})
      </div>
    </div>
  </div>
</template>

<style scoped>
.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.sort-pill {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: #f5f3ff;
  border: 1px solid #ddd6fe;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  color: #7c3aed;
}
.tools {
  display: flex;
  align-items: center;
  gap: 10px;
}
.tool {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 12px;
  background: #fff;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 13px;
  color: #374151;
  cursor: pointer;
}
.tool:hover {
  border-color: #1a6fff;
}
.batch {
  padding: 7px 12px;
  background: #f9fafb;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 13px;
  color: #9ca3af;
  cursor: not-allowed;
}
.batch.enabled {
  background: #fff;
  color: #1a6fff;
  border-color: #1a6fff;
  cursor: pointer;
}
</style>
