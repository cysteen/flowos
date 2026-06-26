<script setup lang="ts">
import { computed, ref } from 'vue';
import { Modal, message } from 'ant-design-vue';
import {
  ArrowRightOutlined, VerticalAlignBottomOutlined, PauseCircleOutlined,
  PlayCircleOutlined, RiseOutlined, UndoOutlined, StopOutlined,
  ToolOutlined, CheckCircleOutlined, SaveOutlined, SwapOutlined,
  RollbackOutlined, TeamOutlined,
} from '@ant-design/icons-vue';
import OpActionDialogs from './OpActionDialogs.vue';
import OpForwardModal from './operation/OpForwardModal.vue';
import type { SuspendInfo, OpActionType, TicketOpState } from '../composables/opActions';
import { availableActions } from '../composables/opActionRegistry';
import { MAX_RETURN_COUNT } from '../composables/opActions';

const props = defineProps<{
  ticketNo: string;
  ticketTitle: string;
  ticketType: string;
  afterSaleEnabled: boolean;
  opState: TicketOpState;
  suspendInfo: SuspendInfo | null;
  returnCount?: number;
  draftSavedAt?: string | null;
}>();

const emit = defineEmits<{
  action: [payload: Record<string, unknown>];
  cancel: [];
  withdraw: [];
  transferTicket: [];
}>();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ICONS: Record<string, any> = {
  ArrowRightOutlined, VerticalAlignBottomOutlined, PauseCircleOutlined,
  PlayCircleOutlined, RiseOutlined, UndoOutlined, StopOutlined,
  ToolOutlined, CheckCircleOutlined, SaveOutlined, SwapOutlined,
  RollbackOutlined, TeamOutlined,
};

const DIALOG_ACTIONS: OpActionType[] = [
  '转办', '委派', '强结', '挂起', '恢复', '退回', '升级', '同步飞书', '转售后',
  '标记已解决', '关闭工单', '归档工单',
];

/** 底栏展示顺序（对齐参考原型 bottom-actions + 强结） */
const BAR_ORDER: (OpActionType | '转单')[] = [
  '下送', '升级', '转售后', '撤回', '转办', '委派', '转单', '挂起', '退回', '关闭工单', '强结',
];

const dialogOpen = ref(false);
const dialogAction = ref<OpActionType | null>(null);
const forwardModalOpen = ref(false);

const isTerminal = computed(() => ['closed', 'archived', 'cancelled', 'settled'].includes(props.opState));
const isSuspended = computed(() => props.opState === 'suspended');

const actions = computed(() =>
  availableActions({ ticketType: props.ticketType, afterSaleEnabled: props.afterSaleEnabled }),
);
const actionMap = computed(() => new Map(actions.value.map((a) => [a.key, a])));

interface BarItem {
  key: OpActionType | '转单';
  label: string;
  icon: string;
  danger?: boolean;
  /** 禁止操作示意（如无上一流转可撤回） */
  forbidden?: boolean;
  forbiddenTip?: string;
}

/** 当前工单是否允许撤回（原型默认不可撤回，用于展示禁用态） */
const withdrawBlocked = computed(
  () => !['closed', 'archived', 'cancelled', 'settled'].includes(props.opState),
);

const barActions = computed<BarItem[]>(() => {
  const items: BarItem[] = [];
  for (const key of BAR_ORDER) {
    if (key === '转单') {
      items.push({ key: '转单', label: '转单', icon: 'SwapOutlined' });
      continue;
    }
    const def = actionMap.value.get(key);
    if (!def) continue;
    if (key === '撤回') {
      items.push({
        key: def.key,
        label: def.label,
        icon: def.icon,
        forbidden: withdrawBlocked.value,
        forbiddenTip: '当前无可撤回的操作',
      });
      continue;
    }
    if (key === '挂起') {
      items.push(
        isSuspended.value
          ? { key: '恢复', label: '恢复', icon: 'PlayCircleOutlined' }
          : { key: '挂起', label: '挂起申请', icon: def.icon },
      );
      continue;
    }
    items.push({ key: def.key, label: def.label, icon: def.icon, danger: def.danger });
  }
  return items;
});

function saveDraft() {
  emit('action', { type: '保存草稿' });
}

function run(action: OpActionType | '转单') {
  if (isTerminal.value) return;
  if (action === '转单') {
    emit('transferTicket');
    return;
  }
  if (action === '取消工单') return emit('cancel');
  if (action === '撤回') {
    if (withdrawBlocked.value) {
      message.warning('当前无可撤回的操作');
      return;
    }
    return emit('withdraw');
  }
  if (action === '挂起' && isSuspended.value) return;
  if (action === '恢复' && !isSuspended.value) {
    Modal.info({ title: '提示', content: '当前工单未处于挂起状态' });
    return;
  }
  if (action === '退回') {
    if ((props.returnCount ?? 0) >= MAX_RETURN_COUNT) {
      message.warning(`本工单已退回 ${MAX_RETURN_COUNT} 次，已达上限`);
      return;
    }
  }
  if (action === '下送') {
    forwardModalOpen.value = true;
    return;
  }
  if (DIALOG_ACTIONS.includes(action)) {
    dialogAction.value = action;
    dialogOpen.value = true;
  }
}

