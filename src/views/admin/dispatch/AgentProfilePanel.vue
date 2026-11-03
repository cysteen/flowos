<script setup lang="ts">
// 坐席画像（PRD 14.5）：概览条 → 筛选 → 左侧坐席列表 · 右侧选中坐席画像详情；
// 「去编辑」在本页打开派单设置抽屉；勾选坐席后批量设置画像；画像变更记录
import { computed, reactive, ref, watch } from 'vue';
import { EditOutlined, SearchOutlined, TeamOutlined, IdcardOutlined, WarningOutlined, ThunderboltOutlined, HistoryOutlined } from '@ant-design/icons-vue';
import { useDispatchStore } from '@/stores/dispatch';
import { stdPagination } from '@/config/adminUi';
import { PROFICIENCIES, SIGN_IN_STATUSES } from '@/views/tickets/types/dispatch';
import { opts, profileItems, profileSummary, useClock } from './dispatchUi';
import DispatchSettingsDrawer from './DispatchSettingsDrawer.vue';
import BatchProfileModal from './BatchProfileModal.vue';
import './dispatchTheme.css';

const store = useDispatchStore();
const clock = useClock();

const f = reactive<{ group?: string; signIn?: string; proficiency?: string; unconfigured: boolean; personal?: string; kw: string }>({
  group: undefined, signIn: undefined, proficiency: undefined, unconfigured: false, personal: undefined, kw: '',
});
const groupOpts = computed(() => [{ value: 'all', label: '全部处理组' }, ...store.groups.map((g) => ({ value: g.id, label: g.label }))]);
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
    full: v.full,
    loadFactor: v.cap ? v.inTransit / v.cap : 0,
  };
}
type Row = ReturnType<typeof viewOf>;

const all = computed<Row[]>(() => {
  void clock.value;
  return store.agents.map((a) => viewOf(a.name));
});
const rows = computed(() => all.value
  .filter((r) => !f.group || f.group === 'all' || store.agentOf(r.name)!.groupIds.includes(f.group))
  .filter((r) => !f.signIn || r.signIn === f.signIn)
  .filter((r) => !f.proficiency || r.proficiency === f.proficiency)
  .filter((r) => !f.personal || (f.personal === 'on') === r.personalSwitch)
  .filter((r) => !f.kw.trim() || `${r.name}${r.staffNo}`.includes(f.kw.trim()))
  .filter((r) => !f.unconfigured || !r.configured)
  .sort((a, b) => b.loadFactor - a.loadFactor));

/** 概览数字默认中性；超限 / 超额指派有人时才标橙 / 红 */
const OV_ACCENT: Record<string, { accent: string; iconBg: string }> = {
  all: { accent: '#1a6fff', iconBg: '#eff6ff' },
  cfg: { accent: '#0ea5e9', iconBg: '#f0f9ff' },
  over: { accent: '#f59e0b', iconBg: '#fffbeb' },
  oa: { accent: '#6366f1', iconBg: '#eef2ff' },
};
const overview = computed(() => {
  const over = all.value.filter((r) => r.overLimit).length;
  const oa = all.value.filter((r) => r.overAssigned).length;
  return [
    { key: 'all', label: '坐席数', value: all.value.length, icon: TeamOutlined, tone: '' },
    { key: 'cfg', label: '已配置画像', value: all.value.filter((r) => r.configured).length, icon: IdcardOutlined, tone: '' },
    { key: 'over', label: '超限', value: over, icon: WarningOutlined, tone: over ? 'is-warn' : '' },
    { key: 'oa', label: '超额指派', value: oa, icon: ThunderboltOutlined, tone: oa ? 'is-bad' : '' },
  ].map((o) => ({ ...o, ...OV_ACCENT[o.key] }));
});

const cols = [
  { title: '姓名', key: 'name', width: 108 },
  { title: '所属组', dataIndex: 'groups', key: 'groups', ellipsis: true },
  { title: '在途 / 上限', key: 'load', width: 96 },
  { title: '负载', key: 'factor', width: 72, align: 'right' as const },
  { title: '熟练度', key: 'proficiency', width: 72 },
  { title: '签入状态', key: 'signIn', width: 84 },
  { title: '标识', key: 'flag', width: 100 },
];

