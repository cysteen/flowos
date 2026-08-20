<script setup lang="ts">
import { computed } from 'vue';
import { DatePicker } from 'ant-design-vue';
import dayjs, { type Dayjs } from 'dayjs';
import { SearchOutlined } from '@ant-design/icons-vue';
import type { ListFilters } from '@/views/tickets/composables/useTicketList';
import {
  QUERY_ASSIGNEE_OPTIONS,
  QUERY_BGBU_OPTIONS,
  QUERY_BUSINESS_LINE_OPTIONS,
  QUERY_BUSINESS_TYPES,
  QUERY_CHANNEL_OPTIONS,
  QUERY_GROUP_OPTIONS,
  QUERY_PRIORITY_OPTIONS,
  QUERY_PRODUCT_LINE_OPTIONS,
  QUERY_PRODUCT_OPTIONS,
  QUERY_SLA_OPTIONS,
  QUERY_STATUS_OPTIONS,
  QUERY_TYPE_OPTIONS,
} from '@/views/tickets/types/listQueryFilters';
import type { TicketType } from '@/views/tickets/types/ticket';

const props = defineProps<{ filters: ListFilters; embedded?: boolean }>();
const emit = defineEmits<{ search: []; reset: []; 'clear-keyword': [] }>();

const RangePicker = DatePicker.RangePicker;

// 必须是 computed 而非模块级常量：ant-design-vue 的 presets 只接受**数组**（不对函数求值，
// 那是已废弃的 ranges 才有的能力），写成 `value: () => …` 点了不生效；
// 而写成模块级常量会在加载时求值，跨零点的长驻页面会漂一天。
const rangePresets = computed(() => [
  { label: '最近一周', value: buildPresetRange(7) },
  { label: '最近一个月', value: buildPresetRange(30) },
  { label: '最近三个月', value: buildPresetRange(90) },
]);

function buildPresetRange(days: number): [Dayjs, Dayjs] {
  const end = dayjs().endOf('day');
  const start = dayjs().subtract(days - 1, 'day').startOf('day');
  return [start, end];
}

const rangeValue = computed(() => {
  const { dateFrom, dateTo } = props.filters;
  if (!dateFrom && !dateTo) return undefined;
  return [dateFrom ? dayjs(dateFrom) : null, dateTo ? dayjs(dateTo) : null] as [Dayjs, Dayjs];
});

function onRangeChange(dates: [Dayjs, Dayjs] | [string, string] | null) {
  const f = props.filters;
  if (!dates || !dates[0] || !dates[1]) {
    f.dateFrom = '';
    f.dateTo = '';
  } else {
    f.dateFrom = dayjs(dates[0]).format('YYYY-MM-DD');
    f.dateTo = dayjs(dates[1]).format('YYYY-MM-DD');
  }
  if (props.embedded) emit('search');
}

function patchSelect(key: keyof ListFilters, raw: string, autoSearch = true) {
  const f = props.filters;
  if (key === 'type') f.type = (raw || undefined) as TicketType | undefined;
  else if (key === 'status') f.status = raw || undefined;
  else if (key === 'priority') f.priority = raw || undefined;
  else if (key === 'assignee') f.assignee = raw || undefined;
  else if (key === 'slaStatus') f.slaStatus = (raw || undefined) as ListFilters['slaStatus'];
  else if (key === 'channel') f.channel = raw || undefined;
  else if (key === 'businessType') f.businessType = raw;
  else if (key === 'bgbu') f.bgbu = raw;
  else if (key === 'businessLine') f.businessLine = raw;
  else if (key === 'productLine') f.productLine = raw;
  else if (key === 'product') f.product = raw;
  else if (key === 'groupName') f.groupName = raw;
  if (autoSearch && props.embedded) emit('search');
}

function patchInput(key: 'ticketNo' | 'phone', raw: string) {
  props.filters[key] = raw;
}

function onEnter() {
  emit('search');
}

function resetAll() {
  emit('reset');
}
</script>

