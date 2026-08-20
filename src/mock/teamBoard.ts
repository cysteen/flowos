/**
 * 班组看板 Mock
 *
 * ── 文件分两段 ──
 * 【旧】PRD-07 班组看板（对齐 .pen oGoBU）：TeamKpi / TeamMemberRow / CS_* / AS_* / STATUS_STYLE。
 *      ⚠️ 2026-08-04 起**全站已无引用**（新版 TeamBoardView 不再使用）。保留仅为对照 PRD-07 原稿，
 *      确认无需回溯后可整段删除。
 * 【新】班组长看板指标体系：BOARD_STOCK / BOARD_METRICS / BOARD_FLOW_EVENTS / BOARD_TODOS /
 *      TEAM_MEMBERS / PRIORITY_BUCKETS / *_DRILL / TRAFFIC_* / PROBLEM_TOP10。
 *
 * ── 数据口径 ──
 * 1. **积压【2026-08-04 业务重新定义，推翻改造方案 B1】**
 *    新口径 ＝ **此刻未结、SLA 未停表、且已超过「解决时效」的工单**。
 *      · 只按**解决时效**判，**不含首响超时**
 *      · **时点值**：补救完成即减少，不是"今日发生过超时"
 *      · **挂起 / 已转出不计**（SLA 已停表，且已在关注区「SLA 已停表」组单独露出）
 *    旧口径（作废）＝ 未结且未停表的 8 个状态，即所有在办单。
 *    ⚠️ 连带：守恒式 `积压 = 期初 + 进线 − 结案` 与 `workload 合计 = 积压 − 未分派`
 *       **全部失效** —— 它们描述的是在办池，与新口径不是同一个池子。
 * 2. 优先级保留两套枚举：sysKey（系统现有 P0–P3）+ reqLabel（业务口径）。
 *    **映射 0803 业务确认**：P0=紧急 / P1=重要 / P2=普通加急 / P3=普通（单一真源见 types/ticket.ts PRIORITY_LABEL）。
 * 3. 负载档阈值【2026-08-05 业务定】：**空闲 <15 ／ 适中 15–30 ／ 满载 >30**（后续应做成租户可配）。
 * 4. 语义色只用《看板设计-竞品调研与设计范式》§六 R4 五色：
 *    #EF4444 超标 / #F59E0B 预警 / #10B981 达标 / #1A6FFF 交互与选中 / #9CA3AF 中性无数据。
 * 5. **逐人指标口径与个人门户【815】PRD 严格一致**（2026-08-04 同步，详见 MemberRow 各字段注释）：
 *    · 平均处理时长 起点＝分派给该坐席的时刻（P-4），非「首次进入处理中」
 *    · 解决率 取系统口径（P-3）：走到「已解决」÷ 下送满 24h 的单，非客户问卷口径
 *    · 超时工单 ＝ 区间内**发生过**超时的单数，与「此刻仍超时」是两个数
 *    同名指标两处必须同值，否则坐席门户与班组表会打架。
 *
 * ── 数值自洽关系（评审可逐条核对）──
 * - PRIORITY_BUCKETS 合计 3+5+4+2 = 14 ＝ 班组积压 14（超解决时效的未结单）
 * - TEAM_MEMBERS.workload 合计 = 55 ＝ 在办总量（**不再与积压挂钩**，新口径下两者是不同池子）
 * - TEAM_MEMBERS.forwardToday 合计 = 118 ＝ 今日下送 118
 * - URGE_DRILL 合计 21（已读 14 / 未读 7）＝ 催单卡（**本周**未结案工单被催次数）；SUPPLEMENT_DRILL 合计 13（已读 8 / 未读 5）＝ 补充单卡
 *   → 两者相加 34 / 未读 12 ＝ 拆分前的合并口径，总量守恒
 * - RETURN_DRILL 两来源 2+1 = 3 ＝ 退回；TRANSFER_DRILL 三组 2+2+1 = 5 ＝ 转入
 * - SUSPEND_DRILL 合计 3 ＝ 挂起；TRANSFERRED_OUT_DRILL 合计 2 ＝ 已转出；DELEGATED_DRILL 合计 4 ＝ 委派中
 * - TRAFFIC_HOURLY 合计 = (142, 118, 96) ＝ 今日进线 / 下送 / 结案
 * - TRAFFIC_DAILY 末点 8/3 = (142, 118, 96)；前一日 8/2 = (97, 92, 103)
 *   → 卡片 delta：进线 +45 / 下送 +26 / 结案 −7
 * - 24h 完结率分母 97 ＝ TRAFFIC_DAILY 8/2 的 inbound（用已闭合队列，见该卡注释）
 * - BOARD_TODOS 待指派 8 ＝ 关注区未分派 8
 * - PROBLEM_TOP10 count 合计 = 112，ratio ＝ count ÷ 142（今日进线）× 100，ratio 合计 78.8
 *
 * ⚠️ **积压 14 与「首响/解决超时率」的分子不是同一个数**：
 *    · 超时率分子 ＝ **今天新增**中已超期的（当日流量，分母 142）
 *    · 积压 14 ＝ **此刻仍超时未处理完**的（跨天存量，含前几天遗留）
 *    两者都对，讲的是不同的事，界面上不要互相校验。
 */

import { TICKETS } from './tickets';
import { isTicketClosed, type Ticket } from '@/views/tickets/types/ticket';

/* ==========================================================================
 * 【旧】PRD-07 班组看板 —— TeamBoardView.vue 仍在引用，勿删
 * ========================================================================== */

export type TeamBoardDim = 'cs' | 'as';

export type MemberStatus = '优秀' | '正常' | '预警' | '超标';

export interface TeamKpi {
  key: string;
  label: string;
  value: string;
  iconColor: string;
  iconBg: string;
}

export interface TeamMemberRow {
  id: string;
  name: string;
  inProgress: number;
  resolvedToday: number;
  overdue: number;
  slaRate: string;
  avgResolve: string;
  /** 售后维度专用 */
  onsiteRate?: string;
  closeRate?: string;
  status: MemberStatus;
}

export const TEAM_OPTIONS = ['受理一组', '受理二组', '售后一组'];

export const STATUS_STYLE: Record<MemberStatus, { color: string; bg: string }> = {
  优秀: { color: '#10B981', bg: '#10B98122' },
  正常: { color: '#10B981', bg: '#10B98122' },
  预警: { color: '#F59E0B', bg: '#F59E0B22' },
  超标: { color: '#EF4444', bg: '#EF444422' },
};

export const CS_KPIS: TeamKpi[] = [
  { key: 'pending', label: '本班组待处理', value: '24', iconColor: '#1A6FFF', iconBg: '#1A6FFF1A' },
  { key: 'processing', label: '处理中', value: '38', iconColor: '#06B6D4', iconBg: '#06B6D41A' },
  { key: 'done', label: '今日已解决', value: '52', iconColor: '#10B981', iconBg: '#10B9811A' },
  { key: 'overdue', label: '超时工单', value: '5', iconColor: '#EF4444', iconBg: '#EF44441A' },
  { key: 'sla', label: 'SLA 达成率', value: '94.2%', iconColor: '#10B981', iconBg: '#10B9811A' },
  { key: 'avg', label: '平均解决时长', value: '2.8h', iconColor: '#A855F7', iconBg: '#A855F71A' },
];

export const AS_KPIS: TeamKpi[] = [
  { key: 'pending', label: '待接单', value: '18', iconColor: '#1A6FFF', iconBg: '#1A6FFF1A' },
  { key: 'visit', label: '待上门', value: '12', iconColor: '#10B981', iconBg: '#10B9811A' },
  { key: 'overdue', label: '已超时', value: '4', iconColor: '#EF4444', iconBg: '#EF44441A' },
  { key: 'done', label: '今日结单', value: '28', iconColor: '#10B981', iconBg: '#10B9811A' },
  { key: 'sla', label: '售后 SLA 达成率', value: '91.5%', iconColor: '#10B981', iconBg: '#10B9811A' },
  { key: 'avg', label: '平均上门时长', value: '4.2h', iconColor: '#A855F7', iconBg: '#A855F71A' },
];

export const CS_MEMBERS: TeamMemberRow[] = [
  { id: '1', name: '张三', inProgress: 8, resolvedToday: 12, overdue: 1, slaRate: '95.6%', avgResolve: '2.4h', status: '正常' },
  { id: '2', name: '李四', inProgress: 6, resolvedToday: 9, overdue: 0, slaRate: '98.2%', avgResolve: '2.1h', status: '优秀' },
  { id: '3', name: '王五', inProgress: 10, resolvedToday: 15, overdue: 2, slaRate: '91.3%', avgResolve: '3.2h', status: '预警' },
  { id: '4', name: '赵六', inProgress: 5, resolvedToday: 8, overdue: 1, slaRate: '93.7%', avgResolve: '2.6h', status: '正常' },
  { id: '5', name: '刘洋', inProgress: 9, resolvedToday: 8, overdue: 3, slaRate: '88.0%', avgResolve: '3.8h', status: '超标' },
];

export const AS_MEMBERS: TeamMemberRow[] = [
  { id: '1', name: '陈工', inProgress: 7, resolvedToday: 0, overdue: 1, slaRate: '92.1%', avgResolve: '—', onsiteRate: '96.0%', closeRate: '94.5%', status: '正常' },
  { id: '2', name: '林工', inProgress: 5, resolvedToday: 0, overdue: 0, slaRate: '97.8%', avgResolve: '—', onsiteRate: '98.5%', closeRate: '97.2%', status: '优秀' },
  { id: '3', name: '周工', inProgress: 11, resolvedToday: 0, overdue: 2, slaRate: '89.4%', avgResolve: '—', onsiteRate: '88.0%', closeRate: '90.1%', status: '预警' },
  { id: '4', name: '吴工', inProgress: 4, resolvedToday: 0, overdue: 1, slaRate: '93.2%', avgResolve: '—', onsiteRate: '94.0%', closeRate: '92.8%', status: '正常' },
  { id: '5', name: '郑工', inProgress: 8, resolvedToday: 0, overdue: 3, slaRate: '85.6%', avgResolve: '—', onsiteRate: '82.0%', closeRate: '86.5%', status: '超标' },
];

/* ==========================================================================
 * 【新】915 班组长看板
 * ========================================================================== */

/** 关注区分组：与积压的关系决定归到哪一组，见 BOARD_FOCUS 注释 */
export type FocusGroup = 'stuck' | 'paused' | 'interrupted';

