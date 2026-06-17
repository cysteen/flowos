<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { Modal } from 'ant-design-vue';
import {
  ArrowRightOutlined, RollbackOutlined, UndoOutlined,
  PauseCircleOutlined, PlayCircleOutlined, RiseOutlined,
  FileTextOutlined, CheckOutlined, CheckCircleOutlined,
  InboxOutlined, CloseOutlined, DownOutlined, SaveOutlined,
} from '@ant-design/icons-vue';
import OpActionDialogs from './OpActionDialogs.vue';
import type { SuspendInfo } from '../composables/opActions';
import type { OpActionType, TicketOpState } from '../composables/opActions';

const props = defineProps<{
  ticketNo: string;
  opState: TicketOpState;
  suspendInfo: SuspendInfo | null;
  draftSavedAt?: string | null;
}>();

const emit = defineEmits<{
  action: [payload: Record<string, unknown>];
  cancel: [];
  withdraw: [];
}>();

const moreOpen = ref(false);
const dialogOpen = ref(false);
const dialogAction = ref<OpActionType | null>(null);

const isTerminal = computed(() => ['closed', 'archived', 'cancelled'].includes(props.opState));
const isSuspended = computed(() => props.opState === 'suspended');
const isResolved = computed(() => props.opState === 'resolved');

const DIALOG_ACTIONS: OpActionType[] = [
  '转办', '挂起', '退回', '升级', '标记已解决', '恢复', '推送产研', '关闭工单', '归档工单',
];

function onClickOutside(e: MouseEvent) {
  if (!(e.target as HTMLElement).closest('.more-wrap')) moreOpen.value = false;
}
onMounted(() => document.addEventListener('click', onClickOutside));
onUnmounted(() => document.removeEventListener('click', onClickOutside));

function saveDraft() {
  emit('action', { type: '保存草稿' });
}

function openDialog(action: OpActionType) {
  if (isTerminal.value) return;
  if (action === '挂起' && isSuspended.value) return;
  if (action === '恢复' && !isSuspended.value) {
    Modal.info({ title: '提示', content: '当前工单未处于挂起状态' });
    return;
  }
  if (action === '标记已解决' && isResolved.value) return;
  moreOpen.value = false;
  if (DIALOG_ACTIONS.includes(action)) {
    dialogAction.value = action;
    dialogOpen.value = true;
    return;
  }
}

function run(action: OpActionType) {
  moreOpen.value = false;
  if (action === '保存草稿') {
    saveDraft();
    return;
  }
  if (action === '取消工单') {
    emit('cancel');
    return;
  }
  if (action === '撤回') {
    emit('withdraw');
    return;
  }
  openDialog(action);
}

function onDialogConfirm(payload: Record<string, unknown>) {
  emit('action', payload);
}
</script>

<template>
  <div class="op-actionbar" :class="{ disabled: isTerminal }">
    <button class="ab-save" :disabled="isTerminal" @click="saveDraft">
      <SaveOutlined />
      <span>保存</span>
      <span v-if="draftSavedAt" class="save-hint">已保存 {{ draftSavedAt }}</span>
    </button>

    <div class="ab-actions">
      <div class="ab-group">
        <button class="ab-item" :disabled="isTerminal" @click="run('转办')">
          <ArrowRightOutlined /><span>转办</span>
        </button>
        <button
          v-if="!isSuspended"
          class="ab-item"
          :disabled="isTerminal"
          @click="run('挂起')"
        >
          <PauseCircleOutlined /><span>挂起</span>
        </button>
        <button
          v-else
          class="ab-item ab-success"
          :disabled="isTerminal"
          @click="run('恢复')"
        >
          <PlayCircleOutlined /><span>恢复</span>
        </button>
        <button class="ab-item" :disabled="isTerminal" @click="run('退回')">
          <RollbackOutlined /><span>退回</span>
        </button>
      </div>

      <div class="ab-divider" />

      <div class="ab-group">
        <button class="ab-item" :disabled="isTerminal" @click="run('升级')">
          <RiseOutlined /><span>升级</span>
        </button>
      </div>

      <div class="ab-divider" />

      <div class="ab-group">
        <button
          class="ab-item ab-success"
          :disabled="isTerminal || isResolved"
          @click="run('标记已解决')"
        >
          <CheckOutlined /><span>标记已解决</span>
        </button>
      </div>

      <div class="ab-divider" />

      <div class="more-wrap">
        <button
          class="ab-more"
          :class="{ open: moreOpen }"
          :disabled="isTerminal"
          @click.stop="moreOpen = !moreOpen"
        >
          <span>更多</span>
          <DownOutlined class="more-chev" />
        </button>
        <div v-show="moreOpen" class="more-menu" @click.stop>
          <button class="menu-item" @click="run('撤回')">
            <UndoOutlined /><span>撤回</span>
          </button>
          <button v-if="!isSuspended" class="menu-item menu-success" @click="run('恢复')">
            <PlayCircleOutlined /><span>恢复</span>
          </button>
          <div class="menu-divider" />
          <button class="menu-item" @click="run('推送产研')">
            <FileTextOutlined /><span>推送产研</span>
          </button>
          <div class="menu-divider" />
          <button class="menu-item menu-success" :disabled="isResolved" @click="run('标记已解决')">
            <CheckOutlined /><span>标记已解决</span>
          </button>
          <button class="menu-item" @click="run('关闭工单')">
            <CheckCircleOutlined /><span>关闭工单</span>
          </button>
          <button class="menu-item" @click="run('归档工单')">
            <InboxOutlined /><span>归档工单</span>
          </button>
          <div class="menu-divider" />
          <button class="menu-item menu-danger" @click="run('取消工单')">
            <CloseOutlined /><span>取消工单</span>
          </button>
        </div>
      </div>
    </div>

    <OpActionDialogs
      v-model:open="dialogOpen"
      :action="dialogAction"
      :ticket-no="ticketNo"
      :suspend-info="suspendInfo"
      @confirm="onDialogConfirm"
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
  justify-content: space-between;
  gap: 20px;
  min-height: 64px;
  background: linear-gradient(180deg, #f0f5ff 0%, #fff 55%);
  padding: 12px 28px;
  border-top: 2px solid #1a6fff;
  box-shadow: 0 -6px 24px rgba(26, 111, 255, 0.1), 0 -1px 0 #dbeafe;
}
.op-actionbar.disabled { opacity: 0.72; }

