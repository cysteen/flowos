<script setup lang="ts">
import { computed } from 'vue';
import { message } from 'ant-design-vue';
import {
  CustomerServiceOutlined, CoffeeOutlined, LogoutOutlined, PhoneOutlined,
  DownOutlined, CloseOutlined,
} from '@ant-design/icons-vue';
import { useCtiStore, type Presence } from '@/stores/cti';

// 坐席 CTI 状态栏 —— 1:1 对齐设计稿 iFLY-FlowOS-坐席视角.pen · ropW8（全状态逻辑）。
const cti = useCtiStore();

const statusLabel = computed(() => {
  if (cti.callPhase === 'ringing') return '振铃中';
  if (cti.callPhase === 'dialing' || cti.callPhase === 'connected') return '忙碌';
  return cti.presence === 'idle' ? '示闲中' : cti.presence === 'break' ? '小休中' : '未准备好';
});
const statusTone = computed(() => {
  if (cti.callPhase === 'ringing') return 'ring';
  if (cti.inCall) return 'busy';
  return cti.presence === 'idle' ? 'idle' : cti.presence === 'break' ? 'break' : 'unready';
});

function fmt(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}
const statusDuration = computed(() => (cti.statusSince ? fmt(cti.now - cti.statusSince) : '00:00'));
const dialDuration = computed(() => (cti.dialSince ? fmt(cti.now - cti.dialSince) : '00:00'));
const callDuration = computed(() => (cti.callSince ? fmt(cti.now - cti.callSince) : '00:00'));

function signIn() { cti.signIn(); message.success('已签入 · 未准备好'); }
function signOut() { cti.signOut() ? message.info('已签出') : message.warning('通话进行中，请先挂断'); }
function setPresence(p: Presence) { cti.setPresence(p); }
function onStatusMenu({ key }: { key: string | number }) { cti.setPresence(String(key) as Presence); }
function maskNo(n: string): string { return n.length >= 7 ? `${n.slice(0, 3)}****${n.slice(-4)}` : n; }
</script>