/** 模块 1 · 大盘指标卡 */
export interface BoardMetric {
  key: string;
  /** 仅关注区使用：归到哪一组 */
  group?: FocusGroup;
  label: string;
  value: string;
  /** 附加数，如「未读 12」「3 · 5」的说明 */
  sub?: string;
  /**
   * 未完成数（今日事件行展示：全量 value + 未完成 pending）。
   * 催单/补充＝未读；预约＝尚未沟通（对齐办理页「标记已沟通」）。
   */
  pending?: number;
  /** 未完成数旁注，默认「未完成」 */
  pendingLabel?: string;
  delta?: string;
  deltaTone?: 'good' | 'bad' | 'neutral';
  /** 环比语义（title / 读屏）；缺省按指标自拟 */
  deltaHint?: string;
  /** 积压守恒式分解；有值时界面拆开展示，不再依赖 sub 拼字符串 */
  balance?: { opening: number; inbound: number; closed: number };
  /** 卡片点击动作短文案（供 title / 角标） */
  clickHint?: string;
  /** @ant-design/icons-vue 组件名 */
  iconName: string;
  iconColor: string;
  iconBg: string;
  valueColor?: string;
  /** 下钻类型；null = 不可下钻；events = 催单/补充事件明细 */
  drill?: 'priority' | 'people' | 'source' | 'events' | null;
}

/**
 * 催单 / 补充 / 预约事件明细
 * · 催单：谁 · 何时 · 催了谁 · 哪张单（read＝已读）
 * · 补充：谁 · 何时 · 补给谁 · 哪张单 · category（read＝已读）
 * · 预约：预约人 · 预约时间 · 预约需求 · 哪张单（read＝已沟通；对齐 OpAppointmentRecords）
 */
export interface EventDrillRow {
  id: string;
  /** 发起人 / 预约人 */
  actor: string;
  /** 发起人侧角色旁注，如「一线」「客户」；预约一般不填 */
  actorRole?: string;
  /** 动作：催了 / 补充给 / 预约 */
  action: '催了' | '补充给' | '预约';
  /** 目标处理人（预约无此维度，可空） */
  target?: string;
  when: string;
  ticketNo: string;
  ticketTitle: string;
  content: string;
  /**
   * 催单/补充＝已读；预约＝已沟通（办理页「标记已沟通」）。
   */
  read: boolean;
  /**
   * 补充：修改信息 / 补充信息 / 取消服务 / 其他。
   * 预约：预约联系用户 / 联系后端确认（APPOINTMENT_DEMAND_OPTIONS）。
   * 催单无类型，勿填。
   */
  category?: string;
}

/** 模块 5 · 调度待办 */
export interface BoardTodo {
  /** 督办不支持（平台无动作枚举），仅保留指派 / 审批 */
  key: 'assign' | 'approve';
  label: string;
  count: number;
  unit: string;
  tone: 'danger' | 'warn';
}

/**
 * 模块 2 负载 + 模块 3 效能排行（同一份人员数据，两个模块取不同列）
 *
 * ⚠️ 逐人列的口径**必须与个人门户【815】PRD 完全一致** —— 同名指标同值，
 * 否则坐席在自己门户上看到的数，和班组长在这张表上看到的对不上。
 * 下列口径已按 815 v1.8 同步（2026-08-04）。
 */
export interface MemberRow {
  id: string;
  name: string;
  online: '在线' | '小休' | '离线';
  /** 当前在办工单数（时点值） */
  workload: number;
  /** 负载档，阈值 <15 空闲 / 15–30 适中 / >30 满载（2026-08-05 业务定） */
  loadLevel: '空闲' | '适中' | '满载';
  /** 今日下送量。同一张单当天多次下送只算 1 次 */
  forwardToday: number;
  /**
   * 平均处理时长
   * 【815 P-4 定稿】起点＝**分派给该坐席的时刻**（不是"首次进入处理中"），
   * 终点＝下送时刻，扣除停表时长；样本＝区间内完成下送的单。
   * 起点前移意味着**坐席自己的响应等待也计入**，"接了单不动手"会被暴露。
   */
  avgHandle: string;
  /**
   * 超时工单
   * 口径＝**区间内发生过**超时的单数（对应 815 的 C3），同一单多次触发只算 1 次。
   * 与"此刻仍超时"是两个数，不要混用。
   */
  overdue: number;
  /**
   * 24 小时联络率
   * ＝ 分派后 24h 内产生过有效联络的单 ÷ 分派给该坐席且**分派已满 24h** 的单。
   * 有效联络＝通话接通 / 短信已发出 / 企微·公众号消息已送达。
   */
  followRate: string;
  /** 服务满意度（5 分制），客户有效评价的平均分 */
  csat: string;
  /**
   * 解决率
   * 【815 P-3 定稿】取**系统口径**：走到「已解决」的单 ÷ 该坐席下送且**下送已满 24h** 的单。
   * 不取客户问卷回答（那是另一个口径，本期不用）。
   */
  resolveRate: string;
  /** 参评率 ＝ 收到有效评价 ÷ 已发出调研且发出已满 24h 的单 */
  reviewRate: string;
}

/** 积压优先级下钻。sysKey ↔ reqLabel 映射已确认（0803），两套枚举都要保留 */
export interface PriorityBucket {
  /** 系统现有枚举 */
  sysKey: 'P0' | 'P1' | 'P2' | 'P3';
  /** 需求口径枚举 */
  reqLabel: '紧急' | '重要' | '普通加急' | '普通';
  count: number;
  color: string;
}

/** 人员下钻行（未分派 / 催单补充 / 退回） */
export interface PeopleDrillRow {
  id: string;
  name: string;
  online: '在线' | '小休' | '离线';
  count: number;
  /** 未读数，仅催单 / 补充单下钻使用 */
  unread?: number;
  /**
   * 已读数，仅催单 / 补充单下钻使用。已读 + 未读 = count。
   * 业务要求两个数都要看得见：未读＝还没人看，已读＝看了但可能没动。
   */
  read?: number;
  /**
   * 停留时长说明，挂起 / 已转出 / 委派中下钻使用（如「最久 4d 2h」）。
   * 这三类 SLA 已停表或在等外部，**光给个数字看不出哪个该捞回来**，必须给时长。
   */
  note?: string;
  /**
   * 停留时长的可排序值（分钟）。有 note 的下钻必须给，否则"按时长排序"这句
   * 副标题就是空头承诺 —— 各行 count 都是 1 时，按 count 排等于没排。
   */
  stayMinutes?: number;
}

/** 转单来源下钻 */
export interface SourceDrillGroup {
  /** 转入的三来源 + 退回的两来源（2026-08-05 退回口径扩大后新增） */
  source: '其他客服组' | '跨组调剂' | '售后回传' | '技术支持退回' | '回访退回';
  count: number;
  items: { no: string; title: string; from: string }[];
}

/**
 * 流量趋势点 —— 三条线对应「承接 → 产出 → 终结」三个阶段
 *
 * ⚠️ closed 不受 forward 约束：结案的是**存量池里**的工单，
 * 今天结掉的多半是前几天下送的。稳态日 closed 会略高于 inbound（在消化积压），
 * 积压日则明显低于 inbound —— 8/3 就是典型的积压日。
 */
export interface TrafficPoint {
  t: string;
  /** 进线（承接） */
  inbound: number;
  /** 下送（坐席作业完成，中间态） */
  forward: number;
  /** 结案（终态关闭） */
  closed: number;
}

/** 模块 4 · 高频问题 TOP10 */
export interface ProblemRow {
  rank: number;
  /**
   * 问题分类**三级**，与《问题分类管理》的 tagL1 / tagL2 / tagL3 同源同名
   * （2026-08-05 业务定，原为二级）。界面按目录层级展示 `一类 / 二类 / 三类`。
   */
  tagL1: string;
  tagL2: string;
  tagL3: string;
  count: number;
  /** 占比，百分数数值（如 18.3 表示 18.3%） */
  ratio: number;
  /** 环比，如 '+12%' */
  mom: string;
  /** 是否已解决（已闭环） */
  solved: boolean;
}

/* =========================================================================
 * 班组看板指标体系（2026-08-04 重构）
 *
 * 【为什么重构】原 6 个大盘指标是需求原文 7 条的逐条搬运，彼此没有可推导关系，
 * 读者无法回答「这几个数放一起说明什么」—— 即业务反馈的「不成体系」。
 *
 * 【新体系来源】竞品 QuickService 服务洞察 · 工单分析的指标附录，五轴：
 *   ① 承接（流量）② 存量 ③ 效率 ④ SLA ⑤ 质量
 * 需求 17 条改为「兼容」而非「主导」：全部有落位，但不再决定分组方式。
 *
 * 【竞品的关键做法】把「累计未分派 / 累计未完结」单独成「服务品质区」，与当日
 * 流量的「服务承接区」分开 —— **存量与流量是两回事**：流量看今天干了多少，
 * 存量看欠了多少债。原设计把二者平铺在同一条里，是体系混乱的直接来源。
 *
 * 【新增「今日结案」】竞品核心指标是「完结量 / 24h 完结率」，完结是**终态**；
 * 我们的「下送」按 G4.2 是**中间态**（下送 → 调研中 → 已解决 → 结案）。
 * 不引入结案量，完结率这类行业口径既算不出来也无法对标。故两个阶段并列展示。
 *
 * 【守恒式 —— 体系成立的标志】
 *     班组积压 = 期初积压 + 今日进线 − 今日结案
 *        63    =    17     +   142    −    96
 * 三者是同一件事的三个面，界面上要把这层关系显式表达，而不是让读者自己算。
 * ⚠️ 改动任一数值时必须同步维持该等式，否则体系即失效。
 * ======================================================================= */

/**
 * @deprecated 2026-08-04：积压口径改为「超解决时效的未结单」后，守恒式失效，
 * 期初积压不再有用武之地。保留常量仅为兼容尚未清理的引用。
 */
export const BOARD_OPENING_BACKLOG = 17;

/* -------------------------------------------------------------------------
 * 区① 重点关注 · 需要盯的工单（2026-08-04 业务确认改版）
 *
 * 【定位】班组长真正要盯的不是"在办总量"（正常流转的单也在里面），而是
 * **已经欠债的**（积压＝超解决时效）和**卡住 / 异常的**（下面三组）。
 * 在办总量不再上卡，逐人在办数在「组员负载」Tab 里看。
 *
 * 【三组的划分依据 —— 关键是说清"与积压什么关系"】
 * 若把 8 项平铺在积压下面，读者一定会去做加减（8+4+3+2 和 14 什么关系？）。
 * 故按"与积压的关系"分组，把关系写进组标题：
 *
 *   ① SLA 计时中 · 无人推进：未分派、委派中
 *      —— SLA 还在走，**其中已超时的那部分已计入积压**，未超时的不计
 *      —— 与积压是**部分重叠**，不是子集也不是互斥，组标题不能写"其中"
 *      —— 「委派中」按动作矩阵不是主状态，是叠加在「处理中」上的**子状态**，
 *         统计时须按子状态过滤
 *   ② SLA 已停表：挂起、已转出
 *      —— 停表 ⇒ **一律不计积压**（业务确认：这两类已在本组单独露出，不重复计）
 *      —— 恰恰因为没有时间压力提醒，这两类最容易被彻底遗忘，必须单列
 *   ③ 今日被打断（事件，另一维度）：催单、补充、退回、转入
 *      —— 累计值，与积压不构成加减关系
 * ----------------------------------------------------------------------- */

