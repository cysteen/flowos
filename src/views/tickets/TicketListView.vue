<script setup lang="ts">

import { computed, onMounted, ref, watch, watchEffect } from 'vue';

import { useRoute, useRouter } from 'vue-router';

import { message, Modal } from 'ant-design-vue';

import AppPagination from '@/components/AppPagination.vue';

import TicketMineQueryBar from './components/TicketMineQueryBar.vue';

import TicketFilterBar from './components/TicketFilterBar.vue';

import TicketListToolRow from './components/TicketListToolRow.vue';

import TicketRichList from './components/TicketRichList.vue';

import TicketColumnSettings from './components/TicketColumnSettings.vue';

import CreateTicketModal from './components/CreateTicketModal.vue';

import SaveFilterModal from './components/SaveFilterModal.vue';

import { useTicketList } from './composables/useTicketList';

import { useTicketColumns } from './composables/useTicketColumns';

import { useMineQueryFields } from './composables/useMineQueryFields';

import { useQueryCenterFilterBar } from './composables/useQueryCenterFilterBar';

import {

  QUERY_CENTER_COLUMN_DEFS,

  QUERY_CENTER_FIXED_COLUMN_DEFS,

} from '@/views/query/queryCenterListColumns';

import { useQueryCenterColumns } from '@/views/query/useQueryCenterColumns';

import { hasMineQuery, type MineQueryFilter } from './types/mineQuery';

import { type Ticket } from './types/ticket';

import { queryCenterLocation } from '@/views/query/queryCenterRoute';

import { TOO_MANY_RESULTS } from '@/views/query/queryCenterSearch';

import { QUERY_CENTER_CREATE_ROLES } from '@/config/roles';

import { useUserStore } from '@/stores/user';



const props = defineProps<{ embedded?: boolean; filtersExpanded?: boolean }>();

const emit = defineEmits<{ 'open-customer': [q: string] }>();



const router = useRouter();

const route = useRoute();

const user = useUserStore();



const qcColumns = useQueryCenterColumns();

const wbColumns = useTicketColumns();

const columnSettingsOpen = ref(false);

const saveFilterModalOpen = ref(false);



/**
 * 取数范围拆开（PRD-915 §3.3 · §8 规则 1，C3）：
 * 嵌在查询中心里＝**全租户**；独立的工单列表页＝工作台口径**本人 + 本组池**。
 * 原实现两处同源（都是全量 `TICKETS` 只滤 archived），等于把工作台悄悄放大成了全租户。
 */
const list = useTicketList(props.embedded ? 'tenant' : 'workbench');

const createOpen = ref(false);



const { optionalVisible, applyOptionalVisible } = useMineQueryFields();

const qcFilterBar = useQueryCenterFilterBar(list.baseRows, list.query, applyOptionalVisible);



/**
 * 「新建工单」按角色显隐（PRD-915 §3.4「页面内动作权限」，C9）：查询中心里
 * **工单运营 / 质检不出**（它们不办单）。「列设置」「保存筛选器」是用户偏好，
 * 进得来的角色全给，故不做门控。工作台那一枚是另一个权限点，不受此判据影响。
 */
const canCreateTicket = computed(
  () => !props.embedded || QUERY_CENTER_CREATE_ROLES.includes(user.roleKey),
);

/**
 * 空态分两种（PRD-915 §3.6 E8 / E9，C10）：
 * 有关键词 → 检索无结果；无关键词但设过筛选 → 筛选无结果；都没有 → 数据域本身为空。
 * 判定顺序不能反：先看关键词，否则"搜了个不存在的词"会被说成"筛选筛没的"。
 */
const emptyKind = computed<'none' | 'search' | 'filter'>(() => {
  if (list.total.value > 0) return 'none';
  if (list.keyword.value.trim()) return 'search';
  return hasMineQuery(list.query.value) ? 'filter' : 'none';
});

/** chip 区：内置「全部 / 临期 / 已超时」三枚常驻，故查询中心一律渲染 */
const showChipRow = computed(() => props.embedded);

/** SLA chip 只叠加行过滤，不写进结构化筛选条件 */
watchEffect(() => {
  if (props.embedded) list.extraFilter.value = qcFilterBar.slaPredicate.value;
});



/** 看板下钻等入口的粗粒度 status → 基线 nodeStatus */

const LEGACY_STATUS_TO_NODE: Record<string, string> = {

  pending: '待响应',

  processing: '处理中',

  held: '已挂起',

  review: '申请关闭中',

  delegated: '已委派',

  transferred: '已转出',

  returned: '已退回',

};



/**

 * 看板 / 监控 / 搜索等入口：把 URL 参数落到筛选条件（工具页，无「我的/本组」视图 Tab）

 *

 * ⚠️ 提示只能有一条。本页被 KeepAlive 缓存，`onMounted` 与 `watch` 都会调到这里；

 * 从看板连点几张卡时又会连续导航。所以做两件事：

 *   ① 用 `appliedSig` 去重 —— 同一份 query 只应用一次；

 *   ② message 带固定 key —— 新提示**替换**旧的，而不是往下堆。

 */

