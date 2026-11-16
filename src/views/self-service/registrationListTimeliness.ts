import type { RegistrationRecord } from '@/views/tickets/types/businessRegistration';
import { SLA_COLOR, type SlaState } from '@/views/tickets/types/ticket';
import { formatSlaRemain, slaStateOf } from '@/views/tickets/utils/slaClock';
import { registrationListTimeMs } from '@/views/self-service/registrationListQuery';

/** 与结案表单 `timeLimit` 选项一致（PRD：运营商承诺时效，不挂钩原工单 SLA 引擎） */
const REGISTRATION_TIME_LIMIT_MS: Record<string, number> = {
  半小时: 30 * 60_000,
  '1小时': 60 * 60_000,
  '2小时': 2 * 60 * 60_000,
  '24小时': 24 * 60 * 60_000,
};

export interface RegistrationTimelinessLine {
  text: string;
  color: string;
}

function registrationTimeLimitMs(label?: string): number | null {
  const key = label?.trim();
  if (!key) return null;
  return REGISTRATION_TIME_LIMIT_MS[key] ?? null;
}

function registrationAccessMs(record: RegistrationRecord): number {
  const raw = record.values.accessTime?.trim().replace('T', ' ');
  const fromAccess = registrationListTimeMs(raw || undefined);
  if (Number.isFinite(fromAccess)) return fromAccess;
  return registrationListTimeMs(record.createdAt);
}

function registrationClosedMs(record: RegistrationRecord): number {
  return registrationListTimeMs(record.closedAt ?? record.updatedAt);
}

/** 承诺截止时刻；缺接入时间或承诺档位时返回 NaN */
export function registrationTimelinessDeadlineMs(record: RegistrationRecord): number {
  const limit = registrationTimeLimitMs(record.values.timeLimit);
  const start = registrationAccessMs(record);
  if (limit == null || !Number.isFinite(start)) return NaN;
  return start + limit;
}

/**
 * 排序/着色用剩余毫秒：处理中 = 截止 − now；已结案 = 截止 − 结案时刻（正=提前结案）。
 */
export function registrationTimelinessRemainMs(record: RegistrationRecord, now: number = Date.now()): number {
  const deadline = registrationTimelinessDeadlineMs(record);
  if (!Number.isFinite(deadline)) return Number.POSITIVE_INFINITY;
  if (record.status === '已结案') {
    const closed = registrationClosedMs(record);
    if (!Number.isFinite(closed)) return Number.POSITIVE_INFINITY;
    return deadline - closed;
  }
  return deadline - now;
}

/** 第二行：倒计时或结案结论（配色对齐工单列表 SLA 列） */
export function registrationTimelinessCountdownLine(
  record: RegistrationRecord,
  now: number = Date.now(),
): RegistrationTimelinessLine {
  const limitLabel = record.values.timeLimit?.trim();
  const deadline = registrationTimelinessDeadlineMs(record);
  if (!Number.isFinite(deadline) || !limitLabel) {
    return { text: '—', color: SLA_COLOR.paused };
  }
  if (record.status === '已结案') {
    const closed = registrationClosedMs(record);
    if (!Number.isFinite(closed)) return { text: '—', color: SLA_COLOR.paused };
    const met = closed <= deadline;
    return {
      text: met ? '已达标' : '未达标',
      color: met ? SLA_COLOR.ok : SLA_COLOR.overdue,
    };
  }
  const remainMs = deadline - now;
  const state: SlaState = slaStateOf(remainMs);
  return { text: formatSlaRemain(remainMs), color: SLA_COLOR[state] };
}

/** 第一行：运营商承诺档位 */
export function registrationTimelinessPromiseLine(record: RegistrationRecord): RegistrationTimelinessLine {
  const label = record.values.timeLimit?.trim();
  if (!label) return { text: '承诺：—', color: SLA_COLOR.paused };
  return { text: `承诺：${label}`, color: '#6B7280' };
}
