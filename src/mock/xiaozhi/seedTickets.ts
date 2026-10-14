/**
 * 小智工单 · 工单库在办 / 已办样本（1130 小智工单）。
 *
 * 四条路径各一张（D5 / D8 / D9 / D21）：
 * ① 人工跟进中（进池已领、小智坐席在办）；
 * ② 直通产研待回传（「创建并流转」→ 系统自动流转，本单「已升级产研」、处理人不转移，D6）；
 * ③ 产研办结已关单（回传即自动关单 + 自动下送调研，不论解没解决，D9）；
 * ④ 产研驳回待二次提交（驳回落标记、允许二次提交产研，D8）。
 *
 * 并入工单库的位置：`mock/tickets.ts` 的 `TICKETS`；履历由小智服务 `stores/xiaozhi.ts` 装载。
 */
import type { Ticket } from '@/views/tickets/types/ticket';
import type { FeishuRecord } from '@/mock/ticketDetail';
import type { TimelineEntry, TlAction, TlCategory, TlRole } from '@/views/tickets/types/ticketDetail';
import { TICKET_NO_PREFIX } from '@/constants/ticketNo';
import { ESCALATE_CHANNEL_TPD } from '@/views/tickets/composables/opActions';
import {
  XIAOZHI_BUSINESS_TYPE, XIAOZHI_POOL_GROUP_ID, XIAOZHI_POOL_GROUP_NAME,
  XIAOZHI_PROBLEM_CATEGORIES, XIAOZHI_SLA_IDLE, XIAOZHI_SYSTEM_HANDLER,
  XIAOZHI_TICKET_SOURCE, XIAOZHI_TICKET_TYPE, XIAOZHI_TL,
  xiaozhiRdTitle, xiaozhiReceiverOf,
  type TicketXiaozhi, type XiaozhiRdInfo, type XiaozhiRdPriority,
} from '@/views/tickets/types/xiaozhi';

export interface XiaozhiSeedBundle {
  tickets: Ticket[];
  /** 工单号 → 小智链路履历（时间正序） */
  timelines: Record<string, TimelineEntry[]>;
}

const DAY = '20260918';
/** 小智单沿用咨询单号（D1） */
const no = (n: number) => `${TICKET_NO_PREFIX[XIAOZHI_TICKET_TYPE]}-${DAY}-${String(n).padStart(5, '0')}`;

/** 小智坐席（演示用户，见 `mock/users.ts`） */
const AGENT = '谭小智';
const AGENT_ROLE: TlRole = '小智坐席';
/** 提问人（校代 / 渠道商，调研发给他本人，D12） */
const REPORTER = '合肥八中 · 李校代';

const PROBLEM_CATEGORY = XIAOZHI_PROBLEM_CATEGORIES[0];

let tlSeq = 0;
function tl(
  when: string,
  category: TlCategory,
  action: TlAction,
  who: string,
  role: TlRole,
  how: string,
  what: string,
  extra: Partial<TimelineEntry> = {},
): TimelineEntry {
  tlSeq += 1;
  return { id: `xiaozhi-seed-${tlSeq}`, category, action, who, role, how, when, what, ...extra };
}

let rdSeq = 0;
function rd(
  kind: FeishuRecord['kind'],
  title: string,
  content: string,
  who: string,
  side: FeishuRecord['side'],
  when: string,
  extra: Partial<FeishuRecord> = {},
): FeishuRecord {
  rdSeq += 1;
  return { id: `xz-rd-seed-${rdSeq}`, kind, title, content, who, side, when, ...extra };
}

function rdInfo(module: string, priority: XiaozhiRdPriority, frontlineAccount = 'tanxiaozhi'): XiaozhiRdInfo {
  return {
    module,
    receiver: xiaozhiReceiverOf(module),
    priority,
    frontlineAccount,
    attachments: [],
  };
}

