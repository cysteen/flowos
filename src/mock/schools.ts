/**
 * 学校库 —— 教育客户档案的学校联动与教育刷机单的「学校名称」**共用一份**（930 教育刷机单 M42）。
 *
 * - 建单客户信息（教育分类）选学校后带出学校标签与归口人：`views/tickets/components/create-ticket/CustomerInfoModal.vue`；
 * - 刷机单「学校名称」从本库选择，毕业名单（`mock/flash/graduates.ts`）按 `id` 精确匹配，不按名称匹配。
 */
export interface SchoolRecord {
  /** 学校库 ID */
  id: string;
  /** 学校名称 */
  name: string;
  /** 学校标签（重点校 / 示范校 / 普通校） */
  tag: string;
  /** 归口人 */
  owner: string;
  /** 所在地区 */
  region: string;
}

export const SCHOOL_LIBRARY: SchoolRecord[] = [
  { id: 'SCH-340103-001', name: '合肥市第一中学', tag: '重点校', owner: '王明', region: '安徽省 / 合肥市 / 庐阳区' },
  { id: 'SCH-340111-008', name: '合肥八中', tag: '示范校', owner: '李华', region: '安徽省 / 合肥市 / 包河区' },
  { id: 'SCH-340202-003', name: '安徽师范大学附属中学', tag: '示范校', owner: '赵强', region: '安徽省 / 芜湖市 / 镜湖区' },
  { id: 'SCH-340104-050', name: '合肥市五十中学', tag: '普通校', owner: '陈静', region: '安徽省 / 合肥市 / 蜀山区' },
  { id: 'SCH-340111-168', name: '合肥一六八中学', tag: '示范校', owner: '刘洋', region: '安徽省 / 合肥市 / 包河区' },
  { id: 'SCH-340302-002', name: '蚌埠第二中学', tag: '重点校', owner: '孙浩', region: '安徽省 / 蚌埠市 / 龙子湖区' },
  { id: 'SCH-341502-001', name: '六安第一中学', tag: '重点校', owner: '周敏', region: '安徽省 / 六安市 / 金安区' },
];

export function findSchoolById(id: string): SchoolRecord | undefined {
  return SCHOOL_LIBRARY.find((s) => s.id === id);
}

export function findSchoolByName(name: string): SchoolRecord | undefined {
  return SCHOOL_LIBRARY.find((s) => s.name === name);
}
