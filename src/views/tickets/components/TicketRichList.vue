<script setup lang="ts">
import { CheckOutlined } from '@ant-design/icons-vue';
import { computed, onUnmounted, ref, watch } from 'vue';
import {
  columnLabel,
} from '@/views/tickets/composables/useTicketColumns';
import { TICKET_LIST_COLUMN_KEYS } from '@/views/tickets/composables/ticketListColumnCatalog';
import {
  formatCurrentHandlerGroup,
  formatLastHandlerGroup,
  listCellText,
  // SLA 那两行的口径已提到 utils 共用（风险监控页也要摆同一格），本组件改为引用，行为一字未动
  slaFirstLine,
  slaResolveLine,
} from '@/views/tickets/utils/ticketListCells';
import {
  doneRowActions,
  isMentionUnread,
  mentionRowActions,
  mineRowActions,
  poolRowActions,
  PRIORITY_COLOR,
  rowActions,
  statusStyle,
  // 状态徽章文案取**页面展示名称**（基线 §1 第三列：列表状态列属"用户读到的文案"那一档）；
  // 配色仍按 nodeStatus（落库子状态）算 —— 基线要求逻辑判断一律用子状态。
  ticketStatusDisplayName,
  type Ticket,
} from '@/views/tickets/types/ticket';
import { ticketLatestHandlingPreview, resolveLatestHandlingAction } from '@/views/tickets/utils/ticketOverview';
import TicketTitleCell from './TicketTitleCell.vue';

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
    /*
     * ==== 以下三个是**可选扩展位**，不传时本组件行为逐字不变 ====
     * 加它们是为了让风险监控页「未标记」段直接复用这张表，而不是另画一张长得像的。
     * 🔴 三处一律**只加不改**：六个 `variant` 的映射、写死的那几组行内动作、勾选列的原判据，
     * 一个字没动 —— 新 prop 不传时每一条都走回原来那一支。
     */
    /**
     * 行内动作**由调用方给**。传了就整个接管 `actionsFor`，不再走 `variant` 那套映射。
     *
     * 【为什么需要它】`variant` 那六档映射到 `types/ticket.ts` 里写死的几组动作
     * （受理 / 处理 / 调剂 / 领取 / 退回…），它们是工作台的动词。风险监控页要挂的是
     * 「核实打标」—— 那是风险侧的动词，塞进那个枚举等于让工单侧的类型去背风险侧的流程。
     */
    rowActionsFn?: (t: Ticket) => { label: string; primary?: boolean }[];
    /**
     * 调用方自带的**附加列**：本组件列目录（`ticketListColumnCatalog`）里没有、
     * 且只有那一处用得到的列。单元格内容走同名具名插槽 `#cell-<key>`。
     *
     * 【为什么不进列目录】风险监控页要的「等待时长」是**队列属性**（从条目进监控时刻起算），
     * 压根不是 `Ticket` 上的字段。为一处需求往全局列目录里塞一个别处永远为空的 key，
     * 会让工作台的列设置面板多出一个勾了也没用的选项。
     */
    extraColumns?: { key: string; label: string; width?: number }[];
    /**
     * 强制开／关勾选列。**不传时仍按原判据**（variant 为 mine / pool 才有勾选列）。
     * 风险监控页要的是"能勾选做批量打标"，但它的行内动作不是「调剂」也不是「领取」，
     * 借那两个 variant 去换勾选列会连带换来一组错的按钮。
     */
    selectable?: boolean;
    /**
     * 按列覆盖列宽（px）。传了就**接管这一处实例的全部列宽**，同时**关掉拖拽把手**。
     *
     * 【为什么要它】本组件的列宽记忆是一份**全局 localStorage**
     * （`flowos-ticket-column-widths`），工作台那一屏宽 1290+，默认宽度合计 1370；
     * 换到风险监控页只剩 1045（左边还有一列漏斗导航），照默认摆就横向溢出 325px ——
     * 而"横着拖才能看全的表，等于每一行都要动两次手"。
     * 🔴 **不能让调用方去改那份全局默认**：那会把工作台的列宽一起改窄。
     * 🔴 **也不能让这一处的拖拽写回那份全局**：拖窄风险页的列会让工作台跟着变。
     * 故覆盖与"不参与列宽记忆"是同一件事的两面，绑在一个 prop 上。
     */
    columnWidths?: Record<string, number>;
  }>(),
  {
    selectedIds: () => new Set<string>(),
    allPageSelected: false,
    emptyKind: 'none',
    /*
     * 🔴 **必须显式给 `undefined`**，不能省。Vue 对声明为 `boolean` 的 prop 有**隐式布尔转换**：
     * 不传时拿到的是 `false` 而**不是** `undefined`，于是 `props.selectable ?? (原判据)`
     * 里的 `??` 永远短路在 `false` 上 —— 工作台「我的任务」「工单池」的勾选列会整列消失。
     * 这一条是真机回归当场抓出来的（勾选框数 21 → 0），不是假想的风险。
     * 显式 `undefined` 默认值会关掉那次转换，`??` 才落得回原判据。
     */
    selectable: undefined,
  },
);

