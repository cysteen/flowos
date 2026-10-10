<script setup lang="ts">
/**
 * 一线坐席工作台「刷机池」页签（930 教育刷机单 §9.2 / 页面规格 P3）。
 *
 * 数据＝一线刷机池中未认领的刷机单（取数与排序在 `useTicketWorkbench.flashPoolRows`，按进池时间正序）；
 * 列：单号 / 标题 · 转人工原因 · 失败原因 · 产品型号 · 进池时间 · SLA · 操作「领取」。
 * 表格复用 `TicketRichList`：列目录列全部关掉，其余列走附加列插槽，SLA 两行口径与工单列表同源。
 * 视觉与工作台其他页签对齐：搜索框照 `TicketToolbar` 同款，SLA / 产品格照列表同款样式，
 * 列宽可拖（独立记忆键，不碰工作台的全局列宽），操作列贴右。
 */
import { computed, ref } from 'vue';
import { SearchOutlined } from '@ant-design/icons-vue';
import TicketRichList from './TicketRichList.vue';
import { TICKET_LIST_COLUMN_KEYS } from '@/views/tickets/composables/ticketListColumnCatalog';
import { isFlashSlaIdle, slaFirstLine, slaResolveLine } from '@/views/tickets/utils/ticketListCells';
import { flashFailCellText, flashHandoffCellText } from '@/views/tickets/utils/flashPoolCells';
import { useFlashStore } from '@/stores/flash';
import type { Ticket } from '@/views/tickets/types/ticket';

const props = defineProps<{ rows: Ticket[] }>();
const emit = defineEmits<{
  claim: [ticket: Ticket];
  open: [ticket: Ticket];
}>();

const flash = useFlashStore();
const search = ref('');

const shownRows = computed(() => {
  const kw = search.value.trim().toLowerCase();
  if (!kw) return props.rows;
  return props.rows.filter(
    (t) => t.no.toLowerCase().includes(kw) || (t.customerPhone ?? '').toLowerCase().includes(kw),
  );
});

/** 列目录列一律不出，只留固定的「工单 / 标题」 */
const HIDDEN_CATALOG = Object.fromEntries(TICKET_LIST_COLUMN_KEYS.map((k) => [k, false]));

const EXTRA_COLUMNS = [
  { key: 'flashHandoff', label: '转人工原因', width: 120 },
  { key: 'flashFail', label: '失败原因', width: 230 },
  { key: 'flashModel', label: '产品型号', width: 210 },
  { key: 'flashPoolAt', label: '进池时间', width: 140 },
  { key: 'flashSla', label: 'SLA', width: 120 },
];

/** 本实例默认列宽；拖动结果只记在 `COLUMN_WIDTHS_KEY` 下，不参与工作台列宽记忆 */
const COLUMN_WIDTHS = { title: 380, action: 96 };
const COLUMN_WIDTHS_KEY = 'flowos-flash-pool-column-widths';

function rowActions() {
  return [{ label: '领取', primary: true }];
}

function onAction(label: string, t: Ticket) {
  if (label === '领取') emit('claim', t);
}
</script>

<template>
  <div class="flash-pool">
    <div class="flash-pool__bar">
      <div class="flash-pool__search">
        <SearchOutlined :style="{ color: '#9CA3AF', fontSize: '14px' }" />
        <input v-model="search" class="flash-pool__input" placeholder="工单号 / 手机号" />
      </div>
    </div>
    <div class="flash-pool__card">
      <TicketRichList
        :rows="shownRows"
        variant="pool"
        :selectable="false"
        :visible-columns="HIDDEN_CATALOG"
        :extra-columns="EXTRA_COLUMNS"
        :column-widths="COLUMN_WIDTHS"
        :column-widths-storage-key="COLUMN_WIDTHS_KEY"
        flex-before-action
        :row-actions-fn="rowActions"
        :empty-kind="search.trim() ? 'search' : 'none'"
        @action="onAction"
        @open="emit('open', $event)"
        @click-no="emit('open', $event)"
      >
        <template #cell-flashHandoff="{ ticket }">
          <span class="fp-text" :title="flashHandoffCellText(ticket)">{{ flashHandoffCellText(ticket) }}</span>
        </template>
        <template #cell-flashFail="{ ticket }">
          <span class="fp-text" :title="flashFailCellText(ticket)">{{ flashFailCellText(ticket) }}</span>
        </template>
        <template #cell-flashModel="{ ticket }">
          <span class="fp-product" :title="ticket.flash?.info.productModel">{{ ticket.flash?.info.productModel || '—' }}</span>
        </template>
        <template #cell-flashPoolAt="{ ticket }">
          <span class="fp-text">{{ flash.poolEnteredAtOf(ticket.no).slice(0, 16) || '—' }}</span>
        </template>
        <template #cell-flashSla="{ ticket }">
          <span v-if="isFlashSlaIdle(ticket)" class="fp-sla">
            <span class="fp-sla-line" :style="{ color: slaResolveLine(ticket).color }">—</span>
          </span>
          <span v-else class="fp-sla">
            <span class="fp-sla-line" :style="{ color: slaResolveLine(ticket).color }">解决：{{ slaResolveLine(ticket).text }}</span>
            <span class="fp-sla-line" :style="{ color: slaFirstLine(ticket).color }">首响：{{ slaFirstLine(ticket).text }}</span>
          </span>
        </template>
      </TicketRichList>
      <div class="flash-pool__pager">
        <span class="flash-pool__total">共 {{ shownRows.length }} 条</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.flash-pool {
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex: 1;
  min-height: 0;
  min-width: 0;
}
.flash-pool__bar {
  display: flex;
  justify-content: flex-end;
}
/* 搜索框：照 TicketToolbar 的 .wb-toolbar__search 同款 */
.flash-pool__search {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 220px;
  height: 36px;
  padding: 0 10px;
  background: #fff;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  box-sizing: border-box;
  flex: none;
}
.flash-pool__search:focus-within {
  border-color: #1a6fff;
  box-shadow: 0 0 0 2px rgb(26 111 255 / 10%);
}
.flash-pool__input {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  font-size: 13px;
  color: #374151;
  background: transparent;
}
.flash-pool__input::placeholder {
  color: #9ca3af;
}
.flash-pool__card {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}
.flash-pool__pager {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  border-top: 1px solid #e5e7eb;
  flex: none;
}
.flash-pool__total {
  font-size: 13px;
  color: #6b7280;
}
/* 普通文本格：照列表 .plain-text */
.fp-text {
  font-size: 12px;
  color: #374151;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* 产品型号：照列表「产品」列 .product-name */
.fp-product {
  font-size: 13px;
  font-weight: 600;
  color: #111827;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* SLA 两行：照列表 .cell-sla / .sla-line */
.fp-sla {
  display: flex;
  flex-direction: column;
  gap: 2px;
  align-items: flex-start;
}
.fp-sla-line {
  font-size: 12px;
  font-weight: 600;
  line-height: 18px;
  white-space: nowrap;
}
</style>
