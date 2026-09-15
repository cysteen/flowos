/** 外显号码（呼叫中心同步 · 班组授权 · 备注） */

import type { RoleKey } from '@/config/roles';

export interface ServiceTeamOption {
  key: string;
  name: string;
}

/** 可选业务班组（与「用户分组」中业务班组同源） */
export const SERVICE_TEAM_OPTIONS: ServiceTeamOption[] = [
  { key: 'g1', name: '一线客服组' },
  { key: 'g2', name: '二线处理组' },
  { key: 'g3', name: '售后服务组' },
  { key: 'g4', name: '商机跟进组' },
];

/** 号码状态：有效=呼叫中心仍下发；失效=同步后已不在号码队列 */
export type OutboundNumberStatus = 'active' | 'expired';

export interface OutboundNumberRow {
  id: string;
  number: string;
  teamKeys: string[];
  remark: string;
  syncedAt: string;
  status: OutboundNumberStatus;
  createdAt: string;
  updatedAt: string;
}

export const NUMBER_STATUS_META: Record<OutboundNumberStatus, { label: string; color: string }> = {
  active: { label: '有效', color: 'green' },
  expired: { label: '失效', color: 'default' },
};

export const OUTBOUND_NUMBERS: OutboundNumberRow[] = [
  {
    id: 'n1',
    number: '055166161914',
    teamKeys: ['g1', 'g2'],
    remark: '彩铃专用',
    syncedAt: '2026-09-08 14:20:00',
    status: 'active',
    createdAt: '2026-09-01 09:00:00',
    updatedAt: '2026-09-08 16:45:00',
  },
  {
    id: 'n2',
    number: '66161914',
    teamKeys: ['g2'],
    remark: '合肥窗启专用',
    syncedAt: '2026-09-08 14:20:00',
    status: 'active',
    createdAt: '2026-09-01 09:00:00',
    updatedAt: '2026-09-05 11:20:00',
  },
  {
    id: 'n3',
    number: '66161918',
    teamKeys: [],
    remark: '教育智慧屏专用',
    syncedAt: '2026-09-08 14:20:00',
    status: 'active',
    createdAt: '2026-09-01 09:00:00',
    updatedAt: '2026-09-08 14:20:00',
  },
  /** 演示：已在本地但呼叫中心侧已下线 */
  {
    id: 'n0',
    number: '055166161900',
    teamKeys: ['g1'],
    remark: '学习机售后专用（已下线）',
    syncedAt: '2026-09-07 10:00:00',
    status: 'expired',
    createdAt: '2026-08-20 10:00:00',
    updatedAt: '2026-09-07 10:00:00',
  },
];

/** 呼叫中心 Open API 快照（同步时全量覆盖有效号码集合） */
export const RONGLIAN_NUMBER_SNAPSHOT: Pick<OutboundNumberRow, 'id' | 'number' | 'syncedAt'>[] = [
  { id: 'n1', number: '055166161914', syncedAt: '2026-09-09 15:30:00' },
  { id: 'n2', number: '66161914', syncedAt: '2026-09-09 15:30:00' },
  // 66161918 已不在呼叫中心队列 → 同步后标为失效
  { id: 'n4', number: '055166161920', syncedAt: '2026-09-09 15:30:00' },
];

export function teamNamesOf(keys: string[]): string[] {
  return keys
    .map((k) => SERVICE_TEAM_OPTIONS.find((t) => t.key === k)?.name)
    .filter(Boolean) as string[];
}

export function formatDateTime(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** 外呼选号弹窗展示项 */
export interface OutboundNumberOption {
  id: string;
  number: string;
  remark: string;
}

/** 不指定外显号 —— 由呼叫中心按默认策略下发 */
export const OUTBOUND_NONE_ID = '__none__';
export const OUTBOUND_NONE_OPTION: OutboundNumberOption = {
  id: OUTBOUND_NONE_ID,
  number: '',
  remark: '使用呼叫中心默认',
};

/** 演示：角色 → 业务班组（与「用户分组」同源） */
export function resolveAgentTeamKey(roleKey: RoleKey): string {
  const MAP: Partial<Record<RoleKey, string>> = {
    'agent-l1': 'g1',
    'agent-l2': 'g2',
    'team-leader': 'g2',
    'complaint-handler': 'g2',
    'complaint-supervisor': 'g2',
    'tech-support': 'g3',
    'qa': 'g1',
  };
  return MAP[roleKey] ?? 'g2';
}

/** 坐席可选外显号：有效且已授权给所属班组 */
export function getOutboundNumbersForTeam(teamKey: string): OutboundNumberOption[] {
  return OUTBOUND_NUMBERS
    .filter((r) => r.status === 'active' && r.teamKeys.includes(teamKey))
    .map(({ id, number, remark }) => ({ id, number, remark }));
}
