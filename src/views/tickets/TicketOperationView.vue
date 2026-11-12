<script setup lang="ts">
import { computed, defineAsyncComponent } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useBusinessRegistrationStore } from '@/stores/businessRegistration';
import { useDerivedTicketStore } from '@/stores/derivedTickets';
import { useFlashStore } from '@/stores/flash';
import { useRefundStore } from '@/stores/refund';
import { useXiaozhiStore } from '@/stores/xiaozhi';
import { TICKETS } from '@/mock/tickets';
import { isBusinessRegistrationTicket } from './types/businessRegistration';
import BusinessRegistrationEditor from './components/business/BusinessRegistrationEditor.vue';

// Keep all existing standard-ticket behavior isolated from the business-form editor.
defineOptions({ name: 'TicketOperationView' });
const StandardTicketOperationView = defineAsyncComponent(() => import('./StandardTicketOperationView.vue'));
const route = useRoute();
const router = useRouter();
const registrations = useBusinessRegistrationStore();
const derivedTickets = useDerivedTicketStore();
// These are the same persisted sources restored by the standard detail view.
// Restore them before deciding whether a direct ticket link is still valid.
const flash = useFlashStore();
const refund = useRefundStore();
const xiaozhi = useXiaozhiStore();
xiaozhi.hydrate();
const ticketNo = computed(() => String(route.params.ticketNo ?? ''));
const sourceTicket = computed(() => {
  void registrations.revision;
  flash.revisionOf(ticketNo.value);
  refund.revisionOf(ticketNo.value);
  xiaozhi.revisionOf(ticketNo.value);
  return TICKETS.find((ticket) => ticket.no === ticketNo.value) ?? derivedTickets.find(ticketNo.value);
});
const knownTicket = computed(() => !!registrations.recordOf(ticketNo.value) || !!sourceTicket.value);
const isRegistration = computed(() => !!registrations.recordOf(ticketNo.value)
  || isBusinessRegistrationTicket(sourceTicket.value));
</script>

<template>
  <a-result v-if="!knownTicket" status="404" title="未找到工单或无查看权限">
    <template #extra><a-button type="primary" @click="router.push('/tickets')">返回工作台</a-button></template>
  </a-result>
  <BusinessRegistrationEditor v-else-if="isRegistration" :key="ticketNo" :ticket-no="ticketNo" />
  <StandardTicketOperationView v-else />
</template>
