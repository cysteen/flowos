<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { message } from 'ant-design-vue';
import {
  PhoneFilled, PoweroffOutlined, CaretDownOutlined, CloseOutlined,
} from '@ant-design/icons-vue';
import { useCtiStore, type Presence } from '@/stores/cti';

// 二线坐席 软电话(CTI) 状态条：
// 常驻 = 状态胶囊(示闲/小休/忙碌) + 状态时长 + 工号/分机；
// 话务条(呼叫中 → 通话中 · 时长 · 信号 · 挂断) 仅在通话期间出现，外呼由工单操作页电话 icon 触发。

const cti = useCtiStore();

const now = ref(0);
let tick: number | undefined;
onMounted(() => {
  now.value = Date.now();
  tick = window.setInterval(() => { now.value = Date.now(); }, 1000);
});
onUnmounted(() => { if (tick) clearInterval(tick); });

const statusLabel = computed(() => {
  if (!cti.signedIn) return '未签入';
  if (cti.inCall) return '忙碌';
  return cti.presence === 'break' ? '小休' : '示闲';
});
const statusTone = computed(() => {
  if (!cti.signedIn) return 'off';
  if (cti.inCall) return 'busy';
  return cti.presence === 'break' ? 'break' : 'idle';
});

function fmt(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}
const statusDuration = computed(() => (cti.statusSince ? fmt(now.value - cti.statusSince) : '00:00'));
const callDuration = computed(() => (cti.callSince ? fmt(now.value - cti.callSince) : '00:00'));

function onStatusMenu({ key }: { key: string | number }) {
  const k = String(key);
  if (k === 'out') {
    if (!cti.signOut()) message.warning('通话进行中，请先挂断');
    else message.info('已签出');
    return;
  }
  cti.setPresence(k as Presence);
}
function signIn() {
  cti.signIn();
  message.success('已签入 · 示闲');
}
function hangup() {
  cti.hangup();
  message.info('通话已结束');
}
function maskNo(n: string): string {
  return n.length >= 7 ? `${n.slice(0, 3)}****${n.slice(-4)}` : n;
}
</script>

<template>
  <div class="cti-bar">
    <!-- 未签入 -->
    <button v-if="!cti.signedIn" class="btn-in" type="button" @click="signIn">
      <PoweroffOutlined /> 签入
    </button>

    <template v-else>
      <!-- 状态胶囊（下拉切换 示闲/小休/签出） -->
      <a-dropdown :disabled="cti.inCall" placement="bottomLeft" trigger="click">
        <button class="status-pill" :class="statusTone" type="button">
          <span class="dot" :class="{ pulse: cti.callPhase === 'dialing' }" />
          <span class="st-label">{{ statusLabel }}</span>
          <span class="st-dur">{{ statusDuration }}</span>
          <CaretDownOutlined v-if="!cti.inCall" class="st-caret" />
        </button>
        <template #overlay>
          <a-menu @click="onStatusMenu">
            <a-menu-item key="idle">🟢 示闲</a-menu-item>
            <a-menu-item key="break">🟡 小休</a-menu-item>
            <a-menu-divider />
            <a-menu-item key="out">签出</a-menu-item>
          </a-menu>
        </template>
      </a-dropdown>

      <!-- 工号 / 分机 -->
      <div class="meta">
        <span>工号 <b>{{ cti.workNo }}</b></span>
        <span class="meta-sep">·</span>
        <span>分机 <b>{{ cti.ext }}</b></span>
      </div>

      <!-- ★ 话务条：仅通话期间出现（外呼由工单操作页电话 icon 触发） -->
      <div v-if="cti.inCall" class="call-strip" :class="cti.callPhase">
        <span class="call-ico"><PhoneFilled /></span>
        <span class="call-phase">{{ cti.callPhase === 'dialing' ? '呼叫中…' : '通话中' }}</span>
        <span v-if="cti.callContact" class="call-contact">{{ cti.callContact }}</span>
        <span class="call-no">{{ maskNo(cti.callNumber) }}</span>
        <span v-if="cti.callPhase === 'talking'" class="call-dur">{{ callDuration }}</span>
        <span v-if="cti.callPhase === 'talking'" class="signal" title="信号质量：良好">
          <i class="bar b1" /><i class="bar b2" /><i class="bar b3" />
        </span>
        <button class="btn-hangup" type="button" @click="hangup">
          <CloseOutlined /> 挂断
        </button>
      </div>

      <!-- 空闲提示（无通话）：引导从工单操作页发起外呼 -->
      <span v-else class="idle-tip">外呼请在工单操作页点击客户/代办人电话</span>
    </template>
  </div>
