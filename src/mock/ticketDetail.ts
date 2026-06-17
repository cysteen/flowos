import type { TimelineEntry } from '@/views/tickets/types/ticketDetail';

// 工单操作页 Mock（样例 = 设计稿 LCMN-20260610-73026 投诉单）。
// 原型为完整展示，时间线含全部 6 类语义色的代表条目（PRD-03 §10）。

export interface TicketDetailMeta {
  no: string;
  title: string;
  type: string;
  channel: string;
  priority: string;
  status: string;
  slaWhole: string; // 整单解决剩余
  slaNode: string; // 当前节点响应剩余
  slaNodeOverdue: boolean;
  dunningTimes: number;
  dunningLast: string;
  builder: string;
  source: string;
  createdAt: string;
  demand: string;
  fields: { label: string; value: string }[];
  attachments: string[];
  customer: {
    name: string; level: string; vip: boolean;
    phone: string; email: string; emotion: string;
    historyCount: number; recent30: number;
  };
  product: { name: string; sn: string; warranty: string; inWarranty: boolean };
  related: { no: string; title: string; tag: string }[];
}

export const TICKET_DETAIL: TicketDetailMeta = {
  no: 'LCMN-20260610-73026',
  title: '无线音乐播放跳过歌曲异常',
  type: '投诉',
  channel: '在线客服',
  priority: 'P0',
  status: '处理中·一线',
  slaWhole: '02:40:15',
  slaNode: '00:12:30',
  slaNodeOverdue: true,
  dunningTimes: 3,
  dunningLast: '今天 10:32',
  builder: '李一线',
  source: '在线客服',
  createdAt: '2026-06-10 09:12',
  demand:
    '使用无线音箱播放在线音乐时，频繁出现自动跳过当前歌曲的情况，重启后仍复现，影响正常使用，要求尽快解决。',
  fields: [
    { label: '投诉对象', value: '智能音箱 X1' },
    { label: '严重程度', value: '高' },
    { label: '投诉类型', value: '产品质量' },
    { label: '期望解决', value: '今日 18:00 前' },
  ],
  attachments: ['故障录屏.mp4', '设备信息.png'],
  customer: {
    name: '张小凡', level: '钻石会员', vip: true,
    phone: '138 0013 8000', email: 'zhang@example.com', emotion: '偏急',
    historyCount: 12, recent30: 3,
  },
  product: { name: '智能音箱 X1', sn: 'SN-X1-88421003', warranty: '2026-11-20', inWarranty: true },
  related: [
    { no: 'LCMN-20260520-41882', title: '同型号音箱跳歌问题', tag: '相似' },
    { no: 'NOTICE-X1-0608', title: 'X1 固件升级公告', tag: '关联' },
  ],
};

export const TIMELINE: TimelineEntry[] = [
  {
    id: 'e1', category: 'node', action: 'create', who: '系统', role: '系统',
    how: '创建工单', when: '06-10 09:12',
    what: '客户经「在线客服」提交咨询，系统自动生成工单并分类为「投诉」。',
  },
  {
    id: 'e2', category: 'node', action: 'accept', who: '李一线', role: '一线坐席',
    how: '接单受理', when: '06-10 09:15',
    what: '一线坐席接单，登记客户诉求与故障现象，归类为产品质量投诉。',
  },
  {
    id: 'e3', category: 'customer', action: 'supplement', who: '张小凡', role: '客户',
    how: '客户补充', when: '06-10 09:40', attachment: '故障录屏.mp4',
    what: '客户补充上传了故障录屏，显示连续跳过 3 首歌曲。',
  },
  {
    id: 'e4', category: 'node', action: 'escalate', who: '李一线 → 王坐席', role: '一线坐席',
    how: '升级二线', when: '06-10 10:05',
    what: '一线初判为固件问题，SLA 临期，升级二线技术坐席处理。升级原因：需固件层排查。',
  },
  {
    id: 'e5', category: 'dunning', action: 'dunning', who: '张小凡', role: '客户',
    how: '客户催单', when: '06-10 10:18', dunningTimes: 1,
    what: '客户通过在线客服催促处理进度。',
  },
  {
    id: 'e6', category: 'comm', action: 'phone', who: '王坐席', role: '二线坐席',
    how: '电话外呼', when: '06-10 10:30', recording: '02:15',
    what: '外呼客户核实故障场景与固件版本，已接通，通话 2 分 15 秒。',
    asr: [
      { speaker: '坐席', text: '您好，关于音箱跳歌的问题，请问当前固件版本是多少？' },
      { speaker: '客户', text: '版本是 3.2.1，昨天刚提示我升级但还没升。' },
      { speaker: '坐席', text: '好的，建议您先升级到 3.3.0，我也会同步反馈研发。' },
    ],
  },
  {
    id: 'e7', category: 'comm', action: 'sms', who: '王坐席', role: '二线坐席',
    how: '二线短信', when: '06-10 10:36',
    what: '已下发固件升级指引短信（含升级链接），渠道回执「已送达」。',
  },
  {
    id: 'e8', category: 'customer', action: 'reply', who: '张小凡', role: '客户',
    how: '客户回复', when: '06-10 11:02',
    what: '客户回复：已按指引升级到 3.3.0，跳歌频率下降但仍偶发。',
  },
  {
    id: 'e9', category: 'node', action: 'hold', who: '王坐席', role: '二线坐席',
    how: '挂起', when: '06-10 11:10',
    what: '挂起等待研发确认固件补丁，SLA 停表，预计明日恢复。',
  },
  {
    id: 'e10', category: 'dunning', action: 'dunning', who: '张小凡', role: '客户',
    how: '客户催单', when: '06-10 14:20', dunningTimes: 3,
    what: '客户第 3 次催单，情绪偏急，要求尽快给出明确方案。',
  },
  {
    id: 'e11', category: 'node', action: 'transfer', who: '陈班组长', role: '班组长',
    how: '班组转派', when: '06-10 15:00', internal: true,
    what: '班组长将工单改派给固件专项组王坐席跟进。改派原因：专项排查更高效。',
  },
  {
    id: 'e12', category: 'resolved', action: 'resolved', who: '王坐席', role: '二线坐席',
    how: '标记已解决', when: '06-10 17:40',
    what: '研发确认 3.3.0 补丁修复跳歌问题，已指导客户完成验证，标记已解决，进入待审核。',
  },
];
