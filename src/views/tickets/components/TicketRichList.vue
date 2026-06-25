<script setup lang="ts">
import { CheckOutlined } from '@ant-design/icons-vue';
import { computed } from 'vue';
import {
  columnLabel,
  TICKET_COLUMN_DEFS,
} from '@/views/tickets/composables/useTicketColumns';
import {
  doneRowActions,
  isMentionUnread,
  mentionRowActions,
  mineRowActions,
  poolRowActions,
  PRIORITY_COLOR,
  rowActions,
  resolveTicketGroupNames,
  SLA_COLOR,
  softBg,
  type Ticket,
} from '@/views/tickets/types/ticket';
import { ticketLatestHandlingPreview } from '@/views/tickets/utils/ticketOverview';

const props = defineProps<{
  rows: Ticket[];
  selectedIds: Set<string>;
  allPageSelected: boolean;
  variant?: 'mine' | 'done' | 'pool' | 'mention' | 'default';
  showAppointmentColumn?: boolean;
  highlightMentionUnread?: boolean;
  /** 列设置：公共属性列显隐（不传=全显，向后兼容） */
  visibleColumns?: Record<string, boolean>;
  /** 列顺序（可配置列 key 列表） */
  columnOrder?: string[];
}>();

const DEFAULT_ORDER = TICKET_COLUMN_DEFS.map((c) => c.key);

/** 列是否显示（未配置或未含该列 → 默认显示） */
function showCol(key: string) {
  if (key === 'assignee' && (props.variant === 'mine' || props.variant === 'pool')) return false;
  if (key === 'groupNames' && props.variant !== 'pool') return false;
  return !props.visibleColumns || props.visibleColumns[key] !== false;
}

const orderedCols = computed(() => {
  const order = props.columnOrder?.length ? props.columnOrder : DEFAULT_ORDER;
  return order.filter((key) => showCol(key));
});

function ticketSourceLabel(t: Ticket): string {
  if (t.ticketSource) return t.ticketSource;
  if (t.channel === '电话') return '400呼入';
  return t.channel;
}

function plainCellText(t: Ticket, key: string): string {
  switch (key) {
    case 'businessType':
      return t.businessType ?? '—';
    case 'ticketType':
      return t.type;
    case 'ticketSource':
      return ticketSourceLabel(t);
    case 'productCategory':
      return t.productCategory ?? '—';
    case 'deviceSn':
      return t.sn ?? '—';
    case 'problemL1':
      return t.problemL1 ?? '—';
    case 'problemL2':
      return t.problemL2 ?? '—';
    case 'problemL3':
      return t.problemL3 ?? '—';
    case 'resolveTimeRemark':
      return t.resolveTimeRemark ?? '—';
    default:
      return '—';
  }
}

function colClass(key: string): string {
  return `col-${key.replace(/([A-Z])/g, '-$1').toLowerCase()}`;
}

const emit = defineEmits<{
  toggle: [id: string];
  toggleAll: [];
  action: [label: string, ticket: Ticket];
  clickNo: [ticket: Ticket];
  clickCustomer: [ticket: Ticket];
  open: [ticket: Ticket];
}>();

function actionsFor(t: Ticket) {
  if (props.variant === 'mine') return mineRowActions();
  if (props.variant === 'done') return doneRowActions();
  if (props.variant === 'mention') return mentionRowActions();
  if (props.variant === 'pool') return poolRowActions();
  return rowActions(t);
}

const showActionColumn = computed(
  () => props.variant !== 'done' && props.variant !== 'mention',
);
const showSelectionColumn = computed(() => props.variant === 'mine' || props.variant === 'pool');

/** 列宽（与下方样式一致，用于 grid 对齐表头与数据行） */
const COL_WIDTH: Record<string, string> = {
  priority: '58px',
  summary: '220px',
  customer: '108px',
  groupNames: '108px',
  product: '128px',
  node: '130px',
  sla: '118px',
  appointment: '96px',
  assignee: '100px',
  action: '132px',
  businessType: '88px',
  ticketType: '88px',
  ticketSource: '88px',
  productCategory: '88px',
  deviceSn: '120px',
  problemL1: '88px',
  problemL2: '88px',
  problemL3: '88px',
  resolveTimeRemark: '120px',
};

