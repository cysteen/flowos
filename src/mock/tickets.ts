import type { Ticket } from '@/views/tickets/types/ticket';

// 工单 Mock 数据（对齐 PRD-02 §9 字段与分布；样例文案参考 .pen SJpgc）。
// 分布：我的工单 8 / 团队工单 4 / 工单池 3 / 我抄送 2 / 待审核 3 = 20；含 3 条临期/超时。

export const TICKETS: Ticket[] = [
  // ---- 我的工单 (mine) 8 ----
  {
    id: 't1', no: 'LCMN-20260610-73026', type: '投诉', channel: '在线客服',
    title: '无线音乐播放跳过歌曲异常', smartMarks: ['升级', '情绪'],
    customer: '张小凡', vip: true, product: '智能音箱 X1',
    nodeStatus: '处理中·一线', nodeStep: 3, nodeTotal: 5, priority: 'P0',
    slaText: '00:42:10', slaSub: '距超时', slaState: 'soon', slaMinutes: 42,
    assignee: '王坐席', tab: 'mine',
  },
  {
    id: 't2', no: 'LCMN-20260610-73118', type: '报修', channel: '电话',
    title: '设备无法开机，指示灯不亮', smartMarks: ['升级'],
    customer: '李大海', vip: false, product: '扫地机器人 R2',
    nodeStatus: '处理中·一线', nodeStep: 2, nodeTotal: 5, priority: 'P0',
    slaText: '已超 01:12', slaSub: '已超时', slaState: 'overdue', slaMinutes: -72,
    assignee: '王坐席', tab: 'mine',
  },
  {
    id: 't3', no: 'LCMN-20260610-74836', type: '咨询', channel: '小程序',
    title: '如何绑定企业微信账号', smartMarks: [],
    customer: '李铭', vip: false, product: '企业版',
    nodeStatus: '已挂起·待客户', nodeStep: 2, nodeTotal: 5, priority: 'P1',
    slaText: '已停表', slaSub: '挂起中', slaState: 'paused', slaMinutes: 9999,
    assignee: '陈坐席', tab: 'mine',
  },
  {
    id: 't4', no: 'LCMN-20260610-75002', type: '技术', channel: '邮件',
    title: 'API 调用返回 429 限流', smartMarks: ['相似', '知识'],
    customer: '赵敏', vip: true, product: '开放平台',
    nodeStatus: '已升级·二线', nodeStep: 4, nodeTotal: 5, priority: 'P1',
    slaText: '01:48:30', slaSub: '距超时', slaState: 'soon', slaMinutes: 108,
    assignee: '王坐席', tab: 'mine',
  },
  {
    id: 't5', no: 'LCMN-20260610-75240', type: '退换', channel: 'APP',
    title: '收到商品与描述不符，申请退货', smartMarks: ['情绪'],
    customer: '孙莉', vip: false, product: '蓝牙耳机 Air',
    nodeStatus: '处理中·一线', nodeStep: 1, nodeTotal: 4, priority: 'P2',
    slaText: '06:20:00', slaSub: '充足', slaState: 'ok', slaMinutes: 380,
    assignee: '王坐席', tab: 'mine',
  },
  {
    id: 't6', no: 'LCMN-20260610-75518', type: '安装', channel: '电话',
    title: '预约上门安装智能门锁', smartMarks: [],
    customer: '周杰', vip: false, product: '智能门锁 L1',
    nodeStatus: '待受理', nodeStep: 1, nodeTotal: 4, priority: 'P2',
    slaText: '04:10:00', slaSub: '充足', slaState: 'ok', slaMinutes: 250,
    assignee: '王坐席', tab: 'mine',
  },
  {
    id: 't7', no: 'LCMN-20260610-75744', type: '咨询', channel: '在线客服',
    title: '会员续费优惠如何领取', smartMarks: ['知识'],
    customer: '吴芳', vip: true, product: '会员服务',
    nodeStatus: '处理中·一线', nodeStep: 2, nodeTotal: 5, priority: 'P3',
    slaText: '12:30:00', slaSub: '充足', slaState: 'ok', slaMinutes: 750,
    assignee: '王坐席', tab: 'mine',
  },
  {
    id: 't8', no: 'LCMN-20260610-76010', type: '投诉', channel: '邮件',
    title: '客服响应慢，要求加急处理', smartMarks: ['升级', '情绪'],
    customer: '郑强', vip: false, product: '智能音箱 X1',
    nodeStatus: '处理中·一线', nodeStep: 2, nodeTotal: 5, priority: 'P1',
    slaText: '00:58:00', slaSub: '距超时', slaState: 'soon', slaMinutes: 58,
    assignee: '王坐席', tab: 'mine',
  },

  // ---- 团队工单 (team) 4 ----
  {
    id: 't9', no: 'LCMN-20260610-72015', type: '报修', channel: '电话',
    title: '空气净化器滤芯指示灯常亮', smartMarks: [],
    customer: '冯涛', vip: false, product: '空气净化器 P3',
    nodeStatus: '处理中·一线', nodeStep: 2, nodeTotal: 5, priority: 'P2',
    slaText: '03:25:00', slaSub: '充足', slaState: 'ok', slaMinutes: 205,
    assignee: '陈坐席', tab: 'team',
  },
  {
    id: 't10', no: 'LCMN-20260610-72330', type: '咨询', channel: '小程序',
    title: '发票抬头修改流程', smartMarks: [],
    customer: '陈静', vip: false, product: '企业版',
    nodeStatus: '待受理', nodeStep: 1, nodeTotal: 4, priority: 'P3',
    slaText: '08:00:00', slaSub: '充足', slaState: 'ok', slaMinutes: 480,
    assignee: '林坐席', tab: 'team',
  },
  {
    id: 't11', no: 'LCMN-20260610-72645', type: '技术', channel: '邮件',
    title: 'Webhook 推送偶发丢失', smartMarks: ['相似'],
    customer: '韩雪', vip: true, product: '开放平台',
    nodeStatus: '已升级·二线', nodeStep: 4, nodeTotal: 5, priority: 'P1',
    slaText: '00:35:00', slaSub: '距超时', slaState: 'soon', slaMinutes: 35,
    assignee: '陈坐席', tab: 'team',
  },
  {
    id: 't12', no: 'LCMN-20260610-72901', type: '投诉', channel: 'APP',
    title: '退款迟迟未到账', smartMarks: ['情绪'],
    customer: '杨光', vip: false, product: '蓝牙耳机 Air',
    nodeStatus: '处理中·一线', nodeStep: 3, nodeTotal: 5, priority: 'P0',
    slaText: '已超 00:25', slaSub: '已超时', slaState: 'overdue', slaMinutes: -25,
    assignee: '林坐席', tab: 'team',
  },

  // ---- 工单池 (pool) 3 ----
  {
    id: 't13', no: 'LCMN-20260610-78120', type: '咨询', channel: '在线客服',
    title: '智能音箱无法连接 WiFi', smartMarks: [],
    customer: '何苗', vip: false, product: '智能音箱 X1',
    nodeStatus: '待受理', nodeStep: 1, nodeTotal: 5, priority: 'P2',
    slaText: '02:00:00', slaSub: '距超时', slaState: 'ok', slaMinutes: 120,
    assignee: null, tab: 'pool',
  },
  {
    id: 't14', no: 'LCMN-20260610-78344', type: '报修', channel: '电话',
    title: '扫地机器人充电故障', smartMarks: [],
    customer: '罗成', vip: false, product: '扫地机器人 R2',
    nodeStatus: '待受理', nodeStep: 1, nodeTotal: 5, priority: 'P1',
    slaText: '00:50:00', slaSub: '距超时', slaState: 'soon', slaMinutes: 50,
    assignee: null, tab: 'pool',
  },
  {
    id: 't15', no: 'LCMN-20260610-78600', type: '退换', channel: '小程序',
    title: '七天无理由退货咨询', smartMarks: [],
    customer: '袁媛', vip: true, product: '会员服务',
    nodeStatus: '待受理', nodeStep: 1, nodeTotal: 4, priority: 'P3',
    slaText: '05:30:00', slaSub: '充足', slaState: 'ok', slaMinutes: 330,
    assignee: null, tab: 'pool',
  },

  // ---- 我抄送 (cc) 2 ----
  {
    id: 't16', no: 'LCMN-20260609-66012', type: '技术', channel: '邮件',
    title: '批量导入用户报错', smartMarks: ['知识'],
    customer: '邓超', vip: true, product: '开放平台',
    nodeStatus: '处理中·一线', nodeStep: 3, nodeTotal: 5, priority: 'P2',
    slaText: '07:15:00', slaSub: '充足', slaState: 'ok', slaMinutes: 435,
    assignee: '陈坐席', tab: 'cc',
  },
  {
    id: 't17', no: 'LCMN-20260609-66248', type: '投诉', channel: '在线客服',
    title: '账号被异常登录', smartMarks: ['升级'],
    customer: '曾琳', vip: false, product: '企业版',
    nodeStatus: '已升级·二线', nodeStep: 4, nodeTotal: 5, priority: 'P0',
    slaText: '01:05:00', slaSub: '距超时', slaState: 'soon', slaMinutes: 65,
    assignee: '林坐席', tab: 'cc',
  },

  // ---- 待审核 (review) 3 ----
  {
    id: 't18', no: 'LCMN-20260609-65010', type: '报修', channel: '电话',
    title: '已更换主板，待审核结单', smartMarks: [],
    customer: '田野', vip: false, product: '空气净化器 P3',
    nodeStatus: '待审核', nodeStep: 5, nodeTotal: 5, priority: 'P2',
    slaText: '03:00:00', slaSub: '充足', slaState: 'ok', slaMinutes: 180,
    assignee: '王坐席', tab: 'review',
  },
  {
    id: 't19', no: 'LCMN-20260609-65236', type: '咨询', channel: '小程序',
    title: '已答复绑定流程，待审核', smartMarks: [],
    customer: '范冰', vip: false, product: '企业版',
    nodeStatus: '待审核', nodeStep: 4, nodeTotal: 4, priority: 'P3',
    slaText: '09:00:00', slaSub: '充足', slaState: 'ok', slaMinutes: 540,
    assignee: '陈坐席', tab: 'review',
  },
  {
    id: 't20', no: 'LCMN-20260609-65500', type: '退换', channel: 'APP',
    title: '已确认退款金额，待审核', smartMarks: ['情绪'],
    customer: '苏洋', vip: true, product: '蓝牙耳机 Air',
    nodeStatus: '待审核', nodeStep: 4, nodeTotal: 4, priority: 'P1',
    slaText: '00:48:00', slaSub: '距超时', slaState: 'soon', slaMinutes: 48,
    assignee: '王坐席', tab: 'review',
  },
];
