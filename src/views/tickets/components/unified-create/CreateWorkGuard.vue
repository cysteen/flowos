<script setup lang="ts">
import { onBeforeUnmount, watch } from 'vue';
import { useCreateWorkItemsStore } from '@/stores/createWorkItems';
import { useWorkspaceTabsStore } from '@/stores/workspaceTabs';
import { closeRequest, confirmWorkClose, resolveWorkClose } from '../../composables/createWorkGuard';
import WorkAftersaleModal from './WorkAftersaleModal.vue';
import type { AftersaleContext } from '../../composables/opActions';
import { workPath, type CreateWorkItem } from '../../types/createWork';

const works = useCreateWorkItemsStore();
const tabs = useWorkspaceTabsStore();
watch(() => works.items.map((item) => item.id), () => {
  for (const item of works.items) tabs.registerCloseGuard(workPath(item.id), async () => {
    if (item.status === 'submitting') {
      item.error = '请先核对本次提交结果，再关闭办理事项。'; return false;
    }
    if (works.dirty(item) && !await confirmWorkClose(item)) return false;
    works.remove(item.id);
    return true;
  });
}, { immediate: true });
function directContext(item: CreateWorkItem): AftersaleContext {
  const d = item.context.source;
  if (item.aftersalePrefill) return item.aftersalePrefill as unknown as AftersaleContext;
  const context = { isComplaint: d ? d.type === '投诉' : true, customerName: d?.customer.name ?? '', customerPhone: d?.customer.contacts.find((c) => c.type === 'phone')?.value ?? '', region: d?.customer.region ?? '', address: d?.customer.address ?? '', productCategory: d?.product.category ?? '', productName: d?.product.name ?? '', sn: d?.product.sn, fault: d?.demand ?? '', faultAttachments: d?.demandAttachments };
  item.aftersalePrefill = context;
  return context;
}
function saveAndClose(item: CreateWorkItem) { if (works.save(item)) resolveWorkClose(true); }
function protectRefresh(event: BeforeUnloadEvent) {
  works.flush();
  if (works.items.some((item) => works.dirty(item) || item.status === 'unknown' || item.status === 'submitting')) {
    event.preventDefault(); event.returnValue = '';
  }
}
window.addEventListener('beforeunload', protectRefresh);
onBeforeUnmount(() => window.removeEventListener('beforeunload', protectRefresh));
</script>
<template>
  <WorkAftersaleModal v-for="item in works.items.filter((work) => work.modalHost === 'workspace' && work.aftersaleOpen)" :key="item.id" :item="item" :context="directContext(item)" />
  <a-modal :open="!!closeRequest" title="尚有未保存内容" :footer="null" :closable="false" :mask-closable="false">
    <p>请选择继续填写、暂存退出，或放弃本次未保存的修改。已保存的草稿不会被删除。</p>
    <a-alert v-if="closeRequest?.item.error" :message="closeRequest.item.error" type="error" />
    <div style="display:flex;gap:12px;justify-content:flex-end;margin-top:20px">
      <a-button @click="resolveWorkClose(false)">继续填写</a-button>
      <a-button danger @click="resolveWorkClose(true)">放弃未保存修改</a-button>
      <a-button type="primary" @click="closeRequest && saveAndClose(closeRequest.item)">暂存退出</a-button>
    </div>
  </a-modal>
</template>
