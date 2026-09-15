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
  FLASH_VERIFY_NOT_RUN,
  flashMinuteStamp, flashProgressStage, flashSmsHandoff, flashSmsSuccess, flashStamp,
  flashTipInflight, flashTipRequired, flashTipVerifyFailed, isFrontlineActor,
  type FlashActor, type FlashCreator, type FlashFailL1, type FlashFailL2, type FlashHandoffReason,
  type FlashInfo, type FlashPoolKey, type FlashProgressStage, type FlashPushTrigger, type FlashReasonName,
  type FlashRun, type FlashVerifyResult, type TicketFlash,
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

/** 动作结果。`code: 'unchanged'` ＝ 没有任何变更、未落库未写履历（M70） */
export type FlashActionResult =
  | { ok: true; message: string; code?: 'unchanged' }
  | { ok: false; message: string };

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

  /** M38：重推回传结果通知 */
  function notifyRepushResult(r: Ticket, run: FlashRun, text: string, toGroup?: FlashPoolKey) {
    useNotifyLogStore().emit({
      ticketNo: r.no,
      event: FLASH_NOTIFY_EVENTS.repushResult,
      kind: toGroup ? 'group' : 'assign',
      title: '重推回传结果',
      receivers: [toGroup ? FLASH_POOLS[toGroup].groupName : `${run.by}(${run.byRole})`],
      content: text,
    });
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
    opts: { lead?: string; sms?: boolean; keepSla?: FlashRun['slaBefore'] } = {},
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
      what: `${opts.lead ?? ''}转人工（${reason}），进入${meta.label}。`,
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
    log(r.no, at, {
      category: 'node', action: 'flashPush', who: '系统', role: '系统', how: '自动推送',
      what: `第 ${run.seq} 次推送刷机包至设备 SN ${f.info.sn}（${trigger}），等待硬件平台回传。`,
    });
    if (run.autoRetried) {
      log(r.no, at + 1000, {
        category: 'node', action: 'flashPush', who: '系统', role: '系统', how: '自动推送',
        what: '推送接口返回异常，系统已自动重试 1 次。',
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
        category: 'node', action: 'flashSuccess', who: '系统', role: '系统', how: '回传成功',
        what: '硬件平台回传：接收成功，处理结果「已线上刷机成功」，进入回访。',
      });
      sms(r, at + 1000, 'success');
    } else {
      // M19：人工重推成功回原处理人「处理中」，由处理人联系确认后下送；M32 同样发成功短信
      toHandler(r, run, at);
      log(r.no, at, {
        category: 'node', action: 'flashSuccess', who: '系统', role: '系统', how: '回传成功',
        what: `硬件平台回传：接收成功，已回到处理人 ${r.assignee ?? ''} 名下。`,
      });
      sms(r, at + 1000, 'success');
      notifyRepushResult(r, run, `工单 ${r.no} 重新推送后回传：接收成功，请联系用户确认刷机完成后下送。`);
    }
    bump(r.no);
  }

  function fail(r: Ticket, run: FlashRun, l1: '接收失败' | '推送异常', l2: FlashFailL2 | undefined, at: number) {
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
    const what = l2 === '回传超时'
      ? `推送后 ${config.returnTimeoutMin} 分钟未收到硬件平台回传：${reasonText}。`
      : l2 === '接口异常'
        ? `推送接口自动重试后仍失败：${reasonText}。`
        : `硬件平台回传：${reasonText}。`;
    log(r.no, at, { category: 'node', action: 'flashFail', who: '系统', role: '系统', how: '回传失败', what });

    if (run.trigger === '建单首推') {
      // M8′：自动环节失败一律进一线刷机池；首次转人工发短信（M37）
      handoff(r, 'l1', l1, at + 1000, { sms: true });
    } else if (run.trigger === '一线重推') {
      // D13：一线重推后再失败 → 二线池；M38：通知归属组
      handoff(r, 'l2', '一线重推失败', at + 1000, { keepSla: run.slaBefore });
      notifyRepushResult(r, run, `工单 ${r.no} 重新推送后回传：${reasonText}，已转入${FLASH_POOLS.l2.label}。`);
      notifyRepushResult(r, run, `工单 ${r.no} 一线重新推送后回传：${reasonText}，已转入${FLASH_POOLS.l2.label}，请及时领取。`, 'l2');
    } else {
      // D16：二线重推后失败 → 回原二线处理人；M38：通知本人
      toHandler(r, run, at);
      log(r.no, at + 1000, {
        category: 'node', action: 'flashFail', who: '系统', role: '系统', how: '回传失败',
        what: `已回到处理人 ${r.assignee ?? ''} 名下。`,
      });
      notifyRepushResult(r, run, `工单 ${r.no} 重新推送后回传：${reasonText}，已回到您名下。`);
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
      how: byUser ? '刷机提报' : '代客建单',
      what: `${byUser ? '通过客户服务小程序' : '来电代客'}提交刷机申请：${info.productModel}，SN ${info.sn}，学生 ${info.studentName}（${info.schoolName}），刷机原因 ${info.reason}。`,
    });
    if (evaluation.route === 'pool') {
      r.flash!.state.failL1 = evaluation.failL1;
      r.flash!.state.failL2 = evaluation.failL2;
      const lead = evaluation.handoffReason === '特殊情况'
        ? `刷机原因为${info.reason}，需联系学校核实，未推送；`
        : evaluation.failL1
          ? `${config.failReasonText(evaluation.failL1, evaluation.failL2)}，未推送；`
          : '建单校验通过；该机型不支持线上推送，';
      handoff(r, evaluation.pool!, evaluation.handoffReason!, now + 1000, { lead, sms: true });
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

    if (!config.isSupportedModel(next.productModel)) return { ok: false, message: FLASH_TIP_MODEL_UNSUPPORTED };
    if (!config.isSelfDeveloped(next.productModel)) return { ok: false, message: FLASH_TIP_NON_SELF_DEVELOPED };
    if (l1 && r.flash.state.l1RepushCount >= FLASH_L1_REPUSH_LIMIT) {
      return { ok: false, message: FLASH_TIP_L1_REPUSH_EXHAUSTED };
    }
    if (next.reason !== FLASH_REASON_AUTO) {
      return { ok: false, message: l1 ? FLASH_TIP_REASON_NOT_GRADUATE_L1 : FLASH_TIP_REASON_NOT_GRADUATE_L2 };
    }
    let inflight: Ticket | undefined;
    try {
      inflight = findInflightBySn(next.sn, ticketNo);
    } catch {
      return { ok: false, message: FLASH_TIP_SYSTEM_BUSY };
    }
    if (inflight) return { ok: false, message: flashTipInflight(inflight.no) };
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
    log(ticketNo, now, {
      category: 'node', action: 'flashRepush', who: by.name, role: by.role, how: '重推',
      what: diff.length ? '修改刷机信息并重新推送。' : '刷机信息未修改，重新推送。',
      changes: diff.length ? diff : undefined,
    });
    pushInternal(r, by, l1 ? '一线重推' : '二线重推', now + 1000);
    persist();
    return { ok: true, message: '已重新推送，等待硬件平台回传' };
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
    const diff = diffInfo(prev, next);
    if (!diff.length) return { ok: true, code: 'unchanged', message: '刷机信息未修改' };
    const now = Date.now();
    r.flash.info = next;
    Object.assign(r, { sn: next.sn, product: next.productModel, updatedAt: flashMinuteStamp(now) });
    log(ticketNo, now, {
      category: 'handle', action: 'handle', who: by.name, role: by.role, how: '修改刷机信息',
      what: '修改刷机信息。', changes: diff,
    });
    bump(ticketNo);
    persist();
    return { ok: true, message: '刷机信息已保存' };
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
   * 迟到回传「接收成功」（M11 / M48）：回传超时已转人工之后才收到的成功回传。
   * 写履历、记迟到回传时间；有处理人时站内通知处理人；**不改状态、不发成功短信**。
   */
  function recordLateSuccess(ticketNo: string, at: number = Date.now()): FlashActionResult {
    const r = rowOf(ticketNo);
    const run = r?.flash ? [...r.flash.runs].reverse().find((x) => x.failL2 === '回传超时') : undefined;
    if (!r?.flash || !run) return { ok: false, message: FLASH_TIP_REPUSH_STATE };
    r.flash.state.lateSuccessAt = flashStamp(at);
    log(r.no, at, {
      category: 'node', action: 'flashSuccess', who: '系统', role: '系统', how: '回传成功',
      what: `回传超时后收到硬件平台回传：接收成功（第 ${run.seq} 次推送），请联系用户确认刷机结果。`,
    });
    if (r.assignee) {
      useNotifyLogStore().emit({
        ticketNo: r.no,
        event: FLASH_NOTIFY_EVENTS.lateSuccess,
        kind: 'assign',
        title: '超时后收到回传',
        receivers: [`${r.assignee}(处理人)`],
        content: `工单 ${r.no} 在回传超时后收到硬件平台回传：接收成功，请联系用户确认刷机结果。`,
      });
    }
    bump(r.no);
    persist();
    return { ok: true, message: '已记录迟到回传' };
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
      if (t.type !== '刷机' || !t.flash || t.nodeStatus !== '自动刷机中') continue;
      const r = reactive(t);
      const run = [...r.flash!.runs].reverse().find((x) => x.result === '等待回传');
      if (!run) continue;
      const device = findMdmDevice(r.flash!.info.sn);
      const elapsed = now - run.pushedAtMs;
      if (!device || device.noResponse) {
        // M11：回传无响应 → 到回传超时时长转人工
        const timeoutMs = config.returnTimeoutMin * 60_000;
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
    // 工作台（M3）
    creatorNameOf,
    poolEnteredAtOf,
    claimFromPool,
  };
});

/** 单号前缀（供按单号查进度时判断是否刷机单） */
export const FLASH_NO_PREFIX = TICKET_NO_PREFIX['刷机'];
