import { computed, reactive, watch } from 'vue';
import { TICKETS } from '@/mock/tickets';
import { useDerivedTicketStore } from '@/stores/derivedTickets';
import type { Ticket } from '@/views/tickets/types/ticket';
import {
  BUSINESS_LINE_OPTIONS,
  COMPLAINT_L1_OPTIONS,
  COMPLAINT_L2_MAP,
  COMPLAINT_TYPE_OPTIONS,
  CUSTOM_PLATFORM_OPTION,
  PRIOR_FEEDBACK_OPTIONS,
  complaintPlatformsBySource,
  isRestrictedTicketSource,
  normalizeTicketSource,
  resolveTicketSourceForList,
} from '@/views/tickets/types/createTicket';

/**
 * 风险评估选「升级」时要补齐的**投诉单专属建单要素**。
 *
 * 【与建单弹窗的关系】口径、取值域与级联全部取建单弹窗那一份（`types/createTicket.ts`）：
 * 投诉一类 / 二类走 `COMPLAINT_L1_OPTIONS` + `COMPLAINT_L2_MAP`，投诉平台按来源取
 * `complaintPlatformsBySource`（外投 → 外部平台字典、内投 → 公司前台 / 官网监督举报 / 其他），
 * 投诉类型 / 归属业务线 / 前期是否反馈各取自己那一份常量。**本文件不新造任何枚举**。
 *
 * 【判据】出哪些字段按**原工单的工单来源**决定，与建单弹窗 `showChannelComplaintFields` 同一条：
 * 来源 ∈ 内投渠道 / 外投渠道 才出渠道台账那一组（平台 / 编号 / 投诉类型 / 归属业务线 /
 * 前期是否反馈 / 投诉接收时间 / 服务回溯）；热线、IM、小程序等来源只出一类 / 二类。
 *
 * 【三个入口共用】工单页底栏「风险评估」、风险监控页评估工作面、风险报备池三处评估弹窗
 * 都调本 composable + `EscalateComplaintFields.vue`，字段、级联与校验只此一份。
 */

export interface EscalateComplaintPlatformRow {
  platform: string;
  /** 平台选「其他」时手填的平台名称 */
  customPlatform?: string;
  complaintNo: string;
}

export interface EscalateComplaintFieldsState {
  complaintL1: string;
  complaintL2: string;
  complaintType: string;
  businessLine: string;
  priorFeedback: string;
  /** 投诉接收时间（非必填） */
  complaintReceiveTime: string;
  /** 服务回溯（非必填，自由文本） */
  serviceReview: string;
  /** 投诉平台 + 投诉编号：成对多组，与建单弹窗同一套结构 */
  platforms: EscalateComplaintPlatformRow[];
}

/** 字段下方的红字提示；空串＝这一项没错 */
export interface EscalateComplaintFieldErrors {
  complaintL1: string;
  complaintL2: string;
  complaintType: string;
  businessLine: string;
  priorFeedback: string;
  /** 平台 / 编号 / 平台名称的提示挂在**首组**下方，多组共用一行 */
  platform: string;
  complaintNo: string;
  customPlatform: string;
}

/** 提交时随派生动作交给新投诉单的那一份值（隐藏字段一律不落） */
export type EscalateComplaintPayload = EscalateComplaintFieldsState;

function emptyFields(): EscalateComplaintFieldsState {
  return {
    complaintL1: '',
    complaintL2: '',
    complaintType: '',
    businessLine: '',
    priorFeedback: '',
    complaintReceiveTime: '',
    serviceReview: '',
    platforms: [{ platform: '', complaintNo: '' }],
  };
}

function emptyErrors(): EscalateComplaintFieldErrors {
  return {
    complaintL1: '',
    complaintL2: '',
    complaintType: '',
    businessLine: '',
    priorFeedback: '',
    platform: '',
    complaintNo: '',
    customPlatform: '',
  };
}

