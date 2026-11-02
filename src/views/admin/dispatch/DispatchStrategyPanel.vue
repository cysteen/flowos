<script setup lang="ts">
// 派单策略（PRD 14.2）：运行设置 / 入池规则 / 出池规则 / 个人上限 / 开关记录；各页签底部 [重置][保存]，保存即生效、记审计
import { computed, reactive, ref, watch } from 'vue';
import { message } from 'ant-design-vue';
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
import DispatchConfirmModal from './DispatchConfirmModal.vue';
import RolloutStageModal from './RolloutStageModal.vue';
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

/** 全局开关二次确认（8.2）：null＝未打开 */
const globalSwitchTo = ref<boolean | null>(null);
const globalSwitchOpen = computed({ get: () => globalSwitchTo.value !== null, set: (v: boolean) => { if (!v) globalSwitchTo.value = null; } });
function onGlobalSwitch(on: boolean) { globalSwitchTo.value = on; }
function onGlobalSwitchOk() {
  const on = globalSwitchTo.value;
  if (on === null) return;
  const r = store.setGlobalSwitch(on);
  if (r.ok) message.success(r.message); else message.error(r.message);
}
// 运行方式只读（14.2 / 第 17 章）：只随上线阶段推进、退回联动变更
const modeOpen = ref(false);

/* 上线阶段（第 17 章）：试运行 → 单组试点 → 多组 → 全量，每步由管理员确认；可退回上一步 */
const stage = computed(() => store.rolloutStage());
const nextStage = computed(() => ROLLOUT_STAGES[ROLLOUT_STAGES.indexOf(stage.value) + 1] ?? null);
// 正式派单下没有自动派单的组：阶段显示试运行，只出「推进至单组试点」
const prevStage = computed(() => (store.rolloutNoAutoGroup() ? null : ROLLOUT_STAGES[ROLLOUT_STAGES.indexOf(stage.value) - 1] ?? null));
const stageTip = computed(() => (store.config.globalSwitch ? '' : '全局开关已关闭，请先在派单策略开启'));
const stageIdx = computed(() => ROLLOUT_STAGES.indexOf(stage.value));
const stageOpen = ref(false);
const stageDir = ref<'forward' | 'back'>('forward');
function openStage(dir: 'forward' | 'back') {
  stageDir.value = dir;
  stageOpen.value = true;
}

