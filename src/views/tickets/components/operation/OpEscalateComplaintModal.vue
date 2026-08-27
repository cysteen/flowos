<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useUserStore } from '@/stores/user';
import { Select as ASelect, Input as AInput } from 'ant-design-vue';
import { ArrowUpOutlined, CloseOutlined, DownOutlined, PlusOutlined, UpOutlined } from '@ant-design/icons-vue';
import OpActionModal from './OpActionModal.vue';
import type { TicketDetailMeta } from '@/mock/ticketDetail';
import {
  COMPLAINT_L1_OPTIONS,
  COMPLAINT_L2_MAP,
  CUSTOM_PLATFORM_OPTION,
  TICKET_SOURCE_OPTIONS,
  complaintPlatformsBySource,
} from '@/views/tickets/types/createTicket';
import {
  buildEscalateSyncFields,
  buildEscalateVerdict,
  isTicketTerminated,
  type ComplaintCategoryPick,
  type ComplaintPlatformPick,
  type EscalateInput,
} from '@/views/tickets/composables/complaintEscalation';

/**
 * 升级投诉弹窗 —— **仅用于「原单已是投诉单」**（分支 B）。
 * 非投诉单升级走新建投诉单页面（分支 A），不进本弹窗。
 *
 * 落法由【工单来源】决定：外投渠道 → 建外投关联单（关原单 + 双向关联）；
 * 其余来源 → 落为「补充」写在原单上，不建新单、不关单。
 */
const props = defineProps<{
  open: boolean;
  detail: TicketDetailMeta;
}>();

const emit = defineEmits<{
  'update:open': [v: boolean];
  submit: [payload: EscalateInput];
}>();

// 升级判定要看**发起人角色**（一线在投诉单上不可升级），故传当前 roleKey
const user = useUserStore();
const verdict = computed(() => buildEscalateVerdict(props.detail, user.roleKey));
const syncFields = computed(() => buildEscalateSyncFields(props.detail));
const originClosed = computed(() => isTicketTerminated(props.detail.status));

const source = ref<string | undefined>(undefined);
const categories = ref<ComplaintCategoryPick[]>([{ cat1: '', cat2: '' }]);
const platforms = ref<ComplaintPlatformPick[]>([]);
const note = ref('');
const syncOpen = ref(false);

const sourceOptions = TICKET_SOURCE_OPTIONS.map((v) => ({ value: v, label: v }));
const cat1Options = COMPLAINT_L1_OPTIONS.map((v) => ({ value: v, label: v }));
function cat2OptionsOf(cat1: string) {
  return (COMPLAINT_L2_MAP[cat1] ?? []).map((v) => ({ value: v, label: v }));
}

/** 平台字典随来源切换：外投渠道=外部平台，内投渠道=内部渠道，其余来源无平台 */
const platformOptions = computed(() =>
  complaintPlatformsBySource(source.value).map((v) => ({ value: v, label: v })),
);
const showPlatform = computed(() => platformOptions.value.length > 0);
/** 外投渠道＝关原单建外投单；其余＝落补充 */
const isExternal = computed(() => source.value === '外投渠道');

watch(
  () => props.open,
  (v) => {
    if (!v) return;
    source.value = undefined;
    categories.value = [{ cat1: '', cat2: '' }];
    platforms.value = [];
    note.value = '';
    syncOpen.value = false;
  },
);

// 来源换了 → 平台字典变了，已选平台作废
watch(source, () => {
  platforms.value = showPlatform.value ? [{ platform: '', complaintNo: '' }] : [];
});

function onCat1Change(row: ComplaintCategoryPick) {
  row.cat2 = '';
}
function addCategory() {
  categories.value.push({ cat1: '', cat2: '' });
}
function removeCategory(i: number) {
  categories.value.splice(i, 1);
  if (!categories.value.length) categories.value.push({ cat1: '', cat2: '' });
}
function addPlatform() {
  platforms.value.push({ platform: '', complaintNo: '' });
}
function removePlatform(i: number) {
  platforms.value.splice(i, 1);
}

const validCategories = computed(() => categories.value.filter((c) => c.cat1 && c.cat2));

