import type {
  AgentInfo, ComplaintInfo, ContactItem, InsightStats,
  InsightDetailTable, InsightModalKey, LatestHandlingItem,
} from '@/views/tickets/types/operation';
import type { TimelineEntry } from '@/views/tickets/types/ticketDetail';

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

export interface TicketDetailMeta {
  no: string;
  title: string;
  type: string;
  channel: string;
  priority: string;
  status: string;
  slaWhole: string;
  slaNode: string;
  slaNodeOverdue: boolean;
  builder: string;
  builderShort: string;
  source: string;
  createdAt: string;
  createdAtFull: string;
  businessType: string;
  businessLine: string;
  issueOccurredAt: string;
  expectedResolve: string;
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
    /** 产品是否开通售后能力（控制「转售后」操作显隐） */
    afterSaleEnabled: boolean;
  };
  complaint: ComplaintInfo;
  childTickets: ChildTicket[];
  linkedRecords: LinkedRecord[];
  similarTicket: SimilarTicket;
  knowledge: string[];
  aiSummary: string;
}

export const TICKET_DETAIL: TicketDetailMeta = {
  no: 'LCMN-20260610-73026',
  title: '无线音乐播放跳过歌曲异常',
  type: '投诉',
  channel: '在线客服',
  priority: 'P0',
  status: '处理中',
  slaWhole: '02:40:15',
  slaNode: '00:12:30',
  slaNodeOverdue: true,
  builder: '李一线（一线坐席）',
  builderShort: '李一线',
  source: '在线客服',
  createdAt: '今天 09:10',
  createdAtFull: '2026-05-01 16:40',
  businessType: '学习机',
  businessLine: '学习机业务线',
  issueOccurredAt: '2026-06-18 14:30',
  expectedResolve: '今日 18:00',
  demand:
    '使用无线音箱播放在线音乐时，频繁出现自动跳过当前歌曲的情况，重启后仍复现，影响正常使用，要求尽快解决。',
  attachments: ['故障录屏.mp4', '设置截图.png'],
  isExternalAppeal: false,
  insight: {
    inboundCount: 8,
    historyCount: 12,
    complaintCount: 1,
    sameTypeCount: 1,
    recent30Count: 30,
    dunningCount: 1,
    supplementCount: 3,
    relatedCount: 10,
  },
  insightDetails: {
    inbound: {
      title: '进线明细',
      columns: ['类型', '进线时间', '通话时长', '接线坐席', '呼入类型', '小结'],
      rows: [
        { cells: ['热线', '今天 09:10', '04:25', '李一线', '投诉', '反馈音箱在线歌单跳歌，创建工单'] },
        { cells: ['在线', '今天 09:50', '—', '李一线', '投诉', '补充故障录屏与歌单链接'] },
        { cells: ['热线', '今天 10:32', '02:10', '王坐席', '催单', '催促处理进度，情绪偏急'] },
        { cells: ['热线', '昨天 16:20', '03:18', '陈坐席', '咨询', '咨询固件升级方式'] },
        { cells: ['在线', '2026-06-15 11:05', '—', '赵坐席', '咨询', '询问歌单缓存清理步骤'] },
        { cells: ['热线', '2026-05-12 14:08', '02:36', '李娜', '投诉', '投诉蓝牙连接不稳定，转售后'] },
      ],
    },
    history: {
      title: '历史工单',
      columns: ['工单编号', '工单类型', '创建时间', '工单状态', '当前节点'],
      rows: [
        { cells: ['LCMN-20260610-73026', '投诉', '今天 09:10', '处理中', '二线处理'], ticketNo: 'LCMN-20260610-73026' },
        { cells: ['LCMN-20260605-55881', '投诉', '2026-06-05 10:20', '已解决', '已结单'], ticketNo: 'LCMN-20260605-55881' },
        { cells: ['LCMN-20260512-41002', '报修', '2026-05-12 14:08', '已完成', '已结单'], ticketNo: 'LCMN-20260512-41002' },
        { cells: ['LCMN-20260420-32011', '咨询', '2026-04-20 11:30', '已关闭', '已结单'], ticketNo: 'LCMN-20260420-32011' },
        { cells: ['LCMN-20260308-18890', '咨询', '2026-03-08 09:15', '已关闭', '已结单'], ticketNo: 'LCMN-20260308-18890' },
      ],
    },
    complaint: {
      title: '投诉单',
      columns: ['工单编号', '投诉类型', '创建时间', '工单状态', '当前节点'],
      rows: [
        { cells: ['LCMN-20260605-55881', '服务投诉', '2026-06-05 10:20', '已解决', '已结单'], ticketNo: 'LCMN-20260605-55881' },
      ],
    },
    recent30: {
      title: '近 30 天工单',
      columns: ['工单编号', '工单类型', '创建时间', '工单状态', '当前节点'],
      rows: [
        { cells: ['LCMN-20260610-73026', '投诉', '今天 09:10', '处理中', '二线处理'], ticketNo: 'LCMN-20260610-73026' },
        { cells: ['LCMN-20260605-55881', '投诉', '2026-06-05 10:20', '已解决', '已结单'], ticketNo: 'LCMN-20260605-55881' },
        { cells: ['LCMN-20260603-50098', '咨询', '2026-06-03 16:40', '已完成', '已结单'], ticketNo: 'LCMN-20260603-50098' },
      ],
    },
  },
  latestHandling: [
    {
      who: '王坐席', role: '二线坐席', when: '今天 16:30',
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
    complaintType: '服务投诉',
    platform: '黑猫投诉',
    complaintNo: 'HM20260618001',
    tags: ['产品质量', '功能缺陷'],
    priorFeedback: '是',
    serviceReview: '需要回溯',
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
    id: 'e3', category: 'customer', action: 'supplement', who: '张小凡', role: '客户',
    how: '客户补充', when: '今天 09:50', attachment: '故障录屏.mp4',
    what: '补充故障录屏与具体歌单链接，方便定位。',
  },
  {
    id: 'e4', category: 'node', action: 'escalate', who: '李一线', role: '一线坐席',
    how: '升级二线', when: '今天 10:05',
    what: '升级至二线 · 处理人 王坐席（原因：需固件层排查）。',
  },
  {
    id: 'e5', category: 'dunning', action: 'dunning', who: '张小凡', role: '客户',
    how: '客户催单', when: '今天 10:32', dunningTimes: 1,
    what: '什么时候能解决？已经影响使用两天了，很着急。',
  },
  {
    id: 'e6', category: 'comm', action: 'phone', who: '王坐席', role: '二线坐席',
    how: '电话外呼', when: '今天 10:40', recording: '03:25',
    what: '致电客户确认故障细节，记录复现步骤，承诺 2 小时内反馈。',
    asr: [
      { speaker: '客户', text: '在线歌单老是自己跳过，重启也没用……' },
      { speaker: '坐席', text: '已记录复现步骤，2 小时内给您反馈。' },
    ],
  },
  {
    id: 'e7', category: 'comm', action: 'sms', who: '王坐席', role: '二线坐席',
    how: '二线短信', when: '今天 10:45',
    what: '【讯飞客服】您反馈的音箱跳歌问题已由二线跟进，预计今日 18:00 前反馈结果。',
  },
  {
    id: 'e8', category: 'customer', action: 'reply', who: '张小凡', role: '客户',
    how: '客户回复', when: '今天 10:52',
    what: '收到，我在家，方便时给我来电即可。',
  },
  {
    id: 'e9', category: 'node', action: 'hold', who: '王坐席', role: '二线坐席',
    how: '挂起', when: '今天 11:05',
    what: '等待备件到货，挂起工单，预计明日恢复处理。',
  },
  {
    id: 'e10', category: 'node', action: 'transfer', who: '陈班组长', role: '班组长',
    how: '班组转派', when: '今天 14:20',
    what: '备件已到货，改派至 李二线 加速处理。',
  },
  {
    id: 'e11', category: 'resolved', action: 'resolved', who: '王坐席', role: '二线坐席',
    how: '标记已解决', when: '今天 16:30',
    what: '更换固件版本并远程验证，跳歌问题已解决（附解决方案）。',
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
  serviceMethod: '远程指导',
  serviceType: '技术支持（随服务方式自动带出）',
  conclusion: 'resolved' as const,
  complaintCat1: '产品质量',
  complaintCat2: '功能缺陷',
  complaintCat3: '播放异常',
  complaintNote: '客户要求 48h 内书面回复，此处修正分类与备注',
  complaintNoteAttachments: [] as string[],
  riskHasRisk: true,
  riskLevel: '中风险',
  riskDescription: '客户多次催单，存在升级外投风险，需班组长关注。',
  riskDescriptionAttachments: [] as string[],
  appointmentNeeded: true,
  appointmentStart: '2026-06-19 14:00',
  appointmentEnd: '2026-06-19 16:00',
  qualityIsStandard: true,
  qualityIssueCat: '信息不完整',
  qualityIssueReason: '',
  qualityIssueReasonAttachments: [] as string[],
  suggestCat1: '产品体验',
  suggestCat2: '功能建议',
  suggestAdopt: 'adopt' as const,
  leadIntent: 'mid' as const,
  leadAmount: '',
  leadStage: 'following' as const,
};
