<script setup lang="ts">
import { computed, ref } from 'vue';
import DialPadPanel from '@/components/cti/DialPadPanel.vue';
import { useOutboundCall } from '@/composables/useOutboundCall';

defineProps<{
  placement?: 'bottomLeft' | 'bottomRight';
}>();

const emit = defineEmits<{
  call: [phone: string, outboundNumber: string, contactLabel?: string];
}>();

const open = defineModel<boolean>('open', { default: false });
const { checkCanCall } = useOutboundCall();

const callBlocked = computed(() => checkCanCall());

function onDial(phone: string, outboundNumber: string, contactLabel?: string) {
  emit('call', phone, outboundNumber, contactLabel);
  open.value = false;
}
</script>

<template>
  <a-popover
    v-if="!callBlocked"
    v-model:open="open"
    trigger="hover"
    :placement="placement ?? 'bottomRight'"
    :mouse-enter-delay="0.12"
    :mouse-leave-delay="0.2"
    :overlay-inner-style="{ padding: '0' }"
  >
    <template #content>
      <DialPadPanel @call="onDial" />
    </template>
    <span class="dial-popover-trigger">
      <slot />
    </span>
  </a-popover>
  <a-tooltip
    v-else
    :title="callBlocked"
    :placement="placement ?? 'bottomRight'"
    :mouse-enter-delay="0.12"
    color="#fff"
    :overlay-inner-style="{ color: '#c2410c', fontSize: '12px', fontWeight: 600 }"
  >
    <span class="dial-popover-trigger dial-popover-trigger--blocked">
      <slot />
    </span>
  </a-tooltip>
</template>

<style scoped>
.dial-popover-trigger {
  display: inline-flex;
}
.dial-popover-trigger--blocked {
  cursor: not-allowed;
}
</style>
