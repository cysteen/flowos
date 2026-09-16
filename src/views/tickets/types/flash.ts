/**
 * 教育刷机单 · 常量与字段组类型 —— **单一真源**（930 教育刷机单 D1–D23 / M1–M36）。
 *
 * 建单表单、处理页区块、用户提报页、后台配置页、工作台页签等模块**只从这里取**枚举与类型，
 * 不在各自文件里另写一份。取值可被后台「刷机配置」覆盖的（机型 / 刷机原因 / 失败原因 /
 * 回传超时时长），这里给的是出厂值，运行时读 `stores/flashConfig.ts`。
 *
 * 本文件只放**常量、类型与纯函数**，不依赖 Pinia / 工单库，任何模块都可以放心引用
 * （工作日判定读 SLA 工作日历 `config/slaCalendars.ts`）。
 */
import type { TlRole } from '@/views/tickets/types/ticketDetail';
import { CAL_STANDARD, slaCalendars } from '@/config/slaCalendars';

/** 工单类型名（D1：第 5 类工单类型） */
export const FLASH_TICKET_TYPE = '刷机' as const;

/* ------------------------------------------------------------------ */
/* 刷机原因（M3）                                                       */
/* ------------------------------------------------------------------ */

export const FLASH_REASONS = ['毕业', '转校', '退学', '学校停用智慧课堂', '其他'] as const;
export type FlashReason = (typeof FLASH_REASONS)[number];
/** 工单上的刷机原因取值：出厂五项 + 后台「刷机配置」新增的原因（M65） */
export type FlashReasonName = FlashReason | (string & {});
/** 唯一走自动刷机的原因；其余一律按「特殊情况」进二线池（M1③ / M3） */
export const FLASH_REASON_AUTO: FlashReason = '毕业';

/* ------------------------------------------------------------------ */
/* 失败原因两级（M12）                                                  */
/* ------------------------------------------------------------------ */

export const FLASH_FAIL_REASON_TREE = [
  { l1: '建单校验不通过', l2: ['SN与学生账号不一致', '非毕业生身份'] },
  { l1: '接收失败', l2: ['未开机', '未联网', '版本不符', '其他'] },
  { l1: '推送异常', l2: ['接口异常', '回传超时'] },
] as const;

export type FlashFailL1 = (typeof FLASH_FAIL_REASON_TREE)[number]['l1'];
export type FlashFailL2 = (typeof FLASH_FAIL_REASON_TREE)[number]['l2'][number];

/** 一级 → 细分选项 */
export const FLASH_FAIL_L2_MAP: Record<FlashFailL1, readonly FlashFailL2[]> = Object.fromEntries(
  FLASH_FAIL_REASON_TREE.map((n) => [n.l1, n.l2]),
) as unknown as Record<FlashFailL1, readonly FlashFailL2[]>;

/** 回传未带细分原因时的细分展示词（M12：「接收失败 · 原因未返回」） */
export const FLASH_FAIL_L2_NOT_RETURNED = '原因未返回';

/** 一级与细分之间的分隔符 */
export const FLASH_FAIL_SEPARATOR = ' · ';

/**
 * 失败原因展示文案：`一级 · 细分`。
 * 接收失败而回传未带细分 → `接收失败 · 原因未返回`，处理人经硬件平台外链自查（M12 / M23）；
 * 其余一级缺细分时只显示一级。无一级 → 空串。
 */
export function flashFailReasonText(l1?: FlashFailL1 | null, l2?: FlashFailL2 | null): string {
  if (!l1) return '';
  if (l2) return `${l1}${FLASH_FAIL_SEPARATOR}${l2}`;
  if (l1 === '接收失败') return `${l1}${FLASH_FAIL_SEPARATOR}${FLASH_FAIL_L2_NOT_RETURNED}`;
  return l1;
}

/* ------------------------------------------------------------------ */
/* 转人工原因（M13 + M33）                                              */
/* ------------------------------------------------------------------ */

/**
 * 转人工原因 ＝ 本单**为什么进了这个池**（分派依据，系统写）。
 * 与「失败原因」分工：失败原因＝外部系统给的结果；转人工原因＝进池的缘由（M13）。
 */
export const FLASH_HANDOFF_REASONS = [
  '特殊情况',
  '建单校验不通过',
  '非自研机型',
  '接收失败',
  '推送异常',
  '一线升级',
  '一线重推失败',
  '回访未解决',
  '回访期间客户催补',
] as const;
export type FlashHandoffReason = (typeof FLASH_HANDOFF_REASONS)[number];

/* ------------------------------------------------------------------ */
/* 处理结果（M20）与线下登记（D11 / M31 / M35）                          */
/* ------------------------------------------------------------------ */

