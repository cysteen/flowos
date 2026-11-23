<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { message } from 'ant-design-vue';
import { BookOutlined, EditOutlined, DeleteOutlined, ArrowUpOutlined, ArrowDownOutlined, PlusOutlined } from '@ant-design/icons-vue';
import OpActionModal from '@/views/tickets/components/operation/OpActionModal.vue';
import { MAX_TITLE_LEN, MAX_URL_LEN, type LinkResult } from './linkRules';
import type { LinksManagerStore } from './linkCollection';
import { useUserStore } from '@/stores/user';
import { registerPublicLinksContextGuard } from './contextGuard';

const props = defineProps<{ store: LinksManagerStore; title: string; subtitle: string; publicMode?: boolean }>();
const open = defineModel<boolean>('open', { required: true });
const router = useRouter();
const user = useUserStore();
const editingId = ref<string | null>(null);
const form = reactive({ title: '', url: '', enabled: false });
const initial = ref('');
const busy = ref(false);
const discardOpen = ref(false);
const deleteId = ref<string | null>(null);
let decide: ((value: boolean) => void) | undefined;
const snapshot = () => JSON.stringify(form);
const dirty = computed(() => editingId.value !== null && snapshot() !== initial.value);
const blocked = computed(() => busy.value || !props.store.canWrite || !!props.store.loadError || props.store.conflict);
const atLimit = computed(() => !!props.store.maxLinks && props.store.links.length >= props.store.maxLinks);
const deleteRow = computed(() => props.store.links.find(row => row.id === deleteId.value));
let releaseRefresh: (() => void) | undefined;
watch(() => open.value && editingId.value !== null, editing => {
  releaseRefresh?.(); releaseRefresh = undefined;
  if (editing) releaseRefresh = props.store.holdRefresh();
}, { flush: 'sync' });
function clearEdit() { editingId.value = null; Object.assign(form, { title: '', url: '', enabled: false }); initial.value = snapshot(); }
function resolveDiscard(value: boolean) { discardOpen.value = false; const callback = decide; decide = undefined; callback?.(value); }
function mayLeave(): Promise<boolean> {
  if (busy.value || deleteId.value || discardOpen.value) return Promise.resolve(false);
  if (!dirty.value) return Promise.resolve(true);
  discardOpen.value = true;
  return new Promise(resolve => { decide = resolve; });
}
async function request(action: () => void) { if (await mayLeave()) action(); }
function startAdd() {
  if (blocked.value || atLimit.value) return;
  void request(() => { clearEdit(); editingId.value = '__new__'; });
}
function startEdit(id: string) {
  if (blocked.value) return;
  void request(() => {
    const row = props.store.links.find(item => item.id === id);
    if (!row) return;
    editingId.value = id;
    Object.assign(form, { title: row.title, url: row.url, enabled: row.enabled !== false });
    initial.value = snapshot();
  });
}
async function run(operation: () => LinkResult, success: string, after?: () => void) {
  if (blocked.value) return;
  const submittedScope = props.store.scopeKey;
  const submittedAccount = user.account;
  busy.value = true;
  try {
    await Promise.resolve();
    if (props.store.scopeKey !== submittedScope || user.account !== submittedAccount) return;
    const result = operation();
    if (!result.ok) { message.error(result.message); return; }
    message.success(result.unchanged ? '未作修改' : success);
    if (result.sameName) message.info('已有同名网址，建议使用便于区分的名称');
    after?.();
  } finally { busy.value = false; }
}
function save() {
  const id = editingId.value;
  if (!id) return;
  void run(() => id === '__new__'
    ? props.store.addLink(form.title, form.url, props.publicMode ? form.enabled : undefined)
    : props.store.updateLink(id, form.title, form.url, props.publicMode ? form.enabled : undefined), id === '__new__' ? '已添加' : '已保存', clearEdit);
}
function confirmDelete() {
  const id = deleteId.value;
  if (!id) return;
  void run(() => props.store.removeLink(id), '已删除', () => { deleteId.value = null; if (editingId.value === id) clearEdit(); });
}
function reload() {
  if (busy.value) return;
  if (props.store.reload()) message.info(dirty.value ? '已重新加载，请核对保留的输入后再保存' : '已重新加载');
  else message.error(props.store.loadError);
}
function beforeUnload(event: BeforeUnloadEvent) { if (open.value && dirty.value) { event.preventDefault(); event.returnValue = ''; } }
window.addEventListener('beforeunload', beforeUnload);
const removeGuard = router.beforeEach(async () => {
  if (!open.value) return true;
  if (!await mayLeave()) return false;
  clearEdit(); open.value = false; return true;
});
const removeContextGuard = registerPublicLinksContextGuard(async () => {
  if (!props.publicMode || !open.value) return true;
  if (!await mayLeave()) return false;
  clearEdit(); open.value = false; return true;
});
onBeforeUnmount(() => { releaseRefresh?.(); removeGuard(); removeContextGuard(); window.removeEventListener('beforeunload', beforeUnload); resolveDiscard(false); });
watch(() => [props.store.scopeKey, props.store.canWrite, user.account], () => {
  resolveDiscard(false); deleteId.value = null; clearEdit(); open.value = false;
}, { flush: 'sync' });
watch(open, value => { if (!value) { clearEdit(); deleteId.value = null; resolveDiscard(false); } });
</script>

