<script setup lang="ts">
// 派单策略（PRD 14.2）：运行设置 / 入池规则 / 出池规则 / 个人上限 / 开关记录；各页签底部 [重置][保存]，保存即生效、记审计
import { computed, reactive, ref, watch } from 'vue';
import { message, Modal } from 'ant-design-vue';
import type { Dayjs } from 'dayjs';
import { useDispatchStore } from '@/stores/dispatch';
import { stdPagination } from '@/config/adminUi';
import {
  DISPATCH_ROLES, PROFICIENCIES, defaultDispatchConfig,
  type DispatchConfig, type DispatchRole, type Proficiency, type RunMode, type ScoreFactor,
} from '@/views/tickets/types/dispatch';
import {
  DEFAULT_RUN_THRESHOLDS, MODE_TONE, configFieldsText, opts, pickRunThresholds, rangeError, type RunThresholds,
} from './dispatchUi';
import { parseAt } from './dispatchMetrics';
import PoolRuleList from './PoolRuleList.vue';
import PoolModeSwitchModal from './PoolModeSwitchModal.vue';

const props = defineProps<{ tab?: string; focusRuleId?: string }>();
const emit = defineEmits<{ 'update:tab': [v: string] }>();
const store = useDispatchStore();

const TABS = [
  { key: 'run', label: '运行设置' },
  { key: 'inpool', label: '入池规则' },
  { key: 'outpool', label: '出池规则' },
  { key: 'cap', label: '个人上限' },
  { key: 'audit', label: '开关记录' },
];
const active = ref(TABS.some((t) => t.key === props.tab) ? props.tab! : 'run');
watch(() => props.tab, (v) => { if (v && TABS.some((t) => t.key === v)) active.value = v; });
watch(active, (v) => emit('update:tab', v));

/* ================= 运行设置 ================= */
const run = reactive<RunThresholds>(pickRunThresholds(store.config));

function onGlobalSwitch(on: boolean) {
  Modal.confirm({
    title: on ? '开启全局开关' : '关闭全局开关',
    content: on ? '开启后各组按班组开关接入自动派单。确定开启？' : '关闭后全部组池停止自动派单，已派出工单不收回。确定关闭？',
    okText: '确定',
    cancelText: '取消',
    onOk: () => {
      const r = store.setGlobalSwitch(on);
      if (r.ok) message.success(r.message); else message.error(r.message);
    },
  });
}
const runModeUi = ref<RunMode>(store.config.runMode);
watch(() => store.config.runMode, (v) => { runModeUi.value = v; });
function onRunMode() {
  const mode = runModeUi.value;
  if (mode === store.config.runMode) return;
  const apply = () => {
    const r = store.setRunMode(mode);
    if (r.ok) message.success(r.message); else message.error(r.message);
    runModeUi.value = store.config.runMode;
  };
  if (mode === '正式派单') {
    Modal.confirm({
      title: '切换运行方式', content: '切换后将按规则实际派单，确定切换？', okText: '确定', cancelText: '取消',
      onOk: apply, onCancel: () => { runModeUi.value = store.config.runMode; },
    });
  } else apply();
}
const modeOpen = ref(false);

const RUN_FIELDS: { key: keyof RunThresholds; label: string; prefix?: string; unit: string; min: number; max: number }[] = [
  { key: 'autoFailRate', label: '自动降级 · 派单失败率', prefix: '5 分钟内 ≥', unit: '%', min: 1, max: 100 },
  { key: 'autoSuccessRate', label: '自动降级 · 自动派单成功率', prefix: '15 分钟内 ＜', unit: '%', min: 1, max: 100 },
  { key: 'autoSyncMinutes', label: '自动降级 · 数据未同步', prefix: '超过', unit: '分钟', min: 5, max: 120 },
  { key: 'autoEngineMinutes', label: '自动降级 · 引擎无响应', prefix: '连续', unit: '分钟', min: 1, max: 30 },
  { key: 'resumeOkMinutes', label: '回切提示 · 指标连续达标', unit: '分钟', min: 1, max: 60 },
  { key: 'idleToBreakMinutes', label: '无操作转小休', unit: '分钟', min: 5, max: 240 },
];
function resetRun() { Object.assign(run, DEFAULT_RUN_THRESHOLDS); }
function saveRun() {
  for (const fd of RUN_FIELDS) {
    const e = rangeError(run[fd.key], fd.min, fd.max);
    if (e) { message.error(e); return; }
  }
  const r = store.updateConfig({ ...run });
  if (r.ok) message.success(r.message); else message.error(r.message);
}

