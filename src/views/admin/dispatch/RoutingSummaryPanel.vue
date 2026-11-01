<script setup lang="ts">
// 路由规则（PRD 14.4）：只读汇总入池规则；行内「去编辑」跳转派单策略 · 入池规则并定位该条
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { useDispatchStore } from '@/stores/dispatch';
import { DEFAULT_POOL_ID } from '@/views/tickets/types/dispatch';
import { condItems } from './dispatchUi';

const store = useDispatchStore();
const router = useRouter();
const rows = computed(() => [...store.rules].sort((a, b) => a.priority - b.priority));
const cols = [
  { title: '优先级', dataIndex: 'priority', key: 'priority', width: 80, align: 'center' as const },
  { title: '规则名称', dataIndex: 'name', key: 'name', width: 220 },
  { title: '条件摘要', key: 'cond' },
  { title: '归属池', key: 'pool', width: 160 },
  { title: '状态', key: 'enabled', width: 80 },
  { title: '操作', key: 'op', width: 90 },
];
function goEdit(id: string) {
  router.push({ path: '/admin/dispatch-strategy', query: { tab: 'inpool', rule: id } });
}
</script>

<template>
  <section class="block">
    <a-table :columns="cols" :data-source="rows" row-key="id" size="middle" :pagination="false">
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'cond'">
          <div class="rs-cond">
            <span v-for="c in condItems(record.conditions)" :key="c.label" class="rs-chip"><em>{{ c.label }}</em>{{ c.text }}</span>
          </div>
        </template>
        <span v-else-if="column.key === 'pool'">{{ store.poolLabel(record.poolId) }}</span>
        <a-tag v-else-if="column.key === 'enabled'" :color="record.enabled ? 'green' : 'default'">{{ record.enabled ? '启用' : '停用' }}</a-tag>
        <a-button v-else-if="column.key === 'op'" type="link" size="small" @click="goEdit(record.id)">去编辑</a-button>
      </template>
      <template #summary>
        <a-table-summary-row class="rs-default">
          <a-table-summary-cell :index="0" align="center">—</a-table-summary-cell>
          <a-table-summary-cell :index="1">默认池</a-table-summary-cell>
          <a-table-summary-cell :index="2"><span class="muted">未命中任何规则</span></a-table-summary-cell>
          <a-table-summary-cell :index="3">{{ store.poolLabel(DEFAULT_POOL_ID) }}</a-table-summary-cell>
          <a-table-summary-cell :index="4"><a-tag color="green">启用</a-tag></a-table-summary-cell>
          <a-table-summary-cell :index="5" />
        </a-table-summary-row>
      </template>
    </a-table>
  </section>
</template>

<style scoped>
.block { background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px 20px; margin-bottom: 16px; }
.rs-cond { display: flex; flex-wrap: wrap; gap: 4px 6px; }
.rs-chip { font-size: 12px; color: #374151; background: #f3f4f6; border-radius: 4px; padding: 1px 6px; line-height: 20px; }
.rs-chip em { font-style: normal; color: #6b7280; margin-right: 4px; }
.muted { color: #9ca3af; font-size: 12px; }
:deep(.rs-default td) { background: #fafafa; }
:deep(.ant-table-thead > tr > th) { background: #f3f4f6; color: #6b7280; font-size: 12px; }
</style>
