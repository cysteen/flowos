import { ref, watch } from 'vue';
import { OPERATION_TAB_DATA } from '@/mock/ticketOperationTabs';
import { TYPE_SAMPLES } from '@/mock/ticketTypeSamples';
import type { OperationTabData } from '@/views/tickets/types/operationTabs';

/** 按工单类型构建 Tab 数据：投诉用 base 样例，咨询/商机/建议用各自类型样例覆盖。 */
function buildTabData(type: string): OperationTabData {
  const base = JSON.parse(JSON.stringify(OPERATION_TAB_DATA)) as OperationTabData;
  const override = TYPE_SAMPLES[type]?.tabData;
  return override ? { ...base, ...JSON.parse(JSON.stringify(override)) } : base;
}

export function useOperationTabs(getType: () => string) {
  const tabData = ref<OperationTabData>(buildTabData(getType()));

  watch(getType, (type) => {
    tabData.value = buildTabData(type);
  });

  return { tabData };
}
