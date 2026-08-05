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
 * ⚠️ **不要把 PRD 的口径表整列搬进来**。PRD 要完备（研发测试逐条核对），
 * 提示要一眼看懂，两者受众不同。
 *
 * 写作约定：
 * · **最多三行**：是什么 / 算什么不算什么 / 特别提醒（可选）
 * · 纯文本渲染，**不要写 Markdown**，星号会原样显示
 * · define 用口语、不超过 20 字；scope 一行说完边界
 * · note 只在"不看会出错"时才写（易混、反直觉、为什么点不进去）
 * · 更新频率看区块徽标、环比看卡上颜色、下钻点一下就知道 —— 都不写进提示
 */
export const BOARD_METRIC_TIPS: Record<string, KpiTip> = {
  /* ── 重点关注 · 主盯 ── */
  backlog: {
    define: '已经超解决时效、还没处理完的单',
    scope: '挂起、已转出的不算；只超首响的不算',
    note: '和「SLA 超期率」不是一个数：那个只看今天进来的，这里是跨天攒下的',
  },
  unassigned: {
    define: '进了本组、还没落到人头上的单',
    scope: '处理人为空且未结的都算',
  },
  delegated: {
    define: '主责还在本组、正等协办回填的单',
    scope: '只算「已委派」的，已转出的不算',
    note: '主状态仍是「处理中」，SLA 继续走，超时的已计入积压',
  },
  suspended: {
    define: '正在等外部反馈的单',
    scope: '只算「已挂起」的，已转出的不算',
    note: 'SLA 已停表，不计积压，但责任还在本组',
  },
  transferredOut: {
    define: '已转出本组、等对方回传的单',
    scope: '转入的单看「转入」卡，不在这里',
    note: 'SLA 已停表，不计积压',
  },
  returned: {
    define: '今天被技术支持退回的单',
    scope: '只算技术支持退回，一线退回、客户撤回不算',
  },
  transferIn: {
    define: '今天从别处调剂进本组的单',
    scope: '含其他客服组、跨组调剂、售后回传',
    note: '与「今日进线」副行的转入数必须一致',
  },

  /* ── 关注事件 ── */
  urge: {
    define: '今天收到的催单次数',
    scope: '数次数不是数工单，一单催两次算两次',
  },
  supplement: {
    define: '今天收到的补充单次数',
    scope: '含修改信息、补充信息、取消服务、其他四类',
  },
  appointment: {
    define: '本组工单上登记的预约条数',
    scope: '已删除的预约不算；未标记已沟通即未沟通',
  },

  /* ── 今日指标 · 数量 ── */
  inbound: {
    define: '今天新进入本组的单',
    scope: '本组新建 + 今天转入，按进本组的时间算',
  },
  forward: {
    define: '本组今天推给下一环节的单',
    scope: '同一单当天多次下送只算 1 次',
    note: '下送不等于结案：下送后进调研中，仍在在办池',
  },
  closed: {
    define: '本组今天走到终态关闭的单',
    scope: '只到「已解决」还没结案的不算',
  },

  /* ── 今日指标 · 率值 ── */
  'close-rate-24h': {
    define: '进来的单里，多少比例 24 小时内完结',
    scope: '分母取昨日进线队列',
    note: '今日进线的 24h 还没走完，不进分母 —— 所以看的是昨天的批次',
  },
  'sla-overdue-rate': {
    define: '今天进来的单里，多少比例踩了 SLA',
    scope: '挂起、已转出期间不算超期',
    note: '和「班组积压」不是一个数：这里只看今天进来的，积压是跨天攒下的',
  },
  csat: {
    define: '客户给本组打分的平均值，5 分制',
    scope: '只算有效评价',
    note: '参评率太低时这个分不可信，看副行的参评率',
  },

  /* ── 负载分布 ── */
  loadDist: {
    define: '组员按在办量分成空闲 / 适中 / 满载的人数',
    scope: '空闲 ≤5、适中 6–12、满载 >12，与指派弹窗同源',
  },

  /* ── 组员明细列（与【815】个人门户同名同值） ── */
  'member.workload': {
    define: '该坐席此刻手上在办的单',
    scope: '已挂起、已转出的不算',
    note: '这个数决定他的负载档（空闲 / 适中 / 满载）',
  },
  'member.forwardToday': {
    define: '该坐席今天推给下一环节的单',
    scope: '同一单当天多次下送只算 1 次',
  },
  'member.avgHandle': {
    define: '从派给他到他下送，平均花多久',
    scope: '扣除停表时段；没下送的单不进样本',
    note: '起点是分派时刻，所以他响应慢也会拉高这个数',
  },
  'member.overdue': {
    define: '区间内发生过超时的单数',
    scope: '同一单多次触发只算 1 次',
    note: '补救完也不会减 —— 和概览「此刻仍超时」不是一个数',
  },
  'member.followRate': {
    define: '派给他满 24 小时的单里，多少比例联络过',
    scope: '分派不满 24h 的单不进分母',
  },
  'member.csat': {
    define: '客户给该坐席打分的平均值，5 分制',
    scope: '只算有效评价',
  },
  'member.resolveRate': {
    define: '他下送的单里，多少比例走到了「已解决」',
    scope: '下送不满 24h 的单不进分母',
    note: '取系统状态，不是客户问卷里说的"解决了没"',
  },
  'member.reviewRate': {
    define: '发出的调研里，多少比例收到了评价',
    scope: '发出不满 24h 的调研不进分母',
  },
  'member.online': {
    define: '该坐席当前状态：在线 / 小休 / 离线',
    scope: '取自坐席状态，非工单数据',
  },

  /* ── 问题 TOP10 ── */
  problemTop10: {
    define: '今天工单量最高的 10 个二级问题分类',
    scope: '本组今日创建的单，草稿不算',
  },

  /* ── 次级待办 ── */
  approve: {
    define: '等着我审批的条目数',
    scope: '归属本组、状态为待审批的流程单',
    note: '看板只看明细，实际审批要去审批中心',
  },
};

export function boardTip(key: string): KpiTip | undefined {
  return BOARD_METRIC_TIPS[key];
}
