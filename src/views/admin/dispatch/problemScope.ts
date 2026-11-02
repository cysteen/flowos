/**
 * 【1215】人员画像「问题分类」指定范围（PRD 6.5 / 3.4 / 14.6）：
 * 只列出处理组属于坐席所属组的问题分类。问题分类管理的「处理组」已按 3.4 迁成入池规则（迁移来源＝问题分类处理组），
 * 这里只读这批规则：归属池（＝组）在所属组内的，取其问题分类条件为该组处理的问题分类；多组取并集。
 */
import { useDispatchStore } from '@/stores/dispatch';
import { PROBLEM_TREE_OPTS, problemLabel, type TreeOpt } from './dispatchUi';

/** 所属组在问题分类管理中处理的问题分类路径（「一级」「一级/二级」「一级/二级/三级」），已去重 */
export function problemPathsOfGroups(groupIds: readonly string[]): string[] {
  const store = useDispatchStore();
  const gs = new Set(groupIds);
  const out = new Set<string>();
  for (const r of store.rules) {
    if (r.migratedFrom !== '问题分类处理组' || !gs.has(r.poolId)) continue;
    for (const p of r.conditions.problems) out.add(p);
  }
  return [...out];
}

const isUnder = (path: string, base: string) => path === base || path.startsWith(`${base}/`);

/** 节点被范围整块覆盖（自身或某个上级在范围内） */
function covered(path: string, scope: readonly string[]) {
  return scope.some((s) => isUnder(path, s));
}
/** 节点只是范围内某个分类的上级（部分覆盖） */
function ancestorOnly(path: string, scope: readonly string[]) {
  return !covered(path, scope) && scope.some((s) => isUnder(s, path));
}

function prune(nodes: TreeOpt[], scope: readonly string[]): TreeOpt[] {
  const out: TreeOpt[] = [];
  for (const n of nodes) {
    if (covered(n.value, scope)) out.push(n);
    else if (ancestorOnly(n.value, scope)) out.push({ ...n, children: prune(n.children ?? [], scope) });
  }
  return out;
}

export interface ScopedTreeOpt extends TreeOpt { stale?: boolean }

/**
 * 范围内的问题分类树；`keep` 为已存画像里的取值，不在范围内的挂在树尾并带 `stale` 标记（回显标灰、可取消）。
 */
export function scopedProblemTree(scope: readonly string[], keep: readonly string[] = []): ScopedTreeOpt[] {
  const tree: ScopedTreeOpt[] = prune(PROBLEM_TREE_OPTS, scope);
  for (const v of keep) {
    if (!covered(v, scope)) tree.push({ value: v, title: problemLabel(v), stale: true });
  }
  return tree;
}

/** 范围外的旧值 */
export function staleProblemValues(values: readonly string[], scope: readonly string[]): string[] {
  return values.filter((v) => !covered(v, scope));
}

/**
 * 树形多选回写：部分覆盖的上级被整枝勾上时，选择框会回传上级值（语义＝含该上级全部下级），
 * 这里展开成范围内的子分类，保证存下的取值不超出所属组处理范围。
 */
export function normalizeProblemPicks(values: readonly string[], scope: readonly string[]): string[] {
  const out = new Set<string>();
  const expand = (path: string) => {
    if (covered(path, scope)) { out.add(path); return; }
    const segs = path.split('/');
    let nodes: TreeOpt[] = PROBLEM_TREE_OPTS;
    for (let i = 0; i < segs.length; i += 1) {
      const hit = nodes.find((n) => n.value === segs.slice(0, i + 1).join('/'));
      if (!hit) return;
      nodes = hit.children ?? [];
    }
    for (const c of nodes) if (covered(c.value, scope) || ancestorOnly(c.value, scope)) expand(c.value);
  };
  for (const v of values) {
    if (ancestorOnly(v, scope)) expand(v);
    else out.add(v);
  }
  return [...out];
}