<template>
  <!-- 查询中心：工作台 query-filters 样式 · 由顶栏漏斗控制展开 -->
  <div v-if="embedded" class="query-filters">
    <div class="filter-scroll">
      <label class="filter-item filter-item-date">
        <span class="fi-label">起止日期</span>
        <RangePicker
          :value="rangeValue"
          :presets="rangePresets"
          allow-clear
          :bordered="false"
          size="small"
          format="YYYY-MM-DD"
          :placeholder="['开始日期', '结束日期']"
          class="fi-range-picker"
          @change="onRangeChange"
        />
      </label>

      <label class="filter-item filter-item-wide">
        <span class="fi-label">工单编号</span>
        <input
          class="fi-control fi-input"
          placeholder="请输入"
          :value="filters.ticketNo"
          @input="patchInput('ticketNo', ($event.target as HTMLInputElement).value)"
          @keyup.enter="onEnter"
          @blur="onEnter"
        />
      </label>

      <label class="filter-item filter-item-wide">
        <span class="fi-label">手机号</span>
        <input
          class="fi-control fi-input"
          placeholder="请输入"
          :value="filters.phone"
          @input="patchInput('phone', ($event.target as HTMLInputElement).value)"
          @keyup.enter="onEnter"
          @blur="onEnter"
        />
      </label>

      <label class="filter-item">
        <span class="fi-label">工单类型</span>
        <select
          class="fi-control"
          :value="filters.type ?? ''"
          @change="patchSelect('type', ($event.target as HTMLSelectElement).value)"
        >
          <option value="">请选择</option>
          <option v-for="v in QUERY_TYPE_OPTIONS" :key="v" :value="v">{{ v }}</option>
        </select>
      </label>

      <label class="filter-item filter-item-wide">
        <span class="fi-label">当前处理组</span>
        <select
          class="fi-control"
          :value="filters.groupName"
          @change="patchSelect('groupName', ($event.target as HTMLSelectElement).value)"
        >
          <option value="">请选择</option>
          <option v-for="g in QUERY_GROUP_OPTIONS" :key="g" :value="g">{{ g }}</option>
        </select>
      </label>

      <label class="filter-item">
        <span class="fi-label">当前处理人</span>
        <select
          class="fi-control"
          :value="filters.assignee ?? ''"
          @change="patchSelect('assignee', ($event.target as HTMLSelectElement).value)"
        >
          <option value="">请选择</option>
          <option v-for="v in QUERY_ASSIGNEE_OPTIONS" :key="v" :value="v">{{ v }}</option>
          <option value="pool">待领</option>
        </select>
      </label>

      <label class="filter-item">
        <span class="fi-label">业务类型</span>
        <select
          class="fi-control"
          :value="filters.businessType"
          @change="patchSelect('businessType', ($event.target as HTMLSelectElement).value)"
        >
          <option value="">请选择</option>
          <option v-for="b in QUERY_BUSINESS_TYPES" :key="b" :value="b">{{ b }}</option>
        </select>
      </label>

      <label class="filter-item">
        <span class="fi-label">BGBU</span>
        <select
          class="fi-control"
          :value="filters.bgbu"
          @change="patchSelect('bgbu', ($event.target as HTMLSelectElement).value)"
        >
          <option value="">请选择</option>
          <option v-for="v in QUERY_BGBU_OPTIONS" :key="v" :value="v">{{ v }}</option>
        </select>
      </label>

      <label class="filter-item filter-item-wide">
        <span class="fi-label">业务线</span>
        <select
          class="fi-control"
          :value="filters.businessLine"
          @change="patchSelect('businessLine', ($event.target as HTMLSelectElement).value)"
        >
          <option value="">请选择</option>
          <option v-for="v in QUERY_BUSINESS_LINE_OPTIONS" :key="v" :value="v">{{ v }}</option>
        </select>
      </label>

      <label class="filter-item filter-item-wide">
        <span class="fi-label">产品线</span>
        <select
          class="fi-control"
          :value="filters.productLine"
          @change="patchSelect('productLine', ($event.target as HTMLSelectElement).value)"
        >
          <option value="">请选择</option>
          <option v-for="v in QUERY_PRODUCT_LINE_OPTIONS" :key="v" :value="v">{{ v }}</option>
        </select>
      </label>

      <label class="filter-item filter-item-wide">
        <span class="fi-label">产品</span>
        <select
          class="fi-control"
          :value="filters.product"
          @change="patchSelect('product', ($event.target as HTMLSelectElement).value)"
        >
          <option value="">请选择</option>
          <option v-for="p in QUERY_PRODUCT_OPTIONS" :key="p" :value="p">{{ p }}</option>
        </select>
      </label>

      <label class="filter-item">
        <span class="fi-label">优先级</span>
        <select
          class="fi-control"
          :value="filters.priority ?? ''"
          @change="patchSelect('priority', ($event.target as HTMLSelectElement).value)"
        >
          <option v-for="p in QUERY_PRIORITY_OPTIONS" :key="p.value || 'all'" :value="p.value">{{ p.label }}</option>
        </select>
      </label>

      <label class="filter-item">
        <span class="fi-label">SLA 状态</span>
        <select
          class="fi-control"
          :value="filters.slaStatus ?? ''"
          @change="patchSelect('slaStatus', ($event.target as HTMLSelectElement).value)"
        >
          <option v-for="s in QUERY_SLA_OPTIONS" :key="s.value || 'all'" :value="s.value">{{ s.label }}</option>
        </select>
      </label>

      <label class="filter-item">
        <span class="fi-label">状态</span>
        <select
          class="fi-control"
          :value="filters.status ?? ''"
          @change="patchSelect('status', ($event.target as HTMLSelectElement).value)"
        >
          <option v-for="s in QUERY_STATUS_OPTIONS" :key="s.value || 'all'" :value="s.value">{{ s.label }}</option>
        </select>
      </label>

      <label class="filter-item">
        <span class="fi-label">渠道</span>
        <select
          class="fi-control"
          :value="filters.channel ?? ''"
          @change="patchSelect('channel', ($event.target as HTMLSelectElement).value)"
        >
          <option value="">请选择</option>
          <option v-for="v in QUERY_CHANNEL_OPTIONS" :key="v" :value="v">{{ v }}</option>
        </select>
      </label>

      <label v-if="filters.keyword?.trim()" class="filter-item filter-item-wide">
        <span class="fi-label">顶栏搜索</span>
        <input
          class="fi-control fi-input"
          readonly
          :title="filters.keyword"
          :value="filters.keyword"
          @click="emit('clear-keyword')"
        />
      </label>
    </div>

    <div class="filter-actions">
      <button type="button" class="link-btn" @click="resetAll">重置</button>
    </div>
  </div>

  <!-- 独立工单列表页：完整筛选面板 -->
  <div v-else class="filter-card">
    <div class="filter-grid">
      <div class="field">
        <label>工单号 / 标题</label>
        <a-input v-model:value="filters.keyword" placeholder="请输入" allow-clear />
      </div>
      <div class="field">
        <label>手机号</label>
        <a-input v-model:value="filters.phone" placeholder="请输入" allow-clear />
      </div>
      <div class="field">
        <label>工单类型</label>
        <a-select
          v-model:value="filters.type"
          allow-clear
          placeholder="全部"
          class="full"
          :options="QUERY_TYPE_OPTIONS.map((v) => ({ value: v, label: v }))"
        />
      </div>
      <div class="field">
        <label>状态</label>
        <a-select
          v-model:value="filters.status"
          allow-clear
          placeholder="全部"
          class="full"
          :options="QUERY_STATUS_OPTIONS.filter((o) => o.value)"
        />
      </div>
      <div class="field">
        <label>优先级</label>
        <a-select
          v-model:value="filters.priority"
          allow-clear
          placeholder="全部"
          class="full"
          :options="QUERY_PRIORITY_OPTIONS.filter((o) => o.value).map((o) => ({ value: o.value, label: o.label }))"
        />
      </div>
      <div class="field">
        <label>SLA 状态</label>
        <a-select
          v-model:value="filters.slaStatus"
          allow-clear
          placeholder="全部"
          class="full"
          :options="QUERY_SLA_OPTIONS.filter((o) => o.value)"
        />
      </div>
      <div class="field">
        <label>渠道</label>
        <a-select
          v-model:value="filters.channel"
          allow-clear
          placeholder="全部"
          class="full"
          :options="QUERY_CHANNEL_OPTIONS.map((v) => ({ value: v, label: v }))"
        />
      </div>
      <div class="field">
        <label>产品</label>
        <a-select
          v-model:value="filters.product"
          allow-clear
          placeholder="全部"
          class="full"
          :options="QUERY_PRODUCT_OPTIONS.map((v) => ({ value: v, label: v }))"
        />
      </div>
      <div class="field">
        <label>处理人</label>
        <a-select
          v-model:value="filters.assignee"
          allow-clear
          placeholder="全部"
          class="full"
          :options="[
            ...QUERY_ASSIGNEE_OPTIONS.map((v) => ({ value: v, label: v })),
            { value: 'pool', label: '— 待领' },
          ]"
        />
      </div>
      <div class="field span-2">
        <label>创建时间</label>
        <RangePicker
          :value="rangeValue"
          :presets="rangePresets"
          allow-clear
          format="YYYY-MM-DD"
          class="full"
          @change="onRangeChange"
        />
      </div>
    </div>
    <div class="filter-actions-card">
      <button type="button" class="btn-search" @click="emit('search')">
        <SearchOutlined />
        查询
      </button>
      <button type="button" class="btn-reset" @click="emit('reset')">重置</button>
    </div>
  </div>
