<script setup lang="ts">
// 派单策略（PRD 14.2）：运行设置 / 入池规则 / 出池规则 / 个人上限 / 开关记录；各页签底部 [重置][保存]，保存即生效、记审计
import { computed, reactive, ref, watch } from 'vue';
import { message, Modal } from 'ant-design-vue';
import { CheckCircleFilled, CheckOutlined, RocketOutlined } from '@ant-design/icons-vue';
import type { Dayjs } from 'dayjs';
import { useDispatchStore } from '@/stores/dispatch';
import { stdPagination } from '@/config/adminUi';
import {
  DISPATCH_ROLES, PROFICIENCIES, ROLLOUT_STAGES, defaultDispatchConfig,
  type DispatchConfig, type DispatchRole, type Proficiency, type ScoreFactor,
} from '@/views/tickets/types/dispatch';
import {
  DEFAULT_RUN_THRESHOLDS, MODE_TONE, configFieldsText, opts, pickRunThresholds, rangeError, type RunThresholds,
} from './dispatchUi';
import { parseAt } from './dispatchMetrics';
import PoolRuleList from './PoolRuleList.vue';
import PoolModeSwitchModal from './PoolModeSwitchModal.vue';
import RolloutStageModal from './RolloutStageModal.vue';
import DispatchCard from './DispatchCard.vue';
import './dispatchForm.css';
import './dispatchTheme.css';

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
// 运行方式只读（14.2 / 第 17 章）：只随上线阶段推进、退回联动变更
const modeOpen = ref(false);

/* 上线阶段（第 17 章）：试运行 → 单组试点 → 多组 → 全量，每步由管理员确认；可退回上一步 */
const stage = computed(() => store.rolloutStage());
const nextStage = computed(() => ROLLOUT_STAGES[ROLLOUT_STAGES.indexOf(stage.value) + 1] ?? null);
// 正式派单下未开启班组开关：阶段显示试运行，只出「推进至单组试点」
const prevStage = computed(() => (store.rolloutNoSwitch() ? null : ROLLOUT_STAGES[ROLLOUT_STAGES.indexOf(stage.value) - 1] ?? null));
const stageTip = computed(() => (store.config.globalSwitch ? '' : '全局开关已关闭，请先在派单策略开启'));
const stageIdx = computed(() => ROLLOUT_STAGES.indexOf(stage.value));
const stageOpen = ref(false);
const stageDir = ref<'forward' | 'back'>('forward');
function openStage(dir: 'forward' | 'back') {
  stageDir.value = dir;
  stageOpen.value = true;
}

