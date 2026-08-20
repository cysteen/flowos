<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Select as ASelect, Input as AInput, Checkbox as ACheckbox } from 'ant-design-vue';
import { FileAddOutlined, PlusOutlined, CloseOutlined } from '@ant-design/icons-vue';
import OpActionModal from './OpActionModal.vue';
import OpTextareaAttach from './shared/OpTextareaAttach.vue';
import type { ComplaintCategoryPick } from '@/views/tickets/composables/complaintEscalation';
import { SUPPLEMENT_TYPE_OPTIONS, COMPLAINT_SUPPLEMENT_TYPE, COMPLAINT_TICKET_SUPPLEMENT_OPTIONS } from '@/views/tickets/types/operationTabs';
import {
  COMPLAINT_L1_OPTIONS,
  COMPLAINT_L2_MAP,
  CUSTOM_PLATFORM_OPTION,
  complaintPlatformsBySource,
  inferComplaintChannelSource,
  inferOriginalComplaintKind,
  shouldShowComplaintChannelSupplement,
} from '@/views/tickets/types/createTicket';

/** 一条投诉渠道记录：一平台一组三项（平台 + 编号 + 内容），PRD-830 §5.3 */
export interface ComplaintChannelRow {
  platform: string;
  /** 选「其他」时手填平台名 */
  customPlatform?: string;
  complaintNo: string;
  complaintContent: string;
}

const props = withDefaults(
  defineProps<{
    open: boolean;
    /** 工单类型——仅「投诉」才出现「补充投诉信息」这一分类（基线 §4 ※22） */
    ticketType?: string;
    /** 投诉类型（≠服务投诉 时要补选投诉一类/二类） */
    complaintType?: string;
    /** 工单来源（内投渠道 / 外投渠道 时要追加投诉平台） */
    ticketSource?: string;
    /** 已有投诉渠道台账（有平台时可反推内投/外投字典） */
    existingPlatforms?: { platform?: string; complaintNo?: string; complaintContent?: string }[];
    /** 外投标记（与处理页投诉渠道 chip 一致） */
    isExternalAppeal?: boolean;
    /** 工单已有投诉一类/二类（只读展示，追加区在其下） */
    existingCategories?: ComplaintCategoryPick[];
  }>(),
  {
    ticketType: '',
    complaintType: '',
    ticketSource: '',
    existingPlatforms: () => [],
    isExternalAppeal: false,
    existingCategories: () => [],
  },
);

const emit = defineEmits<{
  'update:open': [v: boolean];
  submit: [
    payload: {
      supplementType: string;
      content: string;
      attachments: string[];
      /** 仅「补充投诉信息」时有值；一组一类/二类 */
      complaintCategories?: ComplaintCategoryPick[];
      complaintChannels?: ComplaintChannelRow[];
    },
  ];
}>();

const supplementType = ref<string | undefined>(undefined);
const content = ref('');
const attachments = ref<string[]>([]);

// ---- 投诉补录区（仅「补充投诉信息」展开）----
const pickCategory = ref(false);
const pickChannel = ref(false);
const categoryRow = ref<ComplaintCategoryPick>(emptyCategoryRow());
const channels = ref<ComplaintChannelRow[]>([]);

function emptyCategoryRow(): ComplaintCategoryPick {
  return { cat1: '', cat2: '' };
}

/** 投诉单才给「补充投诉信息」这一项；非投诉单该项**不出现**（不是置灰） */
const isComplaintTicket = computed(() => props.ticketType === '投诉');

const typeOptions = computed(() =>
  (isComplaintTicket.value ? COMPLAINT_TICKET_SUPPLEMENT_OPTIONS : SUPPLEMENT_TYPE_OPTIONS)
    .map((v) => ({ value: v, label: v })),
);

/** 投诉补录区是否展开——唯一开关就是补充分类选了「补充投诉信息」 */
const isComplaintSupplement = computed(() => supplementType.value === COMPLAINT_SUPPLEMENT_TYPE);

