<script setup lang="ts">
import { computed } from 'vue';
import { message } from 'ant-design-vue';
import {
  CoffeeOutlined, CustomerServiceOutlined, DownOutlined,
} from '@ant-design/icons-vue';
import CallSessionBar from '@/components/cti/CallSessionBar.vue';
import CtiAuthIcon from '@/components/cti/CtiAuthIcon.vue';
import { useCtiStore, type BreakReason, type ReadyMode, READY_MODE_LABELS } from '@/stores/cti';

const READY_MENU: { key: ReadyMode; label: string }[] = [
  { key: 'ticket_work', label: READY_MODE_LABELS.ticket_work },
  { key: 'outbound', label: READY_MODE_LABELS.outbound },
  { key: 'offline_comm', label: READY_MODE_LABELS.offline_comm },
];

const BREAK_MENU: { key: BreakReason; label: string }[] = [
  { key: 'meeting', label: '开会' },
  { key: 'training', label: '培训' },
  { key: 'tea', label: '茶歇' },
  { key: 'meal', label: '用餐' },
];

const cti = useCtiStore();

const readyActive = computed(() => cti.workStatus === 'ready');
const breakActive = computed(() => cti.workStatus === 'break');
const disabled = computed(() => cti.workButtonsDisabled);

const dropdownTone = computed(() => {
  if (cti.workStatus === 'busy') return 'busy';
  if (cti.workStatus === 'ready') return 'ready';
  if (cti.workStatus === 'break') return 'break';
  return 'unready';
});

const dropdownWide = computed(() =>
  cti.workStatus === 'break' || cti.workStatus === 'ready',
);

const menuSelectedKeys = computed(() => {
  if (cti.workStatus === 'busy') return ['busy'];
  if (cti.workStatus === 'ready') return [cti.readyMode];
  if (cti.workStatus === 'break') return [cti.breakReason];
  return ['logged_in'];
});

function signIn() {
  cti.signIn();
  message.success('已签入 · 未就绪');
}
function signOut() {
  if (cti.signOut()) message.info('已签出');
  else message.warning('通话进行中，请先挂断');
}
function onMenuClick({ key }: { key: string | number }) {
  const k = String(key);
  if (k === 'busy' || k === 'logged_in') return;
  if (['ticket_work', 'outbound', 'offline_comm'].includes(k)) {
    cti.setReadyMode(k as ReadyMode);
    return;
  }
  if (['meeting', 'training', 'tea', 'meal'].includes(k)) {
    cti.setBreak(k as BreakReason);
  }
}
</script>

<template>
  <div class="cti-bar" :class="{ pulse: cti.barPulse }">
    <template v-if="!cti.isSignedIn">
      <button class="cti-work-btn cti-work-btn--signin" type="button" @click="signIn">
        <span class="cti-work-btn__icon"><CtiAuthIcon kind="sign-in" /></span>
        <span class="cti-work-btn__label">签入</span>
      </button>
      <span class="hint">签入后开始处理工单</span>
    </template>

    <template v-else>
      <div class="actions">
        <button
          class="cti-work-btn cti-work-btn--ready"
          type="button"
          :class="{ 'is-active': readyActive, 'is-disabled': disabled }"
          :disabled="disabled"
          @click="cti.setReady('ticket_work')"
        >
          <span class="cti-work-btn__icon"><CustomerServiceOutlined /></span>
          <span class="cti-work-btn__label">就绪</span>
        </button>

        <button
          class="cti-work-btn cti-work-btn--break"
          type="button"
          :class="{ 'is-active': breakActive, 'is-disabled': disabled }"
          :disabled="disabled"
          @click="cti.setBreak()"
        >
          <span class="cti-work-btn__icon"><CoffeeOutlined /></span>
          <span class="cti-work-btn__label">小休</span>
        </button>

        <a-dropdown :disabled="disabled" placement="bottomLeft" trigger="click">
          <button
            class="status-dd"
            :class="[dropdownTone, { wide: dropdownWide }]"
            type="button"
            :disabled="disabled"
          >
            <span>{{ cti.dropdownLabel }}</span>
            <DownOutlined class="dd-arr" />
          </button>
          <template #overlay>
            <a-menu :selected-keys="menuSelectedKeys" @click="onMenuClick">
              <template v-if="disabled">
                <a-menu-item key="busy" disabled>忙碌（外呼通话中）</a-menu-item>
              </template>
              <template v-else-if="cti.workStatus === 'ready'">
                <a-menu-item v-for="item in READY_MENU" :key="item.key">
                  {{ item.label }}
                </a-menu-item>
              </template>
              <template v-else-if="cti.workStatus === 'break'">
                <a-menu-item v-for="item in BREAK_MENU" :key="item.key">
                  {{ item.label }}
                </a-menu-item>
              </template>
              <template v-else>
                <a-menu-item key="logged_in" disabled>未就绪</a-menu-item>
              </template>
            </a-menu>
          </template>
        </a-dropdown>

        <button
          class="cti-work-btn cti-work-btn--out"
          type="button"
          :class="{ 'is-disabled': disabled }"
          :disabled="disabled"
          @click="signOut"
        >
          <span class="cti-work-btn__icon"><CtiAuthIcon kind="sign-out" :size="16" /></span>
          <span class="cti-work-btn__label">签出</span>
        </button>
      </div>

      <CallSessionBar v-if="cti.inCall" class="call-anchor" variant="anchor" />
    </template>
  </div>
