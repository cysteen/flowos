<script setup lang="ts">
import { computed, ref } from 'vue';
import { DatePicker } from 'ant-design-vue';
import dayjs, { type Dayjs } from 'dayjs';
import TicketFilterFieldPicker from '@/views/tickets/components/TicketFilterFieldPicker.vue';
import {
  BUSINESS_TYPES,
  CREATE_TICKET_TYPES,
  PROBLEM_TREE,
  TICKET_SOURCE_OPTIONS,
} from '@/views/tickets/types/createTicket';
import {
  DEFAULT_DONE_QUERY,
  EMPTY_MINE_QUERY,
  PRODUCT_CATEGORIES,
  productNamesForCategory,
  resolveMineTimeRange,
  type MineQueryFilter,
  type MineTimePreset,
} from '@/views/tickets/types/mineQuery';
import { fieldsForVariant, type MineFilterFieldKey } from '@/views/tickets/types/mineQueryFields';
import type { NodeStatus, PoolGroupMeta, Priority, SlaState } from '@/views/tickets/types/ticket';

const RangePicker = DatePicker.RangePicker;

const props = withDefaults(
  defineProps<{
    modelValue: MineQueryFilter;
    expanded?: boolean;
    variant?: 'mine' | 'done' | 'pool';
    poolGroups?: PoolGroupMeta[];
    optionalVisible: Record<string, boolean>;
  }>(),
  { expanded: false, variant: 'mine', poolGroups: () => [] },
);

const emit = defineEmits<{
  'update:modelValue': [v: MineQueryFilter];
  search: [];
  'save-filter': [];
  'apply-optional-visible': [v: Record<string, boolean>];
}>();

const pickerOpen = ref(false);

const activeFields = computed(() =>
  fieldsForVariant(props.variant, props.optionalVisible),
);

const priorities: { value: '' | Priority; label: string }[] = [
  { value: '', label: '请选择' },
  { value: 'P0', label: 'P0' },
  { value: 'P1', label: 'P1' },
  { value: 'P2', label: 'P2' },
  { value: 'P3', label: 'P3' },
];

const nodeStatuses: { value: '' | NodeStatus; label: string }[] = [
  { value: '', label: '请选择' },
  { value: '待受理', label: '待受理' },
  { value: '处理中·一线', label: '处理中·一线' },
  { value: '已升级·二线', label: '已升级·二线' },
  { value: '已挂起·待客户', label: '已挂起·待客户' },
  { value: '待审核', label: '待审核' },
];

const slaStates: { value: '' | SlaState; label: string }[] = [
  { value: '', label: '请选择' },
  { value: 'overdue', label: '已超时' },
  { value: 'soon', label: '临期' },
  { value: 'ok', label: '充足' },
  { value: 'paused', label: '已停表' },
];

const productNameOptions = computed(() =>
  productNamesForCategory(props.modelValue.productCategory),
);

const problemL1Options = computed(() => Object.keys(PROBLEM_TREE));

const problemL2Options = computed(() =>
  props.modelValue.problemL1 ? Object.keys(PROBLEM_TREE[props.modelValue.problemL1] ?? {}) : [],
);

const problemL3Options = computed(() => {
  const { problemL1, problemL2 } = props.modelValue;
  if (!problemL1 || !problemL2) return [];
  return PROBLEM_TREE[problemL1]?.[problemL2] ?? [];
});

function buildPresetRange(days: number): [Dayjs, Dayjs] {
  const end = dayjs().endOf('day');
  const start = dayjs().subtract(days - 1, 'day').startOf('day');
  return [start, end];
}

const rangePresets = [
  { label: '最近一周', value: () => buildPresetRange(7) },
  { label: '最近一个月', value: () => buildPresetRange(30) },
  { label: '最近三个月', value: () => buildPresetRange(90) },
];

const rangeValue = computed(() => {
  const resolved = resolveMineTimeRange(props.modelValue);
  if (!resolved) return undefined;
  return [dayjs(resolved.from), dayjs(resolved.to)] as [Dayjs, Dayjs];
});