const RUN_FIELDS: { key: keyof RunThresholds; label: string; prefix?: string; unit: string; min: number; max: number }[] = [
  { key: 'autoFailRate', label: '自动降级 · 派单失败率', prefix: '5 分钟内 ≥', unit: '%', min: 1, max: 100 },
  { key: 'autoSuccessRate', label: '自动降级 · 自动派单成功率', prefix: '15 分钟内 ＜', unit: '%', min: 1, max: 100 },
  { key: 'autoSyncMinutes', label: '自动降级 · 数据未同步', prefix: '超过', unit: '分钟', min: 5, max: 120 },
  { key: 'autoEngineMinutes', label: '自动降级 · 引擎无响应', prefix: '连续', unit: '分钟', min: 1, max: 30 },
  { key: 'resumeOkMinutes', label: '回切提示 · 指标连续达标', unit: '分钟', min: 1, max: 60 },
  { key: 'idleToBreakMinutes', label: '无操作转小休', unit: '分钟', min: 5, max: 240 },
];
const AUTO_FIELDS = RUN_FIELDS.slice(0, 4);
const RESUME_FIELDS = RUN_FIELDS.slice(4);
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
/** 门槛过滤（PRD 4.1，P0 项）：引擎固定判定，此处只展示 */
const GATES = ['候选范围', '三级开关', '角色', '在班', '投诉回避', '画像已配置', '画像匹配', '个人上限'];
function resetOut() { Object.assign(out, pickOut(defaultDispatchConfig())); }
function factorShare(w: number | null | undefined) {
  return weightSum.value > 0 && w ? Math.round((w / weightSum.value) * 100) : 0;
}
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
    <div v-if="active === 'run'" class="st-stack">
      <!-- 上线阶段状态条 -->
      <section class="dx-card ro-bar">
        <div class="ro-head">
          <span class="dx-icon ro-ic"><RocketOutlined /></span>
          <span class="ro-label">上线阶段</span>
          <span v-if="store.rolloutNoSwitch()" class="dx-meta">未开启班组开关</span>
        </div>
        <ol class="ro-steps">
          <li v-for="(s, i) in ROLLOUT_STAGES" :key="s" :class="{ done: i < stageIdx, cur: i === stageIdx }">
            <span class="ro-dot"><CheckOutlined v-if="i < stageIdx" /><template v-else>{{ i + 1 }}</template></span>
            <span class="ro-name">{{ s }}</span>
          </li>
        </ol>
        <div class="ro-ops">
          <a-tooltip :title="stageTip || undefined">
            <a-button v-if="prevStage" :disabled="!!stageTip" @click="openStage('back')">退回至{{ prevStage }}</a-button>
          </a-tooltip>
          <a-tooltip :title="stageTip || undefined">
            <a-button v-if="nextStage" type="primary" :disabled="!!stageTip" @click="openStage('forward')">推进至{{ nextStage }}</a-button>
          </a-tooltip>
        </div>
      </section>

      <DispatchCard title="开关与形态" sub="全局派单开关、运行方式与全局形态">
        <div class="dpf-grid">
          <div class="dpf-item">
            <span class="dpf-label">全局开关</span>
            <div class="dpf-ctl"><a-switch :checked="store.config.globalSwitch" @change="(v: unknown) => onGlobalSwitch(!!v)" /></div>
          </div>
          <div class="dpf-item">
            <span class="dpf-label">运行方式</span>
            <div class="dpf-ctl"><span class="dpf-val">{{ store.config.runMode }}</span></div>
          </div>
          <div class="dpf-item">
            <span class="dpf-label">全局形态</span>
            <div class="dpf-ctl">
              <span class="dx-status" :class="`is-${MODE_TONE[store.globalEffectiveMode()]}`">{{ store.globalEffectiveMode() }}</span>
              <span v-if="store.config.autoDegraded" class="dx-status is-orange">自动降级</span>
              <a-button type="link" size="small" @click="modeOpen = true">切换</a-button>
            </div>
          </div>
        </div>
      </DispatchCard>

      <DispatchCard title="自动降级" sub="触发自动降级的指标阈值">
        <div class="dpf-grid">
          <div v-for="fd in AUTO_FIELDS" :key="fd.key" class="dpf-item">
            <span class="dpf-label">{{ fd.label.replace('自动降级 · ', '') }}</span>
            <div class="dpf-ctl">
              <span v-if="fd.prefix" class="dpf-unit">{{ fd.prefix }}</span>
              <a-input-number v-model:value="run[fd.key]" :precision="0" style="width: 100px" />
              <span class="dpf-unit">{{ fd.unit }}</span>
            </div>
          </div>
        </div>
      </DispatchCard>

      <DispatchCard title="回切与小休">
        <div class="dpf-grid">
          <div v-for="fd in RESUME_FIELDS" :key="fd.key" class="dpf-item">
            <span class="dpf-label">{{ fd.label }}</span>
            <div class="dpf-ctl">
              <a-input-number v-model:value="run[fd.key]" :precision="0" style="width: 100px" />
              <span class="dpf-unit">{{ fd.unit }}</span>
            </div>
          </div>
        </div>
      </DispatchCard>
      <div class="st-foot"><a-button @click="resetRun">重置</a-button><a-button type="primary" @click="saveRun">保存</a-button></div>
    </div>

    <!-- 入池规则 -->
    <div v-else-if="active === 'inpool'" class="st-stack">
      <PoolRuleList :focus-id="focusRuleId" />
    </div>

    <!-- 出池规则 -->
    <div v-else-if="active === 'outpool'" class="st-stack">
      <DispatchCard title="出池规则" sub="在归属组成员中按以下步骤选处理人">
      <div class="cs-list">
      <div class="cs">
        <div class="cs-hd">
          <span class="cs-seq">1</span>
          <div class="cs-ti"><div class="cs-name">门槛过滤<span class="cs-lk">固定</span></div><div class="cs-desc">任一不满足的坐席不进入候选集</div></div>
        </div>
        <div class="cs-bd gates">
          <span v-for="g in GATES" :key="g" class="gate"><CheckCircleFilled />{{ g }}</span>
        </div>
      </div>
      <div class="cs" :class="{ off: !out.originalFirst }">
        <div class="cs-hd">
          <span class="cs-seq">2</span>
          <div class="cs-ti"><div class="cs-name">原处理人优先</div><div class="cs-desc">原处理人通过全部门槛即派回</div></div>
          <div class="cs-op"><a-switch v-model:checked="out.originalFirst" /></div>
        </div>
        <div class="cs-bd">
        <div class="dpf-grid">
          <div class="dpf-item"><span class="dpf-label">附加条件</span><div class="dpf-ctl"><a-checkbox v-model:checked="out.originalSameProblem">同一问题分类</a-checkbox></div></div>
          <div class="dpf-item">
            <span class="dpf-label">时间窗 · 咨询及其他</span>
            <div class="dpf-ctl"><a-input-number v-model:value="out.windowConsultDays" :precision="0" style="width: 100px" /><span class="dpf-unit">天</span></div>
          </div>
          <div class="dpf-item">
            <span class="dpf-label">时间窗 · 投诉</span>
            <div class="dpf-ctl"><a-input-number v-model:value="out.windowComplaintDays" :precision="0" style="width: 100px" /><span class="dpf-unit">天</span></div>
          </div>
        </div>
        <div class="dpf-grid one">
          <div class="dpf-item last">
            <span class="dpf-label">投诉预留时长</span>
            <div class="dpf-ctl">
              <a-input-number v-model:value="out.reserveMinutes" :precision="0" style="width: 100px" /><span class="dpf-unit">分钟，且不超过首响 SLA 剩余的</span>
              <a-input-number v-model:value="out.reserveSlaPercent" :precision="0" style="width: 100px" /><span class="dpf-unit">%</span>
            </div>
          </div>
        </div>
        </div>
      </div>
      <div class="cs">
        <div class="cs-hd">
          <span class="cs-seq">3</span>
          <div class="cs-ti"><div class="cs-name">加权评分</div><div class="cs-desc">原处理人不可用时对候选集评分，取最高分</div></div>
          <div class="cs-op"><span class="wsum">已启用 {{ enabledFactorCount }} 项 · 权重合计 {{ weightSum }}</span></div>
        </div>
        <div class="cs-bd">
        <div class="fc-list">
          <div v-for="fc in out.factors" :key="fc.key" class="fc-row" :class="{ off: !fc.enabled }">
            <a-checkbox v-model:checked="fc.enabled" class="fc-name">{{ fc.key === 'recent' ? `近 ${out.recentHours} 小时接单量` : fc.label }}</a-checkbox>
            <div class="fc-bar"><i :style="{ width: `${fc.enabled ? factorShare(fc.weight) : 0}%` }" /></div>
            <span class="fc-share">{{ fc.enabled ? `${factorShare(fc.weight)}%` : '—' }}</span>
            <div class="fc-w"><a-input-number v-model:value="fc.weight" :precision="0" :disabled="!fc.enabled" style="width: 88px" /><span class="dpf-unit">权重</span></div>
          </div>
        </div>
        <div class="dpf-grid one fc-extra">
          <div class="dpf-item">
            <span class="dpf-label">近 N 小时</span>
            <div class="dpf-ctl"><a-input-number v-model:value="out.recentHours" :precision="0" style="width: 100px" /><span class="dpf-unit">小时</span></div>
          </div>
        </div>
        </div>
      </div>
      <div class="cs">
        <div class="cs-hd">
          <span class="cs-seq">4</span>
          <div class="cs-ti"><div class="cs-name">放宽与兜底</div><div class="cs-desc">候选集为空时留池排队、组内放宽，仍派不出则兜底回池</div></div>
        </div>
        <div class="cs-bd">
        <div class="dpf-grid">
          <div class="dpf-item">
            <span class="dpf-label">产品逐级放宽</span>
            <div class="dpf-ctl"><a-switch v-model:checked="out.relaxEnabled" /></div>
          </div>
          <div class="dpf-item">
            <span class="dpf-label">最远层级</span>
            <div class="dpf-ctl">
              <a-radio-group v-model:value="out.relaxMaxLevel" :disabled="!out.relaxEnabled">
                <a-radio :value="1">同产品分类</a-radio>
                <a-radio :value="2">不限</a-radio>
              </a-radio-group>
            </div>
          </div>
          <div class="dpf-item">
            <span class="dpf-label">放宽 · 排队时长</span>
            <div class="dpf-ctl"><a-input-number v-model:value="out.relaxQueueMinutes" :precision="0" style="width: 100px" /><span class="dpf-unit">分钟</span></div>
          </div>
          <div class="dpf-item">
            <span class="dpf-label">放宽 · 首响剩余低于</span>
            <div class="dpf-ctl"><a-input-number v-model:value="out.relaxSlaPercent" :precision="0" style="width: 100px" /><span class="dpf-unit">%</span></div>
          </div>
          <div class="dpf-item">
            <span class="dpf-label">兜底 · 首响剩余低于</span>
            <div class="dpf-ctl"><a-input-number v-model:value="out.fallbackSlaPercent" :precision="0" style="width: 100px" /><span class="dpf-unit">%</span></div>
          </div>
          <div class="dpf-item">
            <span class="dpf-label">无首响 SLA · 兜底排队时长</span>
            <div class="dpf-ctl"><a-input-number v-model:value="out.noSlaFallbackMinutes" :precision="0" style="width: 100px" /><span class="dpf-unit">分钟</span></div>
          </div>
        </div>
        </div>
      </div>
      </div>
      </DispatchCard>
      <div class="st-foot"><a-button @click="resetOut()">重置</a-button><a-button type="primary" @click="saveOut">保存</a-button></div>
    </div>

    <!-- 个人上限 -->
    <div v-else-if="active === 'cap'" class="st-stack">
      <div class="cap-grid">
        <div class="st-stack">
          <DispatchCard title="角色基准值" sub="各角色的默认个人上限">
            <div class="dpf-grid cap-form">
              <div v-for="r in DISPATCH_ROLES" :key="r" class="dpf-item">
                <span class="dpf-label">{{ r }}</span>
                <div class="dpf-ctl"><a-input-number v-model:value="cap.roleBase[r]" :precision="0" style="width: 100px" /></div>
              </div>
            </div>
          </DispatchCard>
          <DispatchCard title="熟练度系数" sub="与角色基准值相乘得到默认值">
            <div class="dpf-grid cap-form">
              <div v-for="p in PROFICIENCIES" :key="p" class="dpf-item">
                <span class="dpf-label">{{ p }}</span>
                <div class="dpf-ctl"><a-input-number v-model:value="cap.proficiencyCoef[p]" :step="0.1" :precision="1" style="width: 100px" /></div>
              </div>
            </div>
          </DispatchCard>
        </div>
        <DispatchCard title="默认值预览" sub="角色 × 熟练度">
          <table class="cap-matrix">
            <thead><tr><th>角色</th><th v-for="p in PROFICIENCIES" :key="p">{{ p }}</th></tr></thead>
            <tbody>
              <tr v-for="r in DISPATCH_ROLES" :key="r"><td>{{ r }}</td><td v-for="p in PROFICIENCIES" :key="p"><span class="cap-num">{{ previewOf(r, p) }}</span></td></tr>
            </tbody>
          </table>
        </DispatchCard>
      </div>
      <div class="st-foot"><a-button @click="resetCap">重置</a-button><a-button type="primary" @click="saveCap">保存</a-button></div>
    </div>

    <!-- 开关记录 -->
    <DispatchCard v-else-if="active === 'audit'" title="开关记录" :sub="`共 ${auditRows.length} 条`">
      <div class="au-bar">
        <a-range-picker v-model:value="af.range" style="width: 260px; max-width: 100%" />
        <a-select v-model:value="af.operator" :options="operatorOpts" placeholder="操作人" allow-clear style="width: 130px" />
        <a-input v-model:value="af.target" placeholder="对象" allow-clear style="width: 160px" />
        <a-select v-model:value="af.kind" :options="opts(auditKinds)" placeholder="类型" allow-clear style="width: 130px" />
      </div>
      <a-table :columns="auditCols" :data-source="auditRows" row-key="id" size="middle" :pagination="stdPagination()" :scroll="{ x: 960 }" :locale="{ emptyText: '暂无记录' }">
        <template #bodyCell="{ column, record }">
          <span v-if="column.key === 'before'" :title="auditBefore(record as any)">{{ auditBefore(record as any) }}</span>
          <span v-else-if="column.key === 'after'" :title="record.after">{{ record.after }}</span>
          <span v-else-if="column.key === 'reason'">{{ record.reason || '—' }}</span>
        </template>
      </a-table>
    </DispatchCard>

    <PoolModeSwitchModal v-model:open="modeOpen" scope="global" />
    <RolloutStageModal v-model:open="stageOpen" :direction="stageDir" />
  </div>
