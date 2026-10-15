/**
 * 小智工单 · 工单库在办 / 已办样本（1130 小智工单）。
 *
 * 八张，覆盖各条路径（D5 / D21 / 一·补 B5 / B7 / B8 / B9 / B24 / PRD §5.4）：
 * ① **待响应**（进池已领、还没动手；基线 §1 L25）；
 * ② 直通产研待回传（「创建并流转」→ 系统自动流转，本单「已升级产研」、处理人不转移，D6）；
 * ③ 产研已办结 · **待校代确认**（B5：办结**不关单**，状态仍「已升级产研」）；
 * ④ 校代**确认已解决** → 关单 + 下送调研，处理人统一改系统（B5① / B9）；
 * ⑤ 校代**确认未解决** → 状态不动，系统自动回传产研，记「第 N 次回传产研」（B5② / B8）；
 * ⑥ **超 N 天未确认** → 装载时判「视为已解决」，自动结案 + 下送调研（B7）；
 * ⑦ 人工跟进中 · **已自查一轮、尚未升级** —— 「人工升级 · 产研」的演示入口（PRD §5.4）；
 * ⑧ **未认领** —— 躺在工单池里等人领，「领取 → 处理中」那一步的演示入口（D21）。
 *
 * 🔴 **校代确认只由种子体现，页面上没有「模拟确认」按钮** —— 确认动作发生在小智工单应用里
 * （B6），工单系统侧只接结果，原型没有校代端。③④⑤ 正是「未确认 / 确认是 / 确认否」三种结果。
 *
 * 🔴 **没有「产研驳回」样本**：TPD 的驳回本轮只写处理履历、不驱动状态、无按钮（待沟通项 T1），
 * 做成种子会在页面上摆出一个点不动也走不下去的状态档，反而像实现了。接口层能力在
 * `stores/xiaozhi.ts` 的 `receiveRdReject` 里留着。
 *
 * ③⑥ 的时刻**相对装载时刻算**（形制照刷机种子 ⑲）：③ 要停在「未确认」，⑥ 要已经超过
 * `XIAOZHI_CONFIRM_TIMEOUT_DAYS`。写死日期的话，种子一旦放久，③ 也会被 B7 的对账结掉。
 *
 * 并入工单库的位置：`mock/tickets.ts` 的 `TICKETS`；履历由小智服务 `stores/xiaozhi.ts` 装载。
 */
