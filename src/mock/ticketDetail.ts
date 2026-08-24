import type {
  AgentInfo, AiTicketInsight, AppointmentRecord, ComplaintInfo, ContactItem, InsightStats,
  InsightDetailTable, InsightModalKey, LatestHandlingItem,
} from '@/views/tickets/types/operation';
import type { TimelineEntry } from '@/views/tickets/types/ticketDetail';
import type { ClosureMode, EscalateTarget } from '@/views/tickets/types/ticket';

// 工单操作页 Mock（样例 = 设计稿 LCMN-20260610-73026 · P-工单处理 定稿）。

export interface ChildTicket {
  no: string;
  title: string;
  time: string;
  typeTag: string;
  statusTag: string;
  typeColor: string;
  statusColor: string;
}

export interface LinkedRecord {
  no: string;
  title: string;
  tag: string;
  meta: string;
}

export interface SimilarTicket {
  no: string;
  title: string;
  similarity: string;
  solution: string;
}

/**
 * SLA 时效钟生命周期：
 * running 计时中（随真实时间每秒递减；由剩余秒派生 正常绿/临期橙/超时红）
 * paused  暂停（挂起·灰·计时冻结、剩余保留、可恢复续算）
 * stopped 停表终止（结案/关闭/取消·深灰·计时永久结束、不可重启）
 */
export type SlaClockPhase = 'running' | 'paused' | 'stopped';

export interface SlaClock {
  /** 时效名称，如 节点·处理 / 整单解决 / 首响 / 回访 */
  label: string;
  /** 钟类型：node=节点 / whole=整单 / first=首响 / callback=回访 */
  kind: 'node' | 'whole' | 'first' | 'callback';
  /** 生命周期：running 时随真实时间递减；paused/stopped 冻结 */
  phase: SlaClockPhase;
  /** 剩余秒（负值=已超时秒数）；phase=running 时每秒 -1 */
  remainSec: number;
  /** 该时效总时长秒（进度条 = (total-remain)/total） */
  totalSec: number;
  /** 临期阈值秒：剩余 ≤ 此值 → 临期(橙) */
  warnSec: number;
  /** 绝对截止时刻（展示用），如 今日 14:30 */
  dueBy: string;
  /** 实际关钟时间，供处理履历展示 */
  closedAt?: string;
  /** 节点截止在整单时间轴上的位置占比（0-100），仅 kind=whole 时用于嵌套 tick */
  nodePctOnWhole?: number;
  /**
   * 提交审核/调研的时刻（毫秒，仅解决钟）。下送提交时记录并冻结显示；
   * 审核通过→停表达标；审核驳回/退回→按「已过审核时长」扣减剩余后续走
   * （**审批/调研时间计入 SLA**，不因走审核而免除这段耗时）。
   */
  reviewSubmitAtMs?: number;
  /**
   * 停表结果（仅 phase=stopped）：met=达标(时限内完成·绿✓) /
   * breached=未达标(超时后终止·红) / void=中止(取消等·灰)。
   * 缺省时按剩余秒推断（≥0 达标、<0 未达标）。
   */
  stopOutcome?: 'met' | 'breached' | 'void';
}

