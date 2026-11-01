<script setup lang="ts">
/**
 * 【1215】班组长指派弹窗（PRD 9.3）：标题「指派」，按钮 [ 取消 ] [ 确定 ]。
 * 候选为归属本组池的本组成员（不含当前处理人），每行「姓名 · 签入状态 · 在途 N / 上限 M」，
 * 画像匹配标「匹配」，超限 / 已满标橙色；不校验画像与个人开关，未签入、将超上限二次确认。
 * 跨组走调剂，本弹窗不出跨组选项。
 */
import { computed, ref, watch } from 'vue';
import { message, Modal } from 'ant-design-vue';
import { UserAddOutlined } from '@ant-design/icons-vue';
import OpActionModal from '@/views/tickets/components/operation/OpActionModal.vue';
import type { Ticket } from '@/views/tickets/types/ticket';
import { useDispatchStore } from '@/stores/dispatch';
import { SIGN_IN_COLOR, assignCandidatesOf, assignInTeam, type AssignCandidate } from '@/views/tickets/composables/dispatchUi';

const props = defineProps<{
  open: boolean;
  ticket: Ticket | null;
  /** 归属池（＝组）id */
  groupId: string | null;
}>();

const emit = defineEmits<{
  'update:open': [v: boolean];
  done: [ok: boolean];
}>();

const dispatch = useDispatchStore();
const picked = ref<string | undefined>(undefined);

watch(() => props.open, (v) => {
  if (v) picked.value = undefined;
});

const candidates = computed<AssignCandidate[]>(() => {
  void dispatch.agents;
  void dispatch.ticketStates;
  return props.groupId ? assignCandidatesOf(props.groupId, props.ticket) : [];
});

const poolText = computed(() => (props.groupId ? dispatch.poolLabel(props.groupId) : ''));

function filterOption(input: string, option: { value?: string }) {
  return String(option.value ?? '').includes(input.trim());
}

function confirmStep(content: string): Promise<boolean> {
  return new Promise((resolve) => {
    Modal.confirm({
      title: '指派',
      content,
      okText: '确定',
      cancelText: '取消',
      onOk: () => resolve(true),
      onCancel: () => resolve(false),
    });
  });
}

async function onOk() {
  const t = props.ticket;
  if (!t) return;
  const c = candidates.value.find((x) => x.name === picked.value);
  if (!c) {
    message.warning('请选择处理人');
    return;
  }
  if (c.signIn !== '签入' && !(await confirmStep(`${c.name}当前未签入，确定指派？`))) return;
  if (c.inTransit + 1 > c.cap
    && !(await confirmStep(`${c.name}在途 ${c.inTransit} / 上限 ${c.cap}，指派后将记超额指派，确定指派？`))) return;
  const res = assignInTeam(t, c.name);
  if (res.ok) message.success(res.message);
  else message.warning(res.message);
  emit('update:open', false);
  emit('done', res.ok);
}
</script>

<template>
  <OpActionModal
    :open="open"
    title="指派"
    :subtitle="ticket ? ticket.no : ''"
    :icon="UserAddOutlined"
    tone="primary"
    ok-tone="primary"
    :width="480"
    ok-text="确定"
    cancel-text="取消"
    @update:open="emit('update:open', $event)"
    @ok="onOk"
  >
    <div v-if="ticket" class="op-form dam">
      <div class="dam-row">
        <div class="op-label">归属池</div>
        <div class="dam-ro">{{ poolText }}</div>
      </div>
      <div class="dam-row">
        <div class="op-label req">处理人</div>
        <a-select
          v-model:value="picked"
          class="dam-select"
          show-search
          placeholder="请选择处理人"
          :filter-option="filterOption"
          option-label-prop="value"
        >
          <a-select-option v-for="c in candidates" :key="c.name" :value="c.name">
            <div class="dam-opt">
              <span class="dam-name">{{ c.name }}</span>
              <span class="dam-dot" :style="{ background: SIGN_IN_COLOR[c.signIn] }" />
              <span class="dam-sign">{{ c.signIn }}</span>
              <span class="dam-load" :class="{ full: c.full }">在途 {{ c.inTransit }} / 上限 {{ c.cap }}</span>
              <span v-if="c.matched" class="dam-match">匹配</span>
            </div>
          </a-select-option>
        </a-select>
      </div>
    </div>
  </OpActionModal>
</template>

<style scoped>
.dam { display: flex; flex-direction: column; gap: 14px; }
.dam-row {
  display: grid;
  grid-template-columns: 56px minmax(0, 1fr);
  column-gap: 10px;
  align-items: center;
}
.dam-row > .op-label { white-space: nowrap; }
.dam-ro { font-size: 14px; line-height: 32px; color: #111827; }
.dam-select { width: 100%; }
.dam-opt { display: flex; align-items: center; gap: 6px; min-width: 0; }
.dam-name { font-weight: 600; color: #111827; }
.dam-dot { width: 6px; height: 6px; border-radius: 50%; flex: none; }
.dam-sign { font-size: 12px; color: #6b7280; }
.dam-load { margin-left: auto; font-size: 12px; color: #6b7280; font-variant-numeric: tabular-nums; }
.dam-load.full { color: #d97706; font-weight: 600; }
.dam-match {
  font-size: 11px;
  line-height: 16px;
  padding: 0 5px;
  border-radius: 4px;
  color: #059669;
  background: #ecfdf5;
  border: 1px solid #a7f3d0;
}
</style>
