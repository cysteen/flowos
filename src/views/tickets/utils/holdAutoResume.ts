import dayjs from 'dayjs';

/** 预计恢复时刻是否已到（支持 `YYYY-MM-DD HH:mm` / 带秒） */
export function isHoldResumeDue(resumeAt: string, now = dayjs()): boolean {
  const parsed = dayjs(resumeAt, ['YYYY-MM-DD HH:mm:ss', 'YYYY-MM-DD HH:mm'], true);
  return parsed.isValid() && !now.isBefore(parsed);
}

export function formatResumeNow(): string {
  return dayjs().format('YYYY-MM-DD HH:mm:ss');
}

const SESSION_PREFIX = 'flowos-hold-autoresume:';

export function holdAutoResumeSessionKey(ticketNo: string): string {
  return `${SESSION_PREFIX}${ticketNo}`;
}

export function markHoldAutoResumeDone(ticketNo: string): void {
  try {
    sessionStorage.setItem(holdAutoResumeSessionKey(ticketNo), '1');
  } catch {
    /* ignore */
  }
}

export function hasHoldAutoResumeDone(ticketNo: string): boolean {
  try {
    return sessionStorage.getItem(holdAutoResumeSessionKey(ticketNo)) === '1';
  } catch {
    return false;
  }
}
