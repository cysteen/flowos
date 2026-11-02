<script setup lang="ts">
// 路由规则（PRD 14.4）：只读汇总入池规则；行内「去编辑」跳转派单策略 · 入池规则并定位该条
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { useDispatchStore } from '@/stores/dispatch';
import { DEFAULT_POOL_ID } from '@/views/tickets/types/dispatch';
import { condItems } from './dispatchUi';
import DispatchCard from './DispatchCard.vue';

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
</script>

<template>
  <DispatchCard title="入池规则" :sub="`共 ${rows.length} 条 · 启用 ${enabledCount} 条`">
    <a-table :columns="cols" :data-source="rows" row-key="id" size="middle" :pagination="false" :scroll="{ x: 900 }"
      :row-class-name="rowClass">
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
  </DispatchCard>
</template>

<style scoped>
.rs-name { color: #1f2329; font-weight: 500; }
.rs-cond { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 8px; line-height: 22px; }
.rs-expr { color: #4e5969; }
.rs-and { color: #86909c; font-size: 13px; }
.rs-pool { color: #1f2329; }
.rs-prio { color: #1f2329; font-weight: 600; font-variant-numeric: tabular-nums; }
.rs-prio.dft { color: #86909c; font-weight: normal; }
.rs-st { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; color: #86909c; }
.rs-st i { width: 6px; height: 6px; border-radius: 50%; background: #c9cdd4; }
.rs-st.on { color: #4e5969; }
.rs-st.on i { background: #10b981; }
.rs-go { padding: 0; }
.muted { color: #86909c; }
:deep(.rs-off td), :deep(.rs-off .rs-name), :deep(.rs-off .rs-expr), :deep(.rs-off .rs-pool), :deep(.rs-off .rs-prio) { color: #86909c; }
:deep(.rs-default td) { background: #fafafa; }
:deep(.ant-table-thead > tr > th) { background: #f3f4f6; color: #6b7280; font-size: 12px; font-weight: 600; }
</style>
