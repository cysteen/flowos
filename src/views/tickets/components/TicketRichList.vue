<script setup lang="ts">
import { CheckOutlined } from '@ant-design/icons-vue';
import { computed, onUnmounted, ref, watch } from 'vue';
import {
  columnLabel,
  TICKET_COLUMN_DEFS,
} from '@/views/tickets/composables/useTicketColumns';
import {
  listCellText,
} from '@/views/tickets/utils/ticketListCells';
import {
  doneRowActions,
  isFirstResponded,
  isMentionUnread,
  mentionRowActions,
  mineRowActions,
  poolRowActions,
  PRIORITY_COLOR,
  rowActions,
  resolveTicketGroupNames,
  SLA_COLOR,
  statusStyle,
  // 状态徽章文案取**页面展示名称**（基线 §1 第三列：列表状态列属"用户读到的文案"那一档）；
  // 配色仍按 nodeStatus（落库子状态）算 —— 基线要求逻辑判断一律用子状态。
  ticketStatusDisplayName,
  type Ticket,
  isDunningTagPending,
  isSupplementTagPending,
} from '@/views/tickets/types/ticket';
import { ticketLatestHandlingPreview } from '@/views/tickets/utils/ticketOverview';
import { ticketListSourceLabel } from '@/views/tickets/types/createTicket';

const props = withDefaults(
  defineProps<{
    rows: Ticket[];
    selectedIds?: Set<string>;
    allPageSelected?: boolean;
    variant?: 'mine' | 'done' | 'pool' | 'mention' | 'default' | 'query';
    showAppointmentColumn?: boolean;
    highlightMentionUnread?: boolean;
    /** 列设置：公共属性列显隐（不传=全显，向后兼容） */
    visibleColumns?: Record<string, boolean>;
    /** 列顺序（可配置列 key 列表） */
    columnOrder?: string[];
    /** 自定义列标题（查询中心） */
    columnLabel?: (key: string) => string;
    /**
     * 空态类型（PRD-915 §3.6 E8 / E9，C10）。**必须分两种**：
     * - `search` 检索无结果 —— 「未找到匹配的工单」，引导换关键词；
     * - `filter` 筛选无结果 —— 「当前筛选条件下没有工单」+「清空筛选」按钮；
     * - `none` 数据域本身为空 —— 保持原通用文案。
     * 原实现三种情况统一说「该筛选下暂无工单」，搜不到时也说"筛选"，
     * 坐席会去清一个从没设过的筛选。
     */
    emptyKind?: 'none' | 'search' | 'filter';
  }>(),
  {
    selectedIds: () => new Set<string>(),
    allPageSelected: false,
    emptyKind: 'none',
  },
);

const DEFAULT_ORDER = TICKET_COLUMN_DEFS.map((c) => c.key);

function colLabel(key: string): string {
  return props.columnLabel?.(key) ?? columnLabel(key);
}

/** 列是否显示（未配置或未含该列 → 默认显示） */
function showCol(key: string) {
  if (key === 'assignee' && (props.variant === 'mine' || props.variant === 'pool')) return false;
  if (key === 'groupNames' && props.variant !== 'pool' && props.variant !== 'query') return false;
  if (key === 'currentGroup' && props.variant !== 'query') return false;
  return !props.visibleColumns || props.visibleColumns[key] !== false;
}

const orderedCols = computed(() => {
  const order = props.columnOrder?.length ? props.columnOrder : DEFAULT_ORDER;
  return order.filter((key) => showCol(key));
});

function plainCellText(t: Ticket, key: string): string {
  return listCellText(t, key);
}

function colClass(key: string): string {
  return `col-${key.replace(/([A-Z])/g, '-$1').toLowerCase()}`;
}

function dunningTagLabel(_t: Ticket): string {
  return '催';
}

function supplementTagLabel(_t: Ticket): string {
  return '补';
}

function dunningTagTip(t: Ticket): string {
  return isDunningTagPending(t) ? '被催办 · 待联系回话' : '已催 · 已联系';
}

function supplementTagTip(t: Ticket): string {
  return isSupplementTagPending(t) ? '新补充 · 待联系回话' : '已补 · 已联系';
}