function detectTimePreset(start: Dayjs, end: Dayjs): MineTimePreset {
  const pairs: [MineTimePreset, number][] = [
    ['7d', 7],
    ['30d', 30],
    ['90d', 90],
  ];
  for (const [preset, days] of pairs) {
    const [s, e] = buildPresetRange(days);
    if (s.isSame(start, 'day') && e.isSame(end, 'day')) return preset;
  }
  return 'custom';
}

function onRangeChange(dates: [Dayjs, Dayjs] | [string, string] | null) {
  if (!dates || !dates[0] || !dates[1]) {
    emit('update:modelValue', {
      ...props.modelValue,
      timePreset: '',
      dateFrom: '',
      dateTo: '',
    });
    emit('search');
    return;
  }

  const start = dayjs(dates[0]);
  const end = dayjs(dates[1]);
  const preset = detectTimePreset(start, end);

  emit('update:modelValue', {
    ...props.modelValue,
    timePreset: preset,
    dateFrom: preset === 'custom' ? start.format('YYYY-MM-DD') : '',
    dateTo: preset === 'custom' ? end.format('YYYY-MM-DD') : '',
  });
  emit('search');
}

function patch<K extends keyof MineQueryFilter>(key: K, value: MineQueryFilter[K], autoSearch = true) {
  emit('update:modelValue', { ...props.modelValue, [key]: value });
  if (autoSearch) emit('search');
}

function onCategoryChange(value: string) {
  const names = productNamesForCategory(value);
  const kept = names.includes(props.modelValue.productName) ? props.modelValue.productName : '';
  emit('update:modelValue', {
    ...props.modelValue,
    productCategory: value,
    productName: kept,
  });
  emit('search');
}

function onProblemL1Change(value: string) {
  // 仅选定一类，二/三类清空交由用户选择（不再自动填第一项，避免施加用户未选的过滤）
  emit('update:modelValue', {
    ...props.modelValue,
    problemL1: value,
    problemL2: '',
    problemL3: '',
  });
  emit('search');
}

function onProblemL2Change(value: string) {
  emit('update:modelValue', {
    ...props.modelValue,
    problemL2: value,
    problemL3: '',
  });
  emit('search');
}

function reset() {
  const empty = props.variant === 'done' ? DEFAULT_DONE_QUERY() : EMPTY_MINE_QUERY();
  emit('update:modelValue', empty);
  emit('search');
}

function onEnter() {
  emit('search');
}

function onSaveFilter() {
  emit('save-filter');
}

function onApplyOptionalVisible(next: Record<string, boolean>) {
  emit('apply-optional-visible', next);
}

function fieldLabel(key: MineFilterFieldKey): string {
  return activeFields.value.find((f) => f.key === key)?.label ?? key;
}
</script>

