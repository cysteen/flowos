import type { RoleKey } from '@/config/roles';

/** 催单/补充记录录入人：一线或二线坐席，不展示为「客户」。 */
export function formatTicketRecordWho(name: string, roleKey: RoleKey): string {
  if (/\((一线|二线)\)$/.test(name)) return name;
  const isSecondLine = roleKey === 'agent-cs' || roleKey === 'agent-as';
  return `${name}(${isSecondLine ? '二线' : '一线'})`;
}

/** 模拟一线坐席向二线推送催单/补充（原型演示） */
export const MOCK_FIRST_LINE_AGENTS = ['张晓芸(一线)', '李一线(一线)'] as const;
