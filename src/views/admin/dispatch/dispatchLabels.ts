/**
 * 派单概念的界面名称（【1215】PRD 14.2 出池规则 / 13.1 派单日志 / 14.1 派单路径占比）。
 * 只做显示映射，内部取值（门槛 key、判定路径、失败原因、因子 key）不变。
 */
import type {
  DispatchFailReason, DispatchPath, GateKey, OriginalExclusion, OriginalRelation, ScoreFactorKey,
} from '@/views/tickets/types/dispatch';

/** 接单条件（门槛 4.1） */
export const GATE_LABEL: Record<GateKey, string> = {
  候选范围: '所属组成员',
  个人开关: '已开启自动派单',
  角色: '岗位可接此类工单',
  在班: '已就绪',
  投诉回避: '不是被投诉人',
  画像已配置: '已设置人员画像',
  画像匹配: '画像与工单相符',
  个人上限: '未达个人上限',
};

/** 判定路径（13.1） */
export const PATH_LABEL: Record<DispatchPath, string> = {
  直派规则: '按规则直派',
  原处理人: '派回原处理人',
  加权评分: '综合打分',
  预留: '为原处理人保留',
  排队: '排队等待',
  组内放宽: '放宽产品范围',
  兜底回池: '退回工单池',
  留池: '留在工单池',
};

/** 失败原因（13.1） */
export const FAIL_LABEL: Record<DispatchFailReason, string> = {
  无画像匹配成员: '无画像相符的成员',
  无可接单成员: '无可接单成员',
  无在班成员: '无已就绪成员',
  均达个人上限: '均达个人上限',
  引擎异常: '系统异常',
  首响已超时: '首次响应已超时',
};

/** 打分因素（4.3） */
export const FACTOR_LABEL: Record<ScoreFactorKey, string> = {
  load: '手上工单少',
  proficiency: '熟练度高',
  urgency: '工单紧急',
  recent: '最近接单少',
  idle: '空闲时间长',
};

/** 原处理人例外（4.2 不派回、不保留） */
export const EXCLUSION_LABEL: Record<OriginalExclusion, string> = {
  被投诉人: '被投诉人是原处理人',
  不在所属组或已停用: '原处理人不在所属组或已停用',
  上次回访不满意: '上次回访不满意',
  小智退回: '小智工单产研退回、确认未解决',
};

export function pathLabel(p?: DispatchPath | null): string {
  return p ? PATH_LABEL[p] ?? p : '';
}
/** 判定路径带命中关系：「派回原处理人 · 本单退回」「为原处理人保留 · 同客户近期」 */
export function pathWithRelation(p?: DispatchPath | null, relation?: OriginalRelation | null): string {
  const base = pathLabel(p);
  return relation && (p === '原处理人' || p === '预留') ? `${base} · ${relation}` : base;
}
export function failLabel(r?: DispatchFailReason | null): string {
  return r ? FAIL_LABEL[r] ?? r : '';
}
/** 履历正文里的路径名（如「（加权评分）」「（原处理人 · 本单退回）」）换成界面名称 */
export function replacePathNames(text: string): string {
  return text.replace(/（(直派规则|原处理人|加权评分|预留|排队|组内放宽|兜底回池|留池)( · [^）]+)?）/g,
    (_, p: DispatchPath, rel?: string) => `（${PATH_LABEL[p]}${rel ?? ''}）`);
}
