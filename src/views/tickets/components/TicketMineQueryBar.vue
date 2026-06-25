<script setup lang="ts">
import { computed } from 'vue';
import { SearchOutlined } from '@ant-design/icons-vue';
import {
  DEFAULT_DONE_QUERY,
  EMPTY_MINE_QUERY,
  MINE_TIME_PRESETS,
  PRODUCT_CATEGORIES,
  productNamesForCategory,
  type MineQueryFilter,
  type MineTimePreset,
} from '@/views/tickets/types/mineQuery';
import type { Priority, PoolGroupMeta } from '@/views/tickets/types/ticket';

const props = withDefaults(
  defineProps<{
    modelValue: MineQueryFilter;
    /** 已办 Tab 重置时恢复默认 30 天时间窗 */
    variant?: 'mine' | 'done' | 'pool' | 'cc';
    /** 本组工单池 · 用户分组选项 */
    poolGroups?: PoolGroupMeta[];
  }>(),
  { variant: 'mine', poolGroups: () => [] },
);

const emit = defineEmits<{
  'update:modelValue': [v: MineQueryFilter];
  search: [];
}>();

const priorities: { value: '' | Priority; label: string }[] = [
  { value: '', label: '全部' },
  { value: 'P0', label: 'P0' },
  { value: 'P1', label: 'P1' },
  { value: 'P2', label: 'P2' },
  { value: 'P3', label: 'P3' },
];

const productNameOptions = computed(() =>
  productNamesForCategory(props.modelValue.productCategory),
);

const timePresetLabel = computed(() =>
  MINE_TIME_PRESETS.find((p) => p.value === props.modelValue.timePreset)?.label ?? '全部时间',
);

function patch<K extends keyof MineQueryFilter>(key: K, value: MineQueryFilter[K]) {
  emit('update:modelValue', { ...props.modelValue, [key]: value });
}

function onCategoryChange(value: string) {
  const names = productNamesForCategory(value);
  const kept = names.includes(props.modelValue.productName) ? props.modelValue.productName : '';
  emit('update:modelValue', {
    ...props.modelValue,
    productCategory: value,
    productName: kept,
  });
}

function onTimePresetChange(value: MineTimePreset) {
  emit('update:modelValue', {
    ...props.modelValue,
    timePreset: value,
    dateFrom: value === 'custom' ? props.modelValue.dateFrom : '',
    dateTo: value === 'custom' ? props.modelValue.dateTo : '',
  });
}

function reset() {
  const empty = props.variant === 'done' ? DEFAULT_DONE_QUERY() : EMPTY_MINE_QUERY();
  emit('update:modelValue', empty);
  emit('search');
}

function onEnter() {
  emit('search');
}
</script>

