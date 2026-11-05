<script setup lang="ts">
// 派单策略（PRD 14.2）：入池规则 / 出池规则 / 个人上限 / 指定人规则 / 变更记录；出池规则、个人上限页签底部 [重置][保存]，保存即生效、记审计
import { computed, reactive, ref, watch } from 'vue';
import { message } from 'ant-design-vue';
import { CheckCircleFilled, SearchOutlined } from '@ant-design/icons-vue';
import type { Dayjs } from 'dayjs';
import { useDispatchStore } from '@/stores/dispatch';
import { stdPagination } from '@/config/adminUi';
import {
  DISPATCH_ROLES, GATE_ORDER, PROFICIENCIES, defaultDispatchConfig,
  type DispatchConfig, type DispatchRole, type OriginalRelation, type Proficiency,
} from '@/views/tickets/types/dispatch';
import { configFieldsText, opts, rangeError } from './dispatchUi';
import { parseAt } from './dispatchMetrics';
import { GATE_LABEL, SCORE_DIMENSION_ROWS, SCORE_TIE_RULE } from './dispatchLabels';
import PoolRuleList from './PoolRuleList.vue';
import DesignatedRuleList from './DesignatedRuleList.vue';
import './dispatchForm.css';
import './dispatchTheme.css';

const props = defineProps<{ tab?: string }>();
const emit = defineEmits<{ 'update:tab': [v: string] }>();
const store = useDispatchStore();

const TABS = [
  { key: 'inpool', label: '入池规则' },
  { key: 'outpool', label: '出池规则' },
  { key: 'cap', label: '个人上限' },
  { key: 'designated', label: '指定人规则' },
  { key: 'audit', label: '变更记录' },
];
const active = ref(TABS.some((t) => t.key === props.tab) ? props.tab! : 'inpool');
watch(() => props.tab, (v) => { if (v && TABS.some((t) => t.key === v)) active.value = v; });
watch(active, (v) => emit('update:tab', v));

/* ================= 出池规则 ================= */
type OutForm = Pick<DispatchConfig, 'originalChain' | 'scoreWeights'>;
const OUT_KEYS: (keyof OutForm)[] = ['originalChain', 'scoreWeights'];
function pickOut(c: DispatchConfig): OutForm {
  const o = {} as Record<string, unknown>;
  OUT_KEYS.forEach((k) => { o[k] = JSON.parse(JSON.stringify(c[k])); });
  return o as OutForm;
}
const out = reactive<OutForm>(pickOut(store.config));
/** 谁可以接单（门槛 PRD 4.1，P0 项）：引擎固定判定，此处只展示 */
const GATES = GATE_ORDER.map((g) => GATE_LABEL[g]);
function resetOut() { Object.assign(out, pickOut(defaultDispatchConfig())); }
/** 步骤 ② 关系链：各行的适用场景与原处理人取法（PRD 4.2，次序固定） */
const RELATION_META: Record<OriginalRelation, { scene: string; handler: string }> = {
  本单退回: { scene: '售后转回、回访打回', handler: '本单上一处理人' },
  关联单: { scene: '承接子单、升级投诉、升级外投的新单', handler: '原单最后一名二线处理人' },
  同客户近期: { scene: '全部进入派单的工单', handler: '该客户最近一张工单的二线处理人' },
};
function saveOut() {
  const checks: [unknown, number, number][] = [
    ...out.originalChain.filter((x) => x.relation !== '本单退回').map((x) => [x.days, 1, 30] as [unknown, number, number]),
    ...SCORE_DIMENSION_ROWS.map((x) => [out.scoreWeights[x.key], 0, 100] as [unknown, number, number]),
  ];
  for (const [v, a, b] of checks) {
    const e = rangeError(v, a, b);
    if (e) { message.error(e); return; }
  }
  if (!out.originalChain.some((x) => x.enabled)) { message.error('请至少启用一种历史处理人关系'); return; }
  const weightSum = SCORE_DIMENSION_ROWS.reduce((s, x) => s + out.scoreWeights[x.key], 0);
  if (weightSum !== 100) { message.error(`三项权重之和须为 100，当前为 ${weightSum}`); return; }
  const r = store.updateConfig(JSON.parse(JSON.stringify(out)) as Partial<DispatchConfig>);
  if (r.ok) message.success(r.message); else message.error(r.message);
}

