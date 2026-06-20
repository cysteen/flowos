<script setup lang="ts">
import { computed } from 'vue';
import { message } from 'ant-design-vue';
import {
  CustomerServiceOutlined, CoffeeOutlined, LogoutOutlined, LoginOutlined, PhoneFilled,
} from '@ant-design/icons-vue';
import { useCtiStore, type Presence } from '@/stores/cti';

// 二线坐席 软电话(CTI) 状态条 —— 1:1 对齐设计稿 iFLY-FlowOS-坐席视角.pen · KMzCx/AgentStatusBar。
// 常驻(签入后)：示闲/小休/签出 按钮 + 状态指标(状态/状态时长/分机号/工号)；
// 通话条(呼叫中→通话中·号码·信号·时长·挂断) 仅通话时出现；外呼由工单操作页电话 icon 触发。

const cti = useCtiStore();

const statusLabel = computed(() => {
  if (!cti.signedIn) return '未签入';
  if (cti.inCall) return '通话中';
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
const statusDuration = computed(() => (cti.statusSince ? fmt(cti.now - cti.statusSince) : '00:00'));
const callDuration = computed(() => (cti.callSince ? fmt(cti.now - cti.callSince) : '00:00'));

function signIn() { cti.signIn(); message.success('已签入 · 示闲'); }
function signOut() {
  if (!cti.signOut()) message.warning('通话进行中，请先挂断');
  else message.info('已签出');
}
function setPresence(p: Presence) { cti.setPresence(p); }
function hangup() { cti.hangup(); message.info('通话已结束'); }
function maskNo(n: string): string {
  return n.length >= 7 ? `${n.slice(0, 3)}****${n.slice(-4)}` : n;
}
</script>

<template>
  <div class="cti-bar">
    <!-- 未签入 -->
    <template v-if="!cti.signedIn">
      <button class="signin" type="button" @click="signIn">
        <LoginOutlined /><span>签入</span>
      </button>
      <div class="metrics">
        <div class="m"><span class="ml">状态</span><span class="mv off">未签入</span></div>
      </div>
    </template>

    <!-- 已签入 -->
    <template v-else>
      <div class="actions">
        <button
          class="abtn idle" type="button"
          :class="{ on: !cti.inCall && cti.presence === 'idle' }"
          :disabled="cti.inCall"
          @click="setPresence('idle')"
        >
          <CustomerServiceOutlined /><span>示闲</span>
        </button>
        <button
          class="abtn break" type="button"
          :class="{ on: !cti.inCall && cti.presence === 'break' }"
          :disabled="cti.inCall"
          @click="setPresence('break')"
        >
          <CoffeeOutlined /><span>小休</span>
        </button>
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
      </div>

      <!-- 通话条：仅通话期间 -->
      <div v-if="cti.inCall" class="call-strip" :class="cti.callPhase">
        <PhoneFilled class="ci" />
        <span class="cp">{{ cti.callPhase === 'dialing' ? '呼叫中…' : '通话中' }}</span>
        <span v-if="cti.callContact" class="cc">{{ cti.callContact }}</span>
        <span class="cn mono">{{ maskNo(cti.callNumber) }}</span>
        <span v-if="cti.callPhase === 'talking'" class="signal" title="信号质量：良好">
          <i class="b1" /><i class="b2" /><i class="b3" />
        </span>
        <span v-if="cti.callPhase === 'talking'" class="cd mono">{{ callDuration }}</span>
        <button class="hangup" type="button" @click="hangup">
          <PhoneFilled class="hu" /> 挂断
        </button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.cti-bar {
  flex: 1; min-width: 0; height: 100%;
  display: flex; align-items: center; gap: 16px; padding: 0 8px; overflow: hidden;
}

/* 签入 */
.signin {
  display: inline-flex; align-items: center; gap: 7px; flex: none;
  height: 40px; padding: 0 20px; border-radius: 11px; cursor: pointer; border: none;
  background: linear-gradient(180deg, #10b981 0%, #059669 100%); color: #fff;
  font-size: 13px; font-weight: 600; font-family: inherit;
  box-shadow: 0 2px 8px rgba(16, 185, 129, 0.3);
}
.signin:hover { filter: brightness(1.05); }

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

.divider { width: 1px; height: 28px; background: #e5e7eb; flex: none; }

/* 指标读出 */
.metrics { display: flex; align-items: center; gap: 16px; flex: none; min-width: 0; }
.m { display: flex; align-items: center; gap: 5px; white-space: nowrap; }
.ml { font-size: 11px; color: #9ca3af; }
.mv { font-size: 12px; font-weight: 600; color: #111827; }
.mv.mono { font-variant-numeric: tabular-nums; }
.mv.idle { color: #059669; }
.mv.break { color: #b45309; }
.mv.busy { color: #1a6fff; }
.mv.off { color: #9ca3af; }

/* 通话条 */
.call-strip {
  display: flex; align-items: center; gap: 8px; margin-left: auto; flex: none;
  height: 36px; padding: 0 6px 0 12px; border-radius: 18px; font-size: 12.5px;
  border: 1px solid; box-shadow: 0 1px 4px rgba(0, 0, 0, 0.05);
}
.call-strip.dialing { background: #f0f6ff; border-color: #bfdbfe; color: #1a6fff; }
.call-strip.talking { background: #ecfdf5; border-color: #a7f3d0; color: #047857; }
.call-strip .ci { font-size: 14px; }
.call-strip.dialing .ci { animation: ctipulse 1s ease-in-out infinite; }
@keyframes ctipulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
.cp { font-weight: 700; }
.cc { color: #374151; font-weight: 600; }
.cn { color: #6b7280; }
.mono { font-variant-numeric: tabular-nums; }
.signal { display: inline-flex; align-items: flex-end; gap: 2px; height: 14px; }
.signal i { width: 3px; border-radius: 1px; background: #10b981; display: block; }
.signal .b1 { height: 5px; }
.signal .b2 { height: 9px; }
.signal .b3 { height: 13px; }
.cd { font-weight: 700; min-width: 42px; }
.hangup {
  display: inline-flex; align-items: center; gap: 4px; flex: none;
  height: 28px; padding: 0 12px; border-radius: 14px; border: none; cursor: pointer;
  background: #ef4444; color: #fff; font-size: 12px; font-weight: 600; font-family: inherit;
}
.hangup .hu { font-size: 12px; transform: rotate(135deg); }
.hangup:hover { background: #dc2626; }
</style>
