<script setup lang="ts">
import { computed, onActivated, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { message } from 'ant-design-vue';
import dayjs, { type Dayjs } from 'dayjs';
import { DownloadOutlined, RollbackOutlined } from '@ant-design/icons-vue';
import OpActionModal from '@/views/tickets/components/operation/OpActionModal.vue';
import { REGISTRATION_REOPEN_REASONS } from '@/views/tickets/composables/opActions';
import AppPagination from '@/components/AppPagination.vue';
import WorkspaceTaskTabs from '@/components/workspace/WorkspaceTaskTabs.vue';
import TicketFilterBar from '@/views/tickets/components/TicketFilterBar.vue';
import TicketToolbar from '@/views/tickets/components/TicketToolbar.vue';
import RegistrationRichList from './components/RegistrationRichList.vue';
import { useBusinessRegistrationStore } from '@/stores/businessRegistration';
import { useFormCatalogsStore } from '@/stores/formCatalogs';
import { useUserStore } from '@/stores/user';
import { useTenantStore } from '@/stores/tenant';
import { formatRegistrationAmount } from '@/views/tickets/utils/registrationAmount';
import {
  REGISTRATION_FIELD_DEFINITIONS,
  REGISTRATION_TEMPLATES,
  WIRELESS_REGISTRATION_TEMPLATE_ID,
  type RegistrationFieldKey,
  registrationPendingReopenNotice,
  registrationDisplayValue,
  type RegistrationRecord,
} from '@/views/tickets/types/businessRegistration';
import {
  clearReopenToastSeen,
  isReopenToastSeen,
  markReopenToastSeen,
  REOPEN_TOAST_LS_PREFIX,
} from '@/views/tickets/types/reopenReminderDedupe';
import {
  REGISTRATION_TIME_QUICK_PRESETS,
  registrationListRangeError,
  registrationListWindow,
  resolveRegistrationListTimeRange,
  withinRegistrationListWindow,
  compareRegistrationByListSort,
  compareRegistrationDefault,
  emptyRegistrationListQuery,
  filterRegistrationRecords,
  type RegistrationListQuery,
  type RegistrationListSortDir,
  type RegistrationListSortKey,
  type RegistrationListTimePreset,
} from './registrationListQuery';
import { useRegistrationQueryCatalog } from './useRegistrationQueryCatalog';

defineOptions({ name: 'SelfServiceWorkbenchView' });
const store = useBusinessRegistrationStore(), catalogs = useFormCatalogsStore();
const user = useUserStore(), tenant = useTenantStore();
const router = useRouter(), route = useRoute();
const templateId = ref(WIRELESS_REGISTRATION_TEMPLATE_ID);
const seed = REGISTRATION_TEMPLATES.find((template) => template.id === templateId.value)!;
const { productCatalog, registrationSources } = useRegistrationQueryCatalog(templateId);
const query = reactive(emptyRegistrationListQuery());
const timePreset = ref<RegistrationListTimePreset>('3m');
const listNow = ref(new Date());
const creationQuery = computed(() => {
  const range = timePreset.value === 'custom' ? { from: query.dateFrom, to: query.dateTo }
    : { from: resolveRegistrationListTimeRange(timePreset.value, listNow.value).from, to: '' };
  return { ...query, dateFrom: range.from, dateTo: range.to };
});
const creationTimeOptions = REGISTRATION_TIME_QUICK_PRESETS;
const customPanelOpen = ref(false);
const customPickerOpen = ref(false);
const customRangeError = ref('');
const pickingDates = ref<[Dayjs | null, Dayjs | null] | []>([]);
const customPickerValue = computed(() => (customPickerOpen.value ? pickingDates.value : dateValue.value) as [Dayjs, Dayjs] | undefined);
watch(customPanelOpen, (open) => {
  customRangeError.value = '';
  if (open) {
    pickingDates.value = [];
    setTimeout(() => { customPickerOpen.value = customPanelOpen.value; }, 0);
  } else customPickerOpen.value = false;
});
let clockTimer: ReturnType<typeof setInterval> | undefined;
const canCreate = computed(() => store.canCreate(templateId.value));
/** 会议口径：首屏默认「全部」，便于演示种子约 8 条；有建单权用户仍可切「我的」。 */
const scope = ref<'mine' | 'all'>('all');
const filterExpanded = ref(false), optionalOpen = ref(false);
const current = ref(1), pageSize = ref(10), dateValue = ref<[Dayjs, Dayjs]>();
const pagedRows = computed(() => {
  const start = (current.value - 1) * pageSize.value;
  return rows.value.slice(start, start + pageSize.value);
});
const listEmptyText = computed(() => (scope.value === 'mine' ? '暂无我的自建单' : '暂无符合条件的自建单'));
function setPage(page: number, size: number) {
  current.value = page;
  pageSize.value = size;
}
const visibleRecords = computed(() => store.records.filter((record) => store.canView(record)));
const timeVisibleRecords = computed(() => filterRegistrationRecords(visibleRecords.value, {
  ...emptyRegistrationListQuery(), dateFrom: creationQuery.value.dateFrom, dateTo: creationQuery.value.dateTo,
}, listNow.value));
const myRecords = computed(() => timeVisibleRecords.value.filter((record) => {
  if (record.handler !== user.name && !(record.status === '草稿' && record.builder === user.name)) return false;
  return record.status === '处理中' || record.status === '草稿';
}));
const pendingReopenForMe = computed(() => visibleRecords.value
  .filter((record) => record.status === '处理中' && record.handler === user.name)
  .map((record) => ({ record, notice: registrationPendingReopenNotice(record, user.name) }))
  .filter((item): item is { record: RegistrationRecord; notice: NonNullable<ReturnType<typeof registrationPendingReopenNotice>> } => !!item.notice));
const reopenBannerShown = ref(new Set<string>());
function reopenBannerKey(noticeId: string) {
  return `${user.name}:${noticeId}`;
}
function surfaceReopenReminders() {
  for (const { record, notice } of pendingReopenForMe.value) {
    const key = reopenBannerKey(notice.id);
    if (reopenBannerShown.value.has(key) || isReopenToastSeen(user.name, notice.id)) continue;
    reopenBannerShown.value.add(key);
    markReopenToastSeen(user.name, notice.id);
    message.warning({
      content: `工单 ${record.no} 已被班组长退回重开，请尽快处理。持久提醒见右下角「工单退回重开」。${notice.content}`,
      duration: 8,
    });
  }
}
function pruneReopenBannerKeys() {
  const active = new Set(pendingReopenForMe.value.map((item) => reopenBannerKey(item.notice.id)));
  const activeNoticeIds = new Set(pendingReopenForMe.value.map((item) => item.notice.id));
  for (const key of [...reopenBannerShown.value]) {
    if (!key.startsWith(`${user.name}:`) || !active.has(key)) reopenBannerShown.value.delete(key);
  }
  const lsPrefix = `${REOPEN_TOAST_LS_PREFIX}${user.name}:`;
  try {
    for (let i = localStorage.length - 1; i >= 0; i -= 1) {
      const storageKey = localStorage.key(i);
      if (!storageKey?.startsWith(lsPrefix)) continue;
      const noticeId = storageKey.slice(lsPrefix.length);
      if (!activeNoticeIds.has(noticeId)) clearReopenToastSeen(user.name, noticeId);
    }
  } catch {
    /* ignore */
  }
}
onMounted(() => {
  listNow.value = new Date();
  clockTimer = setInterval(() => { listNow.value = new Date(); }, 60_000);
  pruneReopenBannerKeys();
  surfaceReopenReminders();
});
onActivated(() => {
  listNow.value = new Date();
  pruneReopenBannerKeys();
  surfaceReopenReminders();
});
onBeforeUnmount(() => { if (clockTimer) clearInterval(clockTimer); });
watch(pendingReopenForMe, surfaceReopenReminders, { deep: true });
watch(() => user.name, () => {
  pruneReopenBannerKeys();
  surfaceReopenReminders();
});
watch(() => store.revision, () => { listNow.value = new Date(); surfaceReopenReminders(); });
const scopeTabs = computed(() => [...(canCreate.value ? [{ key: 'mine', label: '我的' }] : []), { key: 'all', label: '全部' }]);
const scopedRecords = computed(() => scope.value === 'mine' ? myRecords.value : timeVisibleRecords.value);
const baseMatches = computed(() => filterRegistrationRecords(scopedRecords.value, { ...creationQuery.value, status: '' }, listNow.value));
const listSortKey = ref<RegistrationListSortKey | null>(null);
const listSortDir = ref<RegistrationListSortDir | null>(null);

function toggleListSort(key: RegistrationListSortKey) {
  const firstDir: RegistrationListSortDir = 'desc';
  if (listSortKey.value !== key) {
    // 默认态表头已展示「更新时间 ↓」，首次点该列应切到升序而非重复降序
    if (!listSortKey.value && key === 'updatedAt') {
      listSortKey.value = key;
      listSortDir.value = 'asc';
      return;
    }
    listSortKey.value = key;
    listSortDir.value = firstDir;
    return;
  }
  if (listSortDir.value === firstDir) {
    listSortDir.value = 'asc';
    return;
  }
  listSortKey.value = null;
  listSortDir.value = null;
}

const filteredRecords = computed(() => filterRegistrationRecords(scopedRecords.value, creationQuery.value, listNow.value));

const rows = computed(() => {
  const list = [...filteredRecords.value];
  if (!listSortKey.value || !listSortDir.value) {
    return list.sort(compareRegistrationDefault);
  }
  const key = listSortKey.value;
  const dir = listSortDir.value;
  return list.sort((a, b) => compareRegistrationByListSort(a, b, key, dir));
});
const chips = [{ key: 'all', label: '全部' }, { key: 'processing', label: '处理中' }, { key: 'closed', label: '已结案' }];
const activeChip = computed(() => query.status === '处理中' ? 'processing' : query.status === '已结案' ? 'closed' : 'all');
const chipCounts = computed(() => ({ all: baseMatches.value.length, processing: baseMatches.value.filter((record) => record.status === '处理中').length, closed: baseMatches.value.filter((record) => record.status === '已结案').length }));
const handlers = computed(() => [...new Set(visibleRecords.value.map((record) => record.handler))].map((name) => ({ value: name, label: name })));
const groups = computed(() => [...new Set([seed.groupName, ...visibleRecords.value.map((record) => record.groupName)])].map((name) => ({ value: name, label: name })));

type FilterDef = { key: keyof RegistrationListQuery; label: string; kind?: 'select'; fixed?: boolean };
const filterDefs: FilterDef[] = [
  { key: 'groupName', label: '处理组', kind: 'select', fixed: true },
  { key: 'operator', label: '运营商', kind: 'select', fixed: true },
  { key: 'handler', label: '处理人', kind: 'select', fixed: true },
  { key: 'businessPhone', label: '业务号码', fixed: true },
  { key: 'ticketNo', label: '工单编号', fixed: true },
  { key: 'feedback', label: '反馈平台', kind: 'select', fixed: true },
  { key: 'specificSource', label: '具体来源', kind: 'select', fixed: true },
  { key: 'channelDetail', label: '渠道明细', fixed: true },
  { key: 'contactPhone', label: '联系号码' },
  { key: 'province', label: '省份', kind: 'select' },
  { key: 'businessLine', label: '业务线', kind: 'select' },
  { key: 'productCategory', label: '产品线', kind: 'select' },
  { key: 'productName', label: '产品名称', kind: 'select' },
  { key: 'problemL1', label: '问题分类一', kind: 'select' },
  { key: 'problemL2', label: '问题分类二', kind: 'select' },
  { key: 'complaintType', label: '投诉类型', kind: 'select' },
  { key: 'closedLoop', label: '是否闭环', kind: 'select' },
];
const preferenceKey = computed(() => `flowos-self-service-list-v2:${tenant.currentTenantId}:${user.name}`);
const optionalVisible = ref<Record<string, boolean>>({});
const filterFields = computed(() => filterDefs.filter((field) => field.fixed || optionalVisible.value[field.key]));
/** 与标准工单列表对齐：摘要固定列；其余列顺序同工作台默认可配列 */
const columnDefinitions = [
  { key: 'businessPhone', label: '业务号码' },
  { key: 'businessLine', label: '业务线' },
  { key: 'productCategory', label: '产品线' },
  { key: 'productName', label: '产品名称' },
  { key: 'handler', label: '处理人' },
  { key: 'accessTime', label: '派单时间' },
  { key: 'updatedAt', label: '更新时间' },
  { key: 'sla', label: '时效' },
  { key: 'source', label: '反馈平台 / 来源', defaultVisible: false },
  { key: 'status', label: '状态', defaultVisible: false },
  { key: 'createdAt', label: '创建时间', defaultVisible: false },
];
/** 列设置已下架的列键：从本地偏好中剥离，避免残留顺序/显隐 */
const REMOVED_LIST_COLUMN_KEYS = new Set(['no', 'reminder']);
const columnDefs = columnDefinitions.map(({ key, label }) => ({ key, label }));
const fixedColumns = [
  { key: 'title', label: '工单/标题' },
  { key: 'summary', label: '工单摘要' },
  { key: 'action', label: '操作' },
];
const defaultVisible = () => Object.fromEntries(
  columnDefinitions.map((def) => [def.key, def.defaultVisible !== false]),
);
const defaultColumnOrder = () => columnDefs.map(({ key }) => key);
const columnState = ref({ visible: defaultVisible(), order: defaultColumnOrder() });
function loadPreferences() {
  columnState.value = { visible: defaultVisible(), order: defaultColumnOrder() };
  optionalVisible.value = {};
  try {
    const saved = JSON.parse(localStorage.getItem(preferenceKey.value) ?? 'null');
    if (saved?.columns) {
      const known = new Set(columnDefs.map(({ key }) => key));
      const order = Array.isArray(saved.columns.order)
        ? saved.columns.order.filter((key: string) => known.has(key) && !REMOVED_LIST_COLUMN_KEYS.has(key))
        : [];
      const mergedOrder = [...order];
      for (const key of defaultColumnOrder()) {
        if (!mergedOrder.includes(key)) mergedOrder.push(key);
      }
      const savedVisible = saved.columns.visible && typeof saved.columns.visible === 'object'
        ? { ...saved.columns.visible as Record<string, boolean> }
        : {};
      for (const key of REMOVED_LIST_COLUMN_KEYS) delete savedVisible[key];
      columnState.value = { visible: { ...defaultVisible(), ...savedVisible }, order: mergedOrder };
    }
    optionalVisible.value = saved?.filters ?? {};
  } catch { /* Use the module's defaults for invalid local preferences. */ }
}
watch(preferenceKey, loadPreferences, { immediate: true });
watch([columnState, optionalVisible], () => {
  try { localStorage.setItem(preferenceKey.value, JSON.stringify({ columns: columnState.value, filters: optionalVisible.value })); } catch { /* Preferences do not block ticket handling. */ }
}, { deep: true });
watch(() => route.query.kw, (kw) => {
  if (route.name !== 'self-service') return;
  query.keyword = typeof kw === 'string' ? kw : '';
  if (query.keyword.trim()) scope.value = 'all';
}, { immediate: true });
watch(() => query.feedback, () => { query.specificSource = ''; });
watch(() => query.problemL1, () => { query.problemL2 = ''; });
watch(() => query.productCategory, () => { query.productName = ''; });
const selectedIds = ref<Set<string>>(new Set());
/** 跨页「全选当前筛选结果」：导出与计数按筛选全集，不再只靠 Set 是否收全各页 */
const selectAllFiltered = ref(false);
const allPageSelected = computed(
  () => pagedRows.value.length > 0 && pagedRows.value.every((record) => selectedIds.value.has(record.no)),
);
const headerCheckboxIndeterminate = computed(() => {
  if (selectAllFiltered.value || allPageSelected.value) return false;
  return pagedRows.value.some((record) => selectedIds.value.has(record.no));
});
const selectedCount = computed(() => (selectAllFiltered.value ? rows.value.length : selectedIds.value.size));
const showSelectAllFilteredHint = computed(
  () => allPageSelected.value && !selectAllFiltered.value && rows.value.length > pagedRows.value.length,
);
const exportButtonLabel = computed(() => (selectedCount.value ? `导出所选（${selectedCount.value}）` : '导出全部'));

function toggleSelect(id: string) {
  selectAllFiltered.value = false;
  const next = new Set(selectedIds.value);
  next.has(id) ? next.delete(id) : next.add(id);
  selectedIds.value = next;
}
function toggleSelectAllOnPage() {
  selectAllFiltered.value = false;
  const next = new Set(selectedIds.value);
  if (allPageSelected.value) pagedRows.value.forEach((record) => next.delete(record.no));
  else pagedRows.value.forEach((record) => next.add(record.no));
  selectedIds.value = next;
}
/** 下拉「全选本页」：仅保留当前页勾选（对齐管理台 Table selections） */
function selectPageOnly() {
  selectAllFiltered.value = false;
  selectedIds.value = new Set(pagedRows.value.map((record) => record.no));
}
function selectAllFilteredRows() {
  selectAllFiltered.value = true;
  selectedIds.value = new Set(rows.value.map((record) => record.no));
}
function onHeaderCheckboxChange(checked: boolean) {
  if (checked) toggleSelectAllOnPage();
  else clearSelection();
}
function clearSelection() {
  selectAllFiltered.value = false;
  selectedIds.value = new Set();
}

watch([query, scope, timePreset, listSortKey, listSortDir], () => {
  current.value = 1;
  clearSelection();
});
watch(() => rows.value.length, (total) => { if ((current.value - 1) * pageSize.value >= total) current.value = 1; });
watch(() => [user.name, tenant.currentTenantId], () => {
  reset(); timePreset.value = '3m'; query.dateFrom = ''; query.dateTo = ''; dateValue.value = undefined;
  customPanelOpen.value = false; customPickerOpen.value = false; scope.value = 'all'; listNow.value = new Date();
});
watch(rows, (records) => {
  if (selectAllFiltered.value) selectedIds.value = new Set(records.map((record) => record.no));
  else selectedIds.value = new Set([...selectedIds.value].filter((id) => records.some((record) => record.no === id)));
});

function fieldOptions(key: keyof RegistrationListQuery) {
  if (key === 'groupName') return groups.value;
  if (key === 'handler') return handlers.value;
  if (key === 'feedback') return registrationSources.value?.feedback ?? [];
  if (key === 'specificSource') return (registrationSources.value?.specificSource ?? []).filter((option) => !query.feedback || option.parentValue === query.feedback);
  if (key === 'productName') return [...new Set(productCatalog.value?.filter((product) => !query.productCategory || product.category === query.productCategory).map((product) => product.name).filter(Boolean) ?? [])].map((name) => ({ value: name, label: name }));
  const field = key as RegistrationFieldKey;
  const options = catalogs.optionRows(seed, field);
  const filtered = key === 'problemL2' ? options.filter((option) => !query.problemL1 || option.parentValue === query.problemL1) : options;
  const labels = new Map(filtered.map((option) => [option.value, option.label]));
  visibleRecords.value.forEach((record) => { const value = record.values[field]; if (value && !labels.has(value) && (key !== 'problemL2' || !query.problemL1 || record.values.problemL1 === query.problemL1)) labels.set(value, value); });
  return [...labels].map(([value, label]) => ({ value, label }));
}
function patch(key: keyof RegistrationListQuery, value: unknown) { Object.assign(query, { [key]: typeof value === 'string' ? value : '' }); }
function toggleOptional(key: keyof RegistrationListQuery, checked: boolean) { optionalVisible.value[key] = checked; if (!checked) patch(key, ''); }
function reset() {
  const { dateFrom, dateTo } = query;
  Object.assign(query, emptyRegistrationListQuery(), { dateFrom, dateTo });
  current.value = 1;
  clearSelection();
}
function changeTimePreset(value: string | number) {
  listNow.value = new Date();
  customRangeError.value = '';
  if (value === 'custom') {
    pickingDates.value = [];
    customPickerOpen.value = true;
  } else {
    timePreset.value = value as RegistrationListTimePreset;
    customPanelOpen.value = false;
    customPickerOpen.value = false;
  }
}
function calendarChange(dates: unknown) { pickingDates.value = (dates ?? []) as typeof pickingDates.value; }
function disabledCreationDate(date: Dayjs) {
  const window = registrationListWindow();
  return date.startOf('day').isBefore(dayjs(window.from)) || date.startOf('day').isAfter(dayjs(window.to).startOf('day'));
}
function disabledCreationTime(date: Dayjs | null) {
  const now = dayjs();
  const sameDay = !!date && date.isSame(now, 'day');
  const after = (value: number, length: number) => Array.from({ length }, (_, i) => i).filter((i) => i > value);
  return {
    disabledHours: () => sameDay ? after(now.hour(), 24) : [],
    disabledMinutes: (hour: number) => sameDay && hour === now.hour() ? after(now.minute(), 60) : [],
    disabledSeconds: (hour: number, minute: number) => sameDay && hour === now.hour() && minute === now.minute() ? after(now.second(), 60) : [],
  };
}
function changeRange(dates: [Dayjs, Dayjs] | [string, string] | null) {
  if (!dates || !dates[0] || !dates[1]) return;
  const start = dayjs(dates[0]);
  const end = dayjs(dates[1]);
  const from = start.format('YYYY-MM-DD HH:mm:ss'), to = end.format('YYYY-MM-DD HH:mm:ss');
  const error = registrationListRangeError(from, to);
  if (error) {
    customRangeError.value = error; message.warning(error);
    setTimeout(() => { customPickerOpen.value = true; }, 0);
    return;
  }
  customRangeError.value = '';
  query.dateFrom = from;
  query.dateTo = to;
  dateValue.value = [start, end];
  listNow.value = new Date();
  timePreset.value = 'custom';
  setTimeout(() => { customPickerOpen.value = false; customPanelOpen.value = false; }, 0);
}
function selectChip(key: string) { query.status = key === 'processing' ? '处理中' : key === 'closed' ? '已结案' : ''; }
function setColumnVisible(key: string, visible: boolean) { columnState.value.visible[key] = visible; }
function reorderColumn(from: string, to: string) {
  const order = [...columnState.value.order], fromIndex = order.indexOf(from);
  if (fromIndex < 0 || from === to || !order.includes(to)) return;
  order.splice(fromIndex, 1); order.splice(order.indexOf(to), 0, from); columnState.value.order = order;
}
function resetColumns() { columnState.value = { visible: defaultVisible(), order: defaultColumnOrder() }; }
function columnLabel(key: string) { return [...columnDefs, ...fixedColumns].find((column) => column.key === key)?.label ?? key; }
function open(record: RegistrationRecord | { no?: unknown }, transfer = false) {
  if (typeof record.no === 'string') void router.push({ path: `/self-service/${encodeURIComponent(record.no)}`, query: transfer ? { action: 'transfer' } : {} });
}
function canEditRecord(record: RegistrationRecord) {
  return store.canEdit(record.no);
}
function canTransferRecord(record: RegistrationRecord) {
  return store.canTransfer(record.no);
}
function canReopenRecord(record: RegistrationRecord) {
  return scope.value === 'all' && store.canReopenByLeader(record);
}
const reopenOpen = ref(false);
const reopenTarget = ref<RegistrationRecord | null>(null);
const reopenReason = ref('');
const reopenRemark = ref('');
const reopenReasonOptions = REGISTRATION_REOPEN_REASONS.map((value) => ({ value, label: value }));
const reopenOkDisabled = computed(() => !reopenReason.value.trim());
function openReopenModal(record: RegistrationRecord) {
  if (!canReopenRecord(record)) return;
  reopenTarget.value = record;
  reopenReason.value = '';
  reopenRemark.value = '';
  reopenOpen.value = true;
}
function submitReopen() {
  const target = reopenTarget.value;
  if (!target || !reopenReason.value.trim()) return;
  const result = store.reopenByLeader(target.no, reopenReason.value, reopenRemark.value);
  if (result.ok) {
    message.success(result.message);
    reopenOpen.value = false;
    reopenTarget.value = null;
  } else {
    message.warning(result.message);
  }
}
function cancelReopen() {
  reopenOpen.value = false;
  reopenTarget.value = null;
}
function csvCell(value: unknown) { const text = String(value ?? ''); return `"${(/^[=+@\-\t\r]/.test(text) ? `'${text}` : text).replaceAll('"', '""')}"`; }
function exportRows() {
  listNow.value = new Date();
  const scopeRows = selectAllFiltered.value
    ? rows.value
    : selectedCount.value
      ? rows.value.filter((record) => selectedIds.value.has(record.no))
      : rows.value;
  const exportable = scopeRows.filter((record) => withinRegistrationListWindow(record));
  if (!scopeRows.length) {
    message.info('当前筛选下没有可导出的工单');
    return;
  }
  if (!exportable.length) {
    message.info(selectedCount.value ? '所选工单均不在近三个月导出范围内' : '当前筛选下没有近三个月的工单可导出');
    return;
  }
  const header = ['工单号', '状态', '处理组', '建单人', '处理人', '创建时间', '更新时间', '结案时间', '预约提醒时间', ...REGISTRATION_FIELD_DEFINITIONS.map((field) => field.unit ? `${field.label}（${field.unit}）` : field.label)];
  const body = exportable.map((record) => {
    const next = record.reminders?.filter((item) => !item.triggeredAt).sort((a, b) => a.at.localeCompare(b.at))[0];
    return [record.no, record.status, record.groupName, record.builder, record.handler, record.createdAt, record.updatedAt, record.closedAt ?? '', next?.at ?? '', ...REGISTRATION_FIELD_DEFINITIONS.map((field) => field.key === 'refundAmount' ? formatRegistrationAmount(record.values[field.key]) : registrationDisplayValue(record, field.key))];
  });
  const blob = new Blob(['\uFEFF', [header, ...body].map((row) => row.map(csvCell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob), link = document.createElement('a'), today = new Date();
  const date = [today.getFullYear(), String(today.getMonth() + 1).padStart(2, '0'), String(today.getDate()).padStart(2, '0')].join('-');
  link.href = url; link.download = `无线音乐自建单-${date}.csv`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  const scopeHint = selectedCount.value ? '所选' : '当前筛选';
  message.success(`已导出${scopeHint} ${exportable.length} 条近三个月工单明细`);
}
</script>

<template>
  <div class="workbench">
    <div class="workbench-tabs"><WorkspaceTaskTabs :active="scope" :tabs="scopeTabs" :counts="{ mine: myRecords.length, all: timeVisibleRecords.length }" @change="scope = $event as typeof scope" /></div>
    <div class="workbench-body">
      <div class="filter-row-unified">
        <TicketFilterBar :active-chip="activeChip" :chips="chips" :chip-counts="chipCounts" :show-time-filter="false" @chip="selectChip" />
        <div class="creation-time-filter" aria-label="创建时间筛选">
          <span class="creation-time-label">创建时间</span>
          <div class="creation-time-segments">
            <a-segmented :value="timePreset" :options="creationTimeOptions" size="small" @change="changeTimePreset" />
            <a-popover v-model:open="customPanelOpen" trigger="click" placement="bottomRight">
              <template #content>
                <div class="creation-custom-panel">
                  <p>选择近三个月内的创建时间，精确到秒</p>
                  <a-range-picker
                    :value="customPickerValue"
                    v-model:open="customPickerOpen"
                    class="creation-range-picker"
                    :disabled-date="disabledCreationDate"
                    :disabled-time="disabledCreationTime"
                    :show-time="{ format: 'HH:mm:ss', defaultValue: [dayjs().startOf('day'), dayjs()] }"
                    :get-popup-container="(node: HTMLElement) => node.parentElement!"
                    format="YYYY-MM-DD HH:mm:ss"
                    :placeholder="['开始时间', '结束时间']"
                    size="small"
                    :allow-clear="false"
                    aria-label="自定义创建时间范围"
                    @calendar-change="calendarChange"
                    @change="changeRange"
                  />
                  <p v-if="customRangeError" class="creation-range-error" role="alert">{{ customRangeError }}</p>
                </div>
              </template>
              <button
                type="button"
                class="creation-custom-button"
                :class="{ active: timePreset === 'custom' || customPanelOpen }"
                :title="timePreset === 'custom' && dateValue ? `${query.dateFrom} 至 ${query.dateTo}` : '自定义近三个月内的创建时间'"
              >自定义</button>
            </a-popover>
          </div>
        </div>
      </div>
      <div class="list-controls">
        <div v-if="filterExpanded" class="mine-query" aria-label="自建单筛选条件">
          <div class="query-filters">
            <div class="filter-scroll">
              <label v-for="field in filterFields" :key="field.key" class="filter-item" :class="{ 'filter-item-wide': field.kind === 'select' }"><span class="fi-label">{{ field.label }}</span><a-select v-if="field.kind === 'select'" class="fi-select-wide" :value="query[field.key] || undefined" :options="fieldOptions(field.key)" allow-clear show-search :bordered="false" size="small" placeholder="请选择" :aria-label="`筛选${field.label}`" @change="patch(field.key, $event)" /><input v-else class="fi-input" :value="query[field.key]" :aria-label="`筛选${field.label}`" placeholder="请输入" @input="patch(field.key, ($event.target as HTMLInputElement).value)" /></label>
            </div>
            <div class="filter-actions"><a-popover v-model:open="optionalOpen" trigger="click" placement="bottomRight"><template #content><div class="optional-fields"><a-checkbox v-for="field in filterDefs" :key="field.key" :checked="field.fixed || optionalVisible[field.key]" :disabled="field.fixed" @change="toggleOptional(field.key, $event.target.checked === true)">{{ field.label }}</a-checkbox></div></template><button type="button" class="link-btn">+ 筛选</button></a-popover><button type="button" class="link-btn" @click="reset">重置</button></div>
          </div>
        </div>
        <TicketToolbar :selected-count="selectedCount" :search="query.keyword" search-placeholder="诉求 / 处理结果 / 产品关键词" :show-sort="false" :show-batch="false" :show-create="canCreate" :show-filter-toggle="true" :filter-expanded="filterExpanded" :visible-columns="columnState.visible" :column-order="columnState.order" :column-defs="columnDefs" :fixed-column-defs="fixedColumns" :resolve-column-label="columnLabel" column-footer-hint="工单/标题、工单摘要、操作为固定列" @update:search="query.keyword = $event" @create="router.push('/self-service/new')" @toggle-filter="filterExpanded = !filterExpanded" @set-column-visible="setColumnVisible" @reorder-column="reorderColumn" @reset-columns="resetColumns">
          <template #before-create><button type="button" class="export-button" :disabled="!rows.length" :title="rows.length ? (selectedCount ? `导出已选 ${selectedCount} 条（限近三个月）` : '未勾选时导出当前筛选全部（限近三个月）') : undefined" @click="exportRows"><DownloadOutlined />{{ exportButtonLabel }}</button></template>
        </TicketToolbar>
      </div>
      <div class="table-card">
        <div
          v-if="showSelectAllFilteredHint"
          class="selection-banner"
          role="status"
        >
          已选择本页 {{ pagedRows.length }} 条。
          <button type="button" class="selection-banner-link" @click="selectAllFilteredRows">
            选择筛选结果全部 {{ rows.length }} 条
          </button>
        </div>
        <div
          v-else-if="selectAllFiltered && selectedCount"
          class="selection-banner"
          role="status"
        >
          已选全部 {{ rows.length }} 条（当前筛选结果）
          <button type="button" class="selection-banner-link" @click="clearSelection">取消选择</button>
        </div>
        <RegistrationRichList
          :rows="pagedRows"
          :selected-ids="selectedIds"
          :all-page-selected="allPageSelected"
          :select-all-filtered="selectAllFiltered"
          :header-indeterminate="headerCheckboxIndeterminate"
          :visible-columns="columnState.visible"
          :column-order="columnState.order"
          :column-label="columnLabel"
          :list-sort-key="listSortKey"
          :list-sort-dir="listSortDir"
          :empty-text="listEmptyText"
          :can-edit="canEditRecord"
          :can-transfer="canTransferRecord"
          :can-reopen="canReopenRecord"
          @open="open"
          @transfer="open($event, true)"
          @reopen="openReopenModal"
          @toggle-list-sort="toggleListSort"
          @toggle="toggleSelect"
          @toggle-all="toggleSelectAllOnPage"
          @select-page="selectPageOnly"
          @select-all-filtered="selectAllFilteredRows"
          @clear-selection="clearSelection"
          @header-check-change="onHeaderCheckboxChange"
        />
        <div class="pager">
          <div class="pager-left">
            <span class="pager-total">共 {{ rows.length }} 条</span>
          </div>
          <AppPagination
            :total="rows.length"
            :current="current"
            :page-size="pageSize"
            :show-total="false"
            @change="setPage"
          />
        </div>
      </div>
    </div>
    <OpActionModal
      v-model:open="reopenOpen"
      title="退回重开"
      :subtitle="reopenTarget ? `无线音乐登记 · ${reopenTarget.no}` : ''"
      :icon="RollbackOutlined"
      tone="warn"
      :width="440"
      ok-text="确认退回"
      cancel-text="取消"
      ok-tone="danger"
      :ok-disabled="reopenOkDisabled"
      ok-disabled-tip="请选择退回原因"
      @ok="submitReopen"
      @cancel="cancelReopen"
    >
      <div v-if="reopenTarget" class="op-form registration-reopen-form">
        <div class="op-field op-field-h">
          <div class="op-label req">退回原因</div>
          <a-select
            v-model:value="reopenReason"
            placeholder="请选择"
            :options="reopenReasonOptions"
          />
        </div>
        <div class="op-field op-field-h op-field-h-top">
          <div class="op-label">补充说明</div>
          <a-textarea
            v-model:value="reopenRemark"
            :rows="3"
            placeholder="选填"
            :maxlength="500"
            show-count
          />
        </div>
      </div>
    </OpActionModal>
  </div>
</template>

<style scoped>
/* 布局与工单工作台 TicketWorkbenchView 对齐 */
.workbench {
  display: flex;
  flex-direction: column;
  min-height: 100%;
  width: 100%;
  min-width: 0;
}
.workbench-tabs {
  flex: none;
  background: #fff;
  border-bottom: 1px solid #e5e7eb;
}
.workbench-body {
  display: flex;
  flex-direction: column;
  gap: var(--flowos-page-gap);
  padding: 0;
  flex: 1;
  min-height: 0;
  min-width: 0;
}
.filter-row-unified {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-width: 0;
  flex-wrap: wrap;
}
.filter-row-unified :deep(.filter-row) {
  flex: 1;
  min-width: 250px;
}
.creation-time-filter {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 8px;
  margin-left: auto;
  padding: 6px 10px;
  max-width: 100%;
  background: #f8fafc;
  border: 1px solid #eef2f7;
  border-radius: 10px;
}
.creation-time-label {
  flex: none;
  color: #9ca3af;
  font-size: 12px;
  font-weight: 500;
}
.creation-time-filter :deep(.ant-segmented) {
  font-size: 12px;
  background: transparent;
}
.creation-time-segments {
  display: inline-flex;
  align-items: center;
  padding-right: 2px;
  background: #f1f3f5;
  border-radius: 4px;
}
.creation-custom-button {
  padding: 0 7px;
  height: 22px;
  border: none;
  border-radius: 2px;
  color: #6b7280;
  background: transparent;
  font-size: 12px;
  cursor: pointer;
}
.creation-custom-button.active {
  color: #1a6fff;
  background: #fff;
  box-shadow: 0 1px 3px #00000012;
}
.creation-custom-panel {
  width: 380px;
  max-width: calc(100vw - 48px);
}
.creation-custom-panel > p {
  margin: 0 0 8px;
  font-size: 12px;
  color: #6b7280;
}
.creation-range-picker {
  width: 100%;
  max-width: 100%;
}
.creation-range-picker :deep(input) {
  font-size: 12px;
}
.creation-range-error {
  width: 100%;
  color: #ef4444 !important;
  font-size: 12px;
  text-align: right;
}
.list-controls {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
  min-width: 0;
}
.mine-query {
  display: flex;
  flex-direction: column;
  width: 100%;
  min-width: 0;
}
.query-filters {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  width: 100%;
  min-width: 0;
}
.filter-scroll {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
}
.filter-item {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 32px;
  padding: 0 10px;
  background: #f3f4f6;
  border-radius: 4px;
  flex: none;
  min-width: 0;
}
.filter-item-wide :deep(.fi-select-wide) {
  min-width: 120px;
  max-width: 180px;
}
.fi-label {
  flex: none;
  font-size: 13px;
  color: #6b7280;
  white-space: nowrap;
}
.fi-input {
  min-width: 72px;
  max-width: 96px;
  height: 24px;
  padding: 0;
  border: none;
  outline: none;
  font-size: var(--flowos-control-font-size);
  color: #374151;
  background: transparent;
}
.fi-input::placeholder {
  color: #9ca3af;
}
.filter-actions {
  display: inline-flex;
  align-items: center;
  align-self: flex-start;
  gap: 12px;
  height: 32px;
  flex: none;
  white-space: nowrap;
}
.link-btn {
  display: inline-flex;
  align-items: center;
  height: 100%;
  padding: 0;
  border: none;
  background: transparent;
  font-size: 13px;
  line-height: 1;
  color: #1a6fff;
  cursor: pointer;
}
.link-btn:hover {
  color: #0f4fcc;
  text-decoration: underline;
}
.optional-fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px 18px;
  max-height: 360px;
  overflow: auto;
  padding: 5px;
}
.optional-fields :deep(.ant-checkbox-wrapper) {
  margin-inline-start: 0 !important;
  font-size: 12px;
}
.export-button {
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 36px;
  padding: 0 12px;
  background: #fff;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 13px;
  line-height: 1;
  color: #374151;
  cursor: pointer;
  white-space: nowrap;
  flex: none;
  user-select: none;
}
.export-button:hover:not(:disabled) {
  border-color: #1a6fff;
}
.export-button:disabled {
  color: #aeb7c5;
  cursor: not-allowed;
}
.table-card {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  overflow: hidden;
  min-width: 0;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.selection-banner {
  flex: none;
  padding: 8px 16px;
  font-size: 12px;
  color: #374151;
  background: #eff6ff;
  border-bottom: 1px solid #dbeafe;
}
.selection-banner-link {
  margin-left: 6px;
  padding: 0;
  border: none;
  background: none;
  font-size: inherit;
  color: #1a6fff;
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 2px;
}
.selection-banner-link:hover {
  color: #1558d6;
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
  font-size: 12px;
  color: #6b7280;
}
@media (max-width: 760px) {
  .workbench-body {
    padding: 0;
  }
  .query-filters {
    flex-direction: column;
  }
  .workbench :deep(.wb-toolbar__cluster) {
    flex-wrap: wrap;
  }
  .optional-fields {
    grid-template-columns: 1fr;
  }
}
</style>
