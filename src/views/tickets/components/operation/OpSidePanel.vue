<script setup lang="ts">
import OpCustomerCard from './OpCustomerCard.vue';
import OpAgentCard from './OpAgentCard.vue';
import OpTicketInfoCard from './OpTicketInfoCard.vue';
import OpAiAssistant from './OpAiAssistant.vue';
import type { TicketDetailMeta } from '@/mock/ticketDetail';

defineProps<{ detail: TicketDetailMeta }>();

const emit = defineEmits<{
  contact: [type: 'call' | 'sms' | 'email', value: string];
  action: [name: string];
}>();
</script>

<template>
  <div class="op-side">
    <OpCustomerCard :customer="detail.customer" @contact="(t, v) => emit('contact', t, v)" />
    <OpAgentCard v-if="detail.agent" :agent="detail.agent" @contact="(t, v) => emit('contact', t, v)" />
    <OpTicketInfoCard :detail="detail" />
    <OpAiAssistant
      :similar-ticket="detail.similarTicket"
      :knowledge="detail.knowledge"
      :ai-summary="detail.aiSummary"
      :insight="detail.aiInsight"
      @action="emit('action', $event)"
    />
  </div>
</template>

<style scoped>
.op-side {
  width: 360px;
  flex: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-self: stretch;
  min-height: 0;
  overflow-y: auto;
  position: relative;
}
</style>
