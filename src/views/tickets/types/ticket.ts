// 工单工作台类型与配色映射。配色值全部取自 iFLY-FlowOS-坐席视角.pen 画板 SJpgc 实测，
// 业务规则对齐 PRD-02。

import type { BusinessType, CreateFormTicketType, TicketSource } from '@/views/tickets/types/createTicket';

/**
 * 工作台主 Tab。
 * - `pool`        = 本组 · 待领取
 * - `poolPending` = 催补待回（独立主 Tab，紧挨「本组」；PRD-915 补充与催单 §9.3）
 */
export type TabKey = 'mine' | 'done' | 'pool' | 'poolPending' | 'cc' | 'review';
/** 工单列表（全量库）视图 Tab */
export type ListViewKey = 'all' | 'mine' | 'team' | 'pool' | 'archived';

/** 我的任务 Tab 子筛选（PRD-02 v1.2） */
export type MineChipKey =
  | 'all'
  | 'unresponded'
  | 'processing'
  | 'appointment'
  | 'myUpgrade'
  | 'delegate'
  | 'supplement'
  | 'dunning'
  | 'returned'
  | 'suspended'
  | 'soon'
  | 'overdue';

/** 已办 Tab 子筛选（PRD-02 v1.2 §7④） */
export type DoneChipKey =
  | 'all'
  | 'myUpgrade'
  | 'transfer'
  | 'delegate'
  | 'closed'
  | 'forceClose';

/** @我的工单 Tab 子筛选（PRD-02 v1.2 §7⑥） */
export type MentionChipKey = 'all' | 'unread';

/** 待审核 · 子筛选 chips（按送审原因） */
export type ReviewChipKey =
  | 'all'
  | 'suspendReview'
  | 'forceCloseReview'
  | 'closeReview';

/** 本组 · 催补待回 · 子筛选（PRD-915 补充与催单 §9.3） */
export type PoolPendingChipKey = 'all' | 'dunning' | 'supplement';

/** @deprecated 兼容旧引用；待审核请用 ReviewChipKey */
export type LegacyChipKey = ReviewChipKey;

export type ChipKey = MineChipKey | DoneChipKey | MentionChipKey | ReviewChipKey | PoolPendingChipKey;

/** 待审核 · 送审原因 */
export type ReviewReason = '挂起送审' | '强结送审' | '关单送审';

/** 原型当前登录坐席对应的处理人姓名（与 mock 工单 assignee 对齐） */
export const WORKBENCH_HANDLER = '王坐席';

export type TicketType = CreateFormTicketType;
export type Channel = '在线客服' | '电话' | '邮件' | '小程序' | 'APP';
export type SmartMark = '升级' | '情绪' | '相似' | '知识';
/** 客户身份标签（列表展示，替代 VIP） */
export type CustomerTag = '记者' | '老师' | '校长' | '自媒体';
export type Priority = 'P0' | 'P1' | 'P2' | 'P3';
/**
 * 工单**子状态**（对齐《00-基线-工单状态与动作》§1，一律中文状态名）。
 *
 * 基线 §1「这张表怎么读」把状态分成两层：
 * - **子状态**＝落库值，也是动作矩阵、权限判断的依据，一格一个、不可再拆；
 * - **状态**＝粗粒度分组（初始 / 处理中 / 调研中 / 审核中 / 终态），只给看板、筛选、状态徽章用，见 STATUS_GROUP。
 *
 * **代码里做状态判断一律用子状态**，别拿分组去判动作可用性。
 * 字段仍名 nodeStatus，类型即基线子状态。
 */
export type TicketStatus =
  | '草稿'
  | '未认领'
  | '待响应'
  | '处理中'
  | '调研中'
  | '申请挂起中'
  | '申请关闭中'
  | '申请强结中'
  | '业务动作审核中'
  | '已挂起'
  /** 升级 · 三线技术支持：单落三线组池、**处理人为空**等回传（基线 §1 ※14） */
  | '已升级技术支持'
  /** 升级 · 产研（飞书项目 / TPD / RDM / 磐石）：产研是**服务节点**、处理人不转移、不进池（※14a） */
  | '已升级产研'
  /**
   * 升阶**第一跳**：非投诉单升级为投诉单。原单关闭、新单继续跑。
   * 基线 §1 v1.13 起「一跳一态、一去向一态」——第二跳另有「已升级外投」，
   * 不再靠 externalAppeal 字段在运行时拼名。
   */
  | '已升级投诉'
  /** 升阶**第二跳**：内投升级为外投。外投平台（12315 / 黑猫等）仍挂投诉渠道字段，**不拆状态** */
  | '已升级外投'
  | '已委派'
  | '已退回'
  | '已转出'
  /** 结案方式＝**正常流程**的单走完调研后到这里（基线 §1 该行） */
  | '已结案'
  /**
   * 关闭工单，审核通过后即为已关闭（基线 §1 该行）。
   * 【注意】它是一个**具体的可落库子状态**，**不是**"全部关闭类终态"的分类伞——
   * 别拿它去泛指已强结 / 已结案 / 已转咨询，那几个各有各的名字。
   */
  | '已关闭'
  | '已强结'
  /** 转单的三个去向各占一个子状态（基线 §1「一去向一态」），不靠 transferredToType 拼名 */
  | '已转咨询'
  | '已转建议'
  | '已转商机'
  | '已取消'
  /** 结案方式＝**直接结案**：建单即结案、从未进流程，不支持催补（基线 §1 ※25） */
  | '直接结案';

/** @deprecated 沿用历史字段名，与 TicketStatus 同义 */
export type NodeStatus = TicketStatus;

/** 基线 §1 全部子状态（筛选项 / 校验用）：25 行 = 25 个可落库子状态，顺序与基线 §1 表一致 */
export const BASELINE_STATUSES: TicketStatus[] = [
  '草稿', '未认领', '待响应', '处理中', '调研中',
  '申请挂起中', '申请关闭中', '申请强结中', '业务动作审核中',
  '已挂起', '已升级技术支持', '已升级产研', '已升级投诉', '已升级外投',
  '已委派', '已退回', '已转出',
  '已结案', '已关闭', '已强结', '已转咨询', '已转建议', '已转商机', '已取消', '直接结案',
];

/** 两类升级的子状态集合（基线 §1「转出去等回传」表：都是**非终态**） */
export const ESCALATED_STATUSES: TicketStatus[] = ['已升级技术支持', '已升级产研'];

/** 转单三个去向的子状态集合（基线 §1「一去向一态」） */
export const TRANSFERRED_STATUSES: TicketStatus[] = ['已转咨询', '已转建议', '已转商机'];

