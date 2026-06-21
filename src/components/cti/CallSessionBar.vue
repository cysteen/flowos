<script setup lang="ts">
import { computed } from 'vue';
import { CloseOutlined, PhoneOutlined } from '@ant-design/icons-vue';
import { useCtiStore, formatCallDuration, maskPhone } from '@/stores/cti';

const props = withDefaults(defineProps<{ variant?: 'anchor' | 'main' }>(), { variant: 'main' });

const cti = useCtiStore();
const session = computed(() => cti.callSession);

const statusText = computed(() => {
  const s = session.value;
  if (!s) return '';
  const dur = formatCallDuration(cti.callTimerMs);
  if (s.status === 'dialing') return `呼叫中 · ${dur}`;
  if (s.status === 'ringing') return `振铃中 · ${dur}`;
  return `通话中 · ${dur}`;
});

const tone = computed(() => {
  const st = session.value?.status;
  return st === 'connected' ? 'connected' : 'pending';
});
</script>

<template>
  <div v-if="session" class="call-bar" :class="[tone, variant]">
    <span class="status">{{ statusText }}</span>
    <span class="contact">{{ session.contactLabel }}</span>
    <span class="phone">{{ maskPhone(session.phone) }}</span>

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
  padding: 0 12px;
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
.call-bar.pending {
  background: #fffbeb;
  border-color: #fcd34d;
}
.call-bar.connected {
  background: #ecfdf5;
  border-color: #a7f3d0;
}
.status {
  font-weight: 700;
  white-space: nowrap;
}
.call-bar.pending .status { color: #d97706; }
.call-bar.connected .status { color: #047857; }
.contact {
  font-weight: 600;
  color: #374151;
  white-space: nowrap;
}
.call-bar.main .contact { color: #111827; }
.phone {
  color: #6b7280;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.act {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-left: auto;
  flex: none;
  cursor: pointer;
  font-family: inherit;
  font-weight: 600;
  border: 1px solid transparent;
}
.call-bar.anchor .act {
  height: 26px;
  padding: 0 10px;
  border-radius: 12px;
  font-size: 11px;
}
.call-bar.main .act {
  height: 30px;
  padding: 0 12px;
  border-radius: 14px;
  font-size: 12px;
}
.act :deep(.anticon) { font-size: 12px; }
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
</style>