</template>

<style scoped>
.cti-bar {
  flex: 1; min-width: 0; height: 100%;
  display: flex; align-items: center; gap: 12px;
  padding: 0 8px; overflow: hidden;
  transition: box-shadow 0.25s;
}
.cti-bar.pulse {
  box-shadow: inset 0 0 0 2px #bfdbfe;
  border-radius: 8px;
  animation: ctibarflash 1.8s ease-out;
}
@keyframes ctibarflash {
  0% { background: #eff6ff; }
  100% { background: transparent; }
}

.hint { font-size: 12px; color: #9ca3af; flex: none; white-space: nowrap; }

.actions { display: flex; align-items: center; gap: 8px; flex: none; }

/* 横排胶囊：左图标 + 右文案，高度 36px */
.cti-work-btn {
  box-sizing: border-box;
  display: inline-flex;
  flex-direction: row;
  flex-wrap: nowrap;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 36px;
  padding: 0 12px;
  border-radius: 12px;
  border: 1px solid transparent;
  cursor: pointer;
  font-family: inherit;
  font-size: 12px;
  font-weight: 600;
  line-height: 1;
  white-space: nowrap;
  transition: all 0.12s;
  flex: none;
  width: auto;
  min-width: 0;
}
.cti-work-btn__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  line-height: 0;
}
.cti-work-btn__icon :deep(.anticon) { font-size: 16px; display: block; }
.cti-work-btn__label { flex: none; line-height: 1.2; }

.cti-work-btn:disabled,
.cti-work-btn.is-disabled { opacity: 0.55; cursor: not-allowed; }
.cti-work-btn:not(:disabled):not(.is-disabled):hover { filter: brightness(0.97); }

.cti-work-btn--signin {
  border-color: #2563eb;
  background: #eff6ff;
  color: #2563eb;
}
.cti-work-btn--signin:hover { background: #dbeafe; }

.cti-work-btn--ready { background: #ecfdf5; color: #10b981; }
.cti-work-btn--ready.is-active {
  background: #d1fae5;
  border-color: #10b981;
  border-width: 2px;
  padding: 0 11px;
}
.cti-work-btn--break { background: #fffbeb; color: #d97706; }
.cti-work-btn--break.is-active {
  background: #fef3c7;
  border-color: #d97706;
  border-width: 2px;
  padding: 0 11px;
}
.cti-work-btn--out { background: #f1f5f9; color: #64748b; }
.cti-work-btn--out:not(:disabled):not(.is-disabled):hover { background: #e2e8f0; }

.status-dd {
  display: inline-flex; align-items: center; justify-content: space-between; gap: 8px;
  height: 36px; width: 126px; padding: 0 12px; border-radius: 12px; cursor: pointer; flex: none;
  border: 1px solid #e5e7eb; background: #fff; font-size: 13px; font-weight: 500;
  color: #6b7280; font-family: inherit;
}
.status-dd.wide { width: 148px; }
.status-dd[disabled] { opacity: 0.55; cursor: not-allowed; }
.status-dd .dd-arr { font-size: 10px; color: #9ca3af; }
.status-dd.ready { color: #10b981; }
.status-dd.break { color: #d97706; background: #fffbeb; border-color: #fcd34d; }
.status-dd.busy { color: #2563eb; background: #eff6ff; border-color: #bfdbfe; font-weight: 600; }

.call-anchor { margin-left: auto; }
</style>
