<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { message } from 'ant-design-vue';
import {
  BookOutlined,
  DeleteOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
  PlusOutlined,
  EditOutlined,
} from '@ant-design/icons-vue';
import OpActionModal from '@/views/tickets/components/operation/OpActionModal.vue';
import {
  usePersonalLinksStore,
  normalizePersonalUrl,
  MAX_TITLE_LEN,
  MAX_URL_LEN,
} from '@/stores/personalLinks';

const open = defineModel<boolean>('open', { required: true });

const store = usePersonalLinksStore();

const editingId = ref<string | null>(null);
const form = reactive({ title: '', url: '' });

watch(open, (v) => {
  if (!v) {
    editingId.value = null;
    form.title = '';
    form.url = '';
  }
});

const atLimit = computed(() => store.links.length >= store.maxLinks);
const titleLen = computed(() => form.title.length);
const urlLen = computed(() => form.url.length);
function startAdd() {
  if (atLimit.value) {
    message.warning(`最多保存 ${store.maxLinks} 条网址`);
    return;
  }
  editingId.value = '__new__';
  form.title = '';
  form.url = '';
}

function startEdit(id: string) {
  const row = store.links.find((l) => l.id === id);
  if (!row) return;
  editingId.value = id;
  form.title = row.title;
  form.url = row.url;
}

function cancelEdit() {
  editingId.value = null;
  form.title = '';
  form.url = '';
}

function submitForm() {
  if (!form.title.trim()) {
    message.warning('请填写名称');
    return;
  }
  if (form.title.trim().length > MAX_TITLE_LEN) {
    message.warning(`名称请控制在 ${MAX_TITLE_LEN} 字以内`);
    return;
  }
  if (!normalizePersonalUrl(form.url)) {
    if (form.url.trim().length > MAX_URL_LEN) {
      message.warning(`网址请控制在 ${MAX_URL_LEN} 字符以内`);
    } else {
      message.warning('请填写以 http:// 或 https:// 开头的有效网址');
    }
    return;
  }
  if (editingId.value === '__new__') {
    const res = store.addLink(form.title, form.url);
    if (!res.ok) {
      if (res.reason === 'limit') message.warning(`最多保存 ${store.maxLinks} 条网址`);
      else message.warning('请检查名称与网址');
      return;
    }
    message.success('已添加');
  } else if (editingId.value) {
    const res = store.updateLink(editingId.value, form.title, form.url);
    if (!res.ok) {
      message.warning('请检查名称与网址');
      return;
    }
    message.success('已保存');
  }
  cancelEdit();
}

function remove(id: string) {
  store.removeLink(id);
  if (editingId.value === id) cancelEdit();
  message.success('已删除');
}

function linkIndex(id: string) {
  return store.links.findIndex((l) => l.id === id);
}
</script>

