<script setup lang="ts">
// 派单日志查询（PRD 13.1 / 14.1）：按工单号、判定时间（最长 31 天）、坐席、归属池、判定路径、失败原因筛选；可展开看判定明细
import { computed, reactive, ref, watch } from 'vue';
import { message } from 'ant-design-vue';
import { DownloadOutlined, SearchOutlined } from '@ant-design/icons-vue';
import dayjs, { type Dayjs } from 'dayjs';
import { useDispatchStore } from '@/stores/dispatch';
import { stdPagination } from '@/config/adminUi';
import {
  GATE_ORDER, RELAX_LEVEL_LABEL, type DispatchFailReason, type DispatchLogEntry, type DispatchPath, type ScoreFactorKey,
} from '@/views/tickets/types/dispatch';
import { PRIORITY_LEVEL } from '@/views/tickets/types/dispatch';
import { MODE_TONE, opts } from './dispatchUi';
import { parseAt, trialActualOf } from './dispatchMetrics';

const props = defineProps<{ open: boolean; ticketNo?: string }>();
const emit = defineEmits<{ 'update:open': [v: boolean] }>();
const store = useDispatchStore();

/**
 * 试运行建议的实际处理人 / 是否一致（与上线阶段匹配率同口径，即时计算）：
 * 判定记录取建议之后首次人工拿单的坐席，无则取工单当前处理人；人工记录即本条拿单坐席。
 */
function trialOf(l: Partial<Pick<DispatchLogEntry, 'trial' | 'kind' | 'manual' | 'ticketNo' | 'seq'>>): { suggested: string | null; actual: string | null; same: boolean } | null {
  if (!l.trial) return null;
  const suggested = l.trial.suggested ?? null;
  const actual = l.kind === '人工' ? l.manual?.target ?? l.trial.actual ?? null : trialActualOf(store.logs, l.ticketNo ?? '', l.seq ?? 0);
  return { suggested, actual, same: !!suggested && suggested === actual };
}

const PATHS: DispatchPath[] = ['直派规则', '原处理人', '加权评分', '预留', '排队', '组内放宽', '兜底回池', '留池'];
const FAILS: DispatchFailReason[] = ['无画像匹配成员', '无在班成员', '均达个人上限', '引擎异常', '首响已超时'];
const FACTOR_LABEL: Record<ScoreFactorKey, string> = { load: '负载', proficiency: '熟练度', urgency: '紧急度', recent: '近 N 小时接单量', idle: '空闲时长' };

const f = reactive<{ no: string; range: [Dayjs, Dayjs]; agents: string[]; pools: string[]; paths: DispatchPath[]; fails: DispatchFailReason[] }>({
  no: '', range: [dayjs().subtract(24, 'hour'), dayjs()], agents: [], pools: [], paths: [], fails: [],
});
const applied = ref({ ...f, range: [...f.range] as [Dayjs, Dayjs] });

function resetFilters() {
  Object.assign(f, { no: props.ticketNo ?? '', range: [dayjs().subtract(24, 'hour'), dayjs()], agents: [], pools: [], paths: [], fails: [] });
}
watch(() => props.open, (v) => {
  if (!v) return;
  resetFilters();
  if (props.ticketNo) f.range = [dayjs().subtract(30, 'day'), dayjs()];
  query();
});

function query() {
  const [a, b] = f.range ?? [];
  if (a && b && b.diff(a, 'day', true) > 31) { message.error('查询范围最长 31 天'); return; }
  applied.value = { ...f, range: [...f.range] as [Dayjs, Dayjs], agents: [...f.agents], pools: [...f.pools], paths: [...f.paths], fails: [...f.fails] };
}

const agentOpts = computed(() => store.agents.map((a) => ({ value: a.name, label: `${a.name}（${a.staffNo}）` })));
const poolOpts = computed(() => store.groups.map((g) => ({ value: g.id, label: store.poolLabel(g.id) })));

function personOf(l: DispatchLogEntry): string | undefined {
  return l.kind === '人工' ? l.manual?.target : l.chosen?.name;
}

