<script setup lang="ts">
/**
 * 【1215】编辑人员画像抽屉（PRD 6.5）：标题「编辑人员画像 · 〈姓名〉（〈工号〉）」，按钮 [ 取消 ] [ 保存 ]。
 * 每个维度一行，左侧单选「不限 / 指定」，选「指定」时右侧出多选控件；另有熟练度单选。
 * 班组看板维护本组成员用；保存走 `dispatch.setProfile`，校验文案取 store（PRD 原文）。
 */
import { computed, reactive, ref, watch } from 'vue';
import { message } from 'ant-design-vue';
import { useDispatchStore } from '@/stores/dispatch';
import { useUserStore } from '@/stores/user';
import { BUSINESS_TYPES, PROBLEM_TREE } from '@/views/tickets/types/createTicket';
import { PRODUCT_CATEGORIES, PRODUCT_NAMES_BY_CATEGORY } from '@/views/tickets/types/mineQuery';
import {
  DISPATCH_CUSTOMER_TYPES, DISPATCH_TICKET_TYPES, PROFICIENCIES, PROFILE_DIMS,
  type AgentProfile, type ProductPick, type Proficiency, type ProfileDimKey,
} from '@/views/tickets/types/dispatch';

const props = defineProps<{
  open: boolean;
  /** 坐席姓名 */
  name: string | null;
}>();

const emit = defineEmits<{ 'update:open': [v: boolean] }>();

const dispatch = useDispatchStore();
const user = useUserStore();

type Mode = 'any' | 'pick' | null;
const modes = reactive<Record<ProfileDimKey, Mode>>({
  businessTypes: null, ticketTypes: null, products: null, problems: null, customerTypes: null,
});
const values = reactive<Record<ProfileDimKey, string[]>>({
  businessTypes: [], ticketTypes: [], products: [], problems: [], customerTypes: [],
});
const proficiency = ref<Proficiency | undefined>(undefined);

const agent = computed(() => (props.name ? dispatch.agentOf(props.name) : undefined));
const title = computed(() => (agent.value ? `编辑人员画像 · ${agent.value.name}（${agent.value.staffNo}）` : '编辑人员画像'));

/* 产品取值键：分类＝`c|分类`，产品＝`p|分类|名称` */
const productKey = (p: ProductPick) => (p.name ? `p|${p.category}|${p.name}` : `c|${p.category}`);
function productOfKey(k: string): ProductPick {
  const [kind, category, name] = k.split('|');
  return kind === 'p' ? { category, name } : { category };
}

const productTree = PRODUCT_CATEGORIES.map((cat) => ({
  title: cat,
  value: `c|${cat}`,
  key: `c|${cat}`,
  children: (PRODUCT_NAMES_BY_CATEGORY[cat] ?? []).map((n) => ({ title: n, value: `p|${cat}|${n}`, key: `p|${cat}|${n}` })),
}));
const problemTree = Object.entries(PROBLEM_TREE).map(([l1, l2s]) => ({
  title: l1,
  value: l1,
  key: l1,
  children: Object.entries(l2s).map(([l2, l3s]) => ({
    title: l2,
    value: `${l1}/${l2}`,
    key: `${l1}/${l2}`,
    children: l3s.map((l3) => ({ title: l3, value: `${l1}/${l2}/${l3}`, key: `${l1}/${l2}/${l3}` })),
  })),
}));
const listOptions: Partial<Record<ProfileDimKey, { value: string; label: string }[]>> = {
  businessTypes: BUSINESS_TYPES.map((v) => ({ value: v, label: v })),
  ticketTypes: DISPATCH_TICKET_TYPES.map((v) => ({ value: v, label: v })),
  customerTypes: DISPATCH_CUSTOMER_TYPES.map((v) => ({ value: v, label: v })),
};

watch(() => [props.open, props.name] as const, ([open]) => {
  if (!open || !agent.value) return;
  const p = agent.value.profile;
  for (const d of PROFILE_DIMS) {
    const v = p[d.key];
    modes[d.key] = v === null ? null : v === 'any' ? 'any' : 'pick';
    if (Array.isArray(v)) {
      values[d.key] = d.key === 'products' ? (v as ProductPick[]).map(productKey) : [...(v as string[])];
    } else {
      values[d.key] = [];
    }
  }
  proficiency.value = agent.value.proficiency;
}, { immediate: true });

