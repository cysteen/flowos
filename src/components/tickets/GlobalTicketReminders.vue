<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { message } from 'ant-design-vue';
import { useRouter } from 'vue-router';
import { useBusinessRegistrationStore } from '@/stores/businessRegistration';
import { useUserStore } from '@/stores/user';
import {
  parseRegistrationReminderAt,
  registrationPendingReopenNotice,
  unacknowledgedRegistrationReminders,
} from '@/views/tickets/types/businessRegistration';
import { markReopenToastSeen } from '@/views/tickets/types/reopenReminderDedupe';

interface VisibleReminder { id: string; no: string; title: string; note: string; at: string; recipient: string }
interface VisibleReopen { id: string; no: string; title: string; note: string; at: string }

const REOPEN_CONTENT_PREFIX = '班组长退回重开：';
const MAX_REOPEN_VISIBLE = 3;

const store = useBusinessRegistrationStore();
const user = useUserStore();
const router = useRouter();
const visible = ref<VisibleReminder[]>([]);
const reopenVisible = ref<VisibleReopen[]>([]);
const reopenExpanded = ref(false);
let timer: ReturnType<typeof setInterval> | undefined;
let checking = false;

function formatAt(at: string): string {
  return at.replace('T', ' ').trim();
}

function reopenSummary(note: string): { line: string; tip: string } {
  let text = note.trim();
  if (text.startsWith(REOPEN_CONTENT_PREFIX)) {
    text = text.slice(REOPEN_CONTENT_PREFIX.length).trim();
  }
  const line = text.replace(/\s+/g, ' ');
  return { line, tip: line };
}

function reminderSummary(note: string): { line: string; tip: string } {
  const line = note.trim().replace(/\s+/g, ' ');
  return { line, tip: line };
}

function syncReopenAlerts() {
  const next: VisibleReopen[] = [];
  for (const record of store.records) {
    if (record.status !== '处理中' || record.handler !== user.name) continue;
    const notice = registrationPendingReopenNotice(record, user.name);
    if (!notice) continue;
    next.push({
      id: notice.id,
      no: record.no,
      title: [record.values.businessPhone, record.values.productName].filter(Boolean).join(' · '),
      note: notice.content,
      at: notice.at,
    });
  }
  reopenVisible.value = next;
  for (const item of next) markReopenToastSeen(user.name, item.id);
}

function syncAppointmentAlerts() {
  const next: VisibleReminder[] = [];
  for (const record of store.records) {
    if (record.status !== '处理中' || record.handler !== user.name || !store.canEdit(record)) continue;
    for (const reminder of unacknowledgedRegistrationReminders(record.reminders)) {
      if (reminder.recipient !== user.name) continue;
      next.push({
        id: reminder.id,
        no: record.no,
        title: [record.values.businessPhone, record.values.productName].filter(Boolean).join(' · '),
        note: reminder.note || '请及时处理工单，并核对运营商回单时间。',
        at: reminder.at,
        recipient: reminder.recipient,
      });
    }
  }
  visible.value = next;
}

function checkDue() {
  if (checking) return;
  checking = true;
  try {
    syncReopenAlerts();
    for (const record of store.records) {
      if (record.status !== '处理中' || record.handler !== user.name || !store.canEdit(record)) continue;
      for (const reminder of record.reminders ?? []) {
        if (reminder.triggeredAt || reminder.recipient !== user.name) continue;
        const at = parseRegistrationReminderAt(reminder.at);
        if (!Number.isFinite(at) || at > Date.now()) continue;
        store.markReminderTriggered(record.no, reminder.id);
      }
    }
    syncAppointmentAlerts();
  } finally { checking = false; }
}

function dismiss(item: VisibleReminder): boolean {
  const result = store.acknowledgeReminder(item.no, item.id);
  if (!result.ok) {
    message.warning(result.message);
    checkDue();
    return false;
  }
  syncAppointmentAlerts();
  return true;
}
function open(item: VisibleReminder) { if (dismiss(item)) void router.push(`/self-service/${item.no}`); }
function dismissReopen(id: string, no: string) {
  reopenVisible.value = reopenVisible.value.filter((item) => item.id !== id);
  markReopenToastSeen(user.name, id);
  const result = store.acknowledgeReopenNotice(no, id);
  if (!result.ok) void checkDue();
}
function openReopen(item: VisibleReopen) { dismissReopen(item.id, item.no); void router.push(`/self-service/${item.no}`); }

