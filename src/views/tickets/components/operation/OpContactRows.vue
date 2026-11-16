<script setup lang="ts">
import { computed } from 'vue';
import {
  PhoneOutlined, MailOutlined, MessageOutlined, SendOutlined,
} from '@ant-design/icons-vue';
import OutboundNumberPopover from '@/components/cti/OutboundNumberPopover.vue';
import type { ContactItem } from '@/views/tickets/types/operation';

const props = withDefaults(
  defineProps<{
    contacts: ContactItem[];
    showActions?: boolean;
    ticketId?: string;
    /** 外呼话务条展示：如「客户·李大海」「代办人·区域代理」 */
    callContactLabel?: string;
    /** 仅展示呼叫/短信按钮（号码由父级输入框展示） */
    actionsOnly?: boolean;
    /** 侧栏/登记顶栏：仅呼出图标（无「呼叫」文案） */
    callIconOnly?: boolean;
    /** actionsOnly + callIconOnly：号码由父级输入，空号时仍展示禁用图标 */
    outboundPhone?: string;
    /** 电话行展示「发邮件」（无需单独维护邮箱联系方式） */
    mailWithPhone?: boolean;
    showSms?: boolean;
    showEmail?: boolean;
  }>(),
  { actionsOnly: false, callIconOnly: false, mailWithPhone: false, showSms: true, showEmail: true },
);
const outboundNumber = computed(() => {
  const fromParent = props.outboundPhone?.trim() ?? '';
  if (fromParent) return fromParent;
  const phone = props.contacts.find((c) => c.type === 'phone')?.value?.trim() ?? '';
  return phone;
});
const outboundReady = computed(() => !!outboundNumber.value);
const emit = defineEmits<{
  contact: [type: 'call' | 'sms' | 'email', value: string];
  /** 工单侧栏经号码簿成功发起 CTI 外呼（记录由挂断后写入联系 Tab） */
  'outbound-success': [phone: string];
}>();
</script>

<template>
  <div class="contact-list" :class="{ 'actions-only': actionsOnly, 'icon-only': callIconOnly }">
    <template v-if="callIconOnly && showActions">
      <div class="contact-row contact-row--icon-only">
        <OutboundNumberPopover
          v-if="outboundReady && ticketId && callContactLabel"
          :phone="outboundNumber"
          :contact-label="callContactLabel"
          :ticket-id="ticketId"
          @success="emit('outbound-success', $event)"
        >
          <button type="button" class="act-icon-btn" title="呼出" aria-label="呼出">
            <PhoneOutlined class="act-icon-btn__glyph" />
          </button>
        </OutboundNumberPopover>
        <button
          v-else-if="outboundReady"
          type="button"
          class="act-icon-btn"
          title="呼出"
          aria-label="呼出"
          @click="emit('contact', 'call', outboundNumber)"
        >
          <PhoneOutlined class="act-icon-btn__glyph" />
        </button>
        <span
          v-else
          class="act-icon-btn is-disabled"
          title="请先填写联系人手机号"
          aria-label="呼出"
          aria-disabled="true"
        >
          <PhoneOutlined class="act-icon-btn__glyph" />
        </span>
      </div>
    </template>
    <template v-else>
    <div v-for="(c, i) in contacts" :key="i" class="contact-row">
      <template v-if="!actionsOnly">
        <PhoneOutlined v-if="c.type === 'phone'" class="contact-icon" />
        <MailOutlined v-else class="contact-icon" />
        <span class="v" :class="{ 'v-grow': c.type === 'email' || !showActions }">{{ c.value }}</span>
      </template>
      <template v-if="showActions">
        <span v-if="c.type === 'phone' && !actionsOnly" class="spacer" />
        <template v-if="c.type === 'phone'">
          <OutboundNumberPopover
            v-if="ticketId && callContactLabel"
            :phone="c.value"
            :contact-label="callContactLabel"
            :ticket-id="ticketId"
            @success="emit('outbound-success', $event)"
          >
            <span class="act act-call">
              <PhoneOutlined class="act-icon" />呼叫
            </span>
          </OutboundNumberPopover>
          <span v-else class="act act-call" @click="emit('contact', 'call', c.value)">
            <PhoneOutlined class="act-icon" />呼叫
          </span>
          <span v-if="showSms" class="act act-sms" @click="emit('contact', 'sms', c.value)">
            <MessageOutlined class="act-icon" />短信
          </span>
          <span
            v-if="showEmail && mailWithPhone"
            class="act act-mail"
            @click="emit('contact', 'email', '')"
          >
            <SendOutlined class="act-icon" />发邮件
          </span>
        </template>
        <span v-else-if="showEmail" class="act act-mail" @click="emit('contact', 'email', c.value)">
          <SendOutlined class="act-icon" />发邮件
        </span>
      </template>
    </div>
    <div
      v-if="showActions && showEmail && mailWithPhone && !contacts.length"
      class="contact-row"
    >
      <span v-if="!actionsOnly" class="spacer" />
      <span class="act act-mail" @click="emit('contact', 'email', '')">
        <SendOutlined class="act-icon" />发邮件
      </span>
    </div>
    </template>
  </div>
</template>

<style scoped>
.contact-list { display: flex; flex-direction: column; gap: 4px; flex: 1; min-width: 0; }
.contact-list.actions-only {
  flex: 1;
  min-width: 0;
  flex-direction: row;
  flex-wrap: wrap;
  align-items: center;
  align-content: flex-start;
  gap: 6px;
}
.contact-list.actions-only .contact-row {
  flex: 1 1 100%;
  flex-wrap: wrap;
  min-width: 0;
}
.contact-list.icon-only {
  flex: none;
  flex-direction: row;
  align-items: center;
  gap: 0;
}
.contact-list.icon-only .contact-row--icon-only {
  flex: none;
  min-height: 30px;
}
.contact-row { display: flex; align-items: center; gap: 6px; min-height: 22px; }
.act-icon-btn {
  flex: none;
  box-sizing: border-box;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 1px solid #a7f3d0;
  border-radius: 6px;
  background: #ecfdf5;
  color: #059669;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  font: inherit;
  line-height: 1;
  transition: background 0.15s, border-color 0.15s, color 0.15s, opacity 0.15s;
}
.act-icon-btn__glyph { font-size: 14px; }
.act-icon-btn:not(.is-disabled):hover {
  background: #d1fae5;
  border-color: #6ee7b7;
}
.act-icon-btn.is-disabled {
  opacity: 0.45;
  color: #9ca3af;
  background: #f5f5f5;
  border-color: #e5e7eb;
  cursor: not-allowed;
  pointer-events: none;
}
.contact-icon { color: #9ca3af; font-size: 13px; flex: none; }
.contact-row .v { color: #374151; font-weight: 500; min-width: 0; flex: none; font-size: 12px; }
.contact-row .v-grow { flex: 1; }
.spacer { flex: 1; min-width: 0; }
.act {
  flex: none; font-size: 11px; font-weight: 600; border-radius: 4px;
  padding: 3px 8px; cursor: pointer; display: inline-flex; align-items: center; gap: 4px;
  line-height: 1;
}
.act-icon { font-size: 12px; }
.act-call { color: #059669; background: #ecfdf5; border: 1px solid #a7f3d0; }
.act-sms { color: #1a6fff; background: #eff6ff; border: 1px solid #bfdbfe; }
.act-mail { color: #7c3aed; background: #f5f3ff; border: 1px solid #ddd6fe; }
</style>
