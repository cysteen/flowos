<script setup lang="ts">
import { SearchOutlined } from '@ant-design/icons-vue';
import type { ListFilters } from '@/views/tickets/composables/useTicketList';
import type { TicketType } from '@/views/tickets/types/ticket';

defineProps<{ filters: ListFilters }>();
const emit = defineEmits<{ search: []; reset: [] }>();

const TYPE_OPTIONS: TicketType[] = ['投诉', '报修', '咨询', '安装', '退换', '技术'];
const STATUS_OPTIONS = [
  { value: 'pending', label: '待受理' },
  { value: 'processing', label: '处理中' },
  { value: 'held', label: '已挂起' },
  { value: 'review', label: '待审核' },
];
const PRIORITY_OPTIONS = ['P0', 'P1', 'P2', 'P3'];
const SLA_OPTIONS = [
  { value: 'ok', label: '正常' },
  { value: 'soon', label: '临期' },
  { value: 'overdue', label: '超时' },
  { value: 'paused', label: '已停表' },
];
const CHANNEL_OPTIONS = ['在线客服', '电话', '邮件', '小程序', 'APP'];
const ASSIGNEE_OPTIONS = ['王坐席', '陈坐席', '林坐席', '周二线', 'pool'];
</script>

<template>
  <div class="filter-card">
    <div class="filter-grid">
      <div class="field">
        <label>工单号 / 标题</label>
        <a-input v-model:value="filters.keyword" placeholder="请输入" allow-clear />
      </div>
      <div class="field">
        <label>工单类型</label>
        <a-select
          v-model:value="filters.type"
          allow-clear
          placeholder="全部"
          class="full"
          :options="TYPE_OPTIONS.map((v) => ({ value: v, label: v }))"
        />
      </div>
      <div class="field">
        <label>状态</label>
        <a-select
          v-model:value="filters.status"
          allow-clear
          placeholder="全部"
          class="full"
          :options="STATUS_OPTIONS"
        />
      </div>
      <div class="field">
        <label>优先级</label>
        <a-select
          v-model:value="filters.priority"
          allow-clear
          placeholder="全部"
          class="full"
          :options="PRIORITY_OPTIONS.map((v) => ({ value: v, label: v }))"
        />
      </div>
      <div class="field">
        <label>SLA 状态</label>
        <a-select
          v-model:value="filters.slaStatus"
          allow-clear
          placeholder="全部"
          class="full"
          :options="SLA_OPTIONS"
        />
      </div>
      <div class="field">
        <label>渠道</label>
        <a-select
          v-model:value="filters.channel"
          allow-clear
          placeholder="全部"
          class="full"
          :options="CHANNEL_OPTIONS.map((v) => ({ value: v, label: v }))"
        />
      </div>
      <div class="field">
        <label>产品</label>
        <a-input v-model:value="filters.product" placeholder="请输入" allow-clear />
      </div>
      <div class="field">
        <label>处理人</label>
        <a-select
          v-model:value="filters.assignee"
          allow-clear
          placeholder="全部"
          class="full"
          :options="[
            ...ASSIGNEE_OPTIONS.filter((v) => v !== 'pool').map((v) => ({ value: v, label: v })),
            { value: 'pool', label: '— 待领' },
          ]"
        />
      </div>
      <div class="field">
        <label>创建时间</label>
        <a-input v-model:value="filters.dateRange" placeholder="开始 ~ 结束" />
      </div>
    </div>
    <div class="filter-actions">
      <button type="button" class="btn-search" @click="emit('search')">
        <SearchOutlined />
        查询
      </button>
      <button type="button" class="btn-reset" @click="emit('reset')">重置</button>
    </div>
  </div>
</template>

<style scoped>
.filter-card {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.filter-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 14px 12px;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}
.field label {
  font-size: 12px;
  color: #6b7280;
}
.full {
  width: 100%;
}
.filter-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.btn-search {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 14px;
  font-size: 13px;
  color: #fff;
  background: #1a6fff;
  border: none;
  border-radius: 6px;
  cursor: pointer;
}
.btn-reset {
  height: 32px;
  padding: 0 14px;
  font-size: 13px;
  color: #374151;
  background: #fff;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  cursor: pointer;
}
@media (max-width: 1200px) {
  .filter-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}
</style>