import type { Ticket } from '@/views/tickets/types/ticket';
import type { FeishuRecord } from '@/mock/ticketDetail';
import type { TimelineEntry, TlAction, TlCategory, TlRole } from '@/views/tickets/types/ticketDetail';
import { TICKET_NO_PREFIX } from '@/constants/ticketNo';
import { ESCALATE_CHANNEL_TPD } from '@/views/tickets/composables/opActions';
import {
  XIAOZHI_BUSINESS_TYPE, XIAOZHI_CONFIRM_TIMEOUT_DAYS, XIAOZHI_POOL_GROUP_ID, XIAOZHI_POOL_GROUP_NAME,
  XIAOZHI_SLA_IDLE, XIAOZHI_SYSTEM_HANDLER,
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
/**
 * 提报人（**称谓照一·补 B19 一律叫「提报人」**；实际人群是校代与渠道商两类）。
 * 调研发给他本人（D12），B5 的「是否解决」确认也由他做。
 * ⚠️ 下面几条种子的 `customer` 是**人名数据**（「李校代」「王校代」是姓 + 职务的叫法），
 * 不是称谓用词 —— B19 管的是规格文案里怎么称呼这个角色，不是把客户名字也改掉。
 */
const REPORTER = '合肥八中 · 李校代';

/** `YYYY-MM-DD HH:mm:ss` */
function stamp(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

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

/**
 * 一线人员域账号（一·补 B24：**建单必填**，六张种子一张不落）。
 * 它是提报人登录小智工单应用做确认的凭据（B6），故**每张单一个**、不共用 ——
 * 六张单的提报人本来就是六个不同的人，共用一个账号等于说他们是同一个人。
 */
const FRONTLINE_ACCOUNTS: Record<number, string> = {
  1: 'lixiaodai', 2: 'wangxiaodai', 3: 'chenxiaodai',
  4: 'lixiaodai', 5: 'zhaoxiaodai', 6: 'zhouxiaodai', 7: 'sunxiaodai', 8: 'wuxiaodai',
};

function rdInfo(module: string, priority: XiaozhiRdPriority, frontlineAccount: string): XiaozhiRdInfo {
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

export function buildXiaozhiSeeds(nowMs: number): XiaozhiSeedBundle {
  tlSeq = 0;
  rdSeq = 0;
  const HOUR = 3_600_000;
  const DAY_MS = 24 * HOUR;
  const tickets: Ticket[] = [];
  const timelines: Record<string, TimelineEntry[]> = {};

  /**
   * ① **待响应** —— 进池已领、**还没动手**（基线 §1 L25：认领后未保存、未打电话、未发短信、未发邮件）。
   *
   * ⚠️ 原先它是「处理中」且履历里带一条「工单处理」登记 —— 那两者按新口径是**自相矛盾**的：
   * 有处理登记就说明已经响应过、该是「处理中」；要它当「待响应」的样本，就不能带那条登记。
   * 故这张单的履历只剩**建单 + 领取**两条，`responded: false`，`updatedAt` 回到领取时刻。
   * 「自查完、该交产研」那个场景由 ⑦ 承担（它保留处理登记、维持「处理中」）。
   */
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
    nodeStatus: '待响应',
    assignee: AGENT,
    tab: 'mine',
    // 领取不算响应（基线 §7 L728：判定动作集＝保存 / 电话 / 短信 / 邮件）
    responded: false,
    nodeStep: 1,
    ...XIAOZHI_SLA_IDLE,
    createdAt: '2026-09-18 09:42',
    updatedAt: '2026-09-18 09:55',
    xiaozhi: { frontlineAccount: FRONTLINE_ACCOUNTS[1], rdSync: 'none', rdRecords: [], rdReturnCount: 0 },
  });
  tickets.push(t1);
  timelines[t1.no] = [
    tl('2026-09-18 09:42:10', 'node', 'create', AGENT, AGENT_ROLE, '建单', XIAOZHI_TL.create(XIAOZHI_TICKET_SOURCE)),
    tl('2026-09-18 09:55:02', 'node', 'accept', AGENT, AGENT_ROLE, '领取', `${AGENT} 从${XIAOZHI_POOL_GROUP_NAME}工单池领取本单。`),
  ];

  /* ② 直通产研待回传：「创建并流转」→ 系统自动流转，本单「已升级产研」、处理人不转移（D6） */
  const rd2 = rdInfo('智批改', '普通加急', FRONTLINE_ACCOUNTS[2]);
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
      frontlineAccount: FRONTLINE_ACCOUNTS[2],
      rd: rd2,
      rdSync: 'synced',
      rdFeedbackNo: 'TPD-20260918-2041',
      rdReturnCount: 0,
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

  /**
   * ③ 产研已办结 · **待校代确认**（一·补 B5）：办结**不关单**，本单状态仍是「已升级产研」。
   * 时刻相对装载时刻取（办结在 20 小时前），好停在 `XIAOZHI_CONFIRM_TIMEOUT_DAYS` 之内不被 B7 结掉。
   */
  const rd3 = rdInfo('智能阅卷', '紧急', FRONTLINE_ACCOUNTS[3]);
  const t3Created = nowMs - 26 * HOUR;
  const t3Settled = nowMs - 20 * HOUR;
  const t3Solution = '成绩同步任务重跑后两个班已补齐，根因为任务分片超时。';
  const t3 = row(3, {
    title: '智能阅卷 · 成绩同步缺失 · IM',
    customer: '六安二中 · 陈校代',
    phone: '13905510003',
    productCategory: '软件服务',
    productName: '智学网会员',
    problemL1: '账号问题',
    problemL2: '权益',
    problemL3: '订单未同步',
    problemDesc: '智能阅卷成绩同步到学情分析缺少两个班，产研已给出结论，等校代确认是否解决。',
    // B5：产研办结了，本单不动 —— 产研那边还没从本单脱手，校代说「否」就要原地回传回去
    nodeStatus: '已升级产研',
    assignee: XIAOZHI_SYSTEM_HANDLER,
    tab: 'mine',
    ...XIAOZHI_SLA_IDLE,
    createdAt: stamp(t3Created).slice(0, 16),
    updatedAt: stamp(t3Settled).slice(0, 16),
    xiaozhi: {
      frontlineAccount: FRONTLINE_ACCOUNTS[3],
      rd: rd3,
      // `closed` ＝ 产研那张反馈单结了，不是本单结了
      rdSync: 'closed',
      rdFeedbackNo: 'TPD-20260917-1832',
      rdReturnCount: 0,
      rdSolutionType: '问题',
      rdIssueResult: { solution: t3Solution, solvedAt: stamp(t3Settled - 8 * 60_000).slice(0, 16) },
      settledAt: stamp(t3Settled),
      confirmState: '未确认',
      rdRecords: [
        rd('push', `已推送${ESCALATE_CHANNEL_TPD}`,
          `产研单标题：${xiaozhiRdTitle(rd3.module)}；产品模块：${rd3.module}；接收人：${rd3.receiver}；优先级：${rd3.priority}`,
          '系统', '客服工单', stamp(t3Created + 40_000), { meta: 'TPD-20260917-1832' }),
        rd('result', '产研办结', t3Solution,
          '吕工', '产研侧', stamp(t3Settled), {
            meta: 'TPD-20260917-1832',
            result: t3Solution,
            conclusion: '问题类办结',
          }),
      ],
    },
  });
  tickets.push(t3);
  timelines[t3.no] = [
    tl(stamp(t3Created), 'node', 'create', AGENT, AGENT_ROLE, '建单', XIAOZHI_TL.create(XIAOZHI_TICKET_SOURCE)),
    tl(stamp(t3Created + 40_000), 'node', 'escalate', '系统', '系统', '系统自动流转',
      XIAOZHI_TL.autoEscalate(ESCALATE_CHANNEL_TPD, xiaozhiRdTitle(rd3.module)), { systemActor: true }),
    tl(stamp(t3Settled), 'node', 'relate', '系统', '系统', '产研回传',
      XIAOZHI_TL.rdSettled('问题'), { systemActor: true }),
  ];

  /**
   * ④ 校代**确认已解决** → 关单 + 下送调研（一·补 B5①）。
   *
   * 🔴 本单是**人工跟进过**的（领取、处理登记、人工升级产研都有），处理人仍**统一改系统**
   * （一·补 B9 扩大 B2 的覆盖范围）—— 关单那一下是系统做的，不保留原处理人谭小智。
   */
  const rd4 = rdInfo('智批改', '重要', FRONTLINE_ACCOUNTS[4]);
  const t4Solution = '批阅服务线程池耗尽导致任务堆积，已扩容并重跑，批阅结果已返回。';
  const t4 = row(4, {
    title: '智批改 · 批阅结果长时间未返回 · IM',
    customer: REPORTER,
    phone: '13905510004',
    productCategory: '软件服务',
    productName: '智学网会员',
    problemL1: '功能异常',
    problemL2: '播放问题',
    problemL3: '在线播放',
    problemDesc: '一场考试的智批改结果长时间未返回，产研扩容重跑后恢复，校代确认已解决。',
    nodeStatus: '已结案',
    // 一·补 B9：人工跟进过的单，关单时处理人也统一改系统
    assignee: XIAOZHI_SYSTEM_HANDLER,
    tab: 'done',
    ...XIAOZHI_SLA_IDLE,
    createdAt: '2026-09-17 09:12',
    updatedAt: '2026-09-18 10:05',
    xiaozhi: {
      frontlineAccount: FRONTLINE_ACCOUNTS[4],
      rd: rd4,
      rdSync: 'closed',
      rdFeedbackNo: 'TPD-20260917-1832',
      rdReturnCount: 0,
      rdSolutionType: '问题',
      rdIssueResult: { solution: t4Solution, solvedAt: '2026-09-17 16:40' },
      settledAt: '2026-09-17 16:48:20',
      confirmState: '已确认解决',
      confirmAt: '2026-09-18 10:05:12',
      confirmBy: REPORTER,
      rdRecords: [
        rd('push', `已推送${ESCALATE_CHANNEL_TPD}`,
          `产研单标题：${xiaozhiRdTitle(rd4.module)}；产品模块：${rd4.module}；接收人：${rd4.receiver}；优先级：${rd4.priority}`,
          AGENT, '客服工单', '2026-09-17 10:26:03', { meta: 'TPD-20260917-1832' }),
        rd('result', '产研办结', t4Solution,
          '张冬', '产研侧', '2026-09-17 16:48:20', {
            meta: 'TPD-20260917-1832',
            result: t4Solution,
            conclusion: '问题类办结',
          }),
      ],
    },
  });
  tickets.push(t4);
  timelines[t4.no] = [
    tl('2026-09-17 09:12:08', 'node', 'create', AGENT, AGENT_ROLE, '建单', XIAOZHI_TL.create(XIAOZHI_TICKET_SOURCE)),
    tl('2026-09-17 09:30:44', 'node', 'accept', AGENT, AGENT_ROLE, '领取', `${AGENT} 从${XIAOZHI_POOL_GROUP_NAME}工单池领取本单。`),
    tl('2026-09-17 10:05:19', 'handle', 'handle', AGENT, AGENT_ROLE, '工单处理', '核实批阅任务已下发但结果未回，自查无配置问题，转产研定位。'),
    // 🔴 人工那条路用 `manualEscalate` + how「升级 · 产研」（PRD §11.2）。
    // 原先这里复用了 `autoEscalate`，于是履历长成「操作人：谭小智 / 升级 /
    // **系统自动流转至** TPD…」—— 操作人是人、正文说是系统干的，一条自相矛盾的履历。
    tl('2026-09-17 10:26:03', 'node', 'escalate', AGENT, AGENT_ROLE, '升级 · 产研',
      XIAOZHI_TL.manualEscalate(ESCALATE_CHANNEL_TPD, xiaozhiRdTitle(rd4.module))),
    tl('2026-09-17 16:48:20', 'node', 'relate', '系统', '系统', '产研回传', XIAOZHI_TL.rdSettled('问题'), { systemActor: true }),
    tl('2026-09-18 10:05:12', 'node', 'resolved', '系统', '系统', '自动结案',
      XIAOZHI_TL.confirmResolved(REPORTER), { systemActor: true }),
    tl('2026-09-18 10:05:13', 'comm', 'sms', '系统', '系统', '短信',
      XIAOZHI_TL.surveySms(no(4)), { systemActor: true }),
  ];

  /**
   * ⑤ 校代**确认未解决** → 状态不动，**系统自动**回传产研，记「第 N 次回传产研」（B5② / B8）。
   *
   * 本单已来回两轮（办结 → 确认否 → 回传 → 再办结 → 再确认否 → 再回传），`rdReturnCount = 2`，
   * 现在等产研第三次办结。🔴 整条链路**没有「二次提交产研」按钮** —— 回传是系统动作（B5），
   * 确认循环**不封顶**，靠这个次数让反复打回的单看得见（B8）。
   */
  const rd5 = rdInfo('扫描', '普通', FRONTLINE_ACCOUNTS[5]);
  const t5 = row(5, {
    title: '扫描 · 答题卡识别偏移 · IM',
    customer: '滁州三中 · 赵校代',
    phone: '13905510005',
    productCategory: '软件服务',
    productName: '智学网会员',
    problemL1: '设备故障',
    problemL2: '网络',
    problemL3: 'WiFi 连不上',
    // 次数词序照 PRD L420「已回传产研 〈N〉 次」；称谓照 B19 用「提报人」
    problemDesc: '批量扫描答题卡出现识别偏移，产研两次办结提报人都确认未解决，已回传产研 2 次。',
    // B5②：确认未解决不改状态，本单留在「已升级产研」等产研重新处理
    nodeStatus: '已升级产研',
    assignee: XIAOZHI_SYSTEM_HANDLER,
    tab: 'mine',
    ...XIAOZHI_SLA_IDLE,
    createdAt: '2026-09-18 08:30',
    updatedAt: '2026-09-21 09:40',
    xiaozhi: {
      frontlineAccount: FRONTLINE_ACCOUNTS[5],
      rd: rd5,
      // 已回传、等产研再办结，故回到 synced；办结结果与确认状态随之清空
      rdSync: 'synced',
      rdFeedbackNo: 'TPD-20260918-1907',
      // B8：已回传产研 2 次
      rdReturnCount: 2,
      rdRecords: [
        rd('push', `已推送${ESCALATE_CHANNEL_TPD}`,
          `产研单标题：${xiaozhiRdTitle(rd5.module)}；产品模块：${rd5.module}；接收人：${rd5.receiver}；优先级：${rd5.priority}`,
          '系统', '客服工单', '2026-09-18 08:30:52', { meta: 'TPD-20260918-1907' }),
        rd('result', '产研办结', '已调整识别模板参数，请重新扫描验证。',
          '王爽', '产研侧', '2026-09-19 15:12:40', {
            meta: 'TPD-20260918-1907',
            result: '已调整识别模板参数，请重新扫描验证。',
            conclusion: '问题类办结',
          }),
        rd('push', `系统自动回传${ESCALATE_CHANNEL_TPD}`,
          '滁州三中 · 赵校代确认问题未解决，系统已自动回传产研（已回传产研 1 次）',
          '系统', '客服工单', '2026-09-20 09:18:05', { meta: 'TPD-20260918-1907' }),
        rd('result', '产研办结', '补充兼容该型号扫描仪的校准系数，已发版。',
          '王爽', '产研侧', '2026-09-21 08:52:11', {
            meta: 'TPD-20260918-1907',
            result: '补充兼容该型号扫描仪的校准系数，已发版。',
            conclusion: '问题类办结',
          }),
        rd('push', `系统自动回传${ESCALATE_CHANNEL_TPD}`,
          '滁州三中 · 赵校代确认问题未解决，系统已自动回传产研（已回传产研 2 次）',
          '系统', '客服工单', '2026-09-21 09:40:33', { meta: 'TPD-20260918-1907' }),
      ],
    },
  });
  tickets.push(t5);
  timelines[t5.no] = [
    tl('2026-09-18 08:30:11', 'node', 'create', AGENT, AGENT_ROLE, '建单', XIAOZHI_TL.create(XIAOZHI_TICKET_SOURCE)),
    tl('2026-09-18 08:30:52', 'node', 'escalate', '系统', '系统', '系统自动流转',
      XIAOZHI_TL.autoEscalate(ESCALATE_CHANNEL_TPD, xiaozhiRdTitle(rd5.module)), { systemActor: true }),
    tl('2026-09-19 15:12:40', 'node', 'relate', '系统', '系统', '产研回传', XIAOZHI_TL.rdSettled('问题'), { systemActor: true }),
    tl('2026-09-20 09:18:05', 'node', 'relate', '系统', '系统', '系统自动回传',
      XIAOZHI_TL.confirmUnresolved('滁州三中 · 赵校代', 1, ESCALATE_CHANNEL_TPD), { systemActor: true }),
    tl('2026-09-21 08:52:11', 'node', 'relate', '系统', '系统', '产研回传', XIAOZHI_TL.rdSettled('问题'), { systemActor: true }),
    tl('2026-09-21 09:40:33', 'node', 'relate', '系统', '系统', '系统自动回传',
      XIAOZHI_TL.confirmUnresolved('滁州三中 · 赵校代', 2, ESCALATE_CHANNEL_TPD), { systemActor: true }),
  ];

  /**
   * ⑥ **超 N 天未确认** → 装载时判「视为已解决」，自动结案 + 下送调研（一·补 B7）。
   *
   * 种子停在**办结后未确认**的那一刻，办结时刻取装载时刻前 `N + 1` 天 ——
   * 关单那一下由小智服务 `settleConfirmDue()` 在 `hydrate()` 里对账结出来，
   * 不在种子里写死。这样页面上看到的「已结案 + 超时履历」是**规则真跑出来的**，
   * 规则哪天改了数，这张单跟着变。形制照刷机种子 ⑲。
   */
  const rd6 = rdInfo('组卷与题库', '普通加急', FRONTLINE_ACCOUNTS[6]);
  const t6Created = nowMs - (XIAOZHI_CONFIRM_TIMEOUT_DAYS + 1) * DAY_MS - 6 * HOUR;
  const t6Settled = nowMs - (XIAOZHI_CONFIRM_TIMEOUT_DAYS + 1) * DAY_MS;
  const t6Solution = '题库检索索引重建完成，组卷筛选已恢复正常。';
  const t6 = row(6, {
    title: '组卷与题库 · 按知识点筛题无结果 · IM',
    customer: '宣城四中 · 周校代',
    phone: '13905510006',
    productCategory: '软件服务',
    productName: '智学网会员',
    problemL1: '功能异常',
    problemL2: '播放问题',
    problemL3: '无法播放',
    problemDesc: '组卷时按知识点筛题返回空结果，产研重建索引后办结，校代一直未确认。',
    nodeStatus: '已升级产研',
    assignee: XIAOZHI_SYSTEM_HANDLER,
    tab: 'mine',
    ...XIAOZHI_SLA_IDLE,
    createdAt: stamp(t6Created).slice(0, 16),
    updatedAt: stamp(t6Settled).slice(0, 16),
    xiaozhi: {
      frontlineAccount: FRONTLINE_ACCOUNTS[6],
      rd: rd6,
      rdSync: 'closed',
      rdFeedbackNo: 'TPD-20260916-1120',
      rdReturnCount: 0,
      rdSolutionType: '问题',
      rdIssueResult: { solution: t6Solution, solvedAt: stamp(t6Settled - 15 * 60_000).slice(0, 16) },
      settledAt: stamp(t6Settled),
      confirmState: '未确认',
      rdRecords: [
        rd('push', `已推送${ESCALATE_CHANNEL_TPD}`,
          `产研单标题：${xiaozhiRdTitle(rd6.module)}；产品模块：${rd6.module}；接收人：${rd6.receiver}；优先级：${rd6.priority}`,
          '系统', '客服工单', stamp(t6Created + 35_000), { meta: 'TPD-20260916-1120' }),
        rd('result', '产研办结', t6Solution,
          '陈伟', '产研侧', stamp(t6Settled), {
            meta: 'TPD-20260916-1120',
            result: t6Solution,
            conclusion: '问题类办结',
          }),
      ],
    },
  });
  tickets.push(t6);
  timelines[t6.no] = [
    tl(stamp(t6Created), 'node', 'create', AGENT, AGENT_ROLE, '建单', XIAOZHI_TL.create(XIAOZHI_TICKET_SOURCE)),
    tl(stamp(t6Created + 35_000), 'node', 'escalate', '系统', '系统', '系统自动流转',
      XIAOZHI_TL.autoEscalate(ESCALATE_CHANNEL_TPD, xiaozhiRdTitle(rd6.module)), { systemActor: true }),
    tl(stamp(t6Settled), 'node', 'relate', '系统', '系统', '产研回传',
      XIAOZHI_TL.rdSettled('问题'), { systemActor: true }),
  ];

  /**
   * ⑦ 人工跟进中 · **已自查一轮、尚未升级** —— 「人工升级 · 产研」那条路（PRD §5.4 / §11.2）
   * 的现成演示入口。
   *
   * 🔴 **为什么单独加一张**：①–⑥ 里能点「升级」的只有 ① 一张（其余四张已在「已升级产研」上
   * 升级置灰、一张已结案底栏全灰），演示时很容易卡在「找不到升级按钮」。
   * ① 是「刚领到、还没动手」的样子，这一张补的是「**自查完、该交产研了**」那一刻 ——
   * 处理记录里已有排查结论，下一步正好点底栏「升级」。
   * 它同时是 #8 那条链路（弹窗产研五项 → `escalateToRd` → 产研反馈 Tab）的回归用例。
   */
  const t7 = row(7, {
    title: '智能阅卷 · 主观题分数回传缺失 · IM',
    customer: '亳州五中 · 孙校代',
    phone: '13905510007',
    productCategory: '软件服务',
    productName: '智学网会员',
    problemL1: '功能异常',
    problemL2: '播放问题',
    problemL3: '在线播放',
    problemDesc: '一场考试的主观题分数未回传到成绩单，已核实评卷端打分正常，疑似回传链路异常，需转产研定位。',
    nodeStatus: '处理中',
    assignee: AGENT,
    tab: 'mine',
    ...XIAOZHI_SLA_IDLE,
    createdAt: '2026-09-19 10:08',
    updatedAt: '2026-09-19 11:35',
    // 未走过产研：无 rd、rdSync 为 none —— 产研反馈 Tab 此时**不出**，升级成功后才出现
    xiaozhi: { frontlineAccount: FRONTLINE_ACCOUNTS[7], rdSync: 'none', rdRecords: [], rdReturnCount: 0 },
  });
  tickets.push(t7);
  timelines[t7.no] = [
    tl('2026-09-19 10:08:14', 'node', 'create', AGENT, AGENT_ROLE, '建单', XIAOZHI_TL.create(XIAOZHI_TICKET_SOURCE)),
    tl('2026-09-19 10:21:36', 'node', 'accept', AGENT, AGENT_ROLE, '领取', `${AGENT} 从${XIAOZHI_POOL_GROUP_NAME}工单池领取本单。`),
    tl('2026-09-19 11:35:02', 'handle', 'handle', AGENT, AGENT_ROLE, '工单处理',
      '已核对评卷端打分记录与成绩单数据：评卷侧有分、成绩单侧缺失，判定为回传链路问题，自查无法解决，准备转产研。'),
  ];

  /**
   * ⑧ **未认领** —— 刚从 IM 建进来、还没人领，躺在「小智工单处理组」池里（D21：一个大组、进池自己领）。
   *
   * 🔴 **为什么必须有这一张**：①–⑦ 没有一张是「未认领」，于是**「领取」这一步在原型上
   * 演示不出来** —— 链路本身是通的（`claimFromPool`），但没有可领的单，盘点时自然会得出
   * 「小智工单到不了处理中」的结论。
   * 它同时是对读 #2（底栏「领取」在小智单上不渲染）与 #18（未认领时「保存」不置灰）
   * 两处修复的回归用例 —— 那两条就得靠一张未认领的单才验得到。
   *
   * 走的是「创建」那条路（D5 落池自领）：无 `rd`、`rdSync: 'none'`、**处理人为空**。
   * ⚠️ `tab: 'pool'` 是进工单池页签的判据（`inGroupPoolScope` 要 tab/assignee/groupId 三者齐），
   * 与前七张的 `tab: 'mine'` 不同，不是写错。
   * ⚠️ `responded: false` —— 还没人接手，谈不上已响应。
   * ⚠️ 「一线人员域账号」照样有值：B24 是建单必填，**种子不能自己违规**。
   */
  const t8 = row(8, {
    title: '扫描 · 答题卡批量导入中断 · IM',
    customer: '六安三中 · 吴校代',
    phone: '13905510008',
    productCategory: '软件服务',
    productName: '智学网会员',
    problemL1: '功能异常',
    problemL2: '播放问题',
    problemL3: '无法播放',
    problemDesc: '批量导入答题卡扫描件时进度条卡在 60% 后中断，重试两次仍然中断，尚未有人跟进。',
    nodeStatus: '未认领',
    assignee: null,
    tab: 'pool',
    responded: false,
    nodeStep: 1,
    ...XIAOZHI_SLA_IDLE,
    createdAt: '2026-09-19 14:06',
    updatedAt: '2026-09-19 14:06',
    xiaozhi: { frontlineAccount: FRONTLINE_ACCOUNTS[8], rdSync: 'none', rdRecords: [], rdReturnCount: 0 },
  });
  tickets.push(t8);
  timelines[t8.no] = [
    tl('2026-09-19 14:06:28', 'node', 'create', AGENT, AGENT_ROLE, '建单', XIAOZHI_TL.create(XIAOZHI_TICKET_SOURCE)),
  ];

  return { tickets, timelines };
}

export const XIAOZHI_SEEDS: XiaozhiSeedBundle = buildXiaozhiSeeds(Date.now());
