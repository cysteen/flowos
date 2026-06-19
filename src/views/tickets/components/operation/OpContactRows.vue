<script setup lang="ts">
import {
  PhoneOutlined, MailOutlined, MessageOutlined, SendOutlined,
} from '@ant-design/icons-vue';
import type { ContactItem } from '@/views/tickets/types/operation';

defineProps<{ contacts: ContactItem[] }>();
const emit = defineEmits<{ contact: [type: 'call' | 'sms' | 'email', value: string] }>();
</script>

<template>
  <div class="contact-list">
    <div v-for="(c, i) in contacts" :key="i" class="contact-row">
      <PhoneOutlined v-if="c.type === 'phone'" class="contact-icon" />
      <MailOutlined v-else class="contact-icon" />
      <span class="v" :class="{ 'v-grow': c.type === 'email' }">{{ c.value }}</span>
      <span v-if="c.type === 'phone'" class="spacer" />
      <template v-if="c.type === 'phone'">
        <span class="act act-call" @click="emit('contact', 'call', c.value)">
          <PhoneOutlined class="act-icon" />呼叫
        </span>
        <span class="act act-sms" @click="emit('contact', 'sms', c.value)">
          <MessageOutlined class="act-icon" />短信
        </span>
      </template>
      <span v-else class="act act-mail" @click="emit('contact', 'email', c.value)">
        <SendOutlined class="act-icon" />发邮件
      </span>
    </div>
  </div>
</template>

<style scoped>
.contact-list { display: flex; flex-direction: column; gap: 4px; flex: 1; min-width: 0; }
.contact-row { display: flex; align-items: center; gap: 6px; min-height: 22px; }
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
