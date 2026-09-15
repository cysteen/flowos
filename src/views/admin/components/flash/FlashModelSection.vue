<script setup lang="ts">
/** 刷机配置 · 支持刷机机型（PRD §10.2） */
import { computed, reactive, ref } from 'vue';
import { message, Modal } from 'ant-design-vue';
import OpActionModal from '@/views/tickets/components/operation/OpActionModal.vue';
import { stdPagination, toneOf } from '@/config/adminUi';
import { useFlashConfigStore } from '@/stores/flashConfig';
import { FLASH_MODEL_SEED, type FlashModel } from '@/mock/flash/models';
import {
  FLASH_PRODUCT_CATEGORIES, productCategoryOf, productMetaOf, productNamesOf,
} from './flashConfigCatalog';

const config = useFlashConfigStore();

const SEED_IDS = new Set(FLASH_MODEL_SEED.map((m) => m.id));

/** 按新增时间倒序：后台新增的机型在上（新的在前），出厂清单在下 */
const rows = computed(() => {
  const added = config.models.filter((m) => !SEED_IDS.has(m.id)).reverse();
  const seeded = config.models.filter((m) => SEED_IDS.has(m.id));
  return [...added, ...seeded].map((m) => ({ ...m, category: productCategoryOf(m.model) }));
});

const cols = [
  { title: '机型名称', dataIndex: 'model', key: 'model' },
  { title: '产品分类', dataIndex: 'category', key: 'category', width: 140 },
  { title: '自研·支持线上自助推送', key: 'self', width: 200 },
  { title: '状态', key: 'status', width: 100 },
  { title: '操作', key: 'op', width: 120 },
];

const page = reactive({ current: 1, pageSize: 10 });
const pagination = computed(() => stdPagination({
  current: page.current,
  pageSize: page.pageSize,
  total: rows.value.length,
  onChange: (p: number, s: number) => { page.current = p; page.pageSize = s; },
}));

function toggleSelf(m: FlashModel, v: boolean) {
  config.upsertModel({ ...m, selfDeveloped: v });
  message.success('已保存');
}

function disable(m: FlashModel) {
  Modal.confirm({
    title: `确认停用${m.model}？`,
    okText: '确认停用',
    okType: 'danger',
    cancelText: '取消',
    onOk: () => {
      config.upsertModel({ ...m, enabled: false });
      message.success('已停用');
    },
  });
}

function enable(m: FlashModel) {
  config.upsertModel({ ...m, enabled: true });
  message.success('已启用');
}

/* ---------------- 新增 / 编辑弹窗 ---------------- */

const open = ref(false);
const editing = ref<FlashModel | null>(null);
const form = reactive({ category: undefined as string | undefined, model: undefined as string | undefined, selfDeveloped: false });
const errors = reactive({ category: '', model: '' });

const categoryOptions = FLASH_PRODUCT_CATEGORIES.map((c) => ({ value: c, label: c }));
const modelOptions = computed(() => productNamesOf(form.category).map((n) => ({ value: n, label: n })));

function resetErrors() { errors.category = ''; errors.model = ''; }

function openCreate() {
  editing.value = null;
  form.category = undefined;
  form.model = undefined;
  form.selfDeveloped = false;
  resetErrors();
  open.value = true;
}

function openEdit(m: FlashModel) {
  editing.value = m;
  form.category = productCategoryOf(m.model);
  form.model = m.model;
  form.selfDeveloped = m.selfDeveloped;
  resetErrors();
  open.value = true;
}

function onCategoryChange() {
  form.model = undefined;
  errors.category = '';
}

function save() {
  if (editing.value) {
    config.upsertModel({ ...editing.value, selfDeveloped: form.selfDeveloped });
    message.success('已保存');
    open.value = false;
    return;
  }
  resetErrors();
  if (!form.category) errors.category = '请选择产品分类';
  if (!form.model) errors.model = '请选择机型名称';
  if (errors.category || errors.model) return;
  if (config.models.some((m) => m.model === form.model)) {
    errors.model = '该机型已添加';
    return;
  }
  const meta = productMetaOf(form.model!);
  config.upsertModel({
    id: `FM-${Date.now()}`,
    model: form.model!,
    brand: meta.brand,
    selfDeveloped: form.selfDeveloped,
    enabled: true,
    minRomVersion: meta.minRomVersion,
  });
  page.current = 1;
  message.success('已保存');
  open.value = false;
}

defineExpose({ openCreate });
</script>

<template>
  <section class="fc-section">
    <div class="fc-head">
      <span class="fc-title">支持刷机机型</span>
    </div>
    <a-table
      :columns="cols"
      :data-source="rows"
      row-key="id"
      size="middle"
      :pagination="pagination"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'self'">
          <a-switch
            :checked="record.selfDeveloped"
            size="small"
            @change="(v: boolean | string | number) => toggleSelf(record as FlashModel, !!v)"
          />
        </template>
        <template v-else-if="column.key === 'status'">
          <a-tag :color="toneOf(record.enabled ? '启用' : '停用')">{{ record.enabled ? '启用' : '停用' }}</a-tag>
        </template>
        <template v-else-if="column.key === 'op'">
          <a-button type="link" size="small" class="fc-act" @click="openEdit(record as FlashModel)">编辑</a-button>
          <a-button
            v-if="record.enabled"
            type="link"
            size="small"
            danger
            class="fc-act"
            @click="disable(record as FlashModel)"
          >停用</a-button>
          <a-button v-else type="link" size="small" class="fc-act" @click="enable(record as FlashModel)">启用</a-button>
        </template>
      </template>
    </a-table>

    <OpActionModal
      v-model:open="open"
      :title="editing ? '编辑机型' : '新增机型'"
      ok-text="保存"
      @ok="save"
    >
      <div class="op-form">
        <div class="op-field">
          <span class="op-label req">产品分类</span>
          <a-select
            v-model:value="form.category"
            :options="categoryOptions"
            :disabled="!!editing"
            placeholder="请选择"
            :status="errors.category ? 'error' : undefined"
            @change="onCategoryChange"
          />
          <span v-if="errors.category" class="fc-err">{{ errors.category }}</span>
        </div>
        <div class="op-field">
          <span class="op-label req">机型名称</span>
          <a-select
            v-model:value="form.model"
            :options="modelOptions"
            :disabled="!!editing"
            show-search
            placeholder="请选择"
            :status="errors.model ? 'error' : undefined"
            @change="errors.model = ''"
          />
          <span v-if="errors.model" class="fc-err">{{ errors.model }}</span>
        </div>
        <div class="fc-switch-row">
          <span class="op-label">自研 · 支持线上自助推送</span>
          <a-switch v-model:checked="form.selfDeveloped" size="small" />
        </div>
      </div>
    </OpActionModal>
  </section>
</template>

<style scoped src="./flashSection.css"></style>
