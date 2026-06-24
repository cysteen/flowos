export type TicketLiveEventType = 'urge' | 'supplement';

export interface TicketLiveToast {
  id: string;
  type: TicketLiveEventType;
  title: string;
  who: string;
  when: string;
  content: string;
  /** 补充信息分类（仅 supplement） */
  supplementType?: string;
}

export const TICKET_EVENT_WHAT_LABEL: Record<TicketLiveEventType, string> = {
  urge: '催单说明',
  supplement: '补充内容',
};
