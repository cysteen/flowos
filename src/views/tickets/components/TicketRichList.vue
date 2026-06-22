<script setup lang="ts">
import { CheckOutlined } from '@ant-design/icons-vue';
import {
  PRIORITY_COLOR,
  rowActions,
  SLA_COLOR,
  softBg,
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
          <span class="tag">{{ t.type }}</span>
          <span class="title-text">{{ t.title }}</span>
        </div>
        <div class="title-line2">
          <span class="channel">{{ t.channel }}</span>
          <span class="sep">·</span>
          <span class="ticket-no" @click="emit('clickNo', t)">{{ t.no }}</span>
        </div>
      </div>

      <!-- 客户 · 产品 -->
      <div class="col-customer cell-customer">
        <div class="cust-line1">
          <span class="cust-name" @click="emit('clickCustomer', t)">{{ t.customer }}</span>
          <span
            v-for="tag in t.customerTags"
            :key="tag"
            class="cust-tag"
          >{{ tag }}</span>
        </div>
        <div class="product">{{ t.product }}</div>
      </div>

      <!-- 当前节点 -->
      <div class="col-node cell-node">
        <span class="node-badge">{{ t.nodeStatus }}</span>
        <span class="node-step">节点 {{ t.nodeStep }}/{{ t.nodeTotal }}</span>
      </div>

      <!-- 优先级（颜色已由左侧色条承载，此处仅文字 + 同色点，避免与 SLA 抢色） -->
      <div class="col-priority">
        <span class="prio">
          <span class="prio-dot" :style="{ background: PRIORITY_COLOR[t.priority] }"></span>
          {{ t.priority }}
        </span>
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
          <span class="avatar">{{ t.assignee.charAt(0) }}</span>
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
  flex: 1;
  min-height: 0;
  overflow: auto;
}
/* 列宽对齐 .pen SJpgc thead/row body */
.col-title { flex: 1; min-width: 160px; }
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
  flex: none;
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
  flex: none;
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

/* 分类信息一律中性灰：类型/节点/客户标签——“是什么”，不抢色 */
.tag {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 4px;
  white-space: nowrap;
  color: #4b5563;
  background: #f3f4f6;
}

/* 工单/标题：第一行 类型+标题，第二行 来源+单号 */
.cell-title { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.title-line1 { display: flex; align-items: center; gap: 8px; min-width: 0; }
.title-line2 { display: flex; align-items: center; gap: 6px; min-width: 0; }
.title-text {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  font-weight: 500;
  color: #111827;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.channel { font-size: 12px; color: #6b7280; flex: none; }
.sep { font-size: 12px; color: #d1d5db; flex: none; }
.ticket-no { font-size: 12px; font-weight: 500; color: #1a6fff; cursor: pointer; flex: none; }
.ticket-no:hover { text-decoration: underline; }

/* 客户 */
.cell-customer { display: flex; flex-direction: column; gap: 4px; }
.cust-line1 { display: flex; align-items: center; gap: 5px; flex-wrap: wrap; }
.cust-name { font-size: 13px; font-weight: 500; color: #111827; cursor: pointer; }
.cust-tag {
  font-size: 11px; font-weight: 600;
  padding: 2px 8px; border-radius: 4px; flex: none;
  color: #4b5563; background: #f3f4f6;
}
.product { font-size: 12px; color: #9ca3af; }

/* 当前节点 */
.cell-node { display: flex; flex-direction: column; gap: 4px; align-items: flex-start; }
.node-badge {
  font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 4px;
  color: #4b5563; background: #f3f4f6;
}
.node-step { font-size: 11px; color: #9ca3af; }

.prio {
  display: inline-flex; align-items: center; gap: 5px;
  font-size: 12px; font-weight: 600; color: #4b5563;
}
.prio-dot { width: 7px; height: 7px; border-radius: 50%; flex: none; }

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
  color: #4b5563; background: #f3f4f6;
}
.assignee-name { font-size: 12px; color: #374151; }
.unassigned { font-size: 12px; color: #6b7280; }

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