/**
 * 关注区锚点：班组积压
 *
 * ⚠️ 口径于 2026-08-04 由业务重新定义，**推翻改造方案 B1**：
 *   旧：未结且未停表的 8 个状态（＝所有在办单，63）
 *   新：**此刻未结、SLA 未停表、且已超过「解决时效」的单**（14）
 *
 * 三条边界（业务逐条确认）：
 *   · 超时按 **解决时效** 判，**不含首响超时** —— 首响超了但整单没到期的不算
 *   · 取 **此刻仍超时且未处理完** 的时点值 —— 补救完成即减少，不是"今日发生过超时"
 *   · **挂起 / 已转出不计** —— SLA 已停表，且这两类已在「已停表」组单独露出，不重复计
 *
 * 连带失效（勿再引用）：
 *   ✗ 守恒式 `积压 = 期初 + 进线 − 结案` —— 那是**在办池**的恒等式，超时单不满足
 *   ✗ `workload 合计 = 积压 − 未分派` —— workload 数的是在办单，与新口径不是同一个池子
 */
export const BOARD_BACKLOG: BoardMetric = {
  key: 'backlog',
  label: '班组积压',
  value: '14',
  sub: '超解决时效 · 仍未处理完',
  delta: '+3',
  deltaTone: 'bad',
  deltaHint: '较昨日同刻',
  clickHint: '优先级分布',
  iconName: 'DatabaseOutlined',
  iconColor: '#EF4444',
  iconBg: '#EF44441A',
  valueColor: '#EF4444',
  drill: 'priority',
};

/**
 * 关注区：主盯（卡住/停表 + 退回/转入）+ 今日事件（催单/补充/预约）。
 *
 * 数值自洽：
 * · 未分派 8 ＝ BOARD_TODOS 待指派 8
 * · 催单 21次（未处理 7）/ 补充 13次（未处理 5）/ 预约 11次（未沟通 6）
 * · 退回 3 ＝ RETURN_DRILL（技支 2 + 回访 1）；转入 5 ＝ TRANSFER_DRILL；预约 11 ＝ APPOINTMENT_EVENTS
 * · 挂起 3 / 已转出 2 / 委派中 4 与各自 *_DRILL 合计一致
 */
export const BOARD_FOCUS: BoardMetric[] = [
  /* ── ① 其中卡住的（计入积压） ── */
  {
    key: 'unassigned',
    group: 'stuck',
    label: '未分派',
    value: '8',
    sub: '最久等待 2h14m',
    delta: '+2',
    deltaTone: 'bad',
    deltaHint: '较上一快照',
    /** 动作入口嵌在卡内「去指派」按钮，不用角标 */
    clickHint: undefined,
    iconName: 'InboxOutlined',
    iconColor: '#d97706',
    iconBg: '#F59E0B1A',
    valueColor: '#d97706',
    /** 不下钻；动作只走卡内「去指派」按钮 */
    drill: null,
  },
  {
    key: 'delegated',
    group: 'stuck',
    label: '已委派',
    value: '4',
    sub: '最久 1d 6h',
    delta: '+1',
    deltaTone: 'bad',
    deltaHint: '较上一快照',
    clickHint: '查看工单',
    iconName: 'UsergroupAddOutlined',
    iconColor: '#94a3b8',
    iconBg: '#94a3b81A',
    /** 直达列表（scope=team + status），不再走人维度抽屉 */
    drill: null,
  },
  /* ── ② 已停表 · 不计积压 ── */
  {
    key: 'suspended',
    group: 'paused',
    label: '挂起',
    value: '3',
    sub: '最久 4d 2h',
    delta: '0',
    deltaTone: 'neutral',
    deltaHint: '较上一快照',
    clickHint: '查看工单',
    iconName: 'PauseCircleOutlined',
    iconColor: '#94a3b8',
    iconBg: '#94a3b81A',
    drill: null,
  },
  {
    key: 'transferredOut',
    group: 'paused',
    label: '已转出',
    value: '2',
    sub: '最久 2d 8h',
    delta: '+1',
    deltaTone: 'bad',
    deltaHint: '较上一快照',
    clickHint: '查看工单',
    iconName: 'ExportOutlined',
    iconColor: '#94a3b8',
    iconBg: '#94a3b81A',
    drill: null,
  },
  /* ── 退回 / 转入：升入主盯行（与已转出并列），不再挤在事件条 ── */
  {
    key: 'returned',
    group: 'stuck',
    label: '退回',
    value: '3',
    /** 2026-08-05 口径扩大（推翻 D16）：技术支持退回 + 回访退回（810 侧名为「打回」） */
    sub: '技支退回 + 回访退回',
    delta: '-1',
    deltaTone: 'good',
    clickHint: '查看工单',
    iconName: 'RollbackOutlined',
    iconColor: '#94a3b8',
    iconBg: '#94a3b81A',
    drill: null,
  },
  {
    key: 'transferIn',
    group: 'stuck',
    label: '转入',
    value: '5',
    sub: '跨组 / 售后回传',
    delta: '+2',
    deltaTone: 'bad',
    deltaHint: '较上一快照',
    clickHint: '查看工单',
    iconName: 'SwapOutlined',
    iconColor: '#94a3b8',
    iconBg: '#94a3b81A',
    drill: null,
  },
  /* ── ③ 今日事件：催单 / 补充 / 预约 —— 展示全量 + 未完成 ── */
  {
    /**
     * 2026-08-05 业务定：统计窗口由**当日**改为**本周**，且只数
     * **本组未结案**工单上的催单（已结案工单上的催单不计）。
     * ⚠️ 同组另三项（补充单 / 预约 / 待审批）仍是当日 / 时点口径，
     *    本项是本区唯一的「本周」指标，卡上须标明窗口。
     */
    key: 'urge',
    group: 'interrupted',
    label: '催单',
    value: '21',
    pending: 7,
    pendingLabel: '未处理',
    sub: '本周 21 次，未处理 7',
    clickHint: '事件明细',
    iconName: 'BellOutlined',
    iconColor: '#94a3b8',
    iconBg: '#94a3b81A',
    drill: 'events',
  },
  {
    key: 'supplement',
    group: 'interrupted',
    label: '补充单',
    value: '13',
    pending: 5,
    pendingLabel: '未处理',
    sub: '13次，未处理 5',
    clickHint: '事件明细',
    iconName: 'FileAddOutlined',
    iconColor: '#94a3b8',
    iconBg: '#94a3b81A',
    drill: 'events',
  },
  {
    key: 'appointment',
    group: 'interrupted',
    label: '预约',
    value: '11',
    pending: 6,
    pendingLabel: '未沟通',
    sub: '11次，未沟通 6',
    clickHint: '事件明细',
    iconName: 'CalendarOutlined',
    iconColor: '#94a3b8',
    iconBg: '#94a3b81A',
    drill: 'events',
  },
];

/** 关注区三组的标题与说明；标题必须说清"与积压什么关系"，否则读者会去做加减 */
export const FOCUS_GROUPS: { key: FocusGroup; title: string; hint: string }[] = [
  { key: 'stuck', title: 'SLA 计时中 · 无人推进', hint: '超时的部分已计入积压' },
  { key: 'paused', title: 'SLA 已停表', hint: '一律不计积压 · 最容易被遗忘' },
  { key: 'interrupted', title: '今日被打断', hint: '事件计数 · 与积压不构成加减' },
];

/**
 * 区② 今日指标 —— 6 卡，覆盖 承接 / 效率 / SLA / 质量 四轴，点卡片切换下方趋势图。
 *
 * 组级率值（24h完结率 / 首响·解决超时 / 满意度）放核心区而非明细区，不违反 R1b：
 * R1b 约束的是「同一主体的数量与率值不要混」；此处核心区是**组级汇总**、
 * 明细区是**逐人**，两个主体。班组长必须能一眼看到组的整体表现。
 */