const DRILL_MSG_KEY = 'ticket-list-drill';

let appliedSig = '';



function applyRouteQuery() {

  const q = route.query;

  const sig = JSON.stringify([q._from, q.status, q.priority, q.assignee, q.kw, q._label]);

  if (sig === appliedSig) return;

  appliedSig = sig;



  const hasBoard = typeof q._from === 'string' && q._from.startsWith('board.');

  const hasOpsFlow = typeof q._from === 'string' && q._from.startsWith('ops.flow.');



  if (typeof q.kw === 'string' && q.kw) {

    list.keyword.value = q.kw;

    list.applyFilters();

    return;

  }



  if (!hasBoard && !hasOpsFlow && q.status == null && q.priority == null && q.assignee == null) return;



  const next: MineQueryFilter = { ...list.query.value };

  if (typeof q.status === 'string' && q.status) {

    next.nodeStatus = (LEGACY_STATUS_TO_NODE[q.status] ?? q.status) as MineQueryFilter['nodeStatus'];

  }

  if (typeof q.priority === 'string' && q.priority) {

    next.priority = q.priority as MineQueryFilter['priority'];

  }

  if (typeof q.assignee === 'string' && q.assignee) {

    next.assignee = q.assignee;

  }

  if (props.embedded) qcFilterBar.setQuery(next);

  else list.setQuery(next);



  list.applyFilters();



  if (hasBoard || hasOpsFlow) {

    const label = typeof q._label === 'string' ? q._label : hasOpsFlow ? '运营监控' : '看板';

    message.info({ content: `已按「${label}」筛选工单`, key: DRILL_MSG_KEY, duration: 2.5 });

  }

}



onMounted(applyRouteQuery);

watch(

  () => [route.query._from, route.query.status, route.query.priority, route.query.assignee, route.query.kw, route.query._label],

  () => applyRouteQuery(),

);



function openOperation(t: Ticket) {

  router.push(`/tickets/${t.no}`);

}



/** 客户名 → 查询中心 · 查客户 */

function openCustomerInsight(t: Ticket) {

  const q = t.customerPhone || t.customer;

  if (props.embedded) {

    emit('open-customer', q);

    return;

  }

  router.push(queryCenterLocation('customer', { q }));

}



function onAction(label: string, t: Ticket) {

  if (['处理', '详情', '审核', '受理', '恢复'].includes(label)) {

    openOperation(t);

  } else if (label === '领单') {

    message.success(`已领取 ${t.no}`);

  } else {

    message.success(`已对 ${t.no} 执行「${label}」`);

  }

}



function onUpdateQuery(q: MineQueryFilter) {

  if (props.embedded) qcFilterBar.setQuery(q);

  else list.setQuery(q);

}



function onSearch() {

  list.applyFilters();

  if (!props.embedded) message.success('已查询');

}



function onReset() {

  list.resetFilters();

  if (props.embedded) {

    qcFilterBar.activeChip.value = 'all';

    router.replace(queryCenterLocation('tickets', { kw: undefined, q: undefined }));

  }

}



function onRequestSaveFilter() {

  if (!hasMineQuery(list.query.value)) {

    message.warning('请先设置筛选条件后再保存');

    return;

  }

  saveFilterModalOpen.value = true;

}



function onConfirmSaveFilter(name: string) {

  const item = qcFilterBar.saveFilter(name, { ...optionalVisible.value });

  if (item) message.success(`已保存筛选器「${name}」`);

}



function onRemoveSavedChip(chipKey: string) {

  const sf = qcFilterBar.chips.value.find((c) => c.key === chipKey);

  const name = sf?.label ?? '该筛选';

  Modal.confirm({

    title: '删除筛选器',

    content: `确定删除「${name}」？删除后不可恢复。`,

    okText: '删除',

    okType: 'danger',

    cancelText: '取消',

    onOk() {

      const removed = qcFilterBar.removeFilter(chipKey);

      if (removed) message.success(`已删除筛选器「${removed.name}」`);

    },

  });

}



function onCreated(t: Ticket) {

  list.addTicket(t);

}



/** 空态「清空筛选」（E9）：与工具条的重置同一条路径 */

function onClearFilters() {

  onReset();

}

</script>



