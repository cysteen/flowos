<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { PhoneFilled } from '@ant-design/icons-vue';

const emit = defineEmits<{ (e: 'call', phone: string): void }>();

const num = ref('');
const clipSuggest = ref('');
const padEl = ref<HTMLDivElement | null>(null);

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
  if (num.value.length < 24) num.value += d;
  clipSuggest.value = '';
}
function backspace() {
  num.value = num.value.slice(0, -1);
}
function clearAll() {
  num.value = '';
}
function call() {
  const phone = num.value.trim();
  if (phone) emit('call', phone);
}

/** 光标进入拨号盘：读剪贴板，若有号码则浮出粘贴提示 */
async function checkClipboard() {
  if (num.value) return;
  try {
    const cleaned = sanitize(await navigator.clipboard.readText());
    if (looksLikePhone(cleaned)) clipSuggest.value = cleaned;
  } catch {
    /* 剪贴板不可读则不提示 */
  }
}
function fillClip() {
  num.value = clipSuggest.value.slice(0, 24);
  clipSuggest.value = '';
}
/** 直接 Ctrl/⌘+V 也能粘贴 */
function onPaste(e: ClipboardEvent) {
  const cleaned = sanitize(e.clipboardData?.getData('text') ?? '');
  if (cleaned) {
    num.value = (num.value + cleaned).slice(0, 24);
    clipSuggest.value = '';
    e.preventDefault();
  }
}

/** 电脑键盘（含小键盘）：0-9 * # + 输入，Backspace 删除，Enter 呼叫（Win/Mac 通用，靠 e.key） */
function onKeydown(e: KeyboardEvent) {
  if (e.ctrlKey || e.metaKey || e.altKey) return; // 放行 Ctrl/⌘+V 等组合键
  const k = e.key;
  if (/^[0-9*#+]$/.test(k)) { press(k); e.preventDefault(); }
  else if (k === 'Backspace' || k === 'Delete') { backspace(); e.preventDefault(); }
  else if (k === 'Enter') { call(); e.preventDefault(); }
}

onMounted(() => {
  padEl.value?.focus();
  checkClipboard();
});
</script>

<template>
  <div
    ref="padEl"
    class="dialpad"
    tabindex="0"
    @focus="checkClipboard"
    @paste="onPaste"
    @keydown="onKeydown"
  >
    <div class="dp-cap">拨号盘 · 外呼</div>

    <div class="dp-display">
      <span class="dp-num" :class="{ 'is-empty': !num }">{{ num || '输入号码' }}</span>
    </div>

    <button v-if="clipSuggest && !num" class="dp-clip" type="button" @click="fillClip">
      <svg viewBox="0 0 20 20" width="14" height="14" fill="none">
        <rect x="5" y="3.5" width="10" height="13" rx="2" stroke="currentColor" stroke-width="1.5" />
        <rect x="7.5" y="2" width="5" height="3" rx="1" stroke="currentColor" stroke-width="1.5" fill="#fff" />
      </svg>
      <span>粘贴 <b>{{ clipSuggest }}</b></span>
    </button>

    <div class="dp-keys">
      <button v-for="k in KEYS" :key="k.d" class="dp-key" type="button" @click="press(k.d)">
        <span class="dp-key-d">{{ k.d }}</span>
        <span class="dp-key-s">{{ k.s || ' ' }}</span>
      </button>
    </div>

    <div class="dp-actions">
      <span class="dp-side-ph" />
      <button class="dp-call" type="button" :disabled="!num" title="呼叫" @click="call">
        <PhoneFilled />
      </button>
      <button
        class="dp-back"
        type="button"
        title="删除（双击清空）"
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
  width: 196px;
  padding: 8px 10px 10px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  font-family: inherit;
  outline: none;
}
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
  grid-template-columns: repeat(3, 42px);
  gap: 7px 12px;
  justify-content: center;
  margin-top: 1px;
}
.dp-key {
  width: 42px;
  height: 42px;
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
.dp-key:hover { background: #e8eaed; }
.dp-key:active { background: #dcdfe4; }
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
  width: 42px;
  height: 42px;
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