<template>
  <OpActionModal :open="open" :title="title" :subtitle="subtitle" :icon="BookOutlined" :width="680" no-footer @update:open="value => { if (!value) request(() => { open = false; }); }">
    <div class="links-manager">
      <a-alert v-if="store.loadError || store.conflict" type="warning" show-icon :message="store.loadError || '网址列表已在其他页面更新，请重新加载后再操作'">
        <template #action><a-button size="small" :disabled="busy" @click="reload">重新加载</a-button></template>
      </a-alert>
      <a-alert v-if="!store.canWrite" type="info" message="当前账号无维护权限" />
      <section v-if="editingId" class="edit-panel">
        <div class="op-field op-field-h"><label class="op-label req" for="link-title">名称</label><a-input id="link-title" v-model:value="form.title" :disabled="busy" placeholder="如「飞书项目」" :maxlength="MAX_TITLE_LEN"><template #suffix><span class="counter">{{ form.title.length }}/{{ MAX_TITLE_LEN }}</span></template></a-input></div>
        <div class="op-field op-field-h"><label class="op-label req" for="link-url">网址</label><a-input id="link-url" v-model:value="form.url" :disabled="busy" placeholder="https://…" :maxlength="MAX_URL_LEN"><template #suffix><span class="counter">{{ form.url.length }}/{{ MAX_URL_LEN }}</span></template></a-input></div>
        <div v-if="publicMode" class="op-field op-field-h"><label class="op-label" for="link-enabled">状态</label><a-switch id="link-enabled" v-model:checked="form.enabled" :disabled="busy" checked-children="启用" un-checked-children="停用" /><span class="status-help">启用后向本租户用户展示</span></div>
        <div class="form-actions"><a-button size="small" :disabled="busy" @click="request(clearEdit)">取消</a-button><a-button size="small" type="primary" :loading="busy" :disabled="blocked" @click="save">保存</a-button></div>
      </section>
      <div class="list-head"><strong>已保存链接 <span class="count">{{ store.links.length }}{{ store.maxLinks ? ` / ${store.maxLinks}` : ' 条' }}</span></strong><a-tooltip :title="atLimit ? '最多保存 30 条网址' : ''"><span><a-button v-if="!editingId" size="small" type="primary" ghost :disabled="blocked || atLimit" @click="startAdd"><PlusOutlined />添加网址</a-button></span></a-tooltip></div>
      <a-table size="small" :data-source="store.links" :pagination="false" row-key="id" :scroll="{ y: editingId ? 220 : 340, x: 580 }" :locale="{ emptyText: store.loadError ? '加载失败，请重新加载' : '暂无网址，点击「添加网址」创建' }">
        <a-table-column title="名称" key="title" :width="140"><template #default="{ record }"><span class="ellipsis" tabindex="0" :title="record.title">{{ record.title }}</span></template></a-table-column>
        <a-table-column title="网址" key="url" :width="230"><template #default="{ record }"><span class="ellipsis url" tabindex="0" :title="record.url">{{ record.url }}</span></template></a-table-column>
        <a-table-column v-if="publicMode" title="状态" key="enabled" :width="76"><template #default="{ record }"><a-tag :color="record.enabled !== false ? 'green' : 'default'">{{ record.enabled !== false ? '启用' : '停用' }}</a-tag></template></a-table-column>
        <a-table-column title="操作" key="actions" :width="142"><template #default="{ record, index }"><div class="row-actions">
          <a-tooltip title="编辑"><a-button aria-label="编辑" size="small" type="text" :disabled="blocked" @click="startEdit(record.id)"><EditOutlined /></a-button></a-tooltip>
          <a-tooltip :title="index === 0 ? '已是第一条' : '上移'"><span><a-button aria-label="上移" size="small" type="text" :disabled="blocked || index === 0" @click="run(() => store.moveLink(record.id, -1), '已调整顺序')"><ArrowUpOutlined /></a-button></span></a-tooltip>
          <a-tooltip :title="index === store.links.length - 1 ? '已是最后一条' : '下移'"><span><a-button aria-label="下移" size="small" type="text" :disabled="blocked || index === store.links.length - 1" @click="run(() => store.moveLink(record.id, 1), '已调整顺序')"><ArrowDownOutlined /></a-button></span></a-tooltip>
          <a-tooltip title="删除"><a-button aria-label="删除" size="small" type="text" danger :disabled="blocked" @click="deleteId = record.id"><DeleteOutlined /></a-button></a-tooltip>
        </div></template></a-table-column>
      </a-table>
    </div>
  </OpActionModal>
  <a-modal :open="discardOpen" :z-index="1100" title="当前内容尚未保存，是否放弃修改？" ok-text="放弃修改" cancel-text="继续编辑" :mask-closable="false" @ok="resolveDiscard(true)" @cancel="resolveDiscard(false)"><p>放弃后将丢弃本次输入，已保存的网址不受影响。</p></a-modal>
  <a-modal :open="!!deleteId" :z-index="1100" title="删除网址" ok-text="确认删除" cancel-text="取消" :mask-closable="false" :keyboard="!busy" :closable="!busy" :confirm-loading="busy" :ok-button-props="{ danger: true, disabled: blocked }" :cancel-button-props="{ disabled: busy }" @ok="confirmDelete" @cancel="() => { if (!busy) deleteId = null; }">
    <p>确认删除网址「{{ deleteRow?.title }}」？删除后无法恢复。{{ publicMode ? '本租户用户将无法再从公共网站入口打开此条目。' : '' }}</p><p v-if="editingId === deleteId && dirty">该网址有未保存修改，删除后这些修改也会丢弃。</p>
    <a-button v-if="store.conflict || store.loadError" size="small" @click="reload">重新加载后核对</a-button>
  </a-modal>
</template>

<style scoped>
.links-manager{display:flex;flex-direction:column;gap:14px}.edit-panel{padding:14px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;display:flex;flex-direction:column;gap:12px}.op-label{width:48px;flex:none}.form-actions{display:flex;justify-content:flex-end;gap:8px}.counter,.count,.status-help{font-size:12px;color:#6b7280}.count{font-weight:400;margin-left:8px}.list-head{display:flex;align-items:center;justify-content:space-between;font-size:13px}.ellipsis{display:block;max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.url{font-size:12px;color:#6b7280;user-select:text}.row-actions{display:flex;flex-wrap:nowrap}.row-actions :deep(.ant-btn){padding:0;width:28px}.status-help{margin-left:8px}
</style>
