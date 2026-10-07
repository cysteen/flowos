<script setup lang="ts">
/**
 * 回传处理结果（《【1025】》§4.2）：售后升级投诉转入的投诉单，在工单头「关联售后」位的回传形态下打开。
 * 顶部只读单据，两项必填；可多次回传，提交成败由处理页接（售后侧接口失败时弹窗不关、红字透出原因）。
 */
import { ref, watch } from 'vue';
import { SendOutlined } from '@ant-design/icons-vue';
import OpActionModal from './OpActionModal.vue';
import { AFTERSALE_RESULT_CONCLUSIONS } from '@/api/aftersaleResult';

const props = defineProps<{
  open: boolean;
  /** 售后工单号 */
  no: string;
  /** 售后单标题 */
  title?: string;
  loading?: boolean;
  /** 售后侧接收接口失败原因（已拼好「回传失败：…」） */
  error?: string;
}>();

const emit = defineEmits<{
  'update:open': [v: boolean];
  confirm: [payload: { conclusion: string; note: string }];
}>();

const conclusion = ref<string | undefined>(undefined);
const note = ref('');
const errs = ref<{ conclusion?: string; note?: string }>({});

watch(() => props.open, (v) => {
  if (!v) return;
  conclusion.value = undefined;
  note.value = '';
  errs.value = {};
});

const options = AFTERSALE_RESULT_CONCLUSIONS.map((v) => ({ value: v, label: v }));

function onOk() {
  const next: { conclusion?: string; note?: string } = {};
  if (!conclusion.value) next.conclusion = '请选择处理结论';
  if (!note.value.trim()) next.note = '请填写处理说明';
  errs.value = next;
  if (next.conclusion || next.note || props.loading) return;
  emit('confirm', { conclusion: conclusion.value!, note: note.value.trim() });
}
</script>

<template>
  <OpActionModal
    :open="open"
    title="回传处理结果"
    :icon="SendOutlined"
    tone="primary"
    ok-text="确认回传"
    :confirm-loading="loading"
    :width="520"
    @update:open="emit('update:open', $event)"
    @ok="onOk"
    @cancel="emit('update:open', false)"
  >
    <div class="op-form">
      <div class="asr-head">售后工单 {{ no }}<template v-if="title"> · {{ title }}</template></div>
      <div class="op-field">
        <span class="op-label req">处理结论</span>
        <a-select
          v-model:value="conclusion"
          :options="options"
          placeholder="请选择处理结论"
          :status="errs.conclusion ? 'error' : undefined"
          @change="errs.conclusion = undefined"
        />
        <span v-if="errs.conclusion" class="asr-err">{{ errs.conclusion }}</span>
      </div>
      <div class="op-field">
        <span class="op-label req">处理说明</span>
        <a-textarea
          v-model:value="note"
          :rows="4"
          placeholder="请填写处理说明"
          :status="errs.note ? 'error' : undefined"
          @input="errs.note = undefined"
        />
        <span v-if="errs.note" class="asr-err">{{ errs.note }}</span>
      </div>
      <div v-if="error" class="asr-err asr-err--submit">{{ error }}</div>
    </div>
  </OpActionModal>
</template>

<style scoped>
.asr-head {
  padding: 10px 12px;
  font-size: 13px;
  color: #374151;
  line-height: 1.6;
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
}
.asr-err { font-size: 12px; color: #dc2626; line-height: 1.5; }
.asr-err--submit { font-size: 13px; }
</style>
