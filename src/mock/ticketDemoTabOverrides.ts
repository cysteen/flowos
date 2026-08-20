import type { OperationTabData } from '@/views/tickets/types/operationTabs';
import { COMPLAINT_SUPPLEMENT_TYPE } from '@/views/tickets/types/operationTabs';

/** 830 演示单 · 按工单号覆盖 Tab 数据（补充/催单记录等） */
export const TICKET_DEMO_TAB_OVERRIDES: Record<string, Partial<OperationTabData>> = {
  // D3 · 外投渠道：验「补充投诉信息」+ 投诉平台组全链路
  'LCMN-20260817-83002': {
    supplementRecords: [
      {
        id: 's830-ext',
        who: '张晓芸(一线)',
        when: '今天 09:35',
        supplementType: COMPLAINT_SUPPLEMENT_TYPE,
        content: '客户又在黑猫平台追加投诉，补充平台截图与投诉编号',
        attachments: ['黑猫追加截图.png'],
        read: false,
        contacted: false,
      },
      {
        id: 's830-info',
        who: '王坐席(二线)',
        when: '今天 08:50',
        supplementType: '补充信息',
        content: '补充客户微信号，便于平台调解联系',
        read: true,
        contacted: true,
      },
    ],
    dunningRecords: [
      {
        id: 'd830-1',
        who: '客户(一线代录)',
        when: '今天 10:15',
        content: '客户二次来电，要求今日内给出书面回复，否则继续外投',
        read: false,
        contacted: false,
      },
    ],
  },
};
