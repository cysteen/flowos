<script setup lang="ts">
import { PhoneOutlined, MailOutlined } from '@ant-design/icons-vue';
import type { ContactItem } from '@/views/tickets/types/operation';

defineProps<{ contacts: ContactItem[] }>();
</script>

<template>
  <div class="contact-list">
    <div v-for="(c, i) in contacts" :key="i" class="contact-row">
      <PhoneOutlined v-if="c.type === 'phone'" class="contact-icon" />
      <MailOutlined v-else class="contact-icon" />
      <span class="v">{{ c.value }}</span>
    </div>
  </div>
</template>

<style scoped>
.contact-list { display: flex; flex-direction: column; gap: 4px; flex: 1; min-width: 0; }
.contact-row { display: flex; align-items: center; gap: 6px; min-height: 22px; }
.contact-icon { color: #9ca3af; font-size: 13px; flex: none; }
.contact-row .v { color: #374151; font-weight: 500; min-width: 0; flex: 1; font-size: 12px; }
</style>