const selected = ref<string | null>(null);
watch(rows, (rs) => {
  if (!rs.some((r) => r.name === selected.value)) selected.value = rs[0]?.name ?? null;
}, { immediate: true });
const cur = computed(() => (selected.value ? all.value.find((r) => r.name === selected.value) ?? null : null));

const loadPct = (r: Row) => (r.cap ? Math.min(100, Math.round((r.inTransit / r.cap) * 100)) : 0);
const loadFull = (r: Row) => r.inTransit >= r.cap;
function loadFactorColor(f: number) {
  if (f >= 1) return '#ef4444';
  if (f >= 0.8) return '#f59e0b';
  return '#10b981';
}
const SIGN_COLOR: Record<string, string> = { 就绪: '#10b981', 未就绪: '#f97316', 小休: '#f59e0b', 签出: '#9ca3af' };

function dimTags(text: string) { return text === '不限' || text === '未设' ? [] : text.split('、'); }

/* 派单设置抽屉 · 批量设置画像 · 画像变更记录（PRD 6.5 / 14.5） */
const settingsOpen = ref(false);
const settingsName = ref<string | null>(null);
function goEdit(name: string) { settingsName.value = name; settingsOpen.value = true; }

const selectedKeys = ref<string[]>([]);
const rowSelection = computed(() => ({
  selectedRowKeys: selectedKeys.value,
  onChange: (keys: (string | number)[]) => { selectedKeys.value = keys.map(String); },
}));
const batchOpen = ref(false);

const recordOpen = ref(false);
const PROFILE_AUDIT_KINDS = ['人员画像', '熟练度', '个人上限', '个人开关'];
const profileAudits = computed(() => [...store.audits].filter((a) => PROFILE_AUDIT_KINDS.includes(a.kind)).reverse());
const recordCols = [
  { title: '时间', dataIndex: 'at', key: 'at', width: 160 },
  { title: '操作人', dataIndex: 'operator', key: 'operator', width: 90 },
  { title: '坐席', dataIndex: 'target', key: 'target', width: 90 },
  { title: '类型', dataIndex: 'kind', key: 'kind', width: 90 },
  { title: '变更前', dataIndex: 'before', key: 'before', ellipsis: true },
  { title: '变更后', dataIndex: 'after', key: 'after', ellipsis: true },
];
function rowClass(name: string) {
  const c = ['profile-row'];
  if (name === selected.value) c.push('profile-row-active');
  return c.join(' ');
}
</script>

