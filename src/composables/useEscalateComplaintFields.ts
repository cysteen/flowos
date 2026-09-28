import { computed, reactive, watch } from 'vue';
import type { Ticket } from '@/views/tickets/types/ticket';
import { COMPLAINT_L1_OPTIONS, COMPLAINT_L2_MAP } from '@/views/tickets/types/createTicket';

/**
 * 风险评估选「升级」时要补齐的那一段：**投诉单专属建单要素**（投诉一类 / 投诉二类）
 * 加**升级说明**，三项均必填，升级说明排在两项分类之后、段内最后一项。
 *
 * 【与建单弹窗的关系】两项分类的取值域与级联取建单弹窗那一份（`types/createTicket.ts`）：
 * 走 `COMPLAINT_L1_OPTIONS` + `COMPLAINT_L2_MAP`。**本文件不新造任何枚举**。
 *
 * 【字段范围】只这三项，**不按原单来源分岔**：任何非投诉单升级都出同一份字段表。
 * 投诉平台 / 编号、投诉类型、归属业务线、前期是否反馈、投诉接收时间、服务回溯
 * 由接手人在新投诉单上走工单页「补充投诉信息」补录，不在评估弹窗里出。
 *
 * 【升级说明为什么也在这里】它是评估结论的一部分（落 `assessment.advice`）、又是派生新单
 * 问题描述的后半段，各处评估弹窗此前各自摆一个独立字段。值收在本 composable 的
 * `fields.advice` 上，选「不升级」时那格改叫「反馈意见」、由宿主弹窗自己那一格渲染，
 * 读写的仍是这同一个格子 —— 各处不各存一份。
 *
 * 【三处共用】风险监控页评估处置工作面、风险报备池、工单页底栏「风险评估」
 * 三处评估弹窗都调本 composable + `EscalateComplaintFields.vue`，
 * 字段、级联与校验只此一份。
 */

export interface EscalateComplaintFieldsState {
  complaintL1: string;
  complaintL2: string;
  /** 升级说明（选「不升级」时同一个格子在宿主弹窗里叫「反馈意见」） */
  advice: string;
}

/** 字段下方的红字提示；空串＝这一项没错 */
export interface EscalateComplaintFieldErrors {
  complaintL1: string;
  complaintL2: string;
  advice: string;
}

/**
 * 提交时随派生动作**写到新投诉单字段上**的那一份值。
 * 升级说明不在其内：它走派生入参 `reason`（拼进新单问题描述）与结论 `assessment.advice`。
 */
export type EscalateComplaintPayload = Pick<
  EscalateComplaintFieldsState,
  'complaintL1' | 'complaintL2'
>;

function emptyFields(): EscalateComplaintFieldsState {
  return {
    complaintL1: '',
    complaintL2: '',
    advice: '',
  };
}

function emptyErrors(): EscalateComplaintFieldErrors {
  return {
    complaintL1: '',
    complaintL2: '',
    advice: '',
  };
}

/** 派生新投诉单时这一份值要写到新单的哪些字段上（`derivedTickets.deriveComplaint` 的 overrides） */
export function escalateComplaintOverrides(p: EscalateComplaintPayload): Partial<Ticket> {
  return {
    complaintL1: p.complaintL1,
    complaintL2: p.complaintL2,
  };
}

export function useEscalateComplaintFields() {
  const fields = reactive<EscalateComplaintFieldsState>(emptyFields());
  const errors = reactive<EscalateComplaintFieldErrors>(emptyErrors());

  const complaintL1Options = computed(() =>
    COMPLAINT_L1_OPTIONS.map((v) => ({ value: v, label: v })),
  );
  const complaintL2Options = computed(() =>
    (COMPLAINT_L2_MAP[fields.complaintL1] ?? []).map((v) => ({ value: v, label: v })),
  );

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

  // 补上值即收起该项的红字，不必再点一次提交才知道自己填对了
  watch(fields, () => {
    if (fields.complaintL1) errors.complaintL1 = '';
    if (fields.complaintL2) errors.complaintL2 = '';
    if (fields.advice.trim()) errors.advice = '';
  });

  /** 必填校验：三项都得填，缺项各自出红字 */
  function validate(): boolean {
    clearErrors();
    if (!fields.complaintL1) errors.complaintL1 = '请选择投诉一类';
    if (!fields.complaintL2) errors.complaintL2 = '请选择投诉二类';
    if (!fields.advice.trim()) errors.advice = '请填写升级说明';
    return !Object.values(errors).some(Boolean);
  }

  /** 交给派生动作的那一份值 */
  function payload(): EscalateComplaintPayload {
    return {
      complaintL1: fields.complaintL1,
      complaintL2: fields.complaintL2,
    };
  }

  return {
    fields,
    errors,
    complaintL1Options,
    complaintL2Options,
    reset,
    clearErrors,
    validate,
    payload,
  };
}

/** 三处评估弹窗共用的实例类型（`EscalateComplaintFields.vue` 的唯一入参） */
export type EscalateComplaintFieldsCtl = ReturnType<typeof useEscalateComplaintFields>;
