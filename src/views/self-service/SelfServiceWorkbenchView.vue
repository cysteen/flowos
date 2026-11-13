<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { message } from 'ant-design-vue';
import { DownloadOutlined } from '@ant-design/icons-vue';
import WorkspaceTaskTabs from '@/components/workspace/WorkspaceTaskTabs.vue';
import TicketFilterBar from '@/views/tickets/components/TicketFilterBar.vue';
import TicketToolbar from '@/views/tickets/components/TicketToolbar.vue';
import { useBusinessRegistrationStore } from '@/stores/businessRegistration';
import { useFormCatalogsStore } from '@/stores/formCatalogs';
import { useUserStore } from '@/stores/user';
import { useTenantStore } from '@/stores/tenant';
import { REGISTRATION_FIELD_DEFINITIONS, REGISTRATION_TEMPLATES, WIRELESS_REGISTRATION_TEMPLATE_ID, type RegistrationFieldKey } from '@/views/tickets/types/businessRegistration';
import { emptyRegistrationListQuery, filterRegistrationRecords, type RegistrationListQuery } from './registrationListQuery';
import { useRegistrationQueryCatalog } from './useRegistrationQueryCatalog';

defineOptions({ name: 'SelfServiceWorkbenchView' });
const store = useBusinessRegistrationStore(), catalogs = useFormCatalogsStore();
const user = useUserStore(), tenant = useTenantStore();
const router = useRouter(), route = useRoute();
const templateId = ref(WIRELESS_REGISTRATION_TEMPLATE_ID);
const seed = REGISTRATION_TEMPLATES.find((template) => template.id === templateId.value)!;
const { productCatalog, registrationSources } = useRegistrationQueryCatalog(templateId);
const query = reactive(emptyRegistrationListQuery());
const canCreate = computed(() => store.canCreate(templateId.value));
const scope = ref<'mine' | 'all'>(canCreate.value ? 'mine' : 'all');
const filterExpanded = ref(false), optionalOpen = ref(false);
const current = ref(1), pageSize = ref(10), dateValue = ref();
const tableCard = ref<HTMLElement>(), tableHeight = ref(400);
let tableObserver: ResizeObserver | undefined;
onMounted(() => {
  tableObserver = new ResizeObserver(() => { if (tableCard.value?.clientHeight) tableHeight.value = tableCard.value.clientHeight; });
  if (tableCard.value) tableObserver.observe(tableCard.value);
});
onBeforeUnmount(() => tableObserver?.disconnect());
const tableScrollY = computed(() => Math.max(160, tableHeight.value - 108));
const visibleRecords = computed(() => store.records.filter((record) => store.canView(record)));
const myRecords = computed(() => visibleRecords.value.filter((record) => record.status === '处理中' && record.handler === user.name));
const scopeTabs = computed(() => [...(canCreate.value ? [{ key: 'mine', label: '我的待办' }] : []), { key: 'all', label: '全部记录' }]);
const scopedRecords = computed(() => scope.value === 'mine' ? myRecords.value : visibleRecords.value);
const baseMatches = computed(() => filterRegistrationRecords(scopedRecords.value, { ...query, status: '' }));
const rows = computed(() => filterRegistrationRecords(scopedRecords.value, query).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
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
  { key: 'productCategory', label: '产品分类', kind: 'select' },
  { key: 'productName', label: '产品名称', kind: 'select' },
  { key: 'problemL1', label: '问题分类一', kind: 'select' },
  { key: 'problemL2', label: '问题分类二', kind: 'select' },
  { key: 'complaintType', label: '投诉类型', kind: 'select' },
  { key: 'closedLoop', label: '是否闭环', kind: 'select' },
];
const preferenceKey = computed(() => `flowos-self-service-list-v1:${tenant.currentTenantId}:${user.name}`);
const optionalVisible = ref<Record<string, boolean>>({});
const filterFields = computed(() => filterDefs.filter((field) => field.fixed || optionalVisible.value[field.key]));
const columnDefinitions = [
  { key: 'source', label: '反馈平台 / 来源', width: 155 },
  { key: 'status', label: '状态', width: 88 },
  { key: 'handler', label: '处理人', width: 88 },
  { key: 'accessTime', label: '接入时间', width: 150 },
  { key: 'reminder', label: '预约提醒', width: 150 },
  { key: 'createdAt', label: '创建时间', width: 150 },
  { key: 'updatedAt', label: '更新时间', width: 150 },
];
const columnDefs = columnDefinitions.map(({ key, label }) => ({ key, label }));
const fixedColumns = [{ key: 'ticket', label: '工单 / 产品' }, { key: 'action', label: '操作' }];
const defaultVisible = () => Object.fromEntries(columnDefs.map(({ key }) => [key, !['createdAt', 'updatedAt'].includes(key)]));
const columnState = ref({ visible: defaultVisible(), order: columnDefs.map(({ key }) => key) });
const columns = computed(() => [
  { title: '工单 / 产品', key: 'ticket', width: 250, fixed: 'left' as const },
  ...columnState.value.order.filter((key) => columnState.value.visible[key] !== false).map((key) => {
    const def = columnDefinitions.find((column) => column.key === key)!;
    return { title: def.label, key, dataIndex: key, width: def.width };
  }),
  { title: '操作', key: 'action', width: 112, fixed: 'right' as const },
]);
const tableWidth = computed(() => columns.value.reduce((total, column) => total + column.width, 0));
function loadPreferences() {
  columnState.value = { visible: defaultVisible(), order: columnDefs.map(({ key }) => key) }; optionalVisible.value = {};
  try {
    const saved = JSON.parse(localStorage.getItem(preferenceKey.value) ?? 'null');
    if (saved?.columns) {
      const known = new Set(columnDefs.map(({ key }) => key));
      const order = Array.isArray(saved.columns.order) ? saved.columns.order.filter((key: string) => known.has(key)) : [];
      columnState.value = { visible: { ...defaultVisible(), ...saved.columns.visible }, order: [...new Set([...order, ...known])] as string[] };
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
watch([query, scope], () => { current.value = 1; });
watch(() => rows.value.length, (total) => { if ((current.value - 1) * pageSize.value >= total) current.value = 1; });
watch(() => [user.name, tenant.currentTenantId], () => { reset(); scope.value = canCreate.value ? 'mine' : 'all'; });

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
function reset() { Object.assign(query, emptyRegistrationListQuery()); dateValue.value = undefined; current.value = 1; }
function changeRange(_dates: unknown, strings: [string, string]) { query.dateFrom = strings?.[0] ?? ''; query.dateTo = strings?.[1] ?? ''; }
function selectChip(key: string) { query.status = key === 'processing' ? '处理中' : key === 'closed' ? '已结案' : ''; }
function setColumnVisible(key: string, visible: boolean) { columnState.value.visible[key] = visible; }
function reorderColumn(from: string, to: string) {
  const order = [...columnState.value.order], fromIndex = order.indexOf(from);
  if (fromIndex < 0 || from === to || !order.includes(to)) return;
  order.splice(fromIndex, 1); order.splice(order.indexOf(to), 0, from); columnState.value.order = order;
}
function resetColumns() { columnState.value = { visible: defaultVisible(), order: columnDefs.map(({ key }) => key) }; }
function columnLabel(key: string) { return [...columnDefs, ...fixedColumns].find((column) => column.key === key)?.label ?? key; }
function open(record: { no?: unknown }, transfer = false) { if (typeof record.no === 'string') void router.push({ path: `/self-service/${encodeURIComponent(record.no)}`, query: transfer ? { action: 'transfer' } : {} }); }
function displayTime(value?: string) { return value ? value.replace('T', ' ').slice(0, 19) : '—'; }
function csvCell(value: unknown) { const text = String(value ?? ''); return `"${(/^[=+@\-\t\r]/.test(text) ? `'${text}` : text).replaceAll('"', '""')}"`; }
function exportRows() {
  const cutoff = new Date(); cutoff.setMonth(cutoff.getMonth() - 3); cutoff.setHours(0, 0, 0, 0);
  const exportable = rows.value.filter((record) => new Date(record.createdAt.replace(' ', 'T')).getTime() >= cutoff.getTime());
  if (!exportable.length) { message.info('当前筛选下没有近三个月的工单可导出'); return; }
  const header = ['工单号', '状态', '处理组', '建单人', '处理人', '创建时间', '更新时间', '结案时间', '预约提醒时间', ...REGISTRATION_FIELD_DEFINITIONS.map((field) => field.label)];
  const body = exportable.map((record) => [record.no, record.status, record.groupName, record.builder, record.handler, record.createdAt, record.updatedAt, record.closedAt ?? '', record.reminder?.at ?? '', ...REGISTRATION_FIELD_DEFINITIONS.map((field) => record.values[field.key])]);
  const blob = new Blob(['\uFEFF', [header, ...body].map((row) => row.map(csvCell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob), link = document.createElement('a'), today = new Date();
  const date = [today.getFullYear(), String(today.getMonth() + 1).padStart(2, '0'), String(today.getDate()).padStart(2, '0')].join('-');
  link.href = url; link.download = `无线音乐自建单-${date}.csv`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  message.success(`已导出 ${exportable.length} 条近三个月工单明细`);
}
</script>

<template>
  <div class="self-service-workbench">
    <div class="workbench-tabs"><WorkspaceTaskTabs :active="scope" :tabs="scopeTabs" :counts="{ mine: myRecords.length, all: visibleRecords.length }" @change="scope = $event as typeof scope" /></div>
    <div class="workbench-body">
      <TicketFilterBar :active-chip="activeChip" :chips="chips" :chip-counts="chipCounts" :show-time-filter="false" @chip="selectChip" />
      <div class="list-controls">
        <section v-if="filterExpanded" class="registration-query-panel" aria-label="自建单筛选条件">
          <div class="filter-scroll">
            <label class="filter-item time-filter"><a-select v-model:value="query.timeField" :options="[{ value: 'createdAt', label: '创建时间' }, { value: 'accessTime', label: '接入时间' }, { value: 'replyTime', label: '回复时间' }]" size="small" :bordered="false" aria-label="筛选时间字段" /><a-range-picker v-model:value="dateValue" :show-time="{ format: 'HH:mm:ss' }" format="YYYY-MM-DD HH:mm:ss" :placeholder="['开始时间', '结束时间']" size="small" :bordered="false" @change="changeRange" /></label>
            <label v-for="field in filterFields" :key="field.key" class="filter-item"><span class="fi-label">{{ field.label }}</span><a-select v-if="field.kind === 'select'" :value="query[field.key] || undefined" :options="fieldOptions(field.key)" allow-clear show-search :bordered="false" size="small" placeholder="请选择" :aria-label="`筛选${field.label}`" @change="patch(field.key, $event)" /><input v-else :value="query[field.key]" :aria-label="`筛选${field.label}`" placeholder="请输入" @input="patch(field.key, ($event.target as HTMLInputElement).value)" /></label>
          </div>
          <div class="filter-actions"><a-popover v-model:open="optionalOpen" trigger="click" placement="bottomRight"><template #content><div class="optional-fields"><a-checkbox v-for="field in filterDefs" :key="field.key" :checked="field.fixed || optionalVisible[field.key]" :disabled="field.fixed" @change="toggleOptional(field.key, $event.target.checked === true)">{{ field.label }}</a-checkbox></div></template><button type="button" class="link-button">+ 筛选</button></a-popover><button type="button" class="link-button" @click="reset">重置</button></div>
        </section>
        <TicketToolbar :selected-count="0" :search="query.keyword" search-placeholder="诉求 / 处理结果 / 产品关键词" :show-sort="false" :show-batch="false" :show-create="canCreate" :show-filter-toggle="true" :filter-expanded="filterExpanded" :visible-columns="columnState.visible" :column-order="columnState.order" :column-defs="columnDefs" :fixed-column-defs="fixedColumns" :resolve-column-label="columnLabel" column-footer-hint="工单/产品、操作为固定列" @update:search="query.keyword = $event" @create="router.push('/self-service/new')" @toggle-filter="filterExpanded = !filterExpanded" @set-column-visible="setColumnVisible" @reorder-column="reorderColumn" @reset-columns="resetColumns"><template #before-create><button type="button" class="export-button" :disabled="!rows.length" @click="exportRows"><DownloadOutlined />导出</button></template></TicketToolbar>
      </div>
      <div ref="tableCard" class="table-card">
        <a-table class="self-service-table" :style="{ '--registration-table-body-height': `${tableScrollY}px` }" :columns="columns" :data-source="rows" row-key="no" :scroll="{ x: tableWidth, y: tableScrollY }" :pagination="{ current, pageSize, total: rows.length, showSizeChanger: true, showTotal: (total: number) => `共 ${total} 条`, onChange: (page: number, size: number) => { current = page; pageSize = size; } }">
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'ticket'"><button type="button" class="ticket-link" @click="open(record)">{{ record.values.businessPhone }}<span v-if="record.values.productName"> · {{ record.values.productName }}</span></button><div class="ticket-number">{{ record.no }}</div><div v-if="record.values.upstreamNo" class="upstream-number">上游：{{ record.values.upstreamNo }}</div></template>
            <template v-else-if="column.key === 'source'"><div>{{ record.values.feedback || '—' }}</div><small class="secondary-line">{{ record.values.specificSource || record.values.channelDetail || '—' }}</small></template>
            <template v-else-if="column.key === 'status'"><a-tag :color="record.status === '已结案' ? 'green' : 'orange'">{{ record.status }}</a-tag></template>
            <template v-else-if="column.key === 'accessTime'"><span class="time-text">{{ displayTime(record.values.accessTime) }}</span></template>
            <template v-else-if="column.key === 'createdAt' || column.key === 'updatedAt'"><span class="time-text">{{ displayTime(record[column.key]) }}</span></template>
            <template v-else-if="column.key === 'reminder'"><span class="time-text">{{ displayTime(record.reminder?.at) }}</span><small v-if="record.reminder" class="secondary-line">{{ record.reminder.triggeredAt ? '已提醒' : `提醒${record.reminder.recipient}` }}</small></template>
            <template v-else-if="column.key === 'action'"><div class="row-actions"><a-button type="link" size="small" @click="open(record)">{{ store.canEdit(record.no) && record.status === '处理中' ? '处理' : '查看' }}</a-button><a-button v-if="store.canTransfer(record.no)" type="link" size="small" @click="open(record, true)">调剂</a-button></div></template>
          </template>
          <template #emptyText><div class="empty-records"><a-empty :description="scope === 'mine' ? '暂无我的待办自建单' : '暂无符合条件的自建单'" /></div></template>
        </a-table>
      </div>
    </div>
  </div>
</template>

<style scoped>
.self-service-workbench{height:100%;min-height:0;display:flex;flex-direction:column;background:#f9fafb;color:#26364a}.workbench-tabs{background:#fff;border-bottom:1px solid #e5e7eb;flex:none}.workbench-body{display:flex;flex-direction:column;gap:12px;padding:20px;flex:1;min-height:0;min-width:0}.list-controls{display:flex;flex-direction:column;gap:10px;width:100%;min-width:0}.registration-query-panel{display:flex;align-items:flex-start;gap:12px;width:100%;min-width:0}.filter-scroll{display:flex;flex-wrap:wrap;align-items:center;gap:8px;flex:1;min-width:0}.filter-item{display:inline-flex;align-items:center;gap:8px;min-height:32px;padding:0 10px;background:#f3f4f6;border-radius:4px;flex:none;min-width:0}.fi-label{font-size:13px;color:#6b7280;white-space:nowrap}.filter-item>:deep(.ant-select){min-width:78px;max-width:132px;font-size:13px}.filter-item input{width:90px;border:0;outline:none;background:transparent;color:#374151;font-size:13px;line-height:24px}.filter-item input::placeholder{color:#9ca3af}.filter-item.time-filter{padding:0 5px 0 0;gap:0}.time-filter>:deep(.ant-select){width:100px;max-width:none}.time-filter :deep(.ant-picker){width:354px;background:transparent;box-shadow:none}.time-filter :deep(.ant-picker-input>input){font-size:12px}.filter-actions{display:flex;gap:12px;align-items:center;flex:none;height:32px}.link-button{border:0;background:none;color:#1a6fff;font-size:13px;padding:0;cursor:pointer}.optional-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px 18px;max-height:360px;overflow:auto;padding:5px}.optional-fields :deep(.ant-checkbox-wrapper){margin-inline-start:0!important;font-size:12px}.export-button{box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;gap:6px;height:36px;padding:0 12px;background:#fff;border:1px solid #d1d5db;border-radius:6px;font-size:13px;color:#374151;cursor:pointer;white-space:nowrap;flex:none}.export-button:hover:not(:disabled){border-color:#1a6fff}.export-button:disabled{color:#aeb7c5;cursor:not-allowed}.table-card{background:#fff;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;min-width:0;flex:1;min-height:0;display:flex;flex-direction:column}.self-service-table{min-width:0;flex:1}.self-service-table :deep(.ant-table){font-size:12px}.self-service-table :deep(.ant-table-thead>tr>th){background:#f8fafc;color:#6b7280;font-weight:500;white-space:nowrap;padding:11px 12px;border-bottom:1px solid #e5e7eb}.self-service-table :deep(.ant-table-tbody>tr>td){padding:13px 12px;vertical-align:middle;color:#374151;border-bottom:1px solid #f0f2f5}.self-service-table :deep(.ant-table-cell-row-hover){background:#f9fafb!important}.self-service-table :deep(.ant-table-cell-fix-right){background:#fff!important}.self-service-table :deep(.ant-table-thead .ant-table-cell-fix-right){background:#f8fafc!important}.self-service-table :deep(.ant-table-pagination){margin:14px 16px}.ticket-link{border:0;background:none;color:#183b61;font-family:inherit;font-size:12px;font-weight:500;cursor:pointer;text-align:left;padding:0;line-height:1.65;white-space:normal;word-break:break-word}.ticket-link:hover{color:#1a6fff}.ticket-number{color:#1a6fff;font-size:11px;margin-top:4px;word-break:break-all}.upstream-number{font-size:11px;color:#9ca3af;margin-top:3px;word-break:break-all}.secondary-line{display:block;font-size:11px;line-height:1.6;color:#9ca3af;margin-top:4px;word-break:break-word}.time-text{font-size:11px;white-space:nowrap;color:#6b7280}.row-actions{display:flex;gap:2px;white-space:nowrap}.row-actions :deep(.ant-btn){font-size:12px;padding:0 3px}.empty-records{padding:30px 0}.empty-records :deep(.ant-empty){margin:20px 0}@media(max-width:760px){.workbench-body{padding:12px}.registration-query-panel{flex-direction:column}.time-filter :deep(.ant-picker){width:300px}.self-service-workbench :deep(.wb-toolbar__cluster){flex-wrap:wrap}.optional-fields{grid-template-columns:1fr}}
.self-service-table :deep(.ant-table-body){height:var(--registration-table-body-height)}
.self-service-table :deep(.ant-table-cell-fix-left){background:#fff!important}
.self-service-table :deep(.ant-table-thead .ant-table-cell-fix-left){background:#f8fafc!important}
</style>