/* ================= 出池规则 ================= */
type OutForm = Pick<DispatchConfig, 'originalFirst' | 'windowConsultDays' | 'windowComplaintDays' | 'originalSameProblem'
  | 'reserveMinutes' | 'reserveSlaPercent' | 'factors' | 'recentHours' | 'relaxEnabled' | 'relaxMaxLevel'
  | 'relaxQueueMinutes' | 'relaxSlaPercent' | 'fallbackSlaPercent' | 'noSlaFallbackMinutes'>;
const OUT_KEYS: (keyof OutForm)[] = ['originalFirst', 'windowConsultDays', 'windowComplaintDays', 'originalSameProblem',
  'reserveMinutes', 'reserveSlaPercent', 'factors', 'recentHours', 'relaxEnabled', 'relaxMaxLevel',
  'relaxQueueMinutes', 'relaxSlaPercent', 'fallbackSlaPercent', 'noSlaFallbackMinutes'];
function pickOut(c: DispatchConfig): OutForm {
  const o = {} as Record<string, unknown>;
  OUT_KEYS.forEach((k) => { o[k] = JSON.parse(JSON.stringify(c[k])); });
  return o as OutForm;
}
const out = reactive<OutForm>(pickOut(store.config));
const enabledFactorCount = computed(() => out.factors.filter((x) => x.enabled).length);
const weightSum = computed(() => out.factors.filter((x) => x.enabled).reduce((s, x) => s + (x.weight || 0), 0));
function resetOut() { Object.assign(out, pickOut(defaultDispatchConfig())); }
function saveOut() {
  const checks: [unknown, number, number][] = [
    [out.windowConsultDays, 1, 30], [out.windowComplaintDays, 1, 30],
    [out.reserveMinutes, 1, 60], [out.reserveSlaPercent, 1, 100],
    ...out.factors.map((x: ScoreFactor) => [x.weight, 0, 100] as [unknown, number, number]),
    [out.recentHours, 1, 24], [out.relaxQueueMinutes, 1, 120],
    [out.relaxSlaPercent, 1, 100], [out.fallbackSlaPercent, 1, 100], [out.noSlaFallbackMinutes, 1, 999],
  ];
  for (const [v, a, b] of checks) {
    const e = rangeError(v, a, b);
    if (e) { message.error(e); return; }
  }
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

/* ================= 开关记录（审计） ================= */
const af = reactive<{ range: [Dayjs, Dayjs] | undefined; operator?: string; target: string; kind?: string }>({
  range: undefined, operator: undefined, target: '', kind: undefined,
});
const auditKinds = ['全局开关', '班组开关', '个人开关', '池形态', '运行方式', '入池规则', '人员画像', '熟练度', '个人上限', '派单策略'];
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
  Object.assign(run, pickRunThresholds(c));
});
</script>

