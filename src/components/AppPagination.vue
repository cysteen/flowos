<script setup lang="ts">
// 统一分页组件（对齐 .pen Pagination），默认 10 条/页（§0.3）
withDefaults(
  defineProps<{
    total: number;
    current?: number;
    pageSize?: number;
    showSizeChanger?: boolean;
  }>(),
  {
    current: 1,
    pageSize: 10,
    showSizeChanger: true,
  }
);

const emit = defineEmits<{
  change: [page: number, pageSize: number];
  'update:current': [page: number];
  'update:pageSize': [size: number];
}>();

function showTotal(total: number): string {
  return `共 ${total} 条`;
}

function onChange(page: number, size: number) {
  emit('update:current', page);
  emit('update:pageSize', size);
  emit('change', page, size);
}
</script>

<template>
  <div class="app-pagination">
    <a-pagination
      :total="total"
      :current="current"
      :page-size="pageSize"
      :show-size-changer="showSizeChanger"
      :show-total="showTotal"
      :page-size-options="['10', '20', '50']"
      show-quick-jumper
      @change="onChange"
    />
  </div>
</template>

<style scoped>
.app-pagination {
  display: flex;
  justify-content: flex-end;
  padding: 16px 0 4px;
}
</style>