/* ================= 个人上限 ================= */
const cap = reactive({
  roleBase: { ...store.config.roleBase } as Record<DispatchRole, number>,
  proficiencyCoef: { ...store.config.proficiencyCoef } as Record<Proficiency, number>,
});
function resetCap() {
  const d = defaultDispatchConfig();
  cap.roleBase = { ...d.roleBase };
  cap.proficiencyCoef = { ...d.proficiencyCoef };
}
function previewOf(role: DispatchRole, p: Proficiency): string {
  const b = cap.roleBase[role];
  const c = cap.proficiencyCoef[p];
  return typeof b === 'number' && typeof c === 'number' ? String(Math.round(b * c)) : '—';
}
function saveCap() {
  for (const r of DISPATCH_ROLES) { const e = rangeError(cap.roleBase[r], 1, 50); if (e) { message.error(e); return; } }
  for (const p of PROFICIENCIES) { const e = rangeError(cap.proficiencyCoef[p], 0.1, 3, true); if (e) { message.error(e); return; } }
  const r = store.updateConfig({ roleBase: { ...cap.roleBase }, proficiencyCoef: { ...cap.proficiencyCoef } });
  if (r.ok) message.success(r.message); else message.error(r.message);
}

/* ================= 变更记录（审计） ================= */
const af = reactive<{ range: [Dayjs, Dayjs] | undefined; operator?: string; target: string; kind?: string }>({
  range: undefined, operator: undefined, target: '', kind: undefined,
});
const auditKinds = ['派单方式', '个人开关', '入池规则', '指定人规则', '工单池', '组成员', '人员画像', '熟练度', '个人上限', '派单策略'];
const operatorOpts = computed(() => opts([...new Set(store.audits.map((a) => a.operator))]));
const auditRows = computed(() => [...store.audits].reverse().filter((a) => {
  if (af.kind && a.kind !== af.kind) return false;
  if (af.operator && a.operator !== af.operator) return false;
  if (af.target.trim() && !a.target.includes(af.target.trim())) return false;
  if (af.range) {
    const t = parseAt(a.at);
    if (t < af.range[0].startOf('day').valueOf() || t > af.range[1].endOf('day').valueOf()) return false;
  }
  return true;
}));
const auditCols = [
  { title: '时间', dataIndex: 'at', key: 'at', width: 160 },
  { title: '操作人', dataIndex: 'operator', key: 'operator', width: 90 },
  { title: '类型', dataIndex: 'kind', key: 'kind', width: 90 },
  { title: '对象', dataIndex: 'target', key: 'target', width: 170, ellipsis: true },
  { title: '变更前', key: 'before', ellipsis: true },
  { title: '变更后', key: 'after', ellipsis: true },
  { title: '原因', key: 'reason', width: 160, ellipsis: true },
];
function auditBefore(a: { kind: string; before: string }) { return a.kind === '派单策略' ? configFieldsText(a.before) : a.before; }
const auditFilterActive = computed(() => !!(af.range || af.operator || af.target.trim() || af.kind));
function clearAuditFilters() {
  af.range = undefined;
  af.operator = undefined;
  af.target = '';
  af.kind = undefined;
}

/* 外部变更（如其他页签切换）后表单回填 */
watch(() => store.config, (c) => {
  Object.assign(out, pickOut(c));
  cap.roleBase = { ...c.roleBase };
  cap.proficiencyCoef = { ...c.proficiencyCoef };
});
</script>

