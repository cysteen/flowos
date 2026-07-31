<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Select as ASelect, Input as AInput } from 'ant-design-vue';
import { ArrowUpOutlined, DownOutlined, UpOutlined } from '@ant-design/icons-vue';
import OpActionModal from './OpActionModal.vue';
import type { TicketDetailMeta } from '@/mock/ticketDetail';
import {
  COMPLAINT_L1_OPTIONS,
  COMPLAINT_L2_MAP,
  EXTERNAL_COMPLAINT_PLATFORMS,
  PRIOR_FEEDBACK_OPTIONS,
  SERVICE_REVIEW_OPTIONS,
  resolveComplaintNature,
} from '@/views/tickets/types/createTicket';
import {
  buildEscalateSyncFields,
  buildEscalateVerdict,
  buildTierSteps,
  isTicketTerminated,
  type EscalateInput,
} from '@/views/tickets/composables/complaintEscalation';

/**
 * 升级投诉弹窗（《【815】关联投诉 PRD》§4）。两条分支，字段量不同：
 * - **非投诉 → 投诉**：选投诉一类/二类（性质自动判定）+ 升级原因 → 跳建单页补齐整块投诉字段；
 * - **投诉 → 外投**：只补外投增量字段（平台/编号/前期反馈/服务回溯）+ 升级原因 → 弹窗内直接建单。
 */
const props = defineProps<{
  open: boolean;
  detail: TicketDetailMeta;
}>();

const emit = defineEmits<{
  'update:open': [v: boolean];
  submit: [payload: EscalateInput];
}>();

const verdict = computed(() => buildEscalateVerdict(props.detail));
const tierSteps = computed(() => buildTierSteps(props.detail));
const syncFields = computed(() => buildEscalateSyncFields(props.detail));
const originClosed = computed(() => isTicketTerminated(props.detail.status));
const isExternal = computed(() => verdict.value.kind === 'toExternal');

// —— 分支一：非投诉 → 投诉 ——
const cat1 = ref<string | undefined>(undefined);
const cat2 = ref<string | undefined>(undefined);
const nature = computed(() => resolveComplaintNature(cat2.value));
const cat1Options = COMPLAINT_L1_OPTIONS.map((v) => ({ value: v, label: v }));
const cat2Options = computed(() =>
  (COMPLAINT_L2_MAP[cat1.value ?? ''] ?? []).map((v) => ({ value: v, label: v })),
);

// —— 分支二：投诉 → 外投（增量字段）——
const platform = ref<string | undefined>(undefined);
const complaintNo = ref('');
const priorFeedback = ref<string | undefined>(undefined);
const serviceReview = ref<string | undefined>(undefined);
const platformOptions = EXTERNAL_COMPLAINT_PLATFORMS.map((v) => ({ value: v, label: v }));
const priorFeedbackOptions = PRIOR_FEEDBACK_OPTIONS.map((v) => ({ value: v, label: v }));
const serviceReviewOptions = SERVICE_REVIEW_OPTIONS.map((v) => ({ value: v, label: v }));

const note = ref('');
const syncOpen = ref(false);

watch(
  () => props.open,
  (v) => {
    if (!v) return;
    cat1.value = undefined;
    cat2.value = undefined;
    platform.value = props.detail.complaint.platform || undefined;
    complaintNo.value = '';
    priorFeedback.value = props.detail.complaint.priorFeedback || undefined;
    serviceReview.value = props.detail.complaint.serviceReview || undefined;
    note.value = '';
    syncOpen.value = false;
  },
);

/** 一类换了就清二类 */
watch(cat1, () => { cat2.value = undefined; });

const canSubmit = computed(() => {
  if (!verdict.value.entryEnabled || !note.value.trim()) return false;
  if (isExternal.value) return !!platform.value && !!complaintNo.value.trim();
  return !!cat1.value && !!cat2.value;
});

const okText = computed(() => (isExternal.value ? '确认升级为外投' : '下一步 · 建投诉新单'));

function close() {
  emit('update:open', false);
}

