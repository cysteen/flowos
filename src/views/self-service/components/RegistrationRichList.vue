<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { CaretDownOutlined, CaretUpOutlined, DownOutlined, SwapOutlined } from '@ant-design/icons-vue';
import RichListCheckbox from '@/components/rich-list/RichListCheckbox.vue';
import type { RegistrationListSortDir, RegistrationListSortKey } from '@/views/self-service/registrationListQuery';
import {
  registrationListDisplayStatus,
  registrationListDisplayStatusStyle,
  registrationTemplateOf,
  registrationDisplayValue,
  type RegistrationRecord,
} from '@/views/tickets/types/businessRegistration';
import { formatListDateTime } from '@/views/tickets/utils/ticketListCells';
import {
  registrationTimelinessCountdownLine,
  registrationTimelinessPromiseLine,
} from '@/views/self-service/registrationListTimeliness';
function registrationStatusStyle(record: RegistrationRecord) {
  return registrationListDisplayStatusStyle(record);
}

function registrationStatusLabel(record: RegistrationRecord) {
  return registrationListDisplayStatus(record);
}

/** 与 TicketTitleCell 行内 `.tag` 同源：产品分类优先，不用业务线独占标位 */
function registrationTypeLabel(record: RegistrationRecord): string {
  const category = registrationDisplayValue(record, 'productCategory');
  if (category) return category;
  const template = registrationTemplateOf(record.templateId);
  return template?.name?.trim() || template?.ticketType || '—';
}

/** 行内主标题（对齐工单标题格：产品 · 分类 · 诉求类型） */
function registrationTitleText(record: RegistrationRecord): string {
  const parts = [
    registrationDisplayValue(record, 'productName'),
    registrationDisplayValue(record, 'productCategory'),
    registrationDisplayValue(record, 'complaintType') || registrationDisplayValue(record, 'problemL1'),
  ].filter(Boolean);
  if (parts.length) return parts.join(' · ');
  const fallback = record.values.description?.trim()
    || registrationTemplateOf(record.templateId)?.name?.trim();
  return fallback || '—';
}

function sourcePrimary(record: RegistrationRecord) {
  return registrationDisplayValue(record, 'feedback') || '—';
}

function sourceSecondary(record: RegistrationRecord) {
  return registrationDisplayValue(record, 'specificSource') || record.values.channelDetail?.trim() || '';
}

/** 标题格第二行来源（对齐工单 TicketTitleCell：反馈平台 · 单号，不用渠道明细/具体来源） */
function registrationTitleChannel(record: RegistrationRecord): string {
  return registrationDisplayValue(record, 'feedback') || '—';
}

function registrationProblemText(record: RegistrationRecord): string {
  const desc = record.values.description?.trim();
  if (desc) return desc;
  const ladder = [registrationDisplayValue(record, 'problemL1'), registrationDisplayValue(record, 'problemL2')].filter(Boolean).join(' / ');
  return ladder.trim() || '—';
}

function registrationLatestText(record: RegistrationRecord): string {
  const result = record.values.processResult?.trim();
  if (result) return result;
  const lastContact = record.contacts?.slice().sort((a, b) => b.at.localeCompare(a.at))[0];
  if (lastContact?.summary?.trim()) return lastContact.summary.trim();
  const lastHist = record.history?.slice().reverse().find((h) => h.action !== '创建工单' && h.detail?.trim());
  if (lastHist?.detail?.trim()) return lastHist.detail.trim();
  return '暂无处理记录';
}

function registrationSummaryHeadline(record: RegistrationRecord): string {
  return [
    registrationDisplayValue(record, 'productName'),
    registrationDisplayValue(record, 'productCategory'),
    registrationTitleChannel(record),
  ].filter(Boolean).join(' · ');
}