const rows = computed(() => {
  const q = applied.value;
  const from = q.range?.[0]?.valueOf() ?? -Infinity;
  const to = q.range?.[1]?.valueOf() ?? Infinity;
  return store.logs.filter((l) => {
    if (q.no.trim() && l.ticketNo !== q.no.trim()) return false;
    const t = parseAt(l.at);
    if (t < from || t > to) return false;
    if (q.agents.length && !q.agents.includes(personOf(l) ?? '') && !q.agents.includes(l.trial?.suggested ?? '')) return false;
    if (q.pools.length && !q.pools.includes(l.poolId)) return false;
    if (q.paths.length && !(l.path && q.paths.includes(l.path))) return false;
    if (q.fails.length && !(l.failReason && q.fails.includes(l.failReason))) return false;
    return true;
  }).sort((a, b) => (a.at === b.at ? b.seq - a.seq : a.at < b.at ? 1 : -1));
});

const cols = [
  { title: '判定时间', dataIndex: 'at', key: 'at', width: 150 },
  { title: '工单号', dataIndex: 'ticketNo', key: 'ticketNo', width: 170 },
  { title: '序号', dataIndex: 'seq', key: 'seq', width: 50, align: 'center' as const },
  { title: '触发 / 动作', key: 'trigger', width: 96 },
  { title: '归属池', key: 'pool', width: 170 },
  { title: '派单方式', key: 'mode', width: 90 },
  { title: '判定路径', key: 'path', width: 100 },
  { title: '中选坐席', key: 'chosen', width: 150 },
  { title: '失败原因', key: 'fail', width: 110 },
  { title: '标记', key: 'flag', width: 110 },
];

function gateItems(l: DispatchLogEntry) {
  return GATE_ORDER.filter((g) => l.gateDrops?.[g] != null).map((g) => ({ gate: g, n: l.gateDrops![g]! }));
}
function factorItems(l: DispatchLogEntry) {
  const s = l.chosenScore;
  if (!s) return [];
  return (Object.keys(s.factors) as ScoreFactorKey[]).map((k) => ({ label: FACTOR_LABEL[k], v: s.factors[k].toFixed(2) }));
}
function snapshotItems(l: DispatchLogEntry) {
  const s = l.snapshot;
  return [
    ['业务类型', s.businessType], ['工单类型', s.ticketType], ['产品分类', s.productCategory], ['产品名称', s.product],
    ['问题分类', s.problem], ['工单来源', s.ticketSource], ['客户类型', s.customerType], ['优先级', PRIORITY_LEVEL[s.priority]],
    ['首响 SLA 剩余', s.firstRespRemainMin == null ? '无首响 SLA' : `${s.firstRespRemainMin} 分钟`],
  ].map(([k, v]) => ({ k: k as string, v: (v as string | undefined) || '—' }));
}

