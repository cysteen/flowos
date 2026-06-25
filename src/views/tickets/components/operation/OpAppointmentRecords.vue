<script setup lang="ts">
import { PlusOutlined, DeleteOutlined, CheckOutlined } from '@ant-design/icons-vue';
import dayjs, { type Dayjs } from 'dayjs';
import type { AppointmentRecord } from '@/views/tickets/types/operation';

const DATE_TIME_FORMAT = 'YYYY-MM-DD HH:mm:ss';

const props = defineProps<{
  records: AppointmentRecord[];
}>();

const emit = defineEmits<{
  'update:records': [v: AppointmentRecord[]];
}>();

function newRecord(): AppointmentRecord {
  return { id: `appt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, scheduledAt: '', done: false };
}

/** 单一出口：仅 emit records，needed（是否需要预约）由父级在同一次 patch 内派生，避免两次独立 patch 互相覆盖 */
function commit(records: AppointmentRecord[]) {
  emit('update:records', records);
}

function toDayjs(value: string): Dayjs | undefined {
  if (!value?.trim()) return undefined;
  const parsed = dayjs(value, DATE_TIME_FORMAT);
  return parsed.isValid() ? parsed : undefined;
}

function updateRecordTime(index: number, value: Dayjs | string | null) {
  const scheduledAt =
    value == null || value === ''
      ? ''
      : typeof value === 'string'
        ? value
        : value.format(DATE_TIME_FORMAT);
  commit(props.records.map((r, i) => (i === index ? { ...r, scheduledAt } : r)));
}

function addRecord() {
  commit([...props.records, newRecord()]);
}

function removeRecord(index: number) {
  commit(props.records.filter((_, i) => i !== index));
}

/** 标记已与客户电话沟通（对齐关联 Tab「标记已读」） */
function markDone(index: number) {
  commit(props.records.map((r, i) => (i === index ? { ...r, done: true } : r)));
}
</script>

<template>
  <div class="appointment-fields">
    <template v-if="records.length">
      <div
        v-for="(record, index) in records"
        :key="record.id"
        class="record-row"
        :class="{ done: record.done }"
      >
        <label class="field-label-sm">预约时间 {{ index + 1 }}</label>
        <a-date-picker
          class="record-picker"
          :value="toDayjs(record.scheduledAt)"
          :disabled="record.done"
          show-time
          :show-time="{ format: 'HH:mm:ss' }"
          :format="DATE_TIME_FORMAT"
          placeholder="请选择预约时间"
          @update:value="(v) => updateRecordTime(index, v)"
        />
        <div class="record-actions">
          <span v-if="record.done" class="record-done-tag">
            <CheckOutlined /> 已沟通
          </span>
          <button
            v-else
            type="button"
            class="record-done-btn"
            @click="markDone(index)"
          >
            标记已沟通
          </button>
          <button
            type="button"
            class="remove-btn"
            title="删除该预约"
            @click="removeRecord(index)"
          >
            <DeleteOutlined />
          </button>
        </div>
      </div>
    </template>

    <p v-else class="empty-hint">暂无预约，如需上门 / 回访请点击「添加预约」</p>

    <button type="button" class="add-btn" @click="addRecord">
      <PlusOutlined />
      添加预约
    </button>
  </div>
</template>

<style scoped>
.appointment-fields {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.empty-hint {
  margin: 0;
  font-size: 12px;
  color: #9ca3af;
}
.record-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.field-label-sm {
  flex: none;
  width: 72px;
  font-size: 11px;
  font-weight: 500;
  color: #6b7280;
  white-space: nowrap;
}
.record-picker {
  flex: 1;
  min-width: 0;
}
.record-picker :deep(.ant-picker) {
  width: 100%;
}
.record-row.done .field-label-sm {
  color: #9ca3af;
}
.record-actions {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.record-done-btn {
  padding: 1px 10px;
  height: 22px;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  background: #fff;
  font-size: 12px;
  color: #1a6fff;
  cursor: pointer;
  white-space: nowrap;
  transition: border-color 0.15s, background 0.15s;
}
.record-done-btn:hover {
  border-color: #1a6fff;
  background: #f5f9ff;
}
.record-done-tag {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 12px;
  color: #16a34a;
  white-space: nowrap;
}
.add-btn,
.remove-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: none;
  background: transparent;
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
  flex: none;
}
.remove-btn {
  padding: 4px;
  color: #9ca3af;
}
.add-btn {
  align-self: flex-start;
  padding: 0;
  color: #1a6fff;
}
.add-btn:hover {
  color: #1557cc;
}
.remove-btn:hover {
  color: #ef4444;
}
</style>