export const BOARD_METRICS: BoardMetric[] = [
  {
    key: 'inbound',
    label: '今日新增',
    value: '142',
    /** 137 创建 + 5 转入 = 142，转入数与 TRANSFER_DRILL 三组合计一致 */
    sub: '创建 137 转入5',
    delta: '+45',
    deltaTone: 'neutral',
    iconName: 'LoginOutlined',
    iconColor: '#1A6FFF',
    iconBg: '#1A6FFF1A',
    drill: null,
  },
  {
    key: 'forward',
    label: '今日下送',
    value: '118',
    /** 2026-08-05 口径扩大：下送 + 关闭工单 + 强结，工单维度去重 */
    sub: '下送 / 关闭 / 强结',
    delta: '+26',
    deltaTone: 'good',
    iconName: 'SendOutlined',
    iconColor: '#10B981',
    iconBg: '#10B9811A',
    drill: null,
  },
  /**
   * 2026-08-05 业务定：「今日结案」换成「今日升级」。
   * 结案是全流程终点、多半发生在几天后，对班组长当天的调度没有指导意义；
   * 升级是**当天就要盯**的动作 —— 升上去的单说明本组处理不了，量一大就是能力缺口信号。
   */
  {
    key: 'escalated',
    label: '今日升级',
    value: '23',
    sub: '技术支持 / 飞书',
    delta: '+6',
    deltaTone: 'bad',
    iconName: 'ArrowUpOutlined',
    iconColor: '#F59E0B',
    iconBg: '#F59E0B1A',
    drill: null,
  },
  /**
   * 2026-08-05 新增。与主盯行的「退回」卡**同源同值**（同一个数在两处出现，
   * 按 §10 规则「口径唯一」必须相等）：主盯行回答"有哪些单要盯"，
   * 本卡回答"今天发生了多少次回流"。
   */
  {
    key: 'returnedToday',
    label: '今日退回',
    value: '3',
    sub: '技术支持 / 回访',
    delta: '-1',
    deltaTone: 'good',
    iconName: 'RollbackOutlined',
    iconColor: '#94a3b8',
    iconBg: '#94a3b81A',
    drill: null,
  },
  /**
   * 2026-08-05 业务定：「24h 完结率」换成「24 小时联络率」。
   * 分子＝24 小时内发生过 **保存 / 打电话 / 发邮件 / 发短信** 任一动作的工单。
   *
   * ⚠️ 分母沿用**窗口闭合**原则（看板通用规则「没走完的不算率」）：只取
   * **进线已满 24 小时**的单，即昨日进线队列 97 单。今日进线的 24h 窗口尚未走完，
   * 实时计算会系统性偏低（早上必然接近 0），是看板最常见的假告警来源。
   * ⚠️ 分母口径业务未明确，此处为按看板既有规则的推定，待确认。
   * 89 / 97 = 91.8%。
   *
   * ⚠️ 与组员表「跟进率」**同名不同义**：那一列只数**对客有效联络**（通话接通 /
   * 短信已发出 / 消息已送达），本卡还含**保存**这种纯系统动作。两处不可互校。
   */
  {
    key: 'contact-rate-24h',
    label: '24 小时联络率',
    value: '91.8%',
    sub: '昨日 97 单 · 89 单已联络',
    delta: '-1.4%',
    deltaTone: 'bad',
    iconName: 'FieldTimeOutlined',
    iconColor: '#F59E0B',
    iconBg: '#F59E0B1A',
    valueColor: '#F59E0B',
    drill: null,
  },
  {
    key: 'first-response-overdue',
    label: '首响超时',
    value: '2.1%',
    sub: '首响超 3 / 142 · 平均超 0.8h',
    delta: '+0.4%',
    deltaTone: 'bad',
    iconName: 'ClockCircleOutlined',
    iconColor: '#F59E0B',
    iconBg: '#F59E0B1A',
    valueColor: '#F59E0B',
    drill: null,
  },
  {
    key: 'resolution-overdue',
    label: '解决超时',
    value: '4.2%',
    sub: '解决超 6 / 142 · 平均超 2.4h',
    delta: '+0.7%',
    deltaTone: 'bad',
    iconName: 'ExclamationCircleOutlined',
    iconColor: '#EF4444',
    iconBg: '#EF44441A',
    valueColor: '#EF4444',
    drill: null,
  },
  /**
   * 2026-08-05 业务定：「满意度」（5 分制均分）换成「服务不满意」（**单量**）。
   * 口径：今天收到的调研结果中，**人员服务分数为 1 / 2 / 3 分**的工单数
   * （4 / 5 分计为满意）。按**评价提交时间**归今天。
   *
   * ⚠️ 本卡是**数量**不是率值，与本组另两张（联络率 / 超期率）量纲不同，
   * 破坏了「量率分区」（规则 R1b）。已知会业务，见 PRD §12.2。
   */
  {
    key: 'service-bad',
    label: '服务不满意',
    value: '5',
    sub: '服务分 1–3 分 · 占今日已评 6.8%',
    delta: '+2',
    deltaTone: 'bad',
    iconName: 'FrownOutlined',
    iconColor: '#EF4444',
    iconBg: '#EF44441A',
    valueColor: '#EF4444',
    drill: null,
  },
];

/**
 * 区③ 流转事件 —— 催单/补充、退回、转入。
 * 竞品把「转交量 / 被催量」放在明细区指标里而非核心卡，此处照此降级：
 * 它们是孤立事件计数，不在班组长的主决策链上（判据：不触发决策的指标不占大盘）。
 * 需求模块1 第 5/6/7 条由此兼容 —— 内容不丢，只是不占核心位。
 */
/**
 * @deprecated 2026-08-04：流转事件已并入「重点关注」区（BOARD_FOCUS，group='interrupted'），
 * 且催单/补充已拆分为两项。保留空数组仅为兼容尚未迁移的引用，确认无引用后删除。
 */
export const BOARD_FLOW_EVENTS: BoardMetric[] = [];

/* =========================================================================
 * 下钻明细的工单来源
 *
 * 看板的每一条下钻明细都能点开工单办理页，所以**单号必须是工单数据源里的真单**。
 * 早先催单 / 补充 / 预约 / 待审批四张明细各自手写了一套单号，工单库里一个也查不到 ——
 * 办理页找不到该单号就静默沿用默认演示单，于是每一行打开的都是同一张单，
 * 地址栏显示的却是另一个号。
 *
 * 因此这里只声明「单号 + 该事件特有的度量」（谁 · 何时 · 内容 · 已读/已沟通 · 类型），
 * 工单自身的属性（标题 / 处理人 / 客户）一律回工单数据源取。
 * ======================================================================= */

function ticketOf(no: string): Ticket {
  const t = TICKETS.find((x) => x.no === no);
  // 配错单号就在构建期炸掉，不要留到用户点进去才发现打不中真单
  if (!t) throw new Error(`[teamBoard] 下钻明细引用了不存在的工单号：${no}`);
  return t;
}

/** 催单 / 补充 / 预约都只发生在**未结案**的单上（催单卡口径即「本组未结案工单被催」） */
function openTicketOf(no: string): Ticket {
  const t = ticketOf(no);
  if (isTicketClosed(t.nodeStatus)) {
    throw new Error(`[teamBoard] ${no} 已是终态「${t.nodeStatus}」，不该出现在事件明细里`);
  }
  return t;
}

/* -------------------------------------------------------------------------
 * 模块 5 · 调度待办（待指派 8 ＝ 大盘未分派 8）
 * ----------------------------------------------------------------------- */
export const BOARD_TODOS: BoardTodo[] = [
  { key: 'assign', label: '待指派', count: 8, unit: '单', tone: 'danger' },
  { key: 'approve', label: '待审批', count: 3, unit: '条', tone: 'warn' },
];

/** 待审批下钻行 · 字段对齐审批中心；工单号/标题与 tickets · 看板事件同源 */
export interface ApprovalDrillRow {
  /** 申请单号 */
  id: string;
  /** 关联工单号（LCMN-…） */
  ticketNo: string;
  /** 关联工单标题 */
  ticketTitle: string;
  type: string;
  /** 申请人＝组内坐席 */
  applicant: string;
  approver: string;
  status: '审批中' | '已通过' | '已驳回' | '已撤回';
  submit: string;
}

/**
 * 待审批工单在工单数据源里就是**送审态**的那三张（申请强结中 / 申请挂起中 / 申请关闭中），
 * 不另手写一份：审批类型由送审态反推，标题与申请人回工单取。
 * 合计 3 ＝ BOARD_TODOS.approve.count。
 */
const APPROVAL_TYPE_BY_STATUS: Record<string, string> = {
  申请强结中: '工单强结审批',
  申请挂起中: '工单挂起审批',
  申请关闭中: '工单关闭审批',
  业务动作审核中: '业务动作审批',
};

interface ApprovalSpec {
  id: string;
  no: string;
  approver: string;
  submit: string;
}

const APPROVAL_SPECS: ApprovalSpec[] = [
  { id: 'APR-2026-101', no: 'LCMN-20260609-65500', approver: '周运营', submit: '今天 11:02' },
  { id: 'APR-2026-102', no: 'LCMN-20260609-65236', approver: '周运营', submit: '今天 10:35' },
  { id: 'APR-2026-103', no: 'LCMN-20260609-65010', approver: '周运营', submit: '今天 10:20' },
];

export const APPROVAL_PENDING_DRILL: ApprovalDrillRow[] = APPROVAL_SPECS.map((s) => {
  const t = ticketOf(s.no);
  const type = APPROVAL_TYPE_BY_STATUS[t.nodeStatus];
  if (!type) {
    throw new Error(`[teamBoard] ${s.no} 当前状态「${t.nodeStatus}」不是送审态，不该出现在待审批里`);
  }
  return {
    id: s.id,
    ticketNo: t.no,
    ticketTitle: t.title,
    type,
    // 申请人＝送审时该单的处理人
    applicant: t.assignee ?? '未分派',
    approver: s.approver,
    status: '审批中',
    submit: s.submit,
  };
});

/* -------------------------------------------------------------------------
 * 模块 2 负载 + 模块 3 效能排行 · 班组 12 人
 * workload 合计 = 164（2026-08-05 随新阈值重标定，不再与积压挂钩）
 * forwardToday 合计 = 118 ＝ 今日下送 118
 * 负载档：空闲 <15（7 人）/ 适中 15–30（4 人）/ 满载 >30（1 人）
 *
 * ── avgHandle 口径同步（2026-08-04，815 P-4）──
 * 起点由「首次进入处理中」前移到「**分派给该坐席的时刻**」，即把坐席自己的
 * 响应等待也算进去，因此**每个人的值都要相应变大**。增量按响应速度分档：
 *   在线且表现好（王倩/刘婷/徐璐）+0.2~0.3h  ← 接单即处理
 *   在线常规（张敏/陈曦/吴悦/李昊） +0.4~0.5h
 *   小休（赵磊/郑楠）              +0.7h
 *   满载（孙杰）                   +1.1h      ← 手上压着 34 单，新单排队久
 *   离线（周航/马超）              +1.2~1.4h  ← 不在岗，等待最长
 * 这正是该口径变更想暴露的差异：**"接了单不动手"不再被隐藏**。
 *
 * ⚠️ **本名册与工单数据源的处理人名册互不相交**：这里是 12 位组员（张敏 / 李昊 / …），
 * 工单数据源里只有 王坐席 / 陈坐席 / 林坐席 / 赵三线 四位。凡是「某位组员的某张单」
 * 这类跨两者的口径都对不上，逐人下钻只能停在人的层面，不能再往下点到单。
 * 要打通得先让工单数据源按本名册落处理人 —— 那会牵动整个工作台，不在看板改动范围内。
 * ----------------------------------------------------------------------- */
