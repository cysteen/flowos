<script setup lang="ts">
import { computed } from 'vue';
import {
  AudioMutedOutlined, AudioOutlined, CloseOutlined, PauseCircleOutlined,
  PhoneOutlined, PlayCircleOutlined,
} from '@ant-design/icons-vue';
import { useCtiStore, formatCallDuration, maskPhone } from '@/stores/cti';

const props = withDefaults(defineProps<{ variant?: 'anchor' | 'main' | 'overlay' }>(), { variant: 'main' });

const cti = useCtiStore();
const session = computed(() => cti.callSession);

const statusText = computed(() => {
  const s = session.value;
  if (!s) return '';
  const dur = formatCallDuration(cti.callTimerMs);
  if (s.status === 'dialing') return `呼叫中 · ${dur}`;
  if (s.status === 'ringing') return `振铃中 · ${dur}`;
  if (s.status === 'connected' && s.held) {
    return `保持中 · ${formatCallDuration(cti.holdTimerMs)}`;
  }
  // overlay 靠配色 + 操作钮表达静音态，避免「已静音 + 取消静音」重复占宽
  if (s.muted && props.variant !== 'overlay') return `通话中 · ${dur} · 已静音`;
  return `通话中 · ${dur}`;
});

const tone = computed(() => {
  const st = session.value?.status;
  return st === 'connected' ? 'connected' : 'pending';
});

const canControl = computed(() => session.value?.status === 'connected');

const outboundDisplay = computed(() => session.value?.outboundNumber?.trim() ?? '');

/** 顶栏紧凑模式：联系人就是号码本身时不重复展示 */
const showContact = computed(() => {
  const s = session.value;
  if (!s || props.variant === 'main') return true;
  const label = s.contactLabel.trim();
  const phone = s.phone.replace(/\s/g, '');
  if (!label || label === phone || label === s.phone) return false;
  return true;
});
</script>

