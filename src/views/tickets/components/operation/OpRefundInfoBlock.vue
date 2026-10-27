<script setup lang="ts">
/**
 * 个册退费单「工单处理」Tab 顶部：退费信息（只读区块，1120 PRD §5.2）。
 * 三列 label/value 网格展示建单退费信息与移动工单 H5 最近保存值，下接退费记录表（每次提交一行，时间正序）。
 * 版式与刷机单「自动刷机结果」卡同规格（卡头标题 ＋ 行尾退费状态与最近更新时间）。
 * 校园经理的处理表单只在移动工单 H5，本区块无输入控件。
 */
import { computed } from 'vue';
import { AccountBookOutlined } from '@ant-design/icons-vue';
import {
  REFUND_COMM_NOTE_RESULTS, REFUND_PARTY, REFUND_RETURN_WAY,
  formatRefundAmount, refundAmountOf, refundItemText, refundOwnResultOf, refundProgressOf, refundReasonLabel, sumRefundApply,
  type RefundCommResult, type RefundTaskStatus, type TicketRefund,
} from '@/views/tickets/types/refund';

const props = defineProps<{
  refund: TicketRefund;
  /** 本单客户姓名（同工单概览「客户」）：退费记录「提交人」取它 */
  customer?: string | null;
}>();

const EMPTY = '—';
const v = (s?: string | null) => (s && String(s).trim() ? String(s) : EMPTY);

const runs = computed(() => props.refund.runs);
const lastRun = computed(() => runs.value[runs.value.length - 1]);
const progress = computed(() => refundProgressOf(lastRun.value));
const handle = computed(() => props.refund.handle);

function tone(s: string): 'ok' | 'bad' | 'auto' | 'idle' {
  if (s === '退费成功' || s === '已完成') return 'ok';
  if (s === '部分完成') return 'ok';
  if (s === '已驳回') return 'bad';
  if (s === '系统退费中' || s === '待审核' || s === '待退费') return 'auto';
  return 'idle';
}

/**
 * 校代对接人：本单的校园经理 / 城市经理，只显示姓名，不随当前处理人变。
 * 在外部处理人名下取当前外部处理人，系统退费中、教育支持组内取最近一次提交退费的校园经理；都没有为「—」。
 */
const liaisonText = computed(() => {
  const st = props.refund.state;
  return v((st.manager ?? st.lastSubmitter)?.name);
});

const ownResult = computed(() => (lastRun.value ? refundOwnResultOf(lastRun.value.status) : ''));

/** 退费商品与金额：最近保存的所选退费商品；未选取建单订单 */
const subjects = computed(() => handle.value.subjects);

interface Field { key: string; label: string; value: string; wide?: boolean; tone?: string }

const fields = computed<Field[]>(() => {
  const i = props.refund.info;
  const h = handle.value;
  const submitted = h.submitRefund === '是';
  const list: Field[] = [
    { key: 'liaison', label: '校代对接人', value: liaisonText.value },
    { key: 'school', label: '学校', value: v(i.schoolName) },
    { key: 'student', label: '学生姓名', value: v(i.studentName) },
    { key: 'code', label: '登录账号', value: v(h.studentCode || i.studentCode) },
    { key: 'order', label: '订单号', value: v(h.orderNo || i.orderNo) },
    { key: 'amount', label: '订单金额', value: i.refundableAmount != null ? `${formatRefundAmount(i.refundableAmount)} 元` : EMPTY },
    { key: 'submit', label: '是否在线退费', value: v(h.submitRefund) },
    { key: 'comm', label: '沟通结果', value: v(h.commResult) },
    { key: 'party', label: '退费方', value: submitted ? REFUND_PARTY : EMPTY },
    { key: 'way', label: '退回方式', value: REFUND_RETURN_WAY },
    { key: 'reason', label: '退款原因', value: v(refundReasonLabel(h.reason ?? i.reason)) },
    { key: 'closeAuth', label: '是否关闭权限', value: v(h.closeAuth) },
  ];
  if (h.commResult && REFUND_COMM_NOTE_RESULTS.includes(h.commResult as RefundCommResult)) {
    list.push({ key: 'commNote', label: '沟通备注', value: v(h.commNote), wide: true });
  }
  if (h.closeAuth === '否') list.push({ key: 'notClose', label: '不关闭权限原因', value: v(h.notCloseReason), wide: true });
  list.push({ key: 'reasonDesc', label: '退款原因说明', value: v(h.reasonDesc), wide: true });
  if (ownResult.value) list.push({ key: 'own', label: '我司退费结果', value: ownResult.value, tone: tone(ownResult.value) });
  if (lastRun.value?.status === '已驳回') list.push({ key: 'reject', label: '驳回原因', value: v(lastRun.value.rejectReason), wide: true });
  if (h.remark.trim()) list.push({ key: 'remark', label: '备注', value: h.remark, wide: true });
  return list;
});

