import type { OperationTabData } from '@/views/tickets/types/operationTabs';
import { COMPLAINT_SUPPLEMENT_TYPE } from '@/views/tickets/types/operationTabs';

/** 830 演示单 · 按工单号覆盖 Tab 数据（补充/催单记录等） */
export const TICKET_DEMO_TAB_OVERRIDES: Record<string, Partial<OperationTabData>> = {
  // 【1120】§14 挂起到期自动解挂 · 通知记录样例（R15）
  'IFLYTS-20260610-00002': {
    notifyRecords: [
      {
        id: 'n-hold-r15-1120',
        kind: 'hold',
        title: '【解挂通知】您有一条挂起工单已自动解除挂起',
        receiver: '张三(处理人)',
        when: '2026-11-11 10:00:06',
        channel: 'IM',
        status: '已发送',
        content:
          '您好，您有一条工单：IFLYTS-20260610-00002已到期自动解除挂起，挂起时限截止：2026-11-11 09:30。请尽快核实问题处理进展！\n\n系统登录地址：http://xfkf.iflytek.com/ngs/SSOVerifyLogin',
      },
    ],
  },
  // D3 · 外投渠道：验「补充投诉信息」+ 投诉平台组全链路
  'IFLYTS-20260817-00001': {
    supplementRecords: [
      {
        id: 's830-ext',
        who: '张晓芸',
        when: '今天 09:35',
        supplementType: COMPLAINT_SUPPLEMENT_TYPE,
        content: '客户又在黑猫平台追加投诉，补充平台截图与投诉编号',
        attachments: ['黑猫追加截图.png'],
        complaintCategories: [{ cat1: '客户体验与规则问题', cat2: '售后体验' }],
        complaintChannels: [
          {
            platform: '黑猫消费者服务平台',
            complaintNo: 'HM20260817002',
            complaintContent: '客户称售后推诿，要求 7 日内给出书面答复',
          },
        ],
        read: false,
        contacted: false,
      },
      {
        id: 's830-info',
        who: '张三',
        when: '今天 08:50',
        supplementType: '补充信息',
        content: '补充客户微信号，便于平台调解联系',
        read: true,
        readAt: '2026-09-17 08:55:20',
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