export const FLASH_RESULTS = [
  '已线上刷机成功',
  '已线下登记推送',
  '婉拒',
  '已转售后',
  '联系不上用户',
  '用户放弃',
] as const;
export type FlashResult = (typeof FLASH_RESULTS)[number];
/** 选中即须填「线下登记时间」，保存后 SLA 暂停至批推时刻（D11 / M31） */
export const FLASH_RESULT_OFFLINE: FlashResult = '已线下登记推送';

/**
 * 保存「已线下登记推送」时系统自动追加到处理记录的一行（M35）。`{time}` ＝ 线下登记时间。
 * 用 `flashOfflineRegisterRecord(time)` 取成品文案，不要在调用处自己拼。
 */
export const FLASH_OFFLINE_REGISTER_RECORD_TEMPLATE = '已线下登记推送，登记时间 {time}';

export function flashOfflineRegisterRecord(time: string): string {
  return FLASH_OFFLINE_REGISTER_RECORD_TEMPLATE.replace('{time}', time);
}

/** 平峰批推时刻：工作日当日 / 次一工作日 17:00；非工作日登记顺延到下一工作日 10:00（M31） */
export const FLASH_BATCH_PUSH_HOUR = 17;
export const FLASH_WEEKEND_RESUME_HOUR = 10;

/** 线下登记时间晚于当前时刻的提示（M49） */
export const FLASH_TIP_OFFLINE_TIME_IN_FUTURE = '线下登记时间不能晚于当前时间';

/**
 * 工作日判定。取 SLA 工作日历「标准工作日历」的周表（`config/slaCalendars.ts`，周一至周五上班）；
 * 该日历只有周表、没有节假日表，故法定节假日暂不识别，只按周表判；接入节假日表后改这一处即可。
 */
export function isFlashWorkday(d: Date): boolean {
  const cal = slaCalendars.find((c) => c.name === CAL_STANDARD);
  const names = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  const row = cal?.workDays.find((w) => w.day === names[d.getDay()]);
  return row ? row.on : d.getDay() !== 0 && d.getDay() !== 6;
}

/** 从 `d` 当天（含）起的第一个工作日 `hour:00` */
function workdayAt(d: Date, hour: number, fromNextDay: boolean): Date {
  const r = new Date(d.getFullYear(), d.getMonth(), d.getDate() + (fromNextDay ? 1 : 0), hour, 0, 0, 0);
  for (let i = 0; i < 31 && !isFlashWorkday(r); i += 1) r.setDate(r.getDate() + 1);
  return r;
}

/** 线下登记时间校验（M49）：晚于当前时刻返回提示，否则返回 null */
export function validateOfflineRegisteredAt(registeredAt: Date | string, now: Date | number = Date.now()): string | null {
  const d = typeof registeredAt === 'string' ? parseFlashStamp(registeredAt) : new Date(registeredAt);
  const nowMs = typeof now === 'number' ? now : now.getTime();
  return d.getTime() > nowMs ? FLASH_TIP_OFFLINE_TIME_IN_FUTURE : null;
}

/**
 * 线下登记后 SLA **恢复计时时刻**（M31 / M49）：
 * - 工作日 17:00 **前**登记 → 当日 17:00；
 * - 工作日 17:00 **及以后**（17:00 整点算「17:00 后」）→ 下一工作日 17:00；
 * - 非工作日（周末或节假日）登记 → 一律下一个工作日 10:00（M66）；
 * - 「下一工作日」按 SLA 工作日历判定（`isFlashWorkday`）；
 * - 算出的恢复时刻**早于当前时刻**时返回 `null`，表示不暂停。
 *
 * 入参接受 `Date` 或 `YYYY-MM-DD HH:mm(:ss)` 字符串。登记时间是否晚于当前时刻另用 `validateOfflineRegisteredAt` 校验。
 */
export function offlineBatchResumeAt(registeredAt: Date | string, now: Date | number = Date.now()): Date | null {
  const d = typeof registeredAt === 'string' ? parseFlashStamp(registeredAt) : new Date(registeredAt);
  let resume: Date;
  if (!isFlashWorkday(d)) {
    resume = workdayAt(d, FLASH_WEEKEND_RESUME_HOUR, true);
  } else {
    const cutoff = new Date(d.getFullYear(), d.getMonth(), d.getDate(), FLASH_BATCH_PUSH_HOUR, 0, 0, 0);
    resume = d.getTime() < cutoff.getTime() ? cutoff : workdayAt(d, FLASH_BATCH_PUSH_HOUR, true);
  }
  const nowMs = typeof now === 'number' ? now : now.getTime();
  return resume.getTime() < nowMs ? null : resume;
}

/* ------------------------------------------------------------------ */
/* 升级二线「已做排查」（M16）                                          */
/* ------------------------------------------------------------------ */

export const FLASH_ESCALATE_CHECKS = ['已重推', '已线下登记', '已指导开机联网', '已联系学校', '其他'] as const;
export type FlashEscalateCheck = (typeof FLASH_ESCALATE_CHECKS)[number];