const REGISTRATION_COLUMN_LABELS: Record<string, string> = {
  businessPhone: '业务号码',
  businessLine: '业务线',
  productCategory: '产品线',
  productName: '产品名称',
  handler: '处理人',
  accessTime: '派单时间',
  updatedAt: '更新时间',
  sla: '时效',
  source: '反馈平台 / 来源',
  status: '状态',
  createdAt: '创建时间',
};

const DEFAULT_COL_WIDTH: Record<string, number> = {
  title: 300,
  summary: 220,
  businessPhone: 92,
  businessLine: 104,
  productCategory: 84,
  productName: 96,
  handler: 76,
  accessTime: 158,
  updatedAt: 152,
  sla: 100,
  source: 140,
  status: 80,
  createdAt: 152,
  action: 112,
};

/** 多选列栅格宽：数据行与工单列表同为 16px 格 + row-leading；表头额外放下拉 ▼（约 12px） */
const SELECTION_COL_PX = 28;

const DEFAULT_ORDER = [
  'businessPhone',
  'businessLine',
  'productCategory',
  'productName',
  'handler',
  'accessTime',
  'updatedAt',
  'sla',
];

const summaryPopExpandedId = ref<string | null>(null);

function summaryProblemCompact(record: RegistrationRecord): boolean {
  const body = registrationProblemText(record);
  return body.length > 80 || body.includes('\n');
}

function toggleSummaryPopExpand(no: string) {
  summaryPopExpandedId.value = summaryPopExpandedId.value === no ? null : no;
}

function onSummaryPopoverOpenChange(open: boolean) {
  if (!open) summaryPopExpandedId.value = null;
}

const summaryPopoverAdjust = { adjustY: 0 as const, adjustX: 1 as const };

const props = withDefaults(
  defineProps<{
    rows: RegistrationRecord[];
    selectedIds?: Set<string>;
    allPageSelected?: boolean;
    selectAllFiltered?: boolean;
    headerIndeterminate?: boolean;
    visibleColumns?: Record<string, boolean>;
    columnOrder?: string[];
    columnLabel?: (key: string) => string;
    listSortKey?: RegistrationListSortKey | null;
    listSortDir?: RegistrationListSortDir | null;
    emptyText?: string;
    canEdit?: (record: RegistrationRecord) => boolean;
    canTransfer?: (record: RegistrationRecord) => boolean;
    canReopen?: (record: RegistrationRecord) => boolean;
  }>(),
  {
    selectedIds: () => new Set<string>(),
    allPageSelected: false,
    selectAllFiltered: false,
    headerIndeterminate: false,
    emptyText: '暂无符合条件的自建单',
    canEdit: () => false,
    canTransfer: () => false,
    canReopen: () => false,
  },
);

const emit = defineEmits<{
  open: [record: RegistrationRecord];
  transfer: [record: RegistrationRecord];
  reopen: [record: RegistrationRecord];
  toggleListSort: [key: RegistrationListSortKey];
  toggle: [id: string];
  toggleAll: [];
  selectPage: [];
  selectAllFiltered: [];
  clearSelection: [];
  headerCheckChange: [checked: boolean];
}>();

const headerChecked = computed(() => props.allPageSelected || props.selectAllFiltered);

function onSelectionMenu({ key }: { key: string | number }) {
  if (key === 'page') emit('selectPage');
  else if (key === 'filtered') emit('selectAllFiltered');
  else if (key === 'clear') emit('clearSelection');
}

function onHeaderCheckboxClick() {
  emit('headerCheckChange', !headerChecked.value);
}

const SORTABLE_KEYS = new Set<RegistrationListSortKey>(['accessTime', 'updatedAt', 'sla']);

function isSortableCol(key: string): key is RegistrationListSortKey {
  return SORTABLE_KEYS.has(key as RegistrationListSortKey);
}

function sortColState(key: string): { active: boolean; dir: RegistrationListSortDir | null } {
  if (!isSortableCol(key)) return { active: false, dir: null };
  if (!props.listSortKey) {
    return key === 'updatedAt' ? { active: true, dir: 'desc' } : { active: false, dir: null };
  }
  if (props.listSortKey !== key) return { active: false, dir: null };
  return { active: true, dir: props.listSortDir ?? null };
}