<template>
  <div class="ap">
    <section class="block stat-block">
      <div class="stat-row">
        <div v-for="o in overview" :key="o.key" class="stat-card" :style="{ '--accent': o.accent }">
          <div class="stat-card-inner">
            <div class="stat-main">
              <div class="s-label">{{ o.label }}</div>
              <div class="s-value" :class="o.tone">{{ o.value }}</div>
            </div>
            <div class="stat-icon" :style="{ background: o.iconBg, color: o.accent }">
              <component :is="o.icon" />
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="block profile-split">
      <div class="b-title inline">
        坐席画像
        <span class="b-tip">共 {{ rows.length }} 人 · 按负载降序</span>
        <span class="hd-btn ap-hd-btns">
          <a-button size="small" @click="recordOpen = true"><template #icon><HistoryOutlined /></template>画像变更记录</a-button>
          <a-button size="small" :disabled="!selectedKeys.length" @click="batchOpen = true"><template #icon><TeamOutlined /></template>批量设置画像</a-button>
        </span>
      </div>

      <div class="profile-layout">
        <aside class="profile-list-panel">
          <div class="pf-toolbar">
            <a-input v-model:value="f.kw" size="small" placeholder="姓名 / 工号" allow-clear class="pf-search">
              <template #prefix><SearchOutlined class="pf-search-icon" /></template>
            </a-input>
            <a-select v-model:value="f.group" size="small" :options="groupOpts" placeholder="所属组" allow-clear />
            <a-select v-model:value="f.signIn" size="small" :options="opts(SIGN_IN_STATUSES)" placeholder="签入状态" allow-clear />
            <a-select v-model:value="f.proficiency" size="small" :options="opts(PROFICIENCIES)" placeholder="熟练度" allow-clear />
            <a-select v-model:value="f.personal" size="small" :options="personalOpts" placeholder="个人开关" allow-clear />
            <a-checkbox v-model:checked="f.unconfigured">画像未配置</a-checkbox>
          </div>
          <div class="profile-table-wrap">
            <a-table
              :columns="cols"
              :data-source="rows"
              row-key="name"
              size="small"
              :pagination="stdPagination()"
              :row-selection="rowSelection"
              :scroll="{ x: 652 }"
              :row-class-name="(r: Row) => rowClass(r.name)"
              :custom-row="(r: Row) => ({ onClick: () => { selected = r.name; } })"
            >
              <template #bodyCell="{ column, record }">
                <template v-if="column.key === 'name'">
                  <span class="agent-nm">{{ record.name }}</span>
                  <span class="text-muted staff-no">{{ record.staffNo }}</span>
                </template>
                <span v-else-if="column.key === 'load'" class="mono cap-text" :class="{ 'load-full': loadFull(record as Row) }">
                  {{ record.inTransit }}/{{ record.cap }}
                </span>
                <span v-else-if="column.key === 'factor'" class="mono factor" :style="{ color: loadFactorColor((record as Row).loadFactor) }">
                  {{ (record as Row).loadFactor.toFixed(2) }}
                </span>
                <span v-else-if="column.key === 'proficiency'" class="ap-prof">{{ record.proficiency }}</span>
                <span v-else-if="column.key === 'signIn'" class="status-cell compact">
                  <span class="status-dot" :style="{ background: SIGN_COLOR[record.signIn] ?? '#9ca3af' }" />
                  <span :style="{ color: SIGN_COLOR[record.signIn] ?? '#6b7280' }">{{ record.signIn }}</span>
                </span>
                <span v-else-if="column.key === 'flag'" class="ap-flags">
                  <span v-if="!record.configured" class="flag-muted">画像未配置</span>
                  <span v-if="record.overAssigned" class="dx-bad">超额指派</span>
                  <span v-else-if="record.overLimit" class="dx-warn">超限</span>
                  <span v-else-if="record.full" class="dx-bad">满载</span>
                  <span v-if="record.configured && !record.overAssigned && !record.overLimit && !record.full" class="flag-muted">—</span>
                </span>
              </template>
            </a-table>
          </div>
        </aside>

        <main class="profile-detail-panel">
          <div v-if="cur" class="pd-body">
            <div class="pd-hd">
              <span class="pd-av">{{ cur.name.slice(0, 1) }}</span>
              <div class="pd-tt">
                <div class="pd-nm">{{ cur.name }}<span class="text-muted">{{ cur.staffNo }}</span></div>
                <div class="pd-grp" :title="cur.groups">{{ cur.groups || '—' }}</div>
              </div>
              <span class="status-cell">
                <span class="status-dot" :style="{ background: SIGN_COLOR[cur.signIn] ?? '#9ca3af' }" />
                <span :style="{ color: SIGN_COLOR[cur.signIn] ?? '#6b7280' }">{{ cur.signIn }}</span>
              </span>
            </div>

            <div class="pd-kpis">
              <div class="pd-kpi blue">
                <div class="pd-kpi-val" :class="{ full: loadFull(cur) }">{{ cur.inTransit }}<small> / {{ cur.cap }}</small></div>
                <div class="pd-kpi-lb">在途 / 上限</div>
              </div>
              <div class="pd-kpi green"><div class="pd-kpi-val">{{ cur.proficiency }}</div><div class="pd-kpi-lb">熟练度</div></div>
              <div class="pd-kpi orange">
                <div class="pd-kpi-val" :class="{ off: !cur.personalSwitch }">{{ cur.personalSwitch ? '开启' : '关闭' }}</div>
                <div class="pd-kpi-lb">个人开关</div>
              </div>
            </div>

            <div class="pd-section">
              <h4 class="pd-sec-title">个人上限</h4>
              <div class="kv"><span class="k">当前上限</span><span class="v">{{ cur.cap }}<span v-if="cur.capCustom" class="kv-tag">个人值</span></span></div>
              <div class="kv"><span class="k">默认值</span><span class="v">{{ cur.defaultCapText }}</span></div>
              <div class="dx-bar ld-bar lg" :class="{ 'is-warn': loadFull(cur) }"><i :style="{ width: `${loadPct(cur)}%` }" /></div>
              <div v-if="cur.overAssigned || cur.overLimit || cur.full || !cur.configured" class="pd-flags">
                <span v-if="!cur.configured" class="flag-muted">画像未配置</span>
                <span v-if="cur.overAssigned" class="dx-bad">超额指派</span>
                <span v-else-if="cur.overLimit" class="dx-warn">超限</span>
                <span v-else-if="cur.full" class="dx-bad">满载</span>
              </div>
            </div>

            <div class="pd-section pd-section-last">
              <h4 class="pd-sec-title">人员画像</h4>
              <div v-for="d in cur.dims" :key="d.label" class="dim">
                <span class="dim-k">{{ d.label }}</span>
                <div class="dim-v">
                  <span v-if="d.text === '不限'" class="dim-any">不限</span>
                  <span v-else-if="d.text === '未设'" class="dim-unset">未设</span>
                  <span v-for="t in dimTags(d.text)" v-else :key="t" class="pd-skill-tag">{{ t }}</span>
                </div>
              </div>
            </div>

            <div class="pd-foot">
              <a-button type="link" size="small" @click="goEdit(cur.name)"><template #icon><EditOutlined /></template>去编辑 →</a-button>
            </div>
          </div>
          <a-empty v-else description="暂无坐席" class="pd-empty" />
        </main>
      </div>
    </section>

    <DispatchSettingsDrawer v-model:open="settingsOpen" :name="settingsName" />
    <BatchProfileModal v-model:open="batchOpen" :names="selectedKeys" @done="selectedKeys = []" />
    <a-modal v-model:open="recordOpen" title="画像变更记录" :width="900" :footer="null">
      <a-table :columns="recordCols" :data-source="profileAudits" row-key="id" size="middle" :pagination="stdPagination()" :locale="{ emptyText: '暂无记录' }">
        <template #bodyCell="{ column, record }">
          <span v-if="column.key === 'before' || column.key === 'after'" :title="record[column.key as string]">{{ record[column.key as string] }}</span>
        </template>
      </a-table>
    </a-modal>
  </div>