/**
 * 粗粒度**状态**分组（基线 §1 第二列）——只给看板、筛选、状态徽章用。
 *
 * 「处理中」既是状态也是子状态：状态＝处理中且子状态＝处理中，表示"就在处理、没有更具体的情况"；
 * 已挂起 / 已升级技术支持 / 已升级产研 / 已委派 / 已退回 / 已转出 都是它的细分。
 * 「调研中」独立成一个分组：单不在我方手上（在回访环节等客户反馈），SLA 口径与「处理中」不同、看板须能单独筛。
 *
 * ⚠️ **动作可用性、权限、拦截一律按子状态判**，不要拿本分组当判据。
 */
export type StatusGroup = '初始' | '处理中' | '调研中' | '审核中' | '终态';

/** 依据基线 §1 第二列：25 个子状态各归一组，终态共 10 个 */
export const STATUS_GROUP: Record<TicketStatus, StatusGroup> = {
  草稿: '初始',
  未认领: '初始',
  待响应: '初始',
  处理中: '处理中',
  调研中: '调研中',
  申请挂起中: '审核中',
  申请关闭中: '审核中',
  申请强结中: '审核中',
  业务动作审核中: '审核中',
  已挂起: '处理中',
  已升级技术支持: '处理中',
  已升级产研: '处理中',
  已升级投诉: '终态',
  已升级外投: '终态',
  已委派: '处理中',
  已退回: '处理中',
  已转出: '处理中',
  已结案: '终态',
  已关闭: '终态',
  已强结: '终态',
  已转咨询: '终态',
  已转建议: '终态',
  已转商机: '终态',
  已取消: '终态',
  直接结案: '终态',
};

/**
 * 落库子状态 → **页面展示名称**（基线 §1 第三列），**25 个逐个给死值**。
 *
 * 界面文案与落库值可以不同（落库「已转出」、界面「已转售后」）；
 * **逻辑判断、动作矩阵、权限一律用子状态**，两列不得混用。
 *
 * ⚠️ 依据基线 §1「一跳一态、一去向一态」：展示名与子状态**一一对应**，
 * 不再靠 transferredToType / externalAppeal 这类字段在运行时拼名——
 * 拼出来的名字既进不了筛选器，也进不了状态机。
 */
export const STATUS_DISPLAY_NAME: Record<TicketStatus, string> = {
  草稿: '草稿',
  未认领: '待领取',
  待响应: '待响应',
  处理中: '处理中',
  调研中: '调研中',
  申请挂起中: '挂起审核中',
  申请关闭中: '关闭审核中',
  申请强结中: '强结审核中',
  业务动作审核中: '业务审核中',
  已挂起: '已挂起',
  已升级技术支持: '已升级技术支持',
  已升级产研: '已升级产研',
  已升级投诉: '已升级投诉',
  已升级外投: '已升级外投',
  已委派: '已委派',
  已退回: '已退回',
  已转出: '已转售后',
  已结案: '已结案',
  已关闭: '已关闭',
  已强结: '已强结',
  已转咨询: '已转咨询',
  已转建议: '已转建议',
  已转商机: '已转商机',
  已取消: '已取消',
  直接结案: '直接结案',
};

/**
 * 取某个落库值的**页面展示名称**（基线 §1 第三列）——**纯查表，无上下文**。
 *
 * 入参放宽到 string：处理页的 detail.status 是自由文本，除基线子状态外还会出现
 * 售后单状态等非基线字面值——那些原样返回，不硬套映射。
 */
export function statusDisplayName(status: string): string {
  return STATUS_DISPLAY_NAME[status as TicketStatus] ?? status;
}

/** 列表行取状态展示名的收口（与 statusDisplayName 同一张表，调用处不必自己拼） */
export function ticketStatusDisplayName(t: Ticket): string {
  return statusDisplayName(t.nodeStatus);
}

/**
 * 结案方式（基线 §1「结案方式」小节）——**建单时选定、此后不可改**，与工单类型正交
 * （工单类型仍是咨询 / 建议 / 投诉 / 商机四类不变）。
 *
 * - 正常流程：进流程办理，走完调研回访后结案 → 落「已结案」
 * - 直接结案：一次性解答完、当场收口，从未进流程 → 落「直接结案」；**不下送、不升级、不挂起、不转派**
 *
 * 统计口径与 SLA 都按本维度切（解决率、平均处理时长、满意度参评率），不靠状态反推。
 */
export type ClosureMode = '正常流程' | '直接结案';

export const CLOSURE_MODES: ClosureMode[] = ['正常流程', '直接结案'];

/** 缺省视为「正常流程」：历史单没有这个字段，按走过流程处理更安全（不会误收窄动作集） */
export function resolveClosureMode(mode?: ClosureMode): ClosureMode {
  return mode ?? '正常流程';
}

/** 直接结案单：动作集极简（基线「结案方式」小节「动作集」一条） */
export function isDirectClosure(mode?: ClosureMode): boolean {
  return resolveClosureMode(mode) === '直接结案';
}

export type StatusTone = 'primary' | 'success' | 'warning' | 'danger' | 'info';

/** 列表状态标签配色（待处理 / 已完成 / 处理中 / 强结·取消 / 默认） */
export const STATUS_COLOR_MAP: Record<StatusTone, { color: string; bg: string }> = {
  primary: { color: '#1a6fff', bg: '#1a6fff18' },
  success: { color: '#10b981', bg: '#10b98118' },
  warning: { color: '#f59e0b', bg: '#f59e0b18' },
  danger: { color: '#ef4444', bg: '#ef444418' },
  info: { color: '#6b7280', bg: '#6b728018' },
};

const REVIEW_STATUSES: TicketStatus[] = [
  '申请挂起中', '申请关闭中', '申请强结中', '业务动作审核中',
];

/**
 * 状态徽章配色。非终态直接按**粗粒度分组**取色（基线 §1 第二列就是给状态徽章用的）；
 * 终态内部再按子状态分：正常收口=绿、异常终止=红、业务转到别的单上=中性。
 */
export function statusTone(status: TicketStatus): StatusTone {
  if (STATUS_GROUP[status] !== '终态') {
    return STATUS_GROUP[status] === '初始' ? 'primary' : 'warning';
  }
  switch (status) {
    // 正常收口一族：走完流程的「已结案」、建单即结的「直接结案」、
    // 以及审批通过后友好收口的「已关闭」（依据基线 §1）
    case '已结案':
    case '直接结案':
    case '已关闭':
      return 'success';
    case '已强结':
    case '已取消':
      return 'danger';
    // 转单三态 / 升阶两态：原单关闭、业务转到新单上，既非正常收口也非异常终止
    case '已转咨询':
    case '已转建议':
    case '已转商机':
    case '已升级投诉':
    case '已升级外投':
      return 'info';
    default:
      return 'warning';
  }
}

export function statusStyle(status: TicketStatus): { color: string; background: string } {
  const { color, bg } = STATUS_COLOR_MAP[statusTone(status)];
  return { color, background: bg };
}

export function isReviewStatus(status: TicketStatus): boolean {
  return REVIEW_STATUSES.includes(status);
}

