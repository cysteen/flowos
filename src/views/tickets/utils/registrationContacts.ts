import type { RegistrationContact } from '@/views/tickets/types/businessRegistration';
import type { ContactRecord } from '@/views/tickets/types/operationTabs';

function callStatusFromResult(result: string): string {
  const trimmed = result.trim();
  if (!trimmed) return '—';
  if (/未接通/.test(trimmed)) return '未接通';
  if (/接通/.test(trimmed)) return '接通';
  return trimmed;
}

function callTitle(result: string): string {
  const status = callStatusFromResult(result);
  return status === '接通' ? '外呼联系' : '外呼';
}

/** 登记单本单联系 → 标准工单 OpContactRecordsTab 卡片数据（展示顺序与 store 一致，最新在前） */
export function registrationContactsToContactRecords(
  items: RegistrationContact[] | undefined,
): ContactRecord[] {
  if (!items?.length) return [];
  return items.map((item) => {
    const status = callStatusFromResult(item.result);
    const connected = status === '接通';
    const summary = item.summary?.trim()
      || (connected
        ? `呼叫号码: ${item.phone} | 状态: 接通 | 时长: —`
        : `呼叫号码: ${item.phone} | 状态: ${status}`);
    const record: ContactRecord = {
      id: item.id,
      kind: 'call',
      title: callTitle(item.result),
      emoji: '📞',
      operator: item.actor,
      when: item.at,
      summary,
      callSpan: item.callSpan ?? {
        startedAt: item.at,
        ...(connected ? { connectedAt: item.at } : {}),
        endedAt: item.at,
      },
      source: '自建单',
    };
    if (item.recording) {
      record.recording = item.recording;
    } else if (item.recordingUrl) {
      record.recording = { progress: '00:00 / —', progressPercent: 0 };
    }
    return record;
  });
}
