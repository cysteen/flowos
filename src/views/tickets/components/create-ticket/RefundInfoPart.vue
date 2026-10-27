<script setup lang="ts">
/**
 * 新建工单 · 「退费信息」卡（1120 个册退费工单 PRD §3.1 / §3.2）。
 * 学校 · 校代对接人（按学校带出，可改可清空）· 学生姓名 · 智学号 · 可退套餐（按学校 ＋ 智学号查询）· 订单号 · 可退金额 · 退款原因 · 退回方式。
 * 学校选择复用刷机信息卡的学校检索（省 / 市级联 ＋ 可搜索下拉）。字段名、枚举与提示文案取 `types/refund.ts`。
 */
import { computed, ref, watch } from 'vue';
import { REFUND_FIELD_LABELS as L, REFUND_REASONS, REFUND_RETURN_WAY, REFUND_TIP, formatRefundAmount, sumRefundAmount } from '@/views/tickets/types/refund';
import type { CreateTicketRefundField, CreateTicketRefundForm } from '@/views/tickets/types/createTicket';
import { orderSubjects, queryRefundCommodities, type RefundOrder } from '@/mock/refund/commodities';
import { ALL_REFUND_MANAGERS, resolveSchoolManager } from '@/mock/refund/managers';
import CreateTicketPartCard from './CreateTicketPartCard.vue';
import FormSelect from './FormSelect.vue';
import FlashSchoolPicker from './FlashSchoolPicker.vue';

const info = defineModel<CreateTicketRefundForm>('info', { required: true });
defineProps<{
  errors: Record<CreateTicketRefundField, string>;
  /** 客户信息的省市区（学校检索的默认地区） */
  customerRegion?: string;
}>();

const reasonOptions = REFUND_REASONS.map((r) => ({ value: r.code, label: r.label }));
const managerOptions = ALL_REFUND_MANAGERS.map((m) => ({ value: m.account, label: `${m.name}（${m.account}）` }));

// 选学校带出校代对接人（本校校园经理，没有置空；城市经理只可手动改选）；换学校重新带出，清空学校一并清空
watch(() => info.value.schoolId, (id, prev) => {
  if (id === prev) return;
  info.value.managerAccount = id ? resolveSchoolManager(id)?.account ?? '' : '';
});

function setManager(v: unknown) {
  info.value.managerAccount = v == null ? '' : String(v);
}

/** 可退套餐查询：未查 / 已查（含空）/ 查询失败 */
const orders = ref<RefundOrder[] | null>(null);
const queryFailed = ref(false);
const queryTip = ref('');
const pickedOrderNo = ref('');

function resetQuery() {
  orders.value = null;
  queryFailed.value = false;
  queryTip.value = '';
  pickedOrderNo.value = '';
}

// 改学校或智学号：已带出的列表、订单号、可退金额清空
watch(() => [info.value.schoolId, info.value.studentCode.trim()] as const, (now, prev) => {
  if (!prev || (now[0] === prev[0] && now[1] === prev[1])) return;
  if (orders.value !== null || pickedOrderNo.value) {
    info.value.orderNo = '';
    info.value.refundableAmount = null;
  }
  resetQuery();
});

function onQuery() {
  queryTip.value = '';
  if (!info.value.schoolId) { queryTip.value = REFUND_TIP.pickSchoolFirst; return; }
  if (!info.value.studentCode.trim()) { queryTip.value = REFUND_TIP.fillCodeFirst; return; }
  const res = queryRefundCommodities(info.value.schoolId, info.value.studentCode);
  if (!res.ok) {
    orders.value = [];
    queryFailed.value = true;
    return;
  }
  queryFailed.value = false;
  orders.value = res.orders;
  // 查询后默认选中购买时间最近的订单，回填订单号与可退金额；点其他订单卡可切换
  const latest = res.orders.reduce<RefundOrder | null>((a, o) => (!a || o.purchasedAt > a.purchasedAt ? o : a), null);
  if (latest) pickOrder(latest);
}

function orderTotal(o: RefundOrder): number {
  return sumRefundAmount(orderSubjects(o));
}

function pickOrder(o: RefundOrder) {
  pickedOrderNo.value = o.payOrderId;
  info.value.orderNo = o.payOrderId;
  info.value.refundableAmount = orderTotal(o);
}

/** 手改订单号：与所选订单不符时可退金额置空（手填订单号时为空） */
function onOrderNoInput(v: string) {
  info.value.orderNo = v;
  if (v.trim() !== pickedOrderNo.value) {
    pickedOrderNo.value = '';
    info.value.refundableAmount = null;
  }
}

function setReason(v: unknown) {
  info.value.reason = v == null ? null : Number(v);
}

const amountText = computed(() => (info.value.refundableAmount == null ? '' : `${formatRefundAmount(info.value.refundableAmount)} 元`));
</script>