/** 是否处在两类升级态之一（依据基线 §1：升级目标已进状态，不再靠独立字段区分） */
export function isEscalatedStatus(status: TicketStatus): boolean {
  return status === '已升级技术支持' || status === '已升级产研';
}
/** SLA 倒计时态：充足/临期/超时/暂停(挂起冻结) */
export type SlaState = 'ok' | 'soon' | 'overdue' | 'paused';

export interface Ticket {
  id: string;
  no: string;
  type: TicketType;
  channel: Channel;
  title: string;
  smartMarks: SmartMark[];
  customer: string;
  vip: boolean;
  /** 客户手机号（筛选） */
  customerPhone?: string;
  /** 设备 SN（筛选） */
  sn?: string;
  /** 业务分类（新建工单 · 工单基础） */
  businessType?: string;
  /** 工单来源（与 channel 互补，列表列展示） */
  ticketSource?: string;
  /**
   * 投诉类型（仅投诉单有值：投诉 / 举报 / 信访件 / 督办件 / 监测线索 / 监管同步 / 其他）。
   */
  complaintType?: string;
  /** 问题分类（新建工单 · 产品问题） */
  problemL1?: string;
  problemL2?: string;
  problemL3?: string;
  /** 解决时间备注 */
  resolveTimeRemark?: string;
  /** 产品分类（筛选） */
  productCategory?: string;
  /** 产品线（五级产品体系 · 查询筛选） */
  productLine?: string;
  /**
   * 业务线。列表筛选的三个维度之一（BG/BU · 业务线 · 产品线），
   * ⚠️ **mock 数据尚未落这个值**，所以「按业务线筛选」目前筛不出任何单 —— 补 mock 后即生效。
   * 早先这个字段只在 CreateTicketPrefill（建单预填）上有，筛选器却按 Ticket 取，属类型漏配。
   */
  businessLine?: string;
  /** 所属 BG（消费者BG 门控飞书项目集成通道） */
  productBg?: string;
  /** 客户身份标签，如记者/老师/校长/自媒体 */
  customerTags?: CustomerTag[];
  product: string;
  /** 问题描述（列表行速览） */
  problemDesc?: string;
  /** 最新处理结果（列表行速览） */
  latestHandling?: string;
  /** 关联售后单号（非诉转售后/建售后单后，已办行可见、可跳转） */
  linkedAftersaleNo?: string;
  /**
   * 售后转入的来源售后单（`ticketSource='售后系统'` 时有值）。
   * 与 linkedAftersaleNo 分开存：那个表示"本单已转出去、在售后手上"，会把状态压成「已转出」；
   * 这个表示"售后把球踢回客服"，本单正常在跑，1:1 关联位仍指向同一张售后单。
   */
  aftersaleOriginNo?: string;
  aftersaleOriginTitle?: string;
  /** 来源售后单当前状态（激活确认弹窗要展示） */
  aftersaleOriginStatus?: string;
  nodeStatus: NodeStatus;
  /**
   * 结案方式（基线 §1「结案方式」小节）：建单时选定、此后不可改，与工单类型正交。
   * 统计口径、SLA 计不计时、动作集宽窄都按它切，不靠状态反推。
   * 缺省（历史单）视为「正常流程」，见 resolveClosureMode。
   */
  closureMode?: ClosureMode;
  // ⚠️ 依据基线 §1（v1.13「一跳一态、一去向一态」）：
  // 原先的 escalateTarget（三线技术支持 / 产研）与 transferredToType（转单去向）
  // 已随「已升级技术支持 / 已升级产研」「已转咨询 / 已转建议 / 已转商机」进状态，
  // 两个字段随之删除 —— 同一件事不留第二个真源。
  nodeStep: number;
  nodeTotal: number;
  priority: Priority;
  /** 倒计时文本，如 "00:42:10" 或 "已暂停" */
  slaText: string;
  /** 下标，如 "距超时" / "挂起中" / "已超时" / "充足" */
  slaSub: string;
  slaState: SlaState;
  /** 处理人姓名；null = 工单池待领 */
  assignee: string | null;
  /** 距超时分钟数，用于 SLA 智能排序（超时为负） */
  slaMinutes: number;
  /** 是否已做过首次响应 */
  responded?: boolean;
  /** 未首响时：解决钟剩余文本（此时 slaText/slaState 为首响钟＝最急钟摘要）；已首响后解决钟即 slaText */
  resolveSlaText?: string;
  /** 未首响时：解决钟状态 */
  resolveSlaState?: SlaState;
  /** 首响超时后才完成 → 首响终态「未达标」（红）；缺省＝时限内达标（绿） */
  firstRespBreached?: boolean;
  /** 仅**终态**单：解决超时后才收口 → 解决终态「未达标」（红）；缺省＝达标（绿） */
  solveBreached?: boolean;
  /** 是否存在预约记录 */
  hasAppointment?: boolean;
  /** 预约倒计时文案 */
  appointmentText?: string;
  /** 我发起过升级且当前仍在我名下 */
  upgradedByMe?: boolean;
  /** 历史存在委派动作（含委派返回） */
  hasDelegateHistory?: boolean;
  /** 补充信息未知晓 */
  supplementUnread?: boolean;
  /** 催单未知晓 */
  dunningUnread?: boolean;
  /** 历史存在退回动作 */
  hasReturnAction?: boolean;
  /**
   * 调研回访中客户对**人员服务**的打分（1–5）。
   * 1–3 计为「服务不满意」（班组看板今日指标区同名卡的口径，2026-08-05 业务定）；
   * 未评价 / 未发调研为 undefined。
   */
  serviceScore?: 1 | 2 | 3 | 4 | 5;
  /** 累计退回次数（上限 3 次） */
  returnCount?: number;
  /** 我申请挂起且挂起生效 */
  suspendedByMe?: boolean;
  /** 存在催单记录（行标识「催」） */
  hasDunning?: boolean;
  /** 存在补充记录（行标识「补」） */
  hasSupplement?: boolean;
  /**
   * 该次催补之后**已对客联系**（PRD-915 补充与催单 §10.1「已联系」判据）。
   * 系统自动置位，无手动入口；缺省 undefined 视为**未联系**。
   * 它决定「催补待回」是否出列、以及关闭 / 强结是否解锁 —— 与「已知晓」（未读）是两套判据。
   */
  contactedAfterUrge?: boolean;
  /** 客户催单均已联系（false/undefined 且 hasDunning → 列表 Tag 待回强调态） */
  dunningContacted?: boolean;
  /** 客户补充均已联系（false/undefined 且 hasSupplement → 列表 Tag 待回强调态） */
  supplementContacted?: boolean;
  /** 已办：我发起过升级（已转出） */
  myUpgradeAction?: boolean;
  /** 已办：我做过转办 */
  myTransferAction?: boolean;
  /** 已办：我做过委派 */
  myDelegateAction?: boolean;
  /** 已办：我做过关闭工单 */
  myCloseAction?: boolean;
  /** 已办：我做过强结 */
  myForceCloseAction?: boolean;
  /** 历史上我处理过（已办数据域标记） */
  handledByMe?: boolean;
  /** 归属用户分组（本组工单池） */
  groupId?: string;
  /** 路由/技能分组名称（可多选，列表「分组名称」列） */
  groupNames?: string[];
  /** @/抄送 未知晓 */
  mentionUnread?: boolean;
  /** 待审核 · 送审原因（挂起送审 / 强结送审 / 关单送审） */
  reviewReason?: ReviewReason;
  tab: TabKey;
  /** 工单列表：是否已归档 */
  archived?: boolean;
  /**
   * 草稿单（建单弹窗「存草稿」的产物）。
   *
   * 草稿目前落在 `stores/ticketDrafts`、不进 `TICKETS`，所以本字段常态为空；
   * 留着是给**检索侧一个显式判据**（PRD-915 §8 规则 6「草稿不进检索结果」，C5）——
   * 草稿是"还没提交的东西"，不是工单，不该被别人搜出来。
   * 哪天草稿改成落工单表（带 `nodeStatus: '草稿'`），检索侧不用再改一次。
   */
  isDraft?: boolean;
  /** 更新时间（列表默认排序） */
  updatedAt?: string;
  /** 创建时间（排序） */
  createdAt?: string;
  /** 列表 · 是否已同步产研/飞书 */
  synced?: boolean | '是' | '否';
  /** 列表 · 产研/飞书同步状态 */
  feishuSync?: 'none' | 'failed' | 'synced' | 'feedback' | 'closed';
  /** 列表 · 上次处理人 */
  lastHandler?: string;
  /** 列表 · 上次处理时间 */
  lastHandledAt?: string;
  /** 列表 · 升级次数 */
  upgradeCount?: number;
  /** 列表 · 预约时间（展示用） */
  appointmentAt?: string;
  /** 列表 · 风险权重 0–100 */
  riskWeight?: number;
  /** 列表 · 补充信息未处理条数 */
  supplementPendingCount?: number;
  /** 列表 · 补充信息已处理条数 */
  supplementDoneCount?: number;
  /** 本单由哪张单升级而来（升级投诉派生的新单带此值，供「↑升级自」关系回溯） */
  escalatedFromNo?: string;
  /**
   * 本单**已升级为**该单——原单因升级而关闭，业务转到新单。
   * 处理页据此判定「被接管」：整页只读 + 接管横幅（PRD §5.6.3）。
   */
  escalatedToNo?: string;
}

