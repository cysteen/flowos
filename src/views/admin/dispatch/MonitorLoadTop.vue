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
/** 负载条统一一个颜色，在途达到上限（超限）时变橙 */
function full(r: { inTransit: number; cap: number }) { return r.inTransit >= r.cap; }

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
  <section class="dx-card">
    <div class="dx-sec-hd">
      <span class="dx-sec-title">处理人负载</span>
      <span class="dx-sec-sub">前 10 · 超限 {{ flagged.over }} 人 · 超额指派 {{ flagged.assigned }} 人</span>
      <span class="dx-sec-extra"><a-button type="link" size="small" @click="allOpen = true">全部处理人</a-button></span>
    </div>
    <div class="filters">
      <a-select v-model:value="loadGroup" size="small" :options="loadGroupOpts" style="width: 150px" />
      <a-select v-model:value="loadSign" size="small" :options="loadSignOpts" style="width: 110px" />
    </div>
    <a-empty v-if="!top.length" description="暂无处理人" />
    <div v-else class="heat">
      <div v-for="r in top" :key="r.name" class="hr">
        <div class="hr-who">
          <b>{{ r.name }}</b><span class="muted">{{ r.staffNo }}</span>
          <div class="hr-grp" :title="r.groups">{{ r.groups }}</div>
        </div>
        <span class="dx-status hr-sign" :class="`is-${SIGN_TONE[r.signIn]}`">{{ r.signIn }}</span>
        <div class="dx-bar hr-bar" :class="{ 'is-warn': full(r) }">
          <i :style="{ width: `${Math.min(100, r.ratio * 100)}%` }" />
        </div>
        <span class="hr-num" :class="{ full: full(r) }">{{ r.inTransit }} / {{ r.cap }}</span>
        <span class="hr-flag">
          <span v-if="r.overAssigned" class="dx-bad">超额指派</span>
          <span v-else-if="r.overLimit" class="dx-warn">超限</span>
        </span>
      </div>
    </div>

    <a-modal v-model:open="allOpen" title="处理人负载" :width="860" :footer="null">
      <a-table :columns="loadCols" :data-source="loadRows" row-key="name" size="middle" :pagination="stdPagination()">
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'name'"><b>{{ record.name }}</b><span class="muted"> {{ record.staffNo }}</span></template>
          <span v-else-if="column.key === 'signIn'" class="dx-status" :class="`is-${SIGN_TONE[record.signIn]}`">{{ record.signIn }}</span>
          <span v-else-if="column.key === 'load'" :class="{ 'load-full': record.inTransit >= record.cap }">在途 {{ record.inTransit }} / 上限 {{ record.cap }}</span>
          <template v-else-if="column.key === 'flag'">
            <span v-if="record.overAssigned" class="dx-bad">超额指派</span>
            <span v-else-if="record.overLimit" class="dx-warn">超限</span>
            <span v-else class="muted">—</span>
          </template>
        </template>
      </a-table>
    </a-modal>
  </section>
</template>

<style scoped>
.filters { display: flex; gap: 8px; align-items: center; margin-bottom: 8px; flex-wrap: wrap; }
.muted { color: #86909c; font-size: 13px; margin-left: 4px; }
.heat { display: flex; flex-direction: column; }
.hr { display: grid; grid-template-columns: minmax(96px, 1.3fr) 52px minmax(60px, 2fr) 52px 64px; align-items: center; gap: 12px; padding: 8px 0; border-bottom: 1px solid #f2f3f5; font-size: 13px; }
.hr:last-child { border-bottom: none; }
.hr-who { min-width: 0; line-height: 1.4; color: #1f2329; }
.hr-grp { font-size: 12px; color: #86909c; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.hr-sign { justify-self: start; }
.hr-bar { height: 6px; border-radius: 3px; }
.hr-num { text-align: right; color: #1f2329; font-variant-numeric: tabular-nums; }
.hr-num.full, .load-full { color: #ff7d00; }
.hr-flag { font-size: 13px; }
:deep(.ant-table-thead > tr > th) { background: #f3f4f6; color: #6b7280; font-size: 12px; }
</style>