/** 与 MetricTipIcon / 班组看板口径 Tooltip 统一：浅琥珀底 + 深棕字 */
const csTagTipOverlayWrap = { maxWidth: '340px' };
const csTagTipOverlayInner = {
  maxWidth: '340px',
  color: '#713f12',
  fontSize: '12px',
  lineHeight: '1.6',
  padding: '10px 12px',
};

// ---- SLA 列：两行文本「解决：超/剩」「首响：超/剩」（PRD §8.2）----
/** 倒计时短文案：'03:20:00'→'剩 03:20'；'已超 01:12'→'超 01:12'；'已暂停' 等非倒计时文案原样 */
function slaShort(text: string): string {
  if (text.startsWith('已超')) return text.replace('已超', '超');
  if (!/\d/.test(text)) return text;
  return `剩 ${text.replace(/^(\d{2}:\d{2}):\d{2}$/, '$1')}`;
}
const isResponded = isFirstResponded; // 共享口径（types/ticket.ts）
const BREACHED_LINE = { text: '未达标', color: SLA_COLOR.overdue };
const MET_LINE = { text: '已达标', color: SLA_COLOR.ok };

/** 解决行状态全枚举：剩(正常绿/临期橙)/超(红·在计)/已暂停(灰·挂起)/已达标(绿·正常关闭)/未达标(红·超时后关闭) */
function slaResolveLine(t: Ticket): { text: string; color: string } {
  if (t.slaText === '—') return t.solveBreached ? BREACHED_LINE : MET_LINE; // 已停表：终态按结果
  if (!isResponded(t) && t.resolveSlaText) {
    return { text: slaShort(t.resolveSlaText), color: SLA_COLOR[t.resolveSlaState ?? 'ok'] };
  }
  return { text: slaShort(t.slaText), color: SLA_COLOR[t.slaState] };
}
/** 首响行状态全枚举：剩(正常绿/临期橙)/超(红·未响仍在计)/已暂停(灰·挂起且未响)/已达标(绿)/未达标(红·超时后才响) */
function slaFirstLine(t: Ticket): { text: string; color: string } {
  if (isResponded(t)) return t.firstRespBreached ? BREACHED_LINE : MET_LINE;
  if (t.slaState === 'paused') return { text: '已暂停', color: SLA_COLOR.paused };
  return { text: slaShort(t.slaText), color: SLA_COLOR[t.slaState] };
}

// 无分页全量列表：数据集变化（切 Tab / 筛选 / 重算快照）时滚回顶部
const scrollEl = ref<HTMLElement | null>(null);
watch(
  () => props.rows,
  () => {
    if (scrollEl.value) scrollEl.value.scrollTop = 0;
  },
);

const emit = defineEmits<{
  toggle: [id: string];
  toggleAll: [];
  action: [label: string, ticket: Ticket];
  clickNo: [ticket: Ticket];
  clickCustomer: [ticket: Ticket];
  open: [ticket: Ticket];
  /** 空态「清空筛选」（E9） */
  clearFilters: [];
}>();

function actionsFor(t: Ticket) {
  if (props.variant === 'mine') return mineRowActions();
  if (props.variant === 'done') return doneRowActions();
  if (props.variant === 'mention') return mentionRowActions();
  if (props.variant === 'pool') return poolRowActions();
  return rowActions(t);
}

const showActionColumn = computed(
  () => props.variant !== 'done' && props.variant !== 'mention' && props.variant !== 'query',
);
const showSelectionColumn = computed(() => props.variant === 'mine' || props.variant === 'pool');

/** 列宽默认值（px） */
const DEFAULT_COL_WIDTH: Record<string, number> = {
  title: 300,
  summary: 220,
  priority: 58,
  customer: 100,
  groupNames: 108,
  currentGroup: 112,
  product: 120,
  node: 120,
  createdAt: 120,
  updatedAt: 120,
  sla: 112,
  appointment: 96,
  assignee: 88,
  action: 132,
  businessType: 88,
  ticketType: 72,
  ticketSource: 88,
  startDate: 96,
  lastHandler: 88,
  lastHandledAt: 108,
};

const MIN_COL_WIDTH: Record<string, number> = {
  title: 200,
  summary: 120,
  priority: 48,
  customer: 64,
  groupNames: 72,
  product: 72,
  node: 72,
  sla: 88,
  appointment: 72,
  assignee: 64,
  action: 96,
};

const DEFAULT_MIN_COL_WIDTH = 56;
const COL_WIDTH_LS_KEY = 'flowos-ticket-column-widths';

