/** 查询中心路由与 Tab 约定（方案 A：统一入口 + 双视图） */

export const QUERY_CENTER_PATH = '/query';

export type QueryCenterTab = 'tickets' | 'customer';

export function isQueryCenterTab(v: unknown): v is QueryCenterTab {
  return v === 'tickets' || v === 'customer';
}

export function queryCenterLocation(
  tab: QueryCenterTab,
  extra: Record<string, string | undefined> = {},
) {
  const query: Record<string, string> = { tab };
  for (const [k, val] of Object.entries(extra)) {
    if (val != null && val !== '') query[k] = val;
  }
  return { path: QUERY_CENTER_PATH, query };
}