export interface TicketDetailMeta {
  no: string;
  title: string;
  type: string;
  channel: string;
  priority: string;
  status: string;
  /**
   * 升级目标（仅 status ＝「已升级」时有值）。基线只有一个「已升级」状态，
   * 三线技术支持与产研的差别（处理人转不转、催补通知发给谁、能不能点「退回」）
   * 由本字段承担，不靠拆状态名。
   */
  escalateTarget?: EscalateTarget;
  /**
   * 结案方式（基线 §1「结案方式」小节）：建单时选定、此后不可改，与工单类型正交。
   * 决定底栏动作集宽窄（直接结案＝不下送、不升级、不挂起、不转派），
   * 也决定这张单走完流程后落「已解决」还是建单即落「已结案」。
   * 缺省视为「正常流程」，见 resolveClosureMode。
   */
  closureMode?: ClosureMode;
  /** 累计退回次数（上限 3 次） */
  returnCount?: number;
  /** 当前活跃的 SLA 时效钟（按"最快到期"排序，最紧急置顶） */
  slaClocks: SlaClock[];
  builder: string;
  builderShort: string;
  source: string;
  createdAt: string;
  createdAtFull: string;
  businessType: string;
  businessLine: string;
  issueOccurredAt: string;
  expectedResolve: string;
  /** 产品&问题（产品分类路径 + 问题分类路径，对齐参考稿 desc-box） */
  productIssue: string;
  demand: string;
  attachments: string[];
  isExternalAppeal: boolean;
  insight: InsightStats;
  /** 统计宫格弹窗下钻明细 */
  insightDetails: Record<InsightModalKey, InsightDetailTable>;
  /** 顶部「最新处理」聚合 */
  latestHandling: LatestHandlingItem[];
  customer: {
    name: string;
    types: string[];
    gender: string;
    contacts: ContactItem[];
    region: string;
    address: string;
  };
  agent: AgentInfo | null;
  product: {
    category: string;
    name: string;
    tags: string[];
    sn: string;
    issueTags: string[];
    /**
     * 产品是否有售后服务。false ⇒「转售后」**置灰 + 提示**（基线 ※12，不是隐藏）。
     * 取值由产品名判定，见 productHasAfterSaleService。
     */
    afterSaleEnabled: boolean;
  };
  complaint: ComplaintInfo;
  childTickets: ChildTicket[];
  linkedRecords: LinkedRecord[];
  similarTicket: SimilarTicket;
  knowledge: string[];
  aiSummary: string;
  /** 客户全景下方 AI 洞察 */
  aiInsight: AiTicketInsight;
  /** 所属 BG（消费者BG 门控飞书项目集成通道） */
  productBg?: string;
  /**
   * 本单正从属跟跑于哪张单（升级后原单不关、跟着新单跑的场景）。
   * 有值＝已在从属跟跑，**不可再发起升级投诉**（PRD §4.2.1 门禁②）。
   * 「跟跑 vs 关闭原单」本身仍待拍板，字段先留出判据位。
   */
  followingNo?: string;
  /** 本单由哪张单升级而来（「↑升级自」方向，供关系呈现回溯来源） */
  escalatedFromNo?: string;
  /** 飞书关联进度：none 还没转过 / failed 转飞书失败 / synced 已建好单 / feedback 已回进展 / closed 已结案 */
  feishuSync?: FeishuSyncState;
  /** 产研反馈单号（关联成功后） */
  feishuFeedbackNo?: string;
  /** 关联失败原因（failed 时） */
  feishuFailReason?: string;
  /** 「产研反馈」Tab 时间线（建关联 / 关联失败 / 预反馈 / 关单 / 二次激活） */
  feishuRecords?: FeishuRecord[];
  /** 1:1 活跃关联售后单（转售后/关联售后后回传，客服侧松耦合展示，详情走深链） */
  linkedAftersale?: LinkedAftersale;
  /**
   * 委派中：把单子交给他人先处理、处理完回到本节点。
   * 期间锁定「下送/委派/调剂/关闭工单/强结」等流转与终结类动作，协办完成或撤销后解锁。
   */
  delegateInfo?: DelegateInfo | null;
}

/** 委派中信息（协办完成或撤销委派后清空） */
export interface DelegateInfo {
  mode: 'person' | 'group';
  /** 协办人姓名（多人顿号拼接）或协办组名 */
  targets: string;
  operator: string;
  at: string;
}

/** 关联售后单（松耦合：少量字段进卡片，完整详情走深链跳转，D6） */
export interface LinkedAftersale {
  /** 售后工单号（=关联ID） */
  no: string;
  /** 售后单标题。售后转入的原单要在激活确认弹窗里认人，只有单号认不出是哪一单 */
  title?: string;
  /** 售后状态（待接单/处理中/已完成…） */
  status: string;
  /** 售后服务类型（维修/投诉/咨询/安装/展示样机拆装） */
  serviceType: string;
  /** 售后服务方式（上门/寄修/送修/沟通调解） */
  serviceMethod?: string;
  /** 创建时间 */
  createdAt: string;
  /**
   * 是否投诉工单转出。两条分支都不关原单，差别在客服侧还能不能动：
   * 投诉=状态不变、照常处理、与售后分别结案（该售后单禁止转非售后，D12）；
   * 非诉=原单进「已转出」冻结，等售后回传终态（D11）。
   */
  fromComplaint?: boolean;
}