/** 列表行公共字段（小智单一律 咨询 + 小智标识 + 来源 IM + 教育 + 一个大组） */
function row(
  n: number,
  p: {
    title: string;
    customer: string;
    phone: string;
    productCategory: string;
    productName: string;
    problemL1: string;
    problemL2: string;
    problemL3: string;
    problemDesc: string;
    xiaozhi: TicketXiaozhi;
  } & Pick<Ticket, 'nodeStatus' | 'assignee' | 'tab' | 'slaText' | 'slaSub' | 'slaState' | 'slaMinutes' | 'createdAt' | 'updatedAt'>
    & Partial<Ticket>,
): Ticket {
  const { customer, phone, xiaozhi, ...rest } = p;
  return {
    id: `xiaozhi-${n}`,
    no: no(n),
    product: p.productName,
    // 小智工单＝咨询单 + 「小智工单」标识（D1）
    type: XIAOZHI_TICKET_TYPE,
    isXiaozhi: true,
    // 来源渠道统一记 IM（D24）；列表「渠道」列对应「在线客服」
    channel: '在线客服',
    ticketSource: XIAOZHI_TICKET_SOURCE,
    smartMarks: [],
    customer,
    vip: false,
    customerPhone: phone,
    businessType: XIAOZHI_BUSINESS_TYPE,
    priority: 'P2',
    nodeStep: 2,
    nodeTotal: 5,
    // 分派＝一个大组、进池自己领（D21）
    groupId: XIAOZHI_POOL_GROUP_ID,
    groupNames: [XIAOZHI_POOL_GROUP_NAME],
    responded: true,
    ...rest,
    xiaozhi,
  };
}

