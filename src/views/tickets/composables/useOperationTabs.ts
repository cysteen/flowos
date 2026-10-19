import { ref, watch } from 'vue';
import { OPERATION_TAB_DATA } from '@/mock/ticketOperationTabs';
import { TICKET_DEMO_TAB_OVERRIDES } from '@/mock/ticketDemoTabOverrides';
import { TYPE_SAMPLES } from '@/mock/ticketTypeSamples';
import { SEED_CLAIMED_TICKET_NOS, TICKETS } from '@/mock/tickets';
import type { OperationTabData } from '@/views/tickets/types/operationTabs';
import { isAftersaleChainTicket } from './aftersaleEvents';

/**
 * 客服⇄售后链路上的单（1025）：关联单 / 补充 / 催单只画本单真实的数据（售后卡片、承接行由处理页载入时挂上），
 * 技术支持草稿留空 —— 不沿用类型样例，否则别的单的关联行与处理结果会混进来。
 */
function ownTabData(merged: OperationTabData): OperationTabData {
  return {
    ...merged,
    relatedTickets: [],
    supplementRecords: [],
    dunningRecords: [],
    techDraft: {
      ...merged.techDraft,
      problemCause: '',
      processResult: '',
      problemCauseAttachments: [],
      processResultAttachments: [],
    },
  };
}

/** 按工单类型构建 Tab 数据：投诉用 base 样例，咨询/商机/建议用各自类型样例覆盖。 */
function buildTabData(type: string, ticketNo?: string): OperationTabData {
  const base = JSON.parse(JSON.stringify(OPERATION_TAB_DATA)) as OperationTabData;
  const override = TYPE_SAMPLES[type]?.tabData;
  const merged = override ? { ...base, ...JSON.parse(JSON.stringify(override)) } : base;
  const byNo = ticketNo ? TICKET_DEMO_TAB_OVERRIDES[ticketNo] : undefined;
  if (byNo) return { ...merged, ...JSON.parse(JSON.stringify(byNo)) };
  const row = ticketNo ? TICKETS.find((x) => x.no === ticketNo) : undefined;
  if (isAftersaleChainTicket(row)) return ownTabData(merged);
  // 种子里已有处理人的单之外（待领种子单、本会话新建 / 关联建出的单）：Tab 样例数据一律不落，只画本单自己的数据（D3）
  if (ticketNo && TICKETS.some((x) => x.no === ticketNo) && !SEED_CLAIMED_TICKET_NOS.has(ticketNo)) {
    return {
      ...ownTabData(merged),
      contactRecords: [],
      notifyRecords: [],
      surveyRecords: [],
      attachmentHistory: [],
      attachmentLinks: [],
    };
  }
  return merged;
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
