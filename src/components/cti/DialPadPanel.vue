<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import DialPad from '@/components/cti/DialPad.vue';
import PhoneBook from '@/components/cti/PhoneBook.vue';
import { useUserStore } from '@/stores/user';
import {
  getOutboundNumbersForTeam,
  resolveAgentTeamKey,
  type OutboundNumberOption,
} from '@/mock/outboundNumbers';

const emit = defineEmits<{
  call: [phone: string, outboundNumber: string, contactLabel?: string];
}>();

const user = useUserStore();
const dialPadRef = ref<InstanceType<typeof DialPad> | null>(null);
const options = computed(() => getOutboundNumbersForTeam(resolveAgentTeamKey(user.roleKey)));
const selectedOutboundId = ref('');
const selectedOutboundNumber = ref('');

function selectEntry(entry: OutboundNumberOption) {
  selectedOutboundId.value = entry.id;
  selectedOutboundNumber.value = entry.number;
}

watch(options, (list) => {
  const current = list.find((item) => item.id === selectedOutboundId.value);
  const next = current ?? list[0];
  if (!next) {
    selectedOutboundId.value = '';
    selectedOutboundNumber.value = '';
    return;
  }
  selectEntry(next);
}, { immediate: true });

watch(selectedOutboundNumber, (num) => {
  nextTick(() => dialPadRef.value?.setOutboundNumber(num));
}, { immediate: true });

function onOutboundSelect(entry: OutboundNumberOption) {
  selectEntry(entry);
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
