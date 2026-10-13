/**
 * 教育刷机单 · 常量与字段组类型 —— **单一真源**（930 教育刷机单 D1–D23 / M1–M36）。
 *
 * 建单表单、处理页区块、用户提报页、后台配置页、工作台页签等模块**只从这里取**枚举与类型，
 * 不在各自文件里另写一份。取值可被后台「刷机配置」覆盖的（机型 / 刷机原因 / 失败原因 /
 * 回传超时时长），这里给的是出厂值，运行时读 `stores/flashConfig.ts`。
 *
 * 本文件只放**常量、类型与纯函数**，不依赖 Pinia / 工单库，任何模块都可以放心引用。
 */
import type { TlRole } from '@/views/tickets/types/ticketDetail';

/** 刷机单的工单类型：刷机单＝咨询单 + 建单时写入的「刷机单」标识（1013 A1） */
export const FLASH_TICKET_TYPE = '咨询' as const;

/** 刷机单标识的展示名（类型徽章旁的标识、查询筛选项） */
export const FLASH_MARK_LABEL = '刷机';

/**
 * 是否刷机单 —— **全仓唯一判据**（1013 A1）：读工单上的 `isFlash` 标识。
 * 标识在建单时按「产品支持刷机 ∧ 问题分类是否刷机」写入，此后不随配置变化、不可修改；
 * 不要再用工单类型、单号前缀或标题判断刷机单。
 */
export function isFlashTicket(t: { isFlash?: boolean } | null | undefined): boolean {
  return t?.isFlash === true;
}

/** 刷机单标题前缀（1013 A3：强制加在标题最前） */
export const FLASH_TITLE_PREFIX = '刷机';

/** 刷机单标题：「刷机 · 〈产品名称〉 · 〈问题三级〉 · 〈工单来源〉」，空段跳过 */
export function flashTicketTitle(productName: string, problemL3?: string, source?: string): string {
  return [FLASH_TITLE_PREFIX, productName, problemL3, source].filter((s) => !!s?.trim()).join(' · ');
}

/** 标题补前缀：已以「刷机」开头的原样返回 */
export function withFlashTitlePrefix(title: string): string {
  const t = title.trim();
  if (t.startsWith(FLASH_TITLE_PREFIX)) return t;
  return t ? `${FLASH_TITLE_PREFIX} · ${t}` : FLASH_TITLE_PREFIX;
}

/** 支持刷机产品所在的产品分类（产品字段两级：产品分类 + 产品名称，1013 A4） */
export const FLASH_PRODUCT_CATEGORY = '学习硬件';

/** 刷机问题分类路径（1013 A5）：售后 → 服务申请 → 自助刷机 / 刷原生系统 */
export const FLASH_TAG_L1 = '售后';
export const FLASH_TAG_L2 = '服务申请';
export const FLASH_TAG_L3S = ['自助刷机', '刷原生系统'] as const;
/** 用户提报（小程序）自动匹配的问题三级 */
export const FLASH_TAG_L3_USER_REPORT = '自助刷机';

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
  '回访未解决',
  '回访期间客户催补',
] as const;
export type FlashHandoffReason = (typeof FLASH_HANDOFF_REASONS)[number];

/* ------------------------------------------------------------------ */
/* 处理结果（1013 A15 / A16 / A18 / B1，暂行清单）                       */
/* ------------------------------------------------------------------ */

/**
 * 处理结果取值全集。「已线上刷机成功」只由系统在重新推送接收成功时写入（B1），不在下拉里出；
 * 其余为人工可选项，按视角取 `flashResultOptions`。完整清单以业务提供为准。
 */