export const TEAM_MEMBERS: MemberRow[] = [
  { id: 'm1',  name: '张敏', online: '在线', workload: 21,  loadLevel: '适中', forwardToday: 14, avgHandle: '3.0h', overdue: 2, followRate: '96.4%', csat: '4.8', resolveRate: '94.2%', reviewRate: '88.0%' },
  { id: 'm2',  name: '李昊', online: '在线', workload: 24,  loadLevel: '适中', forwardToday: 15, avgHandle: '3.6h', overdue: 4, followRate: '92.8%', csat: '4.5', resolveRate: '90.6%', reviewRate: '84.3%' },
  { id: 'm3',  name: '王倩', online: '在线', workload: 17,  loadLevel: '适中', forwardToday: 12, avgHandle: '2.4h', overdue: 1, followRate: '97.6%', csat: '4.9', resolveRate: '96.1%', reviewRate: '91.2%' },
  { id: 'm4',  name: '赵磊', online: '小休', workload: 6,  loadLevel: '空闲', forwardToday: 6,  avgHandle: '4.5h', overdue: 0, followRate: '90.0%', csat: '4.3', resolveRate: '88.5%', reviewRate: '80.4%' },
  { id: 'm5',  name: '陈曦', online: '在线', workload: 19,  loadLevel: '适中', forwardToday: 13, avgHandle: '3.4h', overdue: 3, followRate: '93.5%', csat: '4.6', resolveRate: '91.8%', reviewRate: '85.7%' },
  { id: 'm6',  name: '刘婷', online: '在线', workload: 11,  loadLevel: '空闲', forwardToday: 10, avgHandle: '2.7h', overdue: 0, followRate: '98.0%', csat: '4.9', resolveRate: '95.4%', reviewRate: '90.6%' },
  { id: 'm7',  name: '周航', online: '离线', workload: 4,  loadLevel: '空闲', forwardToday: 3,  avgHandle: '5.8h', overdue: 1, followRate: '84.2%', csat: '4.1', resolveRate: '82.7%', reviewRate: '80.8%' },
  { id: 'm8',  name: '吴悦', online: '在线', workload: 13,  loadLevel: '空闲', forwardToday: 11, avgHandle: '3.1h', overdue: 2, followRate: '95.1%', csat: '4.7', resolveRate: '93.0%', reviewRate: '87.5%' },
  { id: 'm9',  name: '郑楠', online: '小休', workload: 5,  loadLevel: '空闲', forwardToday: 7,  avgHandle: '4.2h', overdue: 3, followRate: '88.6%', csat: '4.2', resolveRate: '86.3%', reviewRate: '82.1%' },
  { id: 'm10', name: '孙杰', online: '在线', workload: 34, loadLevel: '满载', forwardToday: 16, avgHandle: '5.3h', overdue: 5, followRate: '86.9%', csat: '4.0', resolveRate: '84.9%', reviewRate: '81.5%' },
  { id: 'm11', name: '徐璐', online: '在线', workload: 8,  loadLevel: '空闲', forwardToday: 9,  avgHandle: '2.8h', overdue: 1, followRate: '94.7%', csat: '4.6', resolveRate: '92.4%', reviewRate: '86.9%' },
  { id: 'm12', name: '马超', online: '离线', workload: 2,  loadLevel: '空闲', forwardToday: 2,  avgHandle: '6.4h', overdue: 0, followRate: '81.3%', csat: '4.0', resolveRate: '80.5%', reviewRate: '80.0%' },
];

/* -------------------------------------------------------------------------
 * 积压下钻 · 优先级分布（合计 6+14+19+24 = 63 ＝ 班组积压）
 * sysKey ↔ reqLabel 映射已确认（0803）
 * ----------------------------------------------------------------------- */
/**
 * 合计 3+5+4+2 = 14 ＝ 班组积压 14（超解决时效的未结单）。
 * 分布**高优先级占比高**是必然的：P0/P1 的解决时效短，更容易踩线。
 * 若某天 P3 占比反超，说明低优先级单被长期晾着，是另一种问题信号。
 */
export const PRIORITY_BUCKETS: PriorityBucket[] = [
  { sysKey: 'P0', reqLabel: '紧急', count: 3, color: '#EF4444' },
  { sysKey: 'P1', reqLabel: '重要', count: 5, color: '#F59E0B' },
  { sysKey: 'P2', reqLabel: '普通加急', count: 4, color: '#1A6FFF' },
  { sysKey: 'P3', reqLabel: '普通', count: 2, color: '#9CA3AF' },
];

/* -------------------------------------------------------------------------
 * 催单事件明细（合计 21，未读 7）· 谁 · 何时 · 催了谁 · 哪张单
 * ----------------------------------------------------------------------- */
/**
 * 事件明细声明式 —— 只写事件本身，工单属性回工单数据源取。
 *
 * 【选单口径】
 * · 一律取**未结案**的单；已挂起 / 已转出按 PRD-830 不出催补入口，故不选（补充例外见下）。
 * · **未处理**的行取工单上真带待回催补标记的单（hasDunning / hasSupplement 且未联系），
 *   点进去看得到未读角标；**已处理**的行取标记已清或本就没有标记的单 —— 否则
 *   看板说「已处理」、办理页却挂着未读角标，两处对不上。
 * · 未认领单也会被催被补（正是「未分派」卡要说的事），此时没有处理人可催，记「未分派」。
 */
interface EventSpec {
  id: string;
  /** 工单号，必须在工单数据源里真实存在 */
  no: string;
  /**
   * 发起侧：
   * · l1       一线坐席发起，actor 写姓名（不是工单属性，只属于这条事件）
   * · customer 客户发起，actor 由工单上的客户姓名折算成「客户·X某」
   * · handler  该单处理人自己发起（预约），actor 回工单取
   */
  side: 'l1' | 'customer' | 'handler';
  /** side='l1' 时必填 */
  actor?: string;
  when: string;
  content: string;
  read: boolean;
  category?: string;
}

function toEvent(action: EventDrillRow['action'], s: EventSpec): EventDrillRow {
  const t = openTicketOf(s.no);
  const handler = t.assignee ?? '未分派';
  const actor =
    s.side === 'l1'
      ? s.actor ?? '一线'
      : s.side === 'customer'
        ? `客户·${t.customer.slice(0, 1)}某`
        : handler;
  return {
    id: s.id,
    actor,
    actorRole: s.side === 'l1' ? '一线' : s.side === 'customer' ? '客户' : undefined,
    action,
    // 预约没有「催给谁 / 补给谁」这一维；催单与补充的目标就是该单当前处理人
    target: s.side === 'handler' ? undefined : handler,
    when: s.when,
    ticketNo: t.no,
    ticketTitle: t.title,
    content: s.content,
    read: s.read,
    category: s.category,
  };
}

/**
 * 催单（合计 21，未处理 7）。
 * 未处理 7 行对应工单库里**真挂着待回催单**的 7 张单（hasDunning 且未联系）；
 * 已处理 14 行取本组其余在办单。
 */
const URGE_SPECS: EventSpec[] = [
  // ── 未处理 7：工单上真挂着待回催单 ──
  { id: 'u1', no: 'LCMN-20260817-83002', side: 'l1', actor: '张晓芸', when: '今天 19:27', content: '外投平台已二次跟帖，要求今日内给出赔付口径', read: false },
  { id: 'u2', no: 'LCMN-20260610-73118', side: 'customer', when: '今天 18:52', content: '已等两天，请尽快安排上门检测', read: false },
  { id: 'u3', no: 'LCMN-20260610-76010', side: 'l1', actor: '李一线', when: '今天 17:40', content: '首响已超时、客户情绪升级，请二线优先跟进', read: false },
  { id: 'u4', no: 'LCMN-20260609-66248', side: 'customer', when: '今天 16:18', content: '第三次催单，要求今日回电确认账号安全', read: false },
  { id: 'u5', no: 'LCMN-20260817-83005', side: 'l1', actor: '周一线', when: '今天 15:05', content: '学校侧催进度，请三线给出固件排查结论', read: false },
  { id: 'u6', no: 'LCMN-20260817-83003', side: 'customer', when: '今天 14:22', content: '已表达向平台投诉意向，要求书面回复', read: false },
  { id: 'u7', no: 'LCMN-20260610-78344', side: 'l1', actor: '张晓芸', when: '今天 13:10', content: '单子还在池里没人领，客户称已超承诺时间', read: false },
  // ── 已处理 14：本组其余在办单 ──
  { id: 'u8', no: 'LCMN-20260610-73026', side: 'customer', when: '今天 12:40', content: '影响日常使用，请加急', read: true },
  { id: 'u9', no: 'LCMN-20260610-75002', side: 'l1', actor: '陈一线', when: '今天 11:55', content: '已与客户约定 16:00 前回电说明配额方案', read: true },
  { id: 'u10', no: 'LCMN-20260610-75240', side: 'customer', when: '今天 11:20', content: '请同步退货审核进度', read: true },
  { id: 'u11', no: 'LCMN-20260817-83004', side: 'l1', actor: '李一线', when: '今天 10:48', content: '一线无法闭环，请调研侧尽快给结论', read: true },
  { id: 'u12', no: 'LCMN-20260610-75518', side: 'customer', when: '今天 10:05', content: '请确认明日上门时段', read: true },
  { id: 'u13', no: 'LCMN-20260713-90001', side: 'l1', actor: '王一线', when: '今天 09:40', content: '学校侧催进度，已提产研待反馈', read: true },
  { id: 'u14', no: 'LCMN-20260610-75744', side: 'customer', when: '今天 09:12', content: '请今日内给出优惠领取方式', read: true },
  { id: 'u15', no: 'LCMN-20260711-61551', side: 'l1', actor: '张晓芸', when: '今天 08:55', content: '监管平台已受理，需当日反馈处理进展', read: true },
  { id: 'u16', no: 'LCMN-20260817-83006', side: 'customer', when: '昨天 20:18', content: '请同步产研排查进度', read: true },
  { id: 'u17', no: 'LCMN-20260817-83007', side: 'l1', actor: '陈一线', when: '昨天 18:40', content: '协办迟迟未回填，客户晚间再次来电', read: true },
  { id: 'u18', no: 'LCMN-20260804-81001', side: 'customer', when: '昨天 16:05', content: '配件已到货，请更新续办安排', read: true },
  { id: 'u19', no: 'LCMN-20260609-66012', side: 'l1', actor: '李一线', when: '昨天 14:30', content: '约定今日回复未兑现', read: true },
  { id: 'u20', no: 'LCMN-20260609-66510', side: 'customer', when: '昨天 11:15', content: '请优先确认退款政策口径', read: true },
  { id: 'u21', no: 'LCMN-20260715-72015', side: 'l1', actor: '周一线', when: '昨天 09:50', content: '请安排滤芯复测', read: true },
];

/** 催单无「类型」字段（与办理页催单弹窗一致），只展示谁·何时·催了谁·哪张单 */
export const URGE_EVENTS: EventDrillRow[] = URGE_SPECS.map((s) => toEvent('催了', s));

/**
 * @deprecated 人员聚合口径保留，事件明细见 URGE_EVENTS。
 * ⚠️ 这里的逐人拆分与 URGE_EVENTS **无法互校**：事件明细的「催了谁」已改为回工单数据源取
 * 处理人，而工单数据源的处理人只有 王坐席 / 陈坐席 / 林坐席 / 赵三线 四位，
 * 与 TEAM_MEMBERS 的 12 位组员是两套互不相交的名册（见 TEAM_MEMBERS 注释）。
 */
