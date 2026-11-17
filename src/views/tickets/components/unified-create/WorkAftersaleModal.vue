<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import { useRouter } from 'vue-router';
import { message } from 'ant-design-vue';
import AftersaleCreateForm from '../operation/AftersaleCreateForm.vue';
import { useCreateWorkItemsStore } from '@/stores/createWorkItems';
import { creationReceipt, localAftersaleOrders } from '@/stores/creationLedger';
import { confirmWorkClose } from '../../composables/createWorkGuard';
import { submitWorkAftersale, finishWorkAftersale } from '../../composables/createWorkSubmission';
import { copy, workInput, type CreateWorkItem } from '../../types/createWork';
import type { AftersaleContext } from '../../composables/opActions';

const props = defineProps<{ item: CreateWorkItem; context: AftersaleContext }>();
const emit = defineEmits<{ completed: [no: string] }>();
const works = useCreateWorkItemsStore();
const router = useRouter();
const sourceSummary = computed(() => {
  const { source, aftersaleAction } = props.item.context;
  if (!source) return null;
  return {
    action: aftersaleAction || (source.type === '投诉' ? '关联售后' : '转售后'),
    no: source.no, title: source.title,
    href: router.resolve(`/tickets/${encodeURIComponent(source.no)}`).href,
  };
});
const saleForm = ref<InstanceType<typeof AftersaleCreateForm> | null>(null);
const openingSnapshot = copy(props.item.aftersaleForm ?? {});
const openingInput = ref('');
void nextTick(() => {
  if (saleForm.value && !props.item.aftersaleForm) props.item.aftersaleForm = saleForm.value.snapshot();
  openingInput.value = JSON.stringify(props.item.aftersaleForm);
  if (!props.item.savedInput) props.item.savedInput = workInput(props.item);
});
const recordedOrder = computed(() => localAftersaleOrders.value.find((order) => order.workId === props.item.id));
const pendingOrder = computed(() => recordedOrder.value?.bindingStatus === 'pending' ? recordedOrder.value : undefined);
const readOnly = computed(() => props.item.status === 'complete' || !!pendingOrder.value || !!props.item.resultNo && props.item.status === 'unknown');
const needsReconciliation = computed(() => props.item.status !== 'complete' && (readOnly.value || props.item.status === 'unknown'));
const formSnapshot = computed(() => readOnly.value && recordedOrder.value ? { ...props.item.aftersaleForm, ...recordedOrder.value.payload } : props.item.aftersaleForm);
const busy = computed(() => props.item.status === 'submitting');
async function close() {
  if (busy.value) return;
  if (props.item.status === 'complete') { if (props.item.resultNo) works.complete(props.item, props.item.resultNo); props.item.aftersaleOpen = false; return; }
  if (readOnly.value) { save(); return; }
  const modified = JSON.stringify(props.item.aftersaleForm) !== openingInput.value;
  if (modified && !await confirmWorkClose(props.item)) return;
  // A saved draft survives abandoning unsaved changes; outer classification/public fields remain.
  if (modified && workInput(props.item) !== props.item.savedInput) props.item.aftersaleForm = Object.keys(openingSnapshot).length ? copy(openingSnapshot) : undefined;
  props.item.aftersaleOpen = false;
}
function save() {
  if (readOnly.value && formSnapshot.value) props.item.aftersaleForm = copy(formSnapshot.value);
  if (works.save(props.item)) { message.success('售后草稿已保存'); props.item.aftersaleOpen = false; }
}
function confirm() {
  if (busy.value || props.item.status === 'complete') return;
  if (needsReconciliation.value) {
    const receipt = creationReceipt(props.item.id);
    if (receipt) {
      try {
        const result = finishWorkAftersale(props.item);
        works.complete(props.item, result.no); props.item.aftersaleOpen = false; emit('completed', result.no);
      } catch (e) { props.item.error = `售后单 ${receipt.no} 已生成，关联待核对：${e instanceof Error ? e.message : '请核对原单'}，请勿重新创建。`; }
      return;
    }
    props.item.status = 'editing'; props.item.error = '已核对，本次未创建，可重新提交。'; return;
  }
  const payload = saleForm.value?.getPayload();
  if (!payload) return;
  props.item.status = 'submitting'; props.item.error = undefined;
  try {
    const result = submitWorkAftersale(props.item, payload);
    works.complete(props.item, result.no);
    props.item.aftersaleOpen = false;
    message.success(`售后工单 ${result.no} 已创建`);
    emit('completed', result.no);
  } catch (error) {
    const receipt = creationReceipt(props.item.id);
    props.item.status = receipt?.phase === 'created' ? 'unknown' : 'editing';
    props.item.resultNo = receipt?.no;
    const failure = error instanceof Error ? error.message : '创建失败，输入已保留，请重试。';
    if (receipt?.kind === 'aftersale' && receipt.phase === 'created') works.save(props.item);
    props.item.error = failure;
  }
}
</script>
<template>
  <a-modal :open="item.aftersaleOpen" title="新建售后工单" :width="1000" :footer="null" :mask-closable="false" :destroy-on-close="true" @cancel="close">
    <div v-if="sourceSummary" class="as-source-summary" role="note">
      <strong>{{ sourceSummary.action }}</strong>
      <span>原工单</span>
      <a :href="sourceSummary.href" target="_blank" rel="noopener noreferrer" title="打开原工单">{{ sourceSummary.no }}</a>
      <span class="as-source-title">{{ sourceSummary.title }}</span>
    </div>
    <a-alert v-if="item.status === 'complete'" :message="`售后工单 ${item.resultNo} 已创建，本事项已完成。`" type="success" style="margin-bottom:12px" />
    <a-alert v-else-if="readOnly" :message="`售后单 ${item.resultNo || pendingOrder?.no} 已生成，客服关联待核对；只继续核对，不再创建。`" type="warning" style="margin-bottom:12px" />
    <a-alert v-if="item.error" :message="item.error" type="error" show-icon style="margin-bottom:12px" />
    <AftersaleCreateForm ref="saleForm" :context="context" :snapshot="formSnapshot" :read-only="readOnly" @change="!readOnly && (item.aftersaleForm = $event)" />
    <div style="display:flex;gap:12px;justify-content:flex-end;margin-top:20px">
      <a-button v-if="!readOnly || item.status === 'complete'" :disabled="busy" @click="close">{{ item.status === 'complete' ? '关闭' : '取消' }}</a-button>
      <a-button v-if="item.status !== 'complete'" :disabled="busy" @click="save">{{ readOnly ? '暂存退出' : '存草稿' }}</a-button>
      <a-button v-if="item.status === 'complete'" @click="router.push('/aftersale')">查看售后工作台</a-button>
      <a-button v-else type="primary" :loading="busy" @click="confirm">{{ needsReconciliation ? '核对关联' : '创建售后工单' }}</a-button>
    </div>
  </a-modal>
</template>

<style scoped>
.as-source-summary { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 10px; margin-bottom: 12px; padding: 10px 12px; border: 1px solid #e5e7eb; border-radius: 6px; background: #f8fafc; font-size: 12px; line-height: 20px; color: #475569; }
.as-source-summary a, .as-source-title { min-width: 0; overflow-wrap: anywhere; }
</style>
