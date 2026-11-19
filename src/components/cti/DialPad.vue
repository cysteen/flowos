<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { PhoneFilled } from '@ant-design/icons-vue';

const props = withDefaults(defineProps<{
  mode?: 'outbound' | 'in-call';
  digits?: string;
  disabled?: boolean;
  compact?: boolean;
  active?: boolean;
}>(), { mode: 'outbound', digits: '', disabled: false, compact: false, active: true });
const emit = defineEmits<{
  call: [phone: string, outboundNumber: string];
  dtmf: [digit: string];
}>();
const inCall = computed(() => props.mode === 'in-call');

const outboundNumber = ref('');

const num = ref('');
const clipSuggest = ref('');
const padEl = ref<HTMLDivElement | null>(null);
const digitDisplay = ref<HTMLOutputElement | null>(null);
let focusFrame: number | undefined;

const KEYS: { d: string; s: string }[] = [
  { d: '1', s: '' }, { d: '2', s: 'ABC' }, { d: '3', s: 'DEF' },
  { d: '4', s: 'GHI' }, { d: '5', s: 'JKL' }, { d: '6', s: 'MNO' },
  { d: '7', s: 'PQRS' }, { d: '8', s: 'TUV' }, { d: '9', s: 'WXYZ' },
  { d: '*', s: '' }, { d: '0', s: '+' }, { d: '#', s: '' },
];

