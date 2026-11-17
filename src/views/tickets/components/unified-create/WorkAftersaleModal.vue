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
const saleForm = ref<InstanceType<typeof AftersaleCreateForm> | null>(null);
const openingSnapshot = copy(props.item.aftersaleForm ?? {});
const openingInput = ref('');
void nextTick(() => {
  if (saleForm.value && !props.item.aftersaleForm) props.item.aftersaleForm = saleForm.value.snapshot();
  openingInput.value = JSON.stringify(props.item.aftersaleForm);
  if (!props.item.savedInput) props.item.savedInput = workInput(props.item);
});
const pendingOrder = computed(() => localAftersaleOrders.value.find((order) => order.workId === props.item.id && order.bindingStatus === 'pending'));
const readOnly = computed(() => !!pendingOrder.value || !!props.item.resultNo && props.item.status === 'unknown');
const needsReconciliation = computed(() => readOnly.value || props.item.status === 'unknown');
const formSnapshot = computed(() => pendingOrder.value ? { ...props.item.aftersaleForm, ...pendingOrder.value.payload } : props.item.aftersaleForm);
const busy = computed(() => props.item.status === 'submitting');
async function close() {
  if (busy.value) return;
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
    <a-alert v-if="readOnly" :message="`售后单 ${item.resultNo || pendingOrder?.no} 已生成，客服关联待核对；只继续核对，不再创建。`" type="warning" style="margin-bottom:12px" />
    <a-alert v-if="item.error" :message="item.error" type="error" show-icon style="margin-bottom:12px" />
    <AftersaleCreateForm ref="saleForm" :context="context" :snapshot="formSnapshot" :read-only="readOnly" @change="!readOnly && (item.aftersaleForm = $event)" />
    <div style="display:flex;gap:12px;justify-content:flex-end;margin-top:20px">
      <a-button v-if="!readOnly" :disabled="busy" @click="close">取消</a-button>
      <a-button :disabled="busy" @click="save">{{ readOnly ? '暂存退出' : '存草稿' }}</a-button>
      <a-button v-if="item.status === 'complete'" @click="router.push('/aftersale')">查看售后工作台</a-button>
      <a-button v-else type="primary" :loading="busy" @click="confirm">{{ needsReconciliation ? '核对本次结果' : '创建售后工单' }}</a-button>
    </div>
  </a-modal>
</template>
