<script setup lang="ts">
// 人员画像五维编辑（PRD 6.5）：每维一行，左侧「不限 / 指定」（批量另有「不修改」），选「指定」时右侧出多选
import { TreeSelect } from 'ant-design-vue';
import { PROFILE_DIMS, type ProfileDimKey } from '@/views/tickets/types/dispatch';
import {
  BUSINESS_TYPE_OPTS, CUSTOMER_TYPE_OPTS, PROBLEM_TREE_OPTS, PRODUCT_TREE_OPTS, TICKET_TYPE_OPTS,
} from './dispatchUi';
import type { ProfileDraft } from './profileDraft';

defineProps<{ allowKeep?: boolean }>();
const draft = defineModel<ProfileDraft>({ required: true });
const SHOW_PARENT = TreeSelect.SHOW_PARENT;
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
        <a-radio value="pick">指定</a-radio>
      </a-radio-group>
      <div class="pde-v">
        <template v-if="draft[d.key].mode === 'pick'">
          <a-tree-select
            v-if="d.key === 'products' || d.key === 'problems'"
            v-model:value="draft[d.key].values"
            :tree-data="d.key === 'products' ? PRODUCT_TREE_OPTS : PROBLEM_TREE_OPTS"
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
</style>
