<script setup lang="ts">
import { CalendarOutlined } from '@ant-design/icons-vue';
import OpAppointmentRecords from '../OpAppointmentRecords.vue';
import type { AppointmentRecord } from '@/views/tickets/types/operation';

defineProps<{
  records: AppointmentRecord[];
  /** 当前坐席，作为新增预约的默认预约人 */
  defaultBooker?: string;
}>();

const emit = defineEmits<{ 'update:records': [v: AppointmentRecord[]] }>();
</script>

<template>
  <div class="appt-tab">
    <div class="appt-head">
      <span class="appt-title"><CalendarOutlined />预约（上门 / 回访）</span>
      <span class="appt-hint">谁发起、约什么时间、要做什么——预约人与预约需求均需填写</span>
    </div>
    <OpAppointmentRecords
      :records="records"
      :default-booker="defaultBooker"
      @update:records="emit('update:records', $event)"
    />
  </div>
</template>

<style scoped>
.appt-tab { display: flex; flex-direction: column; gap: 12px; width: 100%; }
.appt-head { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
.appt-title {
  font-size: 14px; font-weight: 700; color: #111827;
  display: inline-flex; align-items: center; gap: 6px;
}
.appt-hint { font-size: 11px; color: #9ca3af; }
</style>