export const URGE_DRILL: PeopleDrillRow[] = [
  { id: 'm10', name: '孙杰', online: '在线', count: 4, read: 2, unread: 2 },
  { id: 'm2',  name: '李昊', online: '在线', count: 3, read: 2, unread: 1 },
  { id: 'm5',  name: '陈曦', online: '在线', count: 3, read: 3, unread: 0 },
  { id: 'm1',  name: '张敏', online: '在线', count: 3, read: 2, unread: 1 },
  { id: 'm9',  name: '郑楠', online: '小休', count: 3, read: 2, unread: 1 },
  { id: 'm8',  name: '吴悦', online: '在线', count: 2, read: 2, unread: 0 },
  { id: 'm3',  name: '王倩', online: '在线', count: 2, read: 1, unread: 1 },
  { id: 'm7',  name: '周航', online: '离线', count: 1, read: 0, unread: 1 },
];

/* -------------------------------------------------------------------------
 * 补充事件明细（合计 13，未读 5）· 谁 · 何时 · 补给谁 · 哪张单
 * ----------------------------------------------------------------------- */
/**
 * 补充（合计 13，未处理 5）。
 * 未处理 5 行对应工单库里**真挂着待回补充**的 5 张单（hasSupplement / supplementUnread 且未联系）；
 * 其中「等待客户补充材料」那张本身是挂起态 —— 挂起原因就是等补充，客户回传材料
 * 正是让它复活的那个动作，故这一类挂起单是允许上补充明细的。
 */
const SUPPLEMENT_SPECS: EventSpec[] = [
  // ── 未处理 5：工单上真挂着待回补充 ──
  { id: 's1', no: 'LCMN-20260817-83002', side: 'l1', actor: '张晓芸', when: '今天 19:27', content: '客户补充：外投平台工单编号与聊天记录截图', read: false, category: '补充信息' },
  { id: 's2', no: 'LCMN-20260610-75240', side: 'customer', when: '今天 18:10', content: '补充商品实拍图与页面描述截图', read: false, category: '补充信息' },
  { id: 's3', no: 'LCMN-20260610-74836', side: 'l1', actor: '李一线', when: '今天 16:45', content: '更正企业联系人手机号与开票信息', read: false, category: '修改信息' },
  { id: 's4', no: 'LCMN-20260610-78120', side: 'customer', when: '今天 15:20', content: '客户申请取消本次上门服务', read: false, category: '取消服务' },
  { id: 's5', no: 'LCMN-20260610-78810', side: 'l1', actor: '周一线', when: '今天 14:05', content: '补充返厂寄件人联系方式', read: false, category: '其他' },
  // ── 已处理 8：补充标记已清或本无标记的在办单 ──
  { id: 's6', no: 'LCMN-20260609-66012', side: 'customer', when: '今天 12:30', content: '补充导入模板与报错日志', read: true, category: '补充信息' },
  { id: 's7', no: 'LCMN-20260610-75002', side: 'l1', actor: '陈一线', when: '今天 11:15', content: '修改组织管理员姓名与邮箱', read: true, category: '修改信息' },
  { id: 's8', no: 'LCMN-20260610-73026', side: 'customer', when: '今天 10:40', content: '补充跳曲录屏与当前固件版本', read: true, category: '补充信息' },
  { id: 's9', no: 'LCMN-20260610-75744', side: 'l1', actor: '李一线', when: '今天 09:50', content: '客户取消本次续费优惠申领', read: true, category: '取消服务' },
  { id: 's10', no: 'LCMN-20260610-75518', side: 'customer', when: '昨天 19:20', content: '修改预约上门时段', read: true, category: '修改信息' },
  { id: 's11', no: 'LCMN-20260715-72015', side: 'l1', actor: '王一线', when: '昨天 16:10', content: '补充滤芯更换凭证及其他说明', read: true, category: '其他' },
  { id: 's12', no: 'LCMN-20260609-66510', side: 'customer', when: '昨天 14:00', content: '补充支付流水号', read: true, category: '补充信息' },
  { id: 's13', no: 'LCMN-20260817-83004', side: 'l1', actor: '张晓芸', when: '昨天 11:30', content: '修改收件地址与联系人', read: true, category: '修改信息' },
];

/** 补充类型：修改信息 / 补充信息 / 取消服务 / 其他（与弹窗选项一致） */
export const SUPPLEMENT_EVENTS: EventDrillRow[] = SUPPLEMENT_SPECS.map((s) => toEvent('补充给', s));

/** @deprecated 人员聚合口径保留，事件明细见 SUPPLEMENT_EVENTS；与明细不可互校，同 URGE_DRILL */
export const SUPPLEMENT_DRILL: PeopleDrillRow[] = [
  { id: 'm10', name: '孙杰', online: '在线', count: 3, read: 1, unread: 2 },
  { id: 'm2',  name: '李昊', online: '在线', count: 2, read: 1, unread: 1 },
  { id: 'm5',  name: '陈曦', online: '在线', count: 2, read: 2, unread: 0 },
  { id: 'm1',  name: '张敏', online: '在线', count: 2, read: 2, unread: 0 },
  { id: 'm8',  name: '吴悦', online: '在线', count: 2, read: 1, unread: 1 },
  { id: 'm7',  name: '周航', online: '离线', count: 2, read: 1, unread: 1 },
];

/* -------------------------------------------------------------------------
 * 预约事件明细（合计 11，未沟通 6 / 已沟通 5）
 * 字段对齐办理页预约 Tab：预约人 · 预约时间 · 预约需求 · 已沟通
 * ----------------------------------------------------------------------- */
/**
 * 预约（合计 11，未沟通 6）。预约人＝该单处理人，回工单取。
 * 未沟通 6 行优先落在工单库里**真带预约钟 / 预约时间**的单上（预约钟还在跑就是尚未沟通）。
 */
const APPOINTMENT_SPECS: EventSpec[] = [
  // ── 未沟通 6 ──
  { id: 'a1', no: 'LCMN-20260610-75518', side: 'handler', when: '今天 19:00', content: '', read: false, category: '预约联系用户' },
  { id: 'a2', no: 'LCMN-20260713-90001', side: 'handler', when: '今天 17:30', content: '', read: false, category: '联系后端确认' },
  { id: 'a3', no: 'LCMN-20260610-75240', side: 'handler', when: '今天 16:00', content: '', read: false, category: '预约联系用户' },
  { id: 'a4', no: 'LCMN-20260610-73118', side: 'handler', when: '今天 15:00', content: '', read: false, category: '预约联系用户' },
  { id: 'a5', no: 'LCMN-20260817-83003', side: 'handler', when: '今天 14:00', content: '', read: false, category: '联系后端确认' },
  { id: 'a6', no: 'LCMN-20260804-81001', side: 'handler', when: '明天 10:00', content: '', read: false, category: '预约联系用户' },
  // ── 已沟通 5 ──
  { id: 'a7', no: 'LCMN-20260610-73026', side: 'handler', when: '今天 11:00', content: '', read: true, category: '联系后端确认' },
  { id: 'a8', no: 'LCMN-20260610-75744', side: 'handler', when: '昨天 16:30', content: '', read: true, category: '预约联系用户' },
  { id: 'a9', no: 'LCMN-20260610-75002', side: 'handler', when: '昨天 14:00', content: '', read: true, category: '预约联系用户' },
  { id: 'a10', no: 'LCMN-20260609-66012', side: 'handler', when: '昨天 11:00', content: '', read: true, category: '联系后端确认' },
  { id: 'a11', no: 'LCMN-20260715-72015', side: 'handler', when: '前天 15:30', content: '', read: true, category: '预约联系用户' },
];

export const APPOINTMENT_EVENTS: EventDrillRow[] = APPOINTMENT_SPECS.map((s) => toEvent('预约', s));

/** @deprecated 人员聚合口径保留，事件明细见 APPOINTMENT_EVENTS；与明细不可互校，同 URGE_DRILL */
export const APPOINTMENT_DRILL: PeopleDrillRow[] = [
  { id: 'm10', name: '孙杰', online: '在线', count: 3, read: 1, unread: 2 },
  { id: 'm2',  name: '李昊', online: '在线', count: 2, read: 0, unread: 2 },
  { id: 'm5',  name: '陈曦', online: '在线', count: 2, read: 2, unread: 0 },
  { id: 'm1',  name: '张敏', online: '在线', count: 2, read: 1, unread: 1 },
  { id: 'm8',  name: '吴悦', online: '在线', count: 1, read: 1, unread: 0 },
  { id: 'm7',  name: '周航', online: '离线', count: 1, read: 0, unread: 1 },
];

/* -------------------------------------------------------------------------
 * 退回工单下钻 · 按**来源**（2 + 1 = 3）
 *
 * 2026-08-05 业务定：「退回」含两条回流路径，**推翻决策 D16「仅有技术支持退回」**——
 *   ① 技术支持退回：动作矩阵 B11，技术支持专属动作
 *   ② 回访退回：调研回访中客户答「未解决 · 方案没用 / 太复杂 / 没人联系」触发重新分配。
 *      ⚠️ 该动作在《【815】调研回访 PRD》§7.2 里的**正式名称是「打回」**，
 *      按字面搜「退回」会漏掉它。
 * 两者 SLA 解决钟均续走、不停表，故与积压口径不冲突。
 * 因为有了两个来源，下钻由「按人员」改为「按来源」，与转入卡同构。
 * ----------------------------------------------------------------------- */
export const RETURN_DRILL: SourceDrillGroup[] = [
  {
    source: '技术支持退回',
    count: 2,
    items: [
      { no: 'GD20260804012', title: '语音识别准确率异常，非技术缺陷', from: '技术支持组 · 周工' },
      { no: 'GD20260804031', title: '接口报错系客户端配置问题', from: '技术支持组 · 周工' },
    ],
  },
  {
    source: '回访退回',
    count: 1,
    items: [
      { no: 'GD20260803055', title: '客户回访答「解决方案没有用」，重新分配', from: '调研回访 · 自动打回' },
    ],
  },
];

/* -------------------------------------------------------------------------
 * 挂起下钻 · 按处理人（合计 3）· SLA 已停表
 * note 给「已挂多久」——没有时间压力提醒，光看数字判断不出哪个该捞回来
 * ----------------------------------------------------------------------- */
export const SUSPEND_DRILL: PeopleDrillRow[] = [
  { id: 'm10', name: '孙杰', online: '在线', count: 1, note: '已挂 4d 2h · 等客户回材料', stayMinutes: 5880 },
  { id: 'm4',  name: '赵磊', online: '小休', count: 1, note: '已挂 2d 6h · 等客户确认', stayMinutes: 3240 },
  { id: 'm3',  name: '王倩', online: '在线', count: 1, note: '已挂 18h · 等客户回材料', stayMinutes: 1080 },
];