/* ------------------------------------------------------------------ */
/* 池（M15 / M8′）                                                      */
/* ------------------------------------------------------------------ */

export type FlashPoolKey = 'l1' | 'l2';

export interface FlashPoolMeta {
  key: FlashPoolKey;
  /** 池名（工作台页签 / 转人工落点展示） */
  label: string;
  /** 归属用户分组 id，对应 `POOL_GROUPS`（types/ticket.ts） */
  groupId: string;
  /** 归属用户分组名（列表「分组名称」列） */
  groupName: string;
}

/**
 * 两个池。一线刷机池复用 `POOL_GROUPS` 里已有的 `line1`（一线客服组）；
 * 教育刷机处理组池是新增的二线组 `edu-flash`。
 */
export const FLASH_POOLS: Record<FlashPoolKey, FlashPoolMeta> = {
  l1: { key: 'l1', label: '一线刷机池', groupId: 'line1', groupName: '一线客服组' },
  l2: { key: 'l2', label: '教育刷机处理组池', groupId: 'edu-flash', groupName: '教育刷机处理组' },
};

/* ------------------------------------------------------------------ */
/* 数值参数                                                             */
/* ------------------------------------------------------------------ */

/** 一线每单重推次数上限（D13）；二线不限（D16） */
export const FLASH_L1_REPUSH_LIMIT = 1;
/** 推送接口同步报错后的自动重试次数（M10） */
export const FLASH_PUSH_AUTO_RETRY = 1;
/** 推送后出回传结果的时长（D22：十几秒） */
export const FLASH_RETURN_DELAY_MS = 12_000;
/** 回传超时时长出厂值（分钟，M11 暂行 2 小时；后台可改） */
export const FLASH_RETURN_TIMEOUT_DEFAULT_MIN = 120;

/* ------------------------------------------------------------------ */
/* 建单人 / 触发方式 / 结果枚举                                          */
/* ------------------------------------------------------------------ */

/** 谁建的单：决定校验不通过的落池（D12） */
export type FlashCreator = '用户提报' | '一线代建' | '二线代建';

/** 推送触发方式 */
export type FlashPushTrigger = '建单首推' | '一线重推' | '二线重推';

/** 单次推送的结果（推送记录一行） */
export type FlashRunResult = '等待回传' | '接收成功' | '接收失败' | '推送异常';

/**
 * 本单**当前**自动刷机结果：
 * 未推送（特殊情况 / 校验不通过 / 非自研，没有发出过推送）· 等待回传 · 接收成功 · 接收失败 · 推送异常。
 */
export type FlashOutcome = '未推送' | FlashRunResult;

/** 操作人（系统 / 坐席） */
export interface FlashActor {
  name: string;
  role: TlRole;
}

/* ------------------------------------------------------------------ */
/* 字段组类型                                                           */
/* ------------------------------------------------------------------ */

/** 刷机信息（建单填、处理页可改后重推） */
export interface FlashInfo {
  /** 产品型号（取「支持刷机机型」） */
  productModel: string;
  /** 设备SN */
  sn: string;
  /** 学生账号 */
  studentAccount: string;
  /** 学生姓名 */
  studentName: string;
  /** 学校库 ID（M42：学校从学校库选，毕业名单按 ID 精确匹配，见 mock/schools.ts） */
  schoolId: string;
  /** 学校名称（学校库名称快照；学生所在学校，与客户档案上的学校不是一个字段） */
  schoolName: string;
  /** 刷机原因 */
  reason: FlashReasonName;
  /** ROM 版本（选填；建单校验时按 SN 从 MDM 回填，回填值优先、只读展示，M4） */
  romVersion: string;
  /** MDM 版本（同上） */
  mdmVersion: string;
  /** ROM / MDM 版本是否为系统回填（true ＝ 回填值，只读展示） */
  versionBackfilled: boolean;
  /** 设备SN照片（文件名；用户提报必传、坐席代建选传） */
  snPhotos: string[];
}

