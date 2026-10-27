/**
 * 学校 → 校园经理对应关系（1120 个册退费单 · PRD 附录 A.2 接口的原型数据）；城市经理只作转办 / 调剂候选。
 *
 * 校园经理、城市经理是外部处理人（一·补 补8）：不建账号、不进角色体系，工单上只记姓名与域账号。
 * 学校 ID 与学校库（`mock/schools.ts`）同一套。
 */
import type { RefundManager } from '@/views/tickets/types/refund';
import { findSchoolById } from '@/mock/schools';

const campus = (name: string, account: string): RefundManager => ({ name, account, kind: '校园经理' });
const city = (name: string, account: string): RefundManager => ({ name, account, kind: '城市经理' });

export const CAMPUS_MANAGERS = {
  yangfan: campus('杨帆', 'fanyang3'),
  wujing: campus('吴静', 'jingwu6'),
  maxiao: campus('马骁', 'xiaoma2'),
  hubin: campus('胡斌', 'binhu'),
} as const;

export const CITY_MANAGERS = {
  chengli: city('程立', 'licheng'),
  zhouhai: city('周海', 'haizhou5'),
  xuhang: city('许航', 'hangxu'),
} as const;

/** 学校库 ID → 校园经理 */
const SCHOOL_CAMPUS: Record<string, RefundManager> = {
  'SCH-340103-001': CAMPUS_MANAGERS.yangfan, // 合肥市第一中学
  'SCH-340111-168': CAMPUS_MANAGERS.yangfan, // 合肥一六八中学
  'SCH-340104-050': CAMPUS_MANAGERS.wujing, // 合肥市五十中学
  'SCH-340104-007': CAMPUS_MANAGERS.wujing, // 合肥市第七中学
  'SCH-341502-001': CAMPUS_MANAGERS.maxiao, // 六安第一中学
  'SCH-340302-002': CAMPUS_MANAGERS.hubin, // 蚌埠第二中学
};

/**
 * 按学校取处理人：只取校园经理，取不到返回 undefined（进教育支持组工单池）。
 * 10-27 拍板：取不到校园经理不再派城市经理；城市经理只作转办 / 调剂对象。
 */
export function resolveSchoolManager(schoolId: string): RefundManager | undefined {
  return SCHOOL_CAMPUS[schoolId];
}

/** 本校校园经理（二线调剂时预选） */
export function campusManagerOf(schoolId: string): RefundManager | undefined {
  return SCHOOL_CAMPUS[schoolId];
}

/** 某校园经理负责的学校名（按学校 → 校园经理对应关系反查）；城市经理为空 */
export function schoolsOfManager(account: string): string[] {
  return Object.entries(SCHOOL_CAMPUS)
    .filter(([, m]) => m.account === account)
    .map(([id]) => findSchoolById(id)?.name ?? id);
}

/** 全部校园经理、城市经理（转办 / 调剂候选人） */
export const ALL_REFUND_MANAGERS: RefundManager[] = [
  ...Object.values(CAMPUS_MANAGERS),
  ...Object.values(CITY_MANAGERS),
];

export function findRefundManager(name: string): RefundManager | undefined {
  return ALL_REFUND_MANAGERS.find((m) => m.name === name);
}