const canSubmit = computed(() => {
  if (!verdict.value.entryEnabled) return false;
  if (!source.value || !note.value.trim()) return false;
  if (!validCategories.value.length) return false;
  // 外投渠道：至少一个平台；选「其他」时须手填名称
  if (isExternal.value) {
    const rows = platforms.value.filter((p) => p.platform);
    if (!rows.length) return false;
    if (rows.some((p) => p.platform === CUSTOM_PLATFORM_OPTION && !(p.customPlatform ?? '').trim())) return false;
  }
  return true;
});

const okText = computed(() => (isExternal.value ? '确认升级为外投' : '确认补充到原单'));

function close() {
  emit('update:open', false);
}

function onSubmit() {
  if (!canSubmit.value || !source.value) return;
  emit('submit', {
    kind: 'onComplaint',
    source: source.value,
    categories: validCategories.value.map((c) => ({ ...c })),
    platforms: platforms.value
      .filter((p) => p.platform)
      .map((p) => ({ ...p, complaintNo: p.complaintNo.trim() })),
    note: note.value.trim(),
  });
  close();
}
</script>

<template>
  <OpActionModal
    :open="open"
    title="升级投诉 · 升级外投"
    :icon="ArrowUpOutlined"
    tone="warn"
    :width="560"
    :ok-text="okText"
    :ok-disabled="!canSubmit"
    @update:open="emit('update:open', $event)"
    @ok="onSubmit"
    @cancel="close"
  >
    <div class="op-form esc-form">
      <div class="esc-meta">
        <span class="op-mono">{{ detail.no }}</span>
        <span class="esc-dot">·</span>
        <span>{{ detail.status }}</span>
        <span class="esc-dot">·</span>
        <span>{{ verdict.tierLabel }}</span>
      </div>

      <div class="op-field">
        <div class="op-label req">工单来源</div>
        <ASelect
          v-model:value="source"
          :options="sourceOptions"
          placeholder="选择本次投诉的来源"
          style="width:100%"
        />
        <div class="op-hint">
          选「外投渠道」将关闭原单并新建外投关联单；其余来源作为补充信息写在原单上，不建新单。
        </div>
      </div>

      <!-- 投诉分类：多组，一次投诉可命中多个问题 -->
      <div class="op-field">
        <div class="esc-rows-head">
          <span class="op-label req">投诉分类</span>
          <button type="button" class="esc-add" @click="addCategory"><PlusOutlined />添加分类</button>
        </div>
        <div class="esc-rows">
          <div v-for="(row, i) in categories" :key="`cat-${i}`" class="esc-row">
            <ASelect
              v-model:value="row.cat1"
              :options="cat1Options"
              placeholder="投诉一类"
              class="esc-row-main"
              @change="onCat1Change(row)"
            />
            <ASelect
              v-model:value="row.cat2"
              :options="cat2OptionsOf(row.cat1)"
              :disabled="!row.cat1"
              placeholder="投诉二类"
              class="esc-row-main"
            />
            <button
              type="button"
              class="esc-row-del"
              :disabled="categories.length === 1 && !row.cat1"
              title="移除该组"
              @click="removeCategory(i)"
            ><CloseOutlined /></button>
          </div>
        </div>
      </div>

      <!-- 投诉平台 + 编号：成对多组，仅内投/外投渠道有 -->
      <div v-if="showPlatform" class="op-field">
        <div class="esc-rows-head">
          <span class="op-label" :class="{ req: isExternal }">投诉平台 / 编号</span>
          <button type="button" class="esc-add" @click="addPlatform"><PlusOutlined />添加平台</button>
        </div>
        <div class="esc-rows">
          <div v-for="(row, i) in platforms" :key="`plat-${i}`" class="esc-row">
            <ASelect
              v-model:value="row.platform"
              :options="platformOptions"
              placeholder="投诉平台"
              class="esc-row-main"
              show-search
            />
            <AInput
              v-if="row.platform === CUSTOM_PLATFORM_OPTION"
              v-model:value="row.customPlatform"
              class="esc-row-main"
              placeholder="填写平台名称"
            />
            <AInput v-model:value="row.complaintNo" class="esc-row-main" placeholder="投诉编号（选填）" />
            <button type="button" class="esc-row-del" title="移除该组" @click="removePlatform(i)">
              <CloseOutlined />
            </button>
          </div>
          <div v-if="!platforms.length" class="esc-empty">暂无平台，点「添加平台」录入</div>
        </div>
        <div class="op-hint">一个平台对应一个投诉编号；多渠道投诉就加多组。</div>
      </div>

      <div class="op-field">
        <div class="op-label req">投诉问题描述</div>
        <AInput.TextArea
          v-model:value="note"
          :rows="3"
          :maxlength="500"
          show-count
          placeholder="客户投诉的具体问题与诉求"
        />
      </div>

      <!-- 同步预览默认收起 -->
      <div class="esc-sync-wrap">
        <button type="button" class="esc-sync-toggle" @click="syncOpen = !syncOpen">
          <span>{{ isExternal ? `同步到外投新单的信息（${syncFields.length}）` : `原单信息（${syncFields.length}）` }}</span>
          <UpOutlined v-if="syncOpen" /><DownOutlined v-else />
        </button>
        <div v-if="syncOpen" class="op-box esc-sync">
          <div v-for="row in syncFields" :key="row.label" class="esc-sync-row">
            <span class="esc-sync-k">{{ row.label }}</span>
            <span class="esc-sync-v">{{ row.value }}</span>
          </div>
        </div>
      </div>

      <div class="esc-foot">
        <template v-if="isExternal && originClosed">
          原单已是「{{ detail.status }}」，将直接建外投新单并双向关联。
        </template>
        <template v-else-if="isExternal">
          确认后：关闭原单 → 建外投新单（来源=外投渠道）→ 双向关联。
        </template>
        <template v-else>
          确认后：本次投诉信息以「补充」写入原单，原单流程继续，不产生新单。
        </template>
      </div>
    </div>
  </OpActionModal>
