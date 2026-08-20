<script setup lang="ts">
import { CheckOutlined, CloseCircleOutlined } from '@ant-design/icons-vue';
import { Modal, message } from 'ant-design-vue';
import dayjs, { type Dayjs } from 'dayjs';
import type { AppointmentRecord } from '@/views/tickets/types/operation';
import { APPOINTMENT_DEMAND_OPTIONS } from '@/views/tickets/types/operation';

const DATE_TIME_FORMAT = 'YYYY-MM-DD HH:mm:ss';
const demandOptions = APPOINTMENT_DEMAND_OPTIONS.map((v) => ({ value: v, label: v }));

const props = defineProps<{
  records: AppointmentRecord[];
  /** 新增预约时默认预约人（当前坐席） */
  defaultBooker?: string;
}>();

const emit = defineEmits<{
  'update:records': [v: AppointmentRecord[]];
}>();

function isDraft(record: AppointmentRecord): boolean {
  return !!record.draft;
}

function displayLabel(record: AppointmentRecord, index: number): string {
  if (isDraft(record)) return '新预约';
  let n = 0;
  for (let i = 0; i <= index; i++) {
    if (!isDraft(props.records[i]!)) n++;
  }
  return `预约${n}`;
}

function isFieldDisabled(record: AppointmentRecord): boolean {
  return !!record.done || !!record.cancelled;
}

function newRecord(): AppointmentRecord {
  return {
    id: `appt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    scheduledAt: '',
    done: false,
    cancelled: false,
    draft: true,
    booker: props.defaultBooker ?? '',
    demand: undefined,
  };
}

function updateField(index: number, patch: Partial<AppointmentRecord>) {
  commit(props.records.map((r, i) => (i === index ? { ...r, ...patch } : r)));
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
  if (props.records.some(isDraft)) {
    message.info('请先保留或放弃当前草稿预约');
    return;
  }
  commit([...props.records, newRecord()]);
}

function canCommit(record: AppointmentRecord): boolean {
  return !!record.scheduledAt?.trim() && !!record.demand?.trim();
}

/** 保留：校验后正式落盘，计入待回访 */
function commitRecord(index: number) {
  const record = props.records[index];
  if (!canCommit(record)) {
    message.warning('请先填写预约时间与预约需求');
    return;
  }
  commit(props.records.map((r, i) => (i === index ? { ...r, draft: false } : r)));
}

/** 放弃草稿（未保留的新增行，物理移除） */
function discardDraft(index: number) {
  commit(props.records.filter((_, i) => i !== index));
}

/** 标记已与客户电话沟通（对齐关联 Tab「标记已读」） */
function markDone(index: number) {
  commit(props.records.map((r, i) => (i === index ? { ...r, done: true } : r)));
}

/** 取消预约：保留记录、锁定字段、不再计入待回访 */
function cancelRecord(index: number) {
  commit(props.records.map((r, i) => (i === index ? { ...r, cancelled: true } : r)));
}

function confirmCancel(index: number) {
  Modal.confirm({
    title: '取消预约',
    content: '取消后该预约不再计入待回访，记录保留可追溯。',
    okText: '确认取消',
    cancelText: '保留',
    onOk: () => cancelRecord(index),
  });
}

defineExpose({ addRecord });
</script>

<template>
  <div class="appointment-fields">
    <div v-if="records.length" class="records-list">
      <div
        v-for="(record, index) in records"
        :key="record.id"
        class="record-row"
        :class="{ done: record.done, cancelled: record.cancelled, draft: isDraft(record) }"
      >
        <span class="record-idx">
          {{ displayLabel(record, index) }}
        </span>
        <span class="booker-chip" title="预约人为当前登录坐席">
          预约人：{{ record.booker || defaultBooker || '当前坐席' }}
        </span>
        <a-date-picker
          class="record-picker"
          :value="toDayjs(record.scheduledAt)"
          :disabled="isFieldDisabled(record)"
          :show-time="{ format: 'HH:mm:ss' }"
          :format="DATE_TIME_FORMAT"
          placeholder="预约时间"
          @update:value="(v) => updateRecordTime(index, v)"
        />
        <a-select
          class="demand-select"
          :value="record.demand || undefined"
          :disabled="isFieldDisabled(record)"
          :options="demandOptions"
          placeholder="预约需求"
          allow-clear
          @update:value="(v) => updateField(index, { demand: String(v ?? '') })"
        />
        <div class="record-actions">
          <template v-if="isDraft(record)">
            <button
              type="button"
              class="record-save-btn"
              :class="{ disabled: !canCommit(record) }"
              @click="commitRecord(index)"
            >
              保留
            </button>
            <button type="button" class="record-discard-btn" @click="discardDraft(index)">
              放弃
            </button>
          </template>
          <template v-else>
            <span v-if="record.done" class="record-done-tag"><CheckOutlined /> 已沟通</span>
            <span v-else-if="record.cancelled" class="record-cancel-tag"><CloseCircleOutlined /> 已取消</span>
            <template v-else>
              <button type="button" class="record-done-btn" @click="markDone(index)">标记已沟通</button>
              <button type="button" class="record-cancel-btn" @click="confirmCancel(index)">
                取消预约
              </button>
            </template>
          </template>
        </div>
      </div>
    </div>

    <p v-else class="empty-hint">暂无预约，如需上门 / 回访请点击「添加预约」</p>
  </div>
</template>

<style scoped>
.appointment-fields {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.records-list {
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
  padding: 8px 10px;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  min-width: 0;
}
.record-row.draft {
  background: #f8fbff;
  border-color: #bfdbfe;
  border-style: dashed;
}
.record-row.done { background: #f9fafb; }
.record-row.cancelled { background: #fafafa; border-color: #e5e7eb; border-style: solid; }
.record-idx { flex: none; font-size: 12px; font-weight: 600; color: #374151; }
.record-row.draft .record-idx { color: #1a6fff; }
.booker-chip {
  flex: none; font-size: 12px; color: #4b5563;
  background: #f3f4f6; border-radius: 4px; padding: 3px 8px; white-space: nowrap;
}
.record-picker { flex: none; width: 200px; }
.record-picker :deep(.ant-picker) { width: 100%; }
.demand-select { flex: 1; min-width: 140px; }
.demand-select :deep(.ant-select-selector) {
  height: 32px !important;
  min-height: 32px !important;
}
.record-row.done .booker-chip,
.record-row.cancelled .booker-chip { color: #9ca3af; }
.record-actions {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.record-save-btn,
.record-done-btn,
.record-cancel-btn,
.record-discard-btn {
  padding: 1px 10px;
  height: 22px;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  background: #fff;
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
  transition: border-color 0.15s, background 0.15s;
}
.record-save-btn {
  color: #fff;
  background: #1a6fff;
  border-color: #1a6fff;
}
.record-save-btn:hover:not(.disabled) {
  background: #1557cc;
  border-color: #1557cc;
}
.record-save-btn.disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.record-discard-btn {
  color: #6b7280;
}
.record-discard-btn:hover {
  border-color: #9ca3af;
  color: #374151;
}
.record-done-btn {
  color: #1a6fff;
}
.record-done-btn:hover {
  border-color: #1a6fff;
  background: #f5f9ff;
}
.record-cancel-btn {
  color: #6b7280;
}
.record-cancel-btn:hover {
  border-color: #ef4444;
  color: #ef4444;
  background: #fef2f2;
}
.record-done-tag {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 12px;
  color: #16a34a;
  white-space: nowrap;
}
.record-cancel-tag {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 12px;
  color: #9ca3af;
  white-space: nowrap;
}
</style>
