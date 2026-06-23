<script setup lang="ts">
import { ref } from 'vue';
import OpCustomerCard from './OpCustomerCard.vue';
import OpAgentCard from './OpAgentCard.vue';
import OpTicketInfoCard from './OpTicketInfoCard.vue';
import OpAiAssistant from './OpAiAssistant.vue';
import OpAddRecord from './OpAddRecord.vue';
import type { AddRecordTab } from './OpAddRecord.vue';
import type { TicketDetailMeta } from '@/mock/ticketDetail';

defineProps<{ detail: TicketDetailMeta }>();

const emit = defineEmits<{
  contact: [type: 'call' | 'sms' | 'email', value: string];
  action: [name: string];
}>();

const addRecordRef = ref<InstanceType<typeof OpAddRecord> | null>(null);

function focusAddRecord(tab: AddRecordTab = 'supplement') {
  addRecordRef.value?.open(tab);
}

defineExpose({ focusAddRecord });
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
      @action="emit('action', $event)"
    />
    <div class="side-spacer" />
    <OpAddRecord ref="addRecordRef" @action="emit('action', $event)" />
  </div>
</template>

<style scoped>
.op-side {
  width: 360px; flex: none; display: flex; flex-direction: column; gap: 16px;
  align-self: stretch; min-height: 0; overflow-y: auto;
}
.side-spacer { flex: 1; min-height: 0; }
</style>
