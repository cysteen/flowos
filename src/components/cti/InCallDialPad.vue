<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { CloseOutlined } from '@ant-design/icons-vue';
import DialPad from '@/components/cti/DialPad.vue';
import type { CallStatus } from '@/stores/cti';

const props = defineProps<{ digits: string; status: CallStatus; held: boolean }>();
const emit = defineEmits<{ digit: [digit: string]; close: [] }>();
const panel = ref<HTMLElement | null>(null);
const dialPad = ref<InstanceType<typeof DialPad> | null>(null);
let focusFrame: number | undefined;
const enabled = computed(() => props.status === 'connected' && !props.held);
const hint = computed(() => {
  if (props.status !== 'connected') return '等待接通';
  if (props.held) return '保持中';
  return '';
});

function focusWhenVisible() {
  focusFrame = undefined;
  const element = panel.value;
  if (!element) return;
  // Ant 弹层挂载时可能还处于隐藏/定位阶段，等它具备可聚焦布局后再移入焦点。
  if (!element.isConnected || !element.getClientRects().length
    || getComputedStyle(element).visibility !== 'visible') {
    focusFrame = requestAnimationFrame(focusWhenVisible);
    return;
  }
  if (!element.contains(document.activeElement) || document.activeElement === element) dialPad.value?.focus();
}

onMounted(() => {
  focusFrame = requestAnimationFrame(focusWhenVisible);
});
onBeforeUnmount(() => {
  if (focusFrame !== undefined) cancelAnimationFrame(focusFrame);
});
</script>

<template>
  <section
    ref="panel"
    class="in-call-dial-pad"
    role="dialog"
    aria-label="通话拨号盘"
    tabindex="-1"
    @keydown.esc.prevent.stop="emit('close')"
  >
    <div class="panel-heading">
      <span>通话拨号盘</span>
      <span v-if="hint" class="panel-status" role="status">{{ hint }}</span>
      <button class="close-button" type="button" aria-label="关闭拨号盘" @click="emit('close')">
        <CloseOutlined />
      </button>
    </div>
    <DialPad
      ref="dialPad"
      mode="in-call"
      :digits="digits"
      :disabled="!enabled"
      compact
      @dtmf="emit('digit', $event)"
    />
  </section>
</template>

<style scoped>
.in-call-dial-pad {
  width: 192px;
  max-width: calc(100vw - 32px);
  box-sizing: border-box;
  padding: 4px;
  font-family: inherit;
  color: #374151;
  outline: none;
}
.panel-heading {
  display: flex;
  align-items: center;
  gap: 4px;
  margin: 0 6px;
  font-size: 12px;
  font-weight: 600;
}
.panel-status { margin-left: auto; font-size: 10px; color: #9ca3af; font-weight: 400; }
.close-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  margin-left: auto;
  padding: 0;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #6b7280;
  cursor: pointer;
}
.close-button:hover { background: #f3f4f6; }
.close-button:focus-visible { outline: 2px solid #2563eb; outline-offset: 2px; }

/* 已打开的开发页可能暂留旧弹层模板，保留其样式直到弹层重新挂载。 */
.in-call-dial-pad .digits-label,
.in-call-dial-pad .panel-hint { display: none; }
.in-call-dial-pad .digits-display {
  display: block;
  height: 26px;
  margin: 8px 10px 5px;
  overflow-x: auto;
  color: #111827;
  font-size: 16px;
  line-height: 26px;
  text-align: center;
  white-space: nowrap;
}
.in-call-dial-pad .keypad {
  display: grid;
  grid-template-columns: repeat(3, 34px);
  justify-content: center;
  gap: 7px 12px;
  padding: 0 10px 10px;
}
.in-call-dial-pad .digit-button {
  width: 34px;
  height: 34px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: #f1f2f4;
  color: #1f2937;
  font-family: inherit;
  font-size: 16px;
  cursor: pointer;
}
.in-call-dial-pad .digit-button:hover:not(:disabled) { background: #e8eaed; }
.in-call-dial-pad .digit-button:disabled { opacity: 0.45; cursor: not-allowed; }
</style>
