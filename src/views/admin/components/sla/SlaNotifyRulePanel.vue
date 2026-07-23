<script setup lang="ts">
import { computed, h } from 'vue';
import { CloseOutlined, UserOutlined, NotificationOutlined, FileTextOutlined } from '@ant-design/icons-vue';

const props = withDefaults(
  defineProps<{
    targetOpts: { value: string; label: string }[];
    channelOpts: { value: string; label: string }[];
    templateOpts: { value: string; label: string }[];
    compact?: boolean;
    /** grid：三列并排；rows：key-value 同行，三行展示 */
    layout?: 'grid' | 'rows';
  }>(),
  { layout: 'grid' },
);

const targets = defineModel<string[]>('targets', { required: true });
/** 通知方式仅单选 */
const channel = defineModel<string>('channel', { required: true });
const template = defineModel<string>('template', { required: true });

const maxTagCount = computed(() =>
  props.layout === 'rows' ? 3 : props.compact ? 2 : 'responsive',
);

function tagRender(opt: { label: unknown; closable: boolean; onClose: () => void }) {
  return h(
    'span',
    {
      class: 'notify-tag',
      onMousedown: (e: MouseEvent) => e.preventDefault(),
    },
    [
      h('span', { class: 'notify-tag-text' }, String(opt.label)),
      opt.closable &&
        h(CloseOutlined, {
          class: 'notify-tag-close',
          onClick: (e: MouseEvent) => {
            e.stopPropagation();
            opt.onClose();
          },
        }),
    ],
  );
}

function maxTagPlaceholder(omitted: unknown[]) {
  return h('span', { class: 'notify-tag notify-tag--more' }, `+${omitted.length}`);
}
</script>

<template>
  <div
    class="notify-panel"
    :class="{
      'notify-panel--compact': compact,
      'notify-panel--rows': layout === 'rows',
    }"
  >
    <div class="notify-panel-field">
      <div class="npf-head">
        <UserOutlined v-if="layout === 'grid'" class="npf-icon" />
        <span>通知对象</span>
      </div>
      <a-select
        v-model:value="targets"
        mode="multiple"
        size="small"
        :max-tag-count="maxTagCount"
        :tag-render="tagRender"
        :max-tag-placeholder="maxTagPlaceholder"
        placeholder="选择接收人"
        :options="targetOpts"
        class="npf-control"
      />
    </div>
    <div class="notify-panel-field">
      <div class="npf-head">
        <NotificationOutlined v-if="layout === 'grid'" class="npf-icon" />
        <span>通知方式</span>
      </div>
      <a-select
        v-model:value="channel"
        size="small"
        placeholder="选择渠道"
        :options="channelOpts"
        class="npf-control npf-control--single"
        allow-clear
      />
    </div>
    <div class="notify-panel-field notify-panel-field--template">
      <div class="npf-head">
        <FileTextOutlined v-if="layout === 'grid'" class="npf-icon" />
        <span>消息模板</span>
      </div>
      <a-select
        v-model:value="template"
        size="small"
        placeholder="选择模板"
        :options="templateOpts"
        class="npf-control npf-control--single"
      />
    </div>
  </div>
</template>

<style scoped>
.notify-panel {
  display: grid;
  grid-template-columns: 1fr 1fr 1.35fr;
  gap: 12px;
  padding: 14px 16px;
  background: #f8fafc;
  border: 1px solid #e8ecf1;
  border-radius: 8px;
}
.notify-panel--compact {
  padding: 12px 14px;
  gap: 10px;
}
.notify-panel--rows {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 12px;
  background: transparent;
  border: none;
}
.notify-panel-field {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}
.notify-panel--rows .notify-panel-field {
  flex-direction: row;
  align-items: center;
  gap: 10px;
}
.npf-head {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  color: #6b7280;
  line-height: 1;
  flex: none;
}
.notify-panel--rows .npf-head {
  width: 64px;
  justify-content: flex-start;
  color: #374151;
  font-weight: 500;
}
.npf-icon { font-size: 13px; color: #9ca3af; }
.npf-control { width: 100%; min-width: 0; }
.notify-panel--rows .npf-control { flex: 1; }

.npf-control :deep(.ant-select-selector) {
  background: #fff !important;
  border-color: #e5e7eb !important;
  min-height: 28px !important;
  padding: 1px 8px !important;
  align-items: center;
}
.notify-panel--rows .npf-control :deep(.ant-select-selector) {
  border-radius: 6px;
}
.npf-control :deep(.ant-select-selection-overflow) {
  gap: 4px;
  flex-wrap: nowrap;
}
.npf-control :deep(.ant-select-selection-overflow-item) {
  align-self: center;
}
.npf-control :deep(.ant-select-selection-item) {
  background: transparent !important;
  border: none !important;
  margin: 0 !important;
  padding: 0 !important;
  height: auto !important;
  line-height: 1 !important;
}
.npf-control :deep(.notify-tag) {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  height: 22px;
  padding: 0 6px;
  background: #f3f4f6;
  border: 1px solid #e5e7eb;
  border-radius: 4px;
  font-size: 12px;
  color: #374151;
  line-height: 1;
  max-width: 88px;
}
.npf-control :deep(.notify-tag-text) {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.npf-control :deep(.notify-tag-close) {
  font-size: 9px;
  color: #9ca3af;
  cursor: pointer;
  flex: none;
  transition: color 0.15s;
}
.npf-control :deep(.notify-tag-close:hover) {
  color: #ef4444;
}
.npf-control :deep(.notify-tag--more) {
  background: #eff6ff;
  border-color: #bfdbfe;
  color: #1a6fff;
  font-weight: 500;
  max-width: none;
  padding: 0 8px;
}
.npf-control :deep(.ant-select-selection-placeholder) {
  font-size: 12px;
  line-height: 26px;
}
.npf-control--single :deep(.ant-select-selection-item) {
  font-size: 12px;
  line-height: 26px !important;
  color: #374151;
}
.npf-control:hover :deep(.ant-select-selector) { border-color: #bfdbfe !important; }
.npf-control :deep(.ant-select-focused .ant-select-selector) {
  border-color: #1a6fff !important;
  box-shadow: 0 0 0 2px rgba(26, 111, 255, 0.08) !important;
}

@media (max-width: 960px) {
  .notify-panel:not(.notify-panel--rows) { grid-template-columns: 1fr; }
}
</style>