</template>

<style scoped>
.query-filters {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-width: 0;
}

.filter-scroll {
  display: flex;
  flex: 1;
  flex-wrap: nowrap;
  align-items: center;
  gap: 8px;
  min-width: 0;
  overflow-x: auto;
  scrollbar-width: none;
}

.filter-scroll::-webkit-scrollbar {
  display: none;
}

.filter-item {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 32px;
  padding: 0 10px;
  background: #f3f4f6;
  border-radius: 4px;
  cursor: default;
  flex: none;
}

.filter-item-wide {
  min-width: 0;
}

.filter-item-date {
  min-width: 0;
  flex-shrink: 0;
  padding-right: 6px;
}

.filter-item-date :deep(.fi-range-picker) {
  width: 228px;
  background: transparent;
  border: none;
  box-shadow: none;
  padding: 0;
}

.filter-item-date :deep(.fi-range-picker .ant-picker-input) {
  width: auto;
}

.filter-item-date :deep(.fi-range-picker .ant-picker-input > input) {
  width: 78px;
  font-size: 12px;
  color: #374151;
}

.filter-item-date :deep(.fi-range-picker .ant-picker-input > input::placeholder) {
  color: #9ca3af;
}

.filter-item-date :deep(.fi-range-picker .ant-picker-separator) {
  color: #9ca3af;
}

