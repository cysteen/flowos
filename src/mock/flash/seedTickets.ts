/**
 * 教育刷机单 · 工单库在办 / 已办样本（930 教育刷机单）。
 *
 * 每张单的刷机信息都取自 MDM 设备台账、学校库（`mock/flash/*`、`mock/schools.ts`），
 * 推送记录与履历按底数推演，与刷机服务 `stores/flash.ts` 的规则一致。
 *
 * 三张「自动刷机中」的推送时刻取**模块加载时刻**倒推：
 * ① 第一次打开页面后十几秒出回传结果；② 回传无响应、加载即判超时；㉑ 回传无响应、到回传超时时长前一直停在自动刷机中。
 * ⑮ 调研中、⑲ 调研超时两张的调研短信时刻同样取加载时刻倒推。
 * 之后的状态由刷机服务持久化（`FLASH_LS_KEYS`），刷新页面不回到种子。
 *
 * SLA（1013 A26 / A17）：一线不计 SLA —— 一线刷机池、一线名下的单没有账本（`slaStartedAt` 为空）；
 * 进入教育刷机处理组池的时刻才是起算时刻。线下登记期间照常计时，不暂停。
 *
 * 并入工单库的位置：`mock/tickets.ts` 的 `TICKETS`。
 */
import type { Ticket } from '@/views/tickets/types/ticket';
import type { TimelineEntry, TlAction, TlCategory, TlRole } from '@/views/tickets/types/ticketDetail';
import { TICKET_NO_PREFIX } from '@/constants/ticketNo';
import {
  FLASH_PRODUCT_CATEGORY, FLASH_TAG_L1, FLASH_TAG_L2, FLASH_TAG_L3_USER_REPORT, FLASH_TICKET_TYPE, flashTicketTitle,
  FLASH_POOLS, FLASH_RESULT_OFFLINE, FLASH_RESULT_ONLINE_SUCCESS, FLASH_TL, flashFailReasonText,
  flashSmsSuccess, flashSmsSurvey, flashStamp, parseFlashStamp,
  type FlashCreator, type FlashFailL1, type FlashFailL2, type FlashHandoffReason, type FlashInfo, type FlashPoolKey,
  type FlashStudentType, type FlashRun, type FlashRunResult, type FlashState, type FlashPushTrigger,
} from '@/views/tickets/types/flash';
import { findSchoolById } from '@/mock/schools';
import { findMdmDevice } from './mdmDevices';

/** 种子单学生姓名（按 MDM 绑定的学生账号；提报时另填姓名的单在 `infoOf` 里显式传） */
const SEED_STUDENT_NAMES: Record<string, string> = {
  hf1z2023s0415: '胡子涵', hf1z2023s0811: '秦朗',
  hf8z2023s0622: '程思远', hf8z2023s0907: '顾晓',
  ahsdfz2023s0107: '马嘉怡', ahsdfz2023s0419: '沈可欣',
  hf50z2023s0233: '许诺', hf50z2023s0520: '陆子墨',
  hf46z2023s1109: '吴梓萱',
  hf168z2023s1021: '钱沐阳', hf168z2023s0908: '杜若溪',
  bb2z2023s0310: '冯一诺', bb2z2023s0625: '蒋天佑', bb2z2023s0418: '宋雨晴',
  la1z2023s0716: '梁晨', la1z2023s0302: '叶知秋', la1z2023s1020: '孙一鸣',
};

export interface FlashSeedBundle {
  tickets: Ticket[];
  /** 工单号 → 刷机链路履历（时间正序） */
  timelines: Record<string, TimelineEntry[]>;
}

const DAY = '20260915';
/** 刷机单沿用咨询单号（1013 A1） */
const no = (n: number) => `${TICKET_NO_PREFIX[FLASH_TICKET_TYPE]}-${DAY}-${String(n).padStart(5, '0')}`;

/** 刷机原因（自由文本）缺省：按学生类型给一句业务说明 */
const SEED_REASON: Record<FlashStudentType, string> = {
  毕业生: '学生已毕业，设备需解除学校管控，恢复原生系统供个人使用',
  转校生: '学生已转学至外校，原学校管控下的设备无法继续使用，需恢复原生系统',
};

/** 按 SN 从底数组装刷机信息；`account` 覆盖提报时填写的学生账号（校验不一致的场景） */
function infoOf(
  sn: string,
  schoolId: string,
  studentType: FlashStudentType,
  opts: { account?: string; name?: string; reason?: string; photos?: boolean; mdmPhotos?: boolean; studyProof?: boolean } = {},
): FlashInfo {
  const d = findMdmDevice(sn);
  if (!d) throw new Error(`MDM 台账缺少设备 ${sn}`);
  const account = opts.account ?? d.studentAccount;
  return {
    productModel: d.model,
    sn: d.sn,
    studentType,
    studentAccount: account,
    studentName: opts.name ?? SEED_STUDENT_NAMES[d.studentAccount] ?? '',
    schoolId,
    schoolName: findSchoolById(schoolId)?.name ?? '',
    reason: opts.reason ?? SEED_REASON[studentType],
    snPhotos: opts.photos === false ? [] : [`设备SN照片_${d.sn}.jpg`],
    mdmPhotos: opts.mdmPhotos ? [`MDM信息_${d.sn}.png`] : [],
    ...(opts.studyProof ? { studyProofPhotos: [`学习证明_${account}.jpg`] } : {}),
  };
}

/**
 * 用户提报（小程序接口字段，2026-10-21）：学校为提报原文、无学校库 ID；带产品信息图片；不传 MDM信息图片。
 */
function asUserReport(info: FlashInfo): FlashInfo {
  return {
    ...info,
    schoolId: '',
    mdmPhotos: [],
    productPhotos: [`产品信息_${info.sn}.jpg`],
  };
}

function run(p: {
  seq: number;
  trigger: FlashPushTrigger;
  by?: string;
  byRole?: TlRole;
  pushedAt: string;
  result: FlashRunResult;
  failL1?: FlashFailL1;
  failL2?: FlashFailL2;
  resultAt?: string;
  handlerAtPush?: string | null;
}): FlashRun {
  return {
    id: `run-${p.pushedAt.replace(/\D/g, '')}-${p.seq}`,
    seq: p.seq,
    trigger: p.trigger,
    by: p.by ?? '系统',
    byRole: p.byRole ?? '系统',
    line: p.byRole ? (p.byRole === '一线坐席' ? '一线' : '二线') : undefined,
    pushedAt: p.pushedAt,
    pushedAtMs: parseFlashStamp(p.pushedAt).getTime(),
    result: p.result,
    failL1: p.failL1,
    failL2: p.failL2,
    resultAt: p.resultAt,
    handlerAtPush: p.handlerAtPush ?? null,
  };
}