/** 清理为纯号码字符（去空格、横线、括号等） */
function sanitize(text: string): string {
  return text.replace(/[^\d+*#]/g, '');
}
/** 是否像一个电话号码（足够长且以数字/+ 开头） */
function looksLikePhone(s: string): boolean {
  return s.length >= 5 && /^[+\d]/.test(s);
}

function press(d: string) {
  if (props.disabled) return;
  if (inCall.value) {
    if (d.length === 1 && /^[0-9*#]$/.test(d)) emit('dtmf', d);
    return;
  }
  if (num.value.length < 24) num.value += d;
  clipSuggest.value = '';
}
function backspace() {
  if (inCall.value || props.disabled) return;
  num.value = num.value.slice(0, -1);
}
function clearAll() {
  if (inCall.value || props.disabled) return;
  num.value = '';
}
function call() {
  if (inCall.value || props.disabled) return;
  const phone = num.value.trim();
  if (phone) emit('call', phone, outboundNumber.value);
}

/** 光标进入拨号盘：读剪贴板，若有号码则浮出粘贴提示 */
async function checkClipboard() {
  if (inCall.value || props.disabled || num.value) return;
  try {
    const cleaned = sanitize(await navigator.clipboard.readText());
    if (inCall.value || props.disabled || num.value) return;
    if (looksLikePhone(cleaned)) clipSuggest.value = cleaned;
  } catch {
    /* 剪贴板不可读则不提示 */
  }
}
function fillClip() {
  if (inCall.value || props.disabled) return;
  num.value = clipSuggest.value.slice(0, 24);
  clipSuggest.value = '';
  focus();
}
/** 直接 Ctrl/⌘+V 也能粘贴 */
function onPaste(e: ClipboardEvent) {
  if (inCall.value || props.disabled) {
    e.preventDefault();
    return;
  }
  const cleaned = sanitize(e.clipboardData?.getData('text') ?? '');
  if (cleaned) {
    num.value = (num.value + cleaned).slice(0, 24);
    clipSuggest.value = '';
    e.preventDefault();
  }
}

/** 电脑键盘（含小键盘）：0-9 * # + 输入，Backspace 删除，Enter 呼叫（Win/Mac 通用，靠 e.key） */
function onKeydown(e: KeyboardEvent) {
  if (e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return; // 放行 Ctrl/⌘+V 等组合键
  const target = e.target;
  if (!(target instanceof HTMLElement)) return;
  if (target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])')) return;
  const k = e.key;
  if (inCall.value) {
    if (k.length === 1 && /^[0-9*#]$/.test(k)) {
      e.preventDefault();
      e.stopPropagation();
      if (!e.repeat) press(k);
    } else if (k === 'Enter' || k === ' ') {
      const digit = target.closest<HTMLButtonElement>('button[data-dtmf-key]')?.dataset.dtmfKey;
      if (digit) {
        // 禁止原生 click 再次触发，同一次 Enter/Space 只记录一个按键。
        e.preventDefault();
        e.stopPropagation();
        if (!e.repeat) press(digit);
      } else if (k === ' ' && target === padEl.value) {
        e.preventDefault();
      }
    }
    return;
  }
  if (/^[0-9*#+]$/.test(k)) { press(k); e.preventDefault(); }
  else if (k === 'Backspace' || k === 'Delete') { backspace(); e.preventDefault(); }
  else if (k === 'Enter') { call(); e.preventDefault(); }
}

function fillNumber(phone: string) {
  if (inCall.value || props.disabled) return;
  num.value = sanitize(phone).slice(0, 24);
  clipSuggest.value = '';
  focus();
}

function setOutboundNumber(number: string) {
  if (inCall.value) return;
  outboundNumber.value = number;
}

async function scrollToLatest() {
  await nextTick();
  if (digitDisplay.value) digitDisplay.value.scrollLeft = digitDisplay.value.scrollWidth;
}

function focusWhenVisible() {
  focusFrame = undefined;
  if (!inCall.value && !props.active) return;
  const element = padEl.value;
  if (!element) return;
  if (!element.isConnected || !element.getClientRects().length
    || getComputedStyle(element).visibility !== 'visible') {
    focusFrame = requestAnimationFrame(focusWhenVisible);
    return;
  }
  if (!element.contains(document.activeElement)) element.focus({ preventScroll: true });
  if (inCall.value) scrollToLatest();
}

function cancelFocus() {
  if (focusFrame !== undefined) cancelAnimationFrame(focusFrame);
  focusFrame = undefined;
}

function focus() {
  cancelFocus();
  if (!inCall.value && !props.active) return;
  focusFrame = requestAnimationFrame(focusWhenVisible);
}

onMounted(() => {
  // 通话弹层由 wrapper 在可见后聚焦，避免隐藏时 focus 失效。
  if (!inCall.value) focus();
});
onBeforeUnmount(cancelFocus);
watch(() => props.active, (active) => {
  if (inCall.value) return;
  if (active) focus();
  else cancelFocus();
}, { flush: 'sync' });
watch(() => props.digits, scrollToLatest);

defineExpose({ fillNumber, setOutboundNumber, focus });
</script>

<template>
  <div
    ref="padEl"
    class="dialpad"
    :class="{ compact, 'in-call': inCall }"
    :aria-label="inCall ? '通话号码盘' : '外呼号码盘'"
    tabindex="0"
    @focus="checkClipboard"
    @paste="onPaste"
    @keydown="onKeydown"
  >
    <div v-if="!inCall" class="dp-cap">拨号盘 · 外呼</div>

    <div class="dp-display">
      <output v-if="inCall" ref="digitDisplay" class="dp-num dp-dtmf" aria-label="已输入的通话按键">{{ digits || '—' }}</output>
      <span v-else class="dp-num" :class="{ 'is-empty': !num }">{{ num || '输入号码' }}</span>
    </div>

    <button v-if="!inCall && clipSuggest && !num" class="dp-clip" type="button" :disabled="disabled" @click="fillClip">
      <svg viewBox="0 0 20 20" width="14" height="14" fill="none">
        <rect x="5" y="3.5" width="10" height="13" rx="2" stroke="currentColor" stroke-width="1.5" />
        <rect x="7.5" y="2" width="5" height="3" rx="1" stroke="currentColor" stroke-width="1.5" fill="#fff" />
      </svg>
      <span>粘贴 <b>{{ clipSuggest }}</b></span>
    </button>

    <div class="dp-keys">
      <button
        v-for="k in KEYS"
        :key="k.d"
        class="dp-key"
        type="button"
        :data-dtmf-key="k.d"
        :aria-label="k.d"
        :disabled="disabled"
        @click="press(k.d)"
      >
        <span class="dp-key-d">{{ k.d }}</span>
        <span class="dp-key-s">{{ k.s || ' ' }}</span>
      </button>
    </div>

    <div v-if="!inCall" class="dp-actions">
      <span class="dp-side-ph" />
      <button
        class="dp-call"
        type="button"
        :disabled="disabled || !num"
        title="呼叫"
        @click="call"
      >
        <PhoneFilled />
      </button>
      <button
        class="dp-back"
        type="button"
        title="删除（双击清空）"
        :disabled="disabled"
        :class="{ 'is-hidden': !num }"
        @click="backspace"
        @dblclick="clearAll"
      >
        <span class="dp-back-i">⌫</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.dialpad {
  --dp-key-size: 42px;
  width: 196px;
  padding: 8px 10px 10px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  font-family: inherit;
  outline: none;
}
.dialpad.compact {
  --dp-key-size: 34px;
  box-sizing: border-box;
  width: 184px;
}
.dialpad.compact .dp-key-d { font-size: 16px; }
.dialpad.compact .dp-num { font-size: 18px; }
.dialpad.compact .dp-num.is-empty { font-size: 12px; }
.dialpad.compact .dp-call { font-size: 15px; }
.dialpad.in-call .dp-display { height: 26px; }
.dialpad.in-call .dp-dtmf {
  width: 100%;
  overflow-x: auto;
  text-overflow: clip;
  text-align: center;
  direction: ltr;
  font-size: 16px;
  line-height: 22px;
}
.dialpad.in-call.compact {
  --dp-key-size: 30px;
  width: 152px;
  padding: 6px 8px;
}
.dialpad.in-call.compact .dp-display { height: 20px; }
.dialpad.in-call.compact .dp-dtmf { font-size: 14px; line-height: 20px; }
.dialpad.in-call.compact .dp-keys { gap: 5px 10px; margin-top: 0; }
.dialpad.in-call.compact .dp-key-d { font-size: 15px; }
.dp-cap {
  align-self: flex-start;
  font-size: 10px;
  color: #9ca3af;
  font-weight: 600;
}

.dp-display {
  width: 100%;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.dp-num {
  font-size: 22px;
  font-weight: 500;
  letter-spacing: 1px;
  color: #111827;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  direction: rtl;
  max-width: 100%;
}
.dp-num.is-empty { font-size: 13px; color: #cbd5e1; direction: ltr; }

/* 剪贴板粘贴提示（点击填入） */
.dp-clip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  max-width: 100%;
  height: 22px;
  padding: 0 10px;
  border: 1px solid #bfdbfe;
  border-radius: 999px;
  background: #eff6ff;
  color: #2563eb;
  font-size: 11px;
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  transition: background 0.1s;
}
.dp-clip:hover { background: #dbeafe; }
.dp-clip b { font-weight: 700; font-variant-numeric: tabular-nums; }

.dp-keys {
  display: grid;
  grid-template-columns: repeat(3, var(--dp-key-size));
  gap: 7px 12px;
  justify-content: center;
  margin-top: 1px;
}
.dp-key {
  width: var(--dp-key-size);
  height: var(--dp-key-size);
  border-radius: 50%;
  border: none;
  background: #f1f2f4;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.1s;
  user-select: none;
}
.dp-key:hover:not(:disabled) { background: #e8eaed; }
.dp-key:active:not(:disabled) { background: #dcdfe4; }
.dp-key:disabled { opacity: 0.45; cursor: not-allowed; }
.dp-key:focus-visible { outline: 2px solid #2563eb; outline-offset: 2px; }
.dp-key-d { font-size: 19px; font-weight: 500; color: #1f2937; line-height: 1; }
.dp-key-s {
  font-size: 7px;
  font-weight: 700;
  letter-spacing: 1px;
  color: #9ca3af;
  line-height: 1;
  margin-top: 1px;
}

.dp-actions {
  width: 100%;
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  margin-top: 4px;
}
.dp-side-ph { width: 34px; }
.dp-call {
  width: var(--dp-key-size);
  height: var(--dp-key-size);
  border-radius: 50%;
  border: none;
  background: #16a34a;
  color: #fff;
  font-size: 17px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  justify-self: center;
  box-shadow: 0 2px 5px rgba(22, 163, 74, 0.35);
  transition: background 0.12s;
}
.dp-call:hover:not(:disabled) { background: #15803d; }
.dp-call:disabled { background: #cbd5e1; box-shadow: none; cursor: not-allowed; }

.dp-back {
  justify-self: end;
  border: none;
  background: transparent;
  color: #64748b;
  cursor: pointer;
}
.dp-back-i { font-size: 18px; line-height: 1; }
.dp-back:hover { color: #ef4444; }
.dp-back.is-hidden { visibility: hidden; }
</style>