/* -------------------------------------------------------------------------
 * 已转出下钻 · 按原处理人（合计 2）· SLA 已停表，等售后回传
 * ----------------------------------------------------------------------- */
export const TRANSFERRED_OUT_DRILL: PeopleDrillRow[] = [
  { id: 'm2', name: '李昊', online: '在线', count: 1, note: '已转出 2d 8h · 售后一组', stayMinutes: 3360 },
  { id: 'm8', name: '吴悦', online: '在线', count: 1, note: '已转出 6h · 售后二组', stayMinutes: 360 },
];

/* -------------------------------------------------------------------------
 * 委派中下钻 · 按主责人（合计 4）
 * 「委派中」是叠加在「处理中」上的子状态：主责人仍是本人，只是在等协办回填。
 * 故按**主责人**归集，不是按协办人。
 * ----------------------------------------------------------------------- */
export const DELEGATED_DRILL: PeopleDrillRow[] = [
  { id: 'm10', name: '孙杰', online: '在线', count: 2, note: '最久 1d 6h · 协办：技术支持组', stayMinutes: 1800 },
  { id: 'm5',  name: '陈曦', online: '在线', count: 1, note: '10h · 协办：王工', stayMinutes: 600 },
  { id: 'm1',  name: '张敏', online: '在线', count: 1, note: '4h · 协办：售后一组', stayMinutes: 240 },
];

/* -------------------------------------------------------------------------
 * 今日转单下钻 · 按来源（2+2+1 = 5）
 * ----------------------------------------------------------------------- */
export const TRANSFER_DRILL: SourceDrillGroup[] = [
  {
    source: '其他客服组',
    count: 2,
    items: [
      { no: 'GD20260803001', title: '订单支付成功但未生成物流单', from: '受理二组 · 何蕾' },
      { no: 'GD20260803014', title: '优惠券核销后金额未抵扣', from: '受理三组 · 段宇' },
    ],
  },
  {
    source: '跨组调剂',
    count: 2,
    items: [
      { no: 'GD20260803027', title: '客户连续三次催单，要求升级处理', from: '值班调度 · 系统调剂' },
      { no: 'GD20260803033', title: '大客户批量退货申请', from: '值班调度 · 系统调剂' },
    ],
  },
  {
    source: '售后回传',
    count: 1,
    items: [
      { no: 'GD20260802088', title: '上门检测无故障，退回客服核实诉求', from: '售后一组 · 陈工' },
    ],
  },
];

/* -------------------------------------------------------------------------
 * 时段流量趋势 · 24 小时（早高峰 9–11、午后高峰 14–16）
 * inbound 合计 = 142 ＝ 今日进线；forward 合计 = 118 ＝ 今日下送；closed 合计 = 96 ＝ 今日结案
 * 今日是积压日：三条线自上而下 进线 > 下送 > 结案，缺口即当日新增积压 46。
 * ----------------------------------------------------------------------- */
export const TRAFFIC_HOURLY: TrafficPoint[] = [
  { t: '00:00', inbound: 1,  forward: 1,  closed: 1 },
  { t: '01:00', inbound: 0,  forward: 0,  closed: 0 },
  { t: '02:00', inbound: 0,  forward: 0,  closed: 0 },
  { t: '03:00', inbound: 0,  forward: 0,  closed: 0 },
  { t: '04:00', inbound: 1,  forward: 0,  closed: 0 },
  { t: '05:00', inbound: 1,  forward: 1,  closed: 1 },
  { t: '06:00', inbound: 2,  forward: 1,  closed: 1 },
  { t: '07:00', inbound: 3,  forward: 2,  closed: 2 },
  { t: '08:00', inbound: 6,  forward: 4,  closed: 3 },
  { t: '09:00', inbound: 12, forward: 9,  closed: 7 },
  { t: '10:00', inbound: 15, forward: 13, closed: 10 },
  { t: '11:00', inbound: 13, forward: 12, closed: 10 },
  { t: '12:00', inbound: 7,  forward: 5,  closed: 4 },
  { t: '13:00', inbound: 6,  forward: 5,  closed: 4 },
  { t: '14:00', inbound: 14, forward: 12, closed: 10 },
  { t: '15:00', inbound: 16, forward: 14, closed: 11 },
  { t: '16:00', inbound: 12, forward: 11, closed: 9 },
  { t: '17:00', inbound: 9,  forward: 8,  closed: 7 },
  { t: '18:00', inbound: 6,  forward: 5,  closed: 4 },
  { t: '19:00', inbound: 5,  forward: 4,  closed: 3 },
  { t: '20:00', inbound: 4,  forward: 4,  closed: 3 },
  { t: '21:00', inbound: 4,  forward: 3,  closed: 3 },
  { t: '22:00', inbound: 3,  forward: 2,  closed: 2 },
  { t: '23:00', inbound: 2,  forward: 2,  closed: 1 },
];

/* -------------------------------------------------------------------------
 * 流量趋势 · 近 30 天（7/5 – 8/3）
 *
 * 【为什么 closed 大部分天数 > inbound】前 29 天是**稳态**：结案在消化存量，
 * 逐日盈亏互抵，Σ(inbound − closed) = +7 —— 正是积压从 7/5 的 10 涨到 8/2 收盘的 17。
 * 若像早期版本那样让 closed 恒低于 inbound 26%，30 天后积压会累到上千，体系立刻不成立。
 * 8/3（今日）是唯一的积压日：进线 142（+45）、升级 23（+6），单日 +46 → 积压 63。
 * 末点与今日指标卡逐一对齐：142 / 118 / 96。
 * ----------------------------------------------------------------------- */
export const TRAFFIC_DAILY: TrafficPoint[] = [
  { t: '7/5',  inbound: 128, forward: 118, closed: 130 },
  { t: '7/6',  inbound: 141, forward: 126, closed: 139 },
  { t: '7/7',  inbound: 152, forward: 138, closed: 148 },
  { t: '7/8',  inbound: 147, forward: 131, closed: 150 },
  { t: '7/9',  inbound: 139, forward: 127, closed: 141 },
  { t: '7/10', inbound: 133, forward: 122, closed: 134 },
  { t: '7/11', inbound: 96,  forward: 90,  closed: 101 },
  { t: '7/12', inbound: 88,  forward: 84,  closed: 92 },
  { t: '7/13', inbound: 145, forward: 132, closed: 140 },
  { t: '7/14', inbound: 158, forward: 140, closed: 152 },
  { t: '7/15', inbound: 162, forward: 145, closed: 158 },
  { t: '7/16', inbound: 151, forward: 136, closed: 153 },
  { t: '7/17', inbound: 143, forward: 130, closed: 145 },
  { t: '7/18', inbound: 102, forward: 96,  closed: 108 },
  { t: '7/19', inbound: 91,  forward: 87,  closed: 96 },
  { t: '7/20', inbound: 149, forward: 134, closed: 144 },
  { t: '7/21', inbound: 155, forward: 139, closed: 150 },
  { t: '7/22', inbound: 168, forward: 148, closed: 159 },
  { t: '7/23', inbound: 160, forward: 142, closed: 156 },
  { t: '7/24', inbound: 146, forward: 133, closed: 148 },
  { t: '7/25', inbound: 108, forward: 101, closed: 113 },
  { t: '7/26', inbound: 94,  forward: 89,  closed: 99 },
  { t: '7/27', inbound: 153, forward: 137, closed: 147 },
  { t: '7/28', inbound: 165, forward: 146, closed: 157 },
  { t: '7/29', inbound: 159, forward: 141, closed: 154 },
  { t: '7/30', inbound: 150, forward: 135, closed: 149 },
  { t: '7/31', inbound: 144, forward: 131, closed: 146 },
  { t: '8/1',  inbound: 111, forward: 104, closed: 116 },
  { t: '8/2',  inbound: 97,  forward: 92,  closed: 103 },
  { t: '8/3',  inbound: 142, forward: 118, closed: 96 },
];

/* -------------------------------------------------------------------------
 * 模块 4 · 本组高频问题 TOP10（二级问题分类）
 * count 合计 112；ratio ＝ count ÷ 142（今日进线）× 100，ratio 合计 78.8
 * ----------------------------------------------------------------------- */
export const PROBLEM_TOP10: ProblemRow[] = [
  { rank: 1,  tagL1: '云空间', tagL2: '操作指导', tagL3: '如何领取/升级云空间',   count: 26, ratio: 18.3, mom: '+12%', solved: false },
  { rank: 2,  tagL1: '我的文件', tagL2: '软件问题', tagL3: '邮件分享失败',         count: 19, ratio: 13.4, mom: '+8%',  solved: false },
  { rank: 3,  tagL1: '录音转写', tagL2: '功能异常', tagL3: '转写结果缺字漏句',     count: 15, ratio: 10.6, mom: '-4%',  solved: true },
  { rank: 4,  tagL1: '硬件故障', tagL2: '开机异常', tagL3: '按键无响应无法开机',   count: 12, ratio: 8.5,  mom: '+5%',  solved: false },
  { rank: 5,  tagL1: '售后服务', tagL2: '维修进度', tagL3: '寄修后长时间未回寄',   count: 10, ratio: 7.0,  mom: '-9%',  solved: true },
  { rank: 6,  tagL1: '账号安全', tagL2: '登录异常', tagL3: '验证码收不到',         count: 9,  ratio: 6.3,  mom: '+2%',  solved: true },
  { rank: 7,  tagL1: '云空间', tagL2: '功能介绍', tagL3: '云空间存储大小咨询',     count: 7,  ratio: 4.9,  mom: '+15%', solved: false },
  { rank: 8,  tagL1: '售后服务', tagL2: '配件供应', tagL3: '配件缺货等待周期长',   count: 6,  ratio: 4.2,  mom: '+3%',  solved: false },
  { rank: 9,  tagL1: '订单交易', tagL2: '优惠权益', tagL3: '优惠券不可用',         count: 5,  ratio: 3.5,  mom: '-6%',  solved: true },
  { rank: 10, tagL1: '硬件故障', tagL2: '外观问题', tagL3: '开箱即有划痕',         count: 3,  ratio: 2.1,  mom: '-11%', solved: true },
];

/* -------------------------------------------------------------------------
 * 多班组切换（组长可管辖多组）
 * 原型：每组一套示意快照；守恒式各组自洽。
 * ----------------------------------------------------------------------- */
export interface LeaderTeam {
  value: string;
  label: string;
  size: number;
}

/** 当前登录班组长管辖的班组（演示：3 组） */
export const LEADER_TEAMS: LeaderTeam[] = [
  { value: 'cs-1', label: '受理一组', size: 12 },
  { value: 'cs-2', label: '受理二组', size: 10 },
  { value: 'as-1', label: '售后一组', size: 8 },
];

