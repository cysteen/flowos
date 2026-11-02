<script setup lang="ts">
// 分派监控 · 处理人负载（PRD 14.1）：按负载比例降序取前 10 的负载条，可按组、状态筛选；「全部处理人」看完整列表
import { computed, ref } from 'vue';
import { useDispatchStore } from '@/stores/dispatch';
import { stdPagination } from '@/config/adminUi';
import { SIGN_IN_STATUSES } from '@/views/tickets/types/dispatch';
import { SIGN_TONE, useClock } from './dispatchUi';

const props = defineProps<{ poolIds: string[] | null }>();
const store = useDispatchStore();
const clock = useClock();

const loadGroup = ref('all');
const loadSign = ref('all');
const loadGroupOpts = computed(() => [{ value: 'all', label: '全部组' }, ...store.groups.map((g) => ({ value: g.id, label: g.label }))]);
const loadSignOpts = [{ value: 'all', label: '全部状态' }, ...SIGN_IN_STATUSES.map((s) => ({ value: s, label: s }))];

const loadRows = computed(() => {
  void clock.value;
  return store.agents
    .filter((a) => !a.disabled)
    .filter((a) => !props.poolIds || a.groupIds.some((g) => props.poolIds!.includes(g)))
    .filter((a) => loadGroup.value === 'all' || a.groupIds.includes(loadGroup.value))
    .filter((a) => loadSign.value === 'all' || a.signIn === loadSign.value)
    .map((a) => {
      const v = store.agentView(a.name)!;
      return {
        name: a.name,
        staffNo: a.staffNo,
        groups: a.groupIds.map((g) => store.groupOf(g)?.label ?? g).join('、'),
        signIn: a.signIn,
        inTransit: v.inTransit,
        cap: v.cap,
        ratio: v.cap ? v.inTransit / v.cap : 0,
        overLimit: v.overLimit,
        overAssigned: v.overAssigned,
      };
    })
    .sort((x, y) => y.ratio - x.ratio);
});
const top = computed(() => loadRows.value.slice(0, 10));
const flagged = computed(() => ({
  over: loadRows.value.filter((r) => r.overLimit).length,
  assigned: loadRows.value.filter((r) => r.overAssigned).length,
}));
function tone(r: { ratio: number }) { return r.ratio >= 1 ? '#ef4444' : r.ratio >= 0.8 ? '#f59e0b' : '#10b981'; }

const allOpen = ref(false);
const loadCols = [
  { title: '姓名', key: 'name', width: 140 },
  { title: '所属组', dataIndex: 'groups', key: 'groups', ellipsis: true },
  { title: '签入状态', key: 'signIn', width: 100 },
  { title: '在途 / 上限', key: 'load', width: 120 },
  { title: '标记', key: 'flag', width: 120 },
];
</script>

<template>
  <section class="block">
    <div class="b-title">
      处理人负载
      <span class="b-sub">前 10 · 超限 {{ flagged.over }} 人 · 超额指派 {{ flagged.assigned }} 人</span>
      <div class="hd-btn filters">
        <a-select v-model:value="loadGroup" size="small" :options="loadGroupOpts" style="width: 132px" />
        <a-select v-model:value="loadSign" size="small" :options="loadSignOpts" style="width: 100px" />
        <a-button type="link" size="small" @click="allOpen = true">全部处理人</a-button>
      </div>
    </div>
    <a-empty v-if="!top.length" description="暂无处理人" />
    <div v-else class="heat">
      <div v-for="r in top" :key="r.name" class="hr">
        <div class="hr-who">
          <b>{{ r.name }}</b><span class="muted">{{ r.staffNo }}</span>
          <div class="hr-grp" :title="r.groups">{{ r.groups }}</div>
        </div>
        <a-tag class="hr-sign" :color="SIGN_TONE[r.signIn]">{{ r.signIn }}</a-tag>
        <div class="hr-bar">
          <i :style="{ width: `${Math.min(100, r.ratio * 100)}%`, background: tone(r) }" />
        </div>
        <span class="hr-num" :class="{ full: r.inTransit >= r.cap }">{{ r.inTransit }} / {{ r.cap }}</span>
        <span class="hr-flag">
          <a-tag v-if="r.overAssigned" color="red">超额指派</a-tag>
          <a-tag v-else-if="r.overLimit" color="orange">超限</a-tag>
        </span>
      </div>
    </div>

    <a-modal v-model:open="allOpen" title="处理人负载" :width="860" :footer="null">
      <a-table :columns="loadCols" :data-source="loadRows" row-key="name" size="middle" :pagination="stdPagination()">
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'name'"><b>{{ record.name }}</b><span class="muted"> {{ record.staffNo }}</span></template>
          <a-tag v-else-if="column.key === 'signIn'" :color="SIGN_TONE[record.signIn]">{{ record.signIn }}</a-tag>
          <span v-else-if="column.key === 'load'" :class="{ 'load-full': record.inTransit >= record.cap }">在途 {{ record.inTransit }} / 上限 {{ record.cap }}</span>
          <template v-else-if="column.key === 'flag'">
            <a-tag v-if="record.overAssigned" color="red">超额指派</a-tag>
            <a-tag v-else-if="record.overLimit" color="orange">超限</a-tag>
            <span v-else class="muted">—</span>
          </template>
        </template>
      </a-table>
    </a-modal>
  </section>
</template>

<style scoped>
.block { background: #fff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 16px 20px; min-width: 0; }
.b-title { font-size: 13px; font-weight: 600; color: #111827; margin-bottom: 12px; padding-left: 10px; border-left: 3px solid #1a6fff; display: flex; align-items: center; gap: 10px; min-height: 24px; flex-wrap: wrap; }
.b-sub { font-size: 12px; font-weight: normal; color: #9ca3af; }
.hd-btn { margin-left: auto; }
.filters { display: flex; gap: 8px; align-items: center; }
.muted { color: #9ca3af; font-size: 12px; margin-left: 4px; }
.heat { display: flex; flex-direction: column; }
.hr { display: grid; grid-template-columns: minmax(96px, 1.3fr) 52px minmax(60px, 2fr) 52px 72px; align-items: center; gap: 10px; padding: 6px 0; border-bottom: 1px dashed #f0f0f0; font-size: 13px; }
.hr:last-child { border-bottom: none; }
.hr-who { min-width: 0; line-height: 1.3; }
.hr-grp { font-size: 11px; color: #9ca3af; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.hr-sign { margin: 0; justify-self: start; }
.hr-bar { height: 8px; background: #f3f4f6; border-radius: 4px; overflow: hidden; }
.hr-bar i { display: block; height: 100%; border-radius: 4px; }
.hr-num { text-align: right; color: #111827; font-variant-numeric: tabular-nums; }
.hr-num.full, .load-full { color: #ea580c; }
.hr-flag :deep(.ant-tag) { margin: 0; }
:deep(.ant-table-thead > tr > th) { background: #f3f4f6; color: #6b7280; font-size: 12px; }
</style>
