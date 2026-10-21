import { defineStore } from 'pinia';
import { reactive, ref, toRaw } from 'vue';
import type { Channel, Priority, Ticket } from '@/views/tickets/types/ticket';
import { POOL_GROUPS, isTicketClosed } from '@/views/tickets/types/ticket';
import type { TimelineEntry, TimelineFieldChange } from '@/views/tickets/types/ticketDetail';
import { TICKETS } from '@/mock/tickets';
import { FLASH_SEEDS } from '@/mock/flash/seedTickets';
import { findMdmDevice, isMdmApiAvailable, isMdmGraduate, mdmStudentOf } from '@/mock/flash/mdmDevices';
import { isSelfDevModel, selfDevModelOf } from '@/mock/flash/models';
import { findSchoolById } from '@/mock/schools';
import { makeTicketNo } from '@/constants/ticketNo';
import {
  FLASH_FIELD_LABELS, FLASH_INFO_FIELD_LABELS, FLASH_NOTIFY_EVENTS, FLASH_POOLS, FLASH_STUDENT_TYPE_AUTO, FLASH_STUDENT_TYPES,
  FLASH_RETURN_DELAY_MS, FLASH_AFTERSALE_RETURN_DELAY_MS, FLASH_TIP_PRODUCT_UNSUPPORTED,
  FLASH_RESULT_ONLINE_SUCCESS, FLASH_RESULT_OFFLINE_PUSHED, FLASH_RESULT_ESCALATE_L2, normalizeFlashResult,
  FLASH_TIP_NOT_GRADUATE_L1, FLASH_TIP_NOT_GRADUATE_L2, FLASH_TIP_REPUSH_NOT_GRADUATE, FLASH_TIP_REPUSH_SN_MISMATCH,
  FLASH_TIP_AUTO_FLASHING, FLASH_TIP_EDIT_STATE, FLASH_TIP_REPUSH_STATE, FLASH_TIP_SYSTEM_BUSY, FLASH_TIP_VERIFY_UNAVAILABLE,
  FLASH_TL, FLASH_NOTICE, FLASH_RESULT_OFFLINE, FLASH_TOAST,
  FLASH_CS_NOTICE, FLASH_SURVEY_TIMEOUT_HOURS, FLASH_PRODUCT_CATEGORY, FLASH_TAG_L1, FLASH_TAG_L2,
  FLASH_TAG_L3_USER_REPORT, FLASH_TICKET_TYPE, FLASH_USER_REPORT_LABELS,
  flashTicketTitle, withFlashTitlePrefix, isFlashTicket, flashMinuteStamp, flashProgressStage, flashSmsHandoff, flashSmsSuccess, flashSmsSurvey, flashStamp,
  flashTipInflight, flashTipRequired, isFrontlineActor,
  parseFlashStamp,
  type FlashActor, type FlashCreator, type FlashFailL2, type FlashHandoffReason,
  type FlashInfo, type FlashPoolKey, type FlashProgressStage, type FlashPushTrigger, type FlashStudentType,
  type FlashResult, type FlashRun, type FlashState, type TicketFlash,
} from '@/views/tickets/types/flash';
import { formatSlaClock, isFlashSlaCounted, readFlashSla, slaStateOf } from '@/views/tickets/utils/slaClock';
import { LOGIN_URL, templateOf } from '@/mock/notifyRules';
import { useNotifyLogStore } from './notifyLog';
import { useFlashConfigStore } from './flashConfig';
import { FLASH_LS_KEYS, readFlashCache, writeFlashCache } from './flashCache';
import { routeAftersaleEvent, type AftersaleEvent } from '@/views/tickets/composables/aftersaleEvents';
import { techEscalationRowPatch, techReturnRowPatch } from '@/views/tickets/composables/techEscalation';

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
  /** 学生类型（转校生按特殊情况进一线刷机池）；未选为空串 */
  studentType: FlashStudentType | '';
  studentAccount: string;
  studentName: string;
  /** 学校库 ID（M42） */
  schoolId: string;
  /** 学校名称；缺省按学校库 ID 取 */
  schoolName?: string;
  /** 刷机原因（自由文本） */
  reason: string;
  /** 设备SN照片：用户提报必传、坐席代建选传（M4） */
  snPhotos?: string[];
  /** MDM信息图片：坐席选传，小程序不传 */
  mdmPhotos?: string[];
  /** 产品信息图片：用户提报必传 1 张 */
  productPhotos?: string[];
  /** 学习证明附件：用户提报学生类型为转校生时必传 1 张 */
  studyProofPhotos?: string[];
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
  /** 坐席填写的问题描述（坐席代建必填）；用户提报缺省由系统按刷机信息生成 */
  problemDesc?: string;
  /** 坐席建单时随问题描述上传的附件 */
  problemDescAttachments?: string[];
  /** 客户档案（坐席建单取客户信息区；处理页客户信息卡照现有工单展示，与学校地区无关，PRD §2.4 / §5.1） */
  customerGender?: string;
  customerRegion?: string;
  customerAddress?: string;
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
  /** 产品在自研机型表中（PRD 附录 A.4） */
  selfDeveloped: boolean;
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
export type FlashInfoChanges = Partial<FlashInfo>;

