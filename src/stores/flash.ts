import { defineStore } from 'pinia';
import { reactive, ref, toRaw } from 'vue';
import type { Channel, Priority, Ticket } from '@/views/tickets/types/ticket';
import { isTicketClosed } from '@/views/tickets/types/ticket';
import type { TimelineEntry, TimelineFieldChange } from '@/views/tickets/types/ticketDetail';
import { TICKETS } from '@/mock/tickets';
import { FLASH_SEEDS } from '@/mock/flash/seedTickets';
import { findMdmDevice, type MdmDevice } from '@/mock/flash/mdmDevices';
import { isGraduate } from '@/mock/flash/graduates';
import { findSchoolById } from '@/mock/schools';
import { makeTicketNo, TICKET_NO_PREFIX } from '@/constants/ticketNo';
import {
  FLASH_FIELD_LABELS, FLASH_INFO_FIELD_LABELS, FLASH_L1_REPUSH_LIMIT, FLASH_NOTIFY_EVENTS, FLASH_POOLS, FLASH_REASON_AUTO,
  FLASH_RETURN_DELAY_MS, FLASH_TIP_L1_REPUSH_EXHAUSTED, FLASH_TIP_MODEL_UNSUPPORTED,
  FLASH_TIP_NON_SELF_DEVELOPED, FLASH_TIP_REASON_NOT_GRADUATE_L1, FLASH_TIP_REASON_NOT_GRADUATE_L2,
  FLASH_TIP_EDIT_STATE, FLASH_TIP_REPUSH_STATE, FLASH_TIP_SYSTEM_BUSY, FLASH_TIP_VERIFY_UNAVAILABLE,
  FLASH_VERIFY_NOT_RUN, FLASH_TL, FLASH_NOTICE, FLASH_RESULT_OFFLINE, FLASH_TOAST,
  flashMinuteStamp, flashProgressStage, flashSmsHandoff, flashSmsSuccess, flashSmsSurvey, flashStamp,
  flashTipInflight, flashTipRequired, flashTipVerifyFailed, isFrontlineActor,
  offlineBatchResumeAt, parseFlashStamp, validateOfflineRegisteredAt,
  type FlashActor, type FlashCreator, type FlashFailL1, type FlashFailL2, type FlashHandoffReason,
  type FlashInfo, type FlashPoolKey, type FlashProgressStage, type FlashPushTrigger, type FlashReasonName,
  type FlashResult, type FlashRun, type FlashState, type FlashVerifyResult, type TicketFlash,
} from '@/views/tickets/types/flash';
import { useNotifyLogStore } from './notifyLog';
import { useFlashConfigStore } from './flashConfig';
import { FLASH_LS_KEYS, readFlashCache, writeFlashCache } from './flashCache';

/**
 * 教育刷机单 · 刷机服务（930 教育刷机单 D5 / D12 / D13 / D15 / D16 / D18 / D21 / D22，
 * M1 / M2 / M8′ / M10 / M11 / M14 / M18 / M19 / M31–M38 / M43–M45）。
 *
 * 【数据源】刷机单与其他工单同在工单库 `TICKETS`（`mock/tickets.ts`）：列表 `ref([...TICKETS])`、
 * 处理页 `TICKETS.find`、查询中心都读它。本服务**只改那一份对象**，经 `reactive(对象)` 写入，
 * 已打开的列表会随之刷新；新建的刷机单也追加进 `TICKETS`。不另起工单列表。
 *
 * 【计时】回传结果按**推送时刻**推算（`FlashRun.pushedAtMs`），每秒对账一次（`settleDue`），
 * 刷新页面后按同一时刻续算，不依赖某个定时器活着。
 *
 * 【持久化】刷机单快照与刷机履历落 `FLASH_LS_KEYS`（保质期 + 版本闸，见 `stores/flashCache.ts`）；
 * 短信与站内通知写通知记录 `stores/notifyLog.ts`。
 */

/* ------------------------------------------------------------------ */
/* 对外类型                                                             */
/* ------------------------------------------------------------------ */

/** 建单 / 校验入参（刷机信息） */
export interface FlashCreateInput {
  productModel: string;
  sn: string;
  studentAccount: string;
  studentName: string;
  /** 学校库 ID（M42） */
  schoolId: string;
  /** 学校名称；缺省按学校库 ID 取 */
  schoolName?: string;
  /** 刷机原因（含后台新增的原因；非「毕业」一律按特殊情况进二线池，M65） */
  reason: FlashReasonName;
  romVersion?: string;
  mdmVersion?: string;
  /** 设备SN照片：用户提报必传、坐席代建选传（M4） */
  snPhotos?: string[];
  /** 联系手机号（必填，M4；成功短信、联系、回访用） */
  contactPhone: string;
}

/** 建单时的工单公共字段 */
export interface FlashTicketBase {
  customer: string;
  /** 缺省取刷机信息里的联系手机号 */
  customerPhone?: string;
  vip?: boolean;
  channel?: Channel;
  priority?: Priority;
  ticketSource?: string;
}

export interface FlashEvaluationBlocked {
  kind: 'blocked';
  /** required 必填缺项（M46）/ A1 机型不支持 / A2 同 SN 在途 / busy 在途查询不可用（M43） */
  code: 'required' | 'A1' | 'A2' | 'busy';
  message: string;
  /** required：缺哪几项（字段展示名） */
  missing?: string[];
  /** A2：在途单号 */
  inflightNo?: string;
  /** A2：在途单当前进度（用户提报页展示，M2） */
  inflightStage?: FlashProgressStage;
}

export interface FlashEvaluationCreate {
  kind: 'create';
  /** auto ＝ 建单即自动刷机；pool ＝ 建单进人工池、不推送 */
  route: 'auto' | 'pool';
  initialStatus: '自动刷机中' | '未认领';
  pool?: FlashPoolKey;
  handoffReason?: FlashHandoffReason;
  failL1?: FlashFailL1;
  failL2?: FlashFailL2;
  /** 建单校验两项各自结论（跑过校验才有，M50） */
  verifyResult?: FlashVerifyResult;
  selfDeveloped: boolean;
  /** 版本回填（M4：按 SN 从 MDM 回填，回填值优先） */
  backfill: { romVersion: string; mdmVersion: string; backfilled: boolean };
}

export type FlashCreateEvaluation = FlashEvaluationBlocked | FlashEvaluationCreate;

/**
 * 动作结果。`code`：`unchanged` ＝ 没有任何变更、未落库未写履历（M70）；`pushed` ＝ 重推已发出、等待回传；
 * `pushError` ＝ 重推已发起但推送接口报错且重试 1 次仍失败，按已发出落库并走重推失败去向（M69）；
 * `closed` ＝ 下送时本单已产生过回访结论，直接结案（M58）。
 * 失败时 `inflightNo` ＝ 撞上的在途刷机单号（提示里单号做成链接）。
 */
export type FlashActionResult =
  | { ok: true; message: string; code?: 'unchanged' | 'pushed' | 'pushError' | 'closed' }
  | { ok: false; message: string; inflightNo?: string };

/** 页面内站内通知条（PRD §5.6 / §11.1）：发给某个处理人的一条重推结果，处理页按收件人与单号认领 */
export interface FlashLiveNotice {
  id: number;
  no: string;
  /** 收件处理人名 */
  to: string;
  text: string;
}

/** 重推时可改的刷机信息 */
export type FlashInfoChanges = Partial<Omit<FlashInfo, 'versionBackfilled'>>;

/* ------------------------------------------------------------------ */
/* 内部常量                                                             */
/* ------------------------------------------------------------------ */

const SYSTEM: FlashActor = { name: '系统', role: '系统' };
/** 可重推的子状态：单在处理人手上 */
const REPUSHABLE_STATUSES = ['处理中', '待响应', '已退回'];
/** 可修改刷机信息的子状态（M52） */
const EDITABLE_STATUSES = ['待响应', '处理中'];
/** 进人工池时解决钟起算（M17 暂行：同咨询单） */
const POOL_SLA = { slaText: '08:00:00', slaSub: '距超时', slaState: 'ok' as const, slaMinutes: 480 };