<template>
  <div class="mine-query">
    <div class="query-main">
      <div class="fields">
        <label v-if="variant === 'pool'" class="field field-group">
          <span class="label">用户分组</span>
          <select
            class="select"
            :value="modelValue.poolGroup"
            @change="patch('poolGroup', ($event.target as HTMLSelectElement).value)"
          >
            <option value="">全部</option>
            <option v-for="g in poolGroups" :key="g.id" :value="g.id">{{ g.label }}</option>
          </select>
        </label>
        <label class="field">
          <span class="label">工单号</span>
          <input
            class="input"
            placeholder="精确/模糊"
            :value="modelValue.ticketNo"
            @input="patch('ticketNo', ($event.target as HTMLInputElement).value)"
            @keyup.enter="onEnter"
          />
        </label>
        <label class="field">
          <span class="label">手机号</span>
          <input
            class="input"
            placeholder="客户手机"
            :value="modelValue.phone"
            @input="patch('phone', ($event.target as HTMLInputElement).value)"
            @keyup.enter="onEnter"
          />
        </label>
        <label class="field">
          <span class="label">SN</span>
          <input
            class="input"
            placeholder="设备序列号"
            :value="modelValue.sn"
            @input="patch('sn', ($event.target as HTMLInputElement).value)"
            @keyup.enter="onEnter"
          />
        </label>
        <label class="field field-sm">
          <span class="label">优先级</span>
          <select
            class="select"
            :value="modelValue.priority"
            @change="patch('priority', ($event.target as HTMLSelectElement).value as MineQueryFilter['priority'])"
          >
            <option v-for="p in priorities" :key="p.value || 'all'" :value="p.value">{{ p.label }}</option>
          </select>
        </label>
        <label class="field">
          <span class="label">产品分类</span>
          <select
            class="select"
            :value="modelValue.productCategory"
            @change="onCategoryChange(($event.target as HTMLSelectElement).value)"
          >
            <option value="">全部</option>
            <option v-for="c in PRODUCT_CATEGORIES" :key="c" :value="c">{{ c }}</option>
          </select>
        </label>
        <label class="field field-md">
          <span class="label">产品名称</span>
          <select
            :key="modelValue.productCategory || 'all'"
            class="select"
            :value="modelValue.productName"
            @change="patch('productName', ($event.target as HTMLSelectElement).value)"
          >
            <option value="">全部</option>
            <option v-for="name in productNameOptions" :key="name" :value="name">{{ name }}</option>
          </select>
        </label>
      </div>

      <div class="fields fields-time">
        <label class="field field-time">
          <span class="label">时间区间</span>
          <select
            class="select"
            :value="modelValue.timePreset"
            @change="onTimePresetChange(($event.target as HTMLSelectElement).value as MineTimePreset)"
          >
            <option v-for="p in MINE_TIME_PRESETS" :key="p.value || 'all'" :value="p.value">
              {{ p.label }}
            </option>
          </select>
        </label>
        <template v-if="modelValue.timePreset === 'custom'">
          <label class="field field-date">
            <span class="label">开始日期</span>
            <input
              class="input input-date"
              type="date"
              :value="modelValue.dateFrom"
              @input="patch('dateFrom', ($event.target as HTMLInputElement).value)"
            />
          </label>
          <label class="field field-date">
            <span class="label">结束日期</span>
            <input
              class="input input-date"
              type="date"
              :value="modelValue.dateTo"
              @input="patch('dateTo', ($event.target as HTMLInputElement).value)"
            />
          </label>
        </template>
        <span v-else-if="modelValue.timePreset" class="time-hint">
          按工单更新时间 · {{ timePresetLabel }}
        </span>
      </div>
    </div>

    <div class="actions">
      <button type="button" class="btn-search" @click="emit('search')">
        <SearchOutlined />
        <span>查询</span>
      </button>
      <button type="button" class="btn-reset" @click="reset">重置</button>
    </div>
  </div>
</template>

<style scoped>
.mine-query {
  display: flex;
  align-items: flex-end;
  gap: 12px;
  width: 100%;
  min-width: 0;
  padding: 12px 14px;
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
}
.query-main {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
}
.fields {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 12px;
  min-width: 0;
}
.fields-time {
  padding-top: 2px;
  border-top: 1px dashed #e5e7eb;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 120px;
}
.field-sm {
  min-width: 88px;
}
.field-md {
  width: 148px;
  min-width: 148px;
  flex: none;
}
.field-group {
  width: 160px;
  min-width: 160px;
  flex: none;
}
.field-time {
  min-width: 132px;
}
.field-date {
  min-width: 148px;
}
.label {
  font-size: 11px;
  font-weight: 600;
  color: #6b7280;
}
.input,
.select {
  height: 32px;
  padding: 0 10px;
  font-size: 13px;
  color: #374151;
  background: #fff;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  outline: none;
}
.input-date {
  padding: 0 8px;
}
.input:focus,
.select:focus {
  border-color: #1a6fff;
  box-shadow: 0 0 0 2px rgb(26 111 255 / 12%);
}
.input::placeholder {
  color: #9ca3af;
}
.time-hint {
  align-self: flex-end;
  padding-bottom: 6px;
  font-size: 12px;
  color: #9ca3af;
}
.actions {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 8px;
  flex: none;
}
.btn-search {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 32px;
  padding: 0 14px;
  font-size: 13px;
  font-weight: 600;
  color: #fff;
  background: #1a6fff;
  border: none;
  border-radius: 6px;
  cursor: pointer;
}
.btn-search:hover {
  background: #0f4fcc;
}
.btn-reset {
  height: 32px;
  padding: 0 12px;
  font-size: 13px;
  color: #6b7280;
  background: #fff;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  cursor: pointer;
}
.btn-reset:hover {
  border-color: #9ca3af;
  color: #374151;
}
</style>
