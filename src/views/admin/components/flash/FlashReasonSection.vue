<script setup lang="ts">
/** 刷机配置 · 刷机原因（PRD §10.3） */
import { reactive, ref } from 'vue';
import { message, Modal } from 'ant-design-vue';
import { PlusOutlined } from '@ant-design/icons-vue';
import OpActionModal from '@/views/tickets/components/operation/OpActionModal.vue';
import { toneOf } from '@/config/adminUi';
import { useFlashConfigStore, type FlashReasonOption } from '@/stores/flashConfig';

const config = useFlashConfigStore();

const LOCKED_TIP = '毕业为自动刷机判定依据，不可停用';

const cols = [
  { title: '名称', dataIndex: 'name', key: 'name' },
  { title: '状态', key: 'status', width: 100 },
  { title: '操作', key: 'op', width: 120 },
];

function disable(r: FlashReasonOption) {
  if (r.locked) return;
  Modal.confirm({
    title: `确认停用${r.name}？`,
    okText: '确认停用',
    okType: 'danger',
    cancelText: '取消',
    onOk: () => {
      if (config.setReasonEnabled(r.id, false)) message.success('已停用');
    },
  });
}

function enable(r: FlashReasonOption) {
  if (config.setReasonEnabled(r.id, true)) message.success('已启用');
}

/* ---------------- 新增 / 编辑弹窗 ---------------- */

const open = ref(false);
const editing = ref<FlashReasonOption | null>(null);
const form = reactive({ name: '' });
const error = ref('');

function openCreate() {
  editing.value = null;
  form.name = '';
  error.value = '';
  open.value = true;
}

function openEdit(r: FlashReasonOption) {
  if (r.locked) return;
  editing.value = r;
  form.name = r.name;
  error.value = '';
  open.value = true;
}

function save() {
  const nm = form.name.trim();
  if (!nm) { error.value = '请填写名称'; return; }
  const id = editing.value?.id;
  if (config.reasons.some((r) => r.id !== id && r.name === nm)) {
    error.value = '该刷机原因已存在';
    return;
  }
  const ok = id ? config.renameReason(id, nm) : config.addReason(nm);
  if (!ok) return;
  message.success('已保存');
  open.value = false;
}
</script>

<template>
  <section class="fc-section">
    <div class="fc-head">
      <span class="fc-title">刷机原因</span>
      <a-button @click="openCreate">
        <template #icon><PlusOutlined /></template>
        新增原因
      </a-button>
    </div>
    <a-table
      :columns="cols"
      :data-source="config.reasons"
      row-key="id"
      size="middle"
      :pagination="false"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'status'">
          <a-tag :color="toneOf(record.enabled ? '启用' : '停用')">{{ record.enabled ? '启用' : '停用' }}</a-tag>
        </template>
        <template v-else-if="column.key === 'op'">
          <a-tooltip v-if="record.locked" :title="LOCKED_TIP">
            <span class="fc-tip-wrap">
              <a-button type="link" size="small" class="fc-act" disabled>编辑</a-button>
              <a-button type="link" size="small" class="fc-act" disabled>停用</a-button>
            </span>
          </a-tooltip>
          <template v-else>
            <a-button type="link" size="small" class="fc-act" @click="openEdit(record as FlashReasonOption)">编辑</a-button>
            <a-button
              v-if="record.enabled"
              type="link"
              size="small"
              danger
              class="fc-act"
              @click="disable(record as FlashReasonOption)"
            >停用</a-button>
            <a-button v-else type="link" size="small" class="fc-act" @click="enable(record as FlashReasonOption)">启用</a-button>
          </template>
        </template>
      </template>
    </a-table>

    <OpActionModal
      v-model:open="open"
      :title="editing ? '编辑原因' : '新增原因'"
      ok-text="保存"
      @ok="save"
    >
      <div class="op-form">
        <div class="op-field">
          <span class="op-label req">名称</span>
          <a-input
            v-model:value="form.name"
            :maxlength="20"
            placeholder="请输入"
            :status="error ? 'error' : undefined"
            @input="error = ''"
            @press-enter="save"
          />
          <span v-if="error" class="fc-err">{{ error }}</span>
        </div>
      </div>
    </OpActionModal>
  </section>
</template>

<style scoped src="./flashSection.css"></style>
