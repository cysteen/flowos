<script setup lang="ts">
import { computed, nextTick, onActivated, onDeactivated, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { message, Modal } from 'ant-design-vue';
import {
  CheckCircleOutlined, ClockCircleOutlined, CopyOutlined, SaveOutlined, SwapOutlined, UserOutlined,
} from '@ant-design/icons-vue';
import { useBusinessRegistrationStore } from '@/stores/businessRegistration';
import { useUserStore } from '@/stores/user';
import { useTenantStore } from '@/stores/tenant';
import { useWorkspaceTabsStore } from '@/stores/workspaceTabs';
import {
  emptyRegistrationValues, registrationNow, registrationTemplateOf, validateRegistrationValues,
  WIRELESS_REGISTRATION_TEMPLATE_ID, type RegistrationFieldKey, type RegistrationOperationResult,
  type RegistrationReminder, type RegistrationValidationErrors, type RegistrationValues,
  nextUpcomingRegistrationReminder, pendingRegistrationReminders, parseRegistrationReminderAt,
  registrationListDisplayStatus, registrationReopenedAwaitingClose,
} from '@/views/tickets/types/businessRegistration';
import dayjs from 'dayjs';
import { APPOINTMENT_DATE_TIME_FORMAT } from '@/views/tickets/types/operation';
import OpContactRows from '@/views/tickets/components/operation/OpContactRows.vue';
import type { ContactItem } from '@/views/tickets/types/operation';
import { lookupMobileAttribution } from '@/mock/registration/mobileAttribution';
import OpTimeline from '@/views/tickets/components/OpTimeline.vue';
import OpAttachmentHistoryTab from '@/views/tickets/components/operation/tabs/OpAttachmentHistoryTab.vue';
import type { AttachmentHistoryRecord } from '@/views/tickets/types/operationTabs';
import { formatOpTime } from '@/views/tickets/utils/opTime';
import RegistrationFields from './RegistrationFields.vue';
import RegistrationDateTimePicker from './RegistrationDateTimePicker.vue';
import RegistrationContactsTab from './RegistrationContactsTab.vue';
import { registrationEditorSections, type RegistrationEditorSection } from './registrationEditorConfig';
import { registrationHistoryToTimeline } from '@/views/tickets/utils/registrationTimeline';
import { applyRegistrationPhoneInput } from '@/views/tickets/utils/registrationPhoneInput';
import { registrationAmountError } from '@/views/tickets/utils/registrationAmount';
import OpActionModal from '@/views/tickets/components/operation/OpActionModal.vue';
import { CROSS_GROUP_TIP, TRANSFER_REASON_MAX } from '@/views/tickets/components/operation/dispatch/useTransferOptions';
import { useCtiStore } from '@/stores/cti';

const props = defineProps<{ ticketNo?: string; templateId?: string }>();
const emit = defineEmits<{ 'dirty-change': [dirty: boolean] }>();
const router = useRouter();
const route = useRoute();
const store = useBusinessRegistrationStore();
const user = useUserStore();
const tenant = useTenantStore();
const tabs = useWorkspaceTabsStore();
const cti = useCtiStore();
const root = ref<HTMLElement>();
const isNew = computed(() => !props.ticketNo);
const record = computed(() => props.ticketNo ? store.recordOf(props.ticketNo) : undefined);
const template = computed(() => registrationTemplateOf(record.value?.templateId ?? props.templateId ?? WIRELESS_REGISTRATION_TEMPLATE_ID));
const sections = computed(() => template.value ? registrationEditorSections(template.value) : []);
const overviewSections = computed(() => {
  const order: Array<RegistrationEditorSection['id']> = ['product', 'source'];
  return order
    .map((id) => sections.value.find((section) => section.id === id))
    .filter((section): section is RegistrationEditorSection => !!section);
});
const processSections = computed(() => sections.value.filter((section) => section.id === 'process'));
const values = reactive<RegistrationValues>(emptyRegistrationValues());
const contactManuallyEdited = ref(false);
const errors = ref<RegistrationValidationErrors>({});
const saving = ref(false);
const uploading = ref(false);
const activeTab = ref('process');
const active = ref(false);
onActivated(() => { active.value = true; });
onDeactivated(() => {
  active.value = false;
  transferOpen.value = false;
  reminderOpen.value = false;
  reminderMenuOpen.value = false;
  contactOpen.value = false;
});
const initialSnapshot = ref('');
const snapshotRevision = ref(0);
const snapshotStatus = ref('');
const snapshotHandler = ref('');
const snapshotOutdated = ref(false);
const pendingFiles = ref<File[]>([]);
const descriptionAttachments = ref<string[]>([]);
const processResultAttachments = ref<string[]>([]);
const initialTextareaSnapshot = ref('');
const isClosed = computed(() => record.value?.status === '已结案');
const displayStatus = computed(() => (record.value ? registrationListDisplayStatus(record.value) : ''));
const reopenedAwaitingClose = computed(() => !!record.value && registrationReopenedAwaitingClose(record.value));
const isDraft = computed(() => record.value?.status === '草稿');
const isDraftLike = computed(() => isNew.value || isDraft.value);
const allowedToEdit = computed(() => isNew.value ? store.canCreate(template.value?.id) : !!record.value && store.canEdit(record.value));
const allowedToRevise = computed(() => !!record.value && store.canRevise(record.value));
const editable = computed(() => {
  if (isNew.value) return allowedToEdit.value;
  if (isClosed.value) return allowedToRevise.value;
  return allowedToEdit.value;
});
const allowedToView = computed(() => isNew.value || (!!record.value && store.canView(record.value)));
const canAttach = computed(() => isNew.value ? allowedToEdit.value : !!record.value && store.canUpload(record.value));
const canTransfer = computed(() => !!record.value && store.canTransfer(record.value));
const canContact = computed(() => !!record.value && record.value.status === '处理中' && store.canEdit(record.value));
/** 同组「非当前处理人」才展示 permission-note；处理人本人不提示这条旁白 */
const isCurrentHandler = computed(() => {
  const h = record.value?.handler?.trim() ?? '';
  return !!h && h === user.name;
});
const textareaSnapshot = computed(() => JSON.stringify({
  descriptionAttachments: descriptionAttachments.value,
  processResultAttachments: processResultAttachments.value,
}));
const dirty = computed(() => (
  JSON.stringify(values) !== initialSnapshot.value
  || textareaSnapshot.value !== initialTextareaSnapshot.value
  || pendingFiles.value.length > 0
));
const closedSaveEnabled = computed(() => allowedToRevise.value && dirty.value);
function registrationTitleHint(v: RegistrationValues | undefined): string {
  if (!v) return '';
  return [v.businessPhone, v.businessLine, v.productCategory, v.productName]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(' · ');
}
const title = computed(() => {
  const hint = isNew.value ? registrationTitleHint(values) : registrationTitleHint(record.value?.values);
  if (hint) return hint;
  if (!isNew.value) {
    return record.value?.values.problemL1?.trim() || template.value?.name || record.value?.no || '';
  }
  return template.value?.name || '新建工单';
});
const newHeaderFilled = computed(() => isNew.value && !!(values.businessPhone?.trim() || values.productName?.trim()));
const visibleTabs = computed(() => [
  { key: 'process', label: '工单处理' }, { key: 'history', label: '处理履历' },
  { key: 'contacts', label: '联系记录' },
  { key: 'attachments', label: '附件历史' },
]);
const historyTimeline = computed(() => {
  const entries = registrationHistoryToTimeline(record.value?.history);
  return [...entries].reverse();
});
const registrationAttachmentHistory = computed((): AttachmentHistoryRecord[] => {
  const saved = (record.value?.attachments ?? []).map((file) => ({
    id: file.id,
    name: file.name,
    size: bytes(file.size),
    uploadedAt: file.uploadedAt,
    uploadedBy: file.uploadedBy,
    url: file.url,
  }));
  if (!isNew.value) return saved;
  const pending = pendingFiles.value.map((file, index) => ({
    id: `pending-${index}`,
    name: file.name,
    size: bytes(file.size),
    uploadedAt: '待创建后上传',
    uploadedBy: user.name,
  }));
  return [...saved, ...pending];
});
function registrationAttachmentAllowDelete(item: AttachmentHistoryRecord): boolean {
  if (!canAttach.value) return false;
  if (item.id.startsWith('pending-')) return true;
  return item.uploadedBy === user.name;
}

function captureSnapshot() {
  initialSnapshot.value = JSON.stringify(values);
  descriptionAttachments.value = [...(record.value?.descriptionAttachments ?? [])];
  processResultAttachments.value = [...(record.value?.processResultAttachments ?? [])];
  initialTextareaSnapshot.value = textareaSnapshot.value;
  snapshotRevision.value = record.value?.revision ?? 0;
  snapshotStatus.value = record.value?.status ?? '';
  snapshotHandler.value = record.value?.handler ?? '';
  snapshotOutdated.value = false;
}
function loadValues(resetView = true) {
  Object.assign(values, record.value?.values ?? emptyRegistrationValues(template.value?.id));
  contactManuallyEdited.value = false;
  captureSnapshot();
  errors.value = {};
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
  const previousValue = values[key];
  values[key] = value;
  if (key === 'businessPhone' || key === 'contactPhone') {
    const contact = applyRegistrationPhoneInput({ contactPhone: values.contactPhone, manuallyEdited: contactManuallyEdited.value }, key, value, isNew.value);
    values.contactPhone = contact.contactPhone;
    contactManuallyEdited.value = contact.manuallyEdited;
  }
  delete errors.value[key];
  if (key === 'refundAmount') {
    const amountError = registrationAmountError(value);
    if (amountError) errors.value.refundAmount = amountError;
  }
  if (previousValue !== value) {
    if (key === 'feedback') values.specificSource = '';
    if (key === 'problemL1') values.problemL2 = '';
    if (key === 'businessLine') { values.productCategory = ''; values.productName = ''; }
    if (key === 'productCategory') values.productName = '';
  }
  if (key === 'businessPhone') {
    const hit = lookupMobileAttribution(value);
    if (hit) {
      values.operator = hit.operator;
      values.province = hit.province;
      delete errors.value.operator;
      delete errors.value.province;
    }
  }
}
function onTextareaFilesAdded(_key: 'description' | 'processResult', files: { name: string; size: number; file: File }[]) {
  if (!editable.value || !files.length) return;
  pendingFiles.value.push(...files.map((f) => f.file));
}
function saveMeta() {
  return {
    descriptionAttachments: [...descriptionAttachments.value],
    processResultAttachments: [...processResultAttachments.value],
  };
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

async function commitValues(close: boolean, draft = false) {
  saving.value = true;
  const submittingTenant = tenant.currentTenantId;
  try {
    const meta = saveMeta();
    const result = isNew.value
      ? store.create({ ...values }, { close, draft, templateId: template.value?.id, ...meta })
      : store.save(props.ticketNo!, { ...values }, {
        close,
        draft: isDraft.value && draft && !close,
        promote: isDraft.value && !draft && !close,
        revision: isClosed.value,
        expectedRevision: snapshotRevision.value,
        ...meta,
      });
    if (!showResult(result) || !result.record) return;
    if (pendingFiles.value.length) {
      const attached = await store.addAttachments(result.record.no, pendingFiles.value);
      if (!attached.ok) message.warning(attached.message);
      pendingFiles.value = [];
    }
    if (isNew.value) {
      if (tenant.currentTenantId !== submittingTenant) return;
      initialSnapshot.value = JSON.stringify(values);
      initialTextareaSnapshot.value = textareaSnapshot.value;
      emit('dirty-change', false);
      await router.push(`/self-service/${result.record.no}`);
      tabs.close('/self-service/new');
    } else {
      Object.assign(values, result.record.values);
      captureSnapshot();
      errors.value = {};
      tabs.updateTitle(`/self-service/${result.record.no}`, title.value);
    }
  } finally { saving.value = false; }
}

function submitDraft() {
  if (!editable.value || saving.value) return;
  void commitValues(false, true);
}

function submit(close = false) {
  if (!editable.value || saving.value) return;
  if (close && !values.replyTime.trim()) values.replyTime = registrationNow();
  const stage = close || isClosed.value ? 'close' : 'create';
  const nextErrors = validateRegistrationValues(values, stage, template.value?.id, record.value?.values);
  if (Object.keys(nextErrors).length) {
    revealErrors(nextErrors);
    message.warning('请检查标注的字段信息');
    return;
  }
  if (close && values.processResult.replace(/\s/g, '').includes('附件')) {
    const count = (record.value?.attachments.length ?? 0) + pendingFiles.value.length;
    Modal.confirm({
      title: '请确认相关附件已补充',
      content: `处理结果中提到了“附件”。${count ? `当前已有 ${count} 个附件，请核对是否齐全。` : '当前尚无附件，仍可继续结案。'}`,
      okText: '继续结案',
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
const transferOpen = ref(false);
const transferScope = ref<'same' | 'cross'>('same');
const transferTargetGroup = ref<string>();
const transferTarget = ref<string>();
const transferReason = ref('');
const canCrossGroupTransfer = computed(() => store.canCrossGroupTransfer());
const transferOptions = computed(() => record.value
  ? store.membersFor(record.value).filter((name) => name !== record.value!.handler).map((name) => ({ value: name, label: name }))
  : []);
const transferGroupOptions = computed(() => (record.value ? store.transferTargetGroups(record.value.groupName) : []));
const transferCrossMemberOptions = computed(() => {
  if (!transferTargetGroup.value) return [];
  return store.membersForGroup(transferTargetGroup.value)
    .filter((name) => name !== record.value?.handler)
    .map((name) => ({ value: name, label: name }));
});
function filterMemberOption(input: string, option?: { label?: string; value?: string }) {
  const q = input.trim().toLocaleLowerCase();
  if (!q) return true;
  const label = String(option?.label ?? option?.value ?? '').toLocaleLowerCase();
  return label.includes(q);
}
function resetTransferForm() {
  transferScope.value = 'same';
  transferTargetGroup.value = undefined;
  transferTarget.value = undefined;
  transferReason.value = '';
}
watch(transferScope, () => {
  transferTargetGroup.value = undefined;
  transferTarget.value = undefined;
});
watch(transferTargetGroup, () => { transferTarget.value = undefined; });
function openTransfer() {
  if (!canTransfer.value) return;
  resetTransferForm();
  transferOpen.value = true;
}
watch(() => [active.value, route.fullPath, record.value?.no], () => {
  if (!active.value || route.name !== 'self-service-operation' || String(route.params.ticketNo ?? '') !== props.ticketNo
    || route.query.action !== 'transfer' || !record.value || !canTransfer.value) return;
  openTransfer();
}, { immediate: true });
function transfer() {
  if (!record.value) return;
  const reason = transferReason.value.trim();
  if (reason.length > TRANSFER_REASON_MAX) { message.warning(`调剂原因最多 ${TRANSFER_REASON_MAX} 字`); return; }
  if (transferScope.value === 'cross') {
    if (!canCrossGroupTransfer.value) { message.warning(CROSS_GROUP_TIP); return; }
    if (!transferTargetGroup.value) { message.warning('请选择目标处理组'); return; }
    if (!transferTarget.value) { message.warning('请选择处理人'); return; }
  } else if (!transferTarget.value) {
    message.warning('请选择处理人');
    return;
  }
  if (store.canEdit(record.value) && dirty.value) {
    const saved = store.save(record.value.no, { ...values }, { expectedRevision: snapshotRevision.value });
    if (!showResult(saved, false)) return;
  }
  const result = transferScope.value === 'cross' && transferTargetGroup.value && transferTarget.value
    ? store.transferCrossGroup(record.value.no, transferTargetGroup.value, transferTarget.value, reason)
    : store.transfer(record.value.no, transferTarget.value!, reason);
  if (showResult(result)) { transferOpen.value = false; loadValues(); }
}

const reminderMenuOpen = ref(false);
const reminderOpen = ref(false);
const reminderEditId = ref<string>();
const reminderAt = ref('');
const reminderNote = ref('');
const recordReminders = computed(() => record.value?.reminders ?? []);
const pendingReminders = computed(() => pendingRegistrationReminders(recordReminders.value));
const nextReminder = computed(() => nextUpcomingRegistrationReminder(recordReminders.value));
const sortedReminders = computed(() => {
  const items = [...recordReminders.value];
  return items.sort((a, b) => {
    const aDone = !!a.triggeredAt;
    const bDone = !!b.triggeredAt;
    if (aDone !== bDone) return aDone ? 1 : -1;
    return parseRegistrationReminderAt(a.at) - parseRegistrationReminderAt(b.at);
  });
});
const reminderModalTitle = computed(() => (reminderEditId.value ? '编辑预约提醒' : '新增预约提醒'));
function reminderPreset(minutes: number) {
  reminderAt.value = dayjs().add(minutes, 'minute').format(APPOINTMENT_DATE_TIME_FORMAT);
}
function openReminderAdd() {
  if (!record.value || !canContact.value) return;
  reminderEditId.value = undefined;
  reminderAt.value = dayjs().add(5, 'minute').format(APPOINTMENT_DATE_TIME_FORMAT);
  reminderNote.value = '';
  reminderMenuOpen.value = false;
  reminderOpen.value = true;
}
function openReminderEdit(item: RegistrationReminder) {
  if (!record.value || !canContact.value || item.triggeredAt) return;
  reminderEditId.value = item.id;
  reminderAt.value = item.at;
  reminderNote.value = item.note ?? '';
  reminderMenuOpen.value = false;
  reminderOpen.value = true;
}
function saveReminder() {
  if (!record.value) return;
  const no = record.value.no;
  const result = reminderEditId.value
    ? store.updateReminder(no, reminderEditId.value, reminderAt.value, reminderNote.value)
    : store.addReminder(no, reminderAt.value, reminderNote.value);
  if (showResult(result)) {
    reminderOpen.value = false;
    reminderEditId.value = undefined;
  }
}
function removeReminder() {
  if (!record.value || !reminderEditId.value) return;
  if (showResult(store.cancelReminder(record.value.no, reminderEditId.value))) {
    reminderOpen.value = false;
    reminderEditId.value = undefined;
  }
}
function formatReminderAt(at: string) {
  return at.replace('T', ' ');
}
const reminderAlarmLabel = computed(() => {
  const pending = pendingReminders.value;
  const next = nextReminder.value;
  if (!pending.length) return '添加提醒';
  if (pending.length === 1 && next) return formatReminderAt(next.at);
  if (next) return `${formatReminderAt(next.at)} · ${pending.length} 条`;
  return `${pending.length} 条提醒`;
});
const reminderAlarmTitle = computed(() => {
  const pending = pendingReminders.value;
  if (!recordReminders.value.length) return '设置预约提醒';
  if (!pending.length) return '已有提醒均已触发，可继续添加新提醒';
  const next = nextReminder.value;
  if (!next) return '预约提醒';
  const tail = next.note?.trim() ? ` · ${next.note.trim()}` : '';
  return `最近：${formatReminderAt(next.at)} · ${next.recipient}${tail}`;
});
const reminderChipClass = computed(() => ({
  'has-reminder': pendingReminders.value.length > 0,
  triggered: recordReminders.value.length > 0 && pendingReminders.value.length === 0,
  empty: !recordReminders.value.length,
}));

async function onAttachmentTabUpload(files: { name: string; size: number; file: File }[]) {
  const picked = files.map((f) => f.file).filter(Boolean);
  if (!canAttach.value || !picked.length) return;
  if (isNew.value) {
    pendingFiles.value.push(...picked);
    return;
  }
  uploading.value = true;
  try {
    showResult(await store.addAttachments(props.ticketNo!, picked));
  } finally {
    uploading.value = false;
  }
}
function removeAttachment(id: string) { if (props.ticketNo) showResult(store.removeAttachment(props.ticketNo, id)); }
function onAttachmentTabDelete(id: string) {
  if (id.startsWith('pending-')) {
    const index = Number(id.replace('pending-', ''));
    if (Number.isFinite(index) && index >= 0) pendingFiles.value.splice(index, 1);
    return;
  }
  removeAttachment(id);
}
function bytes(size: number) { return size < 1024 ? `${size} B` : size < 1024 * 1024 ? `${(size / 1024).toFixed(1)} KB` : `${(size / 1024 / 1024).toFixed(1)} MB`; }

const contactOpen = ref(false);
const pendingCallPhone = ref('');
const panelContactPhones = computed<ContactItem[]>(() => {
  const phone = values.contactPhone.trim();
  return phone ? [{ type: 'phone', value: phone }] : [];
});
const showPanelContactActions = computed(() => canContact.value);
const registrationCallLabel = computed(() => {
  if (values.businessPhone.trim()) return `业务·${values.businessPhone.trim()}`;
  return '联系号码';
});
function onPanelOutboundSuccess(phone: string) {
  if (!record.value) return;
  message.info(`正在外呼 ${phone}，挂断后将自动写入「联系记录」`);
}

function onPanelContact(type: 'call' | 'sms' | 'email', value: string) {
  if (type !== 'call') return;
  if (isNew.value || !record.value) {
    message.warning('请先保存工单后再联系客户');
    return;
  }
  if (!canContact.value) {
    message.warning('当前不可联系客户');
    return;
  }
  if (!value.trim()) {
    message.warning('请先填写联系号码');
    return;
  }
  pendingCallPhone.value = value;
  contactOpen.value = true;
}
function recordContact() {
  const phone = pendingCallPhone.value.trim() || values.contactPhone.trim();
  if (!record.value) return;
  if (showResult(store.recordContact(record.value.no, phone))) {
    contactOpen.value = false;
    activeTab.value = 'contacts';
  }
}

/** 侧栏 CTI 外呼挂断后与标准工单一致写入本单「联系记录」 */
watch(
  () => cti.callSession,
  (cur, prev) => {
    const no = record.value?.no;
    if (!no) return;
    if (!prev || cur || prev.ticketId !== no) return;
    if (prev.status === 'dialing') return;
    const result = store.recordContactFromCallSession(no, prev, Date.now());
    if (showResult(result)) activeTab.value = 'contacts';
  },
);
async function copyNo() {
  const text = record.value?.no;
  if (!text) return;
  try {
    if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable');
    await navigator.clipboard.writeText(text);
    message.success('工单号已复制');
  } catch {
    const el = document.createElement('textarea');
    el.value = text;
    el.setAttribute('readonly', '');
    el.style.cssText = 'position:fixed;left:-9999px;top:0';
    document.body.appendChild(el);
    el.select();
    try {
      document.execCommand('copy');
      message.success('工单号已复制');
    } catch {
      message.info(text);
    } finally {
      document.body.removeChild(el);
    }
  }
}
defineExpose({ reset: () => loadValues() });
</script>

<template>
  <div v-if="!template || (!isNew && !record)" class="registration-empty"><a-empty description="未找到这张自建单" /><a-button @click="router.push('/self-service')">返回自建单工作台</a-button></div>
  <div v-else-if="!allowedToView" class="registration-empty"><a-result status="403" title="暂无这张工单的查看权限" /><a-button @click="router.push('/self-service')">返回自建单工作台</a-button></div>
  <main v-else ref="root" class="registration-editor" :class="{ 'is-new': isNew }">
    <header class="registration-header header-compact">
      <button v-if="isNew" type="button" class="back-link compact" @click="leave">‹ 返回</button>
      <div class="heading-main">
        <div v-if="isNew" class="heading-line heading-line--single">
          <h1>{{ title }}</h1>
          <span class="status-chip draft">新建</span>
          <span v-if="newHeaderFilled" class="template-chip">{{ template.name }}</span>
          <div class="heading-inline-meta">
            <span class="meta-sep" aria-hidden="true">|</span>
            <span>建单人 {{ user.name }}</span>
            <span class="meta-sep" aria-hidden="true">|</span>
            <span class="meta-muted">保存后生成单号</span>
          </div>
        </div>
        <div v-else class="heading-record-body">
          <div class="title-row">
            <span class="status-chip reg-status-badge" :class="{ closed: isClosed, reopened: reopenedAwaitingClose }">
              <span class="badge-dot" aria-hidden="true" />
              {{ displayStatus }}
            </span>
            <h1 class="oh-title">{{ title }}</h1>
          </div>
          <div class="meta-row">
            <span class="meta-text">
              <span class="meta-k">建单人</span>：{{ record?.builder }}<span class="meta-sep-inline">，</span>
              <span class="meta-k">建单时间</span>：{{ record?.createdAt }}<span class="meta-sep-inline">，</span>
              <span class="meta-k">单号</span>：{{ record?.no }}
            </span>
            <button type="button" class="meta-copy" title="复制工单号" aria-label="复制工单号" @click.stop="copyNo">
              <CopyOutlined />
            </button>
            <span class="meta-text meta-text--tail">
              <span class="meta-sep-inline">，</span>
              <span class="meta-k">处理人</span>：{{ record?.handler }}
            </span>
          </div>
        </div>
      </div>
      <div v-if="!isNew" class="heading-tools heading-tools--compact">
        <a-popover
          v-model:open="reminderMenuOpen"
          trigger="click"
          placement="bottomRight"
          overlay-class-name="reminder-alarm-popover"
        >
          <template #content>
            <p v-if="!sortedReminders.length" class="reminder-popover-empty">尚未设置预约提醒</p>
            <ul v-else class="reminder-popover-list" role="list">
              <li
                v-for="item in sortedReminders"
                :key="item.id"
                class="reminder-popover-item"
                :class="{ muted: !!item.triggeredAt }"
              >
                <button
                  type="button"
                  class="reminder-popover-row"
                  :disabled="!!item.triggeredAt || !canContact"
                  @click="openReminderEdit(item)"
                >
                  <span class="reminder-popover-at">{{ formatReminderAt(item.at) }}</span>
                  <span class="reminder-popover-meta">
                    {{ item.triggeredAt ? `已于 ${formatReminderAt(item.triggeredAt)} 提醒` : `提醒 ${item.recipient}` }}
                  </span>
                  <small v-if="item.note?.trim()" class="reminder-popover-note">{{ item.note.trim() }}</small>
                </button>
              </li>
            </ul>
            <button
              type="button"
              class="reminder-popover-add"
              :disabled="!canContact"
              @click="openReminderAdd"
            >
              添加提醒
            </button>
          </template>
          <button
            type="button"
            class="reminder-alarm-chip"
            :class="reminderChipClass"
            :disabled="!canContact"
            :title="reminderAlarmTitle"
            aria-haspopup="dialog"
            :aria-expanded="reminderMenuOpen"
          >
            <ClockCircleOutlined class="reminder-alarm-icon" aria-hidden="true" />
            <span class="reminder-alarm-text">{{ reminderAlarmLabel }}</span>
            <span v-if="pendingReminders.length" class="reminder-alarm-dot" aria-hidden="true" />
          </button>
        </a-popover>
      </div>
    </header>

    <div v-if="snapshotOutdated" class="snapshot-warning" role="status">
      <span>其他页面已更新此工单。本页未保存的填写已保留，请核对最新记录后重新编辑。</span>
      <button type="button" @click="loadValues()">放弃本页修改并载入最新</button>
    </div>
    <div v-if="isNew && !allowedToEdit" class="permission-note">当前账号不在此表单的处理组内，可切换至具备业务登记权限的账号。</div>
    <div v-else-if="record && !allowedToEdit && !isCurrentHandler && !(isClosed && allowedToRevise)" class="permission-note">当前由 {{ record.handler }} 处理。{{ canAttach ? '您可补充附件；' : '' }}{{ isClosed ? '业务内容仅结案时的处理人可修订。' : '业务字段仅可查看。' }}</div>
    <div v-else-if="isClosed && !allowedToRevise" class="permission-note">工单已结案。{{ canAttach ? '同组可补充附件；' : '' }}业务内容仅结案时的处理人可修订。</div>

    <form class="registration-scroll" @submit.prevent="submit(false)">
      <div class="registration-top registration-top--overview">
        <div class="registration-overview-cards">
          <div
            v-for="section in overviewSections"
            :key="section.id"
            class="ob-cell"
          >
            <RegistrationFields
              layout="paired"
              :paired-columns="2"
              :overview-tone="section.id === 'source' ? 'desc' : 'stat'"
              :section="section"
              :template="template"
              :values="values"
              :errors="errors"
              :is-new="isNew"
              :editable="editable"
              @change="changeField"
            >
              <template v-if="section.id === 'source'" #overview-extra>
                <div class="pair-field pair-field--contact full">
                  <label for="registration-contactPhone" class="pair-field-contact-label">
                    <UserOutlined class="pair-field-contact-label-icon" aria-hidden="true" />
                    <span class="pair-field-contact-label-text">联系人</span>
                  </label>
                  <div class="field-control field-control--contact-inline">
                    <input
                      id="registration-contactPhone"
                      class="contact-phone-input"
                      type="tel"
                      inputmode="tel"
                      :value="values.contactPhone"
                      :disabled="!editable"
                      placeholder="填写联系人手机号"
                      autocomplete="tel"
                      @input="changeField('contactPhone', ($event.target as HTMLInputElement).value)"
                    >
                    <OpContactRows
                      actions-only
                      call-icon-only
                      :outbound-phone="values.contactPhone"
                      :contacts="panelContactPhones"
                      :show-sms="false"
                      :show-email="false"
                      :show-actions="showPanelContactActions"
                      :ticket-id="record?.no"
                      :call-contact-label="registrationCallLabel"
                      @contact="onPanelContact"
                      @outbound-success="onPanelOutboundSuccess"
                    />
                  </div>
                </div>
              </template>
            </RegistrationFields>
          </div>
        </div>
      </div>
      <div class="registration-bottom">
        <div class="body-panel">
          <nav class="registration-tabs" aria-label="工单记录"><button v-for="tab in visibleTabs" :key="tab.key" type="button" :class="{ active: activeTab === tab.key }" @click="activeTab = tab.key">{{ tab.label }}</button></nav>
          <div class="body-content" :class="{ 'is-process': activeTab === 'process' }">
            <div v-show="activeTab === 'process'" class="process-canvas">
              <div class="process-sections">
                <RegistrationFields
                  v-for="section in processSections"
                  :key="section.id"
                  embedded
                  layout="paired"
                  :paired-columns="3"
                  :section="section"
                  :template="template"
                  :values="values"
                  :errors="errors"
                  :is-new="isNew"
                  :editable="editable"
                  v-model:description-attachments="descriptionAttachments"
                  v-model:process-result-attachments="processResultAttachments"
                  @change="changeField"
                  @textarea-files-added="onTextareaFilesAdded"
                />
              </div>
            </div>

            <div v-if="activeTab === 'history'" class="flow-history tab-content is-readonly">
              <div v-if="record" class="current-bar">
                <div class="current-label">
                  <span class="current-prefix">当前状态:</span>
                  <strong class="current-value">{{ record.status }}</strong>
                  <span class="current-sep">·</span>
                  <span class="current-prefix">处理人：</span>
                  <strong class="current-value">{{ record.handler }}</strong>
                  <span class="current-sep">·</span>
                  <span class="current-prefix">处理组：</span>
                  <strong class="current-value">{{ record.groupName || '—' }}</strong>
                </div>
              </div>
              <OpTimeline v-if="historyTimeline.length" :entries="historyTimeline" :show-legend="false" />
              <a-empty v-else description="暂无处理履历" />
            </div>
            <div v-if="activeTab === 'contacts'" class="tab-content is-readonly">
              <RegistrationContactsTab v-if="record?.contacts?.length" :contacts="record.contacts" />
              <a-empty v-else description="暂无本单联系记录" />
            </div>
            <div
              v-if="activeTab === 'attachments'"
              class="tab-content"
              :class="{ 'is-readonly': !editable }"
            >
              <OpAttachmentHistoryTab
                :records="registrationAttachmentHistory.map((r) => ({
                  ...r,
                  uploadedAt: r.id.startsWith('pending-') ? r.uploadedAt : formatOpTime(r.uploadedAt),
                }))"
                :links="[]"
                :show-customer-upload="false"
                :readonly="!canAttach"
                :allow-delete="registrationAttachmentAllowDelete"
                @upload="onAttachmentTabUpload"
                @delete="onAttachmentTabDelete"
              />
              <a-empty
                v-if="!registrationAttachmentHistory.length"
                description="暂无附件"
              />
            </div>
          </div>
        </div>
      </div>
    </form>

    <footer class="registration-actions op-actionbar">
      <span class="action-status">
        <template v-if="isDraftLike">{{ dirty && editable ? '填写中' : '「保存」为草稿；「创建并处理」仅需业务号码；结案需补齐带 * 项' }}</template>
        <template v-else>{{ isClosed && allowedToRevise && dirty ? '修订已结案记录 · 有未保存的修改' : dirty && editable ? '有未保存的修改' : `最近更新：${record?.updatedAt}` }}</template>
      </span>
      <div class="bottom-actions">
        <template v-if="isDraftLike">
          <button type="button" class="ab-item" @click="leave">取消</button>
          <button type="button" class="ab-item" :disabled="!editable || saving" @click="submitDraft">
            <SaveOutlined />
            <span>{{ saving ? '保存中…' : '保存' }}</span>
          </button>
          <button type="button" class="ab-item ab-save" :disabled="!editable || saving" @click="submit(false)">
            <SaveOutlined />
            <span>{{ saving ? '提交中…' : '创建并处理' }}</span>
          </button>
          <button type="button" class="ab-item ab-close" :disabled="!editable || saving" @click="submit(true)">
            <CheckCircleOutlined />
            <span>{{ isNew ? '创建并结案' : '结案' }}</span>
          </button>
        </template>
        <template v-else>
          <button
            v-if="allowedToEdit || (isClosed && allowedToRevise)"
            type="button"
            class="ab-item ab-save"
            :disabled="(isClosed ? !closedSaveEnabled : !editable) || saving"
            @click="submit(false)"
          >
            <SaveOutlined />
            <span>{{ saving ? '保存中…' : '保存' }}</span>
          </button>
          <button
            v-if="record && !isClosed && canTransfer"
            type="button"
            class="ab-item"
            @click="openTransfer"
          >
            <SwapOutlined />
            <span>调剂</span>
          </button>
          <button
            v-if="!isClosed && editable"
            type="button"
            class="ab-item ab-close"
            :disabled="saving"
            @click="submit(true)"
          >
            <CheckCircleOutlined />
            <span>结案</span>
          </button>
        </template>
      </div>
    </footer>
    <OpActionModal
      v-model:open="transferOpen"
      title="调剂"
      :icon="SwapOutlined"
      tone="primary"
      :width="520"
      ok-text="确定"
      @ok="transfer"
    >
      <div class="op-form registration-transfer-form">
        <div class="op-field op-field--row op-field--row-top">
          <div class="op-label req">调剂方式</div>
          <div class="op-field--row-body">
            <a-radio-group v-model:value="transferScope" class="registration-transfer-scope">
              <a-radio value="same">本组</a-radio>
              <a-radio v-if="canCrossGroupTransfer" value="cross">跨组</a-radio>
            </a-radio-group>
          </div>
        </div>
        <template v-if="transferScope === 'same'">
          <div class="op-field op-field--row">
            <div class="op-label req">处理人</div>
            <a-select
              v-model:value="transferTarget"
              show-search
              :filter-option="filterMemberOption"
              placeholder="请选择处理人"
              :options="transferOptions"
            />
          </div>
        </template>
        <template v-else>
          <div class="op-field op-field--row">
            <div class="op-label req">目标处理组</div>
            <a-select
              v-model:value="transferTargetGroup"
              show-search
              :filter-option="filterMemberOption"
              placeholder="请选择处理组"
              :options="transferGroupOptions"
            />
          </div>
          <div class="op-field op-field--row">
            <div class="op-label req">处理人</div>
            <a-select
              v-model:value="transferTarget"
              show-search
              :filter-option="filterMemberOption"
              :disabled="!transferTargetGroup"
              placeholder="请先选择处理组"
              :options="transferCrossMemberOptions"
            />
          </div>
        </template>
        <div class="op-field op-field--row op-field--row-top">
          <div class="op-label">调剂原因</div>
          <a-textarea v-model:value="transferReason" :rows="2" placeholder="选填，可说明交接原因" :maxlength="TRANSFER_REASON_MAX" show-count />
        </div>
      </div>
    </OpActionModal>
    <OpActionModal
      v-model:open="reminderOpen"
      :title="reminderModalTitle"
      :icon="ClockCircleOutlined"
      tone="primary"
      :width="520"
      ok-text="保存提醒"
      cancel-text="返回"
      @ok="saveReminder"
    >
      <div class="op-form registration-reminder-form">
        <div class="op-field op-field--row">
          <div class="op-label">关联工单</div>
          <div class="readonly-value">{{ record?.no }}</div>
        </div>
        <div class="op-field op-field--row op-field--row-top">
          <div class="op-label req">提醒时间</div>
          <div class="op-field--row-body">
            <RegistrationDateTimePicker v-model:value="reminderAt" placeholder="请选择提醒时间" />
            <div class="reminder-presets">
              <button v-for="minutes in [5, 15, 30]" :key="minutes" type="button" @click="reminderPreset(minutes)">{{ minutes }} 分钟后</button>
            </div>
          </div>
        </div>
        <div class="op-field op-field--row op-field--row-top">
          <div class="op-label">提醒事项</div>
          <a-textarea v-model:value="reminderNote" :rows="3" placeholder="选填，可填写需要跟进的事项" />
        </div>
        <a-button
          v-if="reminderEditId"
          danger
          type="link"
          style="padding: 0; height: auto; align-self: flex-start"
          @click="removeReminder"
        >
          取消本条提醒
        </a-button>
      </div>
    </OpActionModal>
    <a-modal v-model:open="contactOpen" title="外呼联系" ok-text="演示外呼" cancel-text="返回" @ok="recordContact">
      <div class="readonly-value">{{ pendingCallPhone || values.contactPhone }}</div>
      <p class="modal-info">本交互稿仅记录外呼示意，不会拨打真实电话。联系记录与本单关联。</p>
    </a-modal>
  </main>
</template>

<style scoped>
/* 无线音乐登记 · 调剂弹窗：标签左定宽、控件右撑满（口径对齐 OpActionModal .op-field-h） */
.registration-transfer-form .op-field--row {
  flex-direction: row;
  align-items: center;
  gap: 10px;
}
.registration-transfer-form .op-field--row > .op-label {
  flex: none;
  width: 84px;
  text-align: right;
  white-space: nowrap;
}
.registration-transfer-form .op-field--row-top {
  align-items: flex-start;
}
.registration-transfer-form .op-field--row-top > .op-label {
  padding-top: 6px;
}
.registration-transfer-form .op-field--row-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.registration-transfer-form .registration-transfer-scope {
  display: flex;
  align-items: center;
  gap: 10px;
  white-space: nowrap;
}
.registration-transfer-form .registration-transfer-scope :deep(.ant-radio-wrapper) {
  margin: 0 !important;
  margin-inline-end: 0;
  padding: 6px 14px;
  border: 1.5px solid #e5e7eb;
  border-radius: 8px;
  background: #fff;
  font-size: 13px;
  line-height: 1.45;
  color: #374151;
}
.registration-transfer-form .registration-transfer-scope :deep(.ant-radio-wrapper-checked:not(.ant-radio-wrapper-disabled)) {
  border-color: #1a6fff;
  background: #eff6ff;
  color: #1a6fff;
}
.registration-transfer-form .registration-transfer-scope :deep(.ant-radio-wrapper-disabled:not(.ant-radio-wrapper-checked)) {
  color: #c0c4cc;
  background: #f5f7fa;
  border-color: #e4e7ed;
  cursor: not-allowed;
}
.registration-transfer-form .registration-transfer-scope :deep(.ant-radio-wrapper-disabled.ant-radio-wrapper-checked) {
  color: #c0c4cc;
  background: #f5f7fa;
  border-color: #dcdfe6;
}
.registration-transfer-form .registration-transfer-scope :deep(.ant-radio) {
  margin-top: 0;
  top: 0;
}
.registration-transfer-form .registration-transfer-scope :deep(.ant-radio-wrapper:not(.ant-radio-wrapper-checked) .ant-radio-inner) {
  border-color: #d9d9d9;
  background-color: #fff;
}
.registration-transfer-form .registration-transfer-scope :deep(.ant-radio-wrapper-checked:not(.ant-radio-wrapper-disabled) .ant-radio-checked .ant-radio-inner) {
  border-color: #1a6fff;
  background-color: #fff;
}
.registration-transfer-form .registration-transfer-scope :deep(.ant-radio-wrapper-checked:not(.ant-radio-wrapper-disabled) .ant-radio-checked .ant-radio-inner::after) {
  background-color: #1a6fff;
}
.registration-transfer-form .registration-transfer-scope :deep(.ant-radio-wrapper-disabled .ant-radio-inner) {
  background-color: #f5f5f5;
  border-color: #d9d9d9 !important;
}
.registration-transfer-form .registration-transfer-scope :deep(.ant-radio-wrapper-disabled .ant-radio-inner::after) {
  background-color: rgba(0, 0, 0, 0.2);
}
.registration-transfer-form .op-field--row > :deep(.ant-select),
.registration-transfer-form .op-field--row > :deep(.ant-input-textarea) {
  flex: 1;
  min-width: 0;
  width: 100%;
}
.registration-transfer-form .op-field--row > :deep(.ant-input-textarea textarea.ant-input) {
  width: 100%;
}

/* 预约提醒弹窗：与调剂同一套标签左、控件右 */
.registration-reminder-form .op-field--row {
  flex-direction: row;
  align-items: center;
  gap: 10px;
}
.registration-reminder-form .op-field--row > .op-label {
  flex: none;
  width: 84px;
  text-align: right;
  white-space: nowrap;
}
.registration-reminder-form .op-field--row-top {
  align-items: flex-start;
}
.registration-reminder-form .op-field--row-top > .op-label {
  padding-top: 6px;
}
.registration-reminder-form .op-field--row-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.registration-reminder-form .op-field--row > .readonly-value {
  flex: 1;
  min-width: 0;
}
.registration-reminder-form .op-field--row > :deep(.ant-input-textarea),
.registration-reminder-form .op-field--row-body :deep(.registration-datetime-picker) {
  flex: 1;
  min-width: 0;
  width: 100%;
}
.registration-reminder-form .op-field--row > :deep(.ant-input-textarea textarea.ant-input) {
  width: 100%;
}

/* 布局与工单工作台 / OpHeader 对齐 */
.registration-editor {
  --reg-card-shadow: 0 1px 3px rgba(17, 24, 39, 0.07);
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  color: #374151;
  background: #f9fafb;
}
.registration-empty {
  padding: 60px;
  text-align: center;
}
.registration-header {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 16px;
  flex: none;
  padding: 12px 20px;
  background: #fff;
  border-bottom: 1px solid #e5e7eb;
  box-shadow: 0 1px 3px rgba(17, 24, 39, 0.05);
  min-height: 72px;
}
.registration-header.header-compact {
  align-items: center;
  gap: 12px;
  padding: 8px 20px;
  min-height: 0;
}
.registration-header.header-compact .back-link.compact {
  margin-top: 0;
  padding: 2px 0;
  font-size: 12px;
  line-height: 1.2;
}
.registration-header.header-compact .heading-line--single {
  flex: 1;
  min-width: 0;
  flex-wrap: nowrap;
  gap: 8px;
  min-height: 28px;
}
.registration-header.header-compact .heading-line--single h1 {
  max-width: min(360px, 38vw);
  font-size: 15px;
  line-height: 1.25;
}
.registration-header.header-compact .status-chip,
.registration-header.header-compact .template-chip {
  line-height: 20px;
  padding: 0 6px;
  font-size: 11px;
}
.registration-header.header-compact .heading-inline-meta {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex: 1 1 auto;
  min-width: 0;
  justify-content: flex-end;
  margin-left: auto;
  font-size: 11px;
  font-weight: 400;
  color: #6b7280;
  white-space: nowrap;
  line-height: 1.2;
}
.registration-header.header-compact .heading-inline-meta .meta-muted {
  color: #9ca3af;
}
.registration-header.header-compact .heading-inline-meta .copy-link {
  font-size: 11px;
}
/* 已保存工单：与 OpHeader `.oh-left-body` 同构（标题行 + meta 行） */
.heading-record-body {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
  flex: 1;
}
.heading-record-body .title-row {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: nowrap;
  min-height: 24px;
  min-width: 0;
}
.heading-record-body .oh-title {
  font-size: 14px;
  font-weight: 700;
  color: #111827;
  line-height: 1.3;
  min-width: 0;
  flex: 1 1 auto;
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.heading-record-body .reg-status-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex: none;
  height: 24px;
  line-height: 22px;
  padding: 0 8px;
  font-size: 12px;
  font-weight: 600;
}
.heading-record-body .reg-status-badge .badge-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex: none;
  background: #c2410c;
}
.heading-record-body .reg-status-badge.closed .badge-dot {
  background: #059669;
}
.heading-record-body .reg-status-badge.reopened {
  color: #c2410c;
  background: #fff7ed;
  border: 1px solid #fed7aa;
}
.heading-record-body .reg-status-badge.reopened .badge-dot {
  background: #ea580c;
}
.heading-record-body .meta-row {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  font-size: 11px;
  color: #9ca3af;
  line-height: 1.3;
}
.heading-record-body .meta-text {
  flex: 0 1 auto;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.heading-record-body .meta-text--tail {
  flex: none;
}
.heading-record-body .meta-k {
  color: #6b7280;
  font-weight: 600;
}
.heading-record-body .meta-sep-inline {
  color: #d1d5db;
}
.heading-record-body .meta-copy {
  cursor: pointer;
  font-size: 13px;
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  margin: 0;
  padding: 0;
  border: none;
  background: transparent;
  color: inherit;
  line-height: 1;
  border-radius: 4px;
}
.heading-record-body .meta-copy:hover {
  color: #6b7280;
}
.heading-tools--compact {
  flex: none;
  align-items: center;
  padding-left: 12px;
  border-left: 1px solid #e5e7eb;
}
/* 预约提醒：顶栏闹钟芯片（对齐全局提醒紫调） */
.reminder-alarm-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: min(220px, 28vw);
  height: 32px;
  padding: 0 11px 0 9px;
  border: 1px solid #ddd6fe;
  border-radius: 8px;
  background: linear-gradient(180deg, #f5f3ff 0%, #fff 70%);
  color: #6d28d9;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.2;
  cursor: pointer;
  font-family: inherit;
  white-space: nowrap;
  box-shadow: 0 1px 4px rgba(124, 58, 237, 0.14);
  transition: border-color 0.12s, box-shadow 0.12s, background 0.12s;
}
.reminder-alarm-chip.empty {
  color: #7c3aed;
  border-style: dashed;
  border-color: #c4b5fd;
  background: #faf5ff;
  font-weight: 500;
}
.reminder-alarm-chip.has-reminder {
  border-color: #a78bfa;
}
.reminder-alarm-chip.triggered {
  color: #9ca3af;
  border-color: #e5e7eb;
  border-style: solid;
  background: #f9fafb;
  box-shadow: none;
}
.reminder-alarm-chip:hover:not(:disabled) {
  border-color: #8b5cf6;
  box-shadow: 0 2px 8px rgba(124, 58, 237, 0.18);
}
.reminder-alarm-chip:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}
.reminder-alarm-icon {
  flex: none;
  font-size: 16px;
}
.reminder-alarm-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}
:global(.reminder-alarm-popover) {
  max-width: 320px;
}
.reminder-popover-empty {
  margin: 0 0 8px;
  font-size: 12px;
  color: #9ca3af;
}
.reminder-popover-list {
  list-style: none;
  margin: 0 0 8px;
  padding: 0;
  max-height: 220px;
  overflow: auto;
}
.reminder-popover-item + .reminder-popover-item {
  margin-top: 6px;
}
.reminder-popover-row {
  width: 100%;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  background: #fff;
  padding: 8px 10px;
  text-align: left;
  cursor: pointer;
}
.reminder-popover-row:disabled {
  cursor: default;
  background: #f9fafb;
}
.reminder-popover-item.muted .reminder-popover-at,
.reminder-popover-item.muted .reminder-popover-meta,
.reminder-popover-item.muted .reminder-popover-note {
  color: #9ca3af;
}
.reminder-popover-at {
  display: block;
  font-size: 12px;
  font-weight: 600;
  color: #374151;
}
.reminder-popover-meta {
  display: block;
  font-size: 11px;
  color: #6b7280;
  margin-top: 2px;
}
.reminder-popover-note {
  display: block;
  font-size: 11px;
  color: #9ca3af;
  margin-top: 4px;
  white-space: pre-wrap;
}
.reminder-popover-add {
  width: 100%;
  border: 0;
  border-radius: 6px;
  background: #eff6ff;
  color: #1a6fff;
  font-size: 12px;
  padding: 8px 10px;
  cursor: pointer;
}
.reminder-popover-add:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.reminder-alarm-dot {
  flex: none;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #f59e0b;
  box-shadow: 0 0 0 2px rgba(245, 158, 11, 0.25);
}
@media (max-width: 960px) {
  .registration-header.header-compact .heading-line--single {
    flex-wrap: wrap;
  }
  .registration-header.header-compact .heading-inline-meta {
    flex: 1 1 100%;
    margin-left: 0;
    justify-content: flex-start;
    flex-wrap: wrap;
    white-space: normal;
    row-gap: 4px;
  }
}
.back-link,
.copy-link {
  border: 0;
  background: transparent;
  cursor: pointer;
  white-space: nowrap;
  font-family: inherit;
}
.back-link {
  font-size: 13px;
  padding: 4px 0;
  color: #6b7280;
  flex: none;
}
.back-link.compact {
  margin-top: 2px;
  min-width: 52px;
}
.back-link:hover {
  color: #1a6fff;
}
.copy-link {
  font-size: 12px;
  padding: 0 3px;
  color: #9ca3af;
}
.copy-link:hover {
  color: #1a6fff;
}
.heading-main {
  min-width: 0;
  flex: 1;
}
.heading-line {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}
.heading-line h1 {
  font-size: 16px;
  font-weight: 600;
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 450px;
  color: #111827;
}
.status-chip,
.type-chip,
.template-chip {
  font-size: 12px;
  font-weight: 500;
  line-height: 22px;
  padding: 0 8px;
  border-radius: 4px;
  white-space: nowrap;
}
.status-chip {
  background: #fff7ed;
  color: #c2410c;
  border: 1px solid #fed7aa;
}
.status-chip.closed {
  background: #ecfdf5;
  color: #059669;
  border: 1px solid #a7f3d0;
}
.status-chip.draft {
  background: #f9fafb;
  color: #6b7280;
  border: 1px solid #e5e7eb;
  font-weight: 600;
}
.type-chip {
  background: #f3f4f6;
  color: #6b7280;
}
.template-chip {
  background: #eff6ff;
  color: #1a6fff;
  border: 1px solid #bfdbfe;
}
.heading-meta {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
  font-size: 12px;
  color: #9ca3af;
  margin-top: 6px;
}
.header-new .heading-meta {
  align-items: center;
  gap: 10px;
  color: #6b7280;
}
.meta-sep {
  color: #e5e7eb;
  font-size: 11px;
  user-select: none;
}
.meta-muted {
  color: #9ca3af;
}
.new-guide {
  font-size: 13px;
  color: #6b7280;
  margin: 6px 0 0;
  line-height: 1.55;
}
.heading-tools {
  display: flex;
  gap: 18px;
  align-items: center;
  flex: none;
}
.reminder-summary {
  font-size: 11px;
  color: #9ca3af;
  position: relative;
  padding-right: 34px;
}
.reminder-summary span {
  display: block;
}
.reminder-summary strong {
  font-size: 13px;
  font-weight: 600;
  display: block;
  color: #374151;
}
.reminder-summary small {
  display: block;
  font-size: 11px;
}
.reminder-summary button {
  position: absolute;
  right: 0;
  top: 13px;
  background: none;
  border: 0;
  font-size: 12px;
  color: #1a6fff;
  cursor: pointer;
}
.handler-summary {
  padding-left: 16px;
  border-left: 1px solid #e5e7eb;
  font-size: 11px;
  color: #9ca3af;
}
.handler-summary strong {
  display: block;
  font-size: 13px;
  color: #111827;
  font-weight: 600;
  margin-top: 2px;
}
.permission-note {
  flex: none;
  padding: 10px 20px;
  background: #eff6ff;
  color: #4b5563;
  font-size: 13px;
  border-bottom: 1px solid #dbeafe;
}
.registration-scroll {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  margin: 0;
  scroll-behavior: smooth;
  scrollbar-width: thin;
  scrollbar-color: #d1d5db transparent;
}
/* 顶栏双卡独占一行，全宽 50/50；不与底部 244px 侧栏共用栅格，避免右侧空列挤压卡片 */
.registration-top.registration-top--overview {
  flex: none;
  width: 100%;
  min-width: 0;
  padding: 10px 20px 0;
  position: relative;
  z-index: 10;
}
.registration-overview-cards {
  display: flex;
  gap: 12px;
  align-items: stretch;
  width: 100%;
  min-width: 0;
}
.registration-top--overview .ob-cell {
  flex: 1 1 0;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 192px;
  align-self: stretch;
}
.registration-top--overview .ob-cell :deep(.ob-col) {
  flex: 1;
  width: 100%;
  min-height: 0;
}
.registration-top--overview .ob-cell :deep(.registration-fields--paired .pair-field--datetime .field-control) {
  flex: 1 1 auto;
  min-width: 0;
}
.registration-top--overview .ob-cell :deep(.registration-fields--paired .pair-field--datetime .registration-datetime-picker) {
  width: 100%;
  max-width: none;
}
/* 来源字段按业务语义固定成对，避免“具体来源”条件显示时打乱后续行。 */
.registration-top--overview .ob-cell :deep([data-region='source'] [data-field='feedback']) {
  grid-column: 1;
  grid-row: 2;
}
.registration-top--overview .ob-cell :deep([data-region='source'] [data-field='specificSource']) {
  grid-column: 2;
  grid-row: 2;
}
.registration-top--overview .ob-cell :deep([data-region='source'] [data-field='upstreamNo']) {
  grid-column: 1;
  grid-row: 3;
}
.registration-top--overview .ob-cell :deep([data-region='source'] [data-field='timeLimit']) {
  grid-column: 2;
  grid-row: 3;
}
.registration-top--overview .ob-cell :deep([data-region='source'] [data-field='accessTime']) {
  grid-column: 1;
  grid-row: 4;
}
.registration-top--overview .ob-cell :deep([data-region='source'] [data-field='replyTime']) {
  grid-column: 2;
  grid-row: 4;
}
.registration-top--overview .ob-cell :deep([data-region='source'] [data-field='requestType']) {
  grid-column: 1 / -1;
  grid-row: 5;
}
/* 新建页：上双卡 + 工单处理区整体上移 */
.registration-editor.is-new .registration-top.registration-top--overview {
  gap: 10px;
  padding: 6px 8px 0;
}
.registration-editor.is-new .registration-bottom {
  padding: 4px 8px 12px;
  gap: 10px;
  align-items: stretch;
}
.registration-editor.is-new .process-canvas {
  padding: 6px 8px 10px;
}
.registration-editor.is-new .process-sections {
  gap: 8px;
}
.registration-editor.is-new .process-sections :deep(.registration-embedded) {
  padding: 8px 10px 10px;
}
.registration-editor.is-new .process-sections :deep(.registration-fields--paired) {
  gap: 6px 10px;
}
.registration-bottom {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 4px 20px 16px;
  align-items: stretch;
}
/* 与 OpProcessTabs `.process-tabs` / `.tab-bar` / `.tab-content` 同字号与同节奏 */
.body-panel {
  flex: 1 1 auto;
  width: 100%;
  min-width: 0;
  min-height: 0;
  height: 100%;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  box-shadow: var(--reg-card-shadow);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.registration-tabs {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0;
  padding: 0 12px;
  flex: none;
  overflow: visible;
  border-bottom: 1px solid #e5e7eb;
  background: #fafafb;
}
.registration-tabs button {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border: 0;
  background: none;
  color: #6b7280;
  padding: 6px 10px;
  font-size: 12px;
  font-weight: 500;
  line-height: 1.3;
  white-space: nowrap;
  cursor: pointer;
  font-family: inherit;
  margin-bottom: -1px;
  border-bottom: 2px solid transparent;
}
.registration-tabs button:hover {
  color: #374151;
}
.registration-tabs button.active {
  background: #fff;
  border-bottom-color: #1a6fff;
  color: #1a6fff;
  font-weight: 600;
}
.registration-tabs small {
  font-size: 11px;
  font-weight: 600;
  margin-left: 0;
  color: #9ca3af;
}
.registration-tabs button.active small {
  color: #1a6fff;
}
.body-content {
  padding: 12px 12px 16px;
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  min-height: 0;
  font-size: 12px;
  line-height: 1.5;
  color: #374151;
  background: #fff;
}
/* 「工单处理」：整块内容区铺浅灰画布，各 embedded 分区收成白卡 */
.body-content.is-process {
  padding: 0;
  overflow: hidden;
  background: linear-gradient(180deg, #eceef2 0%, #f3f4f6 48%, #f9fafb 100%);
  border-top: 1px solid #e5e7eb;
}
.process-canvas {
  flex: 1 1 auto;
  min-height: 0;
  padding: 6px 10px 12px;
  display: flex;
  flex-direction: column;
  overflow: auto;
}
.process-sections {
  display: flex;
  flex-direction: column;
  flex: none;
  min-height: 0;
  gap: 8px;
}
/* 正文按默认行数展示，较矮窗口由画布滚动，避免处理结果被强制拉高或压缩。 */
.body-content.is-process .process-sections :deep(.registration-embedded) {
  flex: none;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.body-content.is-process .process-sections :deep(.pair-field[data-field='processResult']) {
  grid-column: 1 / -1;
}
.process-sections :deep(.registration-embedded) {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(17, 24, 39, 0.08);
  padding: 8px 10px 10px;
}
/* Tab「工单处理」内不再展示分区灰条标题（配置 title 仍保留）；字段样式与改前主区一致 */
.process-sections :deep(.registration-embedded .registration-fields--paired .pair-field label) {
  width: 72px;
  font-size: 12px;
  font-weight: 500;
  color: #374151;
}
.registration-editor.is-new .process-sections :deep(.registration-embedded .registration-fields--paired .pair-field label) {
  width: 84px;
  flex-shrink: 0;
  line-height: 30px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.process-sections :deep(.registration-embedded .registration-fields--paired) {
  gap: 8px 14px;
}
.registration-top--overview .ob-cell :deep(.registration-fields--paired > .pair-field--contact) {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 8px;
  min-width: 0;
  grid-column: 1 / -1;
  min-height: 30px;
}
.registration-top--overview .ob-cell :deep(.registration-fields--paired > .pair-field--contact > label.pair-field-contact-label) {
  flex: none;
  flex-shrink: 0;
  width: 68px;
  margin-bottom: 0;
  font-size: 12px;
  font-weight: 500;
  color: #374151;
  line-height: 30px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  overflow: hidden;
}
.pair-field-contact-label-icon {
  flex: none;
  font-size: 14px;
  line-height: 1;
  color: #1a6fff;
}
.pair-field-contact-label-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.registration-top--overview .ob-cell :deep(.pair-field--contact .field-control--contact-inline) {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 30px;
}
.registration-top--overview .ob-cell :deep(.pair-field--contact .contact-phone-input) {
  box-sizing: border-box;
  flex: 1 1 auto;
  min-width: 0;
  width: 100%;
  border: 1px solid #d1d5db;
  background: #fff;
  border-radius: 6px;
  min-height: 30px;
  height: 30px;
  padding: 4px 11px;
  font-size: 12px;
  line-height: 1.4;
  color: rgba(0, 0, 0, 0.88);
  font-family: inherit;
}
.registration-top--overview .ob-cell :deep(.pair-field--contact .contact-phone-input:focus) {
  border-color: #1a6fff;
  box-shadow: 0 0 0 2px rgb(26 111 255 / 10%);
  outline: none;
}
.registration-top--overview .ob-cell :deep(.pair-field--contact .contact-phone-input:disabled) {
  background: #f5f5f5;
  border-color: #d9d9d9;
  color: rgba(0, 0, 0, 0.65);
  cursor: not-allowed;
  box-shadow: none;
}
.panel-hint {
  margin: 0;
  font-size: 11px;
  line-height: 1.55;
  color: #9ca3af;
}
.text-action {
  border: 0;
  background: transparent;
  color: #1a6fff;
  font-size: 12px;
  cursor: pointer;
  padding: 3px 0;
  font-family: inherit;
}
.registration-actions.op-actionbar {
  position: sticky;
  bottom: 0;
  z-index: 20;
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 57px;
  padding: 10px 20px;
  background: #fff;
  border-top: 1px solid #e5e7eb;
  box-shadow: 0 -4px 16px rgba(15, 23, 42, 0.06);
}
.action-status {
  flex: 1;
  min-width: 0;
  color: #9ca3af;
  font-size: 12px;
}
.registration-actions .bottom-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 4px;
  flex: none;
  padding: 5px 8px;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  box-shadow: 0 2px 12px rgba(15, 23, 42, 0.08);
}
.registration-actions .ab-item {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  font-size: 14px;
  font-weight: 500;
  color: #1f2937;
  background: transparent;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-family: inherit;
  white-space: nowrap;
  transition: background 0.12s, color 0.12s;
}
.registration-actions .ab-item :deep(.anticon) {
  font-size: 16px;
  color: #4b5563;
}
.registration-actions .ab-item:hover:not(:disabled) {
  background: #f3f4f6;
  color: #1a6fff;
}
.registration-actions .ab-item:hover:not(:disabled) :deep(.anticon) {
  color: #1a6fff;
}
.registration-actions .ab-item:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}
.registration-actions .ab-item.ab-save {
  color: #1a6fff;
  font-weight: 600;
}
.registration-actions .ab-item.ab-save :deep(.anticon) {
  color: #1a6fff;
}
.registration-actions .ab-item.ab-close {
  color: #059669;
  font-weight: 600;
}
.registration-actions .ab-item.ab-close :deep(.anticon) {
  color: #059669;
}
.registration-actions .ab-item.ab-close:hover:not(:disabled) {
  background: #ecfdf5;
  color: #047857;
}
.registration-actions .ab-item.ab-close:hover:not(:disabled) :deep(.anticon) {
  color: #047857;
}
.flow-history {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
}
.flow-history .current-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  background: #f0f7ff;
  border: 1px solid #d6e4ff;
  border-radius: 6px;
  font-size: 12px;
  line-height: 18px;
  flex: none;
}
.flow-history .current-label {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.flow-history .current-prefix {
  color: #374151;
  font-weight: 400;
}
.flow-history .current-value {
  color: #1a6fff;
  font-weight: 600;
}
.flow-history .current-sep {
  color: #9ca3af;
}
.table-scroll {
  overflow: auto;
  min-height: 180px;
}
.table-scroll table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}
.table-scroll th {
  background: #fafafb;
  padding: 11px 12px;
  text-align: left;
  color: #6b7280;
  font-weight: 600;
  white-space: nowrap;
  border-bottom: 1px solid #e5e7eb;
}
.table-scroll td {
  padding: 13px 12px;
  border-bottom: 1px solid #f0f0f0;
  color: #374151;
}
.table-scroll audio {
  width: 190px;
  height: 32px;
}
.muted {
  color: #9ca3af;
}
.readonly-value {
  padding: 8px 11px;
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  font-size: 13px;
  color: #374151;
}
.modal-info {
  font-size: 12px;
  line-height: 1.8;
  background: #eff6ff;
  color: #4b5563;
  border: 1px solid #dbeafe;
  border-radius: 6px;
  padding: 10px 12px;
  margin: 12px 0 0;
}
.reminder-presets {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}
.reminder-presets button {
  border: 1px solid #d1d5db;
  color: #374151;
  border-radius: 6px;
  background: #fff;
  padding: 4px 10px;
  font-size: 12px;
  cursor: pointer;
}
.reminder-presets button:hover {
  border-color: #1a6fff;
  color: #1a6fff;
}
.snapshot-warning {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex: none;
  padding: 10px 20px;
  background: #fffbeb;
  color: #92400e;
  border-bottom: 1px solid #fde68a;
  font-size: 13px;
  line-height: 1.6;
}
.snapshot-warning button {
  flex: none;
  border: 0;
  background: transparent;
  color: #b45309;
  font: inherit;
  cursor: pointer;
  text-decoration: underline;
}
@media (max-width: 1350px) {
  .registration-header {
    padding: 11px 16px;
    gap: 12px;
  }
  .heading-line h1 {
    font-size: 15px;
    max-width: 330px;
  }
  .heading-meta {
    gap: 10px;
    font-size: 11px;
  }
  .heading-tools {
    gap: 12px;
  }
  .registration-top.registration-top--overview,
  .registration-bottom {
    gap: 10px;
    padding-left: 16px;
    padding-right: 16px;
  }
  .body-content {
    padding: 14px;
  }
  .handler-summary {
    padding-left: 12px;
  }
}
@media (max-width: 1080px) {
  .registration-overview-cards {
    flex-direction: column;
  }
  .heading-tools {
    display: none;
  }
}
@media (max-width: 760px) {
  .action-status {
    display: none;
  }
  .registration-actions {
    flex-wrap: wrap;
    justify-content: flex-end;
  }
  .registration-header {
    align-items: flex-start;
  }
  .back-link {
    display: none;
  }
  .heading-line h1 {
    max-width: 100%;
  }
  .registration-top,
  .registration-bottom {
    padding-left: 12px;
    padding-right: 12px;
  }
}
</style>
