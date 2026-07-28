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
import type { SuspendInfo, OpActionType, TicketOpState, AftersaleContext } from '../composables/opActions';
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
  /** 消费者BG工单：升级通道开放飞书项目 */
  feishuEligible?: boolean;
  /** 飞书协同子状态：已关联（synced/feedback/closed）时底栏「升级」置灰 */
  feishuSync?: string;
  /** 转售后上下文（投诉分流 + 预填 + 已有关联售后单） */
  aftersaleContext?: AftersaleContext;
  /** 处理表单现值：挂起申请需校验服务类型/服务方式 */
  serviceType?: string;
  serviceMethod?: string;
  /** 处理表单现值：下送（正常结案）前需校验问题原因/处理结果已填 */
  problemCause?: string;
  processResult?: string;
  /** 委派中：协办未完成前锁定流转/终结类动作 */
  delegateTargets?: string;
  /**
   * 工单是否已升级至技术支持。
   * 「退回」只有技术支持 → 工单处理人这一个方向，故仅在技术支持持单时展示。
   * （当前角色体系无「技术支持」角色，先以"已升级至技术支持"作为持单判据）
   */
  atTechSupport?: boolean;
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

/** 已成功关联产研反馈：底栏升级置灰，催单/二次激活改在「产研反馈」Tab */
const feishuEscalateBlocked = computed(() =>
  props.feishuSync === 'synced'
  || props.feishuSync === 'feedback'
  || props.feishuSync === 'closed',
);

const DIALOG_ACTIONS: OpActionType[] = [
  '调剂', '委派', '强结', '挂起', '恢复', '退回', '升级', '同步飞书', '转售后',
  '标记已解决', '关闭工单', '归档工单',
];

/** 底栏展示顺序（对齐参考原型 bottom-actions + 强结） */
const BAR_ORDER: (OpActionType | '转单')[] = [
  '下送', '升级', '转售后', '撤回', '调剂', '委派', '转单', '挂起', '退回', '关闭工单', '强结',
];

const dialogOpen = ref(false);
const dialogAction = ref<OpActionType | null>(null);
const forwardModalOpen = ref(false);

const isTerminal = computed(() => ['closed', 'archived', 'cancelled', 'settled'].includes(props.opState));
const isSuspended = computed(() => props.opState === 'suspended');
/**
 * 已转出：非诉转售后后的等待态。单子在售后手上，客服侧无可作为——
 * 底栏流转类动作全部锁定（含再次转售后：1:1 关联已占用），只留「保存」与「联系客户」。
 * 出态只由售后回传驱动，没有任何按钮能主动离开该态。
 */
const isTransferred = computed(() => props.opState === 'transferred');
const TRANSFERRED_LOCK_TIP = '工单已转出至售后，等待售后处理结果';

/**
 * 已有 1:1 关联售后单 → 「转售后」封口，不再建第二张单（D2 改写，激活动作取消）。
 * 未结案：去关联单 Tab 点售后卡片跳售后系统补充/催单；已结案：只能线下联系售后。
 */
const linkedAftersale = computed(() => props.aftersaleContext?.existing);
const aftersaleBlockedTip = computed(() => {
  const as = linkedAftersale.value;
  if (!as) return null;
  return as.settled
    ? `关联售后单 ${as.no} 已结案，如需继续处理请线下联系售后`
    : `已有在跑的售后单 ${as.no}，请在「关联单」Tab 点开跟进`;
});

/** 委派中：单子交给协办人先处理，处理完回到本节点，期间锁定流转与终结类动作 */
const isDelegating = computed(() => !!props.delegateTargets);
/**
 * 委派中锁定：一切"把单子转出去或终结掉"的动作。
 * 「下送」不锁——在委派节点，下送=送到下一节点=回到委派节点（协办完成回送）。
 */
const DELEGATE_LOCKED: (OpActionType | '转单')[] = [
  '调剂', '关闭工单', '强结', '升级', '转售后', '转单', '退回', '挂起',
];
const DELEGATE_LOCK_TIP = '工单委派中，协办完成后可操作';

const actions = computed(() =>
  availableActions({ ticketType: props.ticketType, afterSaleEnabled: props.afterSaleEnabled }),
);
const actionMap = computed(() => new Map(actions.value.map((a) => [a.key, a])));