watch(() => user.name, () => { visible.value = []; reopenVisible.value = []; reopenExpanded.value = false; checkDue(); });
watch(() => store.revision, checkDue);
watch(reopenVisible, (list) => {
  if (list.length <= MAX_REOPEN_VISIBLE) reopenExpanded.value = false;
});

onMounted(() => { checkDue(); timer = setInterval(checkDue, 1000); });
onBeforeUnmount(() => { if (timer) clearInterval(timer); });

const hasPanel = computed(() => visible.value.length > 0 || reopenVisible.value.length > 0);
const reopenStacked = computed(() => reopenVisible.value.length > 1);
const reopenHiddenCount = computed(() => Math.max(0, reopenVisible.value.length - MAX_REOPEN_VISIBLE));
const reopenShown = computed(() => (
  reopenExpanded.value || reopenVisible.value.length <= MAX_REOPEN_VISIBLE
    ? reopenVisible.value
    : reopenVisible.value.slice(0, MAX_REOPEN_VISIBLE)
));
const singleReopen = computed(() => (reopenVisible.value.length === 1 ? reopenVisible.value[0] : undefined));
</script>

<template>
  <aside v-if="hasPanel" class="global-reminders" aria-label="工单提醒" aria-live="assertive">
    <section v-if="reopenVisible.length" class="reminder-section reopen-section" aria-label="工单退回重开">
    <article
      v-if="singleReopen"
      :key="`reopen-${singleReopen.id}`"
      class="reminder-notice reopen-notice reminder-compact"
      role="alert"
    >
      <header>
        <span class="bell-mark warn">!</span>
        <strong>工单退回重开</strong>
        <button type="button" aria-label="关闭提醒" @click="dismissReopen(singleReopen.id, singleReopen.no)">×</button>
      </header>
      <p class="reopen-subline">工单仍为已退回，请处理并再次结案</p>
      <p class="reminder-title" :title="singleReopen.title || singleReopen.no">{{ singleReopen.title || singleReopen.no }}</p>
      <p
        class="reminder-summary"
        :title="reopenSummary(singleReopen.note).tip"
      >
        {{ reopenSummary(singleReopen.note).line }}
      </p>
      <p class="reminder-meta" :title="`${formatAt(singleReopen.at)} · ${singleReopen.no}`">{{ singleReopen.no }}</p>
      <footer>
        <a-button size="small" @click="dismissReopen(singleReopen.id, singleReopen.no)">已知晓</a-button>
        <a-button size="small" type="primary" danger @click="openReopen(singleReopen)">去处理</a-button>
      </footer>
    </article>

    <article
      v-else-if="reopenStacked"
      class="reminder-notice reopen-notice reopen-stack reminder-compact"
      role="alert"
    >
      <header>
        <span class="bell-mark warn">!</span>
        <strong>工单退回重开</strong>
        <span class="reopen-count">{{ reopenVisible.length }}</span>
      </header>
      <p class="reopen-subline">工单仍为已退回，请处理并再次结案</p>
      <ul class="reopen-stack-list">
        <li v-for="item in reopenShown" :key="`reopen-${item.id}`" class="reopen-stack-item">
          <div class="reopen-stack-main">
            <p class="reminder-title" :title="item.title || item.no">{{ item.title || item.no }}</p>
            <p class="reminder-summary" :title="reopenSummary(item.note).tip">{{ reopenSummary(item.note).line }}</p>
            <p class="reminder-meta" :title="`${formatAt(item.at)} · ${item.no}`">{{ item.no }}</p>
          </div>
          <div class="reopen-stack-actions">
            <a-button size="small" @click="dismissReopen(item.id, item.no)">已知晓</a-button>
            <a-button size="small" type="primary" danger @click="openReopen(item)">去处理</a-button>
          </div>
        </li>
      </ul>
      <button
        v-if="reopenHiddenCount > 0 && !reopenExpanded"
        type="button"
        class="reopen-more"
        @click="reopenExpanded = true"
      >
        还有 {{ reopenHiddenCount }} 条
      </button>
      <button
        v-else-if="reopenExpanded && reopenVisible.length > MAX_REOPEN_VISIBLE"
        type="button"
        class="reopen-more"
        @click="reopenExpanded = false"
      >
        收起
      </button>
    </article>
    </section>

    <section v-if="visible.length" class="reminder-section appointment-section" aria-label="工单预约提醒">
    <article
      v-for="item in visible"
      :key="item.id"
      class="reminder-notice reminder-compact"
      role="alert"
    >
      <header>
        <span class="bell-mark">◷</span>
        <strong>工单预约提醒</strong>
        <button type="button" aria-label="关闭提醒" @click="dismiss(item)">×</button>
      </header>
      <p class="reminder-title" :title="item.title || item.no">{{ item.title || item.no }}</p>
      <p class="reminder-summary" :title="reminderSummary(item.note).tip">{{ reminderSummary(item.note).line }}</p>
      <p class="reminder-meta" :title="`${formatAt(item.at)} · ${item.no}`">{{ item.no }}</p>
      <footer>
        <a-button size="small" @click="dismiss(item)">已知晓</a-button>
        <a-button size="small" type="primary" @click="open(item)">去处理</a-button>
      </footer>
    </article>
    </section>
  </aside>
