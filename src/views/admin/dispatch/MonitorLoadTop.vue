<script setup lang="ts">
// 分派监控 · 处理人负载（PRD 14.1）：按负载比例降序取前 10 的负载条，可按组、状态筛选；「全部处理人」看完整列表
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useDispatchStore } from '@/stores/dispatch';
import { stdPagination } from '@/config/adminUi';
import { SIGN_IN_STATUSES } from '@/views/tickets/types/dispatch';
import { SIGN_TONE, useClock } from './dispatchUi';
import './dispatchTheme.css';

const props = defineProps<{ poolIds: string[] | null }>();
const router = useRouter();
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
    // 工单池筛选：取所选池的处理组成员（14.1）
    .filter((a) => !props.poolIds || props.poolIds.some((p) => a.groupIds.includes(store.poolGroupIdOf(p) ?? p)))
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
      };
    })
    .sort((x, y) => y.ratio - x.ratio);
});
const top = computed(() => loadRows.value.slice(0, 10));
function loadFactorColor(f: number) {
  if (f >= 1) return '#ef4444';
  if (f >= 0.8) return '#f59e0b';
  return '#10b981';
}
const SIGN_COLOR: Record<string, string> = { 就绪: '#10b981', 未就绪: '#f97316', 小休: '#f59e0b', 签出: '#9ca3af' };

const allOpen = ref(false);
function goProfile() { router.push('/admin/dispatch-profile'); }

const topCols = [
  { title: '姓名', key: 'name', width: 108 },
  { title: '所属组', dataIndex: 'groups', key: 'groups', ellipsis: true },
  { title: '在途数', key: 'inTransit', width: 72, align: 'right' as const },
  { title: '个人上限', key: 'cap', width: 84, align: 'right' as const },
  { title: '负载系数', key: 'factor', width: 108 },
  { title: '签入状态', key: 'signIn', width: 88 },
];
const loadCols = [
  { title: '姓名', key: 'name', width: 140 },
  { title: '所属组', dataIndex: 'groups', key: 'groups', ellipsis: true },
  { title: '签入状态', key: 'signIn', width: 100 },
  { title: '在途 / 上限', key: 'load', width: 140 },
  { title: '负载系数', key: 'factor', width: 96, align: 'right' as const },
];
</script>

<template>
  <section class="block load-block">
    <div class="b-title inline">
      处理人负载
      <span class="b-tip">按负载系数降序 · 前 10</span>
      <a-button type="link" size="small" class="hd-btn" @click="goProfile">查看全部处理人 →</a-button>
    </div>
    <div class="load-toolbar">
      <a-select v-model:value="loadGroup" size="small" :options="loadGroupOpts" style="width: 150px" />
      <a-select v-model:value="loadSign" size="small" :options="loadSignOpts" style="width: 110px" />
      <a-button type="link" size="small" @click="allOpen = true">全部处理人</a-button>
    </div>
    <a-table :columns="topCols" :data-source="top" row-key="name" size="middle" :pagination="false" :locale="{ emptyText: '暂无处理人' }">
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'name'">
          <span class="agent-nm">{{ record.name }}</span>
          <span class="text-muted staff-no">{{ record.staffNo }}</span>
        </template>
        <span v-else-if="column.key === 'inTransit'" class="mono">{{ record.inTransit }}</span>
        <span v-else-if="column.key === 'cap'" class="mono text-muted">{{ record.cap }}</span>
        <span v-else-if="column.key === 'factor'" class="mono factor" :style="{ color: loadFactorColor(record.ratio) }">{{ record.ratio.toFixed(2) }}</span>
        <span v-else-if="column.key === 'signIn'" class="status-cell">
          <span class="status-dot" :style="{ background: SIGN_COLOR[record.signIn] ?? '#9ca3af' }" />
          <span :style="{ color: SIGN_COLOR[record.signIn] ?? '#6b7280' }">{{ record.signIn }}</span>
        </span>
      </template>
    </a-table>

    <a-modal v-model:open="allOpen" title="处理人负载" :width="860" :footer="null">
      <a-table :columns="loadCols" :data-source="loadRows" row-key="name" size="middle" :pagination="stdPagination()">
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'name'"><b>{{ record.name }}</b><span class="text-muted"> {{ record.staffNo }}</span></template>
          <span v-else-if="column.key === 'signIn'" class="dx-status" :class="`is-${SIGN_TONE[record.signIn]}`">{{ record.signIn }}</span>
          <span v-else-if="column.key === 'load'" :class="{ 'load-full': record.inTransit >= record.cap }">在途 {{ record.inTransit }} / 上限 {{ record.cap }}</span>
          <span v-else-if="column.key === 'factor'" class="mono" :style="{ color: loadFactorColor(record.ratio) }">{{ record.ratio.toFixed(2) }}</span>
        </template>
      </a-table>
    </a-modal>
  </section>
</template>

<style scoped>
.staff-no { font-size: 12px; margin-left: 4px; }
.load-full { color: #ff7d00; }
</style>
