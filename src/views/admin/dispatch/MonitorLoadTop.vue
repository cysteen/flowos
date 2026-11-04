<script setup lang="ts">
// 分派监控 · 处理人负载（PRD 14.1）：按负载比例降序取前 10，标题行可按组、状态筛选；「查看全部处理人」跳坐席画像
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useDispatchStore } from '@/stores/dispatch';
import { SIGN_IN_STATUSES } from '@/views/tickets/types/dispatch';
import { useClock } from './dispatchUi';
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
        mark: v.overAssigned ? '超额指派' : v.overLimit ? '超限' : v.full ? '满载' : '',
      };
    })
    .sort((x, y) => y.ratio - x.ratio);
});
const top = computed(() => loadRows.value.slice(0, 10));
/** 标签色（14.1）：超额指派、满载红，超限橙 */
const MARK_CLASS: Record<string, string> = { 超额指派: 'dx-bad', 超限: 'dx-warn', 满载: 'dx-bad' };
function loadFactorColor(f: number) {
  if (f >= 1) return '#ef4444';
  if (f >= 0.8) return '#f59e0b';
  return '#10b981';
}
const SIGN_COLOR: Record<string, string> = { 就绪: '#10b981', 未就绪: '#f97316', 小休: '#f59e0b', 签出: '#9ca3af' };

function goProfile() { router.push('/admin/dispatch-profile'); }

const topCols = [
  { title: '姓名', key: 'name', width: 108 },
  { title: '所属组', dataIndex: 'groups', key: 'groups', ellipsis: true },
  { title: '在途数', key: 'inTransit', width: 72, align: 'right' as const },
  { title: '个人上限', key: 'cap', width: 84, align: 'right' as const },
  { title: '负载系数', key: 'factor', width: 132 },
  { title: '坐席状态', key: 'signIn', width: 88 },
];
</script>

<template>
  <section class="block load-block">
    <div class="b-title inline">
      处理人负载
      <span class="hd-btn load-hd-actions">
        <a-select v-model:value="loadGroup" size="small" :options="loadGroupOpts" :dropdown-match-select-width="false" style="width: 124px" />
        <a-select v-model:value="loadSign" size="small" :options="loadSignOpts" style="width: 92px" />
        <a-button type="link" size="small" class="load-hd-link" @click="goProfile">查看全部处理人 →</a-button>
      </span>
    </div>
    <a-table :columns="topCols" :data-source="top" row-key="name" size="middle" :pagination="false" :locale="{ emptyText: '暂无处理人' }">
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'name'">
          <span class="agent-nm">{{ record.name }}</span>
          <span class="text-muted staff-no">{{ record.staffNo }}</span>
        </template>
        <span v-else-if="column.key === 'inTransit'" class="mono">{{ record.inTransit }}</span>
        <span v-else-if="column.key === 'cap'" class="mono text-muted">{{ record.cap }}</span>
        <template v-else-if="column.key === 'factor'">
          <span class="mono factor" :style="{ color: loadFactorColor(record.ratio) }">{{ record.ratio.toFixed(2) }}</span>
          <span v-if="record.mark" class="load-mark" :class="MARK_CLASS[record.mark]">{{ record.mark }}</span>
        </template>
        <span v-else-if="column.key === 'signIn'" class="status-cell">
          <span class="status-dot" :style="{ background: SIGN_COLOR[record.signIn] ?? '#9ca3af' }" />
          <span :style="{ color: SIGN_COLOR[record.signIn] ?? '#6b7280' }">{{ record.signIn }}</span>
        </span>
      </template>
    </a-table>
  </section>
</template>

<style scoped>
.staff-no { font-size: 12px; margin-left: 4px; }
.load-mark { margin-left: 6px; font-size: 12px; }
.load-hd-actions { display: inline-flex; align-items: center; justify-content: flex-end; flex-wrap: wrap; gap: 8px; max-width: 100%; font-weight: normal; }
.load-hd-link { margin-left: 8px; }
</style>
