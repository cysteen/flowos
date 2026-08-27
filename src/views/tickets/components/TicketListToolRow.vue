<script setup lang="ts">
import { PlusOutlined, SettingOutlined } from '@ant-design/icons-vue';

withDefaults(
  defineProps<{
    embedded?: boolean;
    /**
     * 「新建工单」是否渲染。
     * 查询中心按 PRD-915 §3.4「页面内动作权限」逐角色显隐（工单运营 / 质检不出）；
     * 工作台不传＝照常显示，两处是**两个权限点**，别互相反推。
     */
    canCreate?: boolean;
  }>(),
  { canCreate: true },
);

const emit = defineEmits<{
  create: [];
  columns: [];
}>();
</script>

<template>
  <div class="tool-row" :class="{ embedded }">
    <div class="tool-actions">
      <button v-if="canCreate" type="button" class="btn-primary" @click="emit('create')">
        <PlusOutlined />
        新建工单
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
  justify-content: flex-end;
  gap: 16px;
  flex-wrap: wrap;
}
.tool-row.embedded {
  gap: 8px;
  justify-content: flex-end;
}
.tool-row.embedded .btn-primary,
.tool-row.embedded .btn-ghost {
  height: 32px;
  padding: 0 10px;
  font-size: 12px;
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