.filter-item-date :deep(.fi-range-picker .ant-picker-suffix) {
  color: #9ca3af;
}

.filter-item-date :deep(.fi-range-picker.ant-picker-focused) {
  box-shadow: none;
}

.fi-label {
  flex: none;
  font-size: 13px;
  color: #6b7280;
  white-space: nowrap;
}

.fi-control {
  min-width: 56px;
  max-width: 96px;
  height: 24px;
  padding: 0;
  border: none;
  outline: none;
  font-size: 13px;
  color: #374151;
  background: transparent;
  cursor: pointer;
}

.fi-input {
  cursor: text;
  min-width: 72px;
  max-width: 96px;
}

.fi-input::placeholder {
  color: #9ca3af;
}

.filter-item-wide .fi-control {
  max-width: 108px;
}

.filter-actions {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  flex: none;
  white-space: nowrap;
}

.link-btn {
  padding: 0;
  border: none;
  background: transparent;
  font-size: 13px;
  color: #1a6fff;
  cursor: pointer;
  font-family: inherit;
}

.link-btn:hover {
  color: #0f4fcc;
  text-decoration: underline;
}

.filter-card {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex: none;
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
.field.span-2 {
  grid-column: span 2;
}
.field label {
  font-size: 12px;
  color: #6b7280;
}
.full {
  width: 100%;
}
.filter-actions-card {
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
  font-family: inherit;
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
  font-family: inherit;
}
@media (max-width: 1200px) {
  .filter-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}
</style>
