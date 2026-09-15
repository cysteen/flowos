/**
 * 教育刷机单 · 工单库在办 / 已办样本（930 教育刷机单）。
 *
 * 每张单的刷机信息都取自 MDM 设备台账、毕业名单、学校库（`mock/flash/*`、`mock/schools.ts`），
 * 推送记录与履历按底数推演，与刷机服务 `stores/flash.ts` 的规则一致。
 *
 * 两张「自动刷机中」的推送时刻、一张线下登记单的登记时刻取**模块加载时刻**倒推：
 * 第一次打开页面后十几秒出回传结果、回传无响应那张加载即判超时、线下登记那张 SLA 暂停中。
 * 之后的状态由刷机服务持久化（`FLASH_LS_KEYS`），刷新页面不回到种子。
 *
 * 并入工单库的位置：`mock/tickets.ts` 的 `TICKETS`。
 */
import type { Ticket } from '@/views/tickets/types/ticket';
import type { TimelineEntry, TlAction, TlCategory, TlRole } from '@/views/tickets/types/ticketDetail';
import {
  FLASH_POOLS, FLASH_RETURN_TIMEOUT_DEFAULT_MIN, FLASH_TL, flashFailReasonText, flashMinuteStamp, flashSmsHandoff,
  flashSmsSuccess, flashStamp, offlineBatchResumeAt, parseFlashStamp,
  type FlashCreator, type FlashFailL1, type FlashFailL2, type FlashHandoffReason, type FlashInfo, type FlashPoolKey,
  type FlashReason, type FlashRun, type FlashRunResult, type FlashState, type FlashPushTrigger,
  type FlashVerifyResult,
} from '@/views/tickets/types/flash';
import { findSchoolById } from '@/mock/schools';
import { findMdmDevice } from './mdmDevices';
import { GRADUATE_ROSTER } from './graduates';

export interface FlashSeedBundle {
  tickets: Ticket[];
  /** 工单号 → 刷机链路履历（时间正序） */
  timelines: Record<string, TimelineEntry[]>;
}

const DAY = '20260915';
const no = (n: number) => `IFLYSH-${DAY}-${String(n).padStart(5, '0')}`;

/** 按 SN 从底数组装刷机信息；`account` 覆盖提报时填写的学生账号（校验不一致的场景） */
function infoOf(
  sn: string,
  schoolId: string,
  reason: FlashReason,
  opts: { account?: string; name?: string; backfill?: boolean; photos?: boolean } = {},
): FlashInfo {
  const d = findMdmDevice(sn);
  if (!d) throw new Error(`MDM 台账缺少设备 ${sn}`);
  const account = opts.account ?? d.studentAccount;
  const grad = GRADUATE_ROSTER.find((g) => g.studentAccount === d.studentAccount);
  const backfill = opts.backfill ?? true;
  return {
    productModel: d.model,
    sn: d.sn,
    studentAccount: account,
    studentName: opts.name ?? grad?.studentName ?? '',
    schoolId,
    schoolName: findSchoolById(schoolId)?.name ?? '',
    reason,
    romVersion: backfill ? d.romVersion : '',
    mdmVersion: backfill ? d.mdmVersion : '',
    versionBackfilled: backfill,
    snPhotos: opts.photos === false ? [] : [`设备SN照片_${d.sn}.jpg`],
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
    returnTimeoutMin: FLASH_RETURN_TIMEOUT_DEFAULT_MIN,
  };
}

const VERIFY_PASS: FlashVerifyResult = { status: '已校验', snAccountMatch: '通过', graduate: '通过' };

