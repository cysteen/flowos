<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { message, Modal } from 'ant-design-vue';
import { PlusOutlined, SearchOutlined, ReloadOutlined } from '@ant-design/icons-vue';
import AdminFormModal from './AdminFormModal.vue';
import type { ListConfig } from '@/config/adminModules';

const props = defineProps<{ config: ListConfig; title: string }>();

const rows = ref<Record<string, unknown>[]>([...props.config.rows]);

// 筛选
const filterState = reactive<Record<string, string>>({});
props.config.filters.forEach((f) => (filterState[f.key] = f.type === 'select' ? '全部' : ''));
const applied = ref<Record<string, string>>({ ...filterState });

const filtered = computed(() =>
  rows.value.filter((r) =>
    props.config.filters.every((f) => {
      const v = applied.value[f.key];
      if (!v || v === '全部') return true;
      const cell = String(r[f.key] ?? '');
      return f.type === 'select' ? cell === v : cell.includes(v);
    }),
  ),
);
function onQuery() {
  applied.value = { ...filterState };
}
function onReset() {
  props.config.filters.forEach((f) => (filterState[f.key] = f.type === 'select' ? '全部' : ''));
  applied.value = { ...filterState };
}

// a-table 列
const columns = computed(() => [
  ...props.config.columns.map((c) => ({ title: c.title, dataIndex: c.key, key: c.key, width: c.width })),
  { title: '操作', key: '__action', width: Math.max(130, props.config.rowActions.length * 60) },
]);
const colKind = (key: string) => props.config.columns.find((c) => c.key === key)?.kind;

// 选择 + 分页
const selectedKeys = ref<(string | number)[]>([]);
const pagination = { pageSize: 10, showSizeChanger: true, showTotal: (t: number) => `共 ${t} 条` };

// 增 / 改
const modalOpen = ref(false);
const editing = ref<Record<string, unknown> | null>(null);
const modalTitle = computed(() => (editing.value ? `编辑${props.config.newLabel.replace('新增', '').replace('新建', '')}` : props.config.newLabel));

function onNew() {
  editing.value = null;
  modalOpen.value = true;
}
function onAction(label: string, record: Record<string, unknown>) {
  if (label === '编辑') {
    editing.value = record;
    modalOpen.value = true;
  } else if (label === '删除') {
    Modal.confirm({
      title: '确认删除',
      content: `确定删除「${record[props.config.columns[1]?.key] ?? ''}」？删除后不可恢复。`,
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: () => {
        rows.value = rows.value.filter((r) => r[props.config.rowKey] !== record[props.config.rowKey]);
        message.success('已删除');
      },
    });
  } else {
    message.info(`「${label}」（占位，后续接抽屉/弹窗）`);
  }
}
function onSubmit(values: Record<string, unknown>) {
  if (editing.value) {
    Object.assign(editing.value, values);
    message.success('已保存');
  } else {
    rows.value = [{ ...values, [props.config.rowKey]: values[props.config.rowKey] ?? `NEW-${rows.value.length + 1}`, status: values.status || '启用', createdAt: '2026-06-17 12:00' }, ...rows.value];
    message.success('已创建');
  }
}
function toggleStatus(record: Record<string, unknown>) {
  const next = record.status === '启用' ? '停用' : '启用';
  Modal.confirm({
    title: '状态变更',
    content: `确定${next}「${record[props.config.columns[1]?.key] ?? ''}」？`,
    onOk: () => {
      record.status = next;
      message.success(`已${next}`);
    },
  });
}
function onBatchDelete() {
  rows.value = rows.value.filter((r) => !selectedKeys.value.includes(r[props.config.rowKey] as string | number));
  message.success(`已批量删除 ${selectedKeys.value.length} 项`);
  selectedKeys.value = [];
}
</script>