/** 补充投诉信息时展示追加分类区 */
const showComplaintCategoryAppend = computed(() => isComplaintSupplement.value);

/** 归一化来源 + 从已有平台台账 / 外投标记反推（对齐 OpProcessForm） */
const effectiveChannelSource = computed(() =>
  inferComplaintChannelSource(
    props.ticketSource,
    props.existingPlatforms,
    props.isExternalAppeal,
  ),
);

/** 是否可勾选「补充投诉渠道」（内投/外投来源或已有台账） */
const channelAvailable = computed(() => {
  if (!isComplaintSupplement.value) return false;
  if (effectiveChannelSource.value === '内投渠道' || effectiveChannelSource.value === '外投渠道') {
    return true;
  }
  return shouldShowComplaintChannelSupplement(
    props.ticketSource,
    props.existingPlatforms,
    props.isExternalAppeal,
  );
});

const channelPickLabel = computed(() => {
  if (effectiveChannelSource.value === '外投渠道') return '补充外投渠道';
  if (effectiveChannelSource.value === '内投渠道') return '补充内投渠道';
  return '补充投诉渠道';
});

const existingPlatformRows = computed(() =>
  (props.existingPlatforms ?? []).filter((p) => p.platform),
);

const existingCategoryRows = computed(() =>
  (props.existingCategories ?? []).filter((c) => c.cat1 && c.cat2),
);

/** 原单投诉类型 ≠ 服务投诉 时可补选投诉一级/二级（PRD-830 §5.1 ※3） */
const canSupplementCategory = computed(() => {
  if (!showComplaintCategoryAppend.value) return false;
  if (props.complaintType === '服务投诉') return false;
  if (existingCategoryRows.value.length && !inferOriginalComplaintKind(existingCategoryRows.value)) {
    return false;
  }
  return true;
});

const hasMixedComplaintKinds = computed(
  () => existingCategoryRows.value.length > 0 && !inferOriginalComplaintKind(existingCategoryRows.value),
);

const hasComplaintPickOptions = computed(
  () => canSupplementCategory.value || channelAvailable.value,
);

const existingPlatformSummary = computed(() =>
  existingPlatformRows.value.map((p) => p.platform).filter(Boolean).join('、'),
);

const existingCategorySummary = computed(() =>
  existingCategoryRows.value.map((c) => `${c.cat1}/${c.cat2}`).join('、'),
);

const l1Options = computed(() =>
  COMPLAINT_L1_OPTIONS.map((v) => ({ value: v, label: v })),
);

function cat2OptionsOf(cat1: string) {
  return (COMPLAINT_L2_MAP[cat1] ?? []).map((v) => ({ value: v, label: v }));
}

const validCategory = computed((): ComplaintCategoryPick | null => {
  const c = categoryRow.value;
  if (!c.cat1 || !c.cat2) return null;
  return { cat1: c.cat1, cat2: c.cat2 };
});

function initAppendRow(): ComplaintCategoryPick {
  return emptyCategoryRow();
}

function resetComplaintFields() {
  pickCategory.value = false;
  pickChannel.value = false;
  categoryRow.value = emptyCategoryRow();
  channels.value = [];
}

function onCat1Change() {
  categoryRow.value.cat2 = '';
}

function emptyChannelRow(): ComplaintChannelRow {
  return { platform: '', customPlatform: '', complaintNo: '', complaintContent: '' };
}

watch(
  () => props.open,
  (v) => {
    if (!v) return;
    supplementType.value = undefined;
    content.value = '';
    attachments.value = [];
    resetComplaintFields();
  },
);

// 切换补充分类：从「补充投诉信息」切走时，投诉补录区收起并**清空已填**，
// 避免把不属于本条补充的投诉信息带着提交（PRD-830 §5.1 元素说明 5）
watch(isComplaintSupplement, (on) => {
  if (!on) resetComplaintFields();
});

