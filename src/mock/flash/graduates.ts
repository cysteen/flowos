/**
 * 毕业名单（2026 届）—— 建单校验「毕业生身份」的比对底数（930 教育刷机单 D15 / M42）。
 * 按**学校库 ID + 学生账号**精确匹配，学校库见 `mock/schools.ts`。
 */
export interface GraduateRecord {
  /** 学校库 ID */
  schoolId: string;
  studentAccount: string;
  studentName: string;
  /** 毕业年份 */
  graduateYear: number;
}

export const GRADUATE_ROSTER: GraduateRecord[] = [
  // 合肥市第一中学
  { schoolId: 'SCH-340103-001', studentAccount: 'hf1z2023s0415', studentName: '胡子涵', graduateYear: 2026 },
  { schoolId: 'SCH-340103-001', studentAccount: 'hf1z2023s0588', studentName: '唐语桐', graduateYear: 2026 },
  { schoolId: 'SCH-340103-001', studentAccount: 'hf1z2023s0811', studentName: '秦朗', graduateYear: 2026 },
  { schoolId: 'SCH-340103-001', studentAccount: 'hf1z2023s1101', studentName: '王梓涵', graduateYear: 2026 },
  // 合肥八中
  { schoolId: 'SCH-340111-008', studentAccount: 'hf8z2023s0622', studentName: '程思远', graduateYear: 2026 },
  { schoolId: 'SCH-340111-008', studentAccount: 'hf8z2023s0907', studentName: '顾晓', graduateYear: 2026 },
  { schoolId: 'SCH-340111-008', studentAccount: 'hf8z2023s1102', studentName: '李沐辰', graduateYear: 2026 },
  // 安徽师范大学附属中学
  { schoolId: 'SCH-340202-003', studentAccount: 'ahsdfz2023s0107', studentName: '马嘉怡', graduateYear: 2026 },
  { schoolId: 'SCH-340202-003', studentAccount: 'ahsdfz2023s0419', studentName: '沈可欣', graduateYear: 2026 },
  { schoolId: 'SCH-340202-003', studentAccount: 'ahsdfz2023s1103', studentName: '张一鸣', graduateYear: 2026 },
  // 合肥市五十中学
  { schoolId: 'SCH-340104-050', studentAccount: 'hf50z2023s0233', studentName: '许诺', graduateYear: 2026 },
  { schoolId: 'SCH-340104-050', studentAccount: 'hf50z2023s0520', studentName: '陆子墨', graduateYear: 2026 },
  { schoolId: 'SCH-340104-050', studentAccount: 'hf50z2023s1104', studentName: '陈可馨', graduateYear: 2026 },
  // 合肥一六八中学
  { schoolId: 'SCH-340111-168', studentAccount: 'hf168z2023s1021', studentName: '钱沐阳', graduateYear: 2026 },
  { schoolId: 'SCH-340111-168', studentAccount: 'hf168z2023s0908', studentName: '杜若溪', graduateYear: 2026 },
  { schoolId: 'SCH-340111-168', studentAccount: 'hf168z2023s1105', studentName: '刘思彤', graduateYear: 2026 },
  // 蚌埠第二中学
  { schoolId: 'SCH-340302-002', studentAccount: 'bb2z2023s0310', studentName: '冯一诺', graduateYear: 2026 },
  { schoolId: 'SCH-340302-002', studentAccount: 'bb2z2023s0625', studentName: '蒋天佑', graduateYear: 2026 },
  { schoolId: 'SCH-340302-002', studentAccount: 'bb2z2023s1106', studentName: '赵子轩', graduateYear: 2026 },
  { schoolId: 'SCH-340302-002', studentAccount: 'bb2z2023s0418', studentName: '宋雨晴', graduateYear: 2026 },
  // 六安第一中学
  { schoolId: 'SCH-341502-001', studentAccount: 'la1z2023s0716', studentName: '梁晨', graduateYear: 2026 },
  { schoolId: 'SCH-341502-001', studentAccount: 'la1z2023s0302', studentName: '叶知秋', graduateYear: 2026 },
  { schoolId: 'SCH-341502-001', studentAccount: 'la1z2023s1107', studentName: '孙雨桐', graduateYear: 2026 },
];

/** 是否在毕业名单内（学校库 ID + 学生账号精确匹配） */
export function isGraduate(schoolId: string, studentAccount: string): boolean {
  const acc = studentAccount.trim();
  return GRADUATE_ROSTER.some((g) => g.schoolId === schoolId && g.studentAccount === acc);
}
