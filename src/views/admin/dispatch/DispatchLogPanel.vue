<script setup lang="ts">
// 派单日志（PRD 8.6 / 附录 A.1）：按工单号、判定时间（最长 31 天）、归属池、结果筛选，更多筛选含坐席、判定路径、未派出原因；点「详情」看判定过程
import { computed, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { message } from 'ant-design-vue';
import { DownOutlined, SearchOutlined, UpOutlined } from '@ant-design/icons-vue';
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

const PATHS: DispatchPath[] = ['直派规则', '原处理人', '加权评分', '排队', '留池'];
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

const moreOpen = ref(false);
const moreCount = computed(() => [f.agents, f.paths, f.fails].filter((x) => x.length).length);

function query() {
  const [a, b] = f.range;
  if (b.diff(a, 'day', true) > 31) { message.error('查询范围最长 31 天'); return; }
  applied.value = snapshot();
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

const cols = [
  { title: '判定时间', dataIndex: 'at', key: 'at', width: 148 },
  { title: '工单号', key: 'ticket', width: 178 },
  { title: '归属池', key: 'pool', width: 150 },
  { title: '结果', key: 'result', width: 98 },
  { title: '处理人', key: 'handler', width: 92 },
  { title: '说明', key: 'summary' },
  { title: '操作', key: 'action', width: 60 },
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
  if (!rows.value.length) { message.warning('暂无派单记录'); return; }
  const head = ['判定时间', '工单号', '判定序号', '触发类型', '归属池', '入池规则', '全局派单方式', '归属池派单方式', '结果', '判定路径', '可接单人数', '中选坐席', '综合得分', '未派出原因', '标记'];
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = rows.value.map((l) => [
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
  message.success(`已导出 ${rows.value.length} 条派单记录`);
}

defineExpose({ exportCsv });
</script>

<template>
  <div class="lp">
    <section class="block lp-filters">
      <label class="lp-field lp-field-no">
        <span class="lp-label">工单号</span>
        <a-input v-model:value="f.no" placeholder="请输入工单号" allow-clear @press-enter="query" />
      </label>
      <div class="lp-field lp-field-range">
        <span class="lp-label">判定时间</span>
        <a-range-picker v-model:value="f.range" show-time format="YYYY-MM-DD HH:mm" :allow-clear="false" />
      </div>
      <div class="lp-field">
        <span class="lp-label">归属池</span>
        <a-select v-model:value="f.pools" mode="multiple" placeholder="全部" :options="poolOpts" option-filter-prop="label" max-tag-count="responsive" />
      </div>
      <div class="lp-field">
        <span class="lp-label">结果</span>
        <a-select v-model:value="f.results" mode="multiple" placeholder="全部" :options="resultOpts" option-filter-prop="label" max-tag-count="responsive" />
      </div>
      <template v-if="moreOpen">
        <div class="lp-field">
          <span class="lp-label">坐席</span>
          <a-select v-model:value="f.agents" mode="multiple" placeholder="全部" :options="agentOpts" show-search option-filter-prop="label" max-tag-count="responsive" />
        </div>
        <div class="lp-field">
          <span class="lp-label">判定路径</span>
          <a-select v-model:value="f.paths" mode="multiple" placeholder="全部" :options="pathOpts" option-filter-prop="label" max-tag-count="responsive" />
        </div>
        <div class="lp-field lp-field-fail">
          <span class="lp-label">未派出原因</span>
          <a-select v-model:value="f.fails" mode="multiple" placeholder="全部" :options="failOpts" option-filter-prop="label" max-tag-count="responsive" />
        </div>
      </template>
      <div class="lp-actions">
        <a-button type="link" class="lp-more" @click="moreOpen = !moreOpen">
          更多筛选<template v-if="moreCount">（{{ moreCount }}）</template>
          <UpOutlined v-if="moreOpen" /><DownOutlined v-else />
        </a-button>
        <a-button @click="reset">重置</a-button>
        <a-button type="primary" @click="query"><template #icon><SearchOutlined /></template>查询</a-button>
      </div>
    </section>

    <section class="block lp-table">
      <a-table
        :columns="cols"
        :data-source="rows"
        row-key="id"
        size="middle"
        table-layout="fixed"
        :pagination="stdPagination()"
        :locale="{ emptyText: '暂无派单记录' }"
      >
        <template #bodyCell="{ column, record }">
          <span v-if="column.key === 'at'" class="lp-time">{{ record.at }}</span>
          <template v-else-if="column.key === 'ticket'">
            <div class="lp-main" :title="record.ticketNo">{{ record.ticketNo }}</div>
            <div class="lp-sub">第 {{ ordinals.get(record.id) ?? record.seq }} 次判定</div>
          </template>
          <template v-else-if="column.key === 'pool'">
            <div class="lp-main" :title="record.poolLabel">{{ record.poolLabel }}</div>
            <div class="lp-sub">{{ record.effectiveMode }}</div>
          </template>
          <a-tag v-else-if="column.key === 'result'" :color="LOG_RESULT_TONE[logResult(record as DispatchLogEntry)]" class="lp-tag">{{ logResult(record as DispatchLogEntry) }}</a-tag>
          <template v-else-if="column.key === 'handler'">
            <template v-if="handlerOf(record as DispatchLogEntry)">
              <div class="lp-main">{{ handlerOf(record as DispatchLogEntry)!.name }}</div>
              <div class="lp-sub">{{ handlerOf(record as DispatchLogEntry)!.staffNo }}</div>
            </template>
            <span v-else class="lp-none">—</span>
          </template>
          <div v-else-if="column.key === 'summary'" class="lp-summary">
            <span>{{ logSummary(record as DispatchLogEntry) }}</span>
            <a-tag v-if="record.overCap" :color="record.overCap === '超额指派' ? 'red' : 'orange'" class="lp-tag">{{ record.overCap }}</a-tag>
          </div>
          <a-button v-else-if="column.key === 'action'" type="link" size="small" class="lp-link" @click="openDetail(record as DispatchLogEntry)">详情</a-button>
        </template>
      </a-table>
    </section>

    <DispatchLogDetailDrawer v-model:open="detailOpen" :log="detailLog" />
  </div>
</template>

<style scoped>
.lp { display: flex; flex-direction: column; gap: 12px; }

.lp-filters { display: flex; flex-wrap: wrap; align-items: center; gap: 12px 20px; }
.lp-field { display: flex; align-items: center; gap: 8px; flex: 1 1 230px; max-width: 320px; min-width: 0; margin: 0; }
.lp-field-no { flex-basis: 240px; }
.lp-field-range { flex: 1 1 400px; max-width: 460px; }
.lp-field-fail { flex-basis: 270px; max-width: 360px; }
.lp-label { flex: none; font-size: 13px; color: #6b7280; white-space: nowrap; }
.lp-field :deep(.ant-input-affix-wrapper),
.lp-field :deep(.ant-select),
.lp-field :deep(.ant-picker) { flex: 1; min-width: 0; width: 100%; }
.lp-actions { display: flex; align-items: center; gap: 8px; margin-left: auto; flex: none; }
.lp-more.ant-btn { padding-inline: 4px; }
.lp-more :deep(.anticon) { font-size: 11px; margin-inline-start: 2px; }

.lp-table { padding-bottom: 4px; }
.lp-table :deep(.ant-table-thead > tr > th) { background: #f3f4f6; color: #6b7280; font-size: 12px; font-weight: 600; }
.lp-table :deep(.ant-table-tbody > tr > td) { vertical-align: middle; }
.lp-time { font-variant-numeric: tabular-nums; color: #374151; white-space: nowrap; }
.lp-main { color: #111827; font-variant-numeric: tabular-nums; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.lp-sub { font-size: 12px; line-height: 18px; color: #9ca3af; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.lp-none { color: #9ca3af; }
.lp-tag { margin-inline-end: 0; }
.lp-summary { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 8px; color: #374151; min-width: 0; overflow-wrap: anywhere; }
.lp-link.ant-btn { padding-inline: 0; }
</style>
