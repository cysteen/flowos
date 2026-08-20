import { ref, watch } from 'vue';
import { OPERATION_TAB_DATA } from '@/mock/ticketOperationTabs';
import { TICKET_DEMO_TAB_OVERRIDES } from '@/mock/ticketDemoTabOverrides';
import { TYPE_SAMPLES } from '@/mock/ticketTypeSamples';
import type { OperationTabData } from '@/views/tickets/types/operationTabs';

/** 按工单类型构建 Tab 数据：投诉用 base 样例，咨询/商机/建议用各自类型样例覆盖。 */
function buildTabData(type: string, ticketNo?: string): OperationTabData {
  const base = JSON.parse(JSON.stringify(OPERATION_TAB_DATA)) as OperationTabData;
  const override = TYPE_SAMPLES[type]?.tabData;
  const merged = override ? { ...base, ...JSON.parse(JSON.stringify(override)) } : base;
  const byNo = ticketNo ? TICKET_DEMO_TAB_OVERRIDES[ticketNo] : undefined;
  return byNo ? { ...merged, ...JSON.parse(JSON.stringify(byNo)) } : merged;
}

export function useOperationTabs(getType: () => string, getNo?: () => string) {
  const tabData = ref<OperationTabData>(buildTabData(getType(), getNo?.()));

  watch(
    [getType, () => getNo?.() ?? ''],
    ([type, no]) => {
      tabData.value = buildTabData(type, no || undefined);
    },
  );

  return { tabData };
}