/** 飞书关联进度（与 PRD §3.2 feishuSync 一致） */
export type FeishuSyncState = 'none' | 'failed' | 'synced' | 'feedback' | 'closed';

/** 「产研反馈」Tab 时间线一条 */
export interface FeishuRecord {
  id: string;
  /** push=建关联 / fail=关联失败 / feedback=预反馈 / result=关单 / activate=二次激活 / dunning=可选催单提醒 */
  kind: 'push' | 'fail' | 'feedback' | 'result' | 'activate' | 'dunning';
  title: string;
  content: string;
  /** 操作方名称 */
  who: string;
  /** 记录来源侧：客服工单 / 产研侧 */
  side: '客服工单' | '产研侧';
  when: string;
  /** 反馈单号 / 负责人 / 状态等元信息 */
  meta?: string;
  /** 结构化结论字段（用于信息板「产研结论」摘要卡，避免关键信息散落在 content 文本里） */
  /** 问题原因（预反馈/关单回传） */
  cause?: string;
  /** 处理结果 / 解决方案 */
  result?: string;
  /** 处理结论（如 已解决 · 待用户验证） */
  conclusion?: string;
  /** 计划解决日期 */
  planDate?: string;
}

/**
 * 无售后服务的产品：纯软件 / 平台 / 权益类，没有实物可修可寄，售后侧接不了单。
 *
 * 基线 ※12「转售后另有一条拦截：该产品必须有售后服务」需要有反例才验得到。
 * 此前 product.afterSaleEnabled 在整份 mock 里恒为 true，那条拦截分支从未被触发，
 * 等于没实现也看不出来。这三个产品名在工单数据源里都有咨询 / 商机单挂着
 * （企业版 / 开放平台 / 会员服务），切到那些单即可看到「转售后」置灰并出提示。
 */
export const PRODUCTS_WITHOUT_AFTERSALE = ['企业版', '开放平台', '会员服务'];

/** 产品有无售后服务（基线 ※12 的拦截判据，维度＝工单数据） */
export function productHasAfterSaleService(productName?: string): boolean {
  return !PRODUCTS_WITHOUT_AFTERSALE.includes((productName ?? '').trim());
}

