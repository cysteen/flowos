<script setup lang="ts">
import { ref } from 'vue';
import { CalendarOutlined, PlusOutlined } from '@ant-design/icons-vue';
import OpAppointmentRecords from '../OpAppointmentRecords.vue';
import type { AppointmentRecord } from '@/views/tickets/types/operation';

const props = defineProps<{
  records: AppointmentRecord[];
  /** 当前坐席，作为新增预约的默认预约人 */
  defaultBooker?: string;
  /**
   * 本 Tab 对当前角色只读（矩阵 #45：① ④ 无本 Tab、⑦ ⑧ 只读、⑥ 条件可用暂按不可写）。
   * 新增/保留/取消预约、标记已沟通都是对客动作，只读态下入口不出、处理函数也硬拦。
   */
  readonly?: boolean;
}>();

const emit = defineEmits<{ 'update:records': [v: AppointmentRecord[]] }>();

const recordsRef = ref<InstanceType<typeof OpAppointmentRecords> | null>(null);

function addRecord() {
  if (props.readonly) return;
  recordsRef.value?.addRecord();
}
</script>

<template>
  <div class="appt-tab">
    <div class="appt-head">
      <div class="appt-head-main">
        <span class="appt-title"><CalendarOutlined />预约回访</span>
        <span v-if="readonly" class="appt-hint">当前角色仅可查看预约记录</span>
        <span v-else class="appt-hint">填写预约时间与需求后点「保留」正式登记；已保留的可标记已沟通或取消</span>
      </div>
      <button v-if="!readonly" type="button" class="add-btn" @click="addRecord">
        <PlusOutlined />
        添加预约
      </button>
    </div>
    <OpAppointmentRecords
      ref="recordsRef"
      :records="records"
      :default-booker="defaultBooker"
      :readonly="readonly"
      @update:records="emit('update:records', $event)"
    />
  </div>
</template>

<style scoped>
.appt-tab { display: flex; flex-direction: column; gap: 12px; width: 100%; }
.appt-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  min-width: 0;
}
.appt-head-main {
  display: flex;
  align-items: baseline;
  gap: 10px;
  flex-wrap: wrap;
  flex: 1;
  min-width: 0;
}
.appt-title {
  font-size: 14px; font-weight: 700; color: #111827;
  display: inline-flex; align-items: center; gap: 6px;
}
.appt-hint { font-size: 11px; color: #9ca3af; }
.add-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex: none;
  border: none;
  background: transparent;
  padding: 0;
  font-size: 12px;
  color: #1a6fff;
  cursor: pointer;
  white-space: nowrap;
}
.add-btn:hover {
  color: #1557cc;
}
</style>
