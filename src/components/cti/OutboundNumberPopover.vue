<script setup lang="ts">
import { computed, ref } from 'vue';
import PhoneBook from '@/components/cti/PhoneBook.vue';
import { useOutboundCall } from '@/composables/useOutboundCall';
import type { OutboundNumberOption } from '@/mock/outboundNumbers';

const props = defineProps<{
  phone: string;
  contactLabel: string;
  ticketId?: string;
}>();

const open = ref(false);
const { requestOutboundCall, checkCanCall } = useOutboundCall();

/** 不可外呼时的拦截原因；null 表示可展开号码簿 */
const callBlocked = computed(() => checkCanCall());

function onPick(entry: OutboundNumberOption) {
  requestOutboundCall(
    {
      phone: props.phone,
      contactLabel: props.contactLabel,
      ticketId: props.ticketId,
    },
    { outboundNumber: entry.number },
  );
  open.value = false;
}
</script>

<template>
  <a-popover
    v-if="!callBlocked"
    v-model:open="open"
    trigger="hover"
    placement="bottomLeft"
    :mouse-enter-delay="0.12"
    :mouse-leave-delay="0.15"
    :overlay-inner-style="{ padding: '0' }"
  >
    <template #content>
      <PhoneBook @select="onPick" />
    </template>
    <span class="outbound-popover-trigger">
      <slot />
    </span>
  </a-popover>
  <a-tooltip
    v-else
    :title="callBlocked"
    placement="bottomLeft"
    :mouse-enter-delay="0.12"
    color="#fff"
    :overlay-inner-style="{ color: '#c2410c', fontSize: '12px', fontWeight: 600 }"
  >
    <span class="outbound-popover-trigger outbound-popover-trigger--blocked">
      <slot />
    </span>
  </a-tooltip>
</template>

<style scoped>
.outbound-popover-trigger {
  display: inline-flex;
}
.outbound-popover-trigger--blocked {
  cursor: not-allowed;
}
</style>