type VerifyResult =
  | { ok: true; device: MdmDevice; result: FlashVerifyResult }
  | { ok: false; unavailable: true; result: FlashVerifyResult }
  | { ok: false; unavailable: false; failL2: FlashFailL2; result: FlashVerifyResult };

interface TicketsCache { tickets: Ticket[] }
interface TimelineCache { timelines: Record<string, TimelineEntry[]>; seq: number }

export const useFlashStore = defineStore('flash', () => {
  const config = useFlashConfigStore();

  /** 工单号 → 刷机履历（时间正序） */
  const timelines = ref<Record<string, TimelineEntry[]>>({});
  /** 工单号 → 变更版本号：处理页据此重读本单 */
  const revisions = ref<Record<string, number>>({});
  /** 本会话内到达的重推结果通知（不落缓存：通知条只在回传到达时停留本单的处理人页面上出现） */
  const liveNotices = ref<FlashLiveNotice[]>([]);
  let noticeSeq = 0;
  let tlSeq = 0;

  /* ---------------- 读 ---------------- */

  function rawOf(no: string): Ticket | undefined {
    return TICKETS.find((t) => t.no === no);
  }

  /** 工单库里的刷机单（响应式代理，写入会刷新已打开的列表） */
  function rowOf(no: string): Ticket | undefined {
    const t = rawOf(no);
    return t?.type === '刷机' && t.flash ? reactive(t) : undefined;
  }

  function flashOf(no: string): TicketFlash | undefined {
    return rowOf(no)?.flash;
  }

  function timelineOf(no: string): TimelineEntry[] {
    return timelines.value[no] ?? [];
  }

  function revisionOf(no: string): number {
    return revisions.value[no] ?? 0;
  }

  /** 同 SN 非终态刷机单（M2「在途」） */
  function findInflightBySn(sn: string, excludeNo?: string): Ticket | undefined {
    const key = sn.trim().toUpperCase();
    if (!key) return undefined;
    return TICKETS.find(
      (t) => t.type === '刷机'
        && t.no !== excludeNo
        // M51：草稿未提交、不算在途
        && !t.isDraft && t.nodeStatus !== '草稿'
        && (t.flash?.info.sn ?? t.sn ?? '').toUpperCase() === key
        && !isTicketClosed(t.nodeStatus),
    );
  }

  /** 用户侧进度（M2 / M29） */
  function progressStageOf(no: string): FlashProgressStage | undefined {
    const t = rawOf(no);
    return t?.type === '刷机' ? flashProgressStage(t.nodeStatus) : undefined;
  }

  /* ---------------- 写：公共 ---------------- */

  function bump(no: string) {
    revisions.value = { ...revisions.value, [no]: revisionOf(no) + 1 };
  }

  function persist() {
    const tickets = TICKETS.filter((t) => t.type === '刷机' && t.flash).map((t) => toRaw(t));
    writeFlashCache(FLASH_LS_KEYS.tickets, { tickets } satisfies TicketsCache);
    writeFlashCache(FLASH_LS_KEYS.timeline, { timelines: timelines.value, seq: tlSeq } satisfies TimelineCache);
  }

  function log(no: string, at: number, partial: Omit<TimelineEntry, 'id' | 'when'>): TimelineEntry {
    tlSeq += 1;
    const entry: TimelineEntry = { id: `flash-${no}-${tlSeq}`, when: flashStamp(at), ...partial };
    timelines.value = { ...timelines.value, [no]: [...timelineOf(no), entry] };
    return entry;
  }

  function sms(r: Ticket, at: number, kind: 'success' | 'handoff') {
    const content = kind === 'success' ? flashSmsSuccess(r.no, r.flash!.info.sn) : flashSmsHandoff(r.no);
    useNotifyLogStore().emit({
      ticketNo: r.no,
      event: kind === 'success' ? FLASH_NOTIFY_EVENTS.success : FLASH_NOTIFY_EVENTS.handoff,
      kind: 'accepted',
      title: kind === 'success' ? '刷机成功短信' : '转人工短信',
      receivers: [`${r.customer}(客户)`],
      content,
      channel: '短信',
      status: '已发送',
    });
    log(r.no, at, {
      category: 'comm', action: 'sms', who: '系统', role: '系统', how: '短信通知',
      what: `发送至 ${r.customerPhone ?? r.customer}：${content}`,
    });
  }

  /**
   * M61 / M67：重推结果站内通知**始终**发发起人（成功、失败都发）；`banner` 为 true 时
   * 同时投递页面内通知条（回传到达时发起人正停留在本单处理页才会出现，见处理页）。
   */
  function notifyRepushInitiator(r: Ticket, run: FlashRun, text: string, banner = true) {
    useNotifyLogStore().emit({
      ticketNo: r.no,
      event: FLASH_NOTIFY_EVENTS.repushResult,
      kind: 'assign',
      title: '重推结果',
      receivers: [`${run.by}(${run.byRole})`],
      content: text,
    });
    if (banner) {
      noticeSeq += 1;
      liveNotices.value = [...liveNotices.value, { id: noticeSeq, no: r.no, to: run.by, text }];
    }
  }

  /** 归属组站内通知（基线 ※19：无处理人发归属组） */
  function notifyGroup(r: Ticket, pool: FlashPoolKey, event: string, title: string, text: string) {
    useNotifyLogStore().emit({
      ticketNo: r.no,
      event,
      kind: 'group',
      title,
      receivers: [FLASH_POOLS[pool].groupName],
      content: text,
    });
  }

  /** 线下登记暂停是否仍在生效 */
  function pausedAt(st: FlashState, at: number): boolean {
    return !!st.slaPausedUntil && parseFlashStamp(st.slaPausedUntil).getTime() > at;
  }

  /**
   * 线下登记暂停期间的恢复（PRD §4.3 / M73）：清空「SLA 暂停至」；暂停仍在生效时记「SLA 恢复计时 · 〈原因〉」。
   * 返回是否确有一段生效中的暂停被恢复。
   */
  function resumePause(r: Ticket, cause: string, at: number): boolean {
    const st = r.flash!.state;
    if (!st.slaPausedUntil) return false;
    const active = pausedAt(st, at);
    st.slaPausedUntil = undefined;
    if (active) {
      log(r.no, at, {
        category: 'sla', action: 'hold', who: '系统', role: '系统', how: 'SLA 恢复',
        what: FLASH_TL.slaResume(cause),
      });
    }
    return active;
  }

  function toHandler(r: Ticket, run: FlashRun, at: number) {
    Object.assign(r, {
      nodeStatus: '处理中',
      assignee: run.handlerAtPush ?? r.assignee,
      tab: 'mine',
      updatedAt: flashMinuteStamp(at),
      ...(run.slaBefore ?? POOL_SLA),
    });
  }

  /**
   * 转入人工池。`sms` 只对自动环节首次转人工为 true（M14 / M37：每单一条，已发过不再发）。
   * `keepSla` 传入推送前的 SLA 摘要时续算（一线重推失败转二线池，M16「SLA 接着跑」）；否则从进池时刻起算（D18）。
   */
  function handoff(
    r: Ticket,
    pool: FlashPoolKey,
    reason: FlashHandoffReason,
    at: number,
    opts: { sms?: boolean; keepSla?: FlashRun['slaBefore'] } = {},
  ) {
    const st = r.flash!.state;
    const meta = FLASH_POOLS[pool];
    const running = opts.keepSla && opts.keepSla.slaText !== '—' && opts.keepSla.slaState !== 'paused';
    Object.assign(r, {
      nodeStatus: '未认领',
      assignee: null,
      tab: 'pool',
      groupId: meta.groupId,
      groupNames: [meta.groupName],
      updatedAt: flashMinuteStamp(at),
      ...(running ? opts.keepSla : { ...POOL_SLA, responded: false }),
    });
    st.pool = pool;
    st.handoffReason = reason;
    st.slaPausedUntil = undefined;
    log(r.no, at, {
      category: 'node', action: 'flashHandoff', who: '系统', role: '系统', how: '转人工',
      what: FLASH_TL.handoff(reason, meta.label),
    });
    if (opts.sms && !st.handoffSmsSent) {
      st.handoffSmsSent = true;
      sms(r, at + 1000, 'handoff');
    }
  }

  function pushInternal(r: Ticket, by: FlashActor, trigger: FlashPushTrigger, at: number) {
    const f = r.flash!;
    const st = f.state;
    const device = findMdmDevice(f.info.sn);
    const run: FlashRun = {
      id: `run-${at}-${st.pushCount + 1}`,
      seq: st.pushCount + 1,
      trigger,
      by: by.name,
      byRole: by.role,
      line: by.role === '系统' ? undefined : isFrontlineActor(by) ? '一线' : '二线',
      pushedAt: flashStamp(at),
      pushedAtMs: at,
      result: '等待回传',
      handlerAtPush: r.assignee,
      slaBefore: { slaText: r.slaText, slaSub: r.slaSub, slaState: r.slaState, slaMinutes: r.slaMinutes },
      // M10：推送接口同步报错即自动重试 1 次
      autoRetried: !!device && device.pushApi !== '正常',
      // PRD §10.5：回传超时时长按发出时的取值判定
      returnTimeoutMin: config.returnTimeoutMin,
    };
    f.runs.push(run);
    st.pushCount += 1;
    st.outcome = '等待回传';
    st.failL1 = undefined;
    st.failL2 = undefined;
    // M31：暂停期间发起重推即恢复计时
    st.slaPausedUntil = undefined;
    Object.assign(r, {
      nodeStatus: '自动刷机中',
      slaText: '已暂停',
      slaSub: '自动刷机中',
      slaState: 'paused',
      slaMinutes: 9999,
      updatedAt: flashMinuteStamp(at),
    });
    // PRD §11.2：首推落「自动推送」（系统）；人工重推落「重新推送」（发起人），不另落「自动推送」
    if (trigger === '建单首推') {
      log(r.no, at, {
        category: 'node', action: 'flashPush', who: '系统', role: '系统', how: '自动推送',
        what: FLASH_TL.autoPush(run.seq),
      });
    } else {
      log(r.no, at, {
        category: 'node', action: 'flashRepush', who: by.name, role: by.role, how: '重新推送',
        what: FLASH_TL.repush(run.seq, run),
      });
    }
    bump(r.no);
  }

  function succeed(r: Ticket, run: FlashRun, at: number) {
    const st = r.flash!.state;
    run.result = '接收成功';
    run.resultAt = flashStamp(at);
    st.outcome = '接收成功';
    st.failL1 = undefined;
    st.failL2 = undefined;
    if (run.trigger === '建单首推') {
      // D5 / M14 / M45：自助成功 → 写处理结果 → 发成功短信 → 进回访，处理人为空
      Object.assign(r, {
        nodeStatus: '调研中',
        assignee: null,
        tab: 'mine',
        nodeStep: 4,
        slaText: '—',
        slaSub: '自助刷机成功·未计时',
        slaState: 'ok',
        slaMinutes: 9999,
        updatedAt: flashMinuteStamp(at),
      });
      st.result = '已线上刷机成功';
      log(r.no, at, {
        category: 'node', action: 'flashSuccess', who: '系统', role: '系统', how: '回传结果',
        what: FLASH_TL.returnSuccess,
      });
      sms(r, at + 1000, 'success');
    } else {
      // M19：人工重推成功回原处理人「处理中」，由处理人联系确认后下送；M32 同样发成功短信
      toHandler(r, run, at);
      log(r.no, at, {
        category: 'node', action: 'flashSuccess', who: '系统', role: '系统', how: '回传结果',
        what: FLASH_TL.returnSuccess,
      });
      log(r.no, at, {
        category: 'node', action: 'flashSuccess', who: '系统', role: '系统', how: '回传结果',
        what: FLASH_TL.repushSuccess(r.assignee ?? ''),
      });
      sms(r, at + 1000, 'success');
      notifyRepushInitiator(r, run, FLASH_NOTICE.repushSuccess(r.no));
    }
    bump(r.no);
  }

  function fail(
    r: Ticket,
    run: FlashRun,
    l1: '接收失败' | '推送异常',
    l2: FlashFailL2 | undefined,
    at: number,
    opts: { banner?: boolean } = {},
  ) {
    const banner = opts.banner ?? true;
    const st = r.flash!.state;
    run.result = l1;
    run.failL1 = l1;
    run.failL2 = l2;
    run.resultAt = flashStamp(at);
    st.outcome = l1;
    st.failL1 = l1;
    st.failL2 = l2;
    // 显示文案按后台配置（改名 / 二级停用显示「原因未返回」，M65）；落库仍存取值
    const reasonText = config.failReasonText(l1, l2);
    const timeoutMin = run.returnTimeoutMin ?? config.returnTimeoutMin;
    const what = l2 === '回传超时'
      ? FLASH_TL.returnTimeout(reasonText, Math.round((timeoutMin / 60) * 10) / 10)
      : l2 === '接口异常'
        ? FLASH_TL.pushApiError(reasonText)
        : FLASH_TL.returnFail(reasonText);
    const how = l1 === '推送异常' ? (l2 === '回传超时' ? '回传超时' : '推送异常') : '回传结果';
    log(r.no, at, { category: 'node', action: 'flashFail', who: '系统', role: '系统', how, what });

    if (run.trigger === '建单首推') {
      // M8′：自动环节失败一律进一线刷机池；首次转人工发短信（M37）
      handoff(r, 'l1', l1, at + 1000, { sms: true });
    } else if (run.trigger === '一线重推') {
      // D13：一线重推后再失败 → 二线池；M38：通知归属组
      handoff(r, 'l2', '一线重推失败', at + 1000, { keepSla: run.slaBefore });
      notifyRepushInitiator(r, run, FLASH_NOTICE.repushFail(r.no, reasonText), banner);
      notifyGroup(r, 'l2', FLASH_NOTIFY_EVENTS.l1RepushFailGroup, '一线重推失败进池', FLASH_NOTICE.l1RepushFailToGroup(r.no));
    } else {
      // D16：二线重推后失败 → 回原二线处理人；M38：通知本人
      toHandler(r, run, at);
      log(r.no, at + 1000, {
        category: 'node', action: 'flashHandoff', who: '系统', role: '系统', how: '转人工',
        what: FLASH_TL.repushFailBack(r.assignee ?? ''),
      });
      notifyRepushInitiator(r, run, FLASH_NOTICE.repushFail(r.no, reasonText), banner);
    }
    bump(r.no);
  }

  /* ---------------- 校验 ---------------- */

  /** 建单校验（D15）：SN与学生账号一致 → 毕业生身份。校验接口不可用单独返回（M43） */
  function verify(info: Pick<FlashInfo, 'sn' | 'studentAccount' | 'schoolId'>): VerifyResult {
    const device = findMdmDevice(info.sn);
    if (device?.verifyApi === '不可用') return { ok: false, unavailable: true, result: FLASH_VERIFY_NOT_RUN };
    // 两项都比，结论各自保留；两项都不通过时细分取「SN与学生账号不一致」（先比设备再比身份，M50）
    const snOk = !!device && device.studentAccount === info.studentAccount.trim();
    const gradOk = isGraduate(info.schoolId, info.studentAccount);
    const result: FlashVerifyResult = {
      status: '已校验',
      snAccountMatch: snOk ? '通过' : '不通过',
      graduate: gradOk ? '通过' : '不通过',
    };
    if (!snOk) return { ok: false, unavailable: false, failL2: 'SN与学生账号不一致', result };
    if (!gradOk) return { ok: false, unavailable: false, failL2: '非毕业生身份', result };
    return { ok: true, device: device!, result };
  }

  /* ---------------- 对外动作 ---------------- */

  /**
   * 建单判定（M1 顺序）：
   * ① 机型不在支持刷机机型 → 拦截 A1；② 同 SN 在途 → 拦截 A2（在途查询不可用 → 拦截「系统繁忙」，M43）；
   * ③ 刷机原因≠毕业 → 二线池（特殊情况）；④ 建单校验：接口不可用 → 一线池（推送异常 · 接口异常，M43），
   * 不通过 → 用户提报进一线池、坐席代建进二线池（D12）；⑤ 非自研 → 一线池（M8′）；⑥ 自研 → 自动刷机中。
   */
  function evaluateCreate(input: FlashCreateInput, creator: FlashCreator): FlashCreateEvaluation {
    const missing = missingRequired(input, creator);
    if (missing.length) return { kind: 'blocked', code: 'required', message: flashTipRequired(missing), missing };
    if (!config.isSupportedModel(input.productModel)) {
      return { kind: 'blocked', code: 'A1', message: FLASH_TIP_MODEL_UNSUPPORTED };
    }
    let inflight: Ticket | undefined;
    try {
      inflight = findInflightBySn(input.sn);
    } catch {
      return { kind: 'blocked', code: 'busy', message: FLASH_TIP_SYSTEM_BUSY };
    }
    if (inflight) {
      return {
        kind: 'blocked',
        code: 'A2',
        message: flashTipInflight(inflight.no),
        inflightNo: inflight.no,
        inflightStage: flashProgressStage(inflight.nodeStatus),
      };
    }
    const selfDeveloped = config.isSelfDeveloped(input.productModel);
    const typed = { romVersion: input.romVersion ?? '', mdmVersion: input.mdmVersion ?? '', backfilled: false };
    const pool = (p: FlashPoolKey, reason: FlashHandoffReason, backfill = typed, failL1?: FlashFailL1, failL2?: FlashFailL2): FlashEvaluationCreate => ({
      kind: 'create', route: 'pool', initialStatus: '未认领', pool: p, handoffReason: reason, failL1, failL2, selfDeveloped, backfill,
    });

    if (input.reason !== FLASH_REASON_AUTO) return pool('l2', '特殊情况');

    const v = verify(input);
    if (!v.ok && v.unavailable) return pool('l1', '推送异常', typed, '推送异常', '接口异常');
    const device = findMdmDevice(input.sn);
    const backfill = device
      ? { romVersion: device.romVersion, mdmVersion: device.mdmVersion, backfilled: true }
      : typed;
    if (!v.ok) {
      return {
        ...pool(creator === '用户提报' ? 'l1' : 'l2', '建单校验不通过', backfill, '建单校验不通过', v.failL2),
        verifyResult: v.result,
      };
    }
    if (!selfDeveloped) return { ...pool('l1', '非自研机型', backfill), verifyResult: v.result };
    return { kind: 'create', route: 'auto', initialStatus: '自动刷机中', verifyResult: v.result, selfDeveloped, backfill };
  }

  /** 必填缺项（M4 / M46）：设备SN照片仅用户提报必传 */
  function missingRequired(input: FlashCreateInput, creator: FlashCreator): string[] {
    const L = FLASH_FIELD_LABELS;
    const checks: [boolean, string][] = [
      [!input.productModel?.trim(), L.productModel],
      [!input.sn?.trim(), L.sn],
      [!input.studentAccount?.trim(), L.studentAccount],
      [!input.studentName?.trim(), L.studentName],
      [!input.schoolId?.trim(), L.schoolName],
      [!input.reason, L.reason],
      [!input.contactPhone?.trim(), L.contactPhone],
      [creator === '用户提报' && !(input.snPhotos ?? []).length, L.snPhotos],
    ];
    return checks.filter(([miss]) => miss).map(([, label]) => label);
  }

  function nextNo(now: number): string {
    const d = new Date(now);
    const probe = makeTicketNo('刷机', 1, d).slice(0, -5);
    const max = TICKETS
      .filter((t) => t.no.startsWith(probe))
      .reduce((m, t) => Math.max(m, Number(t.no.slice(-5)) || 0), 0);
    return makeTicketNo('刷机', max + 1, d);
  }

  /**
   * 建刷机单：先 `evaluateCreate`，拦截即返回；否则落工单库，按去向进池或发起首推。
   * `by` ＝ 提交人（用户提报传客户本人，坐席代建传坐席）。
   */
  function createFlashTicket(
    input: FlashCreateInput,
    base: FlashTicketBase,
    creator: FlashCreator,
    by: FlashActor,
  ): { evaluation: FlashCreateEvaluation; ticket: Ticket | null } {
    const evaluation = evaluateCreate(input, creator);
    if (evaluation.kind === 'blocked') return { evaluation, ticket: null };
    const now = Date.now();
    const no = nextNo(now);
    const byUser = creator === '用户提报';
    const info: FlashInfo = {
      productModel: input.productModel.trim(),
      sn: input.sn.trim().toUpperCase(),
      studentAccount: input.studentAccount.trim(),
      studentName: input.studentName.trim(),
      schoolId: input.schoolId,
      schoolName: input.schoolName ?? findSchoolById(input.schoolId)?.name ?? '',
      reason: input.reason,
      romVersion: evaluation.backfill.romVersion,
      mdmVersion: evaluation.backfill.mdmVersion,
      versionBackfilled: evaluation.backfill.backfilled,
      snPhotos: [...(input.snPhotos ?? [])],
    };
    const raw: Ticket = {
      id: `flash-${no}`,
      no,
      type: '刷机',
      channel: base.channel ?? (byUser ? '小程序' : '电话'),
      ticketSource: base.ticketSource ?? (byUser ? '客户服务小程序' : '电话'),
      title: `${info.reason}刷机申请 · ${info.productModel}`,
      smartMarks: [],
      customer: base.customer,
      vip: base.vip ?? false,
      customerPhone: base.customerPhone ?? input.contactPhone.trim(),
      sn: info.sn,
      product: info.productModel,
      productCategory: '学习硬件',
      businessType: '教育',
      nodeStatus: '未认领',
      nodeStep: 1,
      nodeTotal: 5,
      priority: base.priority ?? 'P2',
      slaText: '—',
      slaSub: '未计时',
      slaState: 'ok',
      slaMinutes: 9999,
      assignee: null,
      tab: 'mine',
      responded: false,
      createdAt: flashMinuteStamp(now),
      updatedAt: flashMinuteStamp(now),
      problemDesc: `学生${info.studentName}（账号 ${info.studentAccount}，${info.schoolName}）申请刷机，刷机原因：${info.reason}。设备 SN ${info.sn}。`,
      flash: {
        info,
        state: {
          outcome: '未推送', pushCount: 0, l1RepushCount: 0, surveyConcluded: false, creator,
          verifyResult: evaluation.verifyResult ?? FLASH_VERIFY_NOT_RUN,
        },
        runs: [],
      },
    };
    TICKETS.push(raw);
    const r = reactive(raw);
    log(no, now, {
      category: 'node', action: 'create', who: by.name, role: by.role,
      how: '建单',
      what: FLASH_TL.create(
        creator,
        r.flash!.state.verifyResult,
        evaluation.route === 'pool' ? { handoff: evaluation.handoffReason! } : { auto: true },
      ),
    });
    if (evaluation.route === 'pool') {
      r.flash!.state.failL1 = evaluation.failL1;
      r.flash!.state.failL2 = evaluation.failL2;
      if (evaluation.failL1 === '推送异常') {
        // 建单校验接口不可用（M43）：PRD §11.2「推送异常 · 接口异常（建单校验未执行）」
        log(no, now + 500, {
          category: 'node', action: 'flashFail', who: '系统', role: '系统', how: '推送异常',
          what: FLASH_TL.verifyApiError(config.failReasonText(evaluation.failL1, evaluation.failL2)),
        });
      }
      handoff(r, evaluation.pool!, evaluation.handoffReason!, now + 1000, { sms: true });
    } else {
      pushInternal(r, SYSTEM, '建单首推', now + 1000);
    }
    bump(no);
    persist();
    return { evaluation, ticket: r };
  }

  /**
   * 发起推送：状态进「自动刷机中」、推送次数 +1、写履历；约 12 秒后按底数出回传结果（`settleDue`）。
   * 已有推送记录时按操作人判一线 / 二线重推；带信息修改的重推请走 `repush`（会先跑建单校验）。
   */
  function startPush(ticketNo: string, by: FlashActor): FlashActionResult {
    const r = rowOf(ticketNo);
    if (!r?.flash) return { ok: false, message: FLASH_TIP_REPUSH_STATE };
    if (r.nodeStatus === '自动刷机中' || isTicketClosed(r.nodeStatus)) {
      return { ok: false, message: FLASH_TIP_REPUSH_STATE };
    }
    if (!config.isSelfDeveloped(r.flash.info.productModel)) {
      return { ok: false, message: FLASH_TIP_NON_SELF_DEVELOPED };
    }
    const first = r.flash.runs.length === 0;
    const l1 = !first && isFrontlineActor(by);
    if (l1 && r.flash.state.l1RepushCount >= FLASH_L1_REPUSH_LIMIT) {
      return { ok: false, message: FLASH_TIP_L1_REPUSH_EXHAUSTED };
    }
    if (l1) r.flash.state.l1RepushCount += 1;
    pushInternal(r, first ? SYSTEM : by, first ? '建单首推' : l1 ? '一线重推' : '二线重推', Date.now());
    persist();
    return { ok: true, message: '已推送刷机包，等待硬件平台回传' };
  }

  /**
   * 修改刷机信息并重新推送（M18 / M36 / M44）。先同步判定，任一不通过即返回提示，
   * **不推送、不计一线重推次数、不改状态**：
   * 状态可重推 → 机型支持且自研 → 一线次数未用完 → 刷机原因为毕业 → 改后 SN 无其他在途单 → 建单校验通过。
   * 全部通过即视为推送已发出（M69）：落库、写履历、推送次数与一线重推次数 +1；
   * 之后推送接口报错、自动重试 1 次仍失败，按重推失败的去向落点（一线 → 二线池，二线 → 回原处理人）。
   */
  function repush(ticketNo: string, by: FlashActor, changes: FlashInfoChanges = {}): FlashActionResult {
    const r = rowOf(ticketNo);
    if (!r?.flash) return { ok: false, message: FLASH_TIP_REPUSH_STATE };
    if (!REPUSHABLE_STATUSES.includes(r.nodeStatus)) return { ok: false, message: FLASH_TIP_REPUSH_STATE };
    const prev = r.flash.info;
    const next = mergeInfo(prev, changes);
    const l1 = isFrontlineActor(by);
    if (l1 && r.flash.state.l1RepushCount >= FLASH_L1_REPUSH_LIMIT) {
      return { ok: false, message: FLASH_TIP_L1_REPUSH_EXHAUSTED };
    }

    // M79 提交判定顺序（第 1 条必填由弹窗在字段下方判）：未启用机型 → 非自研 → 刷机原因非毕业 →
    // 在途查询不可用 → 设备SN在途 → 建单校验接口不可用 → SN与学生账号不一致 → 非毕业生身份；命中即止
    if (!config.isSupportedModel(next.productModel)) return { ok: false, message: FLASH_TIP_MODEL_UNSUPPORTED };
    if (!config.isSelfDeveloped(next.productModel)) return { ok: false, message: FLASH_TIP_NON_SELF_DEVELOPED };
    if (next.reason !== FLASH_REASON_AUTO) {
      return { ok: false, message: l1 ? FLASH_TIP_REASON_NOT_GRADUATE_L1 : FLASH_TIP_REASON_NOT_GRADUATE_L2 };
    }
    let inflight: Ticket | undefined;
    try {
      inflight = findInflightBySn(next.sn, ticketNo);
    } catch {
      return { ok: false, message: FLASH_TIP_SYSTEM_BUSY };
    }
    if (inflight) return { ok: false, message: flashTipInflight(inflight.no), inflightNo: inflight.no };
    const v = verify(next);
    if (!v.ok) return { ok: false, message: v.unavailable ? FLASH_TIP_VERIFY_UNAVAILABLE : flashTipVerifyFailed(v.failL2) };

    // M53：到这里推送一定会发出，才落库与写履历
    next.romVersion = v.device.romVersion;
    next.mdmVersion = v.device.mdmVersion;
    next.versionBackfilled = true;
    const diff = diffInfo(prev, next);
    const now = Date.now();
    r.flash.info = next;
    Object.assign(r, { sn: next.sn, product: next.productModel });
    r.flash.state.verifyResult = v.result;
    if (l1) r.flash.state.l1RepushCount += 1;
    // PRD §4.3：线下登记暂停期内先恢复计时，随后进「自动刷机中」停钟
    resumePause(r, '重新推送', now);
    // PRD §11.2：同一次重推依次落「修改刷机信息」（有改动时）、「重新推送」
    if (diff.length) {
      log(ticketNo, now, {
        category: 'handle', action: 'handle', who: by.name, role: by.role, how: '修改刷机信息',
        what: FLASH_TL.editInfo, changes: diff,
      });
    }
    pushInternal(r, by, l1 ? '一线重推' : '二线重推', now + 1000);
    // M69：推送接口同步报错、自动重试 1 次仍失败 → 算作已发出（已落库、已计次），按重推失败去向处理
    if (v.device.pushApi === '持续报错') {
      const run = r.flash.runs[r.flash.runs.length - 1];
      fail(r, run, '推送异常', '接口异常', now + 1500, { banner: false });
      persist();
      return { ok: true, code: 'pushError', message: l1 ? FLASH_TOAST.repushPushErrorL1 : FLASH_TOAST.repushPushErrorL2 };
    }
    persist();
    return { ok: true, code: 'pushed', message: FLASH_TOAST.repushed };
  }

  /**
   * 修改刷机信息（M52 / M70）：检查必填 → 无变更返回 `code: 'unchanged'`（不写履历）→
   * 落库 + 写履历「修改刷机信息」（字段前后值）。**不跑建单校验、不推送、不计次**。
   * 待响应、处理中可用，适用全部机型；已由 MDM 回填的 ROM版本 / MDM版本 只读，改动不生效（M63）。
   */
  function saveFlashInfo(ticketNo: string, by: FlashActor, changes: FlashInfoChanges): FlashActionResult {
    const r = rowOf(ticketNo);
    if (!r?.flash || !EDITABLE_STATUSES.includes(r.nodeStatus)) return { ok: false, message: FLASH_TIP_EDIT_STATE };
    const prev = r.flash.info;
    const next = mergeInfo(prev, changes);
    if (prev.versionBackfilled) {
      next.romVersion = prev.romVersion;
      next.mdmVersion = prev.mdmVersion;
      next.versionBackfilled = true;
    }
    // M70：保存时检查必填（联系手机号不在刷机信息内，不在此判）
    const missing = missingRequired(
      { ...next, contactPhone: r.customerPhone ?? '-' },
      r.flash.state.creator,
    );
    if (missing.length) return { ok: false, message: flashTipRequired(missing) };
    // M78 / M84：设备SN有改动时查同 SN 在途（查询不可用 → 系统繁忙）
    if (next.sn.toUpperCase() !== prev.sn.toUpperCase()) {
      let inflight: Ticket | undefined;
      try {
        inflight = findInflightBySn(next.sn, ticketNo);
      } catch {
        return { ok: false, message: FLASH_TIP_SYSTEM_BUSY };
      }
      if (inflight) return { ok: false, message: flashTipInflight(inflight.no), inflightNo: inflight.no };
    }
    const diff = diffInfo(prev, next);
    if (!diff.length) return { ok: true, code: 'unchanged', message: '' };
    const now = Date.now();
    r.flash.info = next;
    Object.assign(r, { sn: next.sn, product: next.productModel, updatedAt: flashMinuteStamp(now) });
    log(ticketNo, now, {
      category: 'handle', action: 'handle', who: by.name, role: by.role, how: '修改刷机信息',
      what: FLASH_TL.editInfo, changes: diff,
    });
    bump(ticketNo);
    persist();
    return { ok: true, message: FLASH_TOAST.infoSaved };
  }

  /**
   * 记回访结论（M58）：已解决 / 未解决才置位「已产生回访结论」；未解决转教育刷机处理组池（D5，不发短信 M47）。
   * 已解决之后的结案走工单通用流程，本函数不改状态。
   */
  function recordSurveyConclusion(ticketNo: string, solved: boolean): FlashActionResult {
    const r = rowOf(ticketNo);
    if (!r?.flash) return { ok: false, message: FLASH_TIP_REPUSH_STATE };
    r.flash.state.surveyConcluded = true;
    const now = Date.now();
    if (!solved) {
      handoff(r, 'l2', '回访未解决', now, {
        keepSla: { slaText: r.slaText, slaSub: r.slaSub, slaState: r.slaState, slaMinutes: r.slaMinutes },
      });
    }
    bump(ticketNo);
    persist();
    return { ok: true, message: solved ? '已记录回访结论' : `回访未解决，已转入${FLASH_POOLS.l2.label}` };
  }

  /**
   * 人工侧转池（升级二线 / 回访未解决 / 回访期间客户催补等，由处理页动作接入）。
   * 不发转人工短信（M37 / M47：只有自动环节转人工发）；SLA：单上已有在走的钟续算，从未计时的从进池时刻起算（M16 / M41）。
   */
  function transferToPool(ticketNo: string, pool: FlashPoolKey, reason: FlashHandoffReason): FlashActionResult {
    const r = rowOf(ticketNo);
    if (!r?.flash || isTicketClosed(r.nodeStatus) || r.nodeStatus === '自动刷机中') {
      return { ok: false, message: FLASH_TIP_REPUSH_STATE };
    }
    const now = Date.now();
    handoff(r, pool, reason, now, {
      keepSla: { slaText: r.slaText, slaSub: r.slaSub, slaState: r.slaState, slaMinutes: r.slaMinutes },
    });
    bump(ticketNo);
    persist();
    return { ok: true, message: `已转入${FLASH_POOLS[pool].label}` };
  }

  /**
   * 升级二线（PRD §5.7 / M16）：子状态回「未认领」、处理人清空、进教育刷机处理组池，转人工原因「一线升级」；
   * SLA 接着跑不重置，线下登记暂停期内先恢复计时；履历记「升级二线」（升级说明全文 + 已做排查）；
   * 站内通知归属组；不发转人工短信。进池时间取本条履历（工作台 `poolEnteredAtOf`）。
   */
  function escalateToL2(ticketNo: string, by: FlashActor, note: string, checks: readonly string[]): FlashActionResult {
    const r = rowOf(ticketNo);
    if (!r?.flash || !EDITABLE_STATUSES.includes(r.nodeStatus)) return { ok: false, message: FLASH_TIP_REPUSH_STATE };
    const now = Date.now();
    const st = r.flash.state;
    resumePause(r, '升级二线', now);
    const meta = FLASH_POOLS.l2;
    Object.assign(r, {
      nodeStatus: '未认领',
      assignee: null,
      tab: 'pool',
      groupId: meta.groupId,
      groupNames: [meta.groupName],
      upgradeCount: (r.upgradeCount ?? 0) + 1,
      updatedAt: flashMinuteStamp(now),
    });
    st.pool = 'l2';
    st.handoffReason = '一线升级';
    log(ticketNo, now + 1, {
      category: 'node', action: 'escalate', who: by.name, role: by.role, how: '升级二线',
      what: FLASH_TL.escalateL2(note.trim(), checks),
    });
    notifyGroup(r, 'l2', FLASH_NOTIFY_EVENTS.escalateL2, '升级二线进池', FLASH_NOTICE.escalatedToGroup(r.no));
    bump(ticketNo);
    persist();
    return { ok: true, message: FLASH_TOAST.escalatedL2 };
  }

  /**
   * 处理表单保存（PRD §5.4 / §4.3 / M31 / M35 / M49 / M57 / M66 / M73）。
   * - 处理结果＝已线下登记推送：首次保存或改了线下登记时间 → 履历「线下登记」＋ 返回要追加进处理记录的一行；
   *   按登记时间算恢复时刻：未过去 → 写「SLA 暂停至」并记「SLA 暂停」；已过去 → 不暂停（原本暂停中则立即恢复）。
   * - 处理结果改为其他值：暂停期内立即恢复计时。
   * - 待响应首次保存转「处理中」（PRD §7.1）。
   */
  function saveProcess(
    ticketNo: string,
    by: FlashActor,
    input: { result: FlashResult | ''; offlineRegisteredAt: string },
  ): FlashActionResult & { appendRecord?: string } {
    const r = rowOf(ticketNo);
    if (!r?.flash) return { ok: false, message: FLASH_TIP_EDIT_STATE };
    const st = r.flash.state;
    const now = Date.now();
    let appendRecord: string | undefined;
    if (input.result === FLASH_RESULT_OFFLINE) {
      const at = input.offlineRegisteredAt.trim();
      const future = at ? validateOfflineRegisteredAt(at, now) : null;
      if (!at || future) return { ok: false, message: future ?? '' };
      const changed = st.result !== FLASH_RESULT_OFFLINE || st.offlineRegisteredAt !== at;
      if (changed) {
        appendRecord = FLASH_TL.offlineRegister(at);
        log(ticketNo, now, {
          category: 'handle', action: 'handle', who: by.name, role: by.role, how: '线下登记', what: appendRecord,
        });
        const resume = offlineBatchResumeAt(at, now);
        if (resume) {
          st.slaPausedUntil = flashMinuteStamp(resume);
          log(ticketNo, now + 1, {
            category: 'sla', action: 'hold', who: '系统', role: '系统', how: 'SLA 暂停',
            what: FLASH_TL.slaPause(st.slaPausedUntil),
          });
        } else {
          resumePause(r, '线下登记时间变更', now + 1);
        }
      }
      st.result = FLASH_RESULT_OFFLINE;
      st.offlineRegisteredAt = at;
    } else {
      if (st.result === FLASH_RESULT_OFFLINE) resumePause(r, '处理结果变更', now);
      st.result = input.result || undefined;
      st.offlineRegisteredAt = undefined;
    }
    if (r.nodeStatus === '待响应') Object.assign(r, { nodeStatus: '处理中', responded: true });
    r.updatedAt = flashMinuteStamp(now);
    bump(ticketNo);
    persist();
    return { ok: true, message: '', appendRecord };
  }

  /**
   * 暂停期间做改变子状态或处理人的动作（申请挂起 / 委派 / 关闭工单 / 强结 / 调剂 等，PRD §4.3 / M73）：
   * 动作执行时刻恢复计时。下送 / 升级二线 / 重推 / 转售后 / 撤回在各自动作内已处理，不必再调。
   */
  function resumeSlaPause(ticketNo: string, cause: string): boolean {
    const r = rowOf(ticketNo);
    if (!r?.flash) return false;
    const hit = resumePause(r, cause, Date.now());
    if (hit) {
      bump(ticketNo);
      persist();
    }
    return hit;
  }

  /**
   * 下送（PRD §5.5「下送确认」/ §8 / M26 / M58）：
   * - 本单已产生过回访结论 → 跳过回访直接「已结案」，不发调研短信，履历「下送（已回访过，直接结案）」；
   * - 否则 → 进「调研中」，处理人为下送人，记下送发起人（X30），发调研短信（写通知记录）。
   * 暂停期内先恢复计时。
   */
  function forward(ticketNo: string, by: FlashActor, result: FlashResult): FlashActionResult {
    const r = rowOf(ticketNo);
    if (!r?.flash || isTicketClosed(r.nodeStatus)) return { ok: false, message: FLASH_TIP_REPUSH_STATE };
    const st = r.flash.state;
    const now = Date.now();
    resumePause(r, '下送', now);
    st.result = result;
    if (result !== FLASH_RESULT_OFFLINE) st.offlineRegisteredAt = undefined;
    if (st.surveyConcluded) {
      Object.assign(r, {
        nodeStatus: '已结案', nodeStep: 5, tab: 'mine',
        slaText: '—', slaSub: '已结案', slaState: 'ok', slaMinutes: 9999,
        updatedAt: flashMinuteStamp(now),
      });
      st.forwardedBy = undefined;
      log(ticketNo, now + 1, {
        category: 'node', action: 'resolved', who: by.name, role: by.role, how: '下送', what: FLASH_TL.forwardClosed(result),
      });
      bump(ticketNo);
      persist();
      return { ok: true, code: 'closed', message: FLASH_TOAST.forwardClosed };
    }
    st.slaBeforeForward = { slaText: r.slaText, slaSub: r.slaSub, slaState: r.slaState, slaMinutes: r.slaMinutes };
    st.forwardedBy = by.name;
    Object.assign(r, {
      nodeStatus: '调研中', nodeStep: 4, tab: 'mine', assignee: by.name,
      slaText: '—', slaSub: '调研中', slaState: 'ok', slaMinutes: 9999,
      updatedAt: flashMinuteStamp(now),
    });
    log(ticketNo, now + 1, {
      category: 'node', action: 'resolved', who: by.name, role: by.role, how: '下送', what: FLASH_TL.forward(result),
    });
    const content = flashSmsSurvey(r.no);
    useNotifyLogStore().emit({
      ticketNo: r.no,
      event: FLASH_NOTIFY_EVENTS.survey,
      kind: 'accepted',
      title: '调研短信',
      receivers: [`${r.customer}(客户)`],
      content,
      channel: '短信',
      status: '已发送',
    });
    log(r.no, now + 2, {
      category: 'comm', action: 'sms', who: '系统', role: '系统', how: '短信通知',
      what: `发送至 ${r.customerPhone ?? r.customer}：${content}`,
    });
    bump(ticketNo);
    persist();
    return { ok: true, message: FLASH_TOAST.forwarded };
  }

  /**
   * 下送发起人撤回（PRD §8 / M34 / M58 / X30）：只有「调研中」且当前人是本次下送的发起人可撤；
   * 撤销本次下送，回本人名下「处理中」，SLA 按下送前的摘要接着跑；不计为已回访。
   */
  function withdrawForward(ticketNo: string, by: FlashActor): FlashActionResult {
    const r = rowOf(ticketNo);
    if (!r?.flash || r.nodeStatus !== '调研中') return { ok: false, message: '当前无可撤回的操作' };
    const st = r.flash.state;
    if (!st.forwardedBy || st.forwardedBy !== by.name) return { ok: false, message: '只能撤回本人发起的下送' };
    const now = Date.now();
    Object.assign(r, {
      nodeStatus: '处理中', nodeStep: 3, tab: 'mine', assignee: by.name, responded: true,
      ...(st.slaBeforeForward ?? POOL_SLA),
      updatedAt: flashMinuteStamp(now),
    });
    st.forwardedBy = undefined;
    st.slaBeforeForward = undefined;
    log(ticketNo, now, {
      category: 'node', action: 'transfer', who: by.name, role: by.role, how: '撤回', what: FLASH_TL.withdrawForward,
    });
    bump(ticketNo);
    persist();
    return { ok: true, message: '已撤回上一操作' };
  }

  /**
   * 转售后（二线，PRD §7.3）：子状态「已转出」、客服侧冻结；暂停期内先恢复计时。
   * 履历与关联售后单号由处理页的转售后弹窗给出（`what` 为弹窗组好的正文）。
   */
  function transferAftersale(ticketNo: string, by: FlashActor, asNo: string, what: string): FlashActionResult {
    const r = rowOf(ticketNo);
    if (!r?.flash || !EDITABLE_STATUSES.includes(r.nodeStatus)) return { ok: false, message: FLASH_TIP_REPUSH_STATE };
    const st = r.flash.state;
    const now = Date.now();
    resumePause(r, '转售后', now);
    st.slaBeforeAftersale = { slaText: r.slaText, slaSub: r.slaSub, slaState: r.slaState, slaMinutes: r.slaMinutes };
    Object.assign(r, {
      nodeStatus: '已转出', linkedAftersaleNo: asNo,
      slaText: '—', slaSub: '已转出·停表', slaState: 'ok', slaMinutes: 9999,
      updatedAt: flashMinuteStamp(now),
    });
    log(ticketNo, now + 1, {
      category: 'node', action: 'transfer', who: by.name, role: by.role, how: '转售后', what,
    });
    bump(ticketNo);
    persist();
    return { ok: true, message: `已转售后 ${asNo}，工单转入「已转出」，等待售后处理结果` };
  }

  /**
   * 售后处理完唤起原单（PRD §7.1 / §7.3，售后回传接入点）：回原二线处理人「处理中」，SLA 按转出前摘要续算，
   * 处理结果预置「已转售后」，由处理人下送。
   */
  function returnFromAftersale(ticketNo: string): FlashActionResult {
    const r = rowOf(ticketNo);
    if (!r?.flash || r.nodeStatus !== '已转出') return { ok: false, message: FLASH_TIP_REPUSH_STATE };
    const st = r.flash.state;
    const now = Date.now();
    Object.assign(r, {
      nodeStatus: '处理中', tab: 'mine',
      ...(st.slaBeforeAftersale ?? POOL_SLA),
      updatedAt: flashMinuteStamp(now),
    });
    delete (r as Partial<Ticket>).linkedAftersaleNo;
    st.slaBeforeAftersale = undefined;
    st.result = '已转售后';
    log(ticketNo, now, {
      category: 'node', action: 'transfer', who: '系统', role: '系统', how: '售后唤起',
      what: `售后处理完成，唤起原单，回到 ${r.assignee ?? ''} 名下处理中`,
    });
    bump(ticketNo);
    persist();
    return { ok: true, message: '' };
  }

  /**
   * 沿用通用动作（申请挂起 / 解除挂起 / 关闭工单 / 强结 / 调剂 / 审核中撤回 等）改了处理页上的子状态后，
   * 同步回工单库，刷新与工作台读到的是同一个状态。`clearAssignee` 用于跨组调剂转入池。
   */
  function syncStatus(ticketNo: string, status: string, opts: { clearAssignee?: boolean } = {}): void {
    const r = rowOf(ticketNo);
    if (!r?.flash) return;
    if (r.nodeStatus === status && !opts.clearAssignee) return;
    Object.assign(r, {
      nodeStatus: status,
      ...(opts.clearAssignee ? { assignee: null, tab: 'pool' } : {}),
      updatedAt: flashMinuteStamp(Date.now()),
    });
    bump(ticketNo);
    persist();
  }

  /**
   * 迟到回传「接收成功」（M11 / M48 / M77）：回传超时已转人工之后才收到的成功回传。
   * 写履历、记迟到回传时间；**不改状态、不发成功短信**。
   * 通知：当前处理人（有则发）；该次推送是人工重推时另发重推发起人；同一人只发一条；都没有不发。
   */
  function recordLateSuccess(ticketNo: string, at: number = Date.now()): FlashActionResult {
    const r = rowOf(ticketNo);
    const run = r?.flash ? [...r.flash.runs].reverse().find((x) => x.failL2 === '回传超时') : undefined;
    if (!r?.flash || !run) return { ok: false, message: FLASH_TIP_REPUSH_STATE };
    r.flash.state.lateSuccessAt = flashStamp(at);
    log(r.no, at, {
      category: 'node', action: 'flashSuccess', who: '系统', role: '系统', how: '回传结果',
      what: FLASH_TL.lateSuccess,
    });
    const receivers: string[] = [];
    if (r.assignee) receivers.push(r.assignee);
    if (run.line && run.by && !receivers.includes(run.by)) receivers.push(run.by);
    if (receivers.length) {
      useNotifyLogStore().emit({
        ticketNo: r.no,
        event: FLASH_NOTIFY_EVENTS.lateSuccess,
        kind: 'assign',
        title: '迟到回传提示',
        receivers,
        content: FLASH_NOTICE.lateSuccess(r.no),
      });
    }
    bump(r.no);
    persist();
    return { ok: true, message: '' };
  }

  /* ---------------- 工作台：池与领取（M3，§4.2 / §9） ---------------- */

  /** 建单人姓名（刷机履历建单事件的操作人；用户提报为客户本人） */
  function creatorNameOf(no: string): string | undefined {
    return timelineOf(no).find((e) => e.action === 'create')?.who;
  }

  /** 进池时间：本单最近一次进入人工池的时刻（转人工 / 升级二线事件），取不到时回落更新时间 */
  function poolEnteredAtOf(no: string): string {
    const hit = [...timelineOf(no)].reverse().find((e) => e.action === 'flashHandoff' || e.action === 'escalate');
    return hit?.when ?? rawOf(no)?.updatedAt ?? '';
  }

  /**
   * 从池中领取（§4.2 / §9.2 / §9.3）：未认领且无处理人才可领；领到后子状态「待响应」、处理人＝领取人、
   * 进「我的任务」，写履历「领取」；**不改 SLA**、不动归属池。已被他人领取时返回「该工单已被 〈姓名〉 领取」。
   */
  function claimFromPool(ticketNo: string, by: FlashActor): FlashActionResult {
    const r = rowOf(ticketNo);
    if (!r?.flash) return { ok: false, message: FLASH_TIP_REPUSH_STATE };
    if (r.assignee) return { ok: false, message: `该工单已被 ${r.assignee} 领取` };
    if (r.nodeStatus !== '未认领') return { ok: false, message: '当前工单状态不可领取' };
    const now = Date.now();
    Object.assign(r, {
      nodeStatus: '待响应',
      assignee: by.name,
      tab: 'mine',
      responded: false,
      updatedAt: flashMinuteStamp(now),
    });
    log(ticketNo, now, {
      category: 'node', action: 'accept', who: by.name, role: by.role, how: '领取',
      what: `${by.name} 从池中领取本单。`,
    });
    bump(ticketNo);
    persist();
    return { ok: true, message: `已领取 ${ticketNo}` };
  }

  /** 对账：到点的推送出回传结果。返回本次结算的单数 */
  function settleDue(now: number = Date.now()): number {
    let settled = 0;
    for (const t of TICKETS) {
      // PRD §4.3 / §11.2：线下登记暂停到点自动恢复，记「SLA 恢复计时 · 到达暂停截止时刻」
      const until = t.type === '刷机' ? t.flash?.state.slaPausedUntil : undefined;
      if (until && parseFlashStamp(until).getTime() <= now) {
        const r = reactive(t);
        const at = parseFlashStamp(until).getTime();
        r.flash!.state.slaPausedUntil = undefined;
        log(r.no, at, {
          category: 'sla', action: 'hold', who: '系统', role: '系统', how: 'SLA 恢复',
          what: FLASH_TL.slaResume('到达暂停截止时刻'),
        });
        bump(r.no);
        settled += 1;
      }
      if (t.type !== '刷机' || !t.flash || t.nodeStatus !== '自动刷机中') continue;
      const r = reactive(t);
      const run = [...r.flash!.runs].reverse().find((x) => x.result === '等待回传');
      if (!run) continue;
      const device = findMdmDevice(r.flash!.info.sn);
      const elapsed = now - run.pushedAtMs;
      if (!device || device.noResponse) {
        // M11：回传无响应 → 到回传超时时长转人工；时长取推送发出时的快照（PRD §10.5）
        const timeoutMs = (run.returnTimeoutMin ?? config.returnTimeoutMin) * 60_000;
        if (elapsed < timeoutMs) continue;
        fail(r, run, '推送异常', '回传超时', run.pushedAtMs + timeoutMs);
        settled += 1;
        continue;
      }
      if (elapsed < FLASH_RETURN_DELAY_MS) continue;
      const at = run.pushedAtMs + FLASH_RETURN_DELAY_MS;
      const online = device.online === '在线' || (device.onlineAfterContact && run.trigger !== '建单首推');
      if (device.pushApi === '持续报错') fail(r, run, '推送异常', '接口异常', at);
      else if (!online) fail(r, run, '接收失败', device.returnsDetail ? device.online as FlashFailL2 : undefined, at);
      else if (!device.versionOk) fail(r, run, '接收失败', device.returnsDetail ? '版本不符' : undefined, at);
      else succeed(r, run, at);
      settled += 1;
    }
    if (settled) persist();
    return settled;
  }

  function mergeInfo(prev: FlashInfo, changes: FlashInfoChanges): FlashInfo {
    const next: FlashInfo = { ...prev, ...changes, snPhotos: [...(changes.snPhotos ?? prev.snPhotos)] };
    if (changes.sn) next.sn = changes.sn.trim().toUpperCase();
    if (changes.schoolId && !changes.schoolName) next.schoolName = findSchoolById(changes.schoolId)?.name ?? prev.schoolName;
    return next;
  }

  function diffInfo(prev: FlashInfo, next: FlashInfo): TimelineFieldChange[] {
    const out: TimelineFieldChange[] = [];
    (Object.keys(FLASH_INFO_FIELD_LABELS) as (keyof typeof FLASH_INFO_FIELD_LABELS)[]).forEach((k) => {
      const from = Array.isArray(prev[k]) ? (prev[k] as string[]).join('、') : String(prev[k] ?? '');
      const to = Array.isArray(next[k]) ? (next[k] as string[]).join('、') : String(next[k] ?? '');
      if (from === to) return;
      // PRD §5.6：设备SN照片有变化写「设备SN照片：已更换」
      if (k === 'snPhotos') {
        out.push({ field: FLASH_INFO_FIELD_LABELS[k], kind: '修改', from: '', to: to ? '已更换' : '—' });
        return;
      }
      out.push(from ? { field: FLASH_INFO_FIELD_LABELS[k], kind: '修改', from, to } : { field: FLASH_INFO_FIELD_LABELS[k], kind: '补充', to });
    });
    return out;
  }

  /* ---------------- 初始化：读缓存 → 对账 → 起对账钟 ---------------- */

  function hydrate() {
    const cachedTickets = readFlashCache<TicketsCache>(FLASH_LS_KEYS.tickets);
    const cachedTl = readFlashCache<TimelineCache>(FLASH_LS_KEYS.timeline);
    if (cachedTickets && cachedTl && Array.isArray(cachedTickets.tickets)) {
      for (const saved of cachedTickets.tickets) {
        const existing = rawOf(saved.no);
        if (existing) {
          // 快照是整单：种子上有、快照里已没有的字段（被清空的）一并去掉
          (Object.keys(existing) as (keyof Ticket)[]).forEach((k) => {
            if (!(k in saved)) delete (existing as unknown as Record<string, unknown>)[k];
          });
          Object.assign(existing, saved);
        } else {
          TICKETS.push(saved);
        }
      }
      timelines.value = cachedTl.timelines ?? {};
      tlSeq = typeof cachedTl.seq === 'number' ? cachedTl.seq : 0;
    } else {
      timelines.value = JSON.parse(JSON.stringify(FLASH_SEEDS.timelines)) as Record<string, TimelineEntry[]>;
      tlSeq = 0;
    }
  }

  hydrate();
  settleDue();
  persist();
  if (typeof window !== 'undefined') window.setInterval(() => settleDue(), 1000);

  return {
    timelines,
    revisions,
    // 读
    flashOf,
    timelineOf,
    revisionOf,
    findInflightBySn,
    progressStageOf,
    // 动作
    evaluateCreate,
    createFlashTicket,
    startPush,
    repush,
    saveFlashInfo,
    recordSurveyConclusion,
    transferToPool,
    recordLateSuccess,
    settleDue,
    // 处理页（M4b-2）
    liveNotices,
    escalateToL2,
    saveProcess,
    resumeSlaPause,
    forward,
    withdrawForward,
    transferAftersale,
    returnFromAftersale,
    syncStatus,
    // 工作台（M3）
    creatorNameOf,
    poolEnteredAtOf,
    claimFromPool,
  };
});

/** 单号前缀（供按单号查进度时判断是否刷机单） */
export const FLASH_NO_PREFIX = TICKET_NO_PREFIX['刷机'];