watch(pickCategory, (on) => {
  if (on && canSupplementCategory.value) {
    categoryRow.value = initAppendRow();
  } else {
    categoryRow.value = emptyCategoryRow();
  }
});

watch(pickChannel, (on) => {
  if (on && channelAvailable.value) {
    channels.value = [emptyChannelRow()];
  } else {
    channels.value = [];
  }
});

watch(
  () => effectiveChannelSource.value,
  () => {
    if (!pickChannel.value || !channelAvailable.value) return;
    const allowed = complaintPlatformsBySource(effectiveChannelSource.value);
    const stillValid = channels.value.every(
      (r) => !r.platform || allowed.includes(r.platform),
    );
    if (!stillValid) channels.value = [emptyChannelRow()];
    else if (!channels.value.length) channels.value = [emptyChannelRow()];
  },
);

function addChannel() {
  channels.value.push(emptyChannelRow());
}

function removeChannel(idx: number) {
  channels.value.splice(idx, 1);
  if (!channels.value.length) channels.value = [emptyChannelRow()];
}

const platformOptions = computed(() =>
  complaintPlatformsBySource(effectiveChannelSource.value).map((v) => ({ value: v, label: v })),
);

const filledChannels = computed(() =>
  channels.value.filter((c) => c.platform),
);

/** 选了平台则编号与内容均必填；选「其他」须手填平台名 */
const channelsValid = computed(() =>
  channels.value.every((c) => {
    if (!c.platform) return true;
    if (c.platform === CUSTOM_PLATFORM_OPTION && !c.customPlatform?.trim()) return false;
    return !!c.complaintNo.trim() && !!c.complaintContent.trim();
  }),
);

const channelsSubmitReady = computed(() => {
  if (!pickChannel.value) return true;
  return filledChannels.value.length > 0 && channelsValid.value;
});

const categoriesSubmitReady = computed(() => {
  if (!pickCategory.value) return true;
  if (!canSupplementCategory.value) return true;
  return !!categoryRow.value.cat1 && !!categoryRow.value.cat2;
});

/** 选了「补充投诉信息」时须至少勾一项，且勾选项须填完整 */
const complaintSupplementReady = computed(() => {
  if (!isComplaintSupplement.value) return true;
  if (!hasComplaintPickOptions.value) return true;
  if (!pickCategory.value && !pickChannel.value) return false;
  return categoriesSubmitReady.value && channelsSubmitReady.value;
});

const canSubmit = computed(() => {
  if (!supplementType.value || !content.value.trim()) return false;
  if (!complaintSupplementReady.value) return false;
  return true;
});

/** 投诉补录弹窗加宽，容纳分类 + 渠道双区块 */
const modalWidth = computed(() => (isComplaintSupplement.value ? 560 : 480));

function close() {
  emit('update:open', false);
}

function onSubmit() {
  if (!canSubmit.value) return;
  emit('submit', {
    supplementType: supplementType.value!,
    content: content.value.trim(),
    attachments: [...attachments.value],
    ...(isComplaintSupplement.value
      ? {
          complaintCategories: pickCategory.value && validCategory.value
            ? [validCategory.value]
            : undefined,
          complaintChannels: pickChannel.value && filledChannels.value.length
            ? filledChannels.value.map((c) => ({
              platform: c.platform === CUSTOM_PLATFORM_OPTION
                ? (c.customPlatform?.trim() ?? CUSTOM_PLATFORM_OPTION)
                : c.platform,
              complaintNo: c.complaintNo.trim(),
              complaintContent: c.complaintContent.trim(),
            }))
            : undefined,
        }
      : {}),
  });
  close();
}

</script>

