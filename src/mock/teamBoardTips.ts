/**
 * 班组长看板 · 指标口径提示
 * 内容对齐【915】班组长看板 PRD §8 指标口径总表「提示文案」列，
 * 并按原型现行口径修订（积压＝超解决时效）。
 */
import type { KpiTip } from '@/mock/homeOverview';

export type { KpiTip };

/**
 * 看板全部可展示指标的口径表；key = 指标 key / 列 key
 *
 * ⚠️ **不要把 PRD 的口径表整列搬进来**。提示只回答"这个数是什么"，
 * 完整口径以 PRD 为准。
 *
 * 写作约定（2026-08-05 业务定，与个人门户 KpiTip 一致）：
 * · **只有一句话**，口语、不超过 20 字、不用术语
 * · 纯文本渲染，**不要写 Markdown**，星号会原样显示
 * · 不写计入/排除边界、不写易混提醒、不写更新频率与下钻去向
 *   —— 写得越细越容易被质疑，边界一旦挂在界面上就成了对外承诺
 */
export const BOARD_METRIC_TIPS: Record<string, KpiTip> = {
  /* ── 重点关注 · 主盯 ── */
  backlog: {
    define: '本组解决超时的单',
  },
  unassigned: {
    define: '本组待受理的单',
  },
  delegated: {
    define: '本组已委派的单',
  },
  suspended: {
    define: '正在等外部反馈的单',
  },
  transferredOut: {
    define: '已转出本组、等对方回传的单',
  },
  returned: {
    define: '今天回流到本组、要重新处理的单',
  },
  transferIn: {
    define: '今天从别处调剂进本组的单',
  },

  /* ── 关注事件 ── */
  urge: {
    define: '本周本组未结案工单被催的次数',
  },
  supplement: {
    define: '今天收到的补充单次数',
  },
  appointment: {
    define: '本组工单上登记的预约条数',
  },

  /* ── 今日指标 · 数量 ── */
  inbound: {
    define: '今天新进入本组的单',
  },
  forward: {
    define: '本组今天下送、关闭或强结的单',
  },
  escalated: {
    define: '本组今天升级出去的单',
  },
  returnedToday: {
    define: '今天回流到本组、要重新处理的单',
  },

  /* ── 今日指标 · 率值 ── */
  'contact-rate-24h': {
    define: '进来满 24 小时的单里，多少比例联络过',
  },
  'first-response-overdue': {
    define: '今天新增里，多少比例首响超时',
  },
  'resolution-overdue': {
    define: '今天新增里，多少比例解决超时',
  },
  'service-bad': {
    define: '今天客户给服务打 1-3 分的单数',
  },

  /* ── 负载分布 ── */
  loadDist: {
    define: '组员按在办量分成空闲 / 适中 / 满载的人数',
  },

  /* ── 组员明细列（与【815】个人门户同名同值） ── */
  'member.workload': {
    define: '该坐席此刻手上在办的单',
  },
  'member.forwardToday': {
    define: '该坐席今天处置掉的单',
  },
  'member.avgHandle': {
    define: '从派给他到他下送，平均花多久',
  },
  'member.overdue': {
    define: '区间内发生过超时的单数',
  },
  'member.followRate': {
    define: '派给他满 24 小时的单里，多少比例联络过',
  },
  'member.csat': {
    define: '客户给该坐席打分的平均值，5 分制',
  },
  'member.resolveRate': {
    define: '他下送的单里，多少比例走到了「已解决」',
  },
  'member.reviewRate': {
    define: '发出的调研里，多少比例收到了评价',
  },
  'member.online': {
    define: '该坐席当前状态：在线 / 小休 / 离线',
  },

  /* ── 问题 TOP10（逐列） ── */
  problemTop10: {
    define: '今天工单量最高的 10 个三级问题分类',
  },
  'top10.count': {
    define: '该分类今天的工单张数',
  },
  'top10.ratio': {
    define: '该分类占今天新增的比例',
  },
  'top10.delta': {
    define: '与昨天同一分类的量对比',
  },
  'top10.solution': {
    define: '这个分类有没有现成的处理方案',
  },

  /* ── 次级待办 ── */
  approve: {
    define: '等着我审批的条目数',
  },
};

export function boardTip(key: string): KpiTip | undefined {
  return BOARD_METRIC_TIPS[key];
}