function loadColWidths(): Record<string, number> {
  try {
    const raw = localStorage.getItem(COL_WIDTH_LS_KEY);
    if (!raw) return { ...DEFAULT_COL_WIDTH };
    const parsed = JSON.parse(raw) as Record<string, number>;
    return { ...DEFAULT_COL_WIDTH, ...parsed };
  } catch {
    return { ...DEFAULT_COL_WIDTH };
  }
}

const colWidths = ref<Record<string, number>>(loadColWidths());
const resizing = ref<{ key: string; startX: number; startW: number } | null>(null);

function colWidthPx(key: string): string {
  return `${colWidths.value[key] ?? DEFAULT_COL_WIDTH[key] ?? 88}px`;
}

function minColWidth(key: string): number {
  return MIN_COL_WIDTH[key] ?? DEFAULT_MIN_COL_WIDTH;
}

function saveColWidths() {
  localStorage.setItem(COL_WIDTH_LS_KEY, JSON.stringify(colWidths.value));
}

function onResizeMove(e: MouseEvent) {
  if (!resizing.value) return;
  const { key, startX, startW } = resizing.value;
  const min = minColWidth(key);
  const next = Math.max(min, Math.round(startW + (e.clientX - startX)));
  colWidths.value = { ...colWidths.value, [key]: next };
}

function endResize() {
  if (resizing.value) saveColWidths();
  resizing.value = null;
  document.removeEventListener('mousemove', onResizeMove);
  document.removeEventListener('mouseup', endResize);
  document.body.style.cursor = '';
  document.body.style.userSelect = '';
}

function onResizeStart(e: MouseEvent, key: string) {
  e.preventDefault();
  e.stopPropagation();
  const startW = colWidths.value[key] ?? DEFAULT_COL_WIDTH[key] ?? 88;
  resizing.value = { key, startX: e.clientX, startW };
  document.addEventListener('mousemove', onResizeMove);
  document.addEventListener('mouseup', endResize);
  document.body.style.cursor = 'col-resize';
  document.body.style.userSelect = 'none';
}

onUnmounted(endResize);

const gridTemplateColumns = computed(() => {
  const parts: string[] = [];
  if (showSelectionColumn.value) parts.push('16px');
  parts.push(colWidthPx('title'));
  for (const key of orderedCols.value) {
    parts.push(colWidthPx(key));
  }
  if (props.showAppointmentColumn) parts.push(colWidthPx('appointment'));
  if (showActionColumn.value) parts.push(colWidthPx('action'));
  return parts.join(' ');
});
</script>