/**
 * 原单的**工单来源**——本组字段显隐与必填强弱的唯一判据。
 *
 * 取数与工单列表 / 处理页同一条解析口径（`resolveTicketSourceForList`：先看 `ticketSource`，
 * 缺省由接入渠道反推），来源库先静态工单库、再运行时派生单。
 *
 * 🔴 **原单查不到时返回空串**，于是 `showChannelFields` 为 false ——
 * 按"非内投 / 外投"处理，只出投诉一类 / 二类。不猜一个来源出来：猜成外投会把
 * 平台 / 编号判成必填，把人卡在一个他根本无从填起的弹窗里。
 */
export function originTicketSourceOf(ticketNo?: string): string {
  if (!ticketNo) return '';
  const t: Ticket | undefined =
    TICKETS.find((x) => x.no === ticketNo) ?? useDerivedTicketStore().find(ticketNo);
  if (!t) return '';
  return normalizeTicketSource(resolveTicketSourceForList(t));
}

/** 派生新投诉单时这一份值要写到新单的哪些字段上（`derivedTickets.deriveComplaint` 的 overrides） */
export function escalateComplaintOverrides(p: EscalateComplaintPayload): Partial<Ticket> {
  const o: Partial<Ticket> = {
    complaintL1: p.complaintL1,
    complaintL2: p.complaintL2,
  };
  // 空值不写：派生单的 `complaintType` 默认已是「投诉」，写空串会把它抹掉
  if (p.complaintType) o.complaintType = p.complaintType;
  if (p.businessLine) o.businessLine = p.businessLine;
  if (p.priorFeedback) o.priorFeedback = p.priorFeedback;
  if (p.serviceReview) o.serviceReview = p.serviceReview;
  if (p.complaintReceiveTime) o.complaintReceivedAt = p.complaintReceiveTime;
  if (p.platforms.length) o.complaintPlatforms = p.platforms.map((r) => ({ ...r }));
  return o;
}