/**
 * SLA 账本（PRD §4.3，D-01）。种子单的**起算时刻取履历里那条「转人工」的时刻**（R53 悬停要显示它），
 * 而本行要呈现的剩余是另一个靶子 —— 两者在写死日期的样本上隔天就对不上了。
 * 差额记进账本的累计扣除毫秒：起算时刻照写不误，剩余按本行给定值落地，
 * 一份账本同时满足悬停的起算行与页头 / 列表的剩余读数。传了挂段起点的以它为锚（仅「调研中」）。
 */
const SLA_LIMIT_MIN = 480;
function ledger(
  nowMs: number,
  startedAt: string,
  remainMin: number,
  pausedSinceMs?: number,
): Pick<FlashState, 'slaStartedAt' | 'slaPausedAccumMs' | 'slaPausedSince'> {
  const startMs = parseFlashStamp(startedAt).getTime();
  const anchor = pausedSinceMs ?? nowMs;
  const elapsed = (SLA_LIMIT_MIN - remainMin) * 60_000;
  return {
    slaStartedAt: flashStamp(startMs),
    slaPausedAccumMs: Math.max(0, anchor - startMs - elapsed),
    ...(pausedSinceMs == null ? {} : { slaPausedSince: flashStamp(pausedSinceMs) }),
  };
}

/** 不计 SLA 的单（1013 A26：一线刷机池、一线名下、首推自动刷机中），列表行上的 SLA 摘要；与刷机服务写入的同值 */
const L1_NO_SLA = { slaText: '—', slaSub: '未计时', slaState: 'ok', slaMinutes: 9999 } as const;

function state(creator: FlashCreator, p: Partial<FlashState>): FlashState {
  return {
    outcome: '未推送', pushCount: 0, surveyConcluded: false, creator,
    ...p,
  };
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
  return { id: `flash-seed-${tlSeq}`, category, action, who, role, how, when, what, ...extra };
}

const addSec = (stamp: string, sec: number) => flashStamp(parseFlashStamp(stamp).getTime() + sec * 1000);

/** 工单来源（沿用现有工单来源口径）：用户提报 / 坐席代建（种子单代建均为电话受理） */
const USER_SOURCE = '客户服务小程序';
const AGENT_SOURCE = '电话';

/** 列表行公共字段 */
function row(
  n: number,
  p: {
    info: FlashInfo;
    creator: FlashCreator;
    customer: string;
    phone: string;
    createdAt: string;
    updatedAt: string;
    flashState: FlashState;
    runs: FlashRun[];
  } & Pick<Ticket, 'nodeStatus' | 'assignee' | 'tab' | 'slaText' | 'slaSub' | 'slaState' | 'slaMinutes'>
    & Partial<Ticket>,
): Ticket {
  const { info: given, creator, customer, phone, flashState, runs, ...rest } = p;
  const byUser = creator === '用户提报';
  const info = byUser ? asUserReport(given) : given;
  const pool: FlashPoolKey | undefined = flashState.pool;
  const ticketSource = byUser ? USER_SOURCE : AGENT_SOURCE;
  return {
    id: `flash-${n}`,
    no: no(n),
    // 刷机单＝咨询单 + 「刷机单」标识（1013 A1）
    type: FLASH_TICKET_TYPE,
    isFlash: true,
    channel: byUser ? '小程序' : '电话',
    ticketSource,
    title: flashTicketTitle(info.productModel, FLASH_TAG_L3_USER_REPORT, ticketSource),
    smartMarks: [],
    customer,
    vip: false,
    customerPhone: phone,
    sn: info.sn,
    product: info.productModel,
    productCategory: FLASH_PRODUCT_CATEGORY,
    problemL1: FLASH_TAG_L1,
    problemL2: FLASH_TAG_L2,
    problemL3: FLASH_TAG_L3_USER_REPORT,
    businessType: '教育',
    priority: 'P2',
    nodeStep: 2,
    nodeTotal: 5,
    groupId: pool ? FLASH_POOLS[pool].groupId : undefined,
    groupNames: pool ? [FLASH_POOLS[pool].groupName] : undefined,
    problemDesc: `${info.studentType}${info.studentName}（账号 ${info.studentAccount}，${info.schoolName}）申请刷机，刷机原因：${info.reason}。设备 SN ${info.sn}。`,
    responded: false,
    ...rest,
    flash: { info, state: flashState, runs },
  };
}

type SeedDest = { auto: true } | { handoff: FlashHandoffReason };

/** 「用户提报」建单履历（PRD §11.2「建单」；操作人沿用提报用户，X4） */
function createdByUser(when: string, customer: string, dest: SeedDest): TimelineEntry {
  return tl(when, 'node', 'create', customer, '客户', '建单', FLASH_TL.create(USER_SOURCE, dest));
}
function createdByAgent(when: string, agent: string, role: TlRole, dest: SeedDest): TimelineEntry {
  return tl(when, 'node', 'create', agent, role, '建单', FLASH_TL.create(AGENT_SOURCE, dest));
}
function pushEntry(when: string, seq: number): TimelineEntry {
  return tl(when, 'node', 'flashPush', '系统', '系统', '自动推送', FLASH_TL.autoPush(seq));
}
function repushEntry(when: string, seq: number, by: string, role: TlRole): TimelineEntry {
  return tl(when, 'node', 'flashRepush', by, role, '重新推送',
    FLASH_TL.repush(seq, { by, line: role === '一线坐席' ? '一线' : '二线' }));
}
function returnOk(when: string): TimelineEntry {
  return tl(when, 'node', 'flashSuccess', '系统', '系统', '回传结果', FLASH_TL.returnSuccess);
}
function returnFail(when: string, l2?: FlashFailL2): TimelineEntry {
  return tl(when, 'node', 'flashFail', '系统', '系统', '回传结果', FLASH_TL.returnFail(flashFailReasonText('接收失败', l2)));
}
function smsEntry(when: string, phone: string, content: string): TimelineEntry {
  return tl(when, 'comm', 'sms', '系统', '系统', '短信通知', `发送至 ${phone}：${content}`);
}
function handoffEntry(when: string, reason: FlashHandoffReason, pool: FlashPoolKey): TimelineEntry {
  return tl(when, 'node', 'flashHandoff', '系统', '系统', '转人工', FLASH_TL.handoff(reason, FLASH_POOLS[pool].label));
}
function acceptEntry(when: string, who: string, role: TlRole): TimelineEntry {
  return tl(when, 'node', 'accept', who, role, '领取', `${who} 从池中领取本单。`);
}
/** 坐席处理记录（「保存」登记的处理进展） */
function handleEntry(when: string, who: string, role: TlRole, what: string): TimelineEntry {
  return tl(when, 'handle', 'handle', who, role, '工单处理', what);
}
/** 一线以处理结果「升级二线」下送（1013 A18：确认框不填说明，履历带最近一条处理记录） */
function escalateEntry(when: string, who: string, record: string): TimelineEntry {
  return tl(when, 'node', 'escalate', who, '一线坐席', '升级二线',
    `升级至教育刷机处理组；处理记录：${record}`);
}