function onDialogConfirm(payload: Record<string, unknown>) {
  emit('action', payload);
}

function onForwardConfirm(data: { ticketTitle: string; resolved: boolean }) {
  emit('action', { type: '下送', data });
}
</script>

<template>
  <div class="op-actionbar" :class="{ disabled: isTerminal }">
    <div class="bottom-actions">
      <button
        type="button"
        class="ab-item ab-save"
        :disabled="isTerminal"
        @click="saveDraft"
      >
        <SaveOutlined />
        <span>保存</span>
        <span v-if="draftSavedAt" class="save-hint">已保存 {{ draftSavedAt }}</span>
      </button>

      <button
        v-for="a in barActions"
        :key="a.key"
        type="button"
        class="ab-item"
        :class="{
          danger: a.danger,
          resume: a.key === '恢复',
          forbidden: a.forbidden,
        }"
        :disabled="isTerminal || a.forbidden"
        :title="a.forbidden ? a.forbiddenTip : undefined"
        @click="run(a.key)"
      >
        <span v-if="a.forbidden" class="forbidden-mark" aria-hidden="true">
          <svg viewBox="0 0 100 100" preserveAspectRatio="none">
            <line x1="4" y1="4" x2="96" y2="96" />
            <line x1="96" y1="4" x2="4" y2="96" />
          </svg>
        </span>
        <component :is="ICONS[a.icon]" />
        <span>{{ a.label }}</span>
      </button>
    </div>

    <OpActionDialogs
      v-model:open="dialogOpen"
      :action="dialogAction"
      :ticket-no="ticketNo"
      :suspend-info="suspendInfo"
      :return-count="returnCount ?? 0"
      @confirm="onDialogConfirm"
    />

    <OpForwardModal
      v-model:open="forwardModalOpen"
      :ticket-title="ticketTitle"
      @confirm="onForwardConfirm"
    />
  </div>
</template>

<style scoped>
.op-actionbar {
  position: sticky;
  bottom: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  min-height: 57px;
  padding: 10px 20px;
  background: #fff;
  border-top: 1px solid #e5e7eb;
  box-shadow: 0 -4px 16px rgba(15, 23, 42, 0.06);
}

.op-actionbar.disabled {
  opacity: 0.72;
}

.bottom-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
  padding: 5px 8px;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  box-shadow: 0 2px 12px rgba(15, 23, 42, 0.08);
}

.ab-item {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  font-size: 14px;
  font-weight: 500;
  color: #1f2937;
  background: transparent;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-family: inherit;
  white-space: nowrap;
  transition: background 0.12s, color 0.12s;
}

.ab-item :deep(.anticon) {
  font-size: 16px;
  color: #4b5563;
}

.ab-item:hover:not(:disabled) {
  background: #f3f4f6;
  color: #1a6fff;
}

.ab-item:hover:not(:disabled) :deep(.anticon) {
  color: #1a6fff;
}

.ab-item:disabled {
  cursor: not-allowed;
}

.ab-item.forbidden {
  position: relative;
  color: #9ca3af;
  opacity: 0.72;
  background: #f9fafb;
}

.ab-item.forbidden :deep(.anticon) {
  color: #9ca3af;
}

.ab-item.forbidden .forbidden-mark {
  --forbidden-stroke: #d1d5db;
  position: absolute;
  inset: 6px 8px;
  border: 1.5px solid var(--forbidden-stroke);
  border-radius: 6px;
  pointer-events: none;
  z-index: 1;
}

.ab-item.forbidden .forbidden-mark svg {
  display: block;
  width: 100%;
  height: 100%;
}

.ab-item.forbidden .forbidden-mark line {
  stroke: var(--forbidden-stroke);
  stroke-width: 1.5;
  stroke-linecap: round;
  vector-effect: non-scaling-stroke;
}

.ab-item:disabled:not(.forbidden) {
  opacity: 0.45;
}

.ab-item.ab-save {
  color: #1a6fff;
  font-weight: 600;
}

.ab-item.ab-save :deep(.anticon) {
  color: #1a6fff;
}

.save-hint {
  font-size: 11px;
  font-weight: 500;
  color: #10b981;
}

.ab-item.danger {
  color: #dc2626;
}

.ab-item.danger :deep(.anticon) {
  color: #dc2626;
}

.ab-item.danger:hover:not(:disabled) {
  background: #fef2f2;
  color: #b91c1c;
}

.ab-item.danger:hover:not(:disabled) :deep(.anticon) {
  color: #b91c1c;
}

.ab-item.resume {
  color: #059669;
}

.ab-item.resume :deep(.anticon) {
  color: #059669;
}

.ab-item.resume:hover:not(:disabled) {
  background: #ecfdf5;
  color: #047857;
}

.ab-item.resume:hover:not(:disabled) :deep(.anticon) {
  color: #047857;
}
</style>