function exportCsv() {
  if (!rows.value.length) { message.warning('暂无派单记录'); return; }
  const head = ['判定时间', '工单号', '判定序号', '记录类型', '触发类型', '人工动作', '操作人', '归属池', '入池规则', '全局派单方式', '归属组派单方式', '运行方式', '判定路径', '产品放宽层级', '候选集人数', '中选坐席', '综合得分', '失败原因', '标记', '试运行建议', '实际处理人'];
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = rows.value.map((l) => [
    l.at, l.ticketNo, l.seq, l.kind, l.trigger ?? '', l.manual?.action ?? '', l.manual?.operator ?? '', l.poolLabel, l.ruleName,
    l.globalMode, l.groupMode, l.runMode, l.path ?? '', l.relaxLevel != null ? RELAX_LEVEL_LABEL[l.relaxLevel] : '', l.candidateCount ?? '',
    personOf(l) ?? '', l.chosenScore ? l.chosenScore.total.toFixed(1) : '', l.failReason ?? '', l.overCap ?? '', l.trial?.suggested ?? '', trialOf(l)?.actual ?? '',
  ].map(esc).join(','));
  const blob = new Blob([`﻿${[head.map(esc).join(','), ...lines].join('\r\n')}`], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `派单日志_${dayjs().format('YYYYMMDDHHmmss')}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
  message.success(`已导出 ${rows.value.length} 条派单记录`);
}
</script>

<template>
  <a-drawer :open="open" title="派单日志" :width="1320" placement="right" @update:open="emit('update:open', $event)">
    <div class="lg-filters">
      <a-input v-model:value="f.no" placeholder="工单号" allow-clear style="width: 190px" />
      <a-range-picker v-model:value="f.range" show-time format="YYYY-MM-DD HH:mm" style="width: 330px" :allow-clear="false" />
      <a-select v-model:value="f.agents" mode="multiple" placeholder="坐席" :options="agentOpts" show-search option-filter-prop="label" max-tag-count="responsive" style="width: 180px" />
      <a-select v-model:value="f.pools" mode="multiple" placeholder="归属池" :options="poolOpts" max-tag-count="responsive" style="width: 180px" />
      <a-select v-model:value="f.paths" mode="multiple" placeholder="判定路径" :options="opts(PATHS)" max-tag-count="responsive" style="width: 160px" />
      <a-select v-model:value="f.fails" mode="multiple" placeholder="失败原因" :options="opts(FAILS)" max-tag-count="responsive" style="width: 160px" />
      <a-button type="primary" @click="query"><template #icon><SearchOutlined /></template>查询</a-button>
      <a-button @click="resetFilters(); query()">重置</a-button>
      <a-button class="lg-export" @click="exportCsv"><template #icon><DownloadOutlined /></template>导出</a-button>
    </div>

    <a-table
      :columns="cols"
      :data-source="rows"
      row-key="id"
      size="middle"
      :pagination="stdPagination()"
      :locale="{ emptyText: '暂无派单记录' }"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'trigger'">
          <span v-if="record.kind === '判定'">{{ record.trigger }}</span>
          <span v-else class="lg-manual">{{ record.manual?.action }}</span>
        </template>
        <template v-else-if="column.key === 'pool'">
          <div>{{ record.poolLabel }}</div>
          <div class="lg-sub">{{ record.ruleName }}</div>
        </template>
        <template v-else-if="column.key === 'mode'">
          <a-tag :color="MODE_TONE[record.effectiveMode as keyof typeof MODE_TONE]">{{ record.effectiveMode }}</a-tag>
        </template>
        <template v-else-if="column.key === 'path'">
          <span v-if="record.path">{{ record.path }}</span>
          <span v-else class="lg-sub">—</span>
          <div v-if="record.relaxLevel" class="lg-sub">产品放宽：{{ RELAX_LEVEL_LABEL[record.relaxLevel as 0 | 1 | 2] }}</div>
        </template>
        <template v-else-if="column.key === 'chosen'">
          <template v-if="record.kind === '人工'">
            <span>{{ record.manual?.target ?? '—' }}</span>
            <div class="lg-sub">操作人 {{ record.manual?.operator }}</div>
          </template>
          <template v-else-if="record.chosen">
            <span>{{ record.chosen.name }}</span><span class="lg-sub"> {{ record.chosen.staffNo }}</span>
            <div class="lg-sub">{{ record.chosen.groupLabel }}<template v-if="record.chosenScore"> · {{ record.chosenScore.total.toFixed(1) }} 分</template></div>
          </template>
          <span v-else class="lg-sub">—</span>
        </template>
        <template v-else-if="column.key === 'fail'">
          <span v-if="record.failReason" class="lg-fail">{{ record.failReason }}</span>
          <span v-else class="lg-sub">—</span>
        </template>
        <template v-else-if="column.key === 'flag'">
          <a-tag v-if="record.overCap === '超额指派'" color="red">超额指派</a-tag>
          <a-tag v-else-if="record.overCap === '超限'" color="orange">超限</a-tag>
          <a-tag v-if="record.trial" :color="trialOf(record)?.same ? 'green' : 'default'">试运行</a-tag>
          <span v-if="!record.overCap && !record.trial" class="lg-sub">—</span>
        </template>
      </template>

      <template #expandedRowRender="{ record }">
        <div class="lg-detail">
          <div class="lg-sec">
            <div class="lg-sec-t">门槛淘汰</div>
            <div v-if="gateItems(record as DispatchLogEntry).length" class="lg-kvs">
              <div v-for="g in gateItems(record as DispatchLogEntry)" :key="g.gate" class="lg-kv"><span>{{ g.gate }}</span><b>{{ g.n }} 人</b></div>
              <div class="lg-kv"><span>候选集</span><b>{{ record.candidateCount ?? 0 }} 人</b></div>
            </div>
            <div v-else class="lg-sub">—</div>
          </div>
          <div class="lg-sec">
            <div class="lg-sec-t">得分前三</div>
            <div v-if="record.top3?.length" class="lg-kvs">
              <div v-for="(t, i) in record.top3" :key="t.name" class="lg-kv"><span>{{ i + 1 }}. {{ t.name }}</span><b>{{ t.total.toFixed(1) }}</b></div>
            </div>
            <div v-else class="lg-sub">—</div>
          </div>
          <div class="lg-sec">
            <div class="lg-sec-t">中选得分明细<template v-if="record.chosenScore">（{{ record.chosenScore.name }} · {{ record.chosenScore.total.toFixed(1) }} 分）</template></div>
            <div v-if="factorItems(record as DispatchLogEntry).length" class="lg-kvs">
              <div v-for="x in factorItems(record as DispatchLogEntry)" :key="x.label" class="lg-kv"><span>{{ x.label }}</span><b>{{ x.v }}</b></div>
            </div>
            <div v-else class="lg-sub">—</div>
          </div>
          <div class="lg-sec">
            <div class="lg-sec-t">派单方式</div>
            <div class="lg-kvs">
              <div class="lg-kv"><span>全局</span><b>{{ record.globalMode }}</b></div>
              <div class="lg-kv"><span>归属组</span><b>{{ record.groupMode }}</b></div>
              <div class="lg-kv"><span>运行方式</span><b>{{ record.runMode }}</b></div>
              <template v-if="record.trial">
                <div class="lg-kv"><span>建议处理人</span><b>{{ record.trial.suggested ?? '—' }}</b></div>
                <div class="lg-kv"><span>实际处理人</span><b>{{ trialOf(record)?.actual ?? '—' }}</b></div>
                <div class="lg-kv"><span>是否一致</span><b>{{ trialOf(record)?.same ? '一致' : '不一致' }}</b></div>
              </template>
              <div v-if="record.manual?.reason" class="lg-kv"><span>原因</span><b>{{ record.manual.reason }}</b></div>
            </div>
          </div>
          <div class="lg-sec lg-sec-wide">
            <div class="lg-sec-t">工单快照</div>
            <div class="lg-kvs lg-kvs-grid">
              <div v-for="x in snapshotItems(record as DispatchLogEntry)" :key="x.k" class="lg-kv"><span>{{ x.k }}</span><b>{{ x.v }}</b></div>
            </div>
          </div>
        </div>
      </template>
    </a-table>
  </a-drawer>
</template>

<style scoped>
.lg-filters { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin-bottom: 14px; }
.lg-export { margin-left: auto; }
.lg-sub { font-size: 12px; color: #9ca3af; }
.lg-manual { color: #b45309; }
.lg-fail { color: #dc2626; }
.lg-detail { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; padding: 4px 8px; }
.lg-sec { background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px 12px; }
.lg-sec-wide { grid-column: 1 / -1; }
.lg-sec-t { font-size: 12px; font-weight: 600; color: #111827; padding-left: 8px; border-left: 3px solid #1a6fff; margin-bottom: 8px; }
.lg-kvs { display: flex; flex-direction: column; gap: 4px; }
.lg-kvs-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); column-gap: 24px; }
.lg-kv { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; font-size: 12px; }
.lg-kv span { color: #6b7280; }
.lg-kv b { color: #374151; font-weight: 500; text-align: right; }
:deep(.ant-table-thead > tr > th) { background: #f3f4f6; color: #6b7280; font-size: 12px; }
</style>
