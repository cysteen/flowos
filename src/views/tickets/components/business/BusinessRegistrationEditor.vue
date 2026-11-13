<script setup lang="ts">
import { computed, nextTick, onActivated, onDeactivated, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { message, Modal } from 'ant-design-vue';
import { useBusinessRegistrationStore } from '@/stores/businessRegistration';
import { useUserStore } from '@/stores/user';
import { useTenantStore } from '@/stores/tenant';
import { useWorkspaceTabsStore } from '@/stores/workspaceTabs';
import {
  emptyRegistrationValues, registrationTemplateOf, validateRegistrationValues,
  WIRELESS_REGISTRATION_TEMPLATE_ID, type RegistrationFieldKey, type RegistrationOperationResult,
  type RegistrationValidationErrors, type RegistrationValues,
} from '@/views/tickets/types/businessRegistration';
import RegistrationFields from './RegistrationFields.vue';
import { registrationEditorSections } from './registrationEditorConfig';

const props = defineProps<{ ticketNo?: string; templateId?: string }>();
const emit = defineEmits<{ 'dirty-change': [dirty: boolean] }>();
const router = useRouter();
const route = useRoute();
const store = useBusinessRegistrationStore();
const user = useUserStore();
const tenant = useTenantStore();
const tabs = useWorkspaceTabsStore();
const root = ref<HTMLElement>();
const isNew = computed(() => !props.ticketNo);
const record = computed(() => props.ticketNo ? store.recordOf(props.ticketNo) : undefined);
const template = computed(() => registrationTemplateOf(record.value?.templateId ?? props.templateId ?? WIRELESS_REGISTRATION_TEMPLATE_ID));
const sections = computed(() => template.value ? registrationEditorSections(template.value) : []);
const values = reactive<RegistrationValues>(emptyRegistrationValues());
const errors = ref<RegistrationValidationErrors>({});
const editingRevision = ref(false);
const saving = ref(false);
const uploading = ref(false);
const activeTab = ref('process');
const active = ref(false);
onActivated(() => { active.value = true; });
onDeactivated(() => {
  active.value = false;
  transferOpen.value = false;
  reminderOpen.value = false;
  contactOpen.value = false;
  materialOpen.value = false;
});
const initialSnapshot = ref('');
const snapshotRevision = ref(0);
const snapshotStatus = ref('');
const snapshotHandler = ref('');
const snapshotOutdated = ref(false);
const pendingFiles = ref<File[]>([]);
const filePicker = ref<HTMLInputElement>();
const isClosed = computed(() => record.value?.status === '已结案');
const allowedToEdit = computed(() => isNew.value ? store.canCreate(template.value?.id) : !!record.value && store.canEdit(record.value));
const editable = computed(() => allowedToEdit.value && (!isClosed.value || editingRevision.value));
const allowedToView = computed(() => isNew.value || (!!record.value && store.canView(record.value)));
const canAttach = computed(() => isNew.value ? allowedToEdit.value : !!record.value && store.canUpload(record.value));
const canTransfer = computed(() => !!record.value && store.canTransfer(record.value));
const canContact = computed(() => !!record.value && store.canEdit(record.value) && !isClosed.value);
const dirty = computed(() => JSON.stringify(values) !== initialSnapshot.value || pendingFiles.value.length > 0);
const title = computed(() => isNew.value ? '新建工单' : [record.value?.values.businessPhone, record.value?.values.productName || record.value?.values.problemL1 || template.value?.name].filter(Boolean).join(' · '));
const visibleTabs = computed(() => isNew.value ? [{ key: 'process', label: '登记信息' }] : [
  { key: 'process', label: '工单处理' }, { key: 'history', label: '处理履历' },
  { key: 'contacts', label: '联系记录' }, { key: 'notifications', label: '通知记录' },
  { key: 'attachments', label: '附件历史' },
]);

function captureSnapshot() {
  initialSnapshot.value = JSON.stringify(values);
  snapshotRevision.value = record.value?.revision ?? 0;
  snapshotStatus.value = record.value?.status ?? '';
  snapshotHandler.value = record.value?.handler ?? '';
  snapshotOutdated.value = false;
}
function loadValues(resetView = true) {
  Object.assign(values, record.value?.values ?? emptyRegistrationValues(template.value?.id));
  captureSnapshot();
  errors.value = {};
  editingRevision.value = false;
  pendingFiles.value = [];
  if (resetView) activeTab.value = 'process';
  if (props.ticketNo && record.value) tabs.updateTitle(`/self-service/${props.ticketNo}`, title.value);
}
watch(() => [props.ticketNo, props.templateId, tenant.currentTenantId], () => loadValues(), { immediate: true });
watch(() => user.name, () => loadValues());
watch(() => record.value?.revision, () => {
  const latest = record.value;
  if (isNew.value || !latest || (latest.revision ?? 0) === snapshotRevision.value) return;
  if (!dirty.value) {
    loadValues(false);
    return;
  }
  // Reminder and attachment updates may advance the record without changing the
  // business content being edited. Retain those edits and advance only the token.
  if (JSON.stringify(latest.values) === initialSnapshot.value
    && latest.status === snapshotStatus.value && latest.handler === snapshotHandler.value) {
    snapshotRevision.value = latest.revision ?? 0;
    snapshotOutdated.value = false;
    return;
  }
  snapshotOutdated.value = true;
});
watch(dirty, (value) => emit('dirty-change', value), { immediate: true });

function changeField(key: RegistrationFieldKey, value: string) {
  if (!editable.value) return;
  values[key] = value;
  delete errors.value[key];
  if (key === 'feedback') values.specificSource = '';
  if (key === 'problemL1') values.problemL2 = '';
  if (key === 'productName') {
    const product = template.value?.products.find((item) => item.name === value);
    if (product) {
      values.productCategory = product.category;
      if (product.businessLine) values.businessLine = product.businessLine;
    }
  }
  if (key === 'productCategory') {
    const product = template.value?.products.find((item) => item.name === values.productName);
    if (product && product.category !== value) values.productName = '';
  }
}

function revealErrors(nextErrors: RegistrationValidationErrors) {
  errors.value = nextErrors;
  activeTab.value = 'process';
  void nextTick(() => {
    const key = Object.keys(nextErrors)[0];
    const field = root.value?.querySelector<HTMLElement>(`[data-field="${key}"]`);
    field?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    field?.querySelector<HTMLElement>('input,textarea,.ant-select-selector')?.focus({ preventScroll: true });
  });
}
function showResult(result: RegistrationOperationResult, success = true) {
  if (!result.ok) {
    if (result.errors) revealErrors(result.errors);
    message.warning(result.message);
    return false;
  }
  if (success) message.success(result.message);
  return true;
}

async function commitValues(close: boolean) {
  saving.value = true;
  const submittingTenant = tenant.currentTenantId;
  try {
    const result = isNew.value
      ? store.create({ ...values }, { close, templateId: template.value?.id })
      : store.save(props.ticketNo!, { ...values }, { close, revision: editingRevision.value, expectedRevision: snapshotRevision.value });
    if (!showResult(result) || !result.record) return;
    if (isNew.value) {
      if (pendingFiles.value.length) {
        const attached = await store.addAttachments(result.record.no, pendingFiles.value);
        if (!attached.ok) message.warning(attached.message);
        pendingFiles.value = [];
      }
      if (tenant.currentTenantId !== submittingTenant) return;
      initialSnapshot.value = JSON.stringify(values);
      emit('dirty-change', false);
      await router.push(`/self-service/${result.record.no}`);
      tabs.close('/self-service/new');
    } else {
      Object.assign(values, result.record.values);
      captureSnapshot();
      editingRevision.value = false;
      errors.value = {};
      tabs.updateTitle(`/self-service/${result.record.no}`, title.value);
    }
  } finally { saving.value = false; }
}

function submit(close = false) {
  if (!editable.value || saving.value) return;
  const nextErrors = validateRegistrationValues(values, close || isClosed.value ? 'close' : 'create', template.value?.id, record.value?.values);
  if (Object.keys(nextErrors).length) {
    revealErrors(nextErrors);
    message.warning('请补齐标注的必填信息');
    return;
  }
  if (values.processResult.replace(/\s/g, '').includes('附件')) {
    const count = (record.value?.attachments.length ?? 0) + pendingFiles.value.length;
    Modal.confirm({
      title: '请确认相关附件已补充',
      content: `处理结果中提到了“附件”。${count ? `当前已有 ${count} 个附件，请核对是否齐全。` : '当前尚无附件，仍可继续提交。'}`,
      okText: close ? '继续结案' : isNew.value ? '继续创建' : '继续保存',
      cancelText: '返回补充',
      onOk: () => commitValues(close),
      onCancel: () => { activeTab.value = 'process'; void nextTick(() => root.value?.querySelector('[data-attachment-region]')?.scrollIntoView({ block: 'center', behavior: 'smooth' })); },
    });
  } else void commitValues(close);
}

function leave() {
  const go = () => {
    loadValues();
    void router.push('/self-service').then(() => { if (isNew.value) tabs.close('/self-service/new'); });
  };
  if (dirty.value && editable.value) Modal.confirm({ title: '放弃本次未保存的填写？', content: '已保存的工单记录会保留。', okText: '放弃并返回', cancelText: '继续填写', onOk: go });
  else go();
}
function beginRevision() { if (allowedToEdit.value) { editingRevision.value = true; activeTab.value = 'process'; } }
function cancelRevision() { loadValues(); }

const transferOpen = ref(false);
const transferTarget = ref<string>();
const transferReason = ref('');
const transferOptions = computed(() => record.value ? store.membersFor(record.value).filter((name) => name !== record.value!.handler).map((name) => ({ value: name, label: name })) : []);
function openTransfer() {
  if (!canTransfer.value) return;
  transferTarget.value = undefined;
  transferReason.value = '';
  transferOpen.value = true;
}
watch(() => [active.value, route.fullPath, record.value?.no], () => {
  if (!active.value || route.name !== 'self-service-operation' || String(route.params.ticketNo ?? '') !== props.ticketNo
    || route.query.action !== 'transfer' || !record.value || !canTransfer.value) return;
  openTransfer();
}, { immediate: true });
function transfer() {
  if (!record.value || !transferTarget.value) { message.warning('请选择组内接收人'); return; }
  if (store.canEdit(record.value) && dirty.value) {
    const saved = store.save(record.value.no, { ...values }, { expectedRevision: snapshotRevision.value });
    if (!showResult(saved, false)) return;
  }
  const result = store.transfer(record.value.no, transferTarget.value, transferReason.value);
  if (showResult(result)) { transferOpen.value = false; loadValues(); }
}

const reminderOpen = ref(false);
const reminderAt = ref('');
const reminderNote = ref('');
function localDate(date: Date) {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}T${p(date.getHours())}:${p(date.getMinutes())}:${p(date.getSeconds())}`;
}
function openReminder() {
  if (!record.value || !canContact.value) return;
  reminderAt.value = record.value.reminder?.at.replace(' ', 'T') ?? localDate(new Date(Date.now() + 5 * 60000));
  reminderNote.value = record.value.reminder?.note ?? '';
  reminderOpen.value = true;
}
function saveReminder() {
  if (!record.value) return;
  if (showResult(store.setReminder(record.value.no, reminderAt.value, reminderNote.value))) reminderOpen.value = false;
}
function removeReminder() {
  if (record.value && showResult(store.cancelReminder(record.value.no))) reminderOpen.value = false;
}

async function selectedFiles(event: Event) {
  const input = event.target as HTMLInputElement;
  const files = Array.from(input.files ?? []);
  input.value = '';
  if (!canAttach.value || !files.length) return;
  if (isNew.value) { pendingFiles.value.push(...files); return; }
  uploading.value = true;
  try { showResult(await store.addAttachments(props.ticketNo!, files)); }
  finally { uploading.value = false; }
}
function removeAttachment(id: string) { if (props.ticketNo) showResult(store.removeAttachment(props.ticketNo, id)); }
function bytes(size: number) { return size < 1024 ? `${size} B` : size < 1024 * 1024 ? `${(size / 1024).toFixed(1)} KB` : `${(size / 1024 / 1024).toFixed(1)} MB`; }

const contactOpen = ref(false);
const materialOpen = ref(false);
function openContact(kind: 'call' | 'material') {
  if (!canContact.value) return;
  if (!values.contactPhone.trim()) { message.warning('请先填写联系号码'); return; }
  if (kind === 'call') contactOpen.value = true;
  else materialOpen.value = true;
}
function recordContact() {
  if (record.value && showResult(store.recordContact(record.value.no, values.contactPhone))) contactOpen.value = false;
}
function recordMaterial() {
  if (record.value && showResult(store.recordMaterialInvite(record.value.no, values.contactPhone))) materialOpen.value = false;
}
async function copyNo() {
  if (!record.value) return;
  try { await navigator.clipboard.writeText(record.value.no); message.success('工单号已复制'); }
  catch { message.info(record.value.no); }
}
defineExpose({ reset: () => loadValues() });
</script>

<template>
  <div v-if="!template || (!isNew && !record)" class="registration-empty"><a-empty description="未找到这张自建单" /><a-button @click="router.push('/self-service')">返回自建单工作台</a-button></div>
  <div v-else-if="!allowedToView" class="registration-empty"><a-result status="403" title="暂无这张工单的查看权限" /><a-button @click="router.push('/self-service')">返回自建单工作台</a-button></div>
  <main v-else ref="root" class="registration-editor" :class="{ 'is-new': isNew }">
    <header class="registration-header">
      <button type="button" class="back-link" @click="leave">‹ 返回自建单工作台</button>
      <div class="heading-main">
        <div class="heading-line"><h1>{{ title }}</h1><span v-if="!isNew" class="status-chip" :class="{ closed: isClosed }">{{ record?.status }}</span><span class="type-chip">{{ template.ticketType }}</span><span class="template-chip">{{ template.name }}</span></div>
        <div v-if="record" class="heading-meta"><span>建单人：{{ record.builder }}</span><span>建单时间：{{ record.createdAt }}</span><span>单号：{{ record.no }} <button type="button" class="copy-link" aria-label="复制工单号" @click="copyNo">▣</button></span></div>
        <p v-else class="new-guide">填写业务号码即可创建并处理；选择“创建并结案”时需补齐结案信息。</p>
      </div>
      <div v-if="record" class="heading-tools">
        <div class="reminder-summary"><span>预约提醒</span><strong>{{ record.reminder?.at.replace('T', ' ') || '未设置' }}</strong><small v-if="record.reminder">{{ record.reminder.triggeredAt ? '已提醒' : `提醒${record.reminder.recipient}` }}</small><button v-if="canContact" type="button" @click="openReminder">{{ record.reminder ? '修改' : '设置' }}</button></div>
        <div class="handler-summary"><span>当前处理人</span><strong>{{ record.handler }}</strong></div>
      </div>
    </header>

    <div v-if="snapshotOutdated" class="snapshot-warning" role="status">
      <span>其他页面已更新此工单。本页未保存的填写已保留，请核对最新记录后重新编辑。</span>
      <button type="button" @click="loadValues()">放弃本页修改并载入最新</button>
    </div>
    <div v-if="isNew && !allowedToEdit" class="permission-note">当前账号不在此表单的处理组内，可切换至具备业务登记权限的账号。</div>
    <div v-else-if="record && !allowedToEdit" class="permission-note">当前由 {{ record.handler }} 处理。{{ canAttach ? '您可补充附件；未结案时也可进行组内调剂。' : '当前仅可查看。' }}</div>
    <div v-else-if="isClosed" class="permission-note">{{ editingRevision ? '正在修订已结案记录。保存后保持已结案，修改前后内容将进入处理履历。' : '工单已结案。可修订业务内容或补充附件，原结案时间保持不变。' }}</div>

    <form class="registration-scroll" @submit.prevent="submit(false)">
      <div class="registration-top">
        <RegistrationFields v-for="section in sections.slice(0, 2)" :key="section.id" :section="section" :template="template" :values="values" :errors="errors" :is-new="isNew" :editable="editable" @change="changeField" />
      </div>
      <div class="registration-bottom">
        <div class="body-panel">
          <nav class="registration-tabs" aria-label="工单记录"><button v-for="tab in visibleTabs" :key="tab.key" type="button" :class="{ active: activeTab === tab.key }" @click="activeTab = tab.key">{{ tab.label }}<small v-if="tab.key === 'attachments'">{{ record?.attachments.length || 0 }}</small></button></nav>
          <div class="body-content">
            <div v-show="activeTab === 'process'" class="process-sections">
              <RegistrationFields v-for="section in sections.slice(2)" :key="section.id" :section="section" :template="template" :values="values" :errors="errors" :is-new="isNew" :editable="editable" @change="changeField" />
              <section class="attachment-section" data-attachment-region><header><strong>附件</strong><span>同组成员可补充，仅上传人可删除</span><a-button size="small" :disabled="!canAttach" :loading="uploading" @click="filePicker?.click()">上传附件</a-button></header>
                <div v-if="pendingFiles.length || record?.attachments.length" class="attachment-list">
                  <div v-for="(file, index) in pendingFiles" :key="`${file.name}-${index}`" class="attachment-row"><span>{{ file.name }}</span><small>{{ bytes(file.size) }} · 待创建后上传</small><button type="button" @click="pendingFiles.splice(index, 1)">移除</button></div>
                  <div v-for="file in record?.attachments" :key="file.id" class="attachment-row"><a :href="file.url" :download="file.name" target="_blank" rel="noopener">{{ file.name }}</a><small>{{ file.uploadedBy }} · {{ file.uploadedAt }}</small><button v-if="canAttach && file.uploadedBy === user.name" type="button" @click="removeAttachment(file.id)">删除</button></div>
                </div><p v-else class="empty-inline">暂无附件</p>
              </section>
            </div>

            <div v-if="activeTab === 'history'" class="history-list">
              <article v-for="item in record?.history" :key="item.id"><h3>{{ item.action }}</h3><small>{{ item.actor }} · {{ item.at }}</small><p>{{ item.detail }}</p><ul v-if="item.changes?.length"><li v-for="change in item.changes" :key="change.field"><b>{{ change.label }}</b>：{{ change.before || '空' }} → {{ change.after || '空' }}</li></ul></article>
              <a-empty v-if="!record?.history.length" description="暂无处理履历" />
            </div>
            <div v-if="activeTab === 'contacts'" class="table-scroll"><table><thead><tr><th>联系时间</th><th>联系号码</th><th>处理人</th><th>联系结果</th><th>录音</th></tr></thead><tbody><tr v-for="item in record?.contacts" :key="item.id"><td>{{ item.at }}</td><td>{{ item.phone }}</td><td>{{ item.actor }}</td><td>{{ item.result }}</td><td><audio v-if="item.recordingUrl" :src="item.recordingUrl" controls preload="none" /><span v-else class="muted">暂无录音</span></td></tr></tbody></table><a-empty v-if="!record?.contacts.length" description="暂无本单联系记录" /></div>
            <div v-if="activeTab === 'notifications'" class="table-scroll"><table><thead><tr><th>时间</th><th>通知内容</th><th>接收人／号码</th><th>状态</th></tr></thead><tbody><tr v-for="item in record?.notifications" :key="item.id"><td>{{ item.at }}</td><td>{{ item.content }}</td><td>{{ item.recipient }}</td><td>{{ item.status }}</td></tr></tbody></table><a-empty v-if="!record?.notifications.length" description="暂无通知记录" /></div>
            <div v-if="activeTab === 'attachments'" class="table-scroll"><div class="record-toolbar"><strong>附件历史</strong><a-button size="small" :disabled="!canAttach" :loading="uploading" @click="filePicker?.click()">上传附件</a-button></div><table><thead><tr><th>文件名称</th><th>大小</th><th>上传人</th><th>上传时间</th><th>操作</th></tr></thead><tbody><tr v-for="file in record?.attachments" :key="file.id"><td><a :href="file.url" :download="file.name" target="_blank" rel="noopener">{{ file.name }}</a></td><td>{{ bytes(file.size) }}</td><td>{{ file.uploadedBy }}</td><td>{{ file.uploadedAt }}</td><td><button v-if="canAttach && file.uploadedBy === user.name" type="button" class="text-action" @click="removeAttachment(file.id)">删除</button><span v-else class="muted">仅上传人可删除</span></td></tr></tbody></table><a-empty v-if="!record?.attachments.length" description="暂无附件" /></div>
          </div>
        </div>

        <aside class="contact-panel"><h2>联系与号码</h2><label for="registration-contactPhone">联系号码 <small>选填</small></label><input id="registration-contactPhone" :value="values.contactPhone" :disabled="!editable" placeholder="填写实际联络号码" @input="changeField('contactPhone', ($event.target as HTMLInputElement).value)"><div class="contact-buttons"><a-button size="small" :disabled="!canContact" @click="openContact('call')">呼叫</a-button><a-button size="small" :disabled="!canContact" @click="openContact('material')">收集材料</a-button></div><div class="number-summary"><span>业务号码</span><strong>{{ values.businessPhone || '未填写' }}</strong><small>订购业务</small></div><div class="number-summary"><span>退费号码</span><strong>{{ values.refundPhone || '未填写' }}</strong><small>接收退费</small></div><button v-if="record" type="button" class="text-action" @click="activeTab = 'contacts'">查看联系记录与录音 ›</button></aside>
      </div>
    </form>

    <footer class="registration-actions"><span class="action-status">{{ isNew ? '创建时仅业务号码必填' : editingRevision ? '修订记录 · 保持已结案状态' : dirty && editable ? '有未保存的修改' : `最近更新：${record?.updatedAt}` }}</span>
      <a-button v-if="isNew" @click="leave">取消</a-button><a-button v-if="editingRevision" @click="cancelRevision">取消修订</a-button>
      <a-button v-if="!isClosed || editingRevision" :type="isNew ? 'primary' : 'default'" :disabled="!editable" :loading="saving" @click="submit(false)">{{ isNew ? '创建并处理' : editingRevision ? '保存修订' : '保存' }}</a-button>
      <a-button v-if="record && !isClosed" :disabled="!canContact" @click="openReminder">预约提醒</a-button><a-button v-if="record && !isClosed" :disabled="!canTransfer" @click="openTransfer">调剂</a-button>
      <a-button v-if="!isClosed" :type="isNew ? 'default' : 'primary'" :disabled="!editable" :loading="saving" @click="submit(true)">{{ isNew ? '创建并结案' : '结案' }}</a-button>
      <a-button v-if="isClosed && !editingRevision" type="primary" :disabled="!allowedToEdit" @click="beginRevision">修订记录</a-button>
    </footer>
    <input ref="filePicker" type="file" hidden multiple accept="image/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.txt" @change="selectedFiles">

    <a-modal v-model:open="transferOpen" title="调剂" ok-text="确认调剂" cancel-text="取消" @ok="transfer"><div class="modal-field"><label>处理组</label><div class="readonly-value">{{ record?.groupName }}</div></div><div class="modal-field"><label>当前处理人</label><div class="readonly-value">{{ record?.handler }}</div></div><div class="modal-field"><label>组内接收人</label><a-select v-model:value="transferTarget" :options="transferOptions" placeholder="请选择接收人" show-search style="width:100%" /></div><div class="modal-field"><label>交接说明 <small>选填</small></label><a-textarea v-model:value="transferReason" :rows="3" placeholder="补充需要交接的事项" /></div><p class="modal-info">调剂后立即变更处理人，无需接收确认。<template v-if="record?.reminder && !record.reminder.triggeredAt">原预约时间 {{ record.reminder.at.replace('T', ' ') }} 保留，提醒接收人随之变更。</template></p></a-modal>
    <a-modal v-model:open="reminderOpen" title="预约提醒" ok-text="保存提醒" cancel-text="返回" @ok="saveReminder"><div class="modal-field"><label>关联工单</label><div class="readonly-value">{{ record?.no }}</div></div><div class="modal-field"><label>提醒时间</label><input v-model="reminderAt" type="datetime-local" step="1" class="modal-input"><div class="reminder-presets"><button v-for="minutes in [1, 5, 15]" :key="minutes" type="button" @click="reminderAt = localDate(new Date(Date.now() + minutes * 60000))">{{ minutes }} 分钟后</button></div></div><div class="modal-field"><label>提醒事项 <small>选填</small></label><a-textarea v-model:value="reminderNote" :rows="3" /></div><p class="modal-info">到时提醒当前处理人 {{ record?.handler }}，点击提醒可打开工单；结案后取消未触发提醒。</p><a-button v-if="record?.reminder" danger type="link" @click="removeReminder">取消已有提醒</a-button></a-modal>
    <a-modal v-model:open="contactOpen" title="外呼联系" ok-text="演示外呼" cancel-text="返回" @ok="recordContact"><div class="readonly-value">{{ values.contactPhone }}</div><p class="modal-info">本交互稿仅记录外呼示意，不会拨打真实电话。联系记录与本单关联。</p></a-modal>
    <a-modal v-model:open="materialOpen" title="收集客户材料" ok-text="演示发送" cancel-text="返回" @ok="recordMaterial"><div class="modal-field"><label>接收号码</label><div class="readonly-value">{{ values.contactPhone }}</div></div><div class="modal-field"><label>短信内容</label><a-textarea readonly :rows="4" value="【客服名称待业务提供】您好，为便于处理您的问题，请通过材料上传链接补充相关截图或音频。感谢您的配合。" /></div><p class="modal-info">本交互稿仅记录材料邀请示意，不会发送真实短信。</p></a-modal>
  </main>
</template>

<style scoped>
.registration-editor{height:100%;min-height:0;display:flex;flex-direction:column;color:#263b56;background:#f5f7fa}.registration-empty{padding:60px;text-align:center}
.registration-header{display:flex;align-items:center;gap:16px;flex:none;padding:13px 16px;background:#fff;border-bottom:1px solid #e4e9f1;min-height:82px}.back-link,.copy-link{border:0;background:transparent;color:#6783a8;cursor:pointer;white-space:nowrap;font-family:inherit}.back-link{font-size:12px;padding:4px 0}.copy-link{font-size:12px;padding:0 3px}.heading-main{min-width:0;flex:1}.heading-line{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.heading-line h1{font-size:16px;font-weight:600;margin:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:450px}.status-chip,.type-chip,.template-chip{font-size:11px;line-height:22px;padding:0 7px;border-radius:4px;white-space:nowrap}.status-chip{background:#fff4e2;color:#d18a17}.status-chip.closed{background:#eaf8f2;color:#13956e}.type-chip{background:#f1f4f8;color:#738198}.template-chip{background:#edf4ff;color:#347ee6}.heading-meta{display:flex;gap:15px;flex-wrap:wrap;font-size:11px;color:#8b98ab;margin-top:6px}.new-guide{font-size:12px;color:#8a9aaf;margin:6px 0 0}.heading-tools{display:flex;gap:18px;align-items:center;flex:none}.reminder-summary{font-size:10px;color:#9a8bae;position:relative;padding-right:34px}.reminder-summary span{display:block}.reminder-summary strong{font-size:12px;font-weight:500;display:block;color:#7c63a4}.reminder-summary small{display:block;font-size:10px}.reminder-summary button{position:absolute;right:0;top:13px;background:none;border:0;font-size:11px;color:#1a6fff;cursor:pointer}.handler-summary{padding-left:14px;border-left:1px solid #e9edf3;font-size:10px;color:#92a0b2}.handler-summary strong{display:block;font-size:13px;color:#3e526d;font-weight:500;margin-top:2px}.permission-note{flex:none;padding:8px 17px;background:#f2f6ff;color:#7188aa;font-size:12px;border-bottom:1px solid #e1eaf9}
.registration-scroll{flex:1;min-height:0;overflow:auto;margin:0;scroll-behavior:smooth;scrollbar-width:thin;scrollbar-color:#cad5e4 transparent}.registration-top{display:grid;grid-template-columns:minmax(0,.9fr) minmax(0,1.1fr);gap:12px;padding:12px 15px 0;align-items:stretch}.registration-bottom{display:grid;grid-template-columns:minmax(0,1fr) 292px;gap:12px;padding:12px 15px 16px;align-items:start}.body-panel{min-width:0;background:#fff;border:1px solid #e3e9f1;border-radius:7px;overflow:hidden}.registration-tabs{display:flex;gap:5px;padding:0 10px;overflow:auto;border-bottom:1px solid #e6ebf2}.registration-tabs button{border:0;background:#fff;color:#8290a4;padding:11px 12px;font-size:12px;white-space:nowrap;cursor:pointer;font-family:inherit;border-bottom:2px solid transparent}.registration-tabs button.active{border-bottom-color:#1a6fff;color:#1a6fff;font-weight:500}.registration-tabs small{font-size:10px;margin-left:5px;color:#a0acba}.body-content{padding:12px}.process-sections{display:flex;flex-direction:column;gap:12px}.contact-panel{padding:14px;background:#fff;border:1px solid #e3e9f1;border-radius:7px;position:sticky;top:12px;min-width:0}.contact-panel h2{font-size:13px;margin:0 0 14px;font-weight:600}.contact-panel label{font-size:11px;color:#8797ab;display:block;margin-bottom:5px}.contact-panel label small{font-size:10px;color:#a2adbc;margin-left:4px}.contact-panel input{width:100%;border:1px solid #dce4ef;border-radius:5px;padding:7px 9px;font:13px/1.6 inherit;font-size:13px;font-family:inherit;outline:none;box-sizing:border-box}.contact-panel input:disabled{background:#f7f9fc;color:#8a98aa}.contact-buttons{display:flex;gap:6px;margin-top:8px}.contact-buttons :deep(.ant-btn){flex:1;font-size:11px}.number-summary{border-top:1px solid #edf1f6;margin-top:13px;padding-top:11px;display:grid;grid-template-columns:1fr auto;gap:4px}.number-summary span{grid-column:1/-1;font-size:11px;color:#94a1b3}.number-summary strong{font-size:12px;font-weight:500;word-break:break-all}.number-summary small{font-size:10px;background:#f3f6fa;color:#8a98ac;border-radius:3px;padding:1px 4px}.text-action{border:0;background:transparent;color:#1a6fff;font-size:11px;cursor:pointer;padding:3px 0;font-family:inherit}.contact-panel>.text-action{margin-top:12px}.registration-actions{flex:none;display:flex;align-items:center;gap:8px;padding:10px 16px;background:#fff;border-top:1px solid #e2e8f0;box-shadow:0 -3px 12px #2a3b5004;min-height:56px}.action-status{flex:1;color:#94a0af;font-size:11px}.registration-actions :deep(.ant-btn){font-size:12px}.attachment-section{border:1px solid #e3e9f1;border-radius:6px;overflow:hidden}.attachment-section header{display:flex;gap:10px;align-items:center;padding:9px 12px;background:#f8fafd;border-bottom:1px solid #e8edf4}.attachment-section header strong{font-size:12px;font-weight:600}.attachment-section header span{font-size:10px;color:#95a3b4;flex:1}.attachment-section header :deep(.ant-btn){font-size:11px}.empty-inline{font-size:12px;color:#a0adbd;margin:17px}.attachment-list{padding:5px 13px}.attachment-row{display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid #edf1f6;font-size:12px}.attachment-row:last-child{border-bottom:0}.attachment-row small{color:#96a3b5;font-size:10px;margin-left:auto}.attachment-row button{border:0;background:none;color:#6584ae;font-size:11px;cursor:pointer}.attachment-row a{word-break:break-all}.history-list{padding:8px 12px}.history-list article{border-left:1px solid #dce6f2;padding:0 0 22px 22px;position:relative}.history-list article:before{content:'';position:absolute;width:7px;height:7px;border-radius:50%;background:#6f9cdf;left:-4px;top:6px}.history-list h3{font-size:13px;font-weight:600;margin:0}.history-list small{font-size:11px;color:#95a1b2}.history-list p{margin:8px 0 0;font-size:12px;color:#6f8198;white-space:pre-wrap}.history-list ul{font-size:11px;color:#8192a8;background:#f8fafd;padding:10px 12px 10px 26px;margin:8px 0 0;line-height:1.8}.history-list b{font-weight:500}.table-scroll{overflow:auto;min-height:180px}.table-scroll table{width:100%;border-collapse:collapse;font-size:12px}.table-scroll th{background:#f8fafd;padding:10px;text-align:left;color:#8c9aad;font-weight:500;white-space:nowrap}.table-scroll td{padding:12px 10px;border-bottom:1px solid #edf1f6;color:#687b94}.table-scroll audio{width:190px;height:32px}.record-toolbar{display:flex;align-items:center;justify-content:space-between;padding:3px 2px 12px;font-size:12px}.muted{color:#a0adbc}.modal-field{margin:0 0 15px}.modal-field label{display:block;font-size:12px;color:#8190a4;margin-bottom:6px}.modal-field label small{font-size:10px;margin-left:4px;color:#a0adbd}.readonly-value{padding:8px 11px;background:#f6f8fb;border:1px solid #e5ebf3;border-radius:5px;font-size:13px;color:#62768e}.modal-info{font-size:12px;line-height:1.8;background:#f5f8ff;color:#7189ae;border:1px solid #dfe8f8;border-radius:5px;padding:10px 12px;margin:12px 0 0}.modal-input{border:1px solid #dce4ee;border-radius:5px;padding:7px 10px;width:100%;font-family:inherit;font-size:13px;box-sizing:border-box}.reminder-presets{display:flex;gap:7px;margin-top:8px}.reminder-presets button{border:1px solid #dce6f6;color:#6582aa;border-radius:4px;background:#fff;padding:3px 8px;font-size:11px;cursor:pointer}
.snapshot-warning{display:flex;align-items:center;justify-content:space-between;gap:12px;flex:none;padding:9px 17px;background:#fff8e8;color:#8b6b2e;border-bottom:1px solid #f0e1ba;font-size:12px;line-height:1.6}.snapshot-warning button{flex:none;border:0;background:transparent;color:#846020;font:inherit;cursor:pointer;text-decoration:underline}
@media(max-width:1350px){.registration-header{padding:11px 13px;gap:12px}.heading-line h1{font-size:15px;max-width:330px}.heading-meta{gap:9px;font-size:10px}.heading-tools{gap:11px}.heading-line{gap:6px}.registration-bottom{grid-template-columns:minmax(0,1fr) 260px}.registration-top,.registration-bottom{gap:10px;padding-left:12px;padding-right:12px}.body-content{padding:10px}.handler-summary{padding-left:10px}.contact-panel{padding:12px}}
@media(max-width:1080px){.registration-top{grid-template-columns:minmax(0,1fr)}.heading-tools{display:none}.registration-bottom{grid-template-columns:minmax(0,1fr) 235px}}
@media(max-width:760px){.registration-bottom{grid-template-columns:minmax(0,1fr)}.contact-panel{position:static}.action-status{display:none}.registration-actions{flex-wrap:wrap;justify-content:flex-end}.registration-header{align-items:flex-start}.back-link{display:none}.heading-line h1{max-width:100%}}
</style>
