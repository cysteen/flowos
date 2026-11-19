<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import DialPad from '@/components/cti/DialPad.vue';
import type { CallStatus } from '@/stores/cti';

const props = defineProps<{ digits: string; status: CallStatus; held: boolean }>();
const emit = defineEmits<{ digit: [digit: string]; close: [] }>();
const panel = ref<HTMLElement | null>(null);
const dialPad = ref<InstanceType<typeof DialPad> | null>(null);
let focusFrame: number | undefined;
const enabled = computed(() => props.status === 'connected' && !props.held);

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
  width: 152px;
  max-width: calc(100vw - 32px);
  box-sizing: border-box;
  padding: 0;
  font-family: inherit;
  color: #374151;
  outline: none;
}
/* 已打开的开发页可能暂留旧弹层模板，保留其样式直到弹层重新挂载。 */
.in-call-dial-pad .panel-heading,
.in-call-dial-pad .digits-label,
.in-call-dial-pad .panel-hint { display: none; }
.in-call-dial-pad .digits-display {
  display: block;
  height: 20px;
  margin: 6px 8px 5px;
  overflow-x: auto;
  color: #111827;
  font-size: 14px;
  line-height: 20px;
  text-align: center;
  white-space: nowrap;
}
.in-call-dial-pad .keypad {
  display: grid;
  grid-template-columns: repeat(3, 30px);
  justify-content: center;
  gap: 5px 10px;
  padding: 0 8px 6px;
}
.in-call-dial-pad .digit-button {
  width: 30px;
  height: 30px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: #f1f2f4;
  color: #1f2937;
  font-family: inherit;
  font-size: 15px;
  cursor: pointer;
}
.in-call-dial-pad .digit-button:hover:not(:disabled) { background: #e8eaed; }
.in-call-dial-pad .digit-button:disabled { opacity: 0.45; cursor: not-allowed; }
</style>
