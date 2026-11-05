<script setup lang="ts">
// 派单日志（PRD 8.5 / 附录 A.1）：按工单号、派单时间（最长 31 天）、工单池、结果筛选，更多筛选含坐席、判定路径、未派出原因；点「详情」看判定过程
import { computed, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { message } from 'ant-design-vue';
import { DownloadOutlined, DownOutlined, SearchOutlined, UpOutlined } from '@ant-design/icons-vue';
import dayjs, { type Dayjs } from 'dayjs';
import { useDispatchStore } from '@/stores/dispatch';
import { stdPagination } from '@/config/adminUi';
import type { DispatchFailReason, DispatchLogEntry, DispatchPath } from '@/views/tickets/types/dispatch';
import { parseAt } from './dispatchMetrics';
import {
  LOG_RESULTS, LOG_RESULT_TONE, failLabel, judgeOrdinals, logResult, logSummary, pathLabel, pathWithRelation, type LogResult,
} from './dispatchLabels';
import DispatchLogDetailDrawer from './DispatchLogDetailDrawer.vue';
import './dispatchTheme.css';

const route = useRoute();
const router = useRouter();
const store = useDispatchStore();

const PATHS: DispatchPath[] = ['原处理人', '加权评分', '直派规则', '排队', '留池'];
const FAILS: DispatchFailReason[] = ['组内暂无已就绪成员', '无画像匹配成员', '无可接单成员', '均达个人上限', '系统异常'];
const pathOpts = PATHS.map((p) => ({ value: p, label: pathLabel(p) }));
const failOpts = FAILS.map((r) => ({ value: r, label: failLabel(r) }));
const resultOpts = LOG_RESULTS.map((r) => ({ value: r, label: r }));

interface Filters {
  no: string;
  range: [Dayjs, Dayjs];
  pools: string[];
  results: LogResult[];
  agents: string[];
  paths: DispatchPath[];
  fails: DispatchFailReason[];
}
const defaults = (): Filters => ({
  no: '', range: [dayjs().subtract(24, 'hour'), dayjs()], pools: [], results: [], agents: [], paths: [], fails: [],
});
const f = reactive<Filters>(defaults());
const snapshot = (): Filters => ({
  ...f, range: [...f.range] as [Dayjs, Dayjs], pools: [...f.pools], results: [...f.results], agents: [...f.agents], paths: [...f.paths], fails: [...f.fails],
});
const applied = ref<Filters>(snapshot());

const checkedRowKeys = ref<string[]>([]);
function clearSelection() {
  checkedRowKeys.value = [];
}
/** 筛选条件变动即清空选择 */
watch(() => JSON.stringify(f), clearSelection);

const moreOpen = ref(false);
const moreCount = computed(() => [f.agents, f.paths, f.fails].filter((x) => x.length).length);

const currentPage = ref(1);
const pageSize = ref(20);
const pagination = computed(() => stdPagination({
  current: currentPage.value,
  pageSize: pageSize.value,
  onChange: (page: number, size: number) => { currentPage.value = page; pageSize.value = size; },
}));

function query() {
  const [a, b] = f.range;
  if (b.diff(a, 'day', true) > 31) { message.error('查询范围最长 31 天'); return; }
  applied.value = snapshot();
  currentPage.value = 1;
  clearSelection();
}
function reset() {
  Object.assign(f, defaults());
  if (route.query.ticketNo != null) router.replace({ path: route.path, query: { ...route.query, ticketNo: undefined } });
  query();
}

/** 带 ?ticketNo= 进入：填入工单号，时间放宽到 30 天 */
function applyRouteTicket() {
  const no = typeof route.query.ticketNo === 'string' ? route.query.ticketNo.trim() : '';
  if (!no) return;
  f.no = no;
  f.range = [dayjs().subtract(30, 'day'), dayjs()];
  query();
}
watch(() => route.query.ticketNo, applyRouteTicket, { immediate: true });

const agentOpts = computed(() => store.agents.map((a) => ({ value: a.name, label: `${a.name}（${a.staffNo}）` })));
const poolOpts = computed(() => store.pools.map((p) => ({ value: p.id, label: p.status === '启用' ? p.name : `${p.name}（已停用）` })));

const ordinals = computed(() => judgeOrdinals(store.logs));

const rows = computed(() => {
  const q = applied.value;
  const from = q.range[0].valueOf();
  const to = q.range[1].valueOf();
  const no = q.no.trim();
  return store.logs.filter((l) => {
    // 只列引擎判定；人工动作在工单处理履历查看
    if (l.kind !== '判定') return false;
    if (no && l.ticketNo !== no) return false;
    const t = parseAt(l.at);
    if (t < from || t > to) return false;
    if (q.pools.length && !q.pools.includes(l.poolId)) return false;
    if (q.results.length && !q.results.includes(logResult(l))) return false;
    if (q.agents.length && !q.agents.includes(l.chosen?.name ?? '')) return false;
    if (q.paths.length && !(l.path && q.paths.includes(l.path))) return false;
    if (q.fails.length && !(l.failReason && q.fails.includes(l.failReason))) return false;
    return true;
  }).sort((a, b) => (a.at === b.at ? b.seq - a.seq : a.at < b.at ? 1 : -1));
});

const rowSelection = computed(() => ({
  selectedRowKeys: checkedRowKeys.value,
  onChange: (keys: (string | number)[]) => { checkedRowKeys.value = keys as string[]; },
  selections: [
    {
      key: 'page',
      text: '选择当前页',
      onSelect: (pageKeys: (string | number)[]) => { checkedRowKeys.value = [...(pageKeys as string[])]; },
    },
    {
      key: 'filtered',
      text: '选择全部筛选结果',
      onSelect: () => { checkedRowKeys.value = rows.value.map((l) => l.id); },
    },
    { key: 'none', text: '清空选择', onSelect: clearSelection },
  ],
}));
const checkedRows = computed(() => {
  const keys = new Set(checkedRowKeys.value);
  return rows.value.filter((l) => keys.has(l.id));
});

const cols = [
  { title: '派单时间', dataIndex: 'at', key: 'at', width: 156, ellipsis: true },
  { title: '工单号', key: 'ticket', width: 280, ellipsis: true },
  { title: '工单池', key: 'pool', width: 220, ellipsis: true },
  { title: '结果', key: 'result', width: 88 },
  { title: '处理人', key: 'handler', width: 120, ellipsis: true },
  { title: '说明', key: 'summary', ellipsis: true },
  { title: '操作', key: 'action', width: 56 },
];

function handlerOf(l: DispatchLogEntry) {
  return l.chosen ? { name: l.chosen.name, staffNo: l.chosen.staffNo } : null;
}

const detailOpen = ref(false);
const detailLog = ref<DispatchLogEntry | null>(null);
function openDetail(l: DispatchLogEntry) {
  detailLog.value = l;
  detailOpen.value = true;
}

function exportCsv() {
  const selected = checkedRows.value;
  if (!selected.length) return;
  const head = ['派单时间', '工单号', '判定序号', '触发类型', '归属池', '入池规则', '全局派单方式', '归属池派单方式', '结果', '判定路径', '可接单人数', '中选坐席', '综合得分', '未派出原因', '标记'];
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = selected.map((l) => [
    l.at, l.ticketNo, ordinals.value.get(l.id) ?? l.seq, l.trigger ?? '', l.poolLabel, l.ruleName,
    l.globalMode, l.groupMode, logResult(l), pathWithRelation(l.path, l.originalRelation), l.candidateCount ?? '',
    l.chosen?.name ?? '', l.chosenScore ? l.chosenScore.total.toFixed(1) : '', failLabel(l.failReason), l.overCap ?? '',
  ].map(esc).join(','));
  const blob = new Blob([`﻿${[head.map(esc).join(','), ...lines].join('\r\n')}`], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `派单日志_${dayjs().format('YYYYMMDDHHmmss')}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
  message.success(`已导出 ${selected.length} 条派单记录`);
}
</script>

<template>
  <div class="lp">
    <section class="block lp-shell">
      <div class="lp-filter-panel">
        <div class="lp-filter-grid">
          <label class="lp-cell">
            <span class="lp-label">工单号</span>
            <a-input v-model:value="f.no" class="lp-ctl" placeholder="精确匹配工单号" allow-clear @press-enter="query" />
          </label>
          <div class="lp-cell lp-cell-range">
            <span class="lp-label">派单时间</span>
            <a-range-picker
              v-model:value="f.range"
              class="lp-ctl lp-range"
              show-time
              format="YYYY-MM-DD HH:mm"
              :allow-clear="false"
            />
          </div>
          <div class="lp-cell">
            <span class="lp-label">工单池</span>
            <a-select
              v-model:value="f.pools"
              class="lp-ctl"
              mode="multiple"
              placeholder="全部"
              :options="poolOpts"
              option-filter-prop="label"
              max-tag-count="responsive"
            />
          </div>
          <div class="lp-cell">
            <span class="lp-label">结果</span>
            <a-select
              v-model:value="f.results"
              class="lp-ctl"
              mode="multiple"
              placeholder="全部"
              :options="resultOpts"
              option-filter-prop="label"
              max-tag-count="responsive"
            />
          </div>
          <div class="lp-cell lp-cell-actions">
            <a-button type="link" class="lp-more" @click="moreOpen = !moreOpen">
              更多筛选<template v-if="moreCount">（{{ moreCount }}）</template>
              <UpOutlined v-if="moreOpen" /><DownOutlined v-else />
            </a-button>
            <div class="lp-action-btns">
              <a-button @click="reset">重置</a-button>
              <a-button type="primary" @click="query"><template #icon><SearchOutlined /></template>查询</a-button>
            </div>
          </div>
        </div>
        <div v-show="moreOpen" class="lp-filter-more">
          <div class="lp-cell">
            <span class="lp-label">坐席</span>
            <a-select
              v-model:value="f.agents"
              class="lp-ctl"
              mode="multiple"
              placeholder="全部"
              :options="agentOpts"
              show-search
              option-filter-prop="label"
              max-tag-count="responsive"
            />
          </div>
          <div class="lp-cell">
            <span class="lp-label">判定路径</span>
            <a-select
              v-model:value="f.paths"
              class="lp-ctl"
              mode="multiple"
              placeholder="全部"
              :options="pathOpts"
              option-filter-prop="label"
              max-tag-count="responsive"
            />
          </div>
          <div class="lp-cell">
            <span class="lp-label">未派出原因</span>
            <a-select
              v-model:value="f.fails"
              class="lp-ctl"
              mode="multiple"
              placeholder="全部"
              :options="failOpts"
              option-filter-prop="label"
              max-tag-count="responsive"
            />
          </div>
        </div>
        <p class="lp-filter-tip">派单时间查询范围最长 31 天；修改条件后请点击「查询」。</p>
      </div>

      <div class="lp-table-head">
        <h3 class="lp-table-title">派单记录</h3>
        <div class="lp-table-tail">
          <span class="lp-table-meta">共 <b>{{ rows.length }}</b> 条</span>
          <a-tooltip :title="checkedRows.length ? undefined : '请先勾选派单记录'" placement="bottomRight">
            <div
              class="wb-toolbar__btn wb-toolbar__btn--export"
              :class="{ 'is-disabled': !checkedRows.length }"
              @click="exportCsv"
            >
              <DownloadOutlined :style="{ fontSize: '14px' }" />
              <span>{{ checkedRows.length ? `导出（${checkedRows.length} 条）` : '导出' }}</span>
            </div>
          </a-tooltip>
        </div>
      </div>

      <div class="table-shell lp-table-inner">
      <a-table
        :columns="cols"
        :data-source="rows"
        :row-selection="rowSelection"
        row-key="id"
        size="middle"
        table-layout="fixed"
        :pagination="pagination"
        :locale="{ emptyText: '暂无派单记录' }"
      >
        <template #bodyCell="{ column, record }">
          <span v-if="column.key === 'at'" class="lp-time">{{ record.at }}</span>
          <span
            v-else-if="column.key === 'ticket'"
            class="lp-inline"
            :title="`${record.ticketNo} · 第 ${ordinals.get(record.id) ?? record.seq} 次判定`"
          >
            <span class="lp-ellipsis lp-mono">{{ record.ticketNo }}</span>
            <span class="lp-sep">第 {{ ordinals.get(record.id) ?? record.seq }} 次判定</span>
          </span>
          <span
            v-else-if="column.key === 'pool'"
            class="lp-inline"
            :title="record.poolId ? `${record.poolLabel} · ${record.effectiveMode}` : record.poolLabel"
          >
            <span class="lp-ellipsis">{{ record.poolLabel }}</span>
            <span v-if="record.poolId" class="lp-sep">{{ record.effectiveMode }}</span>
          </span>
          <a-tag v-else-if="column.key === 'result'" :color="LOG_RESULT_TONE[logResult(record as DispatchLogEntry)]" class="lp-tag">{{ logResult(record as DispatchLogEntry) }}</a-tag>
          <span
            v-else-if="column.key === 'handler'"
            class="lp-inline"
            :title="handlerOf(record as DispatchLogEntry) ? `${handlerOf(record as DispatchLogEntry)!.name} ${handlerOf(record as DispatchLogEntry)!.staffNo}` : undefined"
          >
            <template v-if="handlerOf(record as DispatchLogEntry)">
              <span class="lp-ellipsis">{{ handlerOf(record as DispatchLogEntry)!.name }}</span>
              <span class="lp-sep lp-mono">{{ handlerOf(record as DispatchLogEntry)!.staffNo }}</span>
            </template>
            <span v-else class="lp-none">—</span>
          </span>
          <div
            v-else-if="column.key === 'summary'"
            class="lp-summary"
            :title="logSummary(record as DispatchLogEntry)"
          >
            <span class="lp-summary-text">{{ logSummary(record as DispatchLogEntry) }}</span>
            <a-tag v-if="record.overCap" :color="record.overCap === '超额指派' ? 'red' : 'orange'" class="lp-tag">{{ record.overCap }}</a-tag>
          </div>
          <a-button v-else-if="column.key === 'action'" type="link" size="small" class="lp-link" @click="openDetail(record as DispatchLogEntry)">详情</a-button>
        </template>
      </a-table>
      </div>
    </section>

    <DispatchLogDetailDrawer v-model:open="detailOpen" :log="detailLog" />
  </div>
</template>

<style scoped>
.lp { min-width: 0; }

.lp-shell {
  padding: 16px 20px 12px;
  margin-bottom: 0;
}

.lp-filter-panel {
  padding: 14px 16px 12px;
  background: #f8fafc;
  border: 1px solid #eef2f7;
  border-radius: 10px;
}
.lp-filter-grid {
  display: grid;
  grid-template-columns: minmax(200px, 1fr) minmax(320px, 1.45fr) minmax(200px, 1fr) minmax(180px, 0.95fr) auto;
  gap: 10px 16px;
  align-items: center;
}
.lp-filter-more {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px 16px;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid #e8ecf1;
}
.lp-cell {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 8px;
  min-width: 0;
  margin: 0;
}
.lp-cell-range { min-width: 0; }
.lp-cell-actions {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: wrap;
}
.lp-label {
  flex: none;
  font-size: 13px;
  font-weight: 500;
  color: #6b7280;
  line-height: 20px;
  white-space: nowrap;
}
.lp-filter-tip { margin: 10px 0 0; font-size: 12px; color: #c9cdd4; line-height: 18px; }

.lp-action-btns { display: flex; align-items: center; gap: 8px; flex: none; flex-wrap: nowrap; }
.lp-more.ant-btn {
  height: auto;
  padding: 0 2px;
  font-size: 13px;
  line-height: 20px;
}
.lp-more :deep(.anticon) { font-size: 11px; margin-inline-start: 2px; }

.lp-ctl { flex: 1; min-width: 0; width: auto; }
.lp-ctl :deep(.ant-select-selector),
.lp-ctl :deep(.ant-picker),
.lp-ctl :deep(.ant-input-affix-wrapper) {
  border-radius: 8px !important;
  border-color: #e5e7eb !important;
  background: #fff !important;
  font-size: 13px !important;
}
.lp-ctl :deep(.ant-select-selector),
.lp-ctl :deep(.ant-picker) {
  min-height: 32px !important;
  padding-inline: 11px !important;
  align-items: center;
}
.lp-ctl :deep(.ant-input-affix-wrapper) { padding-inline: 11px !important; }
.lp-ctl :deep(.ant-input-affix-wrapper > input.ant-input) { font-size: 13px !important; }
.lp-ctl :deep(.ant-select-selection-item),
.lp-ctl :deep(.ant-select-selection-placeholder) {
  font-size: 13px !important;
  line-height: 30px !important;
}
.lp-ctl :deep(.ant-picker-input > input) { font-size: 13px !important; }

.lp-table-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin: 16px 0 10px;
  min-height: 28px;
}
.lp-table-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: #1f2329;
  line-height: 22px;
  padding-left: 10px;
  border-left: 3px solid #1a6fff;
}
.lp-table-tail { display: flex; align-items: center; gap: 12px; flex: none; }
.wb-toolbar__btn {
  display: inline-flex; align-items: center; gap: 4px; height: 28px;
  padding: 0 10px; background: #fff; border: 1px solid #d1d5db; border-radius: 6px;
  font-size: 12px; color: #374151; cursor: pointer; user-select: none; white-space: nowrap; flex: none;
}
.wb-toolbar__btn .anticon { font-size: 13px !important; }
.wb-toolbar__btn:hover { border-color: #1a6fff; }
.wb-toolbar__btn--export { color: #374151; }
.wb-toolbar__btn--export.is-disabled {
  color: #bfbfbf; background: #f5f5f5; border-color: #d9d9d9; cursor: not-allowed;
}
.wb-toolbar__btn--export.is-disabled:hover { border-color: #d9d9d9; }
.lp-table-meta { font-size: 13px; color: #86909c; }
.lp-table-meta b {
  font-weight: 600;
  color: #1f2329;
  font-variant-numeric: tabular-nums;
}

.lp-table-inner { border-radius: 8px; }
.lp-table-inner :deep(.ant-table-thead > tr > th) { background: #f3f4f6; color: #6b7280; font-size: 12px; font-weight: 600; }
.lp-table-inner :deep(.ant-table-tbody > tr > td) {
  vertical-align: middle;
  padding-top: 10px !important;
  padding-bottom: 10px !important;
}
.lp-table-inner :deep(.ant-table-cell-ellipsis) { white-space: nowrap; }
.lp-table-inner :deep(.ant-pagination) { margin: 12px 16px !important; }
.lp-time { font-variant-numeric: tabular-nums; color: #374151; white-space: nowrap; font-size: 13px; }
.lp-inline {
  display: inline-flex; align-items: center; gap: 8px;
  max-width: 100%; min-width: 0; font-size: 13px; color: #111827;
}
.lp-ellipsis { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lp-mono { font-variant-numeric: tabular-nums; }
.lp-sep { flex: none; font-size: 12px; color: #9ca3af; white-space: nowrap; }
.lp-none { color: #9ca3af; }
.lp-tag { margin-inline-end: 0; flex: none; }
.lp-summary {
  display: flex; align-items: center; gap: 8px;
  min-width: 0; color: #374151; font-size: 13px; white-space: nowrap; overflow: hidden;
}
.lp-summary-text { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.lp-link.ant-btn { padding-inline: 0; }

@media (max-width: 1100px) {
  .lp-filter-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .lp-cell-actions {
    grid-column: 1 / -1;
    justify-content: space-between;
  }
  .lp-filter-more { grid-template-columns: 1fr; }
}
</style>