<template>
  <CreateTicketPartCard title="退费信息" :body-gap="8">
    <div class="ri-grid">
      <div class="ri-field">
        <label class="ri-label"><span class="req">*</span>{{ L.school }}</label>
        <div class="ri-control">
          <FlashSchoolPicker
            v-model:school-id="info.schoolId"
            :default-region="customerRegion"
            :status="errors.schoolId ? 'error' : ''"
          />
          <div v-if="errors.schoolId" class="ri-error">{{ errors.schoolId }}</div>
        </div>
      </div>

      <div class="ri-field">
        <label class="ri-label">{{ L.manager }}</label>
        <div class="ri-control">
          <FormSelect
            :value="info.managerAccount || undefined"
            placeholder="请选择"
            allow-clear
            :options="managerOptions"
            @update:value="setManager"
          />
        </div>
      </div>

      <div class="ri-field ri-row-start">
        <label class="ri-label"><span class="req">*</span>{{ L.studentName }}</label>
        <div class="ri-control">
          <a-input v-model:value="info.studentName" placeholder="请输入学生姓名" :status="errors.studentName ? 'error' : ''" />
          <div v-if="errors.studentName" class="ri-error">{{ errors.studentName }}</div>
        </div>
      </div>
      <div class="ri-field">
        <label class="ri-label"><span class="req">*</span>{{ L.studentCode }}</label>
        <div class="ri-control">
          <a-input v-model:value="info.studentCode" placeholder="请输入智学号" :status="errors.studentCode ? 'error' : ''" />
          <div v-if="errors.studentCode" class="ri-error">{{ errors.studentCode }}</div>
        </div>
      </div>

      <div class="ri-field ri-span2">
        <label class="ri-label">{{ L.packages }}</label>
        <div class="ri-control">
          <div>
            <a-button @click="onQuery">查询可退套餐</a-button>
          </div>
          <div v-if="queryTip" class="ri-error">{{ queryTip }}</div>
          <div v-if="orders !== null" class="ri-orders">
            <div v-if="queryFailed" class="ri-empty">{{ REFUND_TIP.queryFailed }}</div>
            <div v-else-if="!orders.length" class="ri-empty">{{ REFUND_TIP.noPackages }}</div>
            <button
              v-for="o in orders"
              v-else
              :key="o.payOrderId"
              type="button"
              class="ri-order"
              :class="{ picked: pickedOrderNo === o.payOrderId }"
              @click="pickOrder(o)"
            >
              <div class="ri-order-head">
                <span class="ri-order-no">订单号 {{ o.payOrderId }}</span>
                <span class="ri-order-time">购买时间 {{ o.purchasedAt }}</span>
              </div>
              <div v-for="c in o.commodities" :key="c.commodityId" class="ri-commodity">
                <div class="ri-commodity-name">{{ c.commodityName }}</div>
                <div class="ri-subjects">
                  <span v-for="s in c.subjects" :key="s.subjectCode" class="ri-subject">
                    {{ s.subjectName }} <em>{{ formatRefundAmount(s.amount) }} 元</em>
                  </span>
                </div>
              </div>
            </button>
          </div>
        </div>
      </div>

      <div class="ri-field">
        <label class="ri-label"><span class="req">*</span>{{ L.orderNo }}</label>
        <div class="ri-control">
          <a-input
            :value="info.orderNo"
            placeholder="请输入订单号"
            :status="errors.orderNo ? 'error' : ''"
            @update:value="onOrderNoInput"
          />
          <div v-if="errors.orderNo" class="ri-error">{{ errors.orderNo }}</div>
        </div>
      </div>
      <div class="ri-field">
        <label class="ri-label">{{ L.refundableAmount }}</label>
        <div class="ri-control">
          <div class="ri-readonly">{{ amountText || '—' }}</div>
        </div>
      </div>

      <div class="ri-field">
        <label class="ri-label"><span class="req">*</span>{{ L.reason }}</label>
        <div class="ri-control">
          <FormSelect
            :value="info.reason ?? undefined"
            placeholder="请选择"
            :status="errors.reason ? 'error' : ''"
            :options="reasonOptions"
            @update:value="setReason"
          />
          <div v-if="errors.reason" class="ri-error">{{ errors.reason }}</div>
        </div>
      </div>
      <div class="ri-field">
        <label class="ri-label">{{ L.returnWay }}</label>
        <div class="ri-control">
          <div class="ri-readonly">{{ REFUND_RETURN_WAY }}</div>
        </div>
      </div>
    </div>
  </CreateTicketPartCard>
</template>

<style scoped>
.ri-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px 14px;
}
.ri-field { display: flex; align-items: flex-start; gap: 6px; min-width: 0; }
.ri-span2 { grid-column: span 2; }
.ri-label {
  flex: none;
  min-width: 76px;
  font-size: 12px;
  font-weight: 500;
  color: #374151;
  white-space: nowrap;
  line-height: 32px;
}
.req { color: #f56c6c; margin-right: 1px; }
.ri-control { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
.ri-error { margin-top: -4px; font-size: 12px; line-height: 18px; color: #ef4444; }
.ri-readonly {
  min-height: 32px;
  line-height: 30px;
  padding: 0 11px;
  font-size: 13px;
  color: #374151;
  background: #f3f4f6;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
}
.ri-orders { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; align-items: start; }
.ri-row-start { grid-column-start: 1; }
.ri-empty {
  grid-column: 1 / -1;
  padding: 8px 10px;
  font-size: 12px;
  color: #6b7280;
  background: #fff;
  border: 1px dashed #e5e7eb;
  border-radius: 6px;
}
.ri-order {
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 100%;
  min-width: 0;
  padding: 8px 10px;
  overflow-wrap: anywhere;
  text-align: left;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  cursor: pointer;
}
.ri-order:hover { border-color: #93c5fd; }
.ri-order.picked { border-color: #1a6fff; background: #f0f6ff; }
.ri-order-head { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 2px 8px; font-size: 12px; }
.ri-order-no { font-weight: 600; color: #111827; }
.ri-order-time { color: #6b7280; }
.ri-commodity { display: flex; flex-direction: column; gap: 2px; }
.ri-commodity-name { font-size: 12px; color: #374151; }
.ri-subjects { display: flex; flex-wrap: wrap; gap: 4px 12px; font-size: 12px; color: #4b5563; }
.ri-subject em { font-style: normal; color: #111827; font-weight: 500; }

@media (max-width: 768px) {
  .ri-grid { grid-template-columns: 1fr; }
  .ri-span2 { grid-column: auto; }
  .ri-orders { grid-template-columns: 1fr; }
}
</style>
