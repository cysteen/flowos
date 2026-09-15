<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import DialPad from '@/components/cti/DialPad.vue';
import PhoneBook from '@/components/cti/PhoneBook.vue';
import { OUTBOUND_NONE_ID, type OutboundNumberOption } from '@/mock/outboundNumbers';

const emit = defineEmits<{
  call: [phone: string, outboundNumber: string, contactLabel?: string];
}>();

const dialPadRef = ref<InstanceType<typeof DialPad> | null>(null);
const selectedOutboundId = ref(OUTBOUND_NONE_ID);
const selectedOutboundNumber = ref('');

watch(selectedOutboundNumber, (num) => {
  dialPadRef.value?.setOutboundNumber(num);
});

onMounted(() => {
  dialPadRef.value?.setOutboundNumber('');
});

function onOutboundSelect(entry: OutboundNumberOption) {
  selectedOutboundId.value = entry.id;
  selectedOutboundNumber.value = entry.number;
}

function onDial(phone: string, outboundNumber: string) {
  emit('call', phone, outboundNumber);
}
</script>

<template>
  <div class="dial-panel">
    <PhoneBook
      :selected-id="selectedOutboundId"
      @select="onOutboundSelect"
    />
    <div class="dial-panel-divider" />
    <DialPad ref="dialPadRef" @call="onDial" />
  </div>
</template>

<style scoped>
.dial-panel {
  display: flex;
  align-items: stretch;
}
.dial-panel-divider {
  width: 1px;
  background: #e5e7eb;
  margin: 10px 0;
  flex: none;
}
</style>
