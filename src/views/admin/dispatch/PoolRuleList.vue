<script setup lang="ts">
// 派单策略 · 入池规则（PRD 3.3）：按优先级升序；表尾固定默认池行（综合处理组池，不可删除、不可停用）
import { computed, nextTick, ref, watch } from 'vue';
import { message, Modal } from 'ant-design-vue';
import { InboxOutlined, PlusOutlined } from '@ant-design/icons-vue';
import { useDispatchStore } from '@/stores/dispatch';
import { DEFAULT_POOL_ID, type PoolRule } from '@/views/tickets/types/dispatch';
import { condItems } from './dispatchUi';
import PoolRuleModal from './PoolRuleModal.vue';
import './dispatchTheme.css';

const props = defineProps<{ focusId?: string }>();
const store = useDispatchStore();

const rows = computed(() => [...store.rules].sort((a, b) => a.priority - b.priority));
const enabledCount = computed(() => rows.value.filter((r) => r.enabled).length);
const cols = [
  { title: '优先级', dataIndex: 'priority', key: 'priority', width: 80, align: 'center' as const },
  { title: '规则名称', dataIndex: 'name', key: 'name', width: 210 },
  { title: '条件摘要', key: 'cond' },
  { title: '归属池', key: 'pool', width: 150 },
  { title: '状态', key: 'enabled', width: 80 },
  { title: '更新人', dataIndex: 'updatedBy', key: 'updatedBy', width: 90 },
  { title: '更新时间', dataIndex: 'updatedAt', key: 'updatedAt', width: 160 },
  { title: '操作', key: 'op', width: 170 },
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
  nextTick(() => document.querySelector(`[data-row-key="${id}"]`)?.scrollIntoView({ block: 'center' }));
  window.setTimeout(() => { if (highlight.value === id) highlight.value = undefined; }, 2400);
}
watch(() => props.focusId, (id) => focus(id), { immediate: true });
</script>

<template>
  <section class="inpool-panel">
    <div class="meta-strip">
      <div class="meta-chip">
        <span class="meta-chip-val">{{ rows.length }}</span>
        <span class="meta-chip-lb">条规则</span>
      </div>
      <div class="meta-chip">
        <span class="meta-chip-val">{{ enabledCount }}</span>
        <span class="meta-chip-lb">条启用</span>
      </div>
      <span class="meta-hint">按优先级匹配入池</span>
      <div class="meta-actions">
        <a-button type="primary" size="small" @click="openNew"><template #icon><PlusOutlined /></template>新增入池规则</a-button>
      </div>
    </div>
    <div class="table-shell">
      <a-table
        :columns="cols"
        :data-source="rows"
        row-key="id"
        size="small"
        :pagination="false"
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
          <span v-else-if="column.key === 'pool'" class="pr-pool"><InboxOutlined />{{ store.poolLabel(record.poolId) }}</span>
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
.pr-cond { display: flex; flex-wrap: wrap; gap: 2px 16px; line-height: 20px; }
.pr-chip { font-size: 12px; color: #111827; }
.pr-chip em { font-style: normal; color: #9ca3af; margin-right: 6px; }
.pr-muted { color: #9ca3af; font-size: 12px; }
.pr-prio { font-variant-numeric: tabular-nums; color: #111827; font-weight: 600; font-size: 12px; }
.pr-prio.dft { color: #9ca3af; font-weight: normal; }
.pr-name { font-weight: 500; color: #111827; font-size: 12px; }
.pr-pool { display: inline-flex; align-items: center; gap: 6px; color: #111827; font-size: 12px; }
.pr-pool :deep(.anticon) { color: #9ca3af; }
.pr-st { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: #9ca3af; }
.pr-st i { width: 6px; height: 6px; border-radius: 50%; background: #d1d5db; }
.pr-st.on { color: #374151; }
.pr-st.on i { background: #10b981; }
:deep(.pr-off td) { color: #9ca3af; }
:deep(.pr-off .pr-name), :deep(.pr-off .pr-chip), :deep(.pr-off .pr-pool), :deep(.pr-off .pr-prio) { color: #9ca3af; }
:deep(.pr-focus td) { background: #eff6ff !important; transition: background 0.3s; }
:deep(.pr-default td) { background: #fafbfc; }
</style>