function buildProfile(): AgentProfile {
  const out = {} as AgentProfile;
  for (const d of PROFILE_DIMS) {
    const m = modes[d.key];
    if (m === null) (out as Record<ProfileDimKey, unknown>)[d.key] = null;
    else if (m === 'any') (out as Record<ProfileDimKey, unknown>)[d.key] = 'any';
    else if (d.key === 'products') out.products = values.products.map(productOfKey);
    else (out as Record<ProfileDimKey, unknown>)[d.key] = [...values[d.key]];
  }
  return out;
}

function onSave() {
  const a = agent.value;
  if (!a) return;
  const profile = buildProfile();
  const err = dispatch.validateProfile(profile);
  if (err) {
    message.warning(err);
    return;
  }
  if (!proficiency.value) {
    message.warning('请设置熟练度');
    return;
  }
  const res = dispatch.setProfile(a.name, profile, proficiency.value, user.name);
  if (!res.ok) {
    if (res.message) message.warning(res.message);
    return;
  }
  message.success(res.message);
  emit('update:open', false);
}
</script>

<template>
  <a-drawer
    :open="open"
    :title="title"
    :width="560"
    destroy-on-close
    @update:open="emit('update:open', $event)"
  >
    <a-config-provider :component-disabled="false">
      <div v-if="agent" class="dpd">
        <div v-for="d in PROFILE_DIMS" :key="d.key" class="dpd-row">
          <div class="dpd-label">{{ d.label }}</div>
          <div class="dpd-body">
            <a-radio-group v-model:value="modes[d.key]" class="dpd-mode">
              <a-radio value="any">不限</a-radio>
              <a-radio value="pick">指定</a-radio>
            </a-radio-group>
            <template v-if="modes[d.key] === 'pick'">
              <a-tree-select
                v-if="d.key === 'products'"
                v-model:value="values.products"
                class="dpd-ctrl"
                :tree-data="productTree"
                tree-checkable
                show-checked-strategy="SHOW_PARENT"
                :max-tag-count="3"
                :placeholder="`请选择${d.label}`"
                allow-clear
              />
              <a-tree-select
                v-else-if="d.key === 'problems'"
                v-model:value="values.problems"
                class="dpd-ctrl"
                :tree-data="problemTree"
                tree-checkable
                show-checked-strategy="SHOW_PARENT"
                :max-tag-count="3"
                :placeholder="`请选择${d.label}`"
                allow-clear
              />
              <a-select
                v-else
                v-model:value="values[d.key]"
                class="dpd-ctrl"
                mode="multiple"
                :options="listOptions[d.key]"
                :max-tag-count="3"
                :placeholder="`请选择${d.label}`"
                allow-clear
              />
            </template>
          </div>
        </div>
        <div class="dpd-row">
          <div class="dpd-label req">熟练度</div>
          <div class="dpd-body">
            <a-radio-group v-model:value="proficiency" class="dpd-mode">
              <a-radio v-for="p in PROFICIENCIES" :key="p" :value="p">{{ p }}</a-radio>
            </a-radio-group>
          </div>
        </div>
      </div>
    </a-config-provider>
    <template #footer>
      <div class="dpd-ft">
        <a-button @click="emit('update:open', false)">取消</a-button>
        <a-button type="primary" @click="onSave">保存</a-button>
      </div>
    </template>
  </a-drawer>
</template>

<style scoped>
.dpd { display: flex; flex-direction: column; gap: 18px; }
.dpd-row { display: grid; grid-template-columns: 72px minmax(0, 1fr); column-gap: 12px; align-items: start; }
.dpd-label { font-size: 14px; line-height: 32px; color: #374151; white-space: nowrap; }
.dpd-label.req::before { content: '*'; margin-right: 4px; color: #ef4444; }
.dpd-body { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.dpd-mode { line-height: 32px; }
.dpd-ctrl { width: 100%; }
.dpd-ft { display: flex; justify-content: flex-end; gap: 8px; }
</style>
