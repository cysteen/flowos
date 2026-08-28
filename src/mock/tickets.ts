import type { Ticket } from '@/views/tickets/types/ticket';
import { mapChannelToSource } from '@/views/tickets/types/createTicket';

// 工单 Mock 数据（对齐 PRD-02 §9 字段与分布；样例文案参考 .pen SJpgc）。
// 分布：我的任务 8 / 已办 6 / 本组工单池 5 / @我的工单 3 / 待审核 3 = 25（活跃）+ 归档。

const BASE_TICKETS: Ticket[] = [
  // ---- 我的工单 (mine) 9 ----
  // 飞书项目集成演示单：消费者BG · 翻译机，用于演示「升级到飞书项目」全链路
  { serviceScore: 5,
    id: 't-feishu', no: 'IFLYZX-20260713-00001', type: '咨询', channel: '在线客服',
    title: '翻译机离线翻译结果异常，疑似模型问题', smartMarks: ['升级'],
    customer: '陈翻译', vip: false, product: '讯飞翻译机 T10',
    productBg: '消费者BG',
    nodeStatus: '处理中', nodeStep: 3, nodeTotal: 5, priority: 'P1',
    slaText: '03:20:00', slaSub: '充足', slaState: 'ok', slaMinutes: 200,
    assignee: '王坐席', tab: 'mine',
    customerPhone: '13500001234', sn: 'SN-T10-260713', productCategory: '消费电子',
    businessType: '翻译机',
    problemDesc: '用户反馈离线中英互译在长句场景下漏译、语序错乱，在线翻译正常，疑似离线模型缺陷，需产研确认。',
    createdAt: '2026-07-13 09:10', updatedAt: '2026-07-13 10:05',
    responded: true, upgradedByMe: false,
  },
  { serviceScore: 2,
    id: 't1', no: 'IFLYTS-20260610-00002', type: '投诉', channel: '在线客服',
    title: '无线音乐播放跳过歌曲异常', smartMarks: ['升级', '情绪'],
    customer: '张小凡', vip: true, customerTags: ['记者'], product: '智能音箱 X1',
    ticketSource: '外投渠道', complaintType: '产品质量',
    nodeStatus: '处理中', nodeStep: 3, nodeTotal: 5, priority: 'P0',
    slaText: '00:42:10', slaSub: '距超时', slaState: 'soon', slaMinutes: 42,
    assignee: '王坐席', tab: 'mine',
    customerPhone: '13800138000', sn: 'SN-X1-20260301', productCategory: '智能硬件',
    createdAt: '2026-06-10 08:12', updatedAt: '2026-06-10 14:30',
    // 已联系：催补后坐席已回电 → 催补待回**不收**（PRD-915 补充与催单 §10.1）
    responded: true, upgradedByMe: true, hasDunning: true, dunningContacted: true, contactedAfterUrge: true,
  },
  { serviceScore: 5,
    id: 't2', no: 'IFLYZX-20260610-00004', type: '咨询', channel: '电话',
    title: '设备无法开机，指示灯不亮', smartMarks: ['升级'],
    customer: '李大海', vip: false, product: '扫地机器人 R2',
    nodeStatus: '处理中', nodeStep: 2, nodeTotal: 5, priority: 'P0',
    slaText: '已超 01:12', slaSub: '已超时', slaState: 'overdue', slaMinutes: -72,
    assignee: '王坐席', tab: 'mine',
    customerPhone: '13912345678', sn: 'SN-R2-882910', productCategory: '智能硬件',
    createdAt: '2026-06-10 07:45', updatedAt: '2026-06-10 16:02',
    responded: true, hasDunning: true,
  },
  {
    id: 't3', no: 'IFLYZX-20260610-00005', type: '咨询', channel: '小程序',
    title: '等待客户补充材料', smartMarks: [],
    customer: '李铭', vip: false, product: '企业版',
    nodeStatus: '已挂起', nodeStep: 2, nodeTotal: 5, priority: 'P1',
    slaText: '已暂停', slaSub: '挂起中', slaState: 'paused', slaMinutes: 9999,
    assignee: '王坐席', tab: 'mine',
    customerPhone: '13600001111', productCategory: '企业服务',
    createdAt: '2026-06-09 15:20', updatedAt: '2026-06-10 10:00',
    responded: true, suspendedByMe: true, hasSupplement: true,
  },
  { serviceScore: 1,
    id: 't4', no: 'IFLYSJ-20260610-00006', type: '商机', channel: '邮件',
    title: 'API 调用返回 429 限流', smartMarks: ['相似', '知识'],
    customer: '赵敏', vip: true, customerTags: ['校长'], product: '开放平台',
    nodeStatus: '已升级技术支持', nodeStep: 4, nodeTotal: 5, priority: 'P1',
    slaText: '01:48:30', slaSub: '距超时', slaState: 'soon', slaMinutes: 108,
    assignee: '王坐席', tab: 'mine',
    customerPhone: '13788889999', productCategory: '开放平台',
    createdAt: '2026-06-10 09:00', updatedAt: '2026-06-10 13:15',
    responded: true, upgradedByMe: true, hasDelegateHistory: true, hasReturnAction: true,
  },
  { serviceScore: 5,
    id: 't5', no: 'IFLYTS-20260610-00007', type: '投诉', channel: 'APP',
    title: '收到商品与描述不符，申请退货', smartMarks: ['情绪'],
    customer: '孙莉', vip: false, customerTags: ['自媒体'], product: '蓝牙耳机 Air',
    nodeStatus: '处理中', nodeStep: 1, nodeTotal: 4, priority: 'P2',
    slaText: '06:20:00', slaSub: '充足', slaState: 'ok', slaMinutes: 380,
    assignee: '王坐席', tab: 'mine',
    customerPhone: '15800002222', sn: 'SN-AIR-55102', productCategory: '智能硬件',
    createdAt: '2026-06-10 11:30', updatedAt: '2026-06-10 12:05',
    // 已联系：催补后坐席已回电 → 催补待回**不收**（PRD-915 补充与催单 §10.1）
    responded: true, supplementUnread: true, hasSupplement: true, contactedAfterUrge: true,
  },
  // 班组长看板「转入」下钻：售后回传 / 跨组调剂
  {
    id: 't5a', no: 'IFLYZX-20260804-00003', type: '咨询', channel: '电话',
    title: '售后回传·配件到货续办咨询', smartMarks: [],
    customer: '何敏', vip: false, product: '空气净化器 P2',
    ticketSource: '售后转入',
    // 售后把单转回客服（AS_RETURNED）：1:1 关联位仍指向这张售后单，
    // 客服侧再点「转售后」不是建第二张，而是把它重新激活
    aftersaleOriginNo: 'AS-20260731-40217',
    aftersaleOriginTitle: '空气净化器 P2 滤芯配件更换（寄修）',
    aftersaleOriginStatus: '已转回客服',
    nodeStatus: '处理中', nodeStep: 2, nodeTotal: 5, priority: 'P2',
    slaText: '05:40:00', slaSub: '充足', slaState: 'ok', slaMinutes: 340,
    // 挂在 WORKBENCH_HANDLER 名下，「我的任务」首屏即可点开验激活分支；
    // 看板「转入」下钻按 ticketSource 过滤，与处理人无关，不受影响
    assignee: '王坐席', tab: 'mine',
    customerPhone: '13900008801', sn: 'SN-P2-88001', productCategory: '智能硬件',
    createdAt: '2026-08-04 09:20', updatedAt: '2026-08-04 10:05',
    responded: true,
  },
  { serviceScore: 3,
    id: 't5b', no: 'IFLYTS-20260804-00004', type: '投诉', channel: '在线客服',
    title: '跨组调剂·二组转入待跟进', smartMarks: ['情绪'],
    customer: '冯磊', vip: false, product: '智能音箱 X1',
    ticketSource: '跨组调剂',
    nodeStatus: '未认领', nodeStep: 1, nodeTotal: 5, priority: 'P1',
    slaText: '03:20:00', slaSub: '充足', slaState: 'ok', slaMinutes: 200,
    resolveSlaText: '08:00:00', resolveSlaState: 'ok',
    assignee: null, tab: 'pool', groupId: 'line1',
    customerPhone: '13900008802', sn: 'SN-X1-88002', productCategory: '智能硬件',
    createdAt: '2026-08-04 10:40', updatedAt: '2026-08-04 10:40',
    responded: false,
  },
  {
    id: 't6', no: 'IFLYJY-20260610-00008', type: '建议', channel: '电话',
    title: '预约上门安装智能门锁', smartMarks: [],
    customer: '周杰', vip: false, product: '智能门锁 L1',
    nodeStatus: '待响应', nodeStep: 1, nodeTotal: 4, priority: 'P2',
    slaText: '04:10:00', slaSub: '充足', slaState: 'ok', slaMinutes: 250,
    resolveSlaText: '08:00:00', resolveSlaState: 'ok',
    assignee: '王坐席', tab: 'mine',
    customerPhone: '13344445555', sn: 'SN-L1-33001', productCategory: '智能硬件',
    createdAt: '2026-06-10 13:00', updatedAt: '2026-06-10 13:00',
    responded: false,
    hasAppointment: true, appointmentText: '02:15:00',
  },
  { serviceScore: 5,
    id: 't7', no: 'IFLYZX-20260610-00009', type: '咨询', channel: '在线客服',
    title: '会员续费优惠如何领取', smartMarks: ['知识'],
    customer: '吴芳', vip: true, customerTags: ['老师'], product: '会员服务',
    nodeStatus: '处理中', nodeStep: 2, nodeTotal: 5, priority: 'P3',
    slaText: '12:30:00', slaSub: '充足', slaState: 'ok', slaMinutes: 750,
    assignee: '王坐席', tab: 'mine',
    customerPhone: '18611112222', productCategory: '会员权益',
    createdAt: '2026-06-08 10:00', updatedAt: '2026-06-09 18:40',
    responded: true,
  },
  {
    id: 't8', no: 'IFLYTS-20260610-00010', type: '投诉', channel: '邮件',
    title: '客服响应慢，要求加急处理', smartMarks: ['升级', '情绪'],
    customer: '郑强', vip: false, customerTags: ['记者'], product: '智能音箱 X1',
    nodeStatus: '处理中', nodeStep: 2, nodeTotal: 5, priority: 'P1',
    slaText: '00:58:00', slaSub: '距超时', slaState: 'soon', slaMinutes: 58,
    assignee: '王坐席', tab: 'mine',
    customerPhone: '13566667777', sn: 'SN-X1-20260188', productCategory: '智能硬件',
    createdAt: '2026-06-10 10:20', updatedAt: '2026-06-10 15:50',
    // 未联系（缺省即未联系）→ 进催补待回
    responded: true, firstRespBreached: true, dunningUnread: true, hasDunning: true,
  },
  // 非诉转售后后的「已转出」等待态：原单不关闭、留在我的任务、SLA 停表，
  // 等售后回传终态（售后侧关单 → 原单收口进已办；转回客服 → 回处理中续跑）
  {
    id: 't33', no: 'IFLYZX-20260722-00002', type: '咨询', channel: '电话',
    title: '录音笔无法充电，需寄修检测', smartMarks: [],
    customer: '孙倩', vip: false, product: '智能录音笔 SR302',
    nodeStatus: '已转出', nodeStep: 4, nodeTotal: 5, priority: 'P2',
    slaText: '—', slaSub: '已转出·停表', slaState: 'ok', slaMinutes: 9999,
    assignee: '王坐席', tab: 'mine',
    linkedAftersaleNo: 'AS-20260722-38104',
    customerPhone: '13977778888', sn: 'SN-SR302-40915', productCategory: '智能硬件',
    createdAt: '2026-07-22 09:40', updatedAt: '2026-07-22 11:15',
    // 830 演示：已转出态下催补两枚都不展示，hover 售后单号出提示去售后系统操作
    responded: true,
  },

  // ================================================================
  // 补充与催单（830）演示单 —— 共 9 张。
  // 看一线视角请**切角色**（角色切换器选「一线坐席」），这批单不再带任何标记：
  // 早先它们带 frontlineDemo，而门控直接读那个字段，于是任何角色打开都被判成一线视角。
  // 原则：**同一行为只留一张**。能复用现有单的不新造（已挂起=t3、已转出=t33、
  // 待审核=review 段、未认领=pool 段），只补 mock 里没有的状态与组合。
  // 对应《【915】补充与催单 PRD》附录 A。
  // ================================================================

  // D3 投诉·外投渠道·非服务投诉：选「补充投诉信息」→ 投诉一/二类 + 投诉平台组**全出现**
  //    兼验：双 Tag（已催+已补）· 未读
  { serviceScore: 2,
    id: 'fd-d2', no: 'IFLYTS-20260817-00001', type: '投诉', channel: '在线客服',
    title: '黑猫平台投诉：售后承诺未兑现', smartMarks: ['升级', '情绪'],
    customer: '吴强', vip: true, customerTags: ['自媒体'], product: '智能音箱 X1',
    ticketSource: '外投渠道', complaintType: '产品质量',
    nodeStatus: '处理中', nodeStep: 3, nodeTotal: 5, priority: 'P0',
    slaText: '00:35:00', slaSub: '距超时', slaState: 'soon', slaMinutes: 35,
    assignee: '王坐席', tab: 'mine',
    customerPhone: '13622223333', productCategory: '智能硬件',
    createdAt: '2026-08-17 08:30', updatedAt: '2026-08-17 10:40',
    responded: true,
    hasDunning: true, dunningUnread: true, hasSupplement: true, supplementUnread: true,
  },
  // D3 投诉·服务投诉·IM：选「补充投诉信息」→ 两组条件字段**都不出现**
  //    兼验：已知晓但未联系（dunningUnread=false 仍被拦）
  {
    id: 'fd-d3', no: 'IFLYTS-20260817-00002', type: '投诉', channel: '在线客服',
    title: '坐席态度问题投诉', smartMarks: ['情绪'],
    customer: '郑霞', vip: false, product: '扫地机器人 R2',
    ticketSource: '在线客服', complaintType: '服务投诉',
    nodeStatus: '处理中', nodeStep: 2, nodeTotal: 5, priority: 'P1',
    slaText: '04:00:00', slaSub: '充足', slaState: 'ok', slaMinutes: 240,
    assignee: '王坐席', tab: 'mine',
    customerPhone: '13633334444', productCategory: '智能硬件',
    createdAt: '2026-08-17 09:20', updatedAt: '2026-08-17 09:55',
    responded: true, hasDunning: true, dunningUnread: false,
  },
  // D4 调研中：提交催补 → **自动撤回本次下送** → 回处理中（代表"拉回"这一类）
  {
    id: 'fd-d4', no: 'IFLYTS-20260817-00003', type: '投诉', channel: '电话',
    title: '翻录内容缺失，已下送调研核实', smartMarks: ['升级'],
    customer: '袁涛', vip: false, product: '智能录音笔 SR302',
    nodeStatus: '调研中', nodeStep: 3, nodeTotal: 5, priority: 'P1',
    slaText: '01:30:00', slaSub: '距超时', slaState: 'soon', slaMinutes: 90,
    assignee: '王坐席', tab: 'mine',
    customerPhone: '13688889999', sn: 'SN-SR302-830101', productCategory: '智能硬件',
    createdAt: '2026-08-16 11:00', updatedAt: '2026-08-17 09:30',
    responded: true,
  },
  // D5 已升级技术支持（基线 §1 ※14）：不拉回；通知**三线组员 + 抄送主责二线**。注意处理人已转到三线
  {
    id: 'fd-d5', no: 'IFLYTS-20260817-00004', type: '投诉', channel: '电话',
    title: '学习机批量固件升级失败，已升三线', smartMarks: ['升级'],
    customer: '钟磊', vip: true, customerTags: ['老师'], product: '学习机 T20',
    nodeStatus: '已升级技术支持', nodeStep: 4, nodeTotal: 5, priority: 'P0',
    slaText: '00:20:00', slaSub: '距超时', slaState: 'soon', slaMinutes: 20,
    assignee: '赵三线', tab: 'mine',
    customerPhone: '13711112222', sn: 'SN-T20-830131', productCategory: '智能硬件',
    createdAt: '2026-08-15 09:00', updatedAt: '2026-08-17 08:00',
    responded: true, upgradedByMe: true, hasDunning: true,
  },
  // D6 已升级产研（基线 §1 ※14a）：不拉回；**处理人未转移**，通知仍落二线。与 D5 成对，
  // 依据基线 §1「一跳一态」，两类升级各占一个子状态，不再靠 escalateTarget 字段区分
  {
    id: 'fd-d6', no: 'IFLYZX-20260817-00005', type: '咨询', channel: '在线客服',
    title: '离线翻译漏译，已提飞书项目待产研排查', smartMarks: ['升级'],
    customer: '孟凡', vip: false, product: '讯飞翻译机 T10', productBg: '消费者BG',
    nodeStatus: '已升级产研', nodeStep: 4, nodeTotal: 5, priority: 'P1',
    slaText: '03:00:00', slaSub: '充足', slaState: 'ok', slaMinutes: 180,
    assignee: '王坐席', tab: 'mine',
    customerPhone: '13722223333', sn: 'SN-T10-830141', productCategory: '消费电子',
    createdAt: '2026-08-14 15:00', updatedAt: '2026-08-17 09:00',
    responded: true, upgradedByMe: true,
  },
  // D7 已委派：主责不转移，通知二线、**协办人收不到**
  {
    id: 'fd-d7', no: 'IFLYZX-20260817-00006', type: '咨询', channel: '电话',
    title: '需协办人核对物流签收记录', smartMarks: [],
    customer: '田薇', vip: false, product: '智能音箱 X1',
    nodeStatus: '已委派', nodeStep: 3, nodeTotal: 5, priority: 'P2',
    slaText: '05:15:00', slaSub: '充足', slaState: 'ok', slaMinutes: 315,
    assignee: '王坐席', tab: 'mine',
    customerPhone: '13733334444', productCategory: '智能硬件',
    createdAt: '2026-08-16 09:40', updatedAt: '2026-08-17 08:20',
    responded: true, hasDelegateHistory: true,
  },
  // D8 已结案·无子单：点补充 → **新建一张承接子单**；再补一次仍落这张，不建第二张
  {
    id: 'fd-d8', no: 'IFLYZX-20260817-00007', type: '咨询', channel: '电话',
    title: '耳机配对问题已解决待回访', smartMarks: [],
    customer: '尹洁', vip: false, product: '蓝牙耳机 Air',
    nodeStatus: '已结案', nodeStep: 5, nodeTotal: 5, priority: 'P3',
    slaText: '—', slaSub: '已结案·停表', slaState: 'ok', slaMinutes: 9999,
    assignee: '王坐席', tab: 'mine',
    customerPhone: '13766667777', productCategory: '智能硬件',
    createdAt: '2026-08-10 09:00', updatedAt: '2026-08-16 16:00',
    responded: true,
  },
  // D9 已升级外投：已有子单 → 点补充**跳子单**；本单整页冻结 + 接管横幅。
  //   本单来源＝外投渠道，走的是升阶**第二跳**（内投→外投），依据基线 §1
  //   直接落子状态「已升级外投」——不再靠字段在运行时拼名。
  {
    id: 'fd-d9', no: 'IFLYTS-20260817-00008', type: '投诉', channel: '电话',
    title: '已升级为外投单，本单被接管', smartMarks: ['升级'],
    customer: '施磊', vip: false, product: '学习机 T20',
    ticketSource: '外投渠道',
    nodeStatus: '已升级外投', nodeStep: 5, nodeTotal: 5, priority: 'P0',
    slaText: '—', slaSub: '已升级外投·停表', slaState: 'ok', slaMinutes: 9999,
    assignee: '王坐席', tab: 'mine',
    escalatedToNo: 'IFLYZX-20260817-00010',
    customerPhone: '13777778888', sn: 'SN-T20-830191', productCategory: '智能硬件',
    createdAt: '2026-08-13 09:00', updatedAt: '2026-08-16 11:30',
    responded: true,
  },
  // D10 直接结案：一次性单，催补**两枚都不给**（基线 §1 ※25）。已取消行为相同，不另造单。
  //   结案方式＝**直接结案**（基线 §1「结案方式」小节）：建单即结案、从未进流程，
  //   故动作集极简——不下送、不升级、不挂起、不转派。
  {
    id: 'fd-d10', no: 'IFLYZX-20260817-00009', type: '咨询', channel: '在线客服',
    title: '一次性解答完成，建单即结案', smartMarks: [],
    customer: '范萍', vip: false, product: '企业版',
    nodeStatus: '直接结案', closureMode: '直接结案', nodeStep: 1, nodeTotal: 1, priority: 'P3',
    slaText: '—', slaSub: '直接结案', slaState: 'ok', slaMinutes: 9999,
    assignee: '王坐席', tab: 'mine',
    customerPhone: '13788889999', productCategory: '企业服务',
    createdAt: '2026-08-16 10:00', updatedAt: '2026-08-16 10:05',
    responded: true,
  },

  // ---- 已办 (done) 7+ ----
  // updatedAt 需落在「已办」默认 30 天窗内（相对 @/config/prototypeDate PROTOTYPE_TODAY）
  { serviceScore: 2,
    id: 't9', no: 'IFLYZX-20260715-00003', type: '咨询', channel: '电话',
    title: '空气净化器滤芯指示灯常亮', smartMarks: [],
    customer: '冯涛', vip: false, product: '空气净化器 P3',
    nodeStatus: '处理中', nodeStep: 2, nodeTotal: 5, priority: 'P2',
    slaText: '03:25:00', slaSub: '充足', slaState: 'ok', slaMinutes: 205,
    assignee: '陈坐席', tab: 'done', handledByMe: true, myTransferAction: true,
    customerPhone: '13700001122', sn: 'SN-P3-44102', productCategory: '智能硬件',
    createdAt: '2026-07-13 14:00', updatedAt: '2026-08-15 09:30',
  },
  {
    id: 't10', no: 'IFLYZX-20260714-00001', type: '咨询', channel: '小程序',
    title: '发票抬头修改流程', smartMarks: [],
    customer: '陈静', vip: false, customerTags: ['老师'], product: '企业版',
    nodeStatus: '未认领', nodeStep: 1, nodeTotal: 4, priority: 'P3',
    slaText: '08:00:00', slaSub: '充足', slaState: 'ok', slaMinutes: 480,
    resolveSlaText: '16:00:00', resolveSlaState: 'ok',
    assignee: '林坐席', tab: 'done', handledByMe: true, myDelegateAction: true,
    customerPhone: '13622223333', productCategory: '企业服务',
    createdAt: '2026-07-12 10:15', updatedAt: '2026-08-14 16:40',
  },
  { serviceScore: 5,
    id: 't11', no: 'IFLYSJ-20260716-00001', type: '商机', channel: '邮件',
    title: 'Webhook 推送偶发丢失', smartMarks: ['相似'],
    customer: '韩雪', vip: true, customerTags: ['自媒体'], product: '开放平台',
    nodeStatus: '已升级技术支持', nodeStep: 4, nodeTotal: 5, priority: 'P1',
    slaText: '00:35:00', slaSub: '距超时', slaState: 'soon', slaMinutes: 35,
    assignee: '陈坐席', tab: 'done', handledByMe: true, myUpgradeAction: true,
    customerPhone: '13588889999', productCategory: '开放平台',
    createdAt: '2026-07-14 11:20', updatedAt: '2026-08-16 12:00',
  },
  {
    id: 't12', no: 'IFLYTS-20260716-00002', type: '投诉', channel: 'APP',
    title: '退款迟迟未到账', smartMarks: ['情绪'],
    customer: '杨光', vip: false, product: '蓝牙耳机 Air',
    nodeStatus: '处理中', nodeStep: 3, nodeTotal: 5, priority: 'P0',
    slaText: '已超 00:25', slaSub: '已超时', slaState: 'overdue', slaMinutes: -25,
    assignee: '林坐席', tab: 'done', handledByMe: true, myForceCloseAction: true,
    customerPhone: '15833334444', sn: 'SN-AIR-88201', productCategory: '智能硬件',
    createdAt: '2026-07-15 08:00', updatedAt: '2026-08-16 15:20',
  },
  // ⬇ 以下几张停表单的 slaSub 一律写**基线 §1 的终态子状态名**。取值按该单自带的动作标记反推：
  //   `myCloseAction`（关闭工单审批通过）→ **已关闭**（基线 §1 该行「友好沟通后关闭」）；
  //   `myForceCloseAction` → 已强结；`escalatedToNo` → 已升级投诉 / 已升级外投（看原单是不是外投）；
  //   nodeStatus 本身已是终态的（如已结案）直接取它。
  {
    id: 't27', no: 'IFLYZX-20260710-00002', type: '咨询', channel: '电话',
    title: '路由器固件升级后无法联网', smartMarks: [],
    customer: '钱进', vip: false, product: '路由器 R2',
    nodeStatus: '处理中', nodeStep: 5, nodeTotal: 5, priority: 'P2',
    slaText: '—', slaSub: '已关闭·停表', slaState: 'ok', slaMinutes: 9999,
    assignee: '陈坐席', tab: 'done', handledByMe: true, myCloseAction: true,
    customerPhone: '13944445555', sn: 'SN-R2-11002', productCategory: '智能硬件',
    createdAt: '2026-07-07 09:30', updatedAt: '2026-08-10 17:00',
  },
  {
    id: 't28', no: 'IFLYTS-20260708-00002', type: '投诉', channel: '在线客服',
    title: '重复扣费问题已协调处理', smartMarks: [],
    customer: '谢婷', vip: true, customerTags: ['老师'], product: '会员服务',
    nodeStatus: '处理中', nodeStep: 5, nodeTotal: 5, priority: 'P1',
    slaText: '—', slaSub: '已关闭·停表', slaState: 'ok', slaMinutes: 9999,
    solveBreached: true,
    assignee: '林坐席', tab: 'done', handledByMe: true,
    myTransferAction: true, myCloseAction: true,
    customerPhone: '18655556666', productCategory: '会员权益',
    createdAt: '2026-07-05 13:00', updatedAt: '2026-08-08 18:30',
  },
  // ── 关闭类终态 · 两种收口原因对照（PRD §5.6.4）────────────────────────────
  // ① 正常关闭：**无派生子单**（有父关联：本单是别的单升级来的）。
  //    再来诉求 → 补充/催单走「基于原单建新单承接」（§5.2，同 Zendesk follow-up）。
  { serviceScore: 3,
    id: 't40', no: 'IFLYTS-20260709-00001', type: '投诉', channel: '电话',
    title: '学习机屏幕漏光已现场更换', smartMarks: [],
    customer: '周敏', vip: false, product: '学习机 T20',
    nodeStatus: '处理中', nodeStep: 5, nodeTotal: 5, priority: 'P2',
    slaText: '—', slaSub: '已关闭·停表', slaState: 'ok', slaMinutes: 9999,
    assignee: '王坐席', tab: 'done', handledByMe: true, myCloseAction: true,
    customerPhone: '13500002222', sn: 'SN-T20-77301', productCategory: '学习硬件',
    problemDesc: '屏幕左下角漏光，已现场更换屏幕总成并复检通过，客户确认满意。',
    escalatedFromNo: 'IFLYZX-20260707-00001', // 父关联：由咨询单升级而来
    createdAt: '2026-07-07 10:20', updatedAt: '2026-07-09 16:45',
  },
  // ② 因升级投诉而关闭：**有派生子单**（已升级为外投单）→ 原单落「已升级外投」（第二跳），
  //    处理页整页只读 + 接管横幅，
  //    补充/催单点击后引导前往新单，不再建第三张单。
  {
    id: 't41', no: 'IFLYTS-20260711-00001', type: '投诉', channel: '在线客服',
    title: '维修超期未解决客户要求赔偿', smartMarks: ['升级'],
    customer: '吴强', vip: true, product: '智能音箱 X1',
    ticketSource: '外投渠道',
    nodeStatus: '处理中', nodeStep: 5, nodeTotal: 5, priority: 'P0',
    slaText: '—', slaSub: '已升级外投·停表', slaState: 'ok', slaMinutes: 9999,
    solveBreached: true,
    assignee: '王坐席', tab: 'done', handledByMe: true, myUpgradeAction: true,
    customerPhone: '13700003333', sn: 'SN-X1-55208', productCategory: '智能硬件',
    problemDesc: '维修超期 15 天未解决，客户要求赔偿并已向 12315 投诉。',
    escalatedToNo: 'IFLYTS-20260711-00002', // 已升级为外投单 → 本单被接管
    createdAt: '2026-07-08 09:10', updatedAt: '2026-07-11 14:25',
  },
  // 升级派生出的外投新单（上面 t41 的去向，可从关系芯片/横幅跳到这里）
  { serviceScore: 5,
    id: 't42', no: 'IFLYTS-20260711-00002', type: '投诉', channel: '在线客服',
    title: '外投·维修超期未解决客户要求赔偿', smartMarks: ['升级'],
    customer: '吴强', vip: true, product: '智能音箱 X1',
    ticketSource: '外投渠道',
    nodeStatus: '已升级技术支持', nodeStep: 3, nodeTotal: 5, priority: 'P0',
    slaText: '01:12:00', slaSub: '距超时', slaState: 'soon', slaMinutes: 72,
    assignee: '王坐席', tab: 'mine', responded: true,
    customerPhone: '13700003333', sn: 'SN-X1-55208', productCategory: '智能硬件',
    problemDesc: '【升级投诉·原单 IFLYTS-20260711-00001】投诉 → 外投｜投诉平台：市场监管12315平台（编号 HM20260711008）｜客户要求赔偿并已向监管平台投诉。',
    escalatedFromNo: 'IFLYTS-20260711-00001',
    createdAt: '2026-07-11 14:25', updatedAt: '2026-07-11 15:02',
  },
  // 非诉转售后 → 售后侧关单回传 → 原单随之收口，进「已办」，行内可见关联售后单号（可跳转）
  {
    id: 't32', no: 'IFLYZX-20260716-00003', type: '咨询', channel: '电话',
    title: '扫地机器人滚刷卡死需上门维修', smartMarks: [],
    customer: '雷军', vip: false, product: '扫地机器人 R2',
    nodeStatus: '处理中', nodeStep: 5, nodeTotal: 5, priority: 'P2',
    slaText: '—', slaSub: '售后已完成', slaState: 'ok', slaMinutes: 9999,
    assignee: '陈坐席', tab: 'done', handledByMe: true, myTransferAction: true,
    linkedAftersaleNo: 'AS-20260716-38025',
    customerPhone: '13100002200', sn: 'SN-R2-77120', productCategory: '智能硬件',
    createdAt: '2026-07-16 10:20', updatedAt: '2026-08-12 15:05',
  },

  // ---- 本组工单池 (pool) 5 ----
  {
    id: 't13', no: 'IFLYZX-20260610-00011', type: '咨询', channel: '在线客服',
    title: '智能音箱无法连接 WiFi', smartMarks: [],
    customer: '何苗', vip: false, product: '智能音箱 X1',
    nodeStatus: '未认领', nodeStep: 1, nodeTotal: 5, priority: 'P2',
    slaText: '02:00:00', slaSub: '距超时', slaState: 'ok', slaMinutes: 120,
    resolveSlaText: '06:00:00', resolveSlaState: 'ok',
    assignee: null, tab: 'pool', groupId: 'line1', hasSupplement: true,
  },
  {
    id: 't14', no: 'IFLYZX-20260610-00012', type: '咨询', channel: '电话',
    title: '扫地机器人充电故障', smartMarks: [],
    customer: '罗成', vip: false, customerTags: ['校长'], product: '扫地机器人 R2',
    nodeStatus: '未认领', nodeStep: 1, nodeTotal: 5, priority: 'P1',
    slaText: '已超 00:15', slaSub: '已超时', slaState: 'overdue', slaMinutes: -15,
    resolveSlaText: '04:00:00', resolveSlaState: 'ok',
    assignee: null, tab: 'pool', groupId: 'line2', hasDunning: true,
  },
  {
    id: 't15', no: 'IFLYTS-20260610-00013', type: '投诉', channel: '小程序',
    title: '七天无理由退货咨询', smartMarks: [],
    customer: '袁媛', vip: true, customerTags: ['老师'], product: '会员服务',
    nodeStatus: '未认领', nodeStep: 1, nodeTotal: 4, priority: 'P3',
    slaText: '05:30:00', slaSub: '充足', slaState: 'ok', slaMinutes: 330,
    resolveSlaText: '12:00:00', resolveSlaState: 'ok',
    assignee: null, tab: 'pool', groupId: 'line1',
  },
  {
    id: 't29', no: 'IFLYTS-20260610-00014', type: '投诉', channel: 'APP',
    title: '屏幕花屏需返厂检测', smartMarks: ['情绪'],
    customer: '唐磊', vip: false, product: '学习机 T20',
    nodeStatus: '未认领', nodeStep: 1, nodeTotal: 5, priority: 'P0',
    slaText: '00:28:00', slaSub: '距超时', slaState: 'soon', slaMinutes: 28,
    resolveSlaText: '02:30:00', resolveSlaState: 'ok',
    assignee: null, tab: 'pool', groupId: 'hardware', hasDunning: true, hasSupplement: true,
  },
  {
    id: 't30', no: 'IFLYZX-20260610-00015', type: '咨询', channel: '电话',
    title: 'API 鉴权失败排查', smartMarks: [],
    customer: '沈悦', vip: true, customerTags: ['自媒体'], product: '开放平台',
    nodeStatus: '未认领', nodeStep: 1, nodeTotal: 5, priority: 'P1',
    slaText: '01:20:00', slaSub: '距超时', slaState: 'ok', slaMinutes: 80,
    resolveSlaText: '06:00:00', resolveSlaState: 'ok',
    assignee: null, tab: 'pool', groupId: 'line2',
  },

  // ---- @我的工单 (cc) 3 ----
  {
    id: 't16', no: 'IFLYSJ-20260609-00004', type: '商机', channel: '邮件',
    title: '批量导入用户报错', smartMarks: ['知识'],
    customer: '邓超', vip: true, customerTags: ['记者'], product: '开放平台',
    nodeStatus: '处理中', nodeStep: 3, nodeTotal: 5, priority: 'P2',
    slaText: '07:15:00', slaSub: '充足', slaState: 'ok', slaMinutes: 435,
    // 已联系：催补后坐席已回电 → 催补待回**不收**（PRD-915 补充与催单 §10.1）
    assignee: '陈坐席', tab: 'pool', mentionUnread: true, hasSupplement: true, supplementContacted: true, contactedAfterUrge: true,
  },
  {
    id: 't17', no: 'IFLYTS-20260609-00005', type: '投诉', channel: '在线客服',
    title: '账号被异常登录', smartMarks: ['升级'],
    customer: '曾琳', vip: false, product: '企业版',
    nodeStatus: '已升级技术支持', nodeStep: 4, nodeTotal: 5, priority: 'P0',
    slaText: '01:05:00', slaSub: '距超时', slaState: 'soon', slaMinutes: 65,
    assignee: '林坐席', tab: 'pool', mentionUnread: true, hasDunning: true,
  },
  {
    id: 't31', no: 'IFLYZX-20260609-00006', type: '咨询', channel: '电话',
    title: '@王坐席 请协助确认退款政策', smartMarks: [],
    customer: '白露', vip: false, customerTags: ['老师'], product: '会员服务',
    nodeStatus: '处理中', nodeStep: 2, nodeTotal: 5, priority: 'P2',
    slaText: '04:30:00', slaSub: '充足', slaState: 'ok', slaMinutes: 270,
    assignee: '陈坐席', tab: 'pool', mentionUnread: false,
  },

  // ---- 待审核 (review) 3：挂起送审 / 强结送审 / 关单送审 各 1 ----
  {
    id: 't18', no: 'IFLYZX-20260609-00001', type: '咨询', channel: '电话',
    title: '已更换主板，待审核结单', smartMarks: [],
    customer: '田野', vip: false, customerTags: ['校长'], product: '空气净化器 P3',
    nodeStatus: '申请关闭中', nodeStep: 5, nodeTotal: 5, priority: 'P2',
    slaText: '03:00:00', slaSub: '充足', slaState: 'ok', slaMinutes: 180,
    assignee: '王坐席', tab: 'review', reviewReason: '关单送审',
  },
  {
    id: 't19', no: 'IFLYZX-20260609-00002', type: '咨询', channel: '小程序',
    title: '已答复绑定流程，待审核', smartMarks: [],
    customer: '范冰', vip: false, product: '企业版',
    nodeStatus: '申请挂起中', nodeStep: 4, nodeTotal: 4, priority: 'P3',
    slaText: '09:00:00', slaSub: '充足', slaState: 'ok', slaMinutes: 540,
    assignee: '陈坐席', tab: 'review', reviewReason: '挂起送审',
  },
  {
    id: 't20', no: 'IFLYTS-20260609-00003', type: '投诉', channel: 'APP',
    title: '已确认退款金额，待审核', smartMarks: ['情绪'],
    customer: '苏洋', vip: true, customerTags: ['自媒体'], product: '蓝牙耳机 Air',
    nodeStatus: '申请强结中', nodeStep: 4, nodeTotal: 4, priority: 'P1',
    slaText: '00:48:00', slaSub: '距超时', slaState: 'soon', slaMinutes: 48,
    assignee: '王坐席', tab: 'review', reviewReason: '强结送审',
  },

  // ---- 已归档 (archived) 6 ----
  {
    id: 't21', no: 'IFLYZX-20260528-00001', type: '咨询', channel: '在线客服',
    title: '账号注销流程咨询', smartMarks: [],
    customer: '钱伟', vip: false, product: '企业版',
    nodeStatus: '已结案', nodeStep: 5, nodeTotal: 5, priority: 'P3',
    slaText: '—', slaSub: '已结案·停表', slaState: 'ok', slaMinutes: 9999,
    assignee: '王坐席', tab: 'mine', archived: true, updatedAt: '2025-05-28 16:30',
  },
  {
    id: 't22', no: 'IFLYZX-20260527-00001', type: '咨询', channel: '电话',
    title: '路由器已更换并结单', smartMarks: [],
    customer: '孔明', vip: false, product: '路由器 R2',
    nodeStatus: '已结案', nodeStep: 5, nodeTotal: 5, priority: 'P2',
    slaText: '—', slaSub: '已结案·停表', slaState: 'ok', slaMinutes: 9999,
    assignee: '陈坐席', tab: 'done', archived: true, updatedAt: '2025-05-27 11:20',
    handledByMe: true, myTransferAction: true,
  },
  {
    id: 't23', no: 'IFLYTS-20260526-00001', type: '投诉', channel: '邮件',
    title: '物流延迟投诉已解决', smartMarks: ['情绪'],
    customer: '吕布', vip: true, customerTags: ['记者'], product: '智能音箱 X1',
    nodeStatus: '已结案', nodeStep: 5, nodeTotal: 5, priority: 'P1',
    slaText: '—', slaSub: '已结案·停表', slaState: 'ok', slaMinutes: 9999,
    assignee: '林坐席', tab: 'done', archived: true, updatedAt: '2025-05-26 09:45',
    handledByMe: true, myCloseAction: true,
  },
  {
    id: 't24', no: 'IFLYTS-20260525-00001', type: '投诉', channel: 'APP',
    title: '退货退款已完成', smartMarks: [],
    customer: '貂蝉', vip: false, product: '蓝牙耳机 Air',
    nodeStatus: '已结案', nodeStep: 5, nodeTotal: 5, priority: 'P2',
    slaText: '—', slaSub: '已结案·停表', slaState: 'ok', slaMinutes: 9999,
    assignee: '王坐席', tab: 'mine', archived: true, updatedAt: '2025-05-25 14:10',
  },
  {
    id: 't25', no: 'IFLYJY-20260524-00001', type: '建议', channel: '电话',
    title: '智能门锁安装完成', smartMarks: [],
    customer: '刘备', vip: false, product: '智能门锁 L1',
    nodeStatus: '已结案', nodeStep: 5, nodeTotal: 5, priority: 'P2',
    slaText: '—', slaSub: '已结案·停表', slaState: 'ok', slaMinutes: 9999,
    assignee: '陈坐席', tab: 'done', archived: true, updatedAt: '2025-05-24 17:00',
    handledByMe: true, myDelegateAction: true,
  },
  {
    id: 't26', no: 'IFLYSJ-20260523-00001', type: '商机', channel: '邮件',
    title: 'API 鉴权问题已修复', smartMarks: ['知识'],
    customer: '孙权', vip: true, customerTags: ['自媒体'], product: '开放平台',
    nodeStatus: '已结案', nodeStep: 5, nodeTotal: 5, priority: 'P1',
    slaText: '—', slaSub: '已结案·停表', slaState: 'ok', slaMinutes: 9999,
    assignee: '林坐席', tab: 'mine', archived: true, updatedAt: '2025-05-23 10:30',
  },

  // ================================================================
  // 运营监控大盘的超时样本单 —— 共 6 张。
  //
  // 【为什么必须落在工单数据源里】运营监控是**租户级**视角，风险清单里超时最久的单
  // 天然不在本工作台的数据域内。清单原先自带一份手写单号，工单库里查不到，
  // 点进去只能静默打到默认演示单 —— 每一行打开的都是同一张单。
  //
  // 【为什么不进本工作台的任何 Tab】这批单归属**其他班组**（硬件缺陷组 / 教育支持组 /
  // 技术支持组 / 受理二组），处理人也不是本工作台的当前坐席，本工作台本就看不到它们：
  //   · `tab='done'` + `handledByMe: false` → inDoneScope 排除，Tab 徽章也不计
  //   · 无 groupId → 组池与「催补待回」两个域一律 fail-closed 排除
  //   · 在查询中心（租户级）与运营监控风险清单里可查、可点开
  //
  // 【为什么都是超时态】它们的用途只有一个：给风险清单的「超时 >72h / 24–72h」两桶
  // 提供真单。既有的在办单里没有一张挂着跨天的超时钟（最久的 t2 才超 1 小时多），
  // 拿它们充数会让「已超 96 小时」的行点开后看到一个还剩几小时的钟。
  // ================================================================
  {
    id: 'ops-1', no: 'IFLYTS-20260731-00001', type: '投诉', channel: '电话',
    title: '智能音箱返修超期未回寄', smartMarks: ['情绪'],
    customer: '吴强', vip: true, product: '智能音箱 X1',
    nodeStatus: '处理中', nodeStep: 3, nodeTotal: 5, priority: 'P0',
    slaText: '已超 96:12', slaSub: '已超时', slaState: 'overdue', slaMinutes: -5772,
    assignee: '陈坐席', tab: 'done', handledByMe: false,
    customerPhone: '13700003333', sn: 'SN-X1-55208', productCategory: '智能硬件',
    problemDesc: '送修 12 天仍未回寄，客户多次催问未获明确回寄时间。',
    latestHandling: '已催返修仓，等待物流回单，尚未给客户明确回寄时间。',
    createdAt: '2026-07-27 09:15', updatedAt: '2026-07-31 10:40',
    responded: true, solveBreached: true, hasDunning: true,
  },
  {
    id: 'ops-2', no: 'IFLYTS-20260730-00001', type: '投诉', channel: '邮件',
    title: '学习机批量激活失败未解决', smartMarks: ['升级'],
    customer: '赵敏', vip: true, customerTags: ['校长'], product: '智学网校级版',
    nodeStatus: '已升级技术支持', nodeStep: 4, nodeTotal: 5, priority: 'P0',
    slaText: '已超 88:40', slaSub: '已超时', slaState: 'overdue', slaMinutes: -5320,
    assignee: '孙坐席', tab: 'done', handledByMe: false,
    customerPhone: '13788889999', productCategory: '教育服务',
    problemDesc: '校级批量激活 320 台学习机全部失败，开学在即。',
    latestHandling: '已升三线定位授权服务，等待批量重发激活码。',
    createdAt: '2026-07-26 08:30', updatedAt: '2026-07-30 09:20',
    responded: true, solveBreached: true, upgradedByMe: true,
  },
  {
    id: 'ops-3', no: 'IFLYZX-20260731-00002', type: '咨询', channel: '邮件',
    title: '开放平台配额申请无人跟进', smartMarks: ['相似'],
    customer: '韩雪', vip: true, customerTags: ['自媒体'], product: '开放平台',
    nodeStatus: '处理中', nodeStep: 2, nodeTotal: 5, priority: 'P1',
    slaText: '已超 79:05', slaSub: '已超时', slaState: 'overdue', slaMinutes: -4745,
    assignee: '周工', tab: 'done', handledByMe: false,
    customerPhone: '13588889999', productCategory: '开放平台',
    problemDesc: '并发配额提升申请提交后三天无回复。',
    latestHandling: '申请单已流转至平台侧，暂无排期反馈。',
    createdAt: '2026-07-28 11:00', updatedAt: '2026-07-31 09:05',
    responded: true, solveBreached: true,
  },
  {
    id: 'ops-4', no: 'IFLYTS-20260802-00001', type: '投诉', channel: '电话',
    title: '扫地机器人主刷电机异响', smartMarks: ['情绪'],
    customer: '李大海', vip: false, product: '扫地机器人 R2',
    nodeStatus: '处理中', nodeStep: 3, nodeTotal: 5, priority: 'P1',
    slaText: '已超 52:18', slaSub: '已超时', slaState: 'overdue', slaMinutes: -3138,
    assignee: '陈坐席', tab: 'done', handledByMe: false,
    customerPhone: '13912345678', sn: 'SN-R2-882910', productCategory: '智能硬件',
    problemDesc: '主刷电机运转时持续金属异响，清理滚刷无改善。',
    latestHandling: '已判定需更换电机总成，配件在途未到货。',
    createdAt: '2026-07-31 14:20', updatedAt: '2026-08-02 10:15',
    responded: true, solveBreached: true,
  },
  {
    id: 'ops-5', no: 'IFLYZX-20260802-00002', type: '咨询', channel: '邮件',
    title: 'API 网关 502 间歇性报错', smartMarks: ['相似', '知识'],
    customer: '赵敏', vip: true, customerTags: ['校长'], product: '开放平台',
    nodeStatus: '已升级技术支持', nodeStep: 4, nodeTotal: 5, priority: 'P0',
    slaText: '已超 41:06', slaSub: '已超时', slaState: 'overdue', slaMinutes: -2466,
    assignee: '周工', tab: 'done', handledByMe: false,
    customerPhone: '13788889999', productCategory: '开放平台',
    problemDesc: '网关间歇性返回 502，影响校端成绩同步任务。',
    latestHandling: '已升三线抓包，怀疑上游连接池耗尽，待复现。',
    createdAt: '2026-07-31 16:40', updatedAt: '2026-08-02 08:50',
    responded: true, solveBreached: true, upgradedByMe: true,
  },
  {
    id: 'ops-6', no: 'IFLYZX-20260802-00003', type: '咨询', channel: '小程序',
    title: '发票重开申请未处理', smartMarks: [],
    customer: '陈静', vip: false, customerTags: ['老师'], product: '企业版',
    nodeStatus: '处理中', nodeStep: 2, nodeTotal: 5, priority: 'P2',
    slaText: '已超 33:47', slaSub: '已超时', slaState: 'overdue', slaMinutes: -2027,
    assignee: '林坐席', tab: 'done', handledByMe: false,
    productCategory: '企业服务',
    problemDesc: '抬头开错需作废重开，财务侧迟迟未回。',
    latestHandling: '已提交财务作废申请，等待重开。',
    createdAt: '2026-07-31 09:30', updatedAt: '2026-08-02 09:10',
    responded: true, solveBreached: true,
  },
];