export function buildFlashSeeds(nowMs: number): FlashSeedBundle {
  tlSeq = 0;
  const tickets: Ticket[] = [];
  const timelines: Record<string, TimelineEntry[]> = {};
  const add = (t: Ticket, entries: TimelineEntry[]) => {
    tickets.push(t);
    timelines[t.no] = entries;
  };

  // ① 自动刷机中：几秒前刚推送，打开页面十几秒后出回传结果（接收成功 → 调研中）
  {
    const info = infoOf('XFS20240600131', 'SCH-340103-001', '毕业生');
    const created = flashStamp(nowMs - 6_000);
    const pushed = flashStamp(nowMs - 4_000);
    add(row(1, {
      info, creator: '用户提报', customer: '胡建国', phone: '13956011215',
      createdAt: created.slice(0, 16), updatedAt: pushed.slice(0, 16),
      nodeStatus: '自动刷机中', assignee: null, tab: 'mine', nodeStep: 2,
      ...L1_NO_SLA,
      flashState: state('用户提报', { outcome: '等待回传', pushCount: 1 }),
      runs: [run({ seq: 1, trigger: '建单首推', pushedAt: pushed, result: '等待回传' })],
    }), [
      createdByUser(created, '胡建国', { auto: true }),
      pushEntry(pushed, 1),
    ]);
  }

  // ② 自动刷机中 · 回传无响应：推送已超过回传超时时长，加载即判「推送异常 · 回传超时」转人工
  {
    const info = infoOf('XFS30240900218', 'SCH-340111-008', '毕业生');
    const created = flashStamp(nowMs - 125 * 60_000 - 3_000);
    const pushed = flashStamp(nowMs - 125 * 60_000);
    add(row(2, {
      info, creator: '用户提报', customer: '程丽', phone: '13856022318',
      createdAt: created.slice(0, 16), updatedAt: pushed.slice(0, 16),
      nodeStatus: '自动刷机中', assignee: null, tab: 'mine',
      ...L1_NO_SLA,
      flashState: state('用户提报', { outcome: '等待回传', pushCount: 1 }),
      runs: [run({ seq: 1, trigger: '建单首推', pushedAt: pushed, result: '等待回传' })],
    }), [
      createdByUser(created, '程丽', { auto: true }),
      pushEntry(pushed, 1),
    ]);
  }

  // ③ 一线刷机池 · 首推接收失败 · 未联网（用户提报）：提报账号与 MDM 绑定账号不一致，建单不校验照常首推；
  //    不改学生账号重推即被拦「SN与学生账号不一致」（PRD §6.1 场景 B）
  {
    const info = infoOf('XFS20240600377', 'SCH-340103-001', '毕业生', { account: 'hf1z2023s0599', name: '唐语桐' });
    const at = '2026-09-15 08:42:16';
    const pushed = addSec(at, 2);
    const back = addSec(pushed, 12);
    add(row(3, {
      info, creator: '用户提报', customer: '唐伟', phone: '13705513377',
      createdAt: at.slice(0, 16), updatedAt: back.slice(0, 16),
      nodeStatus: '未认领', assignee: null, tab: 'pool', nodeStep: 1,
      ...L1_NO_SLA,
      flashState: state('用户提报', {
        outcome: '接收失败', failL1: '接收失败', failL2: '未联网', pushCount: 1,
        handoffReason: '接收失败', pool: 'l1',
      }),
      runs: [run({ seq: 1, trigger: '建单首推', pushedAt: pushed, result: '接收失败', failL1: '接收失败', failL2: '未联网', resultAt: back })],
    }), [
      createdByUser(at, '唐伟', { auto: true }),
      pushEntry(pushed, 1),
      returnFail(back, '未联网'),
      handoffEntry(addSec(back, 1), '接收失败', 'l1'),
    ]);
  }

  // ④ 一线刷机池 · 非自研机型（联想）
  {
    const info = infoOf('LNJ606F2403A0912', 'SCH-340202-003', '毕业生');
    const at = '2026-09-15 09:05:40';
    add(row(4, {
      info, creator: '用户提报', customer: '马骏', phone: '13966304107',
      createdAt: at.slice(0, 16), updatedAt: at.slice(0, 16),
      nodeStatus: '未认领', assignee: null, tab: 'pool', nodeStep: 1,
      ...L1_NO_SLA,
      flashState: state('用户提报', { handoffReason: '非自研机型', pool: 'l1' }),
      runs: [],
    }), [
      createdByUser(at, '马骏', { handoff: '非自研机型' }),
      handoffEntry(addSec(at, 2), '非自研机型', 'l1'),
    ]);
  }

  // ⑤ 一线刷机池 · 接收失败 · 未开机
  {
    const info = infoOf('XFX3P240500452', 'SCH-340104-050', '毕业生');
    const at = '2026-09-15 09:20:08';
    const pushed = addSec(at, 2);
    const back = addSec(pushed, 12);
    add(row(5, {
      info, creator: '用户提报', customer: '许志强', phone: '15855170233',
      createdAt: at.slice(0, 16), updatedAt: back.slice(0, 16),
      nodeStatus: '未认领', assignee: null, tab: 'pool', nodeStep: 1,
      ...L1_NO_SLA,
      flashState: state('用户提报', {
        outcome: '接收失败', failL1: '接收失败', failL2: '未开机', pushCount: 1,
        handoffReason: '接收失败', pool: 'l1',
      }),
      runs: [run({ seq: 1, trigger: '建单首推', pushedAt: pushed, result: '接收失败', failL1: '接收失败', failL2: '未开机', resultAt: back })],
    }), [
      createdByUser(at, '许志强', { auto: true }),
      pushEntry(pushed, 1),
      returnFail(back, '未开机'),
      handoffEntry(addSec(back, 1), '接收失败', 'l1'),
    ]);
  }

  // ⑥ 一线刷机池 · 推送异常 · 回传超时
  {
    const info = infoOf('XFS30240900307', 'SCH-340111-168', '毕业生');
    const at = '2026-09-15 07:40:02';
    const pushed = addSec(at, 3);
    const timeout = addSec(pushed, 120 * 60);
    add(row(6, {
      info, creator: '用户提报', customer: '钱芳', phone: '18955102021',
      createdAt: at.slice(0, 16), updatedAt: timeout.slice(0, 16),
      nodeStatus: '未认领', assignee: null, tab: 'pool', nodeStep: 1,
      ...L1_NO_SLA,
      flashState: state('用户提报', {
        outcome: '推送异常', failL1: '推送异常', failL2: '回传超时', pushCount: 1,
        handoffReason: '推送异常', pool: 'l1',
      }),
      runs: [run({ seq: 1, trigger: '建单首推', pushedAt: pushed, result: '推送异常', failL1: '推送异常', failL2: '回传超时', resultAt: timeout })],
    }), [
      createdByUser(at, '钱芳', { auto: true }),
      pushEntry(pushed, 1),
      tl(timeout, 'node', 'flashFail', '系统', '系统', '回传超时', FLASH_TL.returnTimeout('推送异常 · 回传超时', 2)),
      handoffEntry(addSec(timeout, 1), '推送异常', 'l1'),
    ]);
  }

  // ⑦ 一线处理中 · 已领取、未重推（接收失败 · 原因未返回）
  {
    const info = infoOf('XFS20240600512', 'SCH-340302-002', '毕业生', { reason: '学生今年毕业，平板需恢复原生系统，安装个人常用应用' });
    const at = '2026-09-15 07:05:10';
    const pushed = addSec(at, 2);
    const back = addSec(pushed, 12);
    const claim = '2026-09-15 07:30:25';
    const handled = '2026-09-15 07:42:08';
    add(row(7, {
      info, creator: '用户提报', customer: '冯涛', phone: '13605521310',
      createdAt: at.slice(0, 16), updatedAt: handled.slice(0, 16),
      nodeStatus: '处理中', assignee: '刘一线', tab: 'mine', responded: true, nodeStep: 2,
      ...L1_NO_SLA,
      flashState: state('用户提报', {
        outcome: '接收失败', failL1: '接收失败', pushCount: 1,
        handoffReason: '接收失败', pool: 'l1',
        // 表单显示最新一次保存的值：与下方处理条目同文
        record: '已致电用户冯涛，经智能硬件平台查询设备推送时处于离线状态；已指导用户将平板连接家庭 WiFi，用户表示晚间开机联网后回电确认。',
      }),
      runs: [run({ seq: 1, trigger: '建单首推', pushedAt: pushed, result: '接收失败', failL1: '接收失败', resultAt: back })],
    }), [
      createdByUser(at, '冯涛', { auto: true }),
      pushEntry(pushed, 1),
      returnFail(back),
      handoffEntry(addSec(back, 1), '接收失败', 'l1'),
      acceptEntry(claim, '刘一线', '一线坐席'),
      handleEntry(handled, '刘一线', '一线坐席',
        '已致电用户冯涛，经智能硬件平台查询设备推送时处于离线状态；已指导用户将平板连接家庭 WiFi，用户表示晚间开机联网后回电确认。'),
    ]);
  }

  // ⑧ 二线处理中 · 一线升级后二线领取（首推未联网 → 一线领取、联系不上用户 → 升级二线 → 二线领取处理）
  {
    const info = infoOf('XFS30240900433', 'SCH-341502-001', '毕业生', { reason: '学生已毕业离校，家长希望去掉学校管控后给家里其他孩子使用' });
    const at = '2026-09-15 08:10:01';
    const pushed = addSec(at, 2);
    const back = addSec(pushed, 12);
    const claim1 = '2026-09-15 08:35:12';
    const esc = '2026-09-15 09:02:40';
    const claim2 = '2026-09-15 09:15:06';
    const handled = '2026-09-15 09:31:52';
    add(row(8, {
      info, creator: '用户提报', customer: '梁红', phone: '13966018716',
      createdAt: at.slice(0, 16), updatedAt: handled.slice(0, 16),
      nodeStatus: '处理中', assignee: '王坐席', tab: 'mine', responded: true, nodeStep: 3,
      slaText: '07:05:00', slaSub: '距超时', slaState: 'ok', slaMinutes: 425,
      upgradeCount: 1,
      flashState: state('用户提报', {
        outcome: '接收失败', failL1: '接收失败', failL2: '未联网', pushCount: 1,
        handoffReason: '一线升级', pool: 'l2',
        result: '需升级二线', record: '两次致电用户梁红均未接通，设备持续离线，一线无法跟进。',
        ...ledger(nowMs, esc, 425),
      }),
      runs: [
        run({ seq: 1, trigger: '建单首推', pushedAt: pushed, result: '接收失败', failL1: '接收失败', failL2: '未联网', resultAt: back }),
      ],
    }), [
      createdByUser(at, '梁红', { auto: true }),
      pushEntry(pushed, 1),
      returnFail(back, '未联网'),
      handoffEntry(addSec(back, 1), '接收失败', 'l1'),
      acceptEntry(claim1, '刘一线', '一线坐席'),
      handleEntry(addSec(esc, -95), '刘一线', '一线坐席', '两次致电用户梁红均未接通，设备持续离线，一线无法跟进。'),
      escalateEntry(esc, '刘一线', '两次致电用户梁红均未接通，设备持续离线，一线无法跟进。'),
      acceptEntry(claim2, '王坐席', '二线专员'),
      handleEntry(handled, '王坐席', '二线专员', '已联系学校信息老师，请其协助通知学生家长将平板开机联网。'),
    ]);
  }

  // ⑨ 一线刷机池 · 特殊情况（转校生）：不推送（PRD §4.1 第 1 行）
  {
    const info = infoOf('XFS20240600645', 'SCH-340103-001', '转校生', { name: '邹静怡', studyProof: true });
    const at = '2026-09-15 08:55:30';
    add(row(9, {
      info, creator: '用户提报', customer: '邹敏', phone: '15955116702',
      createdAt: at.slice(0, 16), updatedAt: at.slice(0, 16),
      nodeStatus: '未认领', assignee: null, tab: 'pool', nodeStep: 1,
      ...L1_NO_SLA,
      flashState: state('用户提报', { handoffReason: '特殊情况', pool: 'l1' }),
      runs: [],
    }), [
      createdByUser(at, '邹敏', { handoff: '特殊情况' }),
      handoffEntry(addSec(at, 2), '特殊情况', 'l1'),
    ]);
  }

  // ⑩ 一线刷机池 · 一线代建、首推接收失败 · 版本不符：建单不校验照常首推；
  //    MDM 返回该学生未毕业（年级代码 08），重推即被拦「该学生不是毕业生」（PRD §6.1 场景 E）
  {
    const info = infoOf('XFS30240900561', 'SCH-340111-008', '毕业生', { name: '韩博文', photos: false, mdmPhotos: true });
    const at = '2026-09-15 09:12:48';
    const pushed = addSec(at, 2);
    const back = addSec(pushed, 12);
    add(row(10, {
      info, creator: '一线代建', customer: '韩雪', phone: '13866107133',
      createdAt: at.slice(0, 16), updatedAt: back.slice(0, 16),
      nodeStatus: '未认领', assignee: null, tab: 'pool', nodeStep: 1,
      ...L1_NO_SLA,
      flashState: state('一线代建', {
        outcome: '接收失败', failL1: '接收失败', failL2: '版本不符', pushCount: 1,
        handoffReason: '接收失败', pool: 'l1',
      }),
      runs: [run({ seq: 1, trigger: '建单首推', pushedAt: pushed, result: '接收失败', failL1: '接收失败', failL2: '版本不符', resultAt: back })],
    }), [
      createdByAgent(at, '刘一线', '一线坐席', { auto: true }),
      pushEntry(pushed, 1),
      returnFail(back, '版本不符'),
      handoffEntry(addSec(back, 1), '接收失败', 'l1'),
    ]);
  }

  // ⑪ 二线池 · 一线升级（首推接收失败 · 版本不符 → 一线领取 → 升级二线）
  {
    const info = infoOf('XFX3P240500518', 'SCH-340202-003', '毕业生');
    const at = '2026-09-15 07:12:28';
    const pushed = addSec(at, 2);
    const back = addSec(pushed, 12);
    const claim = '2026-09-15 07:40:05';
    const esc = '2026-09-15 08:05:33';
    add(row(11, {
      info, creator: '用户提报', customer: '沈建', phone: '13505536419',
      createdAt: at.slice(0, 16), updatedAt: esc.slice(0, 16),
      // 一线不计 SLA：进教育刷机处理组池才起算，首响钟从进池时刻开始（1013 A26）
      nodeStatus: '未认领', assignee: null, tab: 'pool', responded: false, nodeStep: 2,
      slaText: '02:15:00', slaSub: '距超时', slaState: 'ok', slaMinutes: 135,
      upgradeCount: 1,
      flashState: state('用户提报', {
        outcome: '接收失败', failL1: '接收失败', failL2: '版本不符', pushCount: 1,
        handoffReason: '一线升级', pool: 'l2',
        result: '需升级二线', record: '已致电用户沈建，设备在线但系统版本过低，用户端检查更新无可用升级包，一线无法处理。',
        ...ledger(nowMs, esc, 135),
      }),
      runs: [run({ seq: 1, trigger: '建单首推', pushedAt: pushed, result: '接收失败', failL1: '接收失败', failL2: '版本不符', resultAt: back })],
    }), [
      createdByUser(at, '沈建', { auto: true }),
      pushEntry(pushed, 1),
      returnFail(back, '版本不符'),
      handoffEntry(addSec(back, 1), '接收失败', 'l1'),
      acceptEntry(claim, '刘一线', '一线坐席'),
      handleEntry(addSec(esc, -120), '刘一线', '一线坐席', '已致电用户沈建，设备在线但系统版本过低，用户端检查更新无可用升级包，一线无法处理。'),
      escalateEntry(esc, '刘一线', '已致电用户沈建，设备在线但系统版本过低，用户端检查更新无可用升级包，一线无法处理。'),
    ]);
  }

  // ⑫ 一线处理中 · 一线重新推送仍接收失败，交回发起人（未开机两次；1013 A14 / B1：不进教育刷机处理组池）
  {
    const info = infoOf('XFS20240600789', 'SCH-340104-050', '毕业生');
    const at = '2026-09-15 07:19:58';
    const pushed = addSec(at, 2);
    const back = addSec(pushed, 12);
    const claim = '2026-09-15 07:48:10';
    const repushed = '2026-09-15 08:30:10';
    const back2 = addSec(repushed, 12);
    add(row(12, {
      info, creator: '用户提报', customer: '陆明', phone: '18055128520',
      createdAt: at.slice(0, 16), updatedAt: back2.slice(0, 16),
      nodeStatus: '处理中', assignee: '刘一线', tab: 'mine', responded: true, nodeStep: 2,
      ...L1_NO_SLA,
      flashState: state('用户提报', {
        outcome: '接收失败', failL1: '接收失败', failL2: '未开机', pushCount: 2,
        handoffReason: '接收失败', pool: 'l1',
        record: '已电话联系用户陆明，用户称已开机，准备重新推送。',
      }),
      runs: [
        run({ seq: 1, trigger: '建单首推', pushedAt: pushed, result: '接收失败', failL1: '接收失败', failL2: '未开机', resultAt: back }),
        run({ seq: 2, trigger: '一线重推', by: '刘一线', byRole: '一线坐席', pushedAt: repushed, result: '接收失败', failL1: '接收失败', failL2: '未开机', resultAt: back2, handlerAtPush: '刘一线' }),
      ],
    }), [
      createdByUser(at, '陆明', { auto: true }),
      pushEntry(pushed, 1),
      returnFail(back, '未开机'),
      handoffEntry(addSec(back, 1), '接收失败', 'l1'),
      acceptEntry(claim, '刘一线', '一线坐席'),
      handleEntry(addSec(repushed, -80), '刘一线', '一线坐席', '已电话联系用户陆明，用户称已开机，准备重新推送。'),
      repushEntry(repushed, 2, '刘一线', '一线坐席'),
      returnFail(back2, '未开机'),
      tl(addSec(back2, 1), 'node', 'flashHandoff', '系统', '系统', '转人工', FLASH_TL.repushFailBack('刘一线')),
    ]);
  }

  // ⑬ 一线刷机池 · 回访未解决（自助成功 → 回访反馈未解决；一线未介入过，回一线刷机池，10-19 C2 / C3）
  {
    const info = infoOf('XFS30240900690', 'SCH-340111-168', '毕业生');
    const at = '2026-09-15 06:29:58';
    const pushed = addSec(at, 2);
    const back = addSec(pushed, 12);
    const survey = '2026-09-15 09:02:36';
    const surveyRemark = '设备重启后仍停留在学校管控界面，无法进入个人桌面。';
    add(row(13, {
      info, creator: '用户提报', customer: '杜娟', phone: '13956987908',
      createdAt: at.slice(0, 16), updatedAt: survey.slice(0, 16), serviceScore: 2,
      nodeStatus: '未认领', assignee: null, tab: 'pool', nodeStep: 4,
      ...L1_NO_SLA,
      flashState: state('用户提报', {
        outcome: '接收成功', pushCount: 1, result: '已线上刷机成功', surveyConcluded: true,
        handoffReason: '回访未解决', pool: 'l1',
        surveySentAt: addSec(back, 2),
        survey: { solved: false, score: 2, remark: surveyRemark, at: survey },
      }),
      runs: [run({ seq: 1, trigger: '建单首推', pushedAt: pushed, result: '接收成功', resultAt: back })],
    }), [
      createdByUser(at, '杜娟', { auto: true }),
      pushEntry(pushed, 1),
      returnOk(back),
      smsEntry(addSec(back, 1), '13956987908', flashSmsSuccess(no(13), info.sn)),
      smsEntry(addSec(back, 2), '13956987908', flashSmsSurvey(no(13))),
      tl(survey, 'customer', 'reply', '杜娟', '客户', '回访评价', FLASH_TL.surveyFeedback(false, 2, surveyRemark), { stars: 2 }),
      handoffEntry(addSec(survey, 1), '回访未解决', 'l1'),
    ]);
  }

  // ⑭ 一线处理中 · 已登记线下表格、已保存待下送（非自研；不填登记时间；下送后调研短信 48 小时后发，PRD §5.4）
  {
    const info = infoOf('LNX6C62404B0277', 'SCH-340302-002', '毕业生');
    const at = '2026-09-15 06:10:12';
    const claim = '2026-09-15 06:40:20';
    const registered = '2026-09-15 07:20:45';
    add(row(14, {
      info, creator: '用户提报', customer: '蒋丽', phone: '13855205625',
      createdAt: at.slice(0, 16), updatedAt: registered.slice(0, 16),
      nodeStatus: '处理中', assignee: '刘一线', tab: 'mine', responded: true, nodeStep: 3,
      ...L1_NO_SLA,
      flashState: state('用户提报', {
        handoffReason: '非自研机型', pool: 'l1',
        result: FLASH_RESULT_OFFLINE,
        record: '已在线下《返回原生系统信息登记表》登记该设备。',
      }),
      runs: [],
    }), [
      createdByUser(at, '蒋丽', { handoff: '非自研机型' }),
      handoffEntry(addSec(at, 2), '非自研机型', 'l1'),
      acceptEntry(claim, '刘一线', '一线坐席'),
      handleEntry(registered, '刘一线', '一线坐席', '已在线下《返回原生系统信息登记表》登记该设备。'),
    ]);
  }

  // ⑮ 调研中 · 自助刷机成功（无处理人）：建单时刻取加载时刻前 40 分钟，调研短信在调研超时时长内，打开时仍在调研中
  {
    const info = infoOf('XFS20240600823', 'SCH-341502-001', '毕业生');
    const at = flashStamp(nowMs - 40 * 60_000);
    const pushed = addSec(at, 2);
    const back = addSec(pushed, 12);
    add(row(15, {
      info, creator: '用户提报', customer: '叶青', phone: '15256430302',
      createdAt: at.slice(0, 16), updatedAt: back.slice(0, 16),
      nodeStatus: '调研中', assignee: null, tab: 'mine', nodeStep: 4,
      slaText: '—', slaSub: '自助刷机成功·未计时', slaState: 'ok', slaMinutes: 9999,
      flashState: state('用户提报', {
        outcome: '接收成功', pushCount: 1, result: '已线上刷机成功', surveySentAt: addSec(back, 2),
      }),
      runs: [run({ seq: 1, trigger: '建单首推', pushedAt: pushed, result: '接收成功', resultAt: back })],
    }), [
      createdByUser(at, '叶青', { auto: true }),
      pushEntry(pushed, 1),
      returnOk(back),
      smsEntry(addSec(back, 1), '15256430302', flashSmsSuccess(no(15), info.sn)),
      smsEntry(addSec(back, 2), '15256430302', flashSmsSurvey(no(15))),
    ]);
  }

  // ⑯ 已结案（自助成功 → 回访已解决）
  {
    const info = infoOf('XFS30240900745', 'SCH-340103-001', '毕业生');
    const at = '2026-09-15 06:11:40';
    const pushed = addSec(at, 2);
    const back = addSec(pushed, 12);
    const survey = '2026-09-15 08:18:05';
    add(row(16, {
      info, creator: '用户提报', customer: '秦海', phone: '13721061811',
      createdAt: at.slice(0, 16), updatedAt: survey.slice(0, 16),
      nodeStatus: '已结案', assignee: null, tab: 'mine', nodeStep: 5, serviceScore: 5,
      // X28：最后处理组＝教育刷机处理组（结案后补充按该组成员判编辑权）
      groupId: FLASH_POOLS.l2.groupId, groupNames: [FLASH_POOLS.l2.groupName],
      slaText: '—', slaSub: '已结案·未计时', slaState: 'ok', slaMinutes: 9999,
      flashState: state('用户提报', {
        outcome: '接收成功', pushCount: 1, result: '已线上刷机成功', surveyConcluded: true,
        surveySentAt: addSec(back, 2),
        survey: { solved: true, score: 5, remark: '', at: survey },
      }),
      runs: [run({ seq: 1, trigger: '建单首推', pushedAt: pushed, result: '接收成功', resultAt: back })],
    }), [
      createdByUser(at, '秦海', { auto: true }),
      pushEntry(pushed, 1),
      returnOk(back),
      smsEntry(addSec(back, 1), '13721061811', flashSmsSuccess(no(16), info.sn)),
      smsEntry(addSec(back, 2), '13721061811', flashSmsSurvey(no(16))),
      tl(survey, 'praise', 'praise', '秦海', '客户', '回访评价', FLASH_TL.surveyFeedback(true, 5, ''), { stars: 5 }),
      tl(addSec(survey, 1), 'node', 'resolved', '系统', '系统', '结案', FLASH_TL.surveySolvedClosed),
    ]);
  }

  // ⑰ 已转出（转售后）：版本不符 → 一线升级 → 二线重推仍失败 → 转售后
  {
    const info = infoOf('XFX3P240500634', 'SCH-340111-008', '毕业生');
    const at = '2026-09-15 06:02:18';
    const pushed = addSec(at, 2);
    const back = addSec(pushed, 12);
    const claim1 = '2026-09-15 06:30:40';
    const esc = '2026-09-15 07:02:15';
    const claim2 = '2026-09-15 07:20:02';
    const repushed = '2026-09-15 08:00:06';
    const back2 = addSec(repushed, 12);
    const toAs = '2026-09-15 09:20:31';
    add(row(17, {
      info, creator: '用户提报', customer: '顾红梅', phone: '13966713907',
      createdAt: at.slice(0, 16), updatedAt: toAs.slice(0, 16),
      nodeStatus: '已转出', assignee: '王坐席', tab: 'mine', responded: true, nodeStep: 4,
      slaText: '04:42:00', slaSub: '距超时', slaState: 'ok', slaMinutes: 282,
      linkedAftersaleNo: 'AS-20260915-39021', upgradeCount: 1,
      flashState: state('用户提报', {
        outcome: '接收失败', failL1: '接收失败', failL2: '版本不符', pushCount: 2,
        handoffReason: '一线升级', pool: 'l2',
        // 一线升级二线时落库的刷机处理结论与刷机处理记录（与「升级二线」履历所带处理记录同文）
        result: '需升级二线', record: '已指导用户开机联网，设备系统版本过低无法在线升级。',
        // 转售后：客服侧冻结，SLA 照常计时（PRD §4.3，1021）
        ...ledger(nowMs, esc, 282),
      }),
      runs: [
        run({ seq: 1, trigger: '建单首推', pushedAt: pushed, result: '接收失败', failL1: '接收失败', failL2: '版本不符', resultAt: back }),
        run({ seq: 2, trigger: '二线重推', by: '王坐席', byRole: '二线专员', pushedAt: repushed, result: '接收失败', failL1: '接收失败', failL2: '版本不符', resultAt: back2, handlerAtPush: '王坐席' }),
      ],
    }), [
      createdByUser(at, '顾红梅', { auto: true }),
      pushEntry(pushed, 1),
      returnFail(back, '版本不符'),
      handoffEntry(addSec(back, 1), '接收失败', 'l1'),
      acceptEntry(claim1, '刘一线', '一线坐席'),
      handleEntry(addSec(esc, -110), '刘一线', '一线坐席', '已指导用户开机联网，设备系统版本过低无法在线升级。'),
      escalateEntry(esc, '刘一线', '已指导用户开机联网，设备系统版本过低无法在线升级。'),
      acceptEntry(claim2, '王坐席', '二线专员'),
      handleEntry(addSec(repushed, -300), '王坐席', '二线专员', '已在工单刷机问题沟通群反馈，硬件平台下发兼容刷机包，准备重新推送。'),
      repushEntry(repushed, 2, '王坐席', '二线专员'),
      returnFail(back2, '版本不符'),
      tl(addSec(back2, 1), 'node', 'flashHandoff', '系统', '系统', '转人工', FLASH_TL.repushFailBack('王坐席')),
      tl(toAs, 'node', 'transfer', '王坐席', '二线专员', '转售后', '设备系统分区异常无法在线刷机，已转售后寄修检测，售后单 AS-20260915-39021。'),
    ]);
  }

  // ⑱ 一线刷机池 · 回传超时转人工后迟到回传「接收成功」（M11 / M48）：状态与处理人不变，只记迟到回传时间
  {
    const info = infoOf('XFS30240900918', 'SCH-340302-002', '毕业生');
    const at = '2026-09-15 06:20:05';
    const pushed = addSec(at, 2);
    const timeout = addSec(pushed, 120 * 60);
    const late = '2026-09-15 08:47:32';
    add(row(18, {
      info, creator: '用户提报', customer: '宋建华', phone: '13905527418',
      createdAt: at.slice(0, 16), updatedAt: late.slice(0, 16),
      nodeStatus: '未认领', assignee: null, tab: 'pool', nodeStep: 1,
      ...L1_NO_SLA,
      flashState: state('用户提报', {
        outcome: '推送异常', failL1: '推送异常', failL2: '回传超时', pushCount: 1,
        handoffReason: '推送异常', pool: 'l1', lateSuccessAt: late,
      }),
      runs: [run({ seq: 1, trigger: '建单首推', pushedAt: pushed, result: '推送异常', failL1: '推送异常', failL2: '回传超时', resultAt: timeout })],
    }), [
      createdByUser(at, '宋建华', { auto: true }),
      pushEntry(pushed, 1),
      tl(timeout, 'node', 'flashFail', '系统', '系统', '回传超时', FLASH_TL.returnTimeout('推送异常 · 回传超时', 2)),
      handoffEntry(addSec(timeout, 1), '推送异常', 'l1'),
      tl(late, 'node', 'flashSuccess', '系统', '系统', '回传结果', FLASH_TL.lateSuccess),
    ]);
  }

  // ⑲ 调研中 · 下送已超过调研超时时长（M26′ / M86）：打开页面即判「调研超时未评价，自动结案」
  //    首推未联网 → 一线领取、指导联网后在修改刷机信息里重新推送 → 接收成功，系统写处理结果并转入回访（1013 B1）；
  //    转入回访时刻取加载时刻前 73 小时
  {
    const info = infoOf('XFS20240600966', 'SCH-340104-050', '毕业生', { name: '周子涵' });
    const forwardAt = nowMs - 73 * 3_600_000;
    const at = flashStamp(forwardAt - 52 * 60_000 - 14_000);
    const pushed = addSec(at, 2);
    const back = addSec(pushed, 12);
    const claim = addSec(at, 25 * 60);
    const repushed = flashStamp(forwardAt - 13_000);
    const back2 = flashStamp(forwardAt - 1_000);
    const forwarded = flashStamp(forwardAt);
    add(row(19, {
      info, creator: '用户提报', customer: '周建平', phone: '13856071966',
      createdAt: at.slice(0, 16), updatedAt: forwarded.slice(0, 16),
      nodeStatus: '调研中', assignee: '刘一线', tab: 'mine', responded: true, nodeStep: 4,
      slaText: '—', slaSub: '调研中', slaState: 'ok', slaMinutes: 9999,
      flashState: state('用户提报', {
        outcome: '接收成功', pushCount: 2,
        handoffReason: '接收失败', pool: 'l1',
        result: FLASH_RESULT_ONLINE_SUCCESS,
        record: '已电话联系用户周建平，指导平板连接家庭 WiFi，设备已在线，准备重新推送。',
        surveySentAt: addSec(forwarded, 1),
      }),
      runs: [
        run({ seq: 1, trigger: '建单首推', pushedAt: pushed, result: '接收失败', failL1: '接收失败', failL2: '未联网', resultAt: back }),
        run({ seq: 2, trigger: '一线重推', by: '刘一线', byRole: '一线坐席', pushedAt: repushed, result: '接收成功', resultAt: back2, handlerAtPush: '刘一线' }),
      ],
    }), [
      createdByUser(at, '周建平', { auto: true }),
      pushEntry(pushed, 1),
      returnFail(back, '未联网'),
      handoffEntry(addSec(back, 1), '接收失败', 'l1'),
      acceptEntry(claim, '刘一线', '一线坐席'),
      handleEntry(addSec(repushed, -90), '刘一线', '一线坐席', '已电话联系用户周建平，指导平板连接家庭 WiFi，设备已在线，准备重新推送。'),
      repushEntry(repushed, 2, '刘一线', '一线坐席'),
      // 与刷机服务 `succeed()` 同序同文：回传结果 → 系统写处理结果并转入回访 → 成功短信 → 调研短信
      returnOk(back2),
      tl(back2, 'node', 'resolved', '系统', '系统', '回传结果', FLASH_TL.repushSuccessSurvey),
      smsEntry(addSec(back2, 1), '13856071966', flashSmsSuccess(no(19), info.sn)),
      smsEntry(addSec(back2, 2), '13856071966', flashSmsSurvey(no(19))),
    ]);
  }

  // ⑳ 二线池 · 回访未解决（一线介入过）：首推未开机 → 一线领取、联系用户后在修改刷机信息里重新推送 → 接收成功，
  //    系统写处理结果并转入回访 → 回访反馈未解决；一线已介入过，直接进教育刷机处理组池（10-19 C2 / C3）
  {
    const info = infoOf('XFS30240901020', 'SCH-341502-001', '毕业生');
    const at = '2026-09-15 05:40:10';
    const pushed = addSec(at, 2);
    const back = addSec(pushed, 12);
    const claim = '2026-09-15 06:05:00';
    const handled = '2026-09-15 06:20:00';
    const repushed = '2026-09-15 06:21:30';
    const back2 = addSec(repushed, 12);
    const survey = '2026-09-15 09:30:00';
    const surveyRemark = '刷机后开机仍提示设备未激活，学生无法登录。';
    add(row(20, {
      info, creator: '用户提报', customer: '孙建军', phone: '13965201020',
      createdAt: at.slice(0, 16), updatedAt: survey.slice(0, 16), serviceScore: 2,
      nodeStatus: '未认领', assignee: null, tab: 'pool', nodeStep: 4,
      slaText: '06:00:00', slaSub: '距超时', slaState: 'ok', slaMinutes: 360,
      flashState: state('用户提报', {
        outcome: '接收成功', pushCount: 2, result: FLASH_RESULT_ONLINE_SUCCESS, surveyConcluded: true,
        record: '已致电用户孙建军，指导开机并连接家庭 WiFi，设备已在线，准备重新推送。',
        handoffReason: '回访未解决', pool: 'l2',
        ...ledger(nowMs, addSec(survey, 1), 360),
        surveySentAt: addSec(back2, 2),
        survey: { solved: false, score: 2, remark: surveyRemark, at: survey },
      }),
      runs: [
        run({ seq: 1, trigger: '建单首推', pushedAt: pushed, result: '接收失败', failL1: '接收失败', failL2: '未开机', resultAt: back }),
        run({ seq: 2, trigger: '一线重推', by: '刘一线', byRole: '一线坐席', pushedAt: repushed, result: '接收成功', resultAt: back2, handlerAtPush: '刘一线' }),
      ],
    }), [
      createdByUser(at, '孙建军', { auto: true }),
      pushEntry(pushed, 1),
      returnFail(back, '未开机'),
      handoffEntry(addSec(back, 1), '接收失败', 'l1'),
      acceptEntry(claim, '刘一线', '一线坐席'),
      handleEntry(handled, '刘一线', '一线坐席', '已致电用户孙建军，指导开机并连接家庭 WiFi，设备已在线，准备重新推送。'),
      repushEntry(repushed, 2, '刘一线', '一线坐席'),
      returnOk(back2),
      tl(back2, 'node', 'resolved', '系统', '系统', '回传结果', FLASH_TL.repushSuccessSurvey),
      smsEntry(addSec(back2, 1), '13965201020', flashSmsSuccess(no(20), info.sn)),
      smsEntry(addSec(back2, 2), '13965201020', flashSmsSurvey(no(20))),
      tl(survey, 'customer', 'reply', '孙建军', '客户', '回访评价', FLASH_TL.surveyFeedback(false, 2, surveyRemark), { stars: 2 }),
      handoffEntry(addSec(survey, 1), '回访未解决', 'l2'),
    ]);
  }

  // ㉑ 自动刷机中 · 回传无响应（稳定样本）：几秒前刚推送，设备始终无回传，到回传超时时长（缺省 2 小时）才转人工；
  //    ① 十几秒即出回传结果，本单在此之前一直停在「自动刷机中」
  {
    const info = infoOf('XFS30240901009', 'SCH-340104-046', '毕业生');
    const created = flashStamp(nowMs - 8_000);
    const pushed = flashStamp(nowMs - 6_000);
    add(row(21, {
      info, creator: '用户提报', customer: '吴海峰', phone: '13856021109',
      createdAt: created.slice(0, 16), updatedAt: pushed.slice(0, 16),
      nodeStatus: '自动刷机中', assignee: null, tab: 'mine', nodeStep: 2,
      ...L1_NO_SLA,
      flashState: state('用户提报', { outcome: '等待回传', pushCount: 1 }),
      runs: [run({ seq: 1, trigger: '建单首推', pushedAt: pushed, result: '等待回传' })],
    }), [
      createdByUser(created, '吴海峰', { auto: true }),
      pushEntry(pushed, 1),
    ]);
  }

  return { tickets, timelines };
}

/** 模块加载时生成一次：工单库与刷机服务共用同一份种子 */
export const FLASH_SEEDS: FlashSeedBundle = buildFlashSeeds(Date.now());
