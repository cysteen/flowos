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
import { makeTicketNo } from '@/constants/ticketNo';
import {
  FLASH_FIELD_LABELS, FLASH_INFO_FIELD_LABELS, FLASH_NOTIFY_EVENTS, FLASH_POOLS, FLASH_REASON_AUTO,
  FLASH_RETURN_DELAY_MS, FLASH_TIP_MODEL_UNSUPPORTED, FLASH_TIP_PRODUCT_UNSUPPORTED,
  FLASH_RESULT_ONLINE_SUCCESS, FLASH_RESULT_OFFLINE_PUSHED, normalizeFlashResult,
  FLASH_TIP_NON_SELF_DEVELOPED, FLASH_TIP_REASON_NOT_GRADUATE_L1, FLASH_TIP_REASON_NOT_GRADUATE_L2,
  FLASH_TIP_AUTO_FLASHING, FLASH_TIP_EDIT_STATE, FLASH_TIP_REPUSH_STATE, FLASH_TIP_SYSTEM_BUSY, FLASH_TIP_VERIFY_UNAVAILABLE,
  FLASH_VERIFY_NOT_RUN, FLASH_TL, FLASH_NOTICE, FLASH_RESULT_OFFLINE, FLASH_TOAST,
  FLASH_CS_NOTICE, FLASH_SURVEY_TIMEOUT_HOURS, FLASH_PRODUCT_CATEGORY, FLASH_TAG_L1, FLASH_TAG_L2,
  FLASH_TAG_L3_USER_REPORT, FLASH_TICKET_TYPE,
  flashTicketTitle, withFlashTitlePrefix, isFlashTicket, flashMinuteStamp, flashProgressStage, flashSmsHandoff, flashSmsSuccess, flashSmsSurvey, flashStamp,
  flashTipInflight, flashTipRequired, flashTipVerifyFailed, isFrontlineActor,
  parseFlashStamp,
  type FlashActor, type FlashCreator, type FlashFailL1, type FlashFailL2, type FlashHandoffReason,
  type FlashInfo, type FlashPoolKey, type FlashProgressStage, type FlashPushTrigger, type FlashReasonName,
  type FlashResult, type FlashRun, type FlashState, type FlashVerifyResult, type TicketFlash,
} from '@/views/tickets/types/flash';
import { formatSlaClock, isFlashSlaCounted, readFlashSla, slaStateOf } from '@/views/tickets/utils/slaClock';
import { GROUP_MEMBERS, LOGIN_URL, templateOf } from '@/mock/notifyRules';
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
  /** 产品名称（坐席建单取「产品问题」卡的产品名称；用户提报取所报型号，1013 A4） */
  productModel: string;
  /** 产品分类；缺省（用户提报只报型号）由系统按产品带出（1013 A4） */
  productCategory?: string;
  /** 问题分类三级；缺省（用户提报）按「售后 → 服务申请 → 自助刷机」写入（1013 A5） */
  problemL1?: string;
  problemL2?: string;
  problemL3?: string;
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
  /** 坐席建单时的工单标题；缺省按「刷机 · 产品名称 · 问题三级 · 工单来源」生成，均强制前缀「刷机」（1013 A3） */
  title?: string;
  /** 坐席填写的问题描述；缺省由系统按刷机信息生成 */
  problemDesc?: string;
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
    return t && isFlashTicket(t) && t.flash ? reactive(t) : undefined;
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
      (t) => isFlashTicket(t)
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
    return t && isFlashTicket(t) ? flashProgressStage(t.nodeStatus) : undefined;
  }

  /* ---------------- 写：公共 ---------------- */

  function bump(no: string) {
    revisions.value = { ...revisions.value, [no]: revisionOf(no) + 1 };
  }

  function persist() {
    // 刷机单 + 与之弱关联的投诉单（关联投诉新建的单只在运行时工单库里，随刷机缓存一起落）
    const linked = new Set(TICKETS.flatMap((t) => (isFlashTicket(t) ? t.flash?.state.linkedComplaintNos ?? [] : [])));
    const tickets = TICKETS.filter((t) => (isFlashTicket(t) && t.flash) || linked.has(t.no)).map((t) => toRaw(t));
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
   * 受理短信（PRD §2.5 / §11.1）：坐席代建建单成功后发至联系手机号，文案沿用 400 渠道现行「建单受理通知」短信模板；
   * 用户提报不发。与转人工短信、成功短信各自独立发送。
   */
  function acceptedSms(r: Ticket, at: number) {
    const body = templateOf('短信', 'SMS_WO_ACCEPTED')?.body ?? '';
    const content = body.replace('${productName}', r.flash!.info.productModel).replace('${ticketNo}', r.no);
    const rec = useNotifyLogStore().emit({
      ticketNo: r.no,
      event: FLASH_NOTIFY_EVENTS.accepted,
      kind: 'accepted',
      title: '受理短信',
      receivers: [`${r.customer}(客户)`],
      content,
      channel: '短信',
      status: '已发送',
    });
    if (rec) rec.when = flashStamp(at);
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
      // 到组类通知走容联云留言弹窗（PRD §11.1）
      channel: '容联云留言弹窗',
    });
  }

  /**
   * 发调研短信（PRD §8 / §11.1 / M86）：写通知记录与履历，记「调研短信发出时刻」供调研超时判定。
   * 进「调研中」的两个入口（下送、首推自动刷机成功）都走这里。
   */
  function sendSurveySms(r: Ticket, at: number) {
    r.flash!.state.surveySentAt = flashStamp(at);
    const content = flashSmsSurvey(r.no);
    const rec = useNotifyLogStore().emit({
      ticketNo: r.no,
      event: FLASH_NOTIFY_EVENTS.survey,
      kind: 'accepted',
      title: '调研短信',
      receivers: [`${r.customer}(客户)`],
      content,
      channel: '短信',
      status: '已发送',
    });
    if (rec) rec.when = flashStamp(at);
    log(r.no, at, {
      category: 'comm', action: 'sms', who: '系统', role: '系统', how: '短信通知',
      what: `发送至 ${r.customerPhone ?? r.customer}：${content}`,
    });
  }

  /* ---------------- SLA 账本（PRD §4.3，D-01：账本是唯一真源） ---------------- */

  /** 不计 SLA 的单（一线刷机池、一线名下、从未进过教育刷机处理组池）在工单行上的 SLA 摘要（1013 A26） */
  const SLA_IDLE_ROW = { slaText: '—', slaSub: '未计时', slaState: 'ok', slaMinutes: 9999 } as const;

  /**
   * 工单行 SLA 摘要字段的**投影**。真源是账本（`FlashState` 上那几个时刻），这里只在每次记账后
   * 把读数落回 `slaText/slaSub/slaState/slaMinutes`，供尚未接账本的展示位（个人门户待办等）取用。
   * 刷机单的列表格、排序键与处理页页头都直接读账本，不读这几个字段。
   * 一线不计 SLA（1013 A26）：只有进过教育刷机处理组池、已起算的单才写读数，与显示层 `isFlashSlaCounted` 同一判据。
   */
  function syncSlaRow(r: Ticket, at: number, pauseReason?: string) {
    if (!isFlashSlaCounted(r.flash!.state)) return;
    const read = readFlashSla(r.flash!.state, at);
    if (!read || read.status === 'stopped') return;
    if (read.status === 'paused') {
      Object.assign(r, {
        slaText: '已暂停', slaSub: pauseReason ?? r.slaSub, slaState: 'paused', slaMinutes: 9999,
      });
      return;
    }
    Object.assign(r, {
      slaText: formatSlaClock(read.remainMs),
      slaSub: read.remainMs < 0 ? '已超时' : '距超时',
      slaState: slaStateOf(read.remainMs),
      slaMinutes: Math.round(Math.abs(read.remainMs) / 60_000),
    });
  }

  /** 停钟：记下本段起点。未起算、已停表、已在停钟中都不重复记。 */
  function pauseClock(r: Ticket, at: number, reason: string) {
    const st = r.flash!.state;
    if (!st.slaStartedAt || st.slaStoppedAt || st.slaPausedSince) return;
    st.slaPausedSince = flashStamp(at);
    syncSlaRow(r, at, reason);
  }

  /** 恢复计时：把本段停钟并入累计毫秒，剩余自停钟前接续（不重置、不大于停钟前的剩余）。 */
  function resumeClock(r: Ticket, at: number) {
    const st = r.flash!.state;
    if (!st.slaPausedSince) return;
    const since = parseFlashStamp(st.slaPausedSince).getTime();
    st.slaPausedAccumMs = (st.slaPausedAccumMs ?? 0) + Math.max(0, at - since);
    st.slaPausedSince = undefined;
    syncSlaRow(r, at);
  }

  /** 关钟：终态收口。`voidStop` 为中止（升级、转出、取消）——钟被掐断，没有达标结论。 */
  function stopClock(r: Ticket, at: number, voidStop = false) {
    const st = r.flash!.state;
    if (!st.slaStartedAt || st.slaStoppedAt) return;
    const read = readFlashSla(st, at);
    st.slaStoppedAt = flashStamp(at);
    st.slaOutcome = voidStop ? 'void' : (read?.remainMs ?? 0) >= 0 ? 'met' : 'breached';
  }

  /**
   * SLA 起算（PRD §4.3 / M88，1013 A26）：本单**首次进入教育刷机处理组池**时写入「SLA 起算时间」，
   * 此后再次进池不改写；一线刷机池、一线名下不起算。首响从起算时刻重新计。
   */
  function startSlaIfL2(r: Ticket, at: number) {
    const st = r.flash!.state;
    if (st.pool !== 'l2' || st.slaStartedAt) return;
    st.slaStartedAt = flashMinuteStamp(at);
    st.slaPausedAccumMs = 0;
    st.slaPausedSince = undefined;
    r.responded = false;
  }

  function toHandler(r: Ticket, run: FlashRun, at: number) {
    Object.assign(r, {
      nodeStatus: '处理中',
      assignee: run.handlerAtPush ?? r.assignee,
      tab: 'mine',
      updatedAt: flashMinuteStamp(at),
    });
    // 回传回到人工侧：「自动刷机中」那段停钟结束，剩余自停钟前接续（PRD §4.3）
    resumeClock(r, at);
  }

  /**
   * 转入人工池。`sms` 只对自动环节首次转人工为 true（M14 / M37：每单一条，已发过不再发）。
   * SLA（1013 A26）：进一线刷机池不起算；首次进教育刷机处理组池起算，此后再次进池接着跑（停钟中的先恢复），
   * 一律不重置（PRD §4.3 / M16 / D18）。
   */
  function handoff(
    r: Ticket,
    pool: FlashPoolKey,
    reason: FlashHandoffReason,
    at: number,
    opts: { sms?: boolean } = {},
  ) {
    const st = r.flash!.state;
    const meta = FLASH_POOLS[pool];
    Object.assign(r, {
      nodeStatus: '未认领',
      assignee: null,
      tab: 'pool',
      groupId: meta.groupId,
      groupNames: [meta.groupName],
      updatedAt: flashMinuteStamp(at),
    });
    st.pool = pool;
    st.handoffReason = reason;
    startSlaIfL2(r, at);
    resumeClock(r, at);
    if (isFlashSlaCounted(st)) syncSlaRow(r, at);
    else Object.assign(r, SLA_IDLE_ROW);
    log(r.no, at, {
      category: 'node', action: 'flashHandoff', who: '系统', role: '系统', how: '转人工',
      what: FLASH_TL.handoff(reason, meta.label),
    });
    if (opts.sms && !st.handoffSmsSent) {
      st.handoffSmsSent = true;
      sms(r, at + 1000, 'handoff');
    }
    // 到组通知（PRD §11.1 / 1013 B14）：每次进池都通知全组，同一张单再次进池照发；
    // 调研中催补进一线刷机池（分派表第 10 行）走催补通知，不另发；升级二线进池另有专用文案（escalateToL2）
    if (reason !== '回访期间客户催补') notifyPoolArrival(r, pool);
  }

  /**
   * 到组通知：一线刷机池发持有容联云刷机角色的一线坐席，教育刷机处理组池发全组；
   * 渠道为容联云留言弹窗，文案沿用咨询单到组通知（「工单池待领取提醒」模板）。
   */
  function notifyPoolArrival(r: Ticket, pool: FlashPoolKey) {
    const meta = FLASH_POOLS[pool];
    const receiver = pool === 'l1' ? meta.label : meta.groupName;
    const body = (templateOf('IM', 'IM_WO_POOLED')?.body ?? '')
      .replace('${groupName}', receiver)
      .replace('${ticketNo}', r.no)
      .replace('${loginUrl}', LOGIN_URL);
    useNotifyLogStore().emit({
      ticketNo: r.no,
      event: 'ticket.pooled',
      kind: 'group',
      title: '到组通知',
      receivers: [receiver],
      content: body,
      channel: '容联云留言弹窗',
    });
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
    Object.assign(r, { nodeStatus: '自动刷机中', updatedAt: flashMinuteStamp(at) });
    // 已在教育刷机处理组池起算的单：重推「自动刷机中」整段停钟（PRD §4.3）；一线与未起算的单不计时
    pauseClock(r, at, '自动刷机中');
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
      // PRD §8 入口「自动刷机成功」：发成功短信后进「调研中」，发调研短信（§11.1）
      sendSurveySms(r, at + 2000);
    } else {
      // 1013 B1：重新推送接收成功 → 系统写入「刷机成功」类处理结果，转入回访（处理人保持发起时的处理人）；
      // 本单已有回访结论的直接结案（一张单最多回访一次）。M32 同样发成功短信
      const handler = run.handlerAtPush ?? r.assignee ?? run.by;
      const result = FLASH_RESULT_ONLINE_SUCCESS;
      // 「自动刷机中」那段停钟先结掉，再按去向收口或另起「调研中」停钟
      resumeClock(r, at);
      st.result = result;
      st.forwardedBy = undefined;
      log(r.no, at, {
        category: 'node', action: 'flashSuccess', who: '系统', role: '系统', how: '回传结果',
        what: FLASH_TL.returnSuccess,
      });
      sms(r, at + 1000, 'success');
      if (st.surveyConcluded) {
        stopClock(r, at);
        Object.assign(r, {
          nodeStatus: '已结案', nodeStep: 5, tab: 'mine', assignee: handler,
          slaText: '—', slaSub: '已结案', slaState: 'ok', slaMinutes: 9999,
          updatedAt: flashMinuteStamp(at),
        });
        log(r.no, at + 1, {
          category: 'node', action: 'resolved', who: '系统', role: '系统', how: '回传结果',
          what: FLASH_TL.repushSuccessClosed,
        });
      } else {
        Object.assign(r, {
          nodeStatus: '调研中', nodeStep: 4, tab: 'mine', assignee: handler,
          slaText: '—', slaSub: '调研中', slaState: 'ok', slaMinutes: 9999,
          updatedAt: flashMinuteStamp(at),
        });
        pauseClock(r, at, '调研中');
        log(r.no, at + 1, {
          category: 'node', action: 'resolved', who: '系统', role: '系统', how: '回传结果',
          what: FLASH_TL.repushSuccessSurvey,
        });
        sendSurveySms(r, at + 2000);
      }
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
    } else {
      // 1013 B1 / A14：一线、二线重推失败一律交回发起时的处理人（不自动进二线池）；M38：通知本人
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
  function verify(info: Pick<FlashInfo, 'sn' | 'studentAccount' | 'studentName' | 'schoolId'>): VerifyResult {
    const device = findMdmDevice(info.sn);
    if (device?.verifyApi === '不可用') return { ok: false, unavailable: true, result: FLASH_VERIFY_NOT_RUN };
    // 两项都比，结论各自保留；两项都不通过时细分取「SN与学生账号不一致」（先比设备再比身份，M50）
    const snOk = !!device && device.studentAccount === info.studentAccount.trim();
    const gradOk = isGraduate(info.schoolId, info.studentAccount, info.studentName ?? '');
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
   * ① 产品未开启「是否支持刷机」 → 拦截 A1；② 同 SN 在途 → 拦截 A2（在途查询不可用 → 拦截「系统繁忙」，M43）；
   * ③ 刷机原因≠毕业 → 二线池（特殊情况）；④ 建单校验：接口不可用 → 一线池（推送异常 · 接口异常，M43），
   * 不通过 → 用户提报进一线池、坐席代建进二线池（D12）；⑤ 非自研 → 一线池（M8′）；⑥ 自研 → 自动刷机中。
   */
  function evaluateCreate(input: FlashCreateInput, creator: FlashCreator): FlashCreateEvaluation {
    const missing = missingRequired(input, creator);
    if (missing.length) return { kind: 'blocked', code: 'required', message: flashTipRequired(missing), missing };
    if (!config.isSupportedModel(input.productModel)) {
      return { kind: 'blocked', code: 'A1', message: creator === '用户提报' ? FLASH_TIP_MODEL_UNSUPPORTED : FLASH_TIP_PRODUCT_UNSUPPORTED };
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

  /** 必填缺项（M4 / M46）：设备SN照片仅用户提报必传；产品字段用户提报叫「产品型号」、坐席侧叫「产品名称」（1013 A4） */
  function missingRequired(input: FlashCreateInput, creator: FlashCreator): string[] {
    const L = FLASH_FIELD_LABELS;
    const checks: [boolean, string][] = [
      [!input.productModel?.trim(), creator === '用户提报' ? L.productModel : L.productName],
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
    // 刷机单沿用咨询单号（1013 A1）：与当日咨询单共用一个自增号段
    const probe = makeTicketNo(FLASH_TICKET_TYPE, 1, d).slice(0, -5);
    const max = TICKETS
      .filter((t) => t.no.startsWith(probe))
      .reduce((m, t) => Math.max(m, Number(t.no.slice(-5)) || 0), 0);
    return makeTicketNo(FLASH_TICKET_TYPE, max + 1, d);
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
    const ticketSource = base.ticketSource ?? (byUser ? '客户服务小程序' : '电话');
    // 问题分类：坐席建单取所选三级；用户提报自动匹配「售后 → 服务申请 → 自助刷机」（1013 A5）
    const problemL1 = input.problemL1 || FLASH_TAG_L1;
    const problemL2 = input.problemL2 || FLASH_TAG_L2;
    const problemL3 = input.problemL3 || FLASH_TAG_L3_USER_REPORT;
    const raw: Ticket = {
      id: `flash-${no}`,
      no,
      // 刷机单＝咨询单 + 不可改的「刷机单」标识（1013 A1）
      type: FLASH_TICKET_TYPE,
      isFlash: true,
      channel: base.channel ?? (byUser ? '小程序' : '电话'),
      ticketSource,
      // 标题强制前缀「刷机」（1013 A3）
      title: base.title?.trim()
        ? withFlashTitlePrefix(base.title)
        : flashTicketTitle(info.productModel, problemL3, ticketSource),
      smartMarks: [],
      customer: base.customer,
      vip: base.vip ?? false,
      customerPhone: base.customerPhone ?? input.contactPhone.trim(),
      sn: info.sn,
      product: info.productModel,
      // 产品两级：用户提报只报型号，分类由系统按产品带出（1013 A4）
      productCategory: input.productCategory || config.modelOf(info.productModel)?.category || FLASH_PRODUCT_CATEGORY,
      problemL1,
      problemL2,
      problemL3,
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
      problemDesc: base.problemDesc
        ?? `学生${info.studentName}（账号 ${info.studentAccount}，${info.schoolName}）申请刷机，刷机原因：${info.reason}。设备 SN ${info.sn}。`,
      flash: {
        info,
        state: {
          outcome: '未推送', pushCount: 0, surveyConcluded: false, creator,
          slaPausedAccumMs: 0,
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
        ticketSource,
        r.flash!.state.verifyResult,
        evaluation.route === 'pool' ? { handoff: evaluation.handoffReason! } : { auto: true },
      ),
    });
    // PRD §2.5 / §11.1：坐席代建建单成功发受理短信，用户提报不发
    if (!byUser) acceptedSms(r, now + 200);
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
      // M87 / PRD §3.3：推送接口同步报错、自动重试 1 次仍失败 → 建单时即判定转人工（推送异常 · 接口异常）
      if (findMdmDevice(info.sn)?.pushApi === '持续报错') {
        const run = r.flash!.runs[r.flash!.runs.length - 1];
        fail(r, run, '推送异常', '接口异常', now + 1500);
      }
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
    // 1013 A14：一线、二线重推都不限次
    const l1 = !first && isFrontlineActor(by);
    pushInternal(r, first ? SYSTEM : by, first ? '建单首推' : l1 ? '一线重推' : '二线重推', Date.now());
    persist();
    return { ok: true, message: '已推送刷机包，等待硬件平台回传' };
  }

  /**
   * 修改刷机信息并重新推送（1013 A12 / B1：修改刷机信息弹窗「重新推送」是唯一的推送入口；M36 / M44）。
   * 先同步判定，任一不通过即返回提示，**不推送、不改状态**：
   * 状态可重推 → 机型支持且自研 → 刷机原因为毕业 → 改后 SN 无其他在途单 → 建单校验通过。一线、二线都不限次（A14）。
   * 全部通过即视为推送已发出（M69）：落库、写履历、推送次数 +1；
   * 回传接收成功 → 写入「刷机成功」类处理结果并转入回访；失败（含推送接口报错重试仍失败）→ 交回发起时的处理人。
   */
  function repush(ticketNo: string, by: FlashActor, changes: FlashInfoChanges = {}): FlashActionResult {
    const r = rowOf(ticketNo);
    if (!r?.flash) return { ok: false, message: FLASH_TIP_REPUSH_STATE };
    if (!REPUSHABLE_STATUSES.includes(r.nodeStatus)) return { ok: false, message: FLASH_TIP_REPUSH_STATE };
    const prev = r.flash.info;
    const next = mergeInfo(prev, changes);
    const l1 = isFrontlineActor(by);

    // M79 提交判定顺序（第 1 条必填由弹窗在字段下方判）：未启用机型 → 非自研 → 刷机原因非毕业 →
    // 在途查询不可用 → 设备SN在途 → 建单校验接口不可用 → SN与学生账号不一致 → 非毕业生身份；命中即止
    if (!config.isSupportedModel(next.productModel)) return { ok: false, message: FLASH_TIP_PRODUCT_UNSUPPORTED };
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
      return { ok: true, code: 'pushError', message: FLASH_TOAST.repushPushError };
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
    // M70：保存时检查必填（联系手机号不在刷机信息内，不在此判）；PRD §5.6 / §5.8 设备SN照片在弹窗内非必填，
    // 不论建单入口一律按坐席代建口径判
    const missing = missingRequired(
      { ...next, contactPhone: r.customerPhone ?? '-' },
      '一线代建',
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
   * 用户侧「服务评价」能不能提交（M86）：查不到单 / 已评价过 / 不在调研中 / 可评价。
   * 已评价优先于子状态判定：评价过的单之后结案或回流，再打开链接仍显示已评价。
   */
  function surveyGateOf(no: string): 'notFound' | 'evaluated' | 'unavailable' | 'open' {
    const t = rawOf(no);
    if (!t || !isFlashTicket(t) || !t.flash || t.isDraft || t.nodeStatus === '草稿') return 'notFound';
    if (t.flash.state.survey) return 'evaluated';
    return t.nodeStatus === '调研中' ? 'open' : 'unavailable';
  }

  /**
   * 记回访结论（PRD §8「回访结论去向」/ M58 / M86）：只在「调研中」且未评价过时可记，置位「已产生回访结论」。
   * - 已解决 → 「已结案」，处理人不变，SLA 结束；履历「回访：已解决」+「结案」。
   * - 未解决 → 教育刷机处理组池「未认领」、处理人清空，转人工原因「回访未解决」；
   *   SLA：从未进过教育刷机处理组池的此刻起算，其余按下送前的摘要接着跑；不发转人工短信（M47）。
   */
  function recordSurveyConclusion(
    ticketNo: string,
    solved: boolean,
    feedback: { score?: number; remark?: string } = {},
  ): FlashActionResult {
    const r = rowOf(ticketNo);
    if (!r?.flash || r.nodeStatus !== '调研中' || r.flash.state.survey) return { ok: false, message: FLASH_TIP_REPUSH_STATE };
    const st = r.flash.state;
    const now = Date.now();
    const score = Math.min(5, Math.max(1, Math.round(feedback.score ?? 5)));
    const remark = (feedback.remark ?? '').trim();
    st.surveyConcluded = true;
    st.survey = { solved, score, remark, at: flashStamp(now) };
    st.forwardedBy = undefined;
    r.serviceScore = score as NonNullable<Ticket['serviceScore']>;
    log(ticketNo, now, {
      category: solved ? 'praise' : 'customer',
      action: solved ? 'praise' : 'reply',
      who: r.customer, role: '客户', how: '回访评价',
      what: FLASH_TL.surveyFeedback(solved, score, remark),
      stars: score,
    });
    if (solved) {
      stopClock(r, now);
      Object.assign(r, {
        nodeStatus: '已结案', nodeStep: 5, tab: 'mine',
        slaText: '—', slaSub: '已结案', slaState: 'ok', slaMinutes: 9999,
        updatedAt: flashMinuteStamp(now),
      });
      log(ticketNo, now + 1, {
        category: 'node', action: 'resolved', who: '系统', role: '系统', how: '结案', what: FLASH_TL.surveySolvedClosed,
      });
    } else {
      // 已起算的单接着跑（「调研中」那段停钟在 handoff 里结掉）；未起算的单从进教育刷机处理组池时刻起算
      handoff(r, 'l2', '回访未解决', now + 1);
    }
    bump(ticketNo);
    persist();
    return { ok: true, message: solved ? '已结案' : `回访未解决，已转入${FLASH_POOLS.l2.label}` };
  }

  /**
   * 调研超时未评价自动结案（PRD §8 / M26′）：「已结案」、处理人不变、SLA 结束；履历操作人「系统」。
   */
  function closeSurveyTimeout(r: Ticket, at: number) {
    const st = r.flash!.state;
    stopClock(r, at);
    Object.assign(r, {
      nodeStatus: '已结案', nodeStep: 5, tab: 'mine',
      slaText: '—', slaSub: '已结案', slaState: 'ok', slaMinutes: 9999,
      updatedAt: flashMinuteStamp(at),
    });
    st.forwardedBy = undefined;
    log(r.no, at, {
      category: 'node', action: 'resolved', who: '系统', role: '系统', how: '自动结案', what: FLASH_TL.surveyTimeoutClosed,
    });
    bump(r.no);
  }

  /**
   * 客户侧催单 / 新建补充（PRD §3.1 / §4.1 第 10 行 / §8「调研中催补拉回」/ §11.1，M9 / M27 / M33 / M41 / M47 / M75）。
   * - 调研中 ∧ 有处理人：撤回本次下送，回该处理人「处理中」，SLA 按下送前摘要接着跑，站内通知处理人；
   * - 调研中 ∧ 无处理人：进一线刷机池「未认领」，转人工原因「回访期间客户催补」，一线不计 SLA（1013 A26），
   *   通知归属组一线刷机池；不发转人工短信；
   * - 自动刷机中：不拉回，有处理人通知处理人、无处理人通知一线刷机池。
   * 两种拉回都不置「已产生回访结论」，再下送照常进「调研中」（M58）。其余子状态不在此处理，返回 `pulled: false`。
   */
  /** 催单 / 补充的站内通知（收件人一位，文案见 `FLASH_CS_NOTICE`） */
  function emitCsNotice(r: Ticket, kind: 'urge' | 'supplement', receiver: string) {
    const notice = FLASH_CS_NOTICE[kind];
    useNotifyLogStore().emit({
      ticketNo: r.no,
      event: kind === 'urge' ? FLASH_NOTIFY_EVENTS.urge : FLASH_NOTIFY_EVENTS.supplement,
      kind,
      title: notice.title,
      receivers: [receiver],
      content: notice.text(r.no),
    });
  }

  /**
   * 催单 / 补充落在**不由 `onCustomerUrge` 接管的子状态**（审核中四态、已委派）时补发站内通知。
   * 收件人＝当前工单的处理人，无处理人则发归属组（基线 ※19）；协办人不另发。
   * 状态与 SLA 一概不动 —— 这一档的拉回照基线走处理页那一侧。
   */
  function notifyCsEvent(ticketNo: string, kind: 'urge' | 'supplement') {
    const r = rowOf(ticketNo);
    if (!r?.flash) return;
    const handler = r.assignee;
    emitCsNotice(r, kind, handler ? `${handler}(处理人)` : FLASH_POOLS[r.flash.state.pool ?? 'l1'].label);
  }

  function onCustomerUrge(ticketNo: string, kind: 'urge' | 'supplement'): { pulled: boolean } {
    const r = rowOf(ticketNo);
    if (!r?.flash || (r.nodeStatus !== '调研中' && r.nodeStatus !== '自动刷机中')) return { pulled: false };
    const st = r.flash.state;
    const now = Date.now();
    const notify = (receiver: string) => emitCsNotice(r, kind, receiver);
    const handler = r.assignee;
    if (r.nodeStatus === '自动刷机中') {
      notify(handler ? `${handler}(处理人)` : FLASH_POOLS.l1.label);
      return { pulled: false };
    }
    if (handler) {
      Object.assign(r, {
        nodeStatus: '处理中', nodeStep: 3, tab: 'mine', responded: true,
        updatedAt: flashMinuteStamp(now),
      });
      // 催补拉回有处理人的单：「调研中」那段停钟结束，剩余接着跑（PRD §4.3）
      resumeClock(r, now);
      st.forwardedBy = undefined;
      log(ticketNo, now, {
        category: 'node', action: 'handle', who: '系统', role: '系统', how: '因客户催补，自动撤回本次下送',
        what: FLASH_TL.csPullbackForward('处理中'),
      });
      notify(`${handler}(处理人)`);
    } else {
      transferToPool(ticketNo, 'l1', '回访期间客户催补');
      notify(FLASH_POOLS.l1.label);
    }
    bump(ticketNo);
    persist();
    return { pulled: true };
  }

  /**
   * 人工侧转池（升级二线 / 回访未解决 / 回访期间客户催补等，由处理页动作接入）。
   * 不发转人工短信（M37 / M47：只有自动环节转人工发）；SLA：单上已有在走的钟续算，
   * 未起算的进教育刷机处理组池时起算、进一线刷机池不起算（M16 / M41，1013 A26）。
   */
  function transferToPool(ticketNo: string, pool: FlashPoolKey, reason: FlashHandoffReason): FlashActionResult {
    const r = rowOf(ticketNo);
    if (!r?.flash || isTicketClosed(r.nodeStatus) || r.nodeStatus === '自动刷机中') {
      return { ok: false, message: FLASH_TIP_REPUSH_STATE };
    }
    const now = Date.now();
    handoff(r, pool, reason, now);
    bump(ticketNo);
    persist();
    return { ok: true, message: `已转入${FLASH_POOLS[pool].label}` };
  }

  /**
   * 升级二线（1013 A18：一线处理结果选「升级二线」、下送时确认后执行，不填说明）：
   * 子状态回「未认领」、处理人清空、进教育刷机处理组池，转人工原因「一线升级」；处理结果清空交二线重选；
   * 履历记「升级二线」（带最近一条处理记录）；站内通知归属组；不发转人工短信。
   * 进池时间取本条履历（工作台 `poolEnteredAtOf`）；「SLA 起算时间」为空时写入升级时刻（1013 A26）。
   */
  function escalateToL2(ticketNo: string, by: FlashActor, record?: string): FlashActionResult {
    const r = rowOf(ticketNo);
    if (!r?.flash || !EDITABLE_STATUSES.includes(r.nodeStatus)) return { ok: false, message: FLASH_TIP_REPUSH_STATE };
    const now = Date.now();
    const st = r.flash.state;
    st.result = undefined;
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
    // 一线不计 SLA（1013 A26）：升级进教育刷机处理组池即起算，首响、解决两只钟都从此刻开始
    startSlaIfL2(r, now);
    syncSlaRow(r, now);
    log(ticketNo, now + 1, {
      category: 'node', action: 'escalate', who: by.name, role: by.role, how: '升级二线',
      what: FLASH_TL.escalateL2(record),
    });
    notifyGroup(r, 'l2', FLASH_NOTIFY_EVENTS.escalateL2, '升级二线进池', FLASH_NOTICE.escalatedToGroup(r.no));
    bump(ticketNo);
    persist();
    return { ok: true, message: FLASH_TOAST.escalatedL2 };
  }

  /**
   * 关联投诉（1013 A21 / B5）：新建的投诉单与本刷机单**弱关联**，两单各自流转 ——
   * 本单子状态、处理人、SLA 都不变，不落终态；新投诉单进工单库（随刷机缓存一起落），两单履历各记一条。
   * 门控（只在本单已结案 / 已关闭时置灰）由处理页判。
   */
  function linkComplaint(ticketNo: string, complaint: Ticket, by: FlashActor): FlashActionResult {
    const r = rowOf(ticketNo);
    if (!r?.flash) return { ok: false, message: FLASH_TIP_REPUSH_STATE };
    const now = Date.now();
    const st = r.flash.state;
    if (!TICKETS.some((t) => t.no === complaint.no)) {
      complaint.eventTimeline = [
        ...(complaint.eventTimeline ?? []),
        {
          id: `flash-link-${complaint.no}`, category: 'relate', action: 'relate',
          who: by.name, role: by.role, how: '关联投诉', when: flashStamp(now),
          what: FLASH_TL.linkedFromFlash(ticketNo),
        },
      ];
      TICKETS.push(complaint);
    }
    st.linkedComplaintNos = [...(st.linkedComplaintNos ?? []).filter((n) => n !== complaint.no), complaint.no];
    r.updatedAt = flashMinuteStamp(now);
    log(ticketNo, now, {
      category: 'relate', action: 'relate', who: by.name, role: by.role, how: '关联投诉',
      what: FLASH_TL.linkComplaint(complaint.no),
      relatedTicket: {
        no: complaint.no, title: complaint.title, type: '投诉', typeColor: '#EF4444',
        status: complaint.nodeStatus, statusColor: '#1A6FFF', builder: by.name, createdAt: flashMinuteStamp(now),
      },
    });
    bump(ticketNo);
    persist();
    return { ok: true, message: FLASH_TOAST.linkedComplaint(complaint.no) };
  }

  /** 与刷机单弱关联的投诉单：投诉单号 → 刷机单号 */
  function flashNoLinkedTo(complaintNo: string): string | undefined {
    return TICKETS.find((t) => isFlashTicket(t) && t.flash?.state.linkedComplaintNos?.includes(complaintNo))?.no;
  }

  /**
   * 处理表单保存（1013 A16）：处理结果按现值落库，**不暂停 SLA**。
   * - 改为「已线下登记」：处理记录追加「已线下登记，〈保存时刻〉」，履历记「线下登记」，单留在本人名下；
   * - 改为「已线下登记、已推送」：处理记录追加「产线已推送」；
   * - 待响应首次保存转「处理中」（PRD §7.1）。
   */
  function saveProcess(
    ticketNo: string,
    by: FlashActor,
    input: { result: FlashResult | '' },
  ): FlashActionResult & { appendRecord?: string } {
    const r = rowOf(ticketNo);
    if (!r?.flash) return { ok: false, message: FLASH_TIP_EDIT_STATE };
    const st = r.flash.state;
    const now = Date.now();
    const prev = normalizeFlashResult(st.result);
    let appendRecord: string | undefined;
    if (input.result && input.result !== prev) {
      if (input.result === FLASH_RESULT_OFFLINE) appendRecord = FLASH_TL.offlineRegister(flashMinuteStamp(now));
      else if (input.result === FLASH_RESULT_OFFLINE_PUSHED) appendRecord = FLASH_TL.offlinePushed;
      if (appendRecord) {
        log(ticketNo, now, {
          category: 'handle', action: 'handle', who: by.name, role: by.role, how: '线下登记', what: appendRecord,
        });
      }
    }
    st.result = input.result || undefined;
    if (r.nodeStatus === '待响应') Object.assign(r, { nodeStatus: '处理中', responded: true });
    r.updatedAt = flashMinuteStamp(now);
    bump(ticketNo);
    persist();
    return { ok: true, message: '', appendRecord };
  }

  /**
   * 处理人在「待响应」外呼、发短信或发邮件（PRD §6 / §7.1 / M102）：转「处理中」，处理人不变。其余子状态不动。
   */
  function markRespondedByContact(ticketNo: string): boolean {
    const r = rowOf(ticketNo);
    if (!r?.flash || r.nodeStatus !== '待响应') return false;
    Object.assign(r, { nodeStatus: '处理中', responded: true, updatedAt: flashMinuteStamp(Date.now()) });
    bump(ticketNo);
    persist();
    return true;
  }

  /**
   * 通用动作侧的 SLA 记账入口（PRD §4.3）。处理页那几条沿用现有实现的动作
   * （提交审核冻结 / 驳回续走 / 解除挂起 / 结案关闭强结取消）改的是页面上的钟对象；
   * 刷机单的钟在账本里，由这三个入口落回账本，页头与列表随之一起变。
   *
   * 🔴 通知处理页重读（`bump`）**推迟到本轮动作结束之后**：这三个入口是在通用动作执行到一半时调的
   * （子状态已改、尚未经 `syncStatus` 落回工单库），此时立刻 bump，处理页会按工单库里的旧子状态把
   * 刚改的子状态覆写回去（技术支持「退回」后仍停在「已升级技术支持」即由此而来）。
   */
  function bumpAfterAction(ticketNo: string) {
    queueMicrotask(() => bump(ticketNo));
  }

  function holdSla(ticketNo: string, reason: string): void {
    const r = rowOf(ticketNo);
    if (!r?.flash) return;
    pauseClock(r, Date.now(), reason);
    bumpAfterAction(ticketNo);
    persist();
  }

  function resumeSla(ticketNo: string): void {
    const r = rowOf(ticketNo);
    if (!r?.flash) return;
    resumeClock(r, Date.now());
    bumpAfterAction(ticketNo);
    persist();
  }

  function stopSla(ticketNo: string, voidStop = false): void {
    const r = rowOf(ticketNo);
    if (!r?.flash) return;
    stopClock(r, Date.now(), voidStop);
    bumpAfterAction(ticketNo);
    persist();
  }

  /**
   * 下送（PRD §5.5「下送确认」/ §8 / M26 / M58）：
   * - 本单已产生过回访结论 → 跳过回访直接「已结案」，不发调研短信，履历「下送（已回访过，直接结案）」；
   * - 否则 → 进「调研中」，处理人为下送人，记下送发起人（X30），发调研短信（写通知记录）。
   */
  function forward(ticketNo: string, by: FlashActor, result: FlashResult): FlashActionResult {
    const r = rowOf(ticketNo);
    if (!r?.flash || isTicketClosed(r.nodeStatus)) return { ok: false, message: FLASH_TIP_REPUSH_STATE };
    const st = r.flash.state;
    const now = Date.now();
    st.result = result;
    if (st.surveyConcluded) {
      stopClock(r, now);
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
    st.forwardedBy = by.name;
    // 「调研中」不计时（PRD §4.3）：停钟，撤回 / 催补拉回时剩余自此接续
    pauseClock(r, now, '调研中');
    Object.assign(r, {
      nodeStatus: '调研中', nodeStep: 4, tab: 'mine', assignee: by.name,
      slaText: '—', slaSub: '调研中', slaState: 'ok', slaMinutes: 9999,
      updatedAt: flashMinuteStamp(now),
    });
    log(ticketNo, now + 1, {
      category: 'node', action: 'resolved', who: by.name, role: by.role, how: '下送', what: FLASH_TL.forward(result),
    });
    sendSurveySms(r, now + 2);
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
      updatedAt: flashMinuteStamp(now),
    });
    // 撤回下送：结掉「调研中」那段停钟，剩余回到下送前（PRD §4.3 / R55）
    resumeClock(r, now);
    st.forwardedBy = undefined;
    log(ticketNo, now, {
      category: 'node', action: 'transfer', who: by.name, role: by.role, how: '撤回', what: FLASH_TL.withdrawForward,
    });
    bump(ticketNo);
    persist();
    return { ok: true, message: '已撤回上一操作' };
  }

  /**
   * 转售后（二线，PRD §7.3）：子状态「已转出」、客服侧冻结、SLA 停钟。
   * 履历与关联售后单号由处理页的转售后弹窗给出（`what` 为弹窗组好的正文）。
   */
  function transferAftersale(ticketNo: string, by: FlashActor, asNo: string, what: string): FlashActionResult {
    const r = rowOf(ticketNo);
    if (!r?.flash || !EDITABLE_STATUSES.includes(r.nodeStatus)) return { ok: false, message: FLASH_TIP_REPUSH_STATE };
    const now = Date.now();
    // 已转出：客服侧冻结，SLA 停钟；售后唤起回原处理人时剩余接续（PRD §7.3）
    pauseClock(r, now, '已转出');
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
      updatedAt: flashMinuteStamp(now),
    });
    resumeClock(r, now);
    delete (r as Partial<Ticket>).linkedAftersaleNo;
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

  /**
   * 查询中心调剂 / 指派的候选人（1014）：只列本单当前所在组的成员——
   * 一线刷机池＝持有容联云刷机角色的一线坐席，教育刷机处理组＝该组组员。不出别组的人。
   */
  function groupCandidates(ticketNo: string): string[] {
    const r = rowOf(ticketNo);
    if (!r?.flash) return [];
    const pool: FlashPoolKey = r.flash.state.pool ?? 'l1';
    return [...(GROUP_MEMBERS[FLASH_POOLS[pool].groupName]?.members ?? [])];
  }

  /**
   * 查询中心「指派」（工单运营，§4.2）：教育刷机处理组池未认领且无处理人才可指派，对象限本组成员；
   * 落点同领取（子状态「待响应」、处理人＝被指派人、进「我的任务」），写履历「指派」。不改 SLA、不动归属池。
   */
  function assignFromPool(ticketNo: string, target: string, by: FlashActor): FlashActionResult {
    const r = rowOf(ticketNo);
    if (!r?.flash) return { ok: false, message: FLASH_TIP_REPUSH_STATE };
    if (r.assignee) return { ok: false, message: `该工单已被 ${r.assignee} 领取` };
    if (r.nodeStatus !== '未认领' || r.flash.state.pool !== 'l2') return { ok: false, message: '当前工单状态不可指派' };
    if (!groupCandidates(ticketNo).includes(target)) return { ok: false, message: '只能指派给本组成员' };
    const now = Date.now();
    Object.assign(r, {
      nodeStatus: '待响应',
      assignee: target,
      tab: 'mine',
      responded: false,
      updatedAt: flashMinuteStamp(now),
    });
    log(ticketNo, now, {
      category: 'node', action: 'accept', who: by.name, role: by.role, how: '指派',
      what: `指派给 ${target}。`,
    });
    bump(ticketNo);
    persist();
    return { ok: true, message: `已将 ${ticketNo} 指派给 ${target}` };
  }

  /**
   * 查询中心「调剂」（工单运营，§4.2；1014）：对象限本单当前所在组的成员（`groupCandidates`），不跨组。
   * 调剂后进对方名下：未认领 / 待响应 / 处理中的单子状态为「处理中」；其余子状态（调研中、已挂起等）不变。
   * 归属组不变、不改 SLA。自动刷机中不可调剂。
   */
  function transferOwner(
    ticketNo: string,
    by: FlashActor,
    p: { target: string; reason: string },
  ): FlashActionResult {
    const r = rowOf(ticketNo);
    if (!r?.flash) return { ok: false, message: FLASH_TIP_REPUSH_STATE };
    if (r.nodeStatus === '自动刷机中') return { ok: false, message: FLASH_TIP_AUTO_FLASHING };
    if (!groupCandidates(ticketNo).includes(p.target)) return { ok: false, message: '只能调剂给本组成员' };
    const now = Date.now();
    const reason = p.reason || '—';
    const toHandling = r.nodeStatus === '未认领' || r.nodeStatus === '待响应' || r.nodeStatus === '处理中';
    Object.assign(r, {
      assignee: p.target,
      tab: 'mine',
      ...(toHandling ? { nodeStatus: '处理中' } : {}),
      updatedAt: flashMinuteStamp(now),
    });
    log(ticketNo, now, {
      category: 'node', action: 'transfer', who: by.name, role: by.role, how: '调剂',
      what: `调剂至 ${p.target}（处理人变更）。原因：${reason}`,
    });
    bump(ticketNo);
    persist();
    return { ok: true, message: `已将 ${ticketNo} 调剂至 ${p.target}` };
  }

  /** 对账：到点的推送出回传结果。返回本次结算的单数 */
  function settleDue(now: number = Date.now()): number {
    let settled = 0;
    for (const t of TICKETS) {
      // PRD §8 / M26′：调研超时未评价 → 自动结案（时刻取调研短信发出时刻 + 调研超时时长）
      if (isFlashTicket(t) && t.flash && t.nodeStatus === '调研中' && !t.flash.state.survey) {
        const sentAt = t.flash.state.surveySentAt ?? t.updatedAt;
        const due = sentAt ? parseFlashStamp(sentAt).getTime() + FLASH_SURVEY_TIMEOUT_HOURS * 3_600_000 : NaN;
        if (due <= now) {
          closeSurveyTimeout(reactive(t), due);
          settled += 1;
        }
        continue;
      }
      if (!isFlashTicket(t) || !t.flash || t.nodeStatus !== '自动刷机中') continue;
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

  /**
   * 缓存迁移（读缓存的唯一入口，`hydrate` 与 `syncFromOtherTab` 共用）：存量处理结果旧取值「已线下登记推送」
   * 归到现行取值「已线下登记」。旧值只在这里出现，别处一律按现行取值读写。
   */
  function migrateCachedTicket(saved: Ticket): Ticket {
    const st = saved.flash?.state as { result?: string } | undefined;
    if (st?.result === '已线下登记推送') st.result = FLASH_RESULT_OFFLINE;
    return saved;
  }

  function hydrate() {
    const cachedTickets = readFlashCache<TicketsCache>(FLASH_LS_KEYS.tickets);
    const cachedTl = readFlashCache<TimelineCache>(FLASH_LS_KEYS.timeline);
    if (cachedTickets && cachedTl && Array.isArray(cachedTickets.tickets)) {
      for (const saved of cachedTickets.tickets.map(migrateCachedTicket)) {
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
    backfillSlaStartedAt();
  }

  /**
   * 「SLA 起算时间」补齐（PRD §4.3 / M88，1013 A26）：种子单进池发生在页面打开之前，按履历里最早一条
   * **进入教育刷机处理组池**的事件（转人工 → 教育刷机处理组池 / 升级二线）的时刻写入；
   * 只进过一线刷机池、从未进过人工池的单保持为空。
   */
  function backfillSlaStartedAt() {
    const toL2 = `→ ${FLASH_POOLS.l2.label}`;
    for (const t of TICKETS) {
      if (!isFlashTicket(t) || !t.flash || t.flash.state.slaStartedAt || t.flash.state.pool !== 'l2') continue;
      const first = timelineOf(t.no).find(
        (e) => (e.action === 'flashHandoff' && e.what.endsWith(toL2)) || (e.action === 'escalate' && e.how === '升级二线'),
      );
      if (first) t.flash.state.slaStartedAt = first.when.slice(0, 16);
    }
  }

  /**
   * 种子单的调研短信补进通知记录（M86）：种子单进「调研中」发生在页面打开之前，通知记录（运行时 store）里没有这条；
   * 本单已有调研短信记录的不补。时刻取种子的调研短信发出时刻。
   */
  function backfillSurveySms() {
    const notifyLog = useNotifyLogStore();
    for (const t of TICKETS) {
      const sentAt = isFlashTicket(t) ? t.flash?.state.surveySentAt : undefined;
      if (!sentAt) continue;
      if (notifyLog.records.some((x) => x.ticketNo === t.no && x.event === FLASH_NOTIFY_EVENTS.survey)) continue;
      const rec = notifyLog.emit({
        ticketNo: t.no,
        event: FLASH_NOTIFY_EVENTS.survey,
        kind: 'accepted',
        title: '调研短信',
        receivers: [`${t.customer}(客户)`],
        content: flashSmsSurvey(t.no),
        channel: '短信',
        status: '已发送',
      });
      if (rec) rec.when = sentAt;
    }
  }

  /**
   * 种子单的转人工短信 / 刷机成功短信补进通知记录：这两条短信在种子里发生于页面打开之前，
   * 履历沟通类有、运行时通知记录（`stores/notifyLog.ts`）里没有，「通知记录」Tab 因此是空的。
   * 逐单按履历里那条短信的文案对上号，时刻取履历时刻；本单已有同事件记录的不补。
   */
  function backfillSeedSms() {
    const notifyLog = useNotifyLogStore();
    for (const t of TICKETS) {
      if (!isFlashTicket(t) || !t.flash) continue;
      const smsEntries = timelineOf(t.no).filter((e) => e.category === 'comm' && e.action === 'sms');
      if (!smsEntries.length) continue;
      const kinds = [
        { event: FLASH_NOTIFY_EVENTS.handoff, title: '转人工短信', content: flashSmsHandoff(t.no) },
        { event: FLASH_NOTIFY_EVENTS.success, title: '刷机成功短信', content: flashSmsSuccess(t.no, t.flash.info.sn) },
      ];
      for (const k of kinds) {
        if (notifyLog.records.some((x) => x.ticketNo === t.no && x.event === k.event)) continue;
        const entry = smsEntries.find((e) => e.what.endsWith(k.content));
        if (!entry) continue;
        const rec = notifyLog.emit({
          ticketNo: t.no,
          event: k.event,
          kind: 'accepted',
          title: k.title,
          receivers: [`${t.customer}(客户)`],
          content: k.content,
          channel: '短信',
          status: '已发送',
        });
        if (rec) rec.when = entry.when;
      }
    }
  }

  /**
   * 其他页签写了刷机缓存（如用户在评价页提交、处理页在另一页签办理）→ 本页签按缓存重读，
   * 避免本页签之后落库时用旧快照把对方的改动覆盖掉。`timeline` 键在 `persist` 里后写，以它为准。
   */
  function syncFromOtherTab() {
    const cachedTickets = readFlashCache<TicketsCache>(FLASH_LS_KEYS.tickets);
    const cachedTl = readFlashCache<TimelineCache>(FLASH_LS_KEYS.timeline);
    if (!cachedTickets || !cachedTl || !Array.isArray(cachedTickets.tickets)) return;
    for (const saved of cachedTickets.tickets.map(migrateCachedTicket)) {
      const existing = rawOf(saved.no);
      if (existing) {
        const r = reactive(existing) as unknown as Record<string, unknown>;
        Object.keys(existing).forEach((k) => { if (!(k in saved)) delete r[k]; });
        Object.assign(r, saved);
      } else {
        TICKETS.push(saved);
      }
      bump(saved.no);
    }
    timelines.value = cachedTl.timelines ?? {};
    tlSeq = typeof cachedTl.seq === 'number' ? Math.max(tlSeq, cachedTl.seq) : tlSeq;
  }

  hydrate();
  settleDue();
  persist();
  backfillSurveySms();
  backfillSeedSms();
  if (typeof window !== 'undefined') {
    window.setInterval(() => settleDue(), 1000);
    window.addEventListener('storage', (e) => {
      if (e.key === FLASH_LS_KEYS.timeline && e.newValue) syncFromOtherTab();
    });
  }

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
    surveyGateOf,
    onCustomerUrge,
    notifyCsEvent,
    transferToPool,
    recordLateSuccess,
    settleDue,
    // 处理页（M4b-2）
    liveNotices,
    escalateToL2,
    linkComplaint,
    flashNoLinkedTo,
    saveProcess,
    holdSla,
    resumeSla,
    stopSla,
    markRespondedByContact,
    forward,
    withdrawForward,
    transferAftersale,
    returnFromAftersale,
    syncStatus,
    // 工作台（M3）
    creatorNameOf,
    poolEnteredAtOf,
    claimFromPool,
    assignFromPool,
    transferOwner,
    groupCandidates,
  };
});
