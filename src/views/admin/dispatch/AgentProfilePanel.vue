<script setup lang="ts">
// 坐席画像（PRD 14.5）：只读列表；标画像未配置、超限、超额指派；行内「去编辑」跳转用户管理该坐席
import { computed, reactive } from 'vue';
import { useRouter } from 'vue-router';
import { useDispatchStore } from '@/stores/dispatch';
import { stdPagination } from '@/config/adminUi';
import { PROFICIENCIES, SIGN_IN_STATUSES } from '@/views/tickets/types/dispatch';
import { SIGN_TONE, opts, profileSummary, useClock } from './dispatchUi';

const store = useDispatchStore();
const router = useRouter();
const clock = useClock();

const f = reactive<{ group?: string; signIn?: string; proficiency?: string; unconfigured: boolean; personal?: string; kw: string }>({
  group: undefined, signIn: undefined, proficiency: undefined, unconfigured: false, personal: undefined, kw: '',
});
const groupOpts = computed(() => store.groups.map((g) => ({ value: g.id, label: g.label })));
const personalOpts = [{ value: 'on', label: '个人开关开启' }, { value: 'off', label: '个人开关关闭' }];

const rows = computed(() => {
  void clock.value;
  return store.agents
    .filter((a) => !f.group || a.groupIds.includes(f.group))
    .filter((a) => !f.signIn || a.signIn === f.signIn)
    .filter((a) => !f.proficiency || a.proficiency === f.proficiency)
    .filter((a) => !f.personal || (f.personal === 'on') === a.personalSwitch)
    .filter((a) => !f.kw.trim() || `${a.name}${a.staffNo}`.includes(f.kw.trim()))
    .map((a) => {
      const v = store.agentView(a.name)!;
      return {
        name: a.name,
        staffNo: a.staffNo,
        groups: a.groupIds.map((g) => store.groupOf(g)?.label ?? g).join('、'),
        signIn: a.signIn,
        proficiency: a.proficiency,
        inTransit: v.inTransit,
        cap: v.cap,
        capCustom: a.capOverride != null,
        personalSwitch: a.personalSwitch,
        profile: profileSummary(a.profile),
        configured: v.profileConfigured,
        overLimit: v.overLimit,
        overAssigned: v.overAssigned,
      };
    })
    .filter((r) => !f.unconfigured || !r.configured);
});
const cols = [
  { title: '姓名', key: 'name', width: 130 },
  { title: '所属组', dataIndex: 'groups', key: 'groups', width: 200, ellipsis: true },
  { title: '签入状态', key: 'signIn', width: 90 },
  { title: '熟练度', dataIndex: 'proficiency', key: 'proficiency', width: 80 },
  { title: '在途 / 上限', key: 'load', width: 110 },
  { title: '个人开关', key: 'personal', width: 90 },
  { title: '画像摘要', key: 'profile', ellipsis: true },
  { title: '标识', key: 'flag', width: 150 },
  { title: '操作', key: 'op', width: 80 },
];
function goEdit(name: string) { router.push({ path: '/admin/users', query: { agent: name } }); }
</script>

<template>
  <section class="block">
    <div class="ap-bar">
      <a-input-search v-model:value="f.kw" placeholder="姓名 / 工号" allow-clear style="width: 180px" />
      <a-select v-model:value="f.group" :options="groupOpts" placeholder="所属组" allow-clear style="width: 150px" />
      <a-select v-model:value="f.signIn" :options="opts(SIGN_IN_STATUSES)" placeholder="签入状态" allow-clear style="width: 110px" />
      <a-select v-model:value="f.proficiency" :options="opts(PROFICIENCIES)" placeholder="熟练度" allow-clear style="width: 100px" />
      <a-select v-model:value="f.personal" :options="personalOpts" placeholder="个人开关" allow-clear style="width: 130px" />
      <a-checkbox v-model:checked="f.unconfigured">画像未配置</a-checkbox>
    </div>
    <a-table :columns="cols" :data-source="rows" row-key="name" size="middle" :pagination="stdPagination()">
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'name'"><b>{{ record.name }}</b><span class="muted"> {{ record.staffNo }}</span></template>
        <a-tag v-else-if="column.key === 'signIn'" :color="SIGN_TONE[record.signIn]">{{ record.signIn }}</a-tag>
        <span v-else-if="column.key === 'load'" :class="{ full: record.inTransit >= record.cap }">{{ record.inTransit }} / {{ record.cap }}</span>
        <span v-else-if="column.key === 'personal'">{{ record.personalSwitch ? '开启' : '关闭' }}</span>
        <span v-else-if="column.key === 'profile'" :title="record.profile">{{ record.profile }}</span>
        <template v-else-if="column.key === 'flag'">
          <a-tag v-if="!record.configured" color="default">画像未配置</a-tag>
          <a-tag v-if="record.overAssigned" color="red">超额指派</a-tag>
          <a-tag v-else-if="record.overLimit" color="orange">超限</a-tag>
          <span v-if="record.configured && !record.overAssigned && !record.overLimit" class="muted">—</span>
        </template>
        <a-button v-else-if="column.key === 'op'" type="link" size="small" @click="goEdit(record.name)">去编辑</a-button>
      </template>
    </a-table>
  </section>
</template>

<style scoped>
.block { background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px 20px; margin-bottom: 16px; }
.ap-bar { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin-bottom: 12px; }
.muted { color: #9ca3af; font-size: 12px; margin-left: 4px; }
.full { color: #ea580c; }
:deep(.ant-table-thead > tr > th) { background: #f3f4f6; color: #6b7280; font-size: 12px; }
</style>
