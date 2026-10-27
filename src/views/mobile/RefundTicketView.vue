<script setup lang="ts">
import { computed, nextTick, reactive, ref, toRaw, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { message } from 'ant-design-vue';
import { PaperClipOutlined } from '@ant-design/icons-vue';
import { useRefundStore } from '@/stores/refund';
import { queryRefundCommodities, type RefundOrder } from '@/mock/refund/commodities';
import { ALL_REFUND_MANAGERS } from '@/mock/refund/managers';
import { STATUS_DISPLAY_NAME, statusStyle } from '@/views/tickets/types/ticket';
import {
  REFUND_COMM_NOTE_PLACEHOLDER, REFUND_COMM_NOTE_RESULTS, REFUND_COMM_RESULTS, REFUND_PARTY, REFUND_REASONS,
  REFUND_RETURN_WAY, REFUND_TEXT_MAX, REFUND_TIP,
  emptyRefundHandle, formatRefundAmount, inflightRefundRun, refundAmountOf, refundOwnResultOf, refundReasonLabel,
  sumRefundApply,
  type RefundCommResult, type RefundHandle, type RefundManager, type RefundReasonCode, type RefundSubject,
} from '@/views/tickets/types/refund';
import FlashMobileShell from './FlashMobileShell.vue';
import RefundCommodityPicker from './RefundCommodityPicker.vue';
import { refundH5Account } from './RefundH5Identity';

/**
 * 移动工单 H5 · 个册退费单详情与处理（1120 个册退费 PRD 5.5 / 5.4 / 3.2 / 附录 A.3；老系统 H5 平移）。
 * 基本信息 · 附件 · 工单历史 · 退费信息表单，底栏「下送 · 保存 · 转办」，全部经个册退费服务落库。
 * 身份：路由参数 `account`（单点登录带入的域账号）；待办通知链接只带单号时按本单外部处理人进入。
 */
const route = useRoute();
const router = useRouter();
const store = useRefundStore();

const no = computed(() => String(route.query.no ?? ''));
const ticket = computed(() => {
  void store.revisionOf(no.value);
  return store.rowOf(no.value);
});
const refund = computed(() => ticket.value?.refund);
const actor = computed(() => {
  void store.revisionOf(no.value);
  return store.h5ActorOf(no.value);
});
const account = computed(() => refundH5Account(route.query.account) ?? actor.value?.account);

/** 单在本人名下、可保存 / 下送 / 转办 */
const canAct = computed(() => {
  void store.revisionOf(no.value);
  const m = refund.value?.state.manager;
  return !!m && m.account === account.value && store.h5Gate(no.value).ok;
});
/** 系统退费中：本人是最近一次提交人，底栏照常出，操作被拦截（PRD 5.4） */
const lockedForMe = computed(() => {
  void store.revisionOf(no.value);
  const g = store.h5Gate(no.value);
  return refund.value?.state.lastSubmitter?.account === account.value && !g.ok && !!g.message;
});
const showFooter = computed(() => canAct.value || lockedForMe.value);

/* ---------------- 基本信息 ---------------- */

const basicRows = computed(() => {
  const t = ticket.value;
  const info = refund.value?.info;
  if (!t || !info) return [];
  const dash = (v?: string) => (v && v.trim() ? v : '—');
  return [
    ['工单标题', t.title],
    ['问题分类', [t.problemL1, t.problemL2, t.problemL3].filter(Boolean).join(' / ')],
    ['投诉分类', dash([t.complaintL1, t.complaintL2].filter(Boolean).join(' / '))],
    ['省市', info.schoolRegion.split(' / ').slice(0, 2).join(' / ')],
    ['学校名称', info.schoolName],
    ['登录账号', info.studentCode],
    ['订单号', dash(info.orderNo)],
    ['订单金额', typeof info.refundableAmount === 'number' ? `${formatRefundAmount(info.refundableAmount)} 元` : '—'],
    ['退款原因', dash(refundReasonLabel(info.reason))],
    ['描述内容', dash(t.problemDesc)],
    ['预处理信息', dash(t.latestHandling)],
  ] as [string, string][];
});

const attachments = computed(() => ticket.value?.problemDescAttachments ?? []);
const history = computed(() => [...(ticket.value?.eventTimeline ?? [])].reverse());

/* ---------------- 退费信息表单 ---------------- */

const form = reactive<RefundHandle>(emptyRefundHandle());
type ErrKey = 'submitRefund' | 'commResult' | 'commNote' | 'orderNo' | 'studentCode' | 'subjects'
  | 'reason' | 'reasonDesc' | 'closeAuth' | 'notCloseReason' | 'remark';
const errors = reactive<Partial<Record<ErrKey, string>>>({});

function clr(k: ErrKey) {
  delete errors[k];
}

/** 单科退费金额：输入框原文与逐科错误（按 订单 · 套餐 · 学科 定位） */
const amtKey = (s: Pick<RefundSubject, 'payOrderId' | 'commodityId' | 'subjectCode'>) =>
  `${s.payOrderId}|${s.commodityId}|${s.subjectCode}`;
const amtText = reactive<Record<string, string>>({});
const amtErrors = reactive<Record<string, string>>({});

function clearErrors() {
  (Object.keys(errors) as ErrKey[]).forEach((k) => delete errors[k]);
  Object.keys(amtErrors).forEach((k) => delete amtErrors[k]);
}

function resetAmtText() {
  Object.keys(amtText).forEach((k) => delete amtText[k]);
}

function load() {
  const h = refund.value?.handle;
  Object.assign(form, h ? structuredClone(toRaw(h)) : emptyRefundHandle());
  form.subjects = (h?.subjects ?? []).map((s) => ({ ...toRaw(s) }));
  resetAmtText();
  clearErrors();
}
watch(() => [no.value, ticket.value?.nodeStatus], load, { immediate: true });

// 订单号改动后，已选的他单学科作废
watch(() => form.orderNo, (v) => {
  const key = v.trim();
  if (form.subjects.some((s) => s.payOrderId !== key)) form.subjects = form.subjects.filter((s) => s.payOrderId === key);
});

const showRefundFields = computed(() => form.submitRefund !== '否');
const needCommNote = computed(() => (REFUND_COMM_NOTE_RESULTS as readonly string[]).includes(form.commResult));
const needNotCloseReason = computed(() => form.closeAuth === '否');
const needRemark = computed(() => form.submitRefund === '否');

const YES_NO = [{ value: '是', label: '是' }, { value: '否', label: '否' }];
const COMM_OPTIONS = REFUND_COMM_RESULTS.map((v) => ({ value: v, label: v }));
const REASON_OPTIONS = REFUND_REASONS.map((r) => ({ value: r.code, label: r.label }));

const submitRefundModel = computed({
  get: () => form.submitRefund || undefined,
  set: (v: '是' | '否' | undefined) => { form.submitRefund = v ?? ''; delete errors.submitRefund; delete errors.remark; },
});
const commResultModel = computed({
  get: () => form.commResult || undefined,
  set: (v: RefundCommResult | undefined) => { form.commResult = v ?? ''; delete errors.commResult; delete errors.commNote; },
});
const reasonModel = computed({
  get: () => form.reason ?? undefined,
  set: (v: RefundReasonCode | undefined) => { form.reason = v ?? null; delete errors.reason; },
});
const closeAuthModel = computed({
  get: () => form.closeAuth || undefined,
  set: (v: '是' | '否' | undefined) => { form.closeAuth = v ?? ''; delete errors.closeAuth; delete errors.notCloseReason; },
});

/** 已选退费商品按套餐分组，学科逐行带可退金额 */
const subjectGroups = computed(() => {
  const map = new Map<string, RefundSubject[]>();
  form.subjects.forEach((s) => {
    const k = s.commodityName;
    map.set(k, [...(map.get(k) ?? []), s]);
  });
  return [...map.entries()].map(([name, subjects]) => ({ name, subjects }));
});

/** 金额回显：两位小数；多于两位的原样回显 */
function amtDisplay(n: number | null): string {
  if (n == null) return '';
  return Math.abs(Math.round(n * 100) - n * 100) < 1e-6 ? formatRefundAmount(n) : String(n);
}

function amtValue(s: RefundSubject): string {
  return amtText[amtKey(s)] ?? amtDisplay(refundAmountOf(s));
}

function onAmtInput(s: RefundSubject, raw: string) {
  const k = amtKey(s);
  const [int, ...rest] = raw.replace(/[^\d.]/g, '').split('.');
  const v = rest.length ? `${int}.${rest.join('')}` : int;
  amtText[k] = v;
  const n = v === '' || v === '.' ? null : Number(v);
  s.refundAmount = n == null || Number.isNaN(n) ? null : n;
  delete amtErrors[k];
}

const amtTotal = computed(() => formatRefundAmount(sumRefundApply(form.subjects)));

/** 单科退费金额校验：必填、大于 0、不超过可退金额、最多两位小数 */
function checkAmounts(): boolean {
  let ok = true;
  form.subjects.forEach((s) => {
    const k = amtKey(s);
    const text = amtValue(s).trim();
    const n = refundAmountOf(s);
    let err = '';
    if (!text || n == null) err = REFUND_TIP.amountRequired;
    else if (n <= 0) err = REFUND_TIP.amountPositive;
    else if (/\.\d{3,}$/.test(text)) err = REFUND_TIP.amountDecimals;
    else if (n > s.amount) err = REFUND_TIP.amountOver(formatRefundAmount(s.amount));
    if (err) {
      amtErrors[k] = err;
      ok = false;
    }
  });
  return ok;
}

const hasAmtError = computed(() => Object.keys(amtErrors).length > 0);

const lastRun = computed(() => {
  const runs = refund.value?.runs ?? [];
  return runs[runs.length - 1];
});
const ownResult = computed(() => (lastRun.value ? refundOwnResultOf(lastRun.value.status) : ''));

/* ---------------- 选择退费商品 ---------------- */

const pickerOpen = ref(false);
const pickerOrders = ref<RefundOrder[]>([]);

function openPicker() {
  if (!canAct.value) return;
  delete errors.subjects;
  if (!form.orderNo.trim()) {
    errors.orderNo = '请填写订单号';
    return;
  }
  const q = queryRefundCommodities(refund.value!.info.schoolId, form.studentCode, form.orderNo);
  if (!q.ok) {
    message.error('可退套餐查询失败，请稍后重试');
    return;
  }
  if (!q.orders.length) {
    errors.subjects = REFUND_TIP.orderNoPackages;
    return;
  }
  pickerOrders.value = q.orders;
  pickerOpen.value = true;
}

function onPicked(subjects: RefundSubject[]) {
  // 已选学科保留已填退费金额，新选学科默认带出可退金额
  const prev = new Map(form.subjects.map((s) => [amtKey(s), s]));
  form.subjects = subjects.map((s) => {
    const p = prev.get(amtKey(s));
    return { ...s, refundAmount: p ? refundAmountOf(p) : s.amount };
  });
  Object.keys(amtText).forEach((k) => { if (!subjects.some((s) => amtKey(s) === k)) delete amtText[k]; });
  Object.keys(amtErrors).forEach((k) => delete amtErrors[k]);
  pickerOpen.value = false;
  if (subjects.length) delete errors.subjects;
}

/* ---------------- 校验 ---------------- */

const over = (s: string) => s.trim().length > REFUND_TEXT_MAX;

function checkLength(): boolean {
  let ok = true;
  if (showRefundFields.value && over(form.reasonDesc)) { errors.reasonDesc = REFUND_TIP.tooLong('退款原因说明'); ok = false; }
  if (showRefundFields.value && needNotCloseReason.value && over(form.notCloseReason)) {
    errors.notCloseReason = REFUND_TIP.tooLong('不关闭权限原因');
    ok = false;
  }
  return ok;
}

/** 下送校验（PRD 5.5）：必填 → 字数 → 订单无可退套餐 */
function validateForward(): boolean {
  clearErrors();
  if (!form.submitRefund) errors.submitRefund = '请选择是否在线退费';
  if (!form.commResult) errors.commResult = '请选择沟通结果';
  if (needCommNote.value && !form.commNote.trim()) errors.commNote = '请填写备注';
  if (!form.orderNo.trim()) errors.orderNo = '请填写订单号';
  if (!form.studentCode.trim()) errors.studentCode = '请填写登录账号';
  if (form.submitRefund === '是') {
    if (!form.subjects.length) errors.subjects = '请选择退费商品';
    else checkAmounts();
    if (form.reason == null) errors.reason = '请选择退款原因';
    if (!form.reasonDesc.trim()) errors.reasonDesc = '请填写退款原因说明';
    if (!form.closeAuth) errors.closeAuth = '请选择是否关闭权限';
    if (form.closeAuth === '否' && !form.notCloseReason.trim()) errors.notCloseReason = '请填写不关闭权限原因';
  }
  if (needRemark.value && !form.remark.trim()) errors.remark = '请填写备注';
  if (Object.keys(errors).length === 0 && !hasAmtError.value) checkLength();
  if (Object.keys(errors).length === 0 && !hasAmtError.value && form.submitRefund === '是') {
    const q = queryRefundCommodities(refund.value!.info.schoolId, form.studentCode, form.orderNo);
    if (q.ok && !q.orders.length) errors.subjects = REFUND_TIP.orderNoPackages;
  }
  if (Object.keys(errors).length || hasAmtError.value) {
    nextTick(() => document.querySelector('.rf-row.has-error')?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
    return false;
  }
  return true;
}

/* ---------------- 底栏 ---------------- */

/** 系统退费中拦截「工单已提交退费，当前不可操作」（PRD 5.4） */
function gate(): boolean {
  const g = store.h5Gate(no.value);
  if (!g.ok) {
    if (g.message) message.warning(g.message);
    return false;
  }
  return canAct.value;
}

function payload(): RefundHandle {
  const h = structuredClone(toRaw(form)) as RefundHandle;
  h.subjects = form.subjects.map((s) => ({ ...toRaw(s) }));
  h.orderNo = h.orderNo.trim();
  h.studentCode = h.studentCode.trim();
  if (!(REFUND_COMM_NOTE_RESULTS as readonly string[]).includes(h.commResult)) h.commNote = '';
  if (h.closeAuth !== '否') h.notCloseReason = '';
  return h;
}

function backToList() {
  router.replace({ path: '/m/refund/todo', query: account.value ? { account: account.value } : {} });
}

function save() {
  if (!gate()) return;
  clearErrors();
  if (!checkLength()) return;
  const res = store.h5Save(no.value, payload());
  if (res.ok) message.success(res.message);
  else if (res.message) message.error(res.message);
}

const confirmOpen = ref(false);

function forward() {
  if (!gate()) return;
  if (!validateForward()) return;
  if (form.submitRefund === '是') {
    if (inflightRefundRun(refund.value)) {
      message.warning(REFUND_TIP.inflight);
      return;
    }
    confirmOpen.value = true;
    return;
  }
  doForward();
}

function doForward() {
  confirmOpen.value = false;
  const res = store.h5Forward(no.value, payload());
  if (res.ok) {
    message.success(res.message);
    backToList();
  } else if (res.message) {
    message.error(res.message);
  }
}

const transferOpen = ref(false);
const transferTarget = ref<string | undefined>();
const transferError = ref('');
const transferCandidates = computed<RefundManager[]>(() =>
  ALL_REFUND_MANAGERS.filter((m) => m.account !== refund.value?.state.manager?.account));

function transfer() {
  if (!gate()) return;
  transferTarget.value = undefined;
  transferError.value = '';
  transferOpen.value = true;
}

function confirmTransfer() {
  const m = transferCandidates.value.find((x) => x.account === transferTarget.value);
  if (!m) {
    transferError.value = '请选择转办对象';
    return;
  }
  const res = store.h5Transfer(no.value, m);
  transferOpen.value = false;
  if (res.ok) {
    message.success(res.message);
    backToList();
  } else if (res.message) {
    message.error(res.message);
  }
}
</script>

<template>
  <FlashMobileShell title="工单详情" back @back="backToList">
    <div v-if="!ticket || !refund" class="rf-empty">工单不存在</div>
    <template v-else>
      <!-- 基本信息 -->
      <section class="rf-card">
        <div class="rf-card__head">
          <span class="rf-card__title">基本信息</span>
          <span class="rf-tag" :style="statusStyle(ticket.nodeStatus)">{{ STATUS_DISPLAY_NAME[ticket.nodeStatus] }}</span>
        </div>
        <div class="rf-kv">
          <span class="rf-kv__k">工单号</span>
          <span class="rf-kv__v rf-mono">{{ ticket.no }}</span>
        </div>
        <div v-for="[k, v] in basicRows" :key="k" class="rf-kv">
          <span class="rf-kv__k">{{ k }}</span>
          <span class="rf-kv__v">{{ v }}</span>
        </div>
      </section>

      <!-- 附件 -->
      <section class="rf-card">
        <div class="rf-card__head"><span class="rf-card__title">附件</span></div>
        <div v-if="attachments.length" class="rf-files">
          <div v-for="f in attachments" :key="f" class="rf-file"><PaperClipOutlined /> {{ f }}</div>
        </div>
        <div v-else class="rf-none">无</div>
      </section>

      <!-- 工单历史 -->
      <section class="rf-card">
        <div class="rf-card__head"><span class="rf-card__title">工单历史</span></div>
        <ol class="rf-hist">
          <li v-for="e in history" :key="e.id" class="rf-hist__item">
            <div class="rf-hist__head">
              <span class="rf-hist__how">{{ e.how }}</span>
              <span class="rf-hist__who">{{ e.who }}</span>
              <span class="rf-hist__when">{{ e.when }}</span>
            </div>
            <div class="rf-hist__what">{{ e.what }}</div>
          </li>
        </ol>
      </section>

      <!-- 退费信息 -->
      <section class="rf-card rf-form">
        <div class="rf-card__head"><span class="rf-card__title">退费信息</span></div>

        <div class="rf-row" :class="{ 'has-error': errors.submitRefund }">
          <label class="rf-label is-required">是否在线退费：</label>
          <div class="rf-ctl">
            <a-select v-model:value="submitRefundModel" :options="YES_NO" :disabled="!canAct" :status="errors.submitRefund ? 'error' : undefined" />
            <div v-if="errors.submitRefund" class="rf-err">{{ errors.submitRefund }}</div>
          </div>
        </div>

        <div class="rf-row" :class="{ 'has-error': errors.commResult || errors.commNote }">
          <label class="rf-label is-required">沟通结果：</label>
          <div class="rf-ctl">
            <a-select v-model:value="commResultModel" :options="COMM_OPTIONS" :disabled="!canAct" :status="errors.commResult ? 'error' : undefined" />
            <div v-if="errors.commResult" class="rf-err">{{ errors.commResult }}</div>
            <template v-if="needCommNote">
              <a-input
                v-model:value="form.commNote"
                class="rf-gap"
                :placeholder="REFUND_COMM_NOTE_PLACEHOLDER"
                :disabled="!canAct"
                :status="errors.commNote ? 'error' : undefined"
                @change="clr('commNote')"
              />
              <div v-if="errors.commNote" class="rf-err">{{ errors.commNote }}</div>
            </template>
          </div>
        </div>

        <div class="rf-row" :class="{ 'has-error': errors.orderNo }">
          <label class="rf-label is-required">订单号：</label>
          <div class="rf-ctl">
            <a-input v-model:value="form.orderNo" :disabled="!canAct" :status="errors.orderNo ? 'error' : undefined" @change="clr('orderNo')" />
            <div v-if="errors.orderNo" class="rf-err">{{ errors.orderNo }}</div>
          </div>
        </div>

        <div class="rf-row" :class="{ 'has-error': errors.studentCode }">
          <label class="rf-label is-required">登录账号：</label>
          <div class="rf-ctl">
            <a-input v-model:value="form.studentCode" :disabled="!canAct" :status="errors.studentCode ? 'error' : undefined" @change="clr('studentCode')" />
            <div v-if="errors.studentCode" class="rf-err">{{ errors.studentCode }}</div>
          </div>
        </div>

        <template v-if="showRefundFields">
          <div class="rf-row" :class="{ 'has-error': errors.subjects }">
            <label class="rf-label is-required">退费商品：</label>
            <div class="rf-ctl">
              <div class="rf-goods">
                <span class="rf-goods__names">{{ subjectGroups.map((g) => g.subjects.map((s) => s.subjectName).join('+')).join('；') }}</span>
                <a-button size="small" :disabled="!canAct" @click="openPicker">选择</a-button>
              </div>
              <div v-if="errors.subjects" class="rf-err">{{ errors.subjects }}</div>
            </div>
          </div>

          <div v-if="form.subjects.length" class="rf-row" :class="{ 'has-error': hasAmtError }">
            <label class="rf-label is-required">退费金额：</label>
            <div class="rf-ctl">
              <div v-for="g in subjectGroups" :key="g.name" class="rf-amt-group">
                <div class="rf-amt-group__name">{{ g.name }}</div>
                <div v-for="s in g.subjects" :key="amtKey(s)" class="rf-amt-item">
                  <div class="rf-amt">
                    <span class="rf-amt__name">{{ s.subjectName }}</span>
                    <a-input
                      v-if="canAct"
                      :value="amtValue(s)"
                      class="rf-amt__input"
                      inputmode="decimal"
                      placeholder="输入退费金额"
                      suffix="元"
                      :status="amtErrors[amtKey(s)] ? 'error' : undefined"
                      @update:value="(v: string) => onAmtInput(s, v)"
                    />
                    <span v-else class="rf-amt__v">{{ refundAmountOf(s) == null ? '—' : `${amtDisplay(refundAmountOf(s))} 元` }}</span>
                  </div>
                  <div v-if="amtErrors[amtKey(s)]" class="rf-err rf-amt__err">{{ amtErrors[amtKey(s)] }}</div>
                </div>
              </div>
              <div class="rf-amt rf-amt--total">
                <span>合计</span>
                <span class="rf-amt__v">{{ amtTotal }} 元</span>
              </div>
            </div>
          </div>

          <div class="rf-row">
            <label class="rf-label">退回方式：</label>
            <div class="rf-ctl"><a-input :value="REFUND_RETURN_WAY" disabled /></div>
          </div>

          <div class="rf-row" :class="{ 'has-error': errors.reason }">
            <label class="rf-label is-required">退款原因：</label>
            <div class="rf-ctl">
              <a-select v-model:value="reasonModel" :options="REASON_OPTIONS" :disabled="!canAct" :status="errors.reason ? 'error' : undefined" />
              <div v-if="errors.reason" class="rf-err">{{ errors.reason }}</div>
            </div>
          </div>

          <div class="rf-row" :class="{ 'has-error': errors.reasonDesc }">
            <label class="rf-label is-required">退款原因说明：</label>
            <div class="rf-ctl">
              <a-textarea
                v-model:value="form.reasonDesc"
                :rows="3"
                :maxlength="REFUND_TEXT_MAX"
                show-count
                :disabled="!canAct"
                :status="errors.reasonDesc ? 'error' : undefined"
                @change="clr('reasonDesc')"
              />
              <div v-if="errors.reasonDesc" class="rf-err">{{ errors.reasonDesc }}</div>
            </div>
          </div>

          <div class="rf-row">
            <label class="rf-label">退费方：</label>
            <div class="rf-ctl"><a-input :value="REFUND_PARTY" disabled /></div>
          </div>

          <div class="rf-row" :class="{ 'has-error': errors.closeAuth }">
            <label class="rf-label is-required">是否关闭权限：</label>
            <div class="rf-ctl">
              <a-select v-model:value="closeAuthModel" :options="YES_NO" :disabled="!canAct" :status="errors.closeAuth ? 'error' : undefined" />
              <div v-if="errors.closeAuth" class="rf-err">{{ errors.closeAuth }}</div>
            </div>
          </div>

          <div v-if="needNotCloseReason" class="rf-row" :class="{ 'has-error': errors.notCloseReason }">
            <label class="rf-label is-required">不关闭权限原因：</label>
            <div class="rf-ctl">
              <a-textarea
                v-model:value="form.notCloseReason"
                :rows="2"
                :maxlength="REFUND_TEXT_MAX"
                show-count
                :disabled="!canAct"
                :status="errors.notCloseReason ? 'error' : undefined"
                @change="clr('notCloseReason')"
              />
              <div v-if="errors.notCloseReason" class="rf-err">{{ errors.notCloseReason }}</div>
            </div>
          </div>

          <div class="rf-row">
            <label class="rf-label">我司退费结果：</label>
            <div class="rf-ctl">
              <div class="rf-static" :class="{ 'is-reject': ownResult === '已驳回' }">{{ ownResult || '—' }}</div>
              <div v-if="ownResult === '已驳回' && lastRun?.rejectReason" class="rf-reject">驳回原因：{{ lastRun.rejectReason }}</div>
            </div>
          </div>
        </template>

        <div class="rf-row" :class="{ 'has-error': errors.remark }">
          <label class="rf-label" :class="{ 'is-required': needRemark }">备注：</label>
          <div class="rf-ctl">
            <a-textarea
              v-model:value="form.remark"
              :rows="3"
              :disabled="!canAct"
              :status="errors.remark ? 'error' : undefined"
              @change="clr('remark')"
            />
            <div v-if="errors.remark" class="rf-err">{{ errors.remark }}</div>
          </div>
        </div>
      </section>
    </template>

    <template v-if="ticket && showFooter" #footer>
      <div class="rf-bar">
        <a-button type="primary" size="large" @click="forward">下送</a-button>
        <a-button size="large" @click="save">保存</a-button>
        <a-button size="large" @click="transfer">转办</a-button>
      </div>
    </template>
  </FlashMobileShell>

  <RefundCommodityPicker
    :open="pickerOpen"
    :orders="pickerOrders"
    :selected="form.subjects"
    @confirm="onPicked"
    @cancel="pickerOpen = false"
  />

  <!-- 下送二次确认（是否在线退费＝是） -->
  <a-modal :open="confirmOpen" :closable="false" :footer="null" centered :width="320" @cancel="confirmOpen = false">
    <div class="rf-confirm">
      <p>是否提交退费申请？</p>
      <p>是否确认提交关闭权限设置：{{ form.closeAuth === '否' ? '不关闭' : '关闭' }}？</p>
    </div>
    <div class="rf-confirm__btns">
      <a-button @click="confirmOpen = false">取消</a-button>
      <a-button type="primary" @click="doForward">确认</a-button>
    </div>
  </a-modal>

  <!-- 转办 -->
  <a-modal :open="transferOpen" title="转办" :footer="null" centered :width="340" @cancel="transferOpen = false">
    <a-radio-group v-model:value="transferTarget" class="rf-tf" @change="transferError = ''">
      <a-radio v-for="m in transferCandidates" :key="m.account" :value="m.account" class="rf-tf__item">
        {{ m.name }}<span class="rf-tf__kind">{{ m.kind }}</span>
      </a-radio>
    </a-radio-group>
    <div v-if="transferError" class="rf-err">{{ transferError }}</div>
    <div class="rf-confirm__btns">
      <a-button @click="transferOpen = false">取消</a-button>
      <a-button type="primary" @click="confirmTransfer">确定</a-button>
    </div>
  </a-modal>
</template>

<style scoped>
.rf-empty {
  padding: 64px 0;
  color: #86909c;
  text-align: center;
}
.rf-card {
  margin-bottom: 12px;
  padding: 4px 16px 12px;
  border-radius: 10px;
  background: #fff;
}
.rf-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 0 8px;
  border-bottom: 1px solid #f2f3f5;
  margin-bottom: 6px;
}
.rf-card__title {
  font-size: 16px;
  font-weight: 600;
}
.rf-tag {
  padding: 1px 8px;
  border-radius: 4px;
  font-size: 12px;
  line-height: 20px;
}
.rf-kv {
  display: flex;
  gap: 12px;
  padding: 6px 0;
  font-size: 14px;
  line-height: 1.5;
}
.rf-kv__k {
  flex: none;
  width: 80px;
  color: #86909c;
}
.rf-kv__v {
  flex: 1;
  min-width: 0;
  color: #1d2129;
  word-break: break-all;
}
.rf-mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
.rf-none {
  padding: 6px 0;
  color: #86909c;
  font-size: 14px;
}
.rf-files {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 6px 0;
  color: #1a6fff;
  font-size: 14px;
}
.rf-hist {
  margin: 0;
  padding: 0;
  list-style: none;
}
.rf-hist__item {
  position: relative;
  padding: 8px 0 8px 14px;
  border-left: 2px solid #e5e6eb;
  margin-left: 4px;
}
.rf-hist__item::before {
  position: absolute;
  top: 14px;
  left: -5px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #1a6fff;
  content: '';
}
.rf-hist__head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 8px;
  font-size: 13px;
}
.rf-hist__how {
  color: #1d2129;
  font-weight: 600;
}
.rf-hist__who {
  color: #4e5969;
}
.rf-hist__when {
  margin-left: auto;
  color: #86909c;
  font-size: 12px;
}
.rf-hist__what {
  margin-top: 4px;
  color: #4e5969;
  font-size: 13px;
  line-height: 1.5;
  word-break: break-all;
}
.rf-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 0;
}
.rf-label {
  flex: none;
  width: 122px;
  padding-top: 5px;
  white-space: nowrap;
  color: #1d2129;
  font-size: 14px;
}
.rf-label.is-required::before {
  margin-right: 2px;
  color: #f53f3f;
  content: '*';
}
.rf-ctl {
  flex: 1;
  min-width: 0;
}
.rf-ctl :deep(.ant-select) {
  width: 100%;
}
.rf-gap {
  margin-top: 8px;
}
.rf-err {
  margin-top: 4px;
  color: #f53f3f;
  font-size: 13px;
  line-height: 1.4;
}
.rf-goods {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 32px;
}
.rf-goods__names {
  flex: 1;
  min-width: 0;
  color: #1d2129;
  font-size: 14px;
}
.rf-amt-group + .rf-amt-group {
  margin-top: 8px;
}
.rf-amt-group__name {
  padding-top: 5px;
  color: #4e5969;
  font-size: 13px;
}
.rf-amt {
  display: flex;
  justify-content: space-between;
  padding: 4px 0;
  font-size: 14px;
}
.rf-amt {
  align-items: center;
  gap: 8px;
}
.rf-amt__name {
  flex: 1;
  min-width: 0;
}
.rf-amt__input {
  flex: none;
  width: 140px;
}
.rf-amt__input :deep(input) {
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.rf-amt__err {
  margin-top: 0;
  text-align: right;
}
.rf-amt--total {
  margin-top: 6px;
  padding-top: 8px;
  border-top: 1px solid #f2f3f5;
  font-weight: 600;
}
.rf-amt__v {
  color: #1d2129;
  font-variant-numeric: tabular-nums;
}
.rf-static {
  padding-top: 5px;
  font-size: 14px;
}
.rf-static.is-reject {
  color: #f53f3f;
}
.rf-reject {
  margin-top: 4px;
  color: #f53f3f;
  font-size: 13px;
  line-height: 1.5;
}
.rf-bar {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}
.rf-confirm p {
  margin: 4px 0 10px;
  color: #1d2129;
  font-size: 15px;
  line-height: 1.6;
}
.rf-confirm__btns {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
}
.rf-tf {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.rf-tf__item {
  padding: 8px 0;
}
.rf-tf__kind {
  margin-left: 8px;
  color: #86909c;
  font-size: 12px;
}
</style>