<template>
  <OpActionModal
    :open="open"
    title="新建补充"
    :icon="FileAddOutlined"
    tone="primary"
    :width="modalWidth"
    ok-text="提交补充"
    :ok-disabled="!canSubmit"
    @update:open="emit('update:open', $event)"
    @ok="onSubmit"
    @cancel="close"
  >
    <div class="supplement-body">
      <div class="op-form supplement-form">
        <div class="op-field">
          <div class="op-label req">补充分类</div>
          <ASelect
            v-model:value="supplementType"
            :options="typeOptions"
            placeholder="请选择补充分类"
            style="width:100%"
            allow-clear
          />
          <template v-if="isComplaintSupplement && hasComplaintPickOptions">
            <div class="cs-picks">
              <ACheckbox
                v-if="canSupplementCategory"
                v-model:checked="pickCategory"
              >
                补充投诉分类
              </ACheckbox>
              <ACheckbox
                v-if="channelAvailable"
                v-model:checked="pickChannel"
              >
                {{ channelPickLabel }}
              </ACheckbox>
            </div>
            <p v-if="hasMixedComplaintKinds" class="op-hint cs-warn">
              原单已含两类投诉，仅可补充渠道。
            </p>
          </template>
        </div>

        <div
          v-if="isComplaintSupplement && pickCategory && canSupplementCategory"
          class="cs-expand"
        >
          <p v-if="existingCategorySummary" class="op-hint">
            已有分类：{{ existingCategorySummary }}
          </p>
          <div class="cs-cat-row">
            <div class="cs-sub-field">
              <div class="cs-sub-label req">投诉一类</div>
              <ASelect
                v-model:value="categoryRow.cat1"
                :options="l1Options"
                placeholder="请选择"
                allow-clear
                popup-class-name="supplement-compact-dropdown"
                @change="onCat1Change"
              />
            </div>
            <div class="cs-sub-field">
              <div class="cs-sub-label req">投诉二类</div>
              <ASelect
                v-model:value="categoryRow.cat2"
                :options="cat2OptionsOf(categoryRow.cat1)"
                :disabled="!categoryRow.cat1"
                :placeholder="categoryRow.cat1 ? '请选择' : '先选一类'"
                allow-clear
                popup-class-name="supplement-compact-dropdown"
              />
            </div>
          </div>
        </div>

        <div
          v-if="isComplaintSupplement && pickChannel && channelAvailable"
          class="cs-expand"
        >
          <p v-if="existingPlatformSummary" class="op-hint">
            已有平台：{{ existingPlatformSummary }}
          </p>
          <div class="cp-group">
            <div v-for="(row, i) in channels" :key="`cp-${i}`" class="cp-channel-wrap">
              <div class="cp-row cp-row--channel">
                <ASelect
                  v-model:value="row.platform"
                  :options="platformOptions"
                  placeholder="平台"
                  class="cp-cell cp-cell--plat"
                  allow-clear
                  show-search
                  popup-class-name="supplement-compact-dropdown"
                />
                <AInput
                  v-model:value="row.complaintNo"
                  class="cp-cell cp-cell--no"
                  placeholder="编号"
                />
                <button
                  type="button"
                  class="cp-del"
                  title="移除"
                  :disabled="channels.length === 1 && !row.platform"
                  @click="removeChannel(i)"
                >
                  <CloseOutlined />
                </button>
                <button
                  v-if="i === 0"
                  type="button"
                  class="cp-add"
                  @click="addChannel"
                >
                  <PlusOutlined />添加
                </button>
                <span v-else class="cp-add-spacer" aria-hidden="true" />
              </div>
              <div v-if="row.platform === CUSTOM_PLATFORM_OPTION" class="cp-row cp-row--sub">
                <AInput
                  v-model:value="row.customPlatform"
                  class="cp-cell cp-cell--plat"
                  placeholder="填写平台名称"
                />
              </div>
              <AInput.TextArea
                v-model:value="row.complaintContent"
                class="cp-cell cp-cell--content"
                placeholder="投诉内容"
                :auto-size="{ minRows: 2, maxRows: 4 }"
              />
            </div>
          </div>
        </div>

        <div class="op-field">
          <div class="op-label req">补充内容</div>
          <OpTextareaAttach
            v-model="content"
            :attachments="attachments"
            :min-input-height="isComplaintSupplement ? 72 : 80"
            placeholder="请简要描述本次补充的信息…"
            @update:attachments="attachments = $event"
          />
        </div>
      </div>
    </div>
  </OpActionModal>
