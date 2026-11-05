<script setup lang="ts">
// 新增 / 编辑指定人规则：规则名称、优先级、七个工单条件、指定人来源、状态；校验文案取 store。内置规则来源不可改
import { computed, reactive, watch } from 'vue';
import { message } from 'ant-design-vue';
import { UserSwitchOutlined } from '@ant-design/icons-vue';
import OpActionModal from '@/views/tickets/components/operation/OpActionModal.vue';
import { useDispatchStore } from '@/stores/dispatch';
import { DESIGNATED_MAPPINGS, type DesignatedMapping, type DesignatedRule, type DesignatedSource } from '@/views/tickets/types/dispatch';
import type { Priority } from '@/views/tickets/types/ticket';
import { opts, productToValue, valueToProduct } from './dispatchUi';
import RuleConditionFields from './RuleConditionFields.vue';

const props = defineProps<{ open: boolean; rule: DesignatedRule | null }>();
const emit = defineEmits<{ 'update:open': [v: boolean]; saved: [id: string] }>();
const store = useDispatchStore();

const f = reactive({
  name: '',
  priority: 1 as number | undefined,
  businessTypes: [] as string[],
  ticketTypes: [] as string[],
  problems: [] as string[],
  products: [] as string[],
  ticketSources: [] as string[],
  customerTypes: [] as string[],
  priorities: [] as Priority[],
  source: '固定人员' as DesignatedSource,
  assignee: undefined as string | undefined,
  mapping: DESIGNATED_MAPPINGS[0] as DesignatedMapping,
  enabled: true,
});

watch(() => props.open, (v) => {
  if (!v) return;
  const r = props.rule;
  if (r) {
    Object.assign(f, {
      name: r.name,
      priority: r.priority,
      businessTypes: [...r.conditions.businessTypes],
      ticketTypes: [...r.conditions.ticketTypes],
      problems: [...r.conditions.problems],
      products: r.conditions.products.map(productToValue),
      ticketSources: [...r.conditions.ticketSources],
      customerTypes: [...r.conditions.customerTypes],
      priorities: [...r.conditions.priorities],
      source: r.source,
      assignee: r.assignee,
      mapping: r.mapping ?? DESIGNATED_MAPPINGS[0],
      enabled: r.enabled,
    });
  } else {
    Object.assign(f, {
      name: '', priority: store.nextDesignatedPriority(), businessTypes: [], ticketTypes: [], problems: [], products: [],
      ticketSources: [], customerTypes: [], priorities: [], source: '固定人员', assignee: undefined, mapping: DESIGNATED_MAPPINGS[0], enabled: true,
    });
  }
});

const SOURCE_OPTS = opts(['固定人员', '对应关系']);
const MAPPING_OPTS = opts([...DESIGNATED_MAPPINGS]);
/** 指定人：二线及以上未停用账号；编辑时已停用的指定人置灰显示 */
const assigneeOpts = computed(() => {
  const list: { value: string; label: string; disabled?: boolean }[] = store.agents
    .filter((a) => !a.disabled && a.roles.length > 0)
    .map((a) => ({ value: a.name, label: `${a.name}（${a.staffNo}）` }));
  const cur = store.agentOf(f.assignee);
  if (cur?.disabled) list.push({ value: cur.name, label: `${cur.name}（已停用）`, disabled: true });
  return list;
});

function submit() {
  const draft = {
    name: f.name,
    priority: f.priority ?? NaN,
    conditions: {
      businessTypes: [...f.businessTypes],
      ticketTypes: [...f.ticketTypes],
      problems: [...f.problems],
      products: f.products.map(valueToProduct),
      ticketSources: [...f.ticketSources],
      customerTypes: [...f.customerTypes],
      priorities: [...f.priorities],
    },
    source: f.source,
    assignee: f.source === '固定人员' ? f.assignee : undefined,
    mapping: f.source === '对应关系' ? f.mapping : undefined,
    enabled: f.enabled,
  };
  if (props.rule) {
    const r = store.updateDesignatedRule(props.rule.id, draft);
    if (!r.ok) { message.error(r.message); return; }
    message.success(r.message);
    emit('saved', props.rule.id);
  } else {
    const r = store.addDesignatedRule(draft);
    if (!r.ok) { message.error(r.message); return; }
    message.success(r.message);
    emit('saved', r.rule!.id);
  }
  emit('update:open', false);
}
</script>

<template>
  <OpActionModal
    :open="open"
    :title="rule ? '编辑指定人规则' : '新增指定人规则'"
    :icon="UserSwitchOutlined"
    ok-text="保存"
    :width="620"
    @update:open="emit('update:open', $event)"
    @ok="submit"
  >
    <div class="op-form">
      <div class="op-field op-field-h">
        <span class="op-label req">规则名称</span>
        <a-input v-model:value="f.name" :maxlength="30" show-count placeholder="请输入规则名称" />
      </div>
      <div class="op-field op-field-h">
        <span class="op-label req">优先级</span>
        <a-input-number v-model:value="f.priority" :min="1" :max="999" :precision="0" style="width: 160px" />
      </div>
      <RuleConditionFields :form="f" />
      <div class="op-field op-field-h">
        <span class="op-label req">指定人来源</span>
        <a-radio-group v-model:value="f.source" :options="SOURCE_OPTS" :disabled="rule?.builtin" />
      </div>
      <div v-if="f.source === '固定人员'" class="op-field op-field-h">
        <span class="op-label req">指定人</span>
        <a-select v-model:value="f.assignee" :options="assigneeOpts" show-search option-filter-prop="label" placeholder="请选择指定人" />
      </div>
      <div v-else class="op-field op-field-h">
        <span class="op-label req">对应关系</span>
        <a-select v-model:value="f.mapping" :options="MAPPING_OPTS" :disabled="rule?.builtin" />
      </div>
      <div class="op-field op-field-h">
        <span class="op-label">状态</span>
        <a-switch v-model:checked="f.enabled" checked-children="启用" un-checked-children="停用" />
      </div>
    </div>
  </OpActionModal>
</template>

<style scoped>
.op-field-h > .op-label { width: 98px; }
</style>