/** 新建工单弹窗预填（子单 / reopen 场景从原单继承客户/产品/渠道等） */
export interface CreateTicketPrefill {
  /** escalate = 升级投诉·非投诉→投诉（走建单页，已知字段预填；提交即关原单 + 双向关联） */
  mode?: 'normal' | 'child' | 'reopen' | 'escalate';
  parentNo?: string;
  parentTitle?: string;
  customerName?: string;
  customerPhone?: string;
  vip?: boolean;
  product?: string;
  sn?: string;
  channel?: Channel;
  /** 列表侧工单类型（旧枚举，兼容 Mock） */
  type?: TicketType;
  /** 新建弹窗表单工单类型（投诉/建议/商机/咨询） */
  formTicketType?: CreateFormTicketType;
  priority?: Priority;
  /** 投诉类型（建单页独立可选） */
  complaintType?: string;
  /** 投诉一类 */
  complaintL1?: string;
  /** 投诉二类 */
  complaintL2?: string;
  /** 投诉平台（目标=外投时带入） */
  complaintPlatform?: string;
  /** 外部投诉编号（目标=外投时带入） */
  complaintNo?: string;
  /** 工单来源（不传则由渠道映射推导） */
  ticketSource?: TicketSource;
  businessType?: BusinessType | string;
  businessLine?: string;
  /** 问题分类三级（仅当能落在现有问题树上时才带入） */
  problemL1?: string;
  problemL2?: string;
  problemL3?: string;
  desc?: string;
  expectTime?: string;
}

// ---- 配色映射 ----
// 工作台列表：PRIORITY_COLOR、SLA_COLOR、STATUS_COLOR_MAP（状态标签）；
//   类型/客户标签一律中性灰 — 见 PRD-02 §7⑨。
export const TYPE_COLOR: Record<TicketType, string> = {
  投诉: '#EF4444',
  建议: '#10B981',
  商机: '#F59E0B',
  咨询: '#1A6FFF',
};

export const SMART_MARK_COLOR: Record<SmartMark, string> = {
  升级: '#EF4444',
  情绪: '#F97316',
  相似: '#1A6FFF',
  知识: '#10B981',
};

export const CUSTOMER_TAG_COLOR: Record<CustomerTag, string> = {
  记者: '#DC2626',
  老师: '#2563EB',
  校长: '#D97706',
  自媒体: '#9333EA',
};

/**
 * 优先级的**业务口径标签**（0803 业务确认）：P0 紧急 / P1 重要 / P2 普通加急 / P3 普通。
 * 单一真源——建单页下拉、班组看板下钻、规则引擎枚举都从这里取，避免各写一份再漂。
 */
export const PRIORITY_LABEL: Record<Priority, string> = {
  P0: '紧急',
  P1: '重要',
  P2: '普通加急',
  P3: '普通',
};

export const PRIORITY_COLOR: Record<Priority, string> = {
  P0: '#EF4444',
  P1: '#F59E0B',
  P2: '#1A6FFF',
  P3: '#9CA3AF',
};


export const SLA_COLOR: Record<SlaState, string> = {
  ok: '#10B981',
  soon: '#F59E0B',
  overdue: '#EF4444',
  paused: '#6B7280',
};

// ---- SLA 两钟归约（PRD §8.2）----

/** 是否已完成首次响应（未显式标注时：未认领 / 待响应 = 未响） */
export function isFirstResponded(t: Ticket): boolean {
  return t.responded ?? (t.nodeStatus !== '未认领' && t.nodeStatus !== '待响应');
}

/** 'HH:MM:SS' / 'HH:MM' → 分钟；非倒计时文本 → null */
function slaTextToMinutes(text: string): number | null {
  const m = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(text.trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]) + Number(m[3] ?? 0) / 60;
}

const SLA_STATE_RANK: Record<SlaState, number> = { overdue: 0, soon: 1, ok: 2, paused: 3 };

/**
 * SLA 排序键（PRD §8.2②）：每单两只对客钟（整单解决 + 整单首响）**归约取最急**——
 * 已停的钟（达标/未达标/中止）不参与；挂起单计时冻结、组置底；**终态**单无活跃钟、排最后。
 * group：0 已超时 / 1 临期 / 2 正常 / 3 挂起 / 4 终态；minutes：组内距超时分钟升序。
 */
