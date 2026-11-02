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
import './dispatchTheme.css';

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

/** 概览数字默认中性；超限 / 超额指派有人时才标橙 / 红 */
const overview = computed(() => {
  const over = all.value.filter((r) => r.overLimit).length;
  const oa = all.value.filter((r) => r.overAssigned).length;
  return [
    { key: 'all', label: '坐席数', value: all.value.length, icon: TeamOutlined, tone: '' },
    { key: 'cfg', label: '已配置画像', value: all.value.filter((r) => r.configured).length, icon: IdcardOutlined, tone: '' },
    { key: 'over', label: '超限', value: over, icon: WarningOutlined, tone: over ? 'is-warn' : '' },
    { key: 'oa', label: '超额指派', value: oa, icon: ThunderboltOutlined, tone: oa ? 'is-bad' : '' },
  ];
});

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

const loadPct = (r: Row) => (r.cap ? Math.min(100, Math.round((r.inTransit / r.cap) * 100)) : 0);
/** 进度条统一一个颜色，在途达到上限（超限）时变橙 */
const loadFull = (r: Row) => r.inTransit >= r.cap;
function dimTags(text: string) { return text === '不限' || text === '未设' ? [] : text.split('、'); }
function goEdit(name: string) { router.push({ path: '/admin/users', query: { agent: name } }); }
</script>

