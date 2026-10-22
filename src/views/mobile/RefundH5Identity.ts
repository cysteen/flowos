/**
 * 移动工单 H5 · 个册退费（1120 PRD 附录 A.3）的身份口径。
 *
 * 身份＝天鹰 APP 单点登录带入的域账号，经路由参数 `account` 进入；本系统不映射账号，
 * 只按域账号与工单处理人比对。待办短信链接只带单号时，按本单当前外部处理人（系统退费中为最近一次提交人）进入。
 */

/** 未带 `account` 打开待办列表时的身份：合肥市第一中学校园经理杨帆 */
export const REFUND_H5_DEFAULT_ACCOUNT = 'fanyang3';

export function refundH5Account(q: unknown): string | undefined {
  const v = Array.isArray(q) ? q[0] : q;
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}