export function slaSortKey(t: Ticket): { group: number; minutes: number } {
  if (t.slaText === '—') return { group: 4, minutes: Number.MAX_SAFE_INTEGER }; // 终态：无活跃钟
  if (t.slaState === 'paused') return { group: 3, minutes: Number.MAX_SAFE_INTEGER }; // 挂起：冻结置底
  // 活跃钟集合：扁平摘要（已响=解决钟 / 未响=首响钟）+ 未响时的解决钟独立字段
  const clocks: { state: SlaState; minutes: number }[] = [
    { state: t.slaState, minutes: t.slaMinutes },
  ];
  if (!isFirstResponded(t) && t.resolveSlaText) {
    const m = slaTextToMinutes(t.resolveSlaText);
    if (m != null) clocks.push({ state: t.resolveSlaState ?? 'ok', minutes: m });
  }
  clocks.sort((a, b) => SLA_STATE_RANK[a.state] - SLA_STATE_RANK[b.state] || a.minutes - b.minutes);
  return { group: SLA_STATE_RANK[clocks[0].state], minutes: clocks[0].minutes };
}

const SLA_PRIORITY_RANK: Record<Priority, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };

/**
 * SLA 紧急度排序（PRD §8.2②）：①状态组（两钟归约最急：超时>临期>正常>挂起>关闭）
 * ②组内距超时升序 ③优先级 P0→P3 ④创建时间早建在前。
 * 排序作用于筛选后的全量结果集，分页仅为展示切片（跨页全局有序）。
 *
 * 放在类型层（而不是工作台 composable 私有）是为了让**个人门户的「待办 Top5」复用同一函数**：
 * 口径规定门户不自建排序，那门户就不能存在第二份实现，否则两处会各自漂移。
 */
export function slaUrgencyCompare(a: Ticket, b: Ticket): number {
  const ka = slaSortKey(a);
  const kb = slaSortKey(b);
  if (ka.group !== kb.group) return ka.group - kb.group;
  if (ka.minutes !== kb.minutes) return ka.minutes - kb.minutes;
  const p = SLA_PRIORITY_RANK[a.priority] - SLA_PRIORITY_RANK[b.priority];
  if (p !== 0) return p;
  return (a.createdAt ?? '9999').localeCompare(b.createdAt ?? '9999');
}

/** 12% 透明背景（.pen 用 1F = 约 12%） */
export function softBg(hex: string): string {
  return `${hex}1F`;
}

// ---- Tab / Chip 元信息 ----
export interface TabMeta {
  key: TabKey;
  label: string;
  /** 计数徽章激活前的语义色 */
  badge: string;
}
/**
 * 主 Tab（PRD-02 + PRD-915 补充与催单）：我的任务 / 已办 / 工单池 / **催补待回** / 待审核
 *
 * ⚠️ 不含 `cc`（抄送我的）：抄送单已并入「我的任务」承接
 * （setTab 收到 cc 会改判为 mine，inListView 的「我的」视图同时收 mine 与 cc）。
 * `TabKey` 里保留 cc 供那几处历史分支使用，但它**不是一个 Tab**，
 * 角色配置的 hiddenTabs 里不要再写它 —— 过滤的是这个数组，写了也过滤不到东西。
 */
export const TABS: TabMeta[] = [
  { key: 'mine', label: '我的任务', badge: '#1A6FFF' },
  { key: 'done', label: '已办', badge: '#9CA3AF' },
  { key: 'pool', label: '工单池', badge: '#06B6D4' },
  { key: 'poolPending', label: '催补待回', badge: '#6366F1' },
  { key: 'review', label: '待审核', badge: '#F59E0B' },
];

/** 本组列表域与催补待回列表域（批量领取 / 结构化筛选 variant 等共用 pool 口径） */
export function isPoolFamily(tab: TabKey): boolean {
  return tab === 'pool' || tab === 'poolPending';
}

/**
 * 工作台主 Tab：支持快捷搜索 + 结构化筛选（与「待领取」同套工具栏）。
 */
export function isWorkbenchSearchTab(tab: TabKey): boolean {
  return tab === 'mine' || tab === 'done' || tab === 'pool' || tab === 'poolPending';
}

export interface ListViewMeta {
  key: ListViewKey;
  label: string;
}
/** 工作台多视图（我的/本组/工单池等）；全量工单列表页不使用，仅筛选器查询 */
export const LIST_VIEWS: ListViewMeta[] = [
  { key: 'all', label: '全部' },
  { key: 'mine', label: '我的' },
  { key: 'team', label: '本组' },
  { key: 'pool', label: '工单池' },
  { key: 'archived', label: '已归档' },
];

/** 工单列表视图范围 */
export function inListView(t: Ticket, view: ListViewKey): boolean {
  if (view === 'archived') return !!t.archived;
  if (t.archived) return false;
  switch (view) {
    case 'all':
      return true;
    case 'mine':
      return t.tab === 'mine' || t.tab === 'cc';
    case 'team':
      return t.tab === 'done' || t.tab === 'review';
    case 'pool':
      return t.tab === 'pool';
    default:
      return true;
  }
}

export interface ChipMeta {
  /** 内置 chip 或已保存筛选器 `sf:{id}` */
  key: ChipKey | string;
  label: string;
  /** hover 说明（如催补待回子筛选的可重叠计数） */
  title?: string;
  /** 临期/超时为 SLA 维度，唯一保留彩色（临期=warn 橙 / 超时=danger 红）；其余为状态分类，中性。见 PRD-02 §7⑨ */
  tone?: 'warn' | 'danger';
}

/** 我的任务 · 子筛选 chips（PRD-02 v1.2 §7②） */
export const MINE_CHIPS: ChipMeta[] = [
  { key: 'all', label: '全部' },
  { key: 'unresponded', label: '待响应' },
  { key: 'processing', label: '处理中' },
  { key: 'appointment', label: '预约' },
  { key: 'myUpgrade', label: '已升级' },
  { key: 'delegate', label: '委派' },
  { key: 'supplement', label: '新补充' },
  { key: 'dunning', label: '被催办' },
  { key: 'returned', label: '被退回' },
  { key: 'suspended', label: '已挂起' },
  { key: 'soon', label: '临期', tone: 'warn' },
  { key: 'overdue', label: '已超时', tone: 'danger' },
];

/** 已办 · 子筛选 chips（PRD-02 v1.2 §7④） */
export const DONE_CHIPS: ChipMeta[] = [
  { key: 'all', label: '全部' },
  { key: 'myUpgrade', label: '已升级' },
  { key: 'transfer', label: '调剂' },
  { key: 'delegate', label: '委派' },
  // 判据是**我做过「关闭工单」这个动作**（myCloseAction），不是按状态筛；
  // 该动作审批通过后落的子状态恰好同名（基线 §1「已关闭」＝友好沟通后关闭）。
  { key: 'closed', label: '已关闭' },
  { key: 'forceClose', label: '强结' },
];

