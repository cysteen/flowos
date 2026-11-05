<script setup lang="ts">
// 派单策略 · 入池规则（PRD 3.3）：按优先级升序；表尾固定默认池行（综合处理组池，不可删除、不可停用）
import { computed, nextTick, reactive, ref, watch } from 'vue';
import { message, Modal } from 'ant-design-vue';
import { InboxOutlined, PlusOutlined } from '@ant-design/icons-vue';
import { stdPagination } from '@/config/adminUi';
import { useDispatchStore } from '@/stores/dispatch';
import { DEFAULT_POOL_ID, type PoolRule } from '@/views/tickets/types/dispatch';
import { condItems } from './dispatchUi';
import PoolRuleModal from './PoolRuleModal.vue';
import './dispatchTheme.css';

const props = defineProps<{ focusId?: string }>();
const store = useDispatchStore();

const rows = computed(() => [...store.rules].sort((a, b) => a.priority - b.priority));
const enabledCount = computed(() => rows.value.filter((r) => r.enabled).length);

/* ---------------- 筛选：点查询生效；统计保持全量 ---------------- */
const TYPE_ANY = '不限';
const STATUS_OPTS = [{ value: 'on', label: '启用' }, { value: 'off', label: '停用' }];
const emptyFilter = () => ({
  name: '',
  poolId: undefined as string | undefined,
  status: undefined as string | undefined,
  ticketType: undefined as string | undefined,
});
const currentPage = ref(1);
const pageSize = ref(10);
const draft = reactive(emptyFilter());
const applied = ref(emptyFilter());
function query() { applied.value = { ...draft }; currentPage.value = 1; }
function reset() { Object.assign(draft, emptyFilter()); query(); }
const poolOpts = computed(() => store.pools.map((p) => ({ value: p.id, label: p.status === '启用' ? p.name : `${p.name}（已停用）` })));
const typeOpts = computed(() => [TYPE_ANY, ...new Set(store.rules.flatMap((r) => r.conditions.ticketTypes))].map((v) => ({ value: v, label: v })));
const filteredRows = computed(() => {
  const q = applied.value;
  const kw = q.name.trim().toLowerCase();
  return rows.value.filter((r) => {
    if (kw && !r.name.toLowerCase().includes(kw)) return false;
    if (q.poolId && r.poolId !== q.poolId) return false;
    if (q.status && r.enabled !== (q.status === 'on')) return false;
    if (q.ticketType === TYPE_ANY && r.conditions.ticketTypes.length) return false;
    if (q.ticketType && q.ticketType !== TYPE_ANY && !r.conditions.ticketTypes.includes(q.ticketType)) return false;
    return true;
  });
});
const pagination = computed(() => stdPagination({
  current: currentPage.value,
  pageSize: pageSize.value,
  onChange: (page: number, size: number) => { currentPage.value = page; pageSize.value = size; },
}));
/** 停用、删除、筛选后当前页没有数据时退回最后一页 */
watch([() => filteredRows.value.length, pageSize], ([n, size]) => {
  currentPage.value = Math.min(currentPage.value, Math.max(1, Math.ceil(n / size)));
});
const cols = [
  { title: '优先级', dataIndex: 'priority', key: 'priority', width: 80, align: 'center' as const },
  { title: '规则名称', dataIndex: 'name', key: 'name', width: 210 },
  { title: '条件摘要', key: 'cond' },
  { title: '归属池', key: 'pool', width: 150 },
  { title: '状态', key: 'enabled', width: 80 },
  { title: '更新人', dataIndex: 'updatedBy', key: 'updatedBy', width: 90 },
  { title: '更新时间', dataIndex: 'updatedAt', key: 'updatedAt', width: 160 },
  { title: '操作', key: 'op', width: 170, fixed: 'right' as const },
];

const modalOpen = ref(false);
const editing = ref<PoolRule | null>(null);
function openNew() { editing.value = null; modalOpen.value = true; }
function openEdit(r: PoolRule) { editing.value = r; modalOpen.value = true; }

function toggle(r: PoolRule) {
  const res = store.setPoolRuleEnabled(r.id, !r.enabled);
  if (!res.ok) { message.error(res.message); return; }
  message.success(res.message);
}
function remove(r: PoolRule) {
  Modal.confirm({
    title: `删除入池规则「${r.name}」`,
    content: '删除后新工单不再按此规则入池，确定删除？',
    okText: '删除',
    okType: 'danger',
    cancelText: '取消',
    onOk: () => { const res = store.removePoolRule(r.id); if (res.ok) message.success(res.message); },
  });
}