<template>

  <div class="ticket-list" :class="{ embedded: embedded }">

    <div v-if="embedded" class="list-controls">
      <div
        class="qc-toolbar-row"
        :class="{ 'qc-toolbar-row--actions-only': !showChipRow }"
      >
        <div v-if="showChipRow" class="qc-toolbar-chips">
          <TicketFilterBar
            :active-chip="qcFilterBar.activeChip.value"
            :chip-counts="qcFilterBar.chipCounts.value"
            :chips="qcFilterBar.chips.value"
            :show-time-filter="false"
            @chip="qcFilterBar.setChip"
            @remove-chip="onRemoveSavedChip"
          />
        </div>

        <TicketListToolRow
          embedded
          :can-create="canCreateTicket"
          @create="createOpen = true"
          @columns="columnSettingsOpen = true"
        />
      </div>

      <TicketMineQueryBar

        v-show="filtersExpanded"

        :expanded="true"

        :model-value="list.query.value"

        variant="mine"

        :optional-visible="optionalVisible"

        @update:model-value="onUpdateQuery"

        @search="onSearch"

        @save-filter="onRequestSaveFilter"

        @apply-optional-visible="applyOptionalVisible"

      />

      <TicketColumnSettings

        v-model:open="columnSettingsOpen"

        :visible-columns="qcColumns.visibleColumns.value"

        :column-order="qcColumns.columnOrder.value"

        :column-defs="QUERY_CENTER_COLUMN_DEFS"

        :fixed-column-defs="QUERY_CENTER_FIXED_COLUMN_DEFS"

        :resolve-label="qcColumns.label"

        footer-hint="工单/标题为固定列（含工单类型）"

        @set-visible="qcColumns.setColumnVisible"

        @reorder="qcColumns.reorderColumn"

        @reset="qcColumns.resetColumns"

      />

    </div>

    <template v-else>

      <TicketMineQueryBar

        :expanded="true"

        :model-value="list.query.value"

        variant="mine"

        :optional-visible="optionalVisible"

        @update:model-value="onUpdateQuery"

        @search="onSearch"

        @apply-optional-visible="applyOptionalVisible"

      />

      <TicketListToolRow

        @create="createOpen = true"

        @columns="columnSettingsOpen = true"

      />

    </template>



    <TicketColumnSettings

      v-if="!embedded"

      v-model:open="columnSettingsOpen"

      :visible-columns="wbColumns.visibleColumns.value"

      :column-order="wbColumns.columnOrder.value"

      @set-visible="wbColumns.setColumnVisible"

      @reorder="wbColumns.reorderColumn"

      @reset="wbColumns.resetColumns"

    />



    <div class="table-card">

      <!-- E10 结果过多：正常分页，只在页顶提示收敛（PRD-915 §3.6 B 组） -->

      <div v-if="list.tooManyResults.value" class="too-many">

        结果较多（{{ list.total.value }} 条，超过 {{ TOO_MANY_RESULTS }}），建议补充筛选条件

      </div>

      <TicketRichList

        :rows="list.paged.value"

        :empty-kind="emptyKind"

        :visible-columns="embedded ? qcColumns.visibleColumns.value : wbColumns.visibleColumns.value"

        :column-order="embedded ? qcColumns.columnOrder.value : wbColumns.columnOrder.value"

        :column-label="embedded ? qcColumns.label : undefined"

        :variant="embedded ? 'query' : 'default'"

        @action="onAction"

        @click-no="openOperation"

        @click-customer="openCustomerInsight"

        @open="openOperation"

        @clear-filters="onClearFilters"

      />

      <div class="pager">

        <div class="pager-left">

          <span class="pager-total">共 {{ list.total.value }} 条</span>

        </div>

        <AppPagination

          :total="list.total.value"

          :current="list.current.value"

          :page-size="list.pageSize.value"

          :show-total="false"

          @change="list.setPage"

        />

      </div>

    </div>



    <CreateTicketModal v-model:open="createOpen" @created="onCreated" />



    <SaveFilterModal
      v-if="embedded"
      v-model:open="saveFilterModalOpen"
      @save="onConfirmSaveFilter"
    />

  </div>

</template>



<style scoped>

.ticket-list {

  display: flex;

  flex-direction: column;

  gap: 16px;

  min-height: 100%;

  width: 100%;

  min-width: 0;

  padding: 20px;

}

.ticket-list.embedded {

  height: 100%;

  min-height: 0;

  gap: 8px;

  padding: 10px 12px 12px;

  background: transparent;

  overflow: hidden;

}

.list-controls {

  display: flex;

  flex-direction: column;

  gap: 10px;

  width: 100%;

  min-width: 0;

  flex: none;

}

.qc-toolbar-row {

  display: flex;

  align-items: center;

  gap: 12px;

  width: 100%;

  min-width: 0;

}

.qc-toolbar-row--actions-only {

  justify-content: flex-end;

}

.qc-toolbar-chips {

  flex: 1;

  min-width: 0;

}

.qc-toolbar-chips :deep(.filter-row) {

  width: 100%;

}

.qc-toolbar-row :deep(.tool-row.embedded) {

  flex: none;

}

.table-card {

  background: #fff;

  border: 1px solid #e5e7eb;

  border-radius: 10px;

  overflow: hidden;

  display: flex;

  flex-direction: column;

  flex: 1;

  min-height: 0;

}

.ticket-list.embedded .table-card {

  border-radius: 8px;

}

.pager {

  display: flex;

  align-items: center;

  justify-content: space-between;

  padding: 12px 20px;

  border-top: 1px solid #e5e7eb;

  flex: none;

}

.pager-left {

  display: flex;

  align-items: center;

  gap: 16px;

}

.pager-total {

  font-size: 13px;

  color: #6b7280;

}

.too-many {

  flex: none;

  padding: 8px 20px;

  border-bottom: 1px solid #fde68a;

  background: #fffbeb;

  color: #92400e;

  font-size: 12px;

}

</style>

