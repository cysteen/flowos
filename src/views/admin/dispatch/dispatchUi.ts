/**
 * 【1215】智能派单后台配置页共用：字典选项、条件 / 画像摘要、派单方式配色、刷新时钟。
 * 数据全部来自 `stores/dispatch.ts`，这里只做展示层换算。
 */
import { onBeforeUnmount, onMounted, ref } from 'vue';
import {
  BUSINESS_TYPES, PRODUCT_CATEGORIES, PRODUCT_NAMES, TICKET_SOURCE_OPTIONS,
} from '@/views/tickets/types/createTicket';
import { joinProblemPath, splitProblemPath, useProblemTagsStore } from '@/stores/problemTags';
import {
  DISPATCH_CUSTOMER_TYPES, DISPATCH_TICKET_TYPES, PRIORITY_LEVEL, PROFILE_DIMS,
  type AgentProfile, type DimSel, type PoolMode, type PoolRuleConditions, type ProductPick,
} from '@/views/tickets/types/dispatch';
import type { Priority } from '@/views/tickets/types/ticket';

export const opts = (xs: readonly string[]) => xs.map((v) => ({ value: v, label: v }));

export const BUSINESS_TYPE_OPTS = opts(BUSINESS_TYPES);
export const TICKET_TYPE_OPTS = opts(DISPATCH_TICKET_TYPES as string[]);
export const TICKET_SOURCE_OPTS = opts(TICKET_SOURCE_OPTIONS);
export const CUSTOMER_TYPE_OPTS = opts(DISPATCH_CUSTOMER_TYPES);
export const PRIORITY_OPTS = (['P0', 'P1', 'P2', 'P3'] as Priority[]).map((p) => ({ value: p, label: PRIORITY_LEVEL[p] }));

/* ---------------- 问题分类树：只读引用问题分类管理，值为路径「一级 / 二级 / 三级」 ---------------- */
export interface TreeOpt {
  value: string;
  title: string;
  children?: TreeOpt[];
  /** 问题分类：层级「一类 / 二类 / 三类」（下拉节点前缀） */
  level?: string;
  /** 问题分类：已选标签文字（完整路径；选上级时标「〈层级〉·整类」，即含全部下级） */
  tagLabel?: string;
}
/** 问题分类层级名（入池规则条件、人员画像共用） */
export const PROBLEM_LEVELS = ['一类', '二类', '三类'] as const;
/** 问题分类已选标签：完整路径；有下级的上级节点标「〈层级〉·整类」 */
export function problemTagLabel(path: string, hasChildren = splitProblemPath(path).length < 3): string {
  const segs = splitProblemPath(path);
  const text = segs.join(' / ');
  return hasChildren ? `${text}（${PROBLEM_LEVELS[segs.length - 1] ?? ''}·整类）` : text;
}
/** 多选折叠占位：只在确有隐藏项时显示「+ N」 */
export function maxTagPlaceholder(omitted: unknown[]): string {
  return omitted.length ? `+ ${omitted.length}` : '';
}
/** 问题分类树选项（不分产品的并集，工单可用的分类）；在 computed / 模板里调用即随问题分类管理联动 */
export function problemTreeOpts(): TreeOpt[] {
  return Object.entries(useProblemTagsStore().dispatchTree).map(([l1, l2s]) => {
    const l2Entries = Object.entries(l2s);
    return {
      value: l1,
      title: l1,
      level: PROBLEM_LEVELS[0],
      tagLabel: problemTagLabel(l1, l2Entries.length > 0),
      children: l2Entries.map(([l2, l3s]) => {
        const v2 = joinProblemPath([l1, l2]);
        return {
          value: v2,
          title: l2,
          level: PROBLEM_LEVELS[1],
          tagLabel: problemTagLabel(v2, l3s.length > 0),
          children: l3s.map((l3) => {
            const v3 = joinProblemPath([l1, l2, l3]);
            return { value: v3, title: l3, level: PROBLEM_LEVELS[2], tagLabel: problemTagLabel(v3, false) };
          }),
        };
      }),
    };
  });
}
export function problemLabel(path: string): string {
  return splitProblemPath(path).join(' / ');
}

/* ---------------- 产品树：分类值＝分类名，产品值＝「分类::名称」 ---------------- */
const SEP = '::';
export const PRODUCT_TREE_OPTS: TreeOpt[] = PRODUCT_CATEGORIES.map((c) => ({
  value: c,
  title: c,
  children: [...new Set(PRODUCT_NAMES[c] ?? [])].map((n) => ({ value: `${c}${SEP}${n}`, title: n })),
}));
export function productToValue(p: ProductPick): string {
  return p.name ? `${p.category}${SEP}${p.name}` : p.category;
}
export function valueToProduct(v: string): ProductPick {
  const i = v.indexOf(SEP);
  return i < 0 ? { category: v } : { category: v.slice(0, i), name: v.slice(i + SEP.length) };
}
export function productLabel(p: ProductPick): string {
  return p.name ? `${p.category} / ${p.name}` : p.category;
}

