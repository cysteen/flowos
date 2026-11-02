<script setup lang="ts">
// 人员画像五维编辑（PRD 6.5）：每维一块，「不限 / 指定」（批量另有「不修改」），选「指定」时下方出多选
import { TreeSelect } from 'ant-design-vue';
import { PROFILE_DIMS, type ProfileDimKey } from '@/views/tickets/types/dispatch';
import {
  BUSINESS_TYPE_OPTS, CUSTOMER_TYPE_OPTS, PRODUCT_TREE_OPTS, TICKET_TYPE_OPTS, maxTagPlaceholder, problemTagLabel, problemTreeOpts,
} from './dispatchUi';
import type { ProfileDraft } from './profileDraft';
import { computed } from 'vue';
import { normalizeProblemPicks, problemPathsOfGroups, scopedProblemTree } from './problemScope';

/** groupIds：坐席所属组（批量为所选坐席所属组的并集）；给出时问题分类「指定」只列所属组在问题分类管理中处理的分类 */
const props = defineProps<{ allowKeep?: boolean; groupIds?: string[] }>();
const draft = defineModel<ProfileDraft>({ required: true });
const SHOW_PARENT = TreeSelect.SHOW_PARENT;

const problemScope = computed(() => (props.groupIds ? problemPathsOfGroups(props.groupIds) : null));
const problemPickDisabled = computed(() => problemScope.value !== null && problemScope.value.length === 0);
const problemTree = computed(() => (problemScope.value
  ? scopedProblemTree(problemScope.value, draft.value.problems.values)
  : problemTreeOpts()));
const staleProblems = computed(() => new Set(
  (problemTree.value as { value: string; stale?: boolean }[]).filter((n) => n.stale).map((n) => n.value),
));
const problemTitles = computed(() => {
  const m = new Map<string, string>();
  const walk = (ns: { value: string; title: string; tagLabel?: string; children?: unknown[] }[]) => ns.forEach((n) => {
    m.set(n.value, n.tagLabel ?? n.title);
    if (n.children) walk(n.children as typeof ns);
  });
  walk(problemTree.value);
  return m;
});
const problemValues = computed<string[]>({
  get: () => draft.value.problems.values,
  set: (v) => {
    draft.value.problems.values = problemScope.value ? normalizeProblemPicks(v, problemScope.value) : v;
  },
});
const LIST_OPTS: Partial<Record<ProfileDimKey, { value: string; label: string }[]>> = {
  businessTypes: BUSINESS_TYPE_OPTS,
  ticketTypes: TICKET_TYPE_OPTS,
  customerTypes: CUSTOMER_TYPE_OPTS,
};
</script>

<template>
  <div class="pde">
    <div v-for="d in PROFILE_DIMS" :key="d.key" class="pde-item">
      <div class="pde-head">
        <span class="pde-label">{{ d.label }}</span>
        <a-radio-group v-model:value="draft[d.key].mode" size="small" option-type="button" button-style="solid" class="pde-mode">
          <a-radio-button v-if="allowKeep" value="keep">不修改</a-radio-button>
          <a-radio-button value="any">不限</a-radio-button>
          <a-tooltip v-if="d.key === 'problems' && problemPickDisabled" title="所属组在问题分类管理中暂无处理的问题分类">
            <a-radio-button value="pick" disabled>指定</a-radio-button>
          </a-tooltip>
          <a-radio-button v-else value="pick">指定</a-radio-button>
        </a-radio-group>
      </div>
      <div v-if="draft[d.key].mode === 'pick'" class="pde-pick">
        <a-tree-select
          v-if="d.key === 'problems'"
          v-model:value="problemValues"
          :tree-data="problemTree"
          tree-checkable
          :show-checked-strategy="SHOW_PARENT"
          :field-names="{ label: 'title', value: 'value', children: 'children' }"
          :placeholder="`请选择${d.label}`"
          max-tag-count="responsive"
          :max-tag-placeholder="maxTagPlaceholder"
          size="small"
          class="pde-ctrl"
        >
          <template #title="{ title, stale, level }">
            <span :class="{ 'pde-stale': stale }"><span v-if="level" class="pde-lv">{{ level }}</span>{{ title }}</span>
          </template>
          <template #tagRender="{ value, closable, onClose }">
            <a-tag :closable="closable" :class="['pde-tag', { 'pde-tag-stale': staleProblems.has(value) }]" @close="onClose">{{ problemTitles.get(value) ?? problemTagLabel(value) }}</a-tag>
          </template>
        </a-tree-select>
        <a-tree-select
          v-else-if="d.key === 'products'"
          v-model:value="draft[d.key].values"
          :tree-data="PRODUCT_TREE_OPTS"
          tree-checkable
          :show-checked-strategy="SHOW_PARENT"
          :field-names="{ label: 'title', value: 'value', children: 'children' }"
          :placeholder="`请选择${d.label}`"
          max-tag-count="responsive"
          :max-tag-placeholder="maxTagPlaceholder"
          size="small"
          class="pde-ctrl"
        />
        <a-select
          v-else
          v-model:value="draft[d.key].values"
          mode="multiple"
          :options="LIST_OPTS[d.key]"
          :placeholder="`请选择${d.label}`"
          max-tag-count="responsive"
          :max-tag-placeholder="maxTagPlaceholder"
          size="small"
          class="pde-ctrl"
        />
      </div>
      <p v-else-if="draft[d.key].mode == null" class="pde-hint">请选择「不限」或「指定」</p>
    </div>
  </div>
</template>

<style scoped>
.pde { display: flex; flex-direction: column; gap: 0; min-width: 0; }
.pde-item {
  padding: 7px 0;
  border-bottom: 1px solid #f2f3f5;
}
.pde-item:first-child { padding-top: 0; }
.pde-item:last-child { border-bottom: none; padding-bottom: 0; }
.pde-head {
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
  flex-wrap: wrap; min-width: 0;
}
.pde-item:has(.pde-pick) .pde-head { margin-bottom: 6px; }
.pde-label { font-size: 12px; font-weight: 500; color: #374151; flex: 1; min-width: 72px; }
.pde-mode { flex: none; }
.pde-mode :deep(.ant-radio-button-wrapper) {
  font-size: 12px; height: 26px; line-height: 24px; padding-inline: 8px;
}
.pde-pick { min-width: 0; }
.pde-ctrl { width: 100%; }
.pde-ctrl :deep(.ant-select-selector),
.pde-ctrl :deep(.ant-select-selection-wrap) { min-height: 28px !important; }
.pde-stale { color: #9ca3af; }
.pde-lv {
  display: inline-block; margin-right: 6px; padding: 0 4px; font-size: 11px; line-height: 16px;
  color: #6b7280; background: #f3f4f6; border-radius: 3px; vertical-align: 1px;
}
.pde-tag { margin-inline-end: 4px; font-size: 12px; }
.pde-tag-stale { color: #9ca3af; background: #f3f4f6; border-color: #e5e7eb; }
.pde-hint { margin: 2px 0 0; font-size: 11px; line-height: 1.35; color: #d97706; }
</style>