<template>
  <div class="cti-bar">
    <!-- S1 未签入 -->
    <template v-if="!cti.signedIn">
      <button class="btn-signin" type="button" @click="signIn">
        <PhoneOutlined /><span>签入</span>
      </button>
      <span class="hint">签入后绑定分机号并进入「未准备好」</span>
    </template>

    <!-- 已签入 -->
    <template v-else>
      <div class="actions">
        <button
          class="abtn idle" type="button"
          :class="{ on: !cti.inCall && cti.presence === 'idle' }"
          :disabled="cti.inCall" @click="setPresence('idle')"
        ><CustomerServiceOutlined /><span>示闲</span></button>

        <button
          class="abtn break" type="button"
          :class="{ on: !cti.inCall && cti.presence === 'break' }"
          :disabled="cti.inCall" @click="setPresence('break')"
        ><CoffeeOutlined /><span>小休</span></button>

        <a-dropdown :disabled="cti.inCall" placement="bottomLeft" trigger="click">
          <button class="status-dd" :class="statusTone" type="button">
            <span class="dot" :class="{ pulse: cti.callPhase === 'dialing' || cti.callPhase === 'ringing' }" />
            <span>{{ statusLabel }}</span>
            <DownOutlined class="dd-arr" />
          </button>
          <template #overlay>
            <a-menu @click="onStatusMenu">
              <a-menu-item key="idle">🟠 示闲中</a-menu-item>
              <a-menu-item key="break">🟣 小休中</a-menu-item>
              <a-menu-item key="unready">⚪ 未准备好</a-menu-item>
            </a-menu>
          </template>
        </a-dropdown>

        <button class="abtn out" type="button" :disabled="cti.inCall" @click="signOut">
          <LogoutOutlined /><span>签出</span>
        </button>
      </div>

      <div class="divider" />

      <div class="metrics">
        <div class="m"><span class="ml">状态</span><span class="mv" :class="statusTone">{{ statusLabel }}</span></div>
        <div class="m"><span class="ml">状态时长</span><span class="mv mono">{{ statusDuration }}</span></div>
        <div class="m"><span class="ml">分机号</span><span class="mv mono">{{ cti.ext }}</span></div>
        <div class="m"><span class="ml">工号</span><span class="mv mono">{{ cti.workNo }}</span></div>
        <template v-if="cti.callPhase === 'connected'">
          <div class="m"><span class="ml">通话时长</span><span class="mv mono call">{{ callDuration }}</span></div>
          <div class="m"><span class="ml">通话号码</span><span class="mv mono">{{ maskNo(cti.callNumber) }}</span></div>
        </template>
      </div>

      <!-- 通话条：外呼呼叫中（琥珀） -->
      <div v-if="cti.callPhase === 'dialing'" class="strip dialing">
        <PhoneOutlined class="ic" />
        <span class="ph">呼叫中</span>
        <span class="no">{{ cti.callNumber }}</span>
        <span class="ring">振铃 {{ dialDuration }}</span>
        <button class="sb sb-ghost" type="button" @click="cti.cancelDial()"><CloseOutlined />取消</button>
      </div>

      <!-- 通话条：呼入振铃（蓝） -->
      <div v-else-if="cti.callPhase === 'ringing'" class="strip ringing">
        <PhoneOutlined class="ic" />
        <span class="ph">振铃中</span>
        <span class="no">{{ cti.callNumber }}</span>
        <button class="sb sb-green" type="button" @click="cti.answer()"><PhoneOutlined />接听</button>
        <button class="sb sb-ghost" type="button" @click="cti.reject()"><PhoneOutlined class="off" />拒接</button>
      </div>

      <!-- 通话条：已接通（绿） -->
      <div v-else-if="cti.callPhase === 'connected'" class="strip connected">
        <PhoneOutlined class="ic" />
        <span class="ph">已接通</span>
        <span v-if="cti.callContact" class="cc">{{ cti.callContact }}</span>
        <span class="no">{{ maskNo(cti.callNumber) }}</span>
        <span class="dur">{{ callDuration }}</span>
        <span class="signal" title="信号质量：良好"><i class="b1" /><i class="b2" /><i class="b3" /></span>
        <button class="sb sb-red" type="button" @click="cti.hangup()"><PhoneOutlined class="off" />挂断</button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.cti-bar { flex: 1; min-width: 0; height: 100%; display: flex; align-items: center; gap: 14px; padding: 0 8px; overflow: hidden; }

