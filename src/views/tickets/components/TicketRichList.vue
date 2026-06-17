<script setup lang="ts">
import { CheckOutlined } from '@ant-design/icons-vue';
import {
  NODE_STATUS_COLOR,
  PRIORITY_COLOR,
  rowActions,
  SLA_COLOR,
  SMART_MARK_COLOR,
  softBg,
  TYPE_COLOR,
  type Ticket,
} from '@/views/tickets/types/ticket';

defineProps<{
  rows: Ticket[];
  selectedIds: Set<string>;
  allPageSelected: boolean;
}>();
const emit = defineEmits<{
  toggle: [id: string];
  toggleAll: [];
  action: [label: string, ticket: Ticket];
  clickNo: [ticket: Ticket];
  clickCustomer: [ticket: Ticket];
}>();
</script>

<template>
  <div class="rich-list">
    <!-- 表头 -->
    <div class="thead">
      <div class="cell-cb">
        <div class="cb" :class="{ checked: allPageSelected }" @click="emit('toggleAll')">
          <CheckOutlined v-if="allPageSelected" :style="{ color: '#fff', fontSize: '10px' }" />
        </div>
      </div>
      <div class="col-title th">工单 / 标题</div>
      <div class="col-customer th">客户 · 产品</div>
      <div class="col-node th">当前节点</div>
      <div class="col-priority th">优先级</div>
      <div class="col-sla th">SLA 时效</div>
      <div class="col-assignee th">处理人</div>
      <div class="col-action th">操作</div>
    </div>

    <!-- 空态 -->
    <div v-if="rows.length === 0" class="empty">该筛选下暂无工单</div>

    <!-- 数据行 -->
    <div
      v-for="t in rows"
      :key="t.id"
      class="row"
      :style="{ borderLeftColor: PRIORITY_COLOR[t.priority] }"
    >
      <div class="cell-cb">
        <div class="cb" :class="{ checked: selectedIds.has(t.id) }" @click="emit('toggle', t.id)">
          <CheckOutlined v-if="selectedIds.has(t.id)" :style="{ color: '#fff', fontSize: '10px' }" />
        </div>
      </div>

      <!-- 工单 / 标题 -->
      <div class="col-title cell-title">
        <div class="title-line1">
          <span
            class="tag"
            :style="{ color: TYPE_COLOR[t.type], background: softBg(TYPE_COLOR[t.type]) }"
            >{{ t.type }}</span
          >
          <span class="ticket-no" @click="emit('clickNo', t)">{{ t.no }}</span>
          <span class="channel">· {{ t.channel }}</span>
        </div>
        <div class="title-line2">
          <span class="title-text">{{ t.title }}</span>
          <span
            v-for="m in t.smartMarks"
            :key="m"
            class="tag"
            :style="{ color: SMART_MARK_COLOR[m], background: softBg(SMART_MARK_COLOR[m]) }"
            >{{ m }}</span
          >
        </div>
      </div>

      <!-- 客户 · 产品 -->
      <div class="col-customer cell-customer">
        <div class="cust-line1">
          <span class="cust-name" @click="emit('clickCustomer', t)">{{ t.customer }}</span>
          <span v-if="t.vip" class="vip">VIP</span>
        </div>
        <div class="product">{{ t.product }}</div>
      </div>

      <!-- 当前节点 -->
      <div class="col-node cell-node">
        <span
          class="node-badge"
          :style="{ color: NODE_STATUS_COLOR[t.nodeStatus], background: softBg(NODE_STATUS_COLOR[t.nodeStatus]) }"
          >{{ t.nodeStatus }}</span
        >
        <span class="node-step">节点 {{ t.nodeStep }}/{{ t.nodeTotal }}</span>
      </div>

      <!-- 优先级 -->
      <div class="col-priority">
        <span
          class="prio"
          :style="{ color: PRIORITY_COLOR[t.priority], background: softBg(PRIORITY_COLOR[t.priority]) }"
          >{{ t.priority }}</span
        >
      </div>

      <!-- SLA 时效 -->
      <div class="col-sla cell-sla">
        <span
          class="sla-pill"
          :style="{ color: SLA_COLOR[t.slaState], background: softBg(SLA_COLOR[t.slaState]) }"
          >{{ t.slaText }}</span
        >
        <span class="sla-sub">{{ t.slaSub }}</span>
      </div>

      <!-- 处理人 -->
      <div class="col-assignee cell-assignee">
        <template v-if="t.assignee">
          <span
            class="avatar"
            :style="{ color: PRIORITY_COLOR[t.priority], background: softBg(PRIORITY_COLOR[t.priority]) }"
            >{{ t.assignee.charAt(0) }}</span
          >
          <span class="assignee-name">{{ t.assignee }}</span>
        </template>
        <span v-else class="unassigned">— 待领</span>
      </div>

      <!-- 操作 -->
      <div class="col-action cell-action">
        <span
          v-for="a in rowActions(t)"
          :key="a.label"
          class="act"
          :style="{ color: a.primary ? '#1A6FFF' : '#6B7280' }"
          @click="emit('action', a.label, t)"
          >{{ a.label }}</span
        >
      </div>
    </div>
  </div>
