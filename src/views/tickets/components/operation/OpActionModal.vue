<script setup lang="ts">
import { computed } from 'vue';

type Tone = 'primary' | 'success' | 'warn' | 'danger';

const props = withDefaults(
  defineProps<{
    open: boolean;
    title: string;
    /** 标题左侧图标组件（如 SwapOutlined）；不传则无图标徽标 */
    icon?: unknown;
    /** 图标徽标配色 */
    tone?: Tone;
    width?: number;
    okText?: string;
    cancelText?: string;
    /** 主按钮配色：primary 蓝 / success 绿 / danger 红 */
    okTone?: 'primary' | 'success' | 'danger';
    okDisabled?: boolean;
    confirmLoading?: boolean;
  }>(),
  {
    icon: undefined,
    tone: 'primary',
    width: 480,
    okText: '确认',
    cancelText: '取消',
    okTone: 'primary',
    okDisabled: false,
    confirmLoading: false,
  },
);

const emit = defineEmits<{
  'update:open': [v: boolean];
  ok: [];
  cancel: [];
}>();

const okButtonProps = computed(() => {
  const base: Record<string, unknown> = { disabled: props.okDisabled };
  if (props.okTone === 'danger') return { ...base, danger: true };
  if (props.okTone === 'success') {
    return { ...base, type: 'primary', style: { background: '#059669', borderColor: '#059669' } };
  }
  return { ...base, type: 'primary' };
});

function onCancel() {
  emit('cancel');
  emit('update:open', false);
}
</script>

<template>
  <a-modal
    :open="open"
    :width="width"
    :ok-text="okText"
    :cancel-text="cancelText"
    :ok-button-props="okButtonProps"
    :confirm-loading="confirmLoading"
    :mask-closable="false"
    destroy-on-close
    @update:open="emit('update:open', $event)"
    @ok="emit('ok')"
    @cancel="onCancel"
  >
    <template #title>
      <div class="opm-title">
        <span v-if="icon" class="opm-icon" :class="`tone-${tone}`">
          <component :is="icon" />
        </span>
        <span class="opm-title-text">{{ title }}</span>
      </div>
    </template>

    <div class="op-modal-body">
      <slot />
    </div>
  </a-modal>
</template>

<style scoped>
.opm-title { display: flex; align-items: center; gap: 10px; }
.opm-icon {
  display: flex; align-items: center; justify-content: center;
  width: 32px; height: 32px; border-radius: 8px; font-size: 16px; flex: none;
}
.opm-icon.tone-primary { background: #eff6ff; color: #1a6fff; }
.opm-icon.tone-success { background: #ecfdf5; color: #059669; }
.opm-icon.tone-warn { background: #fff7ed; color: #ea580c; }
.opm-icon.tone-danger { background: #fef2f2; color: #dc2626; }
.opm-title-text { font-size: 15px; font-weight: 700; color: #111827; line-height: 1.3; }
.op-modal-body { padding: 2px 0; }
</style>

<!-- 全局表单原子类：所有走 OpActionModal 的弹窗共用同一套字段/必填/提示/单选卡片样式 -->
<style>
.op-form { display: flex; flex-direction: column; gap: 14px; }
.op-field { display: flex; flex-direction: column; gap: 6px; }
.op-field-row { display: flex; gap: 12px; align-items: flex-start; }
.op-field-row > .op-field { flex: 1; min-width: 0; }
.op-label { font-size: 13px; color: #374151; font-weight: 500; }
.op-label.req::before { content: '* '; color: #ef4444; }

.op-tip { font-size: 12px; padding: 10px 12px; border-radius: 8px; line-height: 1.5; }
.op-tip-info { background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; }
.op-tip-warn { background: #fffbeb; color: #b45309; border: 1px solid #fde68a; }
.op-tip-ok { background: #ecfdf5; color: #059669; border: 1px solid #a7f3d0; }

.op-box {
  background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px 14px;
  display: flex; flex-direction: column; gap: 6px; font-size: 12px;
}
.op-box-warn { background: #fffbeb; border-color: #fde68a; }
.op-box-title { font-weight: 600; color: #b45309; margin-bottom: 4px; }
.op-kv-row { display: flex; justify-content: space-between; gap: 12px; color: #6b7280; }
.op-kv-row span:last-child { color: #374151; font-weight: 500; }
.op-mono { font-family: ui-monospace, monospace; }

.op-radio-cards { display: flex; flex-direction: column; gap: 8px; width: 100%; }
.op-radio-card {
  display: flex; align-items: flex-start; gap: 10px; padding: 12px;
  border: 1px solid #e5e7eb; border-radius: 8px; cursor: pointer;
}
.op-radio-card.on { border-color: #10b981; background: #f0fdf4; }
.op-rc-title { font-size: 13px; font-weight: 600; color: #111827; }
.op-rc-sub { font-size: 11px; color: #6b7280; margin-top: 2px; }

/* 精简确认（取消/撤回 等无表单场景） */
.op-confirm { font-size: 13px; color: #374151; line-height: 1.65; }
.op-confirm-strong { color: #111827; font-weight: 600; }
</style>