<template>
  <div class="ap">
    <div class="ov-row">
      <div v-for="o in overview" :key="o.key" class="dx-card ov">
        <div class="ov-main"><div class="ov-lb">{{ o.label }}</div><div class="dx-num ov-val" :class="o.tone">{{ o.value }}</div></div>
        <span class="dx-icon ov-ic"><component :is="o.icon" /></span>
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
                  <span class="ld-tx" :class="{ full: loadFull(record as Row) }">{{ record.inTransit }} / {{ record.cap }}</span>
                  <div class="dx-bar ld-bar" :class="{ 'is-warn': loadFull(record as Row) }"><i :style="{ width: `${loadPct(record as Row)}%` }" /></div>
                </div>
              </template>
              <span v-else-if="column.key === 'proficiency'" class="ap-prof">{{ record.proficiency }}</span>
              <span v-else-if="column.key === 'signIn'" class="dx-status" :class="`is-${SIGN_TONE[record.signIn]}`">{{ record.signIn }}</span>
              <span v-else-if="column.key === 'flag'" class="ap-flags">
                <span v-if="!record.configured" class="flag-muted">画像未配置</span>
                <span v-if="record.overAssigned" class="dx-bad">超额指派</span>
                <span v-else-if="record.overLimit" class="dx-warn">超限</span>
                <span v-if="record.configured && !record.overAssigned && !record.overLimit" class="flag-muted">—</span>
              </span>
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
              <span class="dx-status" :class="`is-${SIGN_TONE[cur.signIn]}`">{{ cur.signIn }}</span>
            </div>

            <div class="pd-kpis">
              <div class="pd-kpi">
                <div class="pd-kpi-val" :class="{ full: loadFull(cur) }">{{ cur.inTransit }}<small> / {{ cur.cap }}</small></div>
                <div class="pd-kpi-lb">在途 / 上限</div>
              </div>
              <div class="pd-kpi"><div class="pd-kpi-val">{{ cur.proficiency }}</div><div class="pd-kpi-lb">熟练度</div></div>
              <div class="pd-kpi"><div class="pd-kpi-val" :class="{ off: !cur.personalSwitch }">{{ cur.personalSwitch ? '开启' : '关闭' }}</div><div class="pd-kpi-lb">个人开关</div></div>
            </div>

            <div class="pd-sec">
              <h4 class="pd-sec-title">个人上限</h4>
              <div class="kv"><span class="k">当前上限</span><span class="v">{{ cur.cap }}<span v-if="cur.capCustom" class="kv-tag">个人值</span></span></div>
              <div class="kv"><span class="k">默认值</span><span class="v">{{ cur.defaultCapText }}</span></div>
              <div class="dx-bar ld-bar lg" :class="{ 'is-warn': loadFull(cur) }"><i :style="{ width: `${loadPct(cur)}%` }" /></div>
              <div v-if="cur.overAssigned || cur.overLimit || !cur.configured" class="pd-flags">
                <span v-if="!cur.configured" class="flag-muted">画像未配置</span>
                <span v-if="cur.overAssigned" class="dx-bad">超额指派</span>
                <span v-else-if="cur.overLimit" class="dx-warn">超限</span>
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
.ap { display: flex; flex-direction: column; gap: 24px; container-type: inline-size; min-width: 0; }
/* 概览：直接平铺在页面上的中性白卡 */
.ov-row { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px; }
.ov { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; min-width: 0; }
.ov-lb { font-size: 13px; color: #86909c; line-height: 20px; }
.ov-val { margin-top: 8px; }
.ov-ic { width: 32px; height: 32px; font-size: 15px; }

.ap-bar { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; margin-bottom: 16px; }
.ap-kw { width: 200px; }
.ap-kw-ic { color: #86909c; }
/* 左列表 · 右详情：用分隔线区分，不再卡中套卡 */
.ap-split { display: grid; grid-template-columns: minmax(0, 1.7fr) minmax(300px, 1fr); align-items: start; }
.ap-list { min-width: 0; padding-right: 24px; }
.ap-list :deep(.ant-table-row) { cursor: pointer; }
.ap-list :deep(.ap-active > td) { background: #f2f7ff !important; }
.ap-nm { font-weight: 500; color: #1f2329; }
.muted { color: #86909c; font-size: 13px; margin-left: 6px; font-weight: normal; }
.ap-prof { color: #1f2329; }
.ap-flags { display: inline-flex; gap: 8px; flex-wrap: wrap; font-size: 13px; }
.flag-muted { color: #86909c; }
.ld { display: flex; flex-direction: column; gap: 4px; }
.ld-tx { font-size: 13px; color: #1f2329; font-variant-numeric: tabular-nums; }
.ld-tx.full { color: #ff7d00; font-weight: 600; }
.ld-bar { max-width: 110px; }
.ld-bar.lg { max-width: none; height: 6px; border-radius: 3px; margin-top: 8px; }

.ap-detail { min-width: 0; position: sticky; top: 12px; padding-left: 24px; border-left: 1px solid #f2f3f5; }
.pd-hd { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; min-width: 0; }
.pd-av { width: 40px; height: 40px; border-radius: 50%; background: #f2f3f5; color: #4e5969; font-size: 15px; font-weight: 600; display: flex; align-items: center; justify-content: center; flex: none; }
.pd-tt { flex: 1; min-width: 0; }
.pd-nm { font-size: 15px; font-weight: 600; color: #1f2329; }
.pd-grp { font-size: 13px; color: #86909c; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
/* 中性三栏数字 */
.pd-kpis { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); margin-bottom: 20px; padding: 16px 0; border-top: 1px solid #f2f3f5; border-bottom: 1px solid #f2f3f5; }
.pd-kpi { text-align: center; min-width: 0; }
.pd-kpi + .pd-kpi { border-left: 1px solid #f2f3f5; }
.pd-kpi-val { font-size: 22px; font-weight: 600; line-height: 30px; color: #1f2329; white-space: nowrap; font-variant-numeric: tabular-nums; }
.pd-kpi-val small { font-size: 13px; font-weight: normal; color: #86909c; }
.pd-kpi-val.full { color: #ff7d00; }
.pd-kpi-val.off { color: #86909c; }
.pd-kpi-lb { font-size: 13px; color: #86909c; margin-top: 4px; }
.pd-sec { margin-bottom: 20px; }
.pd-sec-title { font-size: 14px; font-weight: 600; color: #1f2329; margin: 0 0 8px; }
.kv { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; font-size: 14px; line-height: 28px; }
.k { color: #86909c; flex: none; }
.v { color: #1f2329; text-align: right; }
.kv-tag { margin-left: 8px; font-size: 12px; color: #86909c; }
.pd-flags { display: flex; gap: 12px; margin-top: 12px; font-size: 13px; }
.dim { display: flex; gap: 12px; padding: 10px 0; border-bottom: 1px solid #f2f3f5; font-size: 14px; }
.dim:last-child { border-bottom: none; }
.dim-k { width: 64px; flex: none; color: #86909c; line-height: 22px; }
.dim-v { flex: 1; display: flex; flex-wrap: wrap; gap: 6px; min-width: 0; }
.dim-tag { display: inline-block; padding: 0 8px; border-radius: 4px; background: #f2f3f5; color: #1f2329; font-size: 13px; line-height: 22px; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dim-any { color: #1f2329; line-height: 22px; }
.dim-unset { color: #86909c; line-height: 22px; }
.pd-foot { text-align: right; border-top: 1px solid #f2f3f5; padding-top: 12px; }
.pd-empty { padding: 40px 0; }
:deep(.ant-table-thead > tr > th) { background: #f3f4f6; color: #6b7280; font-size: 12px; }

@container (max-width: 1080px) {
  .ap-split { grid-template-columns: minmax(0, 1fr); }
  .ap-list { padding-right: 0; }
  .ap-detail { position: static; padding: 24px 0 0; margin-top: 24px; border-left: none; border-top: 1px solid #f2f3f5; }
}
@container (max-width: 560px) {
  .ov-row { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
</style>