/** @我的工单 · 子筛选 chips（PRD-02 v1.2 §7⑥） */
export const MENTION_CHIPS: ChipMeta[] = [
  { key: 'all', label: '全部' },
  { key: 'unread', label: '未知晓' },
];

/** 待审核 · 子筛选 chips（按送审原因） */
export const REVIEW_CHIPS: ChipMeta[] = [
  { key: 'all', label: '全部' },
  { key: 'suspendReview', label: '挂起送审' },
  { key: 'forceCloseReview', label: '强结送审' },
  { key: 'closeReview', label: '关单送审' },
];

/** 本组 · 催补待回 · 子筛选（PRD-915 补充与催单 §9.3：同一张单两类都有则两处都计） */
export const POOL_PENDING_CHIPS: ChipMeta[] = [
  { key: 'all', label: '全部', title: '本组待联系回话的工单总数' },
  { key: 'dunning', label: '被催办', title: '含仅被催办与「催+补兼有」；与「新补充」可重叠，故不与全部简单相加' },
  { key: 'supplement', label: '新补充', title: '含仅新补充与「催+补兼有」；与「被催办」可重叠，故不与全部简单相加' },
];

/** @deprecated 使用 REVIEW_CHIPS / chipsForTab */
export const LEGACY_CHIPS = REVIEW_CHIPS;

/** @deprecated 使用 chipsForTab */
export const CHIPS = REVIEW_CHIPS;

/** 本组工单池 · 用户分组（原型 Mock，对齐 BPM 用户分组） */
export interface PoolGroupMeta {
  id: string;
  label: string;
}

export const POOL_GROUPS: PoolGroupMeta[] = [
  { id: 'line1', label: '一线客服组' },
  { id: 'line2', label: '二线技术支持组' },
  { id: 'hardware', label: '硬件缺陷组' },
];

/** 列表「分组名称」列：优先 groupNames，否则按业务线+工单类型推断 */
export function resolveTicketGroupNames(t: Ticket): string[] {
  if (t.groupNames?.length) return t.groupNames;
  const names: string[] = [];
  const biz = t.businessType?.trim();
  if (biz) {
    const typeSuffix: Record<TicketType, string> = {
      咨询: '咨询',
      投诉: '投诉',
      建议: '建议',
      商机: '商机',
    };
    names.push(`${biz}${typeSuffix[t.type] ?? t.type}`);
  }
  if (isEscalatedStatus(t.nodeStatus) || t.smartMarks?.includes('升级')) {
    if (!names.includes('技术支持')) names.push('技术支持');
  }
  return names;
}

export type PoolGroupFilterKey = 'all' | string;

export function chipsForTab(tab: TabKey): ChipMeta[] {
  if (tab === 'mine') return MINE_CHIPS;
  if (tab === 'done') return DONE_CHIPS;
  if (tab === 'pool') return [];
  if (tab === 'poolPending') return POOL_PENDING_CHIPS;
  if (tab === 'cc') return MENTION_CHIPS;
  if (tab === 'review') return REVIEW_CHIPS;
  return [];
}

/** 我的任务数据域：当前处理人=我 且未归档 */
export function inMineTaskScope(t: Ticket, handler = WORKBENCH_HANDLER): boolean {
  return t.tab === 'mine' && t.assignee === handler && !t.archived;
}

/**
 * 「催补待回」父域（PRD-915 补充与催单 §9.3）：
 *   本组可见 ∧ **未结案** ∧ 有**客户侧**催补 ∧ **未联系**
 *
 * 三条要点：
 * 1. **只数客户侧** —— 我方在处理表单「处理记录」区写、靠「保存」落库的留痕
 *    不置 hasDunning / hasSupplement，进不来。
 * 2. **出列判据是"已联系"，不是"已读"** —— 坐席点开看过不算，必须有该次催补之后的联系记录。
 *    列表侧没有逐条记录，用 `dunningUnread / supplementUnread` 之外的
 *    `contactedAfterUrge` 标记；缺省（undefined）视为**未联系**（更安全：宁可多留一行）。
 * 3. **工单维度去重** —— 同一张单被催 3 次也只出 1 行（本函数按单判，天然去重）。
 *
 * ⚠️ 与「我的任务·被催办 / 新补充」chip 不是一套：那个是**我名下** + **知晓**判据。
 */
export function inPoolPendingScope(t: Ticket, visibleGroupIds?: string[]): boolean {
  if (t.archived) return false;
  if (isTicketClosed(t.nodeStatus)) return false;
  if (!t.hasDunning && !t.hasSupplement) return false;
  if (t.contactedAfterUrge) return false;
  // 本组可见：本组池内的单（无处理人）与本组成员名下的单都算「本组」。
  // **fail-closed**：给了可见分组就必须命中；没给（undefined / 空数组）也不放行 —— 数据范围
  // 未配置时应当看不到，不是全看到。单缺 groupId 时同样不放行，与 inGroupPoolScope() 的
  // 演示态兜底不同：那个 Tab 靠它显示 3 张缺组的 mock 单，这个 Tab 不依赖。
  if (!visibleGroupIds?.length) return false;
  if (!t.groupId || !visibleGroupIds.includes(t.groupId)) return false;
  return true;
}

/**
 * 终态判定（催补待回只收未结案的单）。
 * 终态集＝基线 §1 里状态分组为「终态」的**十个**子状态：
 * 已结案 / 已关闭 / 已强结 / 已升级投诉 / 已升级外投 /
 * 已转咨询 / 已转建议 / 已转商机 / 已取消 / 直接结案。
 */
export function isTicketClosed(status: TicketStatus): boolean {
  return STATUS_GROUP[status] === '终态';
}

/**
 * 钟已停、`nodeStatus` 却还停在在办态的单（工单数据源的已知问题），按它做过的动作
 * 反推该落哪个**终态子状态**。判据顺序即业务优先级。
 *
 * 兜底给「已结案」而不是「直接结案」——基线「结案方式」小节把「直接结案」限定为
 * 建单即结案、从未进流程的单；这里的单都跑过流程，属正常流程。
 *
 * 单一实现：处理页详情与客户洞察履历都用它，别各自反推一遍，否则两处会漂。
 */
export function resolveStoppedClockStatus(t: Ticket): TicketStatus {
  // 因升级投诉而关闭：原单落升阶终态。**哪一跳看原单自己是不是外投**（基线 §1）——
  // 内投单再升一级只能升外投（第二跳），非投诉单升上来的是第一跳。
  if (t.escalatedToNo) return t.ticketSource === '外投渠道' ? '已升级外投' : '已升级投诉';
  if (t.myForceCloseAction) return '已强结';
  // 「关闭工单」审批通过 → 「已关闭」（基线 §1 该行）
  if (t.myCloseAction) return '已关闭';
  return isDirectClosure(t.closureMode) ? '直接结案' : '已结案';
}

