<script setup lang="ts">
// 派单策略（PRD 14.2）：入池规则 / 出池规则 / 个人上限 / 变更记录；出池规则、个人上限页签底部 [重置][保存]，保存即生效、记审计
import { computed, reactive, ref, watch } from 'vue';
import { message } from 'ant-design-vue';
import { CheckCircleFilled } from '@ant-design/icons-vue';
import type { Dayjs } from 'dayjs';
import { useDispatchStore } from '@/stores/dispatch';
import { stdPagination } from '@/config/adminUi';
import {
  DISPATCH_ROLES, GATE_ORDER, PROFICIENCIES, defaultDispatchConfig,
  SCORE_WEIGHTS, type DispatchConfig, type DispatchRole, type OriginalRelation, type Proficiency,
} from '@/views/tickets/types/dispatch';
import { configFieldsText, opts, rangeError } from './dispatchUi';
import { parseAt } from './dispatchMetrics';
import { GATE_LABEL, SCORE_DIMENSION_ROWS, SCORE_TIE_RULE } from './dispatchLabels';
import PoolRuleList from './PoolRuleList.vue';
import './dispatchForm.css';
import './dispatchTheme.css';

const props = defineProps<{ tab?: string; focusRuleId?: string }>();
const emit = defineEmits<{ 'update:tab': [v: string] }>();
const store = useDispatchStore();

const TABS = [
  { key: 'inpool', label: '入池规则' },
  { key: 'outpool', label: '出池规则' },
  { key: 'cap', label: '个人上限' },
  { key: 'audit', label: '变更记录' },
];
const active = ref(TABS.some((t) => t.key === props.tab) ? props.tab! : 'inpool');
watch(() => props.tab, (v) => { if (v && TABS.some((t) => t.key === v)) active.value = v; });
watch(active, (v) => emit('update:tab', v));

