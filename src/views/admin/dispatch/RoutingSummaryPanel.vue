<script setup lang="ts">
// 路由规则（PRD 14.4）：只读汇总入池规则；行内「去编辑」跳转派单策略 · 入池规则并定位该条
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { useDispatchStore } from '@/stores/dispatch';
import { DEFAULT_POOL_ID } from '@/views/tickets/types/dispatch';
import { condItems } from './dispatchUi';
import './dispatchTheme.css';

const store = useDispatchStore();
const router = useRouter();
const rows = computed(() => [...store.rules].sort((a, b) => a.priority - b.priority));
const enabledCount = computed(() => rows.value.filter((r) => r.enabled).length);
const cols = [
  { title: '规则名', dataIndex: 'name', key: 'name', width: 220 },
  { title: '命中条件', key: 'cond' },
  { title: '目标池', key: 'pool', width: 170 },
  { title: '优先级', dataIndex: 'priority', key: 'priority', width: 90 },
  { title: '状态', key: 'enabled', width: 90 },
  { title: '操作', key: 'op', width: 110 },
];
const rowClass = (r: { enabled: boolean }) => (r.enabled ? '' : 'rs-off');
function goEdit(id: string) {
  router.push({ path: '/admin/dispatch-strategy', query: { tab: 'inpool', rule: id } });
}
function goStrategy() {
  router.push({ path: '/admin/dispatch-strategy', query: { tab: 'inpool' } });
}
</script>

<template>
  <section class="block routing-panel">
    <div class="meta-strip">
      <div class="meta-chip">
        <span class="meta-chip-val">{{ rows.length }}</span>
        <span class="meta-chip-lb">条规则</span>
      </div>
      <div class="meta-chip">
        <span class="meta-chip-val">{{ enabledCount }}</span>
        <span class="meta-chip-lb">条启用</span>
      </div>
      <span class="meta-hint">只读汇总</span>
      <div class="meta-actions">
        <a-button type="link" size="small" @click="goStrategy">前往派单策略编辑 →</a-button>
      </div>
    </div>
    <div class="table-shell">
      <a-table
        :columns="cols"
        :data-source="rows"
        row-key="id"
        size="small"
        :pagination="false"
        :scroll="{ x: 900 }"
        :row-class-name="rowClass"
      >
        <template #bodyCell="{ column, record }">
          <span v-if="column.key === 'name'" class="rs-name">{{ record.name }}</span>
          <template v-else-if="column.key === 'cond'">
            <div class="rs-cond">
              <template v-for="(c, i) in condItems(record.conditions)" :key="c.label">
                <span v-if="i" class="rs-and">且</span>
                <span class="rs-expr">{{ c.label }} ∈ {{ '{' }}{{ c.text.split('、').join(', ') }}{{ '}' }}</span>
              </template>
            </div>
          </template>
          <span v-else-if="column.key === 'pool'" class="rs-pool">{{ store.poolLabel(record.poolId) }}</span>
          <span v-else-if="column.key === 'priority'" class="rs-prio">{{ record.priority }}</span>
          <span v-else-if="column.key === 'enabled'" class="rs-st" :class="{ on: record.enabled }"><i />{{ record.enabled ? '启用' : '停用' }}</span>
          <a-button v-else-if="column.key === 'op'" type="link" size="small" class="rs-go" @click="goEdit(record.id)">去编辑 →</a-button>
        </template>
        <template #summary>
          <a-table-summary-row class="rs-default">
            <a-table-summary-cell :index="0"><span class="rs-name">默认池</span></a-table-summary-cell>
            <a-table-summary-cell :index="1"><span class="rs-expr muted">未命中任何规则</span></a-table-summary-cell>
            <a-table-summary-cell :index="2"><span class="rs-pool">{{ store.poolLabel(DEFAULT_POOL_ID) }}</span></a-table-summary-cell>
            <a-table-summary-cell :index="3"><span class="rs-prio dft">兜底</span></a-table-summary-cell>
            <a-table-summary-cell :index="4"><span class="rs-st on"><i />启用</span></a-table-summary-cell>
            <a-table-summary-cell :index="5" />
          </a-table-summary-row>
        </template>
      </a-table>
    </div>
  </section>
</template>

<style scoped>
.routing-panel { padding: 16px 20px 18px; }
.rs-name { color: #111827; font-weight: 500; font-size: 12px; }
.rs-cond { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 8px; line-height: 20px; }
.rs-expr { color: #4b5563; font-size: 12px; }
.rs-and { color: #9ca3af; font-size: 12px; }
.rs-pool { color: #111827; font-size: 12px; }
.rs-prio { color: #111827; font-weight: 600; font-variant-numeric: tabular-nums; font-size: 12px; }
.rs-prio.dft { color: #9ca3af; font-weight: normal; }
.rs-st { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: #9ca3af; }
.rs-st i { width: 6px; height: 6px; border-radius: 50%; background: #d1d5db; }
.rs-st.on { color: #374151; }
.rs-st.on i { background: #10b981; }
.rs-go { padding: 0; height: auto; font-size: 12px; }
.muted { color: #9ca3af; }
:deep(.rs-off td), :deep(.rs-off .rs-name), :deep(.rs-off .rs-expr), :deep(.rs-off .rs-pool), :deep(.rs-off .rs-prio) { color: #9ca3af; }
:deep(.rs-default td) { background: #fafbfc; }
</style>