const DEFAULT_ORDER = TICKET_LIST_COLUMN_KEYS;

function colLabel(key: string): string {
  return props.columnLabel?.(key) ?? columnLabel(key);
}

/** 列是否显示（未配置或未含该列 → 默认显示） */
function showCol(key: string) {
  if (key === 'assignee' && props.variant === 'mine') return false;
  if (key === 'groupNames') return false;
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

// ---- SLA 列：两行文本「解决：超/剩」「首响：超/剩」（PRD §8.2）----
// 🔴 三个函数已提到 `utils/ticketListCells.ts` 共用（见文件头 import）：风险监控页要摆同一格，
// 留在这里的话第二处只能抄一份，而这张表判「已达标 / 未达标 / 已暂停」的分支有五条。

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
  // 调用方自带动作时整个接管，下面那套 variant 映射一个字没动（见 `rowActionsFn`）
  if (props.rowActionsFn) return props.rowActionsFn(t);
  if (props.variant === 'mine') return mineRowActions();
  if (props.variant === 'done') return doneRowActions();
  if (props.variant === 'mention') return mentionRowActions();
  if (props.variant === 'pool') return poolRowActions();
  return rowActions(t);
}

const showActionColumn = computed(() => {
  // 自带动作就必须有一列放它 —— 否则传了 `rowActionsFn` 却因为 variant 是 query 而整列不出，
  // 调用方会得到一张"动作凭空消失"的表
  if (props.rowActionsFn) return true;
  return props.variant !== 'done' && props.variant !== 'mention' && props.variant !== 'query';
});
const showSelectionColumn = computed(
  () => props.selectable ?? (props.variant === 'mine' || props.variant === 'pool'),
);

/** 列宽默认值（px） */
const DEFAULT_COL_WIDTH: Record<string, number> = {
  title: 300,
  summary: 220,
  priority: 58,
  customer: 100,
  product: 120,
  node: 120,
  flowNode: 108,
  prevFlowNode: 108,
  createdAt: 120,
  updatedAt: 120,
  sla: 112,
  appointment: 96,
  assignee: 108,
  action: 132,
  startDate: 96,
  lastHandler: 108,
};