</template>

<style scoped>
.supplement-body {
  max-height: min(480px, calc(100vh - 200px));
  overflow-y: auto;
}
.supplement-form {
  gap: 12px;
}
.cs-picks {
  display: flex;
  flex-wrap: wrap;
  gap: 16px 20px;
  margin-top: 2px;
}
.cs-picks :deep(.ant-checkbox-wrapper) {
  margin-inline-end: 0;
  font-size: 13px;
  color: #4b5563;
  line-height: 1.4;
}
.cs-warn {
  color: #b45309;
}
.cs-expand {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: -4px;
  padding: 10px 0 2px 12px;
  border-left: 2px solid #dbeafe;
}
.cs-expand > .op-hint {
  margin: 0;
}
.cs-cat-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.cs-sub-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.cs-sub-label {
  font-size: 12px;
  color: #6b7280;
  line-height: 1.2;
}
.cs-sub-label.req::before {
  content: '* ';
  color: #ef4444;
}
.cs-expand :deep(.ant-select-selector) {
  height: 28px;
  min-height: 28px;
  font-size: 12px;
}
.cs-expand :deep(.ant-select-selection-item),
.cs-expand :deep(.ant-select-selection-placeholder) {
  font-size: 12px;
  line-height: 26px;
}
.cs-expand :deep(.ant-select-arrow) {
  font-size: 10px;
}
.cp-group {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.cp-channel-wrap {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.cp-channel-wrap + .cp-channel-wrap {
  padding-top: 10px;
  border-top: 1px dashed #eef0f3;
}
.cp-row--channel .cp-cell--plat {
  flex: 1.4;
}
.cp-row--channel .cp-cell--no {
  flex: 1;
  max-width: 140px;
}
.cp-row--sub {
  padding-left: 0;
}
.cp-row,
.cp-row--sub {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.cp-cell--content {
  flex: 1;
  min-width: 0;
}
.cp-cell--content :deep(textarea.ant-input) {
  min-height: 56px;
  line-height: 1.5;
  resize: none;
  font-size: 12px;
}
.cp-cell {
  flex: 1;
  min-width: 0;
}
.cp-group :deep(.ant-select-selector) {
  height: 26px;
  min-height: 26px;
  font-size: 12px;
}
.cp-group :deep(.ant-select-selection-item),
.cp-group :deep(.ant-select-selection-placeholder) {
  font-size: 12px;
  line-height: 24px;
}
.cp-group :deep(.ant-select-arrow) {
  font-size: 10px;
}
.cp-group :deep(.ant-input:not(textarea)) {
  height: 26px;
  font-size: 12px;
  padding: 2px 8px;
}
.cp-add {
  flex: none;
  box-sizing: border-box;
  min-width: 48px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 2px;
  height: 26px;
  padding: 0 6px;
  border: 1px dashed #dcdfe6;
  border-radius: 4px;
  background: #fff;
  color: #1a6fff;
  font-size: 11px;
  cursor: pointer;
  font-family: inherit;
  white-space: nowrap;
}
.cp-add :deep(.anticon) {
  font-size: 10px;
}
.cp-add:hover {
  border-color: #1a6fff;
  background: #f5f9ff;
}
.cp-add-spacer {
  flex: none;
  box-sizing: border-box;
  width: 48px;
  height: 26px;
}
.cp-del {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: #b0b4bb;
  cursor: pointer;
  font-size: 11px;
}
.cp-del:hover:not(:disabled) {
  color: #f56c6c;
  background: #fef2f2;
}
.cp-del:disabled {
  color: #e4e7ed;
  cursor: not-allowed;
}
</style>

<style>
.supplement-compact-dropdown .ant-select-item {
  font-size: 12px;
  min-height: 28px;
}
</style>