/** 推送记录一行 */
export interface FlashRun {
  id: string;
  /** 第几次推送（从 1 起） */
  seq: number;
  /** 触发方式 */
  trigger: FlashPushTrigger;
  /** 触发人（建单首推为「系统」） */
  by: string;
  byRole: TlRole;
  /** 发起方线别（人工推送：一线 / 二线；系统发起为空）。展示用 flashRunInitiator(run)，M59 */
  line?: FlashLine;
  /** 推送时刻（YYYY-MM-DD HH:mm:ss） */
  pushedAt: string;
  /** 推送时刻毫秒：回传计时按它推算，刷新页面后续得上 */
  pushedAtMs: number;
  /** 结果 */
  result: FlashRunResult;
  /** 失败原因（接收失败 / 推送异常时有值） */
  failL1?: FlashFailL1;
  failL2?: FlashFailL2;
  /** 回传 / 判定时刻（YYYY-MM-DD HH:mm:ss） */
  resultAt?: string;
  /** 推送接口同步报错后是否已自动重试（M10） */
  autoRetried?: boolean;
  /**
   * 推送发出时的「回传超时时长」快照（分钟，PRD §10.5）：本次推送按它判回传超时，
   * 后台保存的新值只对之后发出的推送生效。缺省（旧数据）回落当前配置值。
   */
  returnTimeoutMin?: number;
  /** 推送发出时本单处理人（人工重推后按它回原处理人，M19 / D16） */
  handlerAtPush?: string | null;
  /** 推送发出前的 SLA 摘要：回到处理人 / 转二线池时按它续算（自动刷机中整段停钟，D18 / M16） */
  slaBefore?: {
    slaText: string;
    slaSub: string;
    slaState: 'ok' | 'soon' | 'overdue' | 'paused';
    slaMinutes: number;
  };
}

/** 自动刷机状态 */
export interface FlashState {
  /** 当前结果 */
  outcome: FlashOutcome;
  /** 失败原因一级 */
  failL1?: FlashFailL1;
  /** 失败原因细分（接收失败无细分 → 展示「原因未返回」，见 flashFailReasonText） */
  failL2?: FlashFailL2;
  /** 推送次数（含建单首推与人工重推，不含接口报错的自动重试） */
  pushCount: number;
  /** 一线重推次数（上限 FLASH_L1_REPUSH_LIMIT） */
  l1RepushCount: number;
  /** 转人工原因（最近一次进池的缘由） */
  handoffReason?: FlashHandoffReason;
  /** 线下登记时间（处理页保存「已线下登记推送」时写入，M35） */
  offlineRegisteredAt?: string;
  /** 处理结果（下送必填，M20） */
  result?: FlashResult;
  /** 归属池（未进过人工池为空） */
  pool?: FlashPoolKey;
  /**
   * 已产生回访结论（M26 / M58）：回访结论为「已解决 / 未解决」时置位；
   * 下送后被撤回、调研中被催补拉回（尚无结论）不置位。置位后再下送跳过回访直接结案。
   */
  surveyConcluded: boolean;
  /** 谁建的单（D12 落池判据） */
  creator: FlashCreator;
  /**
   * SLA 暂停至（YYYY-MM-DD HH:mm）：线下登记后等待批推，早于该时刻 SLA 暂停（M31）；
   * 暂停期间处理人发起下送 / 升级二线 / 重推即清空、立即恢复计时。
   */
  slaPausedUntil?: string;
  /**
   * 迟到回传时间：回传超时转人工之后才收到的「接收成功」时刻（M11 / M48）。
   * 只写履历、有处理人时站内通知处理人，不改状态、不发成功短信。
   */
  lateSuccessAt?: string;
  /** 建单校验结果：两项各自通过 / 不通过；特殊情况、校验接口不可用为「未校验」（M50） */
  verifyResult: FlashVerifyResult;
  /** 已发转人工短信（M37：每单只发一次，首次转人工时发） */
  handoffSmsSent?: boolean;
  /**
   * 本次下送的发起人（处理人名，X30 / PRD §8「下送发起人撤回」）：进「调研中」时写入，撤回、结案或拉回后清空。
   * 自动刷机成功直进回访的单为空，任何人都不能撤回。
   */
  forwardedBy?: string;
  /** 下送前的 SLA 摘要：撤回下送回到「处理中」时按它续算（SLA 接着跑） */
  slaBeforeForward?: { slaText: string; slaSub: string; slaState: 'ok' | 'soon' | 'overdue' | 'paused'; slaMinutes: number };
  /** 转售后前的 SLA 摘要：售后唤起回原二线处理人时按它续算 */
  slaBeforeAftersale?: { slaText: string; slaSub: string; slaState: 'ok' | 'soon' | 'overdue' | 'paused'; slaMinutes: number };
  /**
   * 最近一次调研短信发出时刻（YYYY-MM-DD HH:mm:ss，PRD §8 / M26′ / M86）：进「调研中」时写入，
   * 调研超时未评价按它 + `FLASH_SURVEY_TIMEOUT_HOURS` 判自动结案。
   */
  surveySentAt?: string;
  /** 用户回访评价（M86）：提交即记为已产生回访结论，一张单只评价一次 */
  survey?: FlashSurveyFeedback;
  /**
   * SLA 起算时间（YYYY-MM-DD HH:mm，PRD §4.3 / M88）：本单首次进入人工池的时刻，以最早一次为准，
   * 此后再次进池、升级二线不改写；首推「自动刷机中」、自动刷机成功直进回访的单为空。
   */
  slaStartedAt?: string;
  /**
   * 累计停钟毫秒（PRD §4.3，D-01 账本）：已结束的各段停钟之和，默认 0。
   * 记「累计毫秒」而不是分段区间：读取 O(1)（页头每秒重算），撤回下送只要不动它剩余天然接续，
   * 缓存体积恒定。哪一段停的由处理履历（`slaPause` / `slaResume`）负责，账本不留第二真源。
   */
  slaPausedAccumMs?: number;
  /**
   * 当前这一段停钟的起点（YYYY-MM-DD HH:mm:ss）。有值即停钟中——**停钟判据以它为准**：
   * 重推「自动刷机中」、线下登记待批推、调研中、已转出都写它，恢复时并入 `slaPausedAccumMs` 后清空。
   */
  slaPausedSince?: string;
  /** 终态关钟时刻（YYYY-MM-DD HH:mm:ss）：结案 / 关闭 / 强结 / 升级投诉等收口时写入，写入后钟不再走 */
  slaStoppedAt?: string;
  /** 关钟结论：met=时限内收口 / breached=超时后收口 / void=中止（升级、转出、取消，无达标结论） */
  slaOutcome?: 'met' | 'breached' | 'void';
}