/* ------------------------------------------------------------------ */
/* 内部常量                                                             */
/* ------------------------------------------------------------------ */

const SYSTEM: FlashActor = { name: '系统', role: '系统' };
/** 可重推的子状态：单在处理人手上 */
const REPUSHABLE_STATUSES = ['处理中', '待响应', '已退回'];
/** 可修改刷机信息的子状态（M52） */
const EDITABLE_STATUSES = ['待响应', '处理中'];

/** 重推校验结论：通过 / MDM 接口不可用 / 不通过（提示文案） */
type VerifyResult = { ok: true } | { ok: false; message: string };

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
    // 账本只在「调研中」挂段（解决时效到此结束，撤回 / 催补 / 回访未解决进池时接着计时）：摘要同调研中「—」
    if (read.status === 'paused') {
      Object.assign(r, {
        slaText: '—', slaSub: pauseReason ?? '调研中', slaState: 'ok', slaMinutes: 9999,
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

  /**
   * 「调研中」挂段：记下本段起点。未起算、已停表、已在本段中都不重复记。
   * 刷机单 SLA 与人无关、不停表（1021 / 730 SLA 口径）：只有「调研中」用它，重推自动刷机中、已转出、已挂起、审核中一律照常计时。
   */
  function pauseClock(r: Ticket, at: number, reason: string) {
    const st = r.flash!.state;
    if (!st.slaStartedAt || st.slaStoppedAt || st.slaPausedSince) return;
    st.slaPausedSince = flashStamp(at);
    syncSlaRow(r, at, reason);
  }

  /** 结束「调研中」挂段：把本段并入累计毫秒，剩余自下送前接着计时（不重置）。 */
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
    if (r.firstRespBreached) r.firstRespBreached = false;
  }

  /**
   * 首次响应（待响应 → 处理中：保存、外呼 / 短信 / 邮件，PRD §4.3 / §7.1）：首响钟已超时才响应的，
   * 写下「首响超时」结论（F9），此后列表与页头一律「首响 未达标」，保存不重置。未起算的单不判。
   */
  function markFirstResponse(r: Ticket, at: number) {
    if (r.responded) return;
    const read = isFlashSlaCounted(r.flash!.state) ? readFlashSla(r.flash!.state, at) : null;
    if (read && read.firstRemainMs < 0) r.firstRespBreached = true;
    r.responded = true;
  }

  function toHandler(r: Ticket, run: FlashRun, at: number) {
    Object.assign(r, {
      nodeStatus: '处理中',
      assignee: run.handlerAtPush ?? r.assignee,
      tab: 'mine',
      updatedAt: flashMinuteStamp(at),
    });
    // 回传回到人工侧：「自动刷机中」期间照常计时（PRD §4.3），这里不动账本
  }

  /**
   * 转入人工池。`sms` 只对自动环节首次转人工为 true（M14 / M37：每单一条，已发过不再发）。
   * SLA（1013 A26）：进一线刷机池不起算；首次进教育刷机处理组池起算，此后再次进池接着跑（调研中挂段先结掉），
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
      // 推送入参「设备型号」＝自研机型表的 OTA 型号（PRD 附录 A.4）
      otaModel: selfDevModelOf(f.info.productModel)?.otaModel,
    };
    f.runs.push(run);
    st.pushCount += 1;
    st.outcome = '等待回传';
    st.failL1 = undefined;
    st.failL2 = undefined;
    Object.assign(r, { nodeStatus: '自动刷机中', updatedAt: flashMinuteStamp(at) });
    // 已起算的单：重推「自动刷机中」照常计时（PRD §4.3，1021）；未起算的单不计时
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
      // 按去向收口或进「调研中」挂段（「自动刷机中」期间照常计时）
      st.result = result;
      st.forwardedBy = undefined;
      log(r.no, at, {
        category: 'node', action: 'flashSuccess', who: '系统', role: '系统', how: '回传结果',
        what: FLASH_TL.returnSuccess,
      });
      sms(r, at + 1000, 'success');
      // 履历按实际先后（F15）：回传成功 → 成功短信 → 进回访 / 结案 → 调研短信，各占一秒，倒序时不交错
      if (st.surveyConcluded) {
        stopClock(r, at);
        Object.assign(r, {
          nodeStatus: '已结案', nodeStep: 5, tab: 'mine', assignee: handler,
          slaText: '—', slaSub: '已结案', slaState: 'ok', slaMinutes: 9999,
          updatedAt: flashMinuteStamp(at),
        });
        log(r.no, at + 2000, {
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
        log(r.no, at + 2000, {
          category: 'node', action: 'resolved', who: '系统', role: '系统', how: '回传结果',
          what: FLASH_TL.repushSuccessSurvey,
        });
        sendSurveySms(r, at + 3000);
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

  /**
   * 重推校验（PRD §5.6 第 6–8 条）：调 MDM 按学生账号取 SN 集合、已毕业标记与年级代码。
   * MDM 接口不可用 → 第 6 条；SN 不在集合中（含查无记录）→ 第 7 条；毕业生不通过 → 第 8 条。两项都不通过只报第 7 条。
   * 毕业生按校验当天日期判定（09、12 年级的 6 月 1 日至 8 月 13 日窗口）。
   */
  function verify(info: Pick<FlashInfo, 'sn' | 'studentAccount'>): VerifyResult {
    if (!isMdmApiAvailable(info.sn, info.studentAccount)) return { ok: false, message: FLASH_TIP_VERIFY_UNAVAILABLE };
    const rec = mdmStudentOf(info.studentAccount);
    if (!rec.sns.includes(info.sn.trim().toUpperCase())) return { ok: false, message: FLASH_TIP_REPUSH_SN_MISMATCH };
    if (!isMdmGraduate(rec, new Date(Date.now()))) return { ok: false, message: FLASH_TIP_REPUSH_NOT_GRADUATE };
    return { ok: true };
  }

  /* ---------------- 对外动作 ---------------- */

  /**
   * 建单判定（PRD §2.3，按序命中即止）：
   * ① 必填；② 坐席代建：产品未挂刷机类问题分类（10-19 C1） → 拦截 A1，用户提报不判产品；③ 同 SN 在途 → 拦截 A2（在途查询不可用 → 拦截「系统繁忙」）；
   * ④ 转校生 → 一线刷机池（特殊情况）；⑤ 毕业生 ∧ 产品不在自研机型表 → 一线刷机池（非自研机型）；⑥ 毕业生 ∧ 在表 → 自动刷机中。
   * 建单不校验 SN 与毕业生身份。
   */
  function evaluateCreate(input: FlashCreateInput, creator: FlashCreator): FlashCreateEvaluation {
    const missing = missingRequired(input, creator);
    if (missing.length) return { kind: 'blocked', code: 'required', message: flashTipRequired(missing), missing };
    if (creator !== '用户提报' && !config.isSupportedModel(input.productModel)) {
      return { kind: 'blocked', code: 'A1', message: FLASH_TIP_PRODUCT_UNSUPPORTED };
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
    const selfDeveloped = isSelfDevModel(input.productModel);
    const pool = (reason: FlashHandoffReason): FlashEvaluationCreate => ({
      kind: 'create', route: 'pool', initialStatus: '未认领', pool: 'l1', handoffReason: reason, selfDeveloped,
    });

    if (input.studentType !== FLASH_STUDENT_TYPE_AUTO) return pool('特殊情况');
    if (!selfDeveloped) return pool('非自研机型');
    return { kind: 'create', route: 'auto', initialStatus: '自动刷机中', selfDeveloped };
  }

  /**
   * 必填缺项（M4 / M46）。用户提报按小程序接口字段（2026-10-21）：设备SN照片、产品信息图片必传，
   * 学生类型为转校生时学习证明附件必传；字段名取提报页叫法（设备信息 / 恢复原生系统原因 / 产品信息）。
   * 学校名称：有学校库 ID 或有学校名称原文即算已填 —— 小程序单学校只有文本、无省市区，不因缺学校库条目被拦；
   * 坐席建单不传原文，仍须从学校库选定。
   */
  function missingRequired(input: FlashCreateInput, creator: FlashCreator): string[] {
    const L = FLASH_FIELD_LABELS;
    const U = FLASH_USER_REPORT_LABELS;
    const byUser = creator === '用户提报';
    const checks: [boolean, string][] = [
      [!input.productModel?.trim(), byUser ? U.productModel : L.productName],
      [!input.sn?.trim(), L.sn],
      [!(FLASH_STUDENT_TYPES as readonly string[]).includes(input.studentType ?? ''), L.studentType],
      [!input.studentName?.trim(), L.studentName],
      [!input.studentAccount?.trim(), L.studentAccount],
      [!input.schoolId?.trim() && !input.schoolName?.trim(), L.schoolName],
      [!input.reason?.trim(), byUser ? U.reason : L.reason],
      [!input.contactPhone?.trim(), L.contactPhone],
      [byUser && input.studentType === '转校生' && !(input.studyProofPhotos ?? []).length, L.studyProofPhotos],
      [byUser && !(input.productPhotos ?? []).length, U.productPhotos],
      [byUser && !(input.snPhotos ?? []).length, L.snPhotos],
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
      studentType: input.studentType as FlashStudentType,
      studentAccount: input.studentAccount.trim(),
      studentName: input.studentName.trim(),
      schoolId: input.schoolId,
      schoolName: input.schoolName ?? findSchoolById(input.schoolId)?.name ?? '',
      reason: input.reason.trim(),
      snPhotos: [...(input.snPhotos ?? [])],
      mdmPhotos: [...(input.mdmPhotos ?? [])],
      ...(input.productPhotos?.length ? { productPhotos: [...input.productPhotos] } : {}),
      // 学习证明附件只随转校生落单（提报页随学生类型显隐）
      ...(input.studentType === '转校生' && input.studyProofPhotos?.length
        ? { studyProofPhotos: [...input.studyProofPhotos] }
        : {}),
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
      ...(base.customerGender?.trim() ? { customerGender: base.customerGender.trim() } : {}),
      ...(base.customerRegion?.trim() ? { customerRegion: base.customerRegion.trim() } : {}),
      ...(base.customerAddress?.trim() ? { customerAddress: base.customerAddress.trim() } : {}),
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
      problemDesc: base.problemDesc?.trim()
        || `${info.studentType}${info.studentName}（账号 ${info.studentAccount}，${info.schoolName}）申请刷机，刷机原因：${info.reason}。设备 SN ${info.sn}。`,
      ...(base.problemDescAttachments?.length ? { problemDescAttachments: [...base.problemDescAttachments] } : {}),
      flash: {
        info,
        state: {
          outcome: '未推送', pushCount: 0, surveyConcluded: false, creator,
          slaPausedAccumMs: 0,
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
        evaluation.route === 'pool' ? { handoff: evaluation.handoffReason! } : { auto: true },
      ),
    });
    // PRD §2.5 / §11.1：坐席代建建单成功发受理短信，用户提报不发
    if (!byUser) acceptedSms(r, now + 200);
    if (evaluation.route === 'pool') {
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
   * 修改刷机信息并重新推送（1013 A12 / B1：修改刷机信息弹窗「重新推送」是唯一的推送入口；M36 / M44）。
   * 先同步判定，任一不通过即返回提示，**不推送、不改状态**：
   * 状态可重推 → 产品挂刷机类问题分类 → 学生类型为毕业生 → 改后 SN 无其他在途单 → 重推校验（MDM）通过。一线、二线都不限次（A14）。
   * 是否走重推（产品在自研机型表）由弹窗按所选产品决定（PRD §5.6），不在本函数判。
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

    // PRD §5.6 提交判定顺序（第 1 条必填由弹窗在字段下方判）：产品已不挂刷机类问题分类 → 学生类型不是毕业生 →
    // 在途查询不可用 → 设备SN在途 → MDM 接口不可用 → SN 不通过 → 毕业生不通过；命中即止
    if (!config.isSupportedModel(next.productModel)) return { ok: false, message: FLASH_TIP_PRODUCT_UNSUPPORTED };
    if (next.studentType !== FLASH_STUDENT_TYPE_AUTO) {
      return { ok: false, message: l1 ? FLASH_TIP_NOT_GRADUATE_L1 : FLASH_TIP_NOT_GRADUATE_L2 };
    }
    let inflight: Ticket | undefined;
    try {
      inflight = findInflightBySn(next.sn, ticketNo);
    } catch {
      return { ok: false, message: FLASH_TIP_SYSTEM_BUSY };
    }
    if (inflight) return { ok: false, message: flashTipInflight(inflight.no), inflightNo: inflight.no };
    // 命中拦截：不推送、不计次、子状态不变，改动不落库、不写处理履历（PRD §5.6 / §10.2）
    const v = verify(next);
    if (!v.ok) return { ok: false, message: v.message };

    // M53：到这里推送一定会发出，才落库与写履历
    const diff = diffInfo(prev, next);
    const now = Date.now();
    r.flash.info = next;
    Object.assign(r, { sn: next.sn, product: next.productModel });
    // PRD §11.2：同一次重推依次落「修改刷机信息」（有改动时）、「重新推送」
    if (diff.length) {
      log(ticketNo, now, {
        category: 'handle', action: 'handle', who: by.name, role: by.role, how: '修改刷机信息',
        what: FLASH_TL.editInfo, changes: diff,
      });
    }
    pushInternal(r, by, l1 ? '一线重推' : '二线重推', now + 1000);
    // M69：推送接口同步报错、自动重试 1 次仍失败 → 算作已发出（已落库、已计次），按重推失败去向处理
    if (findMdmDevice(next.sn)?.pushApi === '持续报错') {
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
   * 落库 + 写履历「修改刷机信息」（字段前后值）。**不跑重推校验、不推送、不计次**。
   * 待响应、处理中可用，适用全部机型。
   */
  function saveFlashInfo(ticketNo: string, by: FlashActor, changes: FlashInfoChanges): FlashActionResult {
    const r = rowOf(ticketNo);
    if (!r?.flash || !EDITABLE_STATUSES.includes(r.nodeStatus)) return { ok: false, message: FLASH_TIP_EDIT_STATE };
    const prev = r.flash.info;
    const next = mergeInfo(prev, changes);
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
   * 一线是否介入过（10-19 C2「一线一轮」，用户 10-19 定）：只看一线领取过本单（「一线领取过的单」口径）；
   * 未经一线领取直进教育刷机处理组池的单不算介入过，后续异常回一线刷机池。
   */
  function manuallyInvolved(r: Ticket): boolean {
    return timelineOf(r.no).some((e) => e.action === 'accept' && e.role === '一线坐席');
  }

  /**
   * 记回访结论（PRD §8「回访结论去向」/ M58 / M86）：只在「调研中」且未评价过时可记，置位「已产生回访结论」。
   * - 已解决 → 「已结案」，处理人不变，SLA 结束；履历「回访：已解决」+「结案」。
   * - 未解决（10-19 C2 / C3）→ 一线未领取过回一线刷机池，一线领取过进教育刷机处理组池；「未认领」、处理人清空，
   *   转人工原因「回访未解决」；SLA：进一线刷机池不起算，进教育刷机处理组池按 handoff 规则；不发转人工短信（M47）。
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
    }
    // 一线一轮（10-19 C2 / C3）：一线未领取过 → 回一线刷机池（不计 SLA）；一线领取过 → 教育刷机处理组池
    // （已起算的单接着跑，「调研中」那段在 handoff 里结掉；未起算的单从进教育刷机处理组池时刻起算）
    const pool: FlashPoolKey = manuallyInvolved(r) ? 'l2' : 'l1';
    if (!solved) handoff(r, pool, '回访未解决', now + 1);
    bump(ticketNo);
    persist();
    return { ok: true, message: solved ? '已结案' : `回访未解决，已转入${FLASH_POOLS[pool].label}` };
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
   * - 调研中 ∧ 无处理人（10-19 C2 一线一轮）：人工未介入过进一线刷机池「未认领」，一线不计 SLA（1013 A26）；介入过进教育刷机处理组池「未认领」，SLA 按进池规则；
   *   转人工原因「回访期间客户催补」，通知所进池的归属组；不发转人工短信；
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
      // 催补拉回有处理人的单：「调研中」那段结束，剩余接着跑（PRD §4.3）
      resumeClock(r, now);
      st.forwardedBy = undefined;
      log(ticketNo, now, {
        category: 'node', action: 'handle', who: '系统', role: '系统', how: '因客户催补，自动撤回本次下送',
        what: FLASH_TL.csPullbackForward('处理中', isFlashSlaCounted(st)),
      });
      notify(`${handler}(处理人)`);
    } else {
      // 一线一轮（10-19 C2）：一线未领取过回一线刷机池，一线领取过进教育刷机处理组池
      const pool: FlashPoolKey = manuallyInvolved(r) ? 'l2' : 'l1';
      transferToPool(ticketNo, pool, '回访期间客户催补');
      notify(pool === 'l1' ? FLASH_POOLS.l1.label : FLASH_POOLS.l2.groupName);
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
   * 子状态回「未认领」、处理人清空、进教育刷机处理组池，转人工原因「一线升级」；
   * 一线的刷机处理结论（「升级二线」）与刷机处理记录落库，二线只读展示（1014）；
   * 履历记「升级二线」（带最近一条刷机处理记录）；站内通知归属组；不发转人工短信。
   * 进池时间取本条履历（工作台 `poolEnteredAtOf`）；「SLA 起算时间」为空时写入升级时刻（1013 A26）。
   */
  function escalateToL2(ticketNo: string, by: FlashActor, record?: string, fullRecord?: string): FlashActionResult {
    const r = rowOf(ticketNo);
    if (!r?.flash || !EDITABLE_STATUSES.includes(r.nodeStatus)) return { ok: false, message: FLASH_TIP_REPUSH_STATE };
    const now = Date.now();
    const st = r.flash.state;
    st.result = FLASH_RESULT_ESCALATE_L2;
    if (fullRecord !== undefined) st.record = fullRecord;
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
   * 处理表单保存（1013 A16；1014）：一线的刷机处理结论、刷机处理记录按现值落库，**不暂停 SLA**；
   * 二线不传两项（二线按咨询单处理，两项只读）。
   * - 改为「已线下登记」：刷机处理记录追加「已线下登记，〈保存时刻〉」，履历记「线下登记」，单留在本人名下；
   * - 改为「已线下登记、已推送」：刷机处理记录追加「产线已推送」；
   * - 待响应首次保存转「处理中」（PRD §7.1）。
   */
  function saveProcess(
    ticketNo: string,
    by: FlashActor,
    input: { result?: FlashResult | ''; record?: string },
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
    if (input.result !== undefined) st.result = input.result || undefined;
    if (input.record !== undefined) {
      const cur = input.record.replace(/\s+$/, '');
      st.record = appendRecord ? (cur ? `${cur}\n${appendRecord}` : appendRecord) : input.record;
    }
    if (r.nodeStatus === '待响应') {
      markFirstResponse(r, now);
      r.nodeStatus = '处理中';
    }
    r.updatedAt = flashMinuteStamp(now);
    bump(ticketNo);
    persist();
    return { ok: true, message: '', appendRecord };
  }

  /**
   * 处理表单保存的「工单处理」登记（字段级变更）记进刷机履历并落缓存：刷新后处理履历与速览带「最新处理」
   * 仍取得到保存时的处理人与时间。一线的刷机处理记录、二线的处理结果都走这里。
   */
  function logProcess(ticketNo: string, by: FlashActor, partial: Omit<TimelineEntry, 'id' | 'when'>) {
    if (!rowOf(ticketNo)?.flash) return;
    log(ticketNo, Date.now(), { ...partial, who: by.name, role: by.role });
    bump(ticketNo);
    persist();
  }

  /**
   * 处理人在「待响应」外呼、发短信或发邮件（PRD §6 / §7.1 / M102）：转「处理中」，处理人不变。其余子状态不动。
   */
  function markRespondedByContact(ticketNo: string): boolean {
    const r = rowOf(ticketNo);
    if (!r?.flash || r.nodeStatus !== '待响应') return false;
    const now = Date.now();
    markFirstResponse(r, now);
    Object.assign(r, { nodeStatus: '处理中', updatedAt: flashMinuteStamp(now) });
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

  /** 提交审核（强结 / 关闭）：刷机单 SLA 不停表（PRD §4.3，1021），账本照常计时，只通知处理页重读 */
  function holdSla(ticketNo: string, _reason: string): void {
    const r = rowOf(ticketNo);
    if (!r?.flash) return;
    bumpAfterAction(ticketNo);
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
  function forward(ticketNo: string, by: FlashActor, result?: FlashResult): FlashActionResult {
    const r = rowOf(ticketNo);
    if (!r?.flash || isTicketClosed(r.nodeStatus)) return { ok: false, message: FLASH_TIP_REPUSH_STATE };
    const st = r.flash.state;
    const now = Date.now();
    // 一线带刷机处理结论下送；二线按咨询单下送（1014），不改一线的刷机处理结论
    if (result) st.result = result;
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
    // 「调研中」解决时效到此结束（PRD §4.3）；撤回 / 催补拉回时剩余自此接着计时
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
    // 撤回下送：结掉「调研中」那段，剩余回到下送前（PRD §4.3 / R55）
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
   * 转售后（二线，PRD §7.3）：子状态「已转出」、客服侧冻结、SLA 照常计时（同咨询单）。
   * 履历与关联售后单号由处理页的转售后弹窗给出（`what` 为弹窗组好的正文）。
   */
  function transferAftersale(
    ticketNo: string, by: FlashActor, asNo: string, what: string, serviceType?: string,
  ): FlashActionResult {
    const r = rowOf(ticketNo);
    if (!r?.flash || !EDITABLE_STATUSES.includes(r.nodeStatus)) return { ok: false, message: FLASH_TIP_REPUSH_STATE };
    const now = Date.now();
    // 转售后视为首次响应（PRD §4.3）：首响未判的，按此刻判达标 / 未达标
    markFirstResponse(r, now);
    // 已转出：客服侧冻结，SLA 照常计时（PRD §4.3，1021，同咨询单）
    Object.assign(r, {
      nodeStatus: '已转出', linkedAftersaleNo: asNo, linkedAftersaleStatus: '待接单',
      // 关联售后卡的服务类型取弹窗所选（N-04）
      ...(serviceType ? { linkedAftersaleServiceType: serviceType } : {}),
      updatedAt: flashMinuteStamp(now),
    });
    syncSlaRow(r, now);
    // 售后侧处理完成的回传按转出时刻推算（`settleDue` 到点经售后回传通道唤起原单）
    r.flash.state.aftersaleReturnDueAt = flashStamp(now + FLASH_AFTERSALE_RETURN_DELAY_MS);
    log(ticketNo, now + 1, {
      category: 'node', action: 'transfer', who: by.name, role: by.role, how: '转售后', what,
    });
    bump(ticketNo);
    persist();
    // 与咨询单转售后同一句（opActions「转售后」，D10：存储值「已转出」，界面展示名「已转售后」）
    return { ok: true, message: `已转售后 ${asNo}，等待售后处理结果` };
  }

  /**
   * 售后处理完唤起原单（PRD §7.1 / §7.3）：回原二线处理人「处理中」，SLA 照常计时（转出期间未停），
   * 由处理人按咨询单处理表单下送；一线的刷机处理结论不改写（1014）。关联售后单保留（卡片照常展示）。
   * 只由 `receiveAftersaleEvent` 调用（售后回传通道 `routeAftersaleEvent` 判出 `reactivated` 之后）。
   */
  function returnFromAftersale(ticketNo: string, e: AftersaleEvent): FlashActionResult {
    const r = rowOf(ticketNo);
    if (!r?.flash || r.nodeStatus !== '已转出') return { ok: false, message: FLASH_TIP_REPUSH_STATE };
    const now = Date.now();
    Object.assign(r, {
      nodeStatus: '处理中', tab: 'mine',
      updatedAt: flashMinuteStamp(now),
    });
    syncSlaRow(r, now);
    r.flash.state.aftersaleReturnDueAt = undefined;
    log(ticketNo, now, e.type === 'AS_CLOSED'
      ? {
        category: 'node', action: 'resolved', who: e.operator, role: '系统', how: '售后单已关闭',
        what: FLASH_TL.aftersaleClosed(e.asNo, e.resultSummary),
      }
      : {
        category: 'node', action: 'transfer', who: e.operator, role: '系统', how: '售后转回客服',
        what: [`售后单 ${e.asNo}`, e.returnReason ? `转回原因：${e.returnReason}` : ''].filter(Boolean).join(' · '),
      });
    log(ticketNo, now + 1, {
      category: 'node', action: 'transfer', who: '系统', role: '系统', how: '售后唤起',
      what: FLASH_TL.aftersaleReactivated(r.assignee ?? ''),
    });
    bump(ticketNo);
    persist();
    return { ok: true, message: '' };
  }

  /**
   * 售后回传落刷机单（售后回传通道的刷机分支，PRD §7.1 / §7.3）：事件先经通用路由 `routeAftersaleEvent`
   * （幂等、刷关联售后卡片），判出 `reactivated` 再由本服务唤起原单。其余结果不动本单。
   */
  function receiveAftersaleEvent(e: AftersaleEvent): FlashActionResult {
    const r = TICKETS.find((t) => isFlashTicket(t) && !!t.flash && t.linkedAftersaleNo === e.asNo);
    if (!r) return { ok: false, message: FLASH_TIP_REPUSH_STATE };
    const routed = routeAftersaleEvent([toRaw(r)], e);
    if (routed.outcome !== 'reactivated') return { ok: false, message: FLASH_TIP_REPUSH_STATE };
    const next = routed.rows[0];
    Object.assign(reactive(r), {
      linkedAftersaleStatus: next.linkedAftersaleStatus,
      aftersaleEventIds: next.aftersaleEventIds,
    });
    return returnFromAftersale(r.no, e);
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
   * 二线「升级 · 三线技术支持」落工单库（1013 B2 沿用咨询单，F13）：进技术支持组工单池、二线主责记 primaryOwner；
   * 技术支持「退回」回二线主责「处理中」、归属组回教育刷机处理组。字段改法与咨询单同一份（techEscalation.ts）。
   * 在通用动作执行之后调用，处理页重读推迟到本轮动作结束（同 `bumpAfterAction`）。
   */
  function escalateToTechSupport(ticketNo: string, group?: string): void {
    const r = rowOf(ticketNo);
    if (!r?.flash) return;
    Object.assign(r, techEscalationRowPatch(r, group, flashMinuteStamp(Date.now())));
    bumpAfterAction(ticketNo);
    persist();
  }

  function returnFromTechSupport(ticketNo: string): void {
    const r = rowOf(ticketNo);
    if (!r?.flash) return;
    const meta = FLASH_POOLS.l2;
    Object.assign(r, techReturnRowPatch(r, { groupId: meta.groupId, groupNames: [meta.groupName] }, flashMinuteStamp(Date.now())));
    if (r.primaryOwner === undefined) delete (r as Partial<Ticket>).primaryOwner;
    bumpAfterAction(ticketNo);
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
    // 技术支持组池里的「已升级技术支持」单由技术支持领取，子状态不变（沿用咨询单，F13）
    const techPool = r.nodeStatus === '已升级技术支持' && r.tab === 'pool';
    if (r.nodeStatus !== '未认领' && !techPool) return { ok: false, message: '当前工单状态不可领取' };
    const now = Date.now();
    Object.assign(r, {
      nodeStatus: techPool ? r.nodeStatus : '待响应',
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
   * 工单池「指派」（教育刷机处理组班组长 / 管理员，§4.2；查询中心不指派）：教育刷机处理组池未认领且无处理人才可指派；
   * 落点同领取（子状态「待响应」、处理人＝被指派人、进「我的任务」），写履历「指派」。不改 SLA、不动归属池。
   */
  function assignFromPool(ticketNo: string, target: string, by: FlashActor): FlashActionResult {
    const r = rowOf(ticketNo);
    if (!r?.flash) return { ok: false, message: FLASH_TIP_REPUSH_STATE };
    if (r.assignee) return { ok: false, message: `该工单已被 ${r.assignee} 领取` };
    if (r.nodeStatus !== '未认领' || r.flash.state.pool !== 'l2') return { ok: false, message: '当前工单状态不可指派' };
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
   * 查询中心「调剂」（工单运营，§4.2；1014 沿用通用调剂规则）：
   * 本组＝进对方名下，未认领 / 待响应 / 处理中转「处理中」，其余子状态不变；
   * 跨组＝转入目标组工单池「未认领」、不指定处理人，归属组改为目标组。自动刷机中不可调剂。不改 SLA。
   */
  function transferOwner(
    ticketNo: string,
    by: FlashActor,
    p: { scope: 'same' | 'cross'; target: string; reason: string },
  ): FlashActionResult {
    const r = rowOf(ticketNo);
    if (!r?.flash) return { ok: false, message: FLASH_TIP_REPUSH_STATE };
    if (r.nodeStatus === '自动刷机中') return { ok: false, message: FLASH_TIP_AUTO_FLASHING };
    const now = Date.now();
    const reason = p.reason || '—';
    if (p.scope === 'cross') {
      // 归属组改为目标组：进目标组工单池（通用「工单池」按 groupId 取数，1014）；
      // 目标组不在工单池分组里时记一个只属于该组的 id，不落回原组的池
      const group = POOL_GROUPS.find((g) => g.label === p.target);
      Object.assign(r, {
        nodeStatus: '未认领', assignee: null, tab: 'pool', groupNames: [p.target],
        groupId: group?.id ?? `xfer:${p.target}`,
        updatedAt: flashMinuteStamp(now),
      });
      log(ticketNo, now, {
        category: 'node', action: 'transfer', who: by.name, role: by.role, how: '跨组调剂',
        what: `跨组调剂至「${p.target}」（转入该组工单池待领取，不指定处理人）。原因：${reason}`,
      });
    } else {
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
    }
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
      // PRD §7.1 / §7.3：转售后到点，售后侧回传「售后单已关闭」→ 经售后回传通道唤起原单
      const asDue = isFlashTicket(t) && t.flash && t.nodeStatus === '已转出' ? t.flash.state.aftersaleReturnDueAt : undefined;
      if (asDue && t.linkedAftersaleNo) {
        const dueMs = parseFlashStamp(asDue).getTime();
        if (dueMs <= now && receiveAftersaleEvent({
          type: 'AS_CLOSED', asNo: t.linkedAftersaleNo, eventId: `${t.linkedAftersaleNo}:AS_CLOSED`,
          at: flashMinuteStamp(dueMs), operator: '售后系统', resultSummary: '售后处理完成',
        }).ok) settled += 1;
        continue;
      }
      // M11 / M48：回传超时转人工之后，硬件平台迟到回传「接收成功」（按设备底数，时刻自超时判定起推算）
      if (isFlashTicket(t) && t.flash && t.nodeStatus !== '自动刷机中') {
        const last = t.flash.runs[t.flash.runs.length - 1];
        const lateMin = findMdmDevice(t.flash.info.sn)?.lateSuccessAfterMin;
        if (last?.failL2 === '回传超时' && lateMin && last.resultAt
          && !(t.flash.state.lateSuccessAt && t.flash.state.lateSuccessAt >= last.resultAt)) {
          const at = parseFlashStamp(last.resultAt).getTime() + lateMin * 60_000;
          if (at <= now && recordLateSuccess(t.no, at).ok) settled += 1;
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
    const next: FlashInfo = {
      ...prev,
      ...changes,
      snPhotos: [...(changes.snPhotos ?? prev.snPhotos)],
      mdmPhotos: [...(changes.mdmPhotos ?? prev.mdmPhotos ?? [])],
    };
    // 产品信息图片 / 学习证明附件：只有小程序单带，无值不落空数组（处理页无值不显示该项）
    (['productPhotos', 'studyProofPhotos'] as const).forEach((k) => {
      const list = changes[k] ?? prev[k] ?? [];
      if (list.length) next[k] = [...list];
      else delete next[k];
    });
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
      // PRD §5.6：设备SN照片 / MDM信息图片有变化写「已更换」
      if (k === 'snPhotos' || k === 'mdmPhotos' || k === 'productPhotos' || k === 'studyProofPhotos') {
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
    const st = saved.flash?.state as { result?: string; verifyResult?: unknown } | undefined;
    if (st?.result === '已线下登记推送') st.result = FLASH_RESULT_OFFLINE;
    // 建单不再校验（v22）：旧快照上的建单校验结果一律去掉
    if (st) delete st.verifyResult;
    const info = saved.flash?.info as (FlashInfo & Record<string, unknown>) | undefined;
    if (info) {
      if (!(FLASH_STUDENT_TYPES as readonly string[]).includes(info.studentType)) {
        info.studentType = info.reason === '毕业' ? '毕业生' : '转校生';
      }
      if (!Array.isArray(info.mdmPhotos)) info.mdmPhotos = [];
      if (!Array.isArray(info.snPhotos)) info.snPhotos = [];
      // 产品信息图片 / 学习证明附件（2026-10-21 新增）：旧缓存没有或形状不对的按无值，不落空数组
      (['productPhotos', 'studyProofPhotos'] as const).forEach((k) => {
        if (info[k] !== undefined && (!Array.isArray(info[k]) || !info[k]!.length)) delete info[k];
      });
      if (typeof info.schoolId !== 'string') info.schoolId = '';
      if (typeof info.schoolName !== 'string') info.schoolName = '';
      delete info.romVersion;
      delete info.mdmVersion;
      delete info.versionBackfilled;
    }
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
    progressStageOf,
    // 动作
    evaluateCreate,
    createFlashTicket,
    repush,
    saveFlashInfo,
    recordSurveyConclusion,
    surveyGateOf,
    onCustomerUrge,
    notifyCsEvent,
    // 外部回传（售后侧，PRD §7.1 / §7.3）：到点由 settleDue 经售后回传通道驱动
    receiveAftersaleEvent,
    // 处理页（M4b-2）
    liveNotices,
    escalateToL2,
    linkComplaint,
    flashNoLinkedTo,
    saveProcess,
    logProcess,
    holdSla,
    resumeSla,
    stopSla,
    markRespondedByContact,
    forward,
    withdrawForward,
    transferAftersale,
    escalateToTechSupport,
    returnFromTechSupport,
    syncStatus,
    // 工作台（M3）
    creatorNameOf,
    poolEnteredAtOf,
    claimFromPool,
    assignFromPool,
    transferOwner,
  };
});