</template>

<style scoped>
.st { min-width: 0; }
.st-tabs :deep(.ant-tabs-nav) { margin-bottom: 16px; }
.st-stack { display: flex; flex-direction: column; gap: 24px; min-width: 0; }
/* 底部保存栏：贴底常驻 */
.st-foot {
  position: sticky; bottom: 0; z-index: 2; display: flex; justify-content: flex-end; gap: 12px;
  background: #fff; border: 1px solid #eef0f3; border-radius: 8px; padding: 12px 20px; box-shadow: 0 -4px 12px rgba(31, 35, 41, 0.04);
}

/* 上线阶段状态条（中性卡片） */
.ro-bar { display: flex; align-items: center; gap: 16px 32px; flex-wrap: wrap; }
.ro-head { display: flex; align-items: center; gap: 12px; flex: none; }
.ro-ic { width: 32px; height: 32px; font-size: 15px; }
.ro-label { font-size: 15px; font-weight: 600; color: #1f2329; }
.ro-steps { display: flex; align-items: center; list-style: none; margin: 0; padding: 0; flex: 1 1 320px; min-width: 0; }
.ro-steps li { display: flex; align-items: center; gap: 8px; flex: 1; min-width: 0; font-size: 14px; color: #86909c; white-space: nowrap; }
.ro-steps li:last-child { flex: none; }
.ro-steps li:not(:last-child)::after { content: ''; flex: 1; height: 1px; background: #e5e6eb; margin: 0 12px; min-width: 8px; }
.ro-steps li.done:not(:last-child)::after { background: #1a6fff; }
.ro-dot { width: 22px; height: 22px; border-radius: 50%; border: 1px solid #c9cdd4; background: #fff; display: flex; align-items: center; justify-content: center; font-size: 12px; flex: none; }
.ro-steps li.done { color: #4e5969; }
.ro-steps li.done .ro-dot { border-color: #1a6fff; color: #1a6fff; }
.ro-steps li.cur { color: #1f2329; font-weight: 600; }
.ro-steps li.cur .ro-dot { border-color: #1a6fff; background: #1a6fff; color: #fff; }
.ro-ops { display: flex; gap: 8px; flex-wrap: wrap; margin-left: auto; }

/* 出池规则 · 编号步骤：序号圆点 + 标题 + 灰色说明，步骤之间分隔线 */
.cs-list { display: flex; flex-direction: column; }
.cs { padding: 20px 0; border-top: 1px solid #f2f3f5; }
.cs:first-child { padding-top: 4px; border-top: none; }
.cs:last-child { padding-bottom: 0; }
.cs.off .cs-bd { opacity: 0.55; }
.cs-hd { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.cs-seq { width: 24px; height: 24px; border-radius: 50%; background: #f2f3f5; color: #4e5969; font-size: 13px; font-weight: 600; display: flex; align-items: center; justify-content: center; flex: none; }
.cs-ti { flex: 1; min-width: 200px; }
.cs-name { font-size: 14px; font-weight: 600; color: #1f2329; display: flex; align-items: center; gap: 8px; line-height: 22px; }
.cs-lk { font-size: 12px; font-weight: normal; color: #86909c; }
.cs-desc { font-size: 13px; color: #86909c; line-height: 20px; }
.cs-op { display: flex; align-items: center; gap: 8px; margin-left: auto; }
.cs-bd { margin: 8px 0 0 36px; }
.cs-bd .dpf-item.last, .cs-bd > .dpf-grid:last-child .dpf-item { border-bottom: none; }
.gates { display: flex; flex-wrap: wrap; gap: 8px 24px; padding-top: 8px; }
.gate { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; color: #4e5969; }
.gate :deep(.anticon) { color: #86909c; }
@media (max-width: 640px) { .cs-bd { margin-left: 0; } }

/* 加权评分 */
.wsum { font-size: 13px; color: #86909c; }
.fc-list { display: flex; flex-direction: column; }
.fc-row { display: flex; align-items: center; gap: 16px; padding: 10px 0; border-bottom: 1px solid #f2f3f5; flex-wrap: wrap; }
.fc-row.off { opacity: 0.6; }
.fc-name { width: 180px; flex: none; font-size: 14px; color: #1f2329; }
.fc-bar { flex: 1; min-width: 80px; height: 4px; background: #f2f3f5; border-radius: 2px; overflow: hidden; }
.fc-bar i { display: block; height: 100%; background: #1a6fff; border-radius: 2px; transition: width 0.2s; }
.fc-share { width: 40px; text-align: right; font-size: 13px; color: #86909c; }
.fc-w { display: flex; align-items: center; gap: 8px; }
.fc-extra .dpf-item { border-bottom: none; }

/* 个人上限 */
.cap-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 420px), 1fr)); gap: 16px; align-items: start; }
.cap-form { grid-template-columns: repeat(auto-fit, minmax(min(100%, 240px), 1fr)); column-gap: 32px; }
.cap-form :deep(.dpf-label), .cap-form .dpf-label { width: 112px; white-space: nowrap; }
.cap-matrix { width: 100%; border-collapse: collapse; font-size: 13px; }
.cap-matrix th { background: #f3f4f6; color: #6b7280; font-size: 12px; font-weight: 600; padding: 10px 12px; text-align: left; }
.cap-matrix td { padding: 12px; border-bottom: 1px solid #f2f3f5; color: #4e5969; }
.cap-matrix td:not(:first-child), .cap-matrix th:not(:first-child) { text-align: center; }
.cap-num { font-weight: 600; color: #1f2329; font-variant-numeric: tabular-nums; }

.au-bar { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 12px; }
:deep(.ant-table-thead > tr > th) { background: #f3f4f6; color: #6b7280; font-size: 12px; }
</style>
