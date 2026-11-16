import type { RegistrationHistory } from '@/views/tickets/types/businessRegistration';
import type { TimelineEntry, TimelineFieldChange, TlAction, TlCategory } from '@/views/tickets/types/ticketDetail';

function mapAction(action: string): { category: TlCategory; tlAction: TlAction; how?: string } {
  if (action === '创建工单') return { category: 'node', tlAction: 'create' };
  if (action === '结案') return { category: 'node', tlAction: 'resolved' };
  if (action === '退回重开') return { category: 'node', tlAction: 'handle', how: '组长退回重开' };
  if (action === '保存草稿') return { category: 'node', tlAction: 'create', how: '保存草稿' };
  if (action === '调剂' || action === '调剂到组' || action === '跨组调剂') {
    return { category: 'node', tlAction: 'transfer', how: action === '跨组调剂' ? '跨组调剂' : undefined };
  }
  if (action === '外呼联系') return { category: 'comm', tlAction: 'phone' };
  if (action === '发送短信' || action === '收集客户材料') return { category: 'comm', tlAction: 'sms' };
  if (action === '发送邮件') return { category: 'comm', tlAction: 'sms' };
  if (action === '上传附件' || action === '删除本人附件') return { category: 'customer', tlAction: 'supplement' };
  if (action === '设置预约提醒' || action === '新增预约提醒' || action === '修改预约提醒' || action === '取消预约提醒' || action === '预约提醒触发') return { category: 'sla', tlAction: 'slaClose' };
  if (action === '保存处理记录' || action === '修订已结案记录') return { category: 'handle', tlAction: 'handle' };
  return { category: 'handle', tlAction: 'handle', how: action };
}

function mapChanges(changes: RegistrationHistory['changes']): TimelineFieldChange[] | undefined {
  if (!changes?.length) return undefined;
  return changes.map((change) => ({
    field: change.label,
    kind: change.before?.trim() ? '修改' : '补充',
    from: change.before?.trim() || undefined,
    to: change.after?.trim() || '空',
  }));
}

/** 登记单本地履历 → 标准工单 OpTimeline 条目（时间正序，与处理页 time line 一致） */
export function registrationHistoryToTimeline(items: RegistrationHistory[] | undefined): TimelineEntry[] {
  if (!items?.length) return [];
  const chronological = [...items].reverse();
  return chronological.map((item) => {
    const { category, tlAction, how } = mapAction(item.action);
    return {
      id: item.id,
      category,
      action: tlAction,
      who: item.actor,
      role: '处理人员',
      how: how ?? item.action,
      when: item.at,
      what: item.detail,
      changes: mapChanges(item.changes),
    };
  });
}
