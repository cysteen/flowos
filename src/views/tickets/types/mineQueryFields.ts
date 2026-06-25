/** 结构化筛选 · 可配置筛选项（与列设置字段对齐，+ 筛选 弹层管理） */

export type MineFilterFieldKey =
  | 'poolGroup'
  | 'phone'
  | 'sn'
  | 'priority'
  | 'productCategory'
  | 'productName'
  | 'timePreset'
  | 'customer'
  | 'nodeStatus'
  | 'assignee'
  | 'businessType'
  | 'ticketType'
  | 'ticketSource'
  | 'problemL1'
  | 'problemL2'
  | 'problemL3'
  | 'resolveTimeRemark'
  | 'slaState'
  | 'groupName';

export interface MineFilterFieldDef {
  key: MineFilterFieldKey;
  label: string;
  /** 常驻筛选项：始终在筛选条展示，弹层内勾选且不可取消 */
  fixed?: boolean;
  /** 非常驻项默认是否展示在筛选条 */
  defaultVisible?: boolean;
  /** 仅本组工单池 Tab */
  poolOnly?: boolean;
}

export const MINE_FILTER_FIELD_DEFS: MineFilterFieldDef[] = [
  { key: 'poolGroup', label: '用户分组', fixed: true, poolOnly: true },
  { key: 'phone', label: '手机号', fixed: true },
  { key: 'sn', label: '设备 SN', fixed: true },
  { key: 'priority', label: '优先级', fixed: true },
  { key: 'productCategory', label: '产品分类', fixed: true },
  { key: 'productName', label: '产品名称', fixed: true },
  { key: 'timePreset', label: '创建时间', fixed: true },
  { key: 'nodeStatus', label: '当前节点', fixed: true },
  { key: 'assignee', label: '处理人', fixed: true },
  // 以下对应列设置中可选项，默认隐藏，经「+ 筛选」加入筛选条
  { key: 'customer', label: '客户' },
  { key: 'businessType', label: '业务类型' },
  { key: 'ticketType', label: '工单类型' },
  { key: 'ticketSource', label: '工单来源' },
  { key: 'problemL1', label: '问题一类' },
  { key: 'problemL2', label: '问题二类' },
  { key: 'problemL3', label: '问题三类' },
  { key: 'resolveTimeRemark', label: '解决时间备注' },
  { key: 'slaState', label: 'SLA 时效' },
  { key: 'groupName', label: '分组名称', poolOnly: true },
];

const ALL_KEYS = MINE_FILTER_FIELD_DEFS.map((f) => f.key);
const LS_KEY = 'flowos-mine-query-fields';

function defaultOptionalVisible(): Record<string, boolean> {
  return Object.fromEntries(
    MINE_FILTER_FIELD_DEFS.filter((f) => !f.fixed).map((f) => [f.key, f.defaultVisible === true]),
  );
}

function loadOptionalVisible(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      return { ...defaultOptionalVisible(), ...(JSON.parse(raw) as Record<string, boolean>) };
    }
  } catch {
    /* ignore */
  }
  return defaultOptionalVisible();
}

/** 处理人列仅「已办」展示（我的任务=本人、工单池=待领），筛选项须与列表保持一致 */
function variantHidesAssignee(variant: 'mine' | 'done' | 'pool'): boolean {
  return variant !== 'done';
}

export function fieldsForVariant(
  variant: 'mine' | 'done' | 'pool',
  optionalVisible: Record<string, boolean>,
): MineFilterFieldDef[] {
  return MINE_FILTER_FIELD_DEFS.filter((f) => {
    if (f.poolOnly && variant !== 'pool') return false;
    if (f.key === 'assignee' && variantHidesAssignee(variant)) return false;
    if (f.fixed) return true;
    return optionalVisible[f.key] === true;
  });
}

export function pickerFieldsForVariant(variant: 'mine' | 'done' | 'pool'): MineFilterFieldDef[] {
  return MINE_FILTER_FIELD_DEFS.filter((f) => {
    if (f.poolOnly && variant !== 'pool') return false;
    if (f.key === 'assignee' && variantHidesAssignee(variant)) return false;
    return true;
  });
}

export function isFieldActive(
  key: MineFilterFieldKey,
  optionalVisible: Record<string, boolean>,
): boolean {
  const def = MINE_FILTER_FIELD_DEFS.find((f) => f.key === key);
  if (!def) return false;
  if (def.fixed) return true;
  return optionalVisible[key] === true;
}

export function countOptionalSelected(optionalVisible: Record<string, boolean>): number {
  return MINE_FILTER_FIELD_DEFS.filter((f) => !f.fixed && optionalVisible[f.key] === true).length;
}

export { loadOptionalVisible, defaultOptionalVisible, ALL_KEYS, LS_KEY };
