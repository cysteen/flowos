<script setup lang="ts">
import { useOutboundCall } from '@/composables/useOutboundCall';

const { pickerOpen, pickerOptions, selectedId, confirmPicker, cancelPicker } = useOutboundCall();
</script>

<template>
  <a-modal
    v-model:open="pickerOpen"
    title="选择外显号码"
    :width="480"
    :z-index="1060"
    ok-text="确定"
    cancel-text="取消"
    destroy-on-close
    @ok="confirmPicker"
    @cancel="cancelPicker"
  >
    <div class="picker-table">
      <div class="picker-head">
        <span class="col-radio" />
        <span class="col-number">号码</span>
        <span class="col-remark">备注</span>
      </div>
      <a-radio-group v-model:value="selectedId" class="picker-body">
        <label
          v-for="item in pickerOptions"
          :key="item.id"
          class="picker-row"
          @click="selectedId = item.id"
        >
          <a-radio :value="item.id" class="col-radio" />
          <span class="col-number mono">{{ item.number }}</span>
          <span class="col-remark" :class="{ muted: !item.remark }">{{ item.remark || '-' }}</span>
        </label>
      </a-radio-group>
    </div>
  </a-modal>
</template>

<style scoped>
.picker-table {
  border: 1px solid #f0f0f0;
  border-radius: 8px;
  overflow: hidden;
}
.picker-head,
.picker-row {
  display: grid;
  grid-template-columns: 32px 1fr 1fr;
  align-items: center;
  column-gap: 8px;
}
.picker-head {
  padding: 10px 12px;
  background: #fafafa;
  border-bottom: 1px solid #f0f0f0;
  font-size: 13px;
  font-weight: 600;
  color: #6b7280;
}
.picker-body {
  display: flex;
  flex-direction: column;
  width: 100%;
}
.picker-row {
  padding: 12px;
  margin: 0;
  cursor: pointer;
  border-bottom: 1px solid #f5f5f5;
  transition: background 0.12s;
}
.picker-row:last-child {
  border-bottom: none;
}
.picker-row:hover {
  background: #fafafa;
}
.col-radio {
  justify-self: center;
}
.col-radio :deep(.ant-radio) {
  margin: 0;
}
.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 14px;
  font-weight: 500;
  color: #374151;
}
.col-remark {
  font-size: 13px;
  color: #374151;
}
.muted {
  color: #9ca3af;
}
</style>
