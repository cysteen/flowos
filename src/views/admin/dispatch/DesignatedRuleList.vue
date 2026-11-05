<script setup lang="ts">
// 派单策略 · 指定人规则：按优先级升序；内置规则不可删除；固定人员已停用时行内标「指定人已停用」
import { computed, ref } from 'vue';
import { message, Modal } from 'ant-design-vue';
import { PlusOutlined } from '@ant-design/icons-vue';
import { useDispatchStore } from '@/stores/dispatch';
import type { DesignatedRule } from '@/views/tickets/types/dispatch';
import { condItems } from './dispatchUi';
import DesignatedRuleModal from './DesignatedRuleModal.vue';
import './dispatchTheme.css';

const store = useDispatchStore();

const rows = computed(() => [...store.designatedRules].sort((a, b) => a.priority - b.priority));
const enabledCount = computed(() => rows.value.filter((r) => r.enabled).length);
const cols = [
  { title: '优先级', dataIndex: 'priority', key: 'priority', width: 80, align: 'center' as const },
  { title: '规则名称', dataIndex: 'name', key: 'name', width: 230 },
  { title: '工单条件', key: 'cond' },
  { title: '指定人来源', key: 'target', width: 190 },
  { title: '状态', key: 'enabled', width: 80 },
  { title: '更新人', dataIndex: 'updatedBy', key: 'updatedBy', width: 90 },
  { title: '更新时间', dataIndex: 'updatedAt', key: 'updatedAt', width: 160 },
  { title: '操作', key: 'op', width: 170 },
];

const modalOpen = ref(false);
const editing = ref<DesignatedRule | null>(null);
function openNew() { editing.value = null; modalOpen.value = true; }
function openEdit(r: DesignatedRule) { editing.value = r; modalOpen.value = true; }

function toggle(r: DesignatedRule) {
  const res = store.setDesignatedRuleEnabled(r.id, !r.enabled);
  if (!res.ok) { message.error(res.message); return; }
  message.success(res.message);
}
function remove(r: DesignatedRule) {
  Modal.confirm({
    title: `删除指定人规则「${r.name}」`,
    content: '删除后新工单不再按此规则直接到人，确定删除？',
    okText: '删除',
    okType: 'danger',
    cancelText: '取消',
    onOk: () => { const res = store.removeDesignatedRule(r.id); if (res.ok) message.success(res.message); },
  });
}
function assigneeOff(r: DesignatedRule) {
  return r.source === '固定人员' && !!store.agentOf(r.assignee)?.disabled;
}
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
      <span class="meta-hint">按优先级匹配，直接派给指定人</span>
      <div class="meta-actions">
        <a-button type="primary" size="small" @click="openNew"><template #icon><PlusOutlined /></template>新增指定人规则</a-button>
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
        :locale="{ emptyText: '暂无指定人规则' }"
        :row-class-name="(r: DesignatedRule) => (r.enabled ? '' : 'pr-off')"
      >
        <template #bodyCell="{ column, record }">
          <span v-if="column.key === 'priority'" class="pr-prio">{{ record.priority }}</span>
          <template v-else-if="column.key === 'name'">
            <b class="pr-name">{{ record.name }}</b><em v-if="record.builtin" class="pr-tag">内置</em>
          </template>
          <template v-else-if="column.key === 'cond'">
            <div class="pr-cond">
              <span v-for="c in condItems(record.conditions)" :key="c.label" class="pr-chip"><em>{{ c.label }}</em>{{ c.text }}</span>
            </div>
          </template>
          <span v-else-if="column.key === 'target'" class="pr-target">
            <em>{{ record.source }}</em>{{ record.source === '固定人员' ? record.assignee : record.mapping }}<em v-if="assigneeOff(record as DesignatedRule)" class="pr-tag pr-tag-off">指定人已停用</em>
          </span>
          <span v-else-if="column.key === 'enabled'" class="pr-st" :class="{ on: record.enabled }"><i />{{ record.enabled ? '启用' : '停用' }}</span>
          <template v-else-if="column.key === 'op'">
            <a-button type="link" size="small" @click="openEdit(record as DesignatedRule)">编辑</a-button>
            <a-button type="link" size="small" @click="toggle(record as DesignatedRule)">{{ record.enabled ? '停用' : '启用' }}</a-button>
            <a-button v-if="!record.builtin" type="link" size="small" danger @click="remove(record as DesignatedRule)">删除</a-button>
          </template>
        </template>
      </a-table>
    </div>
    <DesignatedRuleModal v-model:open="modalOpen" :rule="editing" />
  </section>
</template>

<style scoped>
.inpool-panel { padding: 0; min-width: 0; }
.pr-cond { display: flex; flex-wrap: wrap; gap: 2px 16px; line-height: 20px; }
.pr-chip { font-size: 12px; color: #111827; }
.pr-chip em, .pr-target > em:first-child { font-style: normal; color: #9ca3af; margin-right: 6px; }
.pr-prio { font-variant-numeric: tabular-nums; color: #111827; font-weight: 600; font-size: 12px; }
.pr-name { font-weight: 500; color: #111827; font-size: 12px; }
.pr-target { font-size: 12px; color: #111827; }
.pr-tag { margin-left: 6px; font-style: normal; font-size: 11px; line-height: 16px; padding: 0 5px; border-radius: 4px; background: #f3f4f6; color: #6b7280; white-space: nowrap; }
.pr-tag-off { background: #fff1f0; color: #cf1322; }
.pr-st { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: #9ca3af; }
.pr-st i { width: 6px; height: 6px; border-radius: 50%; background: #d1d5db; }
.pr-st.on { color: #374151; }
.pr-st.on i { background: #10b981; }
:deep(.pr-off td) { color: #9ca3af; }
:deep(.pr-off .pr-name), :deep(.pr-off .pr-chip), :deep(.pr-off .pr-target), :deep(.pr-off .pr-prio) { color: #9ca3af; }
</style>
