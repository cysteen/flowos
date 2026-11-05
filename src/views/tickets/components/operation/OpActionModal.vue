<script setup lang="ts">
import { computed, type CSSProperties } from 'vue';
import type { ButtonProps } from 'ant-design-vue';

type Tone = 'primary' | 'success' | 'warn' | 'danger';

const props = withDefaults(
  defineProps<{
    open: boolean;
    title: string;
    /**
     * 标题同行副标题（如「二线报备 · IFLYZX-…」）：写这次动作的**来源与对象**。
     * 不传则不出、标题行与没有它时一模一样。
     */
    subtitle?: string;
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
    /** 主按钮置灰时的悬停提示；仅在 okDisabled 为真时生效 */
    okDisabledTip?: string;
    confirmLoading?: boolean;
    /** 不要页脚（纯查看的弹窗） */
    noFooter?: boolean;
    /** 页脚只留主按钮 */
    hideCancel?: boolean;
    /** 弹窗根节点附加类名（个别弹窗的样式取值） */
    modalClass?: string;
  }>(),
  {
    subtitle: '',
    icon: undefined,
    tone: 'primary',
    width: 480,
    okText: '确认',
    cancelText: '取消',
    okTone: 'primary',
    okDisabled: false,
    confirmLoading: false,
    noFooter: false,
    hideCancel: false,
    modalClass: undefined,
  },
);

const emit = defineEmits<{
  'update:open': [v: boolean];
  ok: [];
  cancel: [];
}>();

/** style 不在 antd 的 ButtonProps 声明内（行内样式走 HTML attrs），故单独并进来 */
type OkButtonProps = ButtonProps & { style?: CSSProperties; title?: string };

const okButtonProps = computed<OkButtonProps>(() => {
  const base: OkButtonProps = { disabled: props.okDisabled };
  if (props.okDisabled && props.okDisabledTip) base.title = props.okDisabledTip;
  if (props.okTone === 'danger') return { ...base, danger: true };
  if (props.okTone === 'success') {
    return { ...base, type: 'primary', style: { background: '#059669', borderColor: '#059669' } };
  }
  return { ...base, type: 'primary' };
});

const cancelButtonProps = computed<OkButtonProps | undefined>(() => (props.hideCancel ? { style: { display: 'none' } } : undefined));

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
    :wrap-class-name="modalClass"
    :cancel-button-props="cancelButtonProps"
    v-bind="noFooter ? { footer: null } : {}"
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
        <div class="opm-title-body">
          <span class="opm-title-text">{{ title }}</span>
          <span v-if="subtitle" class="opm-subtitle">{{ subtitle }}</span>
        </div>
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
.opm-title-body {
  display: flex;
  flex-direction: row;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
  flex-wrap: nowrap;
}
.opm-title-text {
  font-size: 15px;
  font-weight: 700;
  color: #111827;
  line-height: 1.3;
  white-space: nowrap;
  flex: none;
}
.opm-subtitle {
  font-size: 12px;
  font-weight: 500;
  color: #6b7280;
  line-height: 1.4;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}
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
.op-field-h {
  flex-direction: row;
  align-items: center;
  gap: 10px;
}
.op-field-h > .op-label {
  flex: none;
  width: 84px;
  text-align: right;
  white-space: nowrap;
}
.op-field-h > .ant-select,
.op-field-h > .ant-input,
.op-field-h > textarea.ant-input {
  flex: 1;
  min-width: 0;
}
.op-field-h-top { align-items: flex-start; }
.op-field-h-top > .op-label { padding-top: 6px; }

