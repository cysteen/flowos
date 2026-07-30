<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Select as ASelect, Input as AInput } from 'ant-design-vue';
import { ArrowUpOutlined, DownOutlined, UpOutlined } from '@ant-design/icons-vue';
import OpActionModal from './OpActionModal.vue';
import type { TicketDetailMeta } from '@/mock/ticketDetail';
import { EXTERNAL_COMPLAINT_PLATFORMS } from '@/views/tickets/types/createTicket';
import {
  buildEscalateSyncFields,
  buildEscalateVerdict,
  buildTierSteps,
  isTicketTerminated,
  type EscalateInput,
  type EscalateTarget,
} from '@/views/tickets/composables/complaintEscalation';

/**
 * 升级投诉弹窗（《【815】关联投诉 PRD》§4.2/§4.3）：
 * 查原单阶层 → 给目标候选（同阶/终态置灰）→ 预览同步信息 → 填升级原因，
 * 确认后进建单页生成新投诉单；提交建单即「关原单 + 双向关联」。
 */
const props = defineProps<{
  open: boolean;
  detail: TicketDetailMeta;
}>();

const emit = defineEmits<{
  'update:open': [v: boolean];
  submit: [payload: EscalateInput];
}>();

const target = ref<EscalateTarget | null>(null);
const note = ref('');
const platform = ref<string | undefined>(undefined);
const externalNo = ref('');
const syncOpen = ref(false);

const verdict = computed(() => buildEscalateVerdict(props.detail));
const tierSteps = computed(() => buildTierSteps(props.detail));
const syncFields = computed(() => buildEscalateSyncFields(props.detail));
const originClosed = computed(() => isTicketTerminated(props.detail.status));
const isExternalTarget = computed(() => target.value === '外投');

/** 可选目标优先展示；同阶不可选折叠为一行说明，避免三张大卡抢视线 */
const allowedCandidates = computed(() => verdict.value.candidates.filter((c) => c.allowed));
const blockedHint = computed(() => {
  const blocked = verdict.value.candidates.filter((c) => !c.allowed);
  if (!blocked.length) return '';
  if (verdict.value.tier === 'low') return '人员投诉 / 业务投诉为同阶，不可升级，仅可补充';
  if (verdict.value.tier === 'external') return '外投为终态，全部目标仅可补充';
  return '';
});

const platformOptions = EXTERNAL_COMPLAINT_PLATFORMS.map((v) => ({ value: v, label: v }));

watch(
  () => props.open,
  (v) => {
    if (!v) return;
    const allowed = verdict.value.candidates.filter((c) => c.allowed);
    target.value = allowed.length === 1 ? allowed[0].target : null;
    note.value = '';
    platform.value = undefined;
    externalNo.value = '';
    syncOpen.value = false;
  },
);

const canSubmit = computed(() => {
  if (!verdict.value.entryEnabled) return false;
  if (!target.value) return false;
  if (!note.value.trim()) return false;
  if (isExternalTarget.value && !platform.value) return false;
  return true;
});

function pick(t: EscalateTarget) {
  target.value = t;
}

function close() {
  emit('update:open', false);
}

function onSubmit() {
  if (!canSubmit.value || !target.value) return;
  emit('submit', {
    target: target.value,
    note: note.value.trim(),
    platform: isExternalTarget.value ? platform.value : undefined,
    externalNo: isExternalTarget.value ? externalNo.value.trim() : undefined,
  });
  close();
}
</script>