const RUN_FIELDS: { key: keyof RunThresholds; label: string; prefix?: string; unit: string; min: number; max: number }[] = [
  { key: 'autoFailRate', label: '自动转混合 · 派单失败率', prefix: '5 分钟内 ≥', unit: '%', min: 1, max: 100 },
  { key: 'autoSuccessRate', label: '自动转混合 · 自动派单成功率', prefix: '15 分钟内 ＜', unit: '%', min: 1, max: 100 },
  { key: 'autoSyncMinutes', label: '自动转混合 · 数据未同步', prefix: '超过', unit: '分钟', min: 5, max: 120 },
  { key: 'autoEngineMinutes', label: '自动转混合 · 引擎无响应', prefix: '连续', unit: '分钟', min: 1, max: 30 },
  { key: 'resumeOkMinutes', label: '恢复提示 · 指标连续达标', unit: '分钟', min: 1, max: 60 },
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
const GATES = ['候选范围', '两级开关', '角色', '在班', '投诉回避', '画像已配置', '画像匹配', '个人上限'];
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
const auditKinds = ['全局开关', '个人开关', '派单方式', '运行方式', '入池规则', '人员画像', '熟练度', '个人上限', '派单策略'];
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
    <section class="block st-shell">
      <a-tabs v-model:active-key="active" class="st-tabs">
        <a-tab-pane v-for="t in TABS" :key="t.key" :tab="t.label" />
      </a-tabs>

      <!-- 运行设置 -->
      <div v-if="active === 'run'" class="st-tab-pane run-tab">
        <section class="run-panel">
        <div class="run-card">
          <header class="run-top">
            <div class="run-top-id">
              <span class="run-top-ic"><RocketOutlined /></span>
              <div class="run-top-tx">
                <span class="run-top-title">上线阶段</span>
                <span v-if="store.rolloutNoAutoGroup()" class="run-top-note">无自动派单组</span>
              </div>
            </div>
            <ol class="ro-steps">
              <li v-for="(s, i) in ROLLOUT_STAGES" :key="s" :class="{ done: i < stageIdx, cur: i === stageIdx }">
                <span class="ro-dot"><CheckOutlined v-if="i < stageIdx" /><template v-else>{{ i + 1 }}</template></span>
                <span class="ro-name">{{ s }}</span>
              </li>
            </ol>
            <div class="ro-ops">
              <a-tooltip :title="stageTip || undefined">
                <a-button v-if="prevStage" size="small" :disabled="!!stageTip" @click="openStage('back')">退回至{{ prevStage }}</a-button>
              </a-tooltip>
              <a-tooltip :title="stageTip || undefined">
                <a-button v-if="nextStage" type="primary" size="small" :disabled="!!stageTip" @click="openStage('forward')">推进至{{ nextStage }}</a-button>
              </a-tooltip>
            </div>
          </header>

          <div class="run-body">
            <div class="run-col">
              <div class="run-block-hd">
                <span class="run-block-title">开关与派单方式</span>
                <span class="run-block-tip">全局派单开关、运行方式与全局派单方式</span>
              </div>
              <div class="run-kv">
                <div class="run-kv-row">
                  <span class="run-kv-label">全局开关</span>
                  <span class="run-kv-ctl"><a-switch :checked="store.config.globalSwitch" @change="(v: unknown) => onGlobalSwitch(!!v)" /></span>
                </div>
                <div class="run-kv-row">
                  <span class="run-kv-label">运行方式</span>
                  <span class="run-kv-ctl"><span class="dpf-val">{{ store.config.runMode }}</span></span>
                </div>
                <div class="run-kv-row">
                  <span class="run-kv-label">全局派单方式</span>
                  <span class="run-kv-ctl">
                    <span class="dx-status" :class="`is-${MODE_TONE[store.globalEffectiveMode()]}`">{{ store.globalEffectiveMode() }}</span>
                    <span v-if="store.config.autoDegraded" class="dx-status is-orange">自动转混合</span>
                    <a-button type="link" size="small" @click="modeOpen = true">切换</a-button>
                  </span>
                </div>
              </div>
            </div>

            <div class="run-col">
              <div class="run-block-hd">
                <span class="run-block-title">自动转混合</span>
                <span class="run-block-tip">触发自动转混合的指标阈值</span>
              </div>
              <div class="run-kv run-kv-grid">
                <div v-for="fd in AUTO_FIELDS" :key="fd.key" class="run-kv-row">
                  <span class="run-kv-label">{{ fd.label.replace('自动转混合 · ', '') }}</span>
                  <span class="run-kv-ctl">
                    <span v-if="fd.prefix" class="dpf-unit">{{ fd.prefix }}</span>
                    <a-input-number v-model:value="run[fd.key]" :precision="0" size="small" class="run-num" />
                    <span class="dpf-unit">{{ fd.unit }}</span>
                  </span>
                </div>
              </div>

              <div class="run-block-hd run-block-hd-sub">
                <span class="run-block-title">恢复与小休</span>
              </div>
              <div class="run-kv run-kv-grid run-kv-grid-2">
                <div v-for="fd in RESUME_FIELDS" :key="fd.key" class="run-kv-row">
                  <span class="run-kv-label">{{ fd.label }}</span>
                  <span class="run-kv-ctl">
                    <a-input-number v-model:value="run[fd.key]" :precision="0" size="small" class="run-num" />
                    <span class="dpf-unit">{{ fd.unit }}</span>
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="panel-foot">
          <a-button @click="resetRun">重置</a-button>
          <a-button type="primary" @click="saveRun">保存</a-button>
        </div>
        </section>
      </div>

      <!-- 入池规则 -->
      <div v-else-if="active === 'inpool'" class="st-tab-pane">
        <PoolRuleList :focus-id="focusRuleId" />
      </div>

      <!-- 出池规则 -->
      <div v-else-if="active === 'outpool'" class="st-tab-pane">
        <section class="outpool-panel">
      <p class="outpool-lead">在归属组成员中按以下步骤选处理人</p>
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

      <!-- 开关记录 -->
      <div v-else-if="active === 'audit'" class="st-tab-pane">
        <section class="audit-panel">
      <div class="meta-strip">
        <div class="meta-chip">
          <span class="meta-chip-val">{{ auditRows.length }}</span>
          <span class="meta-chip-lb">条记录</span>
        </div>
        <span class="meta-hint">全局 / 班组 / 个人开关、派单方式、运行方式等变更审计</span>
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

    <PoolModeSwitchModal v-model:open="modeOpen" scope="global" />
    <DispatchConfirmModal
      v-model:open="globalSwitchOpen"
      :title="globalSwitchTo ? '开启全局开关' : '关闭全局开关'"
      :tip="globalSwitchTo ? '开启后各组按本组派单方式接入自动派单。确定开启？' : '关闭后全部组池停止自动派单，已派出工单不收回。确定关闭？'"
      :danger="globalSwitchTo === false"
      @ok="onGlobalSwitchOk"
    />
    <RolloutStageModal v-model:open="stageOpen" :direction="stageDir" />
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
.st-tab-pane.run-tab { gap: 0; }
.run-panel, .outpool-panel, .cap-panel, .audit-panel { padding: 0; border: none; background: transparent; border-radius: 0; }
.outpool-panel { padding: 0; }
.outpool-lead { margin: 0 0 14px; font-size: 12px; color: #9ca3af; line-height: 1.45; }

/* 运行设置 · 单卡片聚合（阶段 + 表单同一外框） */
.run-card {
  border: 1px solid #eef0f3;
  border-radius: 8px;
  overflow: hidden;
  background: #fff;
}
.run-top {
  display: flex;
  align-items: center;
  gap: 16px 20px;
  flex-wrap: wrap;
  padding: 14px 18px;
  background: linear-gradient(180deg, #fafbfc 0%, #fff 100%);
  border-bottom: 1px solid #eef0f3;
}
.run-top-id { display: flex; align-items: center; gap: 10px; flex: none; min-width: 0; }
.run-top-ic {
  width: 32px; height: 32px; border-radius: 8px; flex: none;
  display: inline-flex; align-items: center; justify-content: center;
  font-size: 15px; color: #1a6fff; background: #eff6ff;
}
.run-top-tx { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.run-top-title { font-size: 13px; font-weight: 600; color: #111827; line-height: 1.35; }
.run-top-note { font-size: 12px; color: #9ca3af; line-height: 1.35; }
.ro-steps {
  display: flex; align-items: center; list-style: none; margin: 0; padding: 0;
  flex: 1; min-width: min(100%, 520px);
}
.ro-steps li { display: flex; align-items: center; gap: 6px; flex: 1; min-width: 0; font-size: 12px; color: #6b7280; white-space: nowrap; }
.ro-steps li:last-child { flex: none; }
.ro-steps li:not(:last-child)::after {
  content: ''; flex: 1; height: 2px; background: #e5e7eb; margin: 0 8px; min-width: 4px; border-radius: 1px;
}
.ro-steps li.done:not(:last-child)::after { background: #93c5fd; }
.ro-dot {
  width: 22px; height: 22px; border-radius: 50%; border: 1px solid #d1d5db; background: #fff;
  display: flex; align-items: center; justify-content: center; font-size: 10px; flex: none;
}
.ro-steps li.done { color: #374151; }
.ro-steps li.done .ro-dot { border-color: #1a6fff; color: #1a6fff; background: #eff6ff; }
.ro-steps li.cur { color: #111827; font-weight: 600; }
.ro-steps li.cur .ro-dot { border-color: #1a6fff; background: #1a6fff; color: #fff; }
.ro-ops { display: flex; gap: 8px; flex-wrap: wrap; flex: none; margin-left: auto; }

.run-body {
  display: grid;
  grid-template-columns: minmax(260px, 0.92fr) minmax(340px, 1.08fr);
  gap: 0;
  align-items: stretch;
}
.run-col { padding: 16px 18px 18px; min-width: 0; }
.run-col + .run-col { border-left: 1px solid #eef0f3; }
.run-block-hd { margin-bottom: 10px; min-width: 0; }
.run-block-hd-sub { margin-top: 18px; padding-top: 14px; border-top: 1px solid #f2f3f5; }
.run-block-title { font-size: 13px; font-weight: 600; color: #111827; margin-right: 8px; }
.run-block-tip { font-size: 12px; color: #9ca3af; font-weight: normal; }
.run-kv { display: flex; flex-direction: column; }
.run-kv-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); column-gap: 20px; }
.run-kv-grid-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.run-kv-row {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  min-height: 44px; padding: 6px 0; border-bottom: 1px solid #f2f3f5;
}
.run-kv-row:last-child { border-bottom: none; }
.run-kv-grid .run-kv-row:nth-last-child(-n + 2) { border-bottom: none; }
.run-kv-label { flex: 1; min-width: 0; font-size: 13px; color: #374151; line-height: 1.4; }
.run-kv-ctl { display: inline-flex; align-items: center; justify-content: flex-end; gap: 8px; flex-wrap: wrap; flex: none; max-width: 58%; }
.run-num { width: 88px !important; }

@media (max-width: 960px) {
  .run-top { flex-direction: column; align-items: stretch; }
  .ro-steps { min-width: 0; width: 100%; order: 2; }
  .ro-ops { margin-left: 0; width: 100%; justify-content: flex-end; order: 3; }
  .run-top-id { order: 1; }
  .run-body { grid-template-columns: minmax(0, 1fr); }
  .run-col + .run-col { border-left: none; border-top: 1px solid #eef0f3; }
  .run-kv-grid, .run-kv-grid-2 { grid-template-columns: minmax(0, 1fr); }
  .run-kv-grid .run-kv-row:nth-last-child(-n + 2) { border-bottom: 1px solid #f2f3f5; }
  .run-kv-grid .run-kv-row:last-child { border-bottom: none; }
  .run-kv-ctl { max-width: none; flex: 1; justify-content: flex-start; }
}

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
.cs-lk { font-size: 12px; font-weight: normal; color: #9ca3af; }
.cs-desc { font-size: 12px; color: #6b7280; margin-top: 2px; line-height: 1.45; }
.cs-op { display: flex; align-items: center; gap: 8px; margin-left: auto; }
.cs-bd { margin: 10px 0 0 34px; }
.cs-bd .dpf-item.last, .cs-bd > .dpf-grid:last-child .dpf-item { border-bottom: none; }
.gates { display: flex; flex-wrap: wrap; gap: 24px; padding-top: 4px; }
.gate { display: inline-flex; align-items: center; gap: 8px; font-size: 13px; color: #374151; }
.gate :deep(.anticon) { color: #10b981; }
@media (max-width: 640px) { .cs-bd { margin-left: 0; } }

/* 加权评分（对齐 factor-row） */
.wsum { margin-left: auto; font-size: 12px; font-weight: normal; color: #6b7280; }
.fc-list { display: flex; flex-direction: column; gap: 8px; }
.fc-row {
  display: flex; align-items: center; gap: 14px; padding: 8px 12px;
  border: 1px solid #eef0f3; border-radius: 8px; background: #fcfcfd; flex-wrap: wrap;
}
.fc-row.off { opacity: 0.55; }
.fc-name { width: 180px; flex: none; font-size: 14px; color: #1f2329; }
.fc-bar { flex: 1; min-width: 80px; height: 4px; background: #f2f3f5; border-radius: 2px; overflow: hidden; }
.fc-bar i { display: block; height: 100%; background: #1a6fff; border-radius: 2px; transition: width 0.2s; }
.fc-share { width: 40px; text-align: right; font-size: 13px; color: #86909c; }
.fc-w { display: flex; align-items: center; gap: 8px; }
.fc-extra .dpf-item { border-bottom: none; }

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

/* 开关记录 */
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