/** 用户回访评价（用户侧 H5「服务评价」提交，M86） */
export interface FlashSurveyFeedback {
  /** 刷机问题是否已解决 */
  solved: boolean;
  /** 满意度 1–5 星 */
  score: number;
  /** 补充说明（选填） */
  remark: string;
  /** 提交时刻（YYYY-MM-DD HH:mm:ss） */
  at: string;
}

/** 调研超时时长（小时）：沿用回访模块的调研超时配置，原型内无该配置，取 72 小时（M26′ / M86） */
export const FLASH_SURVEY_TIMEOUT_HOURS = 72;

/** 刷机单字段展示名（统一口径：建单表单、处理页、用户提报页、履历字段 diff 都用这一份） */
export const FLASH_FIELD_LABELS = {
  productModel: '产品型号',
  sn: '设备SN',
  studentAccount: '学生账号',
  studentName: '学生姓名',
  schoolName: '学校名称',
  reason: '刷机原因',
  romVersion: 'ROM版本',
  mdmVersion: 'MDM版本',
  snPhotos: '设备SN照片',
  contactPhone: '联系手机号',
} as const;

/** 刷机信息里参与改动登记的字段（重推改动项、履历字段 diff） */
export const FLASH_INFO_FIELD_LABELS: Record<Exclude<keyof FlashInfo, 'versionBackfilled' | 'schoolId'>, string> = {
  productModel: FLASH_FIELD_LABELS.productModel,
  sn: FLASH_FIELD_LABELS.sn,
  studentAccount: FLASH_FIELD_LABELS.studentAccount,
  studentName: FLASH_FIELD_LABELS.studentName,
  schoolName: FLASH_FIELD_LABELS.schoolName,
  reason: FLASH_FIELD_LABELS.reason,
  romVersion: FLASH_FIELD_LABELS.romVersion,
  mdmVersion: FLASH_FIELD_LABELS.mdmVersion,
  snPhotos: FLASH_FIELD_LABELS.snPhotos,
};

/** 建单必填提示（M46：必填先于机型与在途判定） */
export function flashTipRequired(missing: string[]): string {
  return `请填写必填项：${missing.join('、')}`;
}

/** 建单校验单项结论 */
export type FlashVerifyItemResult = '通过' | '不通过';

/**
 * 建单校验结果（M50）：两项分别存；没跑过校验（特殊情况 / 校验接口不可用）为「未校验」。
 * 两项都不通过时失败原因细分取「SN与学生账号不一致」，两项结论仍各自保留。
 */
export type FlashVerifyResult =
  | { status: '未校验' }
  | {
    status: '已校验';
    /** SN与学生账号一致 */
    snAccountMatch: FlashVerifyItemResult;
    /** 毕业生身份 */
    graduate: FlashVerifyItemResult;
  };

export const FLASH_VERIFY_NOT_RUN: FlashVerifyResult = { status: '未校验' };

/** 两项校验项名称 */
export const FLASH_VERIFY_ITEM_LABELS = { snAccountMatch: 'SN与学生账号一致', graduate: '毕业生身份' } as const;

/** 发起方线别（M59） */
export type FlashLine = '一线' | '二线';

/** 推送记录「发起方」展示：系统 / 姓名（一线）/ 姓名（二线）（M59） */
export function flashRunInitiator(run: Pick<FlashRun, 'by' | 'line'>): string {
  return run.line ? `${run.by}（${run.line}）` : '系统';
}

/**
 * 用户侧进度（M2 / M29：提报页在途提示与按单号查进度；PRD §2.5 进度映射）：
 * 自动刷机中 → 处理中 · 自动刷机中；未认领 / 待响应 / 处理中 / 已挂起 / 已委派 / 已转出 / 审核中 → 处理中 · 人工处理中；
 * 调研中 → 待回访；终态 → 已完成。
 */
