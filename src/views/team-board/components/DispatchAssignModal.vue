<script setup lang="ts">
/**
 * 【1215】班组长指派 / 改派弹窗（PRD 9.3）：标题「指派」/「改派」，按钮 [ 取消 ] [ 确定 ]；改派另有必填「改派原因」。
 * 候选为归属本组池的本组成员（不含当前处理人），每行「姓名 · 签入状态 · 在途 N / 上限 M」，
 * 画像匹配标「匹配」，超限 / 已满标橙色；不校验画像与个人开关，未签入、将超上限二次确认。
 * 跨组走调剂，本弹窗不出跨组选项。
 */
import { computed, ref, watch } from 'vue';
import { message, Modal } from 'ant-design-vue';
import { SwapOutlined, UserAddOutlined } from '@ant-design/icons-vue';
import OpActionModal from '@/views/tickets/components/operation/OpActionModal.vue';
import type { Ticket } from '@/views/tickets/types/ticket';
import { useDispatchStore } from '@/stores/dispatch';
import {
  SIGN_IN_COLOR, assignCandidatesOf, assignInTeam, reassignInTeam, type AssignCandidate,
} from '@/views/tickets/composables/dispatchUi';

const props = withDefaults(defineProps<{
  open: boolean;
  ticket: Ticket | null;
  /** 归属池（＝组）id */
  groupId: string | null;
  /** 指派：池内未领取工单；改派：已派出、已领取的在途工单（9.3） */
  mode?: 'assign' | 'reassign';
}>(), { mode: 'assign' });

const emit = defineEmits<{
  'update:open': [v: boolean];
  done: [ok: boolean];
}>();

const dispatch = useDispatchStore();
const picked = ref<string | undefined>(undefined);
const reason = ref('');
/** 打开弹窗时的处理人：确定时比对，期间被他人改动即按「该工单已被领取」处理 */
const fromAssignee = ref<string | null>(null);
const isReassign = computed(() => props.mode === 'reassign');
const verb = computed(() => (isReassign.value ? '改派' : '指派'));

watch(() => props.open, (v) => {
  if (!v) return;
  picked.value = undefined;
  reason.value = '';
  fromAssignee.value = props.ticket?.assignee ?? null;
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
      title: verb.value,
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
  if (isReassign.value) {
    if (!reason.value.trim()) {
      message.warning('请填写改派原因');
      return;
    }
    if (reason.value.trim().length > 200) {
      message.warning('改派原因最多 200 字');
      return;
    }
  }
  if (c.signIn !== '签入' && !(await confirmStep(`${c.name}当前未签入，确定${verb.value}？`))) return;
  if (c.inTransit + 1 > c.cap
    && !(await confirmStep(`${c.name}在途 ${c.inTransit} / 上限 ${c.cap}，${verb.value}后将记超额指派，确定${verb.value}？`))) return;
  const res = isReassign.value ? reassignInTeam(t, c.name, reason.value, fromAssignee.value) : assignInTeam(t, c.name);
  if (res.ok) message.success(res.message);
  else message.warning(res.message);
  emit('update:open', false);
  emit('done', res.ok);
}
</script>

<template>
  <OpActionModal
    :open="open"
    :title="verb"
    :subtitle="ticket ? ticket.no : ''"
    :icon="isReassign ? SwapOutlined : UserAddOutlined"
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
      <div v-if="isReassign" class="dam-row top">
        <div class="op-label req">改派原因</div>
        <a-textarea v-model:value="reason" :maxlength="200" show-count :rows="3" placeholder="请填写改派原因" />
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
.dam-row.top { align-items: start; }
.dam-row.top > .op-label { line-height: 32px; }
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
