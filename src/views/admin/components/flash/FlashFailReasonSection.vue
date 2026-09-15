<script setup lang="ts">
/** 刷机配置 · 失败原因（PRD §10.4）：两级表格，只改二级显示文案与启停 */
import { computed, reactive, ref } from 'vue';
import { message } from 'ant-design-vue';
import OpActionModal from '@/views/tickets/components/operation/OpActionModal.vue';
import { useFlashConfigStore } from '@/stores/flashConfig';
import type { FlashFailL1, FlashFailL2 } from '@/views/tickets/types/flash';
import { FLASH_FAIL_LOCKED_L1, FLASH_FAIL_RETURN_CODES } from './flashConfigCatalog';

const config = useFlashConfigStore();

const LOCKED_TIP = '系统判定项，不可停用';

interface Row {
  key: string;
  l1: FlashFailL1;
  l1Label: string;
  l2: FlashFailL2;
  l2Label: string;
  code: string;
  enabled: boolean;
  locked: boolean;
  span: number;
}

const rows = computed<Row[]>(() => config.failReasons.flatMap((n) => n.l2.map((x, i) => ({
  key: `${n.value}-${x.value}`,
  l1: n.value,
  l1Label: n.label,
  l2: x.value,
  l2Label: x.label,
  code: FLASH_FAIL_RETURN_CODES[n.value]?.[x.value] ?? '',
  enabled: x.enabled,
  locked: FLASH_FAIL_LOCKED_L1.includes(n.value),
  span: i === 0 ? n.l2.length : 0,
}))));

const cols = [
  { title: '一级原因', dataIndex: 'l1Label', key: 'l1', width: 180, customCell: (r: Row) => ({ rowSpan: r.span }) },
  { title: '二级原因', dataIndex: 'l2Label', key: 'l2' },
  { title: '平台回传码', key: 'code', width: 160 },
  { title: '状态', key: 'status', width: 120 },
  { title: '操作', key: 'op', width: 100 },
];

function toggle(r: Row, v: boolean) {
  if (r.locked) return;
  if (config.setFailReasonEnabled(r.l1, r.l2, v)) message.success('已保存');
}

/* ---------------- 编辑弹窗 ---------------- */

const open = ref(false);
const editing = ref<Row | null>(null);
const form = reactive({ label: '' });
const error = ref('');

function openEdit(r: Row) {
  editing.value = r;
  form.label = r.l2Label;
  error.value = '';
  open.value = true;
}

function save() {
  const r = editing.value;
  if (!r) return;
  const txt = form.label.trim();
  if (!txt) { error.value = '请填写二级原因'; return; }
  const siblings = config.failReasons.find((n) => n.value === r.l1)?.l2 ?? [];
  if (siblings.some((x) => x.value !== r.l2 && x.label === txt)) {
    error.value = '该一级原因下已有同名二级原因';
    return;
  }
  if (!config.setFailReasonLabel(r.l1, r.l2, txt)) return;
  message.success('已保存');
  open.value = false;
}
</script>

<template>
  <section class="fc-section">
    <div class="fc-head">
      <span class="fc-title">失败原因</span>
    </div>
    <a-table
      :columns="cols"
      :data-source="rows"
      row-key="key"
      size="middle"
      bordered
      :pagination="false"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'code'">
          <span v-if="record.code" class="fc-mono">{{ record.code }}</span>
          <span v-else class="fc-muted">—</span>
        </template>
        <template v-else-if="column.key === 'status'">
          <a-tooltip v-if="record.locked" :title="LOCKED_TIP">
            <span class="fc-tip-wrap"><a-switch :checked="record.enabled" size="small" disabled /></span>
          </a-tooltip>
          <a-switch
            v-else
            :checked="record.enabled"
            size="small"
            @change="(v: boolean | string | number) => toggle(record as Row, !!v)"
          />
        </template>
        <template v-else-if="column.key === 'op'">
          <a-button type="link" size="small" class="fc-act" @click="openEdit(record as Row)">编辑</a-button>
        </template>
      </template>
    </a-table>

    <OpActionModal
      v-model:open="open"
      title="编辑失败原因"
      ok-text="保存"
      @ok="save"
    >
      <div v-if="editing" class="op-form">
        <div class="op-field">
          <span class="op-label">一级原因</span>
          <a-input :value="editing.l1Label" disabled />
        </div>
        <div class="op-field">
          <span class="op-label">平台回传码</span>
          <a-input :value="editing.code || '—'" disabled />
        </div>
        <div class="op-field">
          <span class="op-label req">二级原因</span>
          <a-input
            v-model:value="form.label"
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