/**
 * 工单操作页**头部整排按钮**的角色门控 —— 取自基线「动作 × 角色 × 工单类型」表。
 *
 * 一次给全五枚，别一枚一枚判：之前只补了催补两枚，结果
 * 「取消工单」在二线视角照样出现（它是**一线专属**）、「新建补充」又漏给了二线。
 *
 * 判据只认 `roleKey`。此前一线额外传一个 `isFrontline` 布尔，值取自工单上的
 * `frontlineDemo` 假字段——那让带该标记的单对**所有角色**都走一线分支，
 * 门控形同虚设。一线已有 RoleKey `agent-l1`，参数随之去掉（2026-08-19）。
 */
export function headerActionsByRole(roleKey: string): {
  escalateComplaint: boolean;
  linkAftersale: boolean;
  supplement: boolean;
  dunning: boolean;
  cancelTicket: boolean;
} {
  // 取值逐格对齐基线 §4（v1.17，R13 B 组 12 格已全部采纳 0830）：
  //   升级投诉 = 一线 + 二线专员 + 技术支持 + 二线班组长 + 客诉专员 + 投诉督导 + 管理员
  //   新建补充 = 同上（※21a 2026-08-26 放开）
  //   关联售后 = 上面这组**去掉一线**（※12a：建不建售后单由二线判断，一线转二线后由二线关联）
  //   催单 / 取消工单 = 一线唯一
  // 工单运营与质检两行全部不展示（前者不办单，后者纯只读）。
  const canWorkTicket = !['ops-monitor', 'qa'].includes(roleKey);
  const isL1 = roleKey === 'agent-l1';
  return {
    escalateComplaint: canWorkTicket,
    // 投诉单上一线另按阶层置灰（※8），那是类型门控、不在本函数
    linkAftersale: canWorkTicket && !isL1,
    supplement: canWorkTicket,
    dunning: isL1,
    cancelTicket: isL1,
  };
}

/**
 * 催补两枚按钮在该状态下的可用性（PRD-915 补充与催单 §4.2 全状态表的收口）。
 * 角色门控与本函数**同时生效**，任一不通过即不展示。
 *
 * 三类（依据基线 §1 状态拆细后逐个子状态铺开）：
 * - 全给：非终态且非已转出（未认领 / 待响应 / 处理中 / 已退回 / 调研中 / 审核中4态 /
 *   已挂起 / 已升级技术支持 / 已升级产研 / 已委派）
 * - 只给补充：**8 个终态**（已结案 / 已关闭 / 已强结 / 已转咨询 / 已转建议 / 已转商机 /
 *   已升级投诉 / 已升级外投）—— 客户催的是已收口的事，没有承接对象；
 *   转单与升阶两态的补充跳子单（基线 ※23）
 * - 都不给：**草稿**（只有新建相关操作）、**已转出**（客服侧冻结，去售后系统）、
 *           **直接结案**（建单即结案的一次性单，没有接着办的余地，基线 ※25）、
 *           **已取消**（业务中止）
 */
const CS_ENTRY_NONE: TicketStatus[] = ['草稿', '已转出', '直接结案', '已取消'];
const CS_ENTRY_SUPPLEMENT_ONLY: TicketStatus[] = [
  '已结案', '已关闭', '已强结',
  '已转咨询', '已转建议', '已转商机',
  '已升级投诉', '已升级外投',
];

export function csEntryAvailability(status: TicketStatus): {
  supplement: boolean;
  dunning: boolean;
} {
  if (CS_ENTRY_NONE.includes(status)) {
    return { supplement: false, dunning: false };
  }
  if (CS_ENTRY_SUPPLEMENT_ONLY.includes(status)) {
    return { supplement: true, dunning: false };
  }
  return { supplement: true, dunning: true };
}

/**
 * 收到客户催补时是否要**拉回处理节点**，以及拉回后落到哪（PRD-915 补充与催单 §7.2、基线 ※20）。
 * 返回 null = 不拉回。
 *
 * 拉回 ＝ 系统替坐席执行一次「撤回」：客户补了新信息或催了单，原来那次下送 / 申请的
 * 前提已经变了，不该继续跑。
 * **两个已升级态 / 已委派 / 已转出不拉回** —— 调研回访是系统服务、撤回没代价；三线是人、正在
 * 查问题，拉回等于让人白干；已转出的单根本不在客服侧。
 */
export function pullbackOnCsEvent(status: TicketStatus): { to: TicketStatus; why: string } | null {
  if (status === '调研中') return { to: '处理中', why: '因客户催补，自动撤回本次下送' };
  if (['申请挂起中', '申请关闭中', '申请强结中', '业务动作审核中'].includes(status)) {
    return { to: '处理中', why: '因客户催补，自动撤回本次申请' };
  }
  if (status === '已挂起') return { to: '处理中', why: '因客户催补，自动解除挂起' };
  return null;
}

/**
 * 本组工单池数据域：待领取/未分配 且归属可见分组。
 *
 * **数据范围一律 fail-closed**：没给可见分组就是看不到，不是全看到。
 * 角色管理里新建角色默认无任何权限，这里放开等于"没配数据范围＝全租户可见"。
 *
 * ⚠️ 单缺 `groupId` 时仍返回 true，是**演示态的有意兜底**：mock 里有 3 张池内单
 * （IFLYSJ-20260609-00004 / 66248 / 66510）没有归属组，收紧会让它们从「本组 · 待领取」
 * 静默消失。正确的修法在数据侧 —— 池内单必须有归属组才能被领取。接真实数据前
 * 把这一行也改成 `return false`。
 */
export function inGroupPoolScope(t: Ticket, visibleGroupIds?: string[]): boolean {
  if (t.tab !== 'pool' || t.assignee !== null || t.archived) return false;
  // ⚠️ **全库仅剩的一处 fail-open，只为演示态存在**：mock 里有 3 张没有 groupId 的池内单，
  // 靠这一行才显示得出来。**真实环境必须把它改成 `return false`** ——
  // 缺组的单落进任何人的组池视图都是越权，而池内单是"谁看得到谁就能领"。
  // 姊妹函数 inPoolPendingScope() 已是 fail-closed，两者不一致是有意的，别照着这里改那边。
  if (!t.groupId) return true;
  // 数据范围未配置（undefined / 空数组）时不放行 —— 没配范围应当看不到，不是全看到。
  if (!visibleGroupIds || visibleGroupIds.length === 0) return false;
  return visibleGroupIds.includes(t.groupId);
}

export function matchPoolGroup(t: Ticket, group: PoolGroupFilterKey): boolean {
  if (group === 'all') return true;
  return t.groupId === group;
}