export const FLASH_RESULTS = [
  '已线上刷机成功',
  '已线下登记',
  '已线下登记、已推送',
  '升级二线',
  '婉拒',
  '已转售后',
  '联系不上用户',
  '用户放弃',
] as const;
export type FlashResult = (typeof FLASH_RESULTS)[number];
/** 系统写入的「刷机成功」类处理结果（推送接收成功，B1） */
export const FLASH_RESULT_ONLINE_SUCCESS: FlashResult = '已线上刷机成功';
/** 只完成线下登记、产线未推送：只能保存，留在本人名下（A16） */
export const FLASH_RESULT_OFFLINE: FlashResult = '已线下登记';
/** 产线已推送：可下送进回访（A16） */
export const FLASH_RESULT_OFFLINE_PUSHED: FlashResult = '已线下登记、已推送';
/** 一线专用：下送时二次确认后进教育刷机处理组池（A18） */
export const FLASH_RESULT_ESCALATE_L2: FlashResult = '升级二线';
/** 二线专用 */
export const FLASH_RESULT_AFTERSALE: FlashResult = '已转售后';

/** 处理结果下拉的人工可选项：一线有「升级二线」无「已转售后」，二线反之 */
export function flashResultOptions(line: FlashLine): FlashResult[] {
  return FLASH_RESULTS.filter((r) => r !== FLASH_RESULT_ONLINE_SUCCESS
    && (line === '一线' ? r !== FLASH_RESULT_AFTERSALE : r !== FLASH_RESULT_ESCALATE_L2));
}

/** 处理结果取值校验：不在现行取值全集内的一律按未选。存量旧取值只在读缓存时迁移一次（`stores/flash.ts`） */
export function normalizeFlashResult(v: string | undefined | null): FlashResult | '' {
  if (!v) return '';
  return (FLASH_RESULTS as readonly string[]).includes(v) ? (v as FlashResult) : '';
}

/** 下送拦截：处理结果为「已线下登记」（A15） */
export const FLASH_TIP_OFFLINE_FORWARD = '已线下登记，待产线推送后改为『已线下登记、已推送』再下送';
/** 下送确认：处理结果为「升级二线」（A18） */
export const FLASH_ESCALATE_CONFIRM_TEXT = '工单将转入二线继续处理';

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
  /** 产品名称（产品管理「是否支持刷机」开启的产品；用户提报按型号选） */
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
  /** 转人工原因（最近一次进池的缘由） */
  handoffReason?: FlashHandoffReason;
  /** 处理结果（下送必填） */
  result?: FlashResult;
  /** 关联投诉单号（弱关联，两单各自流转，1013 A21 / B5），时间正序 */
  linkedComplaintNos?: string[];
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
  /**
   * 最近一次调研短信发出时刻（YYYY-MM-DD HH:mm:ss，PRD §8 / M26′ / M86）：进「调研中」时写入，
   * 调研超时未评价按它 + `FLASH_SURVEY_TIMEOUT_HOURS` 判自动结案。
   */
  surveySentAt?: string;
  /** 用户回访评价（M86）：提交即记为已产生回访结论，一张单只评价一次 */
  survey?: FlashSurveyFeedback;
  /**
   * SLA 起算时间（YYYY-MM-DD HH:mm，PRD §4.3 / M88，1013 A26）：本单首次进入教育刷机处理组池的时刻
   * （转人工进池或一线升级二线），以最早一次为准，此后再次进池不改写；
   * 一线刷机池、一线名下、首推「自动刷机中」、自动刷机成功直进回访的单为空。
   */
  slaStartedAt?: string;
  /**
   * 累计停钟毫秒（PRD §4.3，D-01 账本）：已结束的各段停钟之和，默认 0。
   * 记「累计毫秒」而不是分段区间：读取 O(1)（页头每秒重算），撤回下送只要不动它剩余天然接续，
   * 缓存体积恒定。
   */
  slaPausedAccumMs?: number;
  /**
   * 当前这一段停钟的起点（YYYY-MM-DD HH:mm:ss）。有值即停钟中——**停钟判据以它为准**：
   * 重推「自动刷机中」、调研中、已转出等停钟时写它，恢复时并入 `slaPausedAccumMs` 后清空。
   */
  slaPausedSince?: string;
  /** 终态关钟时刻（YYYY-MM-DD HH:mm:ss）：结案 / 关闭 / 强结 / 取消等收口时写入，写入后钟不再走 */
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
  productCategory: '产品分类',
  productName: '产品名称',
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
  // 处理页口径：产品字段为「产品分类 + 产品名称」两级（1013 A4）；「产品型号」只留在用户提报页
  productModel: FLASH_FIELD_LABELS.productName,
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
 * 调研中 → 待回访；终态（已结案 / 已关闭 / 已强结 / 已取消）→ 已完成。刷机单不转单、关联投诉不改本单状态（1013 A21 / B2）。
 */
