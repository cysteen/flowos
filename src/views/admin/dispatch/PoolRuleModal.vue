<script setup lang="ts">
// 新增 / 编辑入池规则弹窗（PRD 3.3）：七个维度多选，不选为不限；校验文案取 store
import { computed, reactive, watch } from 'vue';
import { message } from 'ant-design-vue';
import { BranchesOutlined } from '@ant-design/icons-vue';
import OpActionModal from '@/views/tickets/components/operation/OpActionModal.vue';
import { useDispatchStore } from '@/stores/dispatch';
import type { PoolRule } from '@/views/tickets/types/dispatch';
import type { Priority } from '@/views/tickets/types/ticket';
import { productToValue, valueToProduct } from './dispatchUi';
import RuleConditionFields from './RuleConditionFields.vue';

const props = defineProps<{ open: boolean; rule: PoolRule | null }>();
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
  poolId: undefined as string | undefined,
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
      poolId: r.poolId,
      enabled: r.enabled,
    });
  } else {
    Object.assign(f, {
      name: '', priority: store.nextRulePriority(), businessTypes: [], ticketTypes: [], problems: [], products: [],
      ticketSources: [], customerTypes: [], priorities: [], poolId: undefined, enabled: true,
    });
  }
});

/** 归属池只可选启用中的池；编辑指向已停用池的规则时该池置灰并标「已停用」 */
const poolOpts = computed(() => {
  const opts: { value: string; label: string; disabled?: boolean }[] = store.enabledPools().map((p) => ({ value: p.id, label: p.name }));
  const cur = f.poolId ? store.poolOf(f.poolId) : undefined;
  if (cur && cur.status !== '启用') opts.push({ value: cur.id, label: `${cur.name}（已停用）`, disabled: true });
  return opts;
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
    poolId: f.poolId ?? '',
    enabled: f.enabled,
  };
  if (props.rule) {
    const r = store.updatePoolRule(props.rule.id, draft);
    if (!r.ok) { message.error(r.message); return; }
    message.success(r.message);
    emit('saved', props.rule.id);
  } else {
    const r = store.addPoolRule(draft);
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
    :title="rule ? '编辑入池规则' : '新增入池规则'"
    :icon="BranchesOutlined"
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
        <span class="op-label req">归属池</span>
        <a-select v-model:value="f.poolId" :options="poolOpts" placeholder="请选择归属池" />
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