export type FlashProgressStage = '自动刷机中' | '人工处理中' | '待回访' | '已完成';

export function flashProgressStage(status: string): FlashProgressStage {
  if (status === '自动刷机中') return '自动刷机中';
  if (status === '调研中') return '待回访';
  if (['已结案', '已关闭', '已强结', '已取消', '直接结案', '已升级投诉', '已升级外投', '已转咨询', '已转建议', '已转商机'].includes(status)) {
    return '已完成';
  }
  return '人工处理中';
}

/** 工单上挂的刷机字段组 */
export interface TicketFlash {
  info: FlashInfo;
  state: FlashState;
  /** 推送记录（时间正序） */
  runs: FlashRun[];
}

/* ------------------------------------------------------------------ */
/* 产品文案（拦截提示 / 短信 / 站内通知）                                 */
/* ------------------------------------------------------------------ */

/** A1：机型不在「支持刷机机型」 */
export const FLASH_TIP_MODEL_UNSUPPORTED = '该机型暂不支持刷机申请，请核对产品型号';
/** A2：同 SN 存在在途刷机单（M2；重推改 SN 撞在途单同文案，M44） */
export function flashTipInflight(inflightNo: string): string {
  return `该设备已有在途刷机单 ${inflightNo}，请勿重复提交`;
}
/** 在途查询不可用（M43） */
export const FLASH_TIP_SYSTEM_BUSY = '系统繁忙，请稍后再提交';
/** 一线重推次数用尽（M18） */
export const FLASH_TIP_L1_REPUSH_EXHAUSTED = '一线重推次数已用完，请线下登记或升级二线';
/** 非自研机型不可线上推送（M18） */
export const FLASH_TIP_NON_SELF_DEVELOPED = '该机型不支持线上推送，请线下登记';
/** 重推时刷机原因非毕业（M44） */
export const FLASH_TIP_REASON_NOT_GRADUATE_L1 = '刷机原因不是毕业，请升级二线处理';
export const FLASH_TIP_REASON_NOT_GRADUATE_L2 = '刷机原因不是毕业，请线下登记或婉拒';
/** 重推前建单校验不通过（M36 / PRD §5.6 提交判定第 8、9 条，逐字） */
export function flashTipVerifyFailed(l2: FlashFailL2): string {
  return l2 === 'SN与学生账号不一致'
    ? 'SN与学生账号不一致，请核实后再推送'
    : '未查询到该学生的毕业生身份，请核实后再推送';
}
/** 升级二线弹窗：升级说明为空（PRD §5.7） */
export const FLASH_TIP_ESCALATE_NOTE_REQUIRED = '请填写升级说明';
/** 处理表单 · 下送必填（PRD §5.4） */
export const FLASH_TIP_RESULT_REQUIRED = '请选择处理结果';
export const FLASH_TIP_OFFLINE_TIME_REQUIRED = '请填写线下登记时间';

/** Toast（PRD §5.5 / §5.6 / §5.7 / §5.8，逐字） */
export const FLASH_TOAST = {
  repushed: '已重新推送',
  repushPushErrorL1: '刷机推送未成功，已转入教育刷机处理组',
  repushPushErrorL2: '刷机推送未成功，请稍后重试或线下登记',
  infoSaved: '已保存修改',
  escalatedL2: '已升级至教育刷机处理组',
  forwarded: '已下送，工单进入「调研中」',
  forwardClosed: '已结案',
} as const;

/** 站内通知文案（M67 / PRD §11.1，逐字） */
export const FLASH_NOTICE = {
  repushSuccess: (no: string) => `${no}重推结果：接收成功`,
  /** `reasonText` ＝「〈一级失败原因〉 · 〈二级失败原因〉」 */
  repushFail: (no: string, reasonText: string) => `${no}重推结果：${reasonText}`,
  l1RepushFailToGroup: (no: string) => `${no}一线重推失败，已进入教育刷机处理组池`,
  escalatedToGroup: (no: string) => `${no}已升级至教育刷机处理组，待领取`,
  lateSuccess: (no: string) => `${no}收到迟到回传：接收成功`,
} as const;
/** 重推时建单校验接口不可用（M55） */
export const FLASH_TIP_VERIFY_UNAVAILABLE = '建单校验暂不可用，请稍后重试或线下登记';
/** 当前状态不可重推 */
export const FLASH_TIP_REPUSH_STATE = '当前工单状态不可重新推送';
/** 当前状态不可修改刷机信息（M52：待响应、处理中可改） */
export const FLASH_TIP_EDIT_STATE = '当前工单状态不可修改刷机信息';
/** 自动刷机中的冻结原因（PRD §3.1 / §5.5：底栏置灰、页头升级投诉置灰、「修改刷机信息」置灰的悬停原因） */
export const FLASH_TIP_AUTO_FLASHING = '自动刷机进行中，回传结果后再操作';

