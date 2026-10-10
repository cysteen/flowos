import type { NotifyRecord } from '@/views/tickets/types/operationTabs';

/**
 * 【1025】工单池待领取提醒（规则 R18 · 事件 ticket.pooled）的种子通知记录。
 * 种子单进池发生在页面打开之前，运行时通知记录里没有这条，按工单号补在这里。
 * 收件人为分组全员，接收人展示组名（《【815】》§8.4 班组通知）。
 */
export const POOL_NOTIFY_SEEDS: Record<string, NotifyRecord[]> = {
  'IFLYZX-20260610-00011': [
    {
      id: 'pool-seed-t13',
      kind: 'group',
      title: '工单池待领取提醒',
      receiver: '受理一组全体成员',
      when: '2026-06-10 09:12:05',
      channel: 'IM',
      status: '未读',
      content:
        '您组内来了一条新工单（IFLYZX-20260610-00011），请尽快领取处理。\n\n'
        + '系统登陆地址：http://xfkf.iflytek.com/ngs/SSOVerifyLogin',
    },
  ],
};

export function poolNotifySeedsOf(ticketNo: string): NotifyRecord[] {
  return POOL_NOTIFY_SEEDS[ticketNo] ?? [];
}