/* ---------------- 摘要 ---------------- */
const COND_LABELS: { key: keyof PoolRuleConditions; label: string }[] = [
  { key: 'businessTypes', label: '业务类型' },
  { key: 'ticketTypes', label: '工单类型' },
  { key: 'problems', label: '问题分类' },
  { key: 'products', label: '产品' },
  { key: 'ticketSources', label: '工单来源' },
  { key: 'customerTypes', label: '客户类型' },
  { key: 'priorities', label: '优先级' },
];
export function condItems(c: PoolRuleConditions): { label: string; text: string }[] {
  return COND_LABELS.filter((d) => c[d.key].length).map((d) => {
    let vs: string[];
    if (d.key === 'products') vs = c.products.map(productLabel);
    else if (d.key === 'problems') vs = c.problems.map(problemLabel);
    else if (d.key === 'priorities') vs = c.priorities.map((p) => PRIORITY_LEVEL[p]);
    else vs = c[d.key] as string[];
    return { label: d.label, text: vs.join('、') };
  });
}
export function condSummary(c: PoolRuleConditions): string {
  return condItems(c).map((x) => `${x.label}：${x.text}`).join('；');
}

function dimText(v: DimSel<string | ProductPick>, key: string): string {
  if (v === null) return '未设';
  if (v === 'any') return '不限';
  return v.map((x) => (typeof x === 'string' ? (key === 'problems' ? problemLabel(x) : x) : productLabel(x))).join('、');
}
export function profileItems(p: AgentProfile): { label: string; text: string }[] {
  return PROFILE_DIMS.map((d) => ({ label: d.label, text: dimText(p[d.key] as DimSel<string | ProductPick>, d.key) }));
}
/** 画像摘要：只列指定了取值的维度；全部不限时为「不限」 */
export function profileSummary(p: AgentProfile): string {
  const items = profileItems(p);
  const picked = items.filter((x) => x.text !== '不限' && x.text !== '未设');
  const unset = items.filter((x) => x.text === '未设');
  if (unset.length === items.length) return '—';
  const parts = picked.map((x) => `${x.label}：${x.text}`);
  if (unset.length) parts.push(`${unset.map((x) => x.label).join('、')}未设`);
  return parts.length ? parts.join('；') : '不限';
}

/* ---------------- 派单方式配色 ---------------- */
export const MODE_TONE: Record<PoolMode, string> = { 自动派单: 'green', 混合派单: 'orange', 人工派单: 'red' };
export const SIGN_TONE: Record<string, string> = { 就绪: 'green', 未就绪: 'orange', 小休: 'orange', 签出: 'default' };

export function waitText(min: number): string {
  if (!min) return '—';
  if (min < 60) return `${min} 分钟`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} 小时 ${m} 分钟` : `${h} 小时`;
}

/** 派单策略字段 → 中文名（审计记录展示 updateConfig 记下的字段键） */
export const CONFIG_FIELD_LABEL: Record<string, string> = {
  originalChain: '优先派回原处理人',
  factors: '打分因素',
  recentHours: '最近接单的统计范围',
  roleBase: '角色基准值',
  proficiencyCoef: '熟练度系数',
};
export function configFieldsText(raw: string): string {
  return raw.split('、').map((k) => CONFIG_FIELD_LABEL[k] ?? k).join('、');
}

/** 数值范围校验：返回 PRD 14.2 文案「请输入 〈下限〉–〈上限〉 的〈整数 / 数值〉」或空串 */
export function rangeError(v: unknown, min: number, max: number, decimal = false): string {
  const n = typeof v === 'number' ? v : NaN;
  const bad = !Number.isFinite(n) || n < min || n > max || (!decimal && !Number.isInteger(n))
    || (decimal && Math.abs(Math.round(n * 10) - n * 10) > 1e-9);
  return bad ? `请输入 ${min}–${max} 的${decimal ? '数值' : '整数'}` : '';
}

/** 页面刷新时钟：工单库不是响应式数据，计数类视图按时钟重算 */
export function useClock(ms = 5000) {
  const now = ref(Date.now());
  let timer: number | undefined;
  onMounted(() => { timer = window.setInterval(() => { now.value = Date.now(); }, ms); });
  onBeforeUnmount(() => { if (timer) window.clearInterval(timer); });
  return now;
}
