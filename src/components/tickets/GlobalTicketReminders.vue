<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useBusinessRegistrationStore } from '@/stores/businessRegistration';
import { useUserStore } from '@/stores/user';

interface VisibleReminder { id: string; no: string; title: string; note: string; at: string; recipient: string }
const store = useBusinessRegistrationStore();
const user = useUserStore();
const router = useRouter();
const visible = ref<VisibleReminder[]>([]);
let timer: ReturnType<typeof setInterval> | undefined;
let checking = false;

function checkDue() {
  if (checking) return;
  checking = true;
  try {
    visible.value = visible.value.filter((item) => {
      const record = store.recordOf(item.no);
      return record?.status === '处理中' && record.handler === user.name
        && record.reminder?.id === item.id && record.reminder.recipient === user.name;
    });
    for (const record of store.records) {
      const reminder = record.reminder;
      if (!reminder || reminder.triggeredAt || record.status !== '处理中'
        || reminder.recipient !== user.name || record.handler !== user.name || !store.canEdit(record)) continue;
      const at = new Date(reminder.at.replace(' ', 'T')).getTime();
      if (!Number.isFinite(at) || at > Date.now()) continue;
      const result = store.markReminderTriggered(record.no);
      if (result.ok && !visible.value.some((item) => item.id === reminder.id)) {
        visible.value.push({ id: reminder.id, no: record.no, title: [record.values.businessPhone, record.values.productName].filter(Boolean).join(' · '), note: reminder.note || '请及时处理工单，并核对运营商回单时间。', at: reminder.at, recipient: user.name });
      }
    }
  } finally { checking = false; }
}
function dismiss(id: string) { visible.value = visible.value.filter((item) => item.id !== id); }
function open(item: VisibleReminder) { dismiss(item.id); void router.push(`/self-service/${item.no}`); }
watch(() => user.name, () => { visible.value = []; checkDue(); });
watch(() => store.revision, checkDue);
onMounted(() => { checkDue(); timer = setInterval(checkDue, 1000); });
onBeforeUnmount(() => { if (timer) clearInterval(timer); });
</script>

<template>
  <aside v-if="visible.length" class="global-reminders" aria-label="工单预约提醒" aria-live="assertive">
    <article v-for="item in visible" :key="item.id" class="reminder-notice" role="alert">
      <header><span class="bell-mark">◷</span><strong>工单预约提醒</strong><button type="button" aria-label="关闭提醒" @click="dismiss(item.id)">×</button></header>
      <p class="reminder-title">{{ item.title || item.no }}</p><p>{{ item.note }}</p><small>{{ item.at.replace('T', ' ') }} · {{ item.no }}</small>
      <footer><a-button size="small" @click="dismiss(item.id)">已知晓</a-button><a-button size="small" type="primary" @click="open(item)">查看工单</a-button></footer>
    </article>
  </aside>
</template>

<style scoped>
.global-reminders{position:fixed;right:24px;bottom:80px;width:344px;max-width:calc(100vw - 40px);max-height:70vh;overflow:auto;display:flex;flex-direction:column;gap:12px;z-index:1100;pointer-events:none}
.reminder-notice{pointer-events:auto;border:1px solid #e1e7f2;border-left:4px solid #9273d0;background:#fff;border-radius:8px;padding:14px 15px;box-shadow:0 7px 35px #30446c1c;color:#40546f}
.reminder-notice header{display:flex;gap:7px;align-items:center;font-size:13px}.bell-mark{color:#9677cd;font-size:18px}.reminder-notice header strong{font-weight:600}.reminder-notice header button{border:0;background:none;color:#a2adbb;font-size:20px;line-height:1;margin-left:auto;cursor:pointer;padding:0 3px}.reminder-notice p{font-size:12px;color:#8391a5;line-height:1.8;margin:6px 0;white-space:pre-wrap}.reminder-notice .reminder-title{color:#526c8c;font-weight:500;margin-top:11px}.reminder-notice small{font-size:10px;color:#9aa7b8;word-break:break-all}.reminder-notice footer{display:flex;justify-content:flex-end;gap:8px;margin-top:12px}.reminder-notice :deep(.ant-btn){font-size:11px}
</style>
