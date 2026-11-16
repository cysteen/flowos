import { defineStore } from 'pinia';
import { computed, onScopeDispose, ref, watch } from 'vue';
import { MOCK_USERS } from '@/mock/users';
import { useUserStore } from '@/stores/user';
import { useTenantStore } from '@/stores/tenant';
import {
  REGISTRATION_SEED_RECORDS, REGISTRATION_DEMO_REMINDER_PACK, REGISTRATION_DEMO_REMINDER_PACK_VERSION,
  REGISTRATION_DEMO_REMINDER_TICKET_NO, type RegistrationSeedRecord,
} from '@/mock/registration/seedRecords';
import {
  WIRELESS_REGISTRATION_TEMPLATE_ID,
  WIRELESS_REGISTRATION_GROUP_ID,
  WIRELESS_REGISTRATION_GROUP_NAME,
  makeRegistrationNo,
  normalizeRegistrationValues,
  registrationNow,
  registrationTemplateOf,
  validateRegistrationValues,
  hydrateRegistrationReminders,
  pendingRegistrationReminders,
  registrationPendingReopenNotice,
  registrationReopenNotification,
  type RegistrationAttachment,
  type RegistrationHistory,
  type RegistrationOperationResult,
  type RegistrationRecord,
  type RegistrationReminder,
  type RegistrationValues,
} from '@/views/tickets/types/businessRegistration';
import {
  CROSS_GROUP_TRANSFER_ROLES,
  PROCESSING_GROUPS,
  REGISTRATION_REOPEN_ROLES,
} from '@/views/tickets/composables/opActions';
import { buildCallContactSummary, type CallSession } from '@/stores/cti';
import { formatRegistrationAmount } from '@/views/tickets/utils/registrationAmount';