<template>
  <div class="st">
    <section class="block st-shell">
      <a-tabs v-model:active-key="active" class="st-tabs">
        <a-tab-pane v-for="t in TABS" :key="t.key" :tab="t.label" />
      </a-tabs>

      <!-- 入池规则 -->
      <div v-if="active === 'inpool'" class="st-tab-pane">
        <PoolRuleList />
      </div>

      <!-- 出池规则 -->
      <div v-else-if="active === 'outpool'" class="st-tab-pane">
        <section class="outpool-panel">
      <div class="cs-list">
      <div class="cs">
        <div class="cs-hd">
          <span class="cs-seq">1</span>
          <div class="cs-ti"><div class="cs-name">谁可以接单</div></div>
        </div>
        <div class="cs-bd gates">
          <span v-for="g in GATES" :key="g" class="gate"><CheckCircleFilled />{{ g }}</span>
        </div>
      </div>
      <div class="cs">
        <div class="cs-hd">
          <span class="cs-seq">2</span>
          <div class="cs-ti"><div class="cs-name">优先派给历史处理人</div></div>
        </div>
        <div class="cs-bd">
        <div class="oc-wrap">
          <table class="oc-table">
            <thead>
              <tr><th class="oc-seq">次序</th><th>关系</th><th>历史处理人</th><th>有效期</th><th class="oc-on">启用</th></tr>
            </thead>
            <tbody>
              <tr v-for="(row, i) in out.originalChain" :key="row.relation" :class="{ off: !row.enabled }">
                <td class="oc-seq">{{ i + 1 }}</td>
                <td class="oc-rel">
                  <span class="oc-name">{{ row.relation }}</span>
                  <span class="oc-sub">{{ RELATION_META[row.relation].scene }}</span>
                </td>
                <td class="oc-handler">{{ RELATION_META[row.relation].handler }}</td>
                <td class="oc-valid">
                  <span v-if="row.days === null" class="oc-text">不限</span>
                  <span v-else class="oc-inline"><a-input-number v-model:value="row.days" :precision="0" :disabled="!row.enabled" style="width: 72px" />天内</span>
                  <a-checkbox
                    v-if="row.relation === '同客户近期'"
                    v-model:checked="row.sameProblem"
                    :disabled="!row.enabled"
                    class="oc-same-cb"
                  >仅限同一问题分类</a-checkbox>
                </td>
                <td class="oc-on"><a-switch v-model:checked="row.enabled" size="small" /></td>
              </tr>
            </tbody>
          </table>
        </div>
        </div>
      </div>
      <div class="cs">
        <div class="cs-hd">
          <span class="cs-seq">3</span>
          <div class="cs-ti"><div class="cs-name">综合打分选人</div></div>
        </div>
        <div class="cs-bd">
        <div class="oc-wrap">
          <table class="oc-table">
            <thead>
              <tr><th>维度</th><th>因素</th><th class="sd-weight">权重（%）</th><th>业务含义</th></tr>
            </thead>
            <tbody>
              <tr v-for="row in SCORE_DIMENSION_ROWS" :key="row.key">
                <td class="oc-name">{{ row.dimension }}</td>
                <td>{{ row.factor }}</td>
                <td class="sd-weight"><a-input-number v-model:value="out.scoreWeights[row.key]" size="small" style="width: 64px" /></td>
                <td>{{ row.meaning }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="sd-tie">{{ SCORE_TIE_RULE }}</div>
        </div>
      </div>
      </div>
      <div class="panel-foot">
        <a-button @click="resetOut()">重置</a-button>
        <a-button type="primary" @click="saveOut">保存</a-button>
      </div>
        </section>
      </div>

      <!-- 个人上限 -->
      <div v-else-if="active === 'cap'" class="st-tab-pane">
        <section class="cap-panel">
        <p class="cap-formula">
          <span class="cap-formula-label">计算公式</span>
          默认个人上限 = 角色基准值 × 熟练度系数
        </p>
        <div class="cap-layout">
          <div class="cap-card cap-inputs">
            <header class="cap-sect-hd">
              <h3 class="cap-sect-title">配置参数</h3>
              <p class="cap-sect-sub">修改后立即在右侧预览生效，保存后写入策略</p>
            </header>

            <div class="cap-sect">
              <div class="cap-sect-label">
                <span class="cap-sect-name">角色基准值</span>
                <span class="cap-sect-hint">各角色默认上限的基数（1–50）</span>
              </div>
              <div class="table-shell cap-table-shell">
                <table class="cap-edit-table">
                  <thead>
                    <tr><th>角色</th><th class="is-num">基准值</th></tr>
                  </thead>
                  <tbody>
                    <tr v-for="r in DISPATCH_ROLES" :key="r">
                      <td class="cap-role">{{ r }}</td>
                      <td class="is-num">
                        <a-input-number v-model:value="cap.roleBase[r]" :precision="0" size="small" class="cap-num-input" />
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div class="cap-sect cap-sect-prof">
              <div class="cap-sect-label">
                <span class="cap-sect-name">熟练度系数</span>
                <span class="cap-sect-hint">与基准值相乘，得到该熟练度下的默认值</span>
              </div>
              <div class="cap-prof-grid">
                <div v-for="p in PROFICIENCIES" :key="p" class="cap-prof-item" :class="`is-${p}`">
                  <span class="cap-prof-tag">{{ p }}</span>
                  <a-input-number
                    v-model:value="cap.proficiencyCoef[p]"
                    :step="0.1"
                    :precision="1"
                    size="small"
                    class="cap-num-input cap-prof-input"
                  />
                </div>
              </div>
            </div>
          </div>

          <div class="cap-card cap-preview">
            <header class="cap-sect-hd cap-preview-hd">
              <div>
                <h3 class="cap-sect-title">默认值预览</h3>
                <p class="cap-sect-sub">角色 × 熟练度矩阵</p>
              </div>
              <span class="cap-live-tag">实时</span>
            </header>
            <div class="table-shell cap-table-shell cap-matrix-shell">
              <table class="cap-matrix">
                <thead>
                  <tr>
                    <th class="cap-col-role">角色</th>
                    <th v-for="p in PROFICIENCIES" :key="p" class="cap-col-prof" :class="`is-${p}`">{{ p }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="r in DISPATCH_ROLES" :key="r">
                    <td class="cap-role">{{ r }}</td>
                    <td v-for="p in PROFICIENCIES" :key="p" class="cap-val-cell" :class="`is-${p}`">
                      <span class="cap-num">{{ previewOf(r, p) }}</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div class="panel-foot">
          <a-button @click="resetCap">重置</a-button>
          <a-button type="primary" @click="saveCap">保存</a-button>
        </div>
        </section>
      </div>

      <!-- 指定人规则 -->
      <div v-else-if="active === 'designated'" class="st-tab-pane">
        <DesignatedRuleList />
      </div>

      <!-- 变更记录 -->
      <div v-else-if="active === 'audit'" class="st-tab-pane">
        <section class="audit-panel">
      <div class="meta-strip">
        <div class="meta-chip">
          <span class="meta-chip-val">{{ auditRows.length }}</span>
          <span class="meta-chip-lb">条记录</span>
        </div>
        <span class="meta-hint">派单方式切换、个人开关等变更审计</span>
      </div>
      <div class="audit-toolbar">
        <div class="filter-item">
          <span class="filter-label">时间</span>
          <a-range-picker v-model:value="af.range" class="audit-ctl audit-range" />
        </div>
        <span class="filter-divider" aria-hidden="true" />
        <div class="filter-item">
          <span class="filter-label">操作人</span>
          <a-select
            v-model:value="af.operator"
            :options="operatorOpts"
            placeholder="全部"
            allow-clear
            class="audit-ctl audit-select"
          />
        </div>
        <div class="filter-item">
          <span class="filter-label">对象</span>
          <a-input v-model:value="af.target" placeholder="关键字" allow-clear class="audit-ctl audit-target">
            <template #prefix><SearchOutlined class="audit-search-icon" /></template>
          </a-input>
        </div>
        <div class="filter-item">
          <span class="filter-label">类型</span>
          <a-select
            v-model:value="af.kind"
            :options="opts(auditKinds)"
            placeholder="全部"
            allow-clear
            class="audit-ctl audit-select"
          />
        </div>
        <span class="filter-spacer" />
        <a-button v-if="auditFilterActive" type="link" class="audit-reset" @click="clearAuditFilters">重置筛选</a-button>
      </div>
      <div class="table-shell audit-table-wrap">
        <a-table
          :columns="auditCols"
          :data-source="auditRows"
          row-key="id"
          size="middle"
          :pagination="stdPagination()"
          :scroll="{ x: 960 }"
          :locale="{ emptyText: '暂无记录' }"
        >
          <template #bodyCell="{ column, record }">
            <span v-if="column.key === 'before'" class="audit-cell" :title="auditBefore(record as any)">{{ auditBefore(record as any) }}</span>
            <span v-else-if="column.key === 'after'" class="audit-cell" :title="record.after">{{ record.after }}</span>
            <span v-else-if="column.key === 'reason'" class="audit-cell muted">{{ record.reason || '—' }}</span>
          </template>
        </a-table>
        </div>
        </section>
      </div>
    </section>
  </div>
</template>

<style scoped>
.st { min-width: 0; }
/* 白框从页签顶缘开始，与工单池等单 block 子页对齐 */
.st-shell { padding: 12px 20px 20px; margin-bottom: 0; }
.st-tab-pane { min-width: 0; }
.st-tabs :deep(.ant-tabs-nav) { margin: 0 0 14px; }
.st-tabs :deep(.ant-tabs-tab) { padding: 6px 0; font-size: 13px; line-height: 20px; }
.st-tabs :deep(.ant-tabs-tab + .ant-tabs-tab) { margin-left: 24px; }
.st-tabs :deep(.ant-tabs-ink-bar) { height: 2px; }
.outpool-panel, .cap-panel, .audit-panel { padding: 0; border: none; background: transparent; border-radius: 0; }
.outpool-panel { padding: 0; }

/* 出池规则 · 链式步骤卡（对齐 dispatch-config chain-row） */
.cs-list { display: flex; flex-direction: column; gap: 8px; }
.cs {
  padding: 10px 12px;
  border: 1px solid #eef0f3;
  border-radius: 8px;
  background: #fcfcfd;
}
.cs.off .cs-bd { opacity: 0.55; }
.cs-hd { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.cs-seq {
  width: 22px; height: 22px; border-radius: 50%; background: #1a6fff; color: #fff;
  font-size: 12px; font-weight: 600; display: flex; align-items: center; justify-content: center; flex: none;
}
.cs-ti { flex: 1; min-width: 200px; }
.cs-name { font-size: 13px; font-weight: 600; color: #111827; display: flex; align-items: center; gap: 6px; line-height: 1.4; }
.cs-op { display: flex; align-items: center; gap: 8px; margin-left: auto; }
.cs-bd { margin: 10px 0 0 34px; }
.cs-bd .dpf-item.last, .cs-bd > .dpf-grid:last-child .dpf-item { border-bottom: none; }
.gates { display: flex; flex-wrap: wrap; gap: 24px; padding-top: 4px; }
.gate { display: inline-flex; align-items: center; gap: 8px; font-size: 13px; color: #374151; }
.gate :deep(.anticon) { color: #10b981; }
@media (max-width: 640px) { .cs-bd { margin-left: 0; } }

/* 优先派回原处理人 · 关系链三行表 */
.oc-wrap { border: 1px solid #eef0f3; border-radius: 6px; overflow-x: auto; background: #fff; }
.oc-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.oc-table th {
  background: #f3f4f6; color: #6b7280; font-size: 12px; font-weight: 600;
  padding: 8px 12px; text-align: left; border-bottom: 1px solid #eef0f3; white-space: nowrap;
}
.oc-table td { padding: 8px 12px; border-bottom: 1px solid #f3f4f6; vertical-align: middle; color: #374151; }
.oc-table tbody tr:last-child td { border-bottom: none; }
.oc-table tr.off td:not(.oc-on) { opacity: 0.55; }
.oc-seq { width: 48px; text-align: center !important; color: #6b7280; }
.oc-on { width: 56px; text-align: center !important; }
.oc-name { font-weight: 600; color: #111827; white-space: nowrap; }
.oc-rel {
  display: flex; align-items: center; gap: 8px;
  min-width: 0; white-space: nowrap;
}
.oc-rel .oc-sub {
  flex: 1; min-width: 0;
  font-size: 12px; color: #6b7280;
  overflow: hidden; text-overflow: ellipsis;
}
.oc-handler { min-width: 120px; white-space: nowrap; }
.oc-valid {
  display: flex; align-items: center; flex-wrap: nowrap; gap: 12px;
  min-width: 0; white-space: nowrap;
}
.oc-same-cb { flex: none; margin-inline-end: 0 !important; white-space: nowrap; }
.oc-same-cb :deep(.ant-checkbox + span) { padding-inline-end: 0; }
.oc-text { color: #4b5563; }
.oc-inline { display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; color: #374151; }

/* 综合打分 · 三维度表 */
.sd-weight { width: 88px; text-align: center !important; font-variant-numeric: tabular-nums; }
.sd-tie { margin-top: 8px; font-size: 12px; color: #6b7280; line-height: 18px; }

/* 个人上限 */
.cap-formula {
  display: flex; align-items: center; flex-wrap: wrap; gap: 8px 12px;
  margin: 0 0 14px; padding: 10px 14px;
  font-size: 13px; color: #4e5969; line-height: 20px;
  background: #f7f8fa; border: 1px solid #eef0f3; border-radius: 8px;
}
.cap-formula-label {
  font-size: 12px; font-weight: 600; color: #1f2329;
  padding: 2px 8px; background: #fff; border: 1px solid #e5e6eb; border-radius: 4px;
}
.cap-layout {
  display: grid;
  grid-template-columns: minmax(300px, 0.88fr) minmax(360px, 1.12fr);
  gap: 16px;
  align-items: start;
}
.cap-card {
  background: #fff;
  border: 1px solid #eef0f3;
  border-radius: 8px;
  padding: 16px 18px 18px;
  min-width: 0;
}
.cap-inputs { display: flex; flex-direction: column; gap: 20px; }
.cap-sect-hd { margin-bottom: 4px; min-width: 0; }
.cap-preview-hd {
  display: flex; align-items: flex-start; justify-content: space-between; gap: 12px;
  margin-bottom: 12px;
}
.cap-sect-title {
  margin: 0;
  font-size: 14px; font-weight: 600; color: #1f2329; line-height: 22px;
  padding-left: 10px; border-left: 3px solid #1a6fff;
}
.cap-sect-sub { margin: 4px 0 0; font-size: 12px; color: #86909c; line-height: 18px; }
.cap-live-tag {
  flex: none; font-size: 11px; font-weight: 600; color: #1a6fff;
  padding: 2px 8px; border-radius: 999px;
  background: rgba(26, 111, 255, 0.08); border: 1px solid rgba(26, 111, 255, 0.2);
}
.cap-sect-label { display: flex; flex-direction: column; gap: 2px; margin-bottom: 10px; }
.cap-sect-name { font-size: 13px; font-weight: 600; color: #1f2329; line-height: 20px; }
.cap-sect-hint { font-size: 12px; color: #86909c; line-height: 18px; }
.cap-sect-prof { padding-top: 18px; border-top: 1px solid #f2f3f5; }
.cap-table-shell { border-radius: 6px; }
.cap-table-shell :deep(.ant-table) { font-size: 13px; }
.cap-edit-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.cap-edit-table th {
  background: #f7f8fa; color: #86909c; font-size: 12px; font-weight: 600;
  padding: 10px 14px; text-align: left; border-bottom: 1px solid #eef0f3;
}
.cap-edit-table td { padding: 8px 14px; border-bottom: 1px solid #f2f3f5; vertical-align: middle; }
.cap-edit-table tbody tr:hover td { background: #fafbfc; }
.cap-edit-table tbody tr:last-child td { border-bottom: none; }
.cap-edit-table .is-num { width: 108px; text-align: center; }
.cap-edit-table th.is-num { text-align: center; }
.cap-edit-table .cap-role { font-weight: 500; color: #1f2329; }
.cap-num-input { width: 80px !important; }
.cap-edit-table :deep(.ant-input-number) { margin: 0 auto; }
.cap-edit-table :deep(.ant-input-number-input) { text-align: center; font-variant-numeric: tabular-nums; }

.cap-prof-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
.cap-prof-item {
  display: flex; flex-direction: column; align-items: stretch; gap: 8px;
  padding: 12px 10px; border-radius: 8px; border: 1px solid #eef0f3; background: #fafbfc;
}
.cap-prof-item.is-初级 { border-color: #e8f3ff; background: #f7fbff; }
.cap-prof-item.is-熟练 { border-color: #e8ffea; background: #f6ffed; }
.cap-prof-item.is-专家 { border-color: #fff7e8; background: #fffbf0; }
.cap-prof-tag { font-size: 12px; font-weight: 600; color: #4e5969; text-align: center; }
.cap-prof-item.is-初级 .cap-prof-tag { color: #1a6fff; }
.cap-prof-item.is-熟练 .cap-prof-tag { color: #00b42a; }
.cap-prof-item.is-专家 .cap-prof-tag { color: #ff7d00; }
.cap-prof-input { width: 100% !important; max-width: 100%; }

.cap-preview { display: flex; flex-direction: column; min-width: 0; }
.cap-matrix-shell { flex: 1; min-height: 0; max-height: min(560px, 70vh); overflow: auto; }
.cap-matrix { width: 100%; border-collapse: collapse; font-size: 13px; }
.cap-matrix th {
  position: sticky; top: 0; z-index: 2;
  background: #f7f8fa; color: #86909c; font-size: 12px; font-weight: 600;
  padding: 10px 12px; text-align: center; border-bottom: 1px solid #eef0f3;
}
.cap-matrix th.cap-col-role { text-align: left; z-index: 3; left: 0; }
.cap-matrix td { padding: 9px 12px; border-bottom: 1px solid #f2f3f5; color: #4e5969; }
.cap-matrix tbody tr:hover td { background: #fafbfc; }
.cap-matrix tbody tr:last-child td { border-bottom: none; }
.cap-matrix td.cap-val-cell { text-align: center; }
.cap-matrix .cap-role {
  position: sticky; left: 0; z-index: 1;
  font-weight: 500; color: #1f2329; white-space: nowrap;
  background: #fff; box-shadow: 1px 0 0 #f2f3f5;
  max-width: 160px; overflow: hidden; text-overflow: ellipsis;
}
.cap-matrix tbody tr:hover .cap-role { background: #fafbfc; }
.cap-matrix th.is-初级 { color: #1a6fff; background: #f0f6ff; }
.cap-matrix th.is-熟练 { color: #00b42a; background: #f0fff4; }
.cap-matrix th.is-专家 { color: #ff7d00; background: #fff8f0; }
.cap-val-cell.is-初级 .cap-num { color: #1a6fff; }
.cap-val-cell.is-熟练 .cap-num { color: #00b42a; }
.cap-val-cell.is-专家 .cap-num { color: #ff7d00; }
.cap-num {
  display: inline-block; min-width: 28px;
  font-size: 14px; font-weight: 600; color: #1f2329;
  font-variant-numeric: tabular-nums;
}

@media (max-width: 960px) {
  .cap-layout { grid-template-columns: minmax(0, 1fr); }
  .cap-prof-grid { grid-template-columns: 1fr; }
}

/* 变更记录 · 筛选条（对齐分派监控 mon-filter-bar + admin-ui 13px） */
.audit-toolbar {
  display: flex; flex-wrap: wrap; align-items: center; gap: 10px 14px;
  padding: 10px 14px; margin-bottom: 12px;
  background: #f8fafc; border: 1px solid #eef2f7; border-radius: 10px;
}
.audit-toolbar .filter-item { display: inline-flex; align-items: center; gap: 8px; min-width: 0; }
.audit-toolbar .filter-label {
  font-size: 13px; font-weight: 500; color: #86909c; line-height: 20px; flex: none; white-space: nowrap;
}
.audit-toolbar .filter-divider { width: 1px; height: 20px; background: #e2e8f0; flex: none; }
.audit-toolbar .filter-spacer { flex: 1; min-width: 12px; }
.audit-reset { font-size: 13px; padding-inline: 4px; height: auto; line-height: 20px; }
.audit-search-icon { color: #c9cdd4; font-size: 14px; }

.audit-range { width: 248px; max-width: 100%; flex: none; }
.audit-select { width: 132px; flex: none; }
.audit-target { width: 168px; flex: none; }

.audit-ctl :deep(.ant-select-selector),
.audit-ctl :deep(.ant-picker),
.audit-ctl :deep(.ant-input-affix-wrapper) {
  border-radius: 8px !important;
  border-color: #e5e7eb !important;
  background: #fff !important;
  font-size: 13px !important;
}
.audit-ctl :deep(.ant-select-selector),
.audit-ctl :deep(.ant-picker) {
  height: 32px !important;
  padding-inline: 11px !important;
  align-items: center;
}
.audit-ctl :deep(.ant-input-affix-wrapper) {
  padding-inline: 11px !important;
}
.audit-ctl :deep(.ant-input-affix-wrapper > input.ant-input) {
  font-size: 13px !important;
}
.audit-ctl :deep(.ant-select-selection-item),
.audit-ctl :deep(.ant-select-selection-placeholder) {
  font-size: 13px !important;
  line-height: 30px !important;
  color: #1f2329;
}
.audit-ctl :deep(.ant-select-selection-placeholder) { color: #c9cdd4 !important; }
.audit-ctl :deep(.ant-picker-input > input) {
  font-size: 13px !important;
  color: #1f2329;
}
.audit-ctl :deep(.ant-picker-input > input::placeholder) { color: #c9cdd4; }

.audit-table-wrap { margin-top: 0; }
.audit-table-wrap :deep(.ant-table) { font-size: 13px; }
.audit-table-wrap :deep(.ant-table-thead > tr > th) {
  background: #f3f4f6; color: #6b7280; font-size: 12px; font-weight: 600;
}
.audit-table-wrap :deep(.ant-table-tbody > tr > td) {
  color: #374151;
}
.audit-cell { display: inline-block; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; vertical-align: bottom; font-size: 13px; }
.audit-cell.muted { color: #9ca3af; }

@media (max-width: 900px) {
  .audit-toolbar .filter-divider { display: none; }
  .audit-toolbar .filter-item { flex: 1 1 calc(50% - 8px); }
  .audit-range, .audit-select, .audit-target { width: 100%; flex: 1; min-width: 0; }
}
</style>