</template>

<style scoped>
.cti-bar {
  flex: 1; min-width: 0; height: 100%;
  display: flex; align-items: center; gap: 12px; padding: 0 10px; overflow: hidden;
}

/* 签入 */
.btn-in {
  display: inline-flex; align-items: center; gap: 6px;
  height: 34px; padding: 0 18px; border-radius: 9px; cursor: pointer;
  border: none; background: linear-gradient(180deg, #10b981 0%, #059669 100%);
  color: #fff; font-size: 13px; font-weight: 600; flex: none; font-family: inherit;
  box-shadow: 0 2px 8px rgba(16, 185, 129, 0.32);
}
.btn-in:hover { filter: brightness(1.04); }

/* 状态胶囊 */
.status-pill {
  display: inline-flex; align-items: center; gap: 7px;
  height: 32px; padding: 0 12px; border-radius: 17px; cursor: pointer;
  border: 1px solid transparent; font-size: 12.5px; font-weight: 600; flex: none;
  font-family: inherit; transition: filter 0.12s;
}
.status-pill:hover { filter: brightness(0.98); }
.status-pill .dot { width: 7px; height: 7px; border-radius: 4px; flex: none; }
.status-pill.idle { background: #ecfdf5; border-color: #a7f3d0; color: #047857; }
.status-pill.idle .dot { background: #10b981; }
.status-pill.break { background: #fffbeb; border-color: #fde68a; color: #b45309; }
.status-pill.break .dot { background: #f59e0b; }
.status-pill.busy { background: #eff6ff; border-color: #bfdbfe; color: #1a6fff; }
.status-pill.busy .dot { background: #1a6fff; }
.status-pill.off { background: #f3f4f6; border-color: #e5e7eb; color: #6b7280; }
.st-dur { font-variant-numeric: tabular-nums; font-weight: 600; opacity: 0.85; }
.st-caret { font-size: 9px; opacity: 0.55; }
.dot.pulse { animation: ctipulse 1s ease-in-out infinite; }
@keyframes ctipulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }

.meta { display: flex; align-items: center; gap: 6px; font-size: 12px; color: #9ca3af; flex: none; }
.meta b { color: #4b5563; font-weight: 600; }
.meta-sep { color: #d1d5db; }

.idle-tip { font-size: 12px; color: #cbd5e1; flex: none; }

/* ★ 话务条（通话中） */
.call-strip {
  display: flex; align-items: center; gap: 10px; margin-left: auto; flex: none;
  height: 36px; padding: 0 8px 0 14px; border-radius: 18px; font-size: 12.5px;
  border: 1px solid; box-shadow: 0 1px 4px rgba(0, 0, 0, 0.05);
}
.call-strip.dialing { background: #f0f6ff; border-color: #bfdbfe; color: #1a6fff; }
.call-strip.talking { background: #ecfdf5; border-color: #a7f3d0; color: #047857; }
.call-ico { display: inline-flex; font-size: 13px; }
.call-strip.dialing .call-ico { animation: ctipulse 1s ease-in-out infinite; }
.call-phase { font-weight: 700; }
.call-contact { color: #374151; font-weight: 600; }
.call-no { color: #6b7280; font-variant-numeric: tabular-nums; }
.call-dur { font-weight: 700; font-variant-numeric: tabular-nums; min-width: 44px; }
.signal { display: inline-flex; align-items: flex-end; gap: 2px; height: 14px; }
.signal .bar { width: 3px; border-radius: 1px; background: #10b981; }
.signal .b1 { height: 5px; }
.signal .b2 { height: 9px; }
.signal .b3 { height: 13px; }
.btn-hangup {
  display: inline-flex; align-items: center; gap: 4px; flex: none;
  height: 28px; padding: 0 12px; border-radius: 14px; border: none; cursor: pointer;
  background: #ef4444; color: #fff; font-size: 12px; font-weight: 600; font-family: inherit;
}
.btn-hangup:hover { background: #dc2626; }
</style>