const highlight = ref<string | undefined>(undefined);
function focus(id?: string) {
  if (!id) return;
  highlight.value = id;
  // 目标规则可能在其他页：先翻到它所在页
  const idx = filteredRows.value.findIndex((r) => r.id === id);
  if (idx >= 0) currentPage.value = Math.floor(idx / pageSize.value) + 1;
  nextTick(() => document.querySelector(`[data-row-key="${id}"]`)?.scrollIntoView({ block: 'center', inline: 'start' }));
  window.setTimeout(() => { if (highlight.value === id) highlight.value = undefined; }, 2400);
}
watch(() => props.focusId, (id) => focus(id), { immediate: true });
</script>

<template>
  <section class="inpool-panel">
    <div class="meta-strip pr-strip">
      <div class="meta-chip">
        <span class="meta-chip-val">{{ rows.length }}</span>
        <span class="meta-chip-lb">条规则</span>
      </div>
      <div class="meta-chip">
        <span class="meta-chip-val">{{ enabledCount }}</span>
        <span class="meta-chip-lb">条启用</span>
      </div>
      <span class="meta-hint">按优先级匹配入池</span>
      <div class="pr-filter">
        <label class="pr-cell pr-cell-name">
          <span class="pr-label">规则名称</span>
          <a-input v-model:value="draft.name" size="small" class="pr-ctl" placeholder="关键词" allow-clear @press-enter="query" />
        </label>
        <div class="pr-cell pr-cell-pool">
          <span class="pr-label">归属池</span>
          <a-select v-model:value="draft.poolId" size="small" class="pr-ctl" placeholder="全部" allow-clear :options="poolOpts" :dropdown-match-select-width="false" />
        </div>
        <div class="pr-cell pr-cell-status">
          <span class="pr-label">状态</span>
          <a-select v-model:value="draft.status" size="small" class="pr-ctl" placeholder="全部" allow-clear :options="STATUS_OPTS" :dropdown-match-select-width="false" />
        </div>
        <div class="pr-cell pr-cell-type">
          <span class="pr-label">工单类型</span>
          <a-select v-model:value="draft.ticketType" size="small" class="pr-ctl" placeholder="全部" allow-clear :options="typeOpts" :dropdown-match-select-width="false" />
        </div>
        <div class="pr-btns">
          <a-button size="small" @click="reset">重置</a-button>
          <a-button type="primary" size="small" @click="query">查询</a-button>
        </div>
      </div>
      <div class="meta-actions">
        <a-button type="primary" size="small" @click="openNew"><template #icon><PlusOutlined /></template>规则</a-button>
      </div>
    </div>
    <div class="table-shell">
      <a-table
        :columns="cols"
        :data-source="filteredRows"
        row-key="id"
        size="small"
        :pagination="pagination"
        :scroll="{ x: 1100 }"
        :row-class-name="(r: PoolRule) => (r.id === highlight ? 'pr-focus' : r.enabled ? '' : 'pr-off')"
      >
        <template #bodyCell="{ column, record }">
          <span v-if="column.key === 'priority'" class="pr-prio">{{ record.priority }}</span>
          <b v-else-if="column.key === 'name'" class="pr-name">{{ record.name }}</b>
          <template v-else-if="column.key === 'cond'">
            <div class="pr-cond">
              <span v-for="c in condItems(record.conditions)" :key="c.label" class="pr-chip"><em>{{ c.label }}</em>{{ c.text }}</span>
            </div>
          </template>
          <span v-else-if="column.key === 'pool'" class="pr-pool"><InboxOutlined />{{ store.poolLabel(record.poolId) }}<em v-if="!store.isPoolEnabled(record.poolId)" class="pr-pool-off">已停用</em></span>
          <span v-else-if="column.key === 'enabled'" class="pr-st" :class="{ on: record.enabled }"><i />{{ record.enabled ? '启用' : '停用' }}</span>
          <template v-else-if="column.key === 'op'">
            <a-button type="link" size="small" @click="openEdit(record as PoolRule)">编辑</a-button>
            <a-button type="link" size="small" @click="toggle(record as PoolRule)">{{ record.enabled ? '停用' : '启用' }}</a-button>
            <a-button type="link" size="small" danger @click="remove(record as PoolRule)">删除</a-button>
          </template>
        </template>
        <template #summary>
          <a-table-summary-row class="pr-default">
            <a-table-summary-cell :index="0" align="center"><span class="pr-prio dft">—</span></a-table-summary-cell>
            <a-table-summary-cell :index="1"><b class="pr-name">默认池</b></a-table-summary-cell>
            <a-table-summary-cell :index="2"><span class="pr-muted">未命中任何规则</span></a-table-summary-cell>
            <a-table-summary-cell :index="3"><span class="pr-pool"><InboxOutlined />{{ store.poolLabel(DEFAULT_POOL_ID) }}</span></a-table-summary-cell>
            <a-table-summary-cell :index="4"><span class="pr-st on"><i />启用</span></a-table-summary-cell>
            <a-table-summary-cell :index="5" />
            <a-table-summary-cell :index="6" />
            <a-table-summary-cell :index="7" />
          </a-table-summary-row>
        </template>
      </a-table>
    </div>
    <PoolRuleModal v-model:open="modalOpen" :rule="editing" @saved="focus" />
  </section>