</template>

<style scoped>
.global-reminders {
  position: fixed;
  right: 24px;
  bottom: 80px;
  width: 344px;
  max-width: calc(100vw - 32px);
  max-height: 70vh;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
  z-index: 1100;
  pointer-events: none;
}

.reminder-notice {
  pointer-events: auto;
  border: 1px solid #e1e7f2;
  border-left: 4px solid #9273d0;
  background: #fff;
  border-radius: 8px;
  padding: 14px 15px;
  box-shadow: 0 7px 35px #30446c1c;
  color: #40546f;
}

.reminder-compact {
  padding: 10px 12px;
}

.reopen-notice {
  border-left-color: #f59e0b;
  border-color: #fde68a;
}

.reminder-notice header {
  display: flex;
  gap: 6px;
  align-items: center;
  font-size: 13px;
  line-height: 1.25;
}

.bell-mark {
  color: #9677cd;
  font-size: 16px;
  flex-shrink: 0;
}

.bell-mark.warn {
  color: #d97706;
  font-weight: 700;
}

.reminder-notice header strong {
  font-weight: 600;
}

.reopen-count {
  margin-left: 2px;
  font-size: 11px;
  font-weight: 600;
  color: #b45309;
  background: #fff7ed;
  border-radius: 10px;
  padding: 0 6px;
  line-height: 18px;
}

.reminder-notice header button {
  border: 0;
  background: none;
  color: #a2adbb;
  font-size: 18px;
  line-height: 1;
  margin-left: auto;
  cursor: pointer;
  padding: 0 2px;
}

.reopen-subline {
  font-size: 11px;
  color: #b45309;
  line-height: 1.35;
  margin: 6px 0 0;
}

.reminder-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.reminder-title {
  color: #526c8c;
  font-weight: 500;
  font-size: 12px;
  line-height: 1.35;
  margin: 8px 0 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.reminder-summary {
  font-size: 12px;
  color: #8391a5;
  line-height: 1.35;
  margin: 4px 0 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.reminder-meta {
  font-size: 10px;
  color: #9aa7b8;
  margin: 3px 0 0;
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.reminder-notice footer {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
  margin-top: 8px;
}

.reminder-notice :deep(.ant-btn) {
  font-size: 11px;
  height: 24px;
  padding-inline: 8px;
}

.reopen-stack-list {
  list-style: none;
  margin: 8px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0;
}

.reopen-stack-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 0;
  border-top: 1px solid #f3e8d6;
}

.reopen-stack-item:first-child {
  border-top: 0;
  padding-top: 0;
}

.reopen-stack-main {
  min-width: 0;
}

.reopen-stack-actions {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
}

.reopen-more {
  width: 100%;
  margin-top: 6px;
  border: 0;
  background: #fffbeb;
  color: #b45309;
  font-size: 11px;
  line-height: 1.3;
  padding: 6px 8px;
  border-radius: 6px;
  cursor: pointer;
}

.reopen-more:hover {
  background: #fef3c7;
}

@media (max-width: 400px) {
  .global-reminders {
    right: 16px;
    bottom: 72px;
  }

  .reminder-compact {
    padding: 9px 10px;
  }
}
</style>