/** 字段下方的轻量说明（如权限受限提示），不占提示条的视觉权重 */
.op-hint { font-size: 12px; color: #9ca3af; line-height: 1.5; }

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
.op-box-line { color: #6b7280; line-height: 1.6; }
.op-prefill { display: flex; flex-direction: column; gap: 4px; color: #374151; line-height: 1.6; }
.op-prefill > div > span { display: inline-block; width: 40px; color: #9ca3af; }
.op-prefill-note { color: #9ca3af; margin-top: 4px; }
.op-kv-row { display: flex; justify-content: space-between; gap: 12px; color: #6b7280; }
.op-kv-row span:last-child { color: #374151; font-weight: 500; }
.op-mono { font-family: ui-monospace, monospace; }

.op-radio-cards { display: flex; flex-direction: column; gap: 8px; width: 100%; }
.op-radio-cards--row {
  flex-direction: row;
  align-items: stretch;
}
.op-radio-cards--row .op-radio-card {
  flex: 1;
  min-width: 0;
}
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

.op-delegate-modal .ant-modal-content { border-radius: 12px; padding: 16px; }
.op-delegate-modal .ant-modal-footer .ant-btn { height: 36px; padding: 8px 15px; font-size: 14px; line-height: 18px; border-radius: 6px; }
.op-delegate-modal .ant-modal-footer .ant-btn-default { color: #606266; border-color: #dcdfe6; }
.op-delegate-modal .ant-modal-footer .ant-btn-primary { background: #5d87ff; border-color: #5d87ff; margin-inline-start: 12px; }
.op-delegate-modal .opm-title-text { color: #303133; }
.op-delegate-modal .ant-radio-wrapper-checked { color: #5d87ff; }
.op-delegate-modal .ant-radio-checked .ant-radio-inner { background: #5d87ff; border-color: #5d87ff; }
.op-delegate-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.op-delegate-head > .op-label { margin: 0; }
.op-delegate-count { margin-left: 6px; font-size: 12px; font-weight: 400; color: #909399; }
.op-delegate-list { display: flex; flex-direction: column; gap: 6px; }
.op-delegate-card { padding: 8px 10px; background: #fafafa; border: 1px solid #ebeef5; border-radius: 6px; }
.op-delegate-row { display: flex; align-items: center; gap: 8px; }
.op-delegate-idx {
  flex: none;
  display: inline-flex; align-items: center; justify-content: center;
  width: 18px; height: 18px; border-radius: 50%;
  background: #ebeef5; color: #909399; font-size: 11px; font-weight: 600;
}
.op-delegate-person { flex: 0 0 140px; width: 140px; min-width: 0; }
.op-delegate-person .ant-select-selector { height: 36px !important; border-radius: 6px !important; }
.op-delegate-person .ant-select-selection-item,
.op-delegate-person .ant-select-selection-placeholder { line-height: 34px !important; font-size: 14px; }
.op-delegate-task { position: relative; flex: 1; min-width: 0; }
.op-delegate-task textarea.ant-input {
  display: block; min-height: 36px; padding: 7px 11px; font-size: 14px; line-height: 20px; border-radius: 6px; resize: none;
}
.op-delegate-text-count {
  position: absolute; right: 8px; bottom: 3px; padding-left: 4px;
  font-size: 12px; line-height: 14px; color: #909399; background: #fff; pointer-events: none;
}
.op-delegate-remove {
  flex: none;
  display: inline-flex; align-items: center; justify-content: center;
  width: 22px; height: 22px; border: none; background: transparent;
  color: #9ca3af; cursor: pointer; border-radius: 4px; padding: 0; font-size: 12px;
}
.op-delegate-remove:hover { color: #ef4444; background: #fef2f2; }
.op-delegate-add {
  display: inline-flex; align-items: center; justify-content: center; gap: 4px;
  flex: none; height: 26px; padding: 0 10px;
  border: 1px dashed #dcdfe6; border-radius: 6px;
  background: #fff; color: #5d87ff; font-size: 12px; font-weight: 500; cursor: pointer;
}
.op-delegate-add:hover:not(:disabled) { border-color: #5d87ff; background: #eff6ff; }
.op-delegate-add:disabled { color: #c0c4cc; background: #f5f7fa; cursor: not-allowed; }
.op-delegate-group { display: flex; flex-direction: column; gap: 6px; }
.op-delegate-group-row { display: flex; gap: 8px; align-items: flex-end; }
.op-delegate-group-row > .op-field { flex: 1; min-width: 0; gap: 4px; }
.op-delegate-group .op-delegate-person { flex: none; width: 100%; }
.op-delegate-group .op-field { gap: 4px; }

</style>
