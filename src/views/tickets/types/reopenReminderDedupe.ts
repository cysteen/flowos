export const REOPEN_TOAST_LS_PREFIX = 'flowos-reopen-toast-seen-v1:';
const LS_PREFIX = REOPEN_TOAST_LS_PREFIX;

export function reopenToastSeenKey(userName: string, noticeId: string): string {
  return `${LS_PREFIX}${userName}:${noticeId}`;
}

export function isReopenToastSeen(userName: string, noticeId: string): boolean {
  try {
    return localStorage.getItem(reopenToastSeenKey(userName, noticeId)) === '1';
  } catch {
    return false;
  }
}

/** 工作台 Toast 与右下角退回卡片共用的「已提示」标记，刷新不重复 Toast */
export function markReopenToastSeen(userName: string, noticeId: string): void {
  try {
    localStorage.setItem(reopenToastSeenKey(userName, noticeId), '1');
  } catch {
    /* ignore */
  }
}

export function clearReopenToastSeen(userName: string, noticeId: string): void {
  try {
    localStorage.removeItem(reopenToastSeenKey(userName, noticeId));
  } catch {
    /* ignore */
  }
}
