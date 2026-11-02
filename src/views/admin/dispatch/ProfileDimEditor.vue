<script setup lang="ts">
// 人员画像五维编辑（PRD 6.5）：每维一行，左侧「不限 / 指定」（批量另有「不修改」），选「指定」时右侧出多选
import { TreeSelect } from 'ant-design-vue';
import { PROFILE_DIMS, type ProfileDimKey } from '@/views/tickets/types/dispatch';
import {
  BUSINESS_TYPE_OPTS, CUSTOMER_TYPE_OPTS, PROBLEM_TREE_OPTS, PRODUCT_TREE_OPTS, TICKET_TYPE_OPTS,
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
  : PROBLEM_TREE_OPTS));
const staleProblems = computed(() => new Set(
  (problemTree.value as { value: string; stale?: boolean }[]).filter((n) => n.stale).map((n) => n.value),
));
const problemTitles = computed(() => {
  const m = new Map<string, string>();
  const walk = (ns: { value: string; title: string; children?: unknown[] }[]) => ns.forEach((n) => {
    m.set(n.value, n.title);
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
    <div v-for="d in PROFILE_DIMS" :key="d.key" class="pde-row">
      <span class="pde-k">{{ d.label }}</span>
      <a-radio-group v-model:value="draft[d.key].mode" class="pde-mode">
        <a-radio v-if="allowKeep" value="keep">不修改</a-radio>
        <a-radio value="any">不限</a-radio>
        <a-tooltip v-if="d.key === 'problems' && problemPickDisabled" title="所属组在问题分类管理中暂无处理的问题分类">
          <a-radio value="pick" disabled>指定</a-radio>
        </a-tooltip>
        <a-radio v-else value="pick">指定</a-radio>
      </a-radio-group>
      <div class="pde-v">
        <template v-if="draft[d.key].mode === 'pick'">
          <a-tree-select
            v-if="d.key === 'problems'"
            v-model:value="problemValues"
            :tree-data="problemTree"
            tree-checkable
            :show-checked-strategy="SHOW_PARENT"
            :field-names="{ label: 'title', value: 'value', children: 'children' }"
            :placeholder="`请选择${d.label}`"
            max-tag-count="responsive"
            style="width: 100%"
          >
            <template #title="{ title, stale }">
              <span :class="{ 'pde-stale': stale }">{{ title }}</span>
            </template>
            <template #tagRender="{ value, closable, onClose }">
              <a-tag :closable="closable" :class="['pde-tag', { 'pde-tag-stale': staleProblems.has(value) }]" @close="onClose">{{ problemTitles.get(value) ?? value }}</a-tag>
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
            style="width: 100%"
          />
          <a-select
            v-else
            v-model:value="draft[d.key].values"
            mode="multiple"
            :options="LIST_OPTS[d.key]"
            :placeholder="`请选择${d.label}`"
            max-tag-count="responsive"
            style="width: 100%"
          />
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.pde { display: flex; flex-direction: column; gap: 10px; }
.pde-row { display: flex; align-items: center; gap: 10px; min-height: 32px; }
.pde-k { width: 64px; flex: none; color: #374151; font-size: 13px; }
.pde-mode { flex: none; white-space: nowrap; }
.pde-v { flex: 1; min-width: 0; }
.pde-stale { color: #9ca3af; }
.pde-tag { margin-inline-end: 4px; font-size: 12px; }
.pde-tag-stale { color: #9ca3af; background: #f3f4f6; border-color: #e5e7eb; }
</style>
