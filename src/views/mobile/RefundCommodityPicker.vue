<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { RefundOrder } from '@/mock/refund/commodities';
import { orderSubjects } from '@/mock/refund/commodities';
import { formatRefundAmount, sumRefundAmount, type RefundSubject } from '@/views/tickets/types/refund';

/**
 * 移动工单 H5 ·「选择退费商品」弹窗（1120 个册退费 PRD 5.5 图 10；老系统 H5 平移）。
 * 按套餐列出可退学科，可按套餐或学科勾选，支持全选，底部显示合计。
 * 本单退费记录中已退成功的学科（`succeeded`，按 订单 · 套餐 · 学科 定位）置灰、标「已退成功」、不可勾选，全选跳过。
 */
const props = defineProps<{ open: boolean; orders: RefundOrder[]; selected: RefundSubject[]; succeeded?: Set<string> }>();
const emit = defineEmits<{ confirm: [subjects: RefundSubject[]]; cancel: [] }>();

const keyOf = (s: Pick<RefundSubject, 'payOrderId' | 'commodityId' | 'subjectCode'>) =>
  `${s.payOrderId}|${s.commodityId}|${s.subjectCode}`;

/** 套餐分组：套餐行带购买时间，学科行带可退金额 */
const groups = computed(() => props.orders.flatMap((o) => {
  const rows = orderSubjects(o);
  return o.commodities.map((c) => ({
    key: `${o.payOrderId}|${c.commodityId}`,
    name: c.commodityName,
    purchasedAt: o.purchasedAt,
    subjects: rows.filter((r) => r.commodityId === c.commodityId),
  }));
}));
const allSubjects = computed(() => groups.value.flatMap((g) => g.subjects));

/** 已退成功：不可再选 */
const isDone = (s: RefundSubject) => !!props.succeeded?.has(keyOf(s));
const selectable = (subjects: RefundSubject[]) => subjects.filter((s) => !isDone(s));
const allSelectable = computed(() => selectable(allSubjects.value));

const picked = ref<Set<string>>(new Set());

watch(() => props.open, (v) => {
  if (v) picked.value = new Set(props.selected.filter((s) => !isDone(s)).map(keyOf));
});

function toggle(k: string, on: boolean) {
  const next = new Set(picked.value);
  if (on) next.add(k);
  else next.delete(k);
  picked.value = next;
}

function groupChecked(g: { subjects: RefundSubject[] }) {
  const list = selectable(g.subjects);
  return list.length > 0 && list.every((s) => picked.value.has(keyOf(s)));
}
function groupPartial(g: { subjects: RefundSubject[] }) {
  return !groupChecked(g) && g.subjects.some((s) => picked.value.has(keyOf(s)));
}
function toggleGroup(g: { subjects: RefundSubject[] }, on: boolean) {
  const next = new Set(picked.value);
  selectable(g.subjects).forEach((s) => (on ? next.add(keyOf(s)) : next.delete(keyOf(s))));
  picked.value = next;
}

const allChecked = computed(() => allSelectable.value.length > 0 && allSelectable.value.every((s) => picked.value.has(keyOf(s))));
const allPartial = computed(() => !allChecked.value && picked.value.size > 0);
function toggleAll(on: boolean) {
  picked.value = on ? new Set(allSelectable.value.map(keyOf)) : new Set();
}

const pickedRows = computed(() => allSubjects.value.filter((s) => picked.value.has(keyOf(s))));
const total = computed(() => sumRefundAmount(pickedRows.value));

function confirm() {
  emit('confirm', pickedRows.value.map((s) => ({ ...s })));
}
</script>

<template>
  <a-modal
    :open="open"
    title="选择退费商品"
    :footer="null"
    centered
    :width="360"
    wrap-class-name="rcp-wrap"
    @cancel="emit('cancel')"
  >
    <div class="rcp-list">
      <div v-for="g in groups" :key="g.key" class="rcp-group">
        <label class="rcp-row rcp-row--pkg" :class="{ 'rcp-row--done': !selectable(g.subjects).length }">
          <a-checkbox
            :checked="groupChecked(g)"
            :indeterminate="groupPartial(g)"
            :disabled="!selectable(g.subjects).length"
            @change="(e: any) => toggleGroup(g, e.target.checked)"
          />
          <span class="rcp-main">
            <span class="rcp-pkg">{{ g.name }}</span>
            <span class="rcp-sub">购买时间：{{ g.purchasedAt }}</span>
          </span>
        </label>
        <label v-for="s in g.subjects" :key="keyOf(s)" class="rcp-row" :class="{ 'rcp-row--done': isDone(s) }">
          <a-checkbox
            :checked="picked.has(keyOf(s))"
            :disabled="isDone(s)"
            @change="(e: any) => toggle(keyOf(s), e.target.checked)"
          />
          <span class="rcp-main">
            <span class="rcp-sub">购买学科：{{ s.subjectName }}<span v-if="isDone(s)" class="rcp-done">已退成功</span></span>
            <span class="rcp-sub">可退金额：<b class="rcp-amt">{{ formatRefundAmount(s.amount) }} 元</b></span>
          </span>
        </label>
      </div>
    </div>
    <div class="rcp-foot">
      <label class="rcp-all">
        <a-checkbox :checked="allChecked" :indeterminate="allPartial" @change="(e: any) => toggleAll(e.target.checked)" />
        <span>全选</span>
      </label>
      <span class="rcp-total">合计：{{ formatRefundAmount(total) }} 元</span>
      <span class="rcp-btns">
        <a-button type="primary" @click="confirm">确定</a-button>
        <a-button @click="emit('cancel')">取消</a-button>
      </span>
    </div>
  </a-modal>
</template>

<style scoped>
.rcp-list {
  max-height: 52vh;
  overflow-y: auto;
}
.rcp-group + .rcp-group {
  border-top: 1px solid #f2f3f5;
}
.rcp-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 2px 10px 18px;
  cursor: pointer;
}
.rcp-row--pkg {
  padding-left: 2px;
}
.rcp-row + .rcp-row {
  border-top: 1px dashed #f2f3f5;
}
.rcp-main {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.rcp-pkg {
  color: #1d2129;
  font-size: 15px;
  font-weight: 600;
}
.rcp-sub {
  color: #4e5969;
  font-size: 13px;
}
.rcp-amt {
  color: #f53f3f;
  font-size: 15px;
}
.rcp-row--done {
  cursor: not-allowed;
}
.rcp-row--done .rcp-sub,
.rcp-row--done .rcp-pkg,
.rcp-row--done .rcp-amt {
  color: #c9cdd4;
}
.rcp-done {
  margin-left: 8px;
  padding: 0 6px;
  border-radius: 4px;
  background: #f2f3f5;
  color: #86909c;
  font-size: 12px;
  line-height: 18px;
  display: inline-block;
}
.rcp-foot {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid #eef0f3;
}
.rcp-all {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
}
.rcp-total {
  color: #1d2129;
  font-size: 14px;
}
.rcp-btns {
  display: inline-flex;
  gap: 8px;
  margin-left: auto;
}
</style>