/* ------------------------------------------------------------------ */
/* 外部平台外链（M23 / M62，新窗口打开）                                  */
/* ------------------------------------------------------------------ */

export const FLASH_EXTERNAL_LINKS = {
  /** 智能硬件平台（自动刷机结果卡卡头）：按 SN 查推送与回传 */
  hardwarePlatform: { label: '智能硬件平台', url: 'https://hwp.iflytek.com/device/push-records' },
  /** MDM 后台（刷机信息区块头） */
  mdm: { label: 'MDM 后台', url: 'https://mdm.iflytek.com/console/devices' },
  /** 保障中心 · 学校管理（刷机信息区块头） */
  schoolAdmin: { label: '保障中心 · 学校管理', url: 'https://bzzx.iflytek.com/school/manage' },
} as const;

/** 外链地址：带 SN 的平台附上 `?sn=`，便于落地即定位该设备 */
export function flashExternalUrl(key: keyof typeof FLASH_EXTERNAL_LINKS, sn?: string): string {
  const base = FLASH_EXTERNAL_LINKS[key].url;
  return sn && key !== 'schoolAdmin' ? `${base}?sn=${encodeURIComponent(sn)}` : base;
}

/* ------------------------------------------------------------------ */
/* 展示文案（处理页结果卡 / 推送记录 / 处理履历，PRD §5.2 / §11.2）         */
/* ------------------------------------------------------------------ */

/** 推送结果展示名：等待回传 → 自动刷机中（PRD §5.2「当前结果」与推送记录「结果」列） */
export function flashRunResultText(result: FlashRunResult | FlashOutcome): string {
  return result === '等待回传' ? '自动刷机中' : result;
}

/** 建单校验结果两项分列：「SN与学生账号一致：通过；毕业生身份：通过」；未跑校验 →「未校验」 */
export function flashVerifyText(v: FlashVerifyResult): string {
  if (v.status === '未校验') return '未校验';
  return `${FLASH_VERIFY_ITEM_LABELS.snAccountMatch}：${v.snAccountMatch}；${FLASH_VERIFY_ITEM_LABELS.graduate}：${v.graduate}`;
}

/** 已推送计时 `mm:ss`（分钟不封顶） */
export function flashElapsedText(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
}

/** 处理履历正文（PRD §11.2 逐字） */
export const FLASH_TL = {
  create(creator: FlashCreator, verify: FlashVerifyResult, dest: { auto: true } | { handoff: FlashHandoffReason }): string {
    const v = verify.status === '未校验' ? '建单校验：未校验' : flashVerifyText(verify);
    const d = 'auto' in dest ? '进入自动刷机中' : `转人工原因：${dest.handoff}`;
    return `创建刷机单 · ${creator}；${v}；${d}`;
  },
  autoPush: (seq: number) => `推送刷机包 · 第 ${seq} 次推送 · 发起方：系统`,
  repush: (seq: number, run: Pick<FlashRun, 'by' | 'line'>) => `重新推送 · 第 ${seq} 次推送 · 发起方：${flashRunInitiator(run)}`,
  returnSuccess: '回传结果：接收成功',
  /** `reasonText` ＝ 失败原因展示文案「接收失败 · 〈二级〉」 */
  returnFail: (reasonText: string) => `回传结果：${reasonText}`,
  repushSuccess: (handler: string) => `重推成功，交回 ${handler}`,
  lateSuccess: '回传结果（迟到）：接收成功，子状态未变更',
  /** `reasonText` ＝「推送异常 · 接口异常」 */
  pushApiError: (reasonText: string) => `${reasonText}（已自动重试 1 次）`,
  verifyApiError: (reasonText: string) => `${reasonText}（建单校验未执行）`,
  /** `reasonText` ＝「推送异常 · 回传超时」 */
  returnTimeout: (reasonText: string, hours: number) => `${reasonText}（推送后 ${hours} 小时无回传）`,
  handoff: (reason: FlashHandoffReason, poolLabel: string) => `转人工 · ${reason} → ${poolLabel}`,
  repushFailBack: (handler: string) => `重推失败 · 交回 ${handler}`,
  editInfo: '修改刷机信息',
  offlineRegister: (time: string) => flashOfflineRegisterRecord(time),
  slaPause: (until: string) => `SLA 暂停至 ${until} · 线下登记`,
  /** `cause` ＝ 到达暂停截止时刻 / 下送 / 升级二线 / 重新推送 / 转售后 / 申请挂起 / 委派 / 关闭工单 / 强结 / 调剂 / 撤回 / 处理结果变更 / 线下登记时间变更 */
  slaResume: (cause: string) => `SLA 恢复计时 · ${cause}`,
  /** 升级二线：「升级至教育刷机处理组」；升级说明全文；已做排查逐项 */
  escalateL2: (note: string, checks: readonly string[]) =>
    `升级至教育刷机处理组；升级说明：${note}${checks.length ? `；已做排查：${checks.join('、')}` : ''}`,
  forward: (result: string) => `下送；处理结果：${result}`,
  forwardClosed: (result: string) => `下送（已回访过，直接结案）；处理结果：${result}`,
  withdrawForward: '撤回本次下送，回到处理中',
  /** 回访评价（PRD §8「回访：已解决 / 未解决」+ 满意度与补充说明） */
  surveyFeedback: (solved: boolean, score: number, remark: string) =>
    `回访：${solved ? '已解决' : '未解决'}；满意度：${score} 星${remark ? `；补充说明：${remark}` : ''}`,
  surveySolvedClosed: '回访已解决，工单结案。',
  surveyTimeoutClosed: '调研超时未评价，自动结案',
  /** 调研中催补拉回有处理人的单（基线 ※20，与四类工单同一口径） */
  csPullbackForward: (to: string) => `因客户催补，自动撤回本次下送：调研中 → ${to}。SLA 解决钟接着跑，不重置。`,
} as const;

