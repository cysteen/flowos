<script setup lang="ts">
import { CheckOutlined } from '@ant-design/icons-vue';
import { computed } from 'vue';
import {
  doneRowActions,
  isMentionUnread,
  mentionRowActions,
  mineRowActions,
  poolRowActions,
  PRIORITY_COLOR,
  rowActions,
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
}>();

/** 列是否显示（未配置或未含该列 → 默认显示） */
function showCol(key: string) {
  if (key === 'assignee' && props.variant === 'mine') return false;
  return !props.visibleColumns || props.visibleColumns[key] !== false;
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
</script>

<template>
  <div class="rich-list">
    <!-- 表头 -->
    <div class="thead">
      <div v-if="showSelectionColumn" class="cell-cb">
        <div class="cb" :class="{ checked: allPageSelected }" @click="emit('toggleAll')">
          <CheckOutlined v-if="allPageSelected" :style="{ color: '#fff', fontSize: '10px' }" />
        </div>
      </div>
      <div class="col-title th">工单 / 标题</div>
      <div v-if="showCol('priority')" class="col-priority th">优先级</div>
      <div v-if="showCol('summary')" class="col-summary th">工单摘要</div>
      <div v-if="showCol('customer')" class="col-customer th">客户</div>
      <div v-if="showCol('product')" class="col-product th">产品</div>
      <div v-if="showCol('node')" class="col-node th">当前节点</div>
      <div v-if="showCol('sla')" class="col-sla th">SLA 时效</div>
      <div v-if="showAppointmentColumn" class="col-appointment th">预约倒计时</div>
      <div v-if="showCol('assignee')" class="col-assignee th">处理人</div>
      <div v-if="showActionColumn" class="col-action th">操作</div>
    </div>

    <!-- 空态 -->
    <div v-if="rows.length === 0" class="empty">该筛选下暂无工单</div>

    <!-- 数据行 -->
    <div
      v-for="t in rows"
      :key="t.id"
      class="row"
      :style="{ borderLeftColor: PRIORITY_COLOR[t.priority] }"
      @dblclick="emit('open', t)"
    >
      <div v-if="showSelectionColumn" class="cell-cb">
        <div class="cb" :class="{ checked: selectedIds.has(t.id) }" @click="emit('toggle', t.id)">
          <CheckOutlined v-if="selectedIds.has(t.id)" :style="{ color: '#fff', fontSize: '10px' }" />
        </div>
      </div>

      <!-- 工单 / 标题 -->
      <div class="col-title cell-title">
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

      <!-- 优先级（颜色已由左侧色条承载，此处仅文字 + 同色点，避免与 SLA 抢色） -->
      <div v-if="showCol('priority')" class="col-priority">
        <span class="prio">
          <span class="prio-dot" :style="{ background: PRIORITY_COLOR[t.priority] }"></span>
          {{ t.priority }}
        </span>
      </div>

      <!-- 工单摘要：与处理页速览带同构（hi-meta + hi-text） -->
      <div v-if="showCol('summary')" class="col-summary cell-summary">
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
              <div class="sp-no">{{ t.no }}</div>
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

      <!-- 客户 -->
      <div v-if="showCol('customer')" class="col-customer cell-customer">
        <div class="cust-line1">
          <span class="cust-name" @click="emit('clickCustomer', t)">{{ t.customer }}</span>
          <span
            v-for="tag in t.customerTags"
            :key="tag"
            class="cust-tag"
          >{{ tag }}</span>
        </div>
      </div>

      <!-- 产品 -->
      <div v-if="showCol('product')" class="col-product cell-product">
        <span class="product-name" :title="t.product">{{ t.product }}</span>
      </div>

      <!-- 当前节点 -->
      <div v-if="showCol('node')" class="col-node cell-node">
        <span class="node-badge">{{ t.nodeStatus }}</span>
      </div>

      <!-- SLA 时效 -->
      <div v-if="showCol('sla')" class="col-sla cell-sla">
        <span
          class="sla-pill"
          :style="{ color: SLA_COLOR[t.slaState], background: softBg(SLA_COLOR[t.slaState]) }"
          >{{ t.slaText }}</span
        >
        <span class="sla-sub">{{ t.slaSub }}</span>
      </div>

      <!-- 预约倒计时 -->
      <div v-if="showAppointmentColumn" class="col-appointment cell-appointment">
        <span
          v-if="t.hasAppointment && t.appointmentText"
          class="appt-pill"
        >{{ t.appointmentText }}</span>
        <span v-else class="appt-empty">—</span>
      </div>

      <!-- 处理人 -->
      <div v-if="showCol('assignee')" class="col-assignee cell-assignee">
        <span v-if="t.assignee" class="assignee-name">{{ t.assignee }}</span>
        <span v-else class="unassigned">— 待领</span>
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
.col-title { flex: 1; min-width: 140px; }
.col-summary { width: 220px; flex: none; }
.col-customer { width: 108px; flex: none; }
.col-product { width: 128px; flex: none; }
.col-node { width: 130px; flex: none; }
.col-priority { width: 58px; flex: none; }
.col-sla { width: 118px; flex: none; }
.col-appointment { width: 96px; flex: none; }
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
.cell-customer { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
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
.summary-pop .sp-no { font-size: 11px; color: #9ca3af; margin-top: -2px; }
.summary-pop .sp-block { display: flex; flex-direction: column; gap: 4px; }
.summary-pop .hi-meta { display: flex; align-items: center; gap: 8px; }
.summary-pop .hi-label { font-size: 12px; font-weight: 600; color: #6b7280; }
.summary-pop .hi-label.handle { color: #047857; }
.summary-pop .hi-who { font-size: 12px; font-weight: 600; color: #111827; }
.summary-pop .hi-role { font-size: 11px; color: #6b7280; background: #f3f4f6; border-radius: 4px; padding: 0 6px; }
.summary-pop .hi-when { font-size: 11px; color: #9ca3af; margin-left: auto; }
.summary-pop .hi-text { font-size: 12px; color: #374151; line-height: 1.6; word-break: break-word; }
</style>