/* 签入 */
.btn-signin {
  display: inline-flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px;
  width: 72px; height: 48px; border-radius: 12px; cursor: pointer; flex: none;
  border: 1px solid #1a6fff; background: #eff6ff; color: #1a6fff; font-size: 11px; font-weight: 600; font-family: inherit;
}
.btn-signin :deep(.anticon) { font-size: 16px; }
.btn-signin:hover { background: #e0edff; }
.hint { font-size: 12px; color: #9ca3af; flex: none; }

/* 状态按钮组 */
.actions { display: flex; align-items: center; gap: 8px; flex: none; }
.abtn {
  display: inline-flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px;
  width: 48px; height: 48px; border-radius: 12px; cursor: pointer;
  border: 1px solid transparent; background: #f9fafb; color: #9ca3af;
  font-size: 11px; font-weight: 600; font-family: inherit; transition: all 0.12s;
}
.abtn :deep(.anticon) { font-size: 16px; }
.abtn:disabled { opacity: 0.45; cursor: not-allowed; }
.abtn:not(:disabled):hover { filter: brightness(0.97); }
.abtn.idle.on { background: #fff7ed; border-color: #fed7aa; color: #ea580c; }
.abtn.break.on { background: #f5f3ff; border-color: #ddd6fe; color: #7c3aed; }
.abtn.out { background: #f5f3ff; color: #7c3aed; }
.abtn.out:not(:disabled):hover { background: #ede9fe; }

/* 状态下拉胶囊 */
.status-dd {
  display: inline-flex; align-items: center; gap: 7px; height: 38px; width: 126px;
  padding: 0 12px; border-radius: 12px; cursor: pointer; flex: none;
  border: 1px solid #e5e7eb; background: #fff; font-size: 13px; font-weight: 500; color: #6b7280;
  font-family: inherit; justify-content: space-between;
}
.status-dd[disabled] { opacity: 0.7; cursor: not-allowed; }
.status-dd .dot { width: 7px; height: 7px; border-radius: 4px; background: #9ca3af; flex: none; }
.status-dd .dd-arr { font-size: 10px; color: #9ca3af; }
.status-dd .label { flex: 1; text-align: left; }
.status-dd.idle { color: #ea580c; } .status-dd.idle .dot { background: #ea580c; }
.status-dd.break { color: #7c3aed; } .status-dd.break .dot { background: #7c3aed; }
.status-dd.busy { color: #1a6fff; } .status-dd.busy .dot { background: #1a6fff; }
.status-dd.ring { color: #1a6fff; } .status-dd.ring .dot { background: #1a6fff; }
.dot.pulse { animation: ctipulse 1s ease-in-out infinite; }
@keyframes ctipulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }

.divider { width: 1px; height: 28px; background: #e5e7eb; flex: none; }

/* 指标 */
.metrics { display: flex; align-items: center; gap: 16px; flex: none; }
.m { display: flex; align-items: center; gap: 5px; white-space: nowrap; }
.ml { font-size: 11px; color: #9ca3af; }
.mv { font-size: 12px; font-weight: 600; color: #111827; }
.mv.mono { font-variant-numeric: tabular-nums; }
.mv.idle { color: #ea580c; } .mv.break { color: #7c3aed; } .mv.busy { color: #1a6fff; } .mv.ring { color: #1a6fff; } .mv.unready { color: #6b7280; }
.mv.call { color: #047857; }

/* 通话条 */
.strip {
  display: flex; align-items: center; gap: 8px; margin-left: auto; flex: none;
  height: 36px; padding: 0 8px 0 12px; border-radius: 18px; font-size: 12.5px;
  border: 1px solid; box-shadow: 0 1px 4px rgba(0, 0, 0, 0.05);
}
.strip .ic { font-size: 14px; }
.strip .ph { font-weight: 700; }
.strip .no { color: #374151; font-weight: 600; font-variant-numeric: tabular-nums; }
.strip .cc { color: #374151; font-weight: 600; }
.strip.dialing { background: #fffbeb; border-color: #fcd34d; color: #d97706; }
.strip.dialing .ic { animation: ctipulse 1s ease-in-out infinite; }
.strip.dialing .ring { color: #d97706; font-weight: 600; font-variant-numeric: tabular-nums; }
.strip.ringing { background: #eff6ff; border-color: #bfdbfe; color: #1a6fff; }
.strip.ringing .ic { animation: ctipulse 1s ease-in-out infinite; }
.strip.connected { background: #ecfdf5; border-color: #a7f3d0; color: #047857; padding-left: 10px; padding-right: 6px; }
.strip.connected .no { color: #6b7280; font-weight: normal; }
.strip .dur { color: #047857; font-weight: 700; font-variant-numeric: tabular-nums; }
.signal { display: inline-flex; align-items: flex-end; gap: 2px; height: 14px; }
.signal i { width: 3px; border-radius: 1px; background: #10b981; display: block; }
.signal .b1 { height: 5px; } .signal .b2 { height: 9px; } .signal .b3 { height: 13px; }

/* 通话条按钮 */
.sb {
  display: inline-flex; align-items: center; gap: 4px; flex: none;
  height: 28px; padding: 0 10px; border-radius: 14px; cursor: pointer;
  font-size: 12px; font-weight: 600; font-family: inherit; border: 1px solid transparent;
}
.sb :deep(.anticon) { font-size: 12px; }
.sb .off { transform: rotate(135deg); }
.sb-ghost { background: #fff; border-color: #d1d5db; color: #6b7280; }
.sb-ghost:hover { background: #f9fafb; }
.sb-green { background: #10b981; color: #fff; }
.sb-green:hover { background: #059669; }
.sb-red { background: #ef4444; color: #fff; }
.sb-red:hover { background: #dc2626; }
</style>
