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
  dunningTimes: number;
  dunningLast: string;
  builder: string;
  source: string;
  createdAt: string;
  complaintType: string;
  expectedResolve: string;
  demand: string;
  attachments: string[];
  customer: {
    name: string;
    level: string;
    vip: boolean;
    phone: string;
    email: string;
    emotion: '满意' | '中性' | '不满' | '愤怒';
    historyCount: number;
    recent30: number;
  };
  product: { name: string; sn: string; warranty: string; inWarranty: boolean };
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
  dunningTimes: 3,
  dunningLast: '今天 10:32',
  builder: '李一线（一线坐席）',
  source: '在线客服',
  createdAt: '今天 09:10',
  complaintType: '产品质量',
  expectedResolve: '今日 18:00',
  demand:
    '使用无线音箱播放在线音乐时，频繁出现自动跳过当前歌曲的情况，重启后仍复现，影响正常使用，要求尽快解决。',
  attachments: ['故障录屏.mp4', '设置截图.png'],
  customer: {
    name: '张小凡',
    level: '钻石会员 · 满意度 4.8',
    vip: true,
    phone: '138 0013 8000',
    email: 'zhang@example.com',
    emotion: '中性',
    historyCount: 12,
    recent30: 3,
  },
  product: { name: '智能音箱 X1', sn: 'SN-X1-88421003', warranty: '2026-11-20', inWarranty: true },
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