const gridTemplateColumns = computed(() => {
  const parts: string[] = [];
  if (showSelectionColumn.value) parts.push('16px');
  // 工单/标题列弹性（吸收容器剩余宽度，避免右侧大片留白）；其余列固定 px
  parts.push('minmax(240px, 1fr)');
  for (const key of orderedCols.value) {
    parts.push(COL_WIDTH[key] ?? '88px');
  }
  if (props.showAppointmentColumn) parts.push(COL_WIDTH.appointment);
  if (showActionColumn.value) parts.push(COL_WIDTH.action);
  return parts.join(' ');
});
</script>

<template>
  <div class="rich-list">
    <div class="rich-list-scroll">
      <div v-if="rows.length === 0" class="empty">该筛选下暂无工单</div>

      <div v-else class="table-grid" :style="{ gridTemplateColumns }">
        <!-- 表头 -->
        <div class="thead">
          <div v-if="showSelectionColumn" class="cell-cb th-cell">
            <div class="cb" :class="{ checked: allPageSelected }" @click="emit('toggleAll')">
              <CheckOutlined v-if="allPageSelected" :style="{ color: '#fff', fontSize: '10px' }" />
            </div>
          </div>
          <div class="col-title th th-cell">工单 / 标题</div>
          <template v-for="colKey in orderedCols" :key="`th-${colKey}`">
            <div :class="[colClass(colKey), 'th', 'th-cell']">{{ columnLabel(colKey) }}</div>
          </template>
          <div v-if="showAppointmentColumn" class="col-appointment th th-cell">预约倒计时</div>
          <div v-if="showActionColumn" class="col-action th th-cell">操作</div>
        </div>

        <!-- 数据行 -->
        <div
          v-for="t in rows"
          :key="t.id"
          class="row"
          @dblclick="emit('open', t)"
        >
      <div
        v-if="showSelectionColumn"
        class="cell-cb row-leading"
        :style="{ borderLeftColor: PRIORITY_COLOR[t.priority] }"
      >
        <div class="cb" :class="{ checked: selectedIds.has(t.id) }" @click="emit('toggle', t.id)">
          <CheckOutlined v-if="selectedIds.has(t.id)" :style="{ color: '#fff', fontSize: '10px' }" />
        </div>
      </div>

      <!-- 工单 / 标题 -->
      <div
        class="col-title cell-title"
        :class="{ 'row-leading': !showSelectionColumn }"
        :style="!showSelectionColumn ? { borderLeftColor: PRIORITY_COLOR[t.priority] } : undefined"
      >
        <div class="title-line1">
          <span class="tag">{{ t.type }}</span>
          <span class="title-text" :class="{ unread: highlightMentionUnread && isMentionUnread(t) }">{{ t.title }}</span>
          <span v-if="highlightMentionUnread && isMentionUnread(t)" class="unread-tag">未读</span>
        </div>
        <div class="title-line2">
          <span class="channel">{{ t.channel }}</span>
          <span class="sep">·</span>
          <span class="ticket-no" @click="emit('clickNo', t)">{{ t.no }}</span>
        </div>
      </div>

      <template v-for="colKey in orderedCols" :key="`${t.id}-${colKey}`">
        <div v-if="colKey === 'priority'" class="col-priority">
          <span class="prio">
            <span class="prio-dot" :style="{ background: PRIORITY_COLOR[t.priority] }"></span>
            {{ t.priority }}
          </span>
        </div>

        <div v-else-if="colKey === 'summary'" class="col-summary cell-summary">
          <a-popover trigger="hover" placement="rightTop" :mouse-enter-delay="0.2">
            <div class="summary-stack">
              <div class="summary-line">
                <span class="hi-label">问题</span>
                <span class="hi-text line-clamp">{{ t.problemDesc || '—' }}</span>
              </div>
              <div class="summary-line">
                <span class="hi-label handle">最新</span>
                <span class="hi-text line-clamp">{{ t.latestHandling || '暂无处理记录' }}</span>
              </div>
            </div>
            <template #content>
              <div class="summary-pop">
                <div class="sp-title"><span class="sp-type">{{ t.type }}</span>{{ t.title }}</div>
                <div class="sp-block">
                  <div class="hi-meta">
                    <span class="hi-label">问题描述</span>
                  </div>
                  <div class="hi-text">{{ t.problemDesc || '—' }}</div>
                </div>
                <div class="sp-block">
                  <div class="hi-meta">
                    <span class="hi-label handle">最新处理</span>
                    <template v-if="ticketLatestHandlingPreview(t)">
                      <span class="hi-who">{{ ticketLatestHandlingPreview(t)!.who }}</span>
                      <span class="hi-role">{{ ticketLatestHandlingPreview(t)!.role }}</span>
                      <span class="hi-when">{{ ticketLatestHandlingPreview(t)!.when }}</span>
                    </template>
                  </div>
                  <div class="hi-text">{{ t.latestHandling || '暂无处理记录' }}</div>
                </div>
              </div>
            </template>
          </a-popover>
        </div>

        <div v-else-if="colKey === 'customer'" class="col-customer cell-customer">
          <div class="cust-line1">
            <span class="cust-name" @click="emit('clickCustomer', t)">{{ t.customer }}</span>
            <span
              v-for="tag in t.customerTags"
              :key="tag"
              class="cust-tag"
            >{{ tag }}</span>
          </div>
        </div>

        <div v-else-if="colKey === 'groupNames'" class="col-group-names cell-groups">
          <a-popover
            v-if="resolveTicketGroupNames(t).length > 1"
            trigger="hover"
            placement="top"
            :mouse-enter-delay="0.2"
          >
            <div class="group-stack">
              <span
                v-for="g in resolveTicketGroupNames(t).slice(0, 2)"
                :key="g"
                class="group-tag"
              >{{ g }}</span>
              <span v-if="resolveTicketGroupNames(t).length > 2" class="group-more">
                +{{ resolveTicketGroupNames(t).length - 2 }}
              </span>
            </div>
            <template #content>
              <div class="group-pop">
                <span
                  v-for="g in resolveTicketGroupNames(t)"
                  :key="g"
                  class="group-tag"
                >{{ g }}</span>
              </div>
            </template>
          </a-popover>
          <div v-else-if="resolveTicketGroupNames(t).length" class="group-stack">
            <span
              v-for="g in resolveTicketGroupNames(t)"
              :key="g"
              class="group-tag"
            >{{ g }}</span>
          </div>
          <span v-else class="group-empty">—</span>
        </div>

        <div v-else-if="colKey === 'product'" class="col-product cell-product">
          <span class="product-name" :title="t.product">{{ t.product }}</span>
        </div>

        <div v-else-if="colKey === 'node'" class="col-node cell-node">
          <span class="node-badge">{{ t.nodeStatus }}</span>
        </div>

        <div v-else-if="colKey === 'sla'" class="col-sla cell-sla">
          <span
            class="sla-pill"
            :style="{ color: SLA_COLOR[t.slaState], background: softBg(SLA_COLOR[t.slaState]) }"
          >{{ t.slaText }}</span>
          <span class="sla-sub">{{ t.slaSub }}</span>
        </div>

        <div v-else-if="colKey === 'assignee'" class="col-assignee cell-assignee">
          <span v-if="t.assignee" class="assignee-name">{{ t.assignee }}</span>
          <span v-else class="unassigned">— 待领</span>
        </div>

        <div v-else :class="[colClass(colKey), 'cell-plain']">
          <span class="plain-text" :title="plainCellText(t, colKey)">{{ plainCellText(t, colKey) }}</span>
        </div>
      </template>

      <!-- 预约倒计时 -->
      <div v-if="showAppointmentColumn" class="col-appointment cell-appointment">
        <span
          v-if="t.hasAppointment && t.appointmentText"
          class="appt-pill"
        >{{ t.appointmentText }}</span>
        <span v-else class="appt-empty">—</span>
      </div>

      <!-- 操作 -->
      <div v-if="showActionColumn" class="col-action cell-action">
        <span
          v-for="a in actionsFor(t)"
          :key="a.label"
          class="act"
          :style="{ color: a.primary ? '#1A6FFF' : '#6B7280' }"
          @click.stop="emit('action', a.label, t)"
          >{{ a.label }}</span
        >
      </div>
      </div>
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
  overflow: hidden;
}
.rich-list-scroll {
  flex: 1;
  min-height: 0;
  overflow: auto;
}
.table-grid {
  display: grid;
  /* 不用 column-gap：列间空隙会在带背景的表头露出白缝。改用单元格右内边距撑开间距、表头背景连续 */
  column-gap: 0;
  /* 宽度填满容器，工单/标题列(1fr)吸收剩余宽度；列多溢出时由外层 .rich-list-scroll 横向滚动 */
  width: 100%;
  min-width: max-content;
  padding: 0 16px;
  box-sizing: border-box;
}
.thead,
.row {
  display: contents;
}
.th-cell {
  display: flex;
  align-items: center;
  min-height: 0;
  padding: 11px 12px 11px 0;
  background: #fafafb;
  border-bottom: 1px solid #e5e7eb;
}
.th-cell.cell-cb {
  border-left: 4px solid transparent;
  padding-left: 4px;
  margin-left: -4px;
}
.row > * {
  display: flex;
  align-items: center;
  min-height: 0;
  padding: 13px 12px 13px 0;
  border-bottom: 1px solid #f0f0f0;
  background: #fff;
}
.row:hover > * {
  background: #fafbff;
}
.row-leading {
  border-left: 4px solid transparent;
  padding-left: 4px;
  margin-left: -4px;
}
/* 列宽由 gridTemplateColumns 控制，此处仅保留单元格内容样式 */
.col-title { min-width: 0; overflow: hidden; }
.col-summary { min-width: 0; overflow: hidden; }
.col-customer { min-width: 0; overflow: hidden; }
.col-group-names { min-width: 0; overflow: hidden; }
.col-product { min-width: 0; overflow: hidden; }
.col-node { min-width: 0; overflow: hidden; }
.col-priority { min-width: 0; overflow: hidden; }
.col-sla { min-width: 0; overflow: hidden; }
.col-appointment { min-width: 0; overflow: hidden; }
.col-assignee { min-width: 0; overflow: hidden; }
.col-action { min-width: 0; overflow: hidden; }
.col-business-type,
.col-ticket-type,
.col-ticket-source,
.col-product-category,
.col-device-sn,
.col-problem-l1,
.col-problem-l2,
.col-problem-l3,
.col-resolve-time-remark { min-width: 0; overflow: hidden; }
.cell-plain { display: flex; align-items: center; min-width: 0; overflow: hidden; }
.plain-text {
  font-size: 12px;
  color: #374151;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cell-cb { width: 16px; flex: none; display: flex; align-items: center; padding-right: 0; }

.th {
  font-size: 12px;
  font-weight: 600;
  color: #6b7280;
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

/* 分类信息一律中性灰：类型/节点/客户标签 — PRD-02 §7⑨ */
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
.cell-title { display: flex; flex-direction: column; align-items: flex-start; gap: 6px; min-width: 0; }
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

/* 工单摘要列：标签 + 内容单行展示 */
.cell-summary { display: flex; align-items: center; min-width: 0; }
.summary-stack {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
  min-width: 0;
  cursor: default;
}
.summary-line {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.summary-line .hi-label {
  flex: none;
  font-size: 10px;
  font-weight: 600;
  line-height: 16px;
  padding: 0 5px;
  border-radius: 3px;
  color: #6b7280;
  background: #f3f4f6;
}
.summary-line .hi-label.handle {
  color: #047857;
  background: #ecfdf5;
}
.summary-line .hi-text {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  color: #6b7280;
  line-height: 1.4;
}
.summary-line .hi-text.line-clamp {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.title-text.unread {
  font-weight: 600;
}
.unread-tag {
  font-size: 10px;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 4px;
  color: #dc2626;
  background: #fef2f2;
  flex: none;
}

/* 客户 */
.cell-customer { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; min-width: 0; }
.cust-line1 { display: flex; align-items: center; gap: 5px; flex-wrap: wrap; min-width: 0; }
.cust-name {
  font-size: 13px;
  font-weight: 500;
  color: #111827;
  cursor: pointer;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cust-name:hover { color: #1a6fff; }
.cust-tag {
  font-size: 11px; font-weight: 600;
  padding: 2px 8px; border-radius: 4px; flex: none;
  color: #4b5563; background: #f3f4f6;
}

/* 分组名称 */
.cell-groups { display: flex; align-items: center; min-width: 0; }
.group-stack {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  max-width: 100%;
}
.group-tag {
  font-size: 11px;
  font-weight: 600;
  line-height: 1.3;
  padding: 2px 6px;
  border-radius: 4px;
  color: #4b5563;
  background: #f3f4f6;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}
.group-more {
  font-size: 11px;
  color: #6b7280;
  padding-left: 2px;
}
.group-empty { font-size: 12px; color: #d1d5db; }

/* 产品 */
.cell-product { display: flex; align-items: center; min-width: 0; }
.product-name {
  font-size: 13px;
  font-weight: 600;
  color: #111827;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 当前节点 */
.cell-node { display: flex; align-items: center; }
.node-badge {
  font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 4px;
  color: #4b5563; background: #f3f4f6;
}

.prio {
  display: inline-flex; align-items: center; gap: 5px;
  font-size: 12px; font-weight: 600; color: #4b5563;
}
.prio-dot { width: 7px; height: 7px; border-radius: 50%; flex: none; }

/* SLA */
.cell-sla { display: flex; flex-direction: column; gap: 4px; align-items: flex-start; }
.sla-pill { font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 4px; }
.sla-sub { font-size: 11px; color: #9ca3af; }

.cell-appointment { display: flex; align-items: center; }
.appt-pill {
  font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 4px;
  color: #d97706; background: #fffbeb;
}
.appt-empty { font-size: 12px; color: #d1d5db; }

/* 处理人 */
.cell-assignee { display: flex; align-items: center; }
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

<!-- 工单摘要 hover 弹窗内容（teleport 到 body，需非 scoped） -->
<style>
.summary-pop { width: 320px; display: flex; flex-direction: column; gap: 8px; }
.summary-pop .sp-title {
  font-size: 13px; font-weight: 600; color: #111827; line-height: 1.4;
  display: flex; align-items: baseline; gap: 6px;
}
.summary-pop .sp-type {
  flex: none; font-size: 11px; font-weight: 600; color: #4b5563;
  background: #f3f4f6; border-radius: 3px; padding: 1px 6px;
}
.summary-pop .sp-block { display: flex; flex-direction: column; gap: 4px; }
.summary-pop .hi-meta { display: flex; align-items: center; gap: 8px; }
.summary-pop .hi-label { font-size: 12px; font-weight: 600; color: #6b7280; }
.summary-pop .hi-label.handle { color: #047857; }
.summary-pop .hi-who { font-size: 12px; font-weight: 600; color: #111827; }
.summary-pop .hi-role { font-size: 11px; color: #6b7280; background: #f3f4f6; border-radius: 4px; padding: 0 6px; }
.summary-pop .hi-when { font-size: 11px; color: #9ca3af; margin-left: auto; }
.summary-pop .hi-text { font-size: 12px; color: #374151; line-height: 1.6; word-break: break-word; }
.group-pop {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  max-width: 220px;
}
.group-pop .group-tag {
  flex: none;
  white-space: nowrap;
}
</style>
