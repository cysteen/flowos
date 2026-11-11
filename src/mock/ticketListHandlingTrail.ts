import type { LatestHandlingItem } from '@/views/tickets/types/operation';

/**
 * 列表「摘要」悬停卡 · 最新处理多条轨迹（原型验收数据）。
 * 与处理页速览带 `TICKET_DETAIL.latestHandling` 对齐；未列出的工单由 composable 按单行摘要合成。
 */
export const LIST_HANDLING_TRAIL: Record<string, LatestHandlingItem[]> = {
  'IFLYTS-20260610-00002': [
    {
      who: '张三',
      role: '二线专员',
      action: '提交处理结果',
      when: '2026-06-10 14:30:08',
      text: '远程升级固件至 v2.3.1 并复测 30 分钟，跳歌问题未再复现，已电话告知客户处理结果与后续观察建议。',
    },
    {
      who: '李一线',
      role: '一线坐席',
      action: '登记工单',
      when: '2026-06-10 10:05:12',
      text: '登记问题详情与故障录屏，初判为固件层问题，升级二线（处理人 张三）加速排查。',
    },
  ],
};
