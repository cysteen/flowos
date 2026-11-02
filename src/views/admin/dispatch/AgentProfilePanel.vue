<script setup lang="ts">
// 坐席画像（PRD 14.5）：只读看板；概览条 → 筛选 → 左侧坐席列表 · 右侧选中坐席画像详情；「去编辑」跳转用户管理该坐席
import { computed, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { EditOutlined, SearchOutlined, TeamOutlined, IdcardOutlined, WarningOutlined, ThunderboltOutlined } from '@ant-design/icons-vue';
import { useDispatchStore } from '@/stores/dispatch';
import { stdPagination } from '@/config/adminUi';
import { PROFICIENCIES, SIGN_IN_STATUSES } from '@/views/tickets/types/dispatch';
import { SIGN_TONE, opts, profileItems, profileSummary, useClock } from './dispatchUi';
import DispatchCard from './DispatchCard.vue';

const store = useDispatchStore();
const router = useRouter();
const clock = useClock();

const f = reactive<{ group?: string; signIn?: string; proficiency?: string; unconfigured: boolean; personal?: string; kw: string }>({
  group: undefined, signIn: undefined, proficiency: undefined, unconfigured: false, personal: undefined, kw: '',
});
const groupOpts = computed(() => store.groups.map((g) => ({ value: g.id, label: g.label })));
const personalOpts = [{ value: 'on', label: '个人开关开启' }, { value: 'off', label: '个人开关关闭' }];

function viewOf(name: string) {
  const a = store.agentOf(name)!;
  const v = store.agentView(name)!;
  return {
    name: a.name,
    staffNo: a.staffNo,
    groups: a.groupIds.map((g) => store.groupOf(g)?.label ?? g).join('、'),
    signIn: a.signIn,
    proficiency: a.proficiency,
    inTransit: v.inTransit,
    cap: v.cap,
    capCustom: a.capOverride != null,
    defaultCapText: v.defaultCapText,
    personalSwitch: a.personalSwitch,
    profile: profileSummary(a.profile),
    dims: profileItems(a.profile),
    configured: v.profileConfigured,
    overLimit: v.overLimit,
    overAssigned: v.overAssigned,
  };
}
type Row = ReturnType<typeof viewOf>;

const all = computed<Row[]>(() => {
  void clock.value;
  return store.agents.map((a) => viewOf(a.name));
});
const rows = computed(() => all.value
  .filter((r) => !f.group || store.agentOf(r.name)!.groupIds.includes(f.group))
  .filter((r) => !f.signIn || r.signIn === f.signIn)
  .filter((r) => !f.proficiency || r.proficiency === f.proficiency)
  .filter((r) => !f.personal || (f.personal === 'on') === r.personalSwitch)
  .filter((r) => !f.kw.trim() || `${r.name}${r.staffNo}`.includes(f.kw.trim()))
  .filter((r) => !f.unconfigured || !r.configured));

const overview = computed(() => [
  { key: 'all', label: '坐席数', value: all.value.length, icon: TeamOutlined, accent: '#1a6fff', bg: '#eff6ff' },
  { key: 'cfg', label: '已配置画像', value: all.value.filter((r) => r.configured).length, icon: IdcardOutlined, accent: '#10b981', bg: '#ecfdf5' },
  { key: 'over', label: '超限', value: all.value.filter((r) => r.overLimit).length, icon: WarningOutlined, accent: '#f59e0b', bg: '#fffbeb' },
  { key: 'oa', label: '超额指派', value: all.value.filter((r) => r.overAssigned).length, icon: ThunderboltOutlined, accent: '#ef4444', bg: '#fef2f2' },
]);

const cols = [
  { title: '姓名', key: 'name', width: 130 },
  { title: '所属组', dataIndex: 'groups', key: 'groups', ellipsis: true },
  { title: '在途 / 上限', key: 'load', width: 140 },
  { title: '熟练度', key: 'proficiency', width: 80 },
  { title: '签入状态', key: 'signIn', width: 90 },
  { title: '标识', key: 'flag', width: 120 },
];

const selected = ref<string | null>(null);
watch(rows, (rs) => {
  if (!rs.some((r) => r.name === selected.value)) selected.value = rs[0]?.name ?? null;
}, { immediate: true });
const cur = computed(() => (selected.value ? all.value.find((r) => r.name === selected.value) ?? null : null));

const PROF_TONE: Record<string, string> = { 初级: 'default', 熟练: 'blue', 专家: 'purple' };
const loadPct = (r: Row) => (r.cap ? Math.min(100, Math.round((r.inTransit / r.cap) * 100)) : 0);
const loadTone = (r: Row) => (r.inTransit >= r.cap ? 'full' : r.inTransit / (r.cap || 1) >= 0.8 ? 'warm' : '');
function dimTags(text: string) { return text === '不限' || text === '未设' ? [] : text.split('、'); }
function goEdit(name: string) { router.push({ path: '/admin/users', query: { agent: name } }); }
</script>

<template>
  <div class="ap">
    <div class="ov-row">
      <div v-for="o in overview" :key="o.key" class="ov" :style="{ '--accent': o.accent }">
        <div class="ov-main"><div class="ov-lb">{{ o.label }}</div><div class="ov-val">{{ o.value }}</div></div>
        <div class="ov-ic" :style="{ background: o.bg, color: o.accent }"><component :is="o.icon" /></div>
      </div>
    </div>

    <DispatchCard title="坐席画像" :sub="`共 ${rows.length} 人`">
      <div class="ap-bar">
        <a-input v-model:value="f.kw" placeholder="姓名 / 工号" allow-clear class="ap-kw">
          <template #prefix><SearchOutlined class="ap-kw-ic" /></template>
        </a-input>
        <a-select v-model:value="f.group" :options="groupOpts" placeholder="所属组" allow-clear style="width: 150px" />
        <a-select v-model:value="f.signIn" :options="opts(SIGN_IN_STATUSES)" placeholder="签入状态" allow-clear style="width: 110px" />
        <a-select v-model:value="f.proficiency" :options="opts(PROFICIENCIES)" placeholder="熟练度" allow-clear style="width: 100px" />
        <a-select v-model:value="f.personal" :options="personalOpts" placeholder="个人开关" allow-clear style="width: 130px" />
        <a-checkbox v-model:checked="f.unconfigured">画像未配置</a-checkbox>
      </div>

      <div class="ap-split">
        <aside class="ap-list">
          <a-table
            :columns="cols"
            :data-source="rows"
            row-key="name"
            size="middle"
            :pagination="stdPagination()"
            :scroll="{ x: 640 }"
            :row-class-name="(r: Row) => (r.name === selected ? 'ap-active' : '')"
            :custom-row="(r: Row) => ({ onClick: () => { selected = r.name; } })"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'name'"><span class="ap-nm">{{ record.name }}</span><span class="muted">{{ record.staffNo }}</span></template>
              <template v-else-if="column.key === 'load'">
                <div class="ld">
                  <span class="ld-tx" :class="loadTone(record as Row)">{{ record.inTransit }} / {{ record.cap }}</span>
                  <div class="ld-bar" :class="loadTone(record as Row)"><i :style="{ width: `${loadPct(record as Row)}%` }" /></div>
                </div>
              </template>
              <a-tag v-else-if="column.key === 'proficiency'" :color="PROF_TONE[record.proficiency]">{{ record.proficiency }}</a-tag>
              <span v-else-if="column.key === 'signIn'" class="sg" :class="`t-${SIGN_TONE[record.signIn]}`"><i />{{ record.signIn }}</span>
              <template v-else-if="column.key === 'flag'">
                <a-tag v-if="!record.configured" color="default">画像未配置</a-tag>
                <a-tag v-if="record.overAssigned" color="red">超额指派</a-tag>
                <a-tag v-else-if="record.overLimit" color="orange">超限</a-tag>
                <span v-if="record.configured && !record.overAssigned && !record.overLimit" class="muted">—</span>
              </template>
            </template>
          </a-table>
        </aside>

        <main class="ap-detail">
          <template v-if="cur">
            <div class="pd-hd">
              <span class="pd-av">{{ cur.name.slice(0, 1) }}</span>
              <div class="pd-tt">
                <div class="pd-nm">{{ cur.name }}<span class="muted">{{ cur.staffNo }}</span></div>
                <div class="pd-grp" :title="cur.groups">{{ cur.groups || '—' }}</div>
              </div>
              <span class="sg" :class="`t-${SIGN_TONE[cur.signIn]}`"><i />{{ cur.signIn }}</span>
            </div>

            <div class="pd-kpis">
              <div class="pd-kpi blue">
                <div class="pd-kpi-val" :class="loadTone(cur)">{{ cur.inTransit }}<small> / {{ cur.cap }}</small></div>
                <div class="pd-kpi-lb">在途 / 上限</div>
              </div>
              <div class="pd-kpi purple"><div class="pd-kpi-val">{{ cur.proficiency }}</div><div class="pd-kpi-lb">熟练度</div></div>
              <div class="pd-kpi" :class="cur.personalSwitch ? 'green' : 'gray'"><div class="pd-kpi-val">{{ cur.personalSwitch ? '开启' : '关闭' }}</div><div class="pd-kpi-lb">个人开关</div></div>
            </div>

            <div class="pd-sec">
              <h4 class="pd-sec-title">个人上限</h4>
              <div class="kv"><span class="k">当前上限</span><span class="v">{{ cur.cap }}<a-tag v-if="cur.capCustom" color="blue" class="kv-tag">个人值</a-tag></span></div>
              <div class="kv"><span class="k">默认值</span><span class="v">{{ cur.defaultCapText }}</span></div>
              <div class="ld-bar lg" :class="loadTone(cur)"><i :style="{ width: `${loadPct(cur)}%` }" /></div>
              <div v-if="cur.overAssigned || cur.overLimit || !cur.configured" class="pd-flags">
                <a-tag v-if="!cur.configured" color="default">画像未配置</a-tag>
                <a-tag v-if="cur.overAssigned" color="red">超额指派</a-tag>
                <a-tag v-else-if="cur.overLimit" color="orange">超限</a-tag>
              </div>
            </div>

            <div class="pd-sec">
              <h4 class="pd-sec-title">人员画像</h4>
              <div v-for="d in cur.dims" :key="d.label" class="dim">
                <span class="dim-k">{{ d.label }}</span>
                <div class="dim-v">
                  <span v-if="d.text === '不限'" class="dim-any">不限</span>
                  <span v-else-if="d.text === '未设'" class="dim-unset">未设</span>
                  <span v-for="t in dimTags(d.text)" v-else :key="t" class="dim-tag">{{ t }}</span>
                </div>
              </div>
            </div>

            <div class="pd-foot"><a-button type="link" size="small" @click="goEdit(cur.name)"><template #icon><EditOutlined /></template>去编辑 →</a-button></div>
          </template>
          <a-empty v-else description="暂无坐席" class="pd-empty" />
        </main>
      </div>
    </DispatchCard>
  </div>
</template>

<style scoped>
.ap { display: flex; flex-direction: column; gap: 16px; container-type: inline-size; min-width: 0; }
.ov-row { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
.ov { background: #fff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 14px 16px; display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; position: relative; overflow: hidden; min-width: 0; }
.ov::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px; background: var(--accent); }
.ov-lb { font-size: 12px; color: #6b7280; }
.ov-val { font-size: 24px; font-weight: 700; color: #111827; line-height: 1.15; margin-top: 8px; }
.ov-ic { width: 36px; height: 36px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 17px; flex: none; }

.ap-bar { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; margin-bottom: 14px; }
.ap-kw { width: 200px; }
.ap-kw-ic { color: #9ca3af; }
.ap-split { display: grid; grid-template-columns: minmax(0, 1.7fr) minmax(300px, 1fr); gap: 16px; align-items: start; }
.ap-list { border: 1px solid #eef0f3; border-radius: 8px; padding: 12px; background: #fafbfc; min-width: 0; }
.ap-list :deep(.ant-table) { background: #fff; border-radius: 6px; }
.ap-list :deep(.ant-table-row) { cursor: pointer; }
.ap-list :deep(.ap-active > td) { background: #eff6ff !important; }
.ap-nm { font-weight: 600; color: #111827; }
.muted { color: #9ca3af; font-size: 12px; margin-left: 6px; font-weight: normal; }
.ld { display: flex; flex-direction: column; gap: 4px; }
.ld-tx { font-size: 12px; color: #374151; font-variant-numeric: tabular-nums; }
.ld-tx.warm { color: #f59e0b; }
.ld-tx.full { color: #ea580c; font-weight: 600; }
.ld-bar { height: 4px; background: #f3f4f6; border-radius: 2px; overflow: hidden; width: 100%; max-width: 110px; }
.ld-bar.lg { max-width: none; height: 6px; margin-top: 6px; }
.ld-bar i { display: block; height: 100%; background: #1a6fff; border-radius: 2px; }
.ld-bar.warm i { background: #f59e0b; }
.ld-bar.full i { background: #ef4444; }
.sg { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; color: #9ca3af; white-space: nowrap; }
.sg i { width: 7px; height: 7px; border-radius: 50%; background: currentColor; }
.sg.t-green { color: #10b981; }
.sg.t-orange { color: #f59e0b; }

.ap-detail { border: 1px solid #e5e7eb; border-radius: 10px; background: #fff; box-shadow: 0 1px 4px rgba(0, 0, 0, 0.04); padding: 18px 20px 12px; min-width: 0; position: sticky; top: 12px; }
.pd-hd { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; min-width: 0; }
.pd-av { width: 40px; height: 40px; border-radius: 50%; background: #1a6fff; color: #fff; font-size: 14px; font-weight: 600; display: flex; align-items: center; justify-content: center; flex: none; }
.pd-tt { flex: 1; min-width: 0; }
.pd-nm { font-size: 15px; font-weight: 600; color: #111827; }
.pd-grp { font-size: 12px; color: #6b7280; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pd-kpis { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; margin-bottom: 16px; }
.pd-kpi { text-align: center; padding: 12px 6px; border-radius: 10px; min-width: 0; }
.pd-kpi-val { font-size: 20px; font-weight: 700; line-height: 1.2; white-space: nowrap; }
.pd-kpi-val small { font-size: 13px; font-weight: 600; color: #6b7280; }
.pd-kpi-lb { font-size: 12px; color: #6b7280; margin-top: 6px; }
.pd-kpi.blue { background: #eff6ff; } .pd-kpi.blue .pd-kpi-val { color: #1a6fff; }
.pd-kpi.blue .pd-kpi-val.full { color: #ea580c; }
.pd-kpi.purple { background: #f5f3ff; } .pd-kpi.purple .pd-kpi-val { color: #7c3aed; }
.pd-kpi.green { background: #ecfdf5; } .pd-kpi.green .pd-kpi-val { color: #059669; }
.pd-kpi.gray { background: #f3f4f6; } .pd-kpi.gray .pd-kpi-val { color: #6b7280; }
.pd-sec { margin-bottom: 16px; }
.pd-sec-title { font-size: 13px; font-weight: 600; color: #374151; margin: 0 0 10px; }
.kv { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; font-size: 13px; line-height: 26px; }
.k { color: #6b7280; flex: none; }
.v { color: #374151; text-align: right; }
.kv-tag { margin-inline: 6px 0; }
.pd-flags { display: flex; gap: 6px; margin-top: 10px; }
.dim { display: flex; gap: 12px; padding: 8px 0; border-bottom: 1px dashed #f0f0f0; font-size: 13px; }
.dim:last-child { border-bottom: none; }
.dim-k { width: 64px; flex: none; color: #6b7280; line-height: 22px; }
.dim-v { flex: 1; display: flex; flex-wrap: wrap; gap: 6px; min-width: 0; }
.dim-tag { display: inline-block; padding: 0 8px; border-radius: 999px; background: #eff6ff; color: #1a6fff; font-size: 12px; line-height: 22px; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dim-any { color: #10b981; line-height: 22px; }
.dim-unset { color: #9ca3af; line-height: 22px; }
.pd-foot { text-align: right; border-top: 1px solid #f3f4f6; padding-top: 10px; }
.pd-empty { padding: 40px 0; }
:deep(.ant-table-thead > tr > th) { background: #f3f4f6; color: #6b7280; font-size: 12px; }

@container (max-width: 1080px) {
  .ap-split { grid-template-columns: minmax(0, 1fr); }
  .ap-detail { position: static; }
}
@container (max-width: 560px) {
  .ov-row { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
</style>