/** 缺省按「建单校验两项均通过」；未跑校验的（特殊情况）显式传「未校验」 */
function state(creator: FlashCreator, p: Partial<FlashState>): FlashState {
  return {
    outcome: '未推送', pushCount: 0, l1RepushCount: 0, surveyConcluded: false, creator,
    verifyResult: VERIFY_PASS,
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
  const { info, creator, customer, phone, flashState, runs, ...rest } = p;
  const byUser = creator === '用户提报';
  const pool: FlashPoolKey | undefined = flashState.pool;
  return {
    id: `flash-${n}`,
    no: no(n),
    type: '刷机',
    channel: byUser ? '小程序' : '电话',
    ticketSource: byUser ? '客户服务小程序' : '电话',
    title: `${info.reason}刷机申请 · ${info.productModel}`,
    smartMarks: [],
    customer,
    vip: false,
    customerPhone: phone,
    sn: info.sn,
    product: info.productModel,
    productCategory: '学习硬件',
    businessType: '教育',
    priority: 'P2',
    nodeStep: 2,
    nodeTotal: 5,
    groupId: pool ? FLASH_POOLS[pool].groupId : undefined,
    groupNames: pool ? [FLASH_POOLS[pool].groupName] : undefined,
    problemDesc: `学生${info.studentName}（账号 ${info.studentAccount}，${info.schoolName}）申请刷机，刷机原因：${info.reason}。设备 SN ${info.sn}。`,
    responded: false,
    ...rest,
    flash: { info, state: flashState, runs },
  };
}

type SeedDest = { auto: true } | { handoff: FlashHandoffReason };

/** 「用户提报」建单履历（PRD §11.2「建单」；操作人沿用提报用户，X4） */
function createdByUser(when: string, customer: string, verify: FlashVerifyResult, dest: SeedDest): TimelineEntry {
  return tl(when, 'node', 'create', customer, '客户', '建单', FLASH_TL.create('用户提报', verify, dest));
}
function createdByAgent(when: string, agent: string, role: TlRole, creator: FlashCreator, verify: FlashVerifyResult, dest: SeedDest): TimelineEntry {
  return tl(when, 'node', 'create', agent, role, '建单', FLASH_TL.create(creator, verify, dest));
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
function escalateEntry(when: string, who: string, note: string, checks: string): TimelineEntry {
  return tl(when, 'node', 'escalate', who, '一线坐席', '升级二线',
    `升级至教育刷机处理组；升级说明：${note}；已做排查：${checks}`);
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
    const info = infoOf('XFS20240600131', 'SCH-340103-001', '毕业');
    const created = flashStamp(nowMs - 6_000);
    const pushed = flashStamp(nowMs - 4_000);
    add(row(1, {
      info, creator: '用户提报', customer: '胡建国', phone: '13956011215',
      createdAt: created.slice(0, 16), updatedAt: pushed.slice(0, 16),
      nodeStatus: '自动刷机中', assignee: null, tab: 'mine', nodeStep: 2,
      slaText: '已暂停', slaSub: '自动刷机中', slaState: 'paused', slaMinutes: 9999,
      flashState: state('用户提报', { outcome: '等待回传', pushCount: 1 }),
      runs: [run({ seq: 1, trigger: '建单首推', pushedAt: pushed, result: '等待回传' })],
    }), [
      createdByUser(created, '胡建国', VERIFY_PASS, { auto: true }),
      pushEntry(pushed, 1),
    ]);
  }

  // ② 自动刷机中 · 回传无响应：推送已超过回传超时时长，加载即判「推送异常 · 回传超时」转人工
  {
    const info = infoOf('XFS30240900218', 'SCH-340111-008', '毕业');
    const created = flashStamp(nowMs - 125 * 60_000 - 3_000);
    const pushed = flashStamp(nowMs - 125 * 60_000);
    add(row(2, {
      info, creator: '用户提报', customer: '程丽', phone: '13856022318',
      createdAt: created.slice(0, 16), updatedAt: pushed.slice(0, 16),
      nodeStatus: '自动刷机中', assignee: null, tab: 'mine',
      slaText: '已暂停', slaSub: '自动刷机中', slaState: 'paused', slaMinutes: 9999,
      flashState: state('用户提报', { outcome: '等待回传', pushCount: 1 }),
      runs: [run({ seq: 1, trigger: '建单首推', pushedAt: pushed, result: '等待回传' })],
    }), [
      createdByUser(created, '程丽', VERIFY_PASS, { auto: true }),
      pushEntry(pushed, 1),
    ]);
  }

  // ③ 一线刷机池 · 建单校验不通过（用户提报）：提报账号与 MDM 绑定账号不一致
  {
    const info = infoOf('XFS20240600377', 'SCH-340103-001', '毕业', { account: 'hf1z2023s0599', name: '唐语桐' });
    const at = '2026-09-15 08:42:16';
    const sms = flashSmsHandoff(no(3));
    add(row(3, {
      info, creator: '用户提报', customer: '唐伟', phone: '13705513377',
      createdAt: at.slice(0, 16), updatedAt: at.slice(0, 16),
      nodeStatus: '未认领', assignee: null, tab: 'pool', nodeStep: 1,
      slaText: '06:12:00', slaSub: '距超时', slaState: 'ok', slaMinutes: 372,
      flashState: state('用户提报', {
        failL1: '建单校验不通过', failL2: 'SN与学生账号不一致',
        verifyResult: { status: '已校验', snAccountMatch: '不通过', graduate: '不通过' },
        handoffReason: '建单校验不通过', pool: 'l1', handoffSmsSent: true,
      }),
      runs: [],
    }), [
      createdByUser(at, '唐伟', { status: '已校验', snAccountMatch: '不通过', graduate: '不通过' }, { handoff: '建单校验不通过' }),
      handoffEntry(addSec(at, 2), '建单校验不通过', 'l1'),
      smsEntry(addSec(at, 3), '13705513377', sms),
    ]);
  }

  // ④ 一线刷机池 · 非自研机型（联想）
  {
    const info = infoOf('LNJ606F2403A0912', 'SCH-340202-003', '毕业');
    const at = '2026-09-15 09:05:40';
    add(row(4, {
      info, creator: '用户提报', customer: '马骏', phone: '13966304107',
      createdAt: at.slice(0, 16), updatedAt: at.slice(0, 16),
      nodeStatus: '未认领', assignee: null, tab: 'pool', nodeStep: 1,
      slaText: '06:35:00', slaSub: '距超时', slaState: 'ok', slaMinutes: 395,
      flashState: state('用户提报', { handoffReason: '非自研机型', pool: 'l1', handoffSmsSent: true }),
      runs: [],
    }), [
      createdByUser(at, '马骏', VERIFY_PASS, { handoff: '非自研机型' }),
      handoffEntry(addSec(at, 2), '非自研机型', 'l1'),
      smsEntry(addSec(at, 3), '13966304107', flashSmsHandoff(no(4))),
    ]);
  }

  // ⑤ 一线刷机池 · 接收失败 · 未开机
  {
    const info = infoOf('XFX3P240500452', 'SCH-340104-050', '毕业');
    const at = '2026-09-15 09:20:08';
    const pushed = addSec(at, 2);
    const back = addSec(pushed, 12);
    add(row(5, {
      info, creator: '用户提报', customer: '许志强', phone: '15855170233',
      createdAt: at.slice(0, 16), updatedAt: back.slice(0, 16),
      nodeStatus: '未认领', assignee: null, tab: 'pool', nodeStep: 1,
      slaText: '06:50:00', slaSub: '距超时', slaState: 'ok', slaMinutes: 410,
      flashState: state('用户提报', {
        outcome: '接收失败', failL1: '接收失败', failL2: '未开机', pushCount: 1,
        handoffReason: '接收失败', pool: 'l1', handoffSmsSent: true,
      }),
      runs: [run({ seq: 1, trigger: '建单首推', pushedAt: pushed, result: '接收失败', failL1: '接收失败', failL2: '未开机', resultAt: back })],
    }), [
      createdByUser(at, '许志强', VERIFY_PASS, { auto: true }),
      pushEntry(pushed, 1),
      returnFail(back, '未开机'),
      handoffEntry(addSec(back, 1), '接收失败', 'l1'),
      smsEntry(addSec(back, 2), '15855170233', flashSmsHandoff(no(5))),
    ]);
  }

  // ⑥ 一线刷机池 · 推送异常 · 回传超时
  {
    const info = infoOf('XFS30240900307', 'SCH-340111-168', '毕业');
    const at = '2026-09-15 07:40:02';
    const pushed = addSec(at, 3);
    const timeout = addSec(pushed, 120 * 60);
    add(row(6, {
      info, creator: '用户提报', customer: '钱芳', phone: '18955102021',
      createdAt: at.slice(0, 16), updatedAt: timeout.slice(0, 16),
      nodeStatus: '未认领', assignee: null, tab: 'pool', nodeStep: 1,
      slaText: '07:05:00', slaSub: '距超时', slaState: 'ok', slaMinutes: 425,
      flashState: state('用户提报', {
        outcome: '推送异常', failL1: '推送异常', failL2: '回传超时', pushCount: 1,
        handoffReason: '推送异常', pool: 'l1', handoffSmsSent: true,
      }),
      runs: [run({ seq: 1, trigger: '建单首推', pushedAt: pushed, result: '推送异常', failL1: '推送异常', failL2: '回传超时', resultAt: timeout })],
    }), [
      createdByUser(at, '钱芳', VERIFY_PASS, { auto: true }),
      pushEntry(pushed, 1),
      tl(timeout, 'node', 'flashFail', '系统', '系统', '回传超时', FLASH_TL.returnTimeout('推送异常 · 回传超时', 2)),
      handoffEntry(addSec(timeout, 1), '推送异常', 'l1'),
      smsEntry(addSec(timeout, 2), '18955102021', flashSmsHandoff(no(6))),
    ]);
  }

  // ⑦ 一线处理中 · 已领取、未重推（接收失败 · 原因未返回）
  {
    const info = infoOf('XFS20240600512', 'SCH-340302-002', '毕业');
    const at = '2026-09-15 07:05:10';
    const pushed = addSec(at, 2);
    const back = addSec(pushed, 12);
    const claim = '2026-09-15 07:30:25';
    const handled = '2026-09-15 07:42:08';
    add(row(7, {
      info, creator: '用户提报', customer: '冯涛', phone: '13605521310',
      createdAt: at.slice(0, 16), updatedAt: handled.slice(0, 16),
      nodeStatus: '处理中', assignee: '刘一线', tab: 'mine', responded: true, nodeStep: 2,
      slaText: '03:40:00', slaSub: '距超时', slaState: 'ok', slaMinutes: 220,
      flashState: state('用户提报', {
        outcome: '接收失败', failL1: '接收失败', pushCount: 1,
        handoffReason: '接收失败', pool: 'l1', handoffSmsSent: true,
      }),
      runs: [run({ seq: 1, trigger: '建单首推', pushedAt: pushed, result: '接收失败', failL1: '接收失败', resultAt: back })],
    }), [
      createdByUser(at, '冯涛', VERIFY_PASS, { auto: true }),
      pushEntry(pushed, 1),
      returnFail(back),
      handoffEntry(addSec(back, 1), '接收失败', 'l1'),
      smsEntry(addSec(back, 2), '13605521310', flashSmsHandoff(no(7))),
      acceptEntry(claim, '刘一线', '一线坐席'),
      handleEntry(handled, '刘一线', '一线坐席',
        '已致电用户冯涛，经智能硬件平台查询设备推送时处于离线状态；已指导用户将平板连接家庭 WiFi，用户表示晚间开机联网后回电确认。'),
    ]);
  }

  // ⑧ 一线处理中 · 一线重推次数已用完（首推未联网 → 一线指导联网后重推成功 → 回原处理人）
  {
    const info = infoOf('XFS30240900433', 'SCH-341502-001', '毕业');
    const at = '2026-09-15 08:10:01';
    const pushed = addSec(at, 2);
    const back = addSec(pushed, 12);
    const claim = '2026-09-15 08:35:12';
    const repushed = '2026-09-15 09:02:40';
    const back2 = addSec(repushed, 12);
    add(row(8, {
      info, creator: '用户提报', customer: '梁红', phone: '13966018716',
      createdAt: at.slice(0, 16), updatedAt: back2.slice(0, 16),
      nodeStatus: '处理中', assignee: '刘一线', tab: 'mine', responded: true, nodeStep: 3,
      slaText: '05:20:00', slaSub: '距超时', slaState: 'ok', slaMinutes: 320,
      flashState: state('用户提报', {
        outcome: '接收成功', pushCount: 2, l1RepushCount: 1,
        handoffReason: '接收失败', pool: 'l1', handoffSmsSent: true,
      }),
      runs: [
        run({ seq: 1, trigger: '建单首推', pushedAt: pushed, result: '接收失败', failL1: '接收失败', failL2: '未联网', resultAt: back }),
        run({ seq: 2, trigger: '一线重推', by: '刘一线', byRole: '一线坐席', pushedAt: repushed, result: '接收成功', resultAt: back2, handlerAtPush: '刘一线' }),
      ],
    }), [
      createdByUser(at, '梁红', VERIFY_PASS, { auto: true }),
      pushEntry(pushed, 1),
      returnFail(back, '未联网'),
      handoffEntry(addSec(back, 1), '接收失败', 'l1'),
      smsEntry(addSec(back, 2), '13966018716', flashSmsHandoff(no(8))),
      acceptEntry(claim, '刘一线', '一线坐席'),
      handleEntry(addSec(repushed, -95), '刘一线', '一线坐席', '已电话联系用户梁红，指导平板连接家庭 WiFi，设备已在线，准备重新推送。'),
      repushEntry(repushed, 2, '刘一线', '一线坐席'),
      returnOk(back2),
      tl(back2, 'node', 'flashSuccess', '系统', '系统', '回传结果', FLASH_TL.repushSuccess('刘一线')),
      smsEntry(addSec(back2, 1), '13966018716', flashSmsSuccess(no(8), info.sn)),
    ]);
  }

  // ⑨ 二线池 · 特殊情况（转校）：不跑校验、不推送
  {
    const info = infoOf('XFS20240600645', 'SCH-340103-001', '转校', { name: '邹静怡', backfill: false });
    const at = '2026-09-15 08:55:30';
    add(row(9, {
      info, creator: '用户提报', customer: '邹敏', phone: '15955116702',
      createdAt: at.slice(0, 16), updatedAt: at.slice(0, 16),
      nodeStatus: '未认领', assignee: null, tab: 'pool', nodeStep: 1,
      slaText: '06:25:00', slaSub: '距超时', slaState: 'ok', slaMinutes: 385,
      flashState: state('用户提报', { handoffReason: '特殊情况', pool: 'l2', handoffSmsSent: true, verifyResult: { status: '未校验' } }),
      runs: [],
    }), [
      createdByUser(at, '邹敏', { status: '未校验' }, { handoff: '特殊情况' }),
      handoffEntry(addSec(at, 2), '特殊情况', 'l2'),
      smsEntry(addSec(at, 3), '15955116702', flashSmsHandoff(no(9))),
    ]);
  }

  // ⑩ 二线池 · 一线代建、建单校验不通过（非毕业生身份）
  {
    const info = infoOf('XFS30240900561', 'SCH-340111-008', '毕业', { name: '韩博文', photos: false });
    const at = '2026-09-15 09:12:48';
    add(row(10, {
      info, creator: '一线代建', customer: '韩雪', phone: '13866107133',
      createdAt: at.slice(0, 16), updatedAt: at.slice(0, 16),
      nodeStatus: '未认领', assignee: null, tab: 'pool', nodeStep: 1,
      slaText: '06:42:00', slaSub: '距超时', slaState: 'ok', slaMinutes: 402,
      flashState: state('一线代建', {
        failL1: '建单校验不通过', failL2: '非毕业生身份',
        verifyResult: { status: '已校验', snAccountMatch: '通过', graduate: '不通过' },
        handoffReason: '建单校验不通过', pool: 'l2', handoffSmsSent: true,
      }),
      runs: [],
    }), [
      createdByAgent(at, '刘一线', '一线坐席', '一线代建',
        { status: '已校验', snAccountMatch: '通过', graduate: '不通过' }, { handoff: '建单校验不通过' }),
      handoffEntry(addSec(at, 2), '建单校验不通过', 'l2'),
      smsEntry(addSec(at, 3), '13866107133', flashSmsHandoff(no(10))),
    ]);
  }

  // ⑪ 二线池 · 一线升级（首推接收失败 · 版本不符 → 一线领取 → 升级二线）
  {
    const info = infoOf('XFX3P240500518', 'SCH-340202-003', '毕业');
    const at = '2026-09-15 07:12:28';
    const pushed = addSec(at, 2);
    const back = addSec(pushed, 12);
    const claim = '2026-09-15 07:40:05';
    const esc = '2026-09-15 08:05:33';
    add(row(11, {
      info, creator: '用户提报', customer: '沈建', phone: '13505536419',
      createdAt: at.slice(0, 16), updatedAt: esc.slice(0, 16),
      nodeStatus: '未认领', assignee: null, tab: 'pool', responded: true, nodeStep: 2,
      slaText: '02:15:00', slaSub: '距超时', slaState: 'ok', slaMinutes: 135,
      upgradeCount: 1,
      flashState: state('用户提报', {
        outcome: '接收失败', failL1: '接收失败', failL2: '版本不符', pushCount: 1,
        handoffReason: '一线升级', pool: 'l2', handoffSmsSent: true,
      }),
      runs: [run({ seq: 1, trigger: '建单首推', pushedAt: pushed, result: '接收失败', failL1: '接收失败', failL2: '版本不符', resultAt: back })],
    }), [
      createdByUser(at, '沈建', VERIFY_PASS, { auto: true }),
      pushEntry(pushed, 1),
      returnFail(back, '版本不符'),
      handoffEntry(addSec(back, 1), '接收失败', 'l1'),
      smsEntry(addSec(back, 2), '13505536419', flashSmsHandoff(no(11))),
      acceptEntry(claim, '刘一线', '一线坐席'),
      handleEntry(addSec(esc, -120), '刘一线', '一线坐席', '已致电用户沈建，设备在线但系统版本过低，用户端检查更新无可用升级包，一线无法处理。'),
      escalateEntry(esc, '刘一线', '设备系统版本过低，用户端检查更新无可用升级包，需二线处理', '已指导开机联网、其他'),
    ]);
  }

  // ⑫ 二线池 · 一线重推失败（未开机两次）
  {
    const info = infoOf('XFS20240600789', 'SCH-340104-050', '毕业');
    const at = '2026-09-15 07:19:58';
    const pushed = addSec(at, 2);
    const back = addSec(pushed, 12);
    const claim = '2026-09-15 07:48:10';
    const repushed = '2026-09-15 08:30:10';
    const back2 = addSec(repushed, 12);
    add(row(12, {
      info, creator: '用户提报', customer: '陆明', phone: '18055128520',
      createdAt: at.slice(0, 16), updatedAt: back2.slice(0, 16),
      nodeStatus: '未认领', assignee: null, tab: 'pool', responded: true, nodeStep: 2,
      slaText: '01:50:00', slaSub: '距超时', slaState: 'ok', slaMinutes: 110,
      flashState: state('用户提报', {
        outcome: '接收失败', failL1: '接收失败', failL2: '未开机', pushCount: 2, l1RepushCount: 1,
        handoffReason: '一线重推失败', pool: 'l2', handoffSmsSent: true,
      }),
      runs: [
        run({ seq: 1, trigger: '建单首推', pushedAt: pushed, result: '接收失败', failL1: '接收失败', failL2: '未开机', resultAt: back }),
        run({ seq: 2, trigger: '一线重推', by: '刘一线', byRole: '一线坐席', pushedAt: repushed, result: '接收失败', failL1: '接收失败', failL2: '未开机', resultAt: back2, handlerAtPush: '刘一线' }),
      ],
    }), [
      createdByUser(at, '陆明', VERIFY_PASS, { auto: true }),
      pushEntry(pushed, 1),
      returnFail(back, '未开机'),
      handoffEntry(addSec(back, 1), '接收失败', 'l1'),
      smsEntry(addSec(back, 2), '18055128520', flashSmsHandoff(no(12))),
      acceptEntry(claim, '刘一线', '一线坐席'),
      handleEntry(addSec(repushed, -80), '刘一线', '一线坐席', '已电话联系用户陆明，用户称已开机，准备重新推送。'),
      repushEntry(repushed, 2, '刘一线', '一线坐席'),
      returnFail(back2, '未开机'),
      handoffEntry(addSec(back2, 1), '一线重推失败', 'l2'),
    ]);
  }

  // ⑬ 二线池 · 回访未解决（自助成功 → 回访反馈未解决）
  {
    const info = infoOf('XFS30240900690', 'SCH-340111-168', '毕业');
    const at = '2026-09-15 06:29:58';
    const pushed = addSec(at, 2);
    const back = addSec(pushed, 12);
    const survey = '2026-09-15 09:02:36';
    add(row(13, {
      info, creator: '用户提报', customer: '杜娟', phone: '13956987908',
      createdAt: at.slice(0, 16), updatedAt: survey.slice(0, 16),
      nodeStatus: '未认领', assignee: null, tab: 'pool', nodeStep: 4,
      slaText: '05:30:00', slaSub: '距超时', slaState: 'ok', slaMinutes: 330,
      flashState: state('用户提报', {
        outcome: '接收成功', pushCount: 1, result: '已线上刷机成功', surveyConcluded: true,
        handoffReason: '回访未解决', pool: 'l2',
      }),
      runs: [run({ seq: 1, trigger: '建单首推', pushedAt: pushed, result: '接收成功', resultAt: back })],
    }), [
      createdByUser(at, '杜娟', VERIFY_PASS, { auto: true }),
      pushEntry(pushed, 1),
      returnOk(back),
      smsEntry(addSec(back, 1), '13956987908', flashSmsSuccess(no(13), info.sn)),
      tl(survey, 'customer', 'reply', '杜娟', '客户', '回访评价', '是否解决：未解决。设备重启后仍停留在学校管控界面，无法进入个人桌面。'),
      handoffEntry(addSec(survey, 1), '回访未解决', 'l2'),
    ]);
  }

  // ⑭ 二线处理中 · 已线下登记、等待批推后确认（非自研 → 一线升级 → 二线线下登记）
  {
    const info = infoOf('LNX6C62404B0277', 'SCH-340302-002', '毕业');
    const at = '2026-09-15 06:10:12';
    const claim1 = '2026-09-15 06:40:20';
    const esc = '2026-09-15 07:20:45';
    const claim2 = '2026-09-15 07:45:08';
    // 登记时刻取加载时刻前 40 分钟，SLA 暂停至按平峰批推时刻推算；
    // 那一刻已跨过批推时刻（恢复时刻已过去、不暂停）时，改取加载时刻本身登记，保证样本处在暂停中
    let registered = flashMinuteStamp(nowMs - 40 * 60_000);
    let resume = offlineBatchResumeAt(registered, nowMs);
    if (!resume) {
      registered = flashMinuteStamp(nowMs);
      resume = offlineBatchResumeAt(registered, nowMs);
    }
    const pausedUntil = resume ? flashMinuteStamp(resume) : undefined;
    add(row(14, {
      info, creator: '用户提报', customer: '蒋丽', phone: '13855205625',
      createdAt: at.slice(0, 16), updatedAt: registered,
      nodeStatus: '处理中', assignee: '王坐席', tab: 'mine', responded: true, nodeStep: 3,
      slaText: '04:30:00', slaSub: '距超时', slaState: 'ok', slaMinutes: 270,
      upgradeCount: 1,
      flashState: state('用户提报', {
        handoffReason: '一线升级', pool: 'l2', handoffSmsSent: true,
        result: '已线下登记推送', offlineRegisteredAt: registered, slaPausedUntil: pausedUntil,
      }),
      runs: [],
    }), [
      createdByUser(at, '蒋丽', VERIFY_PASS, { handoff: '非自研机型' }),
      handoffEntry(addSec(at, 2), '非自研机型', 'l1'),
      smsEntry(addSec(at, 3), '13855205625', flashSmsHandoff(no(14))),
      acceptEntry(claim1, '刘一线', '一线坐席'),
      escalateEntry(esc, '刘一线', '联想定制机型需走线下登记推送，一线无登记权限', '已联系学校'),
      acceptEntry(claim2, '王坐席', '二线专员'),
      tl(`${registered}:00`, 'handle', 'handle', '王坐席', '二线专员', '线下登记', FLASH_TL.offlineRegister(registered)),
      ...(pausedUntil
        ? [tl(`${registered}:01`, 'sla', 'hold', '系统', '系统', 'SLA 暂停', FLASH_TL.slaPause(pausedUntil))]
        : []),
    ]);
  }

  // ⑮ 调研中 · 自助刷机成功（无处理人）
  {
    const info = infoOf('XFS20240600823', 'SCH-341502-001', '毕业');
    const at = '2026-09-15 08:29:58';
    const pushed = addSec(at, 2);
    const back = addSec(pushed, 12);
    add(row(15, {
      info, creator: '用户提报', customer: '叶青', phone: '15256430302',
      createdAt: at.slice(0, 16), updatedAt: back.slice(0, 16),
      nodeStatus: '调研中', assignee: null, tab: 'mine', nodeStep: 4,
      slaText: '—', slaSub: '自助刷机成功·未计时', slaState: 'ok', slaMinutes: 9999,
      flashState: state('用户提报', { outcome: '接收成功', pushCount: 1, result: '已线上刷机成功' }),
      runs: [run({ seq: 1, trigger: '建单首推', pushedAt: pushed, result: '接收成功', resultAt: back })],
    }), [
      createdByUser(at, '叶青', VERIFY_PASS, { auto: true }),
      pushEntry(pushed, 1),
      returnOk(back),
      smsEntry(addSec(back, 1), '15256430302', flashSmsSuccess(no(15), info.sn)),
    ]);
  }

  // ⑯ 已结案（自助成功 → 回访已解决）
  {
    const info = infoOf('XFS30240900745', 'SCH-340103-001', '毕业');
    const at = '2026-09-15 06:11:40';
    const pushed = addSec(at, 2);
    const back = addSec(pushed, 12);
    const survey = '2026-09-15 08:18:05';
    add(row(16, {
      info, creator: '用户提报', customer: '秦海', phone: '13721061811',
      createdAt: at.slice(0, 16), updatedAt: survey.slice(0, 16),
      nodeStatus: '已结案', assignee: null, tab: 'mine', nodeStep: 5, serviceScore: 5,
      slaText: '—', slaSub: '已结案·未计时', slaState: 'ok', slaMinutes: 9999,
      flashState: state('用户提报', { outcome: '接收成功', pushCount: 1, result: '已线上刷机成功', surveyConcluded: true }),
      runs: [run({ seq: 1, trigger: '建单首推', pushedAt: pushed, result: '接收成功', resultAt: back })],
    }), [
      createdByUser(at, '秦海', VERIFY_PASS, { auto: true }),
      pushEntry(pushed, 1),
      returnOk(back),
      smsEntry(addSec(back, 1), '13721061811', flashSmsSuccess(no(16), info.sn)),
      tl(survey, 'praise', 'praise', '秦海', '客户', '回访评价', '是否解决：已解决 | 是否满意：满意。', { stars: 5 }),
      tl(addSec(survey, 1), 'node', 'resolved', '系统', '系统', '结案', '回访已解决，工单结案。'),
    ]);
  }

  // ⑰ 已转出（转售后）：版本不符 → 一线升级 → 二线重推仍失败 → 转售后
  {
    const info = infoOf('XFX3P240500634', 'SCH-340111-008', '毕业');
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
      slaText: '—', slaSub: '已转出·停表', slaState: 'ok', slaMinutes: 9999,
      linkedAftersaleNo: 'AS-20260915-39021', upgradeCount: 1,
      flashState: state('用户提报', {
        outcome: '接收失败', failL1: '接收失败', failL2: '版本不符', pushCount: 2,
        handoffReason: '一线升级', pool: 'l2', handoffSmsSent: true,
      }),
      runs: [
        run({ seq: 1, trigger: '建单首推', pushedAt: pushed, result: '接收失败', failL1: '接收失败', failL2: '版本不符', resultAt: back }),
        run({ seq: 2, trigger: '二线重推', by: '王坐席', byRole: '二线专员', pushedAt: repushed, result: '接收失败', failL1: '接收失败', failL2: '版本不符', resultAt: back2, handlerAtPush: '王坐席' }),
      ],
    }), [
      createdByUser(at, '顾红梅', VERIFY_PASS, { auto: true }),
      pushEntry(pushed, 1),
      returnFail(back, '版本不符'),
      handoffEntry(addSec(back, 1), '接收失败', 'l1'),
      smsEntry(addSec(back, 2), '13966713907', flashSmsHandoff(no(17))),
      acceptEntry(claim1, '刘一线', '一线坐席'),
      escalateEntry(esc, '刘一线', '设备系统版本过低无法在线升级', '已指导开机联网'),
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
    const info = infoOf('XFS30240900918', 'SCH-340302-002', '毕业');
    const at = '2026-09-15 06:20:05';
    const pushed = addSec(at, 2);
    const timeout = addSec(pushed, 120 * 60);
    const late = '2026-09-15 08:47:32';
    add(row(18, {
      info, creator: '用户提报', customer: '宋建华', phone: '13905527418',
      createdAt: at.slice(0, 16), updatedAt: late.slice(0, 16),
      nodeStatus: '未认领', assignee: null, tab: 'pool', nodeStep: 1,
      slaText: '06:05:00', slaSub: '距超时', slaState: 'ok', slaMinutes: 365,
      flashState: state('用户提报', {
        outcome: '推送异常', failL1: '推送异常', failL2: '回传超时', pushCount: 1,
        handoffReason: '推送异常', pool: 'l1', handoffSmsSent: true, lateSuccessAt: late,
      }),
      runs: [run({ seq: 1, trigger: '建单首推', pushedAt: pushed, result: '推送异常', failL1: '推送异常', failL2: '回传超时', resultAt: timeout })],
    }), [
      createdByUser(at, '宋建华', VERIFY_PASS, { auto: true }),
      pushEntry(pushed, 1),
      tl(timeout, 'node', 'flashFail', '系统', '系统', '回传超时', FLASH_TL.returnTimeout('推送异常 · 回传超时', 2)),
      handoffEntry(addSec(timeout, 1), '推送异常', 'l1'),
      smsEntry(addSec(timeout, 2), '13905527418', flashSmsHandoff(no(18))),
      tl(late, 'node', 'flashSuccess', '系统', '系统', '回传结果', FLASH_TL.lateSuccess),
    ]);
  }

  return { tickets, timelines };
}

/** 模块加载时生成一次：工单库与刷机服务共用同一份种子 */
export const FLASH_SEEDS: FlashSeedBundle = buildFlashSeeds(Date.now());