export const TICKET_DETAIL: TicketDetailMeta = {
  no: 'LCMN-20260610-73026',
  title: '无线音乐播放跳过歌曲异常',
  type: '投诉',
  channel: '在线客服',
  priority: 'P0',
  status: '处理中',
  slaClocks: [
    {
      label: '整单解决',
      kind: 'whole',
      phase: 'running',
      remainSec: 9615, // 02:40:15
      totalSec: 17280, // 整单解决时限 4.8h
      warnSec: 1800, // 剩 ≤30min 临期
      dueBy: '今日 16:40',
      nodePctOnWhole: 71,
    },
    {
      label: '整单首响',
      kind: 'first',
      phase: 'running',
      remainSec: 733, // 00:12:13
      totalSec: 1800, // 整单首响时限 30min
      warnSec: 900, // 剩 ≤15min 临期
      dueBy: '今日 14:30',
    },
  ],
  builder: '李一线（一线坐席）',
  builderShort: '李一线',
  source: '外投渠道',
  createdAt: '今天 09:10',
  createdAtFull: '2026-05-01 16:40',
  businessType: '学习机',
  businessLine: '学习机业务线',
  issueOccurredAt: '2026-06-18 14:30',
  expectedResolve: '今日 18:00',
  productIssue: '智能音箱系列-讯飞X1音箱-功能异常/在线播放/歌曲跳过',
  demand:
    '使用无线音箱播放在线音乐时，频繁出现自动跳过当前歌曲的情况，重启后仍复现，影响正常使用，要求尽快解决。',
  attachments: ['故障录屏.mp4', '设置截图.png'],
  isExternalAppeal: true,
  insight: {
    contactCount: 12,
    historyCount: 12,
    complaintCount: 1,
    sameTypeCount: 1,
    recent30Count: 30,
    dunningCount: 1,
    supplementCount: 3,
    relatedCount: 10,
  },
  insightDetails: {
    contact: {
      title: '联系明细',
      columns: ['联系方式', '联系时间', '结束时间', '接线坐席', '呼入类型', '产品分类', '产品型号', '小结'],
      rows: [
        { cells: ['热线-呼入', '2026-06-18 09:23:15', '2026-06-18 09:28:57', '张晓芸', '咨询', '智能键盘', '讯飞智能键盘K710', '客户咨询维修进度，告知预计 3 个工作日完成'] },
        { cells: ['在线', '2026-06-18 09:30:12', '2026-06-18 09:38:32', '刘洋', '咨询', '智能键盘', '讯飞智能键盘K710', '客户问询备件库存，确认可现场更换'] },
        { cells: ['热线-呼入', '2026-06-17 16:20:18', '2026-06-17 16:23:36', '陈伟', '报修', '智能键盘', '讯飞智能键盘K710', '确认故障现象，预约上门时间'] },
        { cells: ['在线', '2026-06-17 15:45:00', '2026-06-17 15:57:05', '刘洋', '报修', '智能键盘', '讯飞智能键盘K710', '客户描述故障并上传照片，初步判定屏幕组件故障'] },
        { cells: ['热线-呼出', '2026-06-17 14:02:08', '2026-06-17 14:04:23', '王芳', '咨询', '智能键盘', '讯飞智能键盘K710', '一线外呼确认上门地址，客户确认无误'] },
        { cells: ['热线-呼入', '2026-05-12 14:08:50', '2026-05-12 14:11:26', '李娜', '投诉', '智能鼠标', '讯飞智能鼠标M310', '客户投诉鼠标滚轮失灵，转售后处理'] },
        { cells: ['在线', '2026-06-05 10:11:30', '2026-06-05 10:16:18', '赵敏', '咨询', '录音笔', '讯飞AI录音笔H2', '咨询固件升级问题，已发送升级指引'] },
        { cells: ['热线-呼入', '2026-03-08 09:15:45', '2026-03-08 09:21:55', '王芳', '咨询', '录音笔', '讯飞AI录音笔H2', '咨询使用问题，在线讲解操作步骤'] },
        { cells: ['在线', '2026-02-20 11:05:22', '2026-02-20 11:12:40', '刘洋', '咨询', '智能键盘', '讯飞智能键盘K710', '咨询键盘蓝牙连接问题'] },
        { cells: ['热线-呼出', '2026-02-18 15:30:00', '2026-02-18 15:33:12', '张晓芸', '报修', '智能键盘', '讯飞智能键盘K710', '回访确认维修方案'] },
        { cells: ['热线-呼入', '2026-02-10 08:45:18', '2026-02-10 08:50:33', '陈伟', '投诉', '智能鼠标', '讯飞智能鼠标M310', '反馈鼠标连接不稳定'] },
        { cells: ['在线', '2026-01-28 14:20:05', '2026-01-28 14:28:50', '赵敏', '咨询', '录音笔', '讯飞AI录音笔H2', '询问录音文件导出方式'] },
      ],
    },
    history: {
      title: '历史工单',
      columns: ['工单编号', '工单类型', '创建时间', '工单状态', '当前节点'],
      rows: [
        { cells: ['IFLYKF2026061809340156', '报修', '2026-06-17 10:15:32', '处理中', '技术支持处理'], ticketNo: 'IFLYKF2026061809340156' },
        { cells: ['IFLYKF2026051200156', '报修', '2026-05-12 14:08:50', '已完成', '已结单'], ticketNo: 'IFLYKF2026051200156' },
        { cells: ['IFLYKF2026042000321', '投诉', '2026-04-20 11:30:20', '已完成', '已结单'], ticketNo: 'IFLYKF2026042000321' },
        { cells: ['IFLYKF2026030800089', '咨询', '2026-03-08 09:15:45', '已关闭', '已结单'], ticketNo: 'IFLYKF2026030800089' },
      ],
    },
    complaint: {
      title: '投诉单',
      columns: ['工单编号', '工单类型', '创建时间', '工单状态', '当前节点'],
      rows: [
        { cells: ['IFLYKF2026042000321', '投诉', '2026-04-20 11:30:20', '已完成', '已结单'], ticketNo: 'IFLYKF2026042000321' },
      ],
    },
    recent30: {
      title: '近30天工单',
      columns: ['工单编号', '工单类型', '创建时间', '工单状态', '当前节点'],
      rows: [
        { cells: ['IFLYKF2026061809340156', '报修', '2026-06-17 10:15:32', '处理中', '技术支持处理'], ticketNo: 'IFLYKF2026061809340156' },
        { cells: ['IFLYKF2026061500210', '咨询', '2026-06-15 13:22:08', '已完成', '已结单'], ticketNo: 'IFLYKF2026061500210' },
        { cells: ['IFLYKF2026060300098', '报修', '2026-06-03 16:40:55', '已完成', '已结单'], ticketNo: 'IFLYKF2026060300098' },
      ],
    },
  },
  latestHandling: [
    {
      who: '王坐席', role: '二线技术顾问', when: '今天 16:30',
      text: '远程升级固件至 v2.3.1 并复测 30 分钟，跳歌问题未再复现，已电话告知客户处理结果与后续观察建议。',
    },
    {
      who: '李一线', role: '一线坐席', when: '今天 10:05',
      text: '登记问题详情与故障录屏，初判为固件层问题，升级二线（处理人 王坐席）加速排查。',
    },
  ],
  customer: {
    name: '张小凡',
    types: ['G个人用户', 'J家长', 'J教研员', 'D代理商', 'J教育局', 'G个人自媒体'],
    gender: '男',
    contacts: [
      { type: 'phone', value: '138 0013 8000' },
      { type: 'phone', value: '021-8888 6666' },
      { type: 'email', value: 'zhangxf@iflytek.com' },
    ],
    region: '安徽省 / 合肥市 / 蜀山区',
    address: '望江西路 666 号讯飞大厦 A 座',
  },
  agent: {
    name: '张太太',
    relation: '家属',
    contacts: [
      { type: 'phone', value: '139 1234 5678' },
      { type: 'email', value: 'zhangtt@qq.com' },
    ],
  },
  product: {
    category: '智能键盘',
    name: '讯飞智能键盘K710',
    tags: ['红色', '科大讯飞'],
    sn: 'K710A240915001234',
    issueTags: ['功能异常', '播放问题', '在线播放'],
    afterSaleEnabled: true,
  },
  complaint: {
    categories: [
      { cat1: '产品质量投诉', cat2: '产品质量故障' },
    ],
    complaintType: '产品质量',
    platforms: [
      { platform: '市场监管12315平台', complaintNo: 'HM20260618001' },
      { platform: '黑猫消费者服务平台', complaintNo: '' },
    ],
    receivedAt: '2026-06-18 15:02',
    priorFeedback: '是-400',
    serviceReview: '2026-06-15 客户已致电 400 反馈同一问题，坐席承诺 48h 内回复，实际未按期回访。',
  },
  childTickets: [
    {
      no: 'LCMN-20260610-70021',
      title: '远程诊断-音箱跳歌',
      time: '06-10 李坐席',
      typeTag: '子单',
      statusTag: '处理中',
      typeColor: '#A855F7',
      statusColor: '#1A6FFF',
    },
    {
      no: 'LCMN-20260611-70022',
      title: '上门服务-更换主板',
      time: '06-11 王坐席',
      typeTag: '子单',
      statusTag: '待上门',
      typeColor: '#A855F7',
      statusColor: '#F59E0B',
    },
    {
      no: 'LCMN-20260612-70023',
      title: '备件申请-电源适配器',
      time: '06-12 张坐席',
      typeTag: '子单',
      statusTag: '已完成',
      typeColor: '#A855F7',
      statusColor: '#10B981',
    },
  ],
  linkedRecords: [
    {
      no: 'LCMN-20260601-60012',
      title: 'X1 固件升级公告',
      tag: '关联',
      meta: '06-01 李坐席关联',
    },
  ],
  similarTicket: {
    no: 'LCMN-20260605-55881',
    title: '同型号音箱跳歌问题',
    similarity: '相似 92%·已解决',
    solution: '方案：固件降级至 v2.3.1 后恢复稳定',
  },
  knowledge: ['X1 跳歌故障排查与固件重置指引', '在线歌单缓存清理方法'],
  aiSummary: '客户反映 X1 音箱在线歌单频繁跳歌、重启无效，情绪中性偏急，产品保修内。',
  aiInsight: {
    customerBrief: '30天联系12次、有投诉史，对时效敏感',
    ticketBrief: 'P0投诉，跳歌问题已升级固件待观察',
    suggestion: '今日闭环并回访，防外投',
    riskTag: '外投风险',
  },
  productBg: undefined,
  feishuSync: 'none',
  feishuRecords: [],
};