<template>
  <div v-show="expanded" class="mine-query">
    <div class="query-filters">
      <div class="filter-scroll">
        <template v-for="f in activeFields" :key="f.key">
          <label v-if="f.key === 'poolGroup'" class="filter-item">
            <span class="fi-label">{{ fieldLabel('poolGroup') }}</span>
            <select
              class="fi-control"
              :value="modelValue.poolGroup"
              @change="patch('poolGroup', ($event.target as HTMLSelectElement).value)"
            >
              <option value="">请选择</option>
              <option v-for="g in poolGroups" :key="g.id" :value="g.id">{{ g.label }}</option>
            </select>
          </label>

          <label v-else-if="f.key === 'phone'" class="filter-item">
            <span class="fi-label">{{ fieldLabel('phone') }}</span>
            <input
              class="fi-control fi-input"
              placeholder="请输入"
              :value="modelValue.phone"
              @input="patch('phone', ($event.target as HTMLInputElement).value, false)"
              @keyup.enter="onEnter"
            />
          </label>

          <label v-else-if="f.key === 'sn'" class="filter-item">
            <span class="fi-label">{{ fieldLabel('sn') }}</span>
            <input
              class="fi-control fi-input"
              placeholder="请输入"
              :value="modelValue.sn"
              @input="patch('sn', ($event.target as HTMLInputElement).value, false)"
              @keyup.enter="onEnter"
            />
          </label>

          <label v-else-if="f.key === 'priority'" class="filter-item">
            <span class="fi-label">{{ fieldLabel('priority') }}</span>
            <select
              class="fi-control"
              :value="modelValue.priority"
              @change="patch('priority', ($event.target as HTMLSelectElement).value as MineQueryFilter['priority'])"
            >
              <option v-for="p in priorities" :key="p.value || 'all'" :value="p.value">{{ p.label }}</option>
            </select>
          </label>

          <label v-else-if="f.key === 'productCategory'" class="filter-item">
            <span class="fi-label">{{ fieldLabel('productCategory') }}</span>
            <select
              class="fi-control"
              :value="modelValue.productCategory"
              @change="onCategoryChange(($event.target as HTMLSelectElement).value)"
            >
              <option value="">请选择</option>
              <option v-for="c in PRODUCT_CATEGORIES" :key="c" :value="c">{{ c }}</option>
            </select>
          </label>

          <label v-else-if="f.key === 'productName'" class="filter-item filter-item-wide">
            <span class="fi-label">{{ fieldLabel('productName') }}</span>
            <select
              :key="modelValue.productCategory || 'all'"
              class="fi-control"
              :value="modelValue.productName"
              @change="patch('productName', ($event.target as HTMLSelectElement).value)"
            >
              <option value="">请选择</option>
              <option v-for="name in productNameOptions" :key="name" :value="name">{{ name }}</option>
            </select>
          </label>

          <label v-else-if="f.key === 'timePreset'" class="filter-item filter-item-date">
            <span class="fi-label">{{ fieldLabel('timePreset') }}</span>
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

          <label v-else-if="f.key === 'customer'" class="filter-item">
            <span class="fi-label">{{ fieldLabel('customer') }}</span>
            <input
              class="fi-control fi-input"
              placeholder="请输入"
              :value="modelValue.customer"
              @input="patch('customer', ($event.target as HTMLInputElement).value, false)"
              @keyup.enter="onEnter"
            />
          </label>

          <label v-else-if="f.key === 'nodeStatus'" class="filter-item">
            <span class="fi-label">{{ fieldLabel('nodeStatus') }}</span>
            <select
              class="fi-control"
              :value="modelValue.nodeStatus"
              @change="patch('nodeStatus', ($event.target as HTMLSelectElement).value)"
            >
              <option v-for="s in nodeStatuses" :key="s.value || 'all'" :value="s.value">{{ s.label }}</option>
            </select>
          </label>

          <label v-else-if="f.key === 'assignee'" class="filter-item">
            <span class="fi-label">{{ fieldLabel('assignee') }}</span>
            <input
              class="fi-control fi-input"
              placeholder="请输入"
              :value="modelValue.assignee"
              @input="patch('assignee', ($event.target as HTMLInputElement).value, false)"
              @keyup.enter="onEnter"
            />
          </label>

          <label v-else-if="f.key === 'businessType'" class="filter-item">
            <span class="fi-label">{{ fieldLabel('businessType') }}</span>
            <select
              class="fi-control"
              :value="modelValue.businessType"
              @change="patch('businessType', ($event.target as HTMLSelectElement).value)"
            >
              <option value="">请选择</option>
              <option v-for="b in BUSINESS_TYPES" :key="b" :value="b">{{ b }}</option>
            </select>
          </label>

          <label v-else-if="f.key === 'ticketType'" class="filter-item">
            <span class="fi-label">{{ fieldLabel('ticketType') }}</span>
            <select
              class="fi-control"
              :value="modelValue.ticketType"
              @change="patch('ticketType', ($event.target as HTMLSelectElement).value as MineQueryFilter['ticketType'])"
            >
              <option value="">请选择</option>
              <option v-for="t in CREATE_TICKET_TYPES" :key="t" :value="t">{{ t }}</option>
            </select>
          </label>

          <label v-else-if="f.key === 'ticketSource'" class="filter-item">
            <span class="fi-label">{{ fieldLabel('ticketSource') }}</span>
            <select
              class="fi-control"
              :value="modelValue.ticketSource"
              @change="patch('ticketSource', ($event.target as HTMLSelectElement).value as MineQueryFilter['ticketSource'])"
            >
              <option value="">请选择</option>
              <option v-for="s in TICKET_SOURCE_OPTIONS" :key="s" :value="s">{{ s }}</option>
            </select>
          </label>

          <label v-else-if="f.key === 'problemL1'" class="filter-item">
            <span class="fi-label">{{ fieldLabel('problemL1') }}</span>
            <select
              class="fi-control"
              :value="modelValue.problemL1"
              @change="onProblemL1Change(($event.target as HTMLSelectElement).value)"
            >
              <option value="">请选择</option>
              <option v-for="v in problemL1Options" :key="v" :value="v">{{ v }}</option>
            </select>
          </label>

          <label v-else-if="f.key === 'problemL2'" class="filter-item">
            <span class="fi-label">{{ fieldLabel('problemL2') }}</span>
            <select
              class="fi-control"
              :value="modelValue.problemL2"
              :disabled="!modelValue.problemL1"
              @change="onProblemL2Change(($event.target as HTMLSelectElement).value)"
            >
              <option value="">请选择</option>
              <option v-for="v in problemL2Options" :key="v" :value="v">{{ v }}</option>
            </select>
          </label>

          <label v-else-if="f.key === 'problemL3'" class="filter-item">
            <span class="fi-label">{{ fieldLabel('problemL3') }}</span>
            <select
              class="fi-control"
              :value="modelValue.problemL3"
              :disabled="!modelValue.problemL2"
              @change="patch('problemL3', ($event.target as HTMLSelectElement).value)"
            >
              <option value="">请选择</option>
              <option v-for="v in problemL3Options" :key="v" :value="v">{{ v }}</option>
            </select>
          </label>

          <label v-else-if="f.key === 'resolveTimeRemark'" class="filter-item filter-item-wide">
            <span class="fi-label">{{ fieldLabel('resolveTimeRemark') }}</span>
            <input
              class="fi-control fi-input"
              placeholder="请输入"
              :value="modelValue.resolveTimeRemark"
              @input="patch('resolveTimeRemark', ($event.target as HTMLInputElement).value, false)"
              @keyup.enter="onEnter"
            />
          </label>

          <label v-else-if="f.key === 'slaState'" class="filter-item">
            <span class="fi-label">{{ fieldLabel('slaState') }}</span>
            <select
              class="fi-control"
              :value="modelValue.slaState"
              @change="patch('slaState', ($event.target as HTMLSelectElement).value as MineQueryFilter['slaState'])"
            >
              <option v-for="s in slaStates" :key="s.value || 'all'" :value="s.value">{{ s.label }}</option>
            </select>
          </label>

          <label v-else-if="f.key === 'groupName'" class="filter-item">
            <span class="fi-label">{{ fieldLabel('groupName') }}</span>
            <input
              class="fi-control fi-input"
              placeholder="请输入"
              :value="modelValue.groupName"
              @input="patch('groupName', ($event.target as HTMLInputElement).value, false)"
              @keyup.enter="onEnter"
            />
          </label>
        </template>
      </div>

      <div class="filter-actions">
        <TicketFilterFieldPicker
          v-model:open="pickerOpen"
          :variant="variant"
          :optional-visible="optionalVisible"
          @confirm="onApplyOptionalVisible"
        >
          <button type="button" class="link-btn" @click="pickerOpen = !pickerOpen">+ 筛选</button>
        </TicketFilterFieldPicker>
        <button type="button" class="link-btn" @click="onSaveFilter">保存筛选器</button>
        <button type="button" class="link-btn" @click="reset">重置</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.mine-query {
  display: flex;
  flex-direction: column;
  width: 100%;
  min-width: 0;
}

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
}

.link-btn:hover {
  color: #0f4fcc;
  text-decoration: underline;
}
</style>