<template>
  <div class="rich-list" :class="{ 'rich-list--resizing': !!resizing }">
    <div ref="scrollEl" class="rich-list-scroll">
      <div v-if="rows.length === 0" class="empty">
        <template v-if="emptyKind === 'search'">
          <div class="empty-title">未找到匹配的工单</div>
          <div class="empty-sub">换个关键词，或清空筛选条件后重试</div>
        </template>
        <template v-else-if="emptyKind === 'filter'">
          <div class="empty-title">当前筛选条件下没有工单</div>
          <button type="button" class="empty-act" @click="emit('clearFilters')">清空筛选</button>
        </template>
        <template v-else>
          <div class="empty-title">暂无工单</div>
        </template>
      </div>

      <div v-else class="table-grid" :style="{ gridTemplateColumns }">
        <!-- 表头 -->
        <div class="thead">
          <div v-if="showSelectionColumn" class="cell-cb th-cell">
            <div class="cb" :class="{ checked: allPageSelected }" @click="emit('toggleAll')">
              <CheckOutlined v-if="allPageSelected" :style="{ color: '#fff', fontSize: '10px' }" />
            </div>
          </div>
          <div class="col-title th th-cell th-cell--resizable">
            <span class="th-label">工单 / 标题</span>
            <span
              class="col-resize-handle"
              :class="{ 'is-active': resizing?.key === 'title' }"
              @mousedown="onResizeStart($event, 'title')"
            />
          </div>
          <template v-for="colKey in orderedCols" :key="`th-${colKey}`">
            <div :class="[colClass(colKey), 'th', 'th-cell', 'th-cell--resizable']">
              <span class="th-label">{{ colLabel(colKey) }}</span>
              <span
                class="col-resize-handle"
                :class="{ 'is-active': resizing?.key === colKey }"
                @mousedown="onResizeStart($event, colKey)"
              />
            </div>
          </template>
          <div v-if="showAppointmentColumn" class="col-appointment th th-cell th-cell--resizable">
            <span class="th-label">预约倒计时</span>
            <span
              class="col-resize-handle"
              :class="{ 'is-active': resizing?.key === 'appointment' }"
              @mousedown="onResizeStart($event, 'appointment')"
            />
          </div>
          <div v-if="showActionColumn" class="col-action th th-cell th-cell--resizable">
            <span class="th-label">操作</span>
            <span
              class="col-resize-handle"
              :class="{ 'is-active': resizing?.key === 'action' }"
              @mousedown="onResizeStart($event, 'action')"
            />
          </div>
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
        <a-popover trigger="hover" placement="rightTop" :mouse-enter-delay="0.2">
          <div class="title-cell-inner">
            <div class="title-line1">
              <a-tooltip
                v-if="t.hasDunning"
                :title="dunningTagTip(t)"
                placement="top"
                :mouse-enter-delay="0.15"
                color="#fffbeb"
                :overlay-style="csTagTipOverlayWrap"
                :overlay-inner-style="csTagTipOverlayInner"
              >
                <span
                  class="cs-tag"
                  :class="isDunningTagPending(t) ? 'cs-tag--dunning-pending' : 'cs-tag--dunning-done'"
                  @click.stop
                >
                  {{ dunningTagLabel(t) }}
                </span>
              </a-tooltip>
              <a-tooltip
                v-if="t.hasSupplement"
                :title="supplementTagTip(t)"
                placement="top"
                :mouse-enter-delay="0.15"
                color="#fffbeb"
                :overlay-style="csTagTipOverlayWrap"
                :overlay-inner-style="csTagTipOverlayInner"
              >
                <span
                  class="cs-tag"
                  :class="isSupplementTagPending(t) ? 'cs-tag--supplement-pending' : 'cs-tag--supplement-done'"
                  @click.stop
                >
                  {{ supplementTagLabel(t) }}
                </span>
              </a-tooltip>
              <span
                class="status-tag"
                :style="statusStyle(t.nodeStatus)"
                :title="ticketStatusDisplayName(t)"
              >{{ ticketStatusDisplayName(t) }}</span>
              <span class="tag">{{ t.type }}</span>
              <span class="title-text" :class="{ unread: highlightMentionUnread && isMentionUnread(t) }">{{ t.title }}</span>
              <span v-if="highlightMentionUnread && isMentionUnread(t)" class="unread-tag">未读</span>
            </div>
            <div class="title-line2">
              <span class="channel">{{ ticketListSourceLabel(t) }}</span>
              <span class="sep">·</span>
              <span class="ticket-no" @click.stop="emit('clickNo', t)">{{ t.no }}</span>
              <span v-if="t.escalatedToNo" class="rel-tag rel-tag--to">已升级为 {{ t.escalatedToNo }}</span>
              <span v-else-if="t.escalatedFromNo" class="rel-tag rel-tag--from">升级自 {{ t.escalatedFromNo }}</span>
            </div>
          </div>
          <template #content>
            <div class="title-pop">
              <div class="tp-head">
                <span class="status-tag" :style="statusStyle(t.nodeStatus)">{{ ticketStatusDisplayName(t) }}</span>
                <span class="tag">{{ t.type }}</span>
              </div>
              <div class="tp-title">{{ t.title }}</div>
              <div class="tp-meta">{{ ticketListSourceLabel(t) }} · {{ t.no }}</div>
              <div v-if="t.escalatedToNo" class="tp-rel">已升级为 {{ t.escalatedToNo }}</div>
              <div v-else-if="t.escalatedFromNo" class="tp-rel">升级自 {{ t.escalatedFromNo }}</div>
            </div>
          </template>
        </a-popover>
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
          <span
            class="node-badge"
            :style="statusStyle(t.nodeStatus)"
          >{{ ticketStatusDisplayName(t) }}</span>
        </div>

        <div v-else-if="colKey === 'sla'" class="col-sla cell-sla">
          <span class="sla-line" :style="{ color: slaResolveLine(t).color }">解决：{{ slaResolveLine(t).text }}</span>
          <span class="sla-line" :style="{ color: slaFirstLine(t).color }">首响：{{ slaFirstLine(t).text }}</span>
        </div>

        <div v-else-if="colKey === 'assignee'" class="col-assignee cell-assignee">
          <span v-if="t.assignee" class="assignee-name">{{ t.assignee }}</span>
          <span v-else class="unassigned">— 待领</span>
        </div>

        <div v-else-if="colKey === 'currentGroup'" class="col-current-group cell-groups">
          <span class="group-tag group-tag--single">{{ plainCellText(t, colKey) }}</span>
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
  width: max-content;
  min-width: 100%;
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
.col-ticket-source { min-width: 0; overflow: hidden; }
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
.th-cell--resizable {
  position: relative;
}
.th-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding-right: 4px;
}
.col-resize-handle {
  position: absolute;
  top: 0;
  right: 0;
  width: 14px;
  height: 100%;
  transform: translateX(50%);
  cursor: col-resize;
  z-index: 2;
  touch-action: none;
  display: flex;
  align-items: center;
  justify-content: center;
}
/* 列分隔线 */
.col-resize-handle::after {
  content: '';
  position: absolute;
  top: 6px;
  bottom: 6px;
  right: 6px;
  width: 1px;
  background: #e5e7eb;
  border-radius: 1px;
  transition: background 0.15s, width 0.15s, right 0.15s;
}
/* 圆角握把 + 2×3 六点阵 */
.col-resize-handle::before {
  content: '';
  position: relative;
  z-index: 1;
  width: 10px;
  height: 16px;
  border-radius: 4px;
  border: 1px solid #e5e7eb;
  background-color: #f8fafc;
  background-image:
    radial-gradient(circle at 3px 4px, #94a3b8 1px, transparent 1px),
    radial-gradient(circle at 7px 4px, #94a3b8 1px, transparent 1px),
    radial-gradient(circle at 3px 8px, #94a3b8 1px, transparent 1px),
    radial-gradient(circle at 7px 8px, #94a3b8 1px, transparent 1px),
    radial-gradient(circle at 3px 12px, #94a3b8 1px, transparent 1px),
    radial-gradient(circle at 7px 12px, #94a3b8 1px, transparent 1px);
  background-repeat: no-repeat;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
  opacity: 0.92;
  pointer-events: none;
  transition:
    opacity 0.15s,
    border-color 0.15s,
    background-color 0.15s,
    box-shadow 0.15s,
    background-image 0.15s;
}
.thead:hover .col-resize-handle::before {
  opacity: 1;
  border-color: #d1d5db;
}
.col-resize-handle:hover::before,
.col-resize-handle.is-active::before {
  opacity: 1;
  border-color: #93c5fd;
  background-color: #eff6ff;
  background-image:
    radial-gradient(circle at 3px 4px, #1a6fff 1px, transparent 1px),
    radial-gradient(circle at 7px 4px, #1a6fff 1px, transparent 1px),
    radial-gradient(circle at 3px 8px, #1a6fff 1px, transparent 1px),
    radial-gradient(circle at 7px 8px, #1a6fff 1px, transparent 1px),
    radial-gradient(circle at 3px 12px, #1a6fff 1px, transparent 1px),
    radial-gradient(circle at 7px 12px, #1a6fff 1px, transparent 1px);
  box-shadow: 0 0 0 1px rgba(26, 111, 255, 0.12), 0 1px 3px rgba(26, 111, 255, 0.12);
}
.col-resize-handle:hover::after,
.col-resize-handle.is-active::after {
  background: #1a6fff;
  width: 2px;
  right: 5px;
}
.rich-list--resizing {
  cursor: col-resize;
  user-select: none;
}
.rich-list--resizing .rich-list-scroll {
  cursor: col-resize;
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

/* 状态标签：STATUS_COLOR_MAP（基线 §1）；类型标签中性灰 */
.status-tag {
  flex: none;
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 4px;
  white-space: nowrap;
  max-width: 108px;
  overflow: hidden;
  text-overflow: ellipsis;
}
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
.cell-title { display: flex; flex-direction: column; align-items: flex-start; gap: 6px; min-width: 0; max-width: 100%; }
.cell-title > :deep(.ant-popover-open),
.cell-title > :deep(span.ant-popover-open) {
  display: block;
  width: 100%;
  min-width: 0;
}
.title-cell-inner { width: 100%; min-width: 0; cursor: default; }
.title-line1 { display: flex; align-items: center; gap: 4px; min-width: 0; max-width: 100%; overflow: hidden; }
.title-line1 :deep(.ant-tooltip) { flex: none; line-height: 1; }
.title-line2 {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
}
.title-line2 .rel-tag {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}
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
.rel-tag {
  flex: none;
  font-size: 11px; font-weight: 600; line-height: 16px;
  padding: 0 6px; border-radius: 4px;
}
.rel-tag--to { color: #7c3aed; background: #f5f3ff; border: 1px solid #ddd6fe; }
.rel-tag--from { color: #4f46e5; background: #eef2ff; border: 1px solid #e0e7ff; }
/* 已催 / 已补：与 status-tag / rel-tag 同系；待回红框强调，已回降噪 */
.cs-tag {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  font-size: 11px;
  font-weight: 600;
  line-height: 14px;
  min-width: 16px;
  height: 16px;
  padding: 0 2px;
  border-radius: 3px;
  white-space: nowrap;
  cursor: default;
  flex-shrink: 0;
}
.cs-tag--dunning-pending,
.cs-tag--supplement-pending {
  color: #dc2626;
  background: #fee2e2;
  border: 1px solid #ef4444;
  font-weight: 700;
}
.cs-tag--dunning-done,
.cs-tag--supplement-done {
  color: #9ca3af;
  background: #f3f4f6;
  border: 1px solid #e5e7eb;
  font-weight: 500;
  padding: 0 2px;
  min-width: 16px;
}

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
  max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

.prio {
  display: inline-flex; align-items: center; gap: 5px;
  font-size: 12px; font-weight: 600; color: #4b5563;
}
.prio-dot { width: 7px; height: 7px; border-radius: 50%; flex: none; }

/* SLA */
.cell-sla { display: flex; flex-direction: column; gap: 2px; align-items: flex-start; }
.sla-line { font-size: 12px; font-weight: 600; line-height: 18px; white-space: nowrap; }

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

.group-tag--single {
  max-width: 100px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.feishu-pill {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 4px;
  white-space: nowrap;
}
.feishu-none { color: #9ca3af; background: #f3f4f6; }
.feishu-failed { color: #b91c1c; background: #fef2f2; }
.feishu-synced { color: #1d4ed8; background: #eff6ff; }
.feishu-feedback { color: #b45309; background: #fffbeb; }
.feishu-closed { color: #047857; background: #ecfdf5; }

.sync-pill {
  font-size: 12px;
  color: #6b7280;
}
.sync-pill.yes { color: #047857; font-weight: 600; }

.node-progress {
  font-size: 12px;
  font-weight: 600;
  color: #374151;
  font-variant-numeric: tabular-nums;
}

.count-pill {
  display: inline-flex;
  min-width: 20px;
  justify-content: center;
  font-size: 12px;
  font-weight: 600;
  color: #374151;
}
.count-pill--warn { color: #b45309; }

.risk-pill {
  font-size: 12px;
  font-weight: 600;
  color: #6b7280;
  font-variant-numeric: tabular-nums;
}
.risk-pill.mid { color: #d97706; }
.risk-pill.high { color: #dc2626; }

.cell-plain .plain-text {
  font-size: 12px;
  color: #374151;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 操作 */
.cell-action { display: flex; align-items: center; gap: 12px; }
.act { font-size: 13px; font-weight: 500; cursor: pointer; }

.empty {
  padding: 64px 0;
  text-align: center;
  color: #9ca3af;
  font-size: 13px;
}
.empty-title { font-size: 13px; color: #6b7280; }
.empty-sub { margin-top: 6px; font-size: 12px; color: #9ca3af; }
.empty-act {
  margin-top: 12px;
  height: 28px;
  padding: 0 14px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  background: #fff;
  color: #374151;
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
}
.empty-act:hover { border-color: #1a6fff; color: #1a6fff; }
</style>

<!-- 工单标题 / 摘要 hover 弹窗（teleport 到 body，需非 scoped） -->
<style>
.title-pop { width: 320px; display: flex; flex-direction: column; gap: 6px; }
.title-pop .tp-head { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.title-pop .tp-title { font-size: 13px; font-weight: 600; color: #111827; line-height: 1.5; word-break: break-word; }
.title-pop .tp-meta { font-size: 12px; color: #6b7280; }
.title-pop .tp-rel { font-size: 11px; font-weight: 600; color: #7c3aed; }
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
