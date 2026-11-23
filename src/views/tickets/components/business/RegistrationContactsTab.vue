<script setup lang="ts">
import { computed } from 'vue';
import OpContactRecordsTab from '@/views/tickets/components/operation/tabs/OpContactRecordsTab.vue';
import type { RegistrationContact } from '@/views/tickets/types/businessRegistration';
import { registrationContactsToContactRecords } from '@/views/tickets/utils/registrationContacts';
import { scopeRecordsForRecordingAccess } from '@/stores/outboundInterop';
import { useUserStore } from '@/stores/user';

const props = defineProps<{ contacts: RegistrationContact[] }>();
const user = useUserStore();
const recordsForView = computed(() => scopeRecordsForRecordingAccess(
  registrationContactsToContactRecords(props.contacts),
  !['ops-monitor', 'qa'].includes(user.roleKey),
));
</script>

<template>
  <OpContactRecordsTab :records="recordsForView" />
</template>