<template>
  <div class="st">
    <a-tabs v-model:active-key="active" class="st-tabs">
      <a-tab-pane v-for="t in TABS" :key="t.key" :tab="t.label" />
    </a-tabs>

    <!-- 运行设置 -->
    <section v-if="active === 'run'" class="block">
      <div class="st-rows">
        <div class="st-row">
          <span class="st-k">全局开关</span>
          <div class="st-v"><a-switch :checked="store.config.globalSwitch" @change="(v: unknown) => onGlobalSwitch(!!v)" /></div>
        </div>
        <div class="st-row">
          <span class="st-k">运行方式</span>
          <div class="st-v">
            <a-radio-group v-model:value="runModeUi" @change="onRunMode">
              <a-radio value="试运行">试运行</a-radio>
              <a-radio value="正式派单">正式派单</a-radio>
            </a-radio-group>
          </div>
        </div>
        <div class="st-row">
          <span class="st-k">全局形态</span>
          <div class="st-v">
            <a-tag :color="MODE_TONE[store.globalEffectiveMode()]">{{ store.globalEffectiveMode() }}</a-tag>
            <a-tag v-if="store.config.autoDegraded" color="orange">自动降级</a-tag>
            <a-button size="small" @click="modeOpen = true">切换</a-button>
          </div>
        </div>
        <div v-for="fd in RUN_FIELDS" :key="fd.key" class="st-row">
          <span class="st-k">{{ fd.label }}</span>
          <div class="st-v">
            <span v-if="fd.prefix" class="st-unit">{{ fd.prefix }}</span>
            <a-input-number v-model:value="run[fd.key]" :precision="0" style="width: 100px" />
            <span class="st-unit">{{ fd.unit }}</span>
          </div>
        </div>
      </div>
      <div class="st-foot"><a-button @click="resetRun">重置</a-button><a-button type="primary" @click="saveRun">保存</a-button></div>
    </section>

    <!-- 入池规则 -->
    <section v-else-if="active === 'inpool'" class="block">
      <PoolRuleList :focus-id="focusRuleId" />
    </section>

    <!-- 出池规则 -->
    <section v-else-if="active === 'outpool'" class="block">
      <div class="st-rows">
        <div class="st-sec">原处理人优先</div>
        <div class="st-row"><span class="st-k">原处理人优先</span><div class="st-v"><a-switch v-model:checked="out.originalFirst" /></div></div>
        <div class="st-row">
          <span class="st-k">时间窗 · 咨询及其他</span>
          <div class="st-v"><a-input-number v-model:value="out.windowConsultDays" :precision="0" style="width: 100px" /><span class="st-unit">天</span></div>
        </div>
        <div class="st-row">
          <span class="st-k">时间窗 · 投诉</span>
          <div class="st-v"><a-input-number v-model:value="out.windowComplaintDays" :precision="0" style="width: 100px" /><span class="st-unit">天</span></div>
        </div>
        <div class="st-row"><span class="st-k">附加条件</span><div class="st-v"><a-checkbox v-model:checked="out.originalSameProblem">同一问题分类</a-checkbox></div></div>
        <div class="st-row">
          <span class="st-k">投诉预留时长</span>
          <div class="st-v">
            <a-input-number v-model:value="out.reserveMinutes" :precision="0" style="width: 100px" /><span class="st-unit">分钟，且不超过首响 SLA 剩余的</span>
            <a-input-number v-model:value="out.reserveSlaPercent" :precision="0" style="width: 100px" /><span class="st-unit">%</span>
          </div>
        </div>

        <div class="st-sec">加权评分<span class="st-sec-sub">已启用 {{ enabledFactorCount }} 项 · 权重合计 {{ weightSum }}</span></div>
        <div v-for="fc in out.factors" :key="fc.key" class="st-row">
          <span class="st-k"><a-checkbox v-model:checked="fc.enabled">{{ fc.key === 'recent' ? `近 ${out.recentHours} 小时接单量` : fc.label }}</a-checkbox></span>
          <div class="st-v"><a-input-number v-model:value="fc.weight" :precision="0" :disabled="!fc.enabled" style="width: 100px" /><span class="st-unit">权重</span></div>
        </div>
        <div class="st-row">
          <span class="st-k">近 N 小时</span>
          <div class="st-v"><a-input-number v-model:value="out.recentHours" :precision="0" style="width: 100px" /><span class="st-unit">小时</span></div>
        </div>

        <div class="st-sec">放宽与兜底</div>
        <div class="st-row">
          <span class="st-k">产品逐级放宽</span>
          <div class="st-v">
            <a-switch v-model:checked="out.relaxEnabled" />
            <span class="st-unit">最远层级</span>
            <a-radio-group v-model:value="out.relaxMaxLevel" :disabled="!out.relaxEnabled">
              <a-radio :value="1">同产品分类</a-radio>
              <a-radio :value="2">不限</a-radio>
            </a-radio-group>
          </div>
        </div>
        <div class="st-row">
          <span class="st-k">放宽 · 排队时长</span>
          <div class="st-v"><a-input-number v-model:value="out.relaxQueueMinutes" :precision="0" style="width: 100px" /><span class="st-unit">分钟</span></div>
        </div>
        <div class="st-row">
          <span class="st-k">放宽 · 首响剩余低于</span>
          <div class="st-v"><a-input-number v-model:value="out.relaxSlaPercent" :precision="0" style="width: 100px" /><span class="st-unit">%</span></div>
        </div>
        <div class="st-row">
          <span class="st-k">兜底 · 首响剩余低于</span>
          <div class="st-v"><a-input-number v-model:value="out.fallbackSlaPercent" :precision="0" style="width: 100px" /><span class="st-unit">%</span></div>
        </div>
        <div class="st-row">
          <span class="st-k">无首响 SLA · 兜底排队时长</span>
          <div class="st-v"><a-input-number v-model:value="out.noSlaFallbackMinutes" :precision="0" style="width: 100px" /><span class="st-unit">分钟</span></div>
        </div>
      </div>
      <div class="st-foot"><a-button @click="resetOut">重置</a-button><a-button type="primary" @click="saveOut">保存</a-button></div>
    </section>

    <!-- 个人上限 -->
    <section v-else-if="active === 'cap'" class="block">
      <div class="cap-grid">
        <div>
          <div class="st-sec">角色基准值</div>
          <div class="st-rows">
            <div v-for="r in DISPATCH_ROLES" :key="r" class="st-row">
              <span class="st-k">{{ r }}</span>
              <div class="st-v"><a-input-number v-model:value="cap.roleBase[r]" :precision="0" style="width: 100px" /></div>
            </div>
          </div>
          <div class="st-sec">熟练度系数</div>
          <div class="st-rows">
            <div v-for="p in PROFICIENCIES" :key="p" class="st-row">
              <span class="st-k">{{ p }}</span>
              <div class="st-v"><a-input-number v-model:value="cap.proficiencyCoef[p]" :step="0.1" :precision="1" style="width: 100px" /></div>
            </div>
          </div>
        </div>
        <div>
          <div class="st-sec">默认值预览</div>
          <table class="cap-matrix">
            <thead><tr><th>角色</th><th v-for="p in PROFICIENCIES" :key="p">{{ p }}</th></tr></thead>
            <tbody>
              <tr v-for="r in DISPATCH_ROLES" :key="r"><td>{{ r }}</td><td v-for="p in PROFICIENCIES" :key="p">{{ previewOf(r, p) }}</td></tr>
            </tbody>
          </table>
        </div>
      </div>
      <div class="st-foot"><a-button @click="resetCap">重置</a-button><a-button type="primary" @click="saveCap">保存</a-button></div>
    </section>

    <!-- 开关记录 -->
    <section v-else-if="active === 'audit'" class="block">
      <div class="au-bar">
        <a-range-picker v-model:value="af.range" style="width: 260px" />
        <a-select v-model:value="af.operator" :options="operatorOpts" placeholder="操作人" allow-clear style="width: 130px" />
        <a-input v-model:value="af.target" placeholder="对象" allow-clear style="width: 160px" />
        <a-select v-model:value="af.kind" :options="opts(auditKinds)" placeholder="类型" allow-clear style="width: 130px" />
      </div>
      <a-table :columns="auditCols" :data-source="auditRows" row-key="id" size="middle" :pagination="stdPagination()" :locale="{ emptyText: '暂无记录' }">
        <template #bodyCell="{ column, record }">
          <span v-if="column.key === 'before'" :title="auditBefore(record as any)">{{ auditBefore(record as any) }}</span>
          <span v-else-if="column.key === 'after'" :title="record.after">{{ record.after }}</span>
          <span v-else-if="column.key === 'reason'">{{ record.reason || '—' }}</span>
        </template>
      </a-table>
    </section>

    <PoolModeSwitchModal v-model:open="modeOpen" scope="global" />
  </div>
