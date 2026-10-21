import type { RoleKey } from '@/config/roles';

/**
 * 催单/补充记录录入人：一线坐席或二线专员，不展示为「客户」。
 * 只显示姓名、不带角色后缀（1021：一人常有多个角色，系统默认不展示角色名称）。
 */
export function formatTicketRecordWho(name: string, _roleKey: RoleKey): string {
  return name;
}

/** 模拟一线坐席向二线推送催单/补充（原型演示） */
export const MOCK_FIRST_LINE_AGENTS = ['张晓芸', '李一线'] as const;