<template>
  <OpActionModal
    :open="open"
    title="升级投诉"
    :icon="ArrowUpOutlined"
    tone="warn"
    :width="520"
    ok-text="下一步 · 建投诉新单"
    :ok-disabled="!canSubmit"
    @update:open="emit('update:open', $event)"
    @ok="onSubmit"
    @cancel="close"
  >
    <div class="op-form esc-form">
      <!-- 阶层：一行阶梯，当前 / 可升标注即可 -->
      <div class="esc-stage" aria-label="投诉升阶路径">
        <template v-for="(s, i) in tierSteps" :key="s.key">
          <span v-if="i" class="esc-arrow">→</span>
          <div class="esc-step" :class="`is-${s.state}`">
            <span class="esc-step-label">{{ s.label }}</span>
            <span v-if="s.state === 'current'" class="esc-pill">当前</span>
            <span v-else-if="s.state === 'target'" class="esc-pill esc-pill--go">可升</span>
          </div>
        </template>
      </div>

      <div class="esc-meta">
        <span class="op-mono">{{ detail.no }}</span>
        <span class="esc-dot">·</span>
        <span>{{ detail.status }}</span>
        <span class="esc-dot">·</span>
        <span>{{ verdict.tierLabel }}</span>
      </div>

      <!-- 升级目标：只列可选；同阶说明一行带过 -->
      <div class="op-field">
        <div class="op-label req">升级目标</div>
        <div v-if="allowedCandidates.length" class="op-radio-cards">
          <label
            v-for="c in allowedCandidates"
            :key="c.target"
            class="op-radio-card esc-card"
            :class="{ on: target === c.target }"
            @click="pick(c.target)"
          >
            <a-radio :checked="target === c.target" />
            <div class="esc-body">
              <div class="esc-head">
                <span class="op-rc-title">{{ c.target }}</span>
                <span v-if="c.recommended" class="esc-badge">推荐</span>
              </div>
              <div class="op-rc-sub">{{ c.desc }}</div>
            </div>
          </label>
        </div>
        <div v-if="blockedHint" class="esc-blocked">{{ blockedHint }}</div>
      </div>

      <template v-if="isExternalTarget">
        <div class="op-field-row">
          <div class="op-field">
            <div class="op-label req">外投平台</div>
            <ASelect
              v-model:value="platform"
              :options="platformOptions"
              placeholder="选择外部投诉平台"
              style="width:100%"
              show-search
            />
          </div>
          <div class="op-field">
            <div class="op-label">外部编号</div>
            <AInput v-model:value="externalNo" placeholder="平台工单号，可后补" />
          </div>
        </div>
      </template>

      <div class="op-field">
        <div class="op-label req">升级原因</div>
        <AInput.TextArea
          v-model:value="note"
          :rows="3"
          :maxlength="500"
          show-count
          placeholder="说明为何升级，随新单一同留档"
        />
      </div>

      <!-- 同步预览默认收起 -->
      <div class="esc-sync-wrap">
        <button type="button" class="esc-sync-toggle" @click="syncOpen = !syncOpen">
          <span>同步到新单的信息（{{ syncFields.length }}）</span>
          <UpOutlined v-if="syncOpen" /><DownOutlined v-else />
        </button>
        <div v-if="syncOpen" class="op-box esc-sync">
          <div v-for="row in syncFields" :key="row.label" class="esc-sync-row">
            <span class="esc-sync-k">{{ row.label }}</span>
            <span class="esc-sync-v">{{ row.value }}</span>
          </div>
          <div class="op-hint">建单页可再调整</div>
        </div>
      </div>

      <div class="esc-foot">
        <template v-if="originClosed">
          原单已是「{{ detail.status }}」，将直接建新单并双向关联。
        </template>
        <template v-else>
          确认后：关闭原单 → 建投诉新单 → 双向关联。
        </template>
      </div>
    </div>
  </OpActionModal>
</template>

<style scoped>
.esc-form { gap: 12px; }

.esc-stage {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 12px;
  border: 1px solid #eef0f3;
  border-radius: 8px;
  background: #fafbfc;
}
.esc-arrow { flex: none; color: #d1d5db; font-size: 12px; }
.esc-step {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  padding: 4px 8px;
  border-radius: 6px;
}
.esc-step-label {
  font-size: 13px;
  font-weight: 600;
  color: #9ca3af;
  white-space: nowrap;
}
.esc-pill {
  flex: none;
  font-size: 11px;
  font-weight: 600;
  line-height: 18px;
  padding: 0 6px;
  border-radius: 4px;
  color: #b45309;
  background: #fff7ed;
}
.esc-pill--go { color: #1a6fff; background: #eff6ff; }
.esc-step.is-passed .esc-step-label { color: #9ca3af; font-weight: 500; }
.esc-step.is-current {
  background: #fffbeb;
}
.esc-step.is-current .esc-step-label { color: #b45309; }
.esc-step.is-target .esc-step-label { color: #1a6fff; }
.esc-step.is-blocked .esc-step-label { color: #d1d5db; font-weight: 500; }

.esc-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px 2px;
  font-size: 12px;
  color: #6b7280;
  margin-top: -4px;
}
.esc-dot { color: #d1d5db; margin: 0 4px; }

.esc-card { align-items: flex-start; }
.esc-body { min-width: 0; }
.esc-head { display: flex; align-items: center; gap: 6px; }
.esc-badge {
  flex: none;
  font-size: 11px;
  font-weight: 600;
  line-height: 18px;
  padding: 0 6px;
  border-radius: 4px;
  color: #059669;
  background: #ecfdf5;
}
.esc-blocked {
  margin-top: 8px;
  font-size: 12px;
  color: #9ca3af;
  line-height: 1.5;
}

.esc-sync-wrap { border-top: 1px dashed #eef0f3; padding-top: 4px; }
.esc-sync-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 6px 0;
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 13px;
  color: #6b7280;
  font-family: inherit;
}
.esc-sync-toggle:hover { color: #1a6fff; }
.esc-sync { gap: 4px; margin-top: 4px; max-height: 140px; overflow: auto; }
.esc-sync-row { display: flex; gap: 10px; line-height: 1.6; font-size: 12px; }
.esc-sync-k { flex: none; width: 60px; color: #9ca3af; }
.esc-sync-v { min-width: 0; color: #374151; }

.esc-foot {
  font-size: 12px;
  color: #9ca3af;
  line-height: 1.5;
}
</style>