export function buildXiaozhiSeeds(): XiaozhiSeedBundle {
  tlSeq = 0;
  rdSeq = 0;
  const tickets: Ticket[] = [];
  const timelines: Record<string, TimelineEntry[]> = {};

  /* ① 人工跟进中：进池已领，小智坐席在办，未转产研 */
  const t1 = row(1, {
    title: '智批改 · 批阅结果未返回 · IM',
    customer: REPORTER,
    phone: '13905510001',
    productCategory: '软件服务',
    productName: '智学网会员',
    problemL1: '功能异常',
    problemL2: '播放问题',
    problemL3: '在线播放',
    problemDesc: '一场考试设置了智批改，有几题一直未批阅，需要核实批阅任务是否下发。',
    nodeStatus: '处理中',
    assignee: AGENT,
    tab: 'mine',
    ...XIAOZHI_SLA_IDLE,
    createdAt: '2026-09-18 09:42',
    updatedAt: '2026-09-18 10:20',
    xiaozhi: { problemCategory: PROBLEM_CATEGORY, rdSync: 'none', rdRecords: [], rdResubmitCount: 0 },
  });
  tickets.push(t1);
  timelines[t1.no] = [
    tl('2026-09-18 09:42:10', 'node', 'create', AGENT, AGENT_ROLE, '建单', XIAOZHI_TL.create(XIAOZHI_TICKET_SOURCE)),
    tl('2026-09-18 09:55:02', 'node', 'accept', AGENT, AGENT_ROLE, '领取', `${AGENT} 从${XIAOZHI_POOL_GROUP_NAME}工单池领取本单。`),
    tl('2026-09-18 10:20:31', 'handle', 'handle', AGENT, AGENT_ROLE, '工单处理', '已联系校代核实考试编号与题号，待确认批阅任务下发情况。'),
  ];

  /* ② 直通产研待回传：「创建并流转」→ 系统自动流转，本单「已升级产研」、处理人不转移（D6） */
  const rd2 = rdInfo('智批改', '普通加急');
  const t2 = row(2, {
    title: '智批改 · 批阅任务未下发 · IM',
    customer: '阜阳一中 · 王校代',
    phone: '13905510002',
    productCategory: '软件服务',
    productName: '智学网会员',
    problemL1: '功能异常',
    problemL2: '播放问题',
    problemL3: '无法播放',
    problemDesc: '智批改批阅任务整场未下发，影响当天阅卷进度，需产研定位。',
    nodeStatus: '已升级产研',
    // 一·补 B2：「创建并流转」那一支的处理人＝系统，不经领取
    assignee: XIAOZHI_SYSTEM_HANDLER,
    tab: 'mine',
    ...XIAOZHI_SLA_IDLE,
    createdAt: '2026-09-18 11:05',
    updatedAt: '2026-09-18 11:06',
    xiaozhi: {
      problemCategory: PROBLEM_CATEGORY,
      rd: rd2,
      rdSync: 'synced',
      rdFeedbackNo: 'TPD-20260918-2041',
      rdResubmitCount: 0,
      rdRecords: [
        rd('push', `已推送${ESCALATE_CHANNEL_TPD}`,
          `产研单标题：${xiaozhiRdTitle(rd2.module)}；产品模块：${rd2.module}；接收人：${rd2.receiver}；优先级：${rd2.priority}`,
          '系统', '客服工单', '2026-09-18 11:05:48', { meta: 'TPD-20260918-2041' }),
        rd('feedback', '产研处理中', '已复现，定位中', '张冬', '产研侧', '2026-09-18 14:30:12', { meta: 'TPD-20260918-2041' }),
      ],
    },
  });
  tickets.push(t2);
  timelines[t2.no] = [
    tl('2026-09-18 11:05:12', 'node', 'create', AGENT, AGENT_ROLE, '建单', XIAOZHI_TL.create(XIAOZHI_TICKET_SOURCE)),
    tl('2026-09-18 11:05:48', 'node', 'escalate', '系统', '系统', '系统自动流转',
      XIAOZHI_TL.autoEscalate(ESCALATE_CHANNEL_TPD, xiaozhiRdTitle(rd2.module)), { systemActor: true }),
    tl('2026-09-18 14:30:12', 'node', 'relate', '系统', '系统', '产研回传',
      XIAOZHI_TL.rdProgress('张冬', '已复现，定位中'), { systemActor: true }),
  ];

  /* ③ 产研办结已关单：回传即自动关单 + 自动下送调研（D9 / D10 / D11） */
  const rd3 = rdInfo('智能阅卷', '紧急');
  const t3 = row(3, {
    title: '智能阅卷 · 成绩同步缺失 · IM',
    customer: '六安二中 · 陈校代',
    phone: '13905510003',
    productCategory: '软件服务',
    productName: '智学网会员',
    problemL1: '账号问题',
    problemL2: '权益',
    problemL3: '订单未同步',
    problemDesc: '智能阅卷成绩同步到学情分析缺少两个班，产研核查后给出结论。',
    nodeStatus: '已结案',
    // 人工跟进后再转产研的那一支：处理人照旧是跟进人（一·补 B2 只改自动流转那一支）
    assignee: AGENT,
    tab: 'done',
    ...XIAOZHI_SLA_IDLE,
    createdAt: '2026-09-17 09:12',
    updatedAt: '2026-09-17 16:48',
    xiaozhi: {
      problemCategory: PROBLEM_CATEGORY,
      rd: rd3,
      rdSync: 'closed',
      rdFeedbackNo: 'TPD-20260917-1832',
      rdResubmitCount: 0,
      rdSolutionType: '问题',
      rdIssueResult: { solution: '同步任务重跑后两个班成绩已补齐，根因为任务分片超时。', solvedAt: '2026-09-17 16:40' },
      rdRecords: [
        rd('push', `已推送${ESCALATE_CHANNEL_TPD}`,
          `产研单标题：${xiaozhiRdTitle(rd3.module)}；产品模块：${rd3.module}；接收人：${rd3.receiver}；优先级：${rd3.priority}`,
          AGENT, '客服工单', '2026-09-17 10:26:03', { meta: 'TPD-20260917-1832' }),
        rd('result', '产研办结', '同步任务重跑后两个班成绩已补齐，根因为任务分片超时。',
          '吕工', '产研侧', '2026-09-17 16:48:20', {
            meta: 'TPD-20260917-1832',
            result: '同步任务重跑后两个班成绩已补齐，根因为任务分片超时。',
            conclusion: '问题类办结',
          }),
      ],
    },
  });
  tickets.push(t3);
  timelines[t3.no] = [
    tl('2026-09-17 09:12:08', 'node', 'create', AGENT, AGENT_ROLE, '建单', XIAOZHI_TL.create(XIAOZHI_TICKET_SOURCE)),
    tl('2026-09-17 09:30:44', 'node', 'accept', AGENT, AGENT_ROLE, '领取', `${AGENT} 从${XIAOZHI_POOL_GROUP_NAME}工单池领取本单。`),
    tl('2026-09-17 10:05:19', 'handle', 'handle', AGENT, AGENT_ROLE, '工单处理', '核实为两个班成绩未同步，自查无配置问题，转产研定位。'),
    tl('2026-09-17 10:26:03', 'node', 'escalate', AGENT, AGENT_ROLE, '升级',
      XIAOZHI_TL.autoEscalate(ESCALATE_CHANNEL_TPD, xiaozhiRdTitle(rd3.module))),
    tl('2026-09-17 16:48:20', 'node', 'resolved', '系统', '系统', '产研回传', XIAOZHI_TL.rdSettled('问题'), { systemActor: true }),
    tl('2026-09-17 16:48:21', 'comm', 'sms', '系统', '系统', '短信', `已向提问人发送满意度调研短信（工单号：${no(3)}）`, { systemActor: true }),
  ];

  /* ④ 产研驳回待二次提交：驳回落标记、允许二次提交产研（D8） */
  const rd4 = rdInfo('扫描', '普通');
  const t4 = row(4, {
    title: '扫描 · 答题卡识别偏移 · IM',
    customer: '滁州三中 · 赵校代',
    phone: '13905510004',
    productCategory: '软件服务',
    productName: '智学网会员',
    problemL1: '设备故障',
    problemL2: '网络',
    problemL3: 'WiFi 连不上',
    problemDesc: '批量扫描答题卡出现识别偏移，产研回传驳回，要求补充样例与扫描仪型号。',
    nodeStatus: '已升级产研',
    // 一·补 B2：本单也是「创建并流转」建的，处理人＝系统
    assignee: XIAOZHI_SYSTEM_HANDLER,
    tab: 'mine',
    ...XIAOZHI_SLA_IDLE,
    createdAt: '2026-09-18 08:30',
    updatedAt: '2026-09-18 15:12',
    xiaozhi: {
      problemCategory: PROBLEM_CATEGORY,
      rd: rd4,
      rdSync: 'rejected',
      rdRejected: true,
      rdFeedbackNo: 'TPD-20260918-1907',
      rdResubmitCount: 0,
      rdRecords: [
        rd('push', `已推送${ESCALATE_CHANNEL_TPD}`,
          `产研单标题：${xiaozhiRdTitle(rd4.module)}；产品模块：${rd4.module}；接收人：${rd4.receiver}；优先级：${rd4.priority}`,
          '系统', '客服工单', '2026-09-18 08:30:52', { meta: 'TPD-20260918-1907' }),
        rd('reject', '产研驳回', '描述不足以定位：请补充偏移样例图与扫描仪型号后再提交。',
          '王爽', '产研侧', '2026-09-18 15:12:40', {
            meta: 'TPD-20260918-1907',
            cause: '描述不足以定位：请补充偏移样例图与扫描仪型号后再提交。',
          }),
      ],
    },
  });
  tickets.push(t4);
  timelines[t4.no] = [
    tl('2026-09-18 08:30:11', 'node', 'create', AGENT, AGENT_ROLE, '建单', XIAOZHI_TL.create(XIAOZHI_TICKET_SOURCE)),
    tl('2026-09-18 08:30:52', 'node', 'escalate', '系统', '系统', '系统自动流转',
      XIAOZHI_TL.autoEscalate(ESCALATE_CHANNEL_TPD, xiaozhiRdTitle(rd4.module)), { systemActor: true }),
    tl('2026-09-18 15:12:40', 'node', 'relate', '系统', '系统', '产研回传',
      XIAOZHI_TL.rdRejected('描述不足以定位：请补充偏移样例图与扫描仪型号后再提交。'), { systemActor: true }),
  ];

  return { tickets, timelines };
}

export const XIAOZHI_SEEDS: XiaozhiSeedBundle = buildXiaozhiSeeds();