export function useEscalateComplaintFields(ticketNo: () => string | undefined) {
  const fields = reactive<EscalateComplaintFieldsState>(emptyFields());
  const errors = reactive<EscalateComplaintFieldErrors>(emptyErrors());

  const originSource = computed(() => originTicketSourceOf(ticketNo()));
  /** 渠道台账那一组的门控：与建单弹窗 `showChannelComplaintFields` 同一条判据 */
  const showChannelFields = computed(() => isRestrictedTicketSource(originSource.value));
  /** 原单为外投 → 平台 / 编号必填；内投非必填 */
  const externalOrigin = computed(() => originSource.value === '外投渠道');

  const platformOptions = computed(() =>
    complaintPlatformsBySource(originSource.value).map((v) => ({ value: v, label: v })),
  );
  const complaintL1Options = computed(() =>
    COMPLAINT_L1_OPTIONS.map((v) => ({ value: v, label: v })),
  );
  const complaintL2Options = computed(() =>
    (COMPLAINT_L2_MAP[fields.complaintL1] ?? []).map((v) => ({ value: v, label: v })),
  );
  const complaintTypeOptions = computed(() =>
    COMPLAINT_TYPE_OPTIONS.map((v) => ({ value: v, label: v })),
  );
  const businessLineOptions = computed(() =>
    BUSINESS_LINE_OPTIONS.map((v) => ({ value: v, label: v })),
  );
  const priorFeedbackOptions = computed(() =>
    PRIOR_FEEDBACK_OPTIONS.map((v) => ({ value: v, label: v })),
  );

  function addPlatform() {
    fields.platforms.push({ platform: '', complaintNo: '' });
  }

  function removePlatform(i: number) {
    fields.platforms.splice(i, 1);
    if (!fields.platforms.length) addPlatform();
  }

  function clearErrors() {
    Object.assign(errors, emptyErrors());
  }

  function reset() {
    Object.assign(fields, emptyFields());
    clearErrors();
  }

  // 投诉一类 → 二类级联，与建单弹窗同一条：二类不在新一类的取值域里就落到首项
  watch(
    () => fields.complaintL1,
    () => {
      const opts = COMPLAINT_L2_MAP[fields.complaintL1] ?? [];
      if (!opts.includes(fields.complaintL2)) fields.complaintL2 = opts[0] ?? '';
    },
  );

  // 原单来源变了（弹窗换了一条条目）→ 平台字典跟着换，已填的平台若不在新字典里就清掉
  watch(originSource, () => {
    const allowed = complaintPlatformsBySource(originSource.value);
    const stillValid = fields.platforms.every((r) => !r.platform || allowed.includes(r.platform));
    if (!stillValid) fields.platforms = [{ platform: '', complaintNo: '' }];
  });

  // 补上值即收起该项的红字，不必再点一次提交才知道自己填对了
  watch(
    fields,
    () => {
      if (fields.complaintL1) errors.complaintL1 = '';
      if (fields.complaintL2) errors.complaintL2 = '';
      if (fields.complaintType) errors.complaintType = '';
      if (fields.businessLine) errors.businessLine = '';
      if (fields.priorFeedback) errors.priorFeedback = '';
      if (fields.platforms[0]?.platform) errors.platform = '';
      if (fields.platforms[0]?.complaintNo.trim()) errors.complaintNo = '';
      if (
        !fields.platforms.some(
          (r) => r.platform === CUSTOM_PLATFORM_OPTION && !(r.customPlatform ?? '').trim(),
        )
      ) {
        errors.customPlatform = '';
      }
    },
    { deep: true },
  );

  /**
   * 必填校验。**隐藏的字段不参与校验** —— 判据与显隐共用 `showChannelFields`，
   * 否则来源＝热线的原单会被一个看不见的「归属业务线」卡住提交。
   */
  function validate(): boolean {
    clearErrors();
    if (!fields.complaintL1) errors.complaintL1 = '请选择投诉一类';
    if (!fields.complaintL2) errors.complaintL2 = '请选择投诉二类';
    if (showChannelFields.value) {
      if (!fields.complaintType) errors.complaintType = '请选择投诉类型';
      if (!fields.businessLine) errors.businessLine = '请选择归属业务线';
      if (!fields.priorFeedback) errors.priorFeedback = '请选择前期是否反馈';
      const first = fields.platforms[0];
      if (externalOrigin.value) {
        if (!first?.platform) errors.platform = '请选择投诉平台';
        if (!first?.complaintNo.trim()) errors.complaintNo = '请填写投诉编号';
      }
      // 平台选了「其他」，平台名称就得写——内外投同一条，否则台账上留一个叫「其他」的平台
      if (
        fields.platforms.some(
          (r) => r.platform === CUSTOM_PLATFORM_OPTION && !(r.customPlatform ?? '').trim(),
        )
      ) {
        errors.customPlatform = '请填写平台名称';
      }
    }
    return !Object.values(errors).some(Boolean);
  }

  /** 交给派生动作的那一份值：隐藏字段一律不落，空组的平台 / 编号不落 */
  function payload(): EscalateComplaintPayload {
    const channel = showChannelFields.value;
    return {
      complaintL1: fields.complaintL1,
      complaintL2: fields.complaintL2,
      complaintType: channel ? fields.complaintType : '',
      businessLine: channel ? fields.businessLine : '',
      priorFeedback: channel ? fields.priorFeedback : '',
      complaintReceiveTime: channel ? fields.complaintReceiveTime : '',
      serviceReview: channel ? fields.serviceReview.trim() : '',
      platforms: channel
        ? fields.platforms
          .filter((r) => r.platform || r.complaintNo.trim())
          .map((r) => ({
            platform: r.platform,
            ...((r.customPlatform ?? '').trim()
              ? { customPlatform: (r.customPlatform ?? '').trim() }
              : {}),
            complaintNo: r.complaintNo.trim(),
          }))
        : [],
    };
  }

  return {
    fields,
    errors,
    originSource,
    showChannelFields,
    externalOrigin,
    platformOptions,
    complaintL1Options,
    complaintL2Options,
    complaintTypeOptions,
    businessLineOptions,
    priorFeedbackOptions,
    CUSTOM_PLATFORM_OPTION,
    addPlatform,
    removePlatform,
    reset,
    clearErrors,
    validate,
    payload,
  };
}

/** 三个评估入口共用的实例类型（`EscalateComplaintFields.vue` 的唯一入参） */
export type EscalateComplaintFieldsCtl = ReturnType<typeof useEscalateComplaintFields>;