/** 列表速览：问题描述 + 最新处理结果（按工单 id 合并，便于坐席快速扫读） */
const TICKET_BRIEFS: Record<string, { problemDesc: string; latestHandling: string }> = {
  t1: { problemDesc: '在线音乐频繁自动跳过当前歌曲，重启无效', latestHandling: '已远程升级固件并复测，观察中' },
  t2: { problemDesc: '扫地机器人无法开机、指示灯不亮，重启无效', latestHandling: '已指导强制重启与充电检测，疑似主板供电故障' },
  t3: { problemDesc: '企业版功能咨询，需客户补充账号与场景信息', latestHandling: '已挂起，等待客户补充材料后继续' },
  t4: { problemDesc: 'API 调用频繁返回 429 限流，影响集成', latestHandling: '已升级二线，建议提升配额并优化调用频率' },
  t5: { problemDesc: '收到商品与页面描述不符，要求退货', latestHandling: '已核实订单，引导提交退货申请、待审核' },
  t6: { problemDesc: '希望预约工程师上门安装智能门锁', latestHandling: '未认领，尚未安排' },
  t7: { problemDesc: '咨询会员续费优惠的领取方式', latestHandling: '已发送续费优惠领取指引' },
  t8: { problemDesc: '投诉客服响应慢，要求加急处理', latestHandling: '已致歉并标记加急，安排优先跟进' },
  t9: { problemDesc: '空气净化器滤芯指示灯常亮，更换后仍亮', latestHandling: '已指导复位滤芯计数，待客户反馈' },
  t10: { problemDesc: '咨询如何修改已开具发票的抬头', latestHandling: '未认领，尚未安排' },
  t11: { problemDesc: 'Webhook 推送偶发丢包', latestHandling: '已升级二线，建议开启重试与签名校验' },
  t12: { problemDesc: '投诉退款长时间未到账', latestHandling: '已联系财务核查流水，预计 1 个工作日反馈' },
  t13: { problemDesc: '智能音箱无法连接 WiFi', latestHandling: '未认领，尚未安排' },
  t14: { problemDesc: '扫地机器人无法充电', latestHandling: '未认领，尚未安排' },
  t15: { problemDesc: '咨询七天无理由退货政策与流程', latestHandling: '未认领，尚未安排' },
  t16: { problemDesc: '批量导入用户时报错、无法完成', latestHandling: '已收集报错日志，排查模板字段' },
  t17: { problemDesc: '账号出现异地异常登录，担心被盗', latestHandling: '已升级二线安全组，建议改密并开二次验证' },
  t18: { problemDesc: '设备主板故障，已更换待审核', latestHandling: '已更换主板并复测正常，提交结单审核' },
  t19: { problemDesc: '咨询企业微信账号绑定流程', latestHandling: '已答复绑定流程，提交结单审核' },
  t20: { problemDesc: '退款金额存在争议，已与客户确认', latestHandling: '已确认退款金额，提交审核' },
  t21: { problemDesc: '咨询账号注销的流程与影响', latestHandling: '已发送注销流程说明' },
  t22: { problemDesc: '路由器硬件故障无法使用', latestHandling: '已上门更换路由器，客户验收通过' },
  t23: { problemDesc: '投诉物流长时间未送达', latestHandling: '已协调物流加急，已签收' },
  t24: { problemDesc: '商品质量问题申请退货退款', latestHandling: '已完成退货退款' },
  t25: { problemDesc: '预约上门安装智能门锁', latestHandling: '已上门安装完成，功能正常' },
  t27: { problemDesc: '路由器固件升级后无法联网', latestHandling: '已指导回退固件，待客户验证' },
  t28: { problemDesc: '被重复扣费，要求退还', latestHandling: '已确认重复扣费，已发起退款' },
  t32: { problemDesc: '扫地机器人滚刷卡死、异响，需上门维修', latestHandling: '非诉转售后，关联售后单 AS-20260716-38025（上门维修）已完成并回传关闭，客服单随之关闭' },
  t33: { problemDesc: '录音笔充电无反应，指示灯不亮，需寄修检测', latestHandling: '已转售后寄修，关联售后单 AS-20260722-38104（寄修检测）· 售后状态：处理中，等待售后处理结果' },
  t29: { problemDesc: '屏幕出现花屏，需返厂检测', latestHandling: '未认领，尚未安排' },
  t30: { problemDesc: '客户 API 鉴权失败，无法调用', latestHandling: '未认领，尚未安排' },
  t31: { problemDesc: '同事 @ 请求协助确认退款政策', latestHandling: '待确认退款政策口径' },
};