function sortColTip(key: RegistrationListSortKey): string {
  const state = sortColState(key);
  if (state.active && props.listSortKey) return '再次点击恢复默认排序';
  if (key === 'sla') return '点击按承诺剩余排序';
  return '点击按时间排序';
}

const scrollEl = ref<HTMLElement | null>(null);

watch(
  () => props.rows,
  () => {
    if (scrollEl.value) scrollEl.value.scrollTop = 0;
  },
);

function colLabel(key: string): string {
  return props.columnLabel?.(key) ?? REGISTRATION_COLUMN_LABELS[key] ?? key;
}

function showCol(key: string) {
  return !props.visibleColumns || props.visibleColumns[key] !== false;
}

const orderedCols = computed(() => {
  const order = props.columnOrder?.length ? props.columnOrder : DEFAULT_ORDER;
  return order.filter((key) => showCol(key));
});

const gridTemplateColumns = computed(() => {
  const parts = [`${SELECTION_COL_PX}px`];
  parts.push(
    `${DEFAULT_COL_WIDTH.title}px`,
    `${DEFAULT_COL_WIDTH.summary}px`,
  );
  for (const key of orderedCols.value) {
    parts.push(`${DEFAULT_COL_WIDTH[key] ?? 120}px`);
  }
  parts.push(`${DEFAULT_COL_WIDTH.action}px`);
  return parts.join(' ');
});

function plainField(record: RegistrationRecord, key: string): string {
  if (key === 'handler') return record.handler?.trim() || '—';
  if (key === 'createdAt' || key === 'updatedAt') return displayTime(record[key]);
  if (key === 'accessTime') return displayTime(record.values.accessTime);
  if (key in record.values) {
    const v = registrationDisplayValue(record, key as keyof typeof record.values);
    return typeof v === 'string' && v.trim() ? v.trim() : '—';
  }
  return '—';
}

/** 与工单列表 `formatListDateTime` 同源：展示到秒，不截断到日期 */
function displayTime(value?: string) {
  const raw = value?.trim();
  if (!raw) return '—';
  const normalized = raw.replace('T', ' ').replace(/\.\d{1,3}$/, '');
  return formatListDateTime(normalized);
}

function colClass(key: string): string {
  return `col-${key.replace(/([A-Z])/g, '-$1').toLowerCase()}`;
}

function primaryActionLabel(record: RegistrationRecord) {
  if (!props.canEdit(record)) return '查看';
  if (record.status === '草稿') return '继续';
  if (record.status === '处理中') return '处理';
  return '查看';
}

const stuckLeft = ref(false);
const stuckRight = ref(false);

function syncStuck() {
  const el = scrollEl.value;
  if (!el) return;
  stuckLeft.value = el.scrollLeft > 0;
  stuckRight.value = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
}

onMounted(() => {
  syncStuck();
  const el = scrollEl.value;
  if (!el || typeof ResizeObserver === 'undefined') return;
  const ro = new ResizeObserver(syncStuck);
  ro.observe(el);
  onBeforeUnmount(() => ro.disconnect());
});

watch(() => [props.rows, props.visibleColumns, gridTemplateColumns.value], () => {
  nextTick(syncStuck);
});
</script>