export type FlashProgressStage = '自动刷机中' | '人工处理中' | '待回访' | '已完成';

export function flashProgressStage(status: string): FlashProgressStage {
  if (status === '自动刷机中') return '自动刷机中';
  if (status === '调研中') return '待回访';
  if (['已结案', '已关闭', '已强结', '已取消', '直接结案'].includes(status)) {
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

/** A1：产品「是否支持刷机」未开启（用户提报拦截） */
export const FLASH_TIP_MODEL_UNSUPPORTED = '该机型暂不支持刷机申请，请核对产品型号';
/** 同一拦截落在坐席侧（新建工单、修改刷机信息弹窗）：产品字段叫「产品名称」（1013 A4，PRD §2.3 / §5.6） */
export const FLASH_TIP_PRODUCT_UNSUPPORTED = '该产品暂不支持刷机申请，请核对产品名称';
/** A2：同 SN 存在在途刷机单（M2；重推改 SN 撞在途单同文案，M44） */
export function flashTipInflight(inflightNo: string): string {
  return `该设备已有在途刷机单 ${inflightNo}，请勿重复提交`;
}
/** 在途查询不可用（M43） */
export const FLASH_TIP_SYSTEM_BUSY = '系统繁忙，请稍后再提交';
/** 非自研机型不可线上推送（M18） */
export const FLASH_TIP_NON_SELF_DEVELOPED = '该产品不支持线上推送，请线下登记';
/** 重推时刷机原因非毕业（M44） */
export const FLASH_TIP_REASON_NOT_GRADUATE_L1 = '刷机原因不是毕业，请升级二线处理';
export const FLASH_TIP_REASON_NOT_GRADUATE_L2 = '刷机原因不是毕业，请线下登记或婉拒';
/** 重推前建单校验不通过（M36 / PRD §5.6 提交判定第 8、9 条，逐字） */
export function flashTipVerifyFailed(l2: FlashFailL2): string {
  return l2 === 'SN与学生账号不一致'
    ? 'SN与学生账号不一致，请核实后再推送'
    : '未查询到该学生的毕业生身份，请核实后再推送';
}
/** 处理表单 · 下送必填（PRD §5.4） */
export const FLASH_TIP_RESULT_REQUIRED = '请选择处理结果';

/** Toast（PRD §5.5 / §5.6 / §5.7 / §5.8，逐字） */
export const FLASH_TOAST = {
  repushed: '已重新推送',
  repushPushError: '刷机推送未成功，请稍后重试或线下登记',
  infoSaved: '已保存修改',
  escalatedL2: '已升级至教育刷机处理组',
  forwarded: '已下送，工单进入「调研中」',
  forwardClosed: '已结案',
  linkedComplaint: (no: string) => `已关联投诉单 ${no}`,
} as const;

/** 站内通知文案（M67 / PRD §11.1，逐字） */
export const FLASH_NOTICE = {
  repushSuccess: (no: string) => `${no}重推结果：接收成功`,
  /** `reasonText` ＝「〈一级失败原因〉 · 〈二级失败原因〉」 */
  repushFail: (no: string, reasonText: string) => `${no}重推结果：${reasonText}`,
  escalatedToGroup: (no: string) => `${no}已升级至教育刷机处理组，待领取`,
  lateSuccess: (no: string) => `${no}收到迟到回传：接收成功`,
} as const;
/** 重推时建单校验接口不可用（M55） */
export const FLASH_TIP_VERIFY_UNAVAILABLE = '建单校验暂不可用，请稍后重试或线下登记';
/** 当前状态不可重推 */
export const FLASH_TIP_REPUSH_STATE = '当前工单状态不可重新推送';
/** 当前状态不可修改刷机信息（M52：待响应、处理中可改） */
export const FLASH_TIP_EDIT_STATE = '当前工单状态不可修改刷机信息';
/** 自动刷机中的冻结原因（PRD §3.1 / §5.5：底栏置灰、取消工单置灰、「修改刷机信息」置灰的悬停原因） */
export const FLASH_TIP_AUTO_FLASHING = '自动刷机进行中，回传结果后再操作';

/* ------------------------------------------------------------------ */
/* 外部平台外链（M23 / M62，新窗口打开）                                  */
/* ------------------------------------------------------------------ */

export const FLASH_EXTERNAL_LINKS = {
  /** 智能硬件平台（自动刷机结果卡卡头）：按 SN 查推送与回传 */
  hardwarePlatform: { label: '智能硬件平台', url: 'https://hwp.iflytek.com/device/push-records' },
  /** MDM 平台（自动刷机结果卡卡头，1013 A24） */
  mdm: { label: 'MDM 平台', url: 'https://mdm.iflytek.com/console/devices' },
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
  /** `source` ＝ 工单来源（沿用现有工单来源口径） */
  create(source: string, verify: FlashVerifyResult, dest: { auto: true } | { handoff: FlashHandoffReason }): string {
    const v = verify.status === '未校验' ? '建单校验：未校验' : flashVerifyText(verify);
    const d = 'auto' in dest ? '进入自动刷机中' : `转人工原因：${dest.handoff}`;
    return `创建刷机单 · ${source}；${v}；${d}`;
  },
  autoPush: (seq: number) => `推送刷机包 · 第 ${seq} 次推送 · 发起方：系统`,
  repush: (seq: number, run: Pick<FlashRun, 'by' | 'line'>) => `重新推送 · 第 ${seq} 次推送 · 发起方：${flashRunInitiator(run)}`,
  returnSuccess: '回传结果：接收成功',
  /** `reasonText` ＝ 失败原因展示文案「接收失败 · 〈二级〉」 */
  returnFail: (reasonText: string) => `回传结果：${reasonText}`,
  /** 重新推送接收成功：系统写入处理结果并转入回访（B1） */
  repushSuccessSurvey: '重推成功，自动进入回访',
  /** 重新推送接收成功、本单已有回访结论：直接结案（B1） */
  repushSuccessClosed: '重推成功（已回访过，直接结案）',
  lateSuccess: '回传结果（迟到）：接收成功，子状态未变更',
  /** `reasonText` ＝「推送异常 · 接口异常」 */
  pushApiError: (reasonText: string) => `${reasonText}（已自动重试 1 次）`,
  verifyApiError: (reasonText: string) => `${reasonText}（建单校验未执行）`,
  /** `reasonText` ＝「推送异常 · 回传超时」 */
  returnTimeout: (reasonText: string, hours: number) => `${reasonText}（推送后 ${hours} 小时无回传）`,
  handoff: (reason: FlashHandoffReason, poolLabel: string) => `转人工 · ${reason} → ${poolLabel}`,
  repushFailBack: (handler: string) => `重推失败 · 交回 ${handler}`,
  editInfo: '修改刷机信息',
  /** 保存「已线下登记」时追加进处理记录的一行（A16），`time` ＝ 保存时刻 */
  offlineRegister: (time: string) => `已线下登记，${time}`,
  /** 改为「已线下登记、已推送」并保存时追加进处理记录的一行（A16） */
  offlinePushed: '产线已推送',
  /** 升级二线（A18）：「升级至教育刷机处理组」＋ 最近一条处理记录 */
  escalateL2: (record?: string) =>
    `升级至教育刷机处理组${record?.trim() ? `；处理记录：${record.trim()}` : ''}`,
  /** 关联投诉（A21 / B5）：两单各自流转，本单状态不变 */
  linkComplaint: (no: string) => `关联投诉单 ${no}`,
  /** 投诉单侧（A21） */
  linkedFromFlash: (no: string) => `关联刷机单 ${no}`,
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

/** 人工角色是不是一线（推送记录发起方线别、一线 / 二线重推的触发方式） */
export function isFrontlineActor(actor: FlashActor): boolean {
  return actor.role === '一线坐席';
}
