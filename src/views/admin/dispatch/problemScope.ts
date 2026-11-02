/**
 * 【1215】人员画像「问题分类」指定范围（PRD 6.5 / 14.6）：
 * 只列出处理组属于坐席所属组的问题分类。直接读问题分类管理的「处理组」列（`stores/problemTags`，11-02 D5），
 * 不再借道迁移出来的入池规则；多组取并集。
 */
import { PROBLEM_PATH_SEP, splitProblemPath, joinProblemPath, useProblemTagsStore } from '@/stores/problemTags';
import { problemLabel, problemTreeOpts, type TreeOpt } from './dispatchUi';

/** 所属组在问题分类管理中处理的问题分类路径（「一级」「一级 / 二级」「一级 / 二级 / 三级」），已去重、整枝上卷 */
export function problemPathsOfGroups(groupIds: readonly string[]): string[] {
  return useProblemTagsStore().pathsOfGroups(groupIds);
}

const isUnder = (path: string, base: string) => path === base || path.startsWith(`${base}${PROBLEM_PATH_SEP}`);

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
  const tree: ScopedTreeOpt[] = prune(problemTreeOpts(), scope);
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
  const all = problemTreeOpts();
  const expand = (path: string) => {
    if (covered(path, scope)) { out.add(path); return; }
    const segs = splitProblemPath(path);
    let nodes: TreeOpt[] = all;
    for (let i = 0; i < segs.length; i += 1) {
      const hit = nodes.find((n) => n.value === joinProblemPath(segs.slice(0, i + 1)));
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