/** 新建工单表单字段（列表可选列展示） */
const TICKET_FORM_FIELDS: Record<
  string,
  {
    businessType: string;
    problemL1: string;
    problemL2: string;
    problemL3: string;
    resolveTimeRemark: string;
  }
> = {
  t1: {
    businessType: '翻录',
    problemL1: '功能异常',
    problemL2: '播放问题',
    problemL3: '在线播放',
    resolveTimeRemark: '希望今日内恢复播放',
  },
  t2: {
    businessType: '学习机',
    problemL1: '设备故障',
    problemL2: '无法开机',
    problemL3: '无响应',
    resolveTimeRemark: '明日 12:00 前上门',
  },
  t5: {
    businessType: '学习机',
    problemL1: '功能异常',
    problemL2: '播放问题',
    problemL3: '无法播放',
    resolveTimeRemark: '3 个工作日内退款',
  },
  t6: {
    businessType: '学习机',
    problemL1: '设备故障',
    problemL2: '网络',
    problemL3: 'WiFi 连不上',
    resolveTimeRemark: '预约周六上午上门',
  },
};

/** 路由分组名称（可多选，如翻录咨询 / 翻录投诉 / 技术支持） */
const TICKET_GROUP_NAMES: Record<string, string[]> = {
  t1: ['翻录投诉', '技术支持'],
  t2: ['翻录咨询'],
  t4: ['翻录商机', '技术支持'],
  t5: ['学习机投诉'],
  t7: ['智学网咨询', '翻录咨询'],
  t8: ['翻录投诉', '技术支持'],
  t11: ['学习机投诉', '技术支持'],
  t13: ['翻录咨询'],
  t14: ['翻录投诉'],
  t17: ['学习机咨询', '技术支持'],
};