export interface TeamBoardSnapshot {
  teamId: string;
  openingBacklog: number;
  /** 关注区锚点：积压总量（守恒式挂在这张卡上） */
  backlog: BoardMetric;
  /** 关注区 8 项，按 group 分三组渲染 */
  focus: BoardMetric[];
  metrics: BoardMetric[];
  todos: BoardTodo[];
  members: MemberRow[];
  priorityBuckets: PriorityBucket[];
  /** 趋势/问题 TOP 相对基准的缩放（原型示意） */
  trafficScale: number;
  conclusion: string;
}

function patchMetric(base: BoardMetric, patch: Partial<BoardMetric>): BoardMetric {
  return { ...base, ...patch };
}

/** 按 key 从 BOARD_FOCUS 取基准卡再打补丁，保证各组顺序与字段不漂移 */
function focusOf(key: string, patch: Partial<BoardMetric>): BoardMetric {
  const base = BOARD_FOCUS.find((f) => f.key === key);
  if (!base) throw new Error(`BOARD_FOCUS 缺少 ${key}`);
  return { ...base, ...patch };
}

function scaleMembers(scale: number, take: number): MemberRow[] {
  return TEAM_MEMBERS.slice(0, take).map((m, i) => {
    const workload = Math.max(0, Math.round(m.workload * scale));
    const loadLevel: MemberRow['loadLevel'] = workload > 30 ? '满载' : workload >= 15 ? '适中' : '空闲';
    return {
      ...m,
      id: `${m.id}-${take}`,
      workload,
      loadLevel,
      forwardToday: Math.max(0, Math.round(m.forwardToday * scale)),
      overdue: Math.max(0, Math.round(m.overdue * scale)),
      // 售后组换一批姓氏感，避免三组人名完全一样
      name: take <= 8 && i < 8
        ? ['陈工', '林工', '周工', '吴工', '郑工', '何工', '冯工', '蒋工'][i]
        : m.name,
    };
  });
}

/** 按班组取看板快照；默认受理一组＝现网基准数据 */
export function getTeamBoardSnapshot(teamId: string): TeamBoardSnapshot {
  if (teamId === 'cs-2') {
    const opening = 12;
    const inbound = 98;
    const closed = 88;
    /** 积压＝超解决时效的未结单（非在办总量）。本组量小、压力低于一组 */
    const backlog = 6;
    const unassigned = 5;
    return {
      teamId,
      openingBacklog: opening,
      backlog: patchMetric(BOARD_BACKLOG, { value: String(backlog), delta: '0', deltaTone: 'neutral' }),
      focus: [
        focusOf('unassigned', { value: String(unassigned), sub: '最久等待 1h08m', delta: '+1' }),
        focusOf('delegated', { value: '2', sub: '最久 8h · 等协办回填', delta: '0', deltaTone: 'neutral' }),
        focusOf('suspended', { value: '2', sub: '最久 1d 4h · 等客户', delta: '0', deltaTone: 'neutral' }),
        focusOf('transferredOut', { value: '1', sub: '已转出 12h · 等售后回传', delta: '0', deltaTone: 'neutral' }),
        focusOf('returned', { value: '2', delta: '0', deltaTone: 'neutral' }),
        focusOf('transferIn', { value: '5', delta: '+1' }),
        focusOf('urge', { value: '13', pending: 4, pendingLabel: '未处理', sub: '本周 13 次，未处理 4' }),
        focusOf('supplement', { value: '8', pending: 3, pendingLabel: '未处理', sub: '8次，未处理 3' }),
        focusOf('appointment', { value: '7', pending: 4, pendingLabel: '未沟通', sub: '7次，未沟通 4' }),
      ],
      metrics: [
        patchMetric(BOARD_METRICS[0], { value: String(inbound), sub: '创建 93 转入5', delta: '+18' }),
        patchMetric(BOARD_METRICS[1], { value: '86', sub: '下送 / 关闭 / 强结', delta: '+11' }),
        patchMetric(BOARD_METRICS[2], { value: '14', sub: '技术支持 / 飞书', delta: '+3', deltaTone: 'bad' }),
        patchMetric(BOARD_METRICS[3], { value: '2', sub: '技术支持 / 回访', delta: '0', deltaTone: 'neutral' }),
        patchMetric(BOARD_METRICS[4], { value: '93.2%', sub: '昨日 74 单 · 69 单已联络', delta: '+0.8%', deltaTone: 'good' }),
        patchMetric(BOARD_METRICS[5], { value: '2.0%', sub: '首响超 2 / 98 · 平均超 0.6h', delta: '-0.2%', deltaTone: 'good' }),
        patchMetric(BOARD_METRICS[6], { value: '3.1%', sub: '解决超 3 / 98 · 平均超 1.6h', delta: '-0.2%', deltaTone: 'good' }),
        // 「服务不满意」是**单量**不是 5 分制均分 —— 原先写 '4.7' 是被 2026-08-05 换掉的
        // 旧满意度均分套在新标签下，切到本组就会显示「服务不满意 4.7」。
        patchMetric(BOARD_METRICS[7], { value: '2', sub: '服务分 1–3 分 · 占今日已评 2.1%', delta: '-1', deltaTone: 'good' }),
      ],
      todos: [
        { key: 'assign', label: '待指派', count: unassigned, unit: '单', tone: 'danger' },
        { key: 'approve', label: '待审批', count: 2, unit: '条', tone: 'warn' },
      ],
      members: scaleMembers(0.78, 10),
      /** 合计 1+2+2+1 = 6 ＝ 本组积压 6 */
      priorityBuckets: [
        { sysKey: 'P0', reqLabel: '紧急', count: 1, color: '#EF4444' },
        { sysKey: 'P1', reqLabel: '重要', count: 2, color: '#F59E0B' },
        { sysKey: 'P2', reqLabel: '普通加急', count: 2, color: '#1A6FFF' },
        { sysKey: 'P3', reqLabel: '普通', count: 1, color: '#9CA3AF' },
      ],
      trafficScale: 0.7,
      conclusion: `今日进线 ${inbound}（+18）、升级 14（+3），超时未结 ${backlog} 单，本组压力低于一组`,
    };
  }

  if (teamId === 'as-1') {
    const opening = 9;
    const inbound = 64;
    const closed = 58;
    /** 售后解决时效长，但上门排期难，超时集中在等配件的单上 */
    const backlog = 5;
    const unassigned = 3;
    return {
      teamId,
      openingBacklog: opening,
      backlog: patchMetric(BOARD_BACKLOG, { value: String(backlog), delta: '+1' }),
      focus: [
        focusOf('unassigned', { value: String(unassigned), sub: '最久等待 46m', delta: '0', deltaTone: 'neutral' }),
        focusOf('delegated', { value: '1', sub: '6h · 等协办回填', delta: '0', deltaTone: 'neutral' }),
        focusOf('suspended', { value: '4', sub: '最久 6d 3h · 等配件到货', delta: '+2' }),
        focusOf('transferredOut', { value: '1', sub: '已转出 1d 2h · 回传受理组', delta: '0', deltaTone: 'neutral' }),
        focusOf('returned', { value: '1', delta: '0', deltaTone: 'neutral' }),
        focusOf('transferIn', { value: '3', delta: '+1' }),
        focusOf('urge', { value: '7', pending: 2, pendingLabel: '未处理', sub: '本周 7 次，未处理 2' }),
        focusOf('supplement', { value: '4', pending: 1, pendingLabel: '未处理', sub: '4次，未处理 1' }),
        focusOf('appointment', { value: '5', pending: 3, pendingLabel: '未沟通', sub: '5次，未沟通 3' }),
      ],
      metrics: [
        patchMetric(BOARD_METRICS[0], { value: String(inbound), sub: '创建 61 转入3', delta: '+9' }),
        patchMetric(BOARD_METRICS[1], { value: '52', label: '今日完工', sub: '下送 / 关闭 / 强结', delta: '+6' }),
        patchMetric(BOARD_METRICS[2], { value: '8', sub: '技术支持 / 飞书', delta: '+2', deltaTone: 'bad' }),
        patchMetric(BOARD_METRICS[3], { value: '1', sub: '技术支持 / 回访', delta: '0', deltaTone: 'neutral' }),
        patchMetric(BOARD_METRICS[4], { value: '88.1%', sub: '昨日 42 单 · 37 单已联络', delta: '+1.5%', deltaTone: 'good' }),
        patchMetric(BOARD_METRICS[5], { value: '1.6%', sub: '首响超 1 / 64 · 平均超 0.5h', delta: '0', deltaTone: 'neutral' }),
        patchMetric(BOARD_METRICS[6], { value: '3.1%', sub: '解决超 2 / 64 · 平均超 3.1h', delta: '+0.3%', deltaTone: 'bad' }),
        // 同上：单量，不是 5 分制均分。
        patchMetric(BOARD_METRICS[7], { value: '2', sub: '服务分 1–3 分 · 占今日已评 2.8%', delta: '0', deltaTone: 'neutral' }),
      ],
      todos: [
        { key: 'assign', label: '待指派', count: unassigned, unit: '单', tone: 'danger' },
        { key: 'approve', label: '待审批', count: 1, unit: '条', tone: 'warn' },
      ],
      members: scaleMembers(0.55, 8),
      /** 合计 1+2+1+1 = 5 ＝ 本组积压 5 */
      priorityBuckets: [
        { sysKey: 'P0', reqLabel: '紧急', count: 1, color: '#EF4444' },
        { sysKey: 'P1', reqLabel: '重要', count: 2, color: '#F59E0B' },
        { sysKey: 'P2', reqLabel: '普通加急', count: 1, color: '#1A6FFF' },
        { sysKey: 'P3', reqLabel: '普通', count: 1, color: '#9CA3AF' },
      ],
      trafficScale: 0.45,
      conclusion: `今日进线 ${inbound}、升级 8（+2），超时未结 ${backlog} 单；上门资源偏紧，建议优先消化 P0/P1`,
    };
  }

  // cs-1 基准
  return {
    teamId: 'cs-1',
    openingBacklog: BOARD_OPENING_BACKLOG,
    backlog: BOARD_BACKLOG,
    focus: BOARD_FOCUS,
    metrics: BOARD_METRICS,
    todos: BOARD_TODOS,
    members: TEAM_MEMBERS,
    priorityBuckets: PRIORITY_BUCKETS,
    trafficScale: 1,
    conclusion: '今日进线 142（+45）、升级 23（+6）；超时未结 14 单（+3），建议优先清 P0/P1',
  };
}
