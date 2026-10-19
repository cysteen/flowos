<script setup lang="ts">
/**
 * 刷机信息 · 学校名称（10-19 C5）：先选省 / 市 / 区（级联，可只选到省或市），再在该地区内搜索选择学校。
 * 客户信息有省市区时默认带入；已选学校时地区取该校所在地区。
 * 建单页「刷机信息」卡与修改刷机信息弹窗共用。按省市区检索学校的接口待对接，原型按学校库的所在地区过滤。
 */
import { computed, ref, watch } from 'vue';
import { SCHOOL_LIBRARY, findSchoolById } from '@/mock/schools';
import { REGION_SEP, regionToArray } from '@/views/tickets/types/createTicket';
import FormSelect from './FormSelect.vue';

const props = defineProps<{
  /** 客户信息的省市区（「省 / 市 / 区」），无学校时默认带入 */
  defaultRegion?: string;
  status?: '' | 'error';
}>();

/** 学校库 ID */
const schoolId = defineModel<string>('schoolId', { required: true });

interface RegionNode { value: string; label: string; children?: RegionNode[] }

/** 省市区级联：取学校库里出现过的地区 */
const regionOptions = computed<RegionNode[]>(() => {
  const root: RegionNode[] = [];
  for (const s of SCHOOL_LIBRARY) {
    let level = root;
    for (const part of regionToArray(s.region)) {
      let node = level.find((n) => n.value === part);
      if (!node) {
        node = { value: part, label: part, children: [] };
        level.push(node);
      }
      level = node.children!;
    }
  }
  const prune = (nodes: RegionNode[]): RegionNode[] =>
    nodes.map((n) => (n.children?.length ? { ...n, children: prune(n.children) } : { value: n.value, label: n.label }));
  return prune(root);
});

function initialRegion(): string[] {
  const school = schoolId.value ? findSchoolById(schoolId.value) : undefined;
  return school ? regionToArray(school.region) : regionToArray(props.defaultRegion);
}

const region = ref<string[]>(initialRegion());

// 客户信息的省市区后填：本卡还没选地区、也没选学校时跟着带入
watch(() => props.defaultRegion, (v) => {
  if (!region.value.length && !schoolId.value) region.value = regionToArray(v);
});
// 外部改了学校（恢复草稿、弹窗重开）：地区跟到该校
watch(schoolId, (id) => {
  const school = id ? findSchoolById(id) : undefined;
  if (school && !regionPrefixMatch(school.region)) region.value = regionToArray(school.region);
});

function regionPrefixMatch(schoolRegion: string): boolean {
  const sel = region.value;
  if (!sel.length) return false;
  const parts = regionToArray(schoolRegion);
  return sel.every((p, i) => parts[i] === p);
}

const schoolOptions = computed(() =>
  SCHOOL_LIBRARY.filter((s) => regionPrefixMatch(s.region)).map((s) => ({ value: s.id, label: s.name })),
);

function onRegionChange(v: unknown) {
  region.value = Array.isArray(v) ? (v as string[]) : [];
  const school = schoolId.value ? findSchoolById(schoolId.value) : undefined;
  if (school && !regionPrefixMatch(school.region)) schoolId.value = '';
}

function onSchoolChange(v: unknown) {
  schoolId.value = v == null ? '' : String(v);
}

defineExpose({ regionText: computed(() => region.value.join(REGION_SEP)) });
</script>

<template>
  <div class="school-picker">
    <a-cascader
      :value="region"
      class="sp-region"
      :options="regionOptions"
      change-on-select
      placeholder="省 / 市 / 区"
      :status="status"
      @update:value="onRegionChange"
    />
    <FormSelect
      :value="schoolId || undefined"
      class="sp-school"
      placeholder="请搜索或选择学校"
      :disabled="!region.length"
      :status="status"
      :options="schoolOptions"
      @update:value="onSchoolChange"
    />
  </div>
</template>

<style scoped>
.school-picker { display: flex; gap: 6px; width: 100%; min-width: 0; }
.sp-region { flex: 0 0 46%; min-width: 0; }
.sp-school { flex: 1 1 auto; min-width: 0; }
</style>