const MIN_COL_WIDTH: Record<string, number> = {
  title: 200,
  summary: 120,
  priority: 48,
  customer: 64,
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

/** 传了 `columnWidths` 的实例不参与全局列宽记忆，故也不出拖拽把手（见那个 prop） */
const resizable = computed(() => !props.columnWidths);

function colWidthPx(key: string): string {
  const fixed = props.columnWidths?.[key];
  if (fixed != null) return `${fixed}px`;
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
  // 附加列坐在预约倒计时之后、操作之前：操作恒在最右，这一条是这张表的既有约定
  for (const c of props.extraColumns ?? []) parts.push(`${c.width ?? 96}px`);
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
          <!-- 拖拽把手在传了 `columnWidths` 的实例上整体不出：那一处不参与全局列宽记忆 -->
          <div class="col-title th th-cell" :class="{ 'th-cell--resizable': resizable }">
            <span class="th-label">工单 / 标题</span>
            <span
              v-if="resizable"
              class="col-resize-handle"
              :class="{ 'is-active': resizing?.key === 'title' }"
              @mousedown="onResizeStart($event, 'title')"
            />
          </div>
          <template v-for="colKey in orderedCols" :key="`th-${colKey}`">
            <div :class="[colClass(colKey), 'th', 'th-cell', { 'th-cell--resizable': resizable }]">
              <span class="th-label">{{ colLabel(colKey) }}</span>
              <span
                v-if="resizable"
                class="col-resize-handle"
                :class="{ 'is-active': resizing?.key === colKey }"
                @mousedown="onResizeStart($event, colKey)"
              />
            </div>
          </template>
          <div
            v-if="showAppointmentColumn"
            class="col-appointment th th-cell"
            :class="{ 'th-cell--resizable': resizable }"
          >
            <span class="th-label">预约倒计时</span>
            <span
              v-if="resizable"
              class="col-resize-handle"
              :class="{ 'is-active': resizing?.key === 'appointment' }"
              @mousedown="onResizeStart($event, 'appointment')"
            />
          </div>
          <!--
            调用方自带的附加列（见 `extraColumns`）。**不给拖拽把手**：它的宽度由调用方在
            prop 里定，本组件那套列宽记忆是按列目录的 key 存 localStorage 的，
            把外来 key 混进去会让工作台的列宽缓存里长出一批它永远用不到的键。
          -->
          <template v-for="col in extraColumns ?? []" :key="`th-x-${col.key}`">
            <div class="th th-cell">
              <span class="th-label">{{ col.label }}</span>
            </div>
          </template>
          <div v-if="showActionColumn" class="col-action th th-cell" :class="{ 'th-cell--resizable': resizable }">
            <span class="th-label">操作</span>
            <span
              v-if="resizable"
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
        class="col-title"
        :class="{ 'row-leading': !showSelectionColumn }"
        :style="!showSelectionColumn ? { borderLeftColor: PRIORITY_COLOR[t.priority] } : undefined"
      >
        <TicketTitleCell
          :ticket="t"
          :highlight-mention-unread="highlightMentionUnread"
          @click-no="emit('clickNo', $event)"
        />
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
                      <span class="hi-action">{{ resolveLatestHandlingAction(ticketLatestHandlingPreview(t)!) }}</span>
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

        <div v-else-if="colKey === 'assignee'" class="col-assignee cell-handler-group">
          <span
            class="handler-line handler-line--person"
            :class="{ 'handler-line--unassigned': !t.assignee }"
          >{{ formatCurrentHandlerGroup(t).person }}</span>
          <span class="handler-line handler-line--group">{{ formatCurrentHandlerGroup(t).group }}</span>
        </div>

        <div v-else-if="colKey === 'lastHandler'" class="col-last-handler cell-handler-group">
          <span class="handler-line handler-line--person">{{ formatLastHandlerGroup(t).person }}</span>
          <span class="handler-line handler-line--group">{{ formatLastHandlerGroup(t).group }}</span>
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

      <!-- 附加列的格：内容整格交给调用方，本组件只负责把它放进网格的正确位置 -->
      <template v-for="col in extraColumns ?? []" :key="`x-${t.id}-${col.key}`">
        <div class="cell-extra">
          <slot :name="`cell-${col.key}`" :ticket="t" />
        </div>
      </template>

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
.col-start-date { min-width: 0; overflow: hidden; }
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

/* 当前状态 */
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

/* 处理人 / 处理组（两行） */
.cell-handler-group {
  display: flex;
  flex-direction: column;
  gap: 2px;
  align-items: flex-start;
  min-width: 0;
  overflow: hidden;
}
.handler-line {
  font-size: 12px;
  line-height: 18px;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.handler-line--person { font-weight: 600; color: #374151; }
.handler-line--person.handler-line--unassigned { font-weight: 400; color: #6b7280; }
.handler-line--group { color: #6b7280; }

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

/* 调用方自带列的格：只给对齐与截断，内容样式由插槽自己带 */
.cell-extra { display: flex; align-items: center; min-width: 0; overflow: hidden; font-size: 12px; color: #374151; }

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

<!-- 摘要 hover 弹窗（teleport 到 body，需非 scoped） -->
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
.summary-pop .hi-who { font-size: 12px; font-weight: 600; color: #111827; }
.summary-pop .hi-action { font-size: 11px; color: #6b7280; background: #f3f4f6; border-radius: 4px; padding: 0 6px; }
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