<template>
  <div class="rich-list">
    <div
      ref="scrollEl"
      class="rich-list-scroll"
      :class="{ 'is-stuck-l': stuckLeft, 'is-stuck-r': stuckRight }"
      @scroll="syncStuck"
    >
      <div v-if="rows.length === 0" class="empty">
        <div class="empty-title">{{ emptyText }}</div>
      </div>

      <div
        v-else
        class="table-grid"
        :style="{ gridTemplateColumns, '--sticky-title-left': `${SELECTION_COL_PX}px` }"
      >
        <div class="thead">
          <div class="cell-cb th-cell">
            <div class="header-cb-wrap" @click.stop>
              <RichListCheckbox
                :checked="headerChecked"
                :indeterminate="headerIndeterminate"
                @click="onHeaderCheckboxClick"
              />
              <a-dropdown :trigger="['click']" placement="bottomLeft">
                <button type="button" class="header-cb-menu" aria-label="批量选择">
                  <DownOutlined />
                </button>
                <template #overlay>
                  <a-menu @click="onSelectionMenu">
                    <a-menu-item key="page">全选本页</a-menu-item>
                    <a-menu-item key="filtered">全选当前筛选结果</a-menu-item>
                    <a-menu-item key="clear">清空选择</a-menu-item>
                  </a-menu>
                </template>
              </a-dropdown>
            </div>
          </div>
          <div class="col-title th th-cell">
            <span class="th-label">工单 / 标题</span>
          </div>
          <div class="col-summary th th-cell">
            <span class="th-label">工单摘要</span>
          </div>
          <div
            v-for="colKey in orderedCols"
            :key="`th-${colKey}`"
            :class="[
              colClass(colKey),
              'th',
              'th-cell',
              { 'th-cell--sortable': isSortableCol(colKey), active: sortColState(colKey).active },
            ]"
            :title="isSortableCol(colKey) ? sortColTip(colKey) : undefined"
            @click="isSortableCol(colKey) && emit('toggleListSort', colKey)"
          >
            <span class="th-label">{{ colLabel(colKey) }}</span>
            <template v-if="isSortableCol(colKey)">
              <CaretUpOutlined v-if="sortColState(colKey).dir === 'asc'" class="th-sort-ic on" />
              <CaretDownOutlined v-else-if="sortColState(colKey).dir === 'desc'" class="th-sort-ic on" />
              <SwapOutlined v-else class="th-sort-ic rot" />
            </template>
          </div>
          <div class="col-action th th-cell">
            <span class="th-label">操作</span>
          </div>
        </div>

        <div
          v-for="record in rows"
          :key="record.no"
          class="row"
          @dblclick="emit('open', record)"
        >
          <div class="cell-cb row-leading">
            <RichListCheckbox
              :checked="selectedIds.has(record.no)"
              @click="emit('toggle', record.no)"
            />
          </div>
          <div class="col-title">
            <div class="cell-title">
              <div class="title-line1">
                <span
                  class="status-tag"
                  :style="registrationStatusStyle(record)"
                  :title="registrationStatusLabel(record)"
                >{{ registrationStatusLabel(record) }}</span>
                <span class="tag">{{ registrationTypeLabel(record) }}</span>
                <button type="button" class="title-text title-text--link" @click.stop="emit('open', record)">
                  {{ registrationTitleText(record) }}
                </button>
              </div>
              <div class="title-line2">
                <span class="channel">{{ registrationTitleChannel(record) }}</span>
                <span class="sep">·</span>
                <span class="ticket-no" @click.stop="emit('open', record)">{{ record.no }}</span>
              </div>
            </div>
          </div>

          <div class="col-summary cell-summary">
            <a-popover
              trigger="hover"
              placement="rightTop"
              :mouse-enter-delay="0.2"
              :auto-adjust-overflow="summaryPopoverAdjust"
              overlay-class-name="ticket-summary-popover"
              @open-change="onSummaryPopoverOpenChange"
            >
              <div class="summary-stack">
                <div class="summary-line">
                  <span class="hi-label">问题</span>
                  <span class="hi-text line-clamp">{{ registrationProblemText(record) }}</span>
                </div>
                <div class="summary-line">
                  <span class="hi-label handle">最新</span>
                  <span class="hi-text line-clamp">{{ registrationLatestText(record) }}</span>
                </div>
              </div>
              <template #content>
                <div
                  class="summary-pop"
                  :class="{ 'is-expanded': summaryPopExpandedId === record.no }"
                >
                  <button
                    type="button"
                    class="sp-expand"
                    :title="summaryPopExpandedId === record.no ? '收起' : '放大查看'"
                    @click.stop="toggleSummaryPopExpand(record.no)"
                  >
                    {{ summaryPopExpandedId === record.no ? '⤡' : '⤢' }}
                  </button>
                  <div class="sp-title-row">
                    <span class="sp-type">{{ registrationTypeLabel(record) }}</span>
                    <span class="sp-headline" :title="registrationSummaryHeadline(record)">{{
                      registrationSummaryHeadline(record)
                    }}</span>
                  </div>
                  <div class="sp-scroll">
                    <section
                      class="sp-section sp-section--problem"
                      :class="{ 'is-compact': summaryProblemCompact(record) }"
                    >
                      <div class="sp-section-label">问题描述</div>
                      <div class="sp-section-body">{{ registrationProblemText(record) }}</div>
                    </section>
                    <section class="sp-section sp-section--results">
                      <div class="sp-section-label handle">处理结果</div>
                      <div
                        v-if="registrationLatestText(record) !== '暂无处理记录'"
                        class="sp-section-body sp-section-body--result"
                      >{{ registrationLatestText(record) }}</div>
                      <div v-else class="sp-section-body">暂无处理记录</div>
                    </section>
                  </div>
                </div>
              </template>
            </a-popover>
          </div>

          <template v-for="colKey in orderedCols" :key="`${record.no}-${colKey}`">
            <div
              v-if="['businessPhone', 'businessLine', 'productCategory', 'productName'].includes(colKey)"
              :class="[colClass(colKey), 'cell-plain']"
            >
              <span class="plain-text" :title="plainField(record, colKey)">{{ plainField(record, colKey) }}</span>
            </div>

            <div v-else-if="colKey === 'source'" class="col-source cell-source-stack">
              <span class="source-line source-line--primary" :title="sourcePrimary(record)">{{ sourcePrimary(record) }}</span>
              <span
                class="source-line source-line--secondary"
                :title="sourceSecondary(record) || '—'"
              >{{ sourceSecondary(record) || '—' }}</span>
            </div>

            <div v-else-if="colKey === 'status'" class="col-status cell-node">
              <span
                class="node-badge"
                :style="registrationStatusStyle(record)"
                :title="registrationStatusLabel(record)"
              >{{ registrationStatusLabel(record) }}</span>
            </div>

            <div v-else-if="colKey === 'handler'" class="col-handler cell-plain">
              <span class="plain-text" :title="plainField(record, 'handler')">{{ plainField(record, 'handler') }}</span>
            </div>

            <div v-else-if="colKey === 'accessTime'" class="col-access-time cell-plain">
              <span
                class="plain-text time-text"
                :title="displayTime(record.values.accessTime)"
              >{{ displayTime(record.values.accessTime) }}</span>
            </div>

            <div v-else-if="colKey === 'sla'" class="col-sla cell-sla">
              <span
                class="sla-line"
                :style="{ color: registrationTimelinessPromiseLine(record).color }"
                :title="registrationTimelinessPromiseLine(record).text"
              >{{ registrationTimelinessPromiseLine(record).text }}</span>
              <span
                class="sla-line"
                :style="{ color: registrationTimelinessCountdownLine(record).color }"
                :title="`进度：${registrationTimelinessCountdownLine(record).text}`"
              >进度：{{ registrationTimelinessCountdownLine(record).text }}</span>
            </div>

            <div v-else-if="colKey === 'createdAt' || colKey === 'updatedAt'" :class="[colClass(colKey), 'cell-plain']">
              <span class="plain-text time-text" :title="displayTime(record[colKey])">{{ displayTime(record[colKey]) }}</span>
            </div>

            <div v-else :class="[colClass(colKey), 'cell-plain']">
              <span class="plain-text" :title="plainField(record, colKey)">{{ plainField(record, colKey) }}</span>
            </div>
          </template>

          <div class="col-action cell-action">
            <span class="act act-primary" @click.stop="emit('open', record)">{{ primaryActionLabel(record) }}</span>
            <span
              v-if="canTransfer(record)"
              class="act"
              @click.stop="emit('transfer', record)"
            >调剂</span>
            <span
              v-if="canReopen(record)"
              class="act act-warn"
              @click.stop="emit('reopen', record)"
            >退回</span>
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
.th-cell.cell-cb {
  border-left: 4px solid transparent;
  padding-left: 4px;
  margin-left: -4px;
}
.col-title,
.col-summary,
.col-business-phone,
.col-business-line,
.col-product-category,
.col-product-name,
.col-source,
.col-status,
.col-handler,
.col-access-time,
.col-sla,
.col-created-at,
.col-updated-at,
.col-action {
  min-width: 0;
  overflow: hidden;
}
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
.th {
  font-size: 12px;
  font-weight: 600;
  color: #6b7280;
}
.th-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding-right: 4px;
}
.th-cell--sortable {
  cursor: pointer;
  user-select: none;
}
.th-cell--sortable:hover .th-label {
  color: #374151;
}
.th-cell--sortable.active .th-label {
  color: #1a6fff;
}
.th-sort-ic {
  font-size: 10px;
  color: #cbd5e1;
  flex: none;
  width: 12px;
}
.th-sort-ic.rot {
  transform: rotate(90deg);
}
.th-sort-ic.on {
  color: #1a6fff;
}
.cell-title {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  min-width: 0;
  max-width: 100%;
}
.title-line1 {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
}
.title-line2 {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
}
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
  flex: none;
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
  border: 0;
  background: none;
  font-family: inherit;
  text-align: left;
  padding: 0;
  cursor: pointer;
}
.title-text--link:hover {
  color: #1a6fff;
}
.channel { font-size: 12px; color: #6b7280; flex: none; }
.sep { font-size: 12px; color: #d1d5db; flex: none; }
.ticket-no {
  font-size: 12px;
  font-weight: 500;
  color: #1a6fff;
  cursor: pointer;
  flex: none;
}
.ticket-no:hover {
  text-decoration: underline;
}
.cell-source-stack {
  display: flex;
  flex-direction: column;
  gap: 2px;
  align-items: flex-start;
  min-width: 0;
  overflow: hidden;
}
.source-line {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 18px;
}
.source-line--primary {
  font-size: 12px;
  font-weight: 600;
  color: #374151;
}
.source-line--secondary {
  font-size: 12px;
  color: #6b7280;
}
.time-text {
  font-size: 12px;
  white-space: nowrap;
  color: #6b7280;
  font-variant-numeric: tabular-nums;
}
.col-access-time .time-text,
.col-updated-at .time-text,
.col-created-at .time-text {
  overflow: visible;
  text-overflow: clip;
  max-width: none;
}
.cell-sla {
  display: flex;
  flex-direction: column;
  gap: 2px;
  align-items: flex-start;
  min-width: 0;
  overflow: hidden;
}
.sla-line {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 12px;
  font-weight: 600;
  line-height: 18px;
  white-space: nowrap;
}
.cell-node { display: flex; align-items: center; }
.node-badge {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 4px;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cell-plain {
  display: flex;
  align-items: center;
  min-width: 0;
  overflow: hidden;
}
.plain-text {
  font-size: 12px;
  color: #374151;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cell-action {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
}
.cell-action .act {
  flex: none;
  white-space: nowrap;
}
.act {
  font-size: 13px;
  font-weight: 500;
  color: #6b7280;
  cursor: pointer;
}
.act-primary {
  color: #1a6fff;
}
.act-warn {
  color: #d97706;
}
.empty {
  padding: 64px 0;
  text-align: center;
}
.empty-title {
  font-size: 13px;
  color: #6b7280;
}
.cell-cb {
  flex: none;
  display: flex;
  align-items: center;
  padding-right: 0;
}
.row > .cell-cb {
  width: auto;
}
.header-cb-wrap {
  display: inline-flex;
  align-items: center;
  gap: 0;
  flex: none;
}
.header-cb-menu {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 12px;
  height: 16px;
  margin-left: 1px;
  padding: 0;
  border: none;
  background: transparent;
  color: #9ca3af;
  font-size: 9px;
  line-height: 1;
  cursor: pointer;
  border-radius: 2px;
}
.header-cb-menu:hover {
  color: #1a6fff;
  background: rgba(26, 111, 255, 0.06);
}
/* 冻结列：与 TicketRichList 同序写在样式表末尾，避免被其它 position 覆盖 */
.cell-cb,
.col-title,
.col-action {
  position: sticky;
  z-index: 1;
}
.cell-cb { left: 0; }
.col-title { left: var(--sticky-title-left, 0px); }
.col-action { right: 0; }
.th-cell.cell-cb,
.th-cell.col-title,
.th-cell.col-action {
  position: sticky;
  z-index: 3;
}
.th-cell.col-action {
  justify-content: flex-end;
  text-align: right;
  padding-left: 2px;
  padding-right: 4px;
}
.th-cell.col-action .th-label {
  flex: none;
  text-align: right;
  padding-right: 0;
}
.col-action.cell-action {
  justify-content: flex-end;
  padding-left: 2px;
  padding-right: 4px;
}
.is-stuck-r .th-cell.col-action,
.is-stuck-r .col-action.cell-action {
  padding-right: 6px;
}
.is-stuck-l .col-title {
  box-shadow: 6px 0 8px -6px rgba(17, 24, 39, 0.18);
  clip-path: inset(0 -12px 0 0);
}
.is-stuck-r .col-action {
  box-shadow: -6px 0 8px -6px rgba(17, 24, 39, 0.18);
  clip-path: inset(0 0 0 -12px);
}
</style>

<style>
.ticket-summary-popover .ant-popover-inner { padding: 10px 12px; }
.summary-pop {
  position: relative;
  width: min(420px, 92vw);
  max-width: min(420px, 92vw);
  height: min(300px, 48vh);
  display: flex;
  flex-direction: column;
  gap: 8px;
  transition: height 0.12s ease-out;
}
.summary-pop.is-expanded { height: min(520px, 68vh); }
.summary-pop .sp-title-row {
  flex: none;
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding-right: 26px;
  padding-bottom: 8px;
  border-bottom: 1px solid #e5e7eb;
}
.summary-pop .sp-type {
  flex: none;
  margin-top: 2px;
  font-size: 11px;
  font-weight: 600;
  color: #374151;
  background: #f3f4f6;
  border-radius: 3px;
  padding: 2px 6px;
}
.summary-pop .sp-headline {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  font-weight: 600;
  color: #111827;
  line-height: 1.45;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.summary-pop.is-expanded .sp-headline {
  display: block;
  -webkit-line-clamp: unset;
  overflow: visible;
}
.summary-pop .sp-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  scrollbar-width: thin;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-right: 2px;
}
.summary-pop .sp-section { display: flex; flex-direction: column; gap: 6px; }
.summary-pop .sp-section-label {
  font-size: 12px;
  font-weight: 700;
  color: #374151;
}
.summary-pop .sp-section-label.handle { color: #111827; }
.summary-pop .sp-section--problem.is-compact .sp-section-body {
  max-height: 4.8em;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
}
.summary-pop .sp-section-body {
  font-size: 12px;
  color: #4b5563;
  line-height: 1.65;
  word-break: break-word;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}
.summary-pop .sp-section-body--result {
  color: #374151;
}
.summary-pop .sp-section--results {
  flex: 1;
  min-height: 0;
}
.summary-pop .sp-expand {
  position: absolute;
  top: 0;
  right: 0;
  z-index: 1;
  border: none;
  background: transparent;
  font-size: 14px;
  color: #6b7280;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 4px;
  font-family: inherit;
  line-height: 1;
}
.summary-pop .sp-expand:hover {
  color: #1a6fff;
  background: #eff6ff;
}
</style>