<template>
  <OpActionModal
    :open="open"
    title="维护个人网址"
    :subtitle="`仅本人可见 · 最多 ${store.maxLinks} 条`"
    :icon="BookOutlined"
    tone="primary"
    :width="560"
    no-footer
    @update:open="open = $event"
  >
    <div class="op-form pl-manage-form">
      <!-- 编辑区 -->
      <section v-if="editingId" class="edit-panel">
        <div class="edit-panel-body">
          <div class="op-field op-field-h">
            <div class="op-label req">名称</div>
            <a-input
              v-model:value="form.title"
              placeholder="如「飞书项目」"
              :maxlength="MAX_TITLE_LEN"
            >
              <template #suffix>
                <span class="inp-count">{{ titleLen }}/{{ MAX_TITLE_LEN }}</span>
              </template>
            </a-input>
          </div>
          <div class="op-field op-field-h">
            <div class="op-label req">网址</div>
            <a-input
              v-model:value="form.url"
              placeholder="https://…"
              :maxlength="MAX_URL_LEN"
              class="url-inp"
            >
              <template #suffix>
                <span class="inp-count">{{ urlLen }}/{{ MAX_URL_LEN }}</span>
              </template>
            </a-input>
          </div>
        </div>
        <div class="edit-panel-foot">
          <a-button size="small" @click="cancelEdit">取消</a-button>
          <a-button type="primary" size="small" @click="submitForm">保存</a-button>
        </div>
      </section>

      <!-- 列表区 -->
      <section class="list-panel">
        <div class="list-panel-head">
          <div class="list-panel-head-left">
            <span class="list-panel-title">已保存链接</span>
            <span class="list-panel-badge">{{ store.links.length }}/{{ store.maxLinks }}</span>
          </div>
          <a-button
            v-if="!editingId"
            type="primary"
            size="small"
            ghost
            :disabled="atLimit"
            @click="startAdd"
          >
            <PlusOutlined />
            添加网址
          </a-button>
        </div>

        <div class="list-panel-table">
          <a-table
            class="link-table"
            size="small"
            :data-source="store.links"
            :pagination="false"
            row-key="id"
            :scroll="{ y: editingId ? 200 : 280 }"
          >
            <a-table-column title="名称" data-index="title" key="title" :width="128" ellipsis />
            <a-table-column title="网址" key="url" :width="236">
              <template #default="{ record }">
                <a-tooltip :title="record.url" placement="topLeft" :mouse-enter-delay="0.3">
                  <span class="url-ellipsis">{{ record.url }}</span>
                </a-tooltip>
              </template>
            </a-table-column>
            <a-table-column title="操作" key="actions" :width="120" align="center">
              <template #default="{ record }">
                <div class="row-actions">
                  <a-tooltip title="编辑">
                    <a-button type="text" size="small" class="row-act" @click="startEdit(record.id)">
                      <EditOutlined />
                    </a-button>
                  </a-tooltip>
                  <a-tooltip title="上移">
                    <a-button
                      type="text"
                      size="small"
                      class="row-act"
                      :disabled="linkIndex(record.id) <= 0"
                      @click="store.moveLink(record.id, -1)"
                    >
                      <ArrowUpOutlined />
                    </a-button>
                  </a-tooltip>
                  <a-tooltip title="下移">
                    <a-button
                      type="text"
                      size="small"
                      class="row-act"
                      :disabled="linkIndex(record.id) >= store.links.length - 1"
                      @click="store.moveLink(record.id, 1)"
                    >
                      <ArrowDownOutlined />
                    </a-button>
                  </a-tooltip>
                  <a-tooltip title="删除">
                    <a-button type="text" size="small" danger class="row-act" @click="remove(record.id)">
                      <DeleteOutlined />
                    </a-button>
                  </a-tooltip>
                </div>
              </template>
            </a-table-column>
          </a-table>
        </div>
      </section>
    </div>
  </OpActionModal>
</template>

<style scoped>
.pl-manage-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* —— 编辑区：白底 + 左侧强调条 —— */
.edit-panel {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #f9fafb;
  overflow: hidden;
}
.edit-panel-body {
  padding: 12px 14px 4px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.edit-panel-body :deep(.ant-input-affix-wrapper) {
  width: 100%;
}
.edit-panel-body .op-field-h > .op-label {
  flex: none;
  width: 48px;
  min-width: 48px;
  text-align: left;
}
.edit-panel-foot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 10px 14px 12px;
  border-top: 1px solid #f0f2f5;
  background: #fafbfc;
}

/* —— 列表区 —— */
.list-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.list-panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.list-panel-head-left {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.list-panel-title {
  font-size: 13px;
  font-weight: 600;
  color: #111827;
}
.list-panel-badge {
  font-size: 11px;
  font-weight: 600;
  color: #6b7280;
  padding: 2px 8px;
  border-radius: 999px;
  background: #f3f4f6;
  font-variant-numeric: tabular-nums;
}
.list-panel-table {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  overflow: hidden;
  background: #fff;
}
.link-table :deep(.ant-table) {
  background: transparent;
}
.link-table :deep(.ant-table-thead > tr > th) {
  background: #f9fafb !important;
  font-size: 12px;
  font-weight: 600;
  color: #6b7280;
}
.link-table :deep(.ant-table-cell) {
  overflow: hidden;
}
.url-inp :deep(input) {
  font-family: ui-monospace, Consolas, monospace;
  font-size: 12px;
}
.inp-count {
  font-size: 12px;
  color: #9ca3af;
  font-variant-numeric: tabular-nums;
  user-select: none;
}
.url-ellipsis {
  display: block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: ui-monospace, Consolas, monospace;
  font-size: 12px;
  color: #6b7280;
}
.row-actions {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0;
}
.row-act {
  width: 28px;
  padding: 0;
}
</style>