export const TIMELINE: TimelineEntry[] = [
  {
    id: 'e1', category: 'node', action: 'create', who: '系统', role: '系统',
    how: '创建工单', when: '今天 09:10',
    what: '客户经在线渠道提交问题，系统生成工单。',
  },
  {
    id: 'e2', category: 'node', action: 'accept', who: '李一线', role: '一线坐席',
    how: '接单受理', when: '今天 09:12',
    what: '一线接单受理，登记问题详情（见上方工单信息）。',
  },
  {
    id: 'esla-first', category: 'sla', action: 'slaClose', who: '系统', role: '系统',
    how: '首响时钟关闭', when: '今天 09:12:00',
    what: '',
    slaClose: { clock: '首响', closedAt: '今天 09:12:00' },
  },
  {
    id: 'e3', category: 'customer', action: 'supplement', who: '张小凡', role: '客户',
    how: '客户补充', when: '今天 09:50', attachment: '故障录屏.mp4',
    what: '补充故障录屏与具体歌单链接，方便定位。',
  },
  {
    id: 'e4', category: 'node', action: 'escalate', who: '李一线', role: '一线坐席',
    how: '升级', when: '今天 10:05',
    what: '升级至二线 · 处理人 王坐席（原因：需固件层排查）。',
  },
  {
    id: 'e5', category: 'dunning', action: 'dunning', who: '张小凡', role: '客户',
    how: '客户催单', when: '今天 10:32', dunningTimes: 1,
    what: '什么时候能解决？已经影响使用两天了，很着急。',
  },
  {
    id: 'e6', category: 'comm', action: 'phone', who: '王坐席', role: '二线技术顾问',
    how: '电话外呼', when: '今天 10:40', recording: '03:25',
    what: '致电客户确认故障细节，记录复现步骤，承诺 2 小时内反馈。',
    asr: [
      { speaker: '客户', text: '在线歌单老是自己跳过，重启也没用……' },
      { speaker: '坐席', text: '已记录复现步骤，2 小时内给您反馈。' },
    ],
  },
  {
    id: 'e7', category: 'comm', action: 'sms', who: '王坐席', role: '二线技术顾问',
    how: '二线短信', when: '今天 10:45',
    what: '【讯飞客服】您反馈的音箱跳歌问题已由二线跟进，预计今日 18:00 前反馈结果。',
  },
  {
    id: 'e8', category: 'customer', action: 'reply', who: '张小凡', role: '客户',
    how: '客户回复', when: '今天 10:52',
    what: '收到，我在家，方便时给我来电即可。',
  },
  {
    id: 'e9', category: 'node', action: 'hold', who: '王坐席', role: '二线技术顾问',
    how: '挂起', when: '今天 11:05',
    what: '已升级技术支持排查，挂起工单等待技术结论后恢复处理。',
  },
  {
    id: 'e10', category: 'node', action: 'transfer', who: '陈班组长', role: '班组长',
    how: '班组转派', when: '今天 14:20',
    what: '原处理人王二线今日休假，改派至李二线继续跟进。',
  },
  {
    id: 'eh1', category: 'handle', action: 'handle', who: '王坐席', role: '二线技术顾问',
    how: '工单处理', when: '今天 15:10',
    what: '登记处理进展（补充 2 项）',
    attachment: '固件升级日志.txt',
    changes: [
      { field: '问题原因', kind: '补充', to: '固件 v2.4 在线歌单调度模块缺陷' },
      { field: '处理结果', kind: '补充', to: '远程降级至 v2.3.1 并清理歌单缓存，复测 30 分钟未再复现' },
    ],
  },
  {
    id: 'eh2', category: 'handle', action: 'handle', who: '李二线', role: '二线技术顾问',
    how: '工单处理', when: '今天 15:48',
    what: '登记服务与结论（补充 2 项，修改 1 项）',
    changes: [
      { field: '服务类型', kind: '补充', to: '软件问题/其他' },
      { field: '服务方式', kind: '补充', to: '处理人直接解决' },
      { field: '问题解决结论', kind: '修改', from: '已解决：服务方案解决', to: '已解决：技术方案解决' },
    ],
  },
  {
    id: 'er1', category: 'relate', action: 'relate', who: '王坐席', role: '二线技术顾问',
    how: '升级投诉', when: '今天 16:02',
    what: '客户对处理结果不满、要求追责，升级为投诉，已生成新投诉单并双向关联。',
    relatedTicket: {
      no: 'LCMN-20260610-73090', title: '音箱跳歌问题处理不满·要求追责',
      type: '投诉', typeColor: '#EF4444',
      status: '未认领', statusColor: '#1A6FFF',
      builder: '王坐席', createdAt: '今天 16:02',
    },
  },
  {
    id: 'er2', category: 'relate', action: 'relate', who: '王坐席', role: '二线技术顾问',
    how: '升级售后', when: '今天 16:12',
    what: '需寄修硬件，升级售后，已生成关联售后单并双向关联，售后进度回流本单。',
    relatedTicket: {
      no: 'AS-20260610-002', title: '智能音箱 X1 寄修·主板检测',
      type: '售后', typeColor: '#EA580C',
      status: '处理中', statusColor: '#1A6FFF',
      builder: '王坐席', createdAt: '今天 16:12',
    },
  },
  {
    id: 'e11', category: 'node', action: 'resolved', who: '王坐席', role: '二线技术顾问',
    how: '标记已解决', when: '今天 16:30',
    what: '更换固件版本并远程验证，跳歌问题已解决（附解决方案）。',
  },
  {
    id: 'esla-whole', category: 'sla', action: 'slaClose', who: '系统', role: '系统',
    how: '整单时钟关闭', when: '今天 16:30:00',
    what: '',
    slaClose: { clock: '整单', closedAt: '今天 16:30:00' },
  },
  {
    id: 'e12', category: 'praise', action: 'praise', who: '张小凡', role: '客户',
    how: '客户评价', when: '今天 17:10', stars: 5,
    what: '处理很及时，态度也好，五星好评！',
  },
];