/* ================= 出池规则 ================= */
type OutForm = Pick<DispatchConfig, 'originalChain'>;
const OUT_KEYS: (keyof OutForm)[] = ['originalChain'];
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
  关联单: { scene: '承接子单、升级投诉、升级外投的新单', handler: '原单最后一名二线及以上处理人' },
  同客户近期: { scene: '全部进入派单的工单', handler: '该客户有效期内由二线及以上处理过的最近一张工单的处理人' },
};
function saveOut() {
  const checks: [unknown, number, number][] = [
    ...out.originalChain.filter((x) => x.relation !== '本单退回').map((x) => [x.days, 1, 30] as [unknown, number, number]),
  ];
  for (const [v, a, b] of checks) {
    const e = rangeError(v, a, b);
    if (e) { message.error(e); return; }
  }
  if (!out.originalChain.some((x) => x.enabled)) { message.error('请至少启用一种原处理人关系'); return; }
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
const auditKinds = ['派单方式', '个人开关', '入池规则', '工单池', '组成员', '人员画像', '熟练度', '个人上限', '派单策略'];
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
        <PoolRuleList :focus-id="focusRuleId" />
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
          <div class="cs-ti"><div class="cs-name">优先派回原处理人</div></div>
        </div>
        <div class="cs-bd">
        <div class="oc-wrap">
          <table class="oc-table">
            <thead>
              <tr><th class="oc-seq">次序</th><th>关系</th><th>原处理人</th><th>有效期</th><th class="oc-on">启用</th></tr>
            </thead>
            <tbody>
              <tr v-for="(row, i) in out.originalChain" :key="row.relation" :class="{ off: !row.enabled }">
                <td class="oc-seq">{{ i + 1 }}</td>
                <td><div class="oc-name">{{ row.relation }}</div><div class="oc-sub">{{ RELATION_META[row.relation].scene }}</div></td>
                <td class="oc-handler">{{ RELATION_META[row.relation].handler }}</td>
                <td class="oc-nowrap">
                  <span v-if="row.days === null" class="oc-text">不限</span>
                  <span v-else class="oc-inline"><a-input-number v-model:value="row.days" :precision="0" :disabled="!row.enabled" style="width: 72px" />天内</span>
                  <div v-if="row.relation === '同客户近期'" class="oc-same">
                    <a-checkbox v-model:checked="row.sameProblem" :disabled="!row.enabled">仅限同一问题分类</a-checkbox>
                  </div>
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
              <tr><th>维度</th><th>因素</th><th class="sd-weight">权重</th><th>业务含义</th></tr>
            </thead>
            <tbody>
              <tr v-for="row in SCORE_DIMENSION_ROWS" :key="row.key">
                <td class="oc-name">{{ row.dimension }}</td>
                <td>{{ row.factor }}</td>
                <td class="sd-weight">{{ SCORE_WEIGHTS[row.key] }}</td>
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
        <div class="cap-layout">
          <div class="cap-inputs">
            <div class="cap-sect">
              <h3 class="run-sect-title">角色基准值</h3>
              <p class="run-sect-sub">各角色的默认个人上限</p>
              <div class="cap-edit-wrap">
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
              <h3 class="run-sect-title">熟练度系数</h3>
              <p class="run-sect-sub">与角色基准值相乘得到默认值</p>
              <div class="cap-edit-wrap">
                <table class="cap-edit-table cap-edit-table-prof">
                  <thead>
                    <tr>
                      <th v-for="p in PROFICIENCIES" :key="p" class="is-num">{{ p }}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td v-for="p in PROFICIENCIES" :key="p" class="is-num">
                        <a-input-number v-model:value="cap.proficiencyCoef[p]" :step="0.1" :precision="1" size="small" class="cap-num-input" />
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div class="cap-preview">
            <h3 class="run-sect-title">默认值预览</h3>
            <p class="run-sect-sub">角色 × 熟练度</p>
            <div class="cap-matrix-wrap">
              <table class="cap-matrix">
                <thead><tr><th>角色</th><th v-for="p in PROFICIENCIES" :key="p">{{ p }}</th></tr></thead>
                <tbody>
                  <tr v-for="r in DISPATCH_ROLES" :key="r">
                    <td class="cap-role">{{ r }}</td>
                    <td v-for="p in PROFICIENCIES" :key="p"><span class="cap-num">{{ previewOf(r, p) }}</span></td>
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
        <a-range-picker v-model:value="af.range" size="small" class="audit-range" />
        <a-select v-model:value="af.operator" size="small" :options="operatorOpts" placeholder="操作人" allow-clear class="audit-f" />
        <a-input v-model:value="af.target" size="small" placeholder="对象" allow-clear class="audit-f audit-f-wide" />
        <a-select v-model:value="af.kind" size="small" :options="opts(auditKinds)" placeholder="类型" allow-clear class="audit-f" />
      </div>
      <div class="table-shell audit-table-wrap">
        <a-table
          :columns="auditCols"
          :data-source="auditRows"
          row-key="id"
          size="small"
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
.oc-name { font-weight: 600; color: #111827; }
.oc-sub { font-size: 12px; color: #6b7280; margin-top: 2px; min-width: 96px; }
.oc-handler { min-width: 120px; }
/* 宽屏保留量一行放下，窄屏收窄列宽、保留量折成两行 */
.oc-same { margin-top: 6px; }
.oc-nowrap { white-space: nowrap; }
.oc-text { color: #4b5563; }
.oc-inline { display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; color: #374151; }

/* 综合打分 · 三维度只读表 */
.sd-weight { width: 64px; text-align: center !important; font-variant-numeric: tabular-nums; }
.sd-tie { margin-top: 8px; font-size: 12px; color: #6b7280; line-height: 18px; }

/* 个人上限 · 单页聚合 */
.cap-layout {
  display: grid;
  grid-template-columns: minmax(280px, 0.82fr) minmax(320px, 1.18fr);
  gap: 0;
  border: 1px solid #eef0f3;
  border-radius: 8px;
  overflow: hidden;
  align-items: stretch;
}
.cap-inputs { padding: 16px 18px; background: #fff; display: flex; flex-direction: column; gap: 18px; min-width: 0; }
.cap-sect-prof { padding-top: 2px; border-top: 1px solid #f3f4f6; }
.cap-edit-wrap {
  border: 1px solid #eef0f3; border-radius: 6px; overflow: hidden; background: #fff;
}
.cap-edit-table { width: 100%; border-collapse: collapse; font-size: 12px; }
.cap-edit-table:not(.cap-edit-table-prof) { table-layout: auto; }
.cap-edit-table-prof { table-layout: fixed; }
.cap-edit-table th {
  background: #f3f4f6; color: #6b7280; font-size: 12px; font-weight: 600;
  padding: 8px 12px; text-align: left; border-bottom: 1px solid #eef0f3;
}
.cap-edit-table td { padding: 6px 12px; border-bottom: 1px solid #f3f4f6; vertical-align: middle; }
.cap-edit-table tbody tr:last-child td { border-bottom: none; }
.cap-edit-table .is-num { width: 96px; text-align: center; }
.cap-edit-table th.is-num { text-align: center; }
.cap-edit-table-prof .is-num { width: 33.33%; }
.cap-edit-table .cap-role { font-weight: 500; color: #374151; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cap-num-input { width: 72px !important; }
.cap-edit-table :deep(.ant-input-number) { margin: 0 auto; }
.cap-preview {
  padding: 16px 18px;
  border-left: 1px solid #eef0f3;
  background: #fafbfc;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.cap-matrix-wrap { flex: 1; min-height: 0; overflow: auto; border: 1px solid #eef0f3; border-radius: 6px; background: #fff; }
.cap-matrix { width: 100%; border-collapse: collapse; font-size: 12px; }
.cap-matrix th {
  position: sticky; top: 0; z-index: 1;
  background: #f3f4f6; color: #6b7280; font-size: 12px; font-weight: 600;
  padding: 8px 10px; text-align: left; border-bottom: 1px solid #eef0f3;
}
.cap-matrix td { padding: 8px 10px; border-bottom: 1px solid #f3f4f6; color: #4b5563; }
.cap-matrix tbody tr:last-child td { border-bottom: none; }
.cap-matrix td:not(:first-child), .cap-matrix th:not(:first-child) { text-align: center; }
.cap-role { font-weight: 500; color: #374151; white-space: nowrap; max-width: 120px; overflow: hidden; text-overflow: ellipsis; }
.cap-num { font-weight: 600; color: #111827; font-variant-numeric: tabular-nums; }

@media (max-width: 960px) {
  .cap-layout { grid-template-columns: minmax(0, 1fr); }
  .cap-preview { border-left: none; border-top: 1px solid #eef0f3; }
}

/* 变更记录 */
.audit-toolbar {
  display: flex; flex-wrap: wrap; align-items: center; gap: 8px;
  padding: 10px 12px; margin-bottom: 12px;
  background: #fafbfc; border: 1px solid #eef0f3; border-radius: 8px;
}
.audit-table-wrap { margin-top: 0; }
.audit-range { width: 260px; max-width: 100%; flex: none; }
.audit-f { width: 130px; flex: none; }
.audit-f-wide { width: 160px; }
.audit-cell { display: inline-block; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; vertical-align: bottom; }
.audit-cell.muted { color: #9ca3af; }

:deep(.ant-table-thead > tr > th) { background: #f3f4f6; color: #6b7280; font-size: 12px; }
</style>
