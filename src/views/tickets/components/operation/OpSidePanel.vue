<script setup lang="ts">
import OpCustomerCard from './OpCustomerCard.vue';
import OpAgentCard from './OpAgentCard.vue';
import OpTicketInfoCard from './OpTicketInfoCard.vue';
import OpRelationCard from './OpRelationCard.vue';
import OpAiAssistant from './OpAiAssistant.vue';
import type { TicketDetailMeta } from '@/mock/ticketDetail';

import { computed } from 'vue';
import { useUserStore } from '@/stores/user';

defineProps<{ detail: TicketDetailMeta }>();
const user = useUserStore();

const emit = defineEmits<{
  action: [name: string];
  contact: [type: 'call' | 'sms' | 'email', value: string];
  openRelation: [rel: import('@/views/tickets/composables/ticketRelations').TicketRelation];
}>();

/**
 * 客户联络动作（外呼 / 短信 / 邮件）收口给二线技术顾问及以上，一线不出。
 * 判据是**当前角色**——此前读工单的 frontlineDemo 字段，
 * 带该标记的单对所有角色都藏掉了联络动作。
 */
const showContactActions = computed(() => !user.role.frontline);
</script>

<template>
  <div class="op-side">
    <OpCustomerCard
      :customer="detail.customer"
      :show-contact-actions="showContactActions"
      @contact="(t, v) => emit('contact', t, v)"
    />
    <OpAgentCard
      v-if="detail.agent"
      :agent="detail.agent"
      :show-contact-actions="showContactActions"
      @contact="(t, v) => emit('contact', t, v)"
    />
    <OpTicketInfoCard :detail="detail" />
    <OpRelationCard :detail="detail" @open="emit('openRelation', $event)" />
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