/** 产品五级归属（查询中心 BGBU/业务线/产品线筛选 Mock） */
const TICKET_PRODUCT_HIERARCHY: Record<
  string,
  { businessLine?: string; productLine?: string; productBg?: string }
> = {
  't-feishu': { productBg: '消费者BG', businessLine: '智能硬件业务线', productLine: '翻译机产品线' },
  t1: { productBg: '消费者BG', businessLine: '智能硬件业务线', productLine: '录音笔产品线' },
  t2: { productBg: '消费者BG', businessLine: '智能硬件业务线', productLine: '录音笔产品线' },
  t5: { productBg: '教育事业群', businessLine: '学习机业务线', productLine: '课堂产品线' },
  t6: { productBg: '教育事业群', businessLine: '学习机业务线', productLine: '课堂产品线' },
  t7: { productBg: '教育事业群', businessLine: '智学网业务线', productLine: '课堂产品线' },
};

/** 查询中心列表扩展字段 Mock */
const TICKET_LIST_EXTRAS: Record<
  string,
  Partial<import('@/views/tickets/types/ticket').Ticket>
> = {
  't-feishu': {
    synced: true,
    feishuSync: 'synced',
    lastHandler: '王坐席',
    lastHandledAt: '2026-07-13 10:05',
    upgradeCount: 1,
    appointmentAt: '2026-07-14 15:00',
    riskWeight: 62,
    supplementPendingCount: 0,
    supplementDoneCount: 1,
  },
  t1: {
    synced: true,
    feishuSync: 'feedback',
    lastHandler: '王坐席',
    lastHandledAt: '2026-06-10 14:30',
    upgradeCount: 2,
    riskWeight: 88,
    supplementPendingCount: 0,
    supplementDoneCount: 0,
  },
  t2: {
    synced: false,
    feishuSync: 'none',
    lastHandler: '李大海',
    lastHandledAt: '2026-06-10 16:02',
    upgradeCount: 0,
    riskWeight: 95,
    supplementPendingCount: 1,
    supplementDoneCount: 0,
  },
  t5: {
    synced: false,
    feishuSync: 'failed',
    lastHandler: '王坐席',
    lastHandledAt: '2026-06-11 09:20',
    upgradeCount: 1,
    appointmentAt: '2026-06-12 10:00',
    riskWeight: 74,
    supplementPendingCount: 2,
    supplementDoneCount: 1,
  },
};