<template>
  <div class="admin-list">
    <!-- 筛选卡 -->
    <div class="filter-card">
      <div class="filters">
        <div v-for="f in config.filters" :key="f.key" class="filter-item">
          <span class="filter-label">{{ f.label }}</span>
          <a-input
            v-if="f.type === 'text'"
            v-model:value="filterState[f.key]"
            :placeholder="f.placeholder || '请输入'"
            allow-clear
            style="width: 160px"
            @press-enter="onQuery"
          />
          <a-select
            v-else
            v-model:value="filterState[f.key]"
            style="width: 140px"
            :options="(f.options || []).map((o) => ({ value: o, label: o }))"
          />
        </div>
      </div>
      <div class="filter-actions">
        <a-button type="primary" @click="onQuery"><template #icon><SearchOutlined /></template>查询</a-button>
        <a-button @click="onReset"><template #icon><ReloadOutlined /></template>重置</a-button>
      </div>
    </div>

    <!-- 表格卡 -->
    <div class="table-card">
      <div class="toolbar">
        <div class="tb-left">
          <span class="tb-title">{{ title }}</span>
          <span class="tb-count">共 {{ filtered.length }} 条</span>
        </div>
        <div class="tb-right">
          <a-button type="primary" @click="onNew"><template #icon><PlusOutlined /></template>{{ config.newLabel }}</a-button>
          <a-button :disabled="selectedKeys.length === 0" danger @click="onBatchDelete">批量删除 ({{ selectedKeys.length }})</a-button>
        </div>
      </div>

      <a-table
        :columns="columns"
        :data-source="filtered"
        :row-key="config.rowKey"
        :pagination="pagination"
        :row-selection="{ selectedRowKeys: selectedKeys, onChange: (k: (string|number)[]) => (selectedKeys = k) }"
        size="middle"
      >
        <template #bodyCell="{ column, record, text }">
          <template v-if="column.key === '__action'">
            <span
              v-for="a in config.rowActions"
              :key="a"
              class="act"
              :class="{ danger: a === '删除', primary: a === '编辑' }"
              @click="onAction(a, record)"
            >{{ a }}</span>
          </template>
          <span v-else-if="colKind(column.key) === 'link'" class="cell-link">{{ text }}</span>
          <a-tag v-else-if="colKind(column.key) === 'tag'" :color="text === '内置' ? 'blue' : 'default'">{{ text }}</a-tag>
          <span v-else-if="colKind(column.key) === 'tags'">
            <a-tag v-for="t in (text as string[])" :key="t" color="blue" style="margin-bottom: 2px">{{ t }}</a-tag>
          </span>
          <span
            v-else-if="colKind(column.key) === 'status'"
            class="status"
            :class="text === '启用' ? 'on' : 'off'"
            @click="toggleStatus(record)"
          >● {{ text }}</span>
          <template v-else>{{ text }}</template>
        </template>
      </a-table>
    </div>

    <AdminFormModal
      v-model:open="modalOpen"
      :title="modalTitle"
      :fields="config.formFields"
      :initial="editing"
      @submit="onSubmit"
    />
  </div>
</template>

<style scoped>
.admin-list { display: flex; flex-direction: column; gap: 16px; padding: 20px 24px; }

.filter-card {
  background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px;
  display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap;
}
.filters { display: flex; gap: 16px; flex-wrap: wrap; }
.filter-item { display: flex; align-items: center; gap: 8px; }
.filter-label { font-size: 12px; color: #6b7280; white-space: nowrap; }
.filter-actions { display: flex; gap: 8px; }

.table-card { background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; }
.toolbar { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; border-bottom: 1px solid #e5e7eb; }
.tb-left { display: flex; align-items: baseline; gap: 10px; }
.tb-title { font-size: 14px; font-weight: 600; color: #111827; }
.tb-count { font-size: 12px; color: #9ca3af; }
.tb-right { display: flex; gap: 8px; }

.act { font-size: 13px; color: #6b7280; cursor: pointer; margin-right: 12px; white-space: nowrap; }
.act.primary { color: #1a6fff; }
.act.danger { color: #ef4444; }
.act:hover { opacity: 0.7; }

.cell-link { color: #1a6fff; cursor: pointer; }
.status { cursor: pointer; font-size: 13px; }
.status.on { color: #10b981; }
.status.off { color: #9ca3af; }

:deep(.ant-table) { padding: 0 4px; }
:deep(.ant-table-thead > tr > th) { background: #f3f4f6; color: #6b7280; font-size: 12px; font-weight: 600; }
</style>