interface BarItem {
  key: OpActionType | '转单';
  label: string;
  icon: string;
  danger?: boolean;
  /** 禁止操作示意（如无上一流转可撤回 / 已升级飞书） */
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
    // 已转出：整条底栏锁定（无逃生口——回来只能等售后转回）
    if (isTransferred.value) {
      const def = key === '转单' ? null : actionMap.value.get(key);
      if (key !== '转单' && !def) continue;
      if (key === '退回' && !props.atTechSupport) continue;
      items.push({
        key,
        label: key === '挂起' ? '申请挂起' : (def?.label ?? '转单'),
        icon: def?.icon ?? 'SwapOutlined',
        danger: def?.danger,
        forbidden: true,
        forbiddenTip: TRANSFERRED_LOCK_TIP,
      });
      continue;
    }
    // 委派中：锁定流转与终结类动作，置灰并说明原因
    if (isDelegating.value && DELEGATE_LOCKED.includes(key)) {
      const locked = key === '转单' ? null : actionMap.value.get(key);
      if (key !== '转单' && !locked) continue;
      items.push({
        key,
        label: locked?.label ?? '转单',
        icon: locked?.icon ?? 'SwapOutlined',
        danger: locked?.danger,
        forbidden: true,
        forbiddenTip: DELEGATE_LOCK_TIP,
      });
      continue;
    }
    if (key === '转单') {
      items.push({ key: '转单', label: '转单', icon: 'SwapOutlined' });
      continue;
    }
    const def = actionMap.value.get(key);
    if (!def) continue;
    // 退回=技术支持退回给工单处理人（唯一方向），仅技术支持持单时出现
    if (key === '退回' && !props.atTechSupport) continue;
    // 委派中：「委派」位切换为「撤销委派」——委派锁住了几乎所有动作，必须留逃生口
    if (key === '委派' && isDelegating.value) {
      items.push({ key: '撤销委派', label: '撤销委派', icon: 'UndoOutlined' });
      continue;
    }
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
      // 未挂起→「申请挂起」（提交审批）；审批通过已挂起→「解除挂起」
      items.push(
        isSuspended.value
          ? { key: '恢复', label: '解除挂起', icon: 'PlayCircleOutlined' }
          : { key: '挂起', label: '申请挂起', icon: def.icon },
      );
      continue;
    }
    // 已有关联售后单：转售后置灰，按是否结案给不同去处
    if (key === '转售后' && aftersaleBlockedTip.value) {
      items.push({
        key: def.key,
        label: def.label,
        icon: def.icon,
        forbidden: true,
        forbiddenTip: aftersaleBlockedTip.value,
      });
      continue;
    }
    // 已升级飞书项目：升级置灰（催单/二次激活在「产研反馈」Tab）
    if (key === '升级' && feishuEscalateBlocked.value) {
      items.push({
        key: def.key,
        label: def.label,
        icon: def.icon,
        forbidden: true,
        forbiddenTip: '已升级产研反馈，请在「产研反馈」Tab 催单或二次激活',
      });
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
  if (isTerminal.value || isTransferred.value) return;
  if (action === '转单') {
    emit('transferTicket');
    return;
  }
  if (action === '取消工单') return emit('cancel');
  if (action === '撤销委派') {
    Modal.confirm({
      title: '撤销委派',
      content: `将撤销对 ${props.delegateTargets} 的委派，工单回到本节点并解锁流转与结案动作。确定撤销？`,
      okText: '确认撤销',
      cancelText: '取消',
      onOk: () => emit('action', { type: '撤销委派' }),
    });
    return;
  }
  if (isDelegating.value && DELEGATE_LOCKED.includes(action)) {
    message.warning(DELEGATE_LOCK_TIP);
    return;
  }
  if (action === '撤回') {
    if (withdrawBlocked.value) {
      message.warning('当前无可撤回的操作');
      return;
    }
    return emit('withdraw');
  }
  if (action === '升级' && feishuEscalateBlocked.value) {
    message.warning('已升级产研反馈，请在「产研反馈」Tab 催单或二次激活');
    return;
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
    // 委派中：下送=协办完成、回到委派节点，不结案、不校验必填
    if (isDelegating.value) {
      forwardModalOpen.value = true;
      return;
    }
    // 下送=正常结案，需先在处理表单填齐问题原因/处理结果（815 定稿：下送需验证必填字段）
    if (!props.problemCause?.trim()) {
      message.warning('请先在处理表单填写「问题原因」后再下送');
      return;
    }
    if (!props.processResult?.trim()) {
      message.warning('请先在处理表单填写「处理结果」后再下送');
      return;
    }
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

function onForwardConfirm(data: { ticketTitle: string }) {
  emit('action', { type: '下送', data: { ...data, backToDelegator: isDelegating.value } });
}

/** 产研反馈 Tab「重新发起」：打开升级弹窗 */
function openEscalate() {
  if (isTerminal.value || isTransferred.value) return;
  dialogAction.value = '升级';
  dialogOpen.value = true;
}

/**
 * 投诉单「关联售后」入口：打开售后建单弹窗（复用转售后动作，投诉分支=建关联单独立跑）。
 * 已有 1:1 关联时不弹窗——未结案去关联单 Tab 跟进、已结案线下联系售后（D2 改写）。
 */
function openAftersale() {
  if (isTerminal.value || isTransferred.value) return;
  if (aftersaleBlockedTip.value) {
    message.info(aftersaleBlockedTip.value);
    return;
  }
  dialogAction.value = '转售后';
  dialogOpen.value = true;
}

defineExpose({ openEscalate, openAftersale });
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
      :feishu-eligible="feishuEligible"
      :feishu-sync="feishuSync"
      :aftersale-context="aftersaleContext"
      :service-type="serviceType"
      :service-method="serviceMethod"
      @confirm="onDialogConfirm"
    />

    <OpForwardModal
      v-model:open="forwardModalOpen"
      :ticket-no="ticketNo"
      :ticket-title="ticketTitle"
      :back-to-delegator="isDelegating"
      :delegate-targets="delegateTargets"
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
