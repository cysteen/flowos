<script setup lang="ts">
import { ClockCircleOutlined, DeleteOutlined } from '@ant-design/icons-vue';
import SlaNotifyRulePanel from './SlaNotifyRulePanel.vue';

export interface PreAlertRow {
  id: number;
  minutesBefore: number;
  targets: string[];
  channels: string[];
  template: string;
}

defineProps<{
  targetOpts: { value: string; label: string }[];
  channelOpts: { value: string; label: string }[];
  templateOpts: { value: string; label: string }[];
}>();

const items = defineModel<PreAlertRow[]>('items', { required: true });

const emit = defineEmits<{ remove: [id: number] }>();
</script>

<template>
  <div class="pre-alert-list">
    <article v-for="(row, idx) in items" :key="row.id" class="pre-alert-card">
      <header class="pac-header">
        <span class="pac-tag">提醒 {{ idx + 1 }}</span>
        <div class="pac-time">
          <ClockCircleOutlined class="pac-time-icon" />
          <span class="pac-time-text">到期前</span>
          <a-input-number
            v-model:value="row.minutesBefore"
            :min="1"
            size="small"
            class="pac-minutes"
          />
          <span class="pac-time-text">分钟</span>
        </div>
        <a-button
          type="text"
          size="small"
          danger
          class="pac-del"
          :disabled="items.length <= 1"
          @click="emit('remove', row.id)"
        >
          <template #icon><DeleteOutlined /></template>
          删除
        </a-button>
      </header>

      <div class="pac-body">
        <SlaNotifyRulePanel
          v-model:targets="row.targets"
          v-model:channels="row.channels"
          v-model:template="row.template"
          layout="rows"
          :target-opts="targetOpts"
          :channel-opts="channelOpts"
          :template-opts="templateOpts"
        />
      </div>
    </article>
  </div>
</template>

<style scoped>
.pre-alert-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(420px, 1fr));
  gap: 14px;
}

.pre-alert-card {
  display: flex;
  flex-direction: column;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  overflow: hidden;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.pre-alert-card:hover {
  border-color: #bfdbfe;
  box-shadow: 0 4px 14px rgba(26, 111, 255, 0.08);
}

.pac-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  background: linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%);
  border-bottom: 1px solid #e8ecf1;
}
.pac-tag {
  font-size: 11px;
  font-weight: 600;
  color: #1a6fff;
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  border-radius: 4px;
  padding: 2px 8px;
  line-height: 1.4;
  flex: none;
}
.pac-time {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  min-width: 0;
}
.pac-time-icon { font-size: 14px; color: #1a6fff; flex: none; }
.pac-time-text { font-size: 13px; color: #4b5563; flex: none; }
.pac-minutes { width: 64px !important; flex: none; }
.pac-minutes :deep(.ant-input-number-input) {
  text-align: center;
  font-weight: 600;
  color: #1a6fff;
}
.pac-del {
  flex: none;
  margin-left: auto;
  opacity: 0.65;
  font-size: 12px;
}
.pac-del:hover:not(:disabled) { opacity: 1; }
.pac-del:disabled { opacity: 0.25; cursor: not-allowed; }

.pac-body { padding: 14px; min-width: 0; }
.pac-body :deep(.notify-panel) {
  padding: 12px 14px;
  gap: 10px;
}

@media (max-width: 900px) {
  .pre-alert-list { grid-template-columns: 1fr; }
  .pac-header { flex-wrap: wrap; }
  .pac-time { flex: 1 1 auto; }
}
</style>