</template>

<style scoped>
.ap { display: flex; flex-direction: column; gap: 16px; container-type: inline-size; min-width: 0; }

/* 概览统计卡（对齐分派监控 stat-block） */
.stat-block { padding: 16px 20px; margin-bottom: 0; }
.stat-row { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px; }
.stat-card {
  min-width: 0; border: 1px solid #eef0f3; border-radius: 8px; padding: 16px 18px; position: relative; overflow: hidden; background: #fff; min-height: 88px;
}
.stat-card::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px; background: var(--accent, #1a6fff); }
.stat-card-inner { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding-top: 2px; }
.stat-main { flex: 1; min-width: 0; }
.stat-icon { width: 40px; height: 40px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 18px; flex: none; }
.s-label { font-size: 12px; color: #6b7280; line-height: 1.4; }
.s-value { font-size: 28px; font-weight: 700; color: #111827; line-height: 1.1; margin-top: 8px; font-variant-numeric: tabular-nums; }
.s-value.is-warn { color: #ff7d00; }
.s-value.is-bad { color: #f53f3f; }

/* 主区块 · 左右分栏 */
.profile-split { padding: 16px 20px; margin-bottom: 0; }
.profile-layout {
  display: flex; gap: 16px; margin-top: 14px; align-items: stretch;
  min-height: 480px;
}
.profile-list-panel {
  flex: 2; min-width: 0;
  border: 1px solid #eef0f3; border-radius: 8px; padding: 12px;
  background: #fafbfc; display: flex; flex-direction: column; overflow: hidden;
}
.pf-toolbar { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; flex-shrink: 0; flex-wrap: wrap; }
.pf-search { width: 200px; flex: none; }
.pf-search-icon { color: #9ca3af; font-size: 13px; }
.pf-toolbar :deep(.ant-select) { min-width: 110px; flex: 1; max-width: 150px; }
.profile-table-wrap { flex: 1; min-height: 0; overflow: auto; }
.profile-list-panel :deep(.ant-table) { background: #fff; border-radius: 6px; font-size: 12px; }
.profile-list-panel :deep(.ant-table-thead > tr > th),
.profile-list-panel :deep(.ant-table-tbody > tr > td) { padding: 7px 8px !important; }
.profile-list-panel :deep(.ant-table-row) { cursor: pointer; }
.profile-list-panel :deep(.profile-row-active > td) { background: #eff6ff !important; }
.profile-list-panel :deep(.ant-pagination) { margin: 8px 0 0 !important; }

.ap-hd-btns { display: inline-flex; gap: 8px; }
.staff-no { font-size: 11px; margin-left: 4px; }
.ap-prof { font-size: 12px; color: #374151; }
.ap-flags { display: inline-flex; gap: 6px; flex-wrap: wrap; font-size: 12px; }
.flag-muted { color: #9ca3af; }
.cap-text { font-size: 12px; }
.load-full { color: #ff7d00; font-weight: 600; }
.status-cell.compact { font-size: 11px; gap: 4px; }

.profile-detail-panel {
  flex: 1; min-width: 0; min-height: 0; display: flex; flex-direction: column;
  border: 1px solid #e5e7eb; border-radius: 10px; background: #fff; overflow: hidden;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.04);
}
.pd-body { flex: 1; min-height: 0; padding: 20px 24px 12px; display: flex; flex-direction: column; overflow-y: auto; }
.pd-hd { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; min-width: 0; }
.pd-av { width: 44px; height: 44px; border-radius: 50%; background: #eff6ff; color: #1a6fff; font-size: 16px; font-weight: 600; display: flex; align-items: center; justify-content: center; flex: none; }
.pd-tt { flex: 1; min-width: 0; }
.pd-nm { font-size: 15px; font-weight: 600; color: #111827; }
.pd-grp { font-size: 12px; color: #6b7280; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.pd-kpis { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 16px; }
.pd-kpi { text-align: center; padding: 14px 10px; border-radius: 10px; }
.pd-kpi-val { font-size: 22px; font-weight: 700; line-height: 1.2; }
.pd-kpi-val small { font-size: 13px; font-weight: normal; color: #6b7280; }
.pd-kpi-val.full { color: #d97706; }
.pd-kpi-val.off { color: #9ca3af; }
.pd-kpi-lb { font-size: 12px; color: #6b7280; margin-top: 6px; }
.pd-kpi.blue { background: #eff6ff; } .pd-kpi.blue .pd-kpi-val { color: #1a6fff; }
.pd-kpi.green { background: #ecfdf5; } .pd-kpi.green .pd-kpi-val { color: #059669; }
.pd-kpi.orange { background: #fffbeb; } .pd-kpi.orange .pd-kpi-val { color: #d97706; }

.pd-section { margin-bottom: 16px; }
.pd-section-last { margin-bottom: 8px; }
.pd-sec-title { font-size: 13px; font-weight: 600; color: #374151; margin: 0 0 12px; }
.kv { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; font-size: 13px; line-height: 28px; }
.k { color: #6b7280; flex: none; }
.v { color: #111827; text-align: right; }
.kv-tag { margin-left: 8px; font-size: 12px; color: #9ca3af; }
.ld-bar.lg { max-width: none; height: 6px; border-radius: 3px; margin-top: 8px; }
.pd-flags { display: flex; gap: 12px; margin-top: 12px; font-size: 13px; }
.dim { display: flex; gap: 12px; padding: 8px 0; border-bottom: 1px solid #f3f4f6; font-size: 13px; }
.dim:last-child { border-bottom: none; }
.dim-k { width: 64px; flex: none; color: #6b7280; line-height: 22px; }
.dim-v { flex: 1; display: flex; flex-wrap: wrap; gap: 8px; min-width: 0; }
.pd-skill-tag { display: inline-block; padding: 4px 12px; border-radius: 999px; font-size: 12px; font-weight: 500; background: #f3f4f6; color: #374151; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dim-any { color: #111827; line-height: 22px; }
.dim-unset { color: #9ca3af; line-height: 22px; }
.pd-foot { text-align: right; border-top: 1px solid #eef0f3; padding-top: 12px; margin-top: auto; }
.pd-empty { padding: 48px 0; }

.profile-list-panel :deep(.ant-table-thead > tr > th) { background: #f3f4f6; color: #6b7280; font-size: 12px; }

@container (max-width: 1080px) {
  .profile-layout { flex-direction: column; min-height: 0; }
  .profile-list-panel { flex: none; max-height: 420px; }
  .profile-detail-panel { min-height: 360px; }
}
@container (max-width: 560px) {
  .stat-row { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
</style>
