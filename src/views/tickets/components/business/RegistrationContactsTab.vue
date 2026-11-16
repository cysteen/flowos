<script setup lang="ts">
import OpContactRecordsTab from '@/views/tickets/components/operation/tabs/OpContactRecordsTab.vue';
import type { RegistrationContact } from '@/views/tickets/types/businessRegistration';
import { registrationContactsToContactRecords } from '@/views/tickets/utils/registrationContacts';

defineProps<{ contacts: RegistrationContact[] }>();
</script>

<template>
  <OpContactRecordsTab :records="registrationContactsToContactRecords(contacts)" />
</template>