/** SN 尾号（短信里只露后四位） */
export function snTail(sn: string): string {
  return sn.slice(-4);
}

/** 刷机成功短信（M14 / M32，暂行文案） */
export function flashSmsSuccess(no: string, sn: string): string {
  return `【讯飞客服】您的设备（SN尾号${snTail(sn)}）刷机包已推送成功，请保持设备开机并连接网络完成刷机。如有疑问请致电400热线，工单号：${no}。`;
}
/** 转人工短信（PRD §3.4 / §11.1，逐字） */
export function flashSmsHandoff(_no: string): string {
  return '刷机申请需人工核实，客服将尽快联系';
}

/** 用户侧回访评价页路径（M86） */
export function flashSurveyPath(no: string): string {
  return `/m/flash/survey?no=${no}`;
}
/** 通知内容里的评价链接（通知记录 Tab 据此把链接渲染为可点） */
export const FLASH_SURVEY_LINK_RE = /(\/m\/flash\/survey\?no=[A-Za-z0-9-]+)/;

/** 调研短信（PRD §8 / M86：含评价链接） */
export function flashSmsSurvey(no: string): string {
  return `【讯飞客服】您的刷机申请已处理，请点击链接评价本次服务：${flashSurveyPath(no)}。工单号：${no}。`;
}

/** 催单 / 新建补充站内通知（PRD §11.1：沿用现有催补通知文案） */
export const FLASH_CS_NOTICE = {
  urge: { title: '催单提醒', text: (no: string) => `客户已催单,请优先处理并尽快回访。工单号:${no}` },
  supplement: { title: '补充通知', text: (no: string) => `客户补充了新信息,请及时查阅。工单号:${no}` },
} as const;

/** 通知记录的事件码（接《【815】》通知规则事件目录，M14 新增 2 个 + M38 重推结果） */
export const FLASH_NOTIFY_EVENTS = {
  success: 'ticket.flash.succeeded',
  handoff: 'ticket.flash.handoff',
  repushResult: 'ticket.flash.repush.returned',
  l1RepushFailGroup: 'ticket.flash.repush.l1failed',
  escalateL2: 'ticket.flash.escalated',
  lateSuccess: 'ticket.flash.late.succeeded',
  survey: 'ticket.survey.sent',
  /** 受理短信：沿用建单受理通知事件与模板（PRD §2.5 / §11.1） */
  accepted: 'ticket.dispatched',
  urge: 'ticket.dunning.received',
  supplement: 'ticket.supplement.received',
} as const;

/* ------------------------------------------------------------------ */
/* 小工具                                                               */
/* ------------------------------------------------------------------ */

const pad = (n: number) => String(n).padStart(2, '0');

/** `YYYY-MM-DD HH:mm:ss` */
export function flashStamp(d: Date | number = new Date()): string {
  const x = typeof d === 'number' ? new Date(d) : d;
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())} ${pad(x.getHours())}:${pad(x.getMinutes())}:${pad(x.getSeconds())}`;
}

/** `YYYY-MM-DD HH:mm` */
export function flashMinuteStamp(d: Date | number = new Date()): string {
  return flashStamp(d).slice(0, 16);
}

/** 解析 `YYYY-MM-DD HH:mm(:ss)` 为本地时刻 */
export function parseFlashStamp(s: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(s.trim());
  if (!m) return new Date(s);
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6] ?? 0));
}

/** 人工角色是不是一线（一线重推限次、失败进二线池） */
export function isFrontlineActor(actor: FlashActor): boolean {
  return actor.role === '一线坐席';
}