</template>

<style scoped>
.rich-list {
  display: flex;
  flex-direction: column;
}
/* 列宽（取自 .pen SJpgc） */
.col-title { flex: 1; min-width: 0; }
.col-customer { width: 170px; flex: none; }
.col-node { width: 146px; flex: none; }
.col-priority { width: 58px; flex: none; }
.col-sla { width: 118px; flex: none; }
.col-assignee { width: 100px; flex: none; }
.col-action { width: 132px; flex: none; }
.cell-cb { width: 16px; flex: none; display: flex; align-items: center; }

.thead {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 11px 20px;
  background: #fafafb;
  border-bottom: 1px solid #e5e7eb;
}
.th {
  font-size: 12px;
  font-weight: 600;
  color: #6b7280;
}

.row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 13px 16px;
  border-left: 4px solid transparent;
  border-bottom: 1px solid #f0f0f0;
}
.row:hover {
  background: #fafbff;
}

.cb {
  width: 16px;
  height: 16px;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  background: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.cb.checked {
  background: #1a6fff;
  border-color: #1a6fff;
}

.tag {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 4px;
  white-space: nowrap;
}

/* 工单/标题 */
.cell-title { display: flex; flex-direction: column; gap: 6px; }
.title-line1 { display: flex; align-items: center; gap: 8px; }
.ticket-no { font-size: 13px; font-weight: 600; color: #1a6fff; cursor: pointer; }
.channel { font-size: 11px; color: #9ca3af; }
.title-line2 { display: flex; align-items: center; gap: 8px; }
.title-text { font-size: 13px; color: #374151; }

/* 客户 */
.cell-customer { display: flex; flex-direction: column; gap: 4px; }
.cust-line1 { display: flex; align-items: center; gap: 5px; }
.cust-name { font-size: 13px; font-weight: 500; color: #111827; cursor: pointer; }
.vip { font-size: 11px; font-weight: 600; color: #b45309; background: #fef3c7; padding: 2px 8px; border-radius: 4px; }
.product { font-size: 12px; color: #9ca3af; }

/* 当前节点 */
.cell-node { display: flex; flex-direction: column; gap: 4px; align-items: flex-start; }
.node-badge { font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 4px; }
.node-step { font-size: 11px; color: #9ca3af; }

.prio { font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 4px; }

/* SLA */
.cell-sla { display: flex; flex-direction: column; gap: 4px; align-items: flex-start; }
.sla-pill { font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 4px; }
.sla-sub { font-size: 11px; color: #9ca3af; }

/* 处理人 */
.cell-assignee { display: flex; align-items: center; gap: 6px; }
.avatar {
  width: 24px; height: 24px; border-radius: 12px;
  display: flex; align-items: center; justify-content: center;
  font-size: 11px; font-weight: 600; flex: none;
}
.assignee-name { font-size: 12px; color: #374151; }
.unassigned { font-size: 12px; color: #06b6d4; }

/* 操作 */
.cell-action { display: flex; align-items: center; gap: 12px; }
.act { font-size: 13px; font-weight: 500; cursor: pointer; }

.empty {
  padding: 64px 0;
  text-align: center;
  color: #9ca3af;
  font-size: 13px;
}
</style>