</template>

<style scoped>
.inpool-panel { padding: 0; min-width: 0; }
/* 统计、筛选、新增同一行：宽度不够时只压缩筛选控件；窗口过窄才让筛选整块换行 */
.pr-strip { flex-wrap: nowrap; gap: 4px; }
.pr-strip > .meta-chip, .pr-strip > .meta-hint, .pr-strip > .meta-actions { flex: none; }
.pr-strip > .meta-actions { margin-left: 0; }
.pr-strip > .meta-chip { padding: 2px 6px; white-space: nowrap; }
.pr-strip > .meta-chip .meta-chip-val { font-size: 16px; }
.pr-filter { flex: 1 1 0; min-width: 0; display: flex; align-items: center; justify-content: flex-end; gap: 4px; }
.pr-cell { display: flex; align-items: center; gap: 3px; min-width: 0; margin: 0; }
.pr-cell-name { flex: 1 1 110px; min-width: 101px; max-width: 200px; }
.pr-cell-pool { flex: 1 1 180px; min-width: 110px; max-width: 240px; }
.pr-cell-status { flex: 0.5 0 87px; max-width: 120px; }
.pr-cell-type { flex: 0.5 0 111px; max-width: 144px; }
.pr-label { flex: none; font-size: 12px; color: #6b7280; line-height: 24px; white-space: nowrap; }
.pr-btns { display: flex; align-items: center; gap: 4px; flex: none; }
.pr-ctl { flex: 1; min-width: 0; width: auto; font-size: 12px; }
.pr-ctl :deep(.ant-select-selector) { font-size: 12px !important; }
.pr-ctl :deep(.ant-select-selection-item), .pr-ctl :deep(.ant-select-selection-placeholder) { font-size: 12px !important; }
.pr-ctl.ant-input-affix-wrapper { height: 24px; }
.pr-ctl :deep(input.ant-input) { font-size: 12px; }
@media (max-width: 1100px) {
  .pr-strip { flex-wrap: wrap; }
  .pr-filter { order: 1; flex-basis: 100%; }
}
.pr-cond { display: flex; flex-wrap: wrap; gap: 2px 16px; line-height: 20px; }
.pr-chip { font-size: 12px; color: #111827; }
.pr-chip em { font-style: normal; color: #9ca3af; margin-right: 6px; }
.pr-muted { color: #9ca3af; font-size: 12px; }
.pr-prio { font-variant-numeric: tabular-nums; color: #111827; font-weight: 600; font-size: 12px; }
.pr-prio.dft { color: #9ca3af; font-weight: normal; }
.pr-name { font-weight: 500; color: #111827; font-size: 12px; }
.pr-pool { display: inline-flex; align-items: center; gap: 6px; color: #111827; font-size: 12px; }
.pr-pool :deep(.anticon) { color: #9ca3af; }
.pr-pool-off { font-style: normal; font-size: 11px; line-height: 16px; padding: 0 5px; border-radius: 4px; background: #f3f4f6; color: #6b7280; }
.pr-st { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: #9ca3af; }
.pr-st i { width: 6px; height: 6px; border-radius: 50%; background: #d1d5db; }
.pr-st.on { color: #374151; }
.pr-st.on i { background: #10b981; }
:deep(.pr-off td) { color: #9ca3af; }
:deep(.pr-off .pr-name), :deep(.pr-off .pr-chip), :deep(.pr-off .pr-pool), :deep(.pr-off .pr-prio) { color: #9ca3af; }
:deep(.pr-focus td) { background: #eff6ff !important; transition: background 0.3s; }
:deep(.pr-default td) { background: #fafbfc; }
/* 横向滚动表的测量行只用于定列宽，不占高度 */
.table-shell :deep(.ant-table-measure-row > td) { padding: 0 !important; border: 0 !important; }
</style>
