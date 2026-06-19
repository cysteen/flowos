import { ref } from 'vue';
import { OPERATION_TAB_DATA } from '@/mock/ticketOperationTabs';
import type { OperationTabData } from '@/views/tickets/types/operationTabs';

export function useOperationTabs() {
  const tabData = ref<OperationTabData>(JSON.parse(JSON.stringify(OPERATION_TAB_DATA)));

  return { tabData };
}
