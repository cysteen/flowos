import { reactive } from 'vue';

/** SLA 工作日历——全租户共用的“承诺时段口径”单一真源：
 *  计时规则页在此增删改多套日历；SLA 策略的“日历”下拉从这里取选项，形成闭环。 */
export interface CalWorkDay {
  day: string;
  on: boolean;
  amStart: string; amEnd: string;
  pmStart: string; pmEnd: string;
}
export interface SlaCalendar {
  id: string;
  name: string;
  /** 内置日历不可删除/重命名（标准工作日历、7×24） */
  builtin?: boolean;
  /** 7×24 连续计时：周表整体置灰不可编辑 */
  is724: boolean;
  workDays: CalWorkDay[];
}

function defWeek(): CalWorkDay[] {
  return [
    { day: '周一', on: true, amStart: '09:00', amEnd: '12:00', pmStart: '13:30', pmEnd: '18:00' },
    { day: '周二', on: true, amStart: '09:00', amEnd: '12:00', pmStart: '13:30', pmEnd: '18:00' },
    { day: '周三', on: true, amStart: '09:00', amEnd: '12:00', pmStart: '13:30', pmEnd: '18:00' },
    { day: '周四', on: true, amStart: '09:00', amEnd: '12:00', pmStart: '13:30', pmEnd: '18:00' },
    { day: '周五', on: true, amStart: '09:00', amEnd: '12:00', pmStart: '13:30', pmEnd: '18:00' },
    { day: '周六', on: false, amStart: '09:00', amEnd: '12:00', pmStart: '13:30', pmEnd: '17:00' },
    { day: '周日', on: false, amStart: '10:00', amEnd: '12:00', pmStart: '13:30', pmEnd: '17:00' },
  ];
}

/** 内置名称须与既有引用一致（勿改，策略数据按名引用） */
export const CAL_STANDARD = '标准工作日历(9:00-18:00)';
export const CAL_724 = '7×24 自然时间';

export const slaCalendars = reactive<SlaCalendar[]>([
  { id: 'cal-standard', name: CAL_STANDARD, builtin: true, is724: false, workDays: defWeek() },
  { id: 'cal-724', name: CAL_724, builtin: true, is724: true, workDays: defWeek() },
  {
    id: 'cal-aftersale', name: '售后工作日历', is724: false,
    workDays: defWeek().map((d) => ['周六', '周日'].includes(d.day) ? { ...d, on: true } : d),
  },
]);

let seq = 0;
export function addCalendar(): SlaCalendar {
  seq += 1;
  const existing = new Set(slaCalendars.map((c) => c.name));
  let name = '新工作日历';
  let n = seq;
  while (existing.has(name)) { name = `新工作日历 ${n}`; n += 1; }
  const cal: SlaCalendar = { id: `cal-new-${seq}`, name, is724: false, workDays: defWeek() };
  slaCalendars.push(cal);
  return cal;
}
export function removeCalendar(id: string): boolean {
  const i = slaCalendars.findIndex((c) => c.id === id);
  if (i < 0 || slaCalendars[i].builtin) return false;
  slaCalendars.splice(i, 1);
  return true;
}
/** 重命名（内置不可改；名称须唯一非空） */
export function renameCalendar(id: string, name: string): boolean {
  const cal = slaCalendars.find((c) => c.id === id);
  if (!cal || cal.builtin) return false;
  const nm = name.trim();
  if (!nm || slaCalendars.some((c) => c.id !== id && c.name === nm)) return false;
  cal.name = nm;
  return true;
}
export function calendarNames(): string[] {
  return slaCalendars.map((c) => c.name);
}
