<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { message, Modal } from 'ant-design-vue';
import { PlusOutlined, SearchOutlined, ReloadOutlined, AppstoreOutlined } from '@ant-design/icons-vue';
import AdminFormModal from './AdminFormModal.vue';
import type { CardConfig } from '@/config/adminModules';

const props = defineProps<{ config: CardConfig; title: string }>();

const rows = ref<Record<string, unknown>[]>([...props.config.rows]);
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
function onQuery() { applied.value = { ...filterState }; }
function onReset() {
  props.config.filters.forEach((f) => (filterState[f.key] = f.type === 'select' ? '全部' : ''));
  applied.value = { ...filterState };
}

const modalOpen = ref(false);
const editing = ref<Record<string, unknown> | null>(null);
const modalTitle = computed(() => (editing.value ? '编辑' + props.title : props.config.newLabel));

function onNew() { editing.value = null; modalOpen.value = true; }
function onEdit(r: Record<string, unknown>) { editing.value = r; modalOpen.value = true; }
function onToggle(r: Record<string, unknown>) {
  const next = r.status === '启用' ? '停用' : '启用';
  Modal.confirm({ title: '状态变更', content: `确定${next}「${r.name}」？`, onOk: () => { r.status = next; message.success(`已${next}`); } });
}
function onDelete(r: Record<string, unknown>) {
  Modal.confirm({
    title: '确认删除', content: `确定删除「${r.name}」？建议优先停用以保留历史。`, okText: '删除', okType: 'danger', cancelText: '取消',
    onOk: () => { rows.value = rows.value.filter((x) => x.code !== r.code); message.success('已删除'); },
  });
}
function onSubmit(values: Record<string, unknown>) {
  if (editing.value) { Object.assign(editing.value, values); message.success('已保存'); }
  else { rows.value = [{ ...values, status: values.status || '启用' }, ...rows.value]; message.success('已创建'); }
}
</script>

<template>
  <div class="card-grid-page">
    <!-- 筛选卡 -->
    <div class="filter-card">
      <div class="filters">
        <div v-for="f in config.filters" :key="f.key" class="filter-item">
          <span class="filter-label">{{ f.label }}</span>
          <a-input v-if="f.type === 'text'" v-model:value="filterState[f.key]" :placeholder="f.placeholder || '请输入'" allow-clear style="width: 160px" @press-enter="onQuery" />
          <a-select v-else v-model:value="filterState[f.key]" style="width: 140px" :options="(f.options || []).map((o) => ({ value: o, label: o }))" />
        </div>
      </div>
      <div class="filter-actions">
        <a-button type="primary" @click="onQuery"><template #icon><SearchOutlined /></template>查询</a-button>
        <a-button @click="onReset"><template #icon><ReloadOutlined /></template>重置</a-button>
      </div>
    </div>

    <!-- 工具条 + 卡片网格 -->
    <div class="grid-wrap">
      <div class="toolbar">
        <div class="tb-left"><span class="tb-title">{{ title }}</span><span class="tb-count">共 {{ filtered.length }} 个</span></div>
        <a-button type="primary" @click="onNew"><template #icon><PlusOutlined /></template>{{ config.newLabel }}</a-button>
      </div>

      <div class="grid">
        <div v-for="r in filtered" :key="r.code as string" class="ch-card">
          <div class="ch-top">
            <span class="ch-swatch" :style="{ background: (r.color as string) || '#1A6FFF' }"><AppstoreOutlined :style="{ color: '#fff', fontSize: '16px' }" /></span>
            <div class="ch-id">
              <div class="ch-name-row">
                <span class="ch-name">{{ r.name }}</span>
                <span class="ch-status" :class="r.status === '启用' ? 'on' : 'off'">● {{ r.status }}</span>
              </div>
              <div class="ch-sub">
                <span class="ch-type">{{ r.channelType || r.appType }}</span>
                <span class="ch-code">{{ r.code }}</span>
              </div>
            </div>
          </div>
          <div class="ch-meta">
            <template v-if="r.admin !== undefined">管理员：{{ r.admin }}　·　成员 {{ r.memberCount }}</template>
            <template v-else>负责人：{{ r.owner }}</template>
          </div>
          <div class="ch-actions">
            <span class="act primary" @click="onEdit(r)">编辑</span>
            <span class="act" @click="onToggle(r)">{{ r.status === '启用' ? '停用' : '启用' }}</span>
            <span class="act danger" @click="onDelete(r)">删除</span>
          </div>
        </div>
      </div>
    </div>

    <AdminFormModal v-model:open="modalOpen" :title="modalTitle" :fields="config.formFields" :initial="editing" @submit="onSubmit" />
  </div>
</template>

<style scoped>
.card-grid-page { display: flex; flex-direction: column; gap: 16px; padding: 20px 24px; }
.filter-card { background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
.filters { display: flex; gap: 16px; flex-wrap: wrap; }
.filter-item { display: flex; align-items: center; gap: 8px; }
.filter-label { font-size: 12px; color: #6b7280; white-space: nowrap; }
.filter-actions { display: flex; gap: 8px; }

.grid-wrap { background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; }
.toolbar { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; border-bottom: 1px solid #e5e7eb; }
.tb-left { display: flex; align-items: baseline; gap: 10px; }
.tb-title { font-size: 14px; font-weight: 600; color: #111827; }
.tb-count { font-size: 12px; color: #9ca3af; }

.grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; padding: 16px; }
.ch-card { border: 1px solid #e5e7eb; border-radius: 8px; padding: 14px; }
.ch-card:hover { border-color: #1a6fff; box-shadow: 0 2px 8px rgba(26,111,255,0.08); }
.ch-top { display: flex; gap: 10px; }
.ch-swatch { width: 40px; height: 40px; border-radius: 8px; display: flex; align-items: center; justify-content: center; flex: none; }
.ch-id { flex: 1; min-width: 0; }
.ch-name-row { display: flex; align-items: center; justify-content: space-between; }
.ch-name { font-size: 14px; font-weight: 600; color: #111827; }
.ch-status { font-size: 12px; }
.ch-status.on { color: #10b981; }
.ch-status.off { color: #9ca3af; }
.ch-sub { display: flex; align-items: center; gap: 8px; margin-top: 3px; }
.ch-type { font-size: 11px; color: #1a6fff; background: #eff6ff; padding: 1px 6px; border-radius: 3px; }
.ch-code { font-size: 12px; color: #9ca3af; }
.ch-meta { margin-top: 12px; font-size: 12px; color: #6b7280; }
.ch-actions { display: flex; gap: 14px; margin-top: 12px; padding-top: 10px; border-top: 1px solid #f5f5f5; }
.act { font-size: 13px; color: #6b7280; cursor: pointer; }
.act.primary { color: #1a6fff; }
.act.danger { color: #ef4444; }
</style>