function onSubmit() {
  if (!canSubmit.value) return;
  if (isExternal.value) {
    emit('submit', {
      kind: 'toExternal',
      platform: platform.value ?? '',
      complaintNo: complaintNo.value.trim(),
      priorFeedback: priorFeedback.value ?? '',
      serviceReview: serviceReview.value ?? '',
      note: note.value.trim(),
    });
  } else {
    emit('submit', {
      kind: 'toComplaint',
      cat1: cat1.value ?? '',
      cat2: cat2.value ?? '',
      nature: nature.value,
      note: note.value.trim(),
    });
  }
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
    :ok-text="okText"
    :ok-disabled="!canSubmit"
    @update:open="emit('update:open', $event)"
    @ok="onSubmit"
    @cancel="close"
  >
    <div class="op-form esc-form">
      <!-- 升阶路径：非投诉 → 投诉 → 外投，当前/可升一眼可见 -->
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

      <!-- 分支一：非投诉 → 投诉，选分类、性质自动判定 -->
      <template v-if="!isExternal">
        <div class="op-field-row">
          <div class="op-field">
            <div class="op-label req">投诉一类</div>
            <ASelect
              v-model:value="cat1"
              :options="cat1Options"
              placeholder="请选择"
              style="width:100%"
            />
          </div>
          <div class="op-field">
            <div class="op-label req">投诉二类</div>
            <ASelect
              v-model:value="cat2"
              :options="cat2Options"
              :disabled="!cat1"
              placeholder="请选择"
              style="width:100%"
            />
          </div>
        </div>
        <div class="op-field">
          <div class="op-label">投诉性质</div>
          <div class="esc-derived" :class="{ empty: !nature }">
            {{ nature || '选择投诉二类后自动判定' }}
          </div>
          <div class="op-hint">性质由投诉二类推导，不单独选；其余投诉专属字段在下一步建单页补齐。</div>
        </div>
      </template>

      <!-- 分支二：投诉 → 外投，只补增量字段 -->
      <template v-else>
        <div class="op-field-row">
          <div class="op-field">
            <div class="op-label req">投诉平台</div>
            <ASelect
              v-model:value="platform"
              :options="platformOptions"
              placeholder="选择外部投诉平台"
              style="width:100%"
              show-search
            />
          </div>
          <div class="op-field">
            <div class="op-label req">投诉编号</div>
            <AInput v-model:value="complaintNo" placeholder="外部平台工单号" />
          </div>
        </div>
        <div class="op-field-row">
          <div class="op-field">
            <div class="op-label">前期反馈</div>
            <ASelect
              v-model:value="priorFeedback"
              :options="priorFeedbackOptions"
              placeholder="请选择"
              style="width:100%"
              allow-clear
            />
          </div>
          <div class="op-field">
            <div class="op-label">服务回溯</div>
            <ASelect
              v-model:value="serviceReview"
              :options="serviceReviewOptions"
              placeholder="请选择"
              style="width:100%"
              allow-clear
            />
          </div>
        </div>
        <div class="op-hint">工单来源将置为「外投渠道」；投诉分类与其余信息从原单同步，无需重录。</div>
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
          <div class="op-hint">{{ isExternal ? '直接带入外投新单' : '建单页可再调整' }}</div>
        </div>
      </div>

      <div class="esc-foot">
        <template v-if="originClosed">
          原单已是「{{ detail.status }}」，将直接建新单并双向关联。
        </template>
        <template v-else-if="isExternal">
          确认后：关闭原单 → 建外投新单（来源=外投渠道）→ 双向关联。
        </template>
        <template v-else>
          确认后：进建单页补齐投诉字段 → 提交即关闭原单、建投诉新单并双向关联。
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
.esc-step.is-current { background: #fffbeb; }
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

/* 推导值（投诉性质）只读框 */
.esc-derived {
  display: flex; align-items: center;
  height: 32px; padding: 0 11px;
  font-size: 13px; color: #374151; font-weight: 600;
  background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px;
}
.esc-derived.empty { color: #b0b4bb; font-weight: 400; }

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
