<script setup lang="ts">
import { computed, reactive, watch } from 'vue';
import { message } from 'ant-design-vue';
import { LoginOutlined } from '@ant-design/icons-vue';
import OpActionModal from '@/views/tickets/components/operation/OpActionModal.vue';
import {
  useCtiStore,
  type SignInChannel,
  type SignInNumberMode,
} from '@/stores/cti';

const open = defineModel<boolean>('open', { default: false });

const cti = useCtiStore();

/**
 * 接听方式 —— 三选一。
 *
 * 原先拆成「登录方式（SIP/浏览器）」+「号码类型（软号/手机号）」两层：坐席要先选一层
 * 再选一层，而「浏览器」下第二层又不出现；加上字段名与选项名都叫「软号」，一屏里出现
 * 两个软号。这三种其实是互斥的三件事，摊平成一组。
 */
type SignInWay = 'browser' | 'sip' | 'mobile';

const WAYS: { value: SignInWay; label: string }[] = [
  { value: 'browser', label: '浏览器通话' },
  { value: 'sip', label: 'SIP 话机' },
  { value: 'mobile', label: '手机回拨' },
];

const form = reactive({
  signNumber: '',
  password: '',
  way: 'sip' as SignInWay,
});

/** 三选一 → 落库的两个字段（store 结构不变） */
const channelOf = (way: SignInWay): SignInChannel => (way === 'browser' ? 'browser' : 'sip');
const numberModeOf = (way: SignInWay): SignInNumberMode | null => {
  if (way === 'sip') return 'soft';
  if (way === 'mobile') return 'mobile';
  return null;
};

/** 上次用过的号码：SIP 与手机回拨各记一个，首次为空由坐席填，之后带出可改 */
const rememberedNumber = (way: SignInWay): string => {
  if (way === 'sip') return cti.lastSignInNumbers.sip;
  if (way === 'mobile') return cti.lastSignInNumbers.mobile;
  return '';
};

watch(open, (visible) => {
  if (!visible) return;
  form.password = '';
  form.way = cti.signInChannel === 'browser'
    ? 'browser'
    : cti.signInNumberMode === 'mobile' ? 'mobile' : 'sip';
  form.signNumber = rememberedNumber(form.way);
});

// 切方式跟着换号码：两种方式的号码格式不同，留着上一种的会直接校验失败
watch(
  () => form.way,
  (way) => {
    form.signNumber = rememberedNumber(way);
  },
);

const showSignNumber = computed(() => form.way !== 'browser');

const numberLabel = computed(() => (form.way === 'mobile' ? '手机号' : '分机 / 软号'));

const numberPlaceholder = computed(() =>
  form.way === 'mobile'
    ? '平台将呼叫此号码，接通后再接客户'
    : '话机或软电话的分机号，如 8001',
);

function normalizeSignNumber(raw: string): string {
  return raw.replace(/\s/g, '');
}

function validateSignNumber(): string | null {
  if (form.way === 'browser') return null;

  const value = normalizeSignNumber(form.signNumber);
  if (!value) return `请输入${numberLabel.value}`;

  if (form.way === 'mobile') {
    if (!/^1\d{10}$/.test(value)) return '请输入正确的 11 位手机号';
    return null;
  }

  if (!/^\d{3,12}$/.test(value)) return '分机 / 软号为 3–12 位数字';
  return null;
}

const canSubmit = computed(() => {
  if (form.way === 'browser') return true;
  const value = normalizeSignNumber(form.signNumber);
  if (!value) return false;
  if (form.way === 'mobile') return /^1\d{10}$/.test(value);
  return /^\d{3,12}$/.test(value);
});

function close() {
  open.value = false;
}

function onSubmit() {
  const numberError = validateSignNumber();
  if (numberError) {
    message.warning(numberError);
    return;
  }

  const extension = form.way === 'browser' ? '' : normalizeSignNumber(form.signNumber);

  cti.signInWith({
    extension,
    password: form.password.trim(),
    channel: channelOf(form.way),
    numberMode: numberModeOf(form.way),
  });

  const label = WAYS.find((w) => w.value === form.way)?.label ?? '';
  message.success(extension ? `已签入 · ${label} ${extension}` : `已签入 · ${label}`);
  close();
}
</script>

<template>
  <OpActionModal
    v-model:open="open"
    title="签入"
    :icon="LoginOutlined"
    tone="primary"
    :width="480"
    ok-text="确认"
    :ok-disabled="!canSubmit"
    @ok="onSubmit"
    @cancel="close"
  >
    <div class="op-form">
      <div class="op-field op-field-h">
        <div class="op-label">话务员</div>
        <div class="signin-readonly">{{ cti.agentNo }}</div>
      </div>

      <div class="op-field op-field-h">
        <div class="op-label">签入方式</div>
        <a-radio-group v-model:value="form.way" class="signin-radio">
          <a-radio v-for="w in WAYS" :key="w.value" :value="w.value">{{ w.label }}</a-radio>
        </a-radio-group>
      </div>

      <div v-if="showSignNumber" class="op-field op-field-h">
        <div class="op-label req">{{ numberLabel }}</div>
        <div class="signin-ctl">
          <a-input
            v-model:value="form.signNumber"
            :placeholder="numberPlaceholder"
            :maxlength="form.way === 'mobile' ? 11 : 12"
            autocomplete="off"
            inputmode="numeric"
          />
        </div>
      </div>

      <div class="op-field op-field-h">
        <div class="op-label">密码</div>
        <div class="signin-ctl">
          <a-input-password
            v-model:value="form.password"
            placeholder="选填"
            autocomplete="new-password"
          />
        </div>
      </div>
    </div>
  </OpActionModal>
</template>

<style scoped>
.signin-readonly {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  color: #374151;
  font-weight: 500;
  padding: 6px 10px;
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
}

.signin-ctl {
  flex: 1;
  min-width: 0;
}

.signin-ctl--block {
  width: 100%;
}

.signin-ctl :deep(.ant-input),
.signin-ctl :deep(.ant-input-affix-wrapper) {
  width: 100%;
}

.signin-radio {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 16px;
  white-space: nowrap;
}

.signin-radio :deep(.ant-radio-wrapper) {
  margin-inline-end: 0;
}
</style>
