import { defineStore } from 'pinia';
import { computed, onScopeDispose, ref, watch } from 'vue';
import { MOCK_USERS } from '@/mock/users';
import { useUserStore } from '@/stores/user';
import { useTenantStore } from '@/stores/tenant';
import {
  WIRELESS_REGISTRATION_TEMPLATE_ID,
  makeRegistrationNo,
  normalizeRegistrationValues,
  registrationNow,
  registrationTemplateOf,
  validateRegistrationValues,
  type RegistrationAttachment,
  type RegistrationHistory,
  type RegistrationOperationResult,
  type RegistrationRecord,
  type RegistrationValues,
} from '@/views/tickets/types/businessRegistration';

const CACHE_VERSION = 1;
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const eventId = () => `registration-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
const failed = (message: string): RegistrationOperationResult => ({ ok: false, message });

/** Independent self-service persistence; ordinary tickets are never read or written. */
export const useBusinessRegistrationStore = defineStore('businessRegistration', () => {
  const user = useUserStore();
  const tenant = useTenantStore();
  const records = ref<RegistrationRecord[]>([]);
  const revision = ref(0);
  const cacheKey = computed(() => `flowos-business-registrations-v${CACHE_VERSION}:${tenant.currentTenantId ?? 'default'}`);

  function recordOf(no: string): RegistrationRecord | undefined { return records.value.find((record) => record.no === no); }
  function resolve(recordOrNo: RegistrationRecord | string): RegistrationRecord | undefined {
    return typeof recordOrNo === 'string' ? recordOf(recordOrNo) : recordOf(recordOrNo.no);
  }
  function inGroup(record: RegistrationRecord): boolean { return user.groups.includes(record.groupName); }
  function canCreate(templateId = WIRELESS_REGISTRATION_TEMPLATE_ID): boolean {
    const template = registrationTemplateOf(templateId);
    return !!template && user.groups.includes(template.groupName);
  }
  function canEdit(recordOrNo: RegistrationRecord | string): boolean {
    const record = resolve(recordOrNo);
    return !!record && inGroup(record) && record.handler === user.name;
  }
  function canTransfer(recordOrNo: RegistrationRecord | string): boolean {
    const record = resolve(recordOrNo);
    return !!record && inGroup(record) && record.status === '处理中';
  }
  function canUpload(recordOrNo: RegistrationRecord | string): boolean {
    const record = resolve(recordOrNo);
    return !!record && inGroup(record);
  }
  function canView(recordOrNo: RegistrationRecord | string): boolean {
    const record = resolve(recordOrNo);
    return !!record && (inGroup(record) || user.canAccess('self-service'));
  }
  function membersFor(recordOrNo: RegistrationRecord | string): string[] {
    const record = resolve(recordOrNo);
    if (!record) return [];
    const members = Object.values(MOCK_USERS).filter((member) => member.groups?.includes(record.groupName)).map((member) => member.name);
    if (inGroup(record)) members.push(user.name);
    return [...new Set(members)];
  }
  function history(action: string, detail: string, changes?: RegistrationHistory['changes']): RegistrationHistory {
    return { id: eventId(), action, detail, actor: user.name, at: registrationNow(), ...(changes?.length ? { changes } : {}) };
  }
  function readPersisted(): RegistrationRecord[] {
    const cache = JSON.parse(localStorage.getItem(cacheKey.value) ?? 'null') as { version?: number; records?: RegistrationRecord[] } | null;
    return cache?.version === CACHE_VERSION && Array.isArray(cache.records)
      ? cache.records.filter((record) => !!registrationTemplateOf(record.templateId) && !!record.no && !!record.values?.businessPhone && ['处理中', '已结案'].includes(record.status))
      : [];
  }
  function commit(record: RegistrationRecord, message: string, creating = false): RegistrationOperationResult {
    let persisted: RegistrationRecord[];
    try { persisted = readPersisted(); } catch { return failed('本地缓存读取失败，请刷新后重试'); }
    const remote = persisted.find((entry) => entry.no === record.no);
    if (creating ? !!remote : !remote || remote.createdAt !== record.createdAt || (remote.revision ?? 0) !== (record.revision ?? 0)) {
      hydrate();
      return failed(creating ? '工单号已由其他页面使用，请重新创建' : '工单已由其他页面更新，请核对最新内容后重试');
    }
    record.revision = (record.revision ?? 0) + 1;
    const next = [record, ...persisted.filter((entry) => entry.no !== record.no)];
    try {
      localStorage.setItem(cacheKey.value, JSON.stringify({ version: CACHE_VERSION, records: next }));
    } catch {
      return failed('本地保存失败，请检查浏览器存储空间后重试');
    }
    records.value = next;
    revision.value += 1;
    return { ok: true, message, record: recordOf(record.no) };
  }
  function hydrate() {
    try {
      records.value = readPersisted();
    } catch { records.value = []; }
    revision.value += 1;
  }
  function create(values: RegistrationValues, options: { close?: boolean; templateId?: string } = {}): RegistrationOperationResult {
    const templateId = options.templateId ?? WIRELESS_REGISTRATION_TEMPLATE_ID;
    const template = registrationTemplateOf(templateId);
    if (!template || !canCreate(templateId)) return failed('仅表单所属处理组成员可创建此工单');
    const normalized = normalizeRegistrationValues(values);
    const errors = validateRegistrationValues(normalized, options.close ? 'close' : 'create', templateId);
    if (Object.keys(errors).length) return { ok: false, message: '请补齐必填信息', errors };
    const createdAt = new Date();
    const now = registrationNow(createdAt);
    const prefix = makeRegistrationNo(1, createdAt).slice(0, -5);
    let persisted: RegistrationRecord[];
    try { persisted = readPersisted(); } catch { return failed('本地缓存读取失败，请刷新后重试'); }
    const sequence = Math.max(0, ...persisted.filter((record) => record.no.startsWith(prefix)).map((record) => Number(record.no.slice(-5)) || 0)) + 1;
    const no = makeRegistrationNo(sequence, createdAt);
    normalized.replyTime = now;
    const record: RegistrationRecord = {
      no, templateId, values: normalized, status: options.close ? '已结案' : '处理中',
      groupId: template.groupId, groupName: template.groupName, builder: user.name, handler: user.name,
      createdAt: now, updatedAt: now, ...(options.close ? { closedAt: now } : {}),
      history: [history('创建工单', `人工登记${template.name}，由建单人自行处理。`)],
      attachments: [], contacts: [], notifications: [],
    };
    if (options.close) record.history.unshift(history('结案', normalized.processResult));
    return commit(record, options.close ? '工单已创建并结案' : '工单已创建，当前由您处理', true);
  }
  function save(no: string, values: RegistrationValues, options: { close?: boolean; revision?: boolean; expectedRevision?: number } = {}): RegistrationOperationResult {
    const previous = recordOf(no);
    if (!previous || !canEdit(no)) return failed('仅当前处理人可修改或结案');
    if (options.expectedRevision === undefined || options.expectedRevision !== (previous.revision ?? 0)) return failed('工单已更新或编辑版本已失效，请重新载入后核对内容再保存');
    if (previous.status === '已结案' && (!options.revision || options.close)) return failed('已结案工单请通过修订记录保存');
    const next = copy(previous);
    const normalized = normalizeRegistrationValues(values);
    const errors = validateRegistrationValues(normalized, options.close || previous.status === '已结案' ? 'close' : 'create', previous.templateId, previous.values);
    if (Object.keys(errors).length) return { ok: false, message: '请补齐必填信息', errors };
    // replyTime and closedAt are historical business times when revising a closed record.
    normalized.replyTime = previous.status === '已结案' ? previous.values.replyTime : registrationNow();
    const changes = registrationTemplateOf(previous.templateId)!.fields.filter((field) => field.key !== 'replyTime' && previous.values[field.key] !== normalized[field.key]).map((field) => ({ field: field.key, label: field.label, before: previous.values[field.key], after: normalized[field.key] }));
    next.values = normalized;
    next.updatedAt = registrationNow();
    if (options.close) {
      next.status = '已结案'; next.closedAt = registrationNow(); delete next.reminder;
      next.history.unshift(history('结案', normalized.processResult, changes));
    } else next.history.unshift(history(previous.status === '已结案' ? '修订已结案记录' : '保存处理记录', previous.status === '已结案' ? '修订内容已保存，原结案及回复时间保持不变。' : normalized.processResult || '已保存工单信息。', changes));
    return commit(next, options.close ? '工单已结案' : previous.status === '已结案' ? '修订已保存，状态保持已结案' : '保存成功');
  }
  function transfer(no: string, target: string, reason = ''): RegistrationOperationResult {
    const previous = recordOf(no);
    if (!previous || !canTransfer(no)) return failed('仅同组成员可调剂已登记且未结案的工单');
    if (target === previous.handler) return failed('请选择其他组内接收人');
    if (!membersFor(no).includes(target)) return failed('调剂接收人必须属于当前处理组');
    const next = copy(previous);
    next.handler = target; next.updatedAt = registrationNow();
    if (next.reminder && !next.reminder.triggeredAt) next.reminder.recipient = target;
    next.history.unshift(history('调剂', `${previous.handler} → ${target}；立即生效，无需接收确认。${reason.trim() ? `\n交接说明：${reason.trim()}` : ''}${next.reminder && !next.reminder.triggeredAt ? `\n保留预约时间 ${next.reminder.at}，改为提醒 ${target}。` : ''}`));
    return commit(next, `已调剂给${target}`);
  }
  function setReminder(no: string, at: string, note = ''): RegistrationOperationResult {
    const previous = recordOf(no);
    if (!previous || !canEdit(no) || previous.status !== '处理中') return failed('仅当前处理人可设置未结案工单的提醒');
    if (!at || !Number.isFinite(new Date(at.replace(' ', 'T')).getTime()) || new Date(at.replace(' ', 'T')).getTime() <= Date.now()) return failed('请选择当前时间之后的提醒时间');
    const next = copy(previous);
    next.reminder = { id: eventId(), at, note: note.trim(), recipient: previous.handler };
    next.updatedAt = registrationNow();
    next.history.unshift(history('设置预约提醒', `提醒时间：${at}；接收人：${previous.handler}${note.trim() ? `；${note.trim()}` : ''}`));
    return commit(next, '预约提醒已设置');
  }
  function cancelReminder(no: string): RegistrationOperationResult {
    const previous = recordOf(no);
    if (!previous || !canEdit(no) || previous.status !== '处理中') return failed('仅当前处理人可修改未结案工单的提醒');
    const next = copy(previous); delete next.reminder; next.updatedAt = registrationNow();
    next.history.unshift(history('取消预约提醒', '已取消本单预约提醒。'));
    return commit(next, '预约提醒已取消');
  }
  function markReminderTriggered(no: string): RegistrationOperationResult {
    const previous = recordOf(no);
    if (!previous?.reminder || previous.reminder.triggeredAt || previous.status !== '处理中' || previous.reminder.recipient !== user.name || !inGroup(previous)) return failed('当前没有待触发的本人提醒');
    if (new Date(previous.reminder.at.replace(' ', 'T')).getTime() > Date.now()) return failed('尚未到提醒时间');
    const next = copy(previous); const now = registrationNow(); next.reminder!.triggeredAt = now;
    next.notifications.unshift({ id: eventId(), at: now, content: `预约提醒：${next.reminder!.note || '请及时处理本单'}`, recipient: user.name, status: '已提醒', kind: 'reminder' });
    return commit(next, '预约提醒已触发');
  }
  function fileUrl(file: File): Promise<string> {
    return new Promise((resolveUrl, reject) => { const reader = new FileReader(); reader.onload = () => resolveUrl(String(reader.result)); reader.onerror = () => reject(new Error('文件读取失败')); reader.readAsDataURL(file); });
  }
  async function addAttachments(no: string, files: File[]): Promise<RegistrationOperationResult> {
    const origin = recordOf(no);
    if (!origin || !canUpload(no)) return failed('仅当前处理组成员可上传附件');
    if (!files.length) return failed('请选择附件');
    const uploadContext = { cacheKey: cacheKey.value, createdAt: origin.createdAt, templateId: origin.templateId, groupId: origin.groupId };
    const uploadedAt = registrationNow(), uploadedBy = user.name;
    let attachments: RegistrationAttachment[];
    try { attachments = await Promise.all(files.map(async (file) => ({ id: eventId(), name: file.name, size: file.size, type: file.type, url: await fileUrl(file), uploadedBy, uploadedAt }))); }
    catch { return failed('附件读取失败，请重试'); }
    const previous = recordOf(no);
    if (cacheKey.value !== uploadContext.cacheKey || !previous || previous.createdAt !== uploadContext.createdAt || previous.templateId !== uploadContext.templateId || previous.groupId !== uploadContext.groupId || !canUpload(no) || user.name !== uploadedBy) return failed('上传期间租户、工单或人员已变更，请重新操作');
    const next = copy(previous); next.attachments.push(...attachments); next.updatedAt = registrationNow();
    next.history.unshift(history('上传附件', attachments.map((attachment) => attachment.name).join('、')));
    return commit(next, '附件已上传');
  }
  function removeAttachment(no: string, attachmentId: string): RegistrationOperationResult {
    const previous = recordOf(no), attachment = previous?.attachments.find((item) => item.id === attachmentId);
    if (!previous || !canUpload(no) || !attachment || attachment.uploadedBy !== user.name) return failed('仅可删除本人上传的附件');
    const next = copy(previous); next.attachments = next.attachments.filter((item) => item.id !== attachmentId); next.updatedAt = registrationNow();
    next.history.unshift(history('删除本人附件', attachment.name));
    return commit(next, '附件已删除');
  }
  function recordContact(no: string, phone: string): RegistrationOperationResult {
    const previous = recordOf(no);
    if (!previous || !canEdit(no) || previous.status !== '处理中') return failed('仅当前处理人可联系未结案工单用户');
    if (!phone.trim()) return failed('请填写联系号码');
    const next = copy(previous), now = registrationNow();
    next.contacts.unshift({ id: eventId(), phone: phone.trim(), actor: user.name, at: now, result: '已发起外呼（演示）' });
    next.history.unshift(history('外呼联系', `通过本单联系号码 ${phone.trim()} 发起外呼。`)); next.updatedAt = now;
    return commit(next, '已记录本单外呼示意，未拨打真实电话');
  }
  function recordMaterialInvite(no: string, phone: string): RegistrationOperationResult {
    const previous = recordOf(no);
    if (!previous || !canEdit(no) || previous.status !== '处理中') return failed('仅当前处理人可收集未结案工单材料');
    if (!phone.trim()) return failed('请填写材料邀请接收号码');
    const next = copy(previous), now = registrationNow();
    next.notifications.unshift({ id: eventId(), at: now, content: '客户材料上传邀请（客服名称待业务提供）', recipient: phone.trim(), status: '发送示意', kind: 'material' });
    next.history.unshift(history('收集客户材料', `向 ${phone.trim()} 发出材料上传邀请示意。`)); next.updatedAt = now;
    return commit(next, '已记录材料邀请示意，未发送真实短信');
  }

  hydrate();
  watch(() => tenant.currentTenantId, hydrate);
  if (typeof window !== 'undefined') {
    const onStorage = (event: StorageEvent) => { if (event.key === null || event.key === cacheKey.value) hydrate(); };
    window.addEventListener('storage', onStorage);
    onScopeDispose(() => window.removeEventListener('storage', onStorage));
  }
  return { records, revision, recordOf, canCreate, canView, canEdit, canTransfer, canUpload, membersFor, create, save, transfer, setReminder, cancelReminder, markReminderTriggered, addAttachments, removeAttachment, recordContact, recordMaterialInvite, hydrate };
});