</template>

<style scoped>
.st-tabs :deep(.ant-tabs-nav) { margin-bottom: 12px; }
.block { background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px 20px; margin-bottom: 16px; }
.st-rows { display: flex; flex-direction: column; max-width: 760px; }
.st-row { display: flex; align-items: center; gap: 16px; min-height: 44px; border-bottom: 1px dashed #f0f0f0; }
.st-k { width: 210px; flex: none; color: #374151; font-size: 13px; }
.st-v { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.st-unit { color: #6b7280; font-size: 13px; }
.st-sec { font-size: 13px; font-weight: 600; color: #111827; padding-left: 10px; border-left: 3px solid #1a6fff; margin: 18px 0 6px; display: flex; align-items: center; gap: 10px; }
.st-sec:first-child { margin-top: 0; }
.st-sec-sub { font-size: 12px; font-weight: normal; color: #9ca3af; }
.st-foot { display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px; padding-top: 14px; border-top: 1px solid #f0f0f0; }
.cap-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 32px; }
.cap-matrix { width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 8px; }
.cap-matrix th { background: #f3f4f6; color: #6b7280; font-size: 12px; font-weight: 600; padding: 8px 10px; text-align: left; }
.cap-matrix td { padding: 8px 10px; border-bottom: 1px solid #f0f0f0; color: #374151; }
.cap-matrix td:not(:first-child), .cap-matrix th:not(:first-child) { text-align: center; }
.au-bar { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 12px; }
:deep(.ant-table-thead > tr > th) { background: #f3f4f6; color: #6b7280; font-size: 12px; }
</style>
