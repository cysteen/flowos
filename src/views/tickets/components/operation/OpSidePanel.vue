<script setup lang="ts">
import OpCustomerCard from './OpCustomerCard.vue';
import OpAgentCard from './OpAgentCard.vue';
import OpTicketInfoCard from './OpTicketInfoCard.vue';
import OpAiAssistant from './OpAiAssistant.vue';
import type { TicketDetailMeta } from '@/mock/ticketDetail';

defineProps<{ detail: TicketDetailMeta }>();

const emit = defineEmits<{
  action: [name: string];
}>();
</script>

<template>
  <div class="op-side">
    <OpCustomerCard :customer="detail.customer" />
    <OpAgentCard v-if="detail.agent" :agent="detail.agent" />
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
  gap: 12px;
  align-self: stretch;
  min-height: 0;
  overflow-y: auto;
  position: relative;
}
</style>