</template>

<style scoped>
.esc-form { gap: 12px; }

.esc-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px 2px;
  font-size: 12px;
  color: #6b7280;
}
.esc-dot { color: #d1d5db; margin: 0 4px; }

.esc-rows-head { display: flex; align-items: center; justify-content: space-between; }
.esc-add {
  display: inline-flex; align-items: center; gap: 4px;
  height: 24px; padding: 0 8px;
  border: 1px dashed #d1d5db; border-radius: 6px;
  background: #fff; color: #1a6fff; font-size: 12px; cursor: pointer; font-family: inherit;
}
.esc-add:hover { border-color: #1a6fff; background: #eff6ff; }
.esc-rows { display: flex; flex-direction: column; gap: 6px; }
.esc-row { display: flex; align-items: center; gap: 6px; }
.esc-row-main { flex: 1; min-width: 0; }
.esc-row-del {
  flex: none;
  display: inline-flex; align-items: center; justify-content: center;
  width: 24px; height: 24px; padding: 0;
  border: none; border-radius: 4px; background: transparent;
  color: #9ca3af; cursor: pointer; font-size: 11px;
}
.esc-row-del:hover:not(:disabled) { color: #ef4444; background: #fef2f2; }
.esc-row-del:disabled { color: #e5e7eb; cursor: not-allowed; }
.esc-empty { font-size: 12px; color: #b0b4bb; padding: 4px 2px; }

.esc-sync-wrap { border-top: 1px dashed #eef0f3; padding-top: 4px; }
.esc-sync-toggle {
  display: flex; align-items: center; justify-content: space-between;
  width: 100%; padding: 6px 0;
  border: none; background: transparent; cursor: pointer;
  font-size: 13px; color: #6b7280; font-family: inherit;
}
.esc-sync-toggle:hover { color: #1a6fff; }
.esc-sync { gap: 4px; margin-top: 4px; max-height: 140px; overflow: auto; }
.esc-sync-row { display: flex; gap: 10px; line-height: 1.6; font-size: 12px; }
.esc-sync-k { flex: none; width: 60px; color: #9ca3af; }
.esc-sync-v { min-width: 0; color: #374151; }

.esc-foot { font-size: 12px; color: #9ca3af; line-height: 1.5; }
</style>