/**
 * 是否进**检索结果**（查询中心 · 查工单）。
 *
 * 两条排除（PRD-915 §3.6 E16 + §8 规则 6）：
 * - **已归档**：`archived` 的单不进结果（E16）；
 * - **草稿**：还没提交的东西不是工单，不该被别人搜出来（C5）。判两处——
 *   显式的 `isDraft` 标记，以及落库子状态「草稿」，哪个先落地都拦得住。
 *
 * 与工作台的 `inMineTaskScope` / `inGroupPoolScope` 是**两套数据域**，别互相复用：
 * 查工单是**全租户**、工作台是**本人 + 本组池**（PRD-915 §3.3，C3）。
 */
export function isSearchableTicket(t: Ticket): boolean {
  return !t.archived && !t.isDraft && t.nodeStatus !== '草稿';
}

/** @我的工单数据域：抄送/@ 列表包含我 */
export function inMentionScope(t: Ticket): boolean {
  return t.tab === 'cc' && !t.archived;
}

export function isMentionUnread(t: Ticket): boolean {
  return t.mentionUnread !== false;
}

/** 已办数据域：当前处理人≠我 且历史上我处理过 且未归档 */
export function inDoneScope(t: Ticket, handler = WORKBENCH_HANDLER): boolean {
  return (
    t.tab === 'done'
    && t.assignee !== handler
    && t.assignee !== null
    && !t.archived
    && t.handledByMe !== false
  );
}

/** 本组工单池 · 行内动作（PRD-02 v1.2：领取） */
export function poolRowActions(): { label: string; primary?: boolean }[] {
  return [{ label: '领取', primary: true }];
}

/** @我的工单 · 行内动作（PRD-02 v1.2：仅双击进详情） */
export function mentionRowActions(): { label: string; primary?: boolean }[] {
  return [];
}

/** 已办 · 行内动作（PRD-02 v1.2：仅双击进详情，无行内按钮） */
export function doneRowActions(): { label: string; primary?: boolean }[] {
  return [];
}

/** 我的任务 · 行内动作（PRD-02 v1.2：转办 / 退回） */
export function mineRowActions(): { label: string; primary?: boolean }[] {
  return [
    { label: '调剂', primary: true },
    { label: '退回' },
  ];
}

/** 行内动作：按基线状态 + Tab 推导（PRD-02 §7⑥） */
export function rowActions(t: Ticket): { label: string; primary?: boolean }[] {
  if (t.tab === 'pool') return poolRowActions();
  switch (t.nodeStatus) {
    case '未认领':
      return [{ label: '受理', primary: true }, { label: '调剂' }];
    case '待响应':
    case '处理中':
    case '已退回':
      return [{ label: '处理', primary: true }, { label: '调剂' }, { label: '挂起' }];
    // 「退回」是三线技术支持专属（基线 §1 ※14b：已升级产研不展示退回）
    case '已升级技术支持':
      return [{ label: '处理', primary: true }, { label: '退回' }];
    case '已升级产研':
      return [{ label: '处理', primary: true }, { label: '详情' }];
    case '已挂起':
      return [{ label: '恢复', primary: true }, { label: '详情' }];
    case '申请挂起中':
    case '申请关闭中':
    case '申请强结中':
    case '业务动作审核中':
      return [{ label: '审核', primary: true }, { label: '详情' }];
    default:
      return [{ label: '详情', primary: true }];
  }
}

/** 我的任务 chip 是否命中 */
export function matchMineChip(t: Ticket, chip: MineChipKey): boolean {
  switch (chip) {
    case 'all':
      return true;
    case 'unresponded':
      return !t.responded;
    case 'processing':
      return !!t.responded;
    case 'appointment':
      return !!t.hasAppointment;
    case 'myUpgrade':
      return !!t.upgradedByMe;
    case 'delegate':
      return !!t.hasDelegateHistory;
    case 'supplement':
      return !!t.supplementUnread;
    case 'dunning':
      return !!t.dunningUnread;
    case 'returned':
      return !!t.hasReturnAction;
    case 'suspended':
      return !!t.suspendedByMe;
    case 'soon':
      return t.slaState === 'soon';
    case 'overdue':
      return t.slaState === 'overdue';
    default:
      return true;
  }
}

/** 已办 chip 是否命中 */
export function matchDoneChip(t: Ticket, chip: DoneChipKey): boolean {
  switch (chip) {
    case 'all':
      return true;
    case 'myUpgrade':
      return !!t.myUpgradeAction;
    case 'transfer':
      return !!t.myTransferAction;
    case 'delegate':
      return !!t.myDelegateAction;
    case 'closed':
      return !!t.myCloseAction;
    case 'forceClose':
      return !!t.myForceCloseAction;
    default:
      return true;
  }
}

/** @我的工单 chip 是否命中 */
export function matchMentionChip(t: Ticket, chip: MentionChipKey): boolean {
  switch (chip) {
    case 'all':
      return true;
    case 'unread':
      return isMentionUnread(t);
    default:
      return true;
  }
}

/** 待审核 chip 是否命中 */
export function matchReviewChip(t: Ticket, chip: ReviewChipKey): boolean {
  switch (chip) {
    case 'all':
      return true;
    case 'suspendReview':
      return t.reviewReason === '挂起送审';
    case 'forceCloseReview':
      return t.reviewReason === '强结送审';
    case 'closeReview':
      return t.reviewReason === '关单送审';
    default:
      return true;
  }
}

/** 本组 · 催补待回 chip 是否命中（PRD-915 补充与催单 §9.3） */
export function matchPoolPendingChip(t: Ticket, chip: PoolPendingChipKey): boolean {
  switch (chip) {
    case 'all':
      return true;
    case 'dunning':
      return !!t.hasDunning;
    case 'supplement':
      return !!t.hasSupplement;
    default:
      return true;
  }
}

/** chip 是否命中某工单（与 Tab 叠加） */
export function matchChip(t: Ticket, chip: ChipKey, tab: TabKey = 'mine'): boolean {
  if (tab === 'mine') {
    return matchMineChip(t, chip as MineChipKey);
  }
  if (tab === 'done') {
    return matchDoneChip(t, chip as DoneChipKey);
  }
  if (tab === 'poolPending') {
    return matchPoolPendingChip(t, chip as PoolPendingChipKey);
  }
  if (tab === 'cc') {
    return matchMentionChip(t, chip as MentionChipKey);
  }
  if (tab === 'review') {
    return matchReviewChip(t, chip as ReviewChipKey);
  }
  return true;
}

/**
 * 列表「被催办」Tag 是否待回强调态。
 * **已知晓或已联系，任一即转降噪灰**（PRD-915 补充与催单 §9.2）——
 * 与「催补待回出列」不同，那个**只认已联系**（§10.1）。
 */
export function isDunningTagPending(t: Ticket): boolean {
  return !!t.hasDunning && t.dunningContacted !== true && t.dunningUnread !== false;
}

/** 列表「新补充」Tag 是否待回强调态（口径同上） */
export function isSupplementTagPending(t: Ticket): boolean {
  return !!t.hasSupplement && t.supplementContacted !== true && t.supplementUnread !== false;
}