export const DEFAULT_PROCESS_DRAFT = {
  problemCause: '在线歌单播放时频繁跳歌，重启无效；客户情绪偏急，已催单 3 次。',
  processResult: '已远程升级固件至 v2.3.1 并复测 30 分钟，跳歌问题未再复现。',
  problemCauseAttachments: [] as string[],
  processResultAttachments: ['固件升级日志.txt'] as string[],
  serviceMethod: '处理人直接解决',
  serviceType: '软件问题/其他',
  conclusion: '已解决：技术方案解决',
  serviceSolution: '',
  concessionPlan: '',
  complaintCat1: '产品质量投诉',
  complaintCat2: '产品质量故障',
  complaintCat3: '',
  complaintMark: '有效投诉',
  complaintNote: '客户要求 48h 内书面回复，此处修正分类与备注',
  complaintNoteAttachments: [] as string[],
  platformFollowups: [] as {
    platform: string;
    complaintNo?: string;
    replyResult: string;
    reconcile: '' | '是' | '否';
  }[],
  riskFlag: '无风险',
  riskHasRisk: false,
  riskLevel: '',
  riskDescription: '客户多次催单，存在升级外投风险，需班组长关注。',
  riskDescriptionAttachments: [] as string[],
  appointmentNeeded: true,
  appointmentRecords: [
    {
      id: 'appt-demo-1',
      scheduledAt: '2026-07-16 14:00:00',
      done: false,
      booker: '王坐席',
      demand: '预约联系用户',
    },
  ] as AppointmentRecord[],
  qualityIsStandard: true,
  qualityIssueCat1: '',
  qualityIssueCat2: '',
  suggestAccepted: false,
  leadStage: 'invalid' as const,
  leadNo: '',
};