/** 记录表内商品行：同学科不重复长商品名，避免窄列把整行撑过高 */
function refundRunItemLine(s: (typeof runs.value)[number]['items'][number]) {
  const n = refundAmountOf(s);
  const amt = n == null ? '—' : `${formatRefundAmount(n)} 元`;
  return `${s.subjectName} · ${amt}`;
}

const rows = computed(() => runs.value.map((r) => ({
  id: r.id,
  at: r.submittedAt,
  by: v(props.customer),
  taskId: r.taskId,
  commodity: v(r.items[0]?.commodityName),
  items: r.items.map(refundRunItemLine),
  total: formatRefundAmount(sumRefundApply(r.items)),
  status: r.status as RefundTaskStatus,
  reject: r.status === '已驳回' ? v(r.rejectReason) : EMPTY,
  resultAt: v(r.resultAt),
})));

/** 卡头行尾：最近一次更新时间（退费记录「更新时间」），无结果取提交时间 */
const headTime = computed(() => (lastRun.value ? lastRun.value.resultAt ?? lastRun.value.submittedAt : ''));
</script>

<template>
  <section class="rf-card">
    <header class="rf-head">
      <span class="rf-title"><AccountBookOutlined class="rf-icon" />退费信息</span>
      <span class="rf-status" :class="`tone-${tone(progress)}`">{{ progress }}</span>
      <span v-if="headTime" class="rf-when">{{ headTime }}</span>
    </header>

    <div class="rf-body">
      <dl class="rf-kv">
        <div v-for="f in fields" :key="f.key" class="rf-item" :class="{ 'is-wide': f.wide }">
          <dt>{{ f.label }}</dt>
          <dd><span class="rf-val" :class="f.tone ? `tone-${f.tone}` : ''" :title="f.wide ? undefined : f.value">{{ f.value }}</span></dd>
        </div>
        <div v-if="subjects.length && !rows.length" class="rf-item is-full">
          <dt>退费商品与金额</dt>
          <dd class="rf-subs">
            <span v-for="s in subjects" :key="`${s.commodityId}-${s.subjectCode}`" class="rf-val">{{ refundItemText(s) }}</span>
          </dd>
        </div>
      </dl>

      <div v-if="rows.length" class="rf-table-wrap">
        <div class="rf-table-title">退费记录</div>
        <table class="rf-table">
          <colgroup>
            <col class="col-at" />
            <col class="col-by" />
            <col class="col-task" />
            <col />
            <col class="col-result" />
            <col class="col-reject" />
            <col class="col-at" />
          </colgroup>
          <thead>
            <tr>
              <th>提交时间</th><th>提交人</th><th>退费任务号</th><th>退费商品与金额</th>
              <th>当前结果</th><th>驳回原因</th><th>更新时间</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in rows" :key="r.id">
              <td class="num at">{{ r.at }}</td>
              <td class="by">{{ r.by }}</td>
              <td class="num task">{{ r.taskId }}</td>
              <td class="items-cell">
                <div v-if="r.commodity !== EMPTY" class="item-commodity">{{ r.commodity }}</div>
                <div v-for="(it, i) in r.items" :key="i" class="item-line">{{ it }}</div>
                <div class="item-total">合计 {{ r.total }} 元</div>
              </td>
              <td><span :class="`tone-${tone(r.status)}`">{{ r.status }}</span></td>
              <td class="reject" :class="{ muted: r.reject === EMPTY }">{{ r.reject }}</td>
              <td class="num at">{{ r.resultAt }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>
</template>

<style scoped>
.rf-card { display: flex; flex-direction: column; }
.rf-head {
  display: flex; align-items: center; gap: 8px;
  padding: 6px 12px; min-height: 32px;
  background: #fff; border: 1px solid #e5e7eb; border-radius: 8px 8px 0 0;
}
.rf-title { display: inline-flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 600; color: #374151; }
.rf-icon { color: #6b7280; font-size: 14px; }
.rf-status { font-size: 12px; font-weight: 600; }
.rf-when { font-size: 11px; color: #9ca3af; margin-left: auto; white-space: nowrap; font-variant-numeric: tabular-nums; }
.rf-body {
  display: flex; flex-direction: column; gap: 8px;
  padding: 8px 12px 10px; background: #f8fafc;
  border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;
}
/* 字段网格与刷机单「刷机信息」（OpFlashInfoBlock .fi-grid / .fi-item）同规格：三列、label 定宽不带冒号、值 500 字重单行省略、长文本跨两列换行 */
.rf-kv {
  display: grid; grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px 16px; margin: 0;
}
.rf-item { display: flex; align-items: baseline; gap: 8px; min-width: 0; font-size: 12px; line-height: 20px; }
.rf-item dt { flex: none; min-width: 72px; color: #6b7280; white-space: nowrap; }
.rf-item dd { flex: 1; min-width: 0; margin: 0; color: #111827; }
.rf-val { display: inline-block; max-width: 100%; vertical-align: top; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rf-item.is-wide { grid-column: span 2; }
.rf-item.is-full { grid-column: 1 / -1; }
.rf-item.is-wide .rf-val,
.rf-item.is-full .rf-val { white-space: normal; overflow-wrap: anywhere; }
.rf-subs { display: flex; flex-wrap: wrap; gap: 0 16px; }
.tone-ok { color: #059669; font-weight: 600; }
.tone-bad { color: #dc2626; font-weight: 600; }
.tone-auto { color: #7c3aed; font-weight: 600; }
.tone-idle { color: #6b7280; font-weight: 600; }
/* 记录表与刷机单「刷机记录」（OpFlashResultCard .fr-table）同规格；列宽按卡片宽度收放，不出横向滚动 */
.rf-table-wrap { background: #fff; border: 1px solid #e5e7eb; border-radius: 6px; overflow: hidden; }
.rf-table-title { padding: 6px 10px 0; font-size: 12px; line-height: 20px; font-weight: 600; color: #374151; }
.rf-table { width: 100%; border-collapse: collapse; font-size: 12px; line-height: 20px; table-layout: fixed; }
.rf-table .col-at { width: 88px; }
.rf-table .col-by { width: 64px; }
.rf-table .col-task { width: 128px; }
.rf-table .col-result { width: 72px; }
.rf-table .col-reject { width: 124px; }
.rf-table th {
  padding: 6px 10px; text-align: left; font-weight: 600; color: #6b7280;
  background: #f9fafb; border-bottom: 1px solid #e5e7eb; white-space: nowrap;
}
.rf-table td { padding: 6px 10px; color: #374151; border-bottom: 1px solid #f3f4f6; vertical-align: top; overflow-wrap: anywhere; }
.rf-table tr:last-child td { border-bottom: none; }
.rf-table td.num { font-variant-numeric: tabular-nums; }
.rf-table td.items-cell .item-commodity { color: #6b7280; }
.rf-table td.items-cell .item-total { color: #111827; font-weight: 500; font-variant-numeric: tabular-nums; }
.rf-table td.reject.muted { color: #9ca3af; }
</style>