.ab-save {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  color: #1a6fff;
  background: #fff;
  border: 1.5px solid #93c5fd;
  border-radius: 8px;
  padding: 10px 18px;
  cursor: pointer;
  flex: none;
  box-shadow: 0 1px 3px rgba(26, 111, 255, 0.12);
  transition: background 0.15s, border-color 0.15s, box-shadow 0.15s;
}
.ab-save :deep(.anticon) { font-size: 16px; }
.ab-save:hover:not(:disabled) {
  background: #eff6ff;
  border-color: #1a6fff;
  box-shadow: 0 2px 8px rgba(26, 111, 255, 0.18);
}
.ab-save:disabled { cursor: not-allowed; opacity: 0.5; }
.save-hint { font-size: 12px; font-weight: 500; color: #10b981; margin-left: 2px; }

.ab-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-left: auto;
  padding: 5px 8px;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  box-shadow: 0 2px 12px rgba(15, 23, 42, 0.08);
}
.ab-group { display: flex; align-items: center; gap: 4px; }
.ab-divider { width: 1px; height: 28px; background: #e5e7eb; margin: 0 4px; flex: none; }

.ab-item, .ab-more {
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
  transition: background 0.12s, color 0.12s, box-shadow 0.12s;
}
.ab-item:disabled, .ab-more:disabled { opacity: 0.4; cursor: not-allowed; }
.ab-item :deep(.anticon), .ab-more :deep(.anticon) { font-size: 16px; color: #4b5563; }
.ab-item:hover:not(:disabled), .ab-more:hover:not(:disabled) {
  background: #f3f4f6;
  color: #1a6fff;
}
.ab-item:hover:not(:disabled) :deep(.anticon), .ab-more:hover:not(:disabled) :deep(.anticon) {
  color: #1a6fff;
}
.ab-item.ab-success {
  color: #fff;
  font-weight: 600;
  background: linear-gradient(180deg, #10b981 0%, #059669 100%);
  box-shadow: 0 2px 8px rgba(16, 185, 129, 0.35);
  padding: 10px 18px;
}
.ab-item.ab-success :deep(.anticon) { color: #fff; }
.ab-item.ab-success:hover:not(:disabled) {
  background: linear-gradient(180deg, #059669 0%, #047857 100%);
  box-shadow: 0 4px 12px rgba(16, 185, 129, 0.4);
}
.ab-more {
  border: 1px solid #e5e7eb;
  background: #f9fafb;
  color: #374151;
}
.ab-more:hover:not(:disabled) { background: #f3f4f6; border-color: #d1d5db; }
.ab-more .more-chev { font-size: 11px; transition: transform 0.15s; }
.ab-more.open { border-color: #93c5fd; background: #eff6ff; color: #1a6fff; }
.ab-more.open .more-chev { transform: rotate(180deg); }

.more-wrap { position: relative; }
.more-menu {
  position: absolute;
  bottom: calc(100% + 6px);
  right: 0;
  min-width: 180px;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.1);
  padding: 4px 0;
  z-index: 20;
}
.menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 14px;
  font-size: 13px;
  color: #374151;
  background: transparent;
  border: none;
  cursor: pointer;
  text-align: left;
}
.menu-item:disabled { opacity: 0.4; cursor: not-allowed; }
.menu-item :deep(.anticon) { font-size: 15px; color: #6b7280; }
.menu-item:hover:not(:disabled) { background: #f9fafb; }
.menu-item.menu-success { color: #059669; }
.menu-item.menu-success :deep(.anticon) { color: #059669; }
.menu-item.menu-danger { color: #ef4444; }
.menu-item.menu-danger :deep(.anticon) { color: #ef4444; }
.menu-divider { height: 1px; background: #f3f4f6; margin: 2px 0; }
</style>
