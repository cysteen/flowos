/**
 * 派单概念的界面名称（【1215】PRD 14.2 出池规则 / 13.1 派单日志 / 14.1 派单路径占比）。
 * 只做显示映射，内部取值（门槛 key、判定路径、未派出原因、维度 key）不变。
 */
import type {
  DispatchFailReason, DispatchLogEntry, DispatchPath, GateKey, OriginalExclusion, OriginalRelation, ScoreDimensionKey,
} from '@/views/tickets/types/dispatch';

/** 接单条件（门槛 4.1） */
export const GATE_LABEL: Record<GateKey, string> = {
  候选范围: '所属组成员',
  个人开关: '已开启接收派单',
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
  留池: '留在工单池',
};

/** 未派出原因（13.1） */
export const FAIL_LABEL: Record<DispatchFailReason, string> = {
  组内暂无已就绪成员: '组内暂无已就绪成员',
  无画像匹配成员: '无画像相符的成员',
  无可接单成员: '无可接单成员',
  均达个人上限: '均达个人上限',
  系统异常: '系统异常',
};

/** 综合打分维度（4.4）：出池规则第 3 步只读展示，派单日志与处理履历的打分明细取维度名 */
export const SCORE_DIMENSION_ROWS: { key: ScoreDimensionKey; dimension: string; factor: string; meaning: string }[] = [
  { key: 'proficiency', dimension: '处理能力', factor: '技能熟练度', meaning: '熟练度越高，得分越高' },
  { key: 'load', dimension: '工作负载', factor: '当前负载', meaning: '手上工单占个人上限的比例越低，得分越高' },
  { key: 'balance', dimension: '分配均衡', factor: '今日接单强度', meaning: '今日每在岗小时接单量相对个人上限越低，得分越高' },
];
export const SCORE_DIMENSION_LABEL = Object.fromEntries(SCORE_DIMENSION_ROWS.map((x) => [x.key, x.dimension])) as Record<ScoreDimensionKey, string>;
/** 同分时的选人次序（4.4） */
export const SCORE_TIE_RULE = '同分时：距上次分配时间长的优先，其次在途工单少的优先，再次工号小的优先。';

/** 原处理人例外（4.2 不派回、不保留） */
export const EXCLUSION_LABEL: Record<OriginalExclusion, string> = {
  被投诉人: '被投诉人是原处理人',
  不在归属组或已停用: '原处理人不在归属组或已停用',
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

/** 派单日志「结果」：每条记录归入且只归入一类 */
export type LogResult = '已派出' | '等原处理人' | '排队中' | '留池' | '系统异常' | '人工操作';
export const LOG_RESULTS: LogResult[] = ['已派出', '等原处理人', '排队中', '留池', '系统异常', '人工操作'];
export const LOG_RESULT_TONE: Record<LogResult, string> = {
  已派出: 'green', 等原处理人: 'blue', 排队中: 'orange', 留池: 'default', 系统异常: 'red', 人工操作: 'purple',
};
export function logResult(l: DispatchLogEntry): LogResult {
  if (l.kind === '人工') return '人工操作';
  if (l.chosen) return '已派出';
  if (l.failReason === '系统异常') return '系统异常';
  if (l.status === '等原处理人' || l.path === '预留') return '等原处理人';
  if (l.status === '排队中' || l.path === '排队') return '排队中';
  return '留池';
}
/** 派出或人工指定的坐席姓名；调剂到池的目标是工单池，不是坐席 */
export function logHandlerName(l: DispatchLogEntry): string | undefined {
  if (l.kind === '人工') return l.manual?.action === '调剂到池' ? undefined : l.manual?.target;
  return l.chosen?.name;
}
/** 派单日志「说明」：一句话说清这条记录派给谁的依据或没派出的原因 */
export function logSummary(l: DispatchLogEntry): string {
  switch (logResult(l)) {
    case '人工操作': {
      const m = l.manual;
      if (!m) return '';
      return `${m.action}${m.action === '调剂到池' && m.target ? ` → ${m.target}` : ''} · 操作人 ${m.operator}`;
    }
    case '已派出':
      return l.path === '加权评分' && l.chosenScore ? `综合打分 ${l.chosenScore.total.toFixed(1)} 分` : pathWithRelation(l.path, l.originalRelation);
    case '等原处理人':
      return l.reserved
        ? `等原处理人 ${l.reserved.name}${l.originalRelation ? ` · ${l.originalRelation}` : ''}`
        : pathWithRelation(l.path, l.originalRelation);
    case '排队中':
      return failLabel(l.failReason) || pathLabel(l.path);
    case '系统异常':
      return `${failLabel(l.failReason)}，下一轮重新判断`;
    default:
      return `${l.effectiveMode}，${pathLabel(l.path) || '留在工单池'}`;
  }
}

/** 履历正文里的路径名（如「（加权评分）」「（原处理人 · 本单退回）」）换成界面名称 */
export function replacePathNames(text: string): string {
  return text.replace(/（(直派规则|原处理人|加权评分|预留|排队|留池)( · [^）]+)?）/g,
    (_, p: DispatchPath, rel?: string) => `（${PATH_LABEL[p]}${rel ?? ''}）`);
}