function defaultListExtras(t: Ticket): Partial<Ticket> {
  const upgradeCount = (t.escalatedFromNo || t.upgradedByMe ? 1 : 0) + (t.escalatedToNo ? 1 : 0);
  const supplementPendingCount = t.hasSupplement && !t.supplementContacted ? 1 : 0;
  const supplementDoneCount = t.hasSupplement && t.supplementContacted ? 1 : 0;
  const riskWeight =
    t.priority === 'P0' ? 90 : t.priority === 'P1' ? 70 : t.priority === 'P2' ? 45 : 25;
  return {
    feishuSync: 'none',
    synced: false,
    lastHandler: t.assignee ?? undefined,
    lastHandledAt: t.updatedAt,
    upgradeCount,
    supplementPendingCount,
    supplementDoneCount,
    riskWeight,
  };
}

/** 从单号 {类型前缀}-YYYYMMDD-序号 推断建单时间（mock 缺字段时补全） */
function inferCreatedAtFromNo(no: string): string {
  const m = no.match(/^IFLY[A-Z]{2}-(\d{4})(\d{2})(\d{2})-/i);
  if (!m) return '2026-06-10 09:00';
  return `${m[1]}-${m[2]}-${m[3]} 09:00`;
}

function ensureTicketTimestamps(t: Ticket): Pick<Ticket, 'createdAt' | 'updatedAt'> {
  const createdAt = t.createdAt ?? inferCreatedAtFromNo(t.no);
  const updatedAt = t.updatedAt ?? createdAt;
  return { createdAt, updatedAt };
}

export const TICKETS: Ticket[] = BASE_TICKETS.map((t) => {
  const row = {
    ...defaultListExtras(t),
    ...t,
    ...(TICKET_BRIEFS[t.id] ?? {}),
    ...(TICKET_FORM_FIELDS[t.id] ?? {}),
    ...(TICKET_GROUP_NAMES[t.id] ? { groupNames: TICKET_GROUP_NAMES[t.id] } : {}),
    ...(TICKET_PRODUCT_HIERARCHY[t.id] ?? {}),
    ...(TICKET_LIST_EXTRAS[t.id] ?? {}),
    // 显式写了来源的（售后转入 / 跨组调剂）保留原值，只有没写的才按渠道推。
    // 之前这里无条件覆盖，把「售后转入」冲成了「热线电话」——看板「转入」下钻筛不出单、
    // 升级投诉门禁①与转售后的激活分支也都判不出来
    ticketSource: t.ticketSource ?? mapChannelToSource(t.channel),
  } as Ticket;
  return { ...row, ...ensureTicketTimestamps(row) };
});
