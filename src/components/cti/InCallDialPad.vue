<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { CloseOutlined } from '@ant-design/icons-vue';
import type { CallStatus } from '@/stores/cti';

const props = defineProps<{ digits: string; status: CallStatus; held: boolean }>();
const emit = defineEmits<{ digit: [digit: string]; close: [] }>();
const panel = ref<HTMLElement | null>(null);
const display = ref<HTMLOutputElement | null>(null);
let focusFrame: number | undefined;
const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'];
const enabled = computed(() => props.status === 'connected' && !props.held);
const hint = computed(() => {
  if (props.status !== 'connected') return '等待接通后可输入分机号';
  if (props.held) return '通话保持中，接回后可继续输入';
  return '点击按键或使用键盘输入 0–9、*、#';
});

function inputDigit(digit: string) {
  if (enabled.value) emit('digit', digit);
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    emit('close');
    return;
  }
  if (event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return;
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  if (target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])')) return;

  if (/^[0-9*#]$/.test(event.key)) {
    event.preventDefault();
    event.stopPropagation();
    if (!event.repeat) inputDigit(event.key);
    return;
  }
  if (event.key === 'Enter' || event.key === ' ') {
    const digit = target.closest<HTMLButtonElement>('button[data-dtmf-key]')?.dataset.dtmfKey;
    if (digit) {
      // 阻止按钮原生键盘 click，避免同一次按键同时经 keydown 和 click 记录两次。
      event.preventDefault();
      event.stopPropagation();
      if (!event.repeat) inputDigit(digit);
    } else if (event.key === ' ' && target === panel.value) {
      event.preventDefault();
    }
  }
}

async function scrollToLatest() {
  await nextTick();
  if (display.value) display.value.scrollLeft = display.value.scrollWidth;
}

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
  if (!element.contains(document.activeElement)) element.focus({ preventScroll: true });
  scrollToLatest();
}

onMounted(() => {
  scrollToLatest();
  focusFrame = requestAnimationFrame(focusWhenVisible);
});
onBeforeUnmount(() => {
  if (focusFrame !== undefined) cancelAnimationFrame(focusFrame);
});
watch(() => props.digits, scrollToLatest);
</script>

<template>
  <section
    ref="panel"
    class="in-call-dial-pad"
    role="dialog"
    aria-label="通话拨号盘"
    tabindex="-1"
    @keydown="onKeydown"
  >
    <div class="panel-heading">
      <span>通话拨号盘</span>
      <button class="close-button" type="button" aria-label="关闭拨号盘" @click="emit('close')">
        <CloseOutlined />
      </button>
    </div>
    <div class="digits-label">已输入</div>
    <output ref="display" class="digits-display" aria-label="已输入的通话按键">{{ digits || '—' }}</output>
    <p class="panel-hint" role="status">{{ hint }}</p>
    <div class="keypad">
      <button
        v-for="key in keys"
        :key="key"
        class="digit-button"
        type="button"
        :data-dtmf-key="key"
        :disabled="!enabled"
        :aria-label="key"
        @click="inputDigit(key)"
      >{{ key }}</button>
    </div>
  </section>
</template>

<style scoped>
.in-call-dial-pad {
  width: 248px;
  max-width: calc(100vw - 32px);
  box-sizing: border-box;
  padding: 14px;
  font-family: inherit;
  color: #374151;
  outline: none;
}
.panel-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
  font-size: 13px;
  font-weight: 600;
}
.close-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #6b7280;
  cursor: pointer;
}
.close-button:hover { background: #f3f4f6; }
.digits-label { margin-bottom: 4px; font-size: 11px; color: #6b7280; }
.digits-display {
  display: block;
  overflow-x: auto;
  padding: 8px 10px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #f9fafb;
  font-size: 20px;
  line-height: 28px;
  letter-spacing: 2px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.panel-hint {
  margin: 8px 0 12px;
  color: #6b7280;
  font-size: 11px;
  line-height: 18px;
}
.keypad { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
.digit-button {
  height: 42px;
  padding: 0;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #fff;
  color: #111827;
  font-family: inherit;
  font-size: 20px;
  cursor: pointer;
}
.digit-button:not(:disabled):hover { border-color: #34d399; background: #ecfdf5; color: #047857; }
.digit-button:not(:disabled):active { background: #d1fae5; }
.digit-button:disabled { color: #9ca3af; background: #f3f4f6; cursor: not-allowed; }
.digit-button:focus-visible,
.close-button:focus-visible { outline: 2px solid #2563eb; outline-offset: 2px; }
</style>