<template>
  <div
    v-if="session"
    class="call-bar"
    :class="[tone, variant, { 'is-muted': session.muted && !session.held, 'is-held': session.held }]"
  >
    <span class="status">{{ statusText }}</span>
    <span v-if="showContact" class="contact">{{ session.contactLabel }}</span>
    <span class="phone">{{ maskPhone(session.phone) }}</span>
    <span
      v-if="outboundDisplay"
      class="outbound"
      :title="`外显 ${outboundDisplay}`"
    >外显 {{ outboundDisplay }}</span>

    <div class="acts">
      <button
        v-if="canControl"
        class="act hold"
        :class="{ on: session.held }"
        type="button"
        :title="session.held ? '接回' : '保持'"
        :aria-label="session.held ? '接回' : '保持'"
        @click="cti.toggleHold()"
      >
        <PlayCircleOutlined v-if="session.held" />
        <PauseCircleOutlined v-else />
        <span v-if="variant !== 'overlay'" class="act-label">{{ session.held ? '接回' : '保持' }}</span>
      </button>

      <button
        v-if="canControl"
        class="act mute"
        :class="{ on: session.muted }"
        type="button"
        :title="session.muted ? '取消静音' : '静音'"
        :aria-label="session.muted ? '取消静音' : '静音'"
        @click="cti.toggleMute()"
      >
        <AudioMutedOutlined v-if="session.muted" />
        <AudioOutlined v-else />
        <span v-if="variant !== 'overlay'" class="act-label">{{ session.muted ? '取消静音' : '静音' }}</span>
      </button>

      <button
        v-if="session.status === 'dialing'"
        class="act cancel"
        type="button"
        @click="cti.cancelCall()"
      >
        <CloseOutlined /><span>取消呼叫</span>
      </button>
      <button
        v-else
        class="act hangup"
        type="button"
        @click="cti.hangup()"
      >
        <PhoneOutlined class="off" /><span>挂断</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.call-bar {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex: none;
  border: 1px solid;
  font-family: inherit;
}
.call-bar.anchor {
  height: 32px;
  max-width: min(100%, 360px);
  padding: 0 8px 0 12px;
  border-radius: 14px;
  font-size: 12px;
}
.call-bar.main {
  height: 52px;
  padding: 0 14px;
  border-radius: 12px;
  font-size: 13px;
  width: 100%;
}
/** 盖在 CTI 签入条上：按内容收宽，最长不超过整条 CTI 槽 */
.call-bar.overlay {
  display: flex;
  width: max-content;
  max-width: 100%;
  min-width: 0;
  height: 36px;
  padding: 0 10px;
  gap: 6px;
  border-radius: 10px;
  font-size: 12px;
  box-sizing: border-box;
  box-shadow: 0 1px 4px rgb(0 0 0 / 8%);
}
.call-bar.overlay .status {
  flex-shrink: 0;
}
.call-bar.overlay .contact {
  max-width: none;
  min-width: 0;
  flex-shrink: 1;
}
.call-bar.overlay .phone {
  flex-shrink: 0;
}
.call-bar.overlay .acts {
  margin-left: auto;
  flex-shrink: 0;
}
.call-bar.overlay .act {
  height: 28px;
  padding: 0 8px;
  border-radius: 12px;
  font-size: 11px;
}
.call-bar.overlay .act.mute,
.call-bar.overlay .act.hold {
  padding: 0 7px;
}
.call-bar.pending {
  background: #fffbeb;
  border-color: #fcd34d;
}
.call-bar.connected {
  background: #ecfdf5;
  border-color: #a7f3d0;
}
.call-bar.connected.is-muted {
  background: #fff7ed;
  border-color: #fdba74;
}
.call-bar.connected.is-held {
  background: #eff6ff;
  border-color: #93c5fd;
}
.status {
  font-weight: 700;
  white-space: nowrap;
  flex: none;
}
.call-bar.anchor .status {
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 108px;
}
.call-bar.pending .status { color: #d97706; }
.call-bar.connected .status { color: #047857; }
.call-bar.connected.is-muted .status { color: #c2410c; }
.call-bar.connected.is-held .status { color: #1d4ed8; }
.contact {
  font-weight: 600;
  color: #374151;
  white-space: nowrap;
  flex: none;
  max-width: 88px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.call-bar.main .contact { color: #111827; }
.phone {
  color: #6b7280;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  flex: none;
}
.outbound {
  color: #64748b;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  flex: none;
}
.call-bar.overlay .outbound {
  max-width: none;
  min-width: 0;
  flex-shrink: 1;
  overflow: hidden;
  text-overflow: ellipsis;
}
.acts {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;
  flex: none;
  flex-shrink: 0;
}
.act {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  flex: none;
  cursor: pointer;
  font-family: inherit;
  font-weight: 600;
  border: 1px solid transparent;
}
.call-bar.anchor .act {
  height: 26px;
  min-width: 26px;
  padding: 0 8px;
  border-radius: 12px;
  font-size: 11px;
}
.call-bar.anchor .act.mute {
  padding: 0 8px;
  gap: 3px;
}
.call-bar.main .act {
  height: 30px;
  padding: 0 12px;
  border-radius: 14px;
  font-size: 12px;
}
.act :deep(.anticon) { font-size: 13px; }
.act.mute {
  background: #fff;
  border-color: #d1d5db;
  color: #6b7280;
}
.act.mute:hover {
  border-color: #9ca3af;
  color: #374151;
}
.act.mute.on {
  background: #ffedd5;
  border-color: #fb923c;
  color: #c2410c;
}
.act.hold {
  background: #fff;
  border-color: #d1d5db;
  color: #6b7280;
}
.act.hold:hover {
  border-color: #9ca3af;
  color: #374151;
}
.act.hold.on {
  background: #dbeafe;
  border-color: #60a5fa;
  color: #1d4ed8;
}
.act.cancel {
  background: #fff;
  border-color: #d1d5db;
  color: #6b7280;
}
.act.cancel:hover { background: #f9fafb; }
.act.hangup {
  background: #ef4444;
  color: #fff;
}
.act.hangup:hover { background: #dc2626; }
.off { transform: rotate(135deg); }
.act-label { white-space: nowrap; }
</style>