const CACHE_VERSION = 1;
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const eventId = () => `registration-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
const failed = (message: string): RegistrationOperationResult => ({ ok: false, message });

function isFutureReminderAt(at: string): boolean {
  return !!at && Number.isFinite(new Date(at.replace(' ', 'T')).getTime())
    && new Date(at.replace(' ', 'T')).getTime() > Date.now();
}

function syncPendingTransferRecipients(record: RegistrationRecord, previousRecipient: string, recipient: string): void {
  for (const reminder of pendingRegistrationReminders(record.reminders)) reminder.recipient = recipient;
  const reopenNotice = registrationPendingReopenNotice(record, previousRecipient);
  if (reopenNotice) reopenNotice.recipient = recipient;
}

function reminderTransferTail(reminders: RegistrationReminder[] | undefined): string {
  const pending = pendingRegistrationReminders(reminders);
  if (!pending.length) return '';
  if (pending.length === 1) return `\n保留预约时间 ${pending[0].at}，改为提醒 ${pending[0].recipient}。`;
  return `\n保留 ${pending.length} 条未触发提醒，接收人改为 ${pending[0].recipient}。`;
}

function stampCallTime(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** 自建单跨组调剂可选处理组（与 MOCK 用户名册、标准工单五组 + 无线音乐组同源） */
const REGISTRATION_CROSS_GROUPS = [...new Set([...PROCESSING_GROUPS, WIRELESS_REGISTRATION_GROUP_NAME])] as const;

const REGISTRATION_GROUP_ID_BY_NAME: Record<string, string> = {
  [WIRELESS_REGISTRATION_GROUP_NAME]: WIRELESS_REGISTRATION_GROUP_ID,
  受理一组: 'cs-1',
  受理二组: 'cs-2',
  硬件缺陷组: 'hardware',
  教育支持组: 'edu',
  技术支持组: 'tech',
};

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
  function isRegistrationHandler(record: RegistrationRecord): boolean {
    if (!inGroup(record)) return false;
    if (!record.handler.trim()) return true;
    return record.handler.trim() === user.name;
  }
  function canCreate(templateId = WIRELESS_REGISTRATION_TEMPLATE_ID): boolean {
    const template = registrationTemplateOf(templateId);
    return !!template && user.groups.includes(template.groupName);
  }
  function canEditDraft(record: RegistrationRecord): boolean {
    if (!inGroup(record) || record.status !== '草稿') return false;
    if (record.builder === user.name) return true;
    return isRegistrationHandler(record);
  }
  function canEdit(recordOrNo: RegistrationRecord | string): boolean {
    const record = resolve(recordOrNo);
    if (!record) return false;
    if (record.status === '草稿') return canEditDraft(record);
    return record.status === '处理中' && isRegistrationHandler(record);
  }
  function canRevise(recordOrNo: RegistrationRecord | string): boolean {
    const record = resolve(recordOrNo);
    return !!record && record.status === '已结案' && isRegistrationHandler(record);
  }
  function canTransfer(recordOrNo: RegistrationRecord | string): boolean {
    const record = resolve(recordOrNo);
    return !!record && record.status === '处理中' && isRegistrationHandler(record);
  }
  function canUpload(recordOrNo: RegistrationRecord | string): boolean {
    const record = resolve(recordOrNo);
    return !!record && inGroup(record);
  }
  function canView(recordOrNo: RegistrationRecord | string): boolean {
    const record = resolve(recordOrNo);
    return !!record && (inGroup(record) || user.canAccess('self-service'));
  }
  function membersForGroup(groupName: string): string[] {
    const members = Object.values(MOCK_USERS)
      .filter((member) => member.groups?.includes(groupName))
      .map((member) => member.name);
    if (user.groups.includes(groupName)) members.push(user.name);
    return [...new Set(members)];
  }
  function membersFor(recordOrNo: RegistrationRecord | string): string[] {
    const record = resolve(recordOrNo);
    if (!record) return [];
    return membersForGroup(record.groupName);
  }
  function canCrossGroupTransfer(): boolean {
    return CROSS_GROUP_TRANSFER_ROLES.includes(user.roleKey);
  }
  function canReopenByLeader(recordOrNo: RegistrationRecord | string): boolean {
    const record = resolve(recordOrNo);
    if (!record || record.status !== '已结案') return false;
    if (!(REGISTRATION_REOPEN_ROLES as readonly string[]).includes(user.roleKey)) return false;
    return inGroup(record);
  }
  function transferTargetGroups(currentGroupName?: string): { value: string; label: string }[] {
    return REGISTRATION_CROSS_GROUPS
      .filter((name) => name !== currentGroupName)
      .map((name) => ({ value: name, label: name }));
  }
  function history(action: string, detail: string, changes?: RegistrationHistory['changes']): RegistrationHistory {
    return { id: eventId(), action, detail, actor: user.name, at: registrationNow(), ...(changes?.length ? { changes } : {}) };
  }
  function sanitizeRecord(record: RegistrationRecord): RegistrationRecord {
    return hydrateRegistrationReminders(record);
  }
  function readPersisted(): RegistrationRecord[] {
    const cache = JSON.parse(localStorage.getItem(cacheKey.value) ?? 'null') as { version?: number; records?: RegistrationRecord[] } | null;
    return cache?.version === CACHE_VERSION && Array.isArray(cache.records)
      ? cache.records
        .filter((record) => !!registrationTemplateOf(record.templateId) && !!record.no
          && (record.status === '草稿' || !!record.values?.businessPhone)
          && ['草稿', '处理中', '已结案'].includes(record.status))
        .map(sanitizeRecord)
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
  function seedIfEmpty(persisted: RegistrationRecord[]): RegistrationRecord[] {
    if (persisted.length) return persisted;
    try {
      const seeded = REGISTRATION_SEED_RECORDS.map((record) => copy(record));
      localStorage.setItem(cacheKey.value, JSON.stringify({ version: CACHE_VERSION, records: seeded }));
      return seeded;
    } catch {
      return [];
    }
  }
  /** Only expand the original untouched demo scenario, once; consumed items never return. */
  function supplementDemoReminderPack(): void {
    try {
      const original = localStorage.getItem(cacheKey.value);
      const cache = JSON.parse(original ?? 'null') as { version?: number; records?: RegistrationSeedRecord[] } | null;
      if (cache?.version !== CACHE_VERSION || !Array.isArray(cache.records)) return;
      const index = cache.records.findIndex((record) => (
        record.no === REGISTRATION_DEMO_REMINDER_TICKET_NO
        && record.templateId === WIRELESS_REGISTRATION_TEMPLATE_ID
        && record.values?.businessPhone === '13912345001'
        && record.values?.productName === '乐响铃声'
        && record.createdAt === '2026-11-13 08:20:11'
        && record.builder === '张三' && record.handler === '张三' && record.status === '处理中'
        && record.groupId === WIRELESS_REGISTRATION_GROUP_ID
        && record.history?.some((item) => item.id === `seed-hist-${REGISTRATION_DEMO_REMINDER_TICKET_NO}`)
        && !record.history.some((item) => ['调剂', '调剂到组', '跨组调剂', '结案', '退回重开'].includes(item.action))
      ));
      if (index < 0 || (cache.records[index]!.demoReminderPackVersion ?? 0) >= REGISTRATION_DEMO_REMINDER_PACK_VERSION) return;
      const next = copy(cache.records[index]!);
      const existingIds = new Set((next.reminders ?? []).map((item) => item.id));
      // The original reminder may have been consumed or cancelled: never recreate or rewrite it.
      next.reminders = [
        ...(next.reminders ?? []),
        ...REGISTRATION_DEMO_REMINDER_PACK.slice(1).filter((item) => !existingIds.has(item.id)).map((item) => copy(item)),
      ];
      next.demoReminderPackVersion = REGISTRATION_DEMO_REMINDER_PACK_VERSION;
      next.revision = (next.revision ?? 0) + 1;
      const nextRecords = cache.records.map((record, at) => at === index ? next : record);
      // Preserve other records and cache metadata, and do not overwrite a detected concurrent change.
      if (localStorage.getItem(cacheKey.value) !== original) return;
      localStorage.setItem(cacheKey.value, JSON.stringify({ ...cache, records: nextRecords }));
    } catch { /* A failed demo upgrade leaves the existing cache available and unchanged. */ }
  }
  function hydrate() {
    try {
      supplementDemoReminderPack();
      records.value = seedIfEmpty(readPersisted());
    } catch { records.value = []; }
    revision.value += 1;
  }
  function create(
    values: RegistrationValues,
    options: {
      close?: boolean;
      draft?: boolean;
      templateId?: string;
      descriptionAttachments?: string[];
      processResultAttachments?: string[];
    } = {},
  ): RegistrationOperationResult {
    const templateId = options.templateId ?? WIRELESS_REGISTRATION_TEMPLATE_ID;
    const template = registrationTemplateOf(templateId);
    if (!template || !canCreate(templateId)) return failed('仅表单所属处理组成员可创建此工单');
    const normalized = normalizeRegistrationValues(values);
    const stage = options.close ? 'close' : options.draft ? 'draft' : 'create';
    const errors = validateRegistrationValues(normalized, stage, templateId);
    if (Object.keys(errors).length) return { ok: false, message: '请检查标注的字段信息', errors };
    const createdAt = new Date();
    const now = registrationNow(createdAt);
    const prefix = makeRegistrationNo(1, createdAt).slice(0, -5);
    let persisted: RegistrationRecord[];
    try { persisted = readPersisted(); } catch { return failed('本地缓存读取失败，请刷新后重试'); }
    const sequence = Math.max(0, ...persisted.filter((record) => record.no.startsWith(prefix)).map((record) => Number(record.no.slice(-5)) || 0)) + 1;
    const no = makeRegistrationNo(sequence, createdAt);
    if (options.close && !normalized.replyTime.trim()) normalized.replyTime = now;
    const status: RegistrationRecord['status'] = options.close ? '已结案' : options.draft ? '草稿' : '处理中';
    const record: RegistrationRecord = {
      no, templateId, values: normalized, status,
      groupId: template.groupId, groupName: template.groupName, builder: user.name, handler: user.name,
      createdAt: now, updatedAt: now, ...(options.close ? { closedAt: now } : {}),
      history: [history(options.draft ? '保存草稿' : '创建工单', options.draft
        ? `暂存${template.name}草稿，可稍后继续填写或创建并处理。`
        : `人工登记${template.name}，由建单人自行处理。`)],
      attachments: [], contacts: [], notifications: [],
      ...(options.descriptionAttachments?.length ? { descriptionAttachments: [...options.descriptionAttachments] } : {}),
      ...(options.processResultAttachments?.length ? { processResultAttachments: [...options.processResultAttachments] } : {}),
    };
    if (options.close) record.history.unshift(history('结案', normalized.processResult));
    return commit(record, options.close ? '工单已创建并结案' : options.draft ? '草稿已保存' : '工单已创建，当前由您处理', true);
  }
  function save(
    no: string,
    values: RegistrationValues,
    options: {
      close?: boolean;
      draft?: boolean;
      promote?: boolean;
      revision?: boolean;
      expectedRevision?: number;
      descriptionAttachments?: string[];
      processResultAttachments?: string[];
    } = {},
  ): RegistrationOperationResult {
    const previous = recordOf(no);
    if (!previous) return failed('未找到工单');
    if (previous.status === '已结案') {
      if (!canRevise(no)) return failed('仅当前处理人可修订已结案工单');
    } else if (!canEdit(no)) return failed('仅当前处理人可修改或结案');
    if (options.expectedRevision === undefined || options.expectedRevision !== (previous.revision ?? 0)) return failed('工单已更新或编辑版本已失效，请重新载入后核对内容再保存');
    if (previous.status === '已结案' && (!options.revision || options.close)) return failed('已结案工单请通过修订记录保存');
    const next = copy(previous);
    if (!next.handler.trim()) next.handler = user.name;
    const normalized = normalizeRegistrationValues(values);
    const stayingDraft = previous.status === '草稿' && options.draft && !options.close && !options.promote;
    const promoteFromDraft = previous.status === '草稿' && options.promote && !options.close;
    const validateStage = options.close || previous.status === '已结案'
      ? 'close'
      : stayingDraft
        ? 'draft'
        : 'create';
    const errors = validateRegistrationValues(normalized, validateStage, previous.templateId, previous.values);
    if (Object.keys(errors).length) return { ok: false, message: '请检查标注的字段信息', errors };
    if (options.close && !normalized.replyTime.trim()) normalized.replyTime = registrationNow();
    const changes = registrationTemplateOf(previous.templateId)!.fields.filter((field) => (
      field.key === 'refundAmount' ? formatRegistrationAmount(previous.values[field.key]) : previous.values[field.key]
    ) !== normalized[field.key]).map((field) => ({ field: field.key, label: field.label, before: previous.values[field.key], after: normalized[field.key] }));
    next.values = normalized;
    if (options.descriptionAttachments) next.descriptionAttachments = [...options.descriptionAttachments];
    if (options.processResultAttachments) next.processResultAttachments = [...options.processResultAttachments];
    next.updatedAt = registrationNow();
    if (options.close) {
      next.status = '已结案'; next.closedAt = registrationNow(); delete next.reminders; delete next.reopenedAt;
      if (previous.status === '草稿' && !previous.history.some((entry) => entry.action === '创建工单')) {
        next.history.unshift(history('创建工单', '由草稿创建并结案。'));
      }
      next.history.unshift(history('结案', normalized.processResult, changes));
    } else if (promoteFromDraft) {
      next.status = '处理中';
      next.history.unshift(history('创建工单', '由草稿创建并处理。', changes));
    } else if (stayingDraft) {
      next.status = '草稿';
      next.history.unshift(history('保存草稿', '草稿内容已更新。', changes));
    } else {
      next.history.unshift(history(previous.status === '已结案' ? '修订已结案记录' : '保存处理记录', previous.status === '已结案' ? '修订内容已保存，状态保持已结案，原结案时间保持不变。' : normalized.processResult || '已保存工单信息。', changes));
    }
    const message = options.close
      ? '工单已结案'
      : promoteFromDraft
        ? '工单已创建并处理'
        : stayingDraft
          ? '草稿已保存'
          : previous.status === '已结案'
            ? '修订已保存，状态保持已结案'
            : '保存成功';
    return commit(next, message);
  }
  function reopenByLeader(no: string, reason: string, remark = ''): RegistrationOperationResult {
    const previous = recordOf(no);
    if (!previous || !canReopenByLeader(no)) return failed('仅班组长可将本组已结案工单退回重开');
    if (!reason.trim()) return failed('请选择退回原因');
    const next = copy(previous);
    const handler = previous.handler.trim() || previous.builder;
    next.status = '处理中';
    delete next.closedAt;
    next.reopenedAt = registrationNow();
    next.updatedAt = registrationNow();
    const reasonLine = reason.trim();
    const remarkLine = remark.trim();
    const detail = [
      '状态：已结案 → 处理中',
      `处理人保持 ${handler}`,
      `退回原因：${reasonLine}`,
      ...(remarkLine ? [`补充说明：${remarkLine}`] : []),
    ].join('\n');
    next.history.unshift(history('退回重开', detail));
    const now = registrationNow();
    next.notifications = next.notifications.map((item) => (
      item.recipient === handler && item.status === '待处理' && registrationReopenNotification(item)
        ? { ...item, status: '已被新退回替代' }
        : item
    ));
    next.notifications.unshift({
      id: eventId(),
      at: now,
      content: `班组长退回重开：${reasonLine}${remarkLine ? `；${remarkLine}` : ''}`,
      recipient: handler,
      status: '待处理',
      kind: 'reopen',
    });
    return commit(next, `已退回重开，待 ${handler} 处理`);
  }
  function acknowledgeReopenNotice(no: string, notificationId: string): RegistrationOperationResult {
    const previous = recordOf(no);
    if (!previous) return failed('未找到工单');
    const target = previous.notifications.find((item) => item.id === notificationId);
    if (!target || target.recipient !== user.name) return failed('未找到待跟进的退回通知');
    if (target.status !== '待处理') return { ok: true, message: '已知晓', record: previous };
    const next = copy(previous);
    next.notifications = next.notifications.map((item) => item.id === notificationId
      ? { ...item, status: '已知晓' }
      : item);
    next.updatedAt = registrationNow();
    return commit(next, '已标记退回通知为已知晓');
  }
  function transfer(no: string, target: string, reason = ''): RegistrationOperationResult {
    const previous = recordOf(no);
    if (!previous || !canTransfer(no)) return failed('仅当前处理人可调剂未结案的工单');
    if (target === previous.handler) return failed('请选择其他组内接收人');
    if (!membersFor(no).includes(target)) return failed('调剂接收人必须属于当前处理组');
    const next = copy(previous);
    next.handler = target; next.updatedAt = registrationNow();
    syncPendingTransferRecipients(next, previous.handler.trim() || previous.builder, target);
    next.history.unshift(history('调剂', `本组内调剂：${previous.handler} → ${target}；立即生效，无需接收确认。${reason.trim() ? `\n交接说明：${reason.trim()}` : ''}${reminderTransferTail(next.reminders)}`));
    return commit(next, `已调剂给${target}`);
  }
  function transferCrossGroup(no: string, targetGroup: string, targetHandler: string, reason = ''): RegistrationOperationResult {
    const previous = recordOf(no);
    if (!previous || !canTransfer(no)) return failed('仅当前处理人可调剂未结案的工单');
    if (!canCrossGroupTransfer()) return failed('当前角色仅可进行本组内调剂');
    if (!targetGroup.trim() || targetGroup === previous.groupName) return failed('跨组调剂须选择其他处理组');
    const groupId = REGISTRATION_GROUP_ID_BY_NAME[targetGroup];
    if (!groupId || !REGISTRATION_CROSS_GROUPS.some((name) => name === targetGroup)) {
      return failed('无效的目标处理组');
    }
    if (!targetHandler.trim() || targetHandler === previous.handler) return failed('请选择其他接收人');
    if (!membersForGroup(targetGroup).includes(targetHandler)) return failed('调剂接收人必须属于目标处理组');
    const next = copy(previous);
    next.groupId = groupId;
    next.groupName = targetGroup;
    next.handler = targetHandler;
    next.updatedAt = registrationNow();
    syncPendingTransferRecipients(next, previous.handler.trim() || previous.builder, targetHandler);
    const reminderTail = reminderTransferTail(next.reminders);
    const reasonTail = reason.trim() ? `\n交接说明：${reason.trim()}` : '';
    next.history.unshift(history(
      '跨组调剂',
      `跨组调剂：${previous.groupName} · ${previous.handler} → ${targetGroup} · ${targetHandler}；立即生效，无需接收确认。${reasonTail}${reminderTail}`,
    ));
    return commit(next, `已跨组调剂给${targetHandler}（${targetGroup}）`);
  }
  function addReminder(no: string, at: string, note = ''): RegistrationOperationResult {
    const previous = recordOf(no);
    if (!previous || !canEdit(no) || previous.status !== '处理中') return failed('仅当前处理人可设置未结案工单的提醒');
    if (!isFutureReminderAt(at)) return failed('请选择当前时间之后的提醒时间');
    const next = copy(previous);
    const item: RegistrationReminder = { id: eventId(), at, note: note.trim(), recipient: previous.handler };
    next.reminders = [...(previous.reminders ?? []), item];
    next.updatedAt = registrationNow();
    next.history.unshift(history('新增预约提醒', `提醒时间：${at}；接收人：${previous.handler}${note.trim() ? `；${note.trim()}` : ''}`));
    return commit(next, '预约提醒已添加');
  }
  function updateReminder(no: string, id: string, at: string, note = ''): RegistrationOperationResult {
    const previous = recordOf(no);
    if (!previous || !canEdit(no) || previous.status !== '处理中') return failed('仅当前处理人可修改未结案工单的提醒');
    const target = previous.reminders?.find((item) => item.id === id);
    if (!target) return failed('未找到该条预约提醒');
    if (target.triggeredAt) return failed('已触发的提醒不可修改');
    if (!isFutureReminderAt(at)) return failed('请选择当前时间之后的提醒时间');
    const next = copy(previous);
    next.reminders = (previous.reminders ?? []).map((item) => item.id === id
      ? { ...item, at, note: note.trim() }
      : item);
    next.updatedAt = registrationNow();
    next.history.unshift(history('修改预约提醒', `提醒时间：${at}；接收人：${target.recipient}${note.trim() ? `；${note.trim()}` : ''}`));
    return commit(next, '预约提醒已更新');
  }
  /** @deprecated 兼容旧脚本；等同于 addReminder */
  function setReminder(no: string, at: string, note = ''): RegistrationOperationResult {
    return addReminder(no, at, note);
  }
  function cancelReminder(no: string, id: string): RegistrationOperationResult {
    const previous = recordOf(no);
    if (!previous || !canEdit(no) || previous.status !== '处理中') return failed('仅当前处理人可修改未结案工单的提醒');
    const target = previous.reminders?.find((item) => item.id === id);
    if (!target) return failed('未找到该条预约提醒');
    if (target.triggeredAt) return failed('已触发的提醒不可取消');
    const next = copy(previous);
    next.reminders = (previous.reminders ?? []).filter((item) => item.id !== id);
    if (!next.reminders.length) delete next.reminders;
    next.updatedAt = registrationNow();
    const atLabel = target.at.replace('T', ' ');
    next.history.unshift(history('取消预约提醒', `已取消提醒时间 ${atLabel}。`));
    return commit(next, '预约提醒已取消');
  }
  function markReminderTriggered(no: string, id: string): RegistrationOperationResult {
    const previous = recordOf(no);
    const target = previous?.reminders?.find((item) => item.id === id);
    if (!previous || !target || target.triggeredAt || previous.status !== '处理中'
      || target.recipient !== user.name || !inGroup(previous)) return failed('当前没有待触发的本人提醒');
    if (new Date(target.at.replace(' ', 'T')).getTime() > Date.now()) return failed('尚未到提醒时间');
    const next = copy(previous); const now = registrationNow();
    next.reminders = (previous.reminders ?? []).map((item) => item.id === id ? { ...item, triggeredAt: now } : item);
    const noteTail = target.note.trim() ? `；${target.note.trim()}` : '';
    next.notifications.unshift({ id: eventId(), at: now, content: `预约提醒：${target.note || '请及时处理本单'}`, recipient: user.name, status: '已提醒', kind: 'reminder' });
    next.history.unshift(history('预约提醒触发', `提醒时间：${target.at}；接收人：${target.recipient}${noteTail}`));
    next.updatedAt = now;
    return commit(next, '预约提醒已触发');
  }
  function acknowledgeReminder(no: string, id: string): RegistrationOperationResult {
    const previous = recordOf(no);
    const target = previous?.reminders?.find((item) => item.id === id);
    if (!previous || previous.status !== '处理中' || !canEdit(no)
      || !target || target.recipient !== user.name) return failed('当前没有待知晓的本人提醒');
    if (!target.triggeredAt) return failed('提醒尚未触发，不能标记为已知晓');
    if (target.acknowledgedAt) return { ok: true, message: '已知晓', record: previous };
    const next = copy(previous);
    const now = registrationNow();
    next.reminders = (next.reminders ?? []).map((item) => item.id === id ? { ...item, acknowledgedAt: now } : item);
    next.updatedAt = now;
    return commit(next, '预约提醒已标记为已知晓');
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
  function appendCallContact(
    previous: RegistrationRecord,
    phone: string,
    session: Pick<CallSession, 'status' | 'connectedAt' | 'startedAt' | 'holdAccumMs' | 'held' | 'holdSince'>,
    endedAt: number,
  ): RegistrationRecord {
    const next = copy(previous);
    const connected = session.status === 'connected' && session.connectedAt != null;
    const trimmed = phone.trim();
    const endedStamp = stampCallTime(endedAt);
    const startedStamp = stampCallTime(session.startedAt);
    const contact = {
      id: eventId(),
      phone: trimmed,
      actor: user.name,
      at: endedStamp,
      result: connected ? '接通' : '未接通',
      summary: buildCallContactSummary(trimmed, session, endedAt),
      callSpan: {
        startedAt: startedStamp,
        connectedAt: connected && session.connectedAt ? stampCallTime(session.connectedAt) : undefined,
        endedAt: endedStamp,
      },
      ...(connected ? { recording: { progress: '00:00 / —', progressPercent: 0 } } : {}),
    };
    next.contacts.unshift(contact);
    const detail = connected
      ? `已接通客户 ${trimmed}，通话已记入本单联系记录。`
      : `呼叫 ${trimmed} 未接通，已记入本单联系记录。`;
    next.history.unshift(history(connected ? '外呼联系' : '外呼', detail));
    next.updatedAt = endedStamp;
    return next;
  }

  /** CTI 外呼挂断后写入本单联系记录（与标准工单联系 Tab 同源逻辑） */
  function recordContactFromCallSession(no: string, session: CallSession, endedAt: number): RegistrationOperationResult {
    const previous = recordOf(no);
    if (!previous || !canEdit(no) || previous.status !== '处理中') {
      return failed('仅当前处理人可联系未结案工单用户');
    }
    if (session.status === 'dialing') return failed('拨号取消不落联系记录');
    return commit(
      appendCallContact(previous, session.phone, session, endedAt),
      '已写入本单外呼联系记录',
    );
  }

  /** 弹窗「演示外呼」：模拟接通并写入完整时刻段 */
  function recordContact(no: string, phone: string): RegistrationOperationResult {
    const previous = recordOf(no);
    if (!previous || !canEdit(no) || previous.status !== '处理中') return failed('仅当前处理人可联系未结案工单用户');
    if (!phone.trim()) return failed('请填写联系号码');
    const endedAt = Date.now();
    const startedAt = endedAt - 138_000;
    const connectedAt = startedAt + 7_000;
    const session: Pick<CallSession, 'status' | 'connectedAt' | 'startedAt' | 'holdAccumMs' | 'held' | 'holdSince'> = {
      status: 'connected',
      startedAt,
      connectedAt,
      holdAccumMs: 0,
      held: false,
      holdSince: null,
    };
    return commit(
      appendCallContact(previous, phone, session, endedAt),
      '已记录本单外呼示意，未拨打真实电话',
    );
  }
  function recordMaterialInvite(no: string, phone: string): RegistrationOperationResult {
    return recordSms(no, phone, '客户材料上传邀请', '请上传材料', true);
  }
  function recordSms(no: string, phone: string, content: string, templateName: string, attachInvite = false): RegistrationOperationResult {
    const previous = recordOf(no);
    if (!previous || !canEdit(no) || previous.status !== '处理中') {
      return failed(attachInvite ? '仅当前处理人可收集未结案工单材料' : '仅当前处理人可向未结案工单客户发短信');
    }
    if (!phone.trim()) return failed('请填写接收号码');
    const next = copy(previous), now = registrationNow();
    const summary = attachInvite ? `模板：${templateName} | 已发送附件上传链接` : `模板：${templateName}`;
    next.notifications.unshift({
      id: eventId(), at: now, content: content.trim(), recipient: phone.trim(),
      status: '发送成功（演示）', kind: attachInvite ? 'material' : 'sms',
    });
    next.history.unshift(history(
      attachInvite ? '收集客户材料' : '发送短信',
      `向 ${phone.trim()} 发送短信示意。${summary}`,
    ));
    next.updatedAt = now;
    return commit(next, attachInvite ? '已记录材料上传邀请（含链接），未发送真实短信' : '已记录短信发送示意，未发送真实短信');
  }
  function recordEmail(no: string, to: string, subject: string, body: string, templateCode: string): RegistrationOperationResult {
    const previous = recordOf(no);
    if (!previous || !canEdit(no) || previous.status !== '处理中') {
      return failed('仅当前处理人可向未结案工单客户发邮件');
    }
    if (!to.trim()) return failed('请填写收件邮箱');
    const next = copy(previous), now = registrationNow();
    const preview = body.trim().length > 80 ? `${body.trim().slice(0, 80)}…` : body.trim();
    next.notifications.unshift({
      id: eventId(), at: now, content: `${subject.trim()}：${preview}`, recipient: to.trim(),
      status: '发送成功（演示）', kind: 'email',
    });
    next.history.unshift(history('发送邮件', `向 ${to.trim()} 发送邮件示意。主题：${subject.trim()}；模板：${templateCode}`));
    next.updatedAt = now;
    return commit(next, '已记录邮件发送示意，未发送真实邮件');
  }

  hydrate();
  watch(() => tenant.currentTenantId, hydrate);
  if (typeof window !== 'undefined') {
    const onStorage = (event: StorageEvent) => { if (event.key === null || event.key === cacheKey.value) hydrate(); };
    window.addEventListener('storage', onStorage);
    onScopeDispose(() => window.removeEventListener('storage', onStorage));
  }
  return {
    records, revision, recordOf, canCreate, canView, canEdit, canRevise, canTransfer, canUpload, canCrossGroupTransfer,
    canReopenByLeader, membersFor, membersForGroup, transferTargetGroups, create, save, reopenByLeader, acknowledgeReopenNotice, transfer, transferCrossGroup,
    addReminder, updateReminder, setReminder, cancelReminder, markReminderTriggered, acknowledgeReminder, addAttachments, removeAttachment,
    recordContact, recordContactFromCallSession, recordMaterialInvite, recordSms, recordEmail, hydrate,
  };
});
