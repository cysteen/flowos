<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { SearchOutlined } from '@ant-design/icons-vue';
import {
  countOptionalSelected,
  pickerFieldsForVariant,
  type MineFilterFieldDef,
  type MineFilterFieldKey,
} from '@/views/tickets/types/mineQueryFields';

const props = defineProps<{
  open: boolean;
  variant: 'mine' | 'done' | 'pool';
  optionalVisible: Record<string, boolean>;
}>();

const emit = defineEmits<{
  'update:open': [v: boolean];
  confirm: [visible: Record<string, boolean>];
}>();

const search = ref('');
const draft = ref<Record<string, boolean>>({});

watch(
  () => props.open,
  (v) => {
    if (v) {
      draft.value = { ...props.optionalVisible };
      search.value = '';
    }
  },
);

const allFields = computed(() => pickerFieldsForVariant(props.variant));

const filteredFields = computed(() => {
  const q = search.value.trim().toLowerCase();
  if (!q) return allFields.value;
  return allFields.value.filter((f) => f.label.toLowerCase().includes(q));
});

const selectedCount = computed(() => countOptionalSelected(draft.value));

function isChecked(f: MineFilterFieldDef): boolean {
  if (f.fixed) return true;
  return draft.value[f.key] === true;
}

function toggle(f: MineFilterFieldDef) {
  if (f.fixed) return;
  draft.value = { ...draft.value, [f.key]: !draft.value[f.key] };
}

function clearSelected() {
  const next = { ...draft.value };
  for (const f of allFields.value) {
    if (!f.fixed) next[f.key] = false;
  }
  draft.value = next;
}

function confirm() {
  emit('confirm', { ...draft.value });
  emit('update:open', false);
}

function cancel() {
  emit('update:open', false);
}
</script>

<template>
  <a-popover
    :open="open"
    trigger="click"
    placement="bottomRight"
    overlay-class-name="filter-field-picker-pop"
    @update:open="emit('update:open', $event)"
  >
    <slot />
    <template #content>
      <div class="ffp">
        <div class="ffp-search">
          <SearchOutlined class="ffp-search-icon" />
          <input v-model="search" class="ffp-search-input" type="search" placeholder="搜索" />
        </div>

        <div class="ffp-toolbar">
          <button type="button" class="ffp-link" @click="clearSelected">清空已选</button>
          <button type="button" class="ffp-link">查看已选 {{ selectedCount }}</button>
        </div>

        <div class="ffp-list">
          <div
            v-for="f in filteredFields"
            :key="f.key"
            class="ffp-item"
            :class="{
              'is-fixed': f.fixed,
              'is-checked': isChecked(f) && !f.fixed,
            }"
            @click="toggle(f)"
          >
            <span class="ffp-cb" :class="{ checked: isChecked(f), disabled: f.fixed }" />
            <span class="ffp-label">{{ f.label }}</span>
          </div>
          <div v-if="!filteredFields.length" class="ffp-empty">无匹配字段</div>
        </div>

        <div class="ffp-foot">
          <button type="button" class="ffp-confirm" @click="confirm">确定</button>
          <button type="button" class="ffp-cancel" @click="cancel">取消</button>
        </div>
      </div>
    </template>
  </a-popover>
</template>

<style scoped>
.ffp {
  width: 280px;
  display: flex;
  flex-direction: column;
  gap: 0;
}
.ffp-search {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid #f0f0f0;
}
.ffp-search-icon {
  color: #9ca3af;
  font-size: 14px;
  flex: none;
}
.ffp-search-input {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  font-size: 13px;
  color: #374151;
  background: transparent;
}
.ffp-search-input::placeholder {
  color: #9ca3af;
}
.ffp-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-bottom: 1px solid #f0f0f0;
}
.ffp-link {
  padding: 0;
  border: none;
  background: transparent;
  font-size: 13px;
  color: #1a6fff;
  cursor: pointer;
}
.ffp-link:hover {
  text-decoration: underline;
}
.ffp-list {
  max-height: 320px;
  overflow: auto;
  padding: 4px 0;
}
.ffp-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  cursor: pointer;
  user-select: none;
}
.ffp-item:hover:not(.is-fixed) {
  background: #f9fafb;
}
.ffp-item.is-checked {
  background: #eff6ff;
}
.ffp-item.is-fixed {
  cursor: default;
}
.ffp-cb {
  width: 16px;
  height: 16px;
  border: 1px solid #d1d5db;
  border-radius: 3px;
  background: #fff;
  flex: none;
  position: relative;
}
.ffp-cb.checked {
  background: #1a6fff;
  border-color: #1a6fff;
}
.ffp-cb.checked::after {
  content: '';
  position: absolute;
  left: 4px;
  top: 1px;
  width: 5px;
  height: 9px;
  border: solid #fff;
  border-width: 0 2px 2px 0;
  transform: rotate(45deg);
}
.ffp-cb.disabled {
  background: #e5e7eb;
  border-color: #d1d5db;
}
.ffp-cb.disabled.checked {
  background: #9ca3af;
  border-color: #9ca3af;
}
.ffp-label {
  font-size: 14px;
  color: #374151;
}
.ffp-item.is-fixed .ffp-label {
  color: #9ca3af;
}
.ffp-empty {
  padding: 24px 12px;
  text-align: center;
  font-size: 13px;
  color: #9ca3af;
}
.ffp-foot {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-top: 1px solid #f0f0f0;
}
.ffp-confirm {
  padding: 5px 16px;
  font-size: 13px;
  font-weight: 500;
  color: #fff;
  background: #1a6fff;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}
.ffp-confirm:hover {
  background: #0f4fcc;
}
.ffp-cancel {
  padding: 0;
  border: none;
  background: transparent;
  font-size: 13px;
  color: #1a6fff;
  cursor: pointer;
}
.ffp-cancel:hover {
  text-decoration: underline;
}
</style>
