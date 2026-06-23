<script setup lang="ts">
import { Modal as AModal } from 'ant-design-vue';
import { RightOutlined } from '@ant-design/icons-vue';
import type { InsightDetailTable } from '@/views/tickets/types/operation';

defineProps<{
  open: boolean;
  table: InsightDetailTable | null;
  /** 底部「查看完整记录」入口文案；不传则不显示 */
  viewAllLabel?: string;
}>();

const emit = defineEmits<{
  'update:open': [v: boolean];
  openTicket: [no: string];
  viewAll: [];
}>();
</script>

<template>
  <AModal
    :open="open"
    :title="table?.title ?? '明细'"
    :footer="null"
    :width="760"
    @update:open="emit('update:open', $event)"
  >
    <div v-if="table" class="stat-modal-body">
      <div class="table-wrap">
        <table class="detail-table">
          <thead>
            <tr>
              <th v-for="c in table.columns" :key="c">{{ c }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, ri) in table.rows" :key="ri">
              <td v-for="(cell, ci) in row.cells" :key="ci">
                <a
                  v-if="ci === 0 && row.ticketNo"
                  class="cell-link"
                  @click="emit('openTicket', row.ticketNo)"
                >{{ cell }}</a>
                <span v-else>{{ cell }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-if="viewAllLabel" class="modal-foot">
        <a class="view-all" @click="emit('viewAll')">
          {{ viewAllLabel }} <RightOutlined :style="{ fontSize: '11px' }" />
        </a>
      </div>
    </div>
  </AModal>
</template>

<style scoped>
.stat-modal-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.table-wrap {
  overflow-x: auto;
  max-height: 56vh;
  overflow-y: auto;
}
.detail-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}
.detail-table th {
  background: #f3f4f6;
  padding: 9px 10px;
  border: 1px solid #e5e7eb;
  text-align: left;
  font-weight: 600;
  color: #374151;
  white-space: nowrap;
  position: sticky;
  top: 0;
}
.detail-table td {
  padding: 9px 10px;
  border: 1px solid #e5e7eb;
  color: #555;
  vertical-align: top;
}
.cell-link {
  color: #1a6fff;
  cursor: pointer;
}
.cell-link:hover {
  text-decoration: underline;
}
.modal-foot {
  display: flex;
  justify-content: flex-end;
}
.view-all {
  font-size: 13px;
  color: #1a6fff;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.view-all:hover {
  text-decoration: underline;
}
</style>
