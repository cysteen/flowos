/**
 * 原型「今天」—— Mock 数据与相对时间窗（已办 30 天等）统一锚点，
 * 避免受开发者本机系统日期漂移导致列表被静默滤空。
 */
export const PROTOTYPE_TODAY = new Date('2026-08-18T12:00:00');

/** 供筛选器解析「最近 N 天」时使用 */
export function prototypeDayEnd(): Date {
  const d = new Date(PROTOTYPE_TODAY);
  d.setHours(23, 59, 59, 999);
  return d;
}
