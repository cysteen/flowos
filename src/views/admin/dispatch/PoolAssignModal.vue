<script setup lang="ts">
// 指派弹窗（PRD 9.3）：候选为工单所在池的处理组成员；未就绪、未签入、将超上限二次确认；先到先得
import { computed, ref, watch } from 'vue';
import { message, Modal } from 'ant-design-vue';
import { UserSwitchOutlined } from '@ant-design/icons-vue';
import OpActionModal from '@/views/tickets/components/operation/OpActionModal.vue';
import { useDispatchStore } from '@/stores/dispatch';
import { notReadyConfirmText } from '@/views/tickets/composables/dispatchUi';
import { useTicketWorkbench } from '@/views/tickets/composables/useTicketWorkbench';
import type { Ticket } from '@/views/tickets/types/ticket';

const props = defineProps<{ open: boolean; ticket: Ticket | null; poolId: string }>();
const emit = defineEmits<{ 'update:open': [v: boolean]; done: [] }>();
const store = useDispatchStore();
const wb = useTicketWorkbench();

const assignee = ref<string | undefined>(undefined);
watch(() => props.open, (v) => { if (v) assignee.value = undefined; });

const candidates = computed(() => {
  if (!props.ticket) return [];
  const t = props.ticket;
  return store.poolMembersOf(props.poolId)
    .filter((a) => !a.disabled && a.name !== t.assignee)
    .map((a) => {
      const v = store.agentView(a.name)!;
      return {
        name: a.name,
        signIn: a.signIn,
        inTransit: v.inTransit,
        cap: v.cap,
        full: v.inTransit >= v.cap,
        match: store.matchesMe(t, a.name),
      };
    });
});
const options = computed(() => candidates.value.map((c) => ({ value: c.name, label: c.name, c })));

function doAssign(name: string) {
  const t = props.ticket!;
  const occ = store.checkOccupy(wb.ticketById(t.id) ?? t);
  if (!occ.ok) { message.error(occ.message); emit('update:open', false); emit('done'); return; }
  const [res] = wb.assignTickets([t.id], { scope: 'in-team', targetId: store.poolGroupIdOf(props.poolId) ?? props.poolId, targetName: name });
  if (!res?.ok) { message.error(res?.reason ?? ''); return; }
  message.success(`已指派给${name}`);
  emit('update:open', false);
  emit('done');
}

function submit() {
  if (!assignee.value) { message.error('请选择处理人'); return; }
  const c = candidates.value.find((x) => x.name === assignee.value)!;
  const confirmOver = () => {
    if (c.inTransit + 1 > c.cap) {
      Modal.confirm({
        title: '指派',
        content: `${c.name}在途 ${c.inTransit} / 上限 ${c.cap}，指派后将记超额指派，确定指派？`,
        okText: '确定', cancelText: '取消',
        onOk: () => doAssign(c.name),
      });
    } else doAssign(c.name);
  };
  const notReady = notReadyConfirmText(c.name, c.signIn, '指派');
  if (notReady) {
    Modal.confirm({
      title: '指派', content: notReady, okText: '确定', cancelText: '取消',
      onOk: () => confirmOver(),
    });
  } else confirmOver();
}
</script>

<template>
  <OpActionModal
    :open="open"
    title="指派"
    :subtitle="ticket ? `${store.poolLabel(poolId)} · ${ticket.no}` : ''"
    :icon="UserSwitchOutlined"
    ok-text="确定"
    :width="520"
    @update:open="emit('update:open', $event)"
    @ok="submit"
  >
    <div class="op-form">
      <div class="op-field op-field-h">
        <span class="op-label req">处理人</span>
        <a-select
          v-model:value="assignee"
          show-search
          placeholder="请选择处理人"
          :options="options"
          option-filter-prop="label"
        >
          <template #option="{ c }">
            <div class="as-opt" :class="{ full: c.full }">
              <span class="as-name">{{ c.name }}</span>
              <span class="as-meta">· {{ c.signIn }} · 在途 {{ c.inTransit }} / 上限 {{ c.cap }}</span>
              <a-tag v-if="c.match" color="blue" class="as-tag">匹配</a-tag>
            </div>
          </template>
        </a-select>
      </div>
    </div>
  </OpActionModal>
</template>

<style scoped>
.as-opt { display: flex; align-items: center; gap: 6px; }
.as-name { color: #111827; }
.as-meta { color: #6b7280; font-size: 12px; }
.as-opt.full .as-meta { color: #ea580c; }
.as-tag { margin-left: auto; }
</style>
