<script setup lang="ts">
// 入池规则、指定人规则共用的七个工单条件（PRD 3.1）：不选为不限；问题分类树只读引用问题分类管理
import { computed } from 'vue';
import { TreeSelect } from 'ant-design-vue';
import type { Priority } from '@/views/tickets/types/ticket';
import {
  BUSINESS_TYPE_OPTS, CUSTOMER_TYPE_OPTS, PRIORITY_OPTS, PRODUCT_TREE_OPTS, TICKET_SOURCE_OPTS, TICKET_TYPE_OPTS,
  maxTagPlaceholder, problemTreeOpts,
} from './dispatchUi';

/** 表单对象由弹窗持有，产品取树节点值（分类名或「分类::名称」） */
defineProps<{
  form: {
    businessTypes: string[];
    ticketTypes: string[];
    problems: string[];
    products: string[];
    ticketSources: string[];
    customerTypes: string[];
    priorities: Priority[];
  };
}>();
const SHOW_PARENT = TreeSelect.SHOW_PARENT;
const problemTree = computed(problemTreeOpts);
</script>

<template>
  <div class="op-field op-field-h">
    <span class="op-label">业务类型</span>
    <a-select v-model:value="form.businessTypes" mode="multiple" :options="BUSINESS_TYPE_OPTS" placeholder="不限" allow-clear />
  </div>
  <div class="op-field op-field-h">
    <span class="op-label">工单类型</span>
    <a-select v-model:value="form.ticketTypes" mode="multiple" :options="TICKET_TYPE_OPTS" placeholder="不限" allow-clear />
  </div>
  <div class="op-field op-field-h">
    <span class="op-label">问题分类</span>
    <a-tree-select
      v-model:value="form.problems"
      class="rm-grow"
      :tree-data="problemTree"
      tree-checkable
      :show-checked-strategy="SHOW_PARENT"
      :field-names="{ label: 'title', value: 'value', children: 'children' }"
      tree-node-label-prop="tagLabel"
      placeholder="不限"
      allow-clear
      max-tag-count="responsive"
      :max-tag-placeholder="maxTagPlaceholder"
    >
      <template #title="{ title, level }">
        <span class="rm-lv">{{ level }}</span>{{ title }}
      </template>
    </a-tree-select>
  </div>
  <div class="op-field op-field-h">
    <span class="op-label">产品</span>
    <a-tree-select
      v-model:value="form.products"
      class="rm-grow"
      :tree-data="PRODUCT_TREE_OPTS"
      tree-checkable
      :show-checked-strategy="SHOW_PARENT"
      :field-names="{ label: 'title', value: 'value', children: 'children' }"
      placeholder="不限"
      allow-clear
      max-tag-count="responsive"
      :max-tag-placeholder="maxTagPlaceholder"
    />
  </div>
  <div class="op-field op-field-h">
    <span class="op-label">工单来源</span>
    <a-select v-model:value="form.ticketSources" mode="multiple" :options="TICKET_SOURCE_OPTS" placeholder="不限" allow-clear />
  </div>
  <div class="op-field op-field-h">
    <span class="op-label">客户类型</span>
    <a-select v-model:value="form.customerTypes" mode="multiple" :options="CUSTOMER_TYPE_OPTS" placeholder="不限" allow-clear />
  </div>
  <div class="op-field op-field-h">
    <span class="op-label">优先级（工单）</span>
    <a-select v-model:value="form.priorities" mode="multiple" :options="PRIORITY_OPTS" placeholder="不限" allow-clear />
  </div>
</template>

<style scoped>
.rm-grow { flex: 1; min-width: 0; }
.rm-lv {
  display: inline-block; margin-right: 6px; padding: 0 4px; font-size: 11px; line-height: 16px;
  color: #6b7280; background: #f3f4f6; border-radius: 3px; vertical-align: 1px;
}
.op-field-h > .op-label { width: 98px; }
</style>
