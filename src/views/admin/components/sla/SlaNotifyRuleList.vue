<script setup lang="ts">
import { BellOutlined, DeleteOutlined } from '@ant-design/icons-vue';
import SlaNotifyRulePanel from './SlaNotifyRulePanel.vue';

export interface NotifyRuleRow {
  id: number;
  targets: string[];
  channels: string[];
  template: string;
}

withDefaults(
  defineProps<{
    targetOpts: { value: string; label: string }[];
    channelOpts: { value: string; label: string }[];
    templateOpts: { value: string; label: string }[];
    /** 卡片标签前缀，如 预警 / 升级 */
    tagPrefix?: string;
    /** 顶栏摘要说明 */
    summary?: string;
    /** 标签与图标配色：warn 黄 / danger 红 */
    tone?: 'default' | 'warn' | 'danger';
  }>(),
  { tagPrefix: '规则', tone: 'default' },
);

const items = defineModel<NotifyRuleRow[]>('items', { required: true });

const emit = defineEmits<{ remove: [id: number] }>();
</script>

<template>
  <div class="notify-rule-list">
    <article v-for="(row, idx) in items" :key="row.id" class="notify-rule-card" :class="`notify-rule-card--${tone}`">
      <header class="nrc-header">
        <span class="nrc-tag" :class="`nrc-tag--${tone}`">{{ tagPrefix }} {{ idx + 1 }}</span>
        <div v-if="summary" class="nrc-summary">
          <BellOutlined class="nrc-summary-icon" :class="`nrc-summary-icon--${tone}`" />
          <span>{{ summary }}</span>
        </div>
        <a-button
          type="text"
          size="small"
          danger
          class="nrc-del"
          :disabled="items.length <= 1"
          @click="emit('remove', row.id)"
        >
          <template #icon><DeleteOutlined /></template>
          删除
        </a-button>
      </header>

      <div class="nrc-body">
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
.notify-rule-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(420px, 1fr));
  gap: 14px;
}

.notify-rule-card {
  display: flex;
  flex-direction: column;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  overflow: hidden;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.notify-rule-card:hover {
  border-color: #bfdbfe;
  box-shadow: 0 4px 14px rgba(26, 111, 255, 0.08);
}
.notify-rule-card--warn:hover {
  border-color: #fde68a;
  box-shadow: 0 4px 14px rgba(217, 119, 6, 0.1);
}
.notify-rule-card--danger:hover {
  border-color: #fecaca;
  box-shadow: 0 4px 14px rgba(239, 68, 68, 0.1);
}

.nrc-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  background: linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%);
  border-bottom: 1px solid #e8ecf1;
}
.nrc-tag {
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
.nrc-tag--warn {
  color: #b45309;
  background: #fffbeb;
  border-color: #fde68a;
}
.nrc-tag--danger {
  color: #dc2626;
  background: #fef2f2;
  border-color: #fecaca;
}
.nrc-summary {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  min-width: 0;
  font-size: 13px;
  color: #4b5563;
}
.nrc-summary-icon { font-size: 14px; color: #1a6fff; flex: none; }
.nrc-summary-icon--warn { color: #d97706; }
.nrc-summary-icon--danger { color: #ef4444; }
.nrc-del {
  flex: none;
  margin-left: auto;
  opacity: 0.65;
  font-size: 12px;
}
.nrc-del:hover:not(:disabled) { opacity: 1; }
.nrc-del:disabled { opacity: 0.25; cursor: not-allowed; }

.nrc-body { padding: 14px; min-width: 0; }

@media (max-width: 900px) {
  .notify-rule-list { grid-template-columns: 1fr; }
  .nrc-header { flex-wrap: wrap; }
}
</style>
